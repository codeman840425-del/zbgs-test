import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { createMakeupMirror, designFor as originalDesignFor } from './build-makeup-mirror.mjs';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-makeup-wall-mirror-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-MAKEUP-WALL-MIRROR-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-makeup-wall-mirror.mjs';
export const VERIFIER_PATH = 'prototype/src/company/makeup-wall-mirror-geometry.js';
export const DATA_PATH = 'prototype/src/company/makeup-wall-mirror-data.js';
export const IDS = ['round', 'lit-frame', 'arch', 'tri-fold'];
const OUTPUT_PATH = 'prototype/public/company-assets/makeup-wall-mirror-v1';
const EVIDENCE_PATH = 'evidence/company-makeup-wall-mirror-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-makeup-wall-mirror-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.mirrors.map(mirror => mirror.id), IDS);
  assert.deepEqual(source.common.envelope, { width: .70, height: .60, depth: .12 });
  assert.deepEqual(source.common.surface, { schema: 'makeup-wall-mirror-v1', profile: 'single-512-v1', maxFaces: 3 });
  assert.deepEqual(source.common.light, { kind: 'spot', color: '#fff4df', position: [0, .22, .103], target: [0, .065, .758], distance: 1.5, angle: .55, penumbra: .6 });
  assert.deepEqual(source.common.stateDefaults, { on: true, intensity: 5 });
  assert.equal(source.common.units, 'metres');
  assert.equal(source.common.up, '+Y');
  assert.equal(source.common.forward, '+Z');
  assert.deepEqual(source.adaptation, {translation: [0, -.365, .038], excludedNodes: ['makeup-base', 'makeup-post'], wallPlate: {name: 'makeup-wall-mount', min: [-.08, -.12, 0], max: [.08, .12, .02]}, lampRiserTop: .575, lampArmFront: .053, triFoldJoint: 'angle-bisector-miter-v1'});
  assert(source.license.includes('original') && source.common.promptStandard.length > 150);
  for (const mirror of source.mirrors) {
    assert(mirror.label && mirror.prompt && mirror.limitations.length);
    assert(/^#[a-f0-9]{6}$/i.test(mirror.color));
    assert(Number.isFinite(mirror.frameWidth));
    assert.equal(mirror.ringFront, mirror.id === 'tri-fold' ? -.009 : .004);
    if (mirror.id === 'round') assert(mirror.frameWidth >= .009 && mirror.frameWidth <= .016);
    else assert.equal(mirror.frameWidth, mirror.id === 'lit-frame' ? .022 : mirror.id === 'arch' ? .012 : .007);
  }
}

export function designFor(mirror) {
  return originalDesignFor(mirror).map(panel => ({...panel, position: [panel.position[0], 0, .038]}));
}

function boxGeometry(min, max) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) for (let axis = 0; axis < 3; axis++)
    positions.setComponent(vertex, axis, Math.fround(positions.getComponent(vertex, axis) < 0 ? min[axis] : max[axis]));
  return geometry;
}

function miteredTriFoldFrame(panel, front) {
  const bottom = -.025, tangent = Math.tan(Math.PI / 12);
  const inner = panel.polygons[0];
  const layer = z => panel.outer.map(([x, y]) => {
    if (panel.id === 'center') x = x < 0 ? -.14 + tangent * z : .14 - tangent * z;
    if (panel.id === 'left' && x > 0) x = -tangent * z;
    if (panel.id === 'right' && x < 0) x = tangent * z;
    return [x, y, z];
  });
  const outerBack = layer(bottom), outerFront = layer(front);
  const innerBack = inner.map(point => [...point, bottom]);
  const innerFront = inner.map(point => [...point, front]);
  const triangles = [];
  for (let index = 0; index < inner.length; index++) {
    const next = (index + 1) % inner.length;
    triangles.push([outerBack[index], outerBack[next], outerFront[next]], [outerBack[index], outerFront[next], outerFront[index]]);
    triangles.push([innerFront[next], innerBack[next], innerBack[index]], [innerFront[index], innerFront[next], innerBack[index]]);
    triangles.push([innerFront[index], outerFront[index], outerFront[next]], [innerFront[index], outerFront[next], innerFront[next]]);
    triangles.push([outerBack[next], outerBack[index], innerBack[index]], [innerBack[next], outerBack[next], innerBack[index]]);
  }
  const matrix = new THREE.Matrix4().makeTranslation(...panel.position).multiply(new THREE.Matrix4().makeRotationY(panel.yaw));
  const positions = triangles.flat().flatMap(point => new THREE.Vector3(...point).applyMatrix4(matrix).toArray().map(Math.fround));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createMakeupWallMirror(mirror, source) {
  const root = createMakeupMirror(mirror);
  root.name = `makeup-wall-mirror-${mirror.id}`;
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Centred wall back', sourceVersion: 1};
  for (const name of source.adaptation.excludedNodes) {
    const mesh = root.getObjectByName(name);
    root.remove(mesh);
    mesh.geometry.dispose();
  }
  if (mirror.id === 'tri-fold') for (const panel of originalDesignFor(mirror)) {
    const frame = root.getObjectByName(`makeup-frame-${panel.id}`);
    frame.geometry.dispose();
    frame.geometry = miteredTriFoldFrame(panel, mirror.ringFront);
  }
  const riser = root.getObjectByName('makeup-lamp-riser');
  const arm = root.getObjectByName('makeup-lamp-arm');
  riser.geometry.dispose(); arm.geometry.dispose();
  riser.geometry = boxGeometry([-.015, .52, -.038], [.015, source.adaptation.lampRiserTop, -.012]);
  arm.geometry = boxGeometry([-.015, .575, -.038], [.015, .595, source.adaptation.lampArmFront]);
  for (const mesh of root.children) {
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) for (let axis = 0; axis < 3; axis++) {
      const value = positions.getComponent(index, axis) + source.adaptation.translation[axis];
      positions.setComponent(index, axis, Math.abs(value) < 1e-8 ? 0 : Math.fround(value));
    }
    mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }
  const plate = source.adaptation.wallPlate;
  const mount = new THREE.Mesh(boxGeometry(plate.min, plate.max), riser.material);
  mount.name = plate.name; root.add(mount); root.updateMatrixWorld(true);
  return root;
}

function dispose(root) {
  const materials = new Set();
  root.traverse(node => { node.geometry?.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material); });
  for (const material of materials) material.dispose();
}

export async function exportMakeupWallMirror(mirror, source) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); }
  };
  const root = createMakeupWallMirror(mirror, source);
  try { return Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [] })); }
  finally { dispose(root); }
}

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), { code, path: location, details });
}

export async function readback(bytes, mirror, resource, source) {
  const { validateMakeupWallMirrorGeometry } = await import(new URL(VERIFIER_PATH, ROOT));
  const { validateMakeupWallMirrorResource } = await import(new URL(DATA_PATH, ROOT));
  validateMakeupWallMirrorResource(resource, failGeometry);
  const scene = (await parse(bytes)).scene, expected = createMakeupWallMirror(mirror, source);
  scene.updateMatrixWorld(true);
  try {
    const actual = validateMakeupWallMirrorGeometry(scene, resource, failGeometry);
    assert.equal(actual.checked, true);
    const digest = createHash('sha256'), materials = new Set(), meshes = [];
    let triangleCount = 0;
    scene.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'Production nodes must use identity transforms');
      if (!node.isMesh) return;
      meshes.push(node);
      const sourceMesh = expected.getObjectByName(node.name);
      assert(sourceMesh?.isMesh, `Unknown exported part ${node.name}`);
      assert.deepEqual(node.geometry.getAttribute('position').array, sourceMesh.geometry.getAttribute('position').array, `Actual source vertices differ ${node.name}`);
      assert.deepEqual(node.geometry.getIndex()?.array, sourceMesh.geometry.getIndex()?.array, `Actual source topology differs ${node.name}`);
      triangleCount += (node.geometry.getIndex()?.count ?? node.geometry.getAttribute('position').count) / 3;
      materials.add(node.material);
      digest.update(node.name);
      const positions = node.geometry.getAttribute('position').array;
      digest.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
    });
    assert.equal(meshes.length, expected.children.length);
    assert(triangleCount <= 2500 && meshes.length <= 32 && materials.size <= 4, 'Resource budget exceeded');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined));
    assert.equal(gltf.images?.length ?? 0, 0);
    assert.equal(gltf.animations?.length ?? 0, 0);
    const bounds = new THREE.Box3().setFromObject(scene);
    return { geometry: actual, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, meshCount: meshes.length, triangleCount, materialCount: materials.size, identityAllNodes: true, sourceVerticesAndTopologyMatch: true, geometrySha256: digest.digest('hex'), externalUris: 0, textures: 0, animations: 0 };
  } finally { dispose(scene); dispose(expected); }
}

export function resourceFor(mirror, source, bytes, provenance) {
  return {
    id: `makeup-wall-mirror-${mirror.id}`, displayName: mirror.label, version: 1, category: 'dynamic', mountRole: 'makeup-mirror-wall', productionBranch: 'makeup-mirror-wall', mount: 'wall',
    mounting: { origin: 'center', ...source.common.envelope }, coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Centred wall back', scale: 'Identity only' },
    footprint: { center: [0, 0], halfSize: [.35, .06], blocking: false }, usePoints: [],
    mirrorSurface: source.common.surface,
    mirrorPanels: designFor(mirror).map(({ outer, ...panel }) => panel),
    makeupNodes: { mount: 'makeup-wall-mount', lamp: 'makeup-lamp' },
    makeupLamp: { node: 'makeup-lamp', maxEmissiveIntensity: 1.5 }, light: source.common.light,
    stateDefaults: source.common.stateDefaults, stateSchema: { on: { type: 'boolean' }, intensity: { type: 'number', min: 0, max: 10 } },
    stateSemantics: { on: 'makeup-local-light-enabled-v1', intensity: 'makeup-local-light-candela-v1' },
    provenance: { ...provenance, license: source.license, prompt: `${source.common.promptStandard} Design: ${mirror.prompt}`, sourceDesign: mirror.id, method: 'Adapted pinned original mirror head with base/post removed, rigid translation and a new closed wall mounting plate. Finite joint correction replaces overlapping lamp joints with face contacts and trims tri-fold rims at fixed angle-bisector seams. Pane/back/light transforms and main contours remain from the pinned source. Finite convex pane contours and distinct tri-fold plane transforms are baked into Float32 resource-space vertices. Deterministic GLTFExporter with actual GLTFLoader readback and independent wall-makeup-mirror geometry admission.', limitations: mirror.limitations },
    asset: { format: 'glb', url: `/company-assets/makeup-wall-mirror-v1/${mirror.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
  };
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes, ids = IDS } = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT));
  source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source);
  validateSource(source);
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  for (const pin of Object.values(source.dependencyPins)) await readPin(pin);
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(source.dependencyPins.geometryVerifier.path, VERIFIER_PATH);
  assert.equal(source.dependencyPins.dataVerifier.path, DATA_PATH);
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = { sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins };
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length);
  const items = [];
  for (const mirror of source.mirrors.filter(candidate => ids.includes(candidate.id))) {
    const bytes = await exportMakeupWallMirror(mirror, source), repeat = await exportMakeupWallMirror(mirror, source);
    assert(bytes.equals(repeat), `Repeated export differs ${mirror.id}`);
    const resource = resourceFor(mirror, source, bytes, provenance);
    items.push({ mirror, bytes, resource, actual: await readback(bytes, mirror, resource, source), repeatedExportByteIdentical: true });
  }
  assert.equal(new Set(items.map(item => item.resource.asset.sha256)).size, ids.length);
  const resources = items.map(item => item.resource);
  const collection = { id: source.id, version: 1, category: 'dynamic', provenance, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {
    files.set(`${OUTPUT_PATH}/${item.mirror.id}/v1/model.glb`, item.bytes);
    files.set(`${OUTPUT_PATH}/${item.mirror.id}/v1/resource.json`, jsonBytes(item.resource));
  }
  return { source, provenance, items, resources, collection, files };
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection();
  const changedSource = structuredClone(result.source);
  const variantWidth = result.source.sourceModification.before;
  changedSource.mirrors[0].frameWidth = variantWidth;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({ source: changedSource, sourceBytes: changedSourceBytes });
  assert.notEqual(variant.items[0].actual.geometrySha256, result.items[0].actual.geometrySha256);
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Other three models changed');
  const report = {
    status: 'passed', scope: 'CPU deterministic production and actual GLTFLoader / independent geometry readback of four wall-mounted makeup mirrors', provenance: result.provenance,
    geometryVerifier: result.source.dependencyPins.geometryVerifier,
    commands: ['node scripts/company-platform/build-makeup-wall-mirror.mjs', 'node scripts/company-platform/build-makeup-wall-mirror.mjs --check'],
    items: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual })),
    sourceModificationEvidence: { parameter: 'mirrors[0].frameWidth', before: variantWidth, after: result.source.mirrors[0].frameWidth, parameters: `${EVIDENCE_PATH}/before-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/before-round.glb`, beforeSha256: variant.items[0].resource.asset.sha256, afterSha256: result.items[0].resource.asset.sha256, beforeGeometrySha256: variant.items[0].actual.geometrySha256, afterGeometrySha256: result.items[0].actual.geometrySha256, beforeActual: variant.items[0].actual, afterActual: result.items[0].actual, otherThreeModelsByteIdentical: true },
    limits: ['CPU production and geometry evidence only. Browser reflection, real illumination, transactions, closed-process restoration, recording, ordinary-device performance and human visual acceptance require separate evidence.', 'Fixed tri-fold opening geometry. No movable hinge or folding state.', 'Warm-white light geometry is authored here. Actual SpotLight and GPU reflection are rebuilt by the shared runtime. C3 character illumination remains outside this production check.']
  };
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/before-parameters.json`, changedSourceBytes], [`${EVIDENCE_PATH}/before-round.glb`, variant.items[0].bytes], [`${EVIDENCE_PATH}/before-round-resource.json`, jsonBytes(variant.items[0].resource)]]);
    for (const [file, bytes] of [...result.files, ...evidence]) {
      const url = new URL(file, ROOT);
      await fs.mkdir(new URL('./', url), { recursive: true });
      await fs.writeFile(url, bytes);
    }
  }
  console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length })) }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(async error => {
  if (!process.argv.includes('--check')) {
    const directory = new URL(`${EVIDENCE_PATH}/failures/`, ROOT);
    await fs.mkdir(directory, { recursive: true });
    const record = { status: 'failed', message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack };
    const bytes = jsonBytes(record);
    await fs.writeFile(new URL(`${sha256(bytes).slice(0, 16)}.json`, directory), bytes);
  }
  console.error(error.stack || error);
  process.exitCode = 1;
});
