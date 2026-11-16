// Actual weighted root continuity and unchanged distal hair under the real head.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = path.join(root, 'assets-source/m2-long-hair-v1'), revision = path.join(base, 'revisions/rootjoin-v2');
const flag = process.argv.indexOf('--modules-root');
const modules = flag < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[flag+1]);
const load = relative => import(pathToFileURL(path.join(modules, relative)).href);
const THREE = await load('three/build/three.module.js');
const { GLTFLoader } = await load('three/examples/jsm/loaders/GLTFLoader.js');
const { VRMLoaderPlugin, VRMUtils } = await load('@pixiv/three-vrm/lib/three-vrm.module.js');
globalThis.self = { URL: globalThis.URL };
const digest = data => createHash('sha256').update(data).digest('hex');
const originalInventory = await fs.readFile(path.join(base, 'generated/package-files.json'));
const spec = JSON.parse(await fs.readFile(path.join(revision, 'spec.json'), 'utf8'));
assert.equal(digest(originalInventory), spec.sourceInventorySha256);
const report = JSON.parse(await fs.readFile(path.join(revision, 'build-report.json'), 'utf8'));
const oldFit = JSON.parse(await fs.readFile(path.join(base, 'generated/fit.json'), 'utf8'));
const fit = JSON.parse(await fs.readFile(path.join(revision, 'fit.json'), 'utf8'));
assert.deepEqual(fit.dynamics, oldFit.dynamics); assert.equal(fit.version, 2);
const repeatFiles = ['female-ponytail.glb', 'fit.json', 'manifest.json'];
const repeatBefore = await Promise.all(repeatFiles.map(async file => ({ file, bytes: await fs.readFile(path.join(revision, file)), mtime: (await fs.stat(path.join(revision, file))).mtimeMs })));
const repeated = JSON.parse(execFileSync('python', ['-B', path.join(root, 'scripts/m2-long-hair-v1/rootjoin-v2.py')], { cwd: root }).toString());
for (const item of repeatBefore) { assert(item.bytes.equals(await fs.readFile(path.join(revision, item.file)))); assert.equal((await fs.stat(path.join(revision, item.file))).mtimeMs, item.mtime); }
async function parse(file, body) {
  const data = await fs.readFile(file), loader = new GLTFLoader();
  if (body) loader.register(parser => new VRMLoaderPlugin(parser));
  loader.register(() => ({ name: 'CPUTextureFixture', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset+data.byteLength), '');
}
const original = await parse(path.join(base, 'generated/female-ponytail.glb'), false);
const revised = await parse(path.join(revision, 'female-ponytail.glb'), false);
const vrm = (await parse(path.join(root, 'prototype/public/assets/foundation/base-female-roundtrip.vrm'), true)).userData.vrm;
VRMUtils.rotateVRM0(vrm); vrm.scene.updateMatrixWorld(true); vrm.update(0);
const head = vrm.humanoid.getRawBoneNode('head'); head.add(original.scene, revised.scene); vrm.scene.updateMatrixWorld(true);
const meshOf = scene => { const meshes = []; scene.traverse(n => { if (n.isMesh) meshes.push(n); }); assert.equal(meshes.length, 1); assert(meshes[0].isSkinnedMesh); return meshes[0]; };
const old = meshOf(original.scene), mesh = meshOf(revised.scene);
assert.deepEqual(mesh.skeleton.bones.map(b => b.name), old.skeleton.bones.map(b => b.name));
mesh.skeleton.boneInverses.forEach((m, i) => assert.deepEqual(m.elements, old.skeleton.boneInverses[i].elements));
const key = (geometry, i) => [geometry.attributes.position.getX(i), geometry.attributes.position.getY(i), geometry.attributes.position.getZ(i), geometry.attributes.uv.getX(i), geometry.attributes.uv.getY(i)].join(',');
const lookup = new Map();
for (let i = 0; i < old.geometry.attributes.position.count; i++) { assert(!lookup.has(key(old.geometry, i))); lookup.set(key(old.geometry, i), i); }
const mapping = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => { const id = lookup.get(key(mesh.geometry, i)); assert.notEqual(id, undefined); return id; });
let restError = 0;
mapping.forEach((oldId, i) => { restError = Math.max(restError, mesh.getVertexPosition(i, new THREE.Vector3()).distanceTo(old.getVertexPosition(oldId, new THREE.Vector3()))); });
assert(restError < 1e-7);
const index = [...mesh.geometry.index.array], bridge = index.slice(-report.trace.newConnectorTriangles*3);
const bodyHeadBefore = head.matrixWorld.clone();
for (const asset of [original, revised]) asset.scene.getObjectByName('Pony0').quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), .2);
vrm.scene.updateMatrixWorld(true);
let capDisplacement = 0, distalError = 0, rootBlendMovement = 0;
const oldPositions = old.geometry.attributes.position;
mapping.forEach((oldId, i) => {
  const now = mesh.getVertexPosition(i, new THREE.Vector3());
  if (oldId < 225) capDisplacement = Math.max(capDisplacement, now.distanceTo(new THREE.Vector3().fromBufferAttribute(oldPositions, oldId)));
  if (oldId >= 225+4*16 && oldId < 627) distalError = Math.max(distalError, now.distanceTo(old.getVertexPosition(oldId, new THREE.Vector3())));
  if (oldId >= 225+16 && oldId < 225+32) rootBlendMovement = Math.max(rootBlendMovement, now.distanceTo(new THREE.Vector3().fromBufferAttribute(oldPositions, oldId)));
});
assert(capDisplacement < 1e-7 && distalError < 1e-7 && rootBlendMovement > .0005);
// Each welded edge has one shared vertex definition under both incident faces.
const edges = new Map();
for (let i = 0; i < index.length; i += 3) for (let j = 0; j < 3; j++) {
  const pair = [index[i+j], index[i+(j+1)%3]].sort((a, b) => a-b), k = pair.join(','); edges.set(k, (edges.get(k) ?? 0)+1);
}
const vertices = [...new Set(bridge)]; assert(vertices.every(i => Number.isFinite(mesh.getVertexPosition(i, new THREE.Vector3()).length())));
assert(vertices.filter(i => mapping[i] >= 241 && mapping[i] < 257).length === 16);
assert.deepEqual(head.matrixWorld.elements, bodyHeadBefore.elements);
assert.equal(digest(await fs.readFile(path.join(base, 'generated/package-files.json'))), spec.sourceInventorySha256);
const cpu = { passed: true, threeRevision: THREE.REVISION, assetSha256: digest(await fs.readFile(path.join(revision, 'female-ponytail.glb'))),
  restPositionErrorM: restError, capDisplacementM: capDisplacement, distalV1PoseErrorM: distalError, rootBlendMovementM: rootBlendMovement,
  sharedConnectorVertices: vertices.length, boundaryEdges: [...edges.values()].filter(n => n === 1).length,
  actualPony0RotationRad: .2, fitPhysicsExactlyV1: true, sourceHeadAndFrozenV1Unchanged: true, repeatExportBytesAndTimesIdentical: true,
  CPUOnly: true, textureFixture: '1x1 placeholder decode for actual GLTFLoader skinning; no render or texture review', runtimeAccepted: false };
await fs.writeFile(path.join(revision, 'runtime-cpu-qa.json'), JSON.stringify(cpu, null, 2)+'\n');
async function files(directory) { const result = []; for (const entry of await fs.readdir(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) result.push(...await files(file)); else if (entry.name !== 'package-files.json') result.push(file); } return result; }
const inventoryFiles = [...await files(revision), path.join(root, 'scripts/m2-long-hair-v1/rootjoin-v2.py'), fileURLToPath(import.meta.url)];
const inventory = [];
for (const file of inventoryFiles.sort()) { const data = await fs.readFile(file); inventory.push({ path: path.relative(root, file).split(path.sep).join('/'), sha256: digest(data), bytes: data.length }); }
await fs.writeFile(path.join(revision, 'package-files.json'), JSON.stringify({ files: inventory }, null, 2)+'\n');
for (const asset of [original, revised]) { asset.scene.removeFromParent(); VRMUtils.deepDispose(asset.scene); } VRMUtils.deepDispose(vrm.scene);
console.log(JSON.stringify(cpu, null, 2));
