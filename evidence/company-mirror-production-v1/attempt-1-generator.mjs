import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-mirror-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-MIRROR-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-mirror.mjs';
const OUTPUT_PATH = 'prototype/public/company-assets/mirror-v1';
const EVIDENCE_PATH = 'evidence/company-mirror-production-v1';
const IDS = ['round', 'full', 'arch', 'grid'];
const EPSILON = 1e-6;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = polygon => polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point[0] * next[1] - point[1] * next[0];
}, 0) / 2;
const rectangle = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top]];

// Sutherland-Hodgman clipping measures positive-area intersections. Shared edges
// are permitted, while actual frame intrusions and triangle overlaps are rejected.
function intersection(subject, clip) {
  let output = subject;
  for (let edge = 0; edge < clip.length && output.length; edge++) {
    const a = clip[edge], b = clip[(edge + 1) % clip.length], input = output;
    output = [];
    for (let index = 0; index < input.length; index++) {
      const p = input[index], q = input[(index + 1) % input.length];
      const dp = cross2(a, b, p), dq = cross2(a, b, q);
      if (dp >= 0) output.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const amount = dp / (dp - dq);
        output.push([p[0] + (q[0] - p[0]) * amount, p[1] + (q[1] - p[1]) * amount]);
      }
    }
  }
  return output;
}

function validatePolygon(polygon) {
  assert(Array.isArray(polygon) && polygon.length >= 3 && polygon.length <= 256, 'Invalid mirror polygon');
  assert(polygon.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)), 'Nonfinite mirror polygon');
  assert(new Set(polygon.map(point => point.join(','))).size === polygon.length, 'Repeated polygon vertex');
  assert(area(polygon) > 1e-6, 'Mirror polygon must be counterclockwise');
  for (let index = 0; index < polygon.length; index++) {
    assert(cross2(polygon[index], polygon[(index + 1) % polygon.length], polygon[(index + 2) % polygon.length]) > 1e-9, 'Mirror polygon must be strictly convex');
    assert(Math.abs(polygon[index][0]) <= .4 && Math.abs(polygon[index][1]) <= .9, 'Mirror polygon outside mounting envelope');
  }
}

export function designFor(mirror) {
  let outline;
  if (mirror.id === 'round') {
    outline = Array.from({ length: mirror.segments }, (_, index) => {
      const angle = index * Math.PI * 2 / mirror.segments;
      return [Math.cos(angle) * mirror.radius, Math.sin(angle) * mirror.radius];
    });
  } else if (mirror.id === 'arch') {
    const radius = mirror.width / 2, spring = mirror.height / 2 - radius;
    outline = [[-radius, -mirror.height / 2], [radius, -mirror.height / 2]];
    for (let index = 0; index <= mirror.arcSegments; index++) {
      const angle = index * Math.PI / mirror.arcSegments;
      outline.push([Math.cos(angle) * radius, spring + Math.sin(angle) * radius]);
    }
  } else {
    outline = rectangle(-mirror.width / 2, -mirror.height / 2, mirror.width / 2, mirror.height / 2);
  }
  let polygons = [outline];
  const bars = [];
  if (mirror.id === 'grid') {
    polygons = [];
    const cellWidth = (mirror.width - mirror.barWidth * (mirror.columns - 1)) / mirror.columns;
    const cellHeight = (mirror.height - mirror.barWidth * (mirror.rows - 1)) / mirror.rows;
    for (let column = 0; column < mirror.columns; column++) {
      const left = -mirror.width / 2 + column * (cellWidth + mirror.barWidth);
      for (let row = 0; row < mirror.rows; row++) {
        const bottom = -mirror.height / 2 + row * (cellHeight + mirror.barWidth);
        polygons.push(rectangle(left, bottom, left + cellWidth, bottom + cellHeight));
      }
      if (column < mirror.columns - 1) bars.push({ name: `mirror-mullion-v${column}`, polygon: rectangle(left + cellWidth, -mirror.height / 2, left + cellWidth + mirror.barWidth, mirror.height / 2) });
    }
    for (let row = 0; row < mirror.rows - 1; row++) {
      const bottom = -mirror.height / 2 + row * (cellHeight + mirror.barWidth) + cellHeight;
      // Split horizontal rails at vertical rails so no overlapping solids are exported.
      for (let column = 0; column < mirror.columns; column++) {
        const left = -mirror.width / 2 + column * (cellWidth + mirror.barWidth);
        bars.push({ name: `mirror-mullion-h${row}-${column}`, polygon: rectangle(left, bottom, left + cellWidth, bottom + mirror.barWidth) });
      }
    }
  }
  for (const polygon of [outline, ...polygons]) validatePolygon(polygon);
  // Offset every supporting edge outward by a fixed perpendicular width.
  const outer = outline.map((point, index) => {
    const before = outline[(index + outline.length - 1) % outline.length], after = outline[(index + 1) % outline.length];
    const first = new THREE.Vector2(point[0] - before[0], point[1] - before[1]).normalize();
    const second = new THREE.Vector2(after[0] - point[0], after[1] - point[1]).normalize();
    const normal = new THREE.Vector2(first.y + second.y, -first.x - second.x).normalize();
    const distance = mirror.frameWidth / normal.dot(new THREE.Vector2(second.y, -second.x));
    return [point[0] + normal.x * distance, point[1] + normal.y * distance];
  });
  validatePolygon(outer);
  return { outline, outer, polygons, bars };
}

function validateSource(source) {
  assert.equal(source.id, 'company-mirror-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.mirrors.map(mirror => mirror.id), IDS);
  assert.deepEqual(source.common.envelope, { width: .8, height: 1.8, depth: .04 });
  assert.deepEqual(source.common.surface, { schema: 'planar-mirror-v1', profile: 'single-512-v1', position: [0, 0, .026] });
  assert.equal(source.common.backDepth, .012);
  assert.equal(source.common.frameFront, .04);
  assert(source.common.promptStandard.length > 100 && source.license.length > 20);
  for (const mirror of source.mirrors) {
    assert(Number.isFinite(mirror.frameWidth) && mirror.frameWidth >= .008 && mirror.frameWidth <= .035, 'Frame width outside supported range');
    assert(/^#[a-f0-9]{6}$/i.test(mirror.color));
    if (mirror.id === 'round') {
      assert.equal(mirror.radius, .35, 'Round mirror must have .70m diameter');
      assert(Number.isInteger(mirror.segments) && mirror.segments >= 64 && mirror.segments <= 192 && mirror.segments % 4 === 0);
    } else {
      assert.equal(mirror.width, .68);
      assert.equal(mirror.height, 1.68);
    }
    if (mirror.id === 'arch') assert(Number.isInteger(mirror.arcSegments) && mirror.arcSegments >= 32 && mirror.arcSegments <= 96 && mirror.arcSegments % 2 === 0);
    if (mirror.id === 'grid') {
      assert.equal(mirror.columns, 2);
      assert.equal(mirror.rows, 3);
      assert(Number.isFinite(mirror.barWidth) && mirror.barWidth >= .015 && mirror.barWidth <= .04);
    }
    designFor(mirror);
  }
}

function geometryFrom(triangles) {
  const positions = triangles.flat(2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(triangles.flat().flatMap(([x, y]) => [x / .8 + .5, y / 1.8 + .5]), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function planeTriangles(polygon, z, reverse = false) {
  const center = polygon.reduce((sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length], [0, 0]);
  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const triangle = [[...center, z], [...point, z], [...next, z]];
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

function solidGeometry(polygon, bottom, top) {
  return geometryFrom([...planeTriangles(polygon, bottom, true), ...planeTriangles(polygon, top), ...sideTriangles(polygon, bottom, top)]);
}

function ringGeometry(inner, outer, bottom, top) {
  const triangles = [...sideTriangles(outer, bottom, top), ...sideTriangles(inner, bottom, top, true)];
  for (let index = 0; index < inner.length; index++) {
    const next = (index + 1) % inner.length;
    for (const z of [bottom, top]) {
      const a = [...inner[index], z], b = [...outer[index], z], c = [...outer[next], z], d = [...inner[next], z];
      const cap = [[a, b, c], [a, c, d]];
      triangles.push(...(z === bottom ? cap.map(triangle => triangle.reverse()) : cap));
    }
  }
  return geometryFrom(triangles);
}

export function createMirror(mirror, source) {
  const design = designFor(mirror), root = new THREE.Group();
  root.name = `mirror-${mirror.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Centred wall back', sourceVersion: 1 };
  const frameMaterial = new THREE.MeshStandardMaterial({ color: mirror.color, roughness: mirror.roughness, metalness: mirror.metalness });
  const backMaterial = new THREE.MeshStandardMaterial({ color: '#353638', roughness: .85, metalness: 0 });
  const faceMaterial = new THREE.MeshStandardMaterial({ color: '#8a9298', roughness: .2, metalness: .6 });
  const add = (name, geometry, material) => { const mesh = new THREE.Mesh(geometry, material); mesh.name = name; root.add(mesh); };
  add('mirror-back', solidGeometry(design.outer, 0, source.common.backDepth), backMaterial);
  add('mirror-frame', ringGeometry(design.outline, design.outer, source.common.backDepth, source.common.frameFront), frameMaterial);
  for (const bar of design.bars) add(bar.name, solidGeometry(bar.polygon, source.common.backDepth, source.common.frameFront), frameMaterial);
  add('mirror-surface', geometryFrom(design.polygons.flatMap(polygon => planeTriangles(polygon, source.common.surface.position[2]))), faceMaterial);
  root.updateMatrixWorld(true);
  return root;
}

function dispose(root) {
  const materials = new Set();
  root.traverse(node => { node.geometry?.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material); });
  for (const material of materials) material.dispose();
}

async function exportMirror(mirror, source) {
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); }
  };
  const root = createMirror(mirror, source);
  try { return Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [] })); }
  finally { dispose(root); }
}

function trianglesOf(mesh) {
  const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getIndex();
  const count = indices?.count ?? positions.count;
  assert(count > 0 && count % 3 === 0, `Invalid triangles in ${mesh.name}`);
  const triangles = [];
  for (let offset = 0; offset < count; offset += 3) {
    const points = [0, 1, 2].map(step => {
      const index = indices ? indices.getX(offset + step) : offset + step;
      assert(Number.isInteger(index) && index >= 0 && index < positions.count, 'Invalid index');
      return new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    });
    assert(points.every(point => point.toArray().every(Number.isFinite)), 'Nonfinite geometry');
    const normal = new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0]));
    assert(normal.length() / 2 > 1e-9, `Degenerate triangle in ${mesh.name}`);
    triangles.push({ points, normal, projected: points.map(point => [point.x, point.y]) });
  }
  return triangles;
}

function verifySolid(mesh, triangles) {
  const edges = new Map();
  let volume = 0;
  const key = point => point.toArray().map(value => Math.round(value * 1e7)).join(',');
  for (const { points } of triangles) {
    volume += points[0].dot(new THREE.Vector3().crossVectors(points[1], points[2])) / 6;
    for (let index = 0; index < 3; index++) {
      const from = key(points[index]), to = key(points[(index + 1) % 3]);
      const name = [from, to].sort().join('|'), edge = edges.get(name) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += from < to ? 1 : -1;
      edges.set(name, edge);
    }
  }
  assert([...edges.values()].every(edge => edge.count === 2 && edge.direction === 0), `Nonmanifold or unclosed solid ${mesh.name}`);
  assert(volume > 1e-7, `Nonpositive solid volume ${mesh.name}`);
  return { name: mesh.name, triangles: triangles.length, signedVolume: volume, closedOutwardManifold: true };
}

export function validateMirrorScene(scene, resource) {
  scene.updateMatrixWorld(true);
  const polygons = resource.mirrorShape.polygons;
  polygons.forEach(validatePolygon);
  for (let i = 0; i < polygons.length; i++) for (let j = i + 1; j < polygons.length; j++) assert(Math.abs(area(intersection(polygons[i], polygons[j]))) < 1e-8, 'Mirror polygons overlap');
  const matches = [];
  scene.traverse(node => { if (node.name === resource.mirrorNodes.face) matches.push(node); });
  assert(matches.length === 1 && matches[0].isMesh, 'Mirror face must uniquely resolve to a mesh');
  const face = matches[0];
  assert(face.matrixWorld.elements.every((value, index) => Math.abs(value - new THREE.Matrix4().elements[index]) < EPSILON), 'Mirror face including ancestors must have identity transform');
  const actual = trianglesOf(face), coveredAreas = polygons.map(() => 0);
  for (const triangle of actual) {
    assert(triangle.points.every(point => Math.abs(point.z - .026) < EPSILON), 'Mirror face must lie at z=.026');
    assert(triangle.normal.z > 1e-9 && Math.abs(triangle.normal.x) < EPSILON && Math.abs(triangle.normal.y) < EPSILON, 'Mirror face must face +Z');
    const triangleArea = area(triangle.projected);
    const owner = polygons.findIndex(polygon => triangle.projected.every(point => polygon.every((a, index) => cross2(a, polygon[(index + 1) % polygon.length], point) >= -1e-7)));
    assert(owner >= 0, 'Mirror triangle outside declared polygons');
    coveredAreas[owner] += triangleArea;
  }
  for (let i = 0; i < actual.length; i++) for (let j = i + 1; j < actual.length; j++) assert(Math.abs(area(intersection(actual[i].projected, actual[j].projected))) < 1e-8, 'Mirror triangles overlap');
  for (let index = 0; index < polygons.length; index++) assert(Math.abs(coveredAreas[index] - area(polygons[index])) < 1e-6, 'Mirror polygon has a coverage gap');
  const solids = [], bounds = new THREE.Box3(), geometryDigest = createHash('sha256');
  let meshCount = 0, triangleCount = 0;
  scene.traverse(node => {
    assert(node.scale.toArray().every(value => Math.abs(value - 1) < EPSILON), 'Instance scale must be identity');
    if (!node.isMesh) return;
    meshCount++;
    const triangles = trianglesOf(node);
    triangleCount += triangles.length;
    geometryDigest.update(node.name);
    geometryDigest.update(Buffer.from(node.geometry.getAttribute('position').array.buffer));
    const uv = node.geometry.getAttribute('uv');
    assert(uv && [...uv.array].every(Number.isFinite), 'Finite UVs required');
    for (const triangle of triangles) for (const point of triangle.points) {
      bounds.expandByPoint(point);
      assert(Math.abs(point.x) <= .4 + EPSILON && Math.abs(point.y) <= .9 + EPSILON && point.z >= -EPSILON && point.z <= .04 + EPSILON, `Geometry outside envelope ${node.name}`);
    }
    if (node === face) return;
    solids.push(verifySolid(node, triangles));
    for (const triangle of triangles) {
      // Clip each actual 3D frame triangle at the mirror plane before projecting.
      const clipped = [];
      for (let index = 0; index < 3; index++) {
        const a = triangle.points[index], b = triangle.points[(index + 1) % 3];
        const insideA = a.z >= .026, insideB = b.z >= .026;
        if (insideA) clipped.push([a.x, a.y]);
        if (insideA !== insideB) { const t = (.026 - a.z) / (b.z - a.z); clipped.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]); }
      }
      for (const polygon of polygons) assert(Math.abs(area(intersection(clipped, polygon))) < 1e-8, `Frame occludes mirror interior ${node.name}`);
    }
  });
  assert(solids.some(solid => solid.name === 'mirror-back') && solids.some(solid => solid.name === 'mirror-frame'), 'Real back and frame required');
  return { bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, meshCount, triangleCount, faceTriangles: actual.length, polygonCount: polygons.length, mirrorArea: coveredAreas.reduce((sum, value) => sum + value, 0), identityFaceAtContractPlane: true, fullCoverageWithoutOverlap: true, unoccludedMirrorInterior: true, solids, geometrySha256: geometryDigest.digest('hex') };
}

async function readback(bytes, resource) {
  const scene = (await parse(bytes)).scene;
  try {
    const result = validateMirrorScene(scene, resource);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined));
    assert.equal(gltf.images?.length ?? 0, 0);
    assert.equal(gltf.animations?.length ?? 0, 0);
    return { ...result, externalUris: 0, textures: 0, animations: 0 };
  } finally { dispose(scene); }
}

function resourceFor(mirror, source, bytes, provenance) {
  return {
    id: `mirror-${mirror.id}`, displayName: mirror.label, version: 1, category: 'decor',
    mountRole: 'mirror', productionBranch: 'mirror', mount: 'wall',
    mounting: { origin: 'center', ...source.common.envelope },
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Centred wall back', scale: 'Identity only' },
    mirrorSurface: source.common.surface, mirrorNodes: { face: 'mirror-surface' },
    mirrorShape: { polygons: designFor(mirror).polygons }, stateDefaults: {}, usePoints: [],
    provenance: { ...provenance, license: source.license, prompt: `${source.common.promptStandard} Design: ${mirror.prompt}`, sourceDesign: mirror.id, method: 'Project-authored deterministic CPU convex polygon triangulation, solid offset ring frames, solid backing and solid mullions. GLB contains static inspection geometry. Runtime binds the actual host-scene Reflector separately.' },
    asset: { format: 'glb', url: `/company-assets/mirror-v1/${mirror.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
  };
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes } = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT));
  source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source);
  validateSource(source);
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  for (const pin of Object.values(source.dependencyPins)) {
    assert(typeof pin.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
    assert.equal(sha256(await fs.readFile(new URL(pin.path, ROOT))), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  }
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = { sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), dependencies: source.dependencyPins };
  const items = [];
  for (const mirror of source.mirrors) {
    const bytes = await exportMirror(mirror, source), repeated = await exportMirror(mirror, source);
    assert(bytes.equals(repeated), `Repeated export differs ${mirror.id}`);
    const resource = resourceFor(mirror, source, bytes, provenance);
    items.push({ mirror, bytes, resource, actual: await readback(bytes, resource), repeatedExportByteIdentical: true });
  }
  assert.equal(new Set(items.map(item => item.resource.asset.sha256)).size, 4);
  const resources = items.map(item => item.resource);
  const collection = { id: source.id, version: 1, category: 'decor', provenance, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {
    files.set(`${OUTPUT_PATH}/${item.mirror.id}/v1/model.glb`, item.bytes);
    files.set(`${OUTPUT_PATH}/${item.mirror.id}/v1/resource.json`, jsonBytes(item.resource));
  }
  return { source, provenance, resources, items, collection, files };
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection();
  const changedSource = structuredClone(result.source);
  changedSource.mirrors[0].frameWidth += .003;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({ source: changedSource, sourceBytes: changedSourceBytes });
  assert.notEqual(variant.items[0].actual.geometrySha256, result.items[0].actual.geometrySha256, 'Source parameter must change actual geometry');
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Other three models must stay byte-identical');
  const report = {
    status: 'passed', scope: 'CPU production and real GLTFLoader readback of four wall-mirror models', provenance: result.provenance,
    commands: ['node scripts/company-platform/build-mirror.mjs', 'node scripts/company-platform/build-mirror.mjs --check'],
    items: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: item.repeatedExportByteIdentical, actual: item.actual })),
    sourceModificationEvidence: { parameter: 'mirrors[0].frameWidth', before: result.source.mirrors[0].frameWidth, after: changedSource.mirrors[0].frameWidth, parameters: `${EVIDENCE_PATH}/variant-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/variant-round.glb`, beforeSha256: result.items[0].resource.asset.sha256, afterSha256: variant.items[0].resource.asset.sha256, beforeGeometrySha256: result.items[0].actual.geometrySha256, afterGeometrySha256: variant.items[0].actual.geometrySha256, actual: variant.items[0].actual, otherThreeModelsByteIdentical: true },
    limits: ['CPU geometry and export evidence only. Host-scene reflection, runtime binding, transactions, save/restore, GPU, fixed release, ordinary-device performance and human visual acceptance require integration.', 'The round silhouette is a regular 96-sided approximation of a .70m diameter circle, and the arch uses 48 segments for its semicircular top. No external model or raster source is used.']
  };
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs: ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/variant-parameters.json`, changedSourceBytes], [`${EVIDENCE_PATH}/variant-round.glb`, variant.items[0].bytes]]);
    for (const [file, bytes] of [...result.files, ...evidence]) {
      const url = new URL(file, ROOT);
      await fs.mkdir(new URL('./', url), { recursive: true });
      await fs.writeFile(url, bytes);
    }
  }
  console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, geometrySha256: item.actual.geometrySha256 })) }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
