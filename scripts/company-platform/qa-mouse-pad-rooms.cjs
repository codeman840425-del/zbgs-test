const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { chromium } = require('../../prototype/node_modules/playwright');

const [inputArg, build, ...options] = process.argv.slice(2);
const recording = options.includes('--record');
const paths = options.filter(option => option !== '--record');
if (!inputArg || !/^[a-f0-9]{12}$/.test(build) || ![1, 2].includes(paths.length) ||
    paths.some(option => option.startsWith('--')) || options.length - paths.length > 1) {
  throw new Error('Usage: node qa-mouse-pad-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-mouse-pad-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const input = path.resolve(inputArg);
const out = path.resolve(paths.at(-1));
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const view = { width: 1500, height: 950 };
const rayUrl = '/__mouse-pad-qa/three.core.js';
const looks = ['office', 'gaming', 'trackball', 'desk-mat'].map(name => ({ id: 'mouse-pad-' + name, version: 1 }));
const key = ref => ref.id + '@' + ref.version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const node = (doc, id) => doc.nodes.find(row => row.id === id);
const read = file => fs.readFile(path.join(input, file));
const current = () => page.evaluate(() => company.session.document);
const savedText = id => page.evaluate(id => company.session.readSavedText(id), id);
const near = (actual, expected, tolerance = 1e-5) => assert(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
const nearVector = (actual, expected, tolerance) => expected.forEach((value, index) => near(actual[index], value, tolerance));
const report = { status: 'running', build, checks: [], errors: [], video: { enabled: recording, playbackSpeed: 1 } };
let manifest, server, child, url, browser, page, requests, stage, rayModule;

async function pinned(file) {
  const bytes = await read(file);
  const entry = manifest.files.find(item => item.path === file);
  assert.equal(entry?.bytes, bytes.length, file);
  assert.equal(entry.sha256, hash(bytes), file);
  return bytes;
}

async function startServer() {
  if (!manifest) {
    const { serve } = require('./serve.cjs');
    server = await serve(input, build, { manifest: 'company-build-info.json', entry: 'company.html', port: 0 });
    return new URL(server.url);
  }
  child = spawn(process.execPath, ['serve.mjs', '0'], { cwd: input, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line', { signal: AbortSignal.timeout(20000) }),
      once(child, 'exit').then(([code]) => { throw new Error('Package server exited before ready: ' + code); }),
    ]);
    const address = new URL(line);
    assert.equal(address.origin, 'http://127.0.0.1:' + address.port);
    assert(address.port && address.pathname === '/company.html');
    address.search = '';
    return address;
  } finally {
    lines.close();
    child.stdout.resume();
  }
}

async function fixture(id, appearance, connected) {
  let bytes, file, request;
  if (batch) {
    file = path.join(batch, id, 'save.json');
    bytes = await fs.readFile(file);
  } else {
    const room = 'data/rooms/' + id + '/save.json';
    file = manifest.files.some(row => row.path === room) ? room : 'data/save.json';
    bytes = await pinned(file);
    request = file === room ? '/delivery-room/' + id + '.json' : '/delivery-save.json';
  }
  const envelope = JSON.parse(bytes);
  const doc = envelope.document;
  assert.equal(envelope.schema, 'company-save');
  assert.equal(doc.id, id);
  const roomId = id + '/ground/live', station = roomId + '/station-1';
  const deskId = station + '/desk', mouseId = station + '/mouse', cableId = station + '/mouse-cable';
  const mouse = node(doc, mouseId), desk = node(doc, deskId);
  assert.equal(mouse?.parentId, deskId);
  assert(desk, 'Expected the actual station desk');
  assert.equal(mouse.resource.id, 'mouse-pad-' + appearance);
  assert.equal(mouse.resource.version, 1);
  if (connected) {
    const cable = node(doc, cableId);
    assert.equal(cable?.parentId, deskId);
    const links = Object.values(cable.cableLink);
    assert(links.some(link => link.deviceId === mouseId && link.portId === 'usb'));
    const monitor = links.find(link => link.deviceId !== mouseId);
    assert.equal(node(doc, monitor.deviceId)?.resource?.id, 'monitor-aurora-usb');
  }
  return { id, file, request, bytes, doc, roomId, floorId: node(doc, roomId).parentId, deskId, mouseId, cableId, mouse, desk, connected };
}

async function idle(expectedError = false) {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(expectedError), await status.textContent());
}

async function launch(profile, capture = false) {
  browser = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: view, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(capture ? { recordVideo: { dir: path.join(out, 'video'), size: view } } : {}),
  });
  browser.setDefaultTimeout(20000);
  await browser.route('**' + rayUrl, route => route.fulfill({ contentType: 'text/javascript', body: rayModule }));
  page = browser.pages()[0] || await browser.newPage();
  requests = new Map();
  page.on('response', response => requests.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  page.on('console', event => { if (event.type() === 'error') report.errors.push({ stage, message: event.text() }); });
}

async function close() {
  if (!browser) return;
  const process = browser.browser();
  await browser.close();
  if (process) assert.equal(process.isConnected(), false);
  browser = null;
  page = null;
}

async function visit(address) {
  await page.goto(address.href);
  await idle();
  const runtime = await page.evaluate(() => company.buildInfo);
  assert.equal(runtime.shortId, build);
  if (manifest) assert.equal(runtime.sourceDigest, manifest.sourceDigest);
}

async function loadFixture(room) {
  if (room.request) {
    const address = new URL(url);
    address.searchParams.set('delivery', room.request === '/delivery-save.json' ? '1' : room.id);
    await visit(address);
    await page.waitForFunction(id => company.session.document.id === id, room.id);
    await idle();
    const response = requests.get(room.request);
    assert.equal(response?.status(), 200);
    assert(room.bytes.equals(await response.body()));
  } else {
    const menu = page.locator('.file-menu');
    if (!(await menu.evaluate(details => details.open))) await menu.locator('summary').click();
    const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
    await picker.setFiles(room.file);
    await page.waitForFunction(id => company.session.document.id === id, room.id);
    await idle();
    if (await menu.evaluate(details => details.open)) await menu.locator('summary').click();
  }
  assert.deepEqual(await current(), room.doc);
}

async function showDesk(room, selection = room.mouseId) {
  const display = await page.evaluate(() => company.session.scene.view);
  if (display.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (display.mode !== 'room' || display.roomId !== room.roomId) await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  await idle();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(selection);
  await page.evaluate(deskId => {
    const { session, camera } = company;
    const desk = session.scene.root.getObjectByName(deskId);
    const world = p => desk.localToWorld(camera.position.clone().fromArray(p));
    camera.position.copy(world([1.16, 1.58, 1.19]));
    camera.lookAt(world([.29, .90, .12]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, room.deskId);
}

async function choose(room, ref) {
  const select = page.locator('#edit-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), room.mouseId);
  const candidates = await select.locator('option').evaluateAll(items => items.map(option => option.value));
  for (const look of looks) assert(candidates.includes(key(look)), 'Missing compatible look ' + key(look));
  if (await select.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected, room.mouseId).resource = ref;
  await select.selectOption(key(ref));
  await idle();
  assert.deepEqual(await current(), expected, 'A look can change only the resource reference and revision');
}

async function actualAsset(asset) {
  const response = requests.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual browser GLB download of ' + asset.url);
  const bytes = manifest ? await pinned('viewer' + asset.url) : await read('.' + asset.url);
  assert.equal(hash(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(bytes.equals(await response.body()));
}

async function inspect(room, ref, proveVisible = false) {
  const actual = await page.evaluate(async ({ mouseId, deskId, cableId, rayUrl, proveVisible }) => {
    const { Box3, Raycaster, Vector3 } = await import(rayUrl);
    const { session, camera, renderer } = company;
    const { scene, document: doc } = session;
    const find = id => doc.nodes.find(node => node.id === id);
    const resource = n => company.catalog.resources.find(row => row.id === n.resource.id && row.version === n.resource.version);
    const mouseNode = find(mouseId), deskNode = find(deskId);
    const current = resource(mouseNode), surface = resource(deskNode).surface;
    const desk = scene.root.getObjectByName(deskId), mouse = scene.root.getObjectByName(mouseId);
    const top = desk.getObjectByName('desktop');
    if (!top?.isMesh || mouse.parent !== desk) throw new Error('The combination must be an actual child of an actual desk with tabletop geometry');
    scene.root.updateMatrixWorld(true);
    const inverseDesk = desk.matrixWorld.clone().invert(), inverseMouse = mouse.matrixWorld.clone().invert();
    const vertices = (mesh, inverse) => {
      const positions = mesh.geometry.attributes.position, transform = inverse.clone().multiply(mesh.matrixWorld);
      return Array.from({ length: positions.count }, (_, i) => new Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform));
    };
    const bounds = new Box3(), pad = new Box3(), installedBounds = new Box3(), projected = new Box3(), meshes = [];
    const padNames = new Set(current.materialSlots.pad);
    const mountedPadNames = [];
    const supportRay = new Raycaster();
    let supportedArea = 0, bottomTriangles = 0, contactTriangles = 0;
    mouse.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      meshes.push(mesh);
      const points = vertices(mesh, inverseDesk), index = mesh.geometry.index;
      for (const point of points) installedBounds.expandByPoint(point);
      const name = mesh.userData.name || mesh.name;
      const isPad = padNames.has(name);
      if (isPad) mountedPadNames.push(name);
      for (const point of vertices(mesh, inverseMouse)) {
        bounds.expandByPoint(point);
        projected.expandByPoint(point.clone().applyMatrix4(mouse.matrixWorld).project(camera));
        if (isPad) pad.expandByPoint(point);
      }
      if (!isPad) return;
      const at = i => points[index ? index.getX(i) : i];
      for (let i = 0; i < (index?.count ?? points.length); i += 3) {
        const group = [at(i), at(i + 1), at(i + 2)];
        if (group.some(point => Math.abs(point.y - surface.topY) > .0001)) continue;
        const area = group[1].clone().sub(group[0]).cross(group[2].clone().sub(group[0])).length() / 2;
        if (area < 1e-9) continue;
        bottomTriangles++;
        const center = group.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / 3);
        const samples = [center, ...group.map(vertex => center.clone().lerp(vertex, .85))];
        const supported = samples.every(point => {
          const start = desk.localToWorld(point.clone().add(new Vector3(0, .05, 0)));
          supportRay.set(start, new Vector3(0, -1, 0));
          const hit = supportRay.intersectObject(top, false)[0];
          return hit && Math.abs(desk.worldToLocal(hit.point.clone()).y - surface.topY) < .0001;
        });
        if (supported) {
          supportedArea += area;
          contactTriangles++;
        }
      }
    });
    const port = current.cablePorts[0], connector = current.cablePortNodes[port.id];
    const fourRails = connector.frame.map(name => mouse.getObjectByName(name));
    const backing = mouse.getObjectByName(connector.backing);
    if (fourRails.length !== 4 || ![...fourRails, backing].every(mesh => mesh?.isMesh && meshes.includes(mesh))) {
      throw new Error('The socket requires its actual rendered rails and backing');
    }
    const normal = new Vector3(...port.direction).transformDirection(mouse.matrixWorld);
    const position = mouse.localToWorld(new Vector3(...port.position));
    const ray = new Raycaster(position.clone().addScaledVector(normal, .0005), normal.clone().negate(), 0, .007);
    const target = ray.intersectObject(backing, false)[0];
    const hits = ray.intersectObjects(meshes, false);
    if (!target || hits.some(hit => hit.distance < target.distance - .0001 && hit.object !== backing)) {
      throw new Error('Actual socket cavity is missing or obstructed');
    }
    const cableNode = find(cableId);
    let cable;
    if (cableNode) {
      const cableObject = scene.root.getObjectByName(cableId);
      let route;
      cableObject.traverse(object => { route ??= object.userData.cableRoute; });
      if (!route || cableObject.parent !== desk) throw new Error('Actual cable route not mounted to the same desk');
      const endpoint = name => {
        const mesh = cableObject.getObjectByName('endpoint-' + name);
        const points = vertices(mesh, inverseDesk);
        return points.reduce((total, point) => total.add(point), new Vector3()).multiplyScalar(1 / points.length).toArray();
      };
      cable = { link: cableNode.cableLink, route, a: endpoint('A'), b: endpoint('B'), asset: resource(cableNode).asset };
    }
    let visiblePixels;
    if (proveVisible) {
      const { width, height } = renderer.domElement;
      const canvas = document.createElement('canvas');
      Object.assign(canvas, { width, height });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const draw = () => {
        company.drawHostFrame();
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(renderer.domElement, 0, 0);
        return ctx.getImageData(0, 0, width, height).data;
      };
      const saved = meshes.map(mesh => mesh.castShadow);
      const oldVisibility = mouse.visible;
      try {
        for (const mesh of meshes) mesh.castShadow = false;
        const visible = draw();
        mouse.visible = false;
        const hidden = draw();
        visiblePixels = 0;
        for (let i = 0; i < visible.length; i += 4) {
          const delta = Math.abs(visible[i] - hidden[i]) + Math.abs(visible[i + 1] - hidden[i + 1]) + Math.abs(visible[i + 2] - hidden[i + 2]);
          if (delta > 24) visiblePixels++;
        }
      } finally {
        mouse.visible = oldVisibility;
        for (const [index, mesh] of meshes.entries()) mesh.castShadow = saved[index];
        company.drawHostFrame();
      }
    }
    const limits = box => ({ min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new Vector3()).toArray() });
    return { mouseNode, deskNode, asset: current.asset, mounting: current.mounting, footprint: current.footprint,
      mount: current.mount, role: current.mountRole, branch: current.productionBranch,
      surface, local: limits(bounds), pad: limits(pad), mountedPadNames: mountedPadNames.sort(), padNames: [...padNames].sort(),
      installed: limits(installedBounds), projection: limits(projected),
      bottomTriangles, contactTriangles, supportedArea, ...(proveVisible ? { visiblePixels } : {}), port, socketDepth: target.distance,
      portInDesk: desk.worldToLocal(position.clone()).toArray(), portWorld: position.toArray(),
      mouseWorld: mouse.getWorldPosition(new Vector3()).toArray(), mouseWorldMatrix: mouse.matrixWorld.toArray(), cable,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
      renderError: company.renderStatus().lastRenderError };
  }, { mouseId: room.mouseId, deskId: room.deskId, cableId: room.cableId, rayUrl, proveVisible });
  assert.deepEqual(actual.mouseNode.resource, ref);
  assert.equal(actual.renderError, null);
  assert.equal(actual.mount, 'desk-surface');
  assert.equal(actual.role, 'mouse-pad');
  assert.equal(actual.branch, 'mouse-and-pad');
  assert.deepEqual(actual.mouseNode.transform, room.mouse.transform);
  assert.equal(actual.mouseNode.parentId, room.deskId);
  assert.deepEqual(actual.port.position, [0, .014, -.095]);
  assert.deepEqual(actual.port.direction, [0, 0, -1]);
  assert.equal(actual.port.id, 'usb');
  assert.equal(actual.port.connector, 'usb-c-visual-v1');
  const { width, height, depth } = actual.mounting;
  assert.deepEqual([width, height, depth], [.28, .065, .22]);
  assert.equal(actual.mounting.reserveDesktopArea, true);
  assert(actual.padNames.length >= 2);
  assert.deepEqual(actual.mountedPadNames, actual.padNames);
  for (const [index, cap] of [width, height, depth].entries()) assert(actual.pad.size[index] > 0 && actual.pad.size[index] <= cap + .001);
  for (const [index, edge] of [width, height, depth].entries()) {
    assert(actual.local.size[index] > 0 && actual.local.size[index] <= edge + .001);
  }
  near(actual.installed.min[1], actual.surface.topY, .0001);
  assert(actual.contactTriangles > 0 && actual.supportedArea > .001, 'Expected positive-area bottom contact with actual tabletop triangles');
  assert.equal(actual.contactTriangles, actual.bottomTriangles, 'The pad must sit on the actual tabletop across its base');
  for (const [index, axis] of [0, 2].entries()) {
    assert(actual.installed.min[axis] >= -actual.surface.halfSize[index] - .001);
    assert(actual.installed.max[axis] <= actual.surface.halfSize[index] + .001);
  }
  if (proveVisible) {
    assert(actual.visiblePixels >= 250, 'Actual combination is not sufficiently visible');
    assert(actual.projection.min.slice(0, 2).every(x => x > -.99) && actual.projection.max.slice(0, 2).every(x => x < .99));
  }
  if (room.connected) {
    const { a, b, route, link } = actual.cable;
    const side = link.a.deviceId === room.mouseId ? 'a' : 'b';
    nearVector(route[side], actual.portInDesk);
    nearVector(a, route.a.map((value, i) => value + .016 * route.direction[i]));
    nearVector(b, route.end.map((value, i) => value - .016 * route.direction[i]));
    near(route.span - route.length, route.connected ? 0 : .025);
    await actualAsset(actual.cable.asset);
  }
  await actualAsset(actual.asset);
  return actual;
}

async function screenshot(file) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({ path: path.join(out, file) });
  return file;
}

async function saveReopen(room, profile, ref) {
  const document = await current();
  await page.locator('#save').click();
  await idle();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await savedText(room.id);
  const saved = JSON.parse(text);
  assert.deepEqual(saved.document, document);
  const pin = saved.dependencies.resources.find(resource => key(resource) === key(ref));
  assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  await close();
  await launch(profile);
  await visit(url);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.equal(await savedText(room.id), text);
  assert.deepEqual(await current(), document);
  assert(![...requests.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  await showDesk(room);
  return { savedSha256: hash(text), pin, browserRestarted: true };
}

function requireSameMount(before, after) {
  for (const property of ['mounting', 'footprint', 'port', 'surface']) assert.deepEqual(after[property], before[property]);
  nearVector(after.portInDesk, before.portInDesk);
  assert.deepEqual(after.mouseNode.transform, before.mouseNode.transform);
  assert.equal(after.mouseNode.id, before.mouseNode.id);
  assert.equal(after.mouseNode.parentId, before.mouseNode.parentId);
}

async function checkLooks(room, profile) {
  await showDesk(room);
  const initial = room.mouse.resource;
  const order = [...looks.filter(ref => key(ref) !== key(initial)), initial];
  const hashes = new Set();
  let first, last;
  for (const ref of order) {
    stage = room.id + ' · compare and reopen ' + key(ref);
    await choose(room, ref);
    const shown = await inspect(room, ref, true);
    first ??= shown;
    assert(!hashes.has(shown.asset.sha256), 'Two variants have identical GLB bytes');
    hashes.add(shown.asset.sha256);
    requireSameMount(first, shown);
    nearVector(shown.portWorld, first.portWorld);
    assert.deepEqual(shown.camera, first.camera);
    assert.deepEqual(shown.cable, first.cable);
    if (room.connected) assert.equal(shown.cable.route.connected, true);
    const image = await screenshot(room.id + '-' + ref.id + '.png');
    const saved = await saveReopen(room, profile, ref);
    const restored = await inspect(room, ref);
    const { visiblePixels, ...expected } = shown;
    assert.deepEqual(restored, expected);
    report.checks.push({ stage, image, shown, saved });
    last = restored;
  }
  return { ref: initial, initial: last };
}

async function checkUsb(room, ref, profile) {
  stage = room.id + ' · real USB detach and reconnect';
  const cable = node(await current(), room.cableId);
  if (!cable) return;
  await showDesk(room, room.cableId);
  await page.locator('#edit-states button').click();
  await idle();
  const unplugged = await inspect(room, ref);
  assert.equal(unplugged.cable.route.connected, false);
  near(unplugged.cable.route.span - unplugged.cable.route.length, .025);
  await page.locator('#edit-states button').click();
  await idle();
  const attached = await inspect(room, ref);
  assert.equal(attached.cable.route.connected, true);
  near(attached.cable.route.span, attached.cable.route.length);
  assert.deepEqual(attached.cable.link, cable.cableLink);
  const saved = await saveReopen(room, profile, ref);
  assert.deepEqual((await inspect(room, ref)).cable, attached.cable);
  report.checks.push({ stage, unplugged: unplugged.cable, attached: attached.cable, saved });
}

async function moveDesk(room, previous, profile) {
  stage = room.id + ' · move and turn the actual desk';
  const before = await current();
  const old = node(before, room.deskId).transform;
  const candidate = { position: [1, 0, -.15], yaw: Math.PI / 2 };
  assert.notDeepEqual(candidate.position, old.position);
  near(Math.abs(Math.cos(candidate.yaw - old.yaw)), 0);
  await showDesk(room, room.deskId);
  for (const selector of ['#placement-tools', '#placement-tools > details']) {
    const details = page.locator(selector);
    if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
  }
  await page.locator('#edit-x').fill(String(candidate.position[0]));
  await page.locator('#edit-z').fill(String(candidate.position[2]));
  await page.locator('#edit-yaw').selectOption('90');
  await page.locator('#edit-position').click();
  await idle();
  before.revision++;
  node(before, room.deskId).transform = candidate;
  assert.deepEqual(await current(), before);
  await showDesk(room);
  const turned = await inspect(room, previous.ref, true);
  requireSameMount(previous.initial, turned);
  assert.notDeepEqual(turned.mouseWorldMatrix, previous.initial.mouseWorldMatrix);
  assert.notDeepEqual(turned.mouseWorld, previous.initial.mouseWorld);
  assert.notDeepEqual(turned.portWorld, previous.initial.portWorld);
  const image = await screenshot(room.id + '-desk-moved-and-turned.png');
  const saved = await saveReopen(room, profile, previous.ref);
  const { visiblePixels, ...expected } = turned;
  assert.deepEqual(await inspect(room, previous.ref), expected);
  report.checks.push({ stage, old, desk: candidate, deskRotatedLocally: true, image, turned, saved });
}

async function record(rooms) {
  stage = 'normal speed user-path recording';
  const profile = await fs.mkdtemp(path.join(out, 'recording-'));
  await launch(profile, true);
  await visit(url);
  for (const [index, room] of rooms.entries()) {
    await loadFixture(room);
    await showDesk(room);
    for (const ref of index === 0 ? looks : [room.mouse.resource]) {
      await choose(room, ref);
      await page.evaluate(() => company.drawHostFrame());
      await page.waitForTimeout(index === 0 ? 1900 : 2400);
    }
  }
  const raw = await page.video().path();
  await close();
  const file = path.join('video', 'mouse-pad-normal.webm');
  await fs.rename(raw, path.join(out, file));
  const stat = await fs.stat(path.join(out, file));
  assert(stat.size > 0);
  report.video.file = file;
  report.video.bytes = stat.size;
}

async function run() {
  await fs.mkdir(out);
  stage = 'load fixed viewer and room fixtures';
  const bytes = await read('transfer-manifest.json').catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  assert.equal(Boolean(bytes), !batch, 'A dist needs its batch root. A package supplies its own pinned rooms.');
  if (bytes) {
    manifest = JSON.parse(bytes);
    assert.equal(manifest.schema, 'company-transfer');
    assert.equal(manifest.buildId, build);
    const lock = JSON.parse(await pinned('source/prototype/package-lock.json'));
    assert.equal(lock.packages['node_modules/three'].version, require('../../prototype/node_modules/three/package.json').version);
  }
  const rooms = [await fixture('mouse-pad-home', 'office', true), await fixture('mouse-pad-rental', 'trackball', false)];
  report.fixtures = rooms.map(room => ({ id: room.id, file: room.file, sha256: hash(room.bytes) }));
  rayModule = await fs.readFile(path.resolve(__dirname, '../../prototype/node_modules/three/build/three.core.js'), 'utf8');
  url = await startServer();
  report.sourceDigest = manifest?.sourceDigest ?? server.info.sourceDigest;
  for (const room of rooms) {
    stage = room.id + ' · import and select';
    const profile = await fs.mkdtemp(path.join(out, 'chromium-'));
    await launch(profile);
    await visit(url);
    await loadFixture(room);
    const details = await checkLooks(room, profile);
    if (room.connected) await checkUsb(room, details.ref, profile);
    else await moveDesk(room, details, profile);
    await close();
  }
  if (recording) await record(rooms);
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 4000 }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    await server?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    if (stage) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video.file }));
  }
});
