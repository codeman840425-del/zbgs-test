import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-makeup-mirror-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-MAKEUP-MIRROR-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-makeup-mirror.mjs';
export const VERIFIER_PATH = 'prototype/src/company/makeup-mirror-geometry.js';
export const IDS = ['round', 'lit-frame', 'arch', 'tri-fold'];
const OUTPUT_PATH = 'prototype/public/company-assets/makeup-mirror-v1';
const EVIDENCE_PATH = 'evidence/company-makeup-mirror-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const rectangle = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top]];

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-makeup-mirror-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.mirrors.map(mirror => mirror.id), IDS);
  assert.deepEqual(source.common.envelope, { width: .70, height: .60, depth: .16 });
  assert.deepEqual(source.common.surface, { schema: 'makeup-mirror-v1', profile: 'single-512-v1', maxFaces: 3 });
  assert.deepEqual(source.common.light, { kind: 'spot', color: '#fff4df', position: [0, .585, .065], target: [0, .43, .72], distance: 1.5, angle: .55, penumbra: .6 });
  assert.deepEqual(source.common.stateDefaults, { on: true, intensity: 5 });
  assert.equal(source.common.units, 'metres');
  assert.equal(source.common.up, '+Y');
  assert.equal(source.common.forward, '+Z');
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

function outerContour(polygon, width) {
  return polygon.map((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    const before = new THREE.Vector2(point[0] - previous[0], point[1] - previous[1]).normalize();
    const after = new THREE.Vector2(next[0] - point[0], next[1] - point[1]).normalize();
    const normal = new THREE.Vector2(before.y + after.y, -before.x - after.x).normalize();
    const distance = width / normal.dot(new THREE.Vector2(after.y, -after.x));
    return [point[0] + normal.x * distance, point[1] + normal.y * distance];
  });
}

export function designFor(mirror) {
  let polygon;
  if (mirror.id === 'round') {
    polygon = Array.from({ length: 48 }, (_, index) => {
      const angle = index * Math.PI * 2 / 48;
      return [.18 * Math.cos(angle), .18 * Math.sin(angle)];
    });
  } else if (mirror.id === 'arch') {
    polygon = [[-.17, -.185], [.17, -.185]];
    for (let index = 0; index <= 24; index++) {
      const angle = index * Math.PI / 24;
      polygon.push([.17 * Math.cos(angle), .015 + .17 * Math.sin(angle)]);
    }
  } else polygon = mirror.id === 'tri-fold' ? rectangle(-.14, -.185, .14, .185) : rectangle(-.20, -.18, .20, .18);
  const panels = [{ id: 'center', node: 'makeup-face-center', backNode: 'makeup-back-center', position: [0, .365, 0], yaw: 0, polygons: [polygon] }];
  if (mirror.id === 'tri-fold') {
    panels.push({ id: 'left', node: 'makeup-face-left', backNode: 'makeup-back-left', position: [-.14, .365, 0], yaw: Math.PI / 6, polygons: [rectangle(-.14, -.185, 0, .185)] });
    panels.push({ id: 'right', node: 'makeup-face-right', backNode: 'makeup-back-right', position: [.14, .365, 0], yaw: -Math.PI / 6, polygons: [rectangle(0, -.185, .14, .185)] });
  }
  return panels.map(panel => ({ ...panel, outer: outerContour(panel.polygons[0], mirror.frameWidth) }));
}

function planeTriangles(polygon, z, reverse = false) {
  const center = polygon.reduce((sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length], [0, 0]);
  return polygon.map((point, index) => {
    const triangle = [[...center, z], [...point, z], [...polygon[(index + 1) % polygon.length], z]];
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

function solidTriangles(polygon, bottom, top) {
  return [...planeTriangles(polygon, bottom, true), ...planeTriangles(polygon, top), ...sideTriangles(polygon, bottom, top)];
}

function ringTriangles(inner, outer, top) {
  const bottom = -.025;
  const triangles = [...sideTriangles(outer, bottom, top), ...sideTriangles(inner, bottom, top, true)];
  for (let index = 0; index < inner.length; index++) {
    const next = (index + 1) % inner.length;
    for (const z of [bottom, top]) {
      const a = [...inner[index], z], b = [...outer[index], z], c = [...outer[next], z], d = [...inner[next], z];
      const cap = [[a, b, c], [a, c, d]];
      triangles.push(...(z === bottom ? cap.map(triangle => triangle.reverse()) : cap));
    }
  }
  return triangles;
}

function geometryFrom(triangles, panel) {
  const transform = panel ? new THREE.Matrix4().makeTranslation(...panel.position).multiply(new THREE.Matrix4().makeRotationY(panel.yaw)) : new THREE.Matrix4();
  const positions = triangles.flat().flatMap(point => new THREE.Vector3(...point).applyMatrix4(transform).toArray().map(Math.fround));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function boxGeometry(min, max) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) for (let axis = 0; axis < 3; axis++)
    positions.setComponent(vertex, axis, Math.fround(positions.getComponent(vertex, axis) < 0 ? min[axis] : max[axis]));
  return geometry;
}

export function createMakeupMirror(mirror) {
  const root = new THREE.Group();
  root.name = `makeup-mirror-${mirror.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1 };
  const materials = {
    frame: new THREE.MeshStandardMaterial({ color: mirror.color, roughness: .38, metalness: .48 }),
    back: new THREE.MeshStandardMaterial({ color: '#343a40', roughness: .82, metalness: .05 }),
    face: new THREE.MeshStandardMaterial({ color: '#8a9298', roughness: .2, metalness: .6 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff4df', roughness: .55, metalness: 0, emissive: '#fff4df', emissiveIntensity: .75 })
  };
  const add = (name, geometry, material) => { const mesh = new THREE.Mesh(geometry, materials[material]); mesh.name = name; root.add(mesh); };
  add('makeup-base', boxGeometry([-.12, 0, -.07], [.12, .03, .07]), 'frame');
  add('makeup-post', boxGeometry([-.025, .03, -.035], [.025, .24, .005]), 'frame');
  for (const panel of designFor(mirror)) {
    add(panel.backNode, geometryFrom(solidTriangles(panel.polygons[0], -.025, -.009), panel), 'back');
    add(`makeup-frame-${panel.id}`, geometryFrom(ringTriangles(panel.polygons[0], panel.outer, mirror.ringFront), panel), 'frame');
    add(panel.node, geometryFrom(planeTriangles(panel.polygons[0], 0), panel), 'face');
  }
  if (mirror.id === 'tri-fold') for (const x of [-.14, .14])
    add(`makeup-hinge-${x < 0 ? 'left' : 'right'}`, boxGeometry([x - .009, .21, -.03], [x + .009, .52, -.006]), 'frame');
  add('makeup-lamp-riser', boxGeometry([-.015, .52, -.038], [.015, .588, -.012]), 'frame');
  add('makeup-lamp-arm', boxGeometry([-.015, .575, -.038], [.015, .595, .063]), 'frame');
  add('makeup-lamp', boxGeometry([-.08, .575, .053], [.08, .595, .077]), 'lamp');
  root.updateMatrixWorld(true);
  return root;
}

function dispose(root) {
  const materials = new Set();
  root.traverse(node => { node.geometry?.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material); });
  for (const material of materials) material.dispose();
}

export async function exportMakeupMirror(mirror) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); }
  };
  const root = createMakeupMirror(mirror);
  try { return Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [] })); }
  finally { dispose(root); }
}

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), { code, path: location, details });
}

export async function readback(bytes, mirror, resource) {
  const { validateMakeupMirrorGeometry } = await import(new URL(VERIFIER_PATH, ROOT));
  const scene = (await parse(bytes)).scene, expected = createMakeupMirror(mirror);
  scene.updateMatrixWorld(true);
  try {
    const actual = validateMakeupMirrorGeometry(scene, resource, failGeometry);
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
    id: `makeup-mirror-${mirror.id}`, displayName: mirror.label, version: 1, category: 'dynamic', mountRole: 'makeup-mirror', productionBranch: 'makeup-mirror', mount: 'support-surface',
    mounting: { origin: 'bottom', ...source.common.envelope }, coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only' },
    footprint: { center: [0, 0], halfSize: [.35, .08], blocking: false }, usePoints: [],
    mirrorSurface: source.common.surface,
    mirrorPanels: designFor(mirror).map(({ outer, ...panel }) => panel),
    makeupNodes: { base: 'makeup-base', post: 'makeup-post', lamp: 'makeup-lamp' },
    makeupLamp: { node: 'makeup-lamp', maxEmissiveIntensity: 1.5 }, light: source.common.light,
    stateDefaults: source.common.stateDefaults, stateSchema: { on: { type: 'boolean' }, intensity: { type: 'number', min: 0, max: 10 } },
    stateSemantics: { on: 'makeup-local-light-enabled-v1', intensity: 'makeup-local-light-candela-v1' },
    provenance: { ...provenance, license: source.license, prompt: `${source.common.promptStandard} Design: ${mirror.prompt}`, sourceDesign: mirror.id, method: 'Original closed parametric base/post/back/frame/lamp geometry. Finite convex pane contours and distinct tri-fold plane transforms are baked into Float32 resource-space vertices. Deterministic GLTFExporter with actual GLTFLoader readback and independent makeup-mirror geometry admission.', limitations: mirror.limitations },
    asset: { format: 'glb', url: `/company-assets/makeup-mirror-v1/${mirror.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
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
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = { sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins };
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length);
  const items = [];
  for (const mirror of source.mirrors.filter(candidate => ids.includes(candidate.id))) {
    const bytes = await exportMakeupMirror(mirror), repeat = await exportMakeupMirror(mirror);
    assert(bytes.equals(repeat), `Repeated export differs ${mirror.id}`);
    const resource = resourceFor(mirror, source, bytes, provenance);
    items.push({ mirror, bytes, resource, actual: await readback(bytes, mirror, resource), repeatedExportByteIdentical: true });
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
  const variantWidth = result.source.mirrors[0].frameWidth === .014 ? .012 : .014;
  changedSource.mirrors[0].frameWidth = variantWidth;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({ source: changedSource, sourceBytes: changedSourceBytes });
  assert.notEqual(variant.items[0].actual.geometrySha256, result.items[0].actual.geometrySha256);
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Other three models changed');
  const report = {
    status: 'passed', scope: 'CPU deterministic production and actual GLTFLoader / independent geometry readback of four tabletop makeup mirrors', provenance: result.provenance,
    geometryVerifier: result.source.dependencyPins.geometryVerifier,
    commands: ['node scripts/company-platform/build-makeup-mirror.mjs', 'node scripts/company-platform/build-makeup-mirror.mjs --check'],
    items: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual })),
    sourceModificationEvidence: { parameter: 'mirrors[0].frameWidth', before: result.source.mirrors[0].frameWidth, after: variantWidth, parameters: `${EVIDENCE_PATH}/variant-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/variant-round.glb`, beforeSha256: result.items[0].resource.asset.sha256, afterSha256: variant.items[0].resource.asset.sha256, beforeGeometrySha256: result.items[0].actual.geometrySha256, afterGeometrySha256: variant.items[0].actual.geometrySha256, actual: variant.items[0].actual, otherThreeModelsByteIdentical: true },
    limits: ['CPU production and geometry evidence only. Browser reflection, real illumination, transactions, closed-process restoration, recording, ordinary-device performance and human visual acceptance require separate evidence.', 'Fixed tri-fold opening geometry. No movable hinge or folding state.', 'Warm-white light geometry is authored here. Actual SpotLight and GPU reflection are rebuilt by the shared runtime. C3 character illumination remains outside this production check.']
  };
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/variant-parameters.json`, changedSourceBytes], [`${EVIDENCE_PATH}/variant-round.glb`, variant.items[0].bytes], [`${EVIDENCE_PATH}/variant-round-resource.json`, jsonBytes(variant.items[0].resource)]]);
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
