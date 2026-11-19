const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {chromium} = require('../../prototype/node_modules/playwright');

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(option => option.startsWith('--'));
const paths = options.filter(option => !option.startsWith('--'));
if (!rootArg || !/^[0-9a-f]{12}$/.test(build) || ![1, 2].includes(paths.length) || flags.length > 1 || flags.some(option => option !== '--record'))
  throw new Error('Usage: node qa-product-showcase-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-product-showcase-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');

const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1500, height:950}, threeUrl = '/__product-showcase-qa/three.core.js';
const roomKeys = ['showcase-rental', 'showcase-studio'];
const looks = ['bag','carton','can','honey'].map(name => ({id:`showcase-product-${name}`, version:1}));
const shelfMove = {position:[-1.55,0,-.95], yaw:0};
const key = ({id, version}) => `${id}@${version}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const node = (document, id) => document.nodes.find(item => item.id === id);
const near = (value, expected, epsilon = 1e-6) => assert(Math.abs(value - expected) <= epsilon, `${value} != ${expected}`);
const report = {status:'running', build, rooms:[], browserErrors:[]};
let manifest, developmentServer, packageServer, baseUrl, threeSource, context, page, responses, stage, created, expectedError;

async function pinned(file) {
  const bytes = await fs.readFile(path.join(root, file));
  const pin = manifest.files.find(item => item.path === file);
  assert.equal(bytes.length, pin?.bytes, file);
  assert.equal(sha(bytes), pin.sha256, file);
  return bytes;
}

async function serve() {
  if (batch) {
    developmentServer = await require('./serve.cjs').serve(root, build, {manifest:'company-build-info.json', entry:'company.html', port:0});
    return new URL(developmentServer.url);
  }
  packageServer = spawn(process.execPath, ['serve.mjs', '0'], {cwd:root, windowsHide:true, stdio:['ignore', 'pipe', 'inherit']});
  const lines = createInterface({input:packageServer.stdout});
  try {
    const [line] = await Promise.race([
      once(lines, 'line', {signal:AbortSignal.timeout(20000)}),
      once(packageServer, 'exit').then(([code]) => { throw new Error('Package server exited before ready: ' + code); }),
    ]);
    const url = new URL(line);
    assert(url.port && url.hostname === '127.0.0.1' && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally { lines.close(); packageServer.stdout.resume(); }
}

async function fixture(id) {
  const file = batch ? path.join(batch, id, 'save.json') : `data/rooms/${id}/save.json`;
  const bytes = batch ? await fs.readFile(file) : await pinned(file);
  const {schema, document} = JSON.parse(bytes);
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  const room = document.nodes.find(item => item.kind === 'room' && item.id.endsWith('/live'));
  assert.equal(room.purpose,'streaming');
  const featured = `${room.id}/featured`, shelf = `${room.id}/stock-shelf`, counter = `${room.id}/counter`;
  const stock = ['low','mid','high'].map(level => `${room.id}/sample-${level}`);
  assert.equal(node(document,featured)?.parentId,counter);
  assert.deepEqual(stock.map(id => node(document,id)?.parentId),[shelf,shelf,shelf]);
  assert.deepEqual(stock.map(id => node(document,id)?.attachment?.surfaceId),['lower','middle','top']);
  if (manifest || document.productShowcases) {
    assert.equal(document.productShowcases.length,1);
    const showcase = document.productShowcases[0];
    assert.equal(showcase.roomId,room.id);
    assert.deepEqual(showcase.members,{backdrop:`${room.id}/backdrop`,camera:`${room.id}/camera`,counter,featured,
      sampleHigh:stock[2],sampleLow:stock[0],sampleMid:stock[1],stockShelf:shelf});
  }
  return {id, file, bytes, document, room:room.id, floor:room.parentId, featured, shelf, counter, stock, backdrop:`${room.id}/backdrop`};
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile, {headless:true, viewport,
    args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? {recordVideo:{dir:path.join(out, 'video'), size:viewport}} : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl, route => route.fulfill({contentType:'text/javascript', body:threeSource}));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({stage, message:error.message}));
  page.on('console', event => {
    if (event.type() !== 'error') return;
    const message = event.text();
    if (expectedError && message.includes(expectedError.code) && message.includes(expectedError.id)) expectedError.messages.push(message);
    else report.browserErrors.push({stage,message});
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
const savedText = id => page.evaluate(id => company.session.readSavedText(id),id);

async function ready(rejected = false) {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),String(rejected),await status.textContent());
}

async function visit(url) {
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(() => company.buildInfo);
  assert.equal(identity.shortId,build);
  if (manifest) assert.equal(identity.sourceDigest,manifest.sourceDigest);
}

async function load(room) {
  const url = new URL(baseUrl);
  if (!batch) url.searchParams.set('delivery',room.id);
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
    assert.equal(response?.status(),200);
    assert(room.bytes.equals(await response.body()));
  }
  assert.deepEqual(await current(),room.document);
}

async function select(id) {
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
}

async function show(room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floor) await page.locator('#floor').selectOption(room.floor);
  if (view.mode !== 'room' || view.roomId !== room.room) await page.locator('#room').selectOption(room.room);
  await page.waitForFunction(id => company.session.scene.view.roomId === id,room.room);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await select(room.featured);
}

async function view(room, composition) {
  const [position,target] = {
    room:[[2.10,2.75,4.45],[-.45,1.08,.14]],
    product:[[.25,1.58,.83],[0,1.34,-.04]],
    shelf:[[.30,1.99,3.35],[0,1.03,0]],
  }[composition];
  const id = composition === 'shelf' ? room.shelf : room.counter;
  await page.evaluate(({id,position,target}) => {
    const {session:{scene},camera} = company, actor = scene.root.getObjectByName(id);
    const world = list => actor.localToWorld(camera.position.clone().fromArray(list));
    camera.position.copy(world(position));
    camera.lookAt(world(target));
    camera.updateMatrixWorld(true);
    scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});
    company.drawHostFrame();
  },{id,position,target});
}

async function choose(room, ref) {
  assert.equal(await page.locator('#edit-instance').inputValue(),room.featured);
  const choice = page.locator('#edit-look');
  const options = await choice.locator('option').evaluateAll(items => items.map(item => item.value));
  assert(looks.every(ref => options.includes(key(ref))),'Four official product looks must be compatible');
  if (await choice.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected,room.featured).resource = ref;
  await choice.selectOption(key(ref));
  await ready();
  assert.deepEqual(await current(),expected,'Appearance swap preserves instance, parent, surface and local pose');
}

async function verifyAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(),200,'Expected browser asset request ' + asset.url);
  const bytes = manifest ? await pinned('viewer' + asset.url) : await fs.readFile(path.join(root, '.' + asset.url));
  assert.equal(bytes.length,asset.bytes);
  assert.equal(sha(bytes),asset.sha256);
  assert(bytes.equals(await response.body()));
}

async function materialsAndSupport(room, verifyFiles = false) {
  const result = await page.evaluate(async ({ids, threeUrl}) => {
    const {Box3,Raycaster,Vector3} = await import(threeUrl);
    const {session:{scene,document}} = company;
    scene.root.updateMatrixWorld(true);
    const match = id => document.nodes.find(item => item.id === id);
    const spec = ({id,version}) => company.catalog.resources.find(item => item.id === id && item.version === version);
    return ids.map(id => {
      const item = match(id), actor = scene.root.getObjectByName(id);
      const host = scene.root.getObjectByName(item.parentId), hostSpec = spec(match(item.parentId).resource);
      const surfaceId = item.attachment.surfaceId;
      const surface = host.getObjectByName(hostSpec.supportNodes[surfaceId]);
      const surfaceSpec = hostSpec.supportSurfaces.find(candidate => candidate.id === surfaceId);
      if (actor.parent !== host || !surface?.isMesh) throw new Error('Missing actual parent or support mesh of ' + id);
      const worldBounds = new Box3().setFromObject(actor,true);
      const worldPosition = actor.getWorldPosition(new Vector3());
      const up = new Vector3(0,1,0);
      const source = worldPosition.clone().addScaledVector(up,.028);
      const hit = new Raycaster(source,up.clone().negate(),0,.06).intersectObject(surface,false)[0];
      if (!hit) throw new Error('No physical support triangle for ' + id);
      const textures = [], meshes = [];
      actor.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry;
        meshes.push({name:mesh.name,triangles:(geometry.index?.count ?? geometry.attributes.position.count) / 3});
        for (const material of [mesh.material].flat()) if (material.map?.image) textures.push([material.map.image.width,material.map.image.height]);
      });
      return {item, asset:spec(item.resource).asset, meshes, textures, world:actor.matrixWorld.toArray(),
        relative:host.matrixWorld.clone().invert().multiply(actor.matrixWorld).toArray(),
        parentWorld:host.matrixWorld.toArray(),
        support:{node:surface.name,triangle:hit.faceIndex,topY:surfaceSpec.topY,gapMetres:worldBounds.min.y-hit.point.y},
        size:worldBounds.getSize(new Vector3()).toArray()};
    });
  },{ids:[room.featured,...room.stock],threeUrl});
  for (const item of result) {
    assert(item.meshes.length && item.meshes.every(mesh => mesh.triangles > 0));
    assert(item.textures.length && item.textures.every(([w,h]) => w > 0 && h > 0));
    near(item.item.transform.position[1],item.support.topY);
    near(item.support.gapMetres,0,.001);
    if (verifyFiles) await verifyAsset(item.asset);
  }
  return result;
}

async function productPixels(room) {
  return page.evaluate(id => {
    const {session:{scene},renderer} = company, actor = scene.root.getObjectByName(id);
    const canvas = document.createElement('canvas');
    const {width,height} = renderer.domElement;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    const capture = () => {
      company.drawHostFrame();
      ctx.clearRect(0,0,width,height);
      ctx.drawImage(renderer.domElement,0,0);
      return ctx.getImageData(0,0,width,height).data;
    };
    const castShadows = [], originalVisibility = actor.visible;
    actor.traverseVisible(mesh => { if (mesh.isMesh && mesh.castShadow) castShadows.push(mesh); });
    let original, absent;
    try {
      for (const mesh of castShadows) mesh.castShadow = false;
      original = capture();
      actor.visible = false;
      absent = capture();
    } finally {
      actor.visible = originalVisibility;
      for (const mesh of castShadows) mesh.castShadow = true;
      company.drawHostFrame();
    }
    let pixels = 0, minX = width, minY = height, maxX = 0, maxY = 0;
    for (let i=0;i<original.length;i+=4) {
      const delta = Math.abs(original[i]-absent[i]) + Math.abs(original[i+1]-absent[i+1]) + Math.abs(original[i+2]-absent[i+2]);
      if (delta < 24) continue;
      const x = (i/4)%width, y = Math.floor(i/4/width);
      minX = Math.min(x,minX); minY = Math.min(y,minY);
      maxX = Math.max(x,maxX); maxY = Math.max(y,maxY);
      pixels++;
    }
    return {pixels,screenBounds:[minX,minY,maxX,maxY],canvas:[width,height]};
  },room.featured);
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({path:path.join(out,name)});
  return name;
}

async function save(room) {
  const document = await current();
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  const text = await savedText(room.id), envelope = JSON.parse(text);
  assert.deepEqual(envelope.document,document);
  for (const id of [room.featured,...room.stock]) assert(envelope.dependencies.resources.some(pin => key(pin) === key(node(document,id).resource)));
  return {document,text,sha256:sha(text)};
}

async function reopen(room, profile, saved) {
  await close();
  await open(profile);
  await visit(baseUrl);
  assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
  assert.deepEqual(await current(),saved.document);
  assert.equal(await savedText(room.id),saved.text);
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  await show(room);
}

async function expand(details) {
  if (!(await details.evaluate(el => el.open))) await details.locator(':scope > summary').click();
}

async function rejectOccupiedShelf(room, profile, baseline, saved) {
  await select(room.featured);
  await expand(page.locator('#placement-tools'));
  await page.locator('#edit-target').selectOption(`${room.shelf}:surface:middle`);
  const blocked = {code:'overlapping-supported-props',id:room.stock[1],messages:[]};
  expectedError = blocked;
  try {
    await page.locator('#edit-attach').click();
    await ready(true);
  } finally { expectedError = null; }
  assert(blocked.messages.length, 'The attempted attach must fail for the existing stock item');
  const message = await page.locator('#edit-message').textContent();
  assert.match(message,/这个承载面上已有物品.*原布置已保留/);
  assert.deepEqual(await current(),saved.document);
  assert.equal(await savedText(room.id),saved.text);
  assert.deepEqual(await materialsAndSupport(room),baseline);
  await view(room,'room');
  const frame = await screenshot(room.id + '-occupied-level-rejected.png');
  await reopen(room,profile,saved);
  assert.deepEqual(await materialsAndSupport(room,true),baseline);
  return {requestedSurface:'middle',code:blocked.code,blockingStockId:blocked.id,message,frame,savedSha256:saved.sha256};
}

async function positionShelf(room, transform) {
  await select(room.shelf);
  const details = page.locator('#placement-tools');
  await expand(details);
  await expand(details.locator(':scope > details'));
  await page.locator('#edit-x').fill(String(transform.position[0]));
  await page.locator('#edit-z').fill(String(transform.position[2]));
  await page.locator('#edit-yaw').selectOption(String(Math.round(transform.yaw*180/Math.PI)));
  const expected = await current();
  expected.revision++;
  node(expected,room.shelf).transform = transform;
  await page.locator('#edit-position').click();
  await ready();
  assert.deepEqual(await current(),expected);
}

async function rotateShelf(room) {
  const expected = await current();
  expected.revision++;
  node(expected,room.shelf).transform = {...shelfMove,yaw:Math.PI/2};
  await page.locator('#edit-rotate').click();
  await ready();
  assert.deepEqual(await current(),expected);
}

function follows(before, after, mode) {
  assert.deepEqual(after[0],before[0]);
  for (const [index,item] of after.slice(1).entries()) {
    const prior = before[index+1];
    assert.deepEqual(item.item,prior.item);
    item.relative.forEach((value,i) => near(value,prior.relative[i]));
    if (mode === 'translation') {
      const travel = item.world.slice(12,15).map((value,i) => value-prior.world[i+12]);
      assert(Math.hypot(...travel) > .15);
      travel.forEach((value,i) => near(value,item.parentWorld[i+12]-prior.parentWorld[i+12]));
      item.world.slice(0,12).forEach((value,i) => near(value,prior.world[i]));
    } else {
      for (const column of [0,8]) {
        near(item.world[column],prior.world[column+2]);
        near(item.world[column+2],-prior.world[column]);
      }
      assert.notDeepEqual(item.world,prior.world);
    }
  }
}

async function verifyRoom(fixture) {
  const room = {key:fixture.id,roomId:fixture.room,fixtureSha256:sha(fixture.bytes),looks:[]};
  report.rooms.push(room);
  const profile = await fs.mkdtemp(path.join(out,'profile-'));
  stage = `${fixture.id}: original save and stocked display`;
  await open(profile);
  await load(fixture);
  await show(fixture);
  room.initial = await materialsAndSupport(fixture,true);
  await view(fixture,'room');
  room.wide = await screenshot(fixture.id + '-room-and-stock.png');
  await view(fixture,'shelf');
  room.stockDetail = await screenshot(fixture.id + '-three-stock-levels.png');
  let saved, baseline;
  for (const look of looks) {
    stage = `${fixture.id}: swap and cold reopen ${key(look)}`;
    await choose(fixture,look);
    baseline = await materialsAndSupport(fixture,true);
    await view(fixture,'product');
    const visible = await productPixels(fixture);
    const [x0,y0,x1,y1] = visible.screenBounds;
    assert(visible.pixels > 600 && x1-x0 >= 25 && y1-y0 >= 35 &&
      x0 >= 10 && y0 >= 10 && x1 < visible.canvas[0]-10 && y1 < visible.canvas[1]-10,
    'The actual food package should occupy a visible part of the gallery frame: ' + JSON.stringify(visible));
    const frame = await screenshot(`${fixture.id}-${look.id}-detail.png`);
    saved = await save(fixture);
    await reopen(fixture,profile,saved);
    assert.deepEqual(await materialsAndSupport(fixture,true),baseline);
    room.looks.push({look,product:baseline[0],visible,frame,savedSha256:saved.sha256,coldReopened:true});
  }
  if (fixture.id === 'showcase-rental') {
    stage = 'rental: occupied installation preserves prior live and saved showcase';
    room.rejection = await rejectOccupiedShelf(fixture,profile,baseline,saved);
    stage = 'rental: translate and rotate stocked shelf through editing controls';
    await positionShelf(fixture,shelfMove);
    const translated = await materialsAndSupport(fixture);
    follows(baseline,translated,'translation');
    await rotateShelf(fixture);
    const rotated = await materialsAndSupport(fixture);
    follows(translated,rotated,'rotation');
    await view(fixture,'shelf');
    const frame = await screenshot(fixture.id + '-rotated-shelf.png');
    saved = await save(fixture);
    await reopen(fixture,profile,saved);
    assert.deepEqual(await materialsAndSupport(fixture,true),rotated);
    const movedSave = saved.sha256;
    const originalTransform = node(fixture.document,fixture.shelf).transform;
    await positionShelf(fixture,originalTransform);
    assert.deepEqual(await materialsAndSupport(fixture),baseline);
    saved = await save(fixture);
    room.movement = {translation:shelfMove.position,yaw:Math.PI/2,translated,rotated,frame,
      savedMovedSha256:movedSave,resetTo:originalTransform,savedResetSha256:saved.sha256};
  }
  await close();
}

async function record(fixtures) {
  stage = 'normal speed recording';
  const [first,second] = fixtures;
  const profile = await fs.mkdtemp(path.join(out,'recording-profile-'));
  await open(profile,true);
  await load(first);
  await show(first);
  await view(first,'room');
  await page.waitForTimeout(1500);
  for (const look of looks) {
    await choose(first,look);
    await view(first,'product');
    await page.waitForTimeout(1100);
  }
  await view(first,'room');
  await positionShelf(first,shelfMove);
  await rotateShelf(first);
  await view(first,'shelf');
  await page.waitForTimeout(1800);
  await load(second);
  await show(second);
  await view(second,'room');
  await page.waitForTimeout(2300);
  const raw = await page.video().path();
  await close();
  const file = 'video/showcase-rooms-normal.webm';
  await fs.rename(raw,path.join(out,file));
  const {size} = await fs.stat(path.join(out,file));
  assert(size > 0);
  report.video = {file,bytes:size,playbackSpeed:1};
}

async function run() {
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  created = true;
  stage = 'sealed package or development build';
  if (!batch) {
    const bytes = await fs.readFile(path.join(root,'transfer-manifest.json'));
    manifest = JSON.parse(bytes);
    assert.equal(manifest.schema,'company-transfer');
    assert.equal(manifest.buildId,build);
    const lock = JSON.parse(await pinned('source/prototype/package-lock.json'));
    assert.equal(require('../../prototype/node_modules/three/package.json').version,lock.packages['node_modules/three'].version);
    report.manifestSha256 = sha(bytes);
  }
  threeSource = await fs.readFile(path.join(__dirname,'../../prototype/node_modules/three/build/three.core.js'),'utf8');
  const fixtures = await Promise.all(roomKeys.map(fixture));
  baseUrl = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? developmentServer.info.sourceDigest;
  for (const input of fixtures) await verifyRoom(input);
  if (flags.includes('--record')) await record(fixtures);
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
    await developmentServer?.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const closed = once(packageServer,'exit');
      packageServer.kill();
      await closed;
    }
    if (created) await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2) + '\n');
    console.log(JSON.stringify({status:report.status,build,output:out,video:report.video?.file}));
  }
});
