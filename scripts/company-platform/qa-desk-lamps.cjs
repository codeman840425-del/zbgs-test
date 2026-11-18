const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, rootArg, outArg, ...options] = process.argv.slice(2);
if (!dist || !build || !rootArg || !outArg || options.length > 1 || options.some(option => option !== '--record')) {
  throw new Error('Usage: node qa-desk-lamps.cjs DIST BUILD BATCH_RESULT_ROOT OUT [--record]');
}
const out = path.resolve(outArg);
const record = options.includes('--record');
const viewport = { width: 1600, height: 1000 };
const report = {
  build, status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], video: { enabled: record, playbackSpeed: 1 },
};
let server, profile, context, page, responses, stage;

const refKey = ref => ref.id + '@' + ref.version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const item = (document, id) => document.nodes.find(node => node.id === id);
const browserDocument = () => page.evaluate(() => company.session.document);
const stored = id => page.evaluate(id => company.session.readSavedText(id), id);

async function fixture(companyId, stationName) {
  const source = path.resolve(rootArg, companyId, 'save.json');
  const envelope = JSON.parse(await fs.readFile(source, 'utf8'));
  assert.equal(envelope.schema, 'company-save');
  assert.equal(envelope.document.id, companyId);
  const roomId = companyId + '/ground/live';
  const stationId = roomId + '/' + stationName;
  const deskId = stationId + '/desk';
  const lampId = stationId + '/desk-lamp';
  const room = item(envelope.document, roomId);
  const desk = item(envelope.document, deskId);
  const lamp = item(envelope.document, lampId);
  assert.equal(room?.kind, 'room');
  assert.equal(desk?.stationId, stationId);
  assert.equal(lamp?.parentId, deskId);
  assert.deepEqual(lamp.transform.position, [.67, .84, -.20]);
  return { source, envelope, roomId, floorId: room.parentId, stationId, deskId, lampId, desk, lamp };
}

async function idle() {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'false', await status.textContent());
}

async function openBrowser(recording = false) {
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
    if (pathname.endsWith('.glb')) responses.set(pathname, response);
  });
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ stage, message: message.text() });
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

async function importFile(input) {
  const menu = page.locator('.file-menu');
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import').click();
  const picker = await chooser;
  assert.equal(await picker.element().getAttribute('id'), 'file');
  await picker.setFiles(input.source);
  await page.waitForFunction(id => company.session.document.id === id, input.envelope.document.id);
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await browserDocument(), input.envelope.document);
}

async function showDesk(input) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== input.floorId) await select('#floor', input.floorId);
  if (view.roomId !== input.roomId) await select('#room', input.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, input.roomId);
  await click('#tool-selection');
  await select('#edit-instance', input.lampId);
  await page.evaluate(deskId => {
    const { session, camera } = company;
    const desk = session.scene.root.getObjectByName(deskId);
    session.scene.root.updateMatrixWorld(true);
    camera.position.copy(desk.localToWorld(camera.position.clone().set(1.55, 2.22, 1.56)));
    camera.lookAt(desk.localToWorld(camera.position.clone().set(.20, 1.00, -.02)));
    camera.updateMatrixWorld();
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
  }, input.deskId);
  await frame();
}

async function catalogLooks() {
  const refs = await page.evaluate(() => company.catalog.resources.filter(resource => (
    resource.mountRole === 'desk-lamp' && resource.productionBranch === 'desk-lamp' && resource.asset
  )).map(({ id, version }) => ({ id, version })));
  const latest = new Map();
  for (const ref of refs) {
    if (!latest.has(ref.id) || latest.get(ref.id).version < ref.version) latest.set(ref.id, ref);
  }
  assert.equal(latest.size, 4, 'Expected four real desk-lamp looks in the fixed catalog');
  return [...latest.values()];
}

async function addPanel(input, looks) {
  await click('#tool-add');
  assert(await page.locator('#add-branch').isVisible());
  const category = await page.locator('#add-branch option[value="desk-lamp"]').textContent();
  assert.equal(category, '桌面台灯');
  await select('#add-branch', 'desk-lamp');
  const values = await page.locator('#add-look option').evaluateAll(options => options.map(option => option.value));
  assert.deepEqual(values.sort(), looks.map(refKey).sort());
  const hosts = [];
  for (const look of looks) {
    await select('#add-look', refKey(look));
    const options = await page.locator('#add-target option').evaluateAll(options => options.map(option => option.value));
    assert(options.includes(input.deskId + ':desktop'), 'Lamp look is missing the actual desk target');
    hosts.push({ resource: look, options });
  }
  return { category, hosts };
}

async function chooseLook(input, ref) {
  const look = page.locator('#edit-look');
  const values = await look.locator('option').evaluateAll(options => options.map(option => option.value));
  assert(values.includes(refKey(ref)), 'Missing compatible desk lamp ' + refKey(ref));
  if (await look.inputValue() === refKey(ref)) return;
  const expected = await browserDocument();
  expected.revision++;
  item(expected, input.lampId).resource = ref;
  await select('#edit-look', refKey(ref));
  assert.deepEqual(await browserDocument(), expected, 'Look replacement changed something beyond the selected lamp reference');
}

async function setState(input, desired) {
  const read = () => page.evaluate(id => {
    const node = company.session.document.nodes.find(node => node.id === id);
    const resource = company.catalog.resources.find(r => r.id === node.resource.id && r.version === node.resource.version);
    return { ...resource.stateDefaults, ...node.state };
  }, input.lampId);
  const before = await read();
  if (desired.on !== undefined && before.on !== desired.on) await click('#edit-states button');
  for (const [field, selector] of [
    ['intensity', '#edit-states input[type=range][max="10"]'],
    ['angle', '#edit-states input[type=range][min="-0.35"]'],
  ]) {
    if (desired[field] === undefined || before[field] === desired[field]) continue;
    const control = page.locator(selector);
    assert(await control.isEnabled());
    await control.evaluate((slider, value) => {
      slider.value = String(value);
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, desired[field]);
    await idle();
  }
  const after = await read();
  assert.equal(after.on, desired.on ?? before.on);
  for (const field of ['intensity', 'angle']) assert(Math.abs(after[field] - (desired[field] ?? before[field])) < 1e-8);
  return after;
}

async function lampActual(input) {
  await frame();
  const result = await page.evaluate(({ deskId, lampId }) => {
    const { session, camera } = company;
    const scene = session.scene;
    const root = scene.root;
    const desk = root.getObjectByName(deskId);
    const lamp = root.getObjectByName(lampId);
    const table = desk?.getObjectByName('desktop');
    if (!table?.isMesh || !lamp) throw new Error('The physical lamp and desktop must be displayed');
    const doc = session.document;
    const node = doc.nodes.find(node => node.id === lampId);
    const resource = company.catalog.resources.find(r => r.id === node.resource.id && r.version === node.resource.version);
    const state = { ...resource.stateDefaults, ...node.state };
    const { aim, ...optics } = resource.light;
    const head = lamp.getObjectByName(aim.pivot);
    const diffuser = lamp.getObjectByName(aim.emitter);
    const spot = lamp.children.find(node => node.isSpotLight);
    if (!head || !diffuser?.isMesh || !spot) throw new Error('Actual lamp head, diffuser and spotlight must all be mounted');
    root.updateMatrixWorld(true);
    const v = () => camera.position.clone();
    const origin = spot.getWorldPosition(v());
    const emission = diffuser.getWorldPosition(v());
    const direction = spot.target.getWorldPosition(v()).sub(origin).normalize();
    const emissionDirection = diffuser.getWorldDirection(v()).normalize();
    const inverse = desk.matrixWorld.clone().invert();
    const directionInDesk = direction.clone().transformDirection(inverse);
    table.geometry.computeBoundingBox();
    const tabletop = table.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(table.matrixWorld));
    const originInDesk = origin.clone().applyMatrix4(inverse);
    const hit = originInDesk.clone().addScaledVector(directionInDesk, (tabletop.max.y - originInDesk.y) / directionInDesk.y);
    const expectedOrigin = emission.clone().addScaledVector(emissionDirection, aim.offset);
    const materials = [diffuser.material].flat().map(material => ({
      color: material.color.getHexString(), emissive: material.emissive.getHexString(), strength: material.emissiveIntensity,
    }));
    const visibleMeshes = [];
    lamp.traverse(object => {
      if (!object.isMesh) return;
      for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (ancestor.visible === false) return;
      visibleMeshes.push({ name: object.userData.name || object.name, vertices: object.geometry.attributes.position.count });
    });
    const lights = scene.snapshot().lights.map(light => {
      const n = doc.nodes.find(node => node.id === light.id);
      const r = company.catalog.resources.find(r => r.id === n.resource?.id && r.version === n.resource?.version);
      const st = { ...r.stateDefaults, ...n.state };
      return { ...light, desired: st.on ? st.intensity : 0 };
    });
    const visibleSpotlights = [];
    root.traverseVisible(object => {
      if (object.isSpotLight) visibleSpotlights.push({ id: object.parent.name, intensity: object.intensity });
    });
    return {
      node, state, asset: resource.asset, view: scene.view, hasArticulatedDiffuser: Boolean(head.getObjectById(diffuser.id)),
      head: head.quaternion.toArray(), materialContract: resource.display.diffuser, materials, lights, visibleMeshes, visibleSpotlights,
      parent: lamp.parent?.name, deskYaw: Math.atan2(desk.matrixWorld.elements[8], desk.matrixWorld.elements[10]),
      spot: { intensity: spot.intensity, distance: spot.distance, angle: spot.angle, penumbra: spot.penumbra, castsShadow: spot.castShadow,
        expected: { distance: optics.distance, angle: optics.angle, penumbra: optics.penumbra },
        origin: origin.toArray(), direction: direction.toArray(), directionInDesk: directionInDesk.toArray(),
        emissionAlignment: emissionDirection.dot(direction), originError: origin.distanceTo(expectedOrigin), hit: hit.toArray() },
    };
  }, { deskId: input.deskId, lampId: input.lampId });
  assert.equal(result.view.roomId, input.roomId);
  assert.equal(result.parent, input.deskId);
  assert.deepEqual(result.node.transform, input.lamp.transform);
  assert(result.hasArticulatedDiffuser);
  assert(result.visibleMeshes.length >= 2);
  assert(result.spot.emissionAlignment > .999999);
  assert(result.spot.originError < 1e-6);
  assert(result.spot.directionInDesk[1] < 0);
  assert(result.spot.hit.every(Number.isFinite));
  for (const key of ['distance', 'angle', 'penumbra']) assert.equal(result.spot[key], result.spot.expected[key]);
  assert.equal(result.spot.castsShadow, false);
  const enabled = result.lights.filter(light => light.intensity > 0).map(({ id, intensity }) => ({ id, intensity }));
  assert(enabled.length <= 2);
  assert.deepEqual(result.visibleSpotlights.sort((a, b) => a.id.localeCompare(b.id)), enabled.sort((a, b) => a.id.localeCompare(b.id)),
    'Only the scheduled lights may actually be visible to the renderer');
  assert.equal(result.lights.find(light => light.id === input.lampId)?.intensity, result.spot.intensity);
  const { on, intensity } = result.state;
  for (const material of result.materials) {
    assert.equal(material.color, (on ? result.materialContract.onColor : result.materialContract.offColor).slice(1));
    assert.equal(material.emissive, on ? result.materialContract.emissive.slice(1) : '000000');
    assert(Math.abs(material.strength - (on ? result.materialContract.onIntensity * intensity / 10 : 0)) < 1e-8);
  }
  return result;
}

async function verifyNetwork(asset) {
  const pathname = new URL(asset.url, server.url).pathname;
  const response = responses.get(pathname);
  assert.equal(response?.status(), 200, 'Expected an actual browser GLB request for ' + pathname);
  const bytes = await response.body();
  assert.equal(bytes.length, asset.bytes);
  assert.equal(hash(bytes), asset.sha256);
}

async function desktopPixels(input) {
  return page.evaluate(deskId => {
    const { session, camera, renderer, world } = company;
    const desk = session.scene.root.getObjectByName(deskId);
    const top = desk.getObjectByName('desktop');
    desk.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    top.geometry.computeBoundingBox();
    const box = top.geometry.boundingBox.clone().applyMatrix4(desk.matrixWorld.clone().invert().multiply(top.matrixWorld));
    const original = top.material;
    if ([original].flat().some(material => !material.emissive || material.emissive.getHex() !== 0)) {
      throw new Error('The real desktop must be a nonemissive light receiver');
    }
    const canvas = document.createElement('canvas');
    canvas.width = renderer.domElement.width;
    canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const copyFrame = () => {
      company.drawHostFrame();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(renderer.domElement, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const pixels = copyFrame();
    // Identify real uncovered tabletop pixels using the same geometry and depth buffer.
    // The actual brightness samples above always use the unmodified table material.
    const marker = [original].flat().map(material => {
      const copy = material.clone();
      copy.color.set('black');
      copy.map = null;
      copy.metalness = 1;
      copy.roughness = 1;
      copy.metalnessMap = null;
      copy.roughnessMap = null;
      copy.envMap = null;
      copy.emissive.set('#ff00ff');
      copy.emissiveIntensity = 1;
      copy.emissiveMap = null;
      copy.toneMapped = false;
      return copy;
    });
    const lights = [];
    world.traverse(object => {
      if (object.isLight && object.visible) lights.push(object);
    });
    let mask;
    try {
      top.material = Array.isArray(original) ? marker : marker[0];
      for (const light of lights) light.visible = false;
      mask = copyFrame();
    } finally {
      for (const light of lights) light.visible = true;
      top.material = original;
      for (const material of marker) material.dispose();
      company.drawHostFrame();
    }
    const samples = [];
    for (let x = box.min.x + .025; x < box.max.x - .025; x += .035) {
      for (let z = box.min.z + .025; z < box.max.z - .025; z += .035) {
        const p = desk.localToWorld(camera.position.clone().set(x, box.max.y, z)).project(camera);
        const px = Math.floor((p.x + 1) * canvas.width / 2);
        const py = Math.floor((1 - p.y) * canvas.height / 2);
        if (px < 1 || py < 1 || px >= canvas.width - 1 || py >= canvas.height - 1 || Math.abs(p.z) >= 1) continue;
        const i = (py * canvas.width + px) * 4;
        const visible = mask[i] >= 245 && mask[i + 1] <= 10 && mask[i + 2] >= 245;
        const value = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        samples.push({ x, z, px, py, visible, value });
      }
    }
    return { camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() }, samples };
  }, input.deskId);
}

async function exposure(input, state, file) {
  await setState(input, state);
  const light = await lampActual(input);
  const pixels = await desktopPixels(input);
  if (file) await screenshot(file);
  return { light, ...pixels, file };
}

function difference(input, dark, lit) {
  assert.deepEqual(dark.camera, lit.camera, 'Light measurements must use exactly the same camera');
  assert.deepEqual(dark.light.lights.filter(light => light.id !== input.lampId),
    lit.light.lights.filter(light => light.id !== input.lampId), 'Another light changed during the exposure pair');
  let weight = 0, x = 0, z = 0, samples = 0, changed = 0, peak = 0;
  assert.equal(dark.samples.length, lit.samples.length);
  for (const [index, a] of dark.samples.entries()) {
    const b = lit.samples[index];
    assert.deepEqual([a.x, a.z, a.px, a.py], [b.x, b.z, b.px, b.py]);
    if (!a.visible || !b.visible) continue;
    samples++;
    const gain = b.value - a.value;
    peak = Math.max(peak, gain);
    if (gain < 3) continue;
    changed++;
    weight += gain;
    x += a.x * gain;
    z += a.z * gain;
  }
  assert(samples >= 80, 'Too little uncovered real tabletop to measure');
  return { samples, changed, positiveLumaGain: weight, peak, centroid: weight ? [x / weight, z / weight] : null };
}

async function measureLighting(input) {
  const off = await exposure(input, { on: false, intensity: 10, angle: 0 }, '01-desktop-off.png');
  const middle = await exposure(input, { on: true, intensity: 4, angle: 0 });
  const bright = await exposure(input, { on: true, intensity: 10, angle: 0 }, '02-desktop-on.png');
  assert.equal(off.light.spot.intensity, 0);
  assert.equal(middle.light.spot.intensity, 4);
  assert.equal(bright.light.spot.intensity, 10);
  const mid = difference(input, off, middle);
  const full = difference(input, off, bright);
  report.lightingDiagnostics = { mid, full, anglePairs: [] };
  assert.equal(mid.samples, full.samples, 'The dimmer exposures must cover the same physical tabletop pixels');
  assert(mid.changed >= 10 && full.changed >= 10, 'The real nonemissive desktop must show an on/off light footprint');
  assert(full.positiveLumaGain > mid.positiveLumaGain);
  const anglePairs = [];
  for (const [angle, file] of [[-.35, '03-desktop-angle-up.png'], [.35, '04-desktop-angle-down.png']]) {
    const dark = await exposure(input, { on: false, intensity: 10, angle });
    const illuminated = await exposure(input, { on: true, intensity: 10, angle }, file);
    const gain = difference(input, dark, illuminated);
    report.lightingDiagnostics.anglePairs.push({ angle, gain, hit: illuminated.light.spot.hit });
    assert(gain.changed >= 10 && gain.centroid, 'Both angles must emit onto the real desktop');
    anglePairs.push({ angle, gain, spot: illuminated.light.spot, head: illuminated.light.head, file });
  }
  const [upper, lower] = anglePairs;
  const measured = lower.gain.centroid.map((value, i) => value - upper.gain.centroid[i]);
  const expected = [lower.spot.hit[0] - upper.spot.hit[0], lower.spot.hit[2] - upper.spot.hit[2]];
  assert.notDeepEqual(upper.head, lower.head);
  assert(Math.hypot(...measured) > .02, 'The real illuminated patch must move across the desktop');
  assert(measured[0] * expected[0] + measured[1] * expected[1] > 0, 'Illumination moves opposite to the articulated beam');
  return { camera: off.camera, off: off.file, bright: bright.file, middle: mid, full, anglePairs, shiftMetres: measured };
}

async function save(input) {
  const document = await browserDocument();
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await stored(document.id);
  const envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, document);
  const lamp = item(document, input.lampId);
  const pin = envelope.dependencies.resources.find(resource => refKey(resource) === refKey(lamp.resource));
  assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  return { document, text, pin };
}

async function recover(input, saved) {
  await closeBrowser();
  await openBrowser();
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await browserDocument(), saved.document);
  assert.equal(await stored(saved.document.id), saved.text);
  await showDesk(input);
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

async function run() {
  await fs.mkdir(out, { recursive: true });
  stage = 'read both desk-lamp batch results';
  const home = await fixture('desk-lamp-home', 'station-1');
  const studio = await fixture('desk-lamp-studio', 'station-left');
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'fixed build startup';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser();
  const looks = await catalogLooks();
  report.looks = looks;
  let homeDirection, homeSave;
  await check('Visible desk-lamp Add category offers four compatible looks on the actual desktop', async () => {
    await importFile(home);
    await showDesk(home);
    const result = await addPanel(home, looks);
    await showDesk(home);
    return result;
  });
  await check('Measured desktop lighting, fixed on/off view, dimmer and real angle change', async () => {
    await setState(home, { on: true, intensity: 4, angle: 0 });
    const actual = await lampActual(home);
    homeDirection = actual;
    await verifyNetwork(actual.asset);
    return { actual, ...await measureLighting(home) };
  });
  for (const [index, ref] of looks.entries()) {
    await check('Select and automatically recover ' + refKey(ref) + ' and its exact light state', async () => {
      await chooseLook(home, ref);
      await setState(home, { on: index !== 2, intensity: 4.5 + index * 1.5, angle: index % 2 ? .175 : -.175 });
      const before = await lampActual(home);
      assert.equal(before.spot.intensity, before.state.on ? before.state.intensity : 0);
      await verifyNetwork(before.asset);
      const image = await screenshot('look-' + ref.id + '.png');
      homeSave = await save(home);
      await recover(home, homeSave);
      const after = await lampActual(home);
      assert.deepEqual(after, before);
      await verifyNetwork(after.asset);
      return { before, after, image, pin: homeSave.pin };
    });
  }
  await check('Turned desk keeps emitter alignment and obeys the shared two-light budget', async () => {
    await importFile(studio);
    await showDesk(studio);
    await chooseLook(studio, homeDirection.node.resource);
    await setState(studio, { on: true, intensity: 4, angle: 0 });
    const on = await lampActual(studio);
    assert(Math.acos(Math.cos(on.deskYaw - homeDirection.deskYaw)) > .5, 'Second desk must have a genuinely different yaw');
    for (const [i, value] of homeDirection.spot.directionInDesk.entries()) {
      assert(Math.abs(on.spot.directionInDesk[i] - value) < 1e-6);
    }
    assert.notDeepEqual(on.spot.direction, homeDirection.spot.direction);
    assert(on.lights.filter(light => light.desired > 0).length >= 3);
    assert.equal(on.visibleSpotlights.length, 2);
    assert.equal(on.spot.intensity, 4);
    await setState(studio, { on: false });
    const off = await lampActual(studio);
    assert.equal(off.spot.intensity, 0);
    assert.equal(off.visibleSpotlights.length, 2);
    assert(off.visibleSpotlights.some(light => !on.visibleSpotlights.some(before => before.id === light.id)));
    await setState(studio, { on: true, intensity: 6, angle: .35 });
    const before = await lampActual(studio);
    assert.equal(before.spot.intensity, 6);
    assert.notDeepEqual(before.spot.hit, on.spot.hit);
    const image = await screenshot('turned-studio-desk.png');
    const saved = await save(studio);
    await recover(studio, saved);
    const after = await lampActual(studio);
    assert.deepEqual(after, before);
    await verifyNetwork(after.asset);
    assert.equal(await stored(homeSave.document.id), homeSave.text);
    return { on, off, before, after, image, pin: saved.pin };
  });
  if (record) {
    await check('Capture actual lighting changes and four styles in one normal-speed recording', async () => {
      await closeBrowser();
      profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
      await openBrowser(true);
      await importFile(home);
      await showDesk(home);
      for (const state of [
        { on: false, intensity: 10, angle: 0 }, { on: true, intensity: 10, angle: 0 },
        { angle: -.35 }, { angle: .35 },
      ]) {
        await setState(home, state);
        await frame();
        await page.waitForTimeout(1100);
      }
      await setState(home, { angle: 0 });
      for (const ref of looks) {
        await chooseLook(home, ref);
        await frame();
        await page.waitForTimeout(1000);
      }
      await importFile(studio);
      await showDesk(studio);
      await frame();
      await page.waitForTimeout(1200);
      const raw = await page.video().path();
      await closeBrowser();
      const file = path.join('video', 'desk-lamps-normal.webm');
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
