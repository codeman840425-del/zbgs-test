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
  throw new Error('Usage: node qa-backdrop-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-backdrop-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const root = path.resolve(rootArg);
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const out = path.resolve(paths.at(-1));
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__backdrop-room-qa/three.core.js';
const looks = ['green', 'blue', 'print', 'sheer'].map(name => ({ id: 'backdrop-fabric-' + name, version: 1 }));
const near = (actual, expected, tolerance = 2e-4) => assert(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
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
  const idInRoom = roomId + '/backdrop';
  const backdrop = node(document, idInRoom);
  const home = id === 'backdrop-home';
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  assert(backdrop, 'Fixture needs the real backdrop: ' + idInRoom);
  assert.equal(backdrop.parentId, roomId);
  assert.equal(key(backdrop.resource), home ? 'backdrop-fabric-green@1' : 'backdrop-fabric-print@1');
  assert.equal(backdrop.state.deployment, home ? 1 : .5);
  near(backdrop.transform.yaw, (home ? -1 : 1) * Math.PI / 2);
  const floorId = node(document, roomId).parentId;
  near(node(document, floorId).transform.yaw, home ? 0 : Math.PI / 2);
  const deskId = roomId + '/station-1/desk', chairId = roomId + '/station-1/chair';
  assert(node(document, deskId) && node(document, chairId), 'A real desk and chair must be in each room');
  return { id, file, bytes, document, roomId, floorId, idInRoom, backdrop, deskId, chairId };
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

async function selectBackdrop(room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (view.mode !== 'room' || view.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.idInRoom);
  await setCamera(room);
}

async function choose(room, ref) {
  const select = page.locator('#edit-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), room.idInRoom);
  const choices = await select.locator('option').evaluateAll(items => items.map(item => item.value));
  for (const look of looks) assert(choices.includes(key(look)), 'Missing compatible look ' + key(look));
  if (await select.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.idInRoom).resource = ref;
  await select.selectOption(key(ref));
  await ready();
  assert.deepEqual(await current(), expected, 'Look selection keeps the instance, mounting, direction and state');
}

async function deploy(room, value) {
  const control = page.locator('#edit-states input[type="range"][aria-label="幕布展开程度"]');
  assert.equal(await control.getAttribute('min'), '0');
  assert.equal(await control.getAttribute('max'), '1');
  if (Number(await control.inputValue()) === value) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.idInRoom).state.deployment = value;
  await control.fill(String(value));
  await ready();
  assert.equal(Number(await control.inputValue()), value);
  assert.deepEqual(await current(), expected, 'Slider changes only this backdrop state and the document revision');
}

async function actualAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual backdrop GLB request: ' + asset.url);
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
  await selectBackdrop(room);
  return { savedSha256: sha(saved), pin, browserRestarted: true };
}


async function setCamera(room, optical = false) {
  await page.evaluate(async ({ id, deskId, optical, threeUrl }) => {
    const { Box3, Vector3 } = await import(threeUrl);
    const { session, camera } = company;
    const root = session.scene.root.getObjectByName(id);
    const world = coords => root.localToWorld(new Vector3().fromArray(coords));
    if (optical) {
      const desk = session.scene.root.getObjectByName(deskId);
      const target = new Box3().setFromObject(desk.children[0]).getCenter(new Vector3());
      const through = world([0, .85, 0]);
      camera.position.copy(through).addScaledVector(through.clone().sub(target).normalize(), 3.6);
      camera.lookAt(through);
    } else {
      camera.position.copy(world([-1.7, 3.2, 6.02]));
      camera.lookAt(world([.12, .78, 1.22]));
    }
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, { id: room.idInRoom, deskId: room.deskId, optical, threeUrl });
}

async function inspect(room, ref, value, samplePixels = false) {
  const result = await page.evaluate(async ({ id, deskId, chairId, threeUrl, samplePixels }) => {
    const { Box3, Raycaster, Vector3 } = await import(threeUrl);
    const { session, camera, renderer } = company;
    const { scene } = session;
    const entity = session.document.nodes.find(row => row.id === id);
    const resource = company.catalog.resources.find(row => row.id === entity.resource.id && row.version === entity.resource.version);
    const root = scene.root.getObjectByName(id);
    const visual = root.children[0];
    const meshes = new Map();
    visual.traverse(mesh => { if (mesh.isMesh) meshes.set(mesh.userData.name || mesh.name, mesh); });
    const sheet = meshes.get('fabric-sheet'), rail = meshes.get('lift-rail');
    const masts = [...meshes].filter(([name]) => /^lift-mast(?:$|[-_])/.test(name)).map(([, mesh]) => mesh);
    if (!sheet || !rail || !masts.length) throw new Error('Expected imported sheet, lift rail and mast geometry');
    scene.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const localBounds = objects => {
      const bounds = new Box3();
      for (const mesh of objects) {
        const intoRoot = inverse.clone().multiply(mesh.matrixWorld);
        const buffer = mesh.geometry.attributes.position;
        for (let i = 0; i < buffer.count; i++) {
          bounds.expandByPoint(new Vector3().fromBufferAttribute(buffer, i).applyMatrix4(intoRoot));
        }
      }
      return bounds;
    };
    const world = coords => root.localToWorld(new Vector3().fromArray(coords));
    const materials = [sheet.material].flat();
    const front = new Vector3(0, 0, 1).transformDirection(root.matrixWorld);
    const railBounds = localBounds([rail]);
    const railPosition = railBounds.getCenter(new Vector3()).toArray();
    let shown = false;
    scene.root.traverseVisible(mesh => { if (mesh === sheet) shown = true; });
    const isRenderedHit = hit => {
      const material = materials[hit.face.materialIndex] ?? materials[0];
      const planes = material.clippingPlanes ?? [];
      if (!material.visible || !renderer.localClippingEnabled || planes.length === 0) return material.visible;
      const outside = planes.map(plane => plane.distanceToPoint(hit.point) < -1e-6);
      return material.clipIntersection ? !outside.every(Boolean) : !outside.some(Boolean);
    };
    const hitAt = y => {
      if (!shown) return null;
      const ray = new Raycaster(world([0, y, 1]), front.clone().negate());
      const hit = ray.intersectObject(sheet, false).find(isRenderedHit);
      return hit ? { position: root.worldToLocal(hit.point.clone()).toArray(), uv: hit.uv?.toArray() } : null;
    };
    const deployment = entity.state.deployment ?? resource.stateDefaults.deployment;
    const sampleY = deployment > 0 ? .11 + 1.78 * deployment / 2 : .12;
    const surface = [hitAt(sampleY - .13), hitAt(sampleY + .13)];
    const uvSlope = surface.every(hit => hit?.uv) ? surface[1].uv.map((uv, i) => (uv - surface[0].uv[i]) / .26) : null;
    const coverage = { aboveSlot: hitAt(.13), belowSlot: hitAt(.09), nearTop: hitAt(1.78), center: hitAt(sampleY) };
    const furniture = [deskId, chairId].map(id => {
      const object = scene.root.getObjectByName(id);
      const center = new Box3().setFromObject(object.children[0]).getCenter(new Vector3()).project(camera);
      let visible = false;
      scene.root.traverseVisible(node => { if (node === object) visible = true; });
      return { id, visible, projectedCenter: center.toArray() };
    });
    const frame = new Box3();
    for (const x of [-1.05, 1.05]) for (const y of [0, 1.93]) for (const z of [-.15, .15]) {
      frame.expandByPoint(world([x, y, z]).project(camera));
    }
    const source = renderer.domElement;
    let pixels;
    if (samplePixels) {
      const x = Math.max(0, Math.floor((frame.min.x + 1) * source.width / 2) - 3);
      const y = Math.max(0, Math.floor((1 - frame.max.y) * source.height / 2) - 3);
      const w = Math.min(source.width, Math.ceil((frame.max.x + 1) * source.width / 2) + 3) - x;
      const h = Math.min(source.height, Math.ceil((1 - frame.min.y) * source.height / 2) + 3) - y;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const read = () => {
        company.drawHostFrame();
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const before = read();
      const originals = materials.map(material => [material.emissive.clone(), material.emissiveIntensity]);
      let tagged;
      try {
        for (const material of materials) {
          material.emissive.setRGB(1, 0, 1);
          material.emissiveIntensity = 5;
        }
        tagged = read();
      } finally {
        materials.forEach((material, index) => {
          material.emissive.copy(originals[index][0]);
          material.emissiveIntensity = originals[index][1];
        });
        company.drawHostFrame();
      }
      let count = 0, top = h, bottom = -1;
      for (let i = 0; i < before.length; i += 4) {
        const delta = Math.abs(tagged[i] - before[i]) + Math.abs(tagged[i + 1] - before[i + 1]) +
          Math.abs(tagged[i + 2] - before[i + 2]);
        if (delta <= 32) continue;
        const row = Math.floor(i / 4 / w);
        count++;
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
      }
      const digest = await crypto.subtle.digest('SHA-256', before);
      pixels = { crop: [x, y, w, h], count, screenY: count ? [y + top, y + bottom] : null,
        picture: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    }
    const stand = localBounds([...meshes].filter(([name]) => !['fabric-sheet', 'lift-rail', 'lift-mast'].includes(name)).map(([, mesh]) => mesh));
    return {
      ref: entity.resource, deployment, parentId: root.parent.name, asset: resource.asset, role: resource.mountRole,
      footprint: resource.footprint, pose: root.matrixWorld.toArray(), front: front.toArray(),
      camera: camera.matrixWorld.toArray(), frame: [frame.min.toArray(), frame.max.toArray()], furniture,
      railPosition, railTop: railBounds.max.y, standBounds: [stand.min.toArray(), stand.max.toArray()],
      mastBounds: localBounds(masts).getSize(new Vector3()).toArray(), meshNames: [...meshes.keys()],
      sheetSize: localBounds([sheet]).getSize(new Vector3()).toArray(), shown, coverage, uvSlope,
      sheetMaterials: materials.map(material => ({
        transparent: material.transparent, opacity: material.opacity, loadedMap: Boolean(material.map?.image),
        clippingPlanes: (material.clippingPlanes ?? []).map(plane => [...plane.normal.toArray(), plane.constant]),
      })),
      ...(samplePixels ? { pixels } : {}), renderError: company.renderStatus().lastRenderError,
    };
  }, { id: room.idInRoom, deskId: room.deskId, chairId: room.chairId, threeUrl, samplePixels });
  assert.deepEqual(result.ref, ref);
  assert.equal(result.role, 'background-fabric');
  assert.equal(result.parentId, room.roomId);
  assert.equal(result.deployment, value);
  assert.equal(result.renderError, null);
  assert(result.frame.every(corner => Math.abs(corner[0]) < 1 && Math.abs(corner[1]) < 1),
    'The room camera must show the entire floor rig: ' + JSON.stringify(result.frame));
  assert(result.furniture.every(item => item.visible && item.projectedCenter.slice(0, 2).every(c => Math.abs(c) < 1)),
    'The real desk and chair must remain in the same view: ' + JSON.stringify(result.furniture));
  assert.deepEqual(result.footprint.halfSize, [1.05, .15]);
  const [lower, upper] = result.standBounds;
  assert(result.meshNames.includes('foot-left') && result.meshNames.includes('foot-right'), 'Both floor supports must exist');
  assert(lower[0] >= -1.0502 && upper[0] <= 1.0502 && upper[0] - lower[0] >= 2.04, 'Actual stand must fit and span its declared width');
  assert(lower[2] >= -.1502 && upper[2] <= .1502 && upper[2] - lower[2] >= .26, 'Actual feet must fit and span their declared depth');
  near(result.sheetSize[1], 1.78 * value);
  near(result.mastBounds[1], 1.78 * value);
  if (value) assert(result.sheetSize[0] >= 1.95 && result.sheetSize[0] <= 2.10);
  near(lower[1], 0, .002);
  assert(result.railTop <= 1.9301 && upper[1] <= 1.9301, 'Assembly exceeds 1.93m');
  assert(!result.coverage.belowSlot, 'Fabric may not show below the 0.11m slot');
  assert.equal(Boolean(result.coverage.aboveSlot), value > 0);
  assert.equal(Boolean(result.coverage.center), value > 0);
  assert.equal(Boolean(result.coverage.nearTop), value === 1);
  assert.equal(result.sheetMaterials.every(material => material.transparent && material.opacity > 0 && material.opacity < 1),
    ref.id === 'backdrop-fabric-sheer');
  await actualAsset(result.asset);
  return result;
}

function compareDeployment(ref, states) {
  const [closed, half, open] = [.0, .5, 1].map(value => states.find(state => state.deployment === value));
  near(open.railPosition[1] - closed.railPosition[1], 1.78);
  near(half.railPosition[1] - closed.railPosition[1], .89);
  for (const axis of [0, 2]) {
    near(half.railPosition[axis], closed.railPosition[axis]);
    near(open.railPosition[axis], closed.railPosition[axis]);
  }
  assert.deepEqual([closed.standBounds, half.standBounds], [open.standBounds, open.standBounds]);
  assert.deepEqual([closed.pose, half.pose], [open.pose, open.pose]);
  assert.deepEqual([closed.camera, half.camera], [open.camera, open.camera]);
  const counts = [closed, half, open].map(state => state.pixels.count);
  const [hiddenPixels, partialPixels, fullPixels] = counts;
  assert(fullPixels >= 4000 && partialPixels >= 1800 && hiddenPixels < fullPixels * .01,
    'Expected visible open/half cloth and no exposed cloth when stowed: ' + counts);
  assert(partialPixels > fullPixels * .25 && partialPixels < fullPixels * .75,
    'The half curtain pixel area must fall between closed and open: ' + counts);
  assert.equal(new Set(states.map(state => state.pixels.picture)).size, 3);
  if (ref.id === 'backdrop-fabric-print') {
    assert(open.sheetMaterials.every(material => material.loadedMap), 'Printed GLB needs a visible actual texture');
    assert(open.uvSlope && half.uvSlope && Math.abs(open.uvSlope[1]) > .1);
    near(open.uvSlope[0], half.uvSlope[0], .001);
    near(open.uvSlope[1], half.uvSlope[1], .001);
    near(open.sheetSize[0], half.sheetSize[0]);
  }
  return { clothPixelsAtClosedHalfFull: counts, railTravel: open.railPosition[1] - closed.railPosition[1],
    printUvPerMetre: ref.id === 'backdrop-fabric-print' ? [half.uvSlope, open.uvSlope] : undefined };
}

async function throughSheer(room) {
  assert.equal((await current()).nodes.find(row => row.id === room.idInRoom).state.deployment, 1);
  await setCamera(room, true);
  try {
    const result = await page.evaluate(({ id, deskId }) => {
      const { session, renderer, camera } = company;
      const root = session.scene.root.getObjectByName(id);
      const fabric = root.getObjectByName('fabric-sheet');
      const desk = session.scene.root.getObjectByName(deskId);
      const shadow = [];
      desk.traverseVisible(part => {
        if (part.castShadow) shadow.push(part);
      });
      const originals = { fabricVisible: fabric.visible, deskVisible: desk.visible, material: fabric.material, clothShadow: fabric.castShadow };
      const materials = [fabric.material].flat().map(material => {
        const clone = material.clone();
        clone.transparent = false;
        clone.opacity = 1;
        clone.alphaTest = 0;
        clone.depthWrite = true;
        if ('transmission' in clone) clone.transmission = 0;
        return clone;
      });
      const canvas = document.createElement('canvas');
      canvas.width = renderer.domElement.width;
      canvas.height = renderer.domElement.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const read = (image = false) => {
        company.drawHostFrame();
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(renderer.domElement, 0, 0);
        return { data: context.getImageData(0, 0, canvas.width, canvas.height).data,
          image: image ? canvas.toDataURL().split(',')[1] : undefined };
      };
      const pair = () => {
        desk.visible = true;
        const shown = read(true);
        desk.visible = false;
        return [shown, read()];
      };
      let sheer, bare, opaque;
      try {
        fabric.castShadow = false;
        shadow.forEach(part => { part.castShadow = false; });
        sheer = pair();
        fabric.visible = false;
        bare = pair();
        fabric.visible = true;
        fabric.material = Array.isArray(originals.material) ? materials : materials[0];
        opaque = pair();
      } finally {
        desk.visible = originals.deskVisible;
        fabric.visible = originals.fabricVisible;
        fabric.material = originals.material;
        fabric.castShadow = originals.clothShadow;
        shadow.forEach(part => { part.castShadow = true; });
        materials.forEach(material => material.dispose());
        company.drawHostFrame();
      }
      const delta = (a, b, i) => Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      let covered = 0, transmitted = 0, bareSignal = 0, sheerSignal = 0;
      for (let i = 0; i < bare[0].data.length; i += 4) {
        const unobstructed = delta(bare[0], bare[1], i);
        if (unobstructed < 24 || delta(opaque[0], opaque[1], i) > 3 || delta(sheer[0], bare[0], i) < 8) continue;
        const through = delta(sheer[0], sheer[1], i);
        covered++;
        if (through >= 8) transmitted++;
        bareSignal += unobstructed;
        sheerSignal += through;
      }
      return {
        targetId: deskId, camera: camera.matrixWorld.toArray(), covered, transmitted,
        retainedSignal: bareSignal ? sheerSignal / bareSignal : 0,
        images: { 'as-built': sheer[0].image, 'hidden-control': bare[0].image, 'opaque-control': opaque[0].image },
      };
    }, { id: room.idInRoom, deskId: room.deskId });
    const files = [];
    for (const [label, encoded] of Object.entries(result.images)) {
      const file = room.id + '-sheer-' + label + '.png';
      await fs.writeFile(path.join(out, file), Buffer.from(encoded, 'base64'));
      files.push(file);
    }
    const { images, ...facts } = result;
    const optical = { ...facts, images: files };
    report.optical = optical;
    assert(facts.covered >= 400 && facts.transmitted >= 300 && facts.transmitted / facts.covered > .6 &&
      facts.retainedSignal > .15, 'The actual desk must visibly transmit through the cloth: ' + JSON.stringify(facts));
    return optical;
  } finally {
    await setCamera(room);
  }
}

async function inspectRoom(room, index) {
  stage = room.id + ': load the authored room';
  const profile = await fs.mkdtemp(path.join(out, 'chromium-'));
  await open(profile);
  await load(room);
  await selectBackdrop(room);
  const initial = await inspect(room, room.backdrop.resource, room.backdrop.state.deployment);
  const entry = { id: room.id, input: room.file, saveSha256: sha(room.bytes), initial, looks: [] };
  report.rooms.push(entry);
  const order = [...looks.filter(ref => key(ref) !== key(room.backdrop.resource)), room.backdrop.resource];
  const hashes = new Set();
  for (const [lookIndex, ref] of order.entries()) {
    stage = room.id + ': ' + key(ref) + ' deploy and cold reopen';
    await choose(room, ref);
    const states = [], images = [];
    const reopenAt = [0, .5, 1][(lookIndex + index) % 3];
    const values = [0, .5, 1].filter(value => value !== reopenAt).concat(reopenAt);
    for (const value of values) {
      await deploy(room, value);
      const actual = await inspect(room, ref, value, true);
      states.push(actual);
      assert.deepEqual(actual.pose, initial.pose);
      assert.deepEqual(actual.footprint, initial.footprint);
      if (value === 1 || ref.id === 'backdrop-fabric-print') {
        const step = value === 1 ? 'full' : value === .5 ? 'half' : 'stowed';
        images.push(await screenshot(room.id + '-' + ref.id + '-' + step + '.png'));
      }
      if (index === 1 && value === 1 && ref.id === 'backdrop-fabric-sheer') await throughSheer(room);
    }
    const measurement = compareDeployment(ref, states);
    const last = states.at(-1);
    assert(!hashes.has(last.asset.sha256), 'Each fabric needs distinct immutable GLB bytes');
    hashes.add(last.asset.sha256);
    const saved = await saveReopen(room, profile, ref);
    const restored = await inspect(room, ref, reopenAt);
    const { pixels, ...expected } = last;
    assert.deepEqual(restored, expected);
    entry.looks.push({ ref, states, images, measurement, saved, restored });
  }
  await close();
}

async function record(rooms) {
  stage = 'record representative room paths at normal speed';
  const profile = await fs.mkdtemp(path.join(out, 'recording-'));
  await open(profile, true);
  await load(rooms[0]);
  await selectBackdrop(rooms[0]);
  await page.waitForTimeout(1100);
  await choose(rooms[0], looks[2]);
  for (const value of [1, .5, 0, 1]) {
    await deploy(rooms[0], value);
    await page.waitForTimeout(1250);
  }
  await choose(rooms[0], looks[1]);
  await page.waitForTimeout(1200);
  await load(rooms[1]);
  await selectBackdrop(rooms[1]);
  await choose(rooms[1], looks[3]);
  await deploy(rooms[1], 1);
  await page.waitForTimeout(1900);
  const raw = await page.video().path();
  await close();
  const file = 'video/backdrop-rooms-normal.webm';
  await fs.rename(raw, path.join(out, file));
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
  const rooms = await Promise.all(['backdrop-home', 'backdrop-rental'].map(fixture));
  baseUrl = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  for (const [index, room] of rooms.entries()) await inspectRoom(room, index);
  const [home, rental] = report.rooms.map(room => room.initial.front);
  near(home.reduce((sum, value, index) => sum + value * rental[index], 0), 0);
  assert(report.optical, 'Expected real scene visibility proof for the sheer fabric');
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
    await devServer?.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const exit = once(packageServer, 'exit');
      packageServer.kill();
      await exit;
    }
    if (outputCreated) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video?.file }));
  }
});
