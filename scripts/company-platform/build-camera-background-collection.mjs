import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({target: this}); }).catch(error => this.onerror?.(error)); } };
const root = new URL('../../', import.meta.url);
const sourcePath = 'assets-source/company-camera-background-v1/parameters.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const cameraContractPath = 'assets-source/company-camera-background-v1/contracts/camera-static.json';
const backgroundContractPath = 'assets-source/company-camera-background-v1/contracts/background-panel.json';
const generatorPath = 'scripts/company-platform/build-camera-background-collection.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const branchBytes = await fs.readFile(new URL(branchPath, root));
const branchTable = JSON.parse(branchBytes);
const cameraContractBytes = await fs.readFile(new URL(cameraContractPath, root));
const backgroundContractBytes = await fs.readFile(new URL(backgroundContractPath, root));
const cameraContract = JSON.parse(cameraContractBytes);
const backgroundContract = JSON.parse(backgroundContractBytes);
const generatorHash = hash(await fs.readFile(new URL(generatorPath, root)));
const branchHash = hash(branchBytes);

assert.equal(source.schemaVersion, 1);
assert.equal(source.cameras.length, 4);
assert.equal(source.backgrounds.length, 4);
assert.deepEqual(cameraContract.mounting, {width: .18, height: .12, depth: .12, origin: 'desk support plane centre'});
assert.deepEqual(backgroundContract.mounting, {width: 2.4, height: 2.2, depth: .08, origin: 'bottom'});
const cameraBranch = branchTable.groups.find(group => group.id === 'camera-background')?.branches.find(branch => branch.id === 'camera-static');
const backgroundBranch = branchTable.groups.find(group => group.id === 'camera-background')?.branches.find(branch => branch.id === 'background-panel');
assert(cameraBranch && backgroundBranch, 'camera/background branches must exist');
assert.equal(cameraBranch.fixedFunctionAndInstall.mount, cameraContract.mount);
assert.equal(backgroundBranch.fixedFunctionAndInstall.mount, backgroundContract.mount);

function material(color, roughness = .5, metalness = .08) { return new THREE.MeshStandardMaterial({color, roughness, metalness}); }
function mesh(parent, name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) { const value = new THREE.Mesh(geometry, mat); value.name = name; value.position.fromArray(position); value.rotation.fromArray(rotation); value.castShadow = true; value.receiveShadow = true; parent.add(value); return value; }
function box(parent, name, size, mat, position, rotation = [0, 0, 0]) { return mesh(parent, name, new THREE.BoxGeometry(...size), mat, position, rotation); }
function rounded(parent, name, size, mat, position, radius = .012, rotation = [0, 0, 0]) { return mesh(parent, name, new RoundedBoxGeometry(...size, 4, radius), mat, position, rotation); }
function cylinder(parent, name, radius, height, mat, position, rotation = [0, 0, 0], radial = 20) { return mesh(parent, name, new THREE.CylinderGeometry(radius, radius, height, radial), mat, position, rotation); }
function torus(parent, name, radius, tube, mat, position, rotation = [0, 0, 0]) { return mesh(parent, name, new THREE.TorusGeometry(radius, tube, 10, 24), mat, position, rotation); }
function dispose(object) { const materials = new Set(); object.traverse(node => { node.geometry?.dispose(); if (node.material) for (const value of [node.material].flat()) materials.add(value); }); materials.forEach(value => value.dispose()); }
function rootGroup(name, kind) { const group = new THREE.Group(); group.name = name; group.userData = {units: 'metres', up: '+Y', forward: '+Z', kind}; return group; }

function cameraModel(p) {
  const rootObject = rootGroup(p.designId, 'camera-static');
  const bodyMat = material(p.frameColor, .42), trimMat = material(p.trimColor, .3, .22), lensMat = material(p.lensColor, .18, .5), ledMat = material(p.ledOn, .25, .05); ledMat.emissive.set(p.ledOn); ledMat.emissiveIntensity = 1.4;
  if (p.body === 'orbit') {
    rounded(rootObject, 'camera-body', [.16, .07, .085], bodyMat, [0, .035, 0], .018);
    torus(rootObject, 'camera-optic-ring', .025, .008, trimMat, [0, .037, .049]);
    cylinder(rootObject, 'camera-lens', .017, .012, lensMat, [0, .037, .052], [Math.PI / 2, 0, 0], 20);
    box(rootObject, 'camera-foot', [.13, .012, .08], trimMat, [0, .006, -.004]);
  } else if (p.body === 'bar') {
    rounded(rootObject, 'camera-body', [.17, .055, .07], bodyMat, [0, .0275, 0], .012);
    box(rootObject, 'camera-front-plate', [.10, .04, .008], trimMat, [0, .03, .039]);
    cylinder(rootObject, 'camera-lens', .015, .012, lensMat, [0, .03, .046], [Math.PI / 2, 0, 0], 20);
    for (const x of [-.067, .067]) cylinder(rootObject, `camera-end-${x < 0 ? 'left' : 'right'}`, .009, .012, trimMat, [x, .0275, .039], [Math.PI / 2, 0, 0], 12);
  } else if (p.body === 'cube') {
    box(rootObject, 'camera-body', [.15, .09, .10], bodyMat, [0, .045, 0]);
    rounded(rootObject, 'camera-front-plate', [.11, .06, .012], trimMat, [0, .047, .046], .008);
    cylinder(rootObject, 'camera-lens', .017, .014, lensMat, [0, .047, .053], [Math.PI / 2, 0, 0], 20);
    box(rootObject, 'camera-heel', [.08, .014, .09], trimMat, [0, .007, -.005]);
  } else {
    rounded(rootObject, 'camera-body', [.15, .07, .09], bodyMat, [0, .035, 0], .032);
    cylinder(rootObject, 'camera-lens', .018, .016, lensMat, [0, .035, .049], [Math.PI / 2, 0, 0], 20);
    torus(rootObject, 'camera-optic-ring', .024, .006, trimMat, [0, .035, .053]);
    box(rootObject, 'camera-foot', [.12, .012, .08], trimMat, [0, .006, -.004]);
  }
  box(rootObject, 'recording-led', [.012, .008, .006], ledMat, [.052, .067, .046]);
  rootObject.updateMatrixWorld(true);
  return rootObject;
}

function backgroundModel(p) {
  const rootObject = rootGroup(p.designId, 'background-panel');
  const panelMat = material(p.panelColor, .72), accentMat = material(p.accentColor, .42, .08), edgeMat = material(p.edgeColor, .4, .12);
  box(rootObject, 'background-surface', [2.4, 2.2, .06], panelMat, [0, 1.1, 0]);
  box(rootObject, 'background-edge', [2.4, .04, .08], edgeMat, [0, 2.18, 0]);
  if (p.style === 'brand') {
    box(rootObject, 'background-accent', [1.8, .22, .018], accentMat, [0, 1.52, .031]);
    box(rootObject, 'background-content', [1.24, .48, .012], accentMat, [0, 1.08, .031]);
    box(rootObject, 'background-brand-plinth', [1.64, .06, .08], edgeMat, [0, .08, 0]);
  } else if (p.style === 'slat') {
    box(rootObject, 'background-content', [1.92, 1.78, .012], accentMat, [0, 1.12, .031]);
    for (let index = 0; index < 9; index += 1) { const x = -.92 + index * .23; box(rootObject, index === 0 ? 'background-accent' : `background-accent-slat-${index}`, [.035, 1.92, .018], edgeMat, [x, 1.1, .03]); }
    box(rootObject, 'background-slat-rail', [2.12, .05, .08], edgeMat, [0, .14, 0]);
  } else if (p.style === 'grid') {
    box(rootObject, 'background-content', [1.96, 1.76, .012], accentMat, [0, 1.1, .031]);
    for (const y of [.42, .86, 1.30, 1.74]) box(rootObject, y === .42 ? 'background-accent' : `background-grid-h-${y}`, [1.94, .018, .018], edgeMat, [0, y, .03]);
    for (const x of [-.78, -.39, 0, .39, .78]) box(rootObject, `background-grid-v-${x}`, [.018, 1.76, .018], edgeMat, [x, 1.1, .03]);
  } else {
    box(rootObject, 'background-content', [1.96, 1.76, .012], accentMat, [0, 1.1, .031]);
    for (const y of [.34, .68, 1.02, 1.36, 1.70]) box(rootObject, y === .34 ? 'background-accent' : `background-soft-step-${y}`, [1.86 - Math.abs(1.1 - y) * .12, .045, .02], edgeMat, [0, y, .03]);
    box(rootObject, 'background-soft-valance', [2.08, .11, .08], edgeMat, [0, 2.04, .0]);
  }
  rootObject.updateMatrixWorld(true);
  return rootObject;
}

function readHeader(bytes) { assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length); }
async function exportGlb(object) { try { return Buffer.from(await new GLTFExporter().parseAsync(object, {binary: true, animations: [], copyright: 'Project-authored camera/background collection. No external art assets.'})); } finally { dispose(object); } }
async function readback(bytes, kind, expected) {
  readHeader(bytes);
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  assert.equal(json.asset.version, '2.0'); assert(!json.animations?.length); assert(!json.images?.length); assert(json.buffers.every(item => item.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); const scene = loaded.scene; scene.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(scene); const names = []; let triangles = 0; const geometryHash = createHash('sha256');
  scene.traverse(node => { if (!node.isMesh) return; names.push(node.name); const position = node.geometry.getAttribute('position'); assert(position?.count); triangles += (node.geometry.index?.count ?? position.count) / 3; geometryHash.update(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength)); for (let i = 0; i < position.count; i += 1) for (const value of [position.getX(i), position.getY(i), position.getZ(i)]) assert(Number.isFinite(value)); });
  for (const name of expected) assert(scene.getObjectByName(name)?.isMesh, `${kind} missing ${name}`);
  assert(bounds.min.y >= -1e-6, `${kind} must rest on support plane`);
  if (kind === 'camera-static') { assert(bounds.max.x <= .09 + .001 && bounds.min.x >= -.09 - .001); assert(bounds.max.z <= .06 + .001 && bounds.min.z >= -.06 - .001); assert(bounds.max.y <= .12 + .001); }
  else { assert(bounds.max.x <= 1.2 + .001 && bounds.min.x >= -1.2 - .001); assert(bounds.max.z <= .04 + .001 && bounds.min.z >= -.04 - .001); assert(bounds.max.y <= 2.2 + .001); }
  return {meshCount: names.length, triangles, nodeNames: names, bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, geometrySha256: geometryHash.digest('hex'), externalUris: json.buffers.filter(item => item.uri).length, animations: json.animations?.length ?? 0};
}
function sourceRecord(p, kind, resource, bytes, probe, parameterHash, contractHash) {
  const contractPath = kind === 'camera-static' ? cameraContractPath : backgroundContractPath;
  return {id: p.designId, version: 1, type: kind, displayName: p.label, productionBranch: kind === 'camera-static' ? 'camera-device' : 'background-display', mount: kind === 'camera-static' ? cameraContract.mount : backgroundContract.mount, resourcePath: `prototype/public/company-assets/camera-background-v1/${kind}/${p.designId}/v1/resource.json`, modelPath: `prototype/public/company-assets/camera-background-v1/${kind}/${p.designId}/v1/model.glb`, sourcePath: `${sourcePath}#${kind === 'camera-static' ? 'cameras' : 'backgrounds'}.${p.designId}`, evidencePath: `evidence/company-camera-background-v1/${kind}/${p.designId}/report.json`, sha256: resource.asset.sha256, bytes: resource.asset.bytes, meshCount: probe.meshCount, triangles: probe.triangles, geometrySha256: probe.geometrySha256, contract: `${kind}@1`, contractPath, contractSha256: contractHash, parametersSha256: parameterHash};
}
function makeResource(p, kind, bytes, parameterHash, contractHash, probe) {
  const contract = kind === 'camera-static' ? cameraContract : backgroundContract;
  const productionBranch = kind === 'camera-static' ? 'camera-device' : 'background-display';
  const resource = {id: p.designId, displayName: p.label, version: 1, category: contract.category, mountRole: contract.mountRole, productionBranch, mount: contract.mount, mounting: structuredClone(contract.mounting), coordinates: structuredClone(contract.coordinates), footprint: structuredClone(contract.footprint), usePoints: [], stateDefaults: structuredClone(contract.stateDefaults), stateSchema: structuredClone(contract.stateSchema), stateSemantics: structuredClone(contract.stateSemantics), materialSlots: structuredClone(contract.materialSlots), provenance: {license: source.license, tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'RoundedBoxGeometry', 'CylinderGeometry', 'TorusGeometry', 'GLTFExporter', 'GLTFLoader readback'], sourceParameters: sourcePath, sourceParametersSha256: parameterHash, functionalContractSource: kind === 'camera-static' ? cameraContractPath : backgroundContractPath, functionalContractSourceSha256: contractHash, environmentBranchSource: branchPath, environmentBranch: productionBranch, environmentBranchSourceSha256: branchHash, generator: generatorPath, generatorSha256: generatorHash, designId: p.designId, method: p.styleDirection}, asset: {format: 'glb', url: `/company-assets/camera-background-v1/${kind}/${p.designId}/v1/model.glb`, sha256: hash(bytes), bytes: bytes.length}, checks: {meshCount: probe.meshCount, triangles: probe.triangles, nodeNames: probe.nodeNames, localBounds: probe.bounds, geometrySha256: probe.geometrySha256, repeatedExportByteIdentical: true, gltfReadback: true}};
  if (kind === 'camera-static') Object.assign(resource, {camera: {lensNode: 'camera-lens', statusNode: 'recording-led', forward: '+Z'}, display: {status: {stateField: 'recording', nodes: ['recording-led'], onColor: p.ledOn, offColor: p.ledOff, emissive: p.ledOn, onIntensity: 1.4}}});
  else Object.assign(resource, {background: {surfaceNode: 'background-surface', contentSlot: 'background-content', front: '+Z'}, display: {content: {stateField: 'visible', nodes: ['background-content'], accentColor: p.accentColor}}});
  return resource;
}
async function emit(url, expected, check) { if (check) assert((await fs.readFile(url)).equals(expected), `Output differs ${url.pathname}`); else { await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, expected); } }

const checkMode = process.argv.includes('--check');
const records = [];
const all = [...source.cameras.map(p => ({...p, kind: 'camera-static'})), ...source.backgrounds.map(p => ({...p, kind: 'background-panel'}))];
for (const p of all) {
  const object = p.kind === 'camera-static' ? cameraModel(p) : backgroundModel(p); const bytes = await exportGlb(object);
  const repeatObject = p.kind === 'camera-static' ? cameraModel(p) : backgroundModel(p); const repeat = await exportGlb(repeatObject); assert(bytes.equals(repeat), `${p.designId} export is not deterministic`);
  const expected = p.kind === 'camera-static' ? ['camera-body', 'camera-lens', 'recording-led'] : ['background-surface', 'background-edge', 'background-content']; const probe = await readback(bytes, p.kind, expected);
  const parameter = Buffer.from(JSON.stringify({...p, type: p.kind, productionPrompt: `为公司场景制作 ${p.label}（designId=${p.designId}）。保持 ${p.kind} 的安装、包络、状态和坐标契约，采用独立构件与材质，导出可回读 GLB。`}, null, 2) + '\n');
  const parameterHash = hash(parameter); const contractBytes = p.kind === 'camera-static' ? cameraContractBytes : backgroundContractBytes; const contractHash = hash(contractBytes); const resource = makeResource(p, p.kind, bytes, hash(sourceBytes), contractHash, probe);
  for (const nodes of Object.values(resource.materialSlots)) for (const node of nodes) assert(probe.nodeNames.includes(node), `${p.designId} material slot node missing: ${node}`);
  const base = `prototype/public/company-assets/camera-background-v1/${p.kind}/${p.designId}/v1/`; const sourceDir = `assets-source/company-camera-background-v1/${p.kind}/${p.designId}/`; const evidenceDir = `evidence/company-camera-background-v1/${p.kind}/${p.designId}/`;
  const report = {status: 'passed', designId: p.designId, type: p.kind, displayName: p.label, styleDirection: p.styleDirection, sourceParameters: `${sourceDir}parameters.json`, sourceParametersSha256: parameterHash, functionalContract: {id: `${p.kind}@1`, source: p.kind === 'camera-static' ? cameraContractPath : backgroundContractPath, sha256: contractHash, productionBranch: p.kind, mount: resource.mount, mounting: resource.mounting, stateDefaults: resource.stateDefaults}, asset: resource.asset, checks: resource.checks, repeatedExportByteIdentical: true, limitations: ['CPU GLB export and GLTFLoader readback only.', 'Browser runtime mounting, device status consumption, and save/restore await parent integration.', 'Project-authored solid-color geometry remains a technical appearance sample pending visual acceptance.']};
  await emit(new URL(base + 'model.glb', root), bytes, checkMode); await emit(new URL(base + 'resource.json', root), Buffer.from(JSON.stringify(resource, null, 2) + '\n'), checkMode); await emit(new URL(sourceDir + 'parameters.json', root), parameter, checkMode); await emit(new URL(evidenceDir + 'report.json', root), Buffer.from(JSON.stringify(report, null, 2) + '\n'), checkMode); records.push(sourceRecord(p, p.kind, resource, bytes, probe, hash(parameter), contractHash));
}
for (const kind of ['camera-static', 'background-panel']) { const list = records.filter(record => record.type === kind); assert.equal(list.length, 4); assert.equal(new Set(list.map(record => record.geometrySha256)).size, 4, `${kind} designs must have distinct geometry`); }
const collection = {schemaVersion: 1, id: 'company-camera-background-v1', generatedAt: '2026-11-17', generator: generatorPath, generatorSha256: generatorHash, sourceParameters: sourcePath, sourceParametersSha256: hash(sourceBytes), environmentBranchSource: branchPath, environmentBranchSourceSha256: branchHash, contracts: {cameraStatic: cameraContractPath, backgroundPanel: backgroundContractPath}, resources: records, verification: {cpuOnly: true, glbReadback: true, repeatedExportsByteIdentical: true, sourceAndContractRegistered: true, browserRuntimeIntegration: 'pending parent integration'}};
const collectionBytes = Buffer.from(JSON.stringify(collection, null, 2) + '\n'); await emit(new URL('assets-source/company-camera-background-v1/collection.json', root), collectionBytes, checkMode); await emit(new URL('evidence/company-camera-background-v1/collection.json', root), collectionBytes, checkMode);
const summary = {status: 'passed', mode: checkMode ? 'check' : 'build', resources: records.map(record => ({id: record.id, type: record.type, productionBranch: record.type, mount: record.type === 'camera-static' ? cameraContract.mount : backgroundContract.mount, sha256: record.sha256, bytes: record.bytes, meshCount: record.meshCount, triangles: record.triangles}))}; console.log(JSON.stringify(summary));






