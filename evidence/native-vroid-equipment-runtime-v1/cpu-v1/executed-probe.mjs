// Actual GLTFLoader/MToon and equipment adapter CPU probes, no renderer or GPU.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { VRM, MToonMaterial } from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { createEquipmentLoader, updateEquipmentMaterials } from '../prototype/src/equipment-material-loader.js';
import { createEquipment } from '../prototype/src/equipment.js';

const out = resolve(process.argv[2] || 'evidence/native-vroid-equipment-runtime-v1/cpu-v1');
await mkdir(out, { recursive: false });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['prototype/src/equipment-material-loader.js', 'prototype/src/equipment.js',
  'prototype/src/m1-equipment.js', 'prototype/src/foundation-avatar.js', 'prototype/src/motion.js',
  'prototype/src/material-recipes.js', 'prototype/src/cloth-material.js',
  'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js'];
const snapshots = await Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(path)) })));
await writeFile(resolve(out, 'tested-sources.json'), JSON.stringify(snapshots, null, 2));
const checks = [];
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-10, `${value} != ${expected}`);
function fixture(kind) {
  const chunks = [], views = [], accessors = [];
  let length = 0;
  function attribute(array, type, componentType) {
    const bytes = Buffer.from(array.buffer);
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(bytes, Buffer.alloc((-bytes.length) & 3));
    length += bytes.length + ((-bytes.length) & 3);
    const size = { VEC3: 3, VEC2: 2, VEC4: 4, SCALAR: 1, MAT4: 16 }[type];
    accessors.push({ bufferView: views.length - 1, componentType, type, count: array.length / size });
    return accessors.length - 1;
  }
  const attributes = {
    POSITION: attribute(new Float32Array([0, 0, 0, .1, 0, 0, 0, .1, 0]), 'VEC3', 5126),
    NORMAL: attribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 'VEC3', 5126),
    TEXCOORD_0: attribute(new Float32Array([0, 0, 1, 0, 0, 1]), 'VEC2', 5126),
    JOINTS_0: attribute(new Uint16Array(12), 'VEC4', 5123),
    WEIGHTS_0: attribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4', 5126),
  };
  const indices = attribute(new Uint16Array([0, 1, 2]), 'SCALAR', 5123);
  const inverseBindMatrices = attribute(new Float32Array(new THREE.Matrix4().elements), 'MAT4', 5126);
  const material = { name: kind, pbrMetallicRoughness: { baseColorFactor: [.4, .5, .6, 1] } };
  const extensionsUsed = [];
  if (kind !== 'plain') {
    material.extensions = { KHR_materials_unlit: {} };
    extensionsUsed.push('KHR_materials_unlit');
  }
  if (kind === 'mtoon') {
    material.extensions.VRMC_materials_mtoon = { specVersion: '1.0',
      shadeColorFactor: [.2, .3, .4], outlineWidthMode: 'worldCoordinates', outlineWidthFactor: .001,
      uvAnimationScrollXSpeedFactor: .2, uvAnimationScrollYSpeedFactor: .1 };
    extensionsUsed.push('VRMC_materials_mtoon');
  }
  const document = { asset: { version: '2.0' }, buffers: [{ byteLength: length }],
    bufferViews: views, accessors, extensionsUsed, materials: [material],
    meshes: [{ primitives: [{ attributes, indices, material: 0 }] }],
    skins: [{ joints: [0], inverseBindMatrices }],
    nodes: [{ name: 'Head' }, { name: 'Garment', mesh: 0, skin: 0 }],
    scenes: [{ nodes: [0, 1] }], scene: 0 };
  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((-json.length) & 3, 32)]);
  const binary = Buffer.concat(chunks);
  const header = Buffer.alloc(12); header.write('glTF'); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  const chunk = (bytes, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(bytes.length); h.write(type, 4); return Buffer.concat([h, bytes]); };
  return Buffer.concat([header, chunk(json, 'JSON'), chunk(binary, 'BIN\0')]);
}

const resources = new Map();
const bodySHA = 'a'.repeat(64);
const items = ['plain', 'unlit', 'mtoon'].map(id => {
  const bytes = fixture(id); resources.set(`https://fixture.test/${id}.glb`, bytes);
  return { id, url: `/${id}.glb`, bytes: bytes.length, sha256: hash(bytes), slot: 'top',
    compatibleAvatarSha256: bodySHA, bindings: [{ sourceBone: 'Head', targetRawBone: 'Head',
      inverseBindMatrix: new THREE.Matrix4().elements }] };
});
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
globalThis.window = { location: { href: 'https://fixture.test/' } };
globalThis.fetch = async input => {
  const url = String(input);
  if (url === '/manifest.json') return new Response(JSON.stringify({ schema: 'zbgs-equipment-v1', items }));
  if (!resources.has(url)) return new Response('', { status: 404 });
  return new Response(resources.get(url));
};
let adapter;
try {
  const loaded = {};
  for (const id of ['plain', 'unlit', 'mtoon']) {
    const bytes = resources.get(`https://fixture.test/${id}.glb`);
    const gltf = await createEquipmentLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    let mesh; gltf.scene.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
    loaded[id] = mesh;
  }
  assert.ok(loaded.plain.material.isMeshStandardMaterial);
  assert.ok(loaded.unlit.material.isMeshBasicMaterial);
  const toon = loaded.mtoon.material;
  assert.equal(toon.length, 2); assert.ok(toon.every(material => material.isMToonMaterial));
  assert.notEqual(toon[0], toon[1]); assert.ok(toon[1].isOutline);
  checks.push({ name: 'actual-loader-plain-unlit-mtoon-plus-outline', passed: true });
  const counts = [0, 0];
  toon.forEach((material, i) => { const update = material.update.bind(material); material.update = delta => { counts[i]++; update(delta); }; });
  const item = { container: new THREE.Group(), meshes: [loaded.mtoon, loaded.mtoon] };
  updateEquipmentMaterials([item, item], .25);
  assert.deepEqual(counts, [1, 1]); toon.forEach(material => near(material.uvAnimationScrollXOffset, .05));
  item.container.visible = false; updateEquipmentMaterials([item], .25);
  assert.deepEqual(counts, [1, 1]); item.container.visible = true;
  updateEquipmentMaterials([item], .25); assert.deepEqual(counts, [2, 2]);
  checks.push({ name: 'actual-surface-outline-dedup-hidden-and-resume', passed: true });
  assert.throws(() => updateEquipmentMaterials([item], NaN), /Invalid/);
  assert.throws(() => updateEquipmentMaterials([item], -1), /Invalid/);
  checks.push({ name: 'invalid-delta-rejected', passed: true });

  const scene = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'Head'; scene.add(bone);
  const avatarMaterial = new MToonMaterial({ uvAnimationScrollXSpeedFactor: .2 });
  const avatarMesh = new THREE.SkinnedMesh(loaded.plain.geometry.clone(), avatarMaterial);
  avatarMesh.bind(new THREE.Skeleton([bone], [new THREE.Matrix4()])); scene.add(avatarMesh);
  const vrm = new VRM({ scene, humanoid: { update() {}, getRawBoneNode: () => bone }, materials: [avatarMaterial] });
  adapter = await createEquipment({ vrm, avatarSha256: bodySHA, manifestUrl: '/manifest.json' });
  const garment = await adapter.load('mtoon');
  const originals = garment.meshes[0].material;
  adapter.applyLoadedSet(['mtoon']);
  vrm.update(.25); originals.forEach(material => near(material.uvAnimationScrollXOffset, 0));
  near(avatarMaterial.uvAnimationScrollXOffset, .05);
  adapter.update(.25); originals.forEach(material => near(material.uvAnimationScrollXOffset, .05));
  checks.push({ name: 'actual-vrm-update-does-not-own-attached-garment-materials', passed: true });
  adapter.applyLoadedSet([]); adapter.update(.25);
  originals.forEach(material => near(material.uvAnimationScrollXOffset, .05));
  adapter.applyLoadedSet(['mtoon']); adapter.update(.25);
  originals.forEach(material => near(material.uvAnimationScrollXOffset, .1));
  checks.push({ name: 'actual-adapter-hide-show-preserves-and-resumes-phase', passed: true });
  // Reproduce the currently authored skirt-hand prepass call sequence. This is
  // a call-sequence witness, not execution of the full browser motion loop.
  adapter.update(0);
  originals.forEach(material => near(material.uvAnimationScrollXOffset, .1));
  checks.push({ name: 'skirt-hand-zero-delta-prepass-has-no-phase-progress', passed: true,
    limitation: 'Foundation skips the subsequent real-delta update on its garmentPreparedForHands branch' });
  const second = await createEquipment({ vrm, avatarSha256: bodySHA, manifestUrl: '/manifest.json' });
  const peer = await second.load('mtoon'); second.applyLoadedSet(['mtoon']);
  assert.notEqual(peer.meshes[0].material[0], originals[0]);
  second.update(.25); near(peer.meshes[0].material[0].uvAnimationScrollXOffset, .05);
  near(originals[0].uvAnimationScrollXOffset, .1); second.dispose();
  checks.push({ name: 'two-real-adapters-independent-material-phase', passed: true });
  const disposals = originals.map(() => 0); let geometries = 0;
  originals.forEach((material, i) => material.addEventListener('dispose', () => disposals[i]++));
  garment.meshes[0].geometry.addEventListener('dispose', () => geometries++);
  adapter.dispose(); adapter.dispose(); adapter.update(.25);
  assert.deepEqual(disposals, [1, 1]); assert.equal(geometries, 1);
  assert.equal(garment.container.parent, null);
  checks.push({ name: 'actual-adapter-exact-once-surface-outline-geometry-disposal-and-no-postdispose-update', passed: true });
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ schema: 'equipment-mtoon-independent-cpu-v1',
    status: 'bounded-checks-passed-with-documented-time-seam', sources: snapshots, checks,
    limits: ['In-memory valid skinned GLB, no texture images, no renderer/GPU',
      'Actual cloth material recipes reject MToon by their existing MeshBasicMaterial contract',
      'Skirt prepass is a code-linked call-sequence witness, full avatar motion not executed'] }, null, 2));
  console.log(`${checks.length} checks passed; read report time-seam limitation`);
} finally {
  adapter?.dispose(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;
}
