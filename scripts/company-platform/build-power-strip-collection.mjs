import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateCablePortGeometry} from '../../prototype/src/company/cable-port-geometry.js';
import {designs} from '../../assets-source/company-power-strip-v1/designs.mjs';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({target: this}); }).catch(error => this.onerror?.(error)); } };
const root = new URL('../../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = 'assets-source/company-power-strip-v1/parameters.json';
const generatorPath = 'scripts/company-platform/build-power-strip-collection.mjs';
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const parameterHash = hash(sourceBytes);
const generatorSha256 = hash(await fs.readFile(new URL(generatorPath, root)));
const environmentBranchSource = 'assets-source/company-environment-specs-v1/branches.json';
const environmentBranchBytes = await fs.readFile(new URL(environmentBranchSource, root));
const environmentBranchSourceSha256 = hash(environmentBranchBytes);
const environmentBranchDocument = JSON.parse(environmentBranchBytes);
const findBranch = value => Array.isArray(value) ? value.find(findBranch) : value && typeof value === 'object' ? (value.id === 'power-strip' ? value : Object.values(value).map(findBranch).find(Boolean)) : undefined;
assert(findBranch(environmentBranchDocument), 'power-strip branch is missing from the environment specification');
const target = source.target;
assert.deepEqual(target.portIds, ['usb-1', 'usb-2', 'usb-3', 'usb-4']);
assert.equal(target.portConnector, 'usb-c-visual-v1');
assert.deepEqual(target.portDirections, [[0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, 1]]);
const checkMode = process.argv.includes('--check');
const only = process.argv.find(value => value.startsWith('--only='))?.slice('--only='.length);
const fail = (code, location, message, details = {}) => { const error = new Error(`${code} at ${location}: ${message}`); error.code = code; error.path = location; error.details = details; throw error; };
const toArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

function material(name, color, emissive = '#000000') {
  const result = new THREE.MeshStandardMaterial({color, roughness: .52, metalness: .18});
  result.name = name;
  if (emissive !== '#000000') { result.emissive.set(emissive); result.emissiveIntensity = 1.1; }
  return result;
}
function box(parent, name, size, position, materialValue) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materialValue);
  mesh.name = name; mesh.position.fromArray(position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, name, radius, height, position, materialValue) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), materialValue);
  mesh.name = name; mesh.position.fromArray(position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function portFrame(parent, port, bodyMaterial) {
  const [x, y, z] = port.position;
  const outerWidth = .018, outerHeight = .012, depth = .002, bar = .003;
  const side = (outerWidth - .012) / 2;
  const sideOffset = (outerWidth + .012) / 4;
  const verticalOffset = (outerHeight + .006) / 4;
  const frame = [
    box(parent, `${port.id}-frame-left`, [side, outerHeight, depth], [x - sideOffset, y, z - port.direction[2] * depth / 2], bodyMaterial.clone()),
    box(parent, `${port.id}-frame-right`, [side, outerHeight, depth], [x + sideOffset, y, z - port.direction[2] * depth / 2], bodyMaterial.clone()),
    box(parent, `${port.id}-frame-top`, [.012, bar, depth], [x, y + verticalOffset, z - port.direction[2] * depth / 2], bodyMaterial.clone()),
    box(parent, `${port.id}-frame-bottom`, [.012, bar, depth], [x, y - verticalOffset, z - port.direction[2] * depth / 2], bodyMaterial.clone()),
  ];
  frame.forEach(mesh => { mesh.userData.cablePortRole = 'frame'; mesh.userData.cablePortId = port.id; });
  return frame;
}
function makeScene(design) {
  const scene = new THREE.Scene(), rootNode = new THREE.Group(); rootNode.name = design.id; scene.add(rootNode);
  const bodyMaterial = material('strip-body', '#26333c');
  const accentMaterial = material('strip-accent', design.accent);
  const ledMaterial = material('status-led', '#273c35', '#63e6a5');
  box(rootNode, 'strip-body', [.35, .04, .06], [0, .02, 0], bodyMaterial);
  if (design.style === 'desk') {
    for (const x of [-.12, -.04, .04, .12]) cylinder(rootNode, `desk-socket-${x}`, .007, .002, [x, .038, .004], accentMaterial.clone());
    box(rootNode, 'desk-rail', [.28, .004, .012], [0, .038, -.018], accentMaterial.clone());
  } else if (design.style === 'underdesk') {
    box(rootNode, 'underdesk-rail', [.3, .004, .014], [0, .038, .012], accentMaterial.clone());
    box(rootNode, 'underdesk-bracket-left', [.018, .006, .036], [-.145, .037, .01], accentMaterial.clone());
    box(rootNode, 'underdesk-bracket-right', [.018, .006, .036], [.145, .037, .01], accentMaterial.clone());
  } else if (design.style === 'tower') {
    for (const x of [-.12, -.04, .04, .12]) box(rootNode, `tower-fin-${x}`, [.014, .004, .034], [x, .038, .006], accentMaterial.clone());
    box(rootNode, 'tower-spine', [.022, .004, .034], [0, .038, .012], accentMaterial.clone());
  } else {
    box(rootNode, 'usb-rail', [.22, .004, .014], [0, .038, .008], accentMaterial.clone());
    for (const x of [-.12, -.04, .04, .12]) box(rootNode, `usb-key-${x}`, [.02, .003, .012], [x, .038, -.01], accentMaterial.clone());
  }
  box(rootNode, 'status-led', [.025, .002, .008], [0, .038, -.022], ledMaterial);
  const cablePorts = [], cablePortNodes = {};
  for (const [index, x] of [-.12, -.04, .04, .12].entries()) {
    const id = target.portIds[index];
    const port = {id, connector: target.portConnector, position: [x, target.portY, target.portZs[index]], direction: [...target.portDirections[index]]};
    cablePorts.push(port);
    const frame = portFrame(rootNode, port, bodyMaterial);
    cablePortNodes[id] = {frame: frame.map(mesh => mesh.name), backing: 'strip-body'};
  }
  scene.updateMatrixWorld(true);
  return {scene, cablePorts, cablePortNodes};
}
function dispose(scene) {
  const geometries = new Set(), materials = new Set();
  scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const value of [node.material].flat().filter(Boolean)) materials.add(value); });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
}
function resourceFor(design, bytes, ports, nodes) {
  return {
    id: `power-strip-${design.id.replace('power-strip-', '')}`, displayName: design.label, version: 1,
    category: 'dynamic', mountRole: 'power-strip', productionBranch: 'power-strip', mount: 'desk-surface',
    mounting: {width: target.width, height: target.height, depth: target.depth, origin: 'bottom'},
    coordinates: {units: 'metres', up: '+Y', forward: '+Z', origin: 'Desk contact centre; visual power ports face -Z', scale: 'Identity only'},
    footprint: {center: [0, 0], halfSize: [.175, .03], blocking: false}, usePoints: [],
    stateDefaults: {on: false}, stateSchema: {on: {type: 'boolean'}}, stateSemantics: {on: 'power-strip-power-display'},
    materialSlots: {body: ['strip-body'], accent: ['strip-accent'], display: ['status-led']}, cablePorts: ports, cablePortNodes: nodes,
    provenance: {license: 'Project-authored procedural geometry. No external art assets.', tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'CylinderGeometry', 'GLTFExporter', 'GLTFLoader readback', 'CPU cable-port geometry checks'], sourceParameters: sourcePath, sourceParametersSha256: parameterHash, generator: generatorPath, generatorSha256, environmentBranchSource, environmentBranch: 'power-strip', environmentBranchSourceSha256, designId: design.id, method: `four-port procedural ${design.style} power strip`},
    asset: {format: 'glb', url: `/company-assets/power-strip-v1/${design.id}/v1/model.glb`, sha256: hash(bytes), bytes: bytes.length},
    display: {status: {stateField: 'on', nodes: ['status-led'], onColor: '#63e6a5', offColor: '#273c35', emissive: '#63e6a5', onIntensity: 1.2}},
  };
}
async function exportScene(scene) { try { return Buffer.from(await new GLTFExporter().parseAsync(scene, {binary: true, animations: [], copyright: 'Project-authored visual power strip. No electrical simulation.'})); } finally { dispose(scene); } }
async function emit(url, value) { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); if (checkMode) assert((await fs.readFile(url)).equals(bytes), `Output differs ${url.pathname}`); else { await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes); } }

const selected = source.sourceAssets.filter(design => !only || design.id === only); if (only) assert.equal(selected.length, 1, `Unknown --only=${only}`);
const results = [];
for (const raw of selected) {
  const design = designs.find(value => value.id === raw.id) || raw;
  const built = makeScene(design), bytes = await exportScene(built.scene);
  const resource = resourceFor(design, bytes, built.cablePorts, built.cablePortNodes);
  const repeatBuilt = makeScene(design), repeat = await exportScene(repeatBuilt.scene); assert(bytes.equals(repeat), `${design.id} export is not deterministic`);
  const readback = await new GLTFLoader().parseAsync(toArrayBuffer(bytes)); readback.scene.updateMatrixWorld(true);
  const portCheck = validateCablePortGeometry(readback.scene, resource, fail, `${design.id}.resource`);
  const bounds = new THREE.Box3().setFromObject(readback.scene); if (!(bounds.min.x >= -target.width / 2 - .007 && bounds.max.x <= target.width / 2 + .007 && bounds.min.y >= -.001 && bounds.max.y <= target.height + .004 && bounds.min.z >= -target.depth / 2 - .007 && bounds.max.z <= target.depth / 2 + .007)) fail('power-strip-bounds', design.id, 'Resource exceeds the declared envelope', {min: bounds.min.toArray(), max: bounds.max.toArray()});
  let triangles = 0, meshes = 0; readback.scene.traverse(node => { if (!node.isMesh) return; meshes++; const position = node.geometry?.getAttribute?.('position'); assert(position?.count); triangles += node.geometry.index ? node.geometry.index.count / 3 : position.count / 3; });
  const record = {id: resource.id, designId: design.id, label: design.label, sha256: hash(bytes), bytes: bytes.length, meshes, triangles, bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, portCheck, repeatByteIdentical: true}; dispose(readback.scene); results.push({design, resource, bytes, record});
}
const collection = {schemaVersion: 1, id: source.id, generator: generatorPath, generatorSha256, sourceParameters: sourcePath, sourceParametersSha256: parameterHash, resources: results.map(({resource, design, record}) => ({id: resource.id, version: 1, resourcePath: `prototype/public/company-assets/power-strip-v1/${design.id}/v1/resource.json`, modelPath: `prototype/public/company-assets/power-strip-v1/${design.id}/v1/model.glb`, sha256: record.sha256})), verification: {cpuOnly: true, gltfLoaderReadback: true, repeatedExportByteIdentical: true, cablePortGeometry: 'four real frame mappings and backing rays'}, limitations: source.limitations};
await emit(new URL('assets-source/company-power-strip-v1/collection.json', root), JSON.stringify(collection, null, 2) + '\n');
await emit(new URL('evidence/company-power-strip-v1/report.json', root), JSON.stringify({status: 'source-export-readback-passed', branch: 'power-strip', results: results.map(value => value.record), limits: source.limitations}, null, 2) + '\n');
for (const {design, resource, bytes} of results) { const folder = new URL(`prototype/public/company-assets/power-strip-v1/${design.id}/v1/`, root); await emit(new URL('model.glb', folder), bytes); await emit(new URL('resource.json', folder), JSON.stringify(resource, null, 2) + '\n'); }
console.log(JSON.stringify({status: 'passed', mode: checkMode ? 'check' : 'build', resources: results.map(value => value.record)}));
