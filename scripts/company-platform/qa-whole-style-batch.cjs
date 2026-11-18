const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');

const [deliveryArg, outArg, ...options] = process.argv.slice(2);
if (!deliveryArg || !outArg || options.length > 1 || options.some(option => option !== '--record')) {
  throw new Error('Usage: node qa-whole-style-batch.cjs DELIVERY_ROOT OUTPUT [--record]');
}
const delivery = path.resolve(deliveryArg);
const out = path.resolve(outArg);
const record = options.includes('--record');
const viewport = { width: 1600, height: 1000 };
const scenarios = [
  {
    alias: 'warm-home', floorIndex: 0, floorFinish: 'floor-offset-plank@1', wallFinish: 'wall-fine-stripes@1',
    parts: {
      desk: 'desk-trestle@1', monitor: 'monitor-aurora@1', keyboard: 'keyboard-compact@1',
      microphone: 'desk-microphone-ball@1', chair: 'chair-cantilever@1', 'fill-light': 'fill-light-orbit@1',
    },
  },
  {
    alias: 'cool-studios', floorIndex: 1, floorFinish: 'floor-checker-tile@1', wallFinish: 'wall-diamond-grid@1',
    parts: {
      desk: 'desk-frame@1', monitor: 'monitor-slate@1', keyboard: 'keyboard-console@1',
      microphone: 'desk-microphone-capsule@1', chair: 'chair-crossbeam@1', 'fill-light': 'fill-light-panel@1',
    },
  },
];
const report = {
  status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], video: { enabled: record, playbackSpeed: 1 },
};
let server, serverStopped, serverLog, url, build, context, profile, page, responses, stage;

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refKey = ref => ref.id + '@' + ref.version;
const find = (document, id) => document.nodes.find(node => node.id === id);
const browserDocument = () => page.evaluate(() => company.session.document);
const stored = id => page.evaluate(id => company.session.readSavedText(id), id);
const readJson = async relative => JSON.parse(await fs.readFile(path.join(delivery, relative), 'utf8'));

async function readScenarios() {
  const manifest = await readJson('transfer-manifest.json');
  const info = await readJson('viewer/company-build-info.json');
  build = info.shortId;
  assert.match(build, /^[a-f0-9]{12}$/);
  report.build = build;
  report.sourceDigest = info.sourceDigest;
  const results = [];
  for (const scenario of scenarios) {
    const relative = 'data/rooms/' + scenario.alias + '/save.json';
    const bytes = await fs.readFile(path.join(delivery, relative));
    const pin = manifest.files.find(file => file.path === relative);
    assert.equal(pin?.sha256, hash(bytes));
    assert.equal(pin?.bytes, bytes.length);
    const envelope = JSON.parse(bytes);
    assert.equal(envelope.schema, 'company-save');
    const document = envelope.document;
    const floors = document.nodes.filter(node => node.kind === 'floor')
      .sort((a, b) => a.transform.position[1] - b.transform.position[1]);
    const floor = floors[scenario.floorIndex];
    assert(floor, scenario.alias + ' does not contain the required floor');
    const rooms = document.nodes.filter(node => node.kind === 'room' && node.parentId === floor.id && node.purpose === 'streaming');
    const room = rooms.find(room => document.nodes.some(node => node.kind === 'workstation' && node.parentId === room.id));
    assert(room, 'No streaming workstation in the required floor of ' + scenario.alias);
    const station = document.nodes.find(node => node.kind === 'workstation' && node.parentId === room.id);
    const partNodes = {};
    for (const [key, reference] of Object.entries(scenario.parts)) {
      const part = document.nodes.find(node => node.stationId === station.id && node.partKey === key);
      assert(part, 'Missing station part ' + key + ' in ' + scenario.alias);
      assert.equal(refKey(part.resource), reference);
      partNodes[key] = part;
    }
    for (const side of ['north', 'south', 'east', 'west']) {
      assert.equal(refKey(room.finishes?.[side]?.resource ?? {}), scenario.wallFinish);
    }
    assert.equal(refKey(room.finishes?.floor?.resource ?? {}), scenario.floorFinish);
    results.push({ ...scenario, bytes, relative, envelope, floor, room, station, partNodes });
  }
  assert.notEqual(results[0].envelope.document.id, results[1].envelope.document.id, 'Style variants require independent company identities');
  return results;
}

async function openDeliveryServer() {
  serverLog = { stdout: '', stderr: '' };
  server = spawn(process.execPath, [path.join(delivery, 'serve.mjs'), '0'], {
    cwd: delivery, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverStopped = new Promise(resolve => server.once('close', resolve));
  server.stderr.on('data', chunk => { serverLog.stderr += chunk; });
  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Delivery server did not print its local URL')), 15000);
    const finish = (error, address) => {
      clearTimeout(timer);
      server.removeListener('error', onError);
      server.removeListener('exit', onExit);
      server.stdout.removeListener('data', onData);
      if (error) reject(error); else resolve(address);
    };
    const onError = error => finish(error);
    const onExit = code => finish(new Error('Delivery server exited early with code ' + code));
    const onData = chunk => {
      serverLog.stdout += chunk;
      const found = serverLog.stdout.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);
      if (found) finish(null, found[0]);
    };
    server.on('error', onError);
    server.on('exit', onExit);
    server.stdout.on('data', onData);
  });
}

async function idle() {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'false', await status.textContent());
}

async function launchBrowser(recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(15000);
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('.glb') || pathname.startsWith('/delivery-room/')) responses.set(pathname, response);
  });
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ stage, message: message.text() });
  });
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

async function openPackaged(scenario) {
  responses.clear();
  const address = new URL(url);
  address.searchParams.set('delivery', scenario.alias);
  await page.goto(address.href);
  await page.waitForFunction(id => window.company?.session.document.id === id, scenario.envelope.document.id);
  await idle();
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
  assert.deepEqual(await browserDocument(), scenario.envelope.document);
  const response = responses.get('/delivery-room/' + scenario.alias + '.json');
  assert.equal(response?.status(), 200);
  assert.equal(hash(await response.body()), hash(scenario.bytes));
}

async function frame() {
  const previous = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(value => company.renderStatus().hostFrame > value, previous);
  assert.equal(await page.evaluate(() => company.renderStatus().lastRenderError), null);
}

async function showRoom(scenario, { captureFloor = false } = {}) {
  const view = await page.evaluate(() => company.session.scene.view);
  const entry = [];
  let floorImage;
  if (view.mode === 'building') {
    const facade = page.locator('.company-building-view__facade');
    if (await facade.isVisible()) await facade.click();
    await click('.company-building-view__floor[data-floor-id=' + JSON.stringify(scenario.floor.id) + ']');
    entry.push('building facade', 'select floor in section');
  } else if (view.floorId !== scenario.floor.id) {
    await select('#floor', scenario.floor.id);
    entry.push('floor selector');
  }
  if (captureFloor) floorImage = await shot(scenario.alias + '-floor.png');
  if (await page.evaluate(() => company.session.scene.view.roomId) !== scenario.room.id) {
    await select('#room', scenario.room.id);
    entry.push('room selector');
  }
  await page.waitForFunction(id => company.session.scene.view.roomId === id, scenario.room.id);
  await click('.view-toolbar [data-view="room"]');
  await select('#wall-view', 'cutaway');
  await frame();
  return { entry: [...entry, 'room panorama'], floorImage };
}

async function inspectRoom(scenario, on) {
  await frame();
  const { room, floor, partNodes } = scenario;
  const evidence = await page.evaluate(({ roomId, partIds }) => {
    const { session, mirrorController, renderer } = company;
    const scene = session.scene;
    const doc = session.document;
    const root = scene.root;
    root.updateMatrixWorld(true);
    const resource = ref => company.catalog.resources.find(item => item.id === ref.id && item.version === ref.version);
    const visible = object => {
      for (let current = object; current; current = current.parent) if (current.visible === false) return false;
      return Boolean(object);
    };
    const parts = Object.fromEntries(Object.entries(partIds).map(([key, id]) => {
      const node = doc.nodes.find(item => item.id === id);
      const entry = resource(node.resource);
      const object = root.getObjectByName(id);
      if (!object) throw new Error('Style part has no actual scene instance: ' + id);
      const descendants = new Set(doc.nodes.filter(item => item.parentId === id).map(item => item.id));
      const meshes = [];
      for (const branch of object.children) {
        if (descendants.has(branch.name)) continue;
        branch.traverse(mesh => {
          const position = mesh.geometry?.attributes.position;
          if (!mesh.isMesh || !position?.count || !visible(mesh)) return;
          meshes.push({ name: mesh.userData.name || mesh.name, vertices: position.count });
        });
      }
      const screen = entry.display?.screen;
      const screens = [];
      if (screen) {
        object.traverse(mesh => {
          if (!visible(mesh) || !screen.nodes.includes(mesh.userData.name || mesh.name)) return;
          for (const material of [mesh.material].flat()) {
            screens.push({ color: material.color.getHexString(), emissive: material.emissiveIntensity });
          }
        });
      }
      return [key, { id, resource: node.resource, asset: entry.asset, meshes, screens,
        effectiveOn: node.state.on ?? entry.stateDefaults?.on, screen }];
    }));
    const finishes = scene.surfacePresentation().filter(finish => finish.regionId === roomId).map(finish => ({
      ...finish, asset: resource(finish.resource).asset,
    }));
    const drawn = renderer.info.render;
    return { view: scene.view, drawn: { calls: drawn.calls, triangles: drawn.triangles }, parts, finishes,
      loadedAssets: company.assetLibrary.snapshot().loadedAssets };
  }, { roomId: room.id, partIds: Object.fromEntries(Object.entries(partNodes).map(([key, part]) => [key, part.id])) });
  assert.equal(evidence.view.floorId, floor.id);
  assert.equal(evidence.view.roomId, room.id);
  assert.equal(evidence.view.mode, 'room');
  assert(evidence.drawn.calls > 0 && evidence.drawn.triangles > 0 && evidence.loadedAssets > 0);
  for (const [key, part] of Object.entries(evidence.parts)) {
    assert.equal(refKey(part.resource), scenario.parts[key]);
    assert(part.meshes.length > 0 && part.asset?.format === 'glb', 'No visible pinned mesh for ' + part.id);
  }
  const floorFinish = evidence.finishes.find(finish => finish.surface === 'floor' && finish.visible);
  const wallFinishes = evidence.finishes.filter(finish => ['north', 'south', 'east', 'west'].includes(finish.surface) && finish.visible);
  assert.equal(refKey(floorFinish?.resource ?? {}), scenario.floorFinish);
  assert(wallFinishes.length > 0);
  for (const finish of wallFinishes) assert.equal(refKey(finish.resource), scenario.wallFinish);
  for (const finish of [floorFinish, ...wallFinishes]) assert(finish.textureSize.every(size => size > 1));
  const monitor = evidence.parts.monitor;
  assert(monitor.screens.length > 0, 'No real styled monitor screen material');
  assert.equal(monitor.effectiveOn, on ?? monitor.effectiveOn);
  const expectedColor = (monitor.effectiveOn ? monitor.screen.onColor : monitor.screen.offColor).slice(1).toLowerCase();
  for (const screen of monitor.screens) {
    assert.equal(screen.color, expectedColor);
    assert.equal(screen.emissive, monitor.effectiveOn ? monitor.screen.onIntensity : 0);
  }
  const matched = new Map();
  for (const { resource, asset } of [...Object.values(evidence.parts), floorFinish, ...wallFinishes]) {
    if (matched.has(refKey(resource))) continue;
    const pathname = new URL(asset.url, url).pathname;
    const response = responses.get(pathname);
    assert.equal(response?.status(), 200, 'Browser did not fetch the actual GLB ' + pathname);
    const bytes = await response.body();
    assert.equal(bytes.length, asset.bytes);
    assert.equal(hash(bytes), asset.sha256);
    matched.set(refKey(resource), { resource, url: pathname, sha256: asset.sha256 });
  }
  return { ...evidence, actualGlbs: [...matched.values()] };
}

async function toggleScreen(scenario) {
  await click('#tool-selection');
  const id = scenario.partNodes.monitor.id;
  await select('#edit-instance', id);
  const button = page.locator('#edit-states').getByRole('button', { name: /^电源/ });
  const originalOn = await button.getAttribute('aria-pressed');
  assert(['true', 'false'].includes(originalOn));
  const on = originalOn === 'false';
  const expected = await browserDocument();
  expected.revision++;
  const target = find(expected, id);
  target.state = { ...target.state, on };
  await button.click();
  await idle();
  assert.equal(await button.getAttribute('aria-pressed'), String(on));
  assert.deepEqual(await browserDocument(), expected, 'Only the second-floor monitor state should change');
  return on;
}

async function save(scenario) {
  const document = await browserDocument();
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await stored(document.id);
  const envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, document);
  assert.deepEqual(envelope.dependencies, scenario.envelope.dependencies);
  return { document, text };
}

async function reopen(saved) {
  await closeBrowser();
  await launchBrowser();
  await page.goto(url);
  await idle();
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await browserDocument(), saved.document);
  assert.equal(await stored(saved.document.id), saved.text);
  assert(![...responses.keys()].some(key => key.startsWith('/delivery-room/')), 'Automatic restore should use browser storage');
}

async function shot(file) {
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

async function run() {
  await fs.mkdir(out, { recursive: true });
  stage = 'read two pinned style layouts from delivery';
  const [warm, cool] = await readScenarios();
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'start package server on temporary port';
  await openDeliveryServer();
  await launchBrowser();
  let warmSaved, coolSaved, coolScreenOn;
  await check('Open warm-home in the shipped viewer and inspect actual warm room', async () => {
    await openPackaged(warm);
    const presentation = await showRoom(warm);
    const scene = await inspectRoom(warm);
    return { companyId: warm.envelope.document.id, presentation, scene, image: await shot('warm-home.png') };
  });
  await check('Save and automatically recover warm-home in a new Chromium process', async () => {
    warmSaved = await save(warm);
    await reopen(warmSaved);
    const presentation = await showRoom(warm);
    const scene = await inspectRoom(warm);
    return { companyId: warmSaved.document.id, presentation, scene };
  });
  await check('Open cool-studios, enter second floor and render the real style', async () => {
    await openPackaged(cool);
    assert.equal(await stored(warmSaved.document.id), warmSaved.text);
    const presentation = await showRoom(cool, { captureFloor: true });
    const scene = await inspectRoom(cool);
    return { companyId: cool.envelope.document.id, presentation, scene, image: await shot('cool-studios.png') };
  });
  await check('Edit the second-floor monitor and save the local change with the complete style', async () => {
    coolScreenOn = await toggleScreen(cool);
    const scene = await inspectRoom(cool, coolScreenOn);
    const image = await shot('cool-studios-local-edit.png');
    coolSaved = await save(cool);
    return { companyId: coolSaved.document.id, monitorId: cool.partNodes.monitor.id, on: coolScreenOn, scene, image };
  });
  await check('Automatically recover cool-studios and keep the separate warm-home save', async () => {
    await reopen(coolSaved);
    assert.equal(await stored(warmSaved.document.id), warmSaved.text);
    const presentation = await showRoom(cool);
    const scene = await inspectRoom(cool, coolScreenOn);
    const image = await shot('cool-studios-restored.png');
    return { companyId: coolSaved.document.id, preservedWarmCompanyId: warmSaved.document.id, presentation, scene, image };
  });
  if (record) {
    await check('Capture both styles and the local edit in one normal-speed session', async () => {
      await closeBrowser();
      profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
      await launchBrowser(true);
      await openPackaged(warm);
      await showRoom(warm);
      await page.waitForTimeout(1500);
      await openPackaged(cool);
      await showRoom(cool);
      await page.waitForTimeout(1500);
      await toggleScreen(cool);
      await frame();
      await page.waitForTimeout(1200);
      const raw = await page.video().path();
      await closeBrowser();
      const file = path.join('video', 'whole-style-batch-normal.webm');
      await fs.rename(raw, path.join(out, file));
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
  report.failure = { stage, message: error.message, stack: error.stack, serverLog };
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({ timeout: 2000 }).catch(() => undefined);
    await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    await closeBrowser();
    if (server) {
      if (server.exitCode === null && server.signalCode === null) server.kill();
      await serverStopped;
    }
  } catch (error) {
    report.cleanupError = error.message;
    report.status = 'failed';
    process.exitCode = 1;
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video.file }));
});
