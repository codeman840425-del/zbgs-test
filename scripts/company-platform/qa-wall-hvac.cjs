const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');

const [input, build, ...args] = process.argv.slice(2);
const folders = args.filter(arg => !arg.startsWith('--'));
const flags = args.filter(arg => arg.startsWith('--'));
if (!input || !/^[a-f0-9]{12}$/.test(build) || ![1, 2].includes(folders.length) ||
    flags.length > 1 || flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-wall-hvac.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-wall-hvac.cjs PACKAGE BUILD NEW_OUT [--record]');
}

const source = path.resolve(__dirname, '../..');
const root = path.resolve(input);
const batch = folders.length === 2 ? path.resolve(folders[0]) : null;
const out = path.resolve(folders.at(-1));
const viewport = {width:1500,height:950};
const roomIds = ['wall-hvac-home','wall-hvac-rental'];
const looks = ['curve','twin-intake','ribbed','stepped'].map(style => ({id:`wall-ac-${style}`,version:1}));
const colors = ['84e9ba','83d6ff','ffb775'];
const threeUrl = '/__wall-hvac-qa/three.core.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const key = ref => `${ref.id}@${ref.version}`;
const get = (document,id) => document.nodes.find(node => node.id === id);
const report = {status:'running',build,entry:batch?'fixed-browser-import':'sealed-package-room-link', rooms:[], browserErrors:[]};
let stage, outputCreated, chromium, threeSource, manifest, fixedServer, packageServer, baseUrl, context, page, responses;
const verifiedAssets = new WeakSet();

function inside(outer,inner) {
  const relative = path.relative(outer,inner);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function outputDirectory() {
  const {checkManagedOutput} = await import('./package-company.mjs');
  await checkManagedOutput(out, source, {allowDelivery:false});
  let ancestor = path.dirname(out);
  while (true) {
    try { await fs.lstat(ancestor); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  const resolved = path.resolve(await fs.realpath(ancestor),path.relative(ancestor,out));
  assert.equal(path.relative(out,resolved),'','Evidence path traverses a link or junction');
  assert(!inside(await fs.realpath(root),resolved),'Write evidence outside the viewer input');
  if (batch) assert(!inside(await fs.realpath(batch),resolved),'Write evidence outside the room input');
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  outputCreated = true;
  const temp = path.join(out,'process-temp');
  await fs.mkdir(temp);
  for (const env of ['TMP','TEMP','TMPDIR']) process.env[env] = temp;
  chromium = require('../../prototype/node_modules/playwright').chromium;
  threeSource = await fs.readFile(path.join(source,'prototype/node_modules/three/build/three.core.js'),'utf8');
}

async function pinned(file) {
  const bytes = await fs.readFile(path.join(root,file));
  const pin = manifest.files.find(item => item.path === file);
  assert.equal(bytes.length,pin?.bytes,file);
  assert.equal(sha(bytes),pin.sha256,file);
  return bytes;
}

async function serve() {
  if (batch) {
    fixedServer = await require('./serve.cjs').serve(root,build,{manifest:'company-build-info.json',entry:'company.html',port:0});
    return new URL(fixedServer.url);
  }
  packageServer = spawn(process.execPath,['serve.mjs','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:packageServer.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20_000)}),
      once(packageServer,'exit').then(([code])=>{throw new Error(`Package server stopped before ready: ${code}`);}),
    ]);
    const url = new URL(line);
    assert(url.port && url.hostname === '127.0.0.1' && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally { lines.close(); packageServer.stdout.resume(); }
}

async function fixture(id) {
  const file = batch ? path.join(batch,id,'save.json') : `data/rooms/${id}/save.json`;
  const bytes = batch ? await fs.readFile(file) : await pinned(file);
  const {schema,document} = JSON.parse(bytes);
  const roomId = `${id}/ground/live`, fixtureId = `${roomId}/wall-ac`;
  assert.equal(schema,'company-save');
  assert.equal(document.id,id);
  const installed = get(document,fixtureId);
  assert.equal(installed?.parentId,roomId);
  assert(looks.some(ref => key(ref) === key(installed.resource)));
  const floor = get(document,roomId).parentId;
  return {id,file,bytes,document,roomId,fixtureId,floor,floorYaw:get(document,floor).transform.yaw};
}

async function open(profile,recording=false) {
  context = await chromium.launchPersistentContext(profile,{
    headless:true,viewport,deviceScaleFactor:1,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking',`--disk-cache-dir=${path.join(profile,'cache')}`],
    ...(recording ? {recordVideo:{dir:path.join(out,'video'),size:viewport}} : {}),
  });
  context.setDefaultTimeout(20_000);
  await context.route(`**${threeUrl}`,route => route.fulfill({contentType:'text/javascript',body:threeSource}));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response',response=>responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error=>report.browserErrors.push({stage,message:error.message}));
  page.on('console',event=>{
    if (event.type() === 'error' && !event.location().url.endsWith('/favicon.ico')) report.browserErrors.push({stage,message:event.text()});
  });
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
const readSave = id => page.evaluate(id => company.session.readSavedText(id),id);

async function overview(room) {
  await page.locator('.view-toolbar [data-view="room"]').click();
  const yaw = await page.evaluate(id=>{
    const {camera,session:{scene}} = company;
    const wall = scene.wallPresentation().walls.find(item=>item.mounted.some(part=>part.id===id && part.visible));
    if (wall?.visible) return 0;
    const unit = scene.root.getObjectByName(id);
    const direction = unit.getWorldDirection(camera.position.clone());
    const view = camera.getWorldDirection(camera.position.clone()).negate();
    const delta = Math.atan2(view.x,view.z)-Math.atan2(direction.x,direction.z)-.42;
    return Math.atan2(Math.sin(delta),Math.cos(delta));
  },room.fixtureId);
  if (yaw) {
    // Orbit from the room-facing side when the normal cutaway hides the mounting wall.
    const bounds = await page.locator('#stage canvas').boundingBox();
    assert(bounds,'Room canvas must be visible');
    const travel = yaw*bounds.height/(2*Math.PI);
    const drags = Math.max(1,Math.ceil(Math.abs(travel)/(bounds.width*.68)));
    const distance = travel/drags;
    const x = bounds.x+(bounds.width-distance)/2, y = bounds.y+bounds.height*.57;
    for (let i=0;i<drags;i++) {
      await page.mouse.move(x,y);
      await page.mouse.down();
      await page.mouse.move(x+distance,y,{steps:8});
      await page.mouse.up();
    }
  }
  await page.waitForFunction(id=>company.session.scene.wallPresentation().walls.some(wall=>
    wall.visible&&wall.mounted.some(part=>part.id===id&&part.visible)),room.fixtureId,{timeout:6000});
}

async function ready() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}

async function visit(url) {
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(() => company.buildInfo);
  assert.equal(identity.shortId,build);
  assert.equal(identity.sourceDigest,manifest?.sourceDigest ?? fixedServer.info.sourceDigest);
}

async function load(room) {
  const url = new URL(baseUrl);
  if (!batch) url.searchParams.set('delivery',room.id);
  await visit(url);
  if (batch) {
    const menu = page.locator('.file-menu');
    if (!await menu.evaluate(element=>element.open)) await menu.locator('summary').click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(room.file);
    await ready();
    if (await menu.evaluate(element=>element.open)) await menu.locator('summary').click();
  } else {
    const response = responses.get(`/delivery-room/${room.id}.json`);
    assert.equal(response?.status(),200);
    assert(room.bytes.equals(await response.body()));
  }
  await page.waitForFunction(id=>company.session.document.id===id,room.id);
  assert.deepEqual(await current(),room.document);
}

async function select(room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floor) await page.locator('#floor').selectOption(room.floor);
  if (view.mode !== 'room' || view.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id=>company.session.scene.view.roomId===id,room.roomId);
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.fixtureId);
  await ready();
}

async function focus() {
  await page.locator('#edit-focus').click();
  await ready();
}

async function edit(room,update,action) {
  const expected = await current();
  update(get(expected,room.fixtureId));
  expected.revision++;
  await action();
  await ready();
  assert.deepEqual(await current(),expected,'Ordinary UI action changed unrelated document data');
}

async function setLook(room,ref) {
  const picker = page.locator('#edit-look');
  const choices = await picker.locator('option').evaluateAll(options=>options.map(option=>option.value));
  assert.deepEqual([...choices].sort(),looks.map(key).sort());
  if (await picker.inputValue() !== key(ref)) await edit(room,node=>{node.resource=ref;},()=>picker.selectOption(key(ref)));
}

async function setPower(room,on) {
  const control = page.locator('#edit-states').getByRole('button',{name:/^电源[：:]/});
  const pressed = await control.getAttribute('aria-pressed');
  assert.equal(pressed,String(get(await current(),room.fixtureId).state.on));
  if (pressed !== String(on)) await edit(room,node=>{node.state.on=on;},()=>control.click());
}

async function setMode(room,mode) {
  const picker = page.getByRole('combobox',{name:'空调模式',exact:true});
  const choices = await picker.locator('option').evaluateAll(options=>options.map(option=>option.value));
  assert.deepEqual(choices,['1','2','3']);
  assert.equal(await picker.inputValue(),String(get(await current(),room.fixtureId).state.mode));
  if (await picker.inputValue() !== String(mode)) await edit(room,node=>{node.state.mode=mode;},()=>picker.selectOption(String(mode)));
}

async function actualAsset(ref,asset) {
  assert.equal(asset.url,`/company-assets/wall-hvac-v1/${ref.id}/v${ref.version}/model.glb`);
  const response = responses.get(asset.url);
  assert.equal(response?.status(),200,`Expected actual browser GLB response ${asset.url}`);
  if (verifiedAssets.has(response)) return;
  const bytes = manifest ? await pinned('viewer'+asset.url) : await fs.readFile(path.join(root,'.'+asset.url));
  assert.equal(bytes.length,asset.bytes);
  assert.equal(sha(bytes),asset.sha256);
  assert(bytes.equals(await response.body()));
  verifiedAssets.add(response);
}

async function mountedState(room) {
  const facts = await page.evaluate(async ({id,threeUrl})=>{
    const T = await import(threeUrl), {scene,document:doc} = company.session;
    const node = doc.nodes.find(row=>row.id===id);
    const ref = node.resource, resource = company.catalog.resources.find(row=>row.id===ref.id && row.version===ref.version);
    const unit = scene.root.getObjectByName(id), support = scene.root.getObjectByName(node.parentId);
    scene.root.updateMatrixWorld(true);
    const meshes = [];
    scene.root.traverseVisible(mesh=>{if(mesh.isMesh && unit.getObjectById(mesh.id)) meshes.push(mesh);});
    const flap = unit.getObjectByName(resource.wallHvac.louver);
    const lamp = unit.getObjectByName(resource.wallHvac.status);
    const back = unit.getObjectByName('wall-ac-outlet-back');
    if (!flap || !meshes.includes(lamp) || !meshes.includes(back) || !meshes.some(mesh=>flap.getObjectById(mesh.id))) {
      throw Error('Missing visible GLB pivot, lamp or outlet mesh in the room');
    }
    const world = unit.getWorldPosition(new T.Vector3());
    const forward = unit.getWorldDirection(new T.Vector3());
    const localForward = forward.clone().transformDirection(support.matrixWorld.clone().invert());
    const expected = new T.Vector3(Math.sin(node.transform.yaw),0,Math.cos(node.transform.yaw));
    if (localForward.distanceTo(expected) > 1e-6) throw Error('Actual appliance direction differs from its room mounting');
    const center = new T.Box3().setFromObject(back,true).getCenter(new T.Vector3());
    const hit = new T.Raycaster(center.clone().addScaledVector(forward,.30),forward.clone().negate(),0,.45).intersectObjects(meshes,false)[0];
    const expectedPart = node.state.on ? back : flap;
    const wall = scene.wallPresentation().walls.find(item=>item.region===node.parentId && item.mounted.some(part=>part.id===id && part.visible));
    if (!wall?.visible) throw Error('The room wall hosting the device is not rendered');
    return {ref,asset:resource.asset,state:node.state,transform:node.transform, parentId:node.parentId,world:world.toArray(),
      forward:forward.toArray(),wall:wall.id, meshes:meshes.map(mesh=>mesh.name),louver:flap.rotation.x,
      expectedLouver:node.state.on?resource.wallHvac.modeRadians[node.state.mode-1]:resource.wallHvac.closedRadians,
      indicator:{emissive:lamp.material.emissive.getHexString(),intensity:lamp.material.emissiveIntensity},
      firstHit:hit?{name:hit.object.name,distance:hit.distance,matchesExpected:Boolean(expectedPart.getObjectById(hit.object.id))}:null};
  },{id:room.fixtureId,threeUrl});
  const {on,mode} = facts.state;
  assert(Math.abs(facts.louver-facts.expectedLouver)<1e-6);
  assert(Math.abs(facts.world[1]-2.24)<1e-6);
  assert.deepEqual(facts.indicator,on?{emissive:colors[mode-1],intensity:1}:{emissive:'000000',intensity:0});
  assert(facts.firstHit?.matchesExpected,'Real room outlet did not reveal the expected geometry');
  await actualAsset(facts.ref,facts.asset);
  return facts;
}

async function pixels(room) {
  return page.evaluate(async ({id,threeUrl})=>{
    const T = await import(threeUrl), {camera,renderer,session:{scene}} = company;
    const instance = scene.root.getObjectByName(id);
    company.drawHostFrame();
    const gl = renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const body = new T.Box3(new T.Vector3(-.515,-.179,-.003),new T.Vector3(.515,.179,.224));
    const outlet = new T.Box3(new T.Vector3(-.325,-.144,.105),new T.Vector3(.325,-.088,.215));
    const lamp = new T.Box3().setFromObject(instance.getObjectByName('wall-ac-status'),true);
    function capture(box,local) {
      const projected = [];
      for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
        const vertex = new T.Vector3(x,y,z);
        if (local) vertex.applyMatrix4(instance.matrixWorld);
        vertex.project(camera);
        projected.push([(vertex.x+1)*width/2,(1-vertex.y)*height/2]);
      }
      const x = Math.max(0,Math.floor(Math.min(...projected.map(v=>v[0]))));
      const y = Math.max(0,Math.floor(Math.min(...projected.map(v=>v[1]))));
      const w = Math.min(width,Math.ceil(Math.max(...projected.map(v=>v[0]))))-x;
      const h = Math.min(height,Math.ceil(Math.max(...projected.map(v=>v[1]))))-y;
      if (w<1 || h<1) throw Error('Projected appliance patch lies outside the normal viewer');
      const bytes = new Uint8Array(w*h*4);
      gl.readPixels(x,height-y-h,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      let binary = '';
      for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
      return {rect:[x,y,w,h],rgba:btoa(binary)};
    }
    return {camera:camera.matrixWorld.toArray(),body:capture(body,true),outlet:capture(outlet,true),lamp:capture(lamp,false)};
  },{id:room.fixtureId,threeUrl});
}

function visualDifference(before,after,part) {
  for (const [i,value] of before.camera.entries()) assert(Math.abs(value-after.camera[i])<1e-5,'Pixel comparison camera moved');
  const a = before[part], b = after[part];
  assert.deepEqual(a.rect,b.rect,'Pixel comparison rectangles diverged');
  const left = Buffer.from(a.rgba,'base64'), right = Buffer.from(b.rgba,'base64');
  let changed = 0, darkened = 0;
  for (let i=0;i<left.length;i+=4) {
    const dr=right[i]-left[i], dg=right[i+1]-left[i+1], db=right[i+2]-left[i+2];
    if (Math.abs(dr)+Math.abs(dg)+Math.abs(db)>=24) changed++;
    if (dr+dg+db<=-48) darkened++;
  }
  return {rect:a.rect,changed,darkened,beforeSha256:sha(left),afterSha256:sha(right)};
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  const bytes = await page.screenshot({path:path.join(out,name)});
  return {file:name,sha256:sha(bytes)};
}

async function save(room) {
  const document = await current();
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const text = await readSave(room.id);
  assert.deepEqual(JSON.parse(text).document,document);
  return {document,text};
}

async function checkRoom(room,index) {
  stage = `${room.id} load`;
  const profile = path.join(out,`profile-${room.id}`);
  await open(profile);
  await load(room);
  await select(room);
  await overview(room);
  const wide = await screenshot(`${room.id}-room.png`);
  await focus();
  const row = {id:room.id,fixtureId:room.fixtureId,inputSha256:sha(room.bytes),floorYaw:room.floorYaw,overview:wide,looks:[]};
  report.rooms.push(row);
  const pair = looks.slice(index*2,index*2+2);
  let previousLook;
  for (const ref of pair) {
    stage = `${room.id} ${key(ref)}`;
    await setLook(room,ref);
    await setMode(room,3);
    await setPower(room,false);
    const off = await mountedState(room);
    const closed = await pixels(room);
    const closedPhoto = await screenshot(`${room.id}-${ref.id}-off.png`);
    await setPower(room,true);
    const heat = await mountedState(room);
    const opened = await pixels(room);
    const outlet = visualDifference(closed,opened,'outlet');
    const lamp = visualDifference(closed,opened,'lamp');
    assert(outlet.changed>20 && outlet.darkened>5,'Viewer did not show the physical opening changing');
    assert(lamp.changed>2,'Viewer did not show the actual indicator switching on');
    const appearance = previousLook ? visualDifference(previousLook,opened,'body') : null;
    if (appearance) assert(appearance.changed>50,'The two appearances lack distinct visible pixels in the same room');
    previousLook = opened;
    const heatPhoto = await screenshot(`${room.id}-${ref.id}-heat.png`);
    const otherModes = [];
    for (const mode of [1,2]) {
      await setMode(room,mode);
      otherModes.push(await mountedState(room));
    }
    row.looks.push({ref:key(ref), off,heat,otherModes,pixels:{outlet,lamp,appearance},closedPhoto,heatPhoto});
  }
  stage = `${room.id} save and reopen browser`;
  if (index === 0) { await setMode(room,3); await setPower(room,false); }
  const warm = await mountedState(room);
  const saved = await save(room);
  await close();
  await open(profile);
  await visit(new URL(baseUrl));
  assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
  assert(![...responses.keys()].some(url=>url==='/delivery-save.json'||url.startsWith('/delivery-room/')));
  assert.deepEqual(await current(),saved.document);
  assert.equal(await readSave(room.id),saved.text);
  await select(room);
  await focus();
  const cold = await mountedState(room);
  assert.deepEqual(cold,warm);
  row.reopened = {savedSha256:sha(saved.text),reopenedWithoutDeliveryQuery:true,restoredFromBrowserStorage:true,
    state:cold.state,ref:cold.ref,photo:await screenshot(`${room.id}-reopened.png`)};
  await close();
}

async function recordTour(rooms) {
  stage = 'ordinary UI at 1×';
  await open(path.join(out,'record-profile'),true);
  const video = page.video(), checkpoints = [];
  const start = performance.now();
  for (const [index,room] of rooms.entries()) {
    await load(room);
    await select(room);
    await overview(room);
    await page.waitForTimeout(1200);
    await focus();
    for (const ref of looks.slice(index*2,index*2+2)) {
      await setLook(room,ref);
      await setPower(room,false);
      await setMode(room,1);
      checkpoints.push({room:room.id,look:key(ref),on:false,mode:1,ms:performance.now()-start});
      await page.waitForTimeout(900);
      await setPower(room,true);
      for (const mode of [1,2,3]) {
        await setMode(room,mode);
        checkpoints.push({room:room.id,look:key(ref),on:true,mode,ms:performance.now()-start});
        await page.waitForTimeout(900);
      }
    }
    await save(room);
    await visit(new URL(baseUrl));
    await select(room);
    await focus();
    await page.waitForTimeout(1200);
  }
  await close();
  const origin = await video.path();
  assert(inside(path.join(out,'video'),path.resolve(origin)));
  const file = 'video/wall-hvac-normal-1x.webm';
  await fs.rename(origin,path.join(out,file));
  const bytes = await fs.readFile(path.join(out,file));
  report.video = {file,sha256:sha(bytes),bytes:bytes.length,playbackSpeed:1,checkpoints};
}

async function run() {
  stage = 'project output and sealed inputs';
  await outputDirectory();
  if (!batch) {
    const bytes = await fs.readFile(path.join(root,'transfer-manifest.json'));
    manifest = JSON.parse(bytes);
    assert.equal(manifest.buildId,build);
    report.manifestSha256 = sha(bytes);
  }
  const rooms = await Promise.all(roomIds.map(fixture));
  assert(Math.abs(rooms[1].floorYaw-rooms[0].floorYaw)>1,'Expected a distinct rotated floor fixture');
  baseUrl = await serve();
  report.port = Number(baseUrl.port);
  report.sourceDigest = manifest?.sourceDigest ?? fixedServer.info.sourceDigest;
  for (const [index,room] of rooms.entries()) await checkRoom(room,index);
  assert.equal(new Set(report.rooms.flatMap(room=>room.looks.map(look=>look.heat.asset.sha256))).size,looks.length);
  assert.equal(new Set(report.rooms.map(room=>room.reopened.savedSha256)).size,rooms.length);
  if (flags.includes('--record')) await recordTour(rooms);
  for (const room of rooms) assert((batch?await fs.readFile(room.file):await pinned(room.file)).equals(room.bytes));
  assert.deepEqual(report.browserErrors,[]);
  report.status = 'passed';
}

async function cleanup() {
  await close();
  if (fixedServer) await fixedServer.close();
  if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null && packageServer.pid) {
    const end = once(packageServer,'exit');
    packageServer.kill();
    await end;
  }
  if (!outputCreated) return;
  for (const name of ['process-temp','record-profile',...roomIds.map(id=>`profile-${id}`)]) {
    const candidate = path.join(out,name);
    try {
      const resolved = await fs.realpath(candidate);
      assert.equal(path.relative(candidate,resolved),'','Unexpected cleanup target');
      assert(inside(out,resolved) && path.relative(out,resolved),'Temporary directory escaped allocated output');
      await fs.rm(resolved,{recursive:true,maxRetries:4,retryDelay:200});
    } catch (error) { if(error.code!=='ENOENT') throw error; }
  }
  report.closed = {browser:true,loopbackServer:true,temporaryProfilesRemoved:true};
}

run().catch(async error=>{
  report.status = 'failed';
  report.failure = {stage,message:error.stack};
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({timeout:1500}).catch(()=>null);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async()=>{
  try { await cleanup(); }
  catch (error) { report.cleanupError=String(error); report.status='failed'; process.exitCode=1; console.error(error); }
  if (outputCreated) await fs.writeFile(path.join(out,'report.json'),`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify({status:report.status,entry:report.entry,out,rooms:report.rooms.length,video:report.video?.file}));
});
