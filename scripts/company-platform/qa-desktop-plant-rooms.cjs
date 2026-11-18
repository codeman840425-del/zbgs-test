const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { chromium } = require('../../prototype/node_modules/playwright');

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--'));
const paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[a-f0-9]{12}$/.test(build) || ![1, 2].includes(paths.length) ||
    flags.length > 1 || flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-desktop-plant-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-desktop-plant-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const root = path.resolve(rootArg);
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const out = path.resolve(paths.at(-1));
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__desktop-plant-qa/three.core.js';
const looks = ['bonsai', 'cactus', 'broadleaf', 'succulent'].map(id => ({ id: 'desktop-plant-' + id, version: 1 }));
const placementChecks = {
  'plant-rental': {
    target: 'plant-rental/ground/live/station-1/phone',
    mover: 'plant-rental/ground/live/station-1',
    clear: [-.70, .84, -.26],
    station: { position: [0, 0, 0], yaw: Math.PI / 2 },
  },
};
const near = (actual, expected, tolerance = .0001) => assert(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
const key = ref => ref.id + '@' + ref.version;
const node = (doc, id) => doc.nodes.find(row => row.id === id);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', build, rooms: [], browserErrors: [] };
let manifest, devServer, packageServer, baseUrl, threeSource, context, page, responses, stage, outputCreated, expectedCollision;

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
  const roomId = id + '/ground/live';
  const stationId = roomId + '/station-1';
  const plantId = stationId + '/desktop-plant', deskId = stationId + '/desk';
  const plant = node(document, plantId);
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  assert(plant && node(document, deskId), 'A real desktop plant and desk must be present');
  const home = id === 'plant-home';
  assert.equal(key(plant.resource), home ? 'desktop-plant-bonsai@1' : 'desktop-plant-broadleaf@1');
  assert.deepEqual(plant.transform.position, home ? [-.70, .84, -.25] : [.70, .84, .15]);
  assert.equal(plant.parentId, deskId);
  const floorId = node(document, roomId).parentId;
  near(node(document, floorId).transform.yaw, home ? 0 : Math.PI / 2);
  return { id, file, bytes, document, roomId, floorId, plantId, deskId, plant };
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
    if (expectedCollision && message.includes('desktop-area-occupied') && message.includes(expectedCollision.instance))
      expectedCollision.messages.push(message);
    else report.browserErrors.push({ stage, message });
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

async function ready(expectedError = false) {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(expectedError), await status.textContent());
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

async function selectPlant(room, selection = room.plantId) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (view.mode !== 'room' || view.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(selection);
  await setCamera(room);
}

async function choose(room, ref) {
  const select = page.locator('#edit-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), room.plantId);
  const choices = await select.locator('option').evaluateAll(items => items.map(item => item.value));
  for (const look of looks) assert(choices.includes(key(look)), 'Missing compatible look ' + key(look));
  if (await select.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.plantId).resource = ref;
  await select.selectOption(key(ref));
  await ready();
  assert.deepEqual(await current(), expected, 'Look selection keeps the instance, mounting, direction and state');
}

async function actualAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual desktop-plant GLB request: ' + asset.url);
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


async function setCamera(room) {
  await page.evaluate(id => {
    const { session, camera } = company;
    const plant = session.scene.root.getObjectByName(id);
    const facility = session.document.nodes.find(node => node.id === id);
    const side = Math.sign(facility.transform.position[0]) || 1;
    const world = coords => plant.localToWorld(camera.position.clone().fromArray(coords));
    camera.position.copy(world([.36, .50, 1.04]));
    camera.lookAt(world([-.15 * side, .14, .015]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, room.plantId);
}

async function inspect(room, ref, capturePixels = false) {
  const fact = await page.evaluate(async ({ plantId, deskId, threeUrl, capturePixels }) => {
    const { Box3, Raycaster, Vector3 } = await import(threeUrl);
    const { session, camera, renderer } = company;
    const { scene, document: doc } = session;
    const resource = entity => company.catalog.resources.find(row => row.id === entity.resource.id && row.version === entity.resource.version);
    const plantNode = doc.nodes.find(node => node.id === plantId), deskNode = doc.nodes.find(node => node.id === deskId);
    const plantSpec = resource(plantNode), surface = resource(deskNode).surface;
    const plant = scene.root.getObjectByName(plantId), desk = scene.root.getObjectByName(deskId);
    const top = desk?.getObjectByName('desktop');
    if (!top?.isMesh || plant?.parent !== desk) throw new Error('The plant must be mounted to the actual imported tabletop');
    scene.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const visible = [];
    scene.root.traverseVisible(mesh => {
      if (mesh.isMesh && plant.children[0].getObjectById(mesh.id)) visible.push(mesh);
    });
    const rawName = mesh => mesh.userData.name || mesh.name;
    const pot = visible.filter(mesh => rawName(mesh) === 'desktop-plant-pot');
    const foliage = visible.filter(mesh => rawName(mesh) === 'desktop-plant-foliage');
    if (pot.length !== 1 || foliage.length !== 1) throw new Error('Expected the real pot and foliage meshes: ' + visible.map(rawName));
    const inverse = desk.matrixWorld.clone().invert();
    const intoPlant = plant.matrixWorld.clone().invert();
    const mounted = new Box3(), local = new Box3(), projected = new Box3();
    const ray = new Raycaster();
    let contactTriangles = 0, baseTriangles = 0, contactArea = 0;
    for (const mesh of visible) {
      const buffer = mesh.geometry.attributes.position;
      const transform = inverse.clone().multiply(mesh.matrixWorld);
      const plantTransform = intoPlant.clone().multiply(mesh.matrixWorld);
      const points = [];
      for (let i = 0; i < buffer.count; i++) {
        const vertex = new Vector3().fromBufferAttribute(buffer, i);
        const deskPoint = vertex.clone().applyMatrix4(transform);
        points.push(deskPoint);
        mounted.expandByPoint(deskPoint);
        local.expandByPoint(vertex.clone().applyMatrix4(plantTransform));
        projected.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld).project(camera));
      }
      if (!pot.includes(mesh)) continue;
      const index = mesh.geometry.index;
      const at = i => points[index ? index.getX(i) : i];
      for (let i = 0; i < (index?.count ?? points.length); i += 3) {
        const vertices = [at(i), at(i + 1), at(i + 2)];
        if (vertices.some(point => Math.abs(point.y - surface.topY) > .0001)) continue;
        const area = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).length() / 2;
        if (area < 1e-10) continue;
        baseTriangles++;
        const center = vertices.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / 3);
        const sample = [center, ...vertices.map(vertex => center.clone().lerp(vertex, .8))];
        if (!sample.every(point => {
          ray.set(desk.localToWorld(point.clone().add(new Vector3(0, .045, 0))), new Vector3(0, -1, 0));
          const intersection = ray.intersectObject(top, false)[0];
          return intersection && Math.abs(desk.worldToLocal(intersection.point.clone()).y - surface.topY) <= .0001;
        })) continue;
        contactTriangles++;
        contactArea += area;
      }
    }
    let pixels;
    if (capturePixels) {
      const source = renderer.domElement;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const read = () => {
        company.drawHostFrame();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const baseline = read();
      const sample = meshes => {
        const copies = new Map(meshes.map(mesh => [mesh, [mesh.material].flat().map(material => material.clone())]));
        const before = meshes.map(mesh => mesh.material);
        let marked;
        try {
          for (const [index, mesh] of meshes.entries()) {
            const materials = copies.get(mesh);
            for (const material of materials) {
              material.emissive.setRGB(1, 0, 1);
              material.emissiveIntensity = 5;
            }
            mesh.material = Array.isArray(before[index]) ? materials : materials[0];
          }
          marked = read();
        } finally {
          for (const [index, mesh] of meshes.entries()) {
            mesh.material = before[index];
            for (const material of copies.get(mesh)) material.dispose();
          }
          company.drawHostFrame();
        }
        let count = 0;
        for (let i = 0; i < baseline.length; i += 4) {
          const difference = Math.abs(marked[i] - baseline[i]) + Math.abs(marked[i + 1] - baseline[i + 1]) +
            Math.abs(marked[i + 2] - baseline[i + 2]);
          if (difference > 28) count++;
        }
        return count;
      };
      pixels = { pot: sample(pot), foliage: sample(foliage) };
    }
    const limits = box => ({ min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new Vector3()).toArray() });
    return { plantNode, deskNode, asset: plantSpec.asset, mount: plantSpec.mount, role: plantSpec.mountRole,
      branch: plantSpec.productionBranch, mounting: plantSpec.mounting, surface,
      local: limits(local), mounted: limits(mounted), projected: limits(projected),
      anatomy: { pot: pot.map(rawName), foliage: foliage.map(rawName) }, contactArea, baseTriangles, contactTriangles,
      plantWorld: plant.matrixWorld.toArray(), plantLocal: inverse.clone().multiply(plant.matrixWorld).toArray(),
      deskWorld: desk.matrixWorld.toArray(), camera: camera.matrixWorld.toArray(),
      ...(capturePixels ? { pixels } : {}), renderError: company.renderStatus().lastRenderError,
    };
  }, { plantId: room.plantId, deskId: room.deskId, threeUrl, capturePixels });
  assert.deepEqual(fact.plantNode.resource, ref);
  assert.equal(fact.plantNode.parentId, room.deskId);
  assert.equal(fact.mount, 'desk-surface');
  assert.equal(fact.mounting.reserveDesktopArea, true);
  assert.equal(fact.renderError, null);
  assert.equal(fact.branch, 'plant-desktop-installation');
  assert.equal(fact.role, fact.branch);
  const { width, height, depth } = fact.mounting;
  assert.deepEqual([width, height, depth], [.35, .55, .35]);
  for (const [i, size] of [width, height, depth].entries())
    assert(fact.local.size[i] > 0 && fact.local.size[i] <= size + .001, 'Actual plant must fit its declared installation envelope');
  near(fact.mounted.min[1], fact.surface.topY);
  fact.plantNode.transform.position.forEach((component, axis) => near(fact.plantLocal[axis + 12], component));
  assert(fact.contactTriangles > 0 && fact.contactArea > .0001, 'Expected real positive-area pot bottom contact');
  assert.equal(fact.contactTriangles, fact.baseTriangles, 'The complete pot base must be supported by the actual desktop triangles');
  if (capturePixels) {
    assert(fact.pixels.pot >= 120 && fact.pixels.foliage >= 120, 'The real pot and foliage must both have exposed pixels');
    assert(fact.projected.min.slice(0, 2).every(x => x > -.99) && fact.projected.max.slice(0, 2).every(x => x < .99),
      'The complete installed plant must be framed');
  }
  await actualAsset(fact.asset);
  return fact;
}

async function save(room, ref) {
  const expected = await current();
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await readSave(room.id), envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, expected);
  const pin = envelope.dependencies.resources.find(resource => key(resource) === key(ref));
  assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  return { expected, text, saved: { sha256: sha(text), pin } };
}

async function readRestored(room, saved) {
  await visit(baseUrl);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.equal(await readSave(room.id), saved.text);
  assert.deepEqual(await current(), saved.expected);
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  await selectPlant(room);
}

async function coldReopen(room, profile, saved) {
  await close();
  await open(profile);
  await readRestored(room, saved);
}

async function expandDetails(selector) {
  const details = page.locator(selector);
  if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
}

async function configurePosition(transform, expectError = false) {
  await expandDetails('#placement-tools');
  await expandDetails('#placement-tools > details');
  for (const [i, axis] of ['x', 'y', 'z'].entries()) {
    const input = page.locator('#edit-' + axis);
    if (await input.isEnabled()) await input.fill(String(transform.position[i]));
    else near(Number(await input.inputValue()), transform.position[i]);
  }
  const degrees = Math.round(transform.yaw * 180 / Math.PI + 360) % 360;
  const yaw = page.locator('#edit-yaw');
  if (await yaw.isEnabled()) await yaw.selectOption(String(degrees));
  else assert.equal(Number(await yaw.inputValue()), degrees);
  await page.locator('#edit-position').click();
  await ready(expectError);
}

async function checkPlacement(room, profile, ref, baseline, saved) {
  stage = room.id + ': reject the occupied desktop without changing the scene or save';
  const check = placementChecks[room.id];
  assert(check, 'Expected the authored placement QA coordinates');
  const blocked = node(saved.expected, check.target);
  assert(blocked && blocked.parentId === room.deskId, 'The blocker must be an actual existing tabletop object');
  const blocker = await page.evaluate(id => {
    const object = company.session.scene.root.getObjectByName(id);
    const meshes = [];
    object.children[0].traverse(mesh => { if (mesh.isMesh) meshes.push(mesh.userData.name || mesh.name); });
    return { object: object.name, meshes };
  }, check.target);
  assert(blocker.meshes.length);
  const conflict = { position: [...blocked.transform.position], yaw: baseline.plantNode.transform.yaw };
  const expected = { instance: room.plantId, messages: [] };
  expectedCollision = expected;
  try { await configurePosition(conflict, true); }
  finally { expectedCollision = undefined; }
  assert(expected.messages.some(message => message.includes(check.target)), 'The runtime must identify the actual phone blocker');
  const rejection = await page.locator('#edit-message').textContent();
  assert.match(rejection, /这块桌面已有设备.*原布置已保留/);
  assert.deepEqual(await current(), saved.expected);
  assert.equal(await readSave(room.id), saved.text);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const unchanged = await inspect(room, ref);
  assert.deepEqual(unchanged, baseline);
  const rejectionImage = await screenshot(room.id + '-collision-preserved.png');
  await coldReopen(room, profile, saved);
  assert.deepEqual(await inspect(room, ref), baseline);
  stage = room.id + ': clear desktop position and real parent motion through the workstation';
  const before = await current();
  const moved = { position: [...check.clear], yaw: baseline.plantNode.transform.yaw };
  assert.notDeepEqual(moved.position, baseline.plantNode.transform.position);
  await configurePosition(moved);
  before.revision++;
  node(before, room.plantId).transform = moved;
  assert.deepEqual(await current(), before);
  await selectPlant(room);
  const newPlant = await inspect(room, ref);
  const station = check.station;
  assert.notDeepEqual(node(before, check.mover).transform, station);
  await selectPlant(room, check.mover);
  await configurePosition(station);
  before.revision++;
  node(before, check.mover).transform = station;
  assert.deepEqual(await current(), before);
  await selectPlant(room);
  const after = await inspect(room, ref, true);
  assert.deepEqual(after.plantNode, newPlant.plantNode);
  assert.deepEqual(after.deskNode, newPlant.deskNode);
  assert.notDeepEqual(after.deskWorld, newPlant.deskWorld);
  assert.notDeepEqual(after.plantWorld, newPlant.plantWorld);
  after.plantLocal.forEach((value, index) => near(value, newPlant.plantLocal[index]));
  near(after.contactArea, newPlant.contactArea);
  const image = await screenshot(room.id + '-legally-moved-with-desk.png');
  const changed = await save(room, ref);
  await coldReopen(room, profile, changed);
  const { pixels, ...restoredShape } = after;
  assert.deepEqual(await inspect(room, ref), restoredShape);
  report.placement = { blocker, conflict, rejection, console: expected.messages, rejectionImage, priorSave: saved.saved.sha256,
    retainedAfterColdReopen: true, move: moved, movedWorkstation: { id: check.mover, transform: station },
    after, image, newSave: changed.saved };
}

async function addThroughInspector(room, profile) {
  stage = room.id + ': add and remove a plant through the furnished work-room inspector';
  const previous = await current(), text = await readSave(room.id);
  assert.deepEqual(JSON.parse(text).document, previous);
  const workRoom = room.floorId + '/work';
  const deskId = workRoom + '/desk';
  assert.equal(node(previous, workRoom)?.purpose, 'work');
  assert.equal(node(previous, deskId)?.parentId, workRoom);
  assert(!previous.nodes.some(item => item.parentId === deskId), 'Use the clean work desk as delivered');
  await page.locator('#room').selectOption(workRoom);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, workRoom);
  await ready();
  await page.locator('#tool-add').click();
  const branch = page.locator('#add-branch');
  const category = await branch.locator('option[value="plant-desktop-installation"]').textContent();
  assert.equal(category, '桌面盆栽');
  await branch.selectOption('plant-desktop-installation');
  const ref = looks[0];
  await page.locator('#add-look').selectOption(key(ref));
  await page.locator('#add-target').selectOption(deskId + ':desktop');
  await page.locator('#add-center').click();
  await ready();
  const withPlant = await current();
  const added = withPlant.nodes.filter(item => !node(previous, item.id));
  assert.equal(added.length, 1, 'Add must create one real facility');
  const plant = added[0];
  assert.equal(plant.parentId, deskId);
  assert.deepEqual(plant.resource, ref);
  assert.equal(withPlant.revision, previous.revision + 1);
  const temporary = { ...room, roomId: workRoom, deskId, plantId: plant.id };
  await selectPlant(temporary);
  const installed = await inspect(temporary, ref, true);
  const screenshotFile = await screenshot(room.id + '-work-room-add.png');
  await expandDetails('#placement-tools');
  await page.locator('#edit-remove').click();
  await ready();
  const restored = { ...previous, revision: previous.revision + 2 };
  assert.deepEqual(await current(), restored);
  assert.equal(await readSave(room.id), text);
  await coldReopen(room, profile, { expected: previous, text });
  assert.equal(await readSave(room.id), text);
  report.add = { category, workRoom, desktopTarget: deskId, installed, screenshotFile,
    removedThroughInspector: true, liveSaveSha256: sha(text), recoveredSavedLiveRoom: true };
}

async function verifyRoom(room) {
  stage = room.id + ': load live room';
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  await open(profile);
  await load(room);
  await selectPlant(room);
  const ref = room.plant.resource;
  const first = await inspect(room, ref);
  const entry = { key: room.id, source: room.file, sourceSha256: sha(room.bytes), initial: first, looks: [] };
  report.rooms.push(entry);
  const order = [...looks.filter(look => key(look) !== key(ref)), ref];
  const hashes = new Set();
  let saved, restored;
  for (const look of order) {
    stage = room.id + ': select and cold reopen ' + key(look);
    await choose(room, look);
    const presented = await inspect(room, look, true);
    assert.deepEqual(presented.mounting, first.mounting);
    assert.deepEqual(presented.plantWorld, first.plantWorld);
    assert.deepEqual(presented.camera, first.camera);
    assert(!hashes.has(presented.asset.sha256), 'The four styles must load distinct real assets');
    hashes.add(presented.asset.sha256);
    const image = await screenshot(room.id + '-' + look.id + '.png');
    saved = await save(room, look);
    await coldReopen(room, profile, saved);
    restored = await inspect(room, look);
    const { pixels, ...expected } = presented;
    assert.deepEqual(restored, expected);
    entry.looks.push({ ref: look, presented, image, saved: saved.saved, restored });
  }
  if (placementChecks[room.id]) {
    await checkPlacement(room, profile, ref, restored, saved);
    await addThroughInspector(room, profile);
  }
  await close();
}

async function finishClip(name) {
  const raw = await page.video().path();
  await close();
  const file = 'video/' + name + '.webm';
  await fs.rename(raw, path.join(out, file));
  const { size } = await fs.stat(path.join(out, file));
  assert(size > 0);
  return { file, bytes: size, playbackSpeed: 1 };
}

async function record(rooms) {
  stage = 'short normal-speed demonstration';
  const [home, rental] = rooms;
  const profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
  await open(profile, true);
  await load(home);
  await selectPlant(home);
  for (const ref of looks) {
    await choose(home, ref);
    await page.waitForTimeout(1400);
  }
  const last = looks.at(-1), saved = await save(home, last);
  await page.waitForTimeout(850);
  const first = await finishClip('01-four-looks-and-save');
  await open(profile, true);
  await readRestored(home, saved);
  await inspect(home, last);
  await page.waitForTimeout(1800);
  await load(rental);
  await selectPlant(rental);
  await page.waitForTimeout(2300);
  const second = await finishClip('02-cold-reopen-and-second-room');
  report.video = { clips: [first, second], coldRestartBetweenClips: true };
}

async function run() {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.mkdir(out);
  outputCreated = true;
  stage = 'resolve inputs';
  if (!batch) {
    manifest = JSON.parse(await fs.readFile(path.join(root, 'transfer-manifest.json')));
    assert.equal(manifest.schema, 'company-transfer');
    assert.equal(manifest.buildId, build);
    const lock = JSON.parse(await pinned('source/prototype/package-lock.json'));
    assert.equal(require('../../prototype/node_modules/three/package.json').version, lock.packages['node_modules/three'].version);
  }
  threeSource = await fs.readFile(path.join(__dirname, '../../prototype/node_modules/three/build/three.core.js'), 'utf8');
  const rooms = await Promise.all(['plant-home', 'plant-rental'].map(fixture));
  baseUrl = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  for (const room of rooms) await verifyRoom(room);
  assert(report.placement, 'Expected the accepted move, rejected collision and actual parent desk motion');
  if (recordRequested) await record(rooms);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({ timeout: 2000 }).catch(() => undefined);
    await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    await devServer?.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const exit = once(packageServer, 'exit');
      packageServer.kill();
      await exit;
    }
    if (outputCreated) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video?.clips }));
  }
});
