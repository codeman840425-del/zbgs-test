const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, batchResults, batchInput, outArg, ...options] = process.argv.slice(2);
if (!dist || !build || !batchResults || !batchInput || !outArg || options.length > 1 ||
    options.some(option => option !== '--record')) {
  throw new Error('Usage: node qa-dance-training-rooms.cjs DIST BUILD BATCH_RESULTS BATCH_INPUT_JSON OUT [--record]');
}

const out = path.resolve(outArg);
const record = options.includes('--record');
const viewport = { width: 1600, height: 1000 };
const report = {
  build,
  status: 'running',
  browser: 'Headless Chromium with SwiftShader',
  checks: [],
  browserErrors: [],
  video: { enabled: record, playbackSpeed: 1 },
};
let server, profile, context, page, glbResponses, stage;

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function idle() {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.notEqual(await status.getAttribute('data-error'), 'true', await status.textContent());
}

async function openBrowser(recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(15000);
  page = context.pages()[0] || await context.newPage();
  glbResponses = new Map();
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ stage, message: message.text() });
  });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('.glb')) glbResponses.set(pathname, response.status());
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

const browserDocument = () => page.evaluate(() => company.session.document);
const findNode = (document, id) => document.nodes.find(node => node.id === id);
const stored = id => page.evaluate(id => JSON.parse(company.session.readSavedText(id)), id);
const resourceKey = resource => resource.id + '@' + resource.version;

async function readFixtures() {
  const input = await readJson(batchInput);
  assert.equal(input.schema, 'company-batch');
  assert.equal(input.items.length, 2);
  const fixtures = [];
  for (const item of input.items) {
    const source = path.resolve(batchResults, item.key, 'save.json');
    const save = await readJson(source);
    assert.equal(save.schema, 'company-save');
    assert.equal(save.document.id, item.input.id);
    const roomId = item.trainingClearance.roomId;
    const room = findNode(save.document, roomId);
    assert.equal(room?.purpose, 'training');
    assert.equal(findNode(save.document, room.parentId)?.kind, 'floor');
    const operations = item.operations.filter(operation => operation.parentId === roomId);
    const mirror = operations.find(operation => operation.id === roomId + '/mirror');
    const background = operations.find(operation => operation.id === roomId + '/background');
    const rug = operations.find(operation => operation.id === roomId + '/rug');
    const floorFinish = item.operations.find(operation => (
      operation.type === 'set-surface-finish' && operation.id === roomId && operation.surface === 'floor'
    ));
    for (const operation of [mirror, background, rug]) {
      assert(operation);
      const facility = findNode(save.document, operation.id);
      assert.equal(facility?.parentId, roomId);
      assert.deepEqual(facility.resource, operation.resource);
      assert.deepEqual(facility.transform, operation.transform);
    }
    assert(floorFinish, 'Training room requires a floor finish');
    assert.deepEqual(room.finishes?.floor?.resource, floorFinish.finish.resource);
    fixtures.push({
      key: item.key, source, save, roomId, floorId: room.parentId, clearance: item.trainingClearance,
      mirrorId: mirror.id, backgroundId: background.id, rugId: rug.id, floorResource: floorFinish.finish.resource,
    });
  }
  assert.equal(new Set(fixtures.map(fixture => fixture.save.document.id)).size, 2);
  return fixtures;
}

async function importFile(fixture) {
  const menu = page.locator('.file-menu');
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import').click();
  const dialog = await chooser;
  assert.equal(await dialog.element().getAttribute('id'), 'file');
  await dialog.setFiles(fixture.source);
  await page.waitForFunction(id => company.session.document.id === id, fixture.save.document.id);
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await browserDocument(), fixture.save.document);
}

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

async function sceneEvidence(fixture, visible) {
  const before = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(frame => company.renderStatus().hostFrame > frame, before);
  const evidence = await page.evaluate(({ roomId, mirrorId, backgroundId, rugId }) => {
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
    const binding = scene.mirrorBindings().find(binding => binding.ownerId === mirrorId);
    const mirror = binding?.snapshot();
    const stats = mirrorController.snapshot();
    return {
      view: scene.view,
      floor,
      floorVisible: disposition(root.getObjectByName('Floor:' + roomId)),
      wallMode: scene.wallPresentation().effectiveMode,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
      mirror,
      reflection: { owner: stats.activeOwnerId, passes: stats.reflectionPasses, failures: stats.failures },
      meshes: { mirror: mounted(mirrorId), background: mounted(backgroundId), rug: mounted(rugId) },
      error: company.renderStatus().lastRenderError,
    };
  }, { roomId: fixture.roomId, mirrorId: fixture.mirrorId, backgroundId: fixture.backgroundId, rugId: fixture.rugId });
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
  assert.equal(content?.visible, visible, 'Background content must respond to the actual inspector state');
  assert(evidence.meshes.background.meshes.some(mesh => mesh.visible && mesh !== content), 'Background structure must remain visible');
  return evidence;
}

async function capture(fixture) {
  const presentation = await showTrainingRoom(fixture);
  const scene = await sceneEvidence(fixture, true);
  const file = fixture.key + '.png';
  await page.screenshot({ path: path.join(out, file) });
  return { file, presentation, scene };
}

async function saveChangedBackground(fixture) {
  const original = await browserDocument();
  await click('#tool-selection');
  await select('#edit-instance', fixture.backgroundId);
  const toggle = page.getByRole('button', { name: /^内容显示/ });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await toggle.click();
  await idle();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  original.revision++;
  findNode(original, fixture.backgroundId).state.visible = false;
  const changed = await browserDocument();
  assert.deepEqual(changed, original, 'Only background content state may change');
  const scene = await sceneEvidence(fixture, false);
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const envelope = await stored(changed.id);
  assert.deepEqual(envelope.document, changed);
  assert.deepEqual(envelope.dependencies, fixture.save.dependencies);
  return { envelope, scene };
}

async function recover(fixture, envelope) {
  await closeBrowser();
  await openBrowser();
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await browserDocument(), envelope.document);
  assert.deepEqual(await stored(envelope.document.id), envelope);
  const presentation = await showTrainingRoom(fixture);
  const scene = await sceneEvidence(fixture, false);
  const loadedGlbs = await page.evaluate(refs => refs.map(ref => {
    const asset = company.catalog.resources.find(resource => resource.id === ref.id && resource.version === ref.version).asset;
    return { ...ref, url: asset.url, sha256: asset.sha256 };
  }), [scene.meshes.mirror.resource, scene.meshes.background.resource, scene.meshes.rug.resource, fixture.floorResource]);
  for (const resource of loadedGlbs) {
    const pathname = new URL(resource.url, server.url).pathname;
    assert.equal(glbResponses.get(pathname), 200, 'No successful GLB load after reopening: ' + pathname);
    assert.match(resource.sha256, /^[a-f0-9]{64}$/);
    assert(envelope.dependencies.resources.some(pin => resourceKey(pin) === resourceKey(resource)));
  }
  return { presentation, scene, loadedGlbs };
}

async function check(name, action) {
  stage = name;
  const entry = { name, passed: false };
  report.checks.push(entry);
  entry.evidence = await action();
  entry.passed = true;
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  stage = 'load batch fixtures';
  const fixtures = await readFixtures();
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'fixed build startup';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser();
  const previousSaves = new Map();
  for (const fixture of fixtures) {
    await check('Import and view ' + fixture.key, async () => {
      await importFile(fixture);
      for (const [id, envelope] of previousSaves) assert.deepEqual(await stored(id), envelope);
      return { clearanceSpec: fixture.clearance, ...await capture(fixture) };
    });
    await check('Change, save and automatically recover ' + fixture.key, async () => {
      const { envelope, scene } = await saveChangedBackground(fixture);
      const restored = await recover(fixture, envelope);
      for (const [id, previous] of previousSaves) assert.deepEqual(await stored(id), previous);
      previousSaves.set(envelope.document.id, envelope);
      return { savedIdentity: envelope.document.id, revision: envelope.document.revision, changedScene: scene, restored };
    });
  }
  if (record) {
    await check('Record both training rooms in one normal-speed browser session', async () => {
      await closeBrowser();
      profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
      await openBrowser(true);
      for (const fixture of fixtures) {
        await importFile(fixture);
        await showTrainingRoom(fixture);
        await sceneEvidence(fixture, true);
        await page.waitForTimeout(1600);
      }
      const captured = await page.video().path();
      await closeBrowser();
      const file = path.join('video', 'dance-training-rooms-normal.webm');
      await fs.rename(captured, path.join(out, file));
      const { size } = await fs.stat(path.join(out, file));
      assert(size > 0);
      report.video.file = file;
      return { file, bytes: size };
    });
  }
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
  try {
    await closeBrowser();
    await server?.close();
  } catch (error) {
    report.cleanupError = error.message;
    report.status = 'failed';
    process.exitCode = 1;
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video.file }));
});
