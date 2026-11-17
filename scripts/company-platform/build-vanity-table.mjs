import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateSupportGeometry } from '../../prototype/src/company/support-geometry.js';
import { validateVanityGeometry } from '../../prototype/src/company/vanity-geometry.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-vanity-table-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-VANITY-TABLE-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-vanity-table.mjs';
export const IDS = ['plain', 'drawer-style', 'corner', 'mobile'];
const OUTPUT_PATH = 'prototype/public/company-assets/vanity-table-v1';
const EVIDENCE_PATH = 'evidence/company-vanity-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const CLEARANCE = { schema: 'vanity-clearance-v1', knee: { min: [-.33, 0, -.12], max: [.37, .70, .25] }, front: { min: [-1, .25], max: [1, 1.50] }, seat: { mountRole: 'vanity-chair-side-entry', position: [.02, 0, .55], yaw: Math.PI } };

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-vanity-table-v1');
  assert.equal(source.version, 1);
  assert.equal(source.common.units, 'metres');
  assert.equal(source.common.up, '+Y');
  assert.equal(source.common.forward, '+Z');
  assert.deepEqual(source.common.envelope, { width: 1.1, height: .78, depth: .5 });
  assert.equal(source.common.boardThickness, .035);
  assert.deepEqual(source.common.footprint, { center: [0, 0], halfSize: [.55, .25], blocking: true });
  assert.deepEqual(source.common.supportSurfaces, [{ id: 'top', center: [.02, 0], topY: .78, halfSize: [.4, .22], clearanceHeight: .65 }]);
  assert.deepEqual(source.common.supportNodes, { top: 'vanity-top' });
  assert.deepEqual(source.common.clearance, CLEARANCE);
  assert.equal(source.common.promptStandard.length > 150, true);
  assert.equal(source.license.includes('original'), true);
  assert.deepEqual(source.tables.map(table => table.id), IDS);
  for (const table of source.tables) {
    assert(table.label && table.prompt && table.limitations.length > 0);
    assert(/^#[a-f0-9]{6}$/i.test(table.color));
    const min = table.id === 'mobile' ? .04 : .045;
    const max = table.id === 'mobile' ? .055 : .065;
    assert(Number.isFinite(table.frameWidth) && table.frameWidth >= min && table.frameWidth <= max, `frameWidth outside the authored range ${table.id}`);
  }
  assert.equal(source.tables[3].wheelRadius, .045);
  assert.equal(source.tables[3].wheelWidth, .035);
  assert.equal(source.tables[3].wheelSegments, 12);
}

export function partDefinitions(table) {
  const parts = [];
  const box = (name, min, max, material = 'frame') => parts.push({ name, kind: 'box', min, max, material });
  const w = table.frameWidth;
  const leg = (name, x, z, bottom = 0) => box(name, [x - w / 2, bottom, z - w / 2], [x + w / 2, .745, z + w / 2]);
  box('vanity-top', [table.id === 'corner' ? -.4 : -.55, .745, -.25], [.55, .78, .25], 'top');
  if (table.id === 'corner') {
    box('vanity-wing', [-.55, .745, -.25], [-.4, .78, 0], 'top');
    leg('vanity-leg-left-back', -.5, -.21);
    leg('vanity-leg-left-front', -.37, .21);
    leg('vanity-leg-right-back', .5, -.21);
    leg('vanity-leg-right-front', .5, .21);
  } else if (table.id === 'drawer-style') {
    box('vanity-cabinet', [-.55, 0, -.23], [-.4, .745, .23]);
    for (const [index, bottom] of [.10, .31, .52].entries()) {
      box(`vanity-fixed-panel-${index + 1}`, [-.544, bottom, .222], [-.406, bottom + .19, .243], 'top');
      box(`vanity-fixed-handle-${index + 1}`, [-.512, bottom + .08, .236], [-.438, bottom + .105, .249], 'metal');
    }
    leg('vanity-leg-right-back', .5, -.21);
    leg('vanity-leg-right-front', .5, .21);
  } else if (table.id === 'mobile') {
    for (const x of [-.5, .5]) for (const z of [-.205, .205]) {
      const suffix = `${x < 0 ? 'left' : 'right'}-${z < 0 ? 'back' : 'front'}`;
      leg(`vanity-leg-${suffix}`, x, z, .10);
      box(`vanity-caster-bridge-${suffix}`, [x - .027, .086, z - .025], [x + .027, .115, z + .025], 'metal');
      for (const side of [-1, 1]) {
        const centerX = x + side * .021;
        box(`vanity-caster-fork-${suffix}-${side < 0 ? 'a' : 'b'}`, [centerX - .006, .035, z - .02], [centerX + .006, .10, z + .02], 'metal');
      }
      parts.push({ name: `vanity-caster-wheel-${suffix}`, kind: 'cylinder-x', center: [x, table.wheelRadius, z], radius: table.wheelRadius, width: table.wheelWidth, segments: table.wheelSegments, material: 'rubber' });
    }
  } else {
    for (const x of [-.5, .5]) for (const z of [-.21, .21]) leg(`vanity-leg-${x < 0 ? 'left' : 'right'}-${z < 0 ? 'back' : 'front'}`, x, z);
  }
  box('vanity-back-brace', [-.5, .63, -.245], [.5, .73, -.205]);
  return parts;
}

function geometryFor(part) {
  if (part.kind === 'box') {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const positions = geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex++) for (let axis = 0; axis < 3; axis++) {
      positions.setComponent(vertex, axis, Math.fround(positions.getComponent(vertex, axis) < 0 ? part.min[axis] : part.max[axis]));
    }
    return geometry;
  }
  const geometry = new THREE.CylinderGeometry(part.radius, part.radius, part.width, part.segments, 1, false);
  const positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const localX = positions.getX(vertex), localY = positions.getY(vertex), localZ = positions.getZ(vertex);
    positions.setXYZ(vertex, Math.fround(part.center[0] - localY), Math.fround(Math.abs(part.center[1] + localX) < 1e-8 ? 0 : part.center[1] + localX), Math.fround(part.center[2] + localZ));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function dispose(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function createVanityTable(table) {
  const root = new THREE.Group();
  root.name = `vanity-table-${table.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1 };
  const materials = {
    frame: new THREE.MeshStandardMaterial({ color: table.color, roughness: .72, metalness: .08 }),
    top: new THREE.MeshStandardMaterial({ color: '#e3c9a6', roughness: .68, metalness: .02 }),
    metal: new THREE.MeshStandardMaterial({ color: '#7b8794', roughness: .38, metalness: .65 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#343a40', roughness: .95, metalness: 0 })
  };
  const used = new Set();
  for (const part of partDefinitions(table)) {
    const mesh = new THREE.Mesh(geometryFor(part), materials[part.material]);
    mesh.name = part.name;
    root.add(mesh);
    used.add(part.material);
  }
  for (const [name, material] of Object.entries(materials)) if (!used.has(name)) material.dispose();
  root.updateMatrixWorld(true);
  return root;
}

export async function exportVanityTable(table) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error));
    }
  };
  const root = createVanityTable(table);
  try { return Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [] })); }
  finally { dispose(root); }
}

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), { code, path: location, details });
}

export async function readback(bytes, table, resource) {
  const scene = (await parse(bytes)).scene;
  scene.updateMatrixWorld(true);
  try {
    const support = validateSupportGeometry(scene, resource, failGeometry);
    const vanity = validateVanityGeometry(scene, resource, failGeometry);
    assert.equal(support.checked, true);
    assert.equal(vanity.checked, true);
    const meshes = [];
    scene.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'Production nodes must use identity transforms');
      if (node.isMesh) meshes.push(node);
    });
    const parts = partDefinitions(table);
    assert.equal(meshes.length, parts.length);
    const geometryDigest = createHash('sha256');
    let triangleCount = 0;
    const materials = new Set();
    const solids = parts.map(part => {
      const matches = meshes.filter(mesh => mesh.name === part.name);
      assert.equal(matches.length, 1, `Expected one source part ${part.name}`);
      const mesh = matches[0], expected = geometryFor(part);
      try {
        assert.deepEqual(mesh.geometry.getAttribute('position').array, expected.getAttribute('position').array, `Actual source vertices differ ${part.name}`);
        assert.deepEqual(mesh.geometry.getIndex()?.array, expected.getIndex()?.array, `Actual source topology differs ${part.name}`);
      } finally { expected.dispose(); }
      const count = mesh.geometry.getIndex().count / 3;
      triangleCount += count;
      materials.add(mesh.material);
      const positions = mesh.geometry.getAttribute('position').array;
      geometryDigest.update(part.name);
      geometryDigest.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
      const bounds = new THREE.Box3().setFromObject(mesh);
      return { name: part.name, kind: part.kind, min: bounds.min.toArray(), max: bounds.max.toArray(), triangles: count };
    });
    assert(triangleCount <= 2500 && meshes.length <= 32 && materials.size <= 4, 'Resource budget exceeded');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined));
    assert.equal(gltf.images?.length ?? 0, 0);
    assert.equal(gltf.animations?.length ?? 0, 0);
    const bounds = new THREE.Box3().setFromObject(scene);
    return { support, vanity, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, meshCount: meshes.length, triangleCount, materialCount: materials.size, identityAllNodes: true, sourceVerticesAndTopologyMatch: true, geometrySha256: geometryDigest.digest('hex'), externalUris: 0, textures: 0, animations: 0, solids };
  } finally { dispose(scene); }
}

export function resourceFor(table, source, bytes, provenance) {
  return {
    id: `vanity-table-${table.id}`, displayName: table.label, version: 1, category: 'decor',
    mountRole: 'vanity-table', productionBranch: 'vanity-table', mount: 'floor-surface',
    mounting: { origin: 'bottom', ...source.common.envelope },
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only' },
    footprint: source.common.footprint, supportSurfaces: source.common.supportSurfaces, supportNodes: source.common.supportNodes,
    clearance: source.common.clearance, stateDefaults: {}, usePoints: [],
    provenance: { ...provenance, license: source.license, prompt: `${source.common.promptStandard} Design: ${table.prompt}`, sourceDesign: table.id, method: 'Original bounded boxes and closed 12-segment cylinders. Final source bounds are baked into Float32 vertices, with identity nodes. Actual GLTFLoader readback passes shared support and independent vanity solid/connection/knee checks.', limitations: table.limitations },
    asset: { format: 'glb', url: `/company-assets/vanity-table-v1/${table.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
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
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = { sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins };
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length);
  const items = [];
  for (const table of source.tables.filter(candidate => ids.includes(candidate.id))) {
    const bytes = await exportVanityTable(table), repeat = await exportVanityTable(table);
    assert(bytes.equals(repeat), `Repeated export differs ${table.id}`);
    const resource = resourceFor(table, source, bytes, provenance);
    items.push({ table, bytes, resource, actual: await readback(bytes, table, resource), repeatedExportByteIdentical: true });
  }
  assert.equal(new Set(items.map(item => item.resource.asset.sha256)).size, ids.length);
  const resources = items.map(item => item.resource);
  const collection = { id: source.id, version: 1, category: 'decor', provenance, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {
    files.set(`${OUTPUT_PATH}/${item.table.id}/v1/model.glb`, item.bytes);
    files.set(`${OUTPUT_PATH}/${item.table.id}/v1/resource.json`, jsonBytes(item.resource));
  }
  return { source, provenance, items, resources, collection, files };
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection();
  const changedSource = structuredClone(result.source);
  const variantFrameWidth = result.source.tables[0].frameWidth === .06 ? .055 : .06;
  changedSource.tables[0].frameWidth = variantFrameWidth;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({ source: changedSource, sourceBytes: changedSourceBytes });
  assert.notEqual(variant.items[0].actual.geometrySha256, result.items[0].actual.geometrySha256);
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Other three models changed');
  const report = {
    status: 'passed', scope: 'CPU production and actual GLTFLoader readback of four original static vanity tables',
    commands: ['node scripts/company-platform/build-vanity-table.mjs', 'node scripts/company-platform/build-vanity-table.mjs --check'], provenance: result.provenance,
    geometryVerifier: { path: 'prototype/src/company/vanity-geometry.js', sha256: sha256(await fs.readFile(new URL('prototype/src/company/vanity-geometry.js', ROOT))) },
    supportVerifier: { path: 'prototype/src/company/support-geometry.js', sha256: sha256(await fs.readFile(new URL('prototype/src/company/support-geometry.js', ROOT))) },
    items: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual })),
    sourceModificationEvidence: { parameter: 'tables[0].frameWidth', before: result.source.tables[0].frameWidth, after: variantFrameWidth, parameters: `${EVIDENCE_PATH}/variant-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/variant-plain.glb`, beforeSha256: result.items[0].resource.asset.sha256, afterSha256: variant.items[0].resource.asset.sha256, beforeGeometrySha256: result.items[0].actual.geometrySha256, afterGeometrySha256: variant.items[0].actual.geometrySha256, actual: variant.items[0].actual, otherThreeModelsByteIdentical: true },
    limits: ['Static closed drawer-style exterior and static casters. No pulling, rolling or furniture anti-tip simulation.', 'CPU production evidence. Browser layout, loading/transactions, close/reopen, normal-speed recording, ordinary-device performance, role C3 and human visual acceptance need their own evidence.', 'The corner top has the required real left-front notch. A conservative rectangular footprint covers that notch for layout.']
  };
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/variant-parameters.json`, changedSourceBytes], [`${EVIDENCE_PATH}/variant-plain.glb`, variant.items[0].bytes], [`${EVIDENCE_PATH}/variant-plain-resource.json`, jsonBytes(variant.items[0].resource)]]);
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
