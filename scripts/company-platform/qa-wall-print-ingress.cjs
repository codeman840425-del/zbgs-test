const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, layoutOrSave, expectedPng, resourceId, outArg, ...options] = process.argv.slice(2);
if (!dist || !build || !layoutOrSave || !expectedPng || !resourceId || !outArg ||
    options.length > 1 || options.some(option => option !== '--record')) {
  throw new Error('Usage: node qa-wall-print-ingress.cjs DIST BUILD LAYOUT_OR_SAVE EXPECTED_PNG RESOURCE_ID OUTPUT [--record]');
}

const out = path.resolve(outArg);
const source = path.resolve(layoutOrSave);
const record = options.includes('--record');
const viewport = { width: 1600, height: 1000 };
const oldRef = { id: 'wall-art-triptych', version: 1 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refKey = ref => ref.id + '@' + ref.version;
const findNode = (document, id) => document.nodes.find(node => node.id === id);
const report = {
  build, status: 'running', browser: 'Headless Chromium with SwiftShader',
  checks: [], browserErrors: [], video: { enabled: record, playbackSpeed: 1 },
};
let server, profile, context, page, responses, stage;

async function readFixture() {
  const parsed = JSON.parse(await fs.readFile(source, 'utf8'));
  const document = parsed.schema === 'company-save' ? parsed.document : parsed;
  assert.equal(document.schema, 'company-layout');
  const facilities = document.nodes.filter(node => node.kind === 'facility' && node.resource.id === resourceId);
  assert(facilities.length > 0, 'The supplied layout must mount the requested new print');
  const facility = facilities[0];
  assert.notEqual(refKey(facility.resource), refKey(oldRef));
  let room, floor;
  for (let node = findNode(document, facility.parentId); node; node = findNode(document, node.parentId)) {
    if (!room && (node.kind === 'room' || node.kind === 'area')) room = node;
    if (node.kind === 'floor') { floor = node; break; }
  }
  assert(room && floor, 'The mounted print needs a real room and floor');
  const bytes = await fs.readFile(expectedPng);
  assert(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  return {
    document, facility, room: room.id, floor: floor.id,
    png: { bytes, sha256: hash(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
  };
}

async function idle() {
  await page.waitForFunction(() => (
    window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.notEqual(await status.getAttribute('data-error'), 'true', await status.textContent());
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

const browserDocument = () => page.evaluate(() => company.session.document);
const readSaved = id => page.evaluate(id => JSON.parse(company.session.readSavedText(id)), id);

async function importFile(fixture) {
  const menu = page.locator('.file-menu');
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import').click();
  const dialog = await chooser;
  assert.equal(await dialog.element().getAttribute('id'), 'file');
  await dialog.setFiles(source);
  await idle();
  await page.waitForFunction(({ id, target, resource }) => (
    company.session.document.id === id && company.session.document.nodes.some(node => (
      node.id === target && node.resource.id === resource.id && node.resource.version === resource.version
    ))
  ), { id: fixture.document.id, target: fixture.facility.id, resource: fixture.facility.resource });
  await idle();
  if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  assert.deepEqual(await browserDocument(), fixture.document);
}

async function frame() {
  const previous = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(previous => company.renderStatus().hostFrame > previous, previous);
  assert.equal(await page.evaluate(() => company.renderStatus().lastRenderError), null);
}

async function focusPrint(fixture) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.mode === 'building') {
    const facade = page.locator('.company-building-view__facade');
    if (await facade.isVisible()) await facade.click();
    await click('.company-building-view__floor[data-floor-id=' + JSON.stringify(fixture.floor) + ']');
  } else if (view.floorId !== fixture.floor) {
    await select('#floor', fixture.floor);
  }
  const focused = await page.evaluate(() => company.session.scene.view.roomId);
  if (focused !== fixture.room) await select('#room', fixture.room);
  await page.waitForFunction(room => company.session.scene.view.roomId === room, fixture.room);
  await select('#wall-view', 'cutaway');
  await click('#tool-selection');
  await select('#edit-instance', fixture.facility.id);
  await click('#edit-focus');
  await frame();
}

async function loadedGlb(ref) {
  const asset = await page.evaluate(ref => company.catalog.resources.find(resource => (
    resource.id === ref.id && resource.version === ref.version
  ))?.asset, ref);
  assert.equal(asset?.format, 'glb', 'Requested resource lacks a pinned GLB: ' + refKey(ref));
  const pathname = new URL(asset.url, server.url).pathname;
  const response = responses.get(pathname);
  assert.equal(response?.status(), 200, 'Browser did not load the expected GLB: ' + pathname);
  const bytes = await response.body();
  assert.equal(bytes.length, asset.bytes);
  assert.equal(hash(bytes), asset.sha256);
  return { asset, bytes };
}

function embeddedImage(bytes, png) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binHeader = 20 + jsonLength;
  const binLength = bytes.readUInt32LE(binHeader);
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942);
  assert.equal(binHeader + 8 + binLength, bytes.length);
  const bin = bytes.subarray(binHeader + 8);
  const matches = [];
  for (const [index, image] of gltf.images.entries()) {
    assert.equal(image.uri, undefined, 'Image must be embedded in the GLB');
    const view = gltf.bufferViews[image.bufferView];
    const offset = view.byteOffset ?? 0;
    assert.equal(view.buffer, 0);
    assert(offset >= 0 && offset + view.byteLength <= binLength);
    const contents = bin.subarray(offset, offset + view.byteLength);
    if (image.mimeType === 'image/png' && contents.length === png.bytes.length && hash(contents) === png.sha256) {
      matches.push(index);
    }
  }
  assert(matches.length > 0, 'GLB did not embed the exact requested PNG bytes');
  const materialNames = gltf.materials.filter(material => {
    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    return matches.includes(gltf.textures?.[textureIndex]?.source);
  }).map(material => material.name || '');
  assert(materialNames.length > 0, 'Embedded PNG must be referenced by a real base-color map');
  return { images: matches, materials: materialNames, sha256: png.sha256, bytes: png.bytes.length };
}

async function printedPixels(fixture) {
  const { png, facility } = fixture;
  const evidence = await page.evaluate(async ({ id, expected }) => {
    const { session, renderer, world, camera } = company;
    const root = session.scene.root.getObjectByName(id);
    if (!root) throw new Error('Print is missing from the focused room scene');
    const expectedBytes = Uint8Array.from(atob(expected), character => character.charCodeAt(0));
    const sourceImage = await createImageBitmap(new Blob([expectedBytes], { type: 'image/png' }), {
      colorSpaceConversion: 'none', premultiplyAlpha: 'none',
    });
    const hex = async pixels => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      value => value.toString(16).padStart(2, '0')).join('');
    const canvas = document.createElement('canvas');
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixelDigest = async image => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      return hex(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    };
    const expectedHash = await pixelDigest(sourceImage);
    sourceImage.close();
    const mappedMeshes = [];
    root.traverse(node => {
      if (!node.isMesh || !node.geometry?.attributes.uv?.count) return;
      for (let object = node; object; object = object.parent) if (object.visible === false) return;
      for (const material of [node.material].flat()) {
        const image = material.map?.image;
        if (image?.width === canvas.width && image?.height === canvas.height) {
          mappedMeshes.push({ node, material, image });
        }
      }
    });
    const matched = [];
    const hashes = new Map();
    for (const { node, material, image } of mappedMeshes) {
      if (!hashes.has(image)) hashes.set(image, await pixelDigest(image));
      if (hashes.get(image) === expectedHash && material.map.colorSpace === 'srgb') {
        matched.push({ node, name: node.userData.name || node.name, material: material.name, decoded: hashes.get(image) });
      }
    }
    const mesh = matched[0]?.node;
    if (!mesh) throw new Error('No visible mounted mesh uses the expected decoded sRGB pixels');
    world.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;
    const corners = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      corners.push(camera.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera));
    }
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const x = Math.max(0, Math.floor((Math.min(...corners.map(p => p.x)) + 1) * w / 2));
    const y = Math.max(0, Math.floor((Math.min(...corners.map(p => p.y)) + 1) * h / 2));
    const width = Math.min(w, Math.ceil((Math.max(...corners.map(p => p.x)) + 1) * w / 2)) - x;
    const height = Math.min(h, Math.ceil((Math.max(...corners.map(p => p.y)) + 1) * h / 2)) - y;
    if (width <= 0 || height <= 0) throw new Error('The selected print is outside the renderer viewport');
    const readFrame = () => {
      renderer.render(world, camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Cannot read rendered wall print pixels');
      return pixels;
    };
    const visible = readFrame();
    let hidden;
    const originalVisibility = mesh.visible;
    try {
      // Measure screen contribution with the same camera and unchanged document.
      mesh.visible = false;
      hidden = readFrame();
    } finally {
      mesh.visible = originalVisibility;
      renderer.render(world, camera);
    }
    let changedPixels = 0;
    for (let i = 0; i < visible.length; i += 4) {
      const delta = Math.max(
        Math.abs(visible[i] - hidden[i]), Math.abs(visible[i + 1] - hidden[i + 1]), Math.abs(visible[i + 2] - hidden[i + 2]),
      );
      if (delta >= 8) changedPixels++;
    }
    return {
      width: canvas.width, height: canvas.height, expectedHash,
      maps: matched.map(({ name, material, decoded }) => ({ name, material, decoded })),
      viewport: { x, y, width, height, changedPixels },
      camera: camera.position.toArray(),
    };
  }, { id: facility.id, expected: png.bytes.toString('base64') });
  assert.deepEqual([evidence.width, evidence.height], [png.width, png.height]);
  assert(evidence.maps.every(map => map.decoded === evidence.expectedHash));
  const region = evidence.viewport;
  assert(region.changedPixels >= 64 && region.changedPixels / (region.width * region.height) > 0.01,
    'Mounted map did not visibly contribute to the real room framebuffer: ' + JSON.stringify(region));
  return evidence;
}

async function verifyPrint(fixture, file) {
  const { asset, bytes } = await loadedGlb(fixture.facility.resource);
  const embedded = embeddedImage(bytes, fixture.png);
  const pixels = await printedPixels(fixture);
  assert(pixels.maps.some(map => embedded.materials.includes(map.material)), 'Rendered map did not use the pinned GLB material');
  await frame();
  await page.screenshot({ path: path.join(out, file) });
  return { file, asset, embedded, pixels };
}

async function replaceLook(fixture, resource) {
  const before = await browserDocument();
  assert.equal(await page.locator('#edit-instance').inputValue(), fixture.facility.id);
  const options = await page.locator('#edit-look option').evaluateAll(nodes => nodes.map(node => node.value));
  assert(options.includes(refKey(resource)), 'Missing compatible editor option: ' + refKey(resource));
  await select('#edit-look', refKey(resource));
  await frame();
  const after = await browserDocument();
  before.revision++;
  const item = findNode(before, fixture.facility.id);
  item.resource = resource;
  assert.deepEqual(after, before, 'Original facility identity, local pose, and room must survive an appearance change');
  assert.deepEqual(findNode(after, fixture.facility.id).transform, fixture.facility.transform);
  return after;
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
  stage = 'read layout and independent input PNG';
  const fixture = await readFixture();
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'fixed build startup';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser(record);
  const pauseForVideo = async () => { if (record) await page.waitForTimeout(1000); };
  let saved;
  await check('Import the room and verify the exact PNG in the real wall print', async () => {
    await importFile(fixture);
    await focusPrint(fixture);
    const evidence = await verifyPrint(fixture, '01-wall-print.png');
    await pauseForVideo();
    return { room: fixture.room, facility: fixture.facility, ...evidence };
  });
  await check('Replace with the existing triptych, then restore the print in place', async () => {
    await replaceLook(fixture, oldRef);
    const { asset: triptych } = await loadedGlb(oldRef);
    const mounted = await page.evaluate(id => {
      const root = company.session.scene.root.getObjectByName(id);
      let visibleMeshes = 0;
      root?.traverse(mesh => { if (mesh.isMesh && mesh.visible) visibleMeshes++; });
      return visibleMeshes;
    }, fixture.facility.id);
    assert(mounted > 0);
    await page.screenshot({ path: path.join(out, '02-old-triptych.png') });
    await pauseForVideo();
    const document = await replaceLook(fixture, fixture.facility.resource);
    const evidence = await verifyPrint(fixture, '03-wall-print-replaced.png');
    await click('#save');
    assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
    saved = await readSaved(document.id);
    assert.deepEqual(saved.document, document);
    const pin = saved.dependencies.resources.find(resource => refKey(resource) === refKey(fixture.facility.resource));
    assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/);
    await pauseForVideo();
    return { triptych, mounted, pin, restoredAppearance: evidence };
  });
  let rawVideo;
  if (record) rawVideo = await page.video().path();
  await check('Close Chromium and automatically recover the same wall print', async () => {
    await closeBrowser();
    await openBrowser();
    assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
    assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
    assert.deepEqual(await browserDocument(), saved.document);
    assert.deepEqual(await readSaved(saved.document.id), saved);
    await focusPrint(fixture);
    const evidence = await verifyPrint(fixture, '04-wall-print-restored.png');
    return { documentId: saved.document.id, revision: saved.document.revision, ...evidence };
  });
  if (rawVideo) {
    const file = path.join('video', 'wall-print-normal.webm');
    await fs.rename(rawVideo, path.join(out, file));
    const { size } = await fs.stat(path.join(out, file));
    assert(size > 0);
    report.video = { ...report.video, file, bytes: size };
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
