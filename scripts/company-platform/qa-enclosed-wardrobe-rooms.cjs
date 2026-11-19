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
  throw new Error('Usage: node qa-enclosed-wardrobe-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-enclosed-wardrobe-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');

const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1500, height:950}, threeUrl = '/__enclosed-wardrobe-qa/three.core.js';
const roomKeys = ['closet-rental', 'closet-floor'];
const looks = ['timber','framed','inset','glass'].map(name => ({id:`enclosed-wardrobe-${name}`, version:1}));
const label = {left:'左柜门开度', right:'右柜门开度'};
const key = ({id, version}) => `${id}@${version}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const node = (document, id) => document.nodes.find(item => item.id === id);
const near = (actual, expected, tolerance = 1e-5) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const report = {status:'running', build, rooms:[], browserErrors:[]};
let manifest, developmentServer, packageServer, baseUrl, threeSource, context, page, responses, stage, created;

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
  const floor = id === 'closet-rental' ? 'ground' : 'level';
  const floorId = `${id}/${floor}`, roomId = `${floorId}/dressing`, wardrobeId = `${roomId}/wardrobe`;
  const childIds = ['left','right'].map(side => `${wardrobeId}/look-${side}`);
  assert.equal(node(document, wardrobeId)?.parentId, roomId);
  assert.deepEqual(childIds.map(child => node(document, child)?.parentId), [wardrobeId, wardrobeId]);
  return {id, file, bytes, document, floorId, roomId, wardrobeId, childIds};
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
  page.on('console', event => { if (event.type() === 'error') report.browserErrors.push({stage, message:event.text()}); });
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
const savedText = id => page.evaluate(id => company.session.readSavedText(id), id);

async function ready() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'false', await status.textContent());
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
  assert.deepEqual(await current(), room.document);
}

async function camera(room, offset = [1.25, 1.97, 4.30], focus = [.04, .88, .19]) {
  return page.evaluate(({id, offset, focus}) => {
    const {session:{scene}, camera} = company;
    const model = scene.root.getObjectByName(id);
    const world = point => model.localToWorld(camera.position.clone().fromArray(point));
    camera.position.copy(world(offset));
    camera.lookAt(world(focus));
    camera.updateMatrixWorld(true);
    scene.setWallView({mode:'cutaway', cameraPosition:camera.position.toArray()});
    company.drawHostFrame();
    return {position:camera.position.toArray(), direction:camera.quaternion.toArray()};
  }, {id:room.wardrobeId, offset, focus});
}

async function show(room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (view.mode !== 'room' || view.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.wardrobeId);
  await camera(room);
}

async function choose(room, look) {
  const select = page.locator('#edit-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), room.wardrobeId);
  const choices = await select.locator('option').evaluateAll(entries => entries.map(entry => entry.value));
  assert(looks.every(ref => choices.includes(key(ref))), choices.join(', '));
  if (await select.inputValue() === key(look)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.wardrobeId).resource = look;
  await select.selectOption(key(look));
  await ready();
  assert.deepEqual(await current(), expected, 'Changing look preserves both door states, identity and hanging children');
}

async function door(room, side, value) {
  const control = page.locator(`#edit-states input[type="range"][aria-label="${label[side]}"]`);
  assert.equal(await control.getAttribute('min'), '0');
  assert.equal(await control.getAttribute('max'), '1');
  if (Number(await control.inputValue()) === value) return;
  const expected = await current();
  expected.revision++;
  (node(expected, room.wardrobeId).state ??= {})[side + 'Open'] = value;
  await control.fill(String(value));
  await ready();
  assert.equal(Number(await control.inputValue()), value);
  assert.deepEqual(await current(), expected, 'One slider changes only its own door state');
}

async function asset(value) {
  const response = responses.get(value.url);
  assert.equal(response?.status(), 200, 'Expected browser GLB ' + value.url);
  const bytes = manifest ? await pinned('viewer' + value.url) : await fs.readFile(path.join(root, '.' + value.url));
  assert.equal(bytes.length, value.bytes);
  assert.equal(sha(bytes), value.sha256);
  assert(bytes.equals(await response.body()));
}

async function snapshot(room, verifyFiles = false) {
  const result = await page.evaluate(async ({id, children, threeUrl}) => {
    const {Box3, Raycaster, Vector3} = await import(threeUrl);
    const {session:{scene, document:layout}} = company;
    scene.root.updateMatrixWorld(true);
    const wardrobe = scene.root.getObjectByName(id), wardrobeNode = layout.nodes.find(item => item.id === id);
    const resource = ({resource:{id, version}}) => company.catalog.resources.find(item => item.id === id && item.version === version);
    const spec = resource(wardrobeNode), resourceFromWorld = wardrobe.matrixWorld.clone().invert();
    const bound = (group, name) => {
      const target = group.getObjectByName(name);
      if (!target) throw new Error('Missing runtime node ' + name);
      return target;
    };
    const coordinates = (group, inverse) => {
      const out = [];
      group.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        const local = inverse.clone().multiply(mesh.matrixWorld), position = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        for (let i = 0; i < (index?.count ?? position.count); i++)
          out.push(new Vector3().fromBufferAttribute(position,index ? index.getX(i) : i).applyMatrix4(local));
      });
      if (out.length < 3) throw new Error('No actual visible triangles for ' + group.name);
      return out;
    };
    const bounds = points => {
      const box = new Box3().setFromPoints(points);
      return [box.min.toArray(), box.max.toArray()];
    };
    const sample = (object, pivot) => {
      const pose = resourceFromWorld.clone().multiply(pivot.matrixWorld);
      const local = coordinates(object, pivot.matrixWorld.clone().invert());
      const farthest = local.reduce((a, b) => (b.x*b.x + b.z*b.z > a.x*a.x + a.z*a.z + 1e-10 ? b : a));
      const world = farthest.clone().applyMatrix4(pose);
      return {local:farthest.toArray(), parentSpace:world.toArray(), triangles:local.length / 3};
    };
    const doors = spec.movingParts.map(part => {
      const pivot = bound(wardrobe, spec.partNodes[part.id]);
      const prefix = `wardrobe-${part.id}-`;
      const parts = {panel:bound(wardrobe, spec.partPanels[part.id]), handle:bound(wardrobe, prefix + 'handle'), hinges:bound(wardrobe, prefix + 'hinges')};
      const glass = wardrobe.getObjectByName(prefix + 'glass');
      const material = [];
      glass?.traverseVisible(mesh => { if (mesh.isMesh) for (const m of [mesh.material].flat())
        material.push({opacity:m.opacity, transparent:m.transparent, castShadow:mesh.castShadow}); });
      return {part, angle:pivot.rotation.y, pivot:pivot.position.toArray(), bounds:bounds(coordinates(pivot,resourceFromWorld)),
        components:Object.fromEntries(Object.entries(parts).map(([key,object]) => [key,sample(object,pivot)])), material};
    });
    const rail = bound(wardrobe,'garment-rail'), up = new Vector3(0,1,0), ray = new Raycaster();
    const intersection = (mesh, start, direction) => {
      ray.set(start,direction); ray.far = .045;
      const result = ray.intersectObject(mesh, false)[0];
      if (!result) throw new Error('Missing real rail or hook triangle: ' + mesh.name);
      return {point:result.point.toArray(), triangle:result.faceIndex};
    };
    const clothing = children.map(child => {
      const item = layout.nodes.find(n => n.id === child);
      const garment = bound(wardrobe, child), hook = bound(garment, 'hanger-hook');
      const bore = garment.localToWorld(new Vector3(0,-spec.garmentRail.radius,0));
      const crown = intersection(hook,bore,up), rod = intersection(rail,bore.clone().addScaledVector(up,.039),up.clone().negate());
      return {item, actualParent:garment.parent.name, matrix:garment.matrixWorld.toArray(), bounds:bounds(coordinates(garment,resourceFromWorld)),
        asset:resource(item).asset, crown, rod, gap:new Vector3().fromArray(crown.point).distanceTo(new Vector3().fromArray(rod.point))};
    });
    return {wardrobe:wardrobeNode, asset:spec.asset, rail:bounds(coordinates(rail,resourceFromWorld)), doors, clothing};
  }, {id:room.wardrobeId, children:room.childIds, threeUrl});
  for (const assertClothing of result.clothing) {
    near(assertClothing.gap, 0, .0005);
    assert.equal(assertClothing.actualParent, room.wardrobeId);
    if (verifyFiles) await asset(assertClothing.asset);
  }
  const frontOfClothes = Math.max(...result.clothing.map(item => item.bounds[1][2]));
  for (const actual of result.doors) {
    const angle = actual.part.rotationRange[1] * (result.wardrobe.state?.[actual.part.stateField] ?? 0);
    near(actual.angle, angle);
    actual.pivot.forEach((value,i) => near(value,actual.part.pivot[i]));
    assert(actual.bounds[0][2] > frontOfClothes + .01, 'The operating panel remains ahead of both garments');
    const [px,py,pz] = actual.pivot;
    for (const {local:[x,y,z], parentSpace, triangles} of Object.values(actual.components)) {
      assert(triangles > 0);
      near(parentSpace[0], px + x * Math.cos(angle) + z * Math.sin(angle));
      near(parentSpace[1], py + y);
      near(parentSpace[2], pz + z * Math.cos(angle) - x * Math.sin(angle));
    }
    if (result.wardrobe.resource.id === 'enclosed-wardrobe-glass') {
      assert(actual.material.length && actual.material.every(m => m.transparent && m.opacity > 0 && m.opacity < 1 && !m.castShadow));
    } else assert.equal(actual.material.length, 0);
  }
  if (verifyFiles) await asset(result.asset);
  return result;
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({path:path.join(out, name)});
  return name;
}

async function saveAndReopen(room, profile) {
  const document = await current();
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const stored = await savedText(room.id);
  const envelope = JSON.parse(stored);
  assert.deepEqual(envelope.document, document);
  for (const id of [room.wardrobeId,...room.childIds]) assert(envelope.dependencies.resources.some(pin => key(pin) === key(node(document,id).resource)));
  await close();
  await open(profile);
  await visit(baseUrl);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.deepEqual(await current(), document);
  assert.equal(await savedText(room.id), stored);
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  await show(room);
  return sha(stored);
}

async function both(room, left, right) {
  await door(room, 'left', left);
  await door(room, 'right', right);
}

async function frameOpenRoom(room) {
  if (room.id === 'closet-rental') return camera(room,[.72,2.13,4.55],[.62,.90,.16]);
  return camera(room,[.55,2.25,4.90],[0,.90,1.20]);
}

async function throughGlass(room) {
  await camera(room, [.04,1.67,2.75], [.01,1.12,.15]);
  const proof = await page.evaluate(({id, child}) => {
    const {session:{scene}, renderer} = company;
    const wardrobe = scene.root.getObjectByName(id), target = wardrobe.getObjectByName(child);
    const glass = wardrobe.getObjectByName('wardrobe-left-glass'), meshes = [];
    glass.traverseVisible(mesh => { if (mesh.isMesh) meshes.push({mesh, material:mesh.material, visible:mesh.visible}); });
    const casts = [];
    target.traverseVisible(mesh => { if (mesh.isMesh && mesh.castShadow) casts.push(mesh); });
    const canvas = document.createElement('canvas');
    canvas.width = renderer.domElement.width;
    canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const capture = () => {
      company.drawHostFrame();
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(renderer.domElement,0,0);
      return ctx.getImageData(0,0,canvas.width,canvas.height).data;
    };
    const pair = () => {
      target.visible = true;
      const withClothing = capture();
      target.visible = false;
      return [withClothing, capture()];
    };
    const originalVisibility = target.visible, copies = [];
    let actual, absent, solid;
    try {
      for (const mesh of casts) mesh.castShadow = false;
      actual = pair();
      for (const {mesh} of meshes) mesh.visible = false;
      absent = pair();
      for (const {mesh, material} of meshes) {
        mesh.visible = true;
        const opaque = [material].flat().map(value => {
          const copy = value.clone();
          Object.assign(copy, {transparent:false, opacity:1, depthWrite:true});
          copies.push(copy);
          return copy;
        });
        mesh.material = Array.isArray(material) ? opaque : opaque[0];
      }
      solid = pair();
    } finally {
      target.visible = originalVisibility;
      for (const mesh of casts) mesh.castShadow = true;
      for (const {mesh, material, visible} of meshes) Object.assign(mesh, {material, visible});
      for (const copy of copies) copy.dispose();
      company.drawHostFrame();
    }
    const delta = ([a,b], i) => Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]);
    let behindGlass = 0, stillVisible = 0, actualDiff = 0, absentDiff = 0;
    for (let i = 0; i < actual[0].length; i += 4) {
      const bare = delta(absent,i);
      if (bare < 16 || delta(solid,i) > 3 || delta([actual[0],absent[0]],i) < 5) continue;
      behindGlass++;
      const through = delta(actual,i);
      if (through >= 5) stillVisible++;
      actualDiff += through;
      absentDiff += bare;
    }
    return {child, behindGlass, stillVisible, retainedSignal:absentDiff ? actualDiff/absentDiff : 0};
  }, {id:room.wardrobeId, child:room.childIds[0]});
  report.glassObservation = proof;
  assert(proof.behindGlass >= 50 && proof.stillVisible / proof.behindGlass > .65 && proof.retainedSignal > .15,
    'The same attached garment must contribute real pixels through the tinted pane: ' + JSON.stringify(proof));
  proof.frame = await screenshot(room.id + '-actual-glass.png');
  await camera(room);
  return proof;
}

async function rooms(fixture) {
  const room = {key:fixture.id, roomId:fixture.roomId, fixtureSha256:sha(fixture.bytes), looks:[]};
  report.rooms.push(room);
  const profile = await fs.mkdtemp(path.join(out,'profile-'));
  stage = `${fixture.id}: original package save`;
  await open(profile);
  await load(fixture);
  await show(fixture);
  room.initial = await snapshot(fixture,true);
  room.openingView = await screenshot(fixture.id + '-initial-room.png');
  for (const look of looks) {
    stage = `${fixture.id}: ${key(look)} geometry, state and cold reopen`;
    await choose(fixture,look);
    await both(fixture,0,0);
    const closed = await snapshot(fixture,true);
    const closedFrame = await screenshot(`${fixture.id}-${look.id}-closed.png`);
    if (look.id.endsWith('-glass') && fixture.id === 'closet-floor') room.glass = await throughGlass(fixture);
    await door(fixture,'left',1);
    const leftOnly = await snapshot(fixture);
    near(leftOnly.doors[0].angle, -Math.PI/2);
    assert.deepEqual(leftOnly.doors[1],closed.doors[1]);
    assert.deepEqual(leftOnly.clothing,closed.clothing);
    assert.deepEqual(leftOnly.rail,closed.rail);
    for (const part of ['panel','handle']) {
      const before = closed.doors[0].components[part].parentSpace[2];
      const after = leftOnly.doors[0].components[part].parentSpace[2];
      assert(after - before > .25, 'The visible left ' + part + ' must swing with the left hinge');
    }
    await door(fixture,'right',.55);
    const open = await snapshot(fixture);
    near(open.doors[1].angle,.55*Math.PI/2);
    assert.deepEqual(open.doors[0],leftOnly.doors[0]);
    assert.deepEqual(open.clothing,closed.clothing);
    assert.deepEqual(open.rail,closed.rail);
    for (const part of ['panel','handle']) {
      const before = closed.doors[1].components[part].parentSpace[2];
      const after = open.doors[1].components[part].parentSpace[2];
      assert(after - before > .20, 'The visible right ' + part + ' must swing with the right hinge');
    }
    const openFrame = await screenshot(`${fixture.id}-${look.id}-open.png`);
    const savedSha256 = await saveAndReopen(fixture,profile);
    assert.deepEqual(await snapshot(fixture,true),open);
    room.looks.push({look,closed,open,closedFrame,openFrame,savedSha256,coldReopened:true});
  }
  await both(fixture,1,1);
  room.fullyOpen = await snapshot(fixture);
  near(room.fullyOpen.doors[1].angle,Math.PI/2);
  await page.locator('#edit-instance').selectOption('');
  await frameOpenRoom(fixture);
  room.fullyOpenFrame = await screenshot(fixture.id + '-fully-open-room.png');
  await camera(fixture,[.07,1.59,.95],[0,1.48,0]);
  room.railDetail = await screenshot(fixture.id + '-rail-and-hooks.png');
  await close();
}

async function record(fixtures) {
  stage = 'normal speed recording';
  const [first,second] = fixtures;
  const profile = await fs.mkdtemp(path.join(out,'recording-profile-'));
  await open(profile,true);
  await load(first);
  await show(first);
  for (const look of looks) {
    await choose(first,look);
    await page.waitForTimeout(1050);
  }
  await door(first,'right',.55);
  await page.waitForTimeout(700);
  await door(first,'left',1);
  await page.waitForTimeout(1800);
  await load(second);
  await show(second);
  await both(second,1,1);
  await frameOpenRoom(second);
  await page.waitForTimeout(1900);
  const raw = await page.video().path();
  await close();
  const file = 'video/enclosed-wardrobe-normal.webm';
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
  for (const input of fixtures) await rooms(input);
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
