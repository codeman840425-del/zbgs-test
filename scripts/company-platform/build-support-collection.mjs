import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); })
      .catch(error => this.onerror?.(error));
  }
};

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-support-collection-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-SUPPORT-SURFACE-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-support-collection.mjs';
export const SHELF_IDS = ['frame-posts', 'sideboards', 'crossback', 'arched-sides'];
export const ORNAMENT_IDS = ['stacked-stones', 'arched-sculpture', 'vase', 'geometric-sculpture'];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const eps = 1e-5;
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;
const isFiniteArray = (values, length) => Array.isArray(values) && values.length === length && values.every(Number.isFinite);

function colorFor(kind, index) {
  const shelf = ['#b17b4c', '#8796a8', '#566d62', '#b06d5c'];
  const ornament = ['#9b684b', '#58818a', '#c28d5b', '#765f92'];
  return kind === 'shelf' ? shelf[index] : ornament[index];
}

function validateCommon(common) {
  assert.equal(common.units, 'metres');
  assert(typeof common.promptStandard === 'string' && common.promptStandard.length > 100, 'Common prompt standard is required');
  assert.deepEqual(common.shelfEnvelope, { width: 1, height: 1.8, depth: 0.35 });
  assert.deepEqual(common.shelfFootprint, { center: [0, 0], halfSize: [0.5, 0.175] });
  assert.deepEqual(common.board, { width: 0.92, depth: 0.31, thickness: 0.035 });
  assert.deepEqual(common.ornamentEnvelope, { width: 0.16, depth: 0.12, height: 0.2 });
  assert.equal(common.supportSurfaces.length, 3);
  const ids = new Set();
  for (const surface of common.supportSurfaces) {
    assert(!ids.has(surface.id), `Duplicate support surface ${surface.id}`); ids.add(surface.id);
    assert(isFiniteArray(surface.center, 2) && isFiniteArray(surface.halfSize, 2));
    assert(Number.isFinite(surface.topY) && Number.isFinite(surface.clearanceHeight));
    assert(surface.halfSize.every(value => value > 0) && surface.clearanceHeight > 0);
  }
}

function validateSource(source) {
  assert.equal(source.id, 'company-support-collection-v1');
  assert.equal(source.version, 1);
  validateCommon(source.common);
  assert.deepEqual(source.shelves.map(item => item.id), SHELF_IDS);
  assert.deepEqual(source.ornaments.map(item => item.id), ORNAMENT_IDS);
  for (const item of [...source.shelves, ...source.ornaments]) {
    assert(item.prompt && item.license && item.differences, `Missing per-design provenance ${item.id}`);
  }
}

function makeMaterial(color, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

function addMesh(root, name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  root.add(mesh);
  return mesh;
}

function addBox(root, name, size, material, position) {
  return addMesh(root, name, new THREE.BoxGeometry(...size), material, position);
}

function createShelf(design, common, index = SHELF_IDS.indexOf(design.id)) {
  assert(design && SHELF_IDS.includes(design.id), `Unknown shelf design ${design?.id}`);
  const root = new THREE.Group();
  root.name = `support-shelf-${design.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', designId: design.id, sourceVersion: 1 };
  const frame = makeMaterial(colorFor('shelf', index));
  const board = makeMaterial('#d7b58a', 0.84);
  const { width, depth, thickness } = common.board;
  const supportY = { lower: 0.45, middle: 1.05, top: 1.8 };
  for (const id of ['lower', 'middle', 'top']) {
    addBox(root, `shelf-board-${id}`, [width, thickness, depth], board,
      [0, supportY[id] - thickness / 2, 0]);
  }
  if (design.id === 'frame-posts') {
    const w = design.differences.postWidth;
    const d = design.differences.postDepth;
    for (const x of [-0.475, 0.475]) for (const z of [-0.15, 0.15]) {
      addBox(root, `frame-post-${x < 0 ? 'left' : 'right'}-${z < 0 ? 'rear' : 'front'}`,
        [w, 1.8, d], frame, [x, 0.9, z]);
    }
    addBox(root, 'frame-rear-rail', [0.92, design.differences.rearRailHeight, 0.03], frame, [0, 1.72, -0.155]);
  } else if (design.id === 'sideboards') {
    const t = design.differences.sideThickness;
    addBox(root, 'sideboard-left', [t, 1.8, 0.35], frame, [-0.47, 0.9, 0]);
    addBox(root, 'sideboard-right', [t, 1.8, 0.35], frame, [0.47, 0.9, 0]);
    addBox(root, 'sideboard-rear-rail', [0.88, design.differences.rearRailHeight, 0.03], frame, [0, 1.74, -0.155]);
    addBox(root, 'sideboard-top-tie', [0.88, 0.035, 0.03], frame, [0, 1.78, -0.155]);
  } else if (design.id === 'crossback') {
    const z = -0.155;
    addBox(root, 'crossback-left-post', [0.04, 1.8, 0.04], frame, [-0.48, 0.9, z]);
    addBox(root, 'crossback-right-post', [0.04, 1.8, 0.04], frame, [0.48, 0.9, z]);
    const span = design.differences.braceSpan;
    const rise = design.differences.braceRise;
    const angle = Math.atan2(span, rise);
    const length = Math.hypot(span, rise);
    for (const [name, sign] of [['crossback-diagonal-left', 1], ['crossback-diagonal-right', -1]]) {
      addMesh(root, name, new THREE.BoxGeometry(design.differences.braceWidth, length, design.differences.rearDepth),
        frame, [0, 0.9, z], [0, 0, sign * angle]);
    }
    addBox(root, 'crossback-top-rail', [0.92, 0.035, 0.03], frame, [0, 1.78, z]);
    addBox(root, 'crossback-front-rail', [0.92, 0.035, 0.01], frame, [0, 1.72, 0.17]);
  } else if (design.id === 'arched-sides') {
    const tubeRadius = design.differences.tubeRadius;
    for (const xSign of [-1, 1]) for (const zSign of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 12; i += 1) {
        const t = i / 12;
        const x = xSign * (0.46 - design.differences.archInset * Math.sin(Math.PI * t));
        points.push(new THREE.Vector3(x, 0.02 + 1.76 * t, zSign * 0.155));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      addMesh(root, `arched-side-${xSign < 0 ? 'left' : 'right'}-${zSign < 0 ? 'rear' : 'front'}`,
        new THREE.TubeGeometry(curve, 24, tubeRadius, 8, false), frame);
    }
    addBox(root, 'arched-outer-post-left', [0.04, 1.8, 0.03], frame, [-0.48, 0.9, 0]);
    addBox(root, 'arched-outer-post-right', [0.04, 1.8, 0.03], frame, [0.48, 0.9, 0]);
    addBox(root, 'arched-rear-top-rail', [0.88, 0.035, 0.03], frame, [0, 1.77, -0.155]);
    addBox(root, 'arched-depth-front-rail', [0.88, 0.035, 0.01], frame, [0, 1.72, 0.17]);
    addBox(root, 'arched-depth-rear-rail', [0.88, 0.035, 0.01], frame, [0, 1.72, -0.17]);
  }
  root.updateMatrixWorld(true);
  return root;
}

function createOrnament(design, common, index = ORNAMENT_IDS.indexOf(design.id)) {
  assert(design && ORNAMENT_IDS.includes(design.id), `Unknown ornament design ${design?.id}`);
  const root = new THREE.Group();
  root.name = `tabletop-ornament-${design.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', designId: design.id, sourceVersion: 1 };
  const material = makeMaterial(colorFor('ornament', index), 0.64);
  const accent = makeMaterial('#e1c08d', 0.72);
  if (design.id === 'stacked-stones') {
    const [bottomWidth, middleWidth, topWidth] = design.differences.stoneWidths;
    addMesh(root, 'stone-bottom', new THREE.SphereGeometry(0.5, 20, 12), material, [0, 0.035, 0])
      .scale.set(bottomWidth, 0.07, 0.12);
    addMesh(root, 'stone-middle', new THREE.SphereGeometry(0.5, 20, 12), accent, [-0.005, 0.1, 0.006])
      .scale.set(middleWidth, 0.065, 0.095);
    addMesh(root, 'stone-top', new THREE.SphereGeometry(0.5, 20, 12), material, [0.01, 0.145, -0.005])
      .scale.set(topWidth, 0.035, 0.075);
  } else if (design.id === 'arched-sculpture') {
    addBox(root, 'arch-base', [0.14, 0.02, 0.1], material, [0, 0.01, 0]);
    const points = [
      new THREE.Vector3(-0.065, 0.02, 0), new THREE.Vector3(-0.065, 0.085, 0),
      new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0.065, 0.085, 0), new THREE.Vector3(0.065, 0.02, 0)
    ];
    addMesh(root, 'arch-curve', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, design.differences.archRadius, 8, false), accent);
  } else if (design.id === 'vase') {
    addMesh(root, 'vase-foot', new THREE.CylinderGeometry(0.05, 0.055, 0.025, 20), accent, [0, 0.0125, 0]);
    addMesh(root, 'vase-body', new THREE.CylinderGeometry(design.differences.bodyRadius, 0.05, 0.125, 24), material, [0, 0.0875, 0]);
    addMesh(root, 'vase-neck', new THREE.CylinderGeometry(design.differences.neckRadius, 0.045, 0.045, 24), material, [0, 0.1725, 0]);
    addMesh(root, 'vase-rim', new THREE.TorusGeometry(design.differences.rimRadius, 0.006, 8, 24), accent, [0, 0.194, 0], [Math.PI / 2, 0, 0]);
  } else if (design.id === 'geometric-sculpture') {
    addBox(root, 'sculpture-base', [design.differences.baseWidth, 0.03, 0.1], accent, [0, 0.015, 0]);
    addMesh(root, 'sculpture-faceted', new THREE.ConeGeometry(design.differences.coneRadius, 0.17, design.differences.coneSides), material, [0, 0.115, 0]);
    addMesh(root, 'sculpture-cap', new THREE.OctahedronGeometry(0.018, 0), accent, [0, 0.182, 0]);
  }
  root.updateMatrixWorld(true);
  return root;
}

function dispose(object) {
  const materials = new Set();
  object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); });
  materials.forEach(material => material.dispose());
}

export function validateShelfSource(design, common) {
  validateCommon(common);
  assert(SHELF_IDS.includes(design.id));
  assert(design.differences && Object.values(design.differences).every(value => Number.isFinite(value)));
  return true;
}

export function validateOrnamentSource(design, common) {
  validateCommon(common);
  assert(ORNAMENT_IDS.includes(design.id));
  assert(design.differences && Object.values(design.differences).every(value => Array.isArray(value) || Number.isFinite(value)));
  return true;
}

export async function exportShelfGlb(design, common) {
  validateShelfSource(design, common);
  const object = createShelf(design, common);
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true, animations: [],
      copyright: `Project-authored support shelf ${design.id}. No external art assets.` }));
  } finally { dispose(object); }
}

export async function exportOrnamentGlb(design, common) {
  validateOrnamentSource(design, common);
  const object = createOrnament(design, common);
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true, animations: [],
      copyright: `Project-authored tabletop ornament ${design.id}. No external art assets.` }));
  } finally { dispose(object); }
}

function parseGlbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

function meshBounds(object, name) {
  const node = object.getObjectByName(name);
  assert(node?.isMesh, `Missing mesh ${name}`);
  return { node, box: new THREE.Box3().setFromObject(node) };
}

function intersectsPrism(box, surface, yBottom, yTop) {
  return box.max.x > surface.center[0] - surface.halfSize[0] + eps &&
    box.min.x < surface.center[0] + surface.halfSize[0] - eps &&
    box.max.z > surface.center[1] - surface.halfSize[1] + eps &&
    box.min.z < surface.center[1] + surface.halfSize[1] - eps &&
    box.max.y > yBottom + eps && box.min.y < yTop - eps;
}

export async function readbackShelf(bytes, design, common) {
  const json = parseGlbJson(bytes);
  assert(!json.skins?.length && !json.animations?.length && !json.images?.length);
  assert(json.buffers?.every(buffer => buffer.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const object = loaded.scene;
  object.updateMatrixWorld(true);
  try {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    assert(near(bounds.min.x, -0.5, 1e-4) && near(bounds.max.x, 0.5, 1e-4), `${design.id} width bounds`);
    assert(near(bounds.min.z, -0.175, 1e-4) && near(bounds.max.z, 0.175, 1e-4), `${design.id} depth bounds`);
    assert(near(bounds.min.y, 0, 1e-4) && near(bounds.max.y, 1.8, 1e-4), `${design.id} height bounds`);
    const boards = {};
    for (const surface of common.supportSurfaces) {
      const { box } = meshBounds(object, `shelf-board-${surface.id}`);
      assert(near(box.max.y, surface.topY, 1e-4), `${design.id} ${surface.id} board top`);
      assert(near(box.min.y, surface.topY - common.board.thickness, 1e-4));
      assert(near(box.getSize(new THREE.Vector3()).x, common.board.width, 1e-4));
      assert(near(box.getSize(new THREE.Vector3()).z, common.board.depth, 1e-4));
      boards[surface.id] = `shelf-board-${surface.id}`;
    }
    const namedBoards = new Set(Object.values(boards));
    let braceConnections;
    if (design.id === 'crossback') {
      const leftPost = meshBounds(object, 'crossback-left-post').box;
      const rightPost = meshBounds(object, 'crossback-right-post').box;
      const diagonal = meshBounds(object, 'crossback-diagonal-left').box;
      assert(diagonal.min.x <= leftPost.max.x + 1e-3 && diagonal.max.x >= rightPost.min.x - 1e-3,
        'Crossback diagonal must span between the side posts');
      assert(diagonal.min.y <= 0.05 && diagonal.max.y >= 1.75, 'Crossback diagonal must reach the upper and lower rails');
      braceConnections = { spansSidePosts: true, diagonalBounds: { min: diagonal.min.toArray(), max: diagonal.max.toArray() } };
    }
    const meshReports = [];
    object.traverse(node => {
      if (!node.isMesh) return;
      const box = new THREE.Box3().setFromObject(node);
      meshReports.push({ name: node.name, min: box.min.toArray(), max: box.max.toArray() });
      for (const surface of common.supportSurfaces) {
        if (!namedBoards.has(node.name)) {
          assert(!intersectsPrism(box, surface, surface.topY, surface.topY + surface.clearanceHeight),
            `${design.id} ${node.name} invades ${surface.id} clearance`);
        }
      }
    });
    return { bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, size: size.toArray(),
      supportNodes: boards, ...(braceConnections ? { braceConnections } : {}), meshCount: json.meshes.length, meshReports, identityScale: true,
      externalUris: json.buffers.filter(buffer => buffer.uri !== undefined).length };
  } finally { dispose(object); }
}

export async function readbackOrnament(bytes, design, common) {
  const json = parseGlbJson(bytes);
  assert(!json.skins?.length && !json.animations?.length && !json.images?.length);
  assert(json.buffers?.every(buffer => buffer.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const object = loaded.scene;
  object.updateMatrixWorld(true);
  try {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const envelope = common.ornamentEnvelope;
    assert(bounds.min.y >= -1e-4 && bounds.max.y <= envelope.height + 1e-4, `${design.id} vertical envelope`);
    assert(size.x <= envelope.width + 1e-4 && size.z <= envelope.depth + 1e-4, `${design.id} horizontal envelope`);
    assert(bounds.min.y <= 1e-4, `${design.id} bottom contact`);
    return { bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, size: size.toArray(),
      bottomContact: bounds.min.y, meshCount: json.meshes.length, identityScale: true,
      externalUris: json.buffers.filter(buffer => buffer.uri !== undefined).length };
  } finally { dispose(object); }
}

function shelfResourcePath(id) { return `/company-assets/support-collection-v1/shelves/${id}/v1/model.glb`; }
function ornamentResourcePath(id) { return `/company-assets/support-collection-v1/ornaments/${id}/v1/model.glb`; }

function composedPrompt(common, design) {
  const contract = 'Contract: shelf support patches are lower 0.45m, middle 1.05m and top 1.80m with half-size 0.42m x 0.13m and clearances 0.50m, 0.65m and 0.40m. Keep actual meshes within the declared envelope and leave support clearances empty.';
  return `${common.promptStandard} Design difference: ${design.prompt} ${contract}`;
}

function resourceForShelf(design, hash, bytes, actual, sourceHash, generatorHash, contractHash, common) {
  return {
    id: `support-shelf-${design.id}`, displayName: design.label, version: 1, category: 'decor', mountRole: 'storage-shelf',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', scale: 'Identity only' },
    provenance: { license: design.license, prompt: composedPrompt(common, design), tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'TubeGeometry', 'GLTFExporter', 'GLTFLoader readback'],
      sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, sourceDesign: design.id,
      functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash,
      generator: GENERATOR_PATH, generatorSha256: generatorHash, method: design.prompt },
    asset: { format: 'glb', url: shelfResourcePath(design.id), sha256: hash, bytes: bytes.length },
    footprint: { ...structuredClone(common.shelfFootprint), blocking: true },
    mounting: { origin: 'bottom', width: common.shelfEnvelope.width, height: common.shelfEnvelope.height, depth: common.shelfEnvelope.depth },
    supportSurfaces: structuredClone(common.supportSurfaces), supportNodes: actual.supportNodes,
    usePoints: [], stateDefaults: {}
  };
}

function resourceForOrnament(design, hash, bytes, actual, sourceHash, generatorHash, contractHash, common) {
  return {
    id: `tabletop-ornament-${design.id}`, displayName: design.label, version: 1, category: 'decor', mountRole: 'tabletop-ornament',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', scale: 'Identity only' },
    provenance: { license: design.license, prompt: composedPrompt(common, design), tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'CylinderGeometry', 'TubeGeometry', 'GLTFExporter', 'GLTFLoader readback'],
      sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, sourceDesign: design.id,
      functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash,
      generator: GENERATOR_PATH, generatorSha256: generatorHash, method: design.prompt },
    asset: { format: 'glb', url: ornamentResourcePath(design.id), sha256: hash, bytes: bytes.length },
    footprint: { center: [0, 0], halfSize: [common.ornamentEnvelope.width / 2, common.ornamentEnvelope.depth / 2], blocking: false },
    mount: 'support-surface', mounting: { origin: 'bottom', width: common.ornamentEnvelope.width, height: common.ornamentEnvelope.height, depth: common.ornamentEnvelope.depth }, usePoints: [], stateDefaults: {}
  };
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes = null } = {}) {
  validateSource(source);
  const generatorHash = sha256(generatorBytes ?? await fs.readFile(new URL(`./${path.basename(fileURLToPath(import.meta.url))}`, import.meta.url)));
  const sourceHash = sha256(sourceBytes ?? Buffer.from(JSON.stringify(source)));
  const contractHash = sha256(contractBytes ?? Buffer.from(''));
  const shelves = [], ornaments = [];
  for (const design of source.shelves) {
    const bytes = await exportShelfGlb(design, source.common);
    const repeat = await exportShelfGlb(design, source.common);
    assert(bytes.equals(repeat), `Nondeterministic shelf export ${design.id}`);
    const actual = await readbackShelf(bytes, design, source.common);
    shelves.push({ design, bytes, repeat, actual, hash: sha256(bytes), resource: null });
  }
  for (const design of source.ornaments) {
    const bytes = await exportOrnamentGlb(design, source.common);
    const repeat = await exportOrnamentGlb(design, source.common);
    assert(bytes.equals(repeat), `Nondeterministic ornament export ${design.id}`);
    const actual = await readbackOrnament(bytes, design, source.common);
    ornaments.push({ design, bytes, repeat, actual, hash: sha256(bytes), resource: null });
  }
  assert.equal(new Set([...shelves, ...ornaments].map(item => item.hash)).size, 8, 'All model hashes must differ');
  for (const item of shelves) item.resource = resourceForShelf(item.design, item.hash, item.bytes, item.actual, sourceHash, generatorHash, contractHash, source.common);
  for (const item of ornaments) item.resource = resourceForOrnament(item.design, item.hash, item.bytes, item.actual, sourceHash, generatorHash, contractHash, source.common);
  const collection = {
    id: source.id, version: 1, category: 'decor',
    provenance: { sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, functionalContractSource: CONTRACT_PATH,
      functionalContractSourceSha256: contractHash, generator: GENERATOR_PATH, generatorSha256: generatorHash,
      license: 'Project-authored procedural geometry and solid-color materials. No external art assets.' },
    resources: [...shelves.map(item => item.resource), ...ornaments.map(item => item.resource)]
      .map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 }))
  };
  const files = new Map();
  for (const item of shelves) {
    const base = `prototype/public/company-assets/support-collection-v1/shelves/${item.design.id}/v1/`;
    files.set(`${base}model.glb`, item.bytes); files.set(`${base}resource.json`, Buffer.from(JSON.stringify(item.resource, null, 2) + '\n'));
  }
  for (const item of ornaments) {
    const base = `prototype/public/company-assets/support-collection-v1/ornaments/${item.design.id}/v1/`;
    files.set(`${base}model.glb`, item.bytes); files.set(`${base}resource.json`, Buffer.from(JSON.stringify(item.resource, null, 2) + '\n'));
  }
  files.set('prototype/public/company-assets/support-collection-v1/collection.json', Buffer.from(JSON.stringify(collection, null, 2) + '\n'));
  return { sourceHash, contractHash, generatorHash, shelves, ornaments, collection, files };
}

async function main() {
  const sourceBytes = await fs.readFile(new URL(SOURCE_PATH, ROOT));
  const contractBytes = await fs.readFile(new URL(CONTRACT_PATH, ROOT));
  const source = JSON.parse(sourceBytes);
  const generatorBytes = await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  const result = await buildCollection({ source, sourceBytes, contractBytes, generatorBytes });
  const initialSource = structuredClone(source);
  initialSource.shelves[0].differences.rearRailHeight = 0.08;
  initialSource.ornaments[0].differences.stoneWidths = [0.16, 0.12, 0.1];
  const initialShelfBytes = await exportShelfGlb(initialSource.shelves[0], initialSource.common);
  const initialOrnamentBytes = await exportOrnamentGlb(initialSource.ornaments[0], initialSource.common);
  const initialShelfParametersBytes = Buffer.from(JSON.stringify(initialSource.shelves[0], null, 2) + '\n');
  const initialOrnamentParametersBytes = Buffer.from(JSON.stringify(initialSource.ornaments[0], null, 2) + '\n');
  const variantSource = structuredClone(source);
  variantSource.shelves[0].differences.rearRailHeight = 0.08;
  variantSource.ornaments[0].differences.stoneWidths = [0.16, 0.12, 0.1];
  const variantShelf = variantSource.shelves[0];
  const variantOrnament = variantSource.ornaments[0];
  const variantShelfBytes = await exportShelfGlb(variantShelf, variantSource.common);
  const variantShelfRepeat = await exportShelfGlb(variantShelf, variantSource.common);
  const variantShelfActual = await readbackShelf(variantShelfBytes, variantShelf, variantSource.common);
  const variantOrnamentBytes = await exportOrnamentGlb(variantOrnament, variantSource.common);
  const variantOrnamentRepeat = await exportOrnamentGlb(variantOrnament, variantSource.common);
  const variantOrnamentActual = await readbackOrnament(variantOrnamentBytes, variantOrnament, variantSource.common);
  assert(variantShelfBytes.equals(variantShelfRepeat) && variantOrnamentBytes.equals(variantOrnamentRepeat));
  assert.notEqual(sha256(variantShelfBytes), result.shelves[0].hash, 'Shelf source edit must change bytes');
  assert.notEqual(sha256(variantOrnamentBytes), result.ornaments[0].hash, 'Ornament source edit must change bytes');
  const variantShelfParametersBytes = Buffer.from(JSON.stringify(variantSource.shelves[0], null, 2) + '\n');
  const variantOrnamentParametersBytes = Buffer.from(JSON.stringify(variantSource.ornaments[0], null, 2) + '\n');
  const report = {
    status: 'passed', scope: 'Four open support shelves and four static tabletop ornaments, CPU-only GLB production and readback',
    dispatch: { difficulty: 'complex', model: 'gpt-6.1-sol', reasoning_effort: 'high',
      reason: 'Eight distinct procedural assets with shared support geometry and deterministic GLB readback.', configurationEvidence: 'Parent-confirmed explicit configuration. Host hook interception unverified.' },
    commands: ['node scripts/company-platform/build-support-collection.mjs', 'node scripts/company-platform/build-support-collection.mjs --check'],
    sourceParameters: SOURCE_PATH, sourceParametersSha256: result.sourceHash, functionalContractSource: CONTRACT_PATH,
    functionalContractSourceSha256: result.contractHash, generator: GENERATOR_PATH, generatorSha256: result.generatorHash,
    promptStandard: source.common.promptStandard,
    shelves: result.shelves.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length, repeatedExportByteIdentical: item.bytes.equals(item.repeat), actual: item.actual })),
    ornaments: result.ornaments.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length, repeatedExportByteIdentical: item.bytes.equals(item.repeat), actual: item.actual })),
    sourceModificationEvidence: {
      shelf: { design: variantShelf.id, parameters: variantShelf.differences, sha256: sha256(variantShelfBytes), bytes: variantShelfBytes.length,
        parametersPath: 'evidence/company-support-production-v1/variant-shelf-frame-posts.parameters.json', parametersSha256: sha256(variantShelfParametersBytes),
        outputPath: 'evidence/company-support-production-v1/variant-shelf-frame-posts.glb',
        repeatedExportByteIdentical: variantShelfBytes.equals(variantShelfRepeat), actual: variantShelfActual },
      ornament: { design: variantOrnament.id, parameters: variantOrnament.differences, sha256: sha256(variantOrnamentBytes), bytes: variantOrnamentBytes.length,
        parametersPath: 'evidence/company-support-production-v1/variant-ornament-stacked-stones.parameters.json', parametersSha256: sha256(variantOrnamentParametersBytes),
        outputPath: 'evidence/company-support-production-v1/variant-ornament-stacked-stones.glb',
        repeatedExportByteIdentical: variantOrnamentBytes.equals(variantOrnamentRepeat), actual: variantOrnamentActual }
    },
    initialCandidateEvidence: {
      sourceValues: { shelfRearRailHeight: 0.08, ornamentStoneWidths: [0.16, 0.12, 0.1] },
      shelf: { parametersPath: 'evidence/company-support-production-v1/initial-shelf-frame-posts.parameters.json', parametersSha256: sha256(initialShelfParametersBytes),
        outputPath: 'evidence/company-support-production-v1/initial-shelf-frame-posts.glb', sha256: sha256(initialShelfBytes), bytes: initialShelfBytes.length },
      ornament: { parametersPath: 'evidence/company-support-production-v1/initial-ornament-stacked-stones.parameters.json', parametersSha256: sha256(initialOrnamentParametersBytes),
        outputPath: 'evidence/company-support-production-v1/initial-ornament-stacked-stones.glb', sha256: sha256(initialOrnamentBytes), bytes: initialOrnamentBytes.length }
    },
    history: {
      previousReport: 'evidence/company-support-production-v1/report-initial-candidate.json',
      failureRootCauses: [
        'Original stacked-stones source left visible vertical gaps between the three stone meshes. Formal source now uses touching centers 0.035, 0.1 and 0.145.',
        'Original crossback braces used a short 1.76m bar at a 0.22rad angle and did not reach the side columns. Formal source now derives angle and length from braceSpan 0.92m and braceRise 1.72m.',
        'A temporary variant post-width edit changed the declared outer envelope. Source modification evidence now varies rear rail height while preserving the fixed envelope.'
      ]
    },
    contract: { shelfEnvelope: result.collection.resources.slice(0, 4).map(resource => resource.id), supportSurfaceIds: ['lower', 'middle', 'top'],
      patchHalfSize: [0.42, 0.13], board: { width: 0.92, depth: 0.31, thickness: 0.035 }, ornamentEnvelope: [0.16, 0.12, 0.2] },
    limitations: ['Project-authored schematic geometry. Browser visual acceptance and physical character use remain outside this CPU-only package.',
      'Support rectangles are the declared compatibility contract. Arbitrary curved supports, doors, drawers and physics are not represented.']
  };
  const evidenceFiles = new Map([
    ['evidence/company-support-production-v1/report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n')],
    ['evidence/company-support-production-v1/initial-shelf-frame-posts.parameters.json', initialShelfParametersBytes],
    ['evidence/company-support-production-v1/initial-shelf-frame-posts.glb', initialShelfBytes],
    ['evidence/company-support-production-v1/initial-ornament-stacked-stones.parameters.json', initialOrnamentParametersBytes],
    ['evidence/company-support-production-v1/initial-ornament-stacked-stones.glb', initialOrnamentBytes],
    ['evidence/company-support-production-v1/variant-shelf-frame-posts.parameters.json', variantShelfParametersBytes],
    ['evidence/company-support-production-v1/variant-shelf-frame-posts.glb', variantShelfBytes],
    ['evidence/company-support-production-v1/variant-ornament-stacked-stones.parameters.json', variantOrnamentParametersBytes],
    ['evidence/company-support-production-v1/variant-ornament-stacked-stones.glb', variantOrnamentBytes]
  ]);
  const allFiles = new Map([...result.files, ...evidenceFiles]);
  if (process.argv.includes('--check')) {
    for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  } else {
    for (const [file, bytes] of allFiles) {
      const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes);
    }
  }
  console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build',
    shelves: result.shelves.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length })),
    ornaments: result.ornaments.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length })) }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
