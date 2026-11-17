// Actual original male VRM and createEquipment; 1px CPU decode fixture only.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { createEquipment } from '../../prototype/src/equipment.js';
import { verifyEquipmentBindings } from '../../scripts/verify-catalog-bindings.mjs';

const root = new URL('../../', import.meta.url), pkg = new URL('generated/', import.meta.url);
const out = new URL('evidence/native-vroid-male-equipment-v1/', root);
const hash = b => createHash('sha256').update(b).digest('hex');
const read = p => fs.readFile(new URL(p, root));
const sourcePath = 'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm';
const targetPath = 'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm';
const sourceBytes = await read(sourcePath), targetBytes = await read(targetPath);
assert.equal(hash(sourceBytes), 'a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da');
assert.equal(hash(targetBytes), '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81');
const manifestBytes = await fs.readFile(new URL('equipment.json', pkg));
const manifest = JSON.parse(manifestBytes);
const extracted = JSON.parse(await fs.readFile(new URL('extraction.json', pkg)));
const resources = new Map(), bindingChecks = [];
for (const entry of manifest.items) {
  const bytes = await fs.readFile(new URL(entry.url, pkg));
  assert.equal(hash(bytes), entry.sha256); assert.equal(bytes.length, entry.bytes);
  resources.set(entry.url, bytes);
  bindingChecks.push({ id: entry.id, result: verifyEquipmentBindings(bytes, targetBytes, entry) });
  const damaged = structuredClone(entry); damaged.bindings[0].inverseBindMatrix[0] += .001;
  assert.throws(() => verifyEquipmentBindings(bytes, targetBytes, damaged), /inverse bind mismatch/);
}
assert.deepEqual(manifest.items.map(e => e.slot), ['top', 'bottom', 'shoes']);
const runtimePaths = ['prototype/src/equipment.js', 'prototype/src/equipment-material-loader.js',
  'prototype/src/equipment-set.js', 'scripts/verify-catalog-bindings.mjs'];
const runtimePins = await Promise.all(runtimePaths.map(async path => ({ path, sha256: hash(await read(path)) })));
const originalParse = GLTFLoader.prototype.parse, originalFetch = globalThis.fetch, originalWindow = globalThis.window;
GLTFLoader.prototype.parse = function (...args) {
  this.register(() => ({ name: 'CPUTextureDecodeOnly', loadTexture: async () =>
    new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  return originalParse.apply(this, args);
};
globalThis.window = { location: { href: 'https://male-equipment.fixture/' } };
globalThis.fetch = async input => {
  const name = new URL(String(input), window.location.href).pathname.split('/').at(-1);
  if (name === 'equipment.json') return new Response(manifestBytes);
  if (resources.has(name)) return new Response(resources.get(name));
  throw Error('Unplanned CPU resource: ' + input);
};
const loaded = []; let adapter;
try {
  async function load(bytes) {
    const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    loaded.push(gltf); gltf.scene.updateMatrixWorld(true); return gltf.userData.vrm;
  }
  const source = await load(sourceBytes), target = await load(targetBytes);
  adapter = await createEquipment({ vrm: target, avatarSha256: hash(targetBytes), manifestUrl: 'https://male-equipment.fixture/equipment.json' });
  const pieces = [];
  for (const entry of manifest.items) {
    const item = await adapter.load(entry.id);
    assert.equal(item.container.visible, false); assert.equal(item.meshes.length, 1);
    const mesh = item.meshes[0], row = extracted.items.find(x => x.id === entry.id);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    assert.equal(materials.length, 2); assert.ok(materials.every(m => m.isMToonMaterial));
    assert.ok(materials.some(m => m.isOutline));
    materials.forEach(m => { assert.equal(m.uniforms.alphaTest.value, m.alphaTest); assert.equal(m.alphaTest, .5); assert.equal(m.uvAnimationScrollXOffset, 0); });
    let original;
    source.scene.traverse(n => {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      if (n.isSkinnedMesh && mats.some(m => m?.name === row.materialName)) { assert.equal(original, undefined); original = n; }
    });
    assert.ok(original); assert.deepEqual(mesh.geometry.index.array, original.geometry.index.array);
    for (const attribute of ['position', 'normal', 'uv', 'skinIndex'])
      assert.deepEqual(mesh.geometry.getAttribute(attribute).array, original.geometry.getAttribute(attribute).array);
    pieces.push({ entry, item, mesh, original, ids: [...new Set(mesh.geometry.index.array)].sort((a,b) => a-b), materials });
  }
  const commit = await adapter.equipSet(manifest.items.map(e => e.id)); assert.equal(commit.applied, true);
  const wrong = await createEquipment({ vrm: target, avatarSha256: hash(sourceBytes), manifestUrl: 'https://male-equipment.fixture/equipment.json' });
  try { for (const entry of manifest.items) await assert.rejects(wrong.load(entry.id), /not approved for this avatar identity/); }
  finally { wrong.dispose(); }
  const rest = new Map();
  for (const vrm of [source, target]) vrm.scene.traverse(n => { if (n.isBone) rest.set(n, { p: n.position.clone(), q: n.quaternion.clone() }); });
  const poses = [], arrays = [], layout = []; let offset = 0;
  for (const pose of ['rest', 'raw-arm-bend', 'raw-thigh-bend']) {
    for (const [node, state] of rest) { node.position.copy(state.p); node.quaternion.copy(state.q); }
    for (const vrm of [source, target]) {
      if (pose === 'raw-arm-bend') { vrm.humanoid.getRawBoneNode('leftUpperArm').rotateZ(.4); vrm.humanoid.getRawBoneNode('leftLowerArm').rotateX(.7); vrm.humanoid.getRawBoneNode('rightUpperArm').rotateZ(-.25); }
      if (pose === 'raw-thigh-bend') { vrm.humanoid.getRawBoneNode('leftUpperLeg').rotateX(.7); vrm.humanoid.getRawBoneNode('rightUpperLeg').rotateX(.4); }
      vrm.scene.updateMatrixWorld(true);
    }
    for (const { entry, mesh, original, ids } of pieces) {
      mesh.skeleton.update(); original.skeleton.update();
      const coordinates = new Float64Array(ids.length * 6); let maximumWorldDifferenceM = 0;
      ids.forEach((id, i) => {
        const a = original.getVertexPosition(id, new T.Vector3()).applyMatrix4(original.matrixWorld);
        const b = mesh.getVertexPosition(id, new T.Vector3()).applyMatrix4(mesh.matrixWorld);
        const error = a.distanceTo(b); assert.ok([...a, ...b, error].every(Number.isFinite));
        maximumWorldDifferenceM = Math.max(maximumWorldDifferenceM, error); coordinates.set([...a, ...b], i * 6);
      });
      assert.ok(maximumWorldDifferenceM < 1e-5, 'CPU rest/pose equivalence exceeds declared technical readback threshold');
      poses.push({ pose, id: entry.id, referencedVertices: ids.length, finite: true, maximumWorldDifferenceM });
      const buffer = Buffer.from(coordinates.buffer); arrays.push(buffer);
      layout.push({ pose, id: entry.id, byteOffset: offset, bytes: buffer.length, vertexIds: ids,
        row: ['sourceWorldX', 'sourceWorldY', 'sourceWorldZ', 'equippedWorldX', 'equippedWorldY', 'equippedWorldZ'] }); offset += buffer.length;
    }
  }
  adapter.update(0); adapter.dispose(); adapter.dispose();
  assert.ok(pieces.every(p => p.item.container.parent === null));
  for (const pin of runtimePins) assert.equal(hash(await read(pin.path)), pin.sha256, 'Runtime source changed during test');
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(new URL('coordinates.f64', out), Buffer.concat(arrays), { flag: 'wx' });
  await fs.writeFile(new URL('coordinates-layout.json', out), JSON.stringify({ byteOrder: 'little-endian', component: 'Float64', layout }, null, 2)+'\n', { flag: 'wx' });
  const report = { schema: 'native-male-actual-equipment-adapter-cpu-v1', status: 'three-pieces-loaded-on-exact7586-CPU-only',
    sourcePath, targetPath, targetSha256: hash(targetBytes), equipmentManifestSha256: hash(manifestBytes),
    poses, bindingChecks, damagedInverseBindRejectedForAllThree: true, oldA18aAvatarIdentityRejectedForAllThree: true,
    pausedFirstFrameMaterialsInitialized: true, sourceWeightNormalizationNote: 'Original shared attributes may be normalized once per source primitive, standalone once; actual finite pose error retained.',
    materials: pieces.map(p => ({ id: p.entry.id, materials: p.materials.map(m => ({ isMToonMaterial: m.isMToonMaterial, isOutline: m.isOutline, alphaTest: m.alphaTest, uniformAlphaTest: m.uniforms.alphaTest.value })) })),
    runtimePins, disposedIdempotently: true, limits: ['1px CPU texture fixture; original encoded image bytes independently checked',
      'Raw bone fixtures, no normalized motion/VRM spring stepping, renderer, GPU or visual approval',
      'No body texture state controller, factory, contact or recipe validation'] };
  await fs.writeFile(new URL('cpu-verification.json', out), JSON.stringify(report, null, 2)+'\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, poses }));
} finally {
  adapter?.dispose(); loaded.forEach(gltf => VRMUtils.deepDispose(gltf.scene));
  GLTFLoader.prototype.parse = originalParse; globalThis.fetch = originalFetch; globalThis.window = originalWindow;
}
