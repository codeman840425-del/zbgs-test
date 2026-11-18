const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, outArg] = process.argv.slice(2);
if (!dist || !build || !outArg) {
  throw new Error('Usage: node scripts/company-platform/qa-camera-mount-preview.cjs DIST BUILD OUTPUT_DIR');
}

const out = path.resolve(outArg);
const deskClamp = 'camera-mount-desk-clamp';
const articulatedArm = 'camera-mount-articulated-arm';
const tripod = 'camera-mount-tripod';
const wallArm = 'camera-mount-wall-arm';
const report = {
  build,
  status: 'running',
  candidates: [],
  checks: [],
  limits: ['SwiftShader 浏览器预览。真实摄像机行为、推流、普通电脑性能和真实角色 C3 未在本次验证。']
};
const errors = [];
let server;
let profile;
let context;
let page;

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const doc = () => page.evaluate(() => company.session.document);
const idle = () => page.waitForFunction(() => !document.querySelector('#save').disabled, null, { timeout: 60000 });
const ref = resource => resource.id + '@' + resource.version;
const optionValues = selector => page.locator(selector + ' option').evaluateAll(options => options.map(option => option.value));

async function open() {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(() => window.company?.editor && company.buildInfo, null, { timeout: 60000 });
  await idle();
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
}

async function restart() {
  await context.close();
  context = null;
  await open();
}

async function assertStatus() {
  await idle();
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'false', await status.textContent());
}

async function click(id) {
  await page.locator('#' + id).click();
  await assertStatus();
}

async function choose(id, value) {
  await page.locator('#' + id).selectOption(value);
  await assertStatus();
}

async function frame(file) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    company.drawHostFrame();
    if (company.renderer.getContext().isContextLost()) throw new Error('WebGL context lost');
  });
  await page.locator('.viewport').screenshot({ path: path.join(out, file) });
}

async function inspect(id) {
  const { meshes, ...snapshot } = await page.evaluate(id => {
    const node = company.session.document.nodes.find(node => node.id === id);
    const object = company.session.scene.root.getObjectByName(id);
    const visual = object?.children[0];
    if (!node || !object || !visual) throw new Error('Missing camera mount in the document or scene: ' + id);
    const resource = company.catalog.resources.find(r => r.id === node.resource.id && r.version === node.resource.version);
    object.updateWorldMatrix(true, true);
    const meshes = [];
    visual.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      meshes.push({
        name: mesh.userData.name || mesh.name,
        vertices: mesh.geometry.attributes.position.count,
        bounds: [mesh.geometry.boundingBox.min.toArray(), mesh.geometry.boundingBox.max.toArray()]
      });
    });
    return {
      instanceId: node.id,
      parentId: node.parentId,
      sceneParentId: object.parent.name,
      resource: { id: resource.id, version: resource.version, mount: resource.mount, parent: resource.parent, assetSha256: resource.asset.sha256 },
      transform: node.transform,
      mounted: node.state?.mounted ?? resource.stateDefaults.mounted,
      visualVisible: visual.visible,
      worldMatrix: object.matrixWorld.toArray(),
      meshes
    };
  }, id);
  assert.equal(snapshot.sceneParentId, snapshot.parentId, id);
  assert(meshes.length > 0, id + ' has no imported meshes');
  return { ...snapshot, geometryHash: digest(meshes), meshCount: meshes.length };
}

async function inspectAll() {
  const snapshots = [];
  for (const { instanceId } of report.candidates) snapshots.push(await inspect(instanceId));
  return snapshots;
}

async function selectInstance(id) {
  await click('tool-selection');
  await choose('edit-instance', id);
}

async function setMounted(id, mounted) {
  await selectInstance(id);
  const button = page.locator('#edit-states button');
  assert.equal(await button.count(), 1, id);
  if (await button.getAttribute('aria-pressed') !== String(mounted)) {
    await button.click();
    await assertStatus();
  }
  const snapshot = await inspect(id);
  assert.equal(snapshot.mounted, mounted, id);
  assert.equal(snapshot.visualVisible, mounted, id);
  return snapshot;
}

async function addMount(resource, targetId, parentId) {
  await click('tool-add');
  await choose('add-branch', 'camera-mount');
  await choose('add-look', ref(resource));
  assert((await optionValues('#add-target')).includes(targetId), 'Missing placement target ' + targetId);
  await choose('add-target', targetId);
  const previous = new Set((await doc()).nodes.map(node => node.id));
  await click('add-center');
  const added = (await doc()).nodes.filter(node => !previous.has(node.id));
  assert.equal(added.length, 1, resource.id);
  assert.equal(added[0].parentId, parentId, resource.id);
  const snapshot = await inspect(added[0].id);
  assert.equal(ref(snapshot.resource), ref(resource));
  assert.equal(snapshot.mounted, true, snapshot.instanceId);
  assert.equal(snapshot.visualVisible, true, snapshot.instanceId);
  await selectInstance(snapshot.instanceId);
  await click('edit-focus');
  await frame(resource.id + '.png');
  report.candidates.push({ ...snapshot, targetId, screenshot: resource.id + '.png' });
}

function placement(snapshot) {
  return {
    instanceId: snapshot.instanceId,
    parentId: snapshot.parentId,
    sceneParentId: snapshot.sceneParentId,
    transform: snapshot.transform,
    worldMatrix: snapshot.worldMatrix
  };
}

async function replaceLook(id, replacement, expectedChoices) {
  const before = await inspect(id);
  await selectInstance(id);
  const choices = await optionValues('#edit-look');
  assert.deepEqual(choices.sort(), [...expectedChoices].sort());
  await choose('edit-look', ref(replacement));
  const after = await inspect(id);
  assert.equal(ref(after.resource), ref(replacement));
  assert.deepEqual(placement(after), placement(before));
  assert.equal(after.mounted, before.mounted);
  assert.equal(after.visualVisible, before.visualVisible);
  assert.notEqual(after.geometryHash, before.geometryHash);
  return { choices, before, after };
}

async function moveParent(parentId, delta, movesWithParent) {
  const before = await inspectAll();
  const parent = (await doc()).nodes.find(node => node.id === parentId);
  const transform = {
    position: parent.transform.position.map((value, axis) => value + delta[axis]),
    yaw: parent.transform.yaw
  };
  await page.evaluate(operation => company.apply([operation]), { type: 'move', id: parentId, transform });
  const after = await inspectAll();
  const movements = after.map((snapshot, index) => {
    const previous = before[index];
    const expected = movesWithParent(snapshot) ? delta : [0, 0, 0];
    const actual = snapshot.worldMatrix.slice(12, 15).map((value, axis) => value - previous.worldMatrix[12 + axis]);
    assert.deepEqual(snapshot.transform, previous.transform);
    assert(actual.every((value, axis) => Math.abs(value - expected[axis]) < 1e-8), snapshot.instanceId);
    return { instanceId: snapshot.instanceId, expected, actual };
  });
  return { parentId, transform, movements };
}

async function reject(operation, expectedCode) {
  const outcome = await page.evaluate(async operation => {
    const before = JSON.stringify(company.session.document);
    const storage = JSON.stringify({ ...localStorage });
    const root = company.session.scene.root;
    let code;
    try {
      await company.apply([operation]);
    } catch (error) {
      code = error.code;
    }
    return {
      code,
      documentUnchanged: before === JSON.stringify(company.session.document),
      storageUnchanged: storage === JSON.stringify({ ...localStorage }),
      sceneUnchanged: root === company.session.scene.root
    };
  }, operation);
  assert.equal(outcome.code, expectedCode);
  assert(outcome.documentUnchanged && outcome.storageUnchanged && outcome.sceneUnchanged);
  return { operation, ...outcome };
}

async function verifyLegacyRecovery(instanceId) {
  const modern = JSON.parse(await page.evaluate(() => company.export()));
  const legacy = structuredClone(modern);
  const mount = legacy.document.nodes.find(node => node.id === instanceId);
  const [x, y, rimZ] = mount.transform.position;
  mount.transform.position = [x + .2, y, -.1];
  const expected = structuredClone(legacy.document);
  expected.nodes.find(node => node.id === instanceId).transform.position[2] = rimZ;

  const invalid = structuredClone(legacy);
  const pin = invalid.dependencies.resources.find(dependency =>
    dependency.id === mount.resource.id && dependency.version === mount.resource.version);
  assert(pin, 'The exported camera mount must have a pinned dependency');
  pin.sha256 = (pin.sha256.startsWith('a') ? 'b' : 'a') + pin.sha256.slice(1);

  const beforeImport = await page.evaluate(() => ({ ...localStorage }));
  await page.locator('#file').setInputFiles({
    name: 'legacy-clamp-bad-pin.company.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid))
  });
  const recover = () => page.locator('#recover-clamps');
  await recover().waitFor({ state: 'visible' });
  await idle();
  await recover().click();
  await idle();
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), 'true');
  const rejection = await status.textContent();
  assert.match(rejection, /存档需要的素材版本与当前素材不一致/);
  assert.deepEqual(await doc(), modern.document);
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), beforeImport);

  // Seed the actual save slot with an old envelope while preserving all of its pins.
  const key = 'company-platform:v1:' + encodeURIComponent(legacy.document.id);
  assert.deepEqual(JSON.parse(beforeImport[key]), modern);
  const legacyBytes = JSON.stringify(legacy, null, 2) + '\n';
  await page.evaluate(({ key, legacyBytes }) => localStorage.setItem(key, legacyBytes), { key, legacyBytes });
  await restart();
  await recover().waitFor({ state: 'visible' });
  const recoveryLabel = await recover().textContent();
  assert.match(recoveryLabel, /1 个桌夹/);
  assert.deepEqual(await doc(), await page.evaluate(() => company.layouts.smallHome));
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), legacyBytes);

  await click('recover-clamps');
  assert.equal(await recover().isVisible(), false);
  assert.deepEqual(await doc(), expected);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'true');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), legacyBytes);
  const recovered = await inspect(instanceId);
  assert.equal(recovered.mounted, mount.state.mounted);
  assert.equal(recovered.visualVisible, mount.state.mounted);

  await click('save');
  const updated = JSON.parse(await page.evaluate(key => localStorage.getItem(key), key));
  assert.deepEqual(updated, { ...modern, document: expected });
  await restart();
  assert.equal(await recover().isVisible(), false);
  assert.deepEqual(await doc(), expected);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await inspect(instanceId), recovered);

  return {
    instanceId,
    from: mount.transform.position,
    to: recovered.transform.position,
    resource: recovered.resource,
    recoveryLabel,
    rejection
  };
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  await open();
  await choose('layout', 'base');

  const initial = await doc();
  const room = initial.nodes.find(node => node.kind === 'room');
  const desks = initial.nodes.filter(node => node.kind === 'facility' && node.id.endsWith('/desk'));
  assert.equal(desks.length, 2);
  assert.equal(await page.evaluate(() => company.editor.mode), 'room');
  await choose('wall-view', 'full');
  const resources = await page.evaluate(() => company.appearanceCandidates('camera-mount'));
  const byId = Object.fromEntries(resources.map(resource => [resource.id, resource]));
  assert.deepEqual(Object.keys(byId).sort(), [deskClamp, articulatedArm, tripod, wallArm].sort());

  await addMount(byId[deskClamp], desks[0].id + ':camera-mount', desks[0].id);
  await addMount(byId[articulatedArm], desks[1].id + ':camera-mount', desks[1].id);
  await addMount(byId[tripod], room.id + ':floor', room.id);
  await addMount(byId[wallArm], room.id + ':wall:north', room.id);
  assert.equal(new Set(report.candidates.map(candidate => candidate.geometryHash)).size, 4);
  report.checks.push({ name: 'Four distinct camera GLBs installed through the company room add panel', status: 'passed', documentId: initial.id });

  const [clampInstance, armInstance] = report.candidates.map(candidate => candidate.instanceId);
  const deskChoices = [ref(byId[deskClamp]), ref(byId[articulatedArm])];
  await setMounted(clampInstance, false);
  const replacements = [
    await replaceLook(clampInstance, byId[articulatedArm], deskChoices),
    await replaceLook(armInstance, byId[deskClamp], deskChoices)
  ];
  report.checks.push({ name: 'Compatible replacement in both directions preserves instance, parent, transform and mounted state', status: 'passed', replacements });

  const station = initial.nodes.find(node => node.id === desks[1].parentId);
  const parentMoves = [
    await moveParent(station.id, [.12, 0, .08], snapshot => snapshot.instanceId === armInstance),
    await moveParent(room.id, [.12, 0, .08], () => true)
  ];
  report.checks.push({ name: 'Both desk and room movement carry the appropriate installed mounts', status: 'passed', parentMoves });

  const visibility = [];
  for (const [index, candidate] of report.candidates.entries()) {
    const off = await setMounted(candidate.instanceId, false);
    const on = await setMounted(candidate.instanceId, true);
    assert.deepEqual(placement(off), placement(on));
    visibility.push({
      instanceId: candidate.instanceId,
      off: { mounted: off.mounted, visualVisible: off.visualVisible },
      on: { mounted: on.mounted, visualVisible: on.visualVisible }
    });
    if (index % 2 === 0) await setMounted(candidate.instanceId, false);
  }
  report.checks.push({ name: 'All four imported scene visuals follow mounted state in both directions', status: 'passed', visibility });

  await click('save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const savedDocument = await doc();
  const savedSnapshots = await inspectAll();
  const rejections = [];
  for (const target of [byId[tripod], byId[wallArm]]) {
    rejections.push(await reject(
      { type: 'replace-resource', id: clampInstance, resource: { id: target.id, version: target.version } },
      'incompatible-replacement'
    ));
  }
  const placementErrors = {
    'desk-edge-clamp': 'invalid-camera-mount-fit',
    'floor-surface': 'invalid-floor-fit',
    wall: 'invalid-wall-fit'
  };
  for (const { instanceId, resource } of report.candidates) {
    rejections.push(await reject(
      { type: 'move', id: instanceId, transform: { position: [9, 0, 9], yaw: 0 } },
      placementErrors[resource.mount]
    ));
  }
  assert.deepEqual(await inspectAll(), savedSnapshots);
  report.checks.push({ name: 'Incompatible appearances and invalid moves leave scene, document and persisted save intact', status: 'passed', rejections });

  await restart();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await doc(), savedDocument);
  await choose('wall-view', 'full');
  const restoredSnapshots = await inspectAll();
  assert.deepEqual(restoredSnapshots, savedSnapshots);
  await frame('restored.png');
  report.checks.push({
    name: 'Persistent Chromium profile reopened after shutdown and automatically restored the saved company',
    status: 'passed',
    profile: path.basename(profile),
    documentId: savedDocument.id,
    revision: savedDocument.revision,
    documentSha256: digest(savedDocument),
    instances: restoredSnapshots,
    screenshot: 'restored.png'
  });

  const legacy = await verifyLegacyRecovery(clampInstance);
  report.checks.push({
    name: 'Legacy clamp recovery requires explicit UI consent and save, and still rejects an incorrect pinned dependency',
    status: 'passed',
    ...legacy
  });

  assert.deepEqual(errors, []);
  report.status = 'passed';
})().catch(error => {
  report.status = 'failed';
  report.error = error.stack;
  process.exitCode = 1;
}).finally(async () => {
  await context?.close();
  await server?.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, candidates: report.candidates.length, error: report.error, output: out }));
});
