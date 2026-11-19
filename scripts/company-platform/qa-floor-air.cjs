const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
let chromium;

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--'));
const paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[a-f0-9]{12}$/.test(build) || ![1, 2].includes(paths.length) ||
    flags.length > 1 || flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-floor-air.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-floor-air.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const root = path.resolve(rootArg);
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const out = path.resolve(paths.at(-1));
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__floor-air-qa/three.core.js';
const looks = ['tower','pedestal','circulator','purifier'].map(style=>({id:'floor-air-'+style,version:1}));
const key = ref => ref.id + '@' + ref.version;
const node = (doc, id) => doc.nodes.find(row => row.id === id);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', build, rooms: [], browserErrors: [] };
let manifest, devServer, packageServer, baseUrl, threeSource, context, page, responses, stage, outputCreated;

async function pinned(file) {
  const bytes = await fs.readFile(path.join(root, file));
  const pin = manifest.files.find(item => item.path === file);
  assert.equal(bytes.length, pin?.bytes, file);
  assert.equal(sha(bytes), pin.sha256, file);
  return bytes;
}

async function serve() {
  if (batch) {
    devServer = await require('./serve.cjs').serve(root, build, {
      manifest: 'company-build-info.json', entry: 'company.html', port: 0,
    });
    return new URL(devServer.url);
  }
  packageServer = spawn(process.execPath, ['serve.mjs', '0'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: packageServer.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line', { signal: AbortSignal.timeout(20000) }),
      once(packageServer, 'exit').then(([code]) => { throw new Error('Package server stopped before ready: ' + code); }),
    ]);
    const url = new URL(line);
    assert(url.port && url.hostname === '127.0.0.1' && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally {
    lines.close();
    packageServer.stdout.resume();
  }
}

async function fixture(id) {
  const packagedRoom = 'data/rooms/' + id + '/save.json';
  const file = batch ? path.join(batch, id, 'save.json') : packagedRoom;
  const bytes = batch ? await fs.readFile(file) : await pinned(file);
  const { schema, document } = JSON.parse(bytes);
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  const roomId=id+'/ground/live', airId=roomId+'/air', facility=node(document,airId);
  assert.equal(facility?.parentId,roomId);
  assert(looks.some(ref=>key(ref)===key(facility.resource)));
  return {id,file,bytes,document,roomId,floor:node(document,roomId).parentId,airId};
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl, route => route.fulfill({ contentType: 'text/javascript', body: threeSource }));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', event => {
    if (event.type() !== 'error') return;
    const message = event.text();
    report.browserErrors.push({ stage, message });
  });
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false);
  context = null;
  page = null;
}

const current = () => page.evaluate(() => company.session.document);
const readSave = id => page.evaluate(id => company.session.readSavedText(id), id);

async function ready(rejected = false) {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(rejected), await status.textContent());
}

async function visit(url) {
  await page.goto(url.href);
  await ready();
  const runtime = await page.evaluate(() => company.buildInfo);
  assert.equal(runtime.shortId, build);
  if (manifest) assert.equal(runtime.sourceDigest, manifest.sourceDigest);
}

async function load(room) {
  const url = new URL(baseUrl);
  if (!batch) url.searchParams.set('delivery', room.id);
  await visit(url);
  if (batch) {
    const menu = page.locator('.file-menu');
    if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
    await chooser.setFiles(room.file);
    await ready();
    if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  } else {
    const response = responses.get('/delivery-room/' + room.id + '.json');
    assert.equal(response?.status(), 200);
    assert(room.bytes.equals(await response.body()));
  }
  await page.waitForFunction(id => company.session.document.id === id, room.id);
  assert.deepEqual(await current(), room.document);
}

async function actualAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual cooling appliance GLB request: ' + asset.url);
  const bytes = manifest ? await pinned('viewer' + asset.url) : await fs.readFile(path.join(root, '.' + asset.url));
  assert.equal(sha(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(bytes.equals(await response.body()));
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({ path: path.join(out, name) });
  return name;
}


// Worktrees installed in the company's workspace may share the main project's evidence
// directory. A copied source tree outside that workspace owns its own local evidence.
async function outputDirectory() {
  const source=await fs.realpath(path.resolve(__dirname,'../..'));
  const hasFile=async file=>{try{return (await fs.stat(file)).isFile();}
    catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;return false;}};
  const localMarker=p=>hasFile(path.join(p,'scripts/company-platform/local-workspace.ps1'));
  let managed;
  for(let p=source;p!==path.dirname(p);p=path.dirname(p)){
    if(['company-workspace','output'].includes(path.basename(p).toLowerCase()) && await localMarker(path.dirname(p))) {
      managed=path.dirname(p);break;
    }
  }
  if(!managed && await localMarker(source))managed=source;
  // A receiver invoking the tool from their own work area can put evidence anywhere
  // inside that area, even when the sealed package and the installed tool are siblings.
  const cwd=await fs.realpath(process.cwd());
  const owners=managed?[managed]:[source,cwd].filter(p=>p!==path.dirname(p));
  const inside=(base,target)=>{const rel=path.relative(base,target);return rel.length>0 && rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);};
  const owner=owners.find(p=>inside(p,out));
  assert(owner,'Output must belong to the QA project: '+owners.join(' or '));
  let existing=path.dirname(out);
  while(true) {
    try {await fs.lstat(existing);break;}
    catch(e){if(e.code!=='ENOENT')throw e;existing=path.dirname(existing);}
  }
  const resolved=path.resolve(await fs.realpath(existing),path.relative(existing,out));
  assert(inside(owner,resolved),'Output resolves outside the QA project');
  assert(!inside(await fs.realpath(root),resolved) && resolved!==await fs.realpath(root),'Keep the input untouched');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);outputCreated=true;
  const temp=path.join(out,'process-temp');await fs.mkdir(temp);
  for(const name of ['TMP','TEMP','TMPDIR'])process.env[name]=temp;
  chromium=require('../../prototype/node_modules/playwright').chromium;
}
async function focus(room) {
  const view=await page.evaluate(()=>company.session.scene.view);
  if(view.floorId!==room.floor) await page.locator('#floor').selectOption(room.floor);
  if(view.mode!=='room'||view.roomId!==room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id=>company.session.scene.view.roomId===id,room.roomId);
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();await page.locator('#edit-instance').selectOption(room.airId);
  await page.locator('#edit-focus').click();await ready();
}
async function look(room,ref) {
  const picker=page.locator('#edit-look');
  const values=await picker.locator('option').evaluateAll(opts=>opts.map(o=>o.value));
  for(const known of looks)assert(values.includes(key(known)),key(known)+' is missing from the look picker');
  if(await picker.inputValue()===key(ref))return;
  const doc=await current();doc.revision++;node(doc,room.airId).resource=ref;
  await picker.selectOption(key(ref));await ready();assert.deepEqual(await current(),doc);
}
async function toggle(room,on) {
  const control=page.locator('#edit-states').getByRole('button',{name:/^电源[：:]/});
  const currentValue=await control.getAttribute('aria-pressed');
  assert(['true','false'].includes(currentValue));
  if(currentValue===String(on))return;
  const doc=await current();doc.revision++;node(doc,room.airId).state.on=on;
  await control.click();await ready();assert.deepEqual(await current(),doc);
}
async function setSpeed(room,speed) {
  const slider=page.getByRole('slider',{name:/风速档位/});
  for(const [name,value] of [['min','1'],['max','3'],['step','1']])assert.equal(await slider.getAttribute(name),value);
  while(Number(await slider.inputValue())!==speed) {
    const doc=await current(),state=node(doc,room.airId).state;
    const delta=Math.sign(speed-state.speed);assert.notEqual(delta,0,'Slider disagrees with stored speed');
    state.speed+=delta;doc.revision++;
    await slider.press(delta===1?'ArrowRight':'ArrowLeft');
    await ready();assert.deepEqual(await current(),doc);
  }
}
async function appearance(room) {
  const data=await page.evaluate(async ({id,threeUrl})=>{
    const T=await import(threeUrl), {scene,document:doc}=company.session; scene.root.updateMatrixWorld(true);
    const n=doc.nodes.find(item=>item.id===id),ref=n.resource;
    const resource=company.catalog.resources.find(r=>r.id===ref.id && r.version===ref.version);
    const obj=scene.root.getObjectByName(id), meshes=[];
    scene.root.traverseVisible(m=>{if(m.isMesh && obj.getObjectById(m.id))meshes.push(m);});
    if(!meshes.length)throw Error('No visible appliance mesh for '+id);
    const names=['air-power-indicator','air-speed-1','air-speed-2','air-speed-3'];
    const lights=names.map(name=>{
      const matches=meshes.filter(m=>m.name===name);if(matches.length!==1)throw Error('Expected one physical indicator '+name);
      const m=matches[0],material=[m.material].flat();
      if(!material.every(a=>a.isMeshStandardMaterial))throw Error('Non-PBR indicator '+name);
      return {name,color:material.map(a=>a.emissive.getHexString()),intensity:material.map(a=>a.emissiveIntensity)};
    });
    const box=new T.Box3().setFromObject(obj,true),world=obj.getWorldPosition(new T.Vector3());
    const room=scene.root.getObjectByName(n.parentId),front=new T.Vector3(0,0,1).transformDirection(obj.matrixWorld);
    const roomFront=front.clone().transformDirection(room.matrixWorld.clone().invert());
    if(roomFront.distanceTo(new T.Vector3(Math.sin(n.transform.yaw),0,Math.cos(n.transform.yaw)))>1e-6)
      throw Error('Physical front disagrees with authored in-room orientation');
    return {asset:resource.asset,ref,state:n.state,parentId:n.parentId,transform:n.transform,
      meshes:meshes.map(m=>({name:m.name,triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3})),
      lights,frontWorld:front.toArray(),frontRoom:roomFront.toArray(),world:world.toArray(),box:[box.min.toArray(),box.max.toArray()],rotor:!!obj.getObjectByName('air-rotor')};
  },{id:room.airId,threeUrl});
  const {on,speed}=data.state;
  assert.equal(typeof on,'boolean');assert(Number.isInteger(speed)&&speed>=1&&speed<=3);
  data.lights.forEach((l,i)=>{
    const lit=on && i<=speed;
    assert(l.intensity.every(x=>x===(lit?1:0)),l.name+' wrong level '+l.intensity+' expected '+lit);
    if(lit)assert(l.color.every(c=>c!=='000000'),l.name+' emitted black');
  });
  assert.equal(data.rotor,['floor-air-pedestal','floor-air-circulator'].includes(data.ref.id));
  await actualAsset(data.asset);return data;
}

// Compare physical visible contributions from the normal focus camera before/after hiding just
// the measured mesh, restoring all state synchronously before the next browser frame or screenshot.
async function presentationSample(room,rotating,on) {
  return page.evaluate(async ({id,threeUrl,rotating,on})=>{
    const T=await import(threeUrl),{camera,renderer,session:{scene}}=company;
    const obj=scene.root.getObjectByName(id), rotor=obj.getObjectByName('air-rotor');
    const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const project=v=>{v.project(camera);return [(1+v.x)*w/2,(1-v.y)*h/2];};
    function region(target) {
      const bounds=new T.Box3().setFromObject(target,true), points=[];
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])
        points.push(project(new T.Vector3(x,y,z)));
      const clamp=(v,max)=>Math.min(max,Math.max(0,v));
      const x=clamp(Math.floor(Math.min(...points.map(q=>q[0])))-1,w-1),
        y=clamp(Math.floor(Math.min(...points.map(q=>q[1])))-1,h-1);
      const right=clamp(Math.ceil(Math.max(...points.map(q=>q[0])))+1,w),
        bottom=clamp(Math.ceil(Math.max(...points.map(q=>q[1])))+1,h);
      return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
    }
    function grab(rect) {
      company.drawHostFrame();
      const {x,y,width,height}=rect,data=new Uint8Array(width*height*4);
      gl.readPixels(x,h-y-height,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;
    }
    const different=(a,b,j)=>Math.abs(a[j]-b[j])+Math.abs(a[j+1]-b[j+1])+Math.abs(a[j+2]-b[j+2])>=12;
    function physicalPixels(target,rect) {
      const visible=target.visible,casters=[];target.traverseVisible(m=>{if(m.isMesh && m.castShadow)casters.push(m);});
      let drawn,bare;
      try {for(const m of casters)m.castShadow=false;
        drawn=grab(rect);target.visible=false;bare=grab(rect);
      }finally {target.visible=visible;for(const m of casters)m.castShadow=true;company.drawHostFrame();}
      const mask=new Uint8Array(rect.width*rect.height);let count=0;
      for(let i=0;i<mask.length;i++)if(different(drawn,bare,i*4)){mask[i]=1;count++;}
      return {drawn,mask,count};
    }
    const lights=['air-power-indicator','air-speed-1','air-speed-2','air-speed-3'].map(name=>{
      const m=obj.getObjectByName(name),rect=region(m);
      return {name,rect,count:physicalPixels(m,rect).count};
    });
    const result={lights,rotor:null};
    if(!rotating)return result;
    // Track a real off-axis blade vertex relative to the host and sample the actual host clock
    // while the ordinary preview runs, without changing the simulation speed or setting the clock.
    let best=-1,vertex,blade,bladeTriangles=0;const inverse=rotor.matrixWorld.clone().invert();
    rotor.traverseVisible(m=>{
      if(!m.isMesh)return;
      const pos=m.geometry.attributes.position,mat=inverse.clone().multiply(m.matrixWorld);
      bladeTriangles+=(m.geometry.index?.count??pos.count)/3;
      for(let j=0;j<pos.count;j++){
        const v=new T.Vector3().fromBufferAttribute(pos,j),local=v.clone().applyMatrix4(mat),r=local.x**2+local.y**2;
        if(r>best){best=r;vertex=v;blade=m;}
      }
    });
    if(!blade || best<.0001)throw Error('No real off-axis rotor mesh vertex');
    const rect=region(rotor),rows=[],rates=[];let previous,lastQ,maxChange=0,maxTravel=0,initial;
    for(let i=0;i<(on?7:4);i++){
      if(i)await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,39+i*3)));
      scene.root.updateMatrixWorld(true);
      const local=obj.worldToLocal(blade.localToWorld(vertex.clone()));
      const frame=physicalPixels(rotor,rect), seconds=scene.presentationInputs.clockSeconds;
      let changed=0;
      if(previous)for(let k=0;k<frame.mask.length;k++){
        if((frame.mask[k] || previous.mask[k]) && different(frame.drawn,previous.drawn,k*4))changed++;
      }
      maxChange=Math.max(maxChange,changed);if(!initial)initial=local.clone();
      maxTravel=Math.max(maxTravel,initial.distanceTo(local));
      const dt=rows.length?seconds-rows.at(-1).seconds:0;
      // Short host-time intervals avoid modulo ambiguity when measuring a real quaternion.
      if(lastQ && dt>.001 && dt<.45)rates.push(lastQ.angleTo(rotor.quaternion)/dt);
      rows.push({seconds,local:local.toArray(),visiblePixels:frame.count,changedPixels:changed});
      lastQ=rotor.quaternion.clone();previous=frame;
    }
    result.rotor={rect,blade:blade.name,triangles:bladeTriangles,maxChange,maxTravel,rows,
      radiansPerSecond:rates.length?rates.sort((a,b)=>a-b)[Math.floor(rates.length/2)]:null};
    return result;
  },{id:room.airId,threeUrl,rotating,on});
}

function checkDraw(sample,rotating,on) {
  for(const lamp of sample.lights)assert(lamp.count>0,'Normal viewer focus does not show '+lamp.name);
  if(!rotating)return;
  const r=sample.rotor;
  assert(r.triangles>0 && r.rows.every(row=>row.visiblePixels>0),'Visible impeller required');
  assert(r.rows.at(-1).seconds>r.rows[0].seconds,'Host preview time must advance normally');
  if(on)assert(r.maxTravel>.002 && r.maxChange>2,'Expected a moving physical impeller and changed rendered pixels');
  else assert(r.maxTravel<1e-6 && r.maxChange===0,'Powered-down impeller must stay still');
}
async function save(room) {
  const doc=await current();await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const text=await readSave(room.id);assert.deepEqual(JSON.parse(text).document,doc);
  return {doc,text};
}
async function rejectFraction(room,save) {
  const bad=structuredClone(save.doc);node(bad,room.airId).state.speed=1.5;
  const count=report.browserErrors.length;
  const menu=page.locator('.file-menu');
  if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();
  const [file]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
  await file.setFiles({name:'invalid-air-speed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true');
  const diagnostic=report.browserErrors.slice(count);
  assert.equal(diagnostic.length,1);assert(diagnostic[0].message.includes('invalid-device-state at '+room.airId+'.state.speed'));
  report.browserErrors.splice(count);
  assert.deepEqual(await current(),save.doc);assert.equal(await readSave(room.id),save.text);
  return {id:room.airId,value:1.5,error:diagnostic[0].message.split('\n')[0],
    feedback:await page.locator('#status').textContent(),preservedSha256:sha(save.text)};
}
async function checkRoom(room,index) {
  stage='load '+room.id;const profile=path.join(out,'profile-'+room.id);
  await open(profile);await load(room);await focus(room);
  await page.locator('.view-toolbar [data-view="room"]').click();
  const overview=await screenshot(room.id+'-room.png');await page.locator('#edit-focus').click();
  const entry={id:room.id,overview,inputSha256:sha(room.bytes),roomId:room.roomId,airId:room.airId,looks:[]};report.rooms.push(entry);
  const pair=looks.slice(index*2,index*2+2);
  for(const [i,ref] of pair.entries()) {
    stage=room.id+' '+key(ref);
    if(key(node(await current(),room.airId).resource)===key(ref))await look(room,pair[1-i]);
    const previousState=node(await current(),room.airId).state;
    await look(room,ref);await focus(room);
    assert.deepEqual(node(await current(),room.airId).state,previousState,'Replacing the casing kept power and remembered speed');
    await toggle(room,true);const levels=[];let lowMotion;
    for(const level of [1,2,3]){
      await setSpeed(room,level);const data=await appearance(room);
      if(level===1 && data.rotor) lowMotion=await presentationSample(room,true,true);
      levels.push({speed:level,intensities:data.lights.map(l=>l.intensity),colors:data.lights.map(l=>l.color)});
    }
    const on=await appearance(room),moving=await presentationSample(room,on.rotor,true);checkDraw(moving,on.rotor,true);
    if(lowMotion) {
      checkDraw(lowMotion,true,true);
      const low=lowMotion.rotor.radiansPerSecond,high=moving.rotor.radiansPerSecond;
      assert(low>0 && high>low*1.1,'The visible rotor must turn faster at level 3: '+JSON.stringify({low,high}));
    }
    const photo=await screenshot(room.id+'-'+ref.id+'-running.png');
    await toggle(room,false);const off=await appearance(room);
    assert.equal(off.state.speed,3);const stopped=await presentationSample(room,off.rotor,false);checkDraw(stopped,off.rotor,false);
    const offPhoto=await screenshot(room.id+'-'+ref.id+'-off.png');
    await toggle(room,true);const resumed=await appearance(room);assert.deepEqual(resumed.lights,on.lights);assert.equal(resumed.state.speed,3);
    await setSpeed(room,i?2:3);await toggle(room,!!i);
    const warm=await appearance(room), saved=await save(room);
    const rejected=(!i && !index)?await rejectFraction(room,saved):null;
    await close();await open(profile);await visit(new URL(baseUrl));
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(k=>k==='/delivery-save.json'||k.startsWith('/delivery-room/')));
    assert.deepEqual(await current(),saved.doc);assert.equal(await readSave(room.id),saved.text);
    await focus(room);
    const cold=await appearance(room);assert.deepEqual(cold.ref,warm.ref);assert.deepEqual(cold.state,warm.state);
    assert.deepEqual(cold.lights,warm.lights);assert.deepEqual(cold.asset,warm.asset);assert.deepEqual(cold.transform,warm.transform);
    const coldPhoto=await screenshot(room.id+'-'+ref.id+'-cold.png');
    entry.looks.push({look:key(ref),id:room.airId,on,levels,lowMotion,moving,off:off.lights,stopped,
      savedSha256:sha(saved.text),cold:{state:cold.state,asset:cold.asset,lights:cold.lights},photo,offPhoto,coldPhoto,rejected});
  }
  await close();
}
async function recordTour(rooms) {
  stage='normal speed recording';await open(path.join(out,'record-profile'),true);
  for(const [index,room] of rooms.entries()){
    await load(room);
    await focus(room);await page.locator('.view-toolbar [data-view="room"]').click();
    await page.waitForTimeout(950);await screenshot(room.id+'-room.png');
    await page.locator('#edit-focus').click();
    for(const ref of looks.slice(index*2,index*2+2)){
      await look(room,ref);await page.locator('#edit-focus').click();
      await toggle(room,true);await setSpeed(room,1);await page.waitForTimeout(650);
      await setSpeed(room,3);await page.waitForTimeout(1300);
      await toggle(room,false);await page.waitForTimeout(700);
      await toggle(room,true);await page.waitForTimeout(800);
    }
  }
  const video=page.video();await close();
  const file='video/floor-air-normal.webm';await fs.rename(await video.path(),path.join(out,file));
  const bytes=await fs.readFile(path.join(out,file));report.video={file,bytes:bytes.length,sha256:sha(bytes),playbackSpeed:1};
}
async function run() {
  await outputDirectory();
  if(!batch){const bytes=await fs.readFile(path.join(root,'transfer-manifest.json'));manifest=JSON.parse(bytes);
    assert.equal(manifest.buildId,build);report.manifestSha256=sha(bytes);}
  const rooms=await Promise.all(['air-home','air-rental'].map(fixture));
  const yaw=rooms.map(room=>node(room.document,room.airId).transform.yaw);
  assert(Math.abs(Math.cos(yaw[1]-yaw[0])-1)>1e-6,'Expected templates with different air-appliance orientations');
  threeSource=await fs.readFile(path.resolve(__dirname,'../../prototype/node_modules/three/build/three.core.js'),'utf8');
  baseUrl=await serve();report.sourceDigest=manifest?.sourceDigest??devServer.info.sourceDigest;
  for(const [i,room] of rooms.entries())await checkRoom(room,i);
  assert.equal(new Set(report.rooms.flatMap(r=>r.looks.map(l=>l.on.asset.sha256))).size,4);
  if(recordRequested)await recordTour(rooms);
  for(const room of rooms){const bytes=batch?await fs.readFile(room.file):await pinned(room.file);assert(bytes.equals(room.bytes));}
  assert.deepEqual(report.browserErrors,[]);report.status='passed';
}
run().catch(async error=>{
  report.status='failed';report.failure={stage,message:error.stack};
  if(page){report.failure.statusText=await page.locator('#status').textContent({timeout:1500}).catch(()=>null);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});}
  console.error(error);process.exitCode=1;
}).finally(async()=>{
  await close();if(devServer)await devServer.close();
  if(packageServer && packageServer.exitCode===null){const end=once(packageServer,'exit');packageServer.kill();await end;}
  if(outputCreated)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
});
