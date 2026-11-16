// CPU-only real loader and raw-head attachment proof for the source candidate.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = path.join(root, 'assets-source/m2-hat-hair-v1');
const index = process.argv.indexOf('--modules-root');
const modules = index < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[index+1]);
const load = name => import(pathToFileURL(path.join(modules, name)).href);
const THREE = await load('three/build/three.module.js');
const { GLTFLoader } = await load('three/examples/jsm/loaders/GLTFLoader.js');
const { VRMLoaderPlugin, VRMUtils } = await load('@pixiv/three-vrm/lib/three-vrm.module.js');
globalThis.self = { URL: globalThis.URL };
const digest = data => createHash('sha256').update(data).digest('hex');
const spec = JSON.parse(await fs.readFile(path.join(base, 'spec.json'), 'utf8'));
async function parse(name, vrm = false) {
  const data = await fs.readFile(name), loader = new GLTFLoader();
  if (vrm) loader.register(parser => new VRMLoaderPlugin(parser));
  loader.register(() => ({ name: 'CPUTextureFixture', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset+data.byteLength), '');
}
const hatBytes = await fs.readFile(path.join(base, 'generated/baseball-cap.glb'));
const fit = JSON.parse(await fs.readFile(path.join(base, 'generated/fit.json'), 'utf8'));
assert.equal(digest(hatBytes), fit.assetSha256);
assert.equal(fit.targetBodySha256, spec.body.sha256);
assert.equal(fit.hairDependency.sha256, spec.hair.sha256);
assert.deepEqual(fit.coverage, { mode: 'none', preserveCompleteHair: true, preserveCompleteHeadSkin: true });
const hat = await parse(path.join(base, 'generated/baseball-cap.glb'));
const hair = await parse(path.join(root, spec.hair.path));
const vrm = (await parse(path.join(root, spec.body.path), true)).userData.vrm;
VRMUtils.rotateVRM0(vrm); vrm.update(0); vrm.scene.updateMatrixWorld(true);
const head = vrm.humanoid.getRawBoneNode('head');
const originalChildren = head.children.length;
const bodyPositions = [];
vrm.scene.traverse(object => { if (object.isMesh) bodyPositions.push(digest(Buffer.from(object.geometry.attributes.position.array.buffer))); });
head.add(hat.scene, hair.scene); vrm.scene.updateMatrixWorld(true);
let meshes = 0, vertices = 0, triangles = 0, worldError = 0;
hat.scene.traverse(object => {
  if (!object.isMesh) return;
  meshes++; assert(!object.isSkinnedMesh); assert.equal(object.material.name, spec.material.name);
  assert.equal(object.material.map, null); assert.equal(object.material.roughness, .9);
  assert.deepEqual(object.scale.toArray(), [1, 1, 1]); assert(!object.morphTargetInfluences);
  vertices += object.geometry.attributes.position.count; triangles += object.geometry.index.count/3;
  for (let i = 0; i < object.geometry.attributes.position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position, i);
    assert(Number.isFinite(point.length()));
    worldError = Math.max(worldError, point.clone().applyMatrix4(object.matrixWorld).distanceTo(point.applyMatrix4(head.matrixWorld)));
  }
});
assert.equal(meshes, 2); assert.equal(vertices, 2238); assert.equal(triangles, 4472); assert(worldError < 1e-7);
head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .2));
vrm.scene.updateMatrixWorld(true);
assert.deepEqual(hat.scene.matrixWorld.elements, head.matrixWorld.elements);
assert.deepEqual(hair.scene.matrixWorld.elements, head.matrixWorld.elements);
head.remove(hat.scene, hair.scene); assert.equal(head.children.length, originalChildren);
const bodyAfter = [];
vrm.scene.traverse(object => { if (object.isMesh) bodyAfter.push(digest(Buffer.from(object.geometry.attributes.position.array.buffer))); });
assert.deepEqual(bodyAfter, bodyPositions);
const report = { passed: true, threeRevision: THREE.REVISION, actualGLTFLoader: true, hatMeshes: meshes, hatVertices: vertices, hatTriangles: triangles,
  headLocalWorldErrorM: worldError, rawHeadYawRad: .2, sameHeadParentTransform: true, completeOriginalBodyGeometryUnchanged: true,
  removedWithoutOriginalChildLoss: true, assetSha256: digest(hatBytes), CPUOnly: true,
  limits: '1x1 placeholder texture decode for source VRM/hair. No browser, rendering, spring dynamics or visual acceptance.', runtimeAccepted: false };
await fs.writeFile(path.join(base, 'runtime-cpu-qa.json'), JSON.stringify(report, null, 2)+'\n');
VRMUtils.deepDispose(hat.scene); VRMUtils.deepDispose(hair.scene); VRMUtils.deepDispose(vrm.scene);
console.log(JSON.stringify(report, null, 2));
