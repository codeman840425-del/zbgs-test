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
  throw new Error('Usage: node qa-vocal-slot.cjs DIST BUILD BATCH_ROOMS NEW_OUT [--record]\n' +
    '   or: node qa-vocal-slot.cjs PACKAGE BUILD NEW_OUT [--record]');
const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1600,height:900}, threeUrl = '/__vocal-slot-qa/three.core.js';
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
    if (!['singing-rental','singing-studio'].includes(name)) continue;
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
  for(const {performer} of results) {
    assert.equal(performer.coordinateSpace,'facility'); assert.equal(performer.slotId,'vocal');
    for(const name of ['position','approach','exit','mouth','eye']) assert.equal(performer[name].length,3,name);
  }
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

async function shot(name) {
  await page.evaluate(()=>company.drawHostFrame());
  await page.screenshot({path:path.join(out,name)});
  return name;
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


const near=(a,b,label)=>assert(Math.abs(a-b)<1e-6,label+' '+a+' != '+b);
function vector(actual,expected,label) {
  assert.equal(actual.length,expected.length,label);
  actual.forEach((value,i)=>near(value,expected[i],label));
}
function yaw(actual,expected,label) { near(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)),0,label); }

async function observe(room) {
  const raw=await page.evaluate(async ({id,roomId,threeUrl})=>{
    const {Vector3,Matrix4,Quaternion,Raycaster,Box3}=await import(threeUrl);
    const {scene,document:doc}=company.session;
    const rule=doc.singingRooms.find(r=>r.regionId===roomId), p=rule.performer;
    const slot=scene.describeUsePoint(id+'#vocal');
    if(!slot)throw Error('Missing runtime descriptor '+id+'#vocal');
    scene.root.updateMatrixWorld(true);
    const host=scene.root.getObjectByName(id),region=scene.root.getObjectByName(roomId);
    if(!host||!region.getObjectById(host.id))throw Error('Microphone is outside authored region');
    const ref=doc.nodes.find(n=>n.id===id).resource;
    const res=company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version);
    const pickup=host.getObjectByName(res.microphone.pickupNode);
    if(!pickup?.isMesh||!pickup.geometry?.attributes.position?.count)throw Error('Absent physical grille');
    const stand=host.matrixWorld.clone().multiply(new Matrix4().makeRotationY(p.yaw).setPosition(new Vector3(...p.position)));
    const toPoint=(a,m)=>new Vector3(...a).applyMatrix4(m), origin=m=>new Vector3().setFromMatrixPosition(m).toArray();
    const heading=m=>{const front=new Vector3(0,0,1).transformDirection(m);return Math.atan2(front.x,front.z);};
    const mouth=toPoint(p.mouth,stand),eye=toPoint(p.eye,stand),center=new Box3().setFromObject(pickup,true).getCenter(new Vector3());
    const meshes=[];scene.root.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
    const ray=new Raycaster(mouth,center.clone().sub(mouth).normalize(),.00001,mouth.distanceTo(center)+.002);
    const hit=ray.intersectObjects(meshes,false)[0];
    if(hit?.object!==pickup)throw Error('Mouth to pickup first hit '+(hit?.object.name??'none')+'; expected '+pickup.name);
    return {slot,ref,grille:pickup.name,triangles:(pickup.geometry.index?.count??pickup.geometry.attributes.position.count)/3,
      glb:res.asset,world:{position:origin(stand),yaw:heading(stand),hostPosition:origin(host.matrixWorld),
        hostYaw:heading(host.matrixWorld),approach:toPoint(p.approach,host.matrixWorld).toArray(),
        exit:toPoint(p.exit,host.matrixWorld).toArray(),mouth:mouth.toArray(),eye:eye.toArray(),
        pickupCenter:center.toArray(),pickupSurface:hit.point.toArray(),mouthToGrille:hit.distance},
      localGrille:host.worldToLocal(hit.point.clone()).toArray(),
      masterCount:scene.describeUsePoints().filter(s=>s.id===slot.id).length};
  },{id:room.roles.mic,roomId:room.room,threeUrl});
  const {slot,world:w}=raw;
  assert.equal(raw.masterCount,1);assert.equal(slot.id,room.roles.mic+'#vocal');
  assert.equal(slot.slotId,'vocal');assert.equal(slot.kind,'standing-vocal');
  assert.equal(slot.facilityId,room.roles.mic);assert.equal(slot.roomId,room.room);assert.equal(slot.floorId,room.floor);
  assert.equal(slot.companyId,room.document.id);assert.deepEqual(slot.resource,raw.ref);
  assert.equal(slot.contact.pickupNodeId,raw.grille);assert.equal(slot.local.coordinateSpace,'facility');
  for(const field of ['position','approach','exit'])vector(slot.local[field],room.performer[field],'local '+field);
  yaw(slot.local.yaw,room.performer.yaw,'local orientation');
  vector(slot.transform.position,w.position,'world stand');yaw(slot.transform.yaw,w.yaw,'world orientation');
  vector(slot.facilityTransform.position,w.hostPosition,'facility position');yaw(slot.facilityTransform.yaw,w.hostYaw,'facility orientation');
  vector(slot.approachPosition,w.approach,'world approach');vector(slot.exitPosition,w.exit,'world exit');
  assert(w.mouthToGrille>.02 && w.mouthToGrille<.4,'Mouth to actual grille distance '+w.mouthToGrille);
  assert(raw.triangles>0);await asset(raw.glb);
  return raw;
}
async function editPose(id,wanted,degrees) {
  await choose(id);
  const placement=page.locator('#placement-tools');
  if(!await placement.evaluate(el=>el.open))await placement.locator(':scope > summary').click();
  const exact=placement.locator('details').first();
  if(!await exact.evaluate(el=>el.open))await exact.locator(':scope > summary').click();
  await page.locator('#edit-x').fill(String(wanted.position[0]));
  await page.locator('#edit-z').fill(String(wanted.position[2]));
  await page.locator('#edit-yaw').selectOption(String(degrees));
  await page.locator('#edit-position').click();
}
async function rejectedPanel(room,baseline) {
  stage=room.alias+' reject foreground obstruction';
  const doc=await current(), panel=doc.nodes.find(n=>n.parentId===room.room && n.resource?.id==='background-brand-panel');
  assert(panel,'Expected the studio standing background');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const text=await savedText(room.document.id);
  const observeError=page.waitForEvent('console',e=>e.type()==='error' && e.text().includes('vocal-use-path-blocked'));
  const oldCount=report.browserErrors.length;
  await editPose(panel.id,{position:[0,0,1.25]},0);
  const message=(await observeError).text();
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true');
  assert(message.includes(baseline.slot.id));assert.equal(report.browserErrors.length,oldCount+1);
  assert.equal(report.browserErrors[oldCount].message,message);report.browserErrors.pop();
  assert.deepEqual(await current(),doc);assert.equal(await savedText(room.document.id),text);
  const slot=await page.evaluate(id=>company.session.scene.describeUsePoint(id),baseline.slot.id);
  assert.deepEqual(slot,baseline.slot);
  const status=await page.locator('#status').textContent();const photo=await shot(room.alias+'-blocked-panel-rejected.png');
  // Re-open the stored baseline after the rejected UI attempt.
  await close();await open(path.join(out,room.alias+'-profile'));await visit(room,false);
  assert.deepEqual(await current(),doc);assert.equal(await savedText(room.document.id),text);
  return {panel:panel.id,attempt:{position:[0,0,1.25],yaw:0},old:panel.transform,slotId:slot.id,code:'vocal-use-path-blocked',
    message:message.split('\n')[0],status,savedSha256:sha(text),photo};
}
async function position(room,pose) {
  const doc=await current(), n=find(doc,room.roles.mic);
  const wanted=structuredClone(n.transform);
  const studio=room.alias==='singing-studio';
  const origin=find(room.document,n.id).transform;
  wanted.position=pose==='on-air-slide'?(studio?[0,0,.1]:[.1,0,0]):(studio?[-.8,0,.5]:[.8,0,.1]);
  const degrees=(Math.round(origin.yaw*180/Math.PI)+(pose==='on-air-slide'?0:90))%360;
  wanted.yaw=degrees*Math.PI/180;
  await editPose(n.id,wanted,degrees);await ready();
  doc.revision++;n.transform=wanted;assert.deepEqual(await current(),doc);
  return doc;
}
async function certifySlide(doc) {
  const {checkSingingRooms}=await import('./check-singing-room.mjs');
  const source=batch?path.resolve(__dirname,'../..'):path.join(root,'source');
  const inputs=async file=>JSON.parse(await fs.readFile(path.join(source,'prototype/src/company',file)));
  const [catalog,templates]=await Promise.all([inputs('library-catalog.json'),inputs('templates-extended.json')]);
  const [proof]=await checkSingingRooms(doc,{catalog,templates,root:source});
  return {ok:true,checkedDocumentSha256:sha(JSON.stringify(doc)),microphone:proof.microphone,scorePages:proof.score.length,
    room:doc.singingRooms[0].regionId,routes:Object.keys(proof.access?.routes || {})};
}
async function recordTour(rooms) {
  stage='record authored live rooms';
  await open(path.join(out,'record-profile'),true);
  for(const room of rooms) {
    await visit(room);await page.waitForTimeout(1250);
    await choose(room.roles.camera);
    const camera=page.locator('.view-toolbar [data-view="camera"]');
    await camera.click();await ready();assert.equal(await camera.getAttribute('aria-pressed'),'true');
    await page.waitForTimeout(1500);
    await page.locator('.view-toolbar [data-view="room"]').click();
    await focus(room,'mic');await page.waitForTimeout(1450);
    await focus(room,'score');await page.waitForTimeout(950);
    const edited=await position(room,'on-air-slide');
    assert.equal(sha(JSON.stringify(edited)),report.rooms.find(r=>r.alias===room.alias).broadcastEdit.proof.checkedDocumentSha256);
    await focus(room,'mic');await page.waitForTimeout(1050);
    await choose(room.roles.camera);await camera.click();await ready();await page.waitForTimeout(1200);
  }
  const video=page.video();await close();const file='video/vocal-slot-rooms-normal.webm';
  await fs.rename(await video.path(),path.join(out,file));const bytes=await fs.readFile(path.join(out,file));
  report.video={file,bytes:bytes.length,sha256:sha(bytes),playbackSpeed:1,scope:'original rooms and geometrically validated 0.10 m microphone translations'};
}
async function verify(rooms) {
  for(const room of rooms){
    stage=room.alias+' authored';const profile=path.join(out,room.alias+'-profile');
    await open(profile);await visit(room);
    const authored=await observe(room);
    const initialImage=await shot(room.alias+'-authored-room.png');
    await choose(room.roles.camera);
    const cameraButton=page.locator('.view-toolbar [data-view="camera"]');
    await cameraButton.click();await ready();
    assert.equal(await cameraButton.getAttribute('aria-pressed'),'true');
    const lens=await page.evaluate(async ({threeUrl,world})=>{
      const {Vector3}=await import(threeUrl);company.camera.updateMatrixWorld(true);
      return [world.mouth,world.eye].map(v=>new Vector3(...v).project(company.camera).toArray());
    },{threeUrl,world:authored.world});
    assert(lens.every(point=>point.every(x=>Math.abs(x)<1)),'Authored vocal reference outside real installed camera frame');
    const cameraImage=await shot(room.alias+'-authored-camera.png');
    await page.locator('.view-toolbar [data-view="room"]').click();
    const view=await ordinaryCloseup(room,'mic',authored.grille);
    const grilleImage=await shot(room.alias+'-authored-pickup.png');
    const rejected=room.alias==='singing-studio'?await rejectedPanel(room,authored):null;
    stage=room.alias+' idle move and quarter turn';
    const slid=await position(room,'on-air-slide'), proof=await certifySlide(slid), slideObservation=await observe(room);
    await focus(room,'mic');const slideImage=await shot(room.alias+'-certified-slide-pickup.png');
    const broadcastEdit={proof,observation:slideObservation,image:slideImage};
    const edited=await position(room,'idle-turn'), moved=await observe(room);
    assert.equal(moved.slot.id,authored.slot.id);
    assert.deepEqual(moved.slot.local,authored.slot.local);
    assert.notDeepEqual(moved.slot.transform.position,authored.slot.transform.position);
    yaw(moved.slot.transform.yaw-authored.slot.transform.yaw,Math.PI/2,'measured quarter turn');
    vector(moved.localGrille,authored.localGrille,'rigid local mesh hit');
    near(moved.world.mouthToGrille,authored.world.mouthToGrille,'rigid mouth clearance');
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
    const saved=await savedText(room.document.id);assert.deepEqual(JSON.parse(saved).document,edited);
    await close();stage=room.alias+' cold reopen';await open(profile);await visit(room,false);
    assert.equal(await savedText(room.document.id),saved);assert.deepEqual(await current(),edited);
    const cold=await observe(room);assert.deepEqual(cold,moved);
    const coldView=await ordinaryCloseup(room,'mic',cold.grille);
    const coldImage=await shot(room.alias+'-edited-cold-pickup.png');
    report.rooms.push({alias:room.alias,room:room.room,sourceSaveSha256:sha(room.bytes),localSaveSha256:sha(saved),
      authored,rejected,broadcastEdit,moved,cold,view,coldView,lens,initialImage,cameraImage,grilleImage,coldImage});
    await close();
  }
  const [a,b]=report.rooms; const diff=a.authored.world.hostYaw-b.authored.world.hostYaw;
  assert(Math.abs(Math.sin(diff))>.999,'The two supplied microphone instances must exercise different axes');
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
  if (flags.includes('--record')) await recordTour(inputs);
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
