import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({target: this}); }).catch(error => this.onerror?.(error)); } };
const root = new URL('../../', import.meta.url);
const sourcePath = 'assets-source/company-camera-mount-v1/parameters.json';
const contractPath = 'assets-source/company-camera-mount-v1/contracts/camera-mount.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-camera-mount-collection.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const contractBytes = await fs.readFile(new URL(contractPath, root));
const contract = JSON.parse(contractBytes);
const branchBytes = await fs.readFile(new URL(branchPath, root));
const branches = JSON.parse(branchBytes);
const generatorHash = hash(await fs.readFile(new URL(generatorPath, root)));
const cameraMountBranch = branches.groups.find(group => group.id === 'camera-background')?.branches.find(branch => branch.id === 'camera-mount');
const tripodBranch = branches.groups.find(group => group.id === 'camera-background')?.branches.find(branch => branch.id === 'floor-tripod-camera-mount');
assert(cameraMountBranch && tripodBranch, 'camera mount branches must exist');
assert.deepEqual(cameraMountBranch.fixedFunctionAndInstall.dimensionsMeters, {width: .8, height: 1.8, depth: .8, verification: 'pending'});
assert.equal(cameraMountBranch.fixedFunctionAndInstall.parent, 'desk.edge');
assert.deepEqual(tripodBranch.fixedFunctionAndInstall.dimensionsMeters, {width: .8, height: 1.8, depth: .8, verification: 'pending'});
assert.equal(source.schemaVersion, 1);
assert.equal(source.designs.length, 4);
assert.equal(contract.parentOptions.length, 3);

const installs = {
  'desk-clamp': {mount: 'desk-edge-clamp', parent: 'desk.edge', clearance: 'desk-edge-clearance'},
  'articulated-arm': {mount: 'desk-edge-clamp', parent: 'desk.edge', clearance: 'desk-edge-clearance'},
  tripod: {mount: 'floor-surface', parent: 'room.floor', clearance: 'tripod-footprint'},
  'wall-arm': {mount: 'wall', parent: 'room.wall', clearance: 'wall-clearance'}
};
function mat(color, roughness = .46, metalness = .12) { return new THREE.MeshStandardMaterial({color, roughness, metalness}); }
function mesh(parent, name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) { const value = new THREE.Mesh(geometry, material); value.name = name; value.position.fromArray(position); value.rotation.fromArray(rotation); value.castShadow = true; value.receiveShadow = true; parent.add(value); return value; }
function box(parent, name, size, material, position, rotation = [0, 0, 0]) { return mesh(parent, name, new THREE.BoxGeometry(...size), material, position, rotation); }
function rounded(parent, name, size, material, position, radius = .012, rotation = [0, 0, 0]) { return mesh(parent, name, new RoundedBoxGeometry(...size, 4, radius), material, position, rotation); }
function cylinder(parent, name, radius, height, material, position, rotation = [0, 0, 0], radial = 18) { return mesh(parent, name, new THREE.CylinderGeometry(radius, radius, height, radial), material, position, rotation); }
function beam(parent, name, start, end, radius, material, radial = 16) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), direction = b.clone().sub(a), length = direction.length();
  const value = cylinder(parent, name, radius, length, material, a.clone().add(b).multiplyScalar(.5).toArray(), [0, 0, 0], radial);
  value.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return value;
}
function rootGroup(p) { const group = new THREE.Group(); group.name = p.designId; group.userData = {units: 'metres', up: '+Y', forward: '+Z', branch: 'camera-mount', variant: p.variant}; return group; }
function cradle(group, frame, trim, rubber, y, z = .1) {
  rounded(group, 'camera-cradle', [.16, .045, .12], frame, [0, y, z], .014);
  box(group, 'mount-trim', [.11, .018, .012], trim, [0, y + .005, z + .062]);
  cylinder(group, 'mount-rubber', .022, .012, rubber, [0, y, z + .068], [Math.PI / 2, 0, 0], 16);
}
function deskClamp(p) {
  const group = rootGroup(p), frame = mat(p.frameColor), trim = mat(p.trimColor, .33, .22), rubber = mat(p.rubberColor, .8, .02);
  box(group, 'mount-frame', [.28, .025, .22], frame, [0, .0125, -.02]);
  box(group, 'mount-clearance', [.24, .012, .18], rubber, [0, .032, -.02]);
  box(group, 'mount-clamp-jaw', [.26, .23, .055], frame, [0, -.095, -.02]);
  cylinder(group, 'mount-screw', .018, .2, trim, [0, -.11, -.02], [Math.PI / 2, 0, 0], 16);
  cylinder(group, 'mount-screw-knob', .04, .026, trim, [0, -.11, -.02], [Math.PI / 2, 0, 0], 18);
  box(group, 'mount-riser', [.07, .30, .07], frame, [0, .18, -.01]);
  cylinder(group, 'mount-pivot', .043, .018, trim, [0, .32, .035], [Math.PI / 2, 0, 0], 20);
  cradle(group, frame, trim, rubber, .36, .1);
  box(group, 'mount-anchor', [.06, .012, .06], trim, [0, .04, -.02]);
  return group;
}
function articulatedArm(p) {
  const group = rootGroup(p), frame = mat(p.frameColor), trim = mat(p.trimColor, .33, .22), rubber = mat(p.rubberColor, .8, .02);
  box(group, 'mount-frame', [.30, .025, .22], frame, [0, .0125, -.02]);
  box(group, 'mount-clearance', [.24, .012, .18], rubber, [0, .032, -.02]);
  box(group, 'mount-clamp-jaw', [.26, .20, .055], frame, [0, -.085, -.02]);
  cylinder(group, 'mount-screw', .018, .18, trim, [0, -.10, -.02], [Math.PI / 2, 0, 0], 16);
  cylinder(group, 'mount-screw-knob', .038, .026, trim, [0, -.10, -.02], [Math.PI / 2, 0, 0], 18);
  beam(group, 'mount-arm-lower', [0, .07, 0], [0, .48, .04], .027, frame);
  cylinder(group, 'mount-pivot-lower', .052, .024, trim, [0, .07, .04], [Math.PI / 2, 0, 0], 20);
  cylinder(group, 'mount-pivot-mid', .052, .024, trim, [0, .48, .08], [Math.PI / 2, 0, 0], 20);
  beam(group, 'mount-arm-upper', [0, .48, .04], [.02, .78, .10], .024, frame);
  cylinder(group, 'mount-pivot-upper', .047, .024, trim, [.02, .78, .12], [Math.PI / 2, 0, 0], 20);
  cradle(group, frame, trim, rubber, .84, .17);
  box(group, 'mount-anchor', [.06, .012, .06], trim, [0, .04, -.02]);
  return group;
}
function tripod(p) {
  const group = rootGroup(p), frame = mat(p.frameColor), trim = mat(p.trimColor, .33, .22), rubber = mat(p.rubberColor, .82, .02);
  cylinder(group, 'mount-anchor', .075, .06, trim, [0, .03, 0], [0, 0, 0], 20);
  box(group, 'mount-clearance', [.66, .012, .66], rubber, [0, .006, 0]);
  cylinder(group, 'mount-frame', .042, .72, frame, [0, .40, 0], [0, 0, 0], 20);
  cylinder(group, 'mount-pivot', .11, .10, trim, [0, .74, 0], [0, 0, 0], 20);
  beam(group, 'tripod-leg-left', [0, .68, 0], [-.30, .03, .20], .025, frame);
  beam(group, 'tripod-leg-right', [0, .68, 0], [.30, .03, .20], .025, frame);
  beam(group, 'tripod-leg-back', [0, .68, 0], [0, .03, -.30], .025, frame);
  for (const [name, position] of [['tripod-foot-left', [-.30, .025, .20]], ['tripod-foot-right', [.30, .025, .20]], ['tripod-foot-back', [0, .025, -.30]]]) rounded(group, name, [.08, .035, .10], rubber, position, .012);
  cradle(group, frame, trim, rubber, .86, .02);
  return group;
}
function wallArm(p) {
  const group = rootGroup(p), frame = mat(p.frameColor), trim = mat(p.trimColor, .33, .22), rubber = mat(p.rubberColor, .8, .02);
  box(group, 'mount-frame', [.34, .48, .045], frame, [0, .40, .018]);
  box(group, 'mount-clearance', [.26, .34, .012], rubber, [0, .40, .045]);
  for (const y of [.22, .58]) cylinder(group, `wall-bolt-${y}`, .022, .018, trim, [-.12, y, .052], [Math.PI / 2, 0, 0], 16);
  beam(group, 'mount-arm-lower', [0, .24, .06], [0, .24, .30], .03, frame);
  beam(group, 'mount-arm-upper', [0, .56, .06], [0, .56, .30], .03, frame);
  box(group, 'mount-boom', [.08, .36, .08], frame, [0, .40, .22]);
  cylinder(group, 'mount-pivot', .05, .022, trim, [0, .40, .29], [Math.PI / 2, 0, 0], 20);
  cradle(group, frame, trim, rubber, .40, .28);
  box(group, 'mount-anchor', [.08, .08, .018], trim, [0, .40, .057]);
  return group;
}
function model(p) { if (p.variant === 'desk-clamp') return deskClamp(p); if (p.variant === 'articulated-arm') return articulatedArm(p); if (p.variant === 'tripod') return tripod(p); return wallArm(p); }
function dispose(object) { const materials = new Set(); object.traverse(node => { node.geometry?.dispose(); if (node.material) for (const value of [node.material].flat()) materials.add(value); }); materials.forEach(value => value.dispose()); }
async function exportGlb(object) { try { return Buffer.from(await new GLTFExporter().parseAsync(object, {binary: true, animations: [], copyright: 'Project-authored camera-mount collection. No external art assets.'})); } finally { dispose(object); } }
function readHeader(bytes) { assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length); }
async function readback(bytes, p) {
  readHeader(bytes);
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  assert.equal(json.asset.version, '2.0'); assert(!json.animations?.length); assert(!json.images?.length); assert(json.buffers.every(item => item.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = loaded.scene; scene.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(scene), names = [], geometryHash = createHash('sha256'); let triangles = 0;
  scene.traverse(node => { if (!node.isMesh) return; names.push(node.name); const position = node.geometry.getAttribute('position'); assert(position?.count); triangles += (node.geometry.index?.count ?? position.count) / 3; geometryHash.update(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength)); for (let i = 0; i < position.count; i += 1) for (const value of [position.getX(i), position.getY(i), position.getZ(i)]) assert(Number.isFinite(value)); });
  for (const name of ['mount-frame', 'mount-clearance', 'camera-cradle', 'mount-trim', 'mount-rubber']) assert(scene.getObjectByName(name)?.isMesh, `${p.designId} missing ${name}`);
  assert(bounds.max.x - bounds.min.x <= .8 + .001, `${p.designId} exceeds width envelope`);
  assert(bounds.max.y - bounds.min.y <= 1.8 + .001 && bounds.min.y >= -.25 - .001, `${p.designId} exceeds height envelope ${bounds.min.toArray()} ${bounds.max.toArray()}`);
  assert(bounds.max.z - bounds.min.z <= .8 + .001 && bounds.min.z >= -.4 - .001 && bounds.max.z <= .4 + .001, `${p.designId} exceeds depth envelope`);
  return {meshCount: names.length, triangles, nodeNames: names, bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, geometrySha256: geometryHash.digest('hex')};
}
function installFor(p) { const install = installs[p.variant]; assert(install); return install; }
function sourceRecord(p, resource, probe, parameterHash, contractHash) { const install = installFor(p); return {id: p.designId, version: 1, type: 'camera-mount', displayName: p.label, productionBranch: 'camera-mount', mount: install.mount, parent: install.parent, resourcePath: `prototype/public/company-assets/camera-mount-v1/camera-mount/${p.designId}/v1/resource.json`, modelPath: `prototype/public/company-assets/camera-mount-v1/camera-mount/${p.designId}/v1/model.glb`, sourcePath: `${sourcePath}#designs.${p.designId}`, evidencePath: `evidence/company-camera-mount-v1/${p.designId}/report.json`, sha256: resource.asset.sha256, bytes: resource.asset.bytes, meshCount: probe.meshCount, triangles: probe.triangles, geometrySha256: probe.geometrySha256, contract: 'camera-mount@1', contractPath, contractSha256: contractHash, parametersSha256: parameterHash}; }
function makeResource(p, bytes, probe, parameterHash, contractHash) {
  const install = installFor(p);
  return {
    id: p.designId, displayName: p.label, version: 1, category: contract.category, mountRole: contract.mountRole, productionBranch: 'camera-mount', mount: install.mount, parent: install.parent,
    mounting: {...structuredClone(contract.mounting), designEnvelope: {width: .8, height: 1.8, depth: .8}}, coordinates: structuredClone(contract.coordinates), footprint: structuredClone(contract.footprint), usePoints: [],
    stateDefaults: structuredClone(contract.stateDefaults), stateSchema: structuredClone(contract.stateSchema), stateSemantics: structuredClone(contract.stateSemantics), saveRestore: structuredClone(contract.saveRestore), materialSlots: structuredClone(contract.materialSlots),
    mountDetails: {anchorNode: 'mount-anchor', cradleNode: 'camera-cradle', clearanceNode: 'mount-clearance', clearance: install.clearance},
    provenance: {license: source.license, tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'RoundedBoxGeometry', 'CylinderGeometry', 'GLTFExporter', 'GLTFLoader readback'], sourceParameters: sourcePath, sourceParametersSha256: hash(sourceBytes), functionalContractSource: contractPath, functionalContractSourceSha256: contractHash, environmentBranchSource: branchPath, environmentBranch: 'camera-mount', environmentBranchSourceSha256: hash(branchBytes), generator: generatorPath, generatorSha256: generatorHash, designId: p.designId, method: p.styleDirection},
    asset: {format: 'glb', url: `/company-assets/camera-mount-v1/camera-mount/${p.designId}/v1/model.glb`, sha256: hash(bytes), bytes: bytes.length},
    checks: {meshCount: probe.meshCount, triangles: probe.triangles, nodeNames: probe.nodeNames, localBounds: probe.bounds, geometrySha256: probe.geometrySha256, repeatedExportByteIdentical: true, gltfReadback: true}
  };
}
async function emit(url, bytes, check) { if (check) assert((await fs.readFile(url)).equals(bytes), `Output differs ${url.pathname}`); else { await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes); } }

const checkMode = process.argv.includes('--check');
const records = [];
for (const p of source.designs) {
  const bytes = await exportGlb(model(p)); const repeat = await exportGlb(model(p)); assert(bytes.equals(repeat), `${p.designId} export is not deterministic`);
  const probe = await readback(bytes, p); const install = installFor(p);
  const parameter = Buffer.from(JSON.stringify({...p, type: 'camera-mount', mount: install.mount, parent: install.parent, productionPrompt: `为公司场景制作 ${p.label}（designId=${p.designId}）。保持 camera-mount 的父级、夹持/支撑包络与相机承载节点契约，导出可回读静态 GLB。`}, null, 2) + '\n');
  const parameterHash = hash(parameter), contractHash = hash(contractBytes), resource = makeResource(p, bytes, probe, parameterHash, contractHash);
  for (const nodes of Object.values(resource.materialSlots)) for (const node of nodes) assert(probe.nodeNames.includes(node), `${p.designId} material slot node missing: ${node}`);
  const base = `prototype/public/company-assets/camera-mount-v1/camera-mount/${p.designId}/v1/`, sourceDir = `assets-source/company-camera-mount-v1/camera-mount/${p.designId}/`, evidenceDir = `evidence/company-camera-mount-v1/${p.designId}/`;
  const report = {status: 'passed', designId: p.designId, type: 'camera-mount', displayName: p.label, styleDirection: p.styleDirection, sourceParameters: `${sourceDir}parameters.json`, sourceParametersSha256: parameterHash, functionalContract: {id: 'camera-mount@1', source: contractPath, sha256: contractHash, productionBranch: 'camera-mount', mount: install.mount, parent: install.parent, mounting: resource.mounting, saveRestore: resource.saveRestore}, asset: resource.asset, checks: resource.checks, repeatedExportByteIdentical: true, limitations: ['CPU GLB export and GLTFLoader readback only.', 'Browser parent-transform mounting, clearance collision checks and save/restore await parent integration.', 'Project-authored solid-color geometry remains a technical appearance sample pending visual acceptance.']};
  await emit(new URL(base + 'model.glb', root), bytes, checkMode); await emit(new URL(base + 'resource.json', root), Buffer.from(JSON.stringify(resource, null, 2) + '\n'), checkMode); await emit(new URL(sourceDir + 'parameters.json', root), parameter, checkMode); await emit(new URL(evidenceDir + 'report.json', root), Buffer.from(JSON.stringify(report, null, 2) + '\n'), checkMode);
  records.push(sourceRecord(p, resource, probe, parameterHash, contractHash));
}
assert.equal(new Set(records.map(record => record.geometrySha256)).size, 4, 'camera mount designs must have distinct geometry');
const collection = {schemaVersion: 1, id: 'company-camera-mount-v1', generatedAt: '2026-11-18', generator: generatorPath, generatorSha256: generatorHash, sourceParameters: sourcePath, sourceParametersSha256: hash(sourceBytes), environmentBranchSource: branchPath, environmentBranchSourceSha256: hash(branchBytes), contract: contractPath, contractSha256: hash(contractBytes), resources: records, verification: {cpuOnly: true, glbReadback: true, repeatedExportsByteIdentical: true, parentAndMountRegistered: true, browserRuntimeIntegration: 'pending parent integration', saveRestore: 'contracted but pending parent integration'}};
const collectionBytes = Buffer.from(JSON.stringify(collection, null, 2) + '\n'); await emit(new URL('assets-source/company-camera-mount-v1/collection.json', root), collectionBytes, checkMode); await emit(new URL('evidence/company-camera-mount-v1/collection.json', root), collectionBytes, checkMode);
console.log(JSON.stringify({status: 'passed', mode: checkMode ? 'check' : 'build', resources: records.map(record => ({id: record.id, mount: record.mount, parent: record.parent, sha256: record.sha256, bytes: record.bytes, meshCount: record.meshCount, triangles: record.triangles, geometrySha256: record.geometrySha256}))}));
