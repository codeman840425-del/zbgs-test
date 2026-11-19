const assert = require('node:assert/strict');
const {execFile, spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {promisify, isDeepStrictEqual} = require('node:util');

const [bundleArg, manifestPin, outputArg, ...extra] = process.argv.slice(2);
assert(bundleArg && /^[a-f0-9]{64}$/.test(manifestPin) && outputArg && !extra.length,
  'Usage: node qa-vocal-height.cjs PACKAGE MANIFEST_SHA256 FRESH_OUTPUT_DIRECTORY');
const source = path.resolve(__dirname, '../..');
const output = path.resolve(outputArg);
const rooms = ['singing-studio', 'singing-rental'];
const viewport = {width:1600, height:900};
const threeUrl = '/__vocal-height-qa/three.core.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);
const report = {status:'running', scope:'Company viewer height selection, fixed room and mesh identities, browser storage restore, and direct named snapshots.',
  manifestSha256:manifestPin, rooms:[], browserErrors:[], files:[]};
let bundle, manifest, files, chromium, threeSource, temporary, created, server, base, context, page, responses, stage;

async function pinned(relative) {
  const row = files.get(relative);
  assert(row, 'Missing package file '+relative);
  const bytes = await fs.readFile(path.join(bundle,relative));
  assert.equal(bytes.length,row.bytes,relative);
  assert.equal(sha(bytes),row.sha256,relative);
  return bytes;
}

async function prepare() {
  bundle = await fs.realpath(bundleArg);
  const {checkManagedOutput} = await import('./package-company.mjs');
  await checkManagedOutput(output,source,{allowDelivery:false});
  const relative = path.relative(bundle,output);
  assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence cannot overlap the packaged input');
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.mkdir(output);
  created = true;
  temporary = await fs.mkdtemp(path.join(output,'browser-temp-'));
  for(const name of ['TMP','TEMP','TMPDIR']) process.env[name] = temporary;
  const bytes = await fs.readFile(path.join(bundle,'transfer-manifest.json'));
  assert.equal(sha(bytes),manifestPin);
  manifest = JSON.parse(bytes);
  assert.equal(manifest.schema,'company-transfer');
  assert.equal(manifest.version,1);
  files = new Map(manifest.files.map(row=>[row.path,row]));
  assert.equal(files.size,manifest.files.length);
  const script = await fs.readFile(__filename);
  const pinnedScript = await pinned('source/scripts/company-platform/qa-vocal-height.cjs');
  assert(script.equals(pinnedScript),'The operator QA script must match the one packaged with the fixed viewer.');
  report.scriptSha256 = sha(script);
  const {stdout} = await run(process.execPath,[path.join(bundle,'verify.mjs'),bundle,manifestPin],
    {cwd:bundle,windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
  report.packageVerification = JSON.parse(stdout);
  assert.equal(report.packageVerification.ok,true);
  assert.equal(report.packageVerification.checkedFiles,files.size);
  report.build = manifest.buildId;
  const lock = await pinned('source/prototype/package-lock.json');
  assert(lock.equals(await fs.readFile(path.join(source,'prototype/package-lock.json'))),'Use compatible Playwright and Three.js dependencies.');
  chromium = require('../../prototype/node_modules/playwright').chromium;
  threeSource = await fs.readFile(path.join(source,'prototype/node_modules/three/build/three.core.js'),'utf8');
}

async function serve() {
  server = spawn(process.execPath,['serve.mjs','0'],{cwd:bundle,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:server.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20_000)}),
      once(server,'exit').then(([code])=>{throw Error('The package server exited before readiness: '+code);}),
    ]);
    const url = new URL(line);
    assert(url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/company.html');
    url.search = '';
    return url;
  } finally { lines.close();server.stdout.resume(); }
}

async function fixture(alias) {
  const prefix = `data/rooms/${alias}/`;
  const bytes = await pinned(prefix+'save.json'),{schema,document} = JSON.parse(bytes);
  assert.equal(schema,'company-save');
  assert.deepEqual(document,JSON.parse(await pinned(prefix+'layout.json')));
  const rules = document.singingRooms;
  assert.equal(rules?.length,1);
  const [rule] = rules, region = document.nodes.find(node=>node.id===rule.regionId);
  assert.equal(region.kind,'room');
  assert.deepEqual(Object.keys(rule.heightProfiles).sort(),['low','standard']);
  const file = JSON.parse(await pinned(prefix+'use-points.json'));
  assert.equal(file.saveSha256,sha(bytes));
  assert.equal(file.points.length,1);
  return {alias,bytes,document,profile:file.points[0].heightProfile,point:file.points[0],roomId:region.id,floorId:region.parentId,
    micId:rule.roles.mic,profiles:rule.heightProfiles};
}

async function open(profile,record=false) {
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport,deviceScaleFactor:1,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking',`--disk-cache-dir=${path.join(profile,'cache')}`],
    ...(record?{recordVideo:{dir:temporary,size:viewport}}:{}),
  });
  context.setDefaultTimeout(20_000);
  await context.route(`**${threeUrl}`,route=>route.fulfill({contentType:'text/javascript',body:threeSource}));
  page = context.pages()[0]??await context.newPage();
  responses = new Map();
  page.on('response',response=>responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error=>report.browserErrors.push({stage,message:error.message}));
  page.on('console',event=>{
    if(event.type()==='error'&&!event.location().url.endsWith('/favicon.ico')) report.browserErrors.push({stage,message:event.text()});
  });
}

async function close() {
  if(!context)return;
  const browser = context.browser();
  await context.close();
  if(browser)assert.equal(browser.isConnected(),false);
  context = null;
  page = null;
}

async function ready() {
  await page.waitForFunction(()=>window.company?.editor&&company.buildInfo&&
    document.querySelector('#status').dataset.error!==undefined&&!document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}

async function choose(fixture) {
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(fixture.micId);
  await page.locator('#edit-focus').click();
  await ready();
  const height = page.getByLabel('麦架高度',{exact:true});
  assert.equal(await height.count(),1,'One visible height control must belong to the selected microphone');
  return height;
}

async function visit(room,delivery) {
  const url = new URL(base);
  if(delivery)url.searchParams.set('delivery',room.alias);
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(()=>company.buildInfo);
  assert.equal(identity.shortId,manifest.buildId);
  assert.equal(identity.sourceDigest,manifest.sourceDigest);
  await page.waitForFunction(id=>company.session.document.id===id,room.document.id);
  if(delivery) {
    const packageSave = responses.get(`/delivery-room/${room.alias}.json`);
    assert.equal(packageSave?.status(),200);
    assert(room.bytes.equals(await packageSave.body()),'The named room must use its exact pinned save');
    assert.deepEqual(await page.evaluate(()=>company.session.document),room.document);
  } else {
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url=>url==='/delivery-save.json'||url.startsWith('/delivery-room/')));
  }
  const view = await page.evaluate(()=>company.session.scene.view);
  if(view.floorId!==room.floorId)await page.locator('#floor').selectOption(room.floorId);
  if(view.floorId!==room.floorId||view.roomId!==room.roomId||view.mode!=='room')await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id=>company.session.scene.view.roomId===id,room.roomId);
  await ready();
}

async function observe(room) {
  const result = await page.evaluate(async ({micId,threeUrl})=>{
    const {Box3, Vector3} = await import(threeUrl);
    const {scene,document:doc} = company.session;
    const slot = scene.describeUsePoint(micId+'#vocal'),resolved = scene.resolveUsePoint(micId+'#vocal');
    if(!slot||!resolved?.anchor||!resolved?.pickupMesh?.isMesh)throw Error('Missing actual slot, anchor or pickup mesh');
    scene.root.updateMatrixWorld(true);
    const {anchor,pickupMesh} = resolved, host = scene.root.getObjectByName(micId);
    const state = doc.nodes.find(node=>node.id===micId).resource;
    const resource = company.catalog.resources.find(item=>item.id===state.id&&item.version===state.version);
    const box = new Box3().setFromObject(pickupMesh,true);
    const center = box.getCenter(new Vector3()), localCenter = host.worldToLocal(center.clone());
    return {slot,doc,asset:resource.asset,fit:resource.microphone.pickupFit,mesh:{name:pickupMesh.name,
      triangles:(pickupMesh.geometry.index?.count??pickupMesh.geometry.attributes.position.count)/3,
      center:center.toArray(),localCenter:localCenter.toArray(),min:box.min.toArray(),max:box.max.toArray()},
      anchor:anchor.getWorldPosition(new Vector3()).toArray(),host:host.getWorldPosition(new Vector3()).toArray(),
      frameTime:performance.now()};
  },{micId:room.micId,threeUrl});
  assert.equal(result.slot.id,room.micId+'#vocal');
  assert.equal(result.slot.kind,'standing-vocal');
  assert.equal(result.mesh.name,result.slot.contact.pickupNodeId);
  assert(result.mesh.triangles>100);
  for(let i=0;i<3;i++)assert(Math.abs(result.anchor[i]-result.slot.transform.position[i])<1e-6);
  const upload = responses.get(result.asset.url);
  const model = await pinned('viewer'+result.asset.url);
  assert.equal(sha(model),result.asset.sha256);
  if(upload) {
    assert.equal(upload.status(),200);
    assert(model.equals(await upload.body()));
  }
  return result;
}

const slotShape = ({id,companyId,facilityId,floorId,roomId,transform,facilityTransform,local,approachPosition,exitPosition,
  kind,slotId,capacity,clearance,contact})=>({id,companyId,facilityId,floorId,roomId,transform,facilityTransform,local,
  approachPosition,exitPosition,kind,slotId,capacity,clearance,contact});

function selectedVersion(before,after,room,profile) {
  const expected = structuredClone(before.doc), m = expected.nodes.find(node=>node.id===room.micId), [rule]=expected.singingRooms;
  const active = room.profiles[profile];
  expected.revision += 1;
  m.resource = active.resource;
  rule.performer.mouth = active.mouth;
  rule.performer.eye = active.eye;
  assert.deepEqual(after.doc,expected,'The height control must edit only the mic asset and its matching body references');
  assert.deepEqual(slotShape(after.slot),slotShape(before.slot));
  assert.equal(after.slot.heightProfile,profile);
  assert.deepEqual(after.slot.performerReferences,{coordinateSpace:'use-point',mouth:active.mouth,eye:active.eye});
}

async function selectHeight(locator,room,before,profile) {
  const label = profile==='low'?'低位':'标准位';
  await locator.selectOption({label});
  await page.waitForFunction(({id,profile,revision})=>company.session.document.revision===revision&&
    company.session.scene.describeUsePoint(id+'#vocal')?.heightProfile===profile,{id:room.micId,profile,revision:before.doc.revision+1});
  await ready();
  assert.equal(await locator.inputValue(),profile);
  const after = await observe(room);
  selectedVersion(before,after,room,profile);
  return after;
}

function compareHeight(standard,low) {
  const expected = low.fit.mastDropMetres-(standard.fit.mastDropMetres??0);
  const measured = standard.mesh.localCenter[1]-low.mesh.localCenter[1];
  assert(expected>0&&measured>0);
  assert(Math.abs(expected-measured)<.001,`Rendered grille drop ${measured} differs from the signed asset spec ${expected}`);
  assert(Math.abs(standard.mesh.localCenter[0]-low.mesh.localCenter[0])<1e-6);
  assert(Math.abs(standard.mesh.localCenter[2]-low.mesh.localCenter[2])<1e-6);
  assert.equal(standard.mesh.triangles,low.mesh.triangles);
  return {expectedM:expected,measuredM:measured};
}

async function screenshot(filename) {
  const image = await page.screenshot({path:path.join(output,filename)});
  report.files.push({name:filename,bytes:image.length,sha256:sha(image)});
}

async function save(room) {
  const menu = page.locator('details.file-menu');
  if(!await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const saved = await page.evaluate(id=>company.session.readSavedText(id),room.document.id);
  assert.equal(JSON.parse(saved).schema,'company-save');
  return saved;
}

async function archiveVideo(video,filename) {
  const raw = await video.path();
  assert.equal(path.relative(temporary,path.dirname(await fs.realpath(raw))),'','Browser recording escaped the managed temporary folder');
  const bytes = await fs.readFile(raw);
  assert(bytes.length>1024,'Expected a real uncut Playwright video');
  await fs.rename(raw,path.join(output,filename));
  report.files.push({name:filename,bytes:bytes.length,sha256:sha(bytes),playbackRate:1,scope:'Same run as the measured public height selections and save'});
}

async function exercise(room) {
  const profile = await fs.mkdtemp(path.join(temporary,'profile-')), results = {room:room.alias};
  report.rooms.push(results);
  stage = `${room.alias}/edit`;
  await open(profile,true);
  const video = page.video();assert(video);
  await visit(room,true);
  const chooser = await choose(room);
  assert.equal(await chooser.inputValue(),'standard');
  const initial = await observe(room);
  assert.deepEqual(initial.slot,room.point);
  await screenshot(room.alias+'-standard.png');
  await page.waitForTimeout(1200);
  const low = await selectHeight(chooser,room,initial,'low');
  await screenshot(room.alias+'-low.png');
  await page.waitForTimeout(1200);
  const standard = await selectHeight(chooser,room,low,'standard');
  assert.deepEqual(standard.mesh,initial.mesh);
  await page.waitForTimeout(900);
  const final = await selectHeight(chooser,room,standard,'low');
  assert.deepEqual(final.mesh,low.mesh);
  const saved = await save(room);
  assert.deepEqual(JSON.parse(saved).document,final.doc);
  await page.waitForTimeout(1100);
  const edit = {initial,low,standard,final,drop:compareHeight(initial,low),saveSha256:sha(saved),
    menuChanges:['标准位','低位','标准位','低位'],recording:room.alias+'-height-normal.webm'};
  results.edit = edit;
  await close();
  await archiveVideo(video,edit.recording);
  stage = `${room.alias}/cold`;
  await open(profile);
  await visit(room,false);
  const after = await observe(room);
  assert.deepEqual(after.doc,final.doc);assert.deepEqual(after.slot,final.slot);assert.deepEqual(after.mesh,final.mesh);
  const restoredBytes = await page.evaluate(id=>company.session.readSavedText(id),room.document.id);
  assert.equal(restoredBytes,saved);
  const reopenedHeight = await choose(room);
  assert.equal(await reopenedHeight.inputValue(),'low');
  await screenshot(room.alias+'-restored.png');
  results.cold = {build:manifest.buildId,slot:after.slot,mesh:after.mesh,saveSha256:sha(restoredBytes),withoutDeliveryQuery:true};
  await close();
}

async function named(room,standard) {
  stage = `${room.alias}/snapshot`;
  const profile = await fs.mkdtemp(path.join(temporary,'snapshot-'));
  await open(profile);
  await visit(room,true);
  const actual = await observe(room);
  assert.equal(room.document.id,standard.doc.id);
  assert.deepEqual(actual.slot,room.point);
  assert.deepEqual(slotShape(actual.slot),slotShape(standard.slot));
  assert.equal(actual.slot.heightProfile,'low');
  const control = await choose(room);
  assert.equal(await control.inputValue(),'low');
  await screenshot(room.alias+'-direct.png');
  await close();
  return {key:room.alias,sameCompanyId:room.document.id,saveSha256:sha(room.bytes),slot:actual.slot,mesh:actual.mesh,
    drop:compareHeight(standard,actual)};
}

(async()=>{
  await prepare();
  base = await serve();
  for(const key of rooms) {
    const [standard,low] = await Promise.all([fixture(key),fixture(key+'-low')]);
    assert.equal(standard.profile,'standard');assert.equal(low.profile,'low');
    await exercise(standard);
    const result = report.rooms.at(-1);
    result.snapshot = await named(low,result.edit.initial);
    assert(isDeepStrictEqual(result.snapshot.mesh,result.edit.final.mesh));
  }
  assert.deepEqual(report.browserErrors,[]);
  report.status = 'passed';
})().catch(error=>{report.status='failed';report.error={stage,message:error.message,stack:error.stack};console.error(error);process.exitCode=1;})
  .finally(async()=>{
    await close();
    if(server&&server.exitCode===null){const stopped=once(server,'exit',{signal:AbortSignal.timeout(10_000)});server.kill();await stopped;}
    if(temporary) {
      assert.equal(path.dirname(await fs.realpath(temporary)),output);
      await fs.rm(temporary,{recursive:true});
    }
    if(created)await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,...(created?{report:path.join(output,'report.json')}:{})}));
  });
