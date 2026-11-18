const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { chromium } = require('../../prototype/node_modules/playwright');

const [packageArg, build, outArg, ...options] = process.argv.slice(2);
const candidateIndex = options.indexOf('--candidate-root');
const candidateArg = candidateIndex < 0 ? undefined : options[candidateIndex + 1];
const requestedFlags = options.filter((_, index) => candidateIndex < 0 || (index !== candidateIndex && index !== candidateIndex + 1));
const flags = new Set(requestedFlags);
if (!packageArg || !/^[a-f0-9]{12}$/.test(build) || !outArg || flags.size !== requestedFlags.length ||
    requestedFlags.some(flag => !['--replace', '--expect-fixed', '--record'].includes(flag)) ||
    (candidateIndex >= 0 && (!candidateArg || candidateArg.startsWith('--') || !flags.has('--expect-fixed'))) ||
    (flags.has('--replace') && flags.has('--expect-fixed'))) {
  throw new Error('Usage: node qa-seat-contact-rooms.cjs PACKAGE BUILD OUT [--replace | --expect-fixed [--candidate-root ROOT]] [--record]');
}
const delivery = path.resolve(packageArg);
const out = path.resolve(outArg);
const candidateRoot = candidateArg && path.resolve(candidateArg);
const leaf = '../../prototype/node_modules/three';
const threeVersion = require(leaf + '/package.json').version;
const chairRef = { id: 'chair', version: 1 };
const ladderRef = { id: 'chair-ladder', version: 1 };
const viewport = { width: 1500, height: 950 };
const originModule = '/__seat-qa/three.core.js';
const tolerance = 1e-6;
const key = ref => ref.id + '@' + ref.version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const find = (doc, id) => doc.nodes.find(row => row.id === id);
const read = file => fs.readFile(path.join(delivery, file));
const documentNow = () => page.evaluate(() => company.session.document);
const savedText = id => page.evaluate(id => company.session.readSavedText(id), id);
const report = { status: 'running', build, mode: flags.has('--replace') ? 'replace' : flags.has('--expect-fixed') ? 'expect-fixed' : 'audit',
  raycaster: 'Three ' + threeVersion + ' in Chromium, actual Mesh.raycast', saves: [], errors: [],
  limit: 'Static geometry and saved pose. No live character motion or clearance acceptance.' };
let server, context, page, profile, manifest, source, stage, responses, url, rawVideos = [];

async function readPinned(file) {
  const bytes = await read(file);
  const pin = manifest.files.find(entry => entry.path === file);
  assert.equal(pin?.bytes, bytes.length, 'Packaged file size mismatch ' + file);
  assert.equal(pin.sha256, hash(bytes), 'Packaged file SHA-256 mismatch ' + file);
  return bytes;
}

async function startServer() {
  server = spawn(process.execPath, ['serve.mjs', '0'], { cwd: delivery, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: server.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line', { signal: AbortSignal.timeout(20000) }),
      once(server, 'exit').then(([code]) => { throw new Error('Package server exited during startup: ' + code); }),
    ]);
    const address = new URL(line);
    assert.equal(address.hostname, '127.0.0.1');
    assert.equal(address.protocol, 'http:');
    assert(address.port);
    assert.equal(address.pathname, '/company.html');
    return address;
  } finally {
    lines.close();
    server.stdout.resume();
  }
}

async function idle() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    !document.querySelector('#mode-room').disabled && document.querySelector('#status').dataset.error !== undefined);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'false', await status.textContent());
}

async function openBrowser(address, id, record = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(record ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  page = context.pages()[0] || await context.newPage();
  context.setDefaultTimeout(20000);
  await context.route('**' + originModule, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: source }));
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ stage, message: message.text() });
  });
  await page.goto(address.href);
  await page.waitForFunction(id => window.company?.session?.document.id === id, id);
  await idle();
  const actual = await page.evaluate(() => company.buildInfo);
  assert.equal(actual.shortId, build);
  assert.equal(actual.sourceDigest, manifest.sourceDigest);
}

async function closeBrowser() {
  if (!context) return;
  const browser = context.browser();
  const video = page.video();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false);
  if (video) rawVideos.push(await video.path());
  context = null;
  page = null;
}

async function showRoom(input, roomId) {
  const room = find(input.document, roomId);
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.parentId) {
    await page.locator('#floor').selectOption(room.parentId);
    await idle();
  }
  if (view.mode !== 'room' || view.roomId !== roomId || view.floorId !== room.parentId) {
    await page.locator('#room').selectOption(roomId);
    await idle();
  }
  await page.waitForFunction(id => company.session.scene.view.roomId === id, roomId);
  await page.locator('.view-toolbar [data-view="room"]').click();
  await idle();
}

async function describeAll(input) {
  return page.evaluate(floorIds => floorIds.flatMap(floorId => company.session.scene.describeUsePoints({ floorId }))
    .map(point => {
      const ref = company.catalog.resources.find(row => row.id === point.resource.id && row.version === point.resource.version);
      return { id: point.id, roomId: point.roomId, facilityId: point.facilityId, role: ref.mountRole };
    }).filter(point => ['chair', 'sofa'].includes(point.role)), input.document.nodes.filter(node => node.kind === 'floor').map(node => node.id));
}

async function measure(ids) {
  return page.evaluate(async ({ ids, originModule }) => {
    const { Raycaster, Vector3 } = await import(originModule);
    const { scene } = company.session;
    const visible = object => {
      for (let node = object; node; node = node.parent) if (node.visible === false) return false;
      return true;
    };
    const offsets = [[0, 0], [-.10, 0], [.10, 0], [0, -.08], [0, .08]];
    scene.root.updateMatrixWorld(true);
    return ids.map(id => {
      const point = scene.describeUsePoint(id);
      const runtime = scene.resolveUsePoint(id);
      const facility = scene.root.getObjectByName(point.facilityId);
      const { chairSeat, chairBack } = runtime;
      if (!chairSeat?.isMesh || !chairBack?.isMesh || !visible(chairSeat) || !visible(chairBack) ||
          facility.getObjectById(chairSeat.id) !== chairSeat) throw new Error('Expected actual seat and back mesh for ' + id);
      const [x, , z] = point.local.position;
      const samples = offsets.map(([dx, dz]) => {
        const start = facility.localToWorld(new Vector3(x + dx, point.seatHeight + .45, z + dz));
        const end = facility.localToWorld(new Vector3(x + dx, point.seatHeight - .10, z + dz));
        const ray = new Raycaster(start, end.clone().sub(start).normalize(), 0, start.distanceTo(end));
        const hit = ray.intersectObject(chairSeat, false)[0];
        if (!hit || hit.object !== chairSeat) throw new Error('Mesh ray missed actual seat ' + id + ' at offset ' + [dx, dz]);
        const local = facility.worldToLocal(hit.point.clone()).toArray();
        return { offset: [dx, dz], rayStart: start.toArray(), worldContact: hit.point.toArray(), localContact: local,
          triangle: hit.faceIndex, height: local[1], errorMetres: local[1] - point.seatHeight };
      });
      const { scene: current, document: doc } = company.session;
      const node = doc.nodes.find(row => row.id === point.facilityId);
      const resource = company.catalog.resources.find(row => row.id === node.resource.id && row.version === node.resource.version);
      return { contact: point, node, role: resource.mountRole, asset: resource.asset || null,
        roomInView: current.view.roomId, sceneParent: facility.parent.name,
        seatMesh: chairSeat.userData.name || chairSeat.name, backMesh: chairBack.userData.name || chairBack.name, samples };
    });
  }, { ids, originModule });
}

async function verifiedAsset(asset) {
  if (!asset) return;
  const pathname = new URL(asset.url, url).pathname;
  const response = responses.get(pathname);
  assert.equal(response?.status(), 200, 'Expected browser request for ' + pathname);
  const bytes = await readPinned('viewer' + pathname);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(hash(bytes), asset.sha256);
  assert(bytes.equals(await response.body()));
}

async function audit(input, saveReport) {
  const groups = await describeAll(input);
  const observed = { chairs: [], sofas: [] };
  for (const roomId of [...new Set(groups.map(point => point.roomId))]) {
    await showRoom(input, roomId);
    const rows = await measure(groups.filter(point => point.roomId === roomId).map(point => point.id));
    for (const row of rows) {
      assert.equal(row.roomInView, roomId);
      assert.equal(row.sceneParent, row.node.parentId);
      assert(row.samples.every(sample => Number.isInteger(sample.triangle) && Number.isFinite(sample.height)));
      await verifiedAsset(row.asset);
      (row.role === 'chair' ? observed.chairs : observed.sofas).push(row);
    }
    assert.equal(await page.evaluate(() => company.renderStatus().lastRenderError), null);
  }
  if (saveReport) saveReport.initial = observed;
  return observed;
}

async function selectChair(input, row) {
  await showRoom(input, row.roomInView);
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(row.node.id);
  assert.equal(await page.locator('#edit-instance').inputValue(), row.node.id);
}

function semanticContact(contact) {
  const { resource, revision, contact: meshNames, ...stable } = contact;
  return stable;
}

function assertFixed(rows) {
  for (const row of rows) {
    assert.deepEqual(row.node.resource, ladderRef);
    assert.equal(row.contact.seatHeight, .470);
    assert(row.samples.every(sample => Math.abs(sample.height - .470) <= tolerance), 'Each actual Mesh ray must hit 0.470 m');
  }
}

async function shot(file) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({ path: path.join(out, file) });
  return file;
}

async function importCandidate(input, original, result) {
  const file = path.join(candidateRoot, input.key === '1' ? input.document.id : input.key, 'save.json');
  const bytes = await fs.readFile(file);
  const envelope = JSON.parse(bytes);
  assert.equal(envelope.schema, 'company-save');
  const expected = structuredClone(input.document);
  expected.revision++;
  const targets = original.chairs.filter(row => key(row.node.resource) === key(chairRef));
  assert(targets.length > 0);
  for (const row of targets) find(expected, row.node.id).resource = ladderRef;
  assert.deepEqual(envelope.document, expected, 'Expected exactly the legacy chair replacement and one revision bump');
  const menu = page.locator('.file-menu');
  if (!(await menu.evaluate(details => details.open))) await menu.locator('summary').click();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
  await picker.setFiles(file);
  await page.waitForFunction(expected => company.session.document.id === expected.id &&
    company.session.document.revision === expected.revision, expected);
  await idle();
  if (await menu.evaluate(details => details.open)) await menu.locator('summary').click();
  assert.deepEqual(await documentNow(), expected);
  result.candidate = { file, sha256: hash(bytes), changedInstances: targets.map(row => row.node.id) };
  return { ...input, document: expected };
}

function matchContactIdentity(before, after) {
  assert.equal(after.chairs.length, before.chairs.length);
  const current = new Map(after.chairs.map(row => [row.contact.id, row]));
  for (const original of before.chairs) {
    const row = current.get(original.contact.id);
    assert(row, 'Missing original seat ID ' + original.contact.id);
    assert.deepEqual(semanticContact(row.contact), semanticContact(original.contact));
    assert.deepEqual(row.node.transform, original.node.transform);
    assert.equal(row.node.parentId, original.node.parentId);
  }
  assert.deepEqual(after.sofas.map(row => semanticContact(row.contact)), before.sofas.map(row => semanticContact(row.contact)));
}

async function replace(input, previous, result) {
  const baseline = previous.chairs.filter(row => key(row.node.resource) === key(chairRef));
  assert(baseline.length > 0, 'Expected an original chair@1 to replace explicitly');
  const changes = [];
  for (const row of baseline) {
    await selectChair(input, row);
    const menu = page.locator('#edit-look');
    assert(await menu.isVisible() && await menu.isEnabled());
    assert.equal(await menu.inputValue(), key(chairRef));
    assert((await menu.locator('option').evaluateAll(items => items.map(option => option.value))).includes(key(ladderRef)));
    const expected = await documentNow();
    expected.revision++;
    find(expected, row.node.id).resource = ladderRef;
    await menu.selectOption(key(ladderRef));
    await idle();
    assert.deepEqual(await documentNow(), expected);
    const [after] = await measure([row.contact.id]);
    assert.deepEqual(semanticContact(after.contact), semanticContact(row.contact));
    assert.deepEqual(after.node.transform, row.node.transform);
    assert.equal(after.node.parentId, row.node.parentId);
    assertFixed([after]);
    await verifiedAsset(after.asset);
    const image = await shot(input.key + '-chair-' + (changes.length + 1) + '-corrected.png');
    if (flags.has('--record')) await page.waitForTimeout(1300);
    changes.push({ facilityId: row.node.id, before: row, after, image });
  }
  result.replacements = changes;
  return audit(input);
}

async function persist(input, observed, result) {
  const doc = await documentNow();
  await page.locator('#save').click();
  await idle();
  await page.waitForFunction(id => document.querySelector('#save-state').dataset.dirty === 'false' &&
    localStorage.getItem('company-preview:last-company') === id, input.document.id);
  const saved = await savedText(doc.id);
  const envelope = JSON.parse(saved);
  assert.deepEqual(envelope.document, doc);
  if (result.candidate) assert.equal(hash(saved), result.candidate.sha256, 'The imported candidate must save back to identical bytes');
  const pins = envelope.dependencies.resources.filter(pin => key(pin) === key(ladderRef));
  assert.equal(pins.length, 1);
  assert.match(pins[0].sha256, /^[a-f0-9]{64}$/);
  await closeBrowser();
  const restoredUrl = new URL(url);
  restoredUrl.search = '';
  await openBrowser(restoredUrl, doc.id);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await documentNow(), doc);
  assert.equal(await savedText(doc.id), saved);
  assert(!responses.has('/delivery-save.json') && ![...responses.keys()].some(request => request.startsWith('/delivery-room/')));
  assert.deepEqual(await audit(input), observed);
  result.restored = { browserRestarted: true, savedSha256: hash(saved), resourcePin: pins[0] };
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  stage = 'verify packaged build and Three revision';
  manifest = JSON.parse(await read('transfer-manifest.json'));
  assert.equal(manifest.schema, 'company-transfer');
  assert.equal(manifest.buildId, build);
  const lock = JSON.parse(await readPinned('source/prototype/package-lock.json'));
  assert.equal(lock.packages['node_modules/three'].version, threeVersion, 'Use the same Three revision as the packaged viewer');
  source = await fs.readFile(path.resolve(__dirname, leaf, 'build/three.core.js'), 'utf8');
  url = await startServer();
  const rooms = manifest.files.map(entry => entry.path.match(/^data\/rooms\/([a-z][a-z0-9-]{0,62})\/save\.json$/)).filter(Boolean);
  const entries = rooms.length ? rooms.map(match => ({ file: match[0], key: match[1] })) : [{ file: 'data/save.json', key: '1' }];
  for (const entry of entries) {
    stage = entry.key + ' · initial';
    const bytes = await readPinned(entry.file);
    const envelope = JSON.parse(bytes);
    assert.equal(envelope.schema, 'company-save');
    const address = new URL(url);
    address.searchParams.set('delivery', entry.key);
    profile = await fs.mkdtemp(path.join(out, 'chromium-'));
    await openBrowser(address, envelope.document.id, flags.has('--record'));
    const response = responses.get(entry.key === '1' ? '/delivery-save.json' : '/delivery-room/' + entry.key + '.json');
    assert.equal(response?.status(), 200);
    assert(bytes.equals(await response.body()));
    assert.deepEqual(await documentNow(), envelope.document);
    let input = { ...entry, document: envelope.document };
    const result = { key: entry.key, packageFile: entry.file, packageSaveSha256: hash(bytes), companyId: envelope.document.id };
    report.saves.push(result);
    let original;
    if (candidateRoot) {
      original = await audit(input);
      result.original = original;
      stage = entry.key + ' · import local candidate through the workspace';
      input = await importCandidate(input, original, result);
    }
    const initial = await audit(input, result);
    if (report.mode !== 'audit') {
      stage = entry.key + ' · explicit replacement or fixed candidate';
      const final = flags.has('--replace') ? await replace(input, initial, result) : initial;
      assert(final.chairs.length > 0);
      assertFixed(final.chairs);
      result.corrected = final;
      if (original) matchContactIdentity(original, final);
      if (flags.has('--expect-fixed')) {
        result.images = [];
        for (const [index, row] of final.chairs.entries()) {
          await selectChair(input, row);
          await page.locator('#edit-focus').click();
          result.images.push(await shot(entry.key + '-chair-' + (index + 1) + '-candidate.png'));
          if (flags.has('--record')) await page.waitForTimeout(1300);
        }
      }
      stage = entry.key + ' · save and closed-process restoration';
      await persist(input, final, result);
    }
    await closeBrowser();
  }
  assert(report.saves.some(save => save.initial.chairs.length > 0));
  assert.deepEqual(report.errors, []);
  if (rawVideos.length) {
    report.video = { playbackSpeed: 1, files: [] };
    for (const [index, raw] of rawVideos.entries()) {
      const file = 'video/seat-contact-room-' + (index + 1) + '.webm';
      await fs.rename(raw, path.join(out, file));
      report.video.files.push(file);
    }
  }
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 4000 }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await closeBrowser(); }
  finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exit = once(server, 'exit');
      server.kill();
      await exit;
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ build, status: report.status, mode: report.mode, output: out }));
  }
});
