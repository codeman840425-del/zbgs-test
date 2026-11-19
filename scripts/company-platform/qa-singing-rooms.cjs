const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {chromium} = require('../../prototype/node_modules/playwright');

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--')), paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[0-9a-f]{12}$/.test(build) || ![1,2].includes(paths.length) || flags.length > 1 || flags.some(value => value !== '--record'))
  throw new Error('Usage: node qa-singing-rooms.cjs DIST BUILD BATCH_ROOMS NEW_OUT [--record]\n' +
    '   or: node qa-singing-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1600,height:900}, threeUrl = '/__singing-room-qa/three.core.js';
const names = ['mic','score','camera'];
const sha = value => createHash('sha256').update(value).digest('hex');
const key = ({id,version}) => `${id}@${version}`;
const find = (document,id) => document.nodes.find(node => node.id === id);
const report = {status:'running',build,rooms:[],browserErrors:[]};
let manifest, devServer, packageServer, base, threeSource, context, page, responses, stage, created;

async function read(file) {
  const data = await fs.readFile(path.join(root,file));
  if (manifest) {
    const declared = manifest.files.find(pin => pin.path === file);
    assert.equal(data.length,declared?.bytes,file);
    assert.equal(sha(data),declared.sha256,file);
  }
  return data;
}

async function serve() {
  if (batch) {
    devServer = await require('./serve.cjs').serve(root,build,{manifest:'company-build-info.json',entry:'company.html',port:0});
    return new URL(devServer.url);
  }
  packageServer = spawn(process.execPath,['serve.mjs','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:packageServer.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20000)}),
      once(packageServer,'exit').then(([code]) => { throw new Error('Delivery server stopped before readiness: ' + code); }),
    ]);
    const url = new URL(line);
    assert(url.hostname === '127.0.0.1' && url.port && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally { lines.close(); packageServer.stdout.resume(); }
}

async function fixtures() {
  const directory = batch || path.join(root,'data/rooms');
  const results = [];
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const {name} = entry;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) continue;
    const file = basename => batch ? fs.readFile(path.join(batch,name,basename)) : read(`data/rooms/${name}/${basename}`);
    const layout = JSON.parse(await file('layout.json'));
    if (!layout.singingRooms?.length) continue;
    const bytes = await file('save.json'), {schema,document} = JSON.parse(bytes);
    assert.equal(schema,'company-save');
    assert.deepEqual(document,layout);
    assert.equal(layout.singingRooms.length,1);
    const rule = layout.singingRooms[0], region = find(document,rule.regionId);
    assert.equal(region?.kind,'room');
    const roles = Object.fromEntries(names.map(role => [role,rule.roles?.[role]]));
    assert.equal(new Set(Object.values(roles)).size,names.length);
    assert(Object.values(roles).every(id => find(document,id)?.kind === 'facility'));
    const areas = document.nodes.filter(node => node.kind === 'area' && node.parentId === region.parentId);
    const floor = find(document,region.parentId);
    const portal = [...(floor.connections || []),...(floor.exteriorEntrances || [])].find(p=>p.id===rule.portalId);
    assert(portal,'Missing authored entry '+rule.portalId);
    const adjacent = areas.find(a=>portal.from?.regionId===region.id && portal.to?.regionId===a.id ||
      portal.to?.regionId===region.id && portal.from?.regionId===a.id);
    results.push({alias:name,bytes,document,room:region.id,floor:region.parentId,roles,performer:rule.performer,portal,adjacent});
  }
  assert.equal(results.length,2,'Expected two room layouts with a singingRooms contract');
  const authored = results.find(room => room.document.scale === 'single-room');
  assert(authored,'Expected one standalone single-room singing fixture');
  const companion = results.find(room => room !== authored);
  assert.equal(companion.adjacent?.publicRole,'living','The rental stage must connect to its real public living room');
  assert.equal(authored.portal.regionId,authored.room,'The studio uses its own exterior entry');
  return [authored,companion];
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(recording ? {recordVideo:{dir:path.join(out,'video'),size:viewport}} : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl,route => route.fulfill({contentType:'text/javascript',body:threeSource}));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response',response => responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error => report.browserErrors.push({stage,message:error.message}));
  page.on('console',event => { if (event.type() === 'error') report.browserErrors.push({stage,message:event.text()}); });
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(),false);
  context = null;
  page = null;
}

const current = () => page.evaluate(() => company.session.document);
const savedText = id => page.evaluate(id => company.session.readSavedText(id),id);

async function ready() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}

async function enter(room, region = room.room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floor) await page.locator('#floor').selectOption(room.floor);
  if (view.mode !== 'room' || view.roomId !== region || view.floorId !== room.floor) await page.locator('#room').selectOption(region);
  await page.waitForFunction(id => company.session.scene.view.roomId === id,region);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
}

async function visit(room, initial = true) {
  const url = new URL(base);
  if (initial && !batch) url.searchParams.set('delivery',room.alias);
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(() => company.buildInfo);
  assert.equal(identity.shortId,build);
  if (manifest) assert.equal(identity.sourceDigest,manifest.sourceDigest);
  if (initial) {
    if (batch) {
      const menu = page.locator('.file-menu');
      if (!(await menu.evaluate(el => el.open))) await menu.locator('summary').click();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
      await chooser.setFiles(path.join(batch,room.alias,'save.json'));
      await page.waitForFunction(id=>window.company?.session.document.id===id,room.document.id);
      await ready();
      if (await menu.evaluate(el => el.open)) await menu.locator('summary').click();
    } else {
      await page.waitForFunction(id=>window.company?.session.document.id===id,room.document.id);
      await ready();
      const response = responses.get('/delivery-room/' + room.alias + '.json');
      assert.equal(response?.status(),200);
      assert(room.bytes.equals(await response.body()));
    }
    assert.deepEqual(await current(),room.document);
  } else {
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url => url === '/delivery-save.json' || url.startsWith('/delivery-room/')));
  }
  await enter(room);
}

async function choose(id) {
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
}

async function asset(value) {
  assert.equal(value?.format,'glb');
  const response = responses.get(value.url);
  assert.equal(response?.status(),200,'Expected browser asset ' + value.url);
  const bytes = await read(manifest ? 'viewer' + value.url : '.' + value.url);
  assert.equal(bytes.length,value.bytes);
  assert.equal(sha(bytes),value.sha256);
  assert(bytes.equals(await response.body()));
}

// Measure the ordinary viewer scene. Geometry stays in its authored room, including leased-floor rotations.
async function measure(room) {
  const data = await page.evaluate(async ({room,roles,performer,threeUrl})=>{
    const {Box3,Vector3,Matrix4,Raycaster} = await import(threeUrl);
    const {scene,document:doc} = company.session;
    scene.root.updateMatrixWorld(true);
    const object = id=>{const o=scene.root.getObjectByName(id); if (!o) throw Error('Missing instance '+id); return o;};
    const resource = id=>{const ref=doc.nodes.find(n=>n.id===id).resource;
      return company.catalog.resources.find(r=>r.id===ref.id && r.version===ref.version);};
    const stage=object(room), info={}, parts={};
    for (const role of ['mic','score','camera']) {
      const id=roles[role], r=resource(id), group=object(id);
      const name=role==='score'?r.musicStand?.pageNode:role==='mic'?r.microphone?.pickupNode:r.camera?.lensNode;
      const mesh=group.getObjectByName(name);
      if (!mesh?.isMesh || !mesh.geometry?.attributes.position?.count) throw Error('Missing installed mesh '+id+' / '+name);
      const triangleCount=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
      if (!stage.getObjectById(group.id)) throw Error('Borrowed instance outside singing room: '+id);
      parts[role]=mesh;
      info[role]={id,asset:r.asset,part:name,triangleCount,parent:group.parent.name,world:group.matrixWorld.toArray()};
    }
    const boxCenter = o=>new Box3().setFromObject(o,true).getCenter(new Vector3());
    const ray = new Raycaster(), v=point=>new Vector3(...point);
    function first(from,to,meshes) {
      const direction=to.clone().sub(from);
      ray.set(from,direction.clone().normalize());ray.near=.0001;ray.far=direction.length()+.0002;
      return ray.intersectObjects(meshes,false)[0];
    }
    const performerToWorld=stage.matrixWorld.clone().multiply(new Matrix4().makeRotationY(performer.yaw)
      .setPosition(performer.position[0],0,performer.position[1]));
    const mouth=v(performer.mouth).applyMatrix4(performerToWorld), eye=v(performer.eye).applyMatrix4(performerToWorld);
    const lensCenter=boxCenter(parts.camera), axis=new Vector3(0,0,1).transformDirection(object(roles.camera).matrixWorld);
    const optical=first(lensCenter.clone().addScaledVector(axis,.15),lensCenter,[parts.camera]);
    if (!optical) throw Error('Optical axis misses real camera lens '+info.camera.id);
    const meshes=[];
    scene.root.traverseVisible(o=>{if(o.isMesh && o!==parts.camera) meshes.push(o);});
    const start=optical.point.clone().addScaledVector(axis,.002);
    const head=first(mouth,boxCenter(parts.mic),meshes);
    if (head?.object!==parts.mic) throw Error('Mouth ray hits '+head?.object.name+' instead of '+parts.mic.name);
    return {parts:info,lens:optical.point.toArray(),axis:axis.toArray(),mouth:mouth.toArray(),eye:eye.toArray(),
      mouthToGrille:head.distance,viewBlocked:[mouth,eye].map(to=>first(start,to,meshes)?.object.name||null)};
  },{room:room.room,roles:room.roles,performer:room.performer,threeUrl});
  assert(data.mouthToGrille>.02 && data.mouthToGrille<.4, 'Mouth reference must be near the installed grille');
  assert.deepEqual(data.viewBlocked,[null,null]);
  for (const part of Object.values(data.parts)) await asset(part.asset);
  return data;
}

async function shot(name) {
  await page.evaluate(()=>company.drawHostFrame());
  await page.screenshot({path:path.join(out,name)});
  return name;
}

async function cameraView(room, geometry) {
  await choose(room.roles.camera);
  const button=page.locator('.view-toolbar [data-view="camera"]');
  assert.equal(await button.textContent(),'机位取景');
  await button.click(); await ready();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  const observation=await page.evaluate(async ({threeUrl,g})=>{
    const {Vector3}=await import(threeUrl), camera=company.camera, vec=p=>new Vector3(...p);
    camera.updateMatrixWorld(true);
    const actual=camera.getWorldPosition(new Vector3()), direction=camera.getWorldDirection(new Vector3());
    const axis=vec(g.axis), delta=actual.clone().sub(vec(g.lens)), along=delta.dot(axis);
    return {origin:actual.toArray(),along,lateral:delta.addScaledVector(axis,-along).length(),
      degrees:direction.angleTo(axis)*180/Math.PI,referenceNdc:[g.mouth,g.eye].map(pt=>vec(pt).project(camera).toArray())};
  },{threeUrl,g:geometry});
  assert(observation.along>=-.001 && observation.along<=.025 && observation.lateral<.001 && observation.degrees<.05,
    'Selected ordinary view must use the installed physical lens');
  assert(observation.referenceNdc.every(([x,y,z])=>Math.abs(x)<1 && Math.abs(y)<1 && Math.abs(z)<1),'Performer outside lens frame');
  return observation;
}

// Compare two captures in the same JS task. Suppress changed shadows and always restore visibility before display.
async function drawnPixels(id,part) {
  return page.evaluate(({id,part})=>{
    const {renderer,session:{scene}}=company;
    const obj=scene.root.getObjectByName(id), target=part?obj.getObjectByName(part):obj;
    const canvas=document.createElement('canvas'), gl=renderer.domElement;
    canvas.width=gl.width;canvas.height=gl.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const grab=()=>{company.drawHostFrame();ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(gl,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const visible=target.visible, casters=[];
    target.traverseVisible(o=>{if(o.isMesh&&o.castShadow)casters.push(o);});
    let a,b;
    try {for (const o of casters) o.castShadow=false;
      a=grab();target.visible=false;b=grab();}
    finally {target.visible=visible;for(const o of casters)o.castShadow=true;company.drawHostFrame();}
    let count=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for (let i=0;i<a.length;i+=4) {
      if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])<24)continue;
      const x=i/4%canvas.width,y=Math.floor(i/4/canvas.width);
      count++;minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);
    }
    return {id,part,count,bounds:[minX,minY,maxX,maxY],canvas:[canvas.width,canvas.height]};
  },{id,part});
}

async function focus(room,role) {
  await choose(room.roles[role]);
  await page.locator('#edit-focus').click();
  await ready();
}

async function ordinaryCloseup(room,role,part) {
  await focus(room,role);
  const pixels=await drawnPixels(room.roles[role],part);
  assert(pixels.count>12,'Ordinary item focus must reveal '+part+' immediately: '+JSON.stringify(pixels));
  return {firstPixels:pixels.count,pixels};
}

async function evidence(room,g,tag) {
  const prefix=room.alias+'-'+tag;
  await page.locator('.view-toolbar [data-view="room"]').click();
  const overview=await shot(prefix+'-room.png'), optics=await cameraView(room,g);
  const optical=await shot(prefix+'-lens.png'), rendered={}, closeups={};
  for (const role of ['mic','score']) {
    rendered[role]=await drawnPixels(room.roles[role],null);
    assert(rendered[role].count>100,'Too few rendered pixels from '+role+' in the real lens view');
  }
  for (const role of ['mic','score']) {
    const detail=await ordinaryCloseup(room,role,g.parts[role].part);
    closeups[role]={file:await shot(prefix+'-'+role+'-focus.png'),...detail};
  }
  return {overview,optical,optics,rendered,closeups};
}

async function living(room,capture) {
  await enter(room,room.adjacent.id);
  const seen=await page.evaluate(id=>{
    const group=company.session.scene.root.getObjectByName(id), names=[];
    group.traverseVisible(o=>{if(o.isMesh)names.push(o.name);});
    return {view:company.session.scene.view.roomId,meshes:names.sort()};
  },room.adjacent.id);
  assert.equal(seen.view,room.adjacent.id);assert(seen.meshes.length>0);
  const file=capture?await shot(room.alias+'-public-living.png'):null;
  await enter(room);
  return {seen,file};
}

async function replaceCamera(room) {
  await choose(room.roles.camera);
  const select=page.locator('#edit-look'), values=await select.locator('option').evaluateAll(os=>os.map(o=>o.value));
  const document=await current(), node=find(document,room.roles.camera), original=key(node.resource);
  const next=['camera-orbit-eye@1','camera-cube-slate@1','camera-pod-cream@1','camera-bar-clamp@1'].find(r=>r!==original && values.includes(r));
  assert(next,'No compatible installed camera appearance');
  const [id,version]=next.split('@');
  const defaults=await page.evaluate(({id,version})=>company.catalog.resources.find(r=>r.id===id&&r.version===version).stateDefaults,{id,version:Number(version)});
  node.resource={id,version:Number(version)};node.state={...defaults,...node.state};document.revision++;
  await select.selectOption(next);await ready();
  assert.deepEqual(await current(),document);
  return {original,next,document};
}

async function verify([first,other]) {
  const profile=await fs.mkdtemp(path.join(out,'qa-profile-'));
  stage='load connected rental and living room';await open(profile);await visit(other);
  const original=await measure(other), views=await evidence(other,original,'original'), area=await living(other,true);
  await page.locator('#save').click();await ready();
  const otherSaved=await savedText(other.document.id);
  assert.deepEqual(JSON.parse(otherSaved).document,other.document);
  stage='load standalone stage and edit camera appearance';await visit(first);
  const before=await measure(first), initialViews=await evidence(first,before,'original');
  const change=await replaceCamera(first), after=await measure(first);
  assert.notEqual(before.parts.camera.asset.sha256,after.parts.camera.asset.sha256);
  assert.deepEqual(before.parts.mic,after.parts.mic);assert.deepEqual(before.parts.score,after.parts.score);
  stage='save and cold-open without delivery query';await page.locator('#save').click();await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  assert.equal(await savedText(other.document.id),otherSaved,'First-company save changed the rental');
  const saved=await savedText(first.document.id), envelope=JSON.parse(saved);
  assert.deepEqual(envelope.document,change.document);
  assert(envelope.dependencies.resources.some(r=>key(r)===change.next));
  await close();await open(profile);await visit(first,false);
  assert.equal(await savedText(first.document.id),saved);assert.deepEqual(await current(),change.document);
  const cold=await measure(first);
  assert.deepEqual(cold,after);
  const restoredView=await cameraView(first,cold);
  report.rooms.push({alias:first.alias,region:first.room,fixtureSha256:sha(first.bytes),before,initialViews,
    change:{from:change.original,to:change.next},savedSha256:sha(saved),cold,restoredView,restoredFrame:await shot(first.alias+'-cold-lens.png')});
  stage='check rental after cold reopen';
  assert.equal(await savedText(other.document.id),otherSaved,'Cold restart changed the rental before re-import');
  await visit(other);
  assert.deepEqual(await current(),other.document);
  assert.deepEqual(await measure(other),original);assert.deepEqual((await living(other,false)).seen,area.seen);
  assert.equal(await savedText(other.document.id),otherSaved);assert.equal(await savedText(first.document.id),saved);
  report.rooms.push({alias:other.alias,region:other.room,fixtureSha256:sha(other.bytes),original,views,portal:other.portal.id,
    connectedLivingRoom:area,unchanged:true});
  await close();
}

async function record(rooms) {
  stage='normal-speed ordinary room controls';
  await open(await fs.mkdtemp(path.join(out,'video-profile-')),true);
  for (const [i,room] of rooms.entries()) {
    await visit(room);const g=await measure(room);
    await page.waitForTimeout(1200);await cameraView(room,g);await page.waitForTimeout(1700);
    const role=i===0?'mic':'score';
    await ordinaryCloseup(room,role,g.parts[role].part);await page.waitForTimeout(1600);
    if (i===0) {await replaceCamera(room);await page.locator('#save').click();await ready();}
    else {await enter(room,room.adjacent.id);await page.waitForTimeout(1400);}
  }
  const video=page.video();await close();
  const file='video/singing-rooms-normal.webm';
  const raw=await video.path();await fs.rename(raw,path.join(out,file));
  report.video={file,playbackSpeed:1,bytes:(await fs.stat(path.join(out,file))).size};
  assert(report.video.bytes>0);
}
async function run() {
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  created = true;
  stage = 'inspect singing room manifests';
  if (!batch) {
    const bytes = await fs.readFile(path.join(root,'transfer-manifest.json'));
    manifest = JSON.parse(bytes);
    assert.equal(manifest.schema,'company-transfer');
    assert.equal(manifest.buildId,build);
    const lock = JSON.parse(await read('source/prototype/package-lock.json'));
    assert.equal(require('../../prototype/node_modules/three/package.json').version,lock.packages['node_modules/three'].version);
    report.manifestSha256 = sha(bytes);
  }
  threeSource = await fs.readFile(path.join(__dirname,'../../prototype/node_modules/three/build/three.core.js'),'utf8');
  const inputs = await fixtures();
  base = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  await verify(inputs);
  if (flags.includes('--record')) await record(inputs);
  assert.deepEqual(report.browserErrors,[]);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = {stage,message:error.message,stack:error.stack};
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({timeout:2000}).catch(() => undefined);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    await devServer?.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const stopped = once(packageServer,'exit');
      packageServer.kill();
      await stopped;
    }
    if (created) await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,build,output:out,video:report.video?.file}));
  }
});
