import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createMakeupStorage} from './build-makeup-storage.mjs';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-makeup-drawer-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-MAKEUP-DRAWER-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-makeup-drawer.mjs';
export const VERIFIER_PATH = 'prototype/src/company/makeup-drawer-geometry.js';
export const IDS = ['tray', 'divided', 'brush-cup', 'case'];
const OUTPUT_PATH = 'prototype/public/company-assets/makeup-drawer-v1';
const EVIDENCE_PATH = 'evidence/company-makeup-drawer-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const MOVING_NAMES = ['drawer-front', 'drawer-handle', 'drawer-bottom', 'drawer-left', 'drawer-right', 'drawer-back'];
const UPPER_PREFIXES = ['storage-upper-', 'storage-divider-', 'storage-cup-', 'storage-case-handle-'];
const HOST_PARTS = [{id: 'drawer', stateField: 'openFraction', kind: 'slide', axis: 'z', pivot: [0, 0, 0], translationRange: [0, .32], bounds: {min: [-.42, .43, -.205], max: [.42, .77, .275]}}];
const HOST_SURFACES = [{id: 'top', center: [0, 0], topY: .78, halfSize: [.4, .18], clearanceHeight: .4}, {id: 'drawer', center: [0, .03125], topY: .455, halfSize: [.345, .18625], clearanceHeight: .25}];
const PAYLOAD_SURFACES = [{id: 'top', center: [0, -.045], topY: .01, halfSize: [.115, .055], clearanceHeight: .14}];

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-makeup-drawer-v1'); assert.equal(source.version, 1);
  assert.deepEqual(source.designs.map(design => design.id), IDS);
  assert.deepEqual(source.common.coordinates, {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only'});
  assert.deepEqual(source.host.envelope, {width: .9, height: .78, depth: .55});
  assert.equal(source.host.sourceResource.id, 'sliding-drawer-flat-panel'); assert.equal(source.host.sourceResource.version, 1);
  assert.equal(source.host.movingTranslationY, -.35); assert.deepEqual(source.host.movingNames, MOVING_NAMES);
  assert.deepEqual(source.host.fixedBoxes, hostBoxDefinitions());
  assert.deepEqual(source.host.movingParts, HOST_PARTS); assert.deepEqual(source.host.supportSurfaces, HOST_SURFACES);
  assert.deepEqual(source.payload.envelope, {width: .45, height: .18, depth: .25});
  assert.equal(source.payload.translationY, -.09); assert.deepEqual(source.payload.retainedPrefixes, UPPER_PREFIXES);
  assert.deepEqual(source.payload.supportSurfaces, PAYLOAD_SURFACES);
  assert(source.common.promptStandard.length > 200 && source.license.includes('Project-authored'));
  for (const design of source.designs) {
    assert.equal(design.sourceDesign, design.id); assert(design.label && design.prompt && design.limitations.length);
    if (design.id === 'tray') assert(Number.isFinite(design.rimHeight) && design.rimHeight >= .13 && design.rimHeight <= .15);
    else assert.equal(design.rimHeight, undefined);
  }
  assert.equal(source.sourceModification.beforeRimHeight, .145);
}

export function hostBoxDefinitions() {
  return [
    {name: 'cabinet-top', min: [-.45, .745, -.225], max: [.45, .78, .225], material: 'body'},
    {name: 'cabinet-bottom', min: [-.45, 0, -.225], max: [.45, .07, .225], material: 'body'},
    {name: 'cabinet-side-left', min: [-.45, .07, -.225], max: [-.39, .745, .225], material: 'body'},
    {name: 'cabinet-side-right', min: [.39, .07, -.225], max: [.45, .745, .225], material: 'body'},
    {name: 'cabinet-inner-back', min: [-.39, .07, -.225], max: [.39, .745, -.19], material: 'inner'},
    {name: 'cabinet-drawer-divider', min: [-.39, .345, -.20], max: [.39, .405, .20], material: 'body'},
    {name: 'drawer-runner-left', min: [-.31, .405, -.175], max: [-.19, .43, .215], material: 'metal'},
    {name: 'drawer-runner-right', min: [.19, .405, -.175], max: [.31, .43, .215], material: 'metal'}
  ];
}

function boxGeometry(min, max) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) for (let axis = 0; axis < 3; axis++)
    positions.setComponent(vertex, axis, Math.fround(positions.getComponent(vertex, axis) < 0 ? min[axis] : max[axis]));
  return geometry;
}

function dispose(root) {
  const materials = new Set();
  root.traverse(node => {node.geometry?.dispose(); for (const material of node.material ? [node.material].flat() : []) materials.add(material);});
  for (const material of materials) material.dispose();
}

function materialCloner() {
  const cloned = new Map();
  return material => {
    assert(material?.isMaterial && !Array.isArray(material), 'Source parts require one material per mesh');
    if (!cloned.has(material)) cloned.set(material, material.clone());
    return cloned.get(material);
  };
}

function bakedGeometry(mesh, translationY) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const y = positions.getY(vertex) + translationY;
    positions.setY(vertex, Math.abs(y) < 1e-8 ? 0 : Math.fround(y));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export async function createMakeupDrawerHost(source, originalBytes) {
  const loaded = (await parse(originalBytes)).scene, root = new THREE.Group();
  root.name = 'makeup-drawer-host';
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1};
  loaded.updateMatrixWorld(true);
  const cloneMaterial = materialCloner();
  try {
    const materials = {body: cloneMaterial(loaded.getObjectByName('cabinet-top').material), inner: cloneMaterial(loaded.getObjectByName('cabinet-inner-back').material), metal: cloneMaterial(loaded.getObjectByName('drawer-runner-left').material)};
    for (const part of hostBoxDefinitions()) {
      const mesh = new THREE.Mesh(boxGeometry(part.min, part.max), materials[part.material]); mesh.name = part.name; root.add(mesh);
    }
    const slide = new THREE.Group(); slide.name = 'cabinet-drawer-slide'; root.add(slide);
    for (const name of source.host.movingNames) {
      const original = loaded.getObjectByName(name); assert(original?.isMesh, `Missing pinned source drawer part ${name}`);
      const mesh = new THREE.Mesh(bakedGeometry(original, source.host.movingTranslationY), cloneMaterial(original.material)); mesh.name = name; slide.add(mesh);
    }
    root.updateMatrixWorld(true); return root;
  } catch (error) {dispose(root); throw error;}
  finally {dispose(loaded);}
}

export function createMakeupDrawerPayload(design, source, originalStorageSource) {
  const originalDesign = structuredClone(originalStorageSource.designs.find(candidate => candidate.id === design.sourceDesign));
  assert(originalDesign, `Missing pinned upper source ${design.sourceDesign}`);
  if (design.rimHeight !== undefined) originalDesign.rimHeight = design.rimHeight;
  const original = createMakeupStorage(originalDesign, originalStorageSource), root = new THREE.Group();
  root.name = `makeup-drawer-${design.id}`;
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1};
  original.updateMatrixWorld(true);
  const cloneMaterial = materialCloner();
  try {
    original.traverse(node => {
      if (!node.isMesh || !(node.name === 'storage-roof' || source.payload.retainedPrefixes.some(prefix => node.name.startsWith(prefix)))) return;
      const mesh = new THREE.Mesh(bakedGeometry(node, source.payload.translationY), cloneMaterial(node.material)); mesh.name = node.name; root.add(mesh);
    });
    assert(root.children.length >= 5 && !root.getObjectByName('storage-drawer-slide'));
    root.updateMatrixWorld(true); return root;
  } catch (error) {dispose(root); throw error;}
  finally {dispose(original);}
}

async function exportRoot(root) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {blob.arrayBuffer().then(result => {this.result = result; this.onloadend?.({target: this});}).catch(error => this.onerror?.(error));}
  };
  try {return Buffer.from(await new GLTFExporter().parseAsync(root, {binary: true, animations: []}));}
  finally {dispose(root);}
}
export const exportMakeupDrawerHost = async (source, originalBytes) => exportRoot(await createMakeupDrawerHost(source, originalBytes));
export const exportMakeupDrawerPayload = (design, source, originalStorageSource) => exportRoot(createMakeupDrawerPayload(design, source, originalStorageSource));

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), {code, path: location, details});
}

export async function readback(bytes, resource, expected) {
  const {validateMakeupDrawerGeometry} = await import(new URL(VERIFIER_PATH, ROOT));
  const scene = (await parse(bytes)).scene; scene.updateMatrixWorld(true);
  try {
    const geometry = validateMakeupDrawerGeometry(scene, resource, failGeometry), support = validateSupportGeometry(scene, resource, failGeometry);
    assert.equal(geometry.checked, true); assert.equal(support.checked, true);
    const digest = createHash('sha256'), materials = new Set(), meshes = [];
    let triangles = 0, expectedCount = 0;
    expected.traverse(node => {if (node.isMesh) expectedCount++;});
    scene.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'Rest nodes require identity transforms');
      if (!node.isMesh) return;
      const original = expected.getObjectByName(node.name); assert(original?.isMesh, `Unknown exported part ${node.name}`);
      assert.deepEqual(node.geometry.getAttribute('position').array, original.geometry.getAttribute('position').array, `Actual source vertices differ ${node.name}`);
      assert.deepEqual(node.geometry.getIndex()?.array, original.geometry.getIndex()?.array, `Actual source topology differs ${node.name}`);
      meshes.push(node.name); materials.add(node.material); triangles += (node.geometry.getIndex()?.count ?? node.geometry.getAttribute('position').count) / 3;
      const positions = node.geometry.getAttribute('position').array; digest.update(node.name); digest.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
    });
    assert.equal(meshes.length, expectedCount);
    assert(triangles <= 2500 && meshes.length <= 32 && materials.size <= 4, 'Resource budget exceeded');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined)); assert.equal(gltf.images?.length ?? 0, 0); assert.equal(gltf.animations?.length ?? 0, 0);
    const box = new THREE.Box3().setFromObject(scene);
    return {geometry, support, bounds: {min: box.min.toArray(), max: box.max.toArray()}, meshCount: meshes.length, triangleCount: triangles, materialCount: materials.size, meshes, identityAllRestNodes: true, sourceVerticesAndTopologyMatch: true, geometrySha256: digest.digest('hex'), textures: 0, externalUris: 0, animations: 0};
  } finally {dispose(scene); dispose(expected);}
}

export function hostResourceFor(source, bytes, provenance) {
  return {
    id: 'makeup-drawer-host', displayName: '化妆抽屉侧柜', version: 1, category: 'dynamic', mountRole: 'makeup-drawer-host', movingProfile: 'makeup-drawer-host-v1',
    mounting: {origin: 'bottom', ...source.host.envelope}, coordinates: source.common.coordinates, footprint: {center: [0, 0], halfSize: [.45, .275], blocking: true}, usePoints: [],
    stateDefaults: {openFraction: 0}, stateSchema: {openFraction: {type: 'number', min: 0, max: 1}}, stateSemantics: {openFraction: 'sliding-drawer-opening-fraction'}, movingParts: source.host.movingParts,
    partNodes: {drawer: 'cabinet-drawer-slide'}, partPanels: {drawer: 'drawer-front'}, partTrays: {drawer: {bottom: 'drawer-bottom', left: 'drawer-left', right: 'drawer-right', back: 'drawer-back'}},
    supportSurfaces: source.host.supportSurfaces, supportNodes: {top: 'cabinet-top', drawer: 'drawer-bottom'}, supportMotion: {drawer: 'drawer'},
    provenance: {...provenance, license: source.license, sourceDesign: 'host', sourceResource: source.host.sourceResource, prompt: `${source.common.promptStandard} ${source.host.prompt}`, method: 'Pinned original flat-panel GLB moving meshes baked in source space with Y -.35. A new low closed carrier uses fixed contract dimensions, direct bearing divider and independent grounded support network.', limitations: source.host.limitations},
    asset: {format: 'glb', url: '/company-assets/makeup-drawer-v1/host/v1/model.glb', sha256: sha256(bytes), bytes: bytes.length}
  };
}

export function payloadResourceFor(design, source, bytes, provenance) {
  return {
    id: `makeup-drawer-${design.id}`, displayName: design.label, version: 1, category: 'decor', mountRole: 'makeup-storage-drawer', productionBranch: 'makeup-storage-drawer', mount: 'support-surface',
    mounting: {origin: 'bottom', ...source.payload.envelope}, coordinates: source.common.coordinates, footprint: {center: [0, 0], halfSize: [.225, .125], blocking: false}, usePoints: [], stateDefaults: {},
    supportSurfaces: source.payload.supportSurfaces, supportNodes: {top: 'storage-roof'},
    provenance: {...provenance, license: source.license, sourceDesign: design.id, prompt: `${source.common.promptStandard} ${design.prompt}`, sourceResource: design.sourceResource, method: 'Reuse the pinned original storage generator upper structure and real storage-roof. Retain explicit upper prefixes, remove the lower carrier and slide, bake Y -.09 into original Float32 vertices, canonicalize near-zero base coordinates. No scaling.', limitations: design.limitations},
    asset: {format: 'glb', url: `/company-assets/makeup-drawer-v1/${design.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length}
  };
}

export async function buildCollection({source, sourceBytes, contractBytes, generatorBytes} = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT)); source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source); validateSource(source);
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT)); generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  const dependencies = new Map();
  for (const [name, pin] of Object.entries(source.dependencyPins)) dependencies.set(name, await readPin(pin));
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH); assert.equal(source.dependencyPins.geometryVerifier.path, VERIFIER_PATH);
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const originalBytes = dependencies.get('sourceHostGlb'), originalStorageSource = JSON.parse(dependencies.get('sourceStorageParameters'));
  const provenance = {sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins};
  const items = [];
  const hostBytes = await exportMakeupDrawerHost(source, originalBytes);
  assert(hostBytes.equals(await exportMakeupDrawerHost(source, originalBytes)), 'Repeated host export differs');
  const hostResource = hostResourceFor(source, hostBytes, provenance);
  items.push({directory: 'host', bytes: hostBytes, resource: hostResource, actual: await readback(hostBytes, hostResource, await createMakeupDrawerHost(source, originalBytes)), repeatedExportByteIdentical: true});
  for (const design of source.designs) {
    const bytes = await exportMakeupDrawerPayload(design, source, originalStorageSource);
    assert(bytes.equals(await exportMakeupDrawerPayload(design, source, originalStorageSource)), `Repeated payload export differs ${design.id}`);
    const resource = payloadResourceFor(design, source, bytes, provenance);
    items.push({directory: design.id, bytes, resource, actual: await readback(bytes, resource, createMakeupDrawerPayload(design, source, originalStorageSource)), repeatedExportByteIdentical: true});
  }
  assert.equal(new Set(items.map(item => item.resource.asset.sha256)).size, 5);
  const resources = items.map(item => item.resource);
  const collection = {id: source.id, version: 1, category: 'dynamic', provenance, resources: resources.map(resource => ({id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256}))};
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {files.set(`${OUTPUT_PATH}/${item.directory}/v1/model.glb`, item.bytes); files.set(`${OUTPUT_PATH}/${item.directory}/v1/resource.json`, jsonBytes(item.resource));}
  return {source, provenance, items, resources, collection, files};
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection(), beforeSource = structuredClone(result.source);
  beforeSource.designs[0].rimHeight = beforeSource.sourceModification.beforeRimHeight;
  const beforeSourceBytes = jsonBytes(beforeSource), before = await buildCollection({source: beforeSource, sourceBytes: beforeSourceBytes});
  assert.notEqual(before.items[1].actual.geometrySha256, result.items[1].actual.geometrySha256);
  for (const index of [0, 2, 3, 4]) assert(before.items[index].bytes.equals(result.items[index].bytes), 'Other four products changed');
  const report = {
    status: 'passed', scope: 'CPU deterministic real host and four original-source drawer payload adaptations with actual GLTFLoader / independent geometry and support admission', provenance: result.provenance,
    geometryVerifier: result.source.dependencyPins.geometryVerifier, commands: ['node scripts/company-platform/build-makeup-drawer.mjs', 'node scripts/company-platform/build-makeup-drawer.mjs --check'],
    items: result.items.map(item => ({id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual})),
    sourceModificationEvidence: {parameter: 'designs[0].rimHeight', before: beforeSource.designs[0].rimHeight, after: result.source.designs[0].rimHeight, actualBeforeTranslatedRim: beforeSource.designs[0].rimHeight + result.source.payload.translationY, actualAfterTranslatedRim: result.source.designs[0].rimHeight + result.source.payload.translationY, beforeParameters: `${EVIDENCE_PATH}/before-parameters.json`, beforeParametersSha256: sha256(beforeSourceBytes), beforeOutput: `${EVIDENCE_PATH}/before-tray.glb`, beforeSha256: before.items[1].resource.asset.sha256, afterSha256: result.items[1].resource.asset.sha256, actualBefore: before.items[1].actual, actualAfter: result.items[1].actual, otherFourProductsByteIdentical: true},
    reuse: {host: result.source.host.sourceResource, payloads: result.source.designs.map(design => design.sourceResource), selection: result.source.payload.retainedPrefixes, hostTranslationY: -.35, payloadTranslationY: -.09, runtimeInstanceScale: [1, 1, 1], externalCandidate: 'Kenney Furniture Kit was inspected in preflight. These five production assets use pinned existing project sources.'},
    limits: ['CPU production, original geometry reuse and loaded geometry admission only. Browser state/installation/transactions/close-reopen, ordinary-device performance and human visual acceptance require their corresponding evidence.', 'The low drawer host is one supporting resource and the four payloads cover the confirmed drawer-installed branch. Existing compact resources are reused by the runtime.', 'Geometry support and access checks establish finite bounds and contact. Mechanical strength, tipping stability and character hand actions require their own evidence.']
  };
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/before-parameters.json`, beforeSourceBytes], [`${EVIDENCE_PATH}/before-tray.glb`, before.items[1].bytes], [`${EVIDENCE_PATH}/before-tray-resource.json`, jsonBytes(before.items[1].resource)]]);
    for (const [file, bytes] of [...result.files, ...evidence]) {const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes);}
  }
  console.log(JSON.stringify({status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: result.resources.map(resource => ({id: resource.id, sha256: resource.asset.sha256, bytes: resource.asset.bytes}))}));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(async error => {
  if (!process.argv.includes('--check')) {
    const directory = new URL(`${EVIDENCE_PATH}/failures/`, ROOT); await fs.mkdir(directory, {recursive: true});
    const bytes = jsonBytes({status: 'failed', message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack}); await fs.writeFile(new URL(`${sha256(bytes).slice(0, 16)}.json`, directory), bytes);
  }
  console.error(error.stack || error); process.exitCode = 1;
});
