import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-makeup-storage-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-MAKEUP-STORAGE-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-makeup-storage.mjs';
export const VERIFIER_PATH = 'prototype/src/company/makeup-storage-geometry.js';
export const IDS = ['tray', 'divided', 'brush-cup', 'case'];
const OUTPUT_PATH = 'prototype/public/company-assets/makeup-storage-v1';
const EVIDENCE_PATH = 'evidence/company-makeup-storage-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

export const MOVING_PARTS = [{id: 'drawer', stateField: 'openFraction', kind: 'slide', axis: 'z', pivot: [0, 0, 0], translationRange: [0, .09], bounds: {min: [-.205, .016, -.115], max: [.205, .078, .035]}}];
export const SUPPORT_SURFACES = [{id: 'top', center: [0, -.045], topY: .100, halfSize: [.115, .055], clearanceHeight: .140}, {id: 'drawer', center: [0, -.005], topY: .022, halfSize: [.180, .020], clearanceHeight: .040}];

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-makeup-storage-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.designs.map(design => design.id), IDS);
  assert.deepEqual(source.common.envelope, {width: .45, height: .25, depth: .25});
  assert.deepEqual(source.common.movingParts, MOVING_PARTS);
  assert.deepEqual(source.common.supportSurfaces, SUPPORT_SURFACES);
  assert.equal(source.common.units, 'metres');
  assert.equal(source.common.up, '+Y');
  assert.equal(source.common.forward, '+Z');
  assert.equal(source.common.cupSegments, 32);
  assert.equal(source.common.contentSegments, 24);
  assert(source.license.includes('original') && source.common.promptStandard.length > 200);
  assert.equal(source.content.id, 'makeup-storage-content-compact');
  assert.deepEqual(source.content.envelope, {width: .024, height: .035, depth: .024});
  assert(/^#[a-f0-9]{6}$/i.test(source.content.bodyColor) && /^#[a-f0-9]{6}$/i.test(source.content.capColor));
  for (const design of source.designs) {
    assert(design.label && design.prompt && design.limitations.length);
    assert(/^#[a-f0-9]{6}$/i.test(design.color));
    if (design.id === 'tray') assert(Number.isFinite(design.rimHeight) && design.rimHeight >= .13 && design.rimHeight <= .15);
    else if (design.id === 'divided') assert.equal(design.rimHeight, .19);
    else if (design.id === 'brush-cup') assert.deepEqual(design.cupHeights, [.25, .22]);
    else assert.equal(design.rimHeight, .20);
  }
}

function boxGeometry(min, max) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) for (let axis = 0; axis < 3; axis++)
    positions.setComponent(vertex, axis, Math.fround(positions.getComponent(vertex, axis) < 0 ? min[axis] : max[axis]));
  return geometry;
}

function planeTriangles(polygon, height, reverse = false) {
  const center = polygon.reduce((sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length], [0, 0]);
  return polygon.map((point, index) => {
    const triangle = [[...center, height], [...point, height], [...polygon[(index + 1) % polygon.length], height]];
    return reverse ? triangle.reverse() : triangle;
  });
}

function sideTriangles(polygon, bottom, top, inward = false) {
  return polygon.flatMap((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const a = [...point, bottom], b = [...next, bottom], c = [...next, top], d = [...point, top];
    const triangles = [[a, b, c], [a, c, d]];
    return inward ? triangles.map(triangle => triangle.reverse()) : triangles;
  });
}

function circle(radius, segments) {
  return Array.from({length: segments}, (_, index) => {
    const angle = index * Math.PI * 2 / segments;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

function horizontalGeometry(triangles, center = [0, 0]) {
  // Rotating the usual CCW XY extrusion by -90 degrees around X makes its
  // normal +Y. Bake the rotation and centre into the final Float32 vertices.
  const positions = triangles.flat().flatMap(([x, z, y]) => [Math.fround(center[0] + x), Math.fround(y), Math.fround(center[1] - z)]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function diskGeometry(radius, bottom, top, segments, center) {
  const polygon = circle(radius, segments);
  return horizontalGeometry([...planeTriangles(polygon, bottom, true), ...planeTriangles(polygon, top), ...sideTriangles(polygon, bottom, top)], center);
}

function cupWallGeometry(bottom, top, segments, center) {
  const inner = circle(.029, segments), outer = circle(.035, segments);
  const triangles = [...sideTriangles(outer, bottom, top), ...sideTriangles(inner, bottom, top, true)];
  for (let index = 0; index < inner.length; index++) {
    const next = (index + 1) % inner.length;
    for (const y of [bottom, top]) {
      const a = [...inner[index], y], b = [...outer[index], y], c = [...outer[next], y], d = [...inner[next], y];
      const cap = [[a, b, c], [a, c, d]];
      triangles.push(...(y === bottom ? cap.map(triangle => triangle.reverse()) : cap));
    }
  }
  return horizontalGeometry(triangles, center);
}

export function boxDefinitions(design) {
  const parts = [];
  const box = (name, min, max, material = 'body', moving = false) => parts.push({name, min, max, material, moving});
  box('storage-base', [-.225, 0, -.125], [.225, .010, .035]);
  box('storage-side-left', [-.225, .010, -.125], [-.212, .090, .035]);
  box('storage-side-right', [.212, .010, -.125], [.225, .090, .035]);
  box('storage-back', [-.212, .010, -.125], [.212, .090, -.119]);
  box('storage-roof', [-.225, .090, -.125], [.225, .100, .035], 'inner');
  box('storage-runner-left', [-.1775, .010, -.115], [-.1625, .016, .030], 'metal');
  box('storage-runner-right', [.1625, .010, -.115], [.1775, .016, .030], 'metal');
  box('storage-drawer-bottom', [-.205, .016, -.115], [.205, .022, .025], 'inner', true);
  box('storage-drawer-left', [-.205, .022, -.115], [-.199, .078, .025], 'body', true);
  box('storage-drawer-right', [.199, .022, -.115], [.205, .078, .025], 'body', true);
  box('storage-drawer-back', [-.199, .022, -.115], [.199, .078, -.109], 'body', true);
  box('storage-drawer-front', [-.199, .022, .019], [.199, .078, .025], 'body', true);
  box('storage-drawer-handle', [-.035, .043, .025], [.035, .057, .035], 'metal', true);
  if (design.id === 'brush-cup') return parts;
  const innerX = design.id === 'case' ? .215 : .217;
  const rearZ = design.id === 'case' ? -.115 : -.117;
  const frontZ = design.id === 'case' ? .025 : .027;
  box('storage-upper-left', [-.225, .100, -.125], [-innerX, design.rimHeight, .035]);
  box('storage-upper-right', [innerX, .100, -.125], [.225, design.rimHeight, .035]);
  box('storage-upper-back', [-innerX, .100, -.125], [innerX, design.rimHeight, rearZ]);
  box('storage-upper-front', [-innerX, .100, frontZ], [innerX, design.rimHeight, .035]);
  if (design.id === 'divided') {
    box('storage-divider-left', [-.130, .100, -.117], [-.124, .19, .027]);
    box('storage-divider-right', [.124, .100, -.117], [.130, .19, .027]);
    box('storage-divider-cross-left', [-.217, .100, -.048], [-.130, .19, -.042]);
    box('storage-drawer-divider', [-.003, .022, -.109], [.003, .065, -.031], 'inner', true);
  }
  if (design.id === 'case') for (const side of ['left', 'right']) {
    const [minX, maxX] = side === 'left' ? [-.225, -.215] : [.215, .225];
    box(`storage-case-handle-${side}-rear`, [minX, .190, -.085], [maxX, .250, -.073], 'metal');
    box(`storage-case-handle-${side}-front`, [minX, .190, -.017], [maxX, .250, -.005], 'metal');
    box(`storage-case-handle-${side}-grip`, [minX, .238, -.073], [maxX, .250, -.017], 'metal');
  }
  return parts;
}

export function createMakeupStorage(design, source) {
  const root = new THREE.Group(); root.name = `makeup-storage-${design.id}`;
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1};
  const materials = {
    body: new THREE.MeshStandardMaterial({color: design.color, roughness: .65, metalness: .05}),
    inner: new THREE.MeshStandardMaterial({color: '#dbceba', roughness: .78, metalness: .02}),
    metal: new THREE.MeshStandardMaterial({color: '#b39a76', roughness: .36, metalness: .55})
  };
  const slide = new THREE.Group(); slide.name = 'storage-drawer-slide'; root.add(slide);
  const add = (name, geometry, material, parent = root) => {const mesh = new THREE.Mesh(geometry, materials[material]); mesh.name = name; parent.add(mesh);};
  for (const part of boxDefinitions(design)) add(part.name, boxGeometry(part.min, part.max), part.material, part.moving ? slide : root);
  if (design.id === 'brush-cup') for (const [index, side] of ['left', 'right'].entries()) {
    const center = [index ? .17 : -.17, -.045];
    add(`storage-cup-${side}-bottom`, diskGeometry(.035, .100, .106, source.common.cupSegments, center), 'inner');
    add(`storage-cup-${side}-wall`, cupWallGeometry(.100, design.cupHeights[index], source.common.cupSegments, center), 'body');
  }
  root.updateMatrixWorld(true);
  return root;
}

export function createMakeupStorageContent(source) {
  const root = new THREE.Group(); root.name = 'makeup-storage-content-compact';
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1};
  for (const [name, bottom, top, color] of [['body', 0, .028, source.content.bodyColor], ['cap', .028, .035, source.content.capColor]]) {
    const material = new THREE.MeshStandardMaterial({color, roughness: .55, metalness: .08});
    const mesh = new THREE.Mesh(diskGeometry(.012, bottom, top, source.common.contentSegments, [0, 0]), material);
    mesh.name = `storage-content-${name}`; root.add(mesh);
  }
  root.updateMatrixWorld(true);
  return root;
}

function dispose(root) {
  const materials = new Set();
  root.traverse(node => {node.geometry?.dispose(); for (const material of node.material ? [node.material].flat() : []) materials.add(material);});
  for (const material of materials) material.dispose();
}

async function exportRoot(root) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {blob.arrayBuffer().then(result => {this.result = result; this.onloadend?.({target: this});}).catch(error => this.onerror?.(error));}
  };
  try {return Buffer.from(await new GLTFExporter().parseAsync(root, {binary: true, animations: []}));}
  finally {dispose(root);}
}
export const exportMakeupStorage = (design, source) => exportRoot(createMakeupStorage(design, source));
export const exportMakeupStorageContent = source => exportRoot(createMakeupStorageContent(source));

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), {code, path: location, details});
}

export async function readback(bytes, design, source, resource) {
  const {validateMakeupStorageGeometry} = await import(new URL(VERIFIER_PATH, ROOT));
  const scene = (await parse(bytes)).scene;
  const expected = design ? createMakeupStorage(design, source) : createMakeupStorageContent(source);
  scene.updateMatrixWorld(true);
  try {
    const actual = validateMakeupStorageGeometry(scene, resource, failGeometry);
    assert.equal(actual.checked, true);
    const digest = createHash('sha256'), materials = new Set(), meshes = [];
    let triangleCount = 0, expectedMeshCount = 0;
    expected.traverse(node => {if (node.isMesh) expectedMeshCount++;});
    scene.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'Rest production nodes must use identity transforms');
      if (!node.isMesh) return;
      meshes.push(node);
      const original = expected.getObjectByName(node.name);
      assert(original?.isMesh, `Unknown exported part ${node.name}`);
      assert.deepEqual(node.geometry.getAttribute('position').array, original.geometry.getAttribute('position').array, `Actual source vertices differ ${node.name}`);
      assert.deepEqual(node.geometry.getIndex()?.array, original.geometry.getIndex()?.array, `Actual source topology differs ${node.name}`);
      triangleCount += (node.geometry.getIndex()?.count ?? node.geometry.getAttribute('position').count) / 3;
      materials.add(node.material); digest.update(node.name);
      const positions = node.geometry.getAttribute('position').array;
      digest.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
    });
    assert.equal(meshes.length, expectedMeshCount);
    assert(triangleCount <= 2500 && meshes.length <= 32 && materials.size <= 4, 'Resource budget exceeded');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined));
    assert.equal(gltf.images?.length ?? 0, 0); assert.equal(gltf.animations?.length ?? 0, 0);
    const bounds = new THREE.Box3().setFromObject(scene);
    return {geometry: actual, bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, meshCount: meshes.length, triangleCount, materialCount: materials.size, identityAllRestNodes: true, sourceVerticesAndTopologyMatch: true, geometrySha256: digest.digest('hex'), externalUris: 0, textures: 0, animations: 0};
  } finally {dispose(scene); dispose(expected);}
}

const coordinates = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only'};
export function resourceFor(design, source, bytes, provenance) {
  return {
    id: `makeup-storage-${design.id}`, displayName: design.label, version: 1, category: 'dynamic', mountRole: 'makeup-storage', productionBranch: 'makeup-storage', mount: 'support-surface',
    mounting: {origin: 'bottom', ...source.common.envelope}, coordinates, footprint: {center: [0, 0], halfSize: [.225, .125], blocking: false}, usePoints: [],
    movingProfile: 'supported-slide-v1', movingParts: source.common.movingParts,
    partNodes: {drawer: 'storage-drawer-slide'}, partPanels: {drawer: 'storage-drawer-front'}, partTrays: {drawer: {bottom: 'storage-drawer-bottom', left: 'storage-drawer-left', right: 'storage-drawer-right', back: 'storage-drawer-back'}},
    supportSurfaces: source.common.supportSurfaces, supportNodes: {top: 'storage-roof', drawer: 'storage-drawer-bottom'}, supportMotion: {drawer: 'drawer'},
    stateDefaults: {openFraction: 0}, stateSchema: {openFraction: {type: 'number', min: 0, max: 1}}, stateSemantics: {openFraction: 'sliding-drawer-opening-fraction'},
    provenance: {...provenance, license: source.license, prompt: `${source.common.promptStandard} Design: ${design.prompt}`, sourceDesign: design.id, method: 'Original closed solid carrier, real rails, thick sliding tray and distinct upper storage geometry. Rest vertices baked into resource space. Actual deterministic GLTFLoader readback and independent full-path geometry admission.', limitations: design.limitations},
    asset: {format: 'glb', url: `/company-assets/makeup-storage-v1/${design.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length}
  };
}

export function contentResourceFor(source, bytes, provenance) {
  return {
    id: 'makeup-storage-content-compact', displayName: '收纳随动见证小圆盒', version: 1, category: 'decor', mountRole: 'makeup-storage-content', mount: 'support-surface',
    mounting: {origin: 'bottom', ...source.content.envelope}, coordinates, footprint: {center: [0, 0], halfSize: [.012, .012], blocking: false}, usePoints: [], stateDefaults: {},
    provenance: {...provenance, license: source.license, prompt: source.content.prompt, sourceDesign: 'compact', method: 'Original closed 24-segment compact body and cap, authored as one independent bounded saved content resource.', limitations: source.content.limitations},
    asset: {format: 'glb', url: '/company-assets/makeup-storage-v1/content-compact/v1/model.glb', sha256: sha256(bytes), bytes: bytes.length}
  };
}

export async function buildCollection({source, sourceBytes, contractBytes, generatorBytes, ids = IDS} = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT));
  source ??= JSON.parse(sourceBytes); assert.deepEqual(JSON.parse(sourceBytes), source); validateSource(source);
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  for (const pin of Object.values(source.dependencyPins)) await readPin(pin);
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(source.dependencyPins.geometryVerifier.path, VERIFIER_PATH);
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = {sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins};
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length);
  const items = [];
  for (const design of source.designs.filter(candidate => ids.includes(candidate.id))) {
    const bytes = await exportMakeupStorage(design, source), repeat = await exportMakeupStorage(design, source);
    assert(bytes.equals(repeat), `Repeated export differs ${design.id}`);
    const resource = resourceFor(design, source, bytes, provenance);
    items.push({design, bytes, resource, actual: await readback(bytes, design, source, resource), repeatedExportByteIdentical: true});
  }
  const contentBytes = await exportMakeupStorageContent(source);
  assert(contentBytes.equals(await exportMakeupStorageContent(source)), 'Repeated content export differs');
  const contentResource = contentResourceFor(source, contentBytes, provenance);
  const content = {bytes: contentBytes, resource: contentResource, actual: await readback(contentBytes, null, source, contentResource), repeatedExportByteIdentical: true};
  const resources = [...items.map(item => item.resource), contentResource];
  assert.equal(new Set(resources.map(resource => resource.asset.sha256)).size, ids.length + 1);
  const collection = {id: source.id, version: 1, category: 'dynamic', provenance, resources: resources.map(resource => ({id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256}))};
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of [...items, content]) {
    const directory = item.design?.id ?? 'content-compact';
    files.set(`${OUTPUT_PATH}/${directory}/v1/model.glb`, item.bytes);
    files.set(`${OUTPUT_PATH}/${directory}/v1/resource.json`, jsonBytes(item.resource));
  }
  return {source, provenance, items, content, resources, collection, files};
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection();
  const changedSource = structuredClone(result.source);
  const variantHeight = changedSource.designs[0].rimHeight === .145 ? .14 : .145;
  changedSource.designs[0].rimHeight = variantHeight;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({source: changedSource, sourceBytes: changedSourceBytes});
  assert.notEqual(variant.items[0].actual.geometrySha256, result.items[0].actual.geometrySha256);
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Other three models changed');
  assert(variant.content.bytes.equals(result.content.bytes), 'Independent content changed');
  const report = {
    status: 'passed', scope: 'CPU deterministic production and actual GLTFLoader / independent geometry admission for four supported makeup storage looks and one saved-content compact', provenance: result.provenance,
    geometryVerifier: result.source.dependencyPins.geometryVerifier, commands: ['node scripts/company-platform/build-makeup-storage.mjs', 'node scripts/company-platform/build-makeup-storage.mjs --check'],
    items: [...result.items, result.content].map(item => ({id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual})),
    sourceModificationEvidence: {parameter: 'designs[0].rimHeight', before: result.source.designs[0].rimHeight, after: variantHeight, parameters: `${EVIDENCE_PATH}/variant-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/variant-tray.glb`, beforeSha256: result.items[0].resource.asset.sha256, afterSha256: variant.items[0].resource.asset.sha256, beforeGeometrySha256: result.items[0].actual.geometrySha256, afterGeometrySha256: variant.items[0].actual.geometrySha256, actual: variant.items[0].actual, otherThreeModelsByteIdentical: true, independentContentByteIdentical: true},
    limits: ['CPU production and geometry only. Runtime state, dynamic independent contents, browser transactions/close/reopen, normal-speed recording, ordinary-device performance and user visual acceptance require their corresponding evidence.', 'The compact is one limited independent saved-content witness. Cosmetics inventory and character hand interaction have separate scope.', 'Fixed open upper case and cups. The common lower tray has a bounded .09m slide. Real drawer-installed makeup-storage-drawer acceptance needs its own parent cavity and four-look evidence.']
  };
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/variant-parameters.json`, changedSourceBytes], [`${EVIDENCE_PATH}/variant-tray.glb`, variant.items[0].bytes], [`${EVIDENCE_PATH}/variant-tray-resource.json`, jsonBytes(variant.items[0].resource)]]);
    for (const [file, bytes] of [...result.files, ...evidence]) {
      const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes);
    }
  }
  console.log(JSON.stringify({status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: result.resources.map(resource => ({id: resource.id, sha256: resource.asset.sha256, bytes: resource.asset.bytes}))}));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(async error => {
  if (!process.argv.includes('--check')) {
    const directory = new URL(`${EVIDENCE_PATH}/failures/`, ROOT); await fs.mkdir(directory, {recursive: true});
    const bytes = jsonBytes({status: 'failed', message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack});
    await fs.writeFile(new URL(`${sha256(bytes).slice(0, 16)}.json`, directory), bytes);
  }
  console.error(error.stack || error); process.exitCode = 1;
});
