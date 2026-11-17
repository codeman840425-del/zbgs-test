import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateInformationGeometry } from '../../prototype/src/company/information-geometry.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-floor-information-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-FLOOR-INFORMATION-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-floor-information.mjs';
const OUTPUT_PATH = 'prototype/public/company-assets/floor-information-v1';
const EVIDENCE_PATH = 'evidence/company-floor-information-production-v1';
const IDS = ['whiteboard', 'notice', 'doorplate', 'live'];
const EPSILON = 1e-5;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (a, b) => Math.abs(a - b) <= EPSILON;
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-floor-information-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.boards.map(board => board.id), IDS);
  assert.deepEqual(source.common.envelope, { width: 1, height: 1.7, depth: .6 });
  assert.deepEqual(source.common.footprint, { center: [0, 0], halfSize: [.5, .3], blocking: true });
  assert.deepEqual(source.common.surface, { schema: 'information-face-v1', width: .88, height: .56, position: [0, 1.3, .031] });
  assert.deepEqual(source.common.frameTranslation, [0, 1.3, 0]);
  assert.deepEqual(source.common.base, { name: 'information-base', size: [.24, .06, .38], position: [0, .03, 0] });
  assert.deepEqual(source.common.post, { name: 'information-post', size: [.08, 1, .04], position: [0, .56, -.005] });
  assert(source.common.promptStandard.length > 100 && source.license.length > 20);
  for (const board of source.boards) {
    assert.equal(board.baseResource.id, `information-board-${board.id}`);
    assert.equal(board.baseResource.version, 1);
    assert.equal(board.baseModelSha256, board.baseResource.asset.sha256);
    assert.equal(board.baseModelPath, `prototype/public${board.baseResource.asset.url}`);
    assert(board.parts.length >= 3 && /^#[a-f0-9]{6}$/i.test(board.color));
    const names = new Set(['information-base', 'information-post', 'information-back']);
    for (const part of board.parts) {
      assert(typeof part.name === 'string' && !names.has(part.name));
      names.add(part.name);
      assert.equal(part.size.length, 3);
      assert.equal(part.position.length, 3);
      assert(part.size.every(value => Number.isFinite(value) && value > 0));
      assert(part.position.every(Number.isFinite));
    }
  }
}

function box(root, part, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), material);
  mesh.name = part.name;
  mesh.position.fromArray(part.position);
  root.add(mesh);
}

function dispose(root) {
  root.traverse(node => {
    node.geometry?.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.dispose();
  });
}

export async function createFloorBoard(board, source, baseBytes) {
  assert.equal(sha256(baseBytes), board.baseModelSha256, 'Base model bytes differ');
  const loaded = await parse(baseBytes);
  const root = new THREE.Group();
  root.name = `information-board-floor-${board.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1 };
  const frame = loaded.scene;
  frame.name = 'information-wall-frame';
  frame.position.fromArray(source.common.frameTranslation);
  root.add(frame);
  const material = new THREE.MeshStandardMaterial({ color: board.color, roughness: .78, metalness: .03 });
  for (const part of [source.common.base, source.common.post, ...board.parts]) box(root, part, material);
  root.updateMatrixWorld(true);
  return root;
}

async function exportBoard(board, source, baseBytes) {
  const root = await createFloorBoard(board, source, baseBytes);
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [] }));
  } finally {
    dispose(root);
  }
}

function actualTriangles(mesh) {
  const positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getIndex();
  const count = indices?.count ?? positions.count;
  assert(positions.count > 0 && count % 3 === 0, `Invalid triangles: ${mesh.name}`);
  const triangles = [];
  for (let offset = 0; offset < count; offset += 3) {
    const points = [0, 1, 2].map(step => {
      const index = indices ? indices.getX(offset + step) : offset + step;
      assert(Number.isInteger(index) && index >= 0 && index < positions.count, 'Invalid vertex index');
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      assert(point.toArray().every(Number.isFinite), 'Nonfinite transformed vertex');
      return point;
    });
    const cross = new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0]));
    assert(cross.length() * .5 > 1e-7, `Degenerate triangle: ${mesh.name}`);
    triangles.push({ points, cross });
  }
  return triangles;
}

function requireSolidBox(mesh, part) {
  assert(mesh?.isMesh, `Missing real mesh: ${part.name}`);
  const triangles = actualTriangles(mesh);
  const ranges = Object.fromEntries(['x', 'y', 'z'].map((axis, index) => [axis, [part.position[index] - part.size[index] / 2, part.position[index] + part.size[index] / 2]]));
  assert.equal(triangles.length, 12, `Expected 12 solid-box triangles: ${part.name}`);
  for (const axis of ['x', 'y', 'z']) {
    const coordinates = ['x', 'y', 'z'].filter(other => other !== axis);
    for (const [side, plane] of ranges[axis].entries()) {
      const sign = side ? 1 : -1;
      const candidates = triangles.filter(triangle => triangle.points.every(point => near(point[axis], plane)) && triangle.cross[axis] * sign > 1e-7);
      const unique = [];
      for (const point of candidates.flatMap(triangle => triangle.points)) {
        if (!unique.some(other => point.distanceToSquared(other) < EPSILON ** 2)) unique.push(point);
      }
      const shared = candidates.length === 2 ? candidates[0].points.filter(point => candidates[1].points.some(other => point.distanceToSquared(other) < EPSILON ** 2)) : [];
      const corners = ranges[coordinates[0]].flatMap(a => ranges[coordinates[1]].map(b => [a, b]));
      assert(candidates.length === 2 && unique.length === 4 && shared.length === 2, `Incomplete outward face: ${part.name}.${axis}.${side}`);
      assert(corners.every(([a, b]) => unique.some(point => near(point[coordinates[0]], a) && near(point[coordinates[1]], b))), `Missing box corner: ${part.name}`);
      assert(!near(shared[0][coordinates[0]], shared[1][coordinates[0]]) && !near(shared[0][coordinates[1]], shared[1][coordinates[1]]), `Invalid face diagonal: ${part.name}`);
    }
  }
  return { name: part.name, min: ['x', 'y', 'z'].map(axis => ranges[axis][0]), max: ['x', 'y', 'z'].map(axis => ranges[axis][1]), outwardFaces: 6, validTriangles: triangles.length };
}

function resolve(root, name) {
  const matches = [];
  root.traverse(node => { if (node.name === name) matches.push(node); });
  assert.equal(matches.length, 1, `Node must uniquely resolve: ${name}`);
  return matches[0];
}

function failGeometry(code, location, message) {
  throw new Error(`${code} at ${location}: ${message}`);
}

async function readback(bytes, board, source, baseBytes) {
  const scene = (await parse(bytes)).scene;
  const baseScene = (await parse(baseBytes)).scene;
  scene.updateMatrixWorld(true);
  baseScene.updateMatrixWorld(true);
  try {
    const bounds = new THREE.Box3().setFromObject(scene);
    assert(bounds.min.x >= -.5 - EPSILON && bounds.max.x <= .5 + EPSILON);
    assert(bounds.min.y >= -EPSILON && bounds.max.y <= 1.7 + EPSILON && near(bounds.min.y, 0));
    assert(bounds.min.z >= -.3 - EPSILON && bounds.max.z <= .3 + EPSILON);
    const backPart = { name: 'information-back', size: [.9, .58, .02], position: [0, 1.3, .01] };
    const solids = [source.common.base, source.common.post, backPart, ...board.parts].map(part => requireSolidBox(resolve(scene, part.name), part));
    const [base, post, back] = solids;
    assert(near(base.min[1], 0) && near(base.max[1], post.min[1]) && post.max[1] > back.min[1]);
    for (const axis of [0, 2]) assert(Math.min(post.max[axis], back.max[axis]) > Math.max(post.min[axis], back.min[axis]), 'Post must actually meet back');
    const frame = resolve(scene, 'information-wall-frame');
    assert.deepEqual(frame.position.toArray(), source.common.frameTranslation);
    let sourceMeshCount = 0;
    baseScene.traverse(original => {
      if (!original.isMesh) return;
      sourceMeshCount++;
      const current = resolve(frame, original.name);
      const before = actualTriangles(original), after = actualTriangles(current);
      assert.equal(after.length, before.length);
      for (let triangle = 0; triangle < before.length; triangle++) for (let vertex = 0; vertex < 3; vertex++) {
        const expected = before[triangle].points[vertex].clone().add(new THREE.Vector3(0, 1.3, 0));
        assert(expected.distanceTo(after[triangle].points[vertex]) < EPSILON, 'Imported frame geometry changed');
      }
    });
    // Normalize the entire candidate by the fixed surface height, then use the existing
    // wall triangle/rectangle validator against every support and original frame mesh.
    const normalized = scene.clone(true);
    for (const child of normalized.children) child.position.y -= 1.3;
    validateInformationGeometry(normalized, { id: board.id, mountRole: 'information-board', informationSurface: { ...source.common.surface, position: [0, 0, .031] }, informationNodes: { back: 'information-back' } }, failGeometry);
    let meshCount = 0, triangleCount = 0;
    scene.traverse(node => {
      assert(node.scale.toArray().every(value => near(value, 1)), 'Scale must stay identity');
      if (node.isMesh) { meshCount++; triangleCount += actualTriangles(node).length; }
    });
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    assert((gltf.buffers ?? []).every(buffer => buffer.uri === undefined));
    assert.equal(gltf.images?.length ?? 0, 0);
    assert.equal(gltf.animations?.length ?? 0, 0);
    return { bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, footprintCoversAllVertices: true, identityScale: true, sourceMeshCount, meshCount, triangleCount, solids, grounded: true, continuousCoreSupport: true, frameTranslationPreservesAllSourceTriangles: true, contentRectangleOcclusion: 'Passed existing triangle clipping and rectangle intersection after fixed -1.3m normalization', externalUris: 0, textures: 0, animations: 0 };
  } finally {
    dispose(scene);
    dispose(baseScene);
  }
}

function resourceFor(board, bytes, source, provenance) {
  return {
    id: `information-board-floor-${board.id}`, displayName: board.label, version: 1, category: 'decor',
    mountRole: 'information-board-floor', productionBranch: 'information-board-floor', mount: 'floor-surface',
    mounting: { origin: 'bottom', ...source.common.envelope },
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only' },
    footprint: source.common.footprint, informationSurface: source.common.surface,
    informationNodes: { back: 'information-back', base: 'information-base', post: 'information-post' }, stateDefaults: {},
    provenance: { ...provenance, license: source.license, prompt: `${source.common.promptStandard} Support difference: ${board.prompt}`, sourceDesign: board.id, baseResource: board.baseResource, baseResourcePath: board.baseResourcePath, baseResourceSha256: board.baseResourceSha256, baseModelPath: board.baseModelPath, baseModelSha256: board.baseModelSha256, method: 'CPU GLTFLoader imports complete pinned wall GLB, translates it +1.3m Y, and adds solid BoxGeometry supports. Original content is referenced by the existing runtime.' },
    asset: { format: 'glb', url: `/company-assets/floor-information-v1/${board.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
  };
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes } = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT));
  source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source, 'Source bytes must describe the supplied parameters');
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  validateSource(source);
  const dependencies = {};
  for (const [name, pin] of Object.entries(source.dependencyPins)) dependencies[name] = await readPin(pin);
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(sha256(contractBytes), source.dependencyPins.functionalContract.sha256);
  const provenance = {
    sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes),
    functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: sha256(contractBytes),
    generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes),
    baseCollection: source.dependencyPins.collection.path, baseCollectionSha256: source.dependencyPins.collection.sha256,
    baseSourceParameters: source.dependencyPins.sourceParameters.path, baseSourceParametersSha256: source.dependencyPins.sourceParameters.sha256,
    baseGenerator: source.dependencyPins.generator.path, baseGeneratorSha256: source.dependencyPins.generator.sha256
  };
  const collectionSource = JSON.parse(dependencies.collection);
  const items = [];
  for (const board of source.boards) {
    const resourceBytes = await readPin({ path: board.baseResourcePath, sha256: board.baseResourceSha256 });
    const baseResource = JSON.parse(resourceBytes);
    assert.deepEqual({ id: baseResource.id, version: baseResource.version, asset: baseResource.asset }, board.baseResource);
    assert.equal(collectionSource.resources.find(item => item.id === baseResource.id)?.sha256, baseResource.asset.sha256);
    assert.equal(baseResource.provenance.sourceParametersSha256, provenance.baseSourceParametersSha256);
    assert.equal(baseResource.provenance.generatorSha256, provenance.baseGeneratorSha256);
    const baseBytes = await readPin({ path: board.baseModelPath, sha256: board.baseModelSha256 });
    assert.equal(baseBytes.length, baseResource.asset.bytes);
    const bytes = await exportBoard(board, source, baseBytes);
    const repeat = await exportBoard(board, source, baseBytes);
    assert(bytes.equals(repeat), `Repeated export differs: ${board.id}`);
    items.push({ board, bytes, baseBytes, resource: resourceFor(board, bytes, source, provenance), actual: await readback(bytes, board, source, baseBytes), repeatedExportByteIdentical: true });
  }
  assert.equal(new Set(items.map(item => item.resource.asset.sha256)).size, 4);
  const resources = items.map(item => item.resource);
  const collection = { id: source.id, version: 1, category: 'decor', provenance, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {
    files.set(`${OUTPUT_PATH}/${item.board.id}/v1/model.glb`, item.bytes);
    files.set(`${OUTPUT_PATH}/${item.board.id}/v1/resource.json`, jsonBytes(item.resource));
  }
  return { source, provenance, resources, items, collection, files };
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection();
  const changedSource = structuredClone(result.source);
  changedSource.boards[0].parts[0].size[0] = .78;
  const changedSourceBytes = jsonBytes(changedSource);
  const variant = await buildCollection({ source: changedSource, sourceBytes: changedSourceBytes });
  assert.notEqual(variant.items[0].resource.asset.sha256, result.items[0].resource.asset.sha256);
  for (let index = 1; index < 4; index++) assert(variant.items[index].bytes.equals(result.items[index].bytes), 'Unmodified design geometry changed');
  const contentDependencies = JSON.parse(await readPin(result.source.dependencyPins.collection)).resources.filter(item => item.id.startsWith('information-content-'));
  const contentHashes = [];
  for (const content of contentDependencies) {
    const modelPath = `prototype/public${content.url}`;
    const bytes = await readPin({ path: modelPath, sha256: content.sha256 });
    contentHashes.push({ id: content.id, modelPath, sha256: sha256(bytes), bytes: bytes.length, copied: false, modified: false });
  }
  const report = {
    status: 'passed', scope: 'CPU production of four floor information boards from four pinned wall GLBs',
    commands: ['node scripts/company-platform/build-floor-information.mjs', 'node scripts/company-platform/build-floor-information.mjs --check'],
    provenance: result.provenance,
    items: result.items.map(item => ({ id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: item.repeatedExportByteIdentical, baseResource: item.board.baseResource, actual: item.actual })),
    sourceModificationEvidence: { parameter: 'boards[0].parts[0].size[0]', before: .72, after: .78, parameters: `${EVIDENCE_PATH}/variant-parameters.json`, parametersSha256: sha256(changedSourceBytes), output: `${EVIDENCE_PATH}/variant-whiteboard.glb`, beforeSha256: result.items[0].resource.asset.sha256, afterSha256: variant.items[0].resource.asset.sha256, repeatedExportByteIdentical: true, actual: variant.items[0].actual, otherThreeModelsByteIdentical: true },
    unchangedContentDependencies: contentHashes,
    limits: ['CPU GLTFLoader geometry verification only. Browser mounting, transactions, content image rendering, restore, fixed release, GPU and user visual acceptance remain for integration.', 'Support geometry follows the project contract and carries no physical stability or accessibility certification.']
  };
  const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/variant-parameters.json`, changedSourceBytes], [`${EVIDENCE_PATH}/variant-whiteboard.glb`, variant.items[0].bytes]]);
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs: ${file}`);
  } else {
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
