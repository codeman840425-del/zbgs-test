const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, fixturesArg, outArg, ...flags] = process.argv.slice(2);
if (!dist || !build || !fixturesArg || !outArg || flags.length > 1 || flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-static-textiles.cjs DIST BUILD FIXTURES_JSON OUT [--record]');
}
const fixturesPath = path.resolve(fixturesArg);
const out = path.resolve(outArg);
const viewport = { width: 1600, height: 1000 };
const report = {
  build, status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], recording: { enabled: flags.length === 1, playbackSpeed: 1 },
};
const node = (doc, id) => doc.nodes.find(item => item.id === id);
const key = ref => ref.id + '@' + ref.version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readDocument = () => page.evaluate(() => company.session.document);
const readSaved = id => page.evaluate(id => company.session.readSavedText(id), id);
const finiteVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const quarterTurn = (a, b) => Math.abs(Math.cos(a - b)) < 1e-6;
const closeTo = (a, b, tolerance = 1e-5) => assert(Math.abs(a - b) <= tolerance, a + ' != ' + b);
let server, profile, context, page, requests, stage, expectedError;

// Fixture camera coordinates are room-local. Host moves use the layout's parent-local transform.
// Each save contains one matching textile, mounted to a named surface on a two-seat sofa.
async function readFixtures() {
  const contents = await fs.readFile(fixturesPath);
  const recipe = JSON.parse(contents);
  assert.equal(recipe.version, 1);
  assert.equal(recipe.looks?.length, 4);
  for (const ref of recipe.looks) {
    assert.match(ref?.id ?? '', /^[a-z][a-z0-9-]{0,62}$/);
    assert(Number.isSafeInteger(ref.version) && ref.version > 0);
  }
  assert.equal(new Set(recipe.looks.map(key)).size, 4);
  assert.equal(recipe.rooms?.length, 2);
  const rooms = [];
  for (const entry of recipe.rooms) {
    assert.match(entry?.key ?? '', /^[a-z][a-z0-9-]{0,39}$/);
    assert.equal(typeof entry.save, 'string');
    assert(finiteVector(entry.camera?.position) && finiteVector(entry.camera?.target));
    assert.notDeepEqual(entry.camera.position, entry.camera.target);
    assert(finiteVector(entry.moveHost?.position) && Number.isFinite(entry.moveHost.yaw));
    assert(Number.isInteger(entry.moveHost.yaw / (Math.PI / 2)) && entry.moveHost.yaw >= 0 && entry.moveHost.yaw < Math.PI * 2);
    const source = path.resolve(path.dirname(fixturesPath), entry.save);
    const bytes = await fs.readFile(source);
    const envelope = JSON.parse(bytes);
    assert.equal(envelope.schema, 'company-save');
    const doc = envelope.document;
    assert.equal(doc.schema, 'company-layout');
    const room = node(doc, entry.roomId);
    const host = node(doc, entry.hostId);
    const textile = node(doc, entry.textileId);
    assert.equal(room?.kind, 'room');
    assert.equal(node(doc, room.parentId)?.kind, 'floor');
    assert.equal(host?.kind, 'facility');
    assert.equal(host.parentId, room.id);
    assert.equal(textile?.kind, 'facility');
    assert.equal(textile.parentId, host.id);
    assert.equal(typeof textile.attachment?.surfaceId, 'string');
    assert(recipe.looks.some(ref => key(ref) === key(textile.resource)));
    assert(quarterTurn(host.transform.yaw, entry.moveHost.yaw), 'The authored host move must turn through a quarter-turn');
    assert.notDeepEqual(host.transform.position, entry.moveHost.position, 'The authored host move must change location');
    assert.equal(host.transform.position[1], entry.moveHost.position[1]);
    rooms.push({ ...entry, source, saveSha256: hash(bytes), doc, id: doc.id, floorId: room.parentId, host, textile });
  }
  assert.notEqual(rooms[0].key, rooms[1].key);
  assert.notEqual(rooms[0].id, rooms[1].id, 'The two fixtures must have separate persistent company identities');
  assert(quarterTurn(rooms[0].host.transform.yaw, rooms[1].host.transform.yaw), 'The rooms must exercise perpendicular sofa directions');
  report.fixtures = { source: fixturesPath, sha256: hash(contents), rooms: rooms.map(({ id, roomId, hostId, textileId, source, saveSha256 }) => (
    { id, roomId, hostId, textileId, source, saveSha256 }
  )) };
  return { refs: recipe.looks, rooms };
}

async function idle(rejected = false) {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    !document.querySelector('#mode-room').disabled && document.querySelector('#status').dataset.error !== undefined);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(rejected), await status.textContent());
}

async function openBrowser(record = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(record ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(20000);
  page = context.pages()[0] || await context.newPage();
  requests = new Map();
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('.glb')) requests.set(pathname, response);
  });
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (expectedError && value.includes('invalid-support-fit') && value.includes(expectedError.id)) expectedError.messages.push(value);
    else report.browserErrors.push({ stage, message: value });
  });
  await page.goto(server.url);
  await idle();
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
}

async function closeBrowser() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false);
  context = null;
  page = null;
}

async function click(selector) {
  await page.locator(selector).click();
  await idle();
}

async function select(selector, value) {
  await page.locator(selector).selectOption(value);
  await idle();
}

async function frame() {
  const before = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(before => company.renderStatus().hostFrame > before, before);
  assert.equal(await page.evaluate(() => company.renderStatus().lastRenderError), null);
}

async function importFixture(input) {
  const menu = page.locator('.file-menu');
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
  await picker.setFiles(input.source);
  await page.waitForFunction(id => company.session.document.id === id, input.id);
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await readDocument(), input.doc);
}

async function showRoom(input, refs) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== input.floorId) await select('#floor', input.floorId);
  if (view.mode !== 'room' || view.roomId !== input.roomId) await select('#room', input.roomId);
  await click('.view-toolbar [data-view="room"]');
  await click('#tool-selection');
  await select('#edit-instance', input.textileId);
  const appearance = page.locator('#edit-look');
  assert(await appearance.isVisible() && await appearance.isEnabled());
  const available = await appearance.locator('option').evaluateAll(items => items.map(item => item.value));
  for (const ref of refs) assert(available.includes(key(ref)), 'Missing selectable textile look ' + key(ref));
  await page.evaluate(({ roomId, camera: pose }) => {
    const { session, camera } = company;
    const room = session.scene.root.getObjectByName(roomId);
    const world = vector => room.localToWorld(camera.position.clone().fromArray(vector));
    camera.position.copy(world(pose.position));
    camera.lookAt(world(pose.target));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
  }, { roomId: input.roomId, camera: input.camera });
  await frame();
}

async function replaceLook(input, ref) {
  assert.equal(await page.locator('#edit-instance').inputValue(), input.textileId);
  if (await page.locator('#edit-look').inputValue() === key(ref)) return;
  const expected = await readDocument();
  expected.revision++;
  node(expected, input.textileId).resource = ref;
  await select('#edit-look', key(ref));
  assert.deepEqual(await readDocument(), expected, 'A look replacement may only change the textile resource and revision');
}

async function verifyAsset(asset) {
  const url = new URL(asset.url, server.url).pathname;
  const response = requests.get(url);
  assert.equal(response?.status(), 200, 'Expected actual browser GLB fetch ' + url);
  const bytes = await response.body();
  assert.equal(bytes.length, asset.bytes);
  assert.equal(hash(bytes), asset.sha256);
}

async function inspect(input, ref) {
  await frame();
  const actual = await page.evaluate(({ roomId, hostId, textileId }) => {
    const { session, camera } = company;
    const { scene, document: doc } = session;
    const find = id => doc.nodes.find(item => item.id === id);
    const resource = item => company.catalog.resources.find(ref => ref.id === item.resource.id && ref.version === item.resource.version);
    const hostNode = find(hostId), textileNode = find(textileId);
    const hostResource = resource(hostNode), textileResource = resource(textileNode);
    const room = scene.root.getObjectByName(roomId);
    const host = scene.root.getObjectByName(hostId);
    const textile = scene.root.getObjectByName(textileId);
    const supportId = textileNode.attachment.surfaceId;
    const support = hostResource.supportSurfaces.find(surface => surface.id === supportId);
    const supportMesh = host.getObjectByName(hostResource.supportNodes[supportId]);
    const visible = object => {
      for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (ancestor.visible === false) return false;
      return true;
    };
    if (!supportMesh?.isMesh || !visible(supportMesh) || !visible(textile)) throw new Error('Real textile and actual support mesh must be visible');
    scene.root.updateMatrixWorld(true);
    const inverse = host.matrixWorld.clone().invert();
    const vector = () => camera.position.clone();
    const collect = mesh => {
      const position = mesh.geometry.attributes.position;
      const matrix = inverse.clone().multiply(mesh.matrixWorld);
      return Array.from({ length: position.count }, (_, index) => vector().fromBufferAttribute(position, index).applyMatrix4(matrix));
    };
    const triangles = (mesh, vertices) => {
      const indices = mesh.geometry.index;
      const result = [];
      const vertex = index => vertices[indices ? indices.getX(index) : index];
      for (let index = 0; index < (indices?.count ?? vertices.length); index += 3) {
        result.push([vertex(index), vertex(index + 1), vertex(index + 2)]);
      }
      return result;
    };
    // Vertical line intersection against the actual triangles in the sofa frame.
    const heights = (faces, x, z) => {
      const hits = [];
      for (const [a, b, c] of faces) {
        const abX = b.x - a.x, abZ = b.z - a.z, acX = c.x - a.x, acZ = c.z - a.z;
        const determinant = abX * acZ - abZ * acX;
        if (Math.abs(determinant) < 1e-12) continue;
        const u = ((x - a.x) * acZ - (z - a.z) * acX) / determinant;
        const v = (abX * (z - a.z) - abZ * (x - a.x)) / determinant;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1 + 1e-5) hits.push(a.y + u * (b.y - a.y) + v * (c.y - a.y));
      }
      return hits;
    };
    const supportFaces = triangles(supportMesh, collect(supportMesh));
    const textileFaces = [], geometry = [], low = vector().setScalar(Infinity), high = vector().setScalar(-Infinity);
    const screenLow = low.clone(), screenHigh = high.clone();
    textile.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const vertices = collect(mesh);
      const faces = triangles(mesh, vertices);
      textileFaces.push(...faces);
      for (const vertex of vertices) {
        low.min(vertex);
        high.max(vertex);
        const ndc = vertex.clone().applyMatrix4(host.matrixWorld).project(camera);
        screenLow.min(ndc);
        screenHigh.max(ndc);
      }
      geometry.push({ name: mesh.userData.name || mesh.name, vertices: vertices.length, triangles: faces.length, positions: vertices });
    });
    const contacts = [];
    for (const mesh of geometry) {
      for (const point of mesh.positions.filter(point => Math.abs(point.y - support.topY) <= .001)) {
        const hit = heights(supportFaces, point.x, point.z).find(height => Math.abs(height - point.y) <= .001 && Math.abs(height - support.topY) <= .001);
        if (hit !== undefined) contacts.push({ textile: point.toArray(), supportY: hit });
      }
      delete mesh.positions;
    }
    const seats = scene.describeUsePoints({ floorId: room.parent?.name }).filter(point => point.facilityId === hostId).map(seat => {
      const runtime = scene.resolveUsePoint(seat.id);
      if (!runtime?.chairSeat?.isMesh || !runtime.chairBack?.isMesh || !visible(runtime.chairSeat) || !visible(runtime.chairBack)) {
        throw new Error('Both seat contact meshes must still be physically rendered');
      }
      const [x, , z] = seat.local.position;
      const seatFaces = triangles(runtime.chairSeat, collect(runtime.chairSeat));
      const hits = heights(seatFaces, x, z);
      const top = hits.length ? Math.max(...hits) : null;
      const textileCoversCenter = heights(textileFaces, x, z).some(y => y >= seat.seatHeight - .001);
      const world = runtime.chair.getWorldPosition(vector()).toArray();
      return { id: seat.id, capacity: seat.capacity, contact: seat.contact, local: seat.local, clearance: seat.clearance,
        seatHeight: seat.seatHeight, physicalTop: top, textileCoversCenter, world, expectedWorld: seat.transform.position,
        approach: seat.approachPosition, exit: seat.exitPosition,
        meshes: [runtime.chairSeat, runtime.chairBack].map(mesh => mesh.userData.name || mesh.name) };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return {
      view: scene.view, camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
      host: hostNode, textile: textileNode, hostAsset: hostResource.asset, asset: textileResource.asset,
      mounting: textileResource.mounting, mount: textileResource.mount, branch: textileResource.productionBranch,
      movingParts: (textileResource.movingParts || []).length,
      hostRole: hostResource.mountRole, actualParent: textile.parent.name, hostWorld: host.getWorldPosition(vector()).toArray(),
      textileWorld: textile.getWorldPosition(vector()).toArray(), expectedWorld: host.localToWorld(vector().fromArray(textileNode.transform.position)).toArray(),
      support, supportMesh: supportMesh.userData.name || supportMesh.name, contactCount: contacts.length, contacts: contacts.slice(0, 12),
      local: { min: low.toArray(), max: high.toArray() }, projected: { min: screenLow.toArray(), max: screenHigh.toArray() },
      geometry, seats,
    };
  }, { roomId: input.roomId, hostId: input.hostId, textileId: input.textileId });
  assert.equal(actual.view.roomId, input.roomId);
  assert.equal(actual.hostRole, 'sofa');
  assert.equal(actual.branch, 'static-textile');
  assert.equal(actual.mount, 'support-surface');
  assert.equal(actual.movingParts, 0);
  assert.equal(actual.actualParent, input.hostId);
  assert.deepEqual(actual.textile.resource, ref);
  assert.deepEqual(actual.textile.attachment, input.textile.attachment);
  assert.deepEqual(actual.textile.transform, input.textile.transform);
  for (const [index, world] of actual.textileWorld.entries()) closeTo(world, actual.expectedWorld[index]);
  assert(actual.geometry.length > 0 && actual.geometry.every(mesh => mesh.triangles > 0));
  assert(actual.contactCount > 0, 'At least one actual textile sole vertex must contact the actual support mesh');
  closeTo(actual.local.min[1], actual.support.topY, .001);
  const { center, halfSize, topY, clearanceHeight } = actual.support;
  for (const [index, axis] of [0, 2].entries()) {
    assert(actual.local.min[axis] >= center[index] - halfSize[index] - .001);
    assert(actual.local.max[axis] <= center[index] + halfSize[index] + .001);
  }
  assert(actual.local.max[1] <= topY + clearanceHeight + .001);
  const { min, max } = actual.projected;
  assert(min[0] > -.99 && min[1] > -.99 && max[0] < .99 && max[1] < .99 &&
    max[0] - min[0] > .06 && max[1] - min[1] > .026, 'The textile must be fully in frame and large enough to inspect');
  assert.equal(actual.seats.length, 2);
  assert.equal(new Set(actual.seats.map(seat => seat.meshes[0])).size, 2);
  assert.equal(new Set(actual.seats.map(seat => seat.meshes[1])).size, 2);
  for (const seat of actual.seats) {
    assert.equal(seat.capacity, 1);
    assert(finiteVector(seat.approach) && finiteVector(seat.exit));
    assert(Number.isFinite(seat.physicalTop));
    closeTo(seat.physicalTop, seat.seatHeight, .003);
    assert.equal(seat.textileCoversCenter, false, 'A textile crosses the actual seat center');
    for (const [axis, value] of seat.world.entries()) closeTo(value, seat.expectedWorld[axis]);
  }
  await verifyAsset(actual.asset);
  await verifyAsset(actual.hostAsset);
  return actual;
}

async function save(input, ref) {
  const document = await readDocument();
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await readSaved(input.id);
  const envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, document);
  const pins = [ref, input.host.resource].map(expected => envelope.dependencies.resources.find(pin => key(pin) === key(expected)));
  for (const pin of pins) assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  return { document, text, pins };
}

async function reopen(input, refs, saved) {
  await closeBrowser();
  await openBrowser();
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await readDocument(), saved.document);
  assert.equal(await readSaved(input.id), saved.text);
  await showRoom(input, refs);
}

async function screenshot(file) {
  await frame();
  await page.screenshot({ path: path.join(out, file) });
  return file;
}

async function check(name, action) {
  stage = name;
  const entry = { name, passed: false };
  report.checks.push(entry);
  entry.evidence = await action();
  entry.passed = true;
}

async function checkLooks(input, refs) {
  await importFixture(input);
  await showRoom(input, refs);
  const order = [...refs.filter(ref => key(ref) !== key(input.textile.resource)), input.textile.resource];
  const hashes = new Set();
  let first, last;
  for (const ref of order) {
    await check(input.key + ' · real support, seats, save and reopen ' + key(ref), async () => {
      await replaceLook(input, ref);
      const actual = await inspect(input, ref);
      first ??= actual;
      for (const field of ['host', 'camera', 'mounting', 'textileWorld', 'support', 'supportMesh', 'seats']) {
        assert.deepEqual(actual[field], first[field]);
      }
      assert(!hashes.has(actual.asset.sha256), 'Two looks loaded the same GLB bytes');
      hashes.add(actual.asset.sha256);
      const file = await screenshot(input.key + '-' + ref.id + '-v' + ref.version + '.png');
      const saved = await save(input, ref);
      await reopen(input, refs, saved);
      assert.deepEqual(await inspect(input, ref), actual);
      last = { ref, actual };
      return { file, actual, pins: saved.pins, savedSha256: hash(saved.text), browserRestarted: true };
    });
  }
  return last;
}

async function openPositionTools() {
  for (const selector of ['#placement-tools', '#placement-tools > details']) {
    const details = page.locator(selector);
    if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
  }
}

async function moveHost(input, refs, previous) {
  const { ref, actual: before } = previous;
  await select('#edit-instance', input.hostId);
  await openPositionTools();
  await page.locator('#edit-x').fill(String(input.moveHost.position[0]));
  await page.locator('#edit-z').fill(String(input.moveHost.position[2]));
  await page.locator('#edit-yaw').selectOption(String(Math.round(input.moveHost.yaw * 180 / Math.PI)));
  const expected = await readDocument();
  expected.revision++;
  node(expected, input.hostId).transform = input.moveHost;
  await click('#edit-position');
  assert.deepEqual(await readDocument(), expected, 'Only the sofa transform and revision should change');
  await select('#edit-instance', input.textileId);
  const after = await inspect(input, ref);
  assert.notDeepEqual(after.textileWorld, before.textileWorld, 'Mounted textile must follow the parent move');
  assert.deepEqual(after.textile, before.textile);
  assert.deepEqual(after.camera, before.camera);
  for (const [index, seat] of after.seats.entries()) {
    const old = before.seats[index];
    for (const field of ['id', 'local', 'capacity', 'contact', 'seatHeight', 'meshes', 'clearance']) assert.deepEqual(seat[field], old[field]);
    assert.notDeepEqual(seat.world, old.world);
  }
  const movedImage = await screenshot(input.key + '-moved.png');
  const saved = await save(input, ref);
  await reopen(input, refs, saved);
  assert.deepEqual(await inspect(input, ref), after);
  return { actual: after, saved, movedImage, ref };
}

async function rejectOverhang(input, refs, moved) {
  await openPositionTools();
  const { actual, saved, ref } = moved;
  const badX = actual.support.center[0] + actual.support.halfSize[0] + .2;
  await page.evaluate(({ hostId, textileId }) => {
    const root = company.session.scene.root;
    window.qaTextileScene = [root, root.getObjectByName(hostId), root.getObjectByName(textileId)];
  }, { hostId: input.hostId, textileId: input.textileId });
  expectedError = { id: input.textileId, messages: [] };
  let file, message;
  try {
    await page.locator('#edit-x').fill(String(badX));
    await page.locator('#edit-position').click();
    await idle(true);
    assert.equal(await page.locator('#edit-message').getAttribute('data-error'), 'true');
    assert.equal(expectedError.messages.length, 1, 'Expected invalid-support-fit from the control');
    message = await page.locator('#edit-message').textContent();
    assert.match(message, /承载面/);
    assert(await page.evaluate(({ hostId, textileId }) => {
      const root = company.session.scene.root;
      const current = [root, root.getObjectByName(hostId), root.getObjectByName(textileId)];
      return current.every((object, index) => object === window.qaTextileScene[index]);
    }, { hostId: input.hostId, textileId: input.textileId }));
    assert.deepEqual(await readDocument(), saved.document);
    assert.equal(await readSaved(input.id), saved.text);
    assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
    assert.deepEqual(await inspect(input, ref), actual);
    await page.locator('#edit-message').scrollIntoViewIfNeeded();
    file = await screenshot(input.key + '-overhang-refused.png');
  } finally {
    expectedError = null;
    await page.evaluate(() => { delete window.qaTextileScene; });
  }
  await reopen(input, refs, saved);
  assert.deepEqual(await inspect(input, ref), actual);
  return { code: 'invalid-support-fit', badX, message, file, savedSha256: hash(saved.text), browserRestarted: true };
}

async function recordRooms(rooms, refs) {
  await closeBrowser();
  profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
  await openBrowser(true);
  for (const [index, input] of rooms.entries()) {
    await importFixture(input);
    await showRoom(input, refs);
    for (const ref of index === 0 ? refs : [input.textile.resource]) {
      await replaceLook(input, ref);
      await frame();
      await page.waitForTimeout(index === 0 ? 1900 : 2700);
    }
  }
  const raw = await page.video().path();
  await closeBrowser();
  const file = 'video/static-textiles-normal.webm';
  await fs.rename(raw, path.join(out, file));
  const { size } = await fs.stat(path.join(out, file));
  assert(size > 0);
  report.recording.file = file;
  return { file, bytes: size, comparison: refs, secondRoomLook: rooms[1].textile.resource };
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  stage = 'read two saved textile rooms';
  const { refs, rooms } = await readFixtures();
  stage = 'start isolated build';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html', port: 0 });
  report.sourceDigest = server.info.sourceDigest;
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  await openBrowser();
  for (const input of rooms) {
    stage = input.key + ' · import and select';
    const finalLook = await checkLooks(input, refs);
    let moved;
    await check(input.key + ' · move and turn the sofa with the attached textile and preserved seats', async () => {
      moved = await moveHost(input, refs, finalLook);
      return { image: moved.movedImage, actual: moved.actual, browserRestarted: true };
    });
    await check(input.key + ' · refuse an unsupported offset and keep the scene and saved data', () => rejectOverhang(input, refs, moved));
  }
  if (report.recording.enabled) await check('record the comparison and second room at normal speed', () => recordRooms(rooms, refs));
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({ timeout: 1500 }).catch(() => undefined);
    await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  for (const cleanup of [closeBrowser, () => server?.close()]) {
    try { await cleanup(); }
    catch (error) {
      report.cleanupError = error.message;
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ build, status: report.status, output: out, video: report.recording.file }));
});
