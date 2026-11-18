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
  throw new Error('Usage: node qa-phone-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-phone-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const root = path.resolve(rootArg);
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const out = path.resolve(paths.at(-1));
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__phone-room-qa/three.core.js';
const looks = ['portrait', 'landscape', 'cradle', 'clamp'].map(name => ({ id: 'phone-static-' + name, version: 1 }));
const supports = {
  'phone-static-portrait': ['phone-case-foot'],
  'phone-static-landscape': ['phone-case-foot-left', 'phone-case-foot-right'],
  'phone-static-cradle': ['phone-cradle-base', 'phone-cradle-wedge', 'phone-cradle-lip'],
  'phone-static-clamp': ['phone-clamp-base', 'phone-clamp-jaw-left', 'phone-clamp-jaw-right'],
};
const key = ref => ref.id + '@' + ref.version;
const node = (doc, id) => doc.nodes.find(row => row.id === id);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', build, rooms: [], browserErrors: [] };
let manifest, devServer, packageServer, baseUrl, threeSource, context, page, responses, stage, outputCreated;

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
  const phoneId = roomId + '/station-1/phone';
  const phone = node(document, phoneId);
  assert(phone, 'Fixture has its own real phone instance: ' + phoneId);
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  assert(looks.some(ref => key(ref) === key(phone.resource)));
  assert.equal(phone.parentId, roomId + '/station-1/desk');
  assert.equal(phone.transform.yaw, 0);
  return { id, file, bytes, document, roomId, floorId: node(document, roomId).parentId, phoneId, phone };
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

async function showPhone(room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (view.mode !== 'room' || view.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.phoneId);
  await page.evaluate(({ id, side }) => {
    const { session, camera } = company;
    const phone = session.scene.root.getObjectByName(id);
    const world = coords => phone.localToWorld(camera.position.clone().fromArray(coords));
    camera.position.copy(world([.24 * side, .32, .69]));
    camera.lookAt(world([-.13 * side, .125, .025]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, { id: room.phoneId, side: Math.sign(room.phone.transform.position[0]) || 1 });
}

async function choose(room, ref) {
  const select = page.locator('#edit-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), room.phoneId);
  const choices = await select.locator('option').evaluateAll(items => items.map(item => item.value));
  for (const look of looks) assert(choices.includes(key(look)), 'Missing compatible look ' + key(look));
  if (await select.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.phoneId).resource = ref;
  await select.selectOption(key(ref));
  await ready();
  assert.deepEqual(await current(), expected, 'Look selection keeps the instance, mounting, direction and state');
}

async function power(room, on) {
  const control = page.locator('#edit-states').getByRole('button', { name: /^电源[：:]/ });
  const prior = await control.getAttribute('aria-pressed');
  assert(['true', 'false'].includes(prior));
  if (prior === String(on)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.phoneId).state.on = on;
  await control.click();
  await ready();
  assert.equal(await control.getAttribute('aria-pressed'), String(on));
  assert.deepEqual(await current(), expected, 'Power changes only the selected phone state and revision');
}

async function actualAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual phone GLB request: ' + asset.url);
  const bytes = manifest ? await pinned('viewer' + asset.url) : await fs.readFile(path.join(root, '.' + asset.url));
  assert.equal(sha(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(bytes.equals(await response.body()));
}

async function inspect(room, ref, on, pixels = false) {
  const observation = await page.evaluate(async ({ id, threeUrl, pixels }) => {
    const { Box3, Matrix3, Raycaster, Vector3 } = await import(threeUrl);
    const { session, camera, renderer } = company;
    const entity = session.document.nodes.find(row => row.id === id);
    const resource = company.catalog.resources.find(row => row.id === entity.resource.id && row.version === entity.resource.version);
    const definition = resource.display?.screen;
    const root = session.scene.root.getObjectByName(id);
    const desk = session.scene.root.getObjectByName(entity.parentId);
    if (root.parent !== desk) throw new Error('The phone runtime object must be attached to the actual desk');
    if (definition?.nodes?.length !== 1 || definition.nodes[0] !== 'phone-screen') throw new Error('Missing screen mapping');
    const visibleMeshes = [];
    session.scene.root.traverseVisible(mesh => {
      if (mesh.isMesh && root.getObjectById(mesh.id)) visibleMeshes.push(mesh);
    });
    const screen = visibleMeshes.find(mesh => (mesh.userData.name || mesh.name) === 'phone-screen');
    if (!screen) throw new Error('The imported screen is absent or outside the visible scene');
    const materials = [...new Set([screen.material].flat())];
    const observedMaterials = materials.map(material => ({
      color: '#' + material.color.getHexString(), emissive: '#' + material.emissive.getHexString(),
      intensity: material.emissiveIntensity,
    }));
    session.scene.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const vertices = screen.geometry.attributes.position;
    const bounds = new Box3().setFromBufferAttribute(vertices);
    const phoneFromScreen = root.matrixWorld.clone().invert().multiply(screen.matrixWorld);
    const screenBounds = new Box3();
    for (let i = 0; i < vertices.count; i++) {
      screenBounds.expandByPoint(new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(phoneFromScreen));
    }
    const center = bounds.getCenter(new Vector3()).applyMatrix4(screen.matrixWorld);
    const direction = center.clone().sub(camera.position).normalize();
    const hit = new Raycaster(camera.position, direction).intersectObject(screen, false)[0];
    if (!hit?.face) throw new Error('Ray from the camera did not hit the actual screen front');
    const normal = hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(screen.matrixWorld));
    const front = new Vector3(0, 0, 1).transformDirection(root.matrixWorld);
    let frame;
    if (pixels) {
      const source = renderer.domElement;
      const projected = new Box3();
      for (let i = 0; i < vertices.count; i++) {
        projected.expandByPoint(new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(screen.matrixWorld).project(camera));
      }
      const x = Math.max(0, Math.floor((projected.min.x + 1) * source.width / 2));
      const y = Math.max(0, Math.floor((1 - projected.max.y) * source.height / 2));
      const right = Math.min(source.width, Math.ceil((projected.max.x + 1) * source.width / 2));
      const bottom = Math.min(source.height, Math.ceil((1 - projected.min.y) * source.height / 2));
      const width = right - x, height = bottom - y;
      if (width < 8 || height < 8) throw new Error('Projected screen is too small or out of frame');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const grab = () => {
        company.drawHostFrame();
        context.clearRect(0, 0, width, height);
        context.drawImage(source, x, y, width, height, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const before = grab();
      const originals = materials.map(material => [material.emissive.clone(), material.emissiveIntensity]);
      let tagged;
      try {
        for (const material of materials) {
          material.emissive.setRGB(1, 0, 1);
          material.emissiveIntensity = 5;
        }
        tagged = grab();
      } finally {
        materials.forEach((material, index) => {
          material.emissive.copy(originals[index][0]);
          material.emissiveIntensity = originals[index][1];
        });
        company.drawHostFrame();
      }
      let luminance = '';
      for (let i = 0; i < before.length; i += 4) {
        const delta = Math.abs(before[i] - tagged[i]) + Math.abs(before[i + 1] - tagged[i + 1]) +
          Math.abs(before[i + 2] - tagged[i + 2]);
        const luma = .2126 * before[i] + .7152 * before[i + 1] + .0722 * before[i + 2];
        luminance += String.fromCharCode(delta > 30 ? Math.min(255, 1 + Math.round(luma)) : 0);
      }
      frame = { crop: [x, y, width, height], luminance: btoa(luminance) };
    }
    return {
      ref: entity.resource, on: entity.state.on ?? resource.stateDefaults.on, asset: resource.asset,
      mounting: resource.mounting, pose: root.matrixWorld.toArray(), front: front.toArray(),
      hit: { normal: normal.toArray(), direction: front.dot(normal), facingCamera: -direction.dot(normal), triangle: hit.faceIndex },
      materials: observedMaterials, definition, meshes: visibleMeshes.map(mesh => mesh.userData.name || mesh.name),
      screenSize: screenBounds.getSize(new Vector3()).toArray(),
      camera: camera.matrixWorld.toArray(), frame, renderError: company.renderStatus().lastRenderError,
    };
  }, { id: room.phoneId, threeUrl, pixels });
  assert.deepEqual(observation.ref, ref);
  assert.equal(observation.on, on);
  assert.equal(observation.renderError, null);
  assert(observation.hit.direction > .5 && observation.hit.facingCamera > .45, 'Camera must face a forward screen triangle');
  for (const name of supports[ref.id]) assert(observation.meshes.includes(name), 'Expected actual phone support mesh ' + name);
  const [width, height] = observation.screenSize;
  assert.equal(width > height, ref.id === 'phone-static-landscape', 'Expected the screen geometry in the authored orientation');
  const mounting = observation.mounting;
  assert(mounting.reserveDesktopArea);
  assert.deepEqual([mounting.width, mounting.height, mounting.depth], [.18, .19, .11]);
  const { definition } = observation;
  for (const material of observation.materials) {
    assert.deepEqual(material, {
      color: (on ? definition.onColor : definition.offColor).toLowerCase(),
      emissive: on ? definition.emissive.toLowerCase() : '#000000',
      intensity: on ? definition.onIntensity : 0,
    });
    if (on) assert(material.intensity > 0);
  }
  await actualAsset(observation.asset);
  const { frame, ...facts } = observation;
  return { facts, frame };
}

function compareFrames(on, off) {
  assert.deepEqual(on.crop, off.crop, 'The on/off pair must use the same camera and projected screen crop');
  const lit = Buffer.from(on.luminance, 'base64'), unlit = Buffer.from(off.luminance, 'base64');
  assert.equal(lit.length, unlit.length);
  let observed = 0, brighter = 0, totalLit = 0, totalUnlit = 0;
  for (let i = 0; i < lit.length; i++) {
    if (!lit[i] || !unlit[i]) continue;
    observed++;
    totalLit += lit[i] - 1;
    totalUnlit += unlit[i] - 1;
    if (lit[i] - unlit[i] >= 12) brighter++;
  }
  const measured = { crop: on.crop, observed, brighter, onLuma: totalLit / observed, offLuma: totalUnlit / observed };
  assert(observed >= 100, 'Require a visibly exposed patch of the real phone screen');
  const details = JSON.stringify(measured);
  assert(measured.offLuma <= 10, 'Powered off screen must render dark: ' + details);
  // The static monitor illustration has a deliberately dark background even while lit.
  assert(brighter >= 100 && brighter / observed >= .20 && measured.onLuma - measured.offLuma >= 20,
    'Require a sizeable bright display image when the actual power control is on: ' + details);
  return measured;
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({ path: path.join(out, name) });
  return name;
}

async function saveReopen(room, profile, ref) {
  const expected = await current();
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const saved = await readSave(room.id), envelope = JSON.parse(saved);
  assert.deepEqual(envelope.document, expected);
  const pin = envelope.dependencies.resources.find(resource => key(resource) === key(ref));
  assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  await close();
  await open(profile);
  await visit(baseUrl);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.equal(await readSave(room.id), saved);
  assert.deepEqual(await current(), expected);
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  await showPhone(room);
  return { savedSha256: sha(saved), pin, browserRestarted: true };
}

async function inspectRoom(room, roomIndex) {
  stage = room.id + ': load the original room';
  const profile = await fs.mkdtemp(path.join(out, 'chromium-'));
  await open(profile);
  await load(room);
  await showPhone(room);
  const originalOn = (await page.locator('#edit-states').getByRole('button', { name: /^电源[：:]/ }).getAttribute('aria-pressed')) === 'true';
  assert.equal(originalOn, room.id === 'phone-home');
  const initial = (await inspect(room, room.phone.resource, originalOn)).facts;
  const entry = { id: room.id, input: room.file, saveSha256: sha(room.bytes), initial, looks: [] };
  report.rooms.push(entry);
  const order = [...looks.filter(ref => key(ref) !== key(room.phone.resource)), room.phone.resource];
  const assets = new Set();
  for (const [index, ref] of order.entries()) {
    stage = room.id + ': ' + key(ref) + ' power and cold reopen';
    await choose(room, ref);
    const states = [];
    for (const on of [true, false]) {
      await power(room, on);
      const observation = await inspect(room, ref, on, true);
      assert.deepEqual(observation.facts.pose, initial.pose);
      assert.deepEqual(observation.facts.front, initial.front);
      assert.deepEqual(observation.facts.camera, initial.camera);
      assert.deepEqual(observation.facts.mounting, initial.mounting);
      const image = await screenshot(room.id + '-' + ref.id + (on ? '-on.png' : '-off.png'));
      states.push({ ...observation, image });
    }
    const [on, off] = states;
    assert(!assets.has(on.facts.asset.sha256), 'Every phone look needs its own real GLB bytes');
    assets.add(on.facts.asset.sha256);
    const measured = compareFrames(on.frame, off.frame);
    const restoreOn = (index + roomIndex) % 2 === 0;
    await power(room, restoreOn);
    const saved = await saveReopen(room, profile, ref);
    const restored = (await inspect(room, ref, restoreOn)).facts;
    assert.deepEqual(restored, (restoreOn ? on : off).facts);
    entry.looks.push({ ref, measured, images: { on: on.image, off: off.image }, on: on.facts, off: off.facts, restored, saved });
  }
  await close();
}

async function record(rooms) {
  stage = 'short normal-speed recording';
  const profile = await fs.mkdtemp(path.join(out, 'recording-'));
  await open(profile, true);
  for (const [index, room] of rooms.entries()) {
    await load(room);
    await showPhone(room);
    for (const ref of index === 0 ? looks : [room.phone.resource]) {
      await choose(room, ref);
      await power(room, true);
      await page.waitForTimeout(1200);
      await power(room, false);
      await page.waitForTimeout(850);
    }
  }
  const video = page.video();
  await close();
  const file = 'video/phone-rooms-normal.webm';
  await video.saveAs(path.join(out, file));
  await video.delete();
  const { size } = await fs.stat(path.join(out, file));
  assert(size > 0);
  report.video = { file, bytes: size, playbackSpeed: 1 };
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
  const rooms = await Promise.all(['phone-home', 'phone-rental'].map(fixture));
  baseUrl = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  for (const [index, room] of rooms.entries()) await inspectRoom(room, index);
  const [home, rental] = report.rooms;
  assert(Math.abs(home.initial.front.reduce((sum, value, index) => sum + value * rental.initial.front[index], 0)) < 1e-5,
    'The two fixtures must put the actual phones on perpendicular world headings');
  if (recordRequested) await record(rooms);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) await screenshot('failure.png').catch(() => {});
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    if (devServer) await devServer.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const exit = once(packageServer, 'exit');
      packageServer.kill();
      await exit;
    }
    if (outputCreated) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video?.file }));
  }
});
