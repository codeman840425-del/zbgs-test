// Actual official loaders and existing equipment adapter, CPU texture decoding only.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { createEquipment } from '../../prototype/src/equipment.js';
import { verifyEquipmentBindings } from '../../scripts/verify-catalog-bindings.mjs';

const root = new URL('../../', import.meta.url), pkg = new URL('./', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => fs.readFile(new URL(path, root));
const sourcePaths = { target: 'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm',
  reference: 'evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-direct.vrm' };
const manifest = JSON.parse(await fs.readFile(new URL('equipment.json', pkg)));
assert.equal(manifest.items.length, 1);
const entry = manifest.items[0];
const garment = await fs.readFile(new URL(entry.url, pkg));
assert.equal(hash(garment), entry.sha256);
const targetBytes = await read(sourcePaths.target), referenceBytes = await read(sourcePaths.reference);
assert.equal(hash(targetBytes), '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef');
assert.equal(hash(referenceBytes), '6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634');
const bindingReadback = verifyEquipmentBindings(garment, targetBytes, entry);
const damagedBinding = structuredClone(entry); damagedBinding.bindings[1].inverseBindMatrix[0] += .001;
assert.throws(() => verifyEquipmentBindings(garment, targetBytes, damagedBinding), /inverse bind mismatch/);
const runtimePaths = ['prototype/src/equipment.js', 'prototype/src/equipment-material-loader.js',
  'prototype/src/equipment-set.js', 'scripts/verify-catalog-bindings.mjs'];
const runtimePins = await Promise.all(runtimePaths.map(async path => ({ path, sha256: hash(await read(path)) })));
const parse = GLTFLoader.prototype.parse, originalFetch = globalThis.fetch, originalWindow = globalThis.window;
GLTFLoader.prototype.parse = function (...args) {
  this.register(() => ({ name: 'CPUTextureDecodeOnly', loadTexture: async () =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  return parse.apply(this, args);
};
globalThis.window = { location: { href: 'https://custom-top.fixture/' } };
globalThis.fetch = async input => {
  const name = new URL(String(input), window.location.href).pathname.split('/').at(-1);
  if (name === 'equipment.json') return new Response(JSON.stringify(manifest));
  if (name === entry.url.split('/').at(-1)) return new Response(garment);
  throw Error('Unplanned controlled CPU resource: ' + input);
};
const loaded = [];
let adapter;
try {
  async function load(bytes) {
    const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    loaded.push(gltf); gltf.scene.updateMatrixWorld(true); return gltf.userData.vrm;
  }
  const target = await load(targetBytes), reference = await load(referenceBytes);
  adapter = await createEquipment({ vrm: target, avatarSha256: hash(targetBytes),
    manifestUrl: 'https://custom-top.fixture/equipment.json' });
  const item = await adapter.load(entry.id);
  assert.equal(item.container.visible, false);
  const result = await adapter.equipSet([entry.id]); assert.equal(result.applied, true);
  assert.equal(item.meshes.length, 1);
  const mesh = item.meshes[0];
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  assert.ok(materials.every(material => material.isMToonMaterial));
  assert.equal(materials.length, 2); assert.ok(materials.some(material => material.isOutline));
  materials.forEach(material => {
    assert.equal(material.alphaTest, .5); assert.equal(material.uniforms.alphaTest.value, .5);
    assert.equal(material.uvAnimationScrollXOffset, 0);
  });
  const wrongSource = await createEquipment({ vrm: target, avatarSha256: '78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3',
    manifestUrl: 'https://custom-top.fixture/equipment.json' });
  try { await assert.rejects(wrongSource.load(entry.id), /not approved for this avatar identity/); }
  finally { wrongSource.dispose(); }
  let referenceMesh;
  reference.scene.traverse(node => {
    const values = Array.isArray(node.material) ? node.material : [node.material];
    if (node.isSkinnedMesh && values.some(material => material?.name === 'N00_004_01_Tops_01_CLOTH (Instance)')) {
      assert.equal(referenceMesh, undefined); referenceMesh = node;
    }
  });
  assert.ok(referenceMesh);
  assert.deepEqual(mesh.geometry.index.array, referenceMesh.geometry.index.array);
  const unpack = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const targetDoc = unpack(targetBytes), garmentDoc = unpack(garment);
  const targetNodes = new Map(targetDoc.nodes.map((node, index) => [node.name, { node, index }]));
  const local = node => Object.fromEntries(['matrix', 'translation', 'rotation', 'scale'].filter(key => key in node).map(key => [key, node[key]]));
  const unusedLocalRestDifferences = [];
  const sourceFit = JSON.parse(await fs.readFile(new URL('source-fit.json', pkg)));
  const usedJoints = new Set(sourceFit.binding.usedJoints);
  for (const index of garmentDoc.skins[0].joints) {
    const node = garmentDoc.nodes[index], other = targetNodes.get(node.name);
    assert.ok(other);
    if (JSON.stringify(local(node)) !== JSON.stringify(local(other.node))) {
      assert.ok(!usedJoints.has(node.name), 'Used joint local rest changed');
      unusedLocalRestDifferences.push({ name: node.name, sourceNode: index, targetNode: other.index,
        sourceLocalRest: local(node), targetLocalRest: local(other.node), drawnTopInfluence: false });
    }
  }
  const ids = [...new Set(mesh.geometry.index.array)].sort((a, b) => a - b);
  const rest = new Map();
  for (const vrm of [target, reference]) vrm.scene.traverse(node => {
    if (node.isBone) rest.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone() });
  });
  const poses = [];
  for (const pose of ['rest', 'raw-arm-bend', 'raw-thigh-bend']) {
    for (const [node, state] of rest) { node.position.copy(state.position); node.quaternion.copy(state.quaternion); }
    for (const vrm of [target, reference]) {
      if (pose === 'raw-arm-bend') {
        vrm.humanoid.getRawBoneNode('leftUpperArm').rotateZ(.4);
        vrm.humanoid.getRawBoneNode('leftLowerArm').rotateX(.7);
        vrm.humanoid.getRawBoneNode('rightUpperArm').rotateZ(-.25);
      }
      if (pose === 'raw-thigh-bend') {
        vrm.humanoid.getRawBoneNode('leftUpperLeg').rotateX(.7);
        vrm.humanoid.getRawBoneNode('rightUpperLeg').rotateX(.4);
      }
      vrm.scene.updateMatrixWorld(true);
    }
    mesh.skeleton.update(); referenceMesh.skeleton.update();
    const coordinates = new Float64Array(ids.length * 6);
    let maximumWorldDifferenceM = 0;
    for (let i = 0; i < ids.length; i++) {
      const a = referenceMesh.getVertexPosition(ids[i], new THREE.Vector3()).applyMatrix4(referenceMesh.matrixWorld);
      const b = mesh.getVertexPosition(ids[i], new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      assert.ok([...a, ...b].every(Number.isFinite));
      maximumWorldDifferenceM = Math.max(maximumWorldDifferenceM, a.distanceTo(b));
      coordinates.set([...a, ...b], i * 6);
    }
    poses.push({ pose, drawnVertices: ids.length, maximumWorldDifferenceM,
      sourceAndTargetCoordinateSha256: hash(Buffer.from(coordinates.buffer)), finite: true });
  }
  const before = materials.map(material => material.uvAnimationScrollXOffset);
  adapter.update(1 / 60);
  const after = materials.map(material => material.uvAnimationScrollXOffset);
  adapter.dispose(); adapter.dispose(); assert.equal(item.container.parent, null);
  const report = { schema: 'native-unmasked-custom-top-actual-adapter-cpu-v1',
    status: 'loaded-on-exact843ac-technical-candidate-only', sourcePaths,
    garmentSha256: entry.sha256, compatibleAvatarSha256: entry.compatibleAvatarSha256,
    equipmentCommit: result, materials: materials.map(material => ({ type: material.type,
      isMToonMaterial: !!material.isMToonMaterial, isOutline: !!material.isOutline })),
    poses, uvAnimationOffsetBefore: before, uvAnimationOffsetAfter: after,
    bindingReadback, unusedLocalRestDifferences, pausedFirstFrameMaterialsInitialized: true,
    old78912IdentityRejected: true, damagedInverseBindRejected: true,
    sourceWeightNormalizationNote: 'Original multi-primitive VRM may normalize shared weights repeatedly; standalone loader normalizes once. Actual errors reported without replacing source weights.',
    disposedIdempotently: true,
    runtimePins,
    limits: ['Actual GLTFLoader/VRMLoaderPlugin/createEquipment; texture images are1px CPU placeholders, original encoded images independently source-hashed',
      'Raw bone rest/arm/thigh fixtures only, no normalized animation, body dynamics, renderer or GPU',
      'No original top visibility switch, body coverage or room/factory admission tested'] };
  for (const pin of runtimePins) assert.equal(hash(await read(pin.path)), pin.sha256, 'Runtime source changed during CPU execution');
  await fs.writeFile(new URL('cpu-verification.json', pkg), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, poses, materialCount: materials.length }));
} finally {
  adapter?.dispose();
  loaded.forEach(gltf => VRMUtils.deepDispose(gltf.scene));
  GLTFLoader.prototype.parse = parse; globalThis.fetch = originalFetch; globalThis.window = originalWindow;
}
