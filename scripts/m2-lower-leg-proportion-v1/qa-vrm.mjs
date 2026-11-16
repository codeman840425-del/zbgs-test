// Actual locked GLTFLoader + VRMLoaderPlugin CPU mapping. Textures are fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageDir = path.join(root, 'assets-source/m2-lower-leg-proportion-v1');
const flag = process.argv.indexOf('--modules-root');
const modules = flag < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[flag+1]);
const load = relative => import(pathToFileURL(path.join(modules, relative)).href);
const THREE = await load('three/build/three.module.js');
const { GLTFLoader } = await load('three/examples/jsm/loaders/GLTFLoader.js');
const { VRMLoaderPlugin, VRMUtils } = await load('@pixiv/three-vrm/lib/three-vrm.module.js');
globalThis.self = { URL: globalThis.URL };
const spec = JSON.parse(await fs.readFile(path.join(packageDir, 'spec.json'), 'utf8'));
const semantics = ['hips', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes'];

async function read(file) {
  const bytes = await fs.readFile(file);
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  loader.register(() => ({ name: 'CPUTextureFixture', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
  const vrm = gltf.userData.vrm;
  assert(vrm, 'Actual VRM consumer must return a VRM');
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.updateMatrixWorld(true);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  const snapshot = {};
  for (const semantic of semantics) {
    const raw = vrm.humanoid.getRawBoneNode(semantic);
    const normalized = vrm.humanoid.getNormalizedBoneNode(semantic);
    assert(raw && normalized, 'Missing raw/normalized semantic '+semantic);
    snapshot[semantic] = { rawName: raw.name, raw: raw.getWorldPosition(new THREE.Vector3()).toArray(), normalized: normalized.getWorldPosition(new THREE.Vector3()).toArray() };
  }
  const lengths = {};
  for (const side of ['left', 'right']) {
    lengths[side] = {};
    for (const kind of ['raw', 'normalized']) {
      lengths[side][kind] = new THREE.Vector3(...snapshot[side+'Foot'][kind]).distanceTo(new THREE.Vector3(...snapshot[side+'LowerLeg'][kind]));
    }
  }
  const sceneScale = vrm.scene.scale.toArray();
  VRMUtils.deepDispose(vrm.scene);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), snapshot, lengths, sceneScale };
}

const original = await read(path.join(root, spec.sourceBody.path));
const candidate = await read(path.join(packageDir, 'generated/avatar.vrm'));
assert.equal(original.sha256, spec.sourceBody.sha256);
for (const semantic of semantics) assert.equal(candidate.snapshot[semantic].rawName, original.snapshot[semantic].rawName);
for (const side of ['left', 'right']) for (const kind of ['raw', 'normalized']) {
  assert(Math.abs(candidate.lengths[side][kind]-original.lengths[side][kind]-.02) < 1e-7, side+' '+kind+' lower-leg difference');
}
for (const semantic of ['hips', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerLeg', 'rightLowerLeg']) {
  for (const kind of ['raw', 'normalized']) {
    assert(new THREE.Vector3(...candidate.snapshot[semantic][kind]).distanceTo(new THREE.Vector3(...original.snapshot[semantic][kind])) < 1e-7, 'Protected mapping reference moved '+semantic);
  }
}
assert.deepEqual(candidate.sceneScale, [1, 1, 1]);
const vrmPackage = JSON.parse(await fs.readFile(path.join(modules, '@pixiv/three-vrm/package.json'), 'utf8'));
const report = { passed: true, threeRevision: THREE.REVISION, threeVrmVersion: vrmPackage.version, loader: 'GLTFLoader + VRMLoaderPlugin + rotateVRM0 + update(0)',
  original, candidate, CPUOnly: true, textureDecode: '1x1 placeholder textures for skeleton/mapping only; original embedded textures separately byte-checked by Python QA', runtimeAccepted: false };
await fs.writeFile(path.join(packageDir, 'generated/vrm-loader-qa.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ passed: true, originalLengths: original.lengths, candidateLengths: candidate.lengths, threeRevision: THREE.REVISION, runtimeAccepted: false }));
