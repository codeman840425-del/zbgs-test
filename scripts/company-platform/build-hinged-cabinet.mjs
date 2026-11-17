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
export const SOURCE_PATH = 'assets-source/company-hinged-cabinet-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-HINGED-CABINET-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-hinged-cabinet.mjs';
export const DESIGN_IDS = ['flat-panel', 'frame-panel', 'slatted', 'curved-detail'];
export const MOVING_PARTS = [{ id: 'door', stateField: 'openFraction', kind: 'hinge', axis: 'y',
  pivot: [-0.42, 0, 0.245], rotationRange: [0, -Math.PI / 2], bounds: { min: [0, 0.1, -0.02], max: [0.84, 1.12, 0.03] } }];
export const STATE_SCHEMA = { openFraction: { type: 'number', min: 0, max: 1 } };
export const STATE_SEMANTICS = { openFraction: 'hinged-door-opening-fraction' };

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;
const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);

function validateSource(source) {
  assert.equal(source.id, 'company-hinged-cabinet-v1');
  assert.equal(source.version, 1);
  const c = source.common;
  assert(typeof c.promptStandard === 'string' && c.promptStandard.length > 100);
  assert.deepEqual(c.envelope, { width: 0.9, height: 1.2, depth: 0.55 });
  assert.deepEqual(c.body, { width: 0.9, depth: 0.45 });
  assert.deepEqual(c.footprint, { center: [0, 0], halfSize: [0.45, 0.275] });
  assert.deepEqual(c.top, { width: 0.9, depth: 0.45, thickness: 0.035, topY: 1.2 });
  assert.deepEqual(c.supportSurface, { id: 'top', center: [0, 0], topY: 1.2, halfSize: [0.4, 0.18], clearanceHeight: 0.4 });
  assert.deepEqual(c.door.pivot, [-0.42, 0, 0.245]);
  assert.deepEqual(c.door.bounds, MOVING_PARTS[0].bounds);
  assert.deepEqual(c.door.rotationRange, MOVING_PARTS[0].rotationRange);
  assert.deepEqual(source.designs.map(design => design.id), DESIGN_IDS);
  for (const design of source.designs) {
    assert(design.label && design.prompt && design.license);
    assert(design.differences && Object.values(design.differences).every(value => Number.isFinite(value)));
  }
}

function material(color, roughness = 0.74) { return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 }); }
function addMesh(root, name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.position.fromArray(position); mesh.rotation.set(...rotation); root.add(mesh); return mesh;
}
function box(root, name, size, mat, position, rotation = [0, 0, 0]) { return addMesh(root, name, new THREE.BoxGeometry(...size), mat, position, rotation); }

function addDoorLeaf(pivot, design, common, doorMat, trimMat) {
  const bounds = common.door.bounds;
  addMesh(pivot, 'cabinet-door-leaf', new THREE.BoxGeometry(0.84, 1.02, 0.035), doorMat, [0.42, 0.61, -0.0025]);
  box(pivot, 'door-hinge-lower', [0.025, 0.12, 0.04], trimMat, [0.0125, 0.22, 0]);
  box(pivot, 'door-hinge-upper', [0.025, 0.12, 0.04], trimMat, [0.0125, 0.98, 0]);
  if (design.id === 'frame-panel') {
    const w = design.differences.railWidth, d = design.differences.railDepth;
    box(pivot, 'door-frame-top', [0.84, w, d], trimMat, [0.42, 1.095, 0.018]);
    box(pivot, 'door-frame-bottom', [0.84, w, d], trimMat, [0.42, 0.125, 0.018]);
    box(pivot, 'door-frame-left', [w, 0.92, d], trimMat, [0.025, 0.61, 0.018]);
    box(pivot, 'door-frame-right', [w, 0.92, d], trimMat, [0.815, 0.61, 0.018]);
  } else if (design.id === 'slatted') {
    const { slatCount, slatWidth, slatGap } = design.differences;
    const total = slatCount * slatWidth + (slatCount - 1) * slatGap;
    const start = (0.84 - total) / 2 + slatWidth / 2;
    for (let index = 0; index < slatCount; index += 1)
      box(pivot, `door-slat-${index + 1}`, [slatWidth, 0.93, 0.018], trimMat, [start + index * (slatWidth + slatGap), 0.61, 0.018]);
  } else if (design.id === 'curved-detail') {
    const points = [];
    for (let index = 0; index <= 16; index += 1) {
      const t = index / 16;
      const x = design.differences.curveInset + (0.84 - design.differences.curveInset * 2) * t;
      points.push(new THREE.Vector3(x, 0.24 + 0.62 * Math.sin(Math.PI * t), 0.015));
    }
    addMesh(pivot, 'door-curved-arch', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, design.differences.curveRadius, 8, false), trimMat);
  }
  const width = design.differences.handleWidth ?? 0.09;
  const radius = design.differences.handleRadius ?? 0.012;
  addMesh(pivot, 'door-handle', new THREE.CylinderGeometry(radius, radius, width, 16), trimMat, [0.72, 0.61, 0.015], [0, 0, Math.PI / 2]);
}

export function createCabinet(design, common) {
  assert(DESIGN_IDS.includes(design.id));
  const root = new THREE.Group(); root.name = `hinged-cabinet-${design.id}`;
  root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', designId: design.id, sourceVersion: 1 };
  const bodyMat = material('#7c5540', 0.79), innerMat = material('#b39068', 0.88), doorMat = material('#a36f49', 0.72), trimMat = material('#d7ae73', 0.62);
  box(root, 'cabinet-top', [0.9, 0.035, 0.45], bodyMat, [0, 1.1825, 0]);
  box(root, 'cabinet-bottom', [0.9, 0.07, 0.45], bodyMat, [0, 0.035, 0]);
  box(root, 'cabinet-side-left', [0.06, 1.12, 0.45], bodyMat, [-0.42, 0.61, 0]);
  box(root, 'cabinet-side-right', [0.06, 1.12, 0.45], bodyMat, [0.42, 0.61, 0]);
  box(root, 'cabinet-inner-back', [0.84, 1.08, 0.035], innerMat, [0, 0.61, -0.2075]);
  box(root, 'cabinet-inner-floor', [0.84, 0.025, 0.4], innerMat, [0, 0.085, 0]);
  box(root, 'cabinet-back-rail', [0.84, 0.04, 0.035], bodyMat, [0, 1.14, -0.2075]);
  const pivot = new THREE.Group(); pivot.name = 'cabinet-door-pivot'; pivot.position.fromArray(common.door.pivot);
  const doorMatByDesign = { 'flat-panel': '#a36f49', 'frame-panel': '#4c7180', slatted: '#9b704e', 'curved-detail': '#725b85' };
  doorMat.color.set(doorMatByDesign[design.id]);
  addDoorLeaf(pivot, design, common, doorMat, trimMat);
  root.add(pivot);
  root.updateMatrixWorld(true);
  return root;
}

function dispose(object) {
  const materials = new Set(); object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); }); materials.forEach(mat => mat.dispose());
}

export function validateDesignSource(design, common) {
  assert(design && DESIGN_IDS.includes(design.id));
  assert(common && typeof common.promptStandard === 'string');
  assert(design.label && design.prompt && design.license && design.differences);
  assert(Object.values(design.differences).every(value => Number.isFinite(value)));
  return true;
}

export async function exportCabinetGlb(design, common) {
  assert(DESIGN_IDS.includes(design.id));
  const object = createCabinet(design, common);
  try { return Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true, animations: [], copyright: `Project-authored hinged cabinet ${design.id}. No external art assets.` })); }
  finally { dispose(object); }
}

function parseGlbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2);
  const jsonLength = bytes.readUInt32LE(12); assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}
function meshByName(object, name) { const node = object.getObjectByName(name); assert(node?.isMesh, `Missing mesh ${name}`); return node; }
function meshBounds(object, name) { const node = meshByName(object, name); return { node, box: new THREE.Box3().setFromObject(node) }; }

function trianglesInParent(mesh, parent) {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position'), index = geometry.getIndex();
  const transform = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(mesh.matrixWorld);
  const point = i => new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(transform);
  const read = i => index ? index.getX(i) : i;
  const triangles = [];
  for (let offset = 0; offset < (index ? index.count : positions.count); offset += 3) {
    const points = [point(read(offset)), point(read(offset + 1)), point(read(offset + 2))];
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(points[1], points[0]), new THREE.Vector3().subVectors(points[2], points[0])).normalize();
    triangles.push({ points, normal });
  }
  return triangles;
}

function verifyDoorPanel(pivot, bounds) {
  const panel = meshByName(pivot, 'cabinet-door-leaf');
  const panelBounds = new THREE.Box3();
  for (const triangle of trianglesInParent(panel, pivot)) for (const point of triangle.points) panelBounds.expandByPoint(point);
  assert(near(panelBounds.min.x, bounds.min[0]) && near(panelBounds.max.x, bounds.max[0]));
  assert(near(panelBounds.min.y, bounds.min[1]) && near(panelBounds.max.y, bounds.max[1]));
  const front = trianglesInParent(panel, pivot).filter(triangle => triangle.normal.z > 0.9 && triangle.points.every(point => near(point.z, panelBounds.max.z)));
  assert.equal(front.length, 2, 'Door leaf must have two upward-facing front triangles');
  const points = front.flatMap(triangle => triangle.points);
  assert(near(Math.min(...points.map(point => point.x)), bounds.min[0]) && near(Math.max(...points.map(point => point.x)), bounds.max[0]));
  assert(near(Math.min(...points.map(point => point.y)), bounds.min[1]) && near(Math.max(...points.map(point => point.y)), bounds.max[1]));
  return { mesh: panel.name, frontTriangles: 2, bounds: { min: panelBounds.min.toArray(), max: panelBounds.max.toArray() }, frontZ: panelBounds.max.z };
}

export async function readbackCabinet(bytes, design, common) {
  const json = parseGlbJson(bytes); assert(!json.skins?.length && !json.animations?.length && !json.images?.length); assert(json.buffers?.every(buffer => buffer.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = loaded.scene; scene.updateMatrixWorld(true);
  try {
    const pivot = scene.getObjectByName('cabinet-door-pivot'); assert(pivot?.isObject3D, 'Pivot group missing');
    assert(pivot.parent?.isObject3D); assert(near(pivot.position.x, -0.42) && near(pivot.position.y, 0) && near(pivot.position.z, 0.245));
    assert(near(pivot.parent.position.x, 0) && near(pivot.parent.position.y, 0) && near(pivot.parent.position.z, 0));
    assert(near(pivot.parent.rotation.x, 0) && near(pivot.parent.rotation.y, 0) && near(pivot.parent.rotation.z, 0));
    assert(pivot.parent.scale.equals(new THREE.Vector3(1, 1, 1)));
    assert(near(pivot.rotation.x, 0) && near(pivot.rotation.y, 0) && near(pivot.rotation.z, 0)); assert(pivot.scale.equals(new THREE.Vector3(1, 1, 1)));
    const doorBounds = common.door.bounds;
    const localDoor = new THREE.Box3();
    pivot.traverse(node => { if (!node.isMesh) return; for (const triangle of trianglesInParent(node, pivot)) for (const point of triangle.points) localDoor.expandByPoint(point); });
    assert(localDoor.min.x >= doorBounds.min[0] - 1e-5 && localDoor.max.x <= doorBounds.max[0] + 1e-5);
    assert(localDoor.min.y >= doorBounds.min[1] - 1e-5 && localDoor.max.y <= doorBounds.max[1] + 1e-5);
    assert(localDoor.min.z >= doorBounds.min[2] - 1e-5 && localDoor.max.z <= doorBounds.max[2] + 1e-5);
    const panel = verifyDoorPanel(pivot, doorBounds);
    const top = meshBounds(scene, 'cabinet-top').box; assert(near(top.max.y, 1.2, 1e-4)); assert(near(top.getSize(new THREE.Vector3()).x, 0.9, 1e-4)); assert(near(top.getSize(new THREE.Vector3()).z, 0.45, 1e-4));
    const cavityBack = meshBounds(scene, 'cabinet-inner-back').box; assert(cavityBack.max.z < -0.18, 'Back panel must sit behind a visible cavity');
    const cavityMeshes = []; scene.traverse(node => { if (node.isMesh && node !== pivot && !pivot.getObjectById(node.id)) cavityMeshes.push(node); });
    for (const mesh of cavityMeshes) { const b = new THREE.Box3().setFromObject(mesh); const interior = b.min.x < 0.35 && b.max.x > -0.35 && b.min.y < 1.1 && b.max.y > 0.12 && b.min.z < 0.2 && b.max.z > -0.18; assert(!(interior && b.min.z > -0.18), `Static mesh ${mesh.name} fills the cabinet cavity`); }
    const closed = new THREE.Box3().setFromObject(scene); assert(closed.min.y >= -1e-4 && closed.max.y <= 1.2 + 1e-4); assert(closed.min.x >= -0.45 - 1e-4 && closed.max.x <= 0.45 + 1e-4); assert(closed.min.z >= -0.275 - 1e-4 && closed.max.z <= 0.275 + 1e-4);
    const poses = [];
    for (const fraction of [0, 0.5, 1]) { pivot.rotation.y = -Math.PI / 2 * fraction; pivot.updateMatrixWorld(true); const door = new THREE.Box3().setFromObject(pivot); poses.push({ openFraction: fraction, bounds: { min: door.min.toArray(), max: door.max.toArray() }, hinge: pivot.localToWorld(new THREE.Vector3(0, 0, 0)).toArray() }); }
    assert(poses[2].bounds.max[2] > poses[0].bounds.max[2] + 0.2, `Opening must move the attached door toward +Z (${poses[0].bounds.max[2]} -> ${poses[2].bounds.max[2]})`);
    pivot.rotation.y = 0;
    return { bounds: { min: closed.min.toArray(), max: closed.max.toArray() }, topNode: 'cabinet-top', pivot: pivot.name,
      panel, cavity: { backNode: 'cabinet-inner-back', backMaxZ: cavityBack.max.z, openFront: true }, poses,
      meshCount: json.meshes.length, identityScale: true, externalUris: json.buffers.filter(buffer => buffer.uri !== undefined).length };
  } finally { dispose(scene); }
}

function resourceUrl(id) { return `/company-assets/hinged-cabinet-v1/${id}/v1/model.glb`; }
function prompt(common, design) { return `${common.promptStandard} Design difference: ${design.prompt} Contract: one door uses pivot [-0.42,0,0.245], local bounds x[0,0.84], y[0.1,1.12], z[-0.02,0.03], and rotates from 0 to -PI/2 around Y.`; }

function makeResource(design, commonSource, bytes, actual, sourceHash, contractHash, generatorHash) {
  const common = {
    units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', scale: 'Identity only'
  };
  return {
    id: `hinged-cabinet-${design.id}`, displayName: design.label, version: 1, category: 'dynamic', mountRole: 'hinged-cabinet', coordinates: common,
    provenance: { license: design.license, prompt: prompt(commonSource, design), tools: [`Three.js ${THREE.REVISION}`, 'Object3D pivot group', 'Box3 readback', 'GLTFExporter', 'GLTFLoader readback'], sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, sourceDesign: design.id, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash, generator: GENERATOR_PATH, generatorSha256: generatorHash, method: design.prompt },
    asset: { format: 'glb', url: resourceUrl(design.id), sha256: sha256(bytes), bytes: bytes.length },
    footprint: { center: [0, 0], halfSize: [0.45, 0.275], blocking: true },
    mounting: { origin: 'bottom', width: 0.9, height: 1.2, depth: 0.55 },
    supportSurfaces: [{ id: 'top', center: [0, 0], topY: 1.2, halfSize: [0.4, 0.18], clearanceHeight: 0.4 }], supportNodes: { top: 'cabinet-top' },
    usePoints: [], stateDefaults: { openFraction: 0 }, stateSchema: structuredClone(STATE_SCHEMA), stateSemantics: structuredClone(STATE_SEMANTICS), movingParts: structuredClone(MOVING_PARTS), partNodes: { door: 'cabinet-door-pivot' }, partPanels: { door: 'cabinet-door-leaf' }
  };
}

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes = null } = {}) {
  validateSource(source); const generatorHash = sha256(generatorBytes ?? await fs.readFile(new URL(GENERATOR_PATH, ROOT)));
  const sourceHash = sha256(sourceBytes ?? Buffer.from(JSON.stringify(source))); const contractHash = sha256(contractBytes ?? Buffer.from(''));
  const items = [];
  for (const design of source.designs) { const bytes = await exportCabinetGlb(design, source.common); const repeat = await exportCabinetGlb(design, source.common); assert(bytes.equals(repeat), `Nondeterministic ${design.id}`); const actual = await readbackCabinet(bytes, design, source.common); items.push({ design, bytes, repeat, actual, hash: sha256(bytes) }); }
  assert.equal(new Set(items.map(item => item.hash)).size, 4, 'Cabinet geometry hashes must differ');
  const resources = items.map(item => makeResource(item.design, source.common, item.bytes, item.actual, sourceHash, contractHash, generatorHash));
  const collection = { id: 'company-hinged-cabinet-v1', version: 1, category: 'dynamic', provenance: { sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash, generator: GENERATOR_PATH, generatorSha256: generatorHash, license: 'Project-authored procedural geometry and solid-color materials. No external art assets.' }, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
  const files = new Map();
  for (const item of items) { const base = `prototype/public/company-assets/hinged-cabinet-v1/${item.design.id}/v1/`; const resource = resources.find(value => value.id === `hinged-cabinet-${item.design.id}`); files.set(`${base}model.glb`, item.bytes); files.set(`${base}resource.json`, Buffer.from(JSON.stringify(resource, null, 2) + '\n')); }
  files.set('prototype/public/company-assets/hinged-cabinet-v1/collection.json', Buffer.from(JSON.stringify(collection, null, 2) + '\n'));
  return { sourceHash, contractHash, generatorHash, items, resources, collection, files };
}

async function main() {
  const sourceBytes = await fs.readFile(new URL(SOURCE_PATH, ROOT)); const contractBytes = await fs.readFile(new URL(CONTRACT_PATH, ROOT)); const source = JSON.parse(sourceBytes); const generatorBytes = await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  const result = await buildCollection({ source, sourceBytes, contractBytes, generatorBytes });
  const initialSource = structuredClone(source); initialSource.designs[0].differences.handleWidth = 0.08;
  const initialBytes = await exportCabinetGlb(initialSource.designs[0], initialSource.common); const initialRepeat = await exportCabinetGlb(initialSource.designs[0], initialSource.common); assert(initialBytes.equals(initialRepeat));
  const variantSource = structuredClone(source); variantSource.designs[0].differences.handleWidth = 0.08;
  const variantBytes = await exportCabinetGlb(variantSource.designs[0], variantSource.common); const variantRepeat = await exportCabinetGlb(variantSource.designs[0], variantSource.common); const variantActual = await readbackCabinet(variantBytes, variantSource.designs[0], variantSource.common); assert(variantBytes.equals(variantRepeat)); assert.notEqual(sha256(variantBytes), result.items[0].hash);
  const initialParams = Buffer.from(JSON.stringify(initialSource.designs[0], null, 2) + '\n'); const variantParams = Buffer.from(JSON.stringify(variantSource.designs[0], null, 2) + '\n');
  const report = { status: 'passed', scope: 'Four single-door hinged cabinets with authored cavity, pivot and top support readback', dispatch: { difficulty: 'complex', model: 'gpt-6.1-sol', reasoning_effort: 'high', reason: 'Four compatible hinged cabinets require exact authored joint hierarchy, visible cavities and support contacts.', configurationEvidence: 'Parent-confirmed explicit configuration. Host hook interception unverified.' }, commands: ['node scripts/company-platform/build-hinged-cabinet.mjs', 'node scripts/company-platform/build-hinged-cabinet.mjs --check'], sourceParameters: SOURCE_PATH, sourceParametersSha256: result.sourceHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: result.contractHash, generator: GENERATOR_PATH, generatorSha256: result.generatorHash, items: result.items.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length, repeatedExportByteIdentical: item.bytes.equals(item.repeat), actual: item.actual })), sourceModificationEvidence: { design: 'flat-panel', formalHandleWidth: source.designs[0].differences.handleWidth, initialHandleWidth: 0.08, parametersPath: 'evidence/company-hinged-production-v1/variant-flat-panel.parameters.json', parametersSha256: sha256(variantParams), outputPath: 'evidence/company-hinged-production-v1/variant-flat-panel.glb', sha256: sha256(variantBytes), bytes: variantBytes.length, repeatedExportByteIdentical: variantBytes.equals(variantRepeat), actual: variantActual }, initialCandidateEvidence: { parametersPath: 'evidence/company-hinged-production-v1/initial-flat-panel.parameters.json', parametersSha256: sha256(initialParams), outputPath: 'evidence/company-hinged-production-v1/initial-flat-panel.glb', sha256: sha256(initialBytes), bytes: initialBytes.length }, contract: { envelope: [0.9, 1.2, 0.55], body: [0.9, 0.45], pivot: [-0.42, 0, 0.245], doorBounds: { min: [0, 0.1, -0.02], max: [0.84, 1.12, 0.03] }, support: { topY: 1.2, halfSize: [0.4, 0.18], clearanceHeight: 0.4 } }, limitations: ['Project-authored schematic geometry. Browser visual acceptance and character interaction remain outside this CPU-only package.', 'Door blocking uses the fixed pivot bounds and state semantics. No animation clips, physics or drawers are represented.'] };
  const evidence = new Map([['evidence/company-hinged-production-v1/report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n')], ['evidence/company-hinged-production-v1/initial-flat-panel.parameters.json', initialParams], ['evidence/company-hinged-production-v1/initial-flat-panel.glb', initialBytes], ['evidence/company-hinged-production-v1/variant-flat-panel.parameters.json', variantParams], ['evidence/company-hinged-production-v1/variant-flat-panel.glb', variantBytes]]);
  const all = new Map([...result.files, ...evidence]);
  if (process.argv.includes('--check')) for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`);
  else for (const [file, bytes] of all) { const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
  console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', items: result.items.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length })) }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
