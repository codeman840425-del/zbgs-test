const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, resultsDir, outArg, ...options] = process.argv.slice(2);
if (!dist || !build || !resultsDir || !outArg || new Set(options).size !== options.length ||
    options.some(option => !['--record', '--preflight-round'].includes(option))) {
  throw new Error('Usage: node qa-lounge-rooms.cjs DIST BUILD BATCH_RESULTS OUT [--record] [--preflight-round]');
}
const out = path.resolve(outArg);
const record = options.includes('--record');
const preflight = options.includes('--preflight-round');
const viewport = { width: 1600, height: 1000 };
const tableRef = { id: preflight ? 'side-table-round' : 'side-table-carved-round', version: 1 };
const oldRef = { id: preflight ? 'side-table-nested' : 'side-table-round', version: 1 };
const cases = [
  { key: 'studio-lounge', id: 'concept-lounge-studio', move: [1.83, 0, -1.24] },
  { key: 'rental-lounge', id: 'concept-lounge-rental', move: [-0.58, 0, 1.48] },
];
const parts = ['sofa', 'rug', 'cup-table', 'book-table', 'cup', 'book'];
const report = {
  build, preflight, status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], video: { enabled: record, playbackSpeed: 1 },
};
let server, profile, context, page, responses, stage, rejection;

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refKey = ref => ref.id + '@' + ref.version;
const node = (document, id) => document.nodes.find(item => item.id === id);
const browserDocument = () => page.evaluate(() => company.session.document);
const savedText = id => page.evaluate(id => company.session.readSavedText(id), id);

async function fixtures() {
  return Promise.all(cases.map(async item => {
    const source = path.resolve(resultsDir, item.key, 'save.json');
    const envelope = JSON.parse(await fs.readFile(source, 'utf8'));
    assert.equal(envelope.schema, 'company-save');
    assert.equal(envelope.document.id, item.id);
    const floor = item.id + '/ground';
    const room = floor + '/lounge';
    const ids = Object.fromEntries(parts.map(key => [key, room + '/' + key]));
    assert.equal(node(envelope.document, room)?.purpose, 'rest');
    assert.deepEqual(node(envelope.document, ids['cup-table'])?.resource, tableRef);
    return { ...item, source, envelope, floor, room, ids };
  }));
}

async function idle(expectedError = false) {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(expectedError), await status.textContent());
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
    if (message.type() !== 'error') return;
    const text = message.text();
    if (rejection && text.includes('invalid-floor-fit') && text.includes(rejection.id)) rejection.messages.push(text);
    else report.browserErrors.push({ stage, message: text });
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
  const previous = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(previous => company.renderStatus().hostFrame > previous, previous);
  assert.equal(await page.evaluate(() => company.renderStatus().lastRenderError), null);
}

async function importFile(fixture) {
  const menu = page.locator('.file-menu');
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
  const opened = page.waitForEvent('filechooser');
  await page.locator('#import').click();
  const picker = await opened;
  assert.equal(await picker.element().getAttribute('id'), 'file');
  await picker.setFiles(fixture.source);
  await page.waitForFunction(id => company.session.document.id === id, fixture.id);
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await browserDocument(), fixture.envelope.document);
}

async function showRoom(fixture) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== fixture.floor) await select('#floor', fixture.floor);
  if (view.roomId !== fixture.room) await select('#room', fixture.room);
  await page.waitForFunction(room => company.session.scene.view.roomId === room, fixture.room);
  await click('.view-toolbar [data-view="room"]');
  await select('#wall-view', 'cutaway');
  await frame();
}

async function inspectRoom(fixture) {
  await frame();
  const actual = await page.evaluate(({ ids, room }) => {
    const { session, camera } = company;
    const scene = session.scene;
    const root = scene.root;
    root.updateMatrixWorld(true);
    const visible = object => {
      for (let current = object; current; current = current.parent) if (current.visible === false) return false;
      return Boolean(object);
    };
    const resourceFor = ref => company.catalog.resources.find(resource => resource.id === ref.id && resource.version === ref.version);
    const resources = {};
    const objects = {};
    const data = Object.fromEntries(Object.entries(ids).map(([key, id]) => {
      const entry = session.document.nodes.find(node => node.id === id);
      const resource = resourceFor(entry.resource);
      const object = root.getObjectByName(id);
      resources[key] = resource;
      objects[key] = object;
      let meshCount = 0;
      let bottom = Infinity;
      const supported = new Set(session.document.nodes.filter(node => node.parentId === id).map(node => node.id));
      for (const visual of object?.children || []) {
        if (supported.has(visual.name)) continue;
        visual.traverse(mesh => {
          if (!mesh.isMesh || !mesh.geometry?.attributes.position?.count || !visible(mesh)) return;
          mesh.geometry.computeBoundingBox();
          bottom = Math.min(bottom, mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.y);
          meshCount++;
        });
      }
      return [key, {
        id, meshCount, bottom, resource: entry.resource, asset: resource.asset, parentId: entry.parentId,
        sceneParent: object?.parent?.name, attachment: entry.attachment, local: entry.transform,
        world: object?.getWorldPosition(camera.position.clone()).toArray(),
      }];
    }));
    for (const key of ['cup', 'book']) {
      const table = key + '-table';
      const top = objects[table]?.getObjectByName(resources[table].supportNodes.top);
      if (!top?.isMesh || !visible(top)) throw new Error('Missing visible tabletop geometry for ' + table);
      top.geometry.computeBoundingBox();
      data[table].topY = top.geometry.boundingBox.clone().applyMatrix4(top.matrixWorld).max.y;
    }
    const floor = scene.surfacePresentation().find(item => item.regionId === room && item.surface === 'floor');
    return { view: scene.view, parts: data, floor };
  }, { ids: fixture.ids, room: fixture.room });
  assert.equal(actual.view.roomId, fixture.room);
  assert.equal(actual.view.floorId, fixture.floor);
  for (const key of parts) assert(actual.parts[key].meshCount > 0, 'Missing visible actual meshes for ' + key);
  for (const key of ['sofa', 'rug', 'cup-table', 'book-table']) {
    assert.equal(actual.parts[key].parentId, fixture.room);
    assert.equal(actual.parts[key].sceneParent, fixture.room);
  }
  for (const key of ['cup', 'book']) {
    const member = actual.parts[key];
    const table = actual.parts[key + '-table'];
    assert.equal(member.parentId, table.id);
    assert.equal(member.sceneParent, table.id);
    assert.deepEqual(member.attachment, { surfaceId: 'top' });
    assert(Math.abs(member.bottom - table.topY) < 0.001, 'Child base lacks physical tabletop contact: ' + key);
  }
  assert(actual.floor?.textureSize.every(size => size > 0));
  return actual;
}

async function verifyNetwork(scene) {
  const loaded = new Map();
  for (const { resource, asset } of Object.values(scene.parts)) {
    if (!asset || loaded.has(refKey(resource))) continue;
    const pathname = new URL(asset.url, server.url).pathname;
    const response = responses.get(pathname);
    assert.equal(response?.status(), 200, 'Actual GLB was not requested: ' + pathname);
    const bytes = await response.body();
    assert.equal(bytes.length, asset.bytes);
    assert.equal(hash(bytes), asset.sha256);
    loaded.set(refKey(resource), { resource, asset });
  }
  return [...loaded.values()];
}

async function inspectCarvedTable(fixture) {
  if (preflight) return undefined;
  const data = await page.evaluate(async ({ tableId, roomId }) => {
    const { session, camera } = company;
    const root = session.scene.root;
    const table = root.getObjectByName(tableId);
    const floor = root.getObjectByName('Floor:' + roomId);
    root.updateMatrixWorld(true);
    floor.geometry.computeBoundingBox();
    const floorY = floor.geometry.boundingBox.clone().applyMatrix4(floor.matrixWorld).max.y;
    const inverse = table.matrixWorld.clone().invert();
    const min = camera.position.clone().setScalar(Infinity);
    const max = camera.position.clone().setScalar(-Infinity);
    const groundArea = [0, 0, 0, 0];
    const photos = new Map();
    const meshes = [];
    const supported = new Set(session.document.nodes.filter(node => node.parentId === tableId).map(node => node.id));
    for (const visual of table.children) {
      if (supported.has(visual.name) || !visual.visible) continue;
      visual.traverse(mesh => {
        if (mesh.isMesh && mesh.visible && mesh.geometry?.attributes.position) meshes.push(mesh);
      });
    }
    const pixelEvidence = async image => {
      if (!image || image.width <= 1 || image.height <= 1) throw new Error('PBR image must be decoded at its actual dimensions');
      if (photos.has(image)) return photos.get(image);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      let rgbLow = 255;
      let rgbHigh = 0;
      let nonBlack = 0;
      const first = (pixels[0] << 16) | (pixels[1] << 8) | pixels[2];
      let distinct = false;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        rgbLow = Math.min(rgbLow, r, g, b);
        rgbHigh = Math.max(rgbHigh, r, g, b);
        if (r || g || b) nonBlack++;
        if (((r << 16) | (g << 8) | b) !== first) distinct = true;
      }
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      const rgbaSha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      const evidence = { width: image.width, height: image.height, rgbLow, rgbHigh, nonBlack, distinct, rgbaSha256 };
      photos.set(image, evidence);
      return evidence;
    };
    const surfaces = [];
    let worldBottom = Infinity;
    for (const mesh of meshes) {
      const { position, uv } = mesh.geometry.attributes;
      if (!uv || uv.count !== position.count) throw new Error('Textured table has incomplete UV mapping at ' + mesh.name);
      const local = [];
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (let i = 0; i < position.count; i++) {
        const point = camera.position.clone().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        worldBottom = Math.min(worldBottom, point.y);
        point.applyMatrix4(inverse);
        min.min(point);
        max.max(point);
        local.push(point);
        const u = uv.getX(i), v = uv.getY(i);
        if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error('Nonfinite table UV');
        uMin = Math.min(uMin, u);
        uMax = Math.max(uMax, u);
        vMin = Math.min(vMin, v);
        vMax = Math.max(vMax, v);
      }
      const index = mesh.geometry.index;
      const count = index?.count ?? position.count;
      for (let i = 0; i < count; i += 3) {
        const vertices = [0, 1, 2].map(n => local[index ? index.getX(i + n) : i + n]);
        if (!vertices.every(vertex => Math.abs(vertex.y) < 1e-6)) continue;
        const [a, b, c] = vertices;
        const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
        if (area < 1e-10) continue;
        const xSide = vertices.every(vertex => vertex.x < 0) ? 0 : vertices.every(vertex => vertex.x > 0) ? 2 : -1;
        const zSide = vertices.every(vertex => vertex.z < 0) ? 0 : vertices.every(vertex => vertex.z > 0) ? 1 : -1;
        if (xSide === -1 || zSide === -1) throw new Error('Unexpected ground geometry bridges distinct table feet');
        groundArea[xSide + zSide] += area;
      }
      const materials = [];
      for (const material of [mesh.material].flat()) {
        const maps = {};
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          const texture = material[slot];
          if (!texture?.isTexture) throw new Error('Missing mapped PBR channel ' + slot + ' on ' + mesh.name);
          maps[slot] = { ...await pixelEvidence(texture.image), colorSpace: texture.colorSpace };
        }
        materials.push({ name: material.name, maps });
      }
      surfaces.push({ name: mesh.name, vertexCount: position.count, triangleCount: count / 3, uvRange: [uMin, uMax, vMin, vMax], materials });
    }
    return { bounds: { min: min.toArray(), max: max.toArray(), size: max.clone().sub(min).toArray() }, floorY, worldBottom, groundArea, surfaces };
  }, { tableId: fixture.ids['cup-table'], roomId: fixture.room });
  assert.equal(data.surfaces.length, 2);
  for (const surface of data.surfaces) {
    const [uMin, uMax, vMin, vMax] = surface.uvRange;
    assert(uMax > uMin && vMax > vMin);
    for (const { maps } of surface.materials) {
      for (const map of Object.values(maps)) {
        assert.deepEqual([map.width, map.height], [1024, 1024]);
        assert(map.nonBlack > 0 && map.distinct && map.rgbHigh > map.rgbLow);
      }
      assert.equal(maps.map.colorSpace, 'srgb');
      assert.equal(maps.normalMap.colorSpace, '');
      assert.equal(maps.roughnessMap.colorSpace, '');
      assert.equal(maps.metalnessMap.colorSpace, '');
      assert.equal(maps.roughnessMap.rgbaSha256, maps.metalnessMap.rgbaSha256);
      assert.equal(new Set([maps.map.rgbaSha256, maps.normalMap.rgbaSha256, maps.roughnessMap.rgbaSha256]).size, 3);
    }
  }
  const [width, height, depth] = data.bounds.size;
  assert(width >= .52 && width <= .8 && depth >= .52 && depth <= .55);
  assert(Math.abs(height - .5) < 1e-6);
  assert(Math.abs(data.worldBottom - data.floorY) < 1e-6);
  assert(data.groundArea.every(area => area > 1e-5), 'All four feet must contact the floor with positive area');
  return data;
}

async function verifyEdit(before, id, changes) {
  const after = await browserDocument();
  before.revision++;
  Object.assign(node(before, id), changes);
  assert.deepEqual(after, before, 'Only the selected table may change');
  return after;
}

async function openPlacement() {
  const placement = page.locator('#placement-tools');
  const precise = placement.locator(':scope > details');
  for (const details of [placement, precise]) {
    if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
  }
}

async function moveAndRotate(fixture) {
  const tableId = fixture.ids['cup-table'];
  await click('#tool-selection');
  await select('#edit-instance', tableId);
  await openPlacement();
  const before = await browserDocument();
  await page.locator('#edit-x').fill(String(fixture.move[0]));
  await page.locator('#edit-z').fill(String(fixture.move[2]));
  await click('#edit-position');
  await verifyEdit(before, tableId, { transform: { position: fixture.move, yaw: 0 } });
  const moved = await inspectRoom(fixture);
  const beforeRotate = await browserDocument();
  await click('#edit-rotate');
  await verifyEdit(beforeRotate, tableId, { transform: { position: fixture.move, yaw: Math.PI / 2 } });
  const rotated = await inspectRoom(fixture);
  const local = rotated.parts.cup.local.position;
  const parent = rotated.parts['cup-table'].world;
  const expected = [parent[0] + local[2], parent[1] + local[1], parent[2] - local[0]];
  for (const [axis, value] of expected.entries()) assert(Math.abs(rotated.parts.cup.world[axis] - value) < 1e-6);
  assert.notDeepEqual(rotated.parts.cup.world, moved.parts.cup.world);
  assert.deepEqual(rotated.parts.book, moved.parts.book);
  return { moved, rotated };
}

async function replaceTable(fixture, resource) {
  const before = await browserDocument();
  assert.equal(await page.locator('#edit-instance').inputValue(), fixture.ids['cup-table']);
  await select('#edit-look', refKey(resource));
  await verifyEdit(before, fixture.ids['cup-table'], { resource });
  const actual = await inspectRoom(fixture);
  assert.deepEqual(actual.parts['cup-table'].resource, resource);
  return actual;
}

async function rejectOutOfBounds(fixture, expected, expectedSaved) {
  await openPlacement();
  rejection = { id: fixture.ids['cup-table'], messages: [] };
  await page.evaluate(() => { window.__qaLoungeRoot = company.session.scene.root; });
  await page.locator('#edit-x').fill('99');
  try {
    await page.locator('#edit-position').click();
    await idle(true);
    assert.equal(await page.locator('#edit-message').getAttribute('data-error'), 'true');
    assert.equal(rejection.messages.length, 1, 'The real boundary validator must reject the table');
    assert.deepEqual(await browserDocument(), expected);
    assert.equal(await savedText(fixture.id), expectedSaved);
    assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
    assert(await page.evaluate(() => window.__qaLoungeRoot === company.session.scene.root), 'Rejected edit replaced the live scene');
    return { code: 'invalid-floor-fit', note: await page.locator('#edit-message').textContent(), documentAndSaveUnchanged: true };
  } finally {
    rejection = null;
    await page.evaluate(() => { delete window.__qaLoungeRoot; });
  }
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
  stage = 'read batch saves';
  const inputs = await fixtures();
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'fixed build startup';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser();
  const previousSaves = new Map();
  for (const fixture of inputs) {
    let saved;
    await check('Import and inspect real furniture in ' + fixture.key, async () => {
      await importFile(fixture);
      await showRoom(fixture);
      const scene = await inspectRoom(fixture);
      const choices = await page.locator('#edit-instance option').evaluateAll(options => options.map(option => option.value));
      for (const id of Object.values(fixture.ids)) assert(choices.includes(id), 'Editable item is missing from inspector: ' + id);
      return { scene, carved: await inspectCarvedTable(fixture), image: await shot(fixture.key + '.png') };
    });
    await check('Move, rotate, replace and reject an outside position in ' + fixture.key, async () => {
      const { moved, rotated } = await moveAndRotate(fixture);
      const old = await replaceTable(fixture, oldRef);
      const restored = await replaceTable(fixture, tableRef);
      for (const key of ['sofa', 'rug', 'cup', 'book', 'book-table']) {
        assert.deepEqual(restored.parts[key], rotated.parts[key]);
        assert.deepEqual(old.parts[key], rotated.parts[key]);
      }
      await click('#edit-focus');
      const image = await shot(fixture.key + '-table.png');
      await click('#save');
      assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
      saved = await savedText(fixture.id);
      const edited = await browserDocument();
      const envelope = JSON.parse(saved);
      assert.deepEqual(envelope.document, edited);
      assert.deepEqual(envelope.dependencies, fixture.envelope.dependencies);
      const rejected = await rejectOutOfBounds(fixture, edited, saved);
      return { moved, rotated, old, restored, image, rejected };
    });
    await check('Close Chromium and automatically restore ' + fixture.key, async () => {
      await closeBrowser();
      await openBrowser();
      assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
      assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
      assert.deepEqual(await browserDocument(), JSON.parse(saved).document);
      assert.equal(await savedText(fixture.id), saved);
      for (const [id, previous] of previousSaves) assert.equal(await savedText(id), previous);
      previousSaves.set(fixture.id, saved);
      await showRoom(fixture);
      const scene = await inspectRoom(fixture);
      return { scene, carved: await inspectCarvedTable(fixture), loadedGlbs: await verifyNetwork(scene) };
    });
  }
  if (record) {
    await check('Record the two edited lounge compositions at normal speed', async () => {
      await closeBrowser();
      profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
      await openBrowser(true);
      for (const fixture of inputs) {
        await importFile(fixture);
        await showRoom(fixture);
        await page.waitForTimeout(1200);
        await moveAndRotate(fixture);
        await click('#edit-focus');
        await page.waitForTimeout(1400);
      }
      const captured = await page.video().path();
      await closeBrowser();
      const file = path.join('video', 'lounge-rooms-normal.webm');
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
    report.status = 'failed';
    report.cleanupError = error.message;
    process.exitCode = 1;
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video.file }));
});
