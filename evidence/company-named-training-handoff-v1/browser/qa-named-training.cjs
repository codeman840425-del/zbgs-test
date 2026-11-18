const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { chromium } = require('../../../prototype/node_modules/playwright');


const [packageArg, build, proofArg, outputArg, ...flags] = process.argv.slice(2);
if (!packageArg || !/^[a-f0-9]{12}$/.test(build) || !proofArg || !outputArg || flags.length > 1 ||
    flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-named-training.cjs PACKAGE BUILD CLI_PROOF NEW_OUT [--record]');
}
const root = path.resolve(packageArg), proof = path.resolve(proofArg), out = path.resolve(outputArg);
const keys = ['rental-training-room', 'upper-floor-training-room'];
const viewport = { width: 1600, height: 1000 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFile(path.join(root, file));
const find = (document, id) => document.nodes.find(node => node.id === id);
const report = { build, status: 'running', rooms: [], browserErrors: [],
  scope: 'Packaged room browser rendering and save reopening. Clearance rejections come from the pinned packaged CLI test receipt.' };
let manifest, packageServer, baseUrl, context, page, responses, stage, created;

async function pinned(file) {
  const bytes = await fs.readFile(path.join(root, file));
  const pin = manifest.files.find(item => item.path === file);
  assert.equal(bytes.length, pin?.bytes, file);
  assert.equal(sha(bytes), pin.sha256, file);
  return bytes;
}

async function serve() {
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

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(20000);
  context.setDefaultNavigationTimeout(30000);
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', event => {
    if (event.type() === 'error') report.browserErrors.push({ stage, message: event.text() });
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
  assert.equal(runtime.sourceDigest, manifest.sourceDigest);
}

const idle = ready;
async function click(selector) { await page.locator(selector).click(); await idle(); }
async function select(selector, value) { await page.locator(selector).selectOption(value); await idle(); }

async function orbitRoom(pixels, zoomDelta) {
  const box = await page.locator('#stage canvas').boundingBox();
  assert(box, 'Room preview canvas is missing');
  const x = box.x + box.width * 0.58;
  const y = box.y + box.height * 0.52;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pixels, y, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, zoomDelta);
}

async function showTrainingRoom(fixture) {
  const view = await page.evaluate(() => company.session.scene.view);
  const entry = [];
  if (view.mode === 'building') {
    const facade = page.locator('.company-building-view__facade');
    if (await facade.isVisible()) await facade.click();
    await click('.company-building-view__floor[data-floor-id=' + JSON.stringify(fixture.floorId) + ']');
    entry.push('building facade', 'floor section');
  } else if (view.floorId !== fixture.floorId) {
    await select('#floor', fixture.floorId);
    entry.push('floor selector');
  }
  await select('#room', fixture.roomId);
  await page.waitForFunction(roomId => company.session.scene.view.roomId === roomId, fixture.roomId);
  await click('.view-toolbar [data-view="room"]');
  await select('#wall-view', 'cutaway');
  // The rental room mounts its mirror and background on opposing walls.
  const orbitPixels = fixture.key === 'rental-training-room' ? -131 : 0;
  const zoomDelta = orbitPixels ? -250 : 0;
  if (orbitPixels) await orbitRoom(orbitPixels, zoomDelta);
  return { entry: [...entry, 'room selector', 'room panorama'], orbitPixels, zoomDelta, wallMode: 'cutaway' };
}

async function sceneEvidence(fixture, expected) {
  const before = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(frame => company.renderStatus().hostFrame > frame, before);
  const evidence = await page.evaluate(({ roomId, mirrorId, backgroundId, rugId, portalId }) => {
    const { session, camera, mirrorController } = company;
    const scene = session.scene;
    const root = scene.root;
    const floor = scene.surfacePresentation().find(entry => entry.regionId === roomId && entry.surface === 'floor');
    const disposition = object => {
      for (let n = object; n; n = n.parent) if (n.visible === false) return false;
      return Boolean(object);
    };
    const mounted = id => {
      const object = root.getObjectByName(id);
      const node = session.document.nodes.find(node => node.id === id);
      const resource = company.catalog.resources.find(entry => entry.id === node.resource.id && entry.version === node.resource.version);
      const meshes = [];
      object?.traverse(mesh => {
        if (mesh.isMesh && mesh.geometry?.attributes.position?.count) {
          meshes.push({ name: mesh.userData.name || mesh.name, visible: disposition(mesh) });
        }
      });
      return { resource: node.resource, asset: resource.asset, meshes };
    };
    const navigation = scene.navigation();
    const connection = navigation.connections.find(item => item.id === portalId);
    const portal = [connection?.from, connection?.to, ...navigation.exteriorEntrances.filter(item => item.id === portalId)]
      .find(item => item?.regionId === roomId || item?.roomId === roomId);
    const binding = scene.mirrorBindings().find(binding => binding.ownerId === mirrorId);
    const mirror = binding?.snapshot();
    const stats = mirrorController.snapshot();
    return {
      view: scene.view,
      portal,
      openingInView: scene.wallPresentation().walls.filter(wall => wall.region === roomId && wall.visible).map(wall => wall.edge),
      floor,
      floorVisible: disposition(root.getObjectByName('Floor:' + roomId)),
      wallMode: scene.wallPresentation().effectiveMode,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
      mirror,
      reflection: { owner: stats.activeOwnerId, passes: stats.reflectionPasses, failures: stats.failures },
      meshes: { mirror: mounted(mirrorId), background: mounted(backgroundId), rug: mounted(rugId) },
      error: company.renderStatus().lastRenderError,
    };
  }, { roomId: fixture.roomId, mirrorId: fixture.mirrorId, backgroundId: fixture.backgroundId, rugId: fixture.rugId, portalId: fixture.clearance.entry.portalId });
  assert.equal(evidence.error, null);
  assert.equal(evidence.view.mode, 'room');
  assert.equal(evidence.view.roomId, fixture.roomId);
  assert.equal(evidence.view.floorId, fixture.floorId);
  assert(evidence.floorVisible);
  assert.deepEqual(evidence.floor?.resource, fixture.floorResource);
  assert(evidence.floor.textureSize.every(size => size > 0), 'Wood floor must have a decoded texture');
  assert(evidence.mirror?.active && evidence.mirror.fresh, 'Mirror did not reflect from the selected room view: ' + JSON.stringify(evidence.camera));
  assert.equal(evidence.reflection.owner, fixture.mirrorId);
  assert(evidence.reflection.passes > 0);
  assert.equal(evidence.reflection.failures, 0);
  assert(evidence.meshes.mirror.meshes.some(mesh => mesh.visible));
  assert(evidence.meshes.rug.meshes.some(mesh => mesh.visible));
  const content = evidence.meshes.background.meshes.find(mesh => mesh.name === 'background-content');
  assert.equal(content?.visible, true, 'Actual imported background artwork must be visible');
  assert.deepEqual(evidence.meshes.background.resource, expected);
  assert(evidence.portal && evidence.portal.width >= 1, 'Expected the actual connected doorway on this room');
  assert(evidence.meshes.background.meshes.some(mesh => mesh.visible && mesh !== content), 'Background structure must remain visible');
  return evidence;
}


async function readFixtures() {
  const receipt = JSON.parse(await fs.readFile(path.join(proof, 'report.json')));
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.buildId, build);
  assert.equal(receipt.sourceFilesPreserved['transfer-manifest.json'], report.manifestSha256,
    'The CLI proof must come from the same sealed package');
  const expected = JSON.parse(await fs.readFile(path.join(proof, 'fixtures', 'expected.json')));
  return Promise.all(keys.map(async key => {
    const location = 'data/rooms/' + key + '/save.json';
    const originalBytes = await pinned(location);
    assert.equal(sha(originalBytes), receipt.sourceFilesPreserved[location]);
    const original = JSON.parse(originalBytes);
    const cli = receipt.namedRooms.find(item => item.key === key);
    const fixture = expected.find(item => item.key === key);
    const editedFolder = path.join(proof, key, 'first-edit');
    const editedFile = path.join(editedFolder, 'save.json');
    const editedBytes = await fs.readFile(editedFile);
    const edited = JSON.parse(editedBytes);
    const guard = JSON.parse(await fs.readFile(path.join(editedFolder, 'training-edit.json')));
    assert.equal(guard.schema, 'training-room-edit@1');
    assert.equal(sha(editedBytes), guard.saveSha256);
    assert.equal(sha(editedBytes), cli.edited[0].sha256);
    assert.equal(original.schema, 'company-save');
    assert.equal(edited.schema, 'company-save');
    assert.equal(original.document.id, fixture.companyId);
    assert.equal(edited.document.id, fixture.companyId);
    assert.equal(guard.companyId, fixture.companyId);
    assert.deepEqual(guard.trainingClearance, fixture.trainingClearance);
    const roomId = guard.trainingClearance.roomId, backgroundId = roomId + '/background';
    const room = find(original.document, roomId);
    const before = find(original.document, backgroundId), after = find(edited.document, backgroundId);
    assert.equal(room.purpose, 'training');
    assert.equal(before.parentId, roomId);
    assert.deepEqual(before.resource, fixture.initialResource);
    assert.deepEqual(before.transform, fixture.initialTransform);
    assert.notDeepEqual(before.resource, after.resource);
    assert.notDeepEqual(before.transform, after.transform);
    assert.equal(after.resource.id, key === keys[0] ? 'background-brand-panel' : 'background-grid-panel');
    const unchanged = structuredClone(original.document);
    unchanged.revision++;
    Object.assign(find(unchanged, backgroundId), { resource: after.resource, transform: after.transform });
    assert.deepEqual(edited.document, unchanged);
    assert.equal(cli.edited[0].revision, edited.document.revision);
    for (const phase of ['initial', 'after-edit']) {
      for (const region of ['activity', 'entry']) {
        const failure = cli.failures.find(item => item.step === phase && item.region === region);
        assert.equal(failure?.code, 'training-clearance-obstructed');
        assert.equal(failure?.path, backgroundId);
        const attempted = path.join(proof, key, 'rejected-' + (phase === 'after-edit' ? 'after-edit-' : '') + region);
        await assert.rejects(fs.stat(attempted), { code: 'ENOENT' });
      }
    }
    return { key, original, originalBytes, edited, editedFile, editedSha256: guard.saveSha256,
      before, after, location, cli, clearance: guard.trainingClearance,
      roomId, floorId: room.parentId, mirrorId: roomId + '/mirror', backgroundId, rugId: roomId + '/rug',
      floorResource: room.finishes.floor.resource };
  }));
}

async function openNamed(fixture) {
  const url = new URL(baseUrl);
  url.searchParams.set('delivery', fixture.key);
  await visit(url);
  const response = responses.get('/delivery-room/' + fixture.key + '.json');
  assert.equal(response?.status(), 200);
  assert(fixture.originalBytes.equals(await response.body()));
  assert.deepEqual(await current(), fixture.original.document);
}

async function openEdited(fixture) {
  const details = page.locator('.file-menu');
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import').click();
  const dialog = await chooser;
  assert.equal(await dialog.element().getAttribute('id'), 'file');
  await dialog.setFiles(fixture.editedFile);
  await page.waitForFunction(revision => company.session.document.revision === revision, fixture.edited.document.revision);
  await ready();
  if (await details.evaluate(element => element.open)) await details.locator('summary').click();
  assert.deepEqual(await current(), fixture.edited.document);
}

async function showEntry(fixture) {
  const evidence = await page.evaluate(({ roomId, portalId, isRental }) => {
    const { session, camera } = company;
    const { scene } = session;
    const room = scene.root.getObjectByName(roomId);
    const local = point => room.localToWorld(camera.position.clone().fromArray(point));
    const positions = isRental ? [[1.38, 3.15, .7], [-1.5, .58, 0]] : [[-1.05, 3.4, -.78], [0, .58, 2.35]];
    camera.position.copy(local(positions[0]));
    camera.lookAt(local(positions[1]));
    camera.updateMatrixWorld(true);
    scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
    const topology = scene.navigation();
    const connection = topology.connections.find(item => item.id === portalId);
    const opening = [connection?.from, connection?.to, ...topology.exteriorEntrances.filter(item => item.id === portalId)]
      .find(item => item?.regionId === roomId || item?.roomId === roomId);
    const walls = scene.wallPresentation().walls.filter(wall => wall.region === roomId && wall.edge === opening?.edge);
    const center = camera.position.clone().fromArray(opening.local.center);
    center.y = .4;
    const projected = room.localToWorld(center).project(camera).toArray();
    return { portalId, opening, walls, projected, camera: camera.position.toArray(), lastRenderError: company.renderStatus().lastRenderError };
  }, { roomId: fixture.roomId, portalId: fixture.clearance.entry.portalId, isRental: fixture.key === keys[0] });
  assert.equal(evidence.lastRenderError, null);
  assert(evidence.walls.filter(wall => wall.visible).length >= 2, 'The real doorway jambs must remain in the entry view');
  assert(evidence.projected.slice(0, 2).every(value => Math.abs(value) < 1));
  return evidence;
}

async function pinAssets(scene) {
  for (const { asset } of Object.values(scene.meshes)) {
    const response = responses.get(asset.url);
    assert.equal(response?.status(), 200, 'Missing GLB response for ' + asset.url);
    const bytes = await pinned('viewer' + asset.url);
    assert.equal(sha(bytes), asset.sha256);
    assert(bytes.equals(await response.body()));
  }
}

async function shot(key, stage) {
  await page.evaluate(() => company.drawHostFrame());
  const file = key + '-' + stage + '.png';
  await page.screenshot({ path: path.join(out, file) });
  return file;
}

async function verifyRoom(fixture) {
  stage = fixture.key + ': delivered named room';
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  await open(profile);
  await openNamed(fixture);
  const entry = { key: fixture.key, protectedPortal: fixture.clearance.entry.portalId, clearance: fixture.clearance,
    sourceSha256: sha(fixture.originalBytes), legalSaveSha256: fixture.editedSha256,
    verifiedCliRejections: fixture.cli.failures, frames: {} };
  report.rooms.push(entry);
  await showTrainingRoom(fixture);
  entry.delivered = await sceneEvidence(fixture, fixture.before.resource);
  await pinAssets(entry.delivered);
  entry.frames.delivered = await shot(fixture.key, 'delivered');
  stage = fixture.key + ': released CLI output';
  await openEdited(fixture);
  await showTrainingRoom(fixture);
  entry.changed = await sceneEvidence(fixture, fixture.after.resource);
  await pinAssets(entry.changed);
  entry.frames.changed = await shot(fixture.key, 'safe-edit');
  entry.door = await showEntry(fixture);
  entry.frames.entry = await shot(fixture.key, 'open-entry');
  stage = fixture.key + ': save and reopen the accepted company';
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await readSave(fixture.edited.document.id);
  assert.deepEqual(JSON.parse(text).document, fixture.edited.document);
  await close();
  await open(profile);
  await visit(baseUrl);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  assert.deepEqual(await current(), fixture.edited.document);
  assert.equal(await readSave(fixture.edited.document.id), text);
  await showTrainingRoom(fixture);
  entry.restored = await sceneEvidence(fixture, fixture.after.resource);
  assert(fixture.originalBytes.equals(await pinned(fixture.location)));
  assert.equal(sha(await fs.readFile(fixture.editedFile)), fixture.editedSha256);
  await close();
}

async function record(fixtures) {
  stage = 'normal speed recording of both named rooms';
  const profile = await fs.mkdtemp(path.join(out, 'record-profile-'));
  await open(profile, true);
  for (const fixture of fixtures) {
    await openNamed(fixture);
    await showTrainingRoom(fixture);
    await page.waitForTimeout(1800);
    await openEdited(fixture);
    await showTrainingRoom(fixture);
    await page.waitForTimeout(2000);
    await showEntry(fixture);
    await page.waitForTimeout(1500);
  }
  const raw = await page.video().path();
  await close();
  const file = 'video/named-training-rooms-normal.webm';
  await fs.rename(raw, path.join(out, file));
  const { size } = await fs.stat(path.join(out, file));
  assert(size > 0);
  report.video = { file, bytes: size, playbackSpeed: 1 };
}

async function run() {
  await fs.mkdir(out);
  created = true;
  stage = 'sealed inputs and CLI proof';
  const manifestBytes = await read('transfer-manifest.json');
  manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'company-transfer');
  assert.equal(manifest.buildId, build);
  report.sourceDigest = manifest.sourceDigest;
  report.manifestSha256 = sha(manifestBytes);
  const fixtures = await readFixtures();
  baseUrl = await serve();
  for (const fixture of fixtures) await verifyRoom(fixture);
  if (flags.includes('--record')) await record(fixtures);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) await shot('failure', 'browser').catch(() => {});
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const exit = once(packageServer, 'exit');
      packageServer.kill();
      await exit;
    }
    if (created) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video?.file }));
  }
});
