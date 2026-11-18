const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');

const [packageArg, build, ...extra] = process.argv.slice(2);
if (!packageArg || !/^[a-f0-9]{12}$/.test(build) || extra.length) {
  throw new Error('Usage: node qa-travel-throw.cjs PACKAGE BUILD (requires Playwright and Chromium)');
}
const { chromium } = require('playwright');
const delivery = path.resolve(packageArg);
const companyId = 'travel-studio';
const roomId = companyId + '/ground/lounge';
const sofaId = roomId + '/sofa';
const textileId = sofaId + '/textile';
const expectedRef = { id: 'static-textile-travel-throw', version: 2 };
const read = file => fs.readFile(path.join(delivery, file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { build, companyId, textileId, status: 'running', checks: [], browserErrors: [] };
let server, context, page, responses, manifest, out, profile, stage, serverError = '';

async function startServer() {
  server = spawn(process.execPath, ['serve.mjs', '0'], { cwd: delivery, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.setEncoding('utf8').on('data', chunk => { serverError = (serverError + chunk).slice(-4000); });
  const lines = createInterface({ input: server.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line', { signal: AbortSignal.timeout(20000) }),
      once(server, 'exit').then(([code]) => { throw new Error('Package server exited before startup: ' + code); }),
    ]);
    const url = new URL(line);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
    assert(url.port);
    assert.equal(url.pathname, '/company.html');
    assert.equal(url.search, '?delivery=1');
    return url;
  } finally {
    lines.close();
    server.stdout.resume();
  }
}

async function open(url) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: { width: 1500, height: 950 },
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ stage, message: message.text() });
  });
  await page.goto(url.href);
  await page.waitForFunction(id => window.company?.session.document.id === id && company.buildInfo &&
    !document.querySelector('#mode-room').disabled && document.querySelector('#status').dataset.error === 'false', companyId);
  const actualBuild = await page.evaluate(() => company.buildInfo);
  assert.equal(actualBuild.shortId, build);
  assert.equal(actualBuild.sourceDigest, manifest.sourceDigest);
  if (await page.evaluate(() => company.session.scene.view.mode !== 'room')) await page.locator('#room').selectOption(roomId);
  await page.waitForFunction(id => company.session.scene.view.roomId === id, roomId);
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(textileId);
  assert.equal(await page.locator('#edit-look').inputValue(), expectedRef.id + '@' + expectedRef.version);
}

async function closeBrowser() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false);
  context = null;
  page = null;
}

async function packagedFile(file) {
  const bytes = await read(file);
  const pin = manifest.files.find(entry => entry.path === file);
  assert.equal(pin?.bytes, bytes.length);
  assert.equal(pin.sha256, hash(bytes));
  return { bytes, sha256: pin.sha256 };
}

async function verifyAsset(asset) {
  assert.equal(asset.format, 'glb');
  assert.match(asset.url, /^\/company-assets\/[^?#]+\.glb$/);
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'The browser must fetch ' + asset.url);
  const packed = await packagedFile('viewer' + asset.url);
  assert.equal(packed.sha256, asset.sha256);
  assert.equal(packed.bytes.length, asset.bytes);
  assert((await response.body()).equals(packed.bytes));
}

async function inspect(file) {
  const seen = await page.evaluate(({ roomId, sofaId, textileId }) => {
    const { session, camera, renderer } = company;
    const { scene, document: doc } = session;
    const find = id => doc.nodes.find(node => node.id === id);
    const resource = node => company.catalog.resources.find(ref => ref.id === node.resource.id && ref.version === node.resource.version);
    const room = scene.root.getObjectByName(roomId);
    const sofa = scene.root.getObjectByName(sofaId);
    const textile = scene.root.getObjectByName(textileId);
    const node = find(textileId), fabric = resource(node), host = resource(find(sofaId));
    const support = host.supportSurfaces.find(surface => surface.id === node.attachment.surfaceId);
    const contact = sofa.getObjectByName(host.supportNodes[support.id]);
    if (!contact?.isMesh || textile.parent !== sofa) throw new Error('The packaged textile is missing its actual sofa support mesh');
    const vector = coordinates => camera.position.clone().fromArray(coordinates);
    camera.position.copy(room.localToWorld(vector([3.25, 2.25, 2.6])));
    camera.lookAt(room.localToWorld(vector([1.25, .5, -.72])));
    camera.updateMatrixWorld(true);
    scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    const meshes = [];
    scene.root.traverseVisible(mesh => {
      if (mesh.isMesh && textile.getObjectById(mesh.id)) meshes.push(mesh);
    });
    if (!meshes.length) throw new Error('The installed textile has no rendered meshes');
    scene.root.updateMatrixWorld(true);
    const inverse = sofa.matrixWorld.clone().invert();
    const vertices = mesh => {
      const positions = mesh.geometry.attributes.position, matrix = inverse.clone().multiply(mesh.matrixWorld);
      return Array.from({ length: positions.count }, (_, index) => camera.position.clone().fromBufferAttribute(positions, index).applyMatrix4(matrix));
    };
    const faces = (mesh, points) => {
      const index = mesh.geometry.index;
      const indices = index ? Array.from(index.array) : points.map((_, i) => i);
      const triangles = [];
      for (let i = 0; i < indices.length; i += 3) triangles.push(indices.slice(i, i + 3).map(point => points[point]));
      return triangles;
    };
    const heights = (triangles, x, z) => {
      const result = [];
      for (const [a, b, c] of triangles) {
        const bx = b.x - a.x, bz = b.z - a.z, cx = c.x - a.x, cz = c.z - a.z;
        const area = bx * cz - bz * cx;
        if (Math.abs(area) < 1e-12) continue;
        const u = ((x - a.x) * cz - (z - a.z) * cx) / area;
        const v = (bx * (z - a.z) - bz * (x - a.x)) / area;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1 + 1e-5) result.push(a.y + u * (b.y - a.y) + v * (c.y - a.y));
      }
      return result;
    };
    const supportFaces = faces(contact, vertices(contact));
    const cloth = meshes.map(mesh => ({ mesh, points: vertices(mesh) }));
    const clothFaces = cloth.flatMap(({ mesh, points }) => faces(mesh, points));
    const clothPoints = cloth.flatMap(({ points }) => points);
    const bottom = clothPoints.reduce((min, point) => Math.min(min, point.y), Infinity);
    const feet = clothPoints.filter(point => Math.abs(point.y - support.topY) <= .001 &&
      heights(supportFaces, point.x, point.z).some(y => Math.abs(y - support.topY) <= .001 && Math.abs(y - point.y) <= .001));
    const visible = object => {
      for (let current = object; current; current = current.parent) if (current.visible === false) return false;
      return true;
    };
    const seats = scene.describeUsePoints({ floorId: room.parent.name }).filter(seat => seat.facilityId === sofaId).map(seat => {
      const { chairSeat, chairBack } = scene.resolveUsePoint(seat.id);
      if (!chairSeat?.isMesh || !chairBack?.isMesh || !visible(chairSeat) || !visible(chairBack)) {
        throw new Error('The furnished sofa must retain both real seat and back contact meshes');
      }
      const [x, , z] = seat.local.position;
      const tops = heights(faces(chairSeat, vertices(chairSeat)), x, z);
      return { id: seat.id, capacity: seat.capacity, contacts: seat.contact,
        actualTop: tops.length ? Math.max(...tops) : null, seatHeight: seat.seatHeight,
        textileCoversCenter: heights(clothFaces, x, z).some(y => y >= seat.seatHeight - .001) };
    });
    const canvas = document.createElement('canvas');
    const { width, height } = renderer.domElement;
    Object.assign(canvas, { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const capture = () => {
      company.drawHostFrame();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(renderer.domElement, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const saved = meshes.map(mesh => mesh.castShadow);
    const textileVisible = textile.visible;
    let changedPixels = 0;
    try {
      // Remove the textile's cast shadow from both diagnostic frames. Differences then require model pixels.
      for (const mesh of meshes) mesh.castShadow = false;
      const lit = capture();
      textile.visible = false;
      const hidden = capture();
      for (let i = 0; i < lit.length; i += 4) {
        const delta = Math.abs(lit[i] - hidden[i]) + Math.abs(lit[i + 1] - hidden[i + 1]) + Math.abs(lit[i + 2] - hidden[i + 2]);
        if (delta > 24) changedPixels++;
      }
    } finally {
      textile.visible = textileVisible;
      for (const [index, mesh] of meshes.entries()) mesh.castShadow = saved[index];
      company.drawHostFrame();
    }
    return { node, asset: fabric.asset, hostAsset: host.asset, mount: fabric.mount, branch: fabric.productionBranch,
      hostRole: host.mountRole, supportMesh: contact.userData.name || contact.name, support, bottom, contactVertices: feet.length,
      seats, changedPixels, sceneMeshes: meshes.map(mesh => mesh.userData.name || mesh.name),
      displayName: fabric.displayName, view: scene.view, renderError: company.renderStatus().lastRenderError };
  }, { roomId, sofaId, textileId });
  assert.deepEqual(seen.node.resource, expectedRef);
  assert.equal(seen.view.roomId, roomId);
  assert.equal(seen.hostRole, 'sofa');
  assert.equal(seen.mount, 'support-surface');
  assert.equal(seen.branch, 'static-textile');
  assert.equal(seen.node.attachment.surfaceId, seen.support.id);
  assert(Math.abs(seen.bottom - seen.support.topY) <= .001 && seen.contactVertices > 0);
  assert(seen.changedPixels >= 100, 'The fixed camera must show visible pixels of the actual textile');
  assert.equal(seen.seats.length, 2);
  assert.notEqual(seen.seats[0].id, seen.seats[1].id);
  for (const field of ['seatNodeId', 'backNodeId']) assert.notEqual(seen.seats[0].contacts[field], seen.seats[1].contacts[field]);
  for (const seat of seen.seats) {
    assert.equal(seat.capacity, 1);
    assert(Number.isFinite(seat.actualTop) && Math.abs(seat.actualTop - seat.seatHeight) <= .003);
    assert.equal(seat.textileCoversCenter, false);
  }
  assert.equal(seen.renderError, null);
  await verifyAsset(seen.asset);
  await verifyAsset(seen.hostAsset);
  await page.screenshot({ path: path.join(out, file) });
  report.checks.push({ stage, file, ...seen });
  return seen;
}

async function run() {
  out = await fs.mkdtemp(path.join(__dirname, 'run-' + build + '-'));
  profile = await fs.mkdtemp(path.join(out, 'chromium-'));
  stage = 'verify packaged default layout';
  manifest = JSON.parse(await read('transfer-manifest.json'));
  assert.equal(manifest.schema, 'company-transfer');
  assert.equal(manifest.buildId, build);
  const original = await packagedFile('data/save.json');
  const envelope = JSON.parse(original.bytes);
  assert.equal(envelope.schema, 'company-save');
  assert.equal(envelope.document.id, companyId);
  assert.deepEqual(envelope.document.nodes.find(node => node.id === textileId)?.resource, expectedRef);
  report.defaultSaveSha256 = original.sha256;
  report.sourceDigest = manifest.sourceDigest;
  stage = 'open package default room';
  const url = await startServer();
  await open(url);
  const deliveryResponse = responses.get('/delivery-save.json');
  assert.equal(deliveryResponse?.status(), 200);
  assert((await deliveryResponse.body()).equals(original.bytes));
  assert.deepEqual(await page.evaluate(() => company.session.document), envelope.document);
  const delivered = await inspect('01-package-default.png');
  stage = 'save through the visible workspace';
  await page.locator('#save').click();
  await page.waitForFunction(id => document.querySelector('#save-state').dataset.dirty === 'false' &&
    localStorage.getItem('company-preview:last-company') === id, companyId);
  const saved = await page.evaluate(id => company.session.readSavedText(id), companyId);
  assert.deepEqual(JSON.parse(saved), envelope);
  report.savedSha256 = hash(saved);
  stage = 'close browser and restore from storage without delivery import';
  await closeBrowser();
  url.search = '';
  await open(url);
  assert.equal(new URL(page.url()).search, '');
  assert(!responses.has('/delivery-save.json'));
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.equal(await page.evaluate(id => company.session.readSavedText(id), companyId), saved);
  assert.deepEqual(await page.evaluate(() => company.session.document), envelope.document);
  const restored = await inspect('02-browser-restored.png');
  assert.deepEqual(restored, delivered);
  assert.deepEqual(report.browserErrors, []);
  report.browserProcesses = 2;
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
    if (serverError) report.serverError = serverError;
    if (out) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ build, status: report.status, output: out }));
  }
});
