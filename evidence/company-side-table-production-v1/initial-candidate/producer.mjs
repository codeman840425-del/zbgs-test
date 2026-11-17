import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-side-table-v1/parameters.json';
export const GENERATOR_PATH = 'scripts/company-platform/build-side-table.mjs';
export const CONTRACT_PATH = 'docs/COMPANY-SIDE-TABLE-CONTRACT-v1.txt';
export const VERIFIER_PATH = 'prototype/src/company/side-table-geometry.js';
export const DATA_PATH = 'prototype/src/company/side-table-data.js';
export const IDS = ['round', 'square', 'nested', 'low'];
const OUTPUT_PATH = 'prototype/public/company-assets/side-table-v1';
const EVIDENCE_PATH = 'evidence/company-side-table-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const area = triangle => new THREE.Triangle(...triangle.map(point => new THREE.Vector3(...point))).getArea();
const pointKey = point => point.map(value => Math.round(value / 1e-7)).join(',');

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-side-table-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.designs.map(design => design.id), IDS);
  assert.deepEqual(source.common.mounting, {origin: 'bottom', width: .8, height: .5, depth: .55});
  assert.deepEqual(source.common.footprint, {center: [0, 0], halfSize: [.4, .275], blocking: true});
  assert.deepEqual(source.common.supportSurfaces, [{id: 'top', center: [0, 0], topY: .5, halfSize: [.15, .11], clearanceHeight: .35}]);
  assert.deepEqual(source.round, {segments: 48, radius: .26, uniformXZ: .65});
  assert(source.nested.smallOffsetX >= .23 && source.nested.smallOffsetX <= .24);
  assert.deepEqual(source.cleanup, {zeroAreaThreshold: 1e-12, positionWeldMetres: 1e-7});
  assert.equal(source.originalPackage.license, 'CC0');
  assert(source.common.promptStandard.length > 300);
}

function dispose(root) {
  const materials = new Set();
  root.traverse(node => {
    node.geometry?.dispose();
    for (const material of node.material ? [node.material].flat() : []) materials.add(material);
  });
  for (const material of materials) material.dispose();
}

function geometryFrom(triangles) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2).map(value => Math.abs(value) < 1e-8 ? 0 : Math.fround(value)), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function trianglesFrom(mesh) {
  const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex(), triangles = [];
  for (let offset = 0; offset < (index?.count ?? positions.count); offset += 3) {
    triangles.push([0, 1, 2].map(step => new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(offset + step) : offset + step).applyMatrix4(mesh.matrixWorld).toArray()));
  }
  return triangles;
}

function face(triangle, normalY) {
  const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(new THREE.Vector3(...triangle[1]), new THREE.Vector3(...triangle[0])), new THREE.Vector3().subVectors(new THREE.Vector3(...triangle[2]), new THREE.Vector3(...triangle[0])));
  return normal.y * normalY < 0 ? [...triangle].reverse() : triangle;
}

function topPatch(y) {
  const corners = [[-.15, y, -.11], [.15, y, -.11], [.15, y, .11], [-.15, y, .11]];
  return [face([corners[0], corners[1], corners[2]], 1), face([corners[0], corners[2], corners[3]], 1)];
}

function clipBelow(triangle, y) {
  const polygon = [];
  for (let index = 0; index < triangle.length; index++) {
    const a = triangle[index], b = triangle[(index + 1) % triangle.length];
    const insideA = a[1] <= y + 1e-8, insideB = b[1] <= y + 1e-8;
    if (insideA) polygon.push(a.map((value, axis) => axis === 1 && Math.abs(value - y) < 1e-8 ? y : value));
    if (insideA !== insideB) {
      const t = (y - a[1]) / (b[1] - a[1]);
      polygon.push(a.map((value, axis) => axis === 1 ? y : value + (b[axis] - value) * t));
    }
  }
  return polygon.slice(1, -1).map((point, index) => [polygon[0], point, polygon[index + 2]]).filter(triangle => area(triangle) > 1e-12);
}

// The original support intersects the measured underside of its old hex slab.
// Only this finite horizontal cut is capped. Its cap is part of the real support.
function closeSupportCut(triangles, y) {
  const points = new Map(), segments = [];
  for (const triangle of triangles) for (let index = 0; index < 3; index++) {
    const a = triangle[index], b = triangle[(index + 1) % 3];
    if (Math.abs(a[1] - y) > 1e-7 || Math.abs(b[1] - y) > 1e-7 || pointKey(a) === pointKey(b)) continue;
    points.set(pointKey(a), a); points.set(pointKey(b), b); segments.push([pointKey(a), pointKey(b)]);
  }
  const edges = new Map();
  for (const [a, b] of segments) {
    const key = [a, b].sort().join('|');
    if (edges.has(key)) edges.delete(key);
    else edges.set(key, [a, b]);
  }
  const caps = [], pending = [...edges.values()];
  while (pending.length) {
    const first = pending.shift(), loop = [first[0], first[1]];
    while (loop.at(-1) !== loop[0]) {
      const index = pending.findIndex(edge => edge.includes(loop.at(-1)));
      assert(index >= 0, 'Original support cut has an open boundary chain');
      const edge = pending.splice(index, 1)[0];
      loop.push(edge[0] === loop.at(-1) ? edge[1] : edge[0]);
      assert(loop.length <= points.size + 1, 'Support cut loop did not close');
    }
    const vertices = loop.slice(0, -1).map(key => points.get(key));
    const planar = vertices.map(point => new THREE.Vector2(point[0], point[2]));
    for (const indices of THREE.ShapeUtils.triangulateShape(planar, [])) caps.push(face(indices.map(index => vertices[index]), 1));
  }
  assert(caps.length && caps.reduce((sum, triangle) => sum + area(triangle), 0) > 1e-6, 'Support cut must have a real positive-area cap');
  return [...triangles, ...caps];
}

function roundBoard(source, bottom) {
  const count = source.round.segments, radius = source.round.radius;
  const contour = Array.from({length: count}, (_, index) => new THREE.Vector2(radius * Math.cos(index * Math.PI * 2 / count), radius * Math.sin(index * Math.PI * 2 / count)));
  const hole = [new THREE.Vector2(-.15, -.11), new THREE.Vector2(.15, -.11), new THREE.Vector2(.15, .11), new THREE.Vector2(-.15, .11)];
  const vertices = [...contour, ...hole];
  const triangles = THREE.ShapeUtils.triangulateShape(contour, [hole]).map(indices => face(indices.map(index => [vertices[index].x, .5, vertices[index].y]), 1));
  for (let index = 0; index < count; index++) {
    const current = contour[index], next = contour[(index + 1) % count];
    const a = [current.x, bottom, current.y], b = [next.x, bottom, next.y], c = [next.x, .5, next.y], d = [current.x, .5, current.y];
    triangles.push(face([[0, bottom, 0], a, b], -1), [a, b, c], [a, c, d]);
  }
  // Positive XZ contour winding yields inward side normals for an upright slab.
  for (let index = triangles.length - count * 3; index < triangles.length; index += 3) {
    triangles[index + 1].reverse(); triangles[index + 2].reverse();
  }
  return triangles;
}

export async function createSideTable(design, source, originalBytes) {
  const scene = (await parse(originalBytes)).scene;
  scene.updateMatrixWorld(true);
  const raw = [];
  scene.traverse(mesh => {if (mesh.isMesh) raw.push({mesh, triangles: trianglesFrom(mesh)});});
  const bounds = new THREE.Box3().setFromPoints(raw.flatMap(item => item.triangles.flat().map(point => new THREE.Vector3(...point))));
  const dimensions = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const root = new THREE.Group(); root.name = `side-table-${design.id}`;
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1};
  const materials = new Map();
  const cloneMaterial = original => {
    if (!materials.has(original)) materials.set(original, original.clone());
    return materials.get(original);
  };
  const add = (name, triangles, material) => {
    assert(triangles.length, `Empty adapted part ${name}`);
    const mesh = new THREE.Mesh(geometryFrom(triangles), material); mesh.name = name; root.add(mesh);
  };
  const mapped = (triangles, size, x) => triangles.filter(triangle => area(triangle) > source.cleanup.zeroAreaThreshold).map(triangle => triangle.map(point => [
    (point[0] - center.x) * (design.id === 'round' ? source.round.uniformXZ : size[0] / dimensions.x) + x,
    (point[1] - bounds.min.y) * size[1] / dimensions.y,
    (point[2] - center.z) * (design.id === 'round' ? source.round.uniformXZ : size[2] / dimensions.z)
  ]));
  try {
    if (design.id === 'round') {
      const original = raw[0], transformed = mapped(original.triangles, design.size, 0);
      const underside = transformed.filter(triangle => Math.abs(triangle[0][1] - triangle[1][1]) < 1e-7 && Math.abs(triangle[0][1] - triangle[2][1]) < 1e-7 && triangle[0][1] < .5 - 1e-6).map(triangle => triangle[0][1]);
      const bottom = Math.max(...underside);
      assert(bottom > .42 && bottom < .44, 'Measured original slab underside differs');
      const lower = transformed.filter(triangle => !triangle.every(point => Math.abs(point[1] - bottom) < 1e-7)).flatMap(triangle => clipBelow(triangle, bottom));
      const material = cloneMaterial(original.mesh.material);
      add('side-table-round-support', closeSupportCut(lower, bottom), material);
      add('side-table-round-board', roundBoard(source, bottom), material);
      add('side-table-top', topPatch(.5), material);
    } else {
      const instances = [{size: design.size, x: design.centerX, small: false}];
      if (design.id === 'nested') instances.push({size: design.smallSize, x: source.nested.smallOffsetX, small: true});
      for (const instance of instances) for (const [index, item] of raw.entries()) {
        const triangles = mapped(item.triangles, instance.size, instance.x);
        const top = instance.small ? [] : triangles.filter(triangle => triangle.every(point => Math.abs(point[1] - .5) < 1e-7));
        const remainder = instance.small ? triangles : triangles.filter(triangle => !top.includes(triangle));
        const name = design.id === 'square' ? `side-table-square-${['body', 'door', 'handle'][index]}` : design.id === 'nested' ? `side-table-nested-${instance.small ? 'small' : 'main'}` : 'side-table-low-body';
        const material = cloneMaterial(item.mesh.material);
        add(name, remainder, material);
        if (top.length) add('side-table-top', top, material);
      }
    }
    root.updateMatrixWorld(true);
    return root;
  } catch (error) {dispose(root); throw error;}
  finally {dispose(scene);}
}

export async function exportSideTable(design, source, originalBytes) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {blob.arrayBuffer().then(result => {this.result = result; this.onloadend?.({target: this});}).catch(error => this.onerror?.(error));}
  };
  const root = await createSideTable(design, source, originalBytes);
  try {return Buffer.from(await new GLTFExporter().parseAsync(root, {binary: true, animations: []}));}
  finally {dispose(root);}
}

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), {code, path: location, details});
}

export function resourceFor(design, source, bytes, provenance) {
  return {
    id: `side-table-${design.id}`, version: 1, displayName: design.label, category: 'decor', mountRole: 'side-table', productionBranch: 'side-table', mount: 'floor-surface',
    mounting: source.common.mounting, coordinates: source.common.coordinates, footprint: source.common.footprint, usePoints: [], stateDefaults: {},
    supportSurfaces: source.common.supportSurfaces, supportNodes: {top: 'side-table-top'},
    provenance: {...provenance, sourceDesign: design.id, license: source.license, prompt: `${source.common.promptStandard} Design: ${design.prompt}`, externalSource: {...source.originalPackage, sourceModel: design.source}, limitations: ['Static furniture and fixed nested arrangement. No door or slide mechanism.', 'Actual source/geometry admission is CPU evidence. Runtime contact, copying, closed-process restoration, ordinary-device performance and visual acceptance need separate evidence.']},
    asset: {format: 'glb', url: `/company-assets/side-table-v1/${design.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length}
  };
}

export async function readback(bytes, design, source, resource, originalBytes) {
  const {validateSideTableResource} = await import(new URL(DATA_PATH, ROOT));
  const {validateSideTableGeometry} = await import(new URL(VERIFIER_PATH, ROOT));
  validateSideTableResource(resource, failGeometry);
  const scene = (await parse(bytes)).scene, expected = await createSideTable(design, source, originalBytes);
  try {
    const support = validateSupportGeometry(scene, resource, failGeometry);
    const geometry = validateSideTableGeometry(scene, resource, failGeometry);
    assert(geometry.checked && support.checked);
    const digest = createHash('sha256'), materials = new Set(); let triangles = 0, meshes = 0;
    scene.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'Production nodes must use identity transforms');
      if (!node.isMesh) return;
      const original = expected.getObjectByName(node.name);
      assert(original?.isMesh, `Unknown exported part ${node.name}`);
      assert.deepEqual(node.geometry.attributes.position.array, original.geometry.attributes.position.array, `Source vertices differ ${node.name}`);
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; meshes++; materials.add(node.material);
      digest.update(node.name); digest.update(Buffer.from(node.geometry.attributes.position.array.buffer));
    });
    assert(meshes === expected.children.length && triangles <= 2500 && meshes <= 32 && materials.size <= 4);
    const bounds = new THREE.Box3().setFromObject(scene), gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    assert(!gltf.images?.length && !gltf.animations?.length && (gltf.buffers ?? []).every(buffer => !buffer.uri));
    return {support, geometry, bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, triangleCount: triangles, meshCount: meshes, materialCount: materials.size, sourceVerticesMatch: true, identityAllNodes: true, geometrySha256: digest.digest('hex'), externalUris: 0, textures: 0, animations: 0};
  } finally {dispose(scene); dispose(expected);}
}

export async function buildCollection({source, sourceBytes, ids = IDS} = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT)); source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source); validateSource(source);
  const dependencies = new Map();
  for (const pin of Object.values(source.dependencyPins)) dependencies.set(pin.path, await readPin(pin));
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(source.dependencyPins.geometryVerifier.path, VERIFIER_PATH);
  assert.equal(source.dependencyPins.dataVerifier.path, DATA_PATH);
  const generatorBytes = await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  const provenance = {sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: source.dependencyPins.functionalContract.sha256, dependencies: source.dependencyPins, sourceFiles: Object.values(source.dependencyPins).filter(pin => pin.path.startsWith('assets-source/')).map(pin => ({path: pin.path, sha256: pin.sha256}))};
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length);
  const items = [];
  for (const design of source.designs.filter(design => ids.includes(design.id))) {
    const originalBytes = dependencies.get(`assets-source/company-side-table-v1/original/${design.source}.glb`);
    assert(originalBytes, `Missing pinned original GLB ${design.source}`);
    const bytes = await exportSideTable(design, source, originalBytes);
    assert(bytes.equals(await exportSideTable(design, source, originalBytes)), 'Repeated export differs');
    const resource = resourceFor(design, source, bytes, provenance);
    items.push({design, bytes, resource, actual: await readback(bytes, design, source, resource, originalBytes)});
  }
  const collection = {id: source.id, version: 1, category: 'decor', provenance, resources: items.map(({resource}) => ({id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256}))};
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {files.set(`${OUTPUT_PATH}/${item.design.id}/v1/model.glb`, item.bytes); files.set(`${OUTPUT_PATH}/${item.design.id}/v1/resource.json`, jsonBytes(item.resource));}
  return {source, provenance, items, collection, files};
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection(), beforeSource = structuredClone(result.source);
  beforeSource.nested.smallOffsetX = result.source.sourceModification.before;
  const beforeBytes = jsonBytes(beforeSource), before = await buildCollection({source: beforeSource, sourceBytes: beforeBytes});
  for (let index = 0; index < 4; index++) {
    if (IDS[index] === 'nested') assert.notEqual(before.items[index].actual.geometrySha256, result.items[index].actual.geometrySha256);
    else assert(before.items[index].bytes.equals(result.items[index].bytes), 'Other three models changed');
  }
  const report = {status: 'passed', scope: 'CPU deterministic production and actual loaded geometry of four Kenney-derived side tables', provenance: result.provenance,
    items: result.items.map(item => ({id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual})),
    sourceModificationEvidence: {parameter: 'nested.smallOffsetX', before: beforeSource.nested.smallOffsetX, after: result.source.nested.smallOffsetX, beforeSha256: before.items[2].resource.asset.sha256, afterSha256: result.items[2].resource.asset.sha256, otherThreeModelsByteIdentical: true, beforeActual: before.items[2].actual, afterActual: result.items[2].actual},
    limitations: ['Actual game loading, parent/child transactions, process-closed restoration, fixed-source rebuild and visual acceptance require separate evidence.', 'No transparent glass, dynamic door or sliding/nesting mechanism is included.']};
  if (process.argv.includes('--check')) {
    for (const [file, bytes] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(bytes), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/before-parameters.json`, beforeBytes], [`${EVIDENCE_PATH}/before-nested.glb`, before.items[2].bytes], [`${EVIDENCE_PATH}/before-nested-resource.json`, jsonBytes(before.items[2].resource)]]);
    for (const [file, bytes] of [...result.files, ...evidence]) {const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes);}
  }
  console.log(JSON.stringify({status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: result.items.map(item => ({id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length}))}));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(async error => {
  if (!process.argv.includes('--check')) {const directory = new URL(`${EVIDENCE_PATH}/failures/`, ROOT); await fs.mkdir(directory, {recursive: true}); const bytes = jsonBytes({status: 'failed', message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack}); await fs.writeFile(new URL(`${sha256(bytes).slice(0, 16)}.json`, directory), bytes);}
  console.error(error.stack || error); process.exitCode = 1;
});
