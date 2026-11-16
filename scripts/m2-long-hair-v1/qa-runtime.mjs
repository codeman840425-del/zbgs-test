// Actual GLTFLoader skin deformation and official spring API smoke. No rendering.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = path.join(root, 'assets-source/m2-long-hair-v1');
const flag = process.argv.indexOf('--modules-root');
const modules = flag < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[flag+1]);
const load = relative => import(pathToFileURL(path.join(modules, relative)).href);
const THREE = await load('three/build/three.module.js');
const { GLTFLoader } = await load('three/examples/jsm/loaders/GLTFLoader.js');
const { VRMLoaderPlugin, VRMUtils } = await load('@pixiv/three-vrm/lib/three-vrm.module.js');
const { VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere, VRMSpringBoneColliderShapeCapsule } = await load('@pixiv/three-vrm-springbone/lib/three-vrm-springbone.module.js');
globalThis.self = { URL: globalThis.URL };
async function parse(file, isBody) {
  const bytes = await fs.readFile(file), loader = new GLTFLoader();
  if (isBody) loader.register(parser => new VRMLoaderPlugin(parser));
  loader.register(() => ({ name: 'CPUTextureFixture', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
}
const spec = JSON.parse(await fs.readFile(path.join(base, 'spec.json'), 'utf8'));
const fit = JSON.parse(await fs.readFile(path.join(base, 'generated/fit.json'), 'utf8'));
const actual = await parse(path.join(base, 'generated/female-ponytail.glb'), false);
const body = (await parse(path.join(root, spec.source.path), true)).userData.vrm;
VRMUtils.rotateVRM0(body); body.scene.updateMatrixWorld(true); body.update(0); body.scene.updateMatrixWorld(true);
const head = body.humanoid.getRawBoneNode('head'); head.add(actual.scene); body.scene.updateMatrixWorld(true);
const meshes = []; actual.scene.traverse(n => { if (n.isMesh) meshes.push(n); });
assert.equal(meshes.length, 1); const mesh = meshes[0]; assert(mesh.isSkinnedMesh); assert.equal(mesh.skeleton.bones.length, 8);
const originalHair = []; body.scene.traverse(n => { if (n.isMesh && n !== mesh && n.material?.name === spec.sourceMaterial) originalHair.push(n); });
assert(originalHair.length > 0);
const original = originalHair[0], ids = [...new Set(original.geometry.index.array)].sort((a, b) => a-b);
assert.equal(ids.length, 225);
let retainedCapErrorM = 0;
for (let i = 0; i < 225; i++) {
  const a = mesh.localToWorld(mesh.getVertexPosition(i, new THREE.Vector3()));
  const b = original.localToWorld(original.getVertexPosition(ids[i], new THREE.Vector3()));
  retainedCapErrorM = Math.max(retainedCapErrorM, a.distanceTo(b));
}
assert(retainedCapErrorM < 1e-6);
function vertices() { return Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3())); }
const before = vertices(), bent = actual.scene.getObjectByName('Pony2'); bent.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), .15);
body.scene.updateMatrixWorld(true); const after = vertices(); let tailMotionM = 0, capMotionM = 0;
before.forEach((p, i) => { const d = p.distanceTo(after[i]); if (i < 225) capMotionM = Math.max(capMotionM, d); else tailMotionM = Math.max(tailMotionM, d); });
assert(tailMotionM > .02 && capMotionM < 1e-7); bent.quaternion.identity(); body.scene.updateMatrixWorld(true);
const baselineJoints = body.springBoneManager?.joints.size ?? 0;
const manager = new VRMSpringBoneManager(), colliders = fit.dynamics.colliders.map(ref => {
  const params = { offset: new THREE.Vector3(...ref.offset), radius: ref.radius };
  if (ref.tail) params.tail = new THREE.Vector3(...ref.tail);
  const shape = ref.shape === 'sphere' ? new VRMSpringBoneColliderShapeSphere(params) : new VRMSpringBoneColliderShapeCapsule(params);
  const collider = new VRMSpringBoneCollider(shape); body.humanoid.getRawBoneNode(ref.bone).add(collider); collider.updateWorldMatrix(true, false); return collider;
});
const joints = fit.dynamics.joints.map(ref => {
  const settings = { hitRadius: ref.hitRadius, stiffness: ref.stiffness, gravityPower: ref.gravityPower, gravityDir: new THREE.Vector3(...ref.gravityDir), dragForce: ref.dragForce };
  const joint = new VRMSpringBoneJoint(actual.scene.getObjectByName(ref.bone), actual.scene.getObjectByName(ref.child), settings, [{ name: 'source-body-collar', colliders }]);
  manager.addJoint(joint); return joint;
});
assert.equal(manager.joints.size, 6); manager.setInitState(); manager.update(1/60); body.scene.updateMatrixWorld(true);
assert(vertices().every(v => Number.isFinite(v.x+v.y+v.z))); manager.reset(); body.scene.updateMatrixWorld(true);
const resetErrorM = Math.max(...vertices().map((p, i) => p.distanceTo(before[i]))); assert(resetErrorM < 1e-6);
assert.equal(body.springBoneManager?.joints.size ?? 0, baselineJoints);
joints.forEach(j => manager.deleteJoint(j)); colliders.forEach(c => c.removeFromParent()); assert.equal(manager.joints.size, 0);
const packageInfo = JSON.parse(await fs.readFile(path.join(modules, '@pixiv/three-vrm-springbone/package.json'), 'utf8'));
const report = { passed: true, threeRevision: THREE.REVISION, officialSpringPackageVersion: packageInfo.version,
  assetSha256: createHash('sha256').update(await fs.readFile(path.join(base, 'generated/female-ponytail.glb'))).digest('hex'),
  retainedCapWorldErrorM: retainedCapErrorM, manualAuxiliaryRotationRad: .15, actualTailVertexDisplacementM: tailMotionM, capVertexDisplacementM: capMotionM,
  officialJoints: joints.length, officialColliders: colliders.length, isolatedManager: true, oneStepFinite: true, resetErrorM,
  textureDecodeFixture: '1x1 placeholder only; original source texture bytes/opacity are independently checked by Python.',
  CPUOnly: true, GPUUsed: false, runtimeAccepted: false, scope: 'One manual weighted deformation plus official constructor/init/update/reset/delete smoke. No game motion or dynamic collision acceptance.' };
await fs.writeFile(path.join(base, 'generated/runtime-cpu-qa.json'), JSON.stringify(report, null, 2)+'\n');
actual.scene.removeFromParent(); VRMUtils.deepDispose(actual.scene); VRMUtils.deepDispose(body.scene);
console.log(JSON.stringify(report, null, 2));
