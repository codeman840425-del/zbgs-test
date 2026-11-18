const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { chromium } = require('../../prototype/node_modules/playwright');

const [inputArg, build, outArg, roomArg, ...extra] = process.argv.slice(2);
if (!inputArg || !/^[a-f0-9]{12}$/.test(build) || !outArg || extra.length) {
  throw new Error('Usage: node qa-vanity-seat-contact-rooms.cjs DIST_OR_PACKAGE BUILD NEW_OUTPUT_DIRECTORY [CANDIDATE_ROOT_FOR_DIST]');
}
const input = path.resolve(inputArg), out = path.resolve(outArg);
const rayUrl = '/__vanity-seat-qa/three.core.js';
const fixtures = [
  { key: 'vanity-display', id: 'appearance-vanity-table', tables: ['vanity/primary'] },
  { key: 'vanity-alternate', id: 'vanity-alternate', tables: ['vanity/primary', 'vanity/secondary'] },
];
const reference = { id: 'vanity-chair-side-entry', version: 2 };
const oldReference = { ...reference, version: 1 };
const hash = contents => createHash('sha256').update(contents).digest('hex');
const read = file => fs.readFile(path.join(input, file));
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const stable = ({ resource, revision, ...contact }) => contact;
const live = () => page.evaluate(() => company.session.document);
const report = { status: 'running', build, rooms: [], browserErrors: [],
  scope: 'Actual contact meshes and static use-point geometry in Chromium' };
let manifest, server, child, url, context, page, responses, rayModule, stage;

async function pin(file) {
  const bytes = await read(file);
  const entry = manifest.files.find(item => item.path === file);
  assert.equal(entry?.bytes, bytes.length);
  assert.equal(entry.sha256, hash(bytes));
  return bytes;
}

async function start() {
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

async function fixtureInput(fixture) {
  if (!manifest) {
    const root = path.resolve(roomArg, fixture.key);
    const bytes = await fs.readFile(path.join(root, 'save.json'));
    return { address: new URL(url), bytes, importPath: path.join(root, 'original.save.json') };
  }
  const preferred = 'data/rooms/' + fixture.key + '/save.json';
  const candidates = [preferred, ...manifest.files.map(entry => entry.path).filter(file => file !== preferred &&
    /^data\/(save\.json|rooms\/[a-z][a-z0-9-]{0,62}\/save\.json)$/.test(file))].filter(file => manifest.files.some(entry => entry.path === file));
  for (const file of candidates) {
    const bytes = await pin(file);
    if (JSON.parse(bytes).document.id !== fixture.id) continue;
    const delivery = file === 'data/save.json' ? '1' : file.split('/')[2];
    const address = new URL(url);
    address.searchParams.set('delivery', delivery);
    return { address, bytes, request: delivery === '1' ? '/delivery-save.json' : '/delivery-room/' + delivery + '.json' };
  }
  throw new Error('Package manifest has no vanity room ' + fixture.id);
}

async function idle() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled &&
    document.querySelector('#status').dataset.error !== undefined);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'false', await status.textContent());
}

async function open(profile, address, companyId) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: { width: 1500, height: 950 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  await context.route('**' + rayUrl, route => route.fulfill({ contentType: 'text/javascript', body: rayModule }));
  context.setDefaultTimeout(20000);
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', event => { if (event.type() === 'error') report.browserErrors.push({ stage, message: event.text() }); });
  await page.goto(address.href);
  if (companyId) await page.waitForFunction(id => window.company?.session.document.id === id, companyId);
  await idle();
  const info = await page.evaluate(() => company.buildInfo);
  assert.equal(info.shortId, build);
  if (manifest) assert.equal(info.sourceDigest, manifest.sourceDigest);
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false);
  context = null;
  page = null;
}

async function importOld(file, fixture) {
  await page.locator('.file-menu > summary').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
  await chooser.setFiles(file);
  await page.waitForFunction(id => company.session.document.id === id, fixture.id);
  await idle();
  const menu = page.locator('.file-menu');
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
}

async function showRoom(document, tableId) {
  const id = document.nodes.find(row => row.id === tableId)?.parentId;
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.roomId !== id || view.mode !== 'room') await page.locator('#room').selectOption(id);
  await idle();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(tableId + '/seat');
  await page.evaluate(tableId => {
    const { session, camera } = company;
    const table = session.scene.root.getObjectByName(tableId);
    const world = p => table.localToWorld(camera.position.clone().fromArray(p));
    camera.position.copy(world([-1.65, 1.65, 2.65]));
    camera.lookAt(world([.05, .54, .28]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, tableId);
}

async function measure(tableId, expected) {
  const actual = await page.evaluate(async ({ tableId, rayUrl }) => {
    const { Raycaster, Vector3 } = await import(rayUrl);
    const { scene } = company.session;
    const contact = scene.describeUsePoint(tableId + '/seat#seat');
    const { chairSeat, chairBack } = scene.resolveUsePoint(contact.id);
    const chair = scene.root.getObjectByName(contact.facilityId);
    const table = scene.root.getObjectByName(tableId);
    const top = table.getObjectByName('vanity-top');
    const visible = mesh => {
      for (let object = mesh; object; object = object.parent) if (object.visible === false) return false;
      return mesh?.isMesh;
    };
    if (![chairSeat, chairBack, top].every(visible) || !chair.getObjectById(chairSeat.id) || !chair.getObjectById(chairBack.id)) {
      throw new Error('Expected visible seat, back and tabletop on the installed instances');
    }
    scene.root.updateMatrixWorld(true);
    const samples = [[0, 0], [-.1, 0], [.1, 0], [0, -.08], [0, .08]].map(([x, z]) => {
      const origin = chair.localToWorld(new Vector3(x, .95, z));
      const ray = new Raycaster(origin, new Vector3(0, -1, 0), 0, .75);
      const hit = ray.intersectObject(chairSeat, false)[0];
      if (!hit || hit.object !== chairSeat) throw new Error('Mesh ray missed actual chair seat');
      return { offset: [x, z], height: chair.worldToLocal(hit.point.clone()).y, triangle: hit.faceIndex };
    });
    const inverse = table.matrixWorld.clone().invert();
    const range = object => {
      let minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
      object.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position, matrix = inverse.clone().multiply(mesh.matrixWorld);
        const point = new Vector3();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
          minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z); maxY = Math.max(maxY, point.y);
        }
      });
      return { minZ, maxZ, maxY };
    };
    const tableTop = range(top);
    const resource = company.catalog.resources.find(item => item.id === contact.resource.id && item.version === contact.resource.version);
    return { contact, parent: chair.parent.name, roomInView: scene.view.roomId, asset: resource.asset || null,
      height: tableTop.maxY, clearance: range(chair).minZ - tableTop.maxZ,
      orientation: chair.getWorldDirection(new Vector3()).dot(table.getWorldDirection(new Vector3())),
      chairInTable: table.worldToLocal(chair.getWorldPosition(new Vector3())).toArray(),
      approachInTable: table.worldToLocal(new Vector3(...contact.approachPosition)).toArray(),
      exitInTable: table.worldToLocal(new Vector3(...contact.exitPosition)).toArray(),
      seatMesh: chairSeat.userData.name || chairSeat.name, backMesh: chairBack.userData.name || chairBack.name,
      samples, renderError: company.renderStatus().lastRenderError };
  }, { tableId, rayUrl });
  assert.deepEqual(actual.contact.resource, expected);
  assert.equal(actual.contact.seatHeight, .470);
  assert.equal(actual.parent, actual.contact.roomId);
  assert.equal(actual.roomInView, actual.contact.roomId);
  assert.equal(actual.seatMesh, 'chair-seat');
  assert.equal(actual.backMesh, 'chair-back');
  assert.equal(actual.renderError, null);
  near(actual.height, .78);
  near(actual.orientation, -1);
  for (const [key, world] of [['chairInTable', [.02, 0, .55]], ['approachInTable', [.67, 0, .55]], ['exitInTable', [-.63, 0, .55]]]) {
    world.forEach((value, index) => near(actual[key][index], value));
  }
  assert(actual.clearance > .035);
  const seat = expected.version === 2 ? .470 : .475;
  for (const sample of actual.samples) {
    assert(Number.isInteger(sample.triangle));
    near(sample.height, seat);
  }
  if (expected.version === 2) {
    assert(actual.asset);
    const response = responses.get(actual.asset.url);
    assert.equal(response?.status(), 200);
    const bytes = manifest ? await pin('viewer' + actual.asset.url) : await read('.' + actual.asset.url);
    assert.equal(bytes.length, actual.asset.bytes);
    assert.equal(hash(bytes), actual.asset.sha256);
    assert(bytes.equals(await response.body()));
  }
  return actual;
}

async function inspectFixture(fixture) {
  const { address, bytes, importPath, request } = await fixtureInput(fixture);
  const envelope = JSON.parse(bytes);
  assert.equal(envelope.schema, 'company-save');
  assert.equal(envelope.document.id, fixture.id);
  const seats = envelope.document.nodes.filter(row => row.resource?.id === reference.id);
  assert.deepEqual(seats.map(row => row.id), fixture.tables.map(table => table + '/seat'));
  assert(seats.every(row => row.resource.version === 2));
  const profile = await fs.mkdtemp(path.join(out, 'chromium-'));
  await open(profile, address, request ? fixture.id : undefined);
  if (request) {
    const deliverySave = responses.get(request);
    assert.equal(deliverySave?.status(), 200);
    assert(bytes.equals(await deliverySave.body()));
    assert.deepEqual(await live(), envelope.document);
  } else await importOld(importPath, fixture);
  const result = { fixture: fixture.key, candidateSha256: hash(bytes), seats: [] };
  report.rooms.push(result);
  for (const [index, table] of fixture.tables.entries()) {
    await showRoom(envelope.document, table);
    let legacy;
    if (importPath) {
      legacy = await measure(table, oldReference);
      const before = await live();
      before.revision++;
      before.nodes.find(row => row.id === table + '/seat').resource = reference;
      await page.locator('#edit-look').selectOption(reference.id + '@2');
      await idle();
      assert.deepEqual(await live(), before);
    }
    const fixed = await measure(table, reference);
    if (legacy) assert.deepEqual(stable(legacy.contact), stable(fixed.contact));
    const image = fixture.key + '-seat-' + (index + 1) + '.png';
    await page.screenshot({ path: path.join(out, image) });
    result.seats.push({ legacy, fixed, image });
  }
  assert.deepEqual(await live(), envelope.document);
  await page.locator('#save').click();
  await idle();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const saved = await page.evaluate(id => company.session.readSavedText(id), fixture.id);
  assert.deepEqual(JSON.parse(saved), envelope);
  if (importPath) assert.equal(saved, bytes.toString('utf8'));
  await close();
  await open(profile, url, fixture.id);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.evaluate(id => company.session.readSavedText(id), fixture.id), saved);
  assert.deepEqual(await live(), envelope.document);
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  for (const [index, table] of fixture.tables.entries()) {
    await showRoom(envelope.document, table);
    const actual = await measure(table, reference);
    const expected = result.seats[index].fixed;
    assert.deepEqual({ ...actual, contact: stable(actual.contact) }, { ...expected, contact: stable(expected.contact) });
  }
  result.browserRestarted = true;
  result.browserSaveSha256 = hash(saved);
  await close();
}

async function run() {
  await fs.mkdir(out);
  stage = 'open release or existing dist';
  const manifestBytes = await read('transfer-manifest.json').catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  assert.equal(Boolean(manifestBytes), !roomArg, 'Pass the candidate root for a dist. A package supplies its own pinned saves.');
  if (manifestBytes) {
    manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.schema, 'company-transfer');
    assert.equal(manifest.buildId, build);
    const lock = JSON.parse(await pin('source/prototype/package-lock.json'));
    assert.equal(lock.packages['node_modules/three'].version, require('../../prototype/node_modules/three/package.json').version);
  }
  rayModule = await fs.readFile(path.resolve(__dirname, '../../prototype/node_modules/three/build/three.core.js'), 'utf8');
  url = await start();
  for (const fixture of fixtures) {
    stage = fixture.key;
    await inspectFixture(fixture);
  }
  assert.deepEqual(report.browserErrors, []);
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
    console.log(JSON.stringify({ status: report.status, build, output: out }));
  }
});
