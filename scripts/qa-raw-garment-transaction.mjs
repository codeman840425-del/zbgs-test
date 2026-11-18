// Usage: node scripts/qa-raw-garment-transaction.mjs [NEW_REPORT.json] [EXPORT_DIR]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createEquipment} from '../prototype/src/equipment.js';
import {collectEquipmentTextures} from '../prototype/src/equipment-material-loader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultExport = 'output/m2-raw-male-equipment-v1';
const evidence = path.join(root, 'evidence', 'm2-raw-male-equipment-v1');
const bodyPath = 'assets-source/foundation-male/Base_Male.vrm';
const bodySha = 'ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c';
const wrongBodyPath = 'prototype/public/assets/foundation/base-male-roundtrip.vrm';
const wrongBodySha = '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
const garmentFile = 'raw-male-ab9a-uniform-pants-v1.glb';
const origin = 'http://raw-garment-qa.invalid';
const manifestUrl = '/assets/raw-garment-qa/equipment.json';
const extraUrl = '/assets/raw-garment-qa/negative-controls.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = location => path.relative(root, location).split(path.sep).join('/');

async function parseBody(file, expected) {
  const bytes = await readFile(path.join(root, file));
  assert.equal(sha(bytes), expected);
  const loader = new GLTFLoader().register(parser => new VRMLoaderPlugin(parser));
  const {userData:{vrm}} = await loader.parseAsync(Uint8Array.from(bytes).buffer, origin + '/assets/foundation/');
  assert.ok(vrm?.humanoid, 'Actual VRM humanoid is required');
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.updateMatrixWorld(true);
  return vrm;
}

function equipmentContainers(scene) {
  return scene.children.filter(node => node.name.startsWith('Equipment:'));
}

function trackItem(item) {
  const resources = {geometries:new Set(), materials:new Set(), textures:new Set()};
  for (const mesh of item.meshes) {
    resources.geometries.add(mesh.geometry);
    for (const material of [mesh.material].flat()) {
      resources.materials.add(material);
      collectEquipmentTextures(material, resources.textures);
    }
  }
  const counts = {};
  for (const [type, set] of Object.entries(resources)) {
    counts[type] = [...set].map(resource => {
      const observed = {calls:0};
      resource.addEventListener('dispose', () => observed.calls++);
      return observed;
    });
  }
  counts.skeletons = [...item.skeletons].map(skeleton => {
    const observed = {calls:0};
    const dispose = skeleton.dispose;
    skeleton.dispose = function () { observed.calls++; return dispose.call(this); };
    return observed;
  });
  return counts;
}

const exportDirectory = await realpath(path.resolve(root, process.argv[3] ?? defaultExport));
assert.ok(!relative(exportDirectory).startsWith('../') && !path.isAbsolute(relative(exportDirectory)), 'Export must be in the project');
const manifestPath = path.join(exportDirectory, 'equipment.json');
const garmentPath = path.join(exportDirectory, garmentFile);
assert.equal(await realpath(manifestPath), manifestPath, 'Manifest must be in the export directory');
assert.equal(await realpath(garmentPath), garmentPath, 'Garment must be in the export directory');
const manifest = await readFile(manifestPath);
const source = JSON.parse(manifest);
const matches = source.items.filter(item => item.url.split('/').at(-1) === garmentFile);
assert.equal(matches.length, 1, 'One generated trouser entry is required');
const [entry] = matches;
const bytes = await readFile(garmentPath);
assert.equal(source.schema, 'zbgs-equipment-v1');
assert.equal(entry.slot, 'bottom');
assert.equal(entry.compatibleAvatarSha256, bodySha);
assert.equal(entry.sha256, sha(bytes));
assert.equal(entry.bytes, bytes.length);
const entryUrl = new URL(entry.url, origin + manifestUrl);
assert.equal(entryUrl.origin, origin, 'Generated garment URL must be local');

// Aliases exercise the transactions with the exact authored bytes. They exist
// only in this process and cannot be used as published equipment entries.
const alias = id => ({...structuredClone(entry), id, url:`/assets/raw-garment-qa/${id}.glb`});
const alternate = alias('qa-alternate');
const badFit = alias('qa-wrong-rest-bind');
badFit.bindings[0].inverseBindMatrix[12] += 0.02;
const failed = alias('qa-http-error');
const corrupt = alias('qa-corrupt-glb');
const delayed = alias('qa-delayed-glb');
const extension = JSON.stringify({schema:'zbgs-equipment-v1',items:[alternate,badFit,failed,corrupt,delayed]});
const wrongBytes = Buffer.from(bytes);
wrongBytes[wrongBytes.length - 1] ^= 1;

const oldFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class extends Event {};
globalThis.window = {location:{href:origin + '/'}};
globalThis.createImageBitmap = async blob => {
  const header = Buffer.from(await blob.slice(0, 24).arrayBuffer());
  const isPng = header.length === 24 && header.readUInt32BE(0) === 0x89504e47;
  return {width:isPng ? header.readUInt32BE(16) : 1, height:isPng ? header.readUInt32BE(20) : 1, close() {}};
};
const delayedStarted = Promise.withResolvers();
const unblockDelayed = Promise.withResolvers();
const requests = [];
globalThis.fetch = async input => {
  const url = new URL(input instanceof Request ? input.url : input, origin);
  if (url.protocol === 'blob:') return oldFetch(input);
  assert.equal(url.origin, origin);
  requests.push(url.pathname);
  if (url.pathname === manifestUrl) return new Response(manifest);
  if (url.pathname === extraUrl) return new Response(extension);
  if (url.href === entryUrl.href || url.pathname === alternate.url) return new Response(bytes);
  if (url.pathname === failed.url) return new Response(null, {status:503});
  if (url.pathname === corrupt.url) return new Response(wrongBytes);
  if (url.pathname === delayed.url) {
    delayedStarted.resolve();
    await unblockDelayed.promise;
    return new Response(bytes);
  }
  throw Error('Unexpected resource: ' + url.href);
};

let vrm, wrongVrm, adapter, wrongAdapter;
const checks = [];
let stats, destroyed;
try {
  wrongVrm = await parseBody(wrongBodyPath, wrongBodySha);
  wrongAdapter = await createEquipment({vrm:wrongVrm, avatarSha256:wrongBodySha, manifestUrl});
  const beforeWrong = requests.length;
  await assert.rejects(wrongAdapter.equipSet([entry.id]), /exact body identity/);
  await assert.rejects(wrongAdapter.load(entry.id), /not approved for this avatar identity/);
  assert.equal(requests.length, beforeWrong, 'Wrong body must fail before garment fetch');
  assert.deepEqual(equipmentContainers(wrongVrm.scene), []);
  checks.push('Actual reconstructed male body is rejected before garment download');

  vrm = await parseBody(bodyPath, bodySha);
  const rawBones = new Set(), sourceMeshes = new Map();
  vrm.scene.traverse(node => {
    if (node.isBone) rawBones.add(node);
    if (node.isSkinnedMesh) sourceMeshes.set(node, node.visible);
  });
  adapter = await createEquipment({vrm, avatarSha256:bodySha, manifestUrl,
    additionalManifests:[{url:extraUrl, sha256:sha(extension)}]});
  const visible = () => equipmentContainers(vrm.scene).filter(node => node.visible).map(node => node.userData.equipmentId);
  const original = await adapter.load(entry.id);
  assert.equal(original.container.parent, vrm.scene);
  assert.deepEqual(visible(), [], 'Loading alone does not alter the selection');
  assert.ok(original.meshes.length > 0);
  for (const mesh of original.meshes) {
    assert.ok(mesh.skeleton.bones.every(bone => rawBones.has(bone)), 'Garment must bind to the live body bones');
  }
  stats = original.stats;
  assert.ok(stats.verticesAcrossPrimitives > 0 && stats.joints > 0 && stats.maxWeightSumError <= 1e-5);
  assert.equal(stats.independentArmatureAttached, false);
  assert.equal((await adapter.equipSet([entry.id])).applied, true);
  assert.deepEqual(visible(), [entry.id]);
  checks.push('Exact ab9a selects weighted exported garment bound to the live body');

  for (const [item, reason] of [[badFit,/Rest bind differs/], [failed,/Garment HTTP 503/], [corrupt,/Garment integrity check failed/]]) {
    await assert.rejects(adapter.equipSet([item.id]), reason);
    assert.equal(adapter.get(item.id), null);
    assert.equal(adapter.get(entry.id), original);
    assert.deepEqual(visible(), [entry.id]);
    assert.deepEqual(equipmentContainers(vrm.scene), [original.container]);
  }
  assert.ok(!requests.includes(badFit.url), 'Wrong inverse bind must fail before garment download');
  checks.push('Wrong inverse bind, HTTP failure and same-length changed GLB keep the prior outfit');

  const replacement = await adapter.load(alternate.id);
  assert.deepEqual(visible(), [entry.id]);
  const update = adapter.prepareLoadedSet([alternate.id]);
  try {
    assert.equal(update.isCurrent(), true);
    update.commit();
    assert.deepEqual(visible(), [alternate.id]);
    update.rollback();
    assert.deepEqual(visible(), [entry.id]);
  } finally { update.dispose(); }
  assert.ok([...sourceMeshes].every(([mesh, wasVisible]) => mesh.visible === wasVisible));
  checks.push('Prepared selection commits and rolls back without changing source mesh visibility');

  const counters = [trackItem(original), trackItem(replacement)];
  const pending = adapter.equipSet([delayed.id]);
  const started = await Promise.race([delayedStarted.promise.then(() => true), pending.then(() => false)]);
  assert.equal(started, true, 'Delayed request must reach the intercepted download');
  const rejected = assert.rejects(pending, /disposed while loading/);
  adapter.dispose();
  adapter.dispose();
  unblockDelayed.resolve();
  await rejected;
  assert.deepEqual(equipmentContainers(vrm.scene), []);
  assert.equal(adapter.get(entry.id), null);
  assert.equal(adapter.get(alternate.id), null);
  assert.equal(adapter.get(delayed.id), null);
  assert.ok([...sourceMeshes].every(([mesh, wasVisible]) => mesh.parent && mesh.visible === wasVisible));
  destroyed = counters.map(counter => Object.fromEntries(Object.entries(counter).map(([type, observations]) => {
    assert.ok(observations.every(row => row.calls === 1), 'Duplicate or missing disposal of ' + type);
    return [type, observations.length];
  })));
  checks.push('Double disposal detaches both loaded pieces once, and delayed load cannot reattach');
} finally {
  unblockDelayed.resolve();
  adapter?.dispose();
  wrongAdapter?.dispose();
  if (vrm) VRMUtils.deepDispose(vrm.scene);
  if (wrongVrm) VRMUtils.deepDispose(wrongVrm.scene);
  globalThis.fetch = oldFetch;
}

const testedModules = {};
for (const file of ['equipment.js', 'equipment-set.js', 'equipment-material-loader.js']) {
  testedModules[file] = sha(await readFile(path.join(root, 'prototype', 'src', file)));
}
const result = {
  passed:true, checks, threeRevision:THREE.REVISION, testedModules,
  body:{path:bodyPath, sha256:bodySha}, wrongBody:{path:wrongBodyPath, sha256:wrongBodySha},
  manifest:{path:relative(manifestPath), sha256:sha(manifest)},
  garment:{path:relative(garmentPath), sha256:entry.sha256, bytes:entry.bytes, stats},
  destroyed, scope:'Node Three/VRM and production equipment adapter. HTTP routing, image decode and manifest aliases for negative cases are fixtures. No visual, pose, coverage or factory admission.',
};
const report = JSON.stringify(result, null, 2) + '\n';
if (process.argv[2]) {
  const file = path.resolve(root, process.argv[2]);
  assert.equal(path.dirname(file), evidence);
  assert.match(path.basename(file), /^transaction[\w.-]*\.json$/);
  await mkdir(evidence, {recursive:true});
  assert.equal(await realpath(evidence), evidence, 'Evidence directory resolves to a different location');
  await writeFile(file, report, {flag:'wx'});
}
process.stdout.write(report);
