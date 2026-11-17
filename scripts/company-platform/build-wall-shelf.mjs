import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateSupportGeometry } from '../../prototype/src/company/support-geometry.js';
import { validateWallShelfResource } from '../../prototype/src/company/wall-shelf-data.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); })
      .catch(error => this.onerror?.(error));
  }
};

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-wall-shelf-v1/parameters.json';
export const GENERATOR_PATH = 'scripts/company-platform/build-wall-shelf.mjs';
export const CONTRACT_PATH = 'docs/COMPANY-WALL-SHELF-CONTRACT-v1.txt';
export const OUTPUT_PATH = 'prototype/public/company-assets/wall-shelf-v1';
export const EVIDENCE_PATH = 'evidence/company-wall-shelf-production-v1';
export const IDS = ['side-bracket', 'cantilever', 'frame', 'back-panel'];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;

function fail(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), { code, path: location, details });
}

function validateSource(source) {
  assert.equal(source.id, 'company-wall-shelf-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.common.mounting, { origin: 'bottom', width: 1, height: 1.8, depth: 0.35 });
  assert.deepEqual(source.common.footprint, { center: [0, 0.175], halfSize: [0.5, 0.175], blocking: true });
  assert.deepEqual(source.common.board, { width: 0.92, depth: 0.31, thickness: 0.035 });
  assert.deepEqual(source.common.supportSurfaces, [
    { id: 'lower', center: [0, 0.19], topY: 0.35, halfSize: [0.4, 0.1], clearanceHeight: 0.45 },
    { id: 'middle', center: [0, 0.19], topY: 0.95, halfSize: [0.4, 0.1], clearanceHeight: 0.45 },
    { id: 'top', center: [0, 0.19], topY: 1.55, halfSize: [0.4, 0.1], clearanceHeight: 0.25 }
  ]);
  assert.deepEqual(source.designs.map(item => item.id), IDS);
  const ranges = {
    'side-bracket': { railWidth: [0.03, 0.08], railDepth: [0.02, 0.08], armWidth: [0.025, 0.07], braceThickness: [0.04, 0.07] },
    cantilever: { wallBarHeight: [0.035, 0.1], armWidth: [0.03, 0.08], armDepth: [0.025, 0.06], railThickness: [0.025, 0.06] },
    frame: { postWidth: [0.03, 0.08], postDepth: [0.025, 0.08], railHeight: [0.03, 0.07] },
    'back-panel': { panelThickness: [0.02, 0.05], ledgeWidth: [0.03, 0.08], ledgeDepth: [0.18, 0.28], ledgeHeight: [0.03, 0.07] }
  };
  for (const design of source.designs) {
    assert(design.prompt && design.label && design.differences);
    const allowed = ranges[design.id];
    assert.deepEqual(Object.keys(design.differences).sort(), Object.keys(allowed).sort(), `${design.id} has an unknown parameter`);
    for (const [key, value] of Object.entries(design.differences)) {
      assert(Number.isFinite(value), `${design.id}.${key} must be finite`);
      assert(value >= allowed[key][0] && value <= allowed[key][1], `${design.id}.${key} out of range`);
    }
  }
  assert(source.promptStandard.length > 200);
  for (const pin of Object.values(source.dependencyPins)) {
    assert(typeof pin.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), `Invalid dependency pin ${pin.path}`);
  }
}

function material(color, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, transparent: false, opacity: 1 });
}

function addMesh(root, name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  root.add(mesh);
  return mesh;
}

function box(root, name, size, mat, position) {
  return addMesh(root, name, new THREE.BoxGeometry(...size), mat, position);
}

function beamYZ(root, name, width, start, end, depth, mat) {
  const dy = end[1] - start[1], dz = end[2] - start[2];
  const length = Math.hypot(dy, dz);
  const angle = Math.atan2(dz, dy);
  return addMesh(root, name, new THREE.BoxGeometry(width, length, depth), mat,
    [0, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2], [angle, 0, 0]);
}

function board(root, id, y, mat, common) {
  return box(root, `wall-shelf-board-${id}`, [common.board.width, common.board.thickness, common.board.depth], mat,
    [0, y - common.board.thickness / 2, common.board.depth / 2 + 0.035]);
}

function createShelf(design, common) {
  const root = new THREE.Group();
  root.name = `wall-shelf-${design.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Wall back bottom centre', sourceVersion: 1, designId: design.id };
  const boardMaterial = material('#d7b58a', 0.82);
  const frameMaterial = material({
    'side-bracket': '#8c5d3b', cantilever: '#536f80', frame: '#566d62', 'back-panel': '#8a6246'
  }[design.id]);
  const ys = Object.fromEntries(common.supportSurfaces.map(surface => [surface.id, surface.topY]));
  for (const surface of common.supportSurfaces) board(root, surface.id, ys[surface.id], boardMaterial, common);
  const zWall = 0.02;
  if (design.id === 'side-bracket') {
    const d = design.differences;
    for (const side of [-1, 1]) {
      const label = side < 0 ? 'left' : 'right';
      box(root, `side-bracket-wall-rail-${label}`, [d.railWidth, 1.8, d.railDepth], frameMaterial, [side * 0.46, 0.9, zWall]);
      for (const surface of common.supportSurfaces) {
        const y = surface.topY;
        box(root, `side-bracket-arm-${surface.id}-${label}`, [d.armWidth, d.braceThickness, 0.24], frameMaterial,
          [side * 0.43, y - d.braceThickness / 2 - 0.035, 0.16]);
        beamYZ(root, `side-bracket-brace-${surface.id}-${label}`, d.armWidth,
          [0, y - 0.035, 0.04], [0, y - 0.12, 0.28], d.braceThickness, frameMaterial).position.x = side * 0.43;
      }
    }
  } else if (design.id === 'cantilever') {
    const d = design.differences;
    for (const surface of common.supportSurfaces) {
      const y = surface.topY;
      box(root, `cantilever-wall-bar-${surface.id}`, [0.84, d.wallBarHeight, d.railThickness], frameMaterial, [0, y - 0.05, zWall]);
      for (const side of [-1, 1]) {
        const label = side < 0 ? 'left' : 'right';
        box(root, `cantilever-arm-${surface.id}-${label}`, [d.armWidth, d.armDepth, 0.27], frameMaterial,
          [side * 0.34, y - d.armDepth / 2 - 0.035, 0.175]);
        beamYZ(root, `cantilever-underbrace-${surface.id}-${label}`, d.armWidth,
          [0, y - 0.035, 0.04], [0, y - 0.10, 0.30], d.armDepth, frameMaterial).position.x = side * 0.34;
      }
    }
  } else if (design.id === 'frame') {
    const d = design.differences;
    for (const side of [-1, 1]) {
      const label = side < 0 ? 'left' : 'right';
      for (const z of [0.02, 0.33]) {
        const depthLabel = z < 0.1 ? 'rear' : 'front';
        box(root, `frame-post-${label}-${depthLabel}`, [d.postWidth, 1.8, d.postDepth], frameMaterial, [side * 0.46, 0.9, z]);
      }
      for (const surface of common.supportSurfaces) {
        box(root, `frame-side-rail-${surface.id}-${label}`, [d.postWidth, d.railHeight, 0.31], frameMaterial,
          [side * 0.46, surface.topY - d.railHeight / 2 - 0.035, 0.19]);
      }
    }
    box(root, 'frame-rear-top-rail', [0.92, d.railHeight, d.postDepth], frameMaterial, [0, 1.7775, zWall]);
  } else if (design.id === 'back-panel') {
    const d = design.differences;
    box(root, 'back-panel-wall-sheet', [0.92, 1.8, d.panelThickness], frameMaterial, [0, 0.9, d.panelThickness / 2]);
    for (const surface of common.supportSurfaces) {
      const y = surface.topY;
      box(root, `back-panel-ledge-${surface.id}`, [0.84, d.ledgeHeight, d.ledgeDepth], frameMaterial,
        [0, y - d.ledgeHeight / 2 - 0.035, 0.16]);
      box(root, `back-panel-edge-${surface.id}-left`, [d.ledgeWidth, d.ledgeHeight, 0.26], frameMaterial,
        [-0.43, y - d.ledgeHeight / 2 - 0.035, 0.17]);
      box(root, `back-panel-edge-${surface.id}-right`, [d.ledgeWidth, d.ledgeHeight, 0.26], frameMaterial,
        [0.43, y - d.ledgeHeight / 2 - 0.035, 0.17]);
    }
  }
  root.updateMatrixWorld(true);
  return root;
}

function dispose(object) {
  const materials = new Set();
  object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); });
  materials.forEach(item => item.dispose());
}

export async function exportShelfGlb(design, source) {
  const object = createShelf(design, source.common);
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(object, {
      binary: true, animations: [], copyright: `Project-authored wall shelf ${design.id}. No external art assets.`
    }));
  } finally { dispose(object); }
}

function parseGlbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
}

function resourceFor(design, bytes, sourceHash, generatorHash, contractHash) {
  const common = sourceForCommon;
  return {
    id: `wall-shelf-${design.id}`, displayName: design.label, version: 1, category: 'decor', mountRole: 'wall-shelf', productionBranch: 'wall-shelf', mount: 'wall',
    mounting: structuredClone(common.mounting), coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: common.origin, scale: 'Identity only' },
    footprint: structuredClone(common.footprint), usePoints: [], stateDefaults: {}, supportSurfaces: structuredClone(common.supportSurfaces),
    supportNodes: { lower: 'wall-shelf-board-lower', middle: 'wall-shelf-board-middle', top: 'wall-shelf-board-top' },
    provenance: {
      license: 'Project-authored procedural geometry and solid-color materials. No external art assets.', sourceDesign: design.id,
      method: design.prompt, sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, generator: GENERATOR_PATH,
      generatorSha256: generatorHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash,
      dependencies: sourceForDependencyPins
    },
    asset: { format: 'glb', url: `/company-assets/wall-shelf-v1/${design.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length }
  };
}

let sourceForCommon;
let sourceForDependencyPins;

export async function readback(bytes, design, source, resource) {
  validateWallShelfResource(resource, fail);
  const json = parseGlbJson(bytes);
  assert(!json.images?.length && !json.animations?.length && !json.skins?.length);
  assert((json.buffers ?? []).every(buffer => buffer.uri === undefined));
  const loaded = await parse(bytes);
  const scene = loaded.scene;
  scene.updateMatrixWorld(true);
  try {
    const support = validateSupportGeometry(scene, resource, fail);
    const meshes = [];
    scene.traverse(node => { if (node.isMesh) meshes.push(node); });
    const bounds = new THREE.Box3().setFromObject(scene);
    assert(bounds.min.x >= -0.5 - 1e-4 && bounds.max.x <= 0.5 + 1e-4, `${design.id} width envelope`);
    assert(bounds.min.y >= -1e-4 && bounds.max.y <= 1.8 + 1e-4, `${design.id} height envelope`);
    assert(bounds.min.z >= -1e-4 && bounds.max.z <= 0.35 + 1e-4, `${design.id} depth envelope`);
    const boardNames = new Set(['lower', 'middle', 'top'].map(id => `wall-shelf-board-${id}`));
    const names = new Set(meshes.map(mesh => mesh.name));
    for (const boardName of boardNames) assert(names.has(boardName), `Missing ${boardName}`);
    const wallContact = meshes.filter(mesh => new THREE.Box3().setFromObject(mesh).min.z <= 1e-4).map(mesh => mesh.name);
    assert(wallContact.length > 0, `${design.id} requires wall contact`);
    let triangles = 0;
    const materials = new Set();
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position');
      assert(positions && positions.count % 3 === 0, `Non-triangular mesh ${mesh.name}`);
      triangles += positions.count / 3;
      materials.add(mesh.material);
      assert(mesh.material?.isMeshStandardMaterial && mesh.material.transparent === false && mesh.material.opacity === 1, `Invalid material ${mesh.name}`);
      for (let index = 0; index < positions.count; index += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, index);
        const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
        const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
        assert(new THREE.Triangle(a, b, c).getArea() > 1e-10, `Zero-area triangle ${mesh.name}`);
      }
    }
    assert(meshes.length <= 40 && triangles <= 2500 && materials.size <= 4, `${design.id} budget exceeded`);
    const structureNames = meshes.filter(mesh => !boardNames.has(mesh.name)).map(mesh => mesh.name);
    if (design.id === 'side-bracket') assert(structureNames.some(name => name.includes('brace')) && structureNames.some(name => name.includes('arm')));
    if (design.id === 'cantilever') assert(structureNames.some(name => name.includes('wall-bar')) && structureNames.some(name => name.includes('underbrace')));
    if (design.id === 'frame') assert(structureNames.filter(name => name.includes('frame-post')).length === 4);
    if (design.id === 'back-panel') assert(structureNames.includes('back-panel-wall-sheet') && structureNames.filter(name => name.includes('ledge')).length === 3);
    return {
      checked: true, support, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      triangleCount: triangles, meshCount: meshes.length, materialCount: materials.size,
      wallContactMeshes: wallContact, structureMeshes: structureNames, externalUris: 0, textures: 0, animations: 0
    };
  } finally { dispose(scene); }
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes } = {}) {
  sourceBytes ??= await fs.readFile(new URL(SOURCE_PATH, ROOT));
  source ??= JSON.parse(sourceBytes);
  contractBytes ??= await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  generatorBytes ??= await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  assert.deepEqual(JSON.parse(sourceBytes), source);
  validateSource(source);
  for (const pin of Object.values(source.dependencyPins)) {
    const bytes = await fs.readFile(new URL(pin.path, ROOT));
    assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  }
  sourceForCommon = source.common;
  sourceForDependencyPins = source.dependencyPins;
  const sourceHash = sha256(sourceBytes), generatorHash = sha256(generatorBytes), contractHash = sha256(contractBytes);
  const items = [];
  for (const design of source.designs) {
    const bytes = await exportShelfGlb(design, source);
    const repeat = await exportShelfGlb(design, source);
    assert(bytes.equals(repeat), `Nondeterministic export ${design.id}`);
    const resource = resourceFor(design, bytes, sourceHash, generatorHash, contractHash);
    const actual = await readback(bytes, design, source, resource);
    items.push({ design, bytes, repeat, resource, actual, hash: sha256(bytes) });
  }
  assert.equal(new Set(items.map(item => item.hash)).size, IDS.length, 'Designs must have distinct geometry bytes');
  const collection = {
    id: source.id, version: 1, category: 'decor',
    provenance: { sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, generator: GENERATOR_PATH, generatorSha256: generatorHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash, license: 'Project-authored procedural geometry and solid-color materials. No external art assets.' },
    resources: items.map(item => ({ id: item.resource.id, url: item.resource.asset.url, resourcePath: `prototype/public${item.resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: item.hash }))
  };
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {
    const base = `${OUTPUT_PATH}/${item.design.id}/v1/`;
    files.set(`${base}model.glb`, item.bytes); files.set(`${base}resource.json`, jsonBytes(item.resource));
  }
  return { source, sourceBytes, contractBytes, generatorBytes, sourceHash, generatorHash, contractHash, items, collection, files };
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection();
  const initialSource = structuredClone(result.source);
  initialSource.designs[0].differences.braceThickness = 0.04;
  const initialSourceBytes = jsonBytes(initialSource);
  const initial = await buildCollection({ source: initialSource, sourceBytes: initialSourceBytes, contractBytes: result.contractBytes, generatorBytes: result.generatorBytes });
  assert.notEqual(initial.items[0].hash, result.items[0].hash, 'Side-bracket edit must change bytes');
  for (let index = 1; index < IDS.length; index++) assert.equal(initial.items[index].hash, result.items[index].hash, `${IDS[index]} must remain byte-identical`);
  const invalidSource = structuredClone(result.source);
  invalidSource.designs[0].differences.armWidth = -0.01;
  await assert.rejects(
    () => buildCollection({ source: invalidSource, sourceBytes: jsonBytes(invalidSource), contractBytes: result.contractBytes, generatorBytes: result.generatorBytes }),
    /side-bracket\.armWidth out of range/
  );
  const unknownSource = structuredClone(result.source);
  unknownSource.designs[1].differences.extra = 0.04;
  await assert.rejects(
    () => buildCollection({ source: unknownSource, sourceBytes: jsonBytes(unknownSource), contractBytes: result.contractBytes, generatorBytes: result.generatorBytes }),
    /cantilever has an unknown parameter/
  );
  const report = {
    status: 'passed', scope: 'Four project-authored wall-mounted multi-board shelves, CPU-only deterministic GLB production and loaded geometry readback',
    dispatch: { difficulty: 'complex', model: 'gpt-6.1-sol', reasoning_effort: 'high', reason: 'Four distinct connected wall shelf structures with deterministic geometry and dependency-pinned readback.', configurationEvidence: 'Parent-confirmed explicit configuration. Host hook interception unverified.' },
    commands: ['node scripts/company-platform/build-wall-shelf.mjs', 'node scripts/company-platform/build-wall-shelf.mjs --check'],
    sourceParameters: SOURCE_PATH, sourceParametersSha256: result.sourceHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: result.contractHash, generator: GENERATOR_PATH, generatorSha256: result.generatorHash, dependencyPins: result.source.dependencyPins,
    items: result.items.map(item => ({ id: item.resource.id, design: item.design.id, sha256: item.hash, bytes: item.bytes.length, repeatedExportByteIdentical: item.bytes.equals(item.repeat), actual: item.actual })),
    sourceModificationEvidence: { design: 'side-bracket', parameter: 'braceThickness', before: 0.04, after: result.source.designs[0].differences.braceThickness, initialSourceSha256: sha256(initialSourceBytes), initialOutputSha256: initial.items[0].hash, finalOutputSha256: result.items[0].hash, otherDesignsByteIdentical: IDS.slice(1).every((_, index) => initial.items[index + 1].hash === result.items[index + 1].hash) },
    parameterAdmissionEvidence: { allowedRanges: { 'side-bracket': { railWidth: [0.03, 0.08], railDepth: [0.02, 0.08], armWidth: [0.025, 0.07], braceThickness: [0.04, 0.07] }, cantilever: { wallBarHeight: [0.035, 0.1], armWidth: [0.03, 0.08], armDepth: [0.025, 0.06], railThickness: [0.025, 0.06] }, frame: { postWidth: [0.03, 0.08], postDepth: [0.025, 0.08], railHeight: [0.03, 0.07] }, 'back-panel': { panelThickness: [0.02, 0.05], ledgeWidth: [0.03, 0.08], ledgeDepth: [0.18, 0.28], ledgeHeight: [0.03, 0.07] } }, rejectedNegativeWidth: true, rejectedUnknownParameter: true },
    limitations: ['CPU production and loaded geometry only. Browser visual acceptance, wall placement transactions, child-object persistence and ordinary-device performance remain unverified.', 'The supports are structural geometry and do not claim a physics or load-rating simulation.']
  };
  const evidenceFiles = new Map([
    [`${EVIDENCE_PATH}/report.json`, jsonBytes(report)],
    [`${EVIDENCE_PATH}/initial-source.parameters.json`, initialSourceBytes],
    [`${EVIDENCE_PATH}/initial-side-bracket.glb`, initial.items[0].bytes],
    [`${EVIDENCE_PATH}/final-source.parameters.json`, result.sourceBytes],
    [`${EVIDENCE_PATH}/final-side-bracket.glb`, result.items[0].bytes]
  ]);
  const allFiles = new Map([...result.files, ...evidenceFiles]);
  if (process.argv.includes('--check')) {
    for (const [file, bytes] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(bytes), `Output differs ${file}`);
  } else {
    for (const [file, bytes] of allFiles) { const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
  }
  console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', items: result.items.map(item => ({ id: item.resource.id, sha256: item.hash, bytes: item.bytes.length })) }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
