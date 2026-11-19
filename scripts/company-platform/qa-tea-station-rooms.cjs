const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { promisify } = require('node:util');

const [rootArg, pin, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--'));
const paths = options.filter(value => !value.startsWith('--'));
const parity = flags.includes('--editor-parity');
const dev = paths.length === 2;
const manifestPin = !dev && /^[a-f0-9]{64}$/.test(pin) ? pin : null;
if (!rootArg || ![1, 2].includes(paths.length) ||
    (!manifestPin && (!/^[a-f0-9]{12}$/.test(pin) || (!dev && parity))) ||
    new Set(flags).size !== flags.length || flags.some(flag => !['--record','--editor-parity'].includes(flag))) {
  throw new Error('Usage: node qa-tea-station-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--editor-parity] [--record]\n' +
    '   or: node qa-tea-station-rooms.cjs PACKAGE MANIFEST_SHA NEW_OUT --editor-parity [--record]\n' +
    '   or: node qa-tea-station-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
assert(!paths.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source = path.resolve(__dirname,'../..');
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__tea-station-qa/three.core.js';
const looks = ['water','pantry','coffee','open'].map(style => ({id:'tea-counter-' + style, version:1}));
const key = ref => ref.id + '@' + ref.version;
const node = (doc, id) => doc.nodes.find(row => row.id === id);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', mode: parity?'editor-parity':'original-tour', rooms: [], browserErrors: [], files: [] };
let root, batch, out, build, temp, chromium, manifest, devServer, packageServer, baseUrl, threeSource, context, page, responses, stage, outputCreated, activeVideo;

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
  return { id, file, bytes, document };
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader','--disable-background-networking',
      '--disk-cache-dir='+path.join(profile,'cache')],
    ...(recording ? { recordVideo: { dir: temp, size: viewport } } : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl, route => route.fulfill({ contentType: 'text/javascript', body: threeSource }));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', event => {
    if (event.type() !== 'error' || event.location().url.endsWith('/favicon.ico')) return;
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
  assert.equal(response?.status(), 200, 'Expected actual tea station GLB request: ' + asset.url);
  const bytes = manifest ? await pinned('viewer' + asset.url) : await fs.readFile(path.join(root, '.' + asset.url));
  assert.equal(sha(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(bytes.equals(await response.body()));
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  const bytes = await page.screenshot({ path: path.join(out, name) });
  report.files.push({ file:name, bytes:bytes.length,sha256:sha(bytes) });
  return name;
}

function station(fixture) {
  const doc = fixture.document;
  const hosts = doc.nodes.filter(n=>looks.some(ref=>n.resource && key(ref)===key(n.resource)));
  assert.equal(hosts.length,1,'Expected one real service counter');
  const counter=hosts[0], child=(parent,id)=>{
    const matches=doc.nodes.filter(n=>n.parentId===parent.id && n.resource?.id===id);
    assert.equal(matches.length,1,id+' must be attached to '+parent.id);
    assert(matches[0].attachment?.surfaceId,'Expected an authored support-surface attachment');
    return matches[0];
  };
  const machine=child(counter,'tea-coffee-machine'), cup=child(machine,'tea-ceramic-cup');
  const area=node(doc,counter.parentId);
  assert.equal(area.kind,'area');
  assert.equal(typeof machine.state.on,'boolean');
  return {...fixture, area:area.id, floor:area.parentId, ids:[counter.id,machine.id,cup.id]};
}
async function enter(room) {
  const view=await page.evaluate(()=>company.session.scene.view);
  if(view.floorId!==room.floor) await page.locator('#floor').selectOption(room.floor);
  if(view.mode!=='room'||view.roomId!==room.area) await page.locator('#room').selectOption(room.area);
  await page.waitForFunction(id=>company.session.scene.view.roomId===id,room.area);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
}
async function select(id,focus=false) {
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  if(focus) await page.locator('#edit-focus').click();
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
}
async function choose(room,ref) {
  await select(room.ids[0]);
  const selectLook=page.locator('#edit-look');
  const choices=await selectLook.locator('option').evaluateAll(opts=>opts.map(o=>o.value));
  assert.deepEqual(choices.filter(v=>v).sort(),looks.map(key).sort());
  if(await selectLook.inputValue()===key(ref)) return;
  const expected=await current();
  expected.revision++; node(expected,room.ids[0]).resource=ref;
  await selectLook.selectOption(key(ref));
  await page.waitForFunction(({id,revision})=>company.session.document.revision===revision &&
    company.session.document.nodes.some(n=>n.resource?.id===id),{id:ref.id,revision:expected.revision});
  await ready(); assert.deepEqual(await current(),expected);
}
async function power(room,on) {
  await select(room.ids[1]);
  const button=page.locator('#edit-states').getByRole('button',{name:/^电源[：:]/});
  const original=await button.getAttribute('aria-pressed');
  assert(['false','true'].includes(original));
  if(original===String(on)) return;
  const expected=await current(); expected.revision++; node(expected,room.ids[1]).state.on=on;
  await button.click();
  await page.waitForFunction(rev=>company.session.document.revision===rev,expected.revision);
  await ready(); assert.deepEqual(await current(),expected);
  assert.equal(await button.getAttribute('aria-pressed'),String(on));
}
async function inspect(room) {
  const result=await page.evaluate(async ({ids,threeUrl})=>{
    const {Box3,Vector3,Raycaster}=await import(threeUrl);
    const {session:{scene,document:doc},renderer,camera}=company;
    scene.root.updateMatrixWorld(true);
    const roots=ids.map(id=>scene.root.getObjectByName(id));
    if(roots.some(r=>!r) || roots[2].parent!==roots[1] || roots[1].parent!==roots[0])
      throw Error('Physical cup/machine/counter parent hierarchy changed');
    const allMeshes=[]; scene.root.traverseVisible(n=>{if(n.isMesh) allMeshes.push(n);});
    const owner=mesh=>{for(let n=mesh;n;n=n.parent) if(roots.includes(n)) return roots.indexOf(n);return -1;};
    const records=roots.map((r,i)=>{
      const row=doc.nodes.find(n=>n.id===r.name);
      const resource=company.catalog.resources.find(a=>a.id===row.resource.id&&a.version===row.resource.version);
      const meshes=allMeshes.filter(m=>owner(m)===i);
      if(!meshes.length) throw Error('No visible mesh for '+r.name);
      const bounds=new Box3(); const triangles=meshes.reduce((sum,m)=>{
        const g=m.geometry;g.computeBoundingBox();bounds.union(g.boundingBox.clone().applyMatrix4(m.matrixWorld));
        return sum+(g.index?.count??g.attributes.position.count)/3;
      },0);
      const display=[];
      for(const [label,mapping] of Object.entries(resource.display||{})){
        if(mapping.stateField!=='on') continue;
        for(const target of mapping.nodes||[]) {
          const mesh=r.getObjectByName(target);
          if(!meshes.includes(mesh)) throw Error('Missing real status mesh '+target);
          for(const mat of [mesh.material].flat()) display.push({label,target,color:mat.color?.getHexString(),
            emissive:mat.emissive?.getHexString(),intensity:mat.emissiveIntensity});
        }
      }
      return {id:r.name,ref:row.resource,asset:resource.asset,local:r.position.toArray(),
        attachment:row.attachment,world:r.getWorldPosition(new Vector3()).toArray(),state:row.state,
        meshCount:meshes.length,triangles,names:meshes.map(m=>m.name),bounds:[bounds.min.toArray(),bounds.max.toArray()],display};
    });
    for (const [i,rec] of records.entries()) {
      // Fingerprint actual vertices in facility-local coordinates, independently of node/material names.
      const own=allMeshes.filter(m=>owner(m)===i);
      const inverse=roots[i].matrixWorld.clone().invert();
      const positions=[];
      for(const mesh of own) {
        const matrix=inverse.clone().multiply(mesh.matrixWorld), attr=mesh.geometry.attributes.position;
        const point=new Vector3();
        for(let j=0;j<attr.count;j++) {
          point.fromBufferAttribute(attr,j).applyMatrix4(matrix);
          positions.push(Math.round(point.x*1e5),Math.round(point.y*1e5),Math.round(point.z*1e5));
        }
      }
      const digest=await crypto.subtle.digest('SHA-256',new Int32Array(positions));
      rec.geometrySha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(i>0) {
        const child=roots[i],host=roots[i-1],hostNode=doc.nodes.find(n=>n.id===host.name);
        const hostRes=company.catalog.resources.find(r=>r.id===hostNode.resource.id && r.version===hostNode.resource.version);
        const surface=hostRes.supportSurfaces.find(s=>s.id===rec.attachment.surfaceId);
        const support=host.getObjectByName(hostRes.supportNodes[surface.id]);
        if(!support?.isMesh || owner(support)!==i-1) throw Error('Missing parent support mesh for '+rec.id);
        const point=child.getWorldPosition(new Vector3()),Y=new Vector3(0,1,0);
        const hit=new Raycaster(point.clone().addScaledVector(Y,.007),Y.negate(),0,.014).intersectObject(support,false)[0];
        if(!hit || Math.abs(hit.point.y-rec.bounds[0][1])>.002) throw Error('Physical support contact missing for '+rec.id);
        rec.contact={surface:surface.id,support:support.name,bottom:rec.bounds[0][1],hit:hit.point.toArray()};
      }
    }
    // Count the displayed pixels affected by each installation. Hide only its own meshes,
    // leaving nested installed facilities and all room surfaces in the ordinary renderer.
    const gl=renderer.getContext(), w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const pixels=()=>{company.drawHostFrame();const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
    const baseline=pixels();
    for(let i=0;i<records.length;i++) {
      const meshes=allMeshes.filter(m=>owner(m)===i);
      const [lo,hi]=records[i].bounds, projected=[];
      for(const x of [lo[0],hi[0]]) for(const y of [lo[1],hi[1]]) for(const z of [lo[2],hi[2]]) {
        const v=new Vector3(x,y,z).project(camera);
        projected.push([(1+v.x)*w/2,(1-v.y)*h/2]);
      }
      const left=Math.floor(Math.min(...projected.map(p=>p[0]))),right=Math.ceil(Math.max(...projected.map(p=>p[0])));
      const top=Math.floor(Math.min(...projected.map(p=>p[1]))),bottom=Math.ceil(Math.max(...projected.map(p=>p[1])));
      try {
        for(const m of meshes)m.visible=false;
        const other=pixels();let count=0,minX=w,minY=h,maxX=-1,maxY=-1;
        for(let j=0;j<other.length;j+=4) if(Math.abs(other[j]-baseline[j])>8 || Math.abs(other[j+1]-baseline[j+1])>8 || Math.abs(other[j+2]-baseline[j+2])>8){
          const pixel=j/4,x=pixel%w,y=h-1-Math.floor(pixel/w);
          if(x<left||x>right||y<top||y>bottom) continue;
          count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        }
        records[i].visiblePixels=count;records[i].screenBounds=[minX,minY,maxX,maxY];
      } finally {for(const m of meshes)m.visible=true;}
    }
    company.drawHostFrame();
    return {records,frame:[w,h],camera:camera.matrixWorld.toArray()};
  },{ids:room.ids,threeUrl});
  for(const rec of result.records) {
    assert(rec.triangles>0 && rec.visiblePixels>0,rec.id+' contributes no photograph pixels');
    await actualAsset(rec.asset);
  }
  return result;
}
async function store(room) {
  const doc=await current();
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const text=await readSave(room.id);assert.deepEqual(JSON.parse(text).document,doc);
  return {doc,text};
}
async function passageView(room) {
  const rule=room.document.teaStations.find(item=>item.regionId===room.area);
  if(!rule?.passage) return null;
  // Supplement the ordinary floor map with an eye-height photograph from within the
  // declared through-passage. The cabinet, room openings and corridor are unaltered.
  await page.locator('#edit-instance').selectOption('');
  const pose=await page.evaluate(({id,area,passage,service})=>{
    const {camera,session:{scene}}=company;
    const root=scene.root.getObjectByName(area),counter=scene.root.getObjectByName(id);
    const local=p=>root.localToWorld(camera.position.clone().fromArray(p));
    const eye=local([passage.minX*.72,1.6,(passage.minZ+passage.maxZ)/2]);
    const center=root.worldToLocal(counter.getWorldPosition(camera.position.clone()));
    const aim=local([center.x+1,.83,(service[1]+center.z)/2]);
    camera.position.copy(eye);camera.lookAt(aim);camera.updateMatrixWorld(true);
    scene.setWallView({mode:'cutaway',cameraPosition:eye.toArray()});company.drawHostFrame();
    return {eye:eye.toArray(),aim:aim.toArray(),fov:camera.fov};
  },{id:room.ids[0],area:room.area,passage:rule.passage,service:rule.service});
  return {pose,portalIds:rule.passage.portalIds,image:await screenshot(room.id+'-along-passage.png')};
}
async function roomViews(room) {
  await page.locator('#floor-view').click();
  await page.waitForFunction(()=>company.session.scene.view.mode==='floor');
  const floorImage=await screenshot(room.id+'-whole-floor.png');
  await enter(room);const areaImage=await screenshot(room.id+'-public-area.png');
  const passage=await passageView(room);
  await select(room.ids[0],true);
  const focus=await screenshot(room.id+'-native-focus.png');
  await select(room.ids[1],true);const equipment=await screenshot(room.id+'-machine-and-cup.png');
  await select(room.ids[2],true);const tray=await screenshot(room.id+'-cup-and-tray.png');
  await select(room.ids[0],true);
  return {floorImage,areaImage,passage,focus,equipment,tray};
}
async function checkRoom(room,i) {
  stage='open '+room.id;
  const profile=path.join(temp,'profile-'+room.id);
  const group=looks.slice(i*2,i*2+2);
  await open(profile);await load(room);await enter(room);
  const views=await roomViews(room);
  const observed={id:room.id,area:room.area,ids:room.ids,views,sourceSha256:sha(room.bytes),looks:[]};
  report.rooms.push(observed);
  for(const [index,look] of group.entries()){
    stage=room.id+' '+key(look);
    await choose(room,look);
    const on=index===1;
    await power(room,!on);await select(room.ids[0],true);
    const before=await inspect(room);
    await power(room,on);await select(room.ids[0],true);
    const warm=await inspect(room);
    assert(warm.records[1].display.length,'Machine on/off needs a real bound status mesh');
    assert.notDeepEqual(before.records[1].display,warm.records[1].display);
    if(warm.records[1].display.some(m=>typeof m.intensity==='number'))
      assert(warm.records[1].display.some(m=>on?m.intensity>0:m.intensity===0));
    const frame=await screenshot(room.id+'-'+look.id+'.png');
    const saved=await store(room);
    await close();await open(profile);await visit(new URL(baseUrl));
    assert(![...responses.keys()].some(k=>k==='/delivery-save.json'||k.startsWith('/delivery-room/')));
    assert.equal(await readSave(room.id),saved.text);
    assert.deepEqual(await current(),saved.doc);
    await enter(room);await select(room.ids[0],true);
    const cold=await inspect(room);
    assert.deepEqual(cold.records.map(({visiblePixels,screenBounds,...data})=>data),
      warm.records.map(({visiblePixels,screenBounds,...data})=>data));
    const coldFrame=await screenshot(room.id+'-'+look.id+'-cold.png');
    observed.looks.push({look:key(look),on,frame,coldFrame,savedSha256:sha(saved.text),warm,cold,
      otherPowerDisplay:before.records[1].display});
  }
  await close();
}
const hold = async ms => {if(recordRequested) await page.waitForTimeout(ms);};
const stableRecords = ({records}) => records.map(({visiblePixels,screenBounds,...data})=>data);
const wholeDegrees = radians => ((Math.round(radians*180/Math.PI)%360)+360)%360;

async function archive(video,file,partial=false) {
  const raw=await fs.realpath(await video.path());
  assert.equal(path.dirname(raw),temp);
  const bytes=await fs.readFile(raw);assert(bytes.length>1024);
  await fs.rename(raw,path.join(out,file));
  const result={file,playbackSpeed:1,sha256:sha(bytes),bytes:bytes.length,viewport,partial};
  report.files.push(result);return result;
}

function renderedStation(room) {
  return page.evaluate(ids=>{
    const {root}=company.session.scene;
    root.updateMatrixWorld(true);
    return {scene:root.uuid,objects:ids.map(id=>{
      const o=root.getObjectByName(id);
      return {id,uuid:o.uuid,parent:o.parent.name,world:o.matrixWorld.toArray()};
    })};
  },room.ids);
}

async function rejectHalfTurn(room,before) {
  const counter=node(before.doc,room.ids[0]),originalYaw=wholeDegrees(counter.transform.yaw),yaw=(originalYaw+180)%360;
  const originalRendering=await renderedStation(room);
  for(const query of ['#placement-tools','#placement-tools > details']) {
    const details=page.locator(query);
    if(!await details.evaluate(e=>e.open))await details.locator(':scope > summary').click();
  }
  const input=page.locator('#edit-yaw'),apply=page.locator('#edit-position');
  assert.equal(Number(await input.inputValue()),originalYaw);
  for(const [i,axis] of ['x','y','z'].entries())
    assert.equal(Number(await page.locator('#edit-'+axis).inputValue()),counter.transform.position[i]);
  await input.selectOption(String(yaw));
  const initial=report.browserErrors.length;
  const [diagnostic]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),apply.click()]);
  const error=await diagnostic.args()[0].evaluate(({code,path,details})=>({code,path,details}));
  assert.equal(error.code,'tea-station-clearance-outside');assert.equal(error.path,counter.id);
  assert(Array.isArray(error.details?.min)&&Array.isArray(error.details?.max),JSON.stringify(error));
  assert.deepEqual(report.browserErrors.splice(initial),[{stage,message:diagnostic.text()}]);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&
    !document.querySelector('#edit-position').disabled&&!document.querySelector('#edit-look').disabled);
  const status=await page.locator('#status').textContent(),message=await page.locator('#edit-message').textContent();
  assert.match(status,/有效方案已保留/);
  assert.match(message,/茶水|茶柜|清洁|站位/);
  assert.equal(await page.locator('#edit-instance').inputValue(),counter.id);
  assert.equal(Number(await input.inputValue()),originalYaw);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  assert.deepEqual(await current(),before.doc);assert.equal(await readSave(room.id),before.text);
  assert.deepEqual(await renderedStation(room),originalRendering);
  const image=await screenshot(room.id+'-half-turn-rejected.png');await hold(1450);
  return {error,originalYawDegrees:originalYaw,attemptedYawDegrees:yaw,position:counter.transform.position,
    message,status,sameSavedBytes:true,sameLiveScene:true,savedSha256:sha(before.text),image};
}

async function checkEditorParity(room,index) {
  stage=room.id+'/ordinary-open';
  assert(room.document.teaStations.some(rule=>rule.regionId===room.area&&['counter','machine','cup'].every((k,i)=>rule.roles[k]===room.ids[i])));
  const profile=path.join(temp,'profile-'+room.id);
  await open(profile,recordRequested);
  if(recordRequested)activeVideo={id:room.id,video:page.video()};
  await load(room);await enter(room);await select(room.ids[0],true);
  const old=await inspect(room),before=await store(room);
  assert.deepEqual(before.doc,room.document);
  const receipt={room:room.id,area:room.area,ids:room.ids,sourceSha256:sha(room.bytes),
    original:{rendered:old,savedSha256:sha(before.text),image:await screenshot(room.id+'-original-saved.png')}};
  report.rooms.push(receipt);await hold(800);
  stage=room.id+'/reject-half-turn';
  receipt.rejection=await rejectHalfTurn(room,before);
  stage=room.id+'/same-panel-legal-replacement';
  const look=looks[index===0?0:3];
  assert.notEqual(key(look),key(old.records[0].ref));
  await choose(room,look);await select(room.ids[0],true);
  const warm=await inspect(room),expected=await current();
  assert.equal(await page.locator('#edit-message').getAttribute('data-error'),'false');
  assert.notEqual(old.records[0].geometrySha256,warm.records[0].geometrySha256);
  const loads=measurement=>stableRecords(measurement).slice(1).map(({contact,...data})=>
    ({...data,contact:{...contact,hit:contact.hit.map(m=>Math.round(m*1e6)/1e6)}}));
  assert.deepEqual(loads(warm),loads(old),'Original machine, cup, support contacts and state must survive the replacement');
  assert.deepEqual(node(expected,room.ids[0]).transform,node(before.doc,room.ids[0]).transform);
  assert.equal(await readSave(room.id),before.text,'Only the explicit save may update the persisted plan');
  const final=await store(room);assert.notEqual(final.text,before.text);
  receipt.replacement={look:key(look),rendered:warm,savedSha256:sha(final.text),image:await screenshot(room.id+'-replacement-saved.png')};
  await hold(1200);await close();
  if(activeVideo){receipt.video=await archive(activeVideo.video,room.id+'-editor-normal.webm');activeVideo=null;}

  stage=room.id+'/cold-without-delivery';
  await open(profile);await visit(new URL(baseUrl));
  assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
  assert(![...responses.keys()].some(name=>name==='/delivery-save.json'||name.startsWith('/delivery-room/')));
  assert.deepEqual(await current(),final.doc);assert.equal(await readSave(room.id),final.text);
  await enter(room);await select(room.ids[0],true);
  const cold=await inspect(room);assert.deepEqual(stableRecords(cold),stableRecords(warm));
  assert.equal(await page.evaluate(()=>company.renderStatus().lastRenderError),null);
  receipt.cold={savedSha256:sha(final.text),sameBytes:true,withoutDelivery:true,rendered:cold,
    image:await screenshot(room.id+'-replacement-cold.png')};
  await close();
}

async function recordTour(rooms) {
  stage='ordinary browser tour'; await open(path.join(temp,'video-profile'),true);
  for(const [i,room] of rooms.entries()){
    await load(room);await enter(room);
    if(i){await page.locator('#floor-view').click();await page.waitForFunction(()=>company.session.scene.view.mode==='floor');
      await page.waitForTimeout(1500);await enter(room);await passageView(room);await page.waitForTimeout(1500);}
    await page.waitForTimeout(900);
    await select(room.ids[0],true); await page.waitForTimeout(1200);
    for(const ref of looks.slice(i*2,i*2+2)){await choose(room,ref);await page.waitForTimeout(850);}
    await select(room.ids[1],true);await power(room,false);await page.waitForTimeout(850);
    await power(room,true);await page.waitForTimeout(850);
    await select(room.ids[2],true);await page.waitForTimeout(900);
    await select(room.ids[0],true);await page.waitForTimeout(800);
  }
  const video=page.video();await close();
  await fs.mkdir(path.join(out,'video'));
  report.video=await archive(video,'video/tea-station-rooms-normal.webm');
}
async function prepare() {
  const {checkManagedOutput,findManagedProject}=await import('./package-company.mjs');
  const project=await fs.realpath(await findManagedProject(source)??source);
  out=path.resolve(project,paths.at(-1));
  await checkManagedOutput(out,source,{allowDelivery:false});
  root=await fs.realpath(rootArg);
  batch=dev?await fs.realpath(paths[0]):null;
  for(const input of [root,batch].filter(Boolean)) {
    const relative=path.relative(input,out);
    assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence cannot overlap a live input');
  }
  const script=await fs.readFile(__filename);
  report.scriptSha256=sha(script);
  let lock;
  if(dev) {
    const info=JSON.parse(await fs.readFile(path.join(root,'company-build-info.json')));
    assert.equal(info.shortId,pin);build=pin;report.sourceDigest=info.sourceDigest;
    lock=await fs.readFile(path.join(source,'prototype/package-lock.json'));
  } else {
    const bytes=await fs.readFile(path.join(root,'transfer-manifest.json'));
    report.manifestSha256=sha(bytes);
    if(manifestPin)assert.equal(report.manifestSha256,manifestPin);
    manifest=JSON.parse(bytes);assert.equal(manifest.schema,'company-transfer');assert.equal(manifest.version,1);
    build=manifest.buildId;report.sourceDigest=manifest.sourceDigest;
    assert(/^[a-f0-9]{12}$/.test(build));if(!manifestPin)assert.equal(build,pin);
    if(manifestPin) {
      assert(script.equals(await pinned('source/scripts/company-platform/qa-tea-station-rooms.cjs')),'QA source must match the pinned package');
      await pinned('verify.mjs');await pinned('serve.mjs');
      const {stdout}=await promisify(execFile)(process.execPath,[path.join(root,'verify.mjs'),root,manifestPin],
        {cwd:root,windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
      report.packageVerification=JSON.parse(stdout);
      assert(report.packageVerification.ok&&report.packageVerification.checkedFiles===manifest.files.length);
    }
    lock=await pinned('source/prototype/package-lock.json');
  }
  report.build=build;report.dependencyLockSha256=sha(lock);report.recordingRequested=recordRequested;
  let proto;
  for(const owner of new Set([source,project])) {
    const candidate=path.join(owner,'prototype');
    const localLock=await fs.readFile(path.join(candidate,'package-lock.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
    const playwright=await fs.stat(path.join(candidate,'node_modules/playwright')).catch(error=>{if(error.code!=='ENOENT')throw error;});
    if(localLock?.equals(lock)&&playwright?.isDirectory()){proto=candidate;break;}
  }
  assert(proto,'Install the pinned prototype dependencies in an editable copy for this browser QA');
  chromium=createRequire(path.join(proto,'package.json'))('playwright').chromium;
  threeSource=await fs.readFile(path.join(proto,'node_modules/three/build/three.core.js'),'utf8');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);outputCreated=true;
  temp=await fs.mkdtemp(path.join(out,'browser-temp-'));
  for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=temp;
}
async function run(){
  stage='verify inputs';await prepare();
  const rooms=await Promise.all(['tea-rental','tea-floor'].map(async alias=>station(await fixture(alias))));
  baseUrl=await serve();
  for(const [i,room] of rooms.entries()) await (parity?checkEditorParity:checkRoom)(room,i);
  const all=report.rooms.flatMap(r=>parity?[r.original.rendered.records[0],r.replacement.rendered.records[0]]:r.looks.map(l=>l.warm.records[0]));
  assert.equal(new Set(all.map(r=>r.asset.sha256)).size,4);
  assert.equal(new Set(all.map(r=>r.geometrySha256)).size,4,'Four distinct physical counter meshes');
  if(recordRequested&&!parity)await recordTour(rooms);
  for(const room of rooms){const bytes=batch?await fs.readFile(room.file):await pinned(room.file);assert(bytes.equals(room.bytes));}
  assert.deepEqual(report.browserErrors,[]);report.status='passed';
}
run().catch(async error=>{
  report.status='failed';report.failure={stage,message:error.stack};
  if(page){report.failure.statusText=await page.locator('#status').textContent({timeout:1500}).catch(()=>null);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});}
  console.error(error);process.exitCode=1;
}).finally(async()=>{
  try {
    await close();
    if(activeVideo)await archive(activeVideo.video,activeVideo.id+'-editor-partial.webm',true).catch(()=>{});
    if(devServer)await devServer.close();
    if(packageServer&&packageServer.exitCode===null){
      const end=once(packageServer,'exit',{signal:AbortSignal.timeout(10_000)});packageServer.kill();await end;
    }
  } finally {
    if(temp){assert.equal(path.dirname(await fs.realpath(temp)),out);await fs.rm(temp,{recursive:true,force:true,maxRetries:4});}
    if(outputCreated)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,...(outputCreated?{report:path.join(out,'report.json')}:{})}));
  }
});
