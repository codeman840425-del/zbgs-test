const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, batchRoot, outArg, ...flags] = process.argv.slice(2);
if (!dist || !build || !batchRoot || !outArg || flags.length > 1 || flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-screen-partitions.cjs DIST BUILD BATCH_ROOT OUT [--record]');
}
const out = path.resolve(outArg);
const viewport = { width: 1600, height: 1000 };
const looks = ['timber', 'fabric', 'acoustic', 'glass'];
const ref = look => ({ id: 'screen-partition-' + look, version: 1 });
const key = look => ref(look).id + '@1';
const node = (doc, id) => doc.nodes.find(item => item.id === id);
const readDocument = () => page.evaluate(() => company.session.document);
const readSaved = id => page.evaluate(id => company.session.readSavedText(id), id);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const closeTo = (actual, expected) => assert(Math.abs(actual - expected) < 1e-4, actual + ' != ' + expected);
const report = {
  build, status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], video: { enabled: flags.length === 1, playbackSpeed: 1 },
};
let server, profile, context, page, requests, stage, expectedPortalError;

async function fixture(name, room, initialLook, transform, furniture, camera) {
  const id = 'screen-partition-' + name;
  const source = path.resolve(batchRoot, id, 'save.json');
  const bytes = await fs.readFile(source);
  const envelope = JSON.parse(bytes);
  const floorId = id + '/ground';
  const roomId = floorId + '/' + room;
  const screenId = roomId + '/screen';
  assert.equal(envelope.schema, 'company-save');
  assert.equal(envelope.document.id, id);
  assert.equal(node(envelope.document, roomId)?.parentId, floorId);
  const screen = node(envelope.document, screenId);
  assert.equal(screen?.kind, 'facility');
  assert.equal(screen.parentId, roomId);
  assert.deepEqual(screen.transform, transform);
  assert.deepEqual(screen.resource, ref(initialLook));
  const furnitureIds = furniture.map(suffix => roomId + '/' + suffix);
  for (const furnitureId of furnitureIds) assert.equal(node(envelope.document, furnitureId)?.kind, 'facility');
  return { name, id, floorId, roomId, screenId, initialLook, transform, furnitureIds, camera, source, sha256: sha256(bytes), envelope };
}

async function idle(error = false) {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled &&
    document.querySelector('#status').dataset.error !== undefined
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(error), await status.textContent());
}

async function openBrowser(recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
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
    if (expectedPortalError && value.includes('blocked-portal') && value.includes(expectedPortalError.id)) {
      expectedPortalError.messages.push(value);
    } else report.browserErrors.push({ stage, message: value });
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

async function openFile(input) {
  const menu = page.locator('.file-menu');
  await menu.locator('summary').click();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
  await picker.setFiles(input.source);
  await page.waitForFunction(id => company.session.document.id === id, input.id);
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await readDocument(), input.envelope.document);
}

async function showRoom(input) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== input.floorId) await select('#floor', input.floorId);
  if (view.mode !== 'room' || view.roomId !== input.roomId) await select('#room', input.roomId);
  await click('.view-toolbar [data-view="room"]');
  await click('#tool-selection');
  await select('#edit-instance', input.screenId);
  const appearance = page.locator('#edit-look');
  assert(await appearance.isVisible());
  const options = await appearance.locator('option').evaluateAll(items => items.map(option => option.value));
  assert.deepEqual(options.sort(), looks.map(key).sort());
  await setCamera(input.roomId, input.camera);
}

async function setCamera(roomId, camera) {
  await page.evaluate(({ roomId, camera: shot }) => {
    const { session, camera } = company;
    const room = session.scene.root.getObjectByName(roomId);
    const world = coordinates => room.localToWorld(camera.position.clone().fromArray(coordinates));
    camera.position.copy(world(shot.position));
    camera.lookAt(world(shot.target));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
  }, { roomId, camera });
  await frame();
}

async function replaceLook(input, look) {
  assert.equal(await page.locator('#edit-instance').inputValue(), input.screenId);
  if (await page.locator('#edit-look').inputValue() === key(look)) return;
  const expected = await readDocument();
  expected.revision++;
  node(expected, input.screenId).resource = ref(look);
  await select('#edit-look', key(look));
  assert.deepEqual(await readDocument(), expected);
}

async function inspect(input, look, transform = input.transform, requireFraming = true) {
  await frame();
  const result = await page.evaluate(({ screenId, roomId, furnitureIds }) => {
    const { session, camera } = company;
    const { scene } = session;
    const screen = scene.root.getObjectByName(screenId);
    const room = scene.root.getObjectByName(roomId);
    const node = session.document.nodes.find(node => node.id === screenId);
    const resource = company.catalog.resources.find(resource => resource.id === node.resource.id && resource.version === node.resource.version);
    const { object, ...obstacle } = scene.navigation().obstacles.find(item => item.instanceId === screenId);
    scene.root.updateMatrixWorld(true);
    const vector = () => camera.position.clone();
    const empty = () => ({ min: vector().setScalar(Infinity), max: vector().setScalar(-Infinity) });
    const grow = (bounds, point) => { bounds.min.min(point); bounds.max.max(point); };
    const arrayBounds = bounds => ({ min: bounds.min.toArray(), max: bounds.max.toArray() });
    const inverse = screen.matrixWorld.clone().invert();
    const local = empty(), projected = empty(), meshes = [];
    screen.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const attribute = mesh.geometry.attributes.position;
      const meshBounds = empty();
      for (let i = 0; i < attribute.count; i++) {
        const point = vector().fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
        grow(projected, point.clone().project(camera));
        point.applyMatrix4(inverse);
        grow(local, point);
        grow(meshBounds, point);
      }
      meshes.push({ name: mesh.userData.name || mesh.name, bounds: arrayBounds(meshBounds), vertices: attribute.count,
        castShadow: mesh.castShadow,
        materials: [mesh.material].flat().map(m => ({ name: m.name, visible: m.visible, opacity: m.opacity,
          transparent: m.transparent, transmission: m.transmission ?? 0, alphaTest: m.alphaTest })) });
    });
    const furniture = furnitureIds.map(id => {
      const object = scene.root.getObjectByName(id);
      let visibleMeshes = 0;
      object?.traverseVisible(mesh => { if (mesh.isMesh) visibleMeshes++; });
      return { id, visibleMeshes, roomPosition: object ? room.worldToLocal(object.getWorldPosition(vector())).toArray() : null };
    });
    return { node, asset: resource.asset, mount: resource.mount, mounting: resource.mounting,
      slots: resource.materialSlots, parent: screen.parent.name, view: scene.view,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
      position: screen.position.toArray(), yaw: screen.rotation.y, world: screen.getWorldPosition(vector()).toArray(),
      obstacle, blockerIsDisplayedInstance: object === screen, local: arrayBounds(local), projected: arrayBounds(projected), meshes, furniture };
  }, { screenId: input.screenId, roomId: input.roomId, furnitureIds: input.furnitureIds });
  assert.equal(result.view.roomId, input.roomId);
  assert.equal(result.parent, input.roomId);
  assert.deepEqual(result.node.resource, ref(look));
  assert.deepEqual(result.node.transform, transform);
  assert.deepEqual(result.position, transform.position);
  closeTo(result.yaw, transform.yaw);
  assert(result.blockerIsDisplayedInstance);
  assert.equal(result.mount, 'floor-surface');
  assert.deepEqual(result.obstacle.footprint, { center: [0, 0], halfSize: [.9, .04], blocking: true });
  const { width, height, depth } = result.mounting;
  assert.deepEqual([width, height, depth], [1.8, 2, .08]);
  closeTo(result.local.min[1], 0);
  assert(result.local.max[1] > 1.9);
  const { min, max } = result.projected;
  if (requireFraming) {
    assert(min[0] > -.99 && min[1] > -.99 && max[0] < .99 && max[1] < .99, 'Screen is clipped in the comparison camera');
    assert(max[0] - min[0] > .20 && max[1] - min[1] > .56, 'Screen occupies too little of the game view');
  }
  assert(result.furniture.every(item => item.visibleMeshes > 0), 'Real room furniture must be present and visible');
  if (input.name === 'studio') {
    const [desk, chair, sofa] = result.furniture.map(item => item.roomPosition[0]);
    assert(desk < result.position[0] && chair < result.position[0] && result.position[0] < sofa);
  }
  const glass = material => material.visible && !material.alphaTest &&
    ((material.transparent && material.opacity > 0 && material.opacity < 1) || material.transmission > 0);
  const opaque = material => material.visible && !material.transparent && material.opacity === 1 && !material.transmission && !material.alphaTest;
  const panes = result.meshes.filter(mesh => mesh.materials.some(glass));
  const structure = result.meshes.filter(mesh => !panes.includes(mesh));
  assert(structure.length > 0 && structure.every(mesh => mesh.materials.every(opaque)), 'Physical frame and feet must stay opaque');
  if (look === 'glass') {
    assert(panes.length > 0 && panes.every(mesh => mesh.materials.every(glass)), 'No actual see-through pane material');
    assert.deepEqual(panes.map(mesh => mesh.name).sort(), result.slots.infill.slice().sort());
    assert(result.slots.finish.every(name => structure.some(mesh => mesh.name === name)), 'Named frame meshes must stay opaque');
    assert(panes.every(mesh => !mesh.castShadow), 'Blended panes must not cast a solid shadow');
    assert(structure.some(mesh => mesh.name === 'glass-ground-rail') && structure.every(mesh => mesh.castShadow),
      'The glass screen frame and ground rail must still cast shadows');
    for (const mesh of panes) {
      for (const axis of [0, 1]) {
        assert(mesh.bounds.min[axis] > result.local.min[axis] + .001 && mesh.bounds.max[axis] < result.local.max[axis] - .001,
          'A transparent component reaches outside the opaque frame');
      }
    }
  } else assert.equal(panes.length, 0);
  if (look === 'timber') assert(result.meshes.every(mesh => mesh.castShadow), 'The opaque timber replacement must cast shadows');
  const url = new URL(result.asset.url, server.url).pathname;
  const response = requests.get(url);
  assert.equal(response?.status(), 200, 'Expected browser GLB fetch ' + url);
  const bytes = await response.body();
  assert.equal(bytes.length, result.asset.bytes);
  assert.equal(sha256(bytes), result.asset.sha256);
  return result;
}

async function throughGlass(input) {
  const measurement = await page.evaluate(({ screenId, targetId }) => {
    const { session, renderer } = company;
    const target = session.scene.root.getObjectByName(targetId);
    const screen = session.scene.root.getObjectByName(screenId);
    const panes = [];
    screen.traverseVisible(mesh => {
      if (mesh.isMesh && [mesh.material].flat().some(m => m.transparent || m.transmission > 0)) panes.push(mesh);
    });
    const canvas = document.createElement('canvas');
    canvas.width = renderer.domElement.width;
    canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const capture = () => {
      company.drawHostFrame();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(renderer.domElement, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const pair = () => {
      target.visible = true;
      const withTarget = capture();
      target.visible = false;
      return [withTarget, capture()];
    };
    const snapshots = panes.map(mesh => ({ mesh, material: mesh.material, castShadow: mesh.castShadow }));
    const targetShadows = [];
    target.traverseVisible(mesh => { if (mesh.castShadow) targetShadows.push(mesh); });
    const clones = [];
    let present, bare, opaque;
    try {
      // Keep the target's cast shadow out of the visibility measurement.
      for (const mesh of [...panes, ...targetShadows]) mesh.castShadow = false;
      present = pair();
      for (const mesh of panes) mesh.visible = false;
      bare = pair();
      for (const { mesh, material } of snapshots) {
        mesh.visible = true;
        const control = [material].flat().map(original => {
          const next = original.clone();
          next.transparent = false;
          next.opacity = 1;
          next.depthWrite = true;
          if ('transmission' in next) next.transmission = 0;
          clones.push(next);
          return next;
        });
        mesh.material = Array.isArray(material) ? control : control[0];
      }
      opaque = pair();
    } finally {
      target.visible = true;
      for (const mesh of targetShadows) mesh.castShadow = true;
      for (const { mesh, material, castShadow } of snapshots) Object.assign(mesh, { material, castShadow, visible: true });
      for (const clone of clones) clone.dispose();
      company.drawHostFrame();
    }
    const delta = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    let behindPane = 0, visibleThroughPane = 0, deltaThrough = 0, deltaBare = 0;
    for (let i = 0; i < present[0].length; i += 4) {
      const unoccluded = delta(...bare, i);
      // The opaque control fixes the geometry and identifies pixels where this pane blocks this desk.
      if (unoccluded < 24 || delta(...opaque, i) > 3 || delta(present[0], bare[0], i) < 8) continue;
      behindPane++;
      const transmitted = delta(...present, i);
      if (transmitted >= 8) visibleThroughPane++;
      deltaThrough += transmitted;
      deltaBare += unoccluded;
    }
    return { targetId, behindPane, visibleThroughPane, retainedSignal: deltaBare ? deltaThrough / deltaBare : 0 };
  }, { screenId: input.screenId, targetId: input.furnitureIds[0] });
  report.glassMeasurement = measurement;
  assert(measurement.behindPane >= 100 && measurement.visibleThroughPane >= 100 &&
    measurement.visibleThroughPane / measurement.behindPane > .60 && measurement.retainedSignal > .20,
  'The same real desk must contribute visibly through the tinted pane at the comparison camera');
  return measurement;
}

async function glassShadow(input, paneNames) {
  await frame();
  const observation = await page.evaluate(({ screenId, roomId, paneNames }) => {
    const { session, renderer, camera } = company;
    const root = session.scene.root;
    const screen = root.getObjectByName(screenId);
    const floor = root.getObjectByName('Floor:' + roomId);
    const panes = [];
    screen.traverseVisible(mesh => {
      if (mesh.isMesh && paneNames.includes(mesh.userData.name || mesh.name)) panes.push(mesh);
    });
    if (panes.length !== paneNames.length || !floor?.receiveShadow || !renderer.shadowMap.enabled) {
      throw new Error('Expected the real panes, ground receiver and enabled renderer shadows');
    }
    const canvas = document.createElement('canvas');
    const { width, height } = renderer.domElement;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const capture = save => {
      company.drawHostFrame();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(renderer.domElement, 0, 0);
      return { pixels: ctx.getImageData(0, 0, width, height).data, png: save ? canvas.toDataURL().split(',')[1] : undefined };
    };
    const paneState = panes.map(mesh => ({ mesh, castShadow: mesh.castShadow, visible: mesh.visible }));
    const floorMaterial = floor.material;
    const marker = floorMaterial.clone();
    marker.color.set('black');
    marker.map = null;
    marker.emissive.set('#ff00ff');
    marker.emissiveIntensity = 1;
    marker.emissiveMap = null;
    marker.toneMapped = false;
    let current, legacy, mask;
    try {
      current = capture(true);
      // Reproduce the previous importer setting on the same two glass meshes.
      for (const mesh of panes) mesh.castShadow = true;
      legacy = capture(true);
      // The marker is used only to select floor pixels, never in the comparison PNGs.
      // The panes would tint the marker and hide valid floor samples from the mask.
      for (const { mesh, castShadow } of paneState) Object.assign(mesh, { castShadow, visible: false });
      floor.material = marker;
      mask = capture(false).pixels;
    } finally {
      for (const { mesh, castShadow, visible } of paneState) Object.assign(mesh, { castShadow, visible });
      floor.material = floorMaterial;
      marker.dispose();
      company.drawHostFrame();
    }
    const luma = (pixels, i) => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    let sampledFloorPixels = 0, brighterFloorPixels = 0, darkerFloorPixels = 0, totalGain = 0;
    const samples = [];
    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 3) {
        const i = (y * width + x) * 4;
        const magenta = Math.min(mask[i], mask[i + 2]);
        if (magenta < 200 || magenta - mask[i + 1] < 90) continue;
        sampledFloorPixels++;
        const gain = luma(current.pixels, i) - luma(legacy.pixels, i);
        if (gain <= -8) darkerFloorPixels++;
        if (gain < 8) continue;
        brighterFloorPixels++;
        totalGain += gain;
        if (samples.length < 10 && !samples.some(point => Math.hypot(x - point.x, y - point.y) < 24)) {
          samples.push({ x, y, current: current.pixels.slice(i, i + 3).join('/'), legacy: legacy.pixels.slice(i, i + 3).join('/') });
        }
      }
    }
    return {
      current: current.png, legacy: legacy.png,
      measurement: { floor: floor.name, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
        sampledFloorPixels, brighterFloorPixels, darkerFloorPixels,
        meanLumaGain: brighterFloorPixels ? totalGain / brighterFloorPixels : 0, samples },
    };
  }, { screenId: input.screenId, roomId: input.roomId, paneNames });
  const images = { current: 'rental-glass-shadow-current.png', legacy: 'rental-glass-shadow-legacy-control.png' };
  await fs.writeFile(path.join(out, images.current), Buffer.from(observation.current, 'base64'));
  await fs.writeFile(path.join(out, images.legacy), Buffer.from(observation.legacy, 'base64'));
  report.glassShadow = { ...observation.measurement, images };
  await frame();
  const { brighterFloorPixels, darkerFloorPixels } = observation.measurement;
  assert(brighterFloorPixels >= 48 && brighterFloorPixels > 4 * darkerFloorPixels,
    'The comparison camera must show the real floor brighten when the solid pane shadow is removed');
  return report.glassShadow;
}

async function save(input, look) {
  const document = await readDocument();
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await readSaved(input.id);
  const envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, document);
  const pin = envelope.dependencies.resources.find(pin => pin.id === ref(look).id && pin.version === 1);
  assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  return { document, text, pin };
}

async function reopen(input, saved) {
  await closeBrowser();
  await openBrowser();
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await readDocument(), saved.document);
  assert.equal(await readSaved(input.id), saved.text);
  await showRoom(input);
}

async function screenshot(file) {
  await frame();
  await page.screenshot({ path: path.join(out, file) });
  return file;
}

async function screenshotWithoutScreen(input) {
  const visibility = visible => page.evaluate(({ id, visible }) => {
    company.session.scene.root.getObjectByName(id).visible = visible;
  }, { id: input.screenId, visible });
  await visibility(false);
  try {
    return await screenshot('rental-screen-hidden.png');
  } finally {
    await visibility(true);
    await frame();
  }
}

async function check(name, action) {
  stage = name;
  const entry = { name, passed: false };
  report.checks.push(entry);
  entry.evidence = await action();
  entry.passed = true;
}

async function checkLooks(input) {
  await openFile(input);
  await showRoom(input);
  const order = [input.initialLook, ...looks.filter(look => look !== input.initialLook)];
  const usedHashes = new Set();
  let first;
  for (const look of order) {
    await check(input.name + ' · render, save and restart ' + key(look), async () => {
      await replaceLook(input, look);
      const actual = await inspect(input, look);
      assert(!usedHashes.has(actual.asset.sha256), 'Two looks loaded the same GLB bytes');
      usedHashes.add(actual.asset.sha256);
      first ??= actual;
      for (const field of ['position', 'world', 'camera', 'obstacle', 'furniture']) assert.deepEqual(actual[field], first[field]);
      const image = await screenshot(input.name + '-' + look + '.png');
      const optical = input.name === 'rental' && look === 'glass' ? await throughGlass(input) : undefined;
      const bareImage = optical ? await screenshotWithoutScreen(input) : undefined;
      const shadow = optical ? await glassShadow(input, actual.slots.infill) : undefined;
      const saved = await save(input, look);
      await reopen(input, saved);
      assert.deepEqual(await inspect(input, look), actual);
      return { image, bareImage, actual, optical, shadow, savePin: saved.pin, savedBytesSha256: sha256(saved.text), browserRestarted: true };
    });
  }
}

async function placementTools() {
  for (const selector of ['#placement-tools', '#placement-tools > details']) {
    const details = page.locator(selector);
    if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
  }
}

async function fillPosition([x, , z]) {
  assert(await page.locator('#edit-y').isDisabled());
  await page.locator('#edit-x').fill(String(x));
  await page.locator('#edit-z').fill(String(z));
}

async function checkPlacement(input) {
  await check('rental · move and turn, then keep the live screen and saved bytes after a doorway rejection', async () => {
    const portal = await page.evaluate(id => company.session.scene.navigation().connections
      .flatMap(connection => [connection.from, connection.to].map(side => ({ ...side, id: connection.id })))
      .find(side => side.regionId === id && side.edge === 'west'), input.roomId);
    assert.deepEqual(portal.local.center, [-2.25, 0, 0]);
    const look = 'glass';
    await replaceLook(input, look);
    const initial = await inspect(input, look);
    await placementTools();
    const moved = { position: [-1.08, 0, .92], yaw: 0 };
    await fillPosition(moved.position);
    const afterMove = await readDocument();
    afterMove.revision++;
    node(afterMove, input.screenId).transform = moved;
    await click('#edit-position');
    assert.deepEqual(await readDocument(), afterMove);
    const movedDisplay = await inspect(input, look, moved, false);
    assert.notDeepEqual(movedDisplay.world, initial.world);
    closeTo(movedDisplay.obstacle.x - initial.obstacle.x, moved.position[0] - input.transform.position[0]);
    closeTo(movedDisplay.obstacle.z - initial.obstacle.z, moved.position[2] - input.transform.position[2]);
    await click('#edit-rotate');
    const turned = { position: moved.position, yaw: Math.PI / 2 };
    afterMove.revision++;
    node(afterMove, input.screenId).transform = turned;
    assert.deepEqual(await readDocument(), afterMove);
    const valid = await inspect(input, look, turned, false);
    closeTo(valid.obstacle.hw, movedDisplay.obstacle.hd);
    closeTo(valid.obstacle.hd, movedDisplay.obstacle.hw);
    const saved = await save(input, look);
    const invalidPosition = [-1.65, 0, portal.local.center[2]];
    await placementTools();
    expectedPortalError = { id: portal.id, messages: [] };
    await page.evaluate(id => { window.qaScreenBeforeReject = {
      root: company.session.scene.root, screen: company.session.scene.root.getObjectByName(id),
    }; }, input.screenId);
    let message, image;
    try {
      await fillPosition(invalidPosition);
      await page.locator('#edit-position').click();
      await idle(true);
      assert.equal(await page.locator('#edit-message').getAttribute('data-error'), 'true');
      message = await page.locator('#edit-message').textContent();
      assert.match(message, /堵住门口/);
      assert.equal(expectedPortalError.messages.length, 1);
      assert(await page.evaluate(id => {
        const live = company.session.scene.root;
        return live === window.qaScreenBeforeReject.root && live.getObjectByName(id) === window.qaScreenBeforeReject.screen;
      }, input.screenId));
      assert.equal(await readSaved(input.id), saved.text);
      assert.deepEqual(await readDocument(), saved.document);
      assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
      assert.deepEqual(await inspect(input, look, turned, false), valid);
      await setCamera(input.roomId, { position: [3.7, 2.65, 4.4], target: [-.65, .9, -.05] });
      await page.locator('#edit-message').scrollIntoViewIfNeeded();
      image = await screenshot('rental-doorway-rejected.png');
    } finally {
      expectedPortalError = null;
      await page.evaluate(() => { delete window.qaScreenBeforeReject; });
    }
    await reopen(input, saved);
    assert.deepEqual(await inspect(input, look, turned, false), valid);
    return { portal, moved, turned, invalidPosition, code: 'blocked-portal', message, image,
      savedBytesSha256: sha256(saved.text), browserRestarted: true };
  });
}

async function recordRooms(studio, rental) {
  await check('record one normal-speed comparison and then the rental room', async () => {
    await closeBrowser();
    profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
    await openBrowser(true);
    await openFile(studio);
    await showRoom(studio);
    for (const look of looks) {
      await replaceLook(studio, look);
      await frame();
      await page.waitForTimeout(2000);
    }
    await openFile(rental);
    await showRoom(rental);
    await page.waitForTimeout(2700);
    const raw = await page.video().path();
    await closeBrowser();
    const file = 'video/screen-partitions-normal.webm';
    await fs.rename(raw, path.join(out, file));
    const { size } = await fs.stat(path.join(out, file));
    assert(size > 0);
    report.video.file = file;
    return { file, bytes: size, studioLooksInOrder: looks, rentalLook: rental.initialLook };
  });
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  stage = 'load the two authored rooms';
  const studio = await fixture('studio', 'live', 'timber', { position: [0, 0, -.52], yaw: Math.PI / 2 },
    ['station-left/desk', 'station-left/chair', 'sofa'], { position: [-3.6, 2.95, 6], target: [0, .95, -.35] });
  const rental = await fixture('rental', 'work', 'glass', { position: [-1.12, 0, .8], yaw: 0 },
    ['desk', 'chair'], { position: [-2.08, 2.45, 5.2], target: [-.70, .76, -.12] });
  report.fixtures = [studio, rental].map(({ id, source, sha256 }) => ({ id, source, sha256 }));
  stage = 'start isolated build';
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html', port: 0 });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser();
  stage = 'studio import and selection';
  await checkLooks(studio);
  stage = 'rental import and selection';
  await checkLooks(rental);
  await checkPlacement(rental);
  if (report.video.enabled) await recordRooms(studio, rental);
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
  for (const cleanup of [closeBrowser, () => server?.close()]) {
    try { await cleanup(); }
    catch (error) {
      report.cleanupError = error.message;
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video.file }));
});
