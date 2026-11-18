const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, input, outArg, ...options] = process.argv.slice(2);
if (!dist || !build || !input || !outArg || options.length > 1 || options.some(option => option !== '--record')) {
  throw new Error('Usage: node qa-sourced-ornaments.cjs DIST BUILD LAYOUT_OR_SAVE OUT [--record]');
}
const source = path.resolve(input);
const out = path.resolve(outArg);
const record = options.includes('--record');
const viewport = { width: 1600, height: 1000 };
const books = { id: 'tabletop-books-kenney', version: 1 };
const plant = { id: 'tabletop-plant-kenney', version: 1 };
const report = {
  build, status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], video: { enabled: record, playbackSpeed: 1 },
};
let server, profile, context, page, responses, stage, expectedRejection;

const refKey = ref => ref.id + '@' + ref.version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const node = (document, id) => document.nodes.find(item => item.id === id);
const browserDocument = () => page.evaluate(() => company.session.document);
const readSavedText = id => page.evaluate(id => company.session.readSavedText(id), id);

async function fixture() {
  const file = JSON.parse(await fs.readFile(source, 'utf8'));
  const document = file.schema === 'company-save' ? file.document : file;
  assert.equal(document.schema, 'company-layout');
  const ornaments = document.nodes.filter(item => (
    item.kind === 'facility' && item.resource.id === books.id && item.resource.version === books.version
  ));
  assert.equal(ornaments.length, 1, 'The supplied lounge must have one selected books instance');
  const original = ornaments[0];
  const table = node(document, original.parentId);
  const room = node(document, table?.parentId);
  const floor = node(document, room?.parentId);
  assert.equal(room?.purpose, 'rest');
  assert.equal(floor?.kind, 'floor');
  assert.deepEqual(table.resource, { id: 'side-table-carved-round', version: 1 });
  assert.deepEqual(original.attachment, { surfaceId: 'top' });
  return { document, original, table, room, floor };
}

async function idle(error = false) {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled
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
    if (expectedRejection && text.includes('invalid-support-fit') && text.includes(expectedRejection.id)) {
      expectedRejection.messages.push(text);
    } else report.browserErrors.push({ stage, message: text });
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

async function renderedFrame() {
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
  await picker.setFiles(source);
  await page.waitForFunction(id => company.session.document.id === id, input.document.id);
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await browserDocument(), input.document);
}

async function showRoom(input) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== input.floor.id) await select('#floor', input.floor.id);
  if (view.roomId !== input.room.id) await select('#room', input.room.id);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, input.room.id);
  await click('.view-toolbar [data-view="room"]');
  await select('#wall-view', 'cutaway');
  await renderedFrame();
}

async function pickOrnament(input) {
  await click('#tool-selection');
  await select('#edit-instance', input.original.id);
  const looks = await page.locator('#edit-look option').evaluateAll(nodes => nodes.map(option => option.value));
  assert(looks.includes(refKey(books)));
  assert(looks.includes(refKey(plant)));
}

async function inspectGeometry(input, ref) {
  await renderedFrame();
  const geometry = await page.evaluate(({ id, tableId }) => {
    const { session, camera } = company;
    const scene = session.scene;
    const root = scene.root;
    root.updateMatrixWorld(true);
    const prop = root.getObjectByName(id);
    const table = root.getObjectByName(tableId);
    const current = session.document.nodes.find(node => node.id === id);
    const parent = session.document.nodes.find(node => node.id === tableId);
    const resourceFor = ref => company.catalog.resources.find(item => item.id === ref.id && item.version === ref.version);
    const resource = resourceFor(current.resource);
    const tableResource = resourceFor(parent.resource);
    const top = table?.getObjectByName(tableResource.supportNodes[current.attachment.surfaceId]);
    if (!prop || !table || !top?.isMesh) throw new Error('The actual ornament and its tabletop must be mounted');
    top.geometry.computeBoundingBox();
    const worldSupportY = top.geometry.boundingBox.clone().applyMatrix4(top.matrixWorld).max.y;
    const declaration = tableResource.supportSurfaces.find(surface => surface.id === current.attachment.surfaceId);
    const inverseTable = table.matrixWorld.clone().invert();
    const inverseOrnament = prop.matrixWorld.clone().invert();
    const min = camera.position.clone().setScalar(Infinity);
    const max = camera.position.clone().setScalar(-Infinity);
    const tableMin = min.clone();
    const tableMax = max.clone();
    let worldBottom = Infinity;
    const meshes = [];
    prop.traverse(mesh => {
      const position = mesh.geometry?.attributes.position;
      if (!mesh.isMesh || !position?.count) return;
      for (let current = mesh; current; current = current.parent) if (current.visible === false) return;
      for (let i = 0; i < position.count; i++) {
        const point = camera.position.clone().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        worldBottom = Math.min(worldBottom, point.y);
        const inTable = point.clone().applyMatrix4(inverseTable);
        tableMin.min(inTable);
        tableMax.max(inTable);
        point.applyMatrix4(inverseOrnament);
        min.min(point);
        max.max(point);
      }
      meshes.push({
        name: mesh.userData.name || mesh.name,
        triangles: (mesh.geometry.index?.count ?? position.count) / 3,
        vertices: position.count,
        uv: mesh.geometry.attributes.uv?.count ?? 0,
        maps: [mesh.material].flat().map(material => material.map).filter(Boolean)
          .map(map => ({ width: map.image?.width, height: map.image?.height, colorSpace: map.colorSpace })),
      });
    });
    const world = prop.getWorldPosition(camera.position.clone()).toArray();
    const expectedWorld = table.localToWorld(camera.position.clone().fromArray(current.transform.position)).toArray();
    return {
      view: scene.view, current, parent, source: resource.provenance, asset: resource.asset,
      mount: resource.mounting, sceneParent: prop.parent.name, tableParent: table.parent.name,
      world, expectedWorld, worldBottom, worldSupportY, declaration, meshes,
      localBounds: { min: min.toArray(), max: max.toArray(), size: max.clone().sub(min).toArray() },
      tableBounds: { min: tableMin.toArray(), max: tableMax.toArray() },
    };
  }, { id: input.original.id, tableId: input.table.id });
  assert.equal(geometry.view.roomId, input.room.id);
  assert.deepEqual(geometry.current.resource, ref);
  assert.equal(geometry.sceneParent, input.table.id);
  assert.equal(geometry.tableParent, input.room.id);
  assert.deepEqual(geometry.current.transform, input.original.transform);
  assert.deepEqual(geometry.current.attachment, input.original.attachment);
  assert.deepEqual(geometry.parent, input.table);
  for (const [axis, value] of geometry.expectedWorld.entries()) assert(Math.abs(geometry.world[axis] - value) < 1e-6);
  assert(Math.abs(geometry.worldBottom - geometry.worldSupportY) < 1e-4, 'Actual geometry must contact its physical tabletop');
  assert(geometry.meshes.length > 0 && geometry.meshes.every(mesh => mesh.triangles > 0));
  assert(geometry.localBounds.size.every(size => Number.isFinite(size) && size > 0));
  const [width, height, depth] = geometry.localBounds.size;
  assert(width <= geometry.mount.width + 1e-5 && height <= geometry.mount.height + 1e-5 && depth <= geometry.mount.depth + 1e-5);
  const { min, max } = geometry.tableBounds;
  const { center, halfSize, topY, clearanceHeight } = geometry.declaration;
  for (const [i, axis] of [0, 2].entries()) {
    assert(min[axis] >= center[i] - halfSize[i] - 1e-6 && max[axis] <= center[i] + halfSize[i] + 1e-6);
  }
  assert(min[1] >= topY - 1e-6 && max[1] <= topY + clearanceHeight + 1e-6);
  for (const mesh of geometry.meshes) {
    if (mesh.maps.length) assert.equal(mesh.uv, mesh.vertices);
    for (const map of mesh.maps) assert(map.width > 0 && map.height > 0);
  }
  const pathname = new URL(geometry.asset.url, server.url).pathname;
  const response = responses.get(pathname);
  assert.equal(response?.status(), 200, 'The exact external-derived GLB must be loaded');
  const bytes = await response.body();
  assert.equal(bytes.length, geometry.asset.bytes);
  assert.equal(hash(bytes), geometry.asset.sha256);
  assert.match(JSON.stringify(geometry.source), /kenney/i, 'Missing original Kenney source provenance');
  assert.match(geometry.source.sourceGlbSha256, /^[a-f0-9]{64}$/, 'Missing original source model hash');
  return geometry;
}

async function replace(input, ref) {
  const before = await browserDocument();
  assert.equal(await page.locator('#edit-instance').inputValue(), input.original.id);
  await select('#edit-look', refKey(ref));
  const after = await browserDocument();
  before.revision++;
  node(before, input.original.id).resource = ref;
  assert.deepEqual(after, before, 'Only the selected resource reference and revision should change');
}

async function save(input, ref) {
  const expected = await browserDocument();
  await click('#save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await readSavedText(input.document.id);
  const envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, expected);
  const pin = envelope.dependencies.resources.find(item => refKey(item) === refKey(ref));
  assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
  return { text, expected, pin };
}

async function recover(input, saved) {
  await closeBrowser();
  await openBrowser();
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await browserDocument(), saved.expected);
  assert.equal(await readSavedText(input.document.id), saved.text);
  await showRoom(input);
  await pickOrnament(input);
}

async function refuseOverhang(input, saved) {
  const placement = page.locator('#placement-tools');
  const precise = placement.locator(':scope > details');
  for (const details of [placement, precise]) {
    if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
  }
  expectedRejection = { id: input.original.id, messages: [] };
  await page.evaluate(() => { window.__qaOrnamentRoot = company.session.scene.root; });
  try {
    await page.locator('#edit-x').fill('0.4');
    await page.locator('#edit-position').click();
    await idle(true);
    assert.equal(await page.locator('#edit-message').getAttribute('data-error'), 'true');
    assert.equal(expectedRejection.messages.length, 1);
    assert.deepEqual(await browserDocument(), saved.expected);
    assert.equal(await readSavedText(input.document.id), saved.text);
    assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
    assert(await page.evaluate(() => window.__qaOrnamentRoot === company.session.scene.root));
    return { rejected: true, code: 'invalid-support-fit', message: await page.locator('#edit-message').textContent() };
  } finally {
    expectedRejection = null;
    await page.evaluate(() => { delete window.__qaOrnamentRoot; });
  }
}

async function screenshot(file) {
  await renderedFrame();
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
  stage = 'read saved lounge fixture';
  const input = await fixture();
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'fixed build startup';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser();
  let bookGeometry, plantGeometry, bookSave, plantSave;
  await check('Import the prior lounge with books on the carved side table', async () => {
    await importFile(input);
    await showRoom(input);
    const overview = await screenshot('00-lounge.png');
    await pickOrnament(input);
    await click('#edit-focus');
    bookGeometry = await inspectGeometry(input, books);
    return { overview, image: await screenshot('01-books.png'), geometry: bookGeometry };
  });
  await check('Save and automatically restore the mounted books after Chromium restarts', async () => {
    bookSave = await save(input, books);
    await recover(input, bookSave);
    const recovered = await inspectGeometry(input, books);
    assert.deepEqual(recovered, bookGeometry);
    return { geometry: recovered, pin: bookSave.pin };
  });
  await check('Apply the compatible plant look to the same instance', async () => {
    await replace(input, plant);
    await click('#edit-focus');
    plantGeometry = await inspectGeometry(input, plant);
    assert.notEqual(plantGeometry.asset.sha256, bookGeometry.asset.sha256);
    assert.notEqual(plantGeometry.source.sourceGlbSha256, bookGeometry.source.sourceGlbSha256);
    assert.notDeepEqual(plantGeometry.localBounds, bookGeometry.localBounds);
    assert.deepEqual(plantGeometry.world, bookGeometry.world);
    return { image: await screenshot('02-plant.png'), geometry: plantGeometry };
  });
  await check('Reject an off-table installation without changing the scene or saved bytes', async () => {
    plantSave = await save(input, plant);
    return { ...await refuseOverhang(input, plantSave), pin: plantSave.pin };
  });
  await check('Restart Chromium and automatically recover the same mounted plant', async () => {
    await recover(input, plantSave);
    const recovered = await inspectGeometry(input, plant);
    assert.deepEqual(recovered, plantGeometry);
    await click('#edit-focus');
    return { geometry: recovered, image: await screenshot('03-plant-restored.png') };
  });
  if (record) {
    await check('Capture both ornaments in one normal-speed browser session', async () => {
      await closeBrowser();
      profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
      await openBrowser(true);
      await importFile(input);
      await showRoom(input);
      await page.waitForTimeout(1100);
      await pickOrnament(input);
      await click('#edit-focus');
      await page.waitForTimeout(1500);
      await replace(input, plant);
      await click('#edit-focus');
      await page.waitForTimeout(1500);
      const raw = await page.video().path();
      await closeBrowser();
      const file = path.join('video', 'sourced-ornaments-normal.webm');
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
