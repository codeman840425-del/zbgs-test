import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateMirrorGeometry } from '../../prototype/src/company/mirror-geometry.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-floor-mirror-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-FLOOR-MIRROR-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-floor-mirror.mjs';
const OUTPUT_PATH = 'prototype/public/company-assets/floor-mirror-v1';
const EVIDENCE_PATH = 'evidence/company-floor-mirror-production-v1';
const IDS = ['round', 'full', 'arch', 'grid'];
const EPSILON = 1e-6;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const near = (a, b) => Math.abs(a - b) < EPSILON;
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-floor-mirror-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.mirrors.map(mirror => mirror.id), IDS);
  assert.deepEqual(source.common.envelope, { width: .8, height: 1.8, depth: .6 });
  assert.deepEqual(source.common.footprint, { center: [0, 0], halfSize: [.4, .3], blocking: true });
  assert.deepEqual(source.common.surface, { schema: 'planar-mirror-v1', profile: 'single-512-v1', position: [0, .92, .026] });
  assert.equal(source.common.vertexTranslationY, .92);
  assert.deepEqual(source.common.base, { name: 'mirror-base', size: [.24, .06, .38], position: [0, .03, 0] });
  assert.deepEqual(source.common.post, { name: 'mirror-post', size: [.08, .52, .04], position: [0, .32, -.005] });
  assert(source.common.promptStandard.length > 100 && source.license.length > 20);
  for (const mirror of source.mirrors) {
    assert.equal(mirror.baseResource.id, `mirror-${mirror.id}`);
    assert.equal(mirror.baseResource.version, 1);
    assert.equal(mirror.baseModelSha256, mirror.baseResource.asset.sha256);
    assert.equal(mirror.baseModelPath, `prototype/public${mirror.baseResource.asset.url}`);
    assert(/^#[a-f0-9]{6}$/i.test(mirror.color) && mirror.parts.length > 0);
    const names = new Set(['mirror-base', 'mirror-post', 'mirror-back', 'mirror-frame', 'mirror-surface']);
    for (const part of mirror.parts) {
      assert(typeof part.name === 'string' && !names.has(part.name), 'Repeated part name');
      names.add(part.name);
      assert(part.size.length === 3 && part.position.length === 3);
      assert(part.size.every(value => Number.isFinite(value) && value > 0));
      assert(part.position.every(Number.isFinite));
    }
  }
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

export async function createFloorMirror(mirror, source, baseBytes) {
  assert.equal(sha256(baseBytes), mirror.baseModelSha256, 'Original wall mirror bytes differ');
  const loaded = await parse(baseBytes), root = new THREE.Group();
  root.name = `floor-mirror-${mirror.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1 };
  try {
    const frame = loaded.scene;
    frame.name = 'mirror-wall-assembly';
    frame.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'Pinned wall assembly must use identity nodes');
      if (node.isMesh) node.geometry.translate(0, source.common.vertexTranslationY, 0);
    });
    root.add(frame);
    const material = new THREE.MeshStandardMaterial({ color: mirror.color, roughness: .58, metalness: .24 });
    for (const part of [source.common.base, source.common.post, ...mirror.parts]) {
      const geometry = new THREE.BoxGeometry(...part.size);
      // Bake final source corners directly. Translating already-rounded half
      // sizes creates a tiny gap at the shared base/post y=.06 interface.
      const positions = geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        for (let axis = 0; axis < 3; axis++) {
          const sign = Math.sign(positions.getComponent(vertex, axis));
          positions.setComponent(vertex, axis, Math.fround(part.position[axis] + sign * part.size[axis] / 2));
        }
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = part.name;
      root.add(mesh);
    }
    root.updateMatrixWorld(true);
    return root;
  } catch (error) {
    dispose(root);
    if (!loaded.scene.parent) dispose(loaded.scene);
    throw error;
  }
}

export async function exportFloorMirror(mirror, source, baseBytes) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error));
    }
  };
  const root = await createFloorMirror(mirror, source, baseBytes);
  try { return Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [] })); }
  finally { dispose(root); }
}

function resolve(scene, name) {
  const matches = [];
  scene.traverse(node => { if (node.name === name) matches.push(node); });
  assert(matches.length === 1 && matches[0].isMesh, `Expected one mesh ${name}`);
  return matches[0];
}

function actualTriangles(mesh) {
  const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getIndex();
  const count = indices?.count ?? positions.count, triangles = [];
  assert(positions.count > 0 && count % 3 === 0);
  for (let offset = 0; offset < count; offset += 3) {
    const points = [0, 1, 2].map(step => {
      const index = indices ? indices.getX(offset + step) : offset + step;
      assert(Number.isInteger(index) && index >= 0 && index < positions.count);
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      assert(point.toArray().every(Number.isFinite), 'Nonfinite vertex');
      return point;
    });
    const cross = new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0]));
    assert(cross.length() / 2 > 1e-9, `Degenerate triangle ${mesh.name}`);
    triangles.push({ points, cross });
  }
  return triangles;
}

function requireBox(mesh, part) {
  const triangles = actualTriangles(mesh), ranges = part.position.map((value, axis) => [value - part.size[axis] / 2, value + part.size[axis] / 2]);
  const actualBounds = new THREE.Box3();
  for (const triangle of triangles) for (const point of triangle.points) actualBounds.expandByPoint(point);
  assert.equal(triangles.length, 12, `Expected 12 box triangles ${part.name}`);
  for (let axis = 0; axis < 3; axis++) {
    const other = [0, 1, 2].filter(candidate => candidate !== axis);
    for (const side of [0, 1]) {
      const candidates = triangles.filter(triangle => triangle.points.every(point => near(point.getComponent(axis), ranges[axis][side])) && triangle.cross.getComponent(axis) * (side ? 1 : -1) > 1e-8);
      assert.equal(candidates.length, 2, `Incomplete box face ${part.name}`);
      const unique = [];
      for (const point of candidates.flatMap(triangle => triangle.points)) if (!unique.some(previous => point.distanceToSquared(previous) < EPSILON ** 2)) unique.push(point);
      const shared = candidates[0].points.filter(point => candidates[1].points.some(previous => point.distanceToSquared(previous) < EPSILON ** 2));
      assert(unique.length === 4 && shared.length === 2, `Invalid box face ${part.name}`);
      assert(!near(shared[0].getComponent(other[0]), shared[1].getComponent(other[0])) && !near(shared[0].getComponent(other[1]), shared[1].getComponent(other[1])), 'Face diagonal required');
      for (const a of ranges[other[0]]) for (const b of ranges[other[1]]) assert(unique.some(point => near(point.getComponent(other[0]), a) && near(point.getComponent(other[1]), b)), 'Box corner missing');
    }
  }
  return { name: part.name, min: actualBounds.min.toArray(), max: actualBounds.max.toArray(), triangles: 12, completeOutwardFaces: 6 };
}

function convexHull(points) {
  const unique = [...new Map(points.map(point => [point.join(','), point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  function half(vertices) {
    const hull = [];
    for (const point of vertices) {
      while (hull.length > 1 && cross2(hull[hull.length - 2], hull[hull.length - 1], point) <= 1e-10) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  }
  return [...half(unique), ...half(unique.slice().reverse())];
}

function requireWitness(scene, source) {
  const back = resolve(scene, 'mirror-back'), triangles = actualTriangles(back);
  const polygon = convexHull(triangles.flatMap(triangle => triangle.points.map(point => [point.x, point.y])));
  assert(polygon.length >= 4, 'Back must expose its real convex perimeter');
  const witness = { min: [-.035, .56, .001], max: [.035, .575, .011] };
  const post = source.common.post;
  for (let axis = 0; axis < 3; axis++) {
    assert(witness.min[axis] > post.position[axis] - post.size[axis] / 2 && witness.max[axis] < post.position[axis] + post.size[axis] / 2, 'Witness must lie strictly inside post');
  }
  for (const x of [witness.min[0], witness.max[0]]) for (const y of [witness.min[1], witness.max[1]]) {
    assert(polygon.every((a, index) => cross2(a, polygon[(index + 1) % polygon.length], [x, y]) > 1e-8), 'Witness must lie inside actual backing perimeter');
  }
  const z = triangles.flatMap(triangle => triangle.points.map(point => point.z));
  assert(Math.min(...z) <= 0 && Math.max(...z) >= .012 - EPSILON);
  assert(witness.min[2] > Math.min(...z) && witness.max[2] < Math.max(...z));
  return { ...witness, volume: .07 * .015 * .01, strictlyInsideActualConvexBackAndPost: true, backingPerimeterVertices: polygon.length };
}

function failGeometry(code, location, message) { throw Object.assign(new Error(`${code} at ${location}: ${message}`), { code, path: location }); }

export async function readback(bytes, mirror, source, baseBytes, resource) {
  const scene = (await parse(bytes)).scene, original = (await parse(baseBytes)).scene;
  scene.updateMatrixWorld(true); original.updateMatrixWorld(true);
  try {
    const core = validateMirrorGeometry(scene, resource, failGeometry);
    assert.equal(core.checked, true, 'Floor mirror geometry branch must actually validate this resource');
    const solids = [source.common.base, source.common.post, ...mirror.parts].map(part => requireBox(resolve(scene, part.name), part));
    const [base, post] = solids;
    assert(base.min[1] === 0 && base.max[1] === post.min[1], 'Exactly grounded base/post contact required');
    for (const axis of [0, 2]) assert(Math.min(base.max[axis], post.max[axis]) > Math.max(base.min[axis], post.min[axis]), 'Positive-area base/post contact required');
    const witness = requireWitness(scene, source);
    let originalMeshes = 0, preservedVertices = 0;
    original.traverse(node => {
      if (!node.isMesh) return;
      originalMeshes++;
      const before = node.geometry.getAttribute('position'), current = resolve(scene, node.name), after = current.geometry.getAttribute('position');
      assert.equal(after.count, before.count, 'Original vertex count changed');
      assert.deepEqual(current.geometry.getIndex()?.array, node.geometry.getIndex()?.array, 'Original topology changed');
      for (let vertex = 0; vertex < before.count; vertex++) {
        assert.equal(after.getX(vertex), before.getX(vertex));
        assert.equal(after.getY(vertex), Math.fround(before.getY(vertex) + source.common.vertexTranslationY));
        assert.equal(after.getZ(vertex), before.getZ(vertex));
        preservedVertices++;
      }
    });
    const geometryDigest = createHash('sha256');
    let meshCount = 0, triangleCount = 0;
    scene.traverse(node => {
      assert(node.matrix.elements.every((value, index) => Math.abs(value - new THREE.Matrix4().elements[index]) < EPSILON), 'All production nodes must remain identity');
      if (!node.isMesh) return;
      meshCount++;
      triangleCount += actualTriangles(node).length;
      const array = node.geometry.getAttribute('position').array;
      geometryDigest.update(node.name);
      geometryDigest.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    });
    const bounds = new THREE.Box3().setFromObject(scene), gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined));
    assert.equal(gltf.images?.length ?? 0, 0); assert.equal(gltf.animations?.length ?? 0, 0);
    return { ...core, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, meshCount, triangleCount, identityAllNodes: true, originalMeshes, preservedVertices, originalTopologyPreserved: true, vertexTranslationY: .92, grounded: true, basePostPositiveAreaContact: true, postBackWitness: witness, solids, geometrySha256: geometryDigest.digest('hex'), externalUris: 0, textures: 0, animations: 0 };
  } finally { dispose(scene); dispose(original); }
}

export function resourceFor(mirror, source, bytes, baseResource, provenance) {
  return {
    id: `floor-mirror-${mirror.id}`, displayName: mirror.label, version: 1, category: 'decor',
    mountRole: 'floor-mirror', productionBranch: 'floor-mirror', mount: 'floor-surface',
    mounting: { origin: 'bottom', ...source.common.envelope },
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only' },
    footprint: source.common.footprint, mirrorSurface: source.common.surface,
    mirrorNodes: { face: 'mirror-surface', back: 'mirror-back', base: 'mirror-base', post: 'mirror-post' },
    mirrorShape: { polygons: baseResource.mirrorShape.polygons.map(polygon => polygon.map(([x, y]) => [Math.fround(x), Math.fround(y + source.common.vertexTranslationY)])) },
    stateDefaults: {}, usePoints: [],
    provenance: { ...provenance, license: source.license, prompt: `${source.common.promptStandard} Support design: ${mirror.prompt}`, sourceDesign: mirror.id, baseResource: mirror.baseResource, baseResourcePath: mirror.baseResourcePath, baseResourceSha256: mirror.baseResourceSha256, baseModelPath: mirror.baseModelPath, baseModelSha256: mirror.baseModelSha256, method: 'CPU GLTFLoader imports the complete pinned wall-mirror GLB, bakes +.92m Y into every mesh vertex, preserves topology and material, and adds solid baked BoxGeometry core and support parts. Float32 contour coordinates match actual exported vertices.' },
    asset: { format: 'glb', url: `/company-assets/floor-mirror-v1/${mirror.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
  };
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes, ids = IDS } = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT));
  source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source);
  validateSource(source);
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  const dependencies = {};
  for (const [name, pin] of Object.entries(source.dependencyPins)) dependencies[name] = await readPin(pin);
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = { sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins };
  const baseCollection = JSON.parse(dependencies.wallCollection), items = [];
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length, 'Invalid production subset');
  for (const mirror of source.mirrors.filter(candidate => ids.includes(candidate.id))) {
    const baseResource = JSON.parse(await readPin({ path: mirror.baseResourcePath, sha256: mirror.baseResourceSha256 }));
    assert.deepEqual({ id: baseResource.id, version: baseResource.version, asset: baseResource.asset }, mirror.baseResource);
    assert.equal(baseCollection.resources.find(item => item.id === baseResource.id)?.sha256, baseResource.asset.sha256);
    assert.equal(baseResource.provenance.sourceParametersSha256, source.dependencyPins.wallSourceParameters.sha256);
    assert.equal(baseResource.provenance.generatorSha256, source.dependencyPins.wallGenerator.sha256);
    const baseBytes = await readPin({ path: mirror.baseModelPath, sha256: mirror.baseModelSha256 });
    assert.equal(baseBytes.length, baseResource.asset.bytes);
    const bytes = await exportFloorMirror(mirror, source, baseBytes), repeat = await exportFloorMirror(mirror, source, baseBytes);
    assert(bytes.equals(repeat), `Repeated export differs ${mirror.id}`);
    const resource = resourceFor(mirror, source, bytes, baseResource, provenance);
    items.push({ mirror, bytes, baseBytes, resource, actual: await readback(bytes, mirror, source, baseBytes, resource), repeatedExportByteIdentical: true });
  }
  assert.equal(new Set(items.map(item => item.resource.asset.sha256)).size, ids.length);
  const resources = items.map(item => item.resource);
  const collection = { id: source.id, version: 1, category: 'decor', provenance, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
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
  changedSource.mirrors[0].parts[0].size[0] = .70;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({ source: changedSource, sourceBytes: changedSourceBytes });
  assert.notEqual(variant.items[0].actual.geometrySha256, result.items[0].actual.geometrySha256);
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Other three models changed');
  const report = {
    status: 'passed', scope: 'CPU production and actual GLTFLoader readback of four grounded floor mirrors from four pinned wall GLBs',
    commands: ['node scripts/company-platform/build-floor-mirror.mjs', 'node scripts/company-platform/build-floor-mirror.mjs --check'], provenance: result.provenance,
    geometryVerifier: { path: 'prototype/src/company/mirror-geometry.js', sha256: sha256(await fs.readFile(new URL('prototype/src/company/mirror-geometry.js', ROOT))) },
    items: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, baseResource: item.mirror.baseResource, actual: item.actual })),
    sourceModificationEvidence: { parameter: 'mirrors[0].parts[0].size[0]', before: .68, after: .70, parameters: `${EVIDENCE_PATH}/variant-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/variant-round.glb`, beforeSha256: result.items[0].resource.asset.sha256, afterSha256: variant.items[0].resource.asset.sha256, beforeGeometrySha256: result.items[0].actual.geometrySha256, afterGeometrySha256: variant.items[0].actual.geometrySha256, actual: variant.items[0].actual, otherThreeModelsByteIdentical: true },
    limits: ['CPU-only geometry and export checks. Browser scene reflection, transaction integration, close/reopen, navigation blocking, ordinary-device performance, role C3 and human visual acceptance remain outside this production evidence.', 'Actual mesh support contact and ground contact do not certify furniture anti-tip or physical stability.']
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
if (isMain) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
