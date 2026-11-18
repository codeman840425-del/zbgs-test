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
  throw new Error('Usage: node qa-wall-ambient-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-wall-ambient-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const root = path.resolve(rootArg);
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const out = path.resolve(paths.at(-1));
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__wall-ambient-qa/three.module.js';
const looks = ['strip', 'star', 'wash', 'studio'].map(name => ({ id: 'wall-ambient-' + name, version: 1 }));
const near = (actual, expected, tolerance = 1e-5) => assert(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
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
  const lampId = roomId + '/ambient';
  const fixture = node(document, lampId);
  const floorId = node(document, roomId).parentId;
  const deskId = roomId + '/station-1/desk';
  const fillId = roomId + '/station-1/fill-light';
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  assert(fixture && node(document, deskId) && node(document, fillId));
  assert.equal(fixture.parentId, roomId);
  assert.deepEqual(fixture.transform.position, [id === 'ambient-home' ? -.83 : .79, 1.4, -1.9]);
  near(fixture.transform.yaw, 0);
  near(node(document, floorId).transform.yaw, id === 'ambient-home' ? 0 : Math.PI / 2);
  return { id, file, bytes, document, roomId, floorId, lampId, deskId, fillId, fixture };
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**/__wall-ambient-qa/*.js', route => route.fulfill({
    contentType: 'text/javascript', body: threeSource[path.posix.basename(new URL(route.request().url()).pathname)],
  }));
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

async function showLamp(room, selection = room.lampId) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (view.mode !== 'room' || view.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(selection);
  await setCamera(room, selection);
}

async function choose(room, ref) {
  const select = page.locator('#edit-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), room.lampId);
  const choices = await select.locator('option').evaluateAll(items => items.map(item => item.value));
  for (const look of looks) assert(choices.includes(key(look)), 'Missing compatible look ' + key(look));
  if (await select.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.lampId).resource = ref;
  await select.selectOption(key(ref));
  await ready();
  assert.deepEqual(await current(), expected, 'Look selection keeps the instance, mounting, direction and state');
}

async function actualAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual ambient GLB request: ' + asset.url);
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
  await showLamp(room);
  return { savedSha256: sha(saved), pin, browserRestarted: true };
}


async function setCamera(room, id = room.lampId) {
  await page.evaluate(id => {
    const { session, camera } = company;
    const root = session.scene.root.getObjectByName(id);
    const entity = session.document.nodes.find(node => node.id === id);
    const side = Math.sign(entity.transform.position[0]);
    const world = coords => root.localToWorld(camera.position.clone().fromArray(coords));
    camera.position.copy(world([-.88 * side, .83, 3.55]));
    camera.lookAt(world([-.44 * side, -.34, .43]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, id);
}

async function activeState(id) {
  return page.evaluate(id => {
    const entry = company.session.document.nodes.find(node => node.id === id);
    const resource = company.catalog.resources.find(row => row.id === entry.resource.id && row.version === entry.resource.version);
    return { ...resource.stateDefaults, ...entry.state };
  }, id);
}

async function setState(id, desired) {
  assert.equal(await page.locator('#edit-instance').inputValue(), id);
  const before = await activeState(id);
  for (const field of ['on', 'intensity', 'colorHue']) {
    const value = desired[field];
    if (value === undefined || value === before[field]) continue;
    const expected = await current();
    expected.revision++;
    node(expected, id).state[field] = value;
    if (field === 'on') {
      const button = page.locator('#edit-states').getByRole('button', { name: /^(灯光|电源)[：:]/ });
      await button.click();
    } else {
      const maximum = field === 'intensity' ? 8 : 359;
      const input = page.locator('#edit-states input[type=range][max="' + maximum + '"]');
      if (field === 'colorHue') assert.equal(await input.getAttribute('step'), '1');
      await input.fill(String(value));
      assert.equal(Number(await input.inputValue()), value);
    }
    await ready();
    assert.deepEqual(await current(), expected, 'Only the selected light state and revision should change');
  }
  const after = await activeState(id);
  assert.deepEqual(after, { ...before, ...desired });
  return after;
}

async function inspect(room, ref, id = room.lampId, verifyBytes = false) {
  const fact = await page.evaluate(({ id, deskId }) => {
    const { session, camera } = company;
    const { scene } = session;
    const entity = session.document.nodes.find(node => node.id === id);
    const resource = company.catalog.resources.find(row => row.id === entity.resource.id && row.version === entity.resource.version);
    const root = scene.root.getObjectByName(id);
    const { children } = root;
    const sources = children.filter(object => object.isSpotLight);
    const emitter = root.getObjectByName('ambient-diffuser');
    if (sources.length !== 1 || !emitter?.isMesh) throw new Error('Expected one real spotlight and the imported ambient-diffuser mesh');
    const light = sources[0];
    const visible = object => {
      for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
      return Boolean(object);
    };
    scene.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const v = () => camera.position.clone();
    const origin = light.getWorldPosition(v()), target = light.target.getWorldPosition(v());
    const direction = target.clone().sub(origin).normalize();
    const lens = emitter.getWorldPosition(v());
    const inCamera = point => point.clone().project(camera).toArray();
    const rendered = [];
    const inverse = root.matrixWorld.clone().invert();
    const min = v().set(Infinity, Infinity, Infinity), max = v().set(-Infinity, -Infinity, -Infinity);
    const vertex = v();
    root.children[0].traverse(mesh => {
      if (!mesh.isMesh) return;
      const transform = inverse.clone().multiply(mesh.matrixWorld);
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(transform);
        min.min(vertex); max.max(vertex);
      }
    });
    scene.root.traverseVisible(object => {
      if (object.isSpotLight || object.isPointLight)
        rendered.push({ id: object.parent.name, kind: object.type, intensity: object.intensity, color: object.color.getHexString() });
    });
    rendered.sort((a, b) => a.id.localeCompare(b.id));
    return {
      facility: { id: entity.id, parentId: entity.parentId, ref: entity.resource, transform: entity.transform },
      state: { ...resource.stateDefaults, ...entity.state }, asset: resource.asset,
      contract: { mount: resource.mount, role: resource.mountRole, mounting: resource.mounting },
      light: { origin: origin.toArray(), target: target.toArray(), direction: direction.toArray(),
        intensity: light.intensity, visible: visible(light), shadow: light.castShadow, color: light.color.getHexString(),
        distance: light.distance, angle: light.angle, penumbra: light.penumbra },
      emitter: { visible: visible(emitter), object: emitter.name, projected: inCamera(lens),
        materials: [emitter.material].flat().map(material => ({
          rgb: material.color.getHexString(), emission: material.emissive.getHexString(), intensity: material.emissiveIntensity,
        })) },
      meshBounds: [min.toArray(), max.toArray()],
      deskExists: Boolean(scene.root.getObjectByName(deskId)?.getObjectByName('desktop')),
      camera: camera.matrixWorld.toArray(), pose: root.matrixWorld.toArray(), rendered,
      planned: scene.snapshot().lights.map(({ id, intensity }) => ({id, intensity})).filter(light => light.intensity > 0)
        .sort((a, b) => a.id.localeCompare(b.id)),
      renderError: company.renderStatus().lastRenderError,
    };
  }, { id, deskId: room.deskId });
  assert.deepEqual(fact.facility.ref, ref);
  assert.equal(fact.facility.parentId, room.roomId);
  assert.equal(fact.contract.mount, 'wall');
  assert.equal(fact.contract.role, 'ambient-led-and-neon');
  const { width, height, depth } = fact.contract.mounting;
  assert.deepEqual([width, height, depth], [.62, .35, .04]);
  const [min, max] = fact.meshBounds;
  assert(min[0] >= -.311 && max[0] <= .311 && min[1] >= -.176 && max[1] <= .176 && min[2] >= -.001 && max[2] <= .041);
  assert(fact.emitter.visible && fact.emitter.projected.slice(0, 2).every(value => Math.abs(value) < 1));
  assert(fact.deskExists);
  assert.equal(fact.light.shadow, false);
  assert.equal(fact.renderError, null);
  assert(fact.rendered.length <= 2);
  assert.deepEqual(fact.rendered.map(({ id, intensity }) => ({ id, intensity })), fact.planned);
  const requested = fact.state.on && fact.state.intensity > 0;
  assert.equal(fact.emitter.materials.every(material => material.intensity > 0 && material.emission !== '000000'), requested);
  if (requested) {
    for (const material of fact.emitter.materials) {
      assert.equal(material.emission, fact.light.color);
      near(material.intensity, 1.5 * fact.state.intensity / 8);
    }
    if (fact.light.visible) near(fact.light.intensity, fact.state.intensity);
  } else {
    assert.equal(fact.light.intensity, 0);
    assert.equal(fact.light.visible, false);
    assert(fact.emitter.materials.every(material => material.intensity === 0 || material.emission === '000000'));
  }
  if (verifyBytes) await actualAsset(fact.asset);
  return fact;
}

async function prepareMask(room, id = room.lampId) {
  const info = await page.evaluate(async ({ id, deskId, threeUrl }) => {
    const { MeshBasicMaterial, Raycaster, Vector3 } = await import(threeUrl);
    const { session, camera, renderer } = company;
    const scene = session.scene;
    const root = scene.root.getObjectByName(id);
    const desktop = scene.root.getObjectByName(deskId)?.getObjectByName('desktop');
    const emitter = root.getObjectByName('ambient-diffuser');
    if (!desktop?.isMesh || !emitter?.isMesh) throw new Error('The mask needs the actual tabletop and actual diffuser');
    if ([desktop.material].flat().some(m => m.emissive?.getHex() > 0 && m.emissiveIntensity > 0))
      throw new Error('The real tabletop must be nonemissive');
    const { width, height } = renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const copy = () => {
      company.drawHostFrame();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(renderer.domElement, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const selected = [
      { name: 'desktop', mesh: desktop, color: 0xff00ff, indices: [] },
      { name: 'diffuser', mesh: emitter, color: 0x00ff00, indices: [] },
    ];
    for (const part of selected) {
      part.old = part.mesh.material;
      part.marker = [part.old].flat().map(material => new MeshBasicMaterial({
        color: part.color, toneMapped: false, side: material.side,
      }));
    }
    let mask;
    try {
      for (const part of selected) part.mesh.material = Array.isArray(part.old) ? part.marker : part.marker[0];
      mask = copy();
    } finally {
      for (const part of selected) {
        part.mesh.material = part.old;
        part.marker.forEach(marker => marker.dispose());
      }
      company.drawHostFrame();
    }
    for (let y = 1; y < height - 1; y += 2) for (let x = 1; x < width - 1; x += 2) {
      const i = (y * width + x) * 4;
      if (mask[i] >= 252 && mask[i + 1] <= 3 && mask[i + 2] >= 252) selected[0].indices.push(i);
      if (mask[i] <= 3 && mask[i + 1] >= 252 && mask[i + 2] <= 3) selected[1].indices.push(i);
    }
    // Use only real receiver pixels at fixed coordinates across all natural frames.
    // The highlight pass restored every material before capturing any evidence.
    window.wallAmbientQaMask = { id, width, height, selected: selected.map(({ name, indices }) => ({ name, indices })),
      camera: camera.matrixWorld.toArray() };
    const spot = root.children.find(node => node.isSpotLight);
    const from = spot.getWorldPosition(new Vector3()), to = spot.target.getWorldPosition(new Vector3());
    const ray = new Raycaster(from, to.clone().sub(from).normalize());
    const hit = ray.intersectObject(desktop, false)[0];
    return { desktop: selected[0].indices.length, diffuser: selected[1].indices.length,
      aimHit: hit?.point.toArray() ?? null,
      receiver: { id: deskId, mesh: desktop.name }, resolution: [width, height], camera: camera.matrixWorld.toArray() };
  }, { id, deskId: room.deskId, threeUrl });
  assert(info.desktop >= 400 && info.diffuser >= 10, 'Camera must show the actual desktop and luminous mesh: ' + JSON.stringify(info));
  return info;
}

async function readExposures(id, muteEmitter = false) {
  const sampled = await page.evaluate(({ id, muteEmitter }) => {
    const { renderer, camera, session } = company;
    const mask = window.wallAmbientQaMask;
    if (mask.id !== id || renderer.domElement.width !== mask.width || renderer.domElement.height !== mask.height ||
        JSON.stringify(camera.matrixWorld.toArray()) !== JSON.stringify(mask.camera)) throw new Error('Exposure moved from its starting sample');
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const emitter = session.scene.root.getObjectByName(id).getObjectByName('ambient-diffuser');
    const strengths = [emitter.material].flat().map(material => [material, material.emissiveIntensity]);
    let data;
    try {
      if (muteEmitter) for (const [material] of strengths) material.emissiveIntensity = 0;
      company.drawHostFrame();
      ctx.drawImage(renderer.domElement, 0, 0);
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    } finally {
      if (muteEmitter) {
        for (const [material, intensity] of strengths) material.emissiveIntensity = intensity;
        company.drawHostFrame();
      }
    }
    return Object.fromEntries(mask.selected.map(({ name, indices }) =>
      [name, btoa(indices.map(i => String.fromCharCode(data[i], data[i + 1], data[i + 2])).join(''))]));
  }, { id, muteEmitter });
  return Object.fromEntries(Object.entries(sampled).map(([name, values]) => [name, Buffer.from(values, 'base64')]));
}

function gain(dark, light) {
  assert.equal(dark.length, light.length);
  const channel = [0, 0, 0];
  let changed = 0, stronger = 0, peak = 0, strongest = [];
  for (let i = 0; i < dark.length; i += 3) {
    const delta = channel.map((_, n) => light[i + n] - dark[i + n]);
    for (let n = 0; n < 3; n++) channel[n] += delta[n];
    const sum = delta.reduce((a, b) => a + b, 0);
    if (sum >= 12) stronger++;
    if (delta.some(value => Math.abs(value) > 3)) changed++;
    if (sum > peak) {
      peak = sum;
      strongest = delta;
    }
  }
  return { samples: dark.length / 3, changed, stronger, channel, total: channel.reduce((a, b) => a + b, 0), peak, strongest };
}

function otherLights(fact, id) {
  return fact.rendered.filter(light => light.id !== id);
}

async function measureLighting(room, ref) {
  stage = room.id + ': fixed viewpoint real desktop illumination';
  const mask = await prepareMask(room);
  const states = [
    ['off', { on: false, intensity: 8, colorHue: 30 }],
    ['zero', { on: true, intensity: 0, colorHue: 30 }],
    ['medium', { on: true, intensity: 4, colorHue: 30 }],
    ['warm', { on: true, intensity: 8, colorHue: 30 }],
    ['cool', { on: true, intensity: 8, colorHue: 195 }],
  ];
  const exposures = {};
  for (const [key, desired] of states) {
    await setState(room.lampId, desired);
    const fact = await inspect(room, ref);
    const values = await readExposures(room.lampId);
    const image = ['off', 'warm', 'cool'].includes(key) ? await screenshot(room.id + '-' + key + '-actual.png') : undefined;
    exposures[key] = { fact, values, image };
  }
  const baseline = exposures.off;
  const comparisons = Object.fromEntries(Object.entries(exposures).map(([key, { fact, image, values }]) => {
    assert.deepEqual(fact.camera, baseline.fact.camera);
    assert.deepEqual(fact.pose, baseline.fact.pose);
    assert.deepEqual(otherLights(fact, room.lampId), otherLights(baseline.fact, room.lampId),
      'Original workstation light must remain the same throughout the exposures');
    return [key, { fact, image, desktop: gain(baseline.values.desktop, values.desktop),
      diffuser: gain(baseline.values.diffuser, values.diffuser) }];
  }));
  const result = { mask, comparisons };
  report.lighting ??= {};
  report.lighting[room.id] = result;
  const { zero, medium, warm, cool } = comparisons;
  assert.equal(zero.fact.light.intensity, 0);
  assert(zero.desktop.changed < 6, 'Zero intensity must be dark on the real tabletop');
  assert(medium.fact.light.visible && warm.fact.light.visible && cool.fact.light.visible);
  assert(warm.fact.light.intensity > medium.fact.light.intensity && medium.fact.light.intensity > 0);
  near(warm.fact.light.intensity, cool.fact.light.intensity);
  assert.notEqual(warm.fact.light.color, cool.fact.light.color);
  assert(medium.desktop.stronger >= 25 && warm.desktop.stronger >= 50 && cool.desktop.stronger >= 50,
    'Expected a real nonemissive desk highlight in medium, warm and cool views: ' +
    JSON.stringify([medium.desktop, warm.desktop, cool.desktop]));
  assert(warm.desktop.total > medium.desktop.total && medium.desktop.total > 0);
  assert(warm.desktop.channel[0] > warm.desktop.channel[2] && cool.desktop.channel[2] > cool.desktop.channel[0],
    'Warm and cool must reach the same actual desktop as different colors');
  assert(warm.diffuser.changed > 8 && cool.diffuser.changed > 8, 'Actual fixture color should also be visible');
  return result;
}

async function verifyBudget(room) {
  stage = room.id + ': two real lights and retained self-glow';
  const before = await current();
  const primary = node(before, room.lampId);
  await setState(room.lampId, { on: true, intensity: 8, colorHue: 30 });
  const extraId = room.roomId + '/ambient-budget';
  const auxiliary = {type:'add-facility', id:extraId, parentId:room.roomId,
    resource:looks[0], transform:{position:[-.83, 1.4, -1.9], yaw:0},
    state:{on:true, intensity:8, colorHue:30}};
  await page.evaluate(operation => company.apply([operation]), auxiliary);
  await ready();
  assert(node(await current(), extraId));
  await showLamp(room);
  const on = await inspect(room, primary.resource);
  assert.equal(on.rendered.length, 2, 'Renderer must cap the full room to two punctual lights');
  assert(on.rendered.some(row => row.id === room.fillId), 'Live station fill must keep its slot');
  const ambientIds = [room.lampId, extraId];
  const suppressed = ambientIds.find(id => !on.rendered.some(row => row.id === id));
  assert(suppressed && on.rendered.some(row => ambientIds.includes(row.id)), 'Exactly one of the requested ambient lights may contribute');
  const chosen = suppressed === room.lampId ? primary.resource : auxiliary.resource;
  await showLamp(room, suppressed);
  const lit = await inspect(room, chosen, suppressed, true);
  const mask = await prepareMask(room, suppressed);
  assert.equal(lit.light.intensity, 0);
  assert.equal(lit.light.visible, false);
  assert(lit.state.on && lit.state.intensity > 0 && lit.emitter.materials.every(material => material.intensity > 0));
  const litPixels = await readExposures(suppressed);
  const litImage = await screenshot(room.id + '-budget-diffuser-lit.png');
  const emissionMuted = await readExposures(suppressed, true);
  await setState(suppressed, { on: false });
  const dark = await inspect(room, chosen, suppressed);
  const darkPixels = await readExposures(suppressed);
  const darkImage = await screenshot(room.id + '-budget-diffuser-off.png');
  assert.deepEqual(lit.rendered, dark.rendered, 'Turning off the budgeted-out fixture must leave the two real lights unchanged');
  const diffuser = gain(emissionMuted.diffuser, litPixels.diffuser);
  const diffuserOnOff = gain(darkPixels.diffuser, litPixels.diffuser);
  const desktop = gain(darkPixels.desktop, litPixels.desktop);
  assert(diffuser.stronger >= 10, 'Suppressed fixture must still visibly glow');
  assert(desktop.stronger <= 3, 'Self-glow must not add a third light to the real desktop');
  await setState(suppressed, { on: true });
  const initialView = await current();
  const work = room.id + '/ground/work';
  stage = room.id + ': focus another room and return';
  await page.locator('#room').selectOption(work);
  await ready();
  const away = await page.evaluate(() => ({ view:company.session.scene.view, lights:company.session.scene.snapshot().lights }));
  assert.equal(away.view.roomId, work);
  assert(!away.lights.some(light => light.id.startsWith(room.roomId + '/') && light.intensity > 0));
  await showLamp(room, suppressed);
  const returned = await inspect(room, chosen, suppressed);
  assert.deepEqual(returned.rendered, lit.rendered);
  assert.deepEqual(await current(), initialView);
  report.budget = { fill: room.fillId, suppressed, scheduled: lit.rendered, meshSignal: diffuser, diffuserOnOff, desktop, mask,
    photos: [litImage, darkImage], away, returns: returned.rendered };
}

async function inspectRoom(room, roomIndex) {
  stage = room.id + ': load authored live room';
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  await open(profile);
  await load(room);
  await showLamp(room);
  const reference = await inspect(room, room.fixture.resource, room.lampId, true);
  const entry = { id:room.id, fixture:room.file, sourceSha256:sha(room.bytes), reference, looks:[] };
  report.rooms.push(entry);
  await measureLighting(room, room.fixture.resource);
  const order = [...looks.filter(ref => key(ref) !== key(room.fixture.resource)), room.fixture.resource];
  const hashes = new Set();
  for (const [index, ref] of order.entries()) {
    stage = room.id + ': ' + key(ref) + ' swap and cold reopen';
    await choose(room, ref);
    const visual = { on:true, intensity:index % 2 ? 8 : 6, colorHue:(index + roomIndex) % 2 ? 195 : 30 };
    await setState(room.lampId, visual);
    const shown = await inspect(room, ref, room.lampId, true);
    assert.deepEqual(shown.pose, reference.pose);
    assert.deepEqual(shown.facility.transform, reference.facility.transform);
    assert.deepEqual(shown.contract, reference.contract);
    assert(!hashes.has(shown.asset.sha256), 'Each wall light requires its own loaded model');
    hashes.add(shown.asset.sha256);
    const image = await screenshot(room.id + '-' + ref.id + '.png');
    if ((index + roomIndex) % 3 === 1) await setState(room.lampId, { on:false });
    const savedState = await inspect(room, ref);
    const saved = await saveReopen(room, profile, ref);
    const restored = await inspect(room, ref, room.lampId, true);
    assert.deepEqual(restored, savedState);
    entry.looks.push({ ref, shown, image, saved, restored });
  }
  if (roomIndex === 1) await verifyBudget(room);
  await close();
}

async function record(rooms) {
  stage = 'normal-speed short recording';
  const profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
  await open(profile, true);
  await load(rooms[0]);
  await showLamp(rooms[0]);
  const id = rooms[0].lampId;
  for (const [index, ref] of looks.entries()) {
    await choose(rooms[0], ref);
    await setState(id, { on:true, intensity:8, colorHue:index % 2 ? 195 : 30 });
    await page.waitForTimeout(1300);
    if (index === 1) {
      await setState(id, { on:false });
      await page.waitForTimeout(900);
      await setState(id, { on:true, colorHue:30 });
      await page.waitForTimeout(1100);
    }
  }
  await load(rooms[1]);
  await showLamp(rooms[1]);
  await setState(rooms[1].lampId, { on:true, intensity:8, colorHue:195 });
  await page.waitForTimeout(1900);
  const raw = await page.video().path();
  await close();
  const file = 'video/wall-ambient-rooms-normal.webm';
  await fs.rename(raw, path.join(out, file));
  const { size } = await fs.stat(path.join(out, file));
  assert(size);
  report.video = { file, bytes:size, playbackSpeed:1 };
}

async function run() {
  await fs.mkdir(path.dirname(out), { recursive:true });
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
  const folder = path.resolve(__dirname, '../../prototype/node_modules/three/build');
  const sources = await Promise.all(['three.core.js','three.module.js'].map(file => fs.readFile(path.join(folder, file), 'utf8')));
  threeSource = Object.fromEntries(['three.core.js','three.module.js'].map((file, index) => [file, sources[index]]));
  const rooms = await Promise.all(['ambient-home','ambient-rental'].map(fixture));
  baseUrl = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  for (const [index, room] of rooms.entries()) await inspectRoom(room, index);
  const [home, rental] = report.rooms.map(room => room.reference.light.direction);
  assert(Math.hypot(...home.map((value, index) => value-rental[index])) > .5, 'Second light is actually rotated in world');
  if (recordRequested) await record(rooms);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message:error.message, stack:error.stack };
  if (page) await screenshot('failure.png').catch(() => {});
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
    console.log(JSON.stringify({ status:report.status, build, output:out, video:report.video?.file }));
  }
});
