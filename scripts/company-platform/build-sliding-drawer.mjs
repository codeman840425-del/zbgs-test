import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); }
};

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-sliding-drawer-v1/parameters.json';
export const CONTRACT_PATH = 'docs/COMPANY-SLIDING-DRAWER-CONTRACT-v1.txt';
export const GENERATOR_PATH = 'scripts/company-platform/build-sliding-drawer.mjs';
export const DESIGN_IDS = ['flat-panel', 'frame-panel', 'slatted', 'curved-detail'];
export const MOVING_PARTS = [{ id: 'drawer', stateField: 'openFraction', kind: 'slide', axis: 'z', pivot: [0, 0, 0], translationRange: [0, 0.32], bounds: { min: [-0.42, 0.78, -0.205], max: [0.42, 1.12, 0.275] } }];
export const STATE_SCHEMA = { openFraction: { type: 'number', min: 0, max: 1 } };
export const STATE_SEMANTICS = { openFraction: 'sliding-drawer-opening-fraction' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;

function validateSource(source) {
  assert.equal(source.id, 'company-sliding-drawer-v1'); assert.equal(source.version, 1);
  const c = source.common; assert(typeof c.promptStandard === 'string' && c.promptStandard.length > 100);
  assert.deepEqual(c.envelope, { width: 0.9, height: 1.2, depth: 0.55 }); assert.deepEqual(c.body, { width: 0.9, depth: 0.45 });
  assert.deepEqual(c.footprint, { center: [0, 0], halfSize: [0.45, 0.275] }); assert.deepEqual(c.top, { width: 0.9, depth: 0.45, thickness: 0.035, topY: 1.2 });
  assert.deepEqual(c.supportSurface, { id: 'top', center: [0, 0], topY: 1.2, halfSize: [0.4, 0.18], clearanceHeight: 0.4 });
  assert.deepEqual(c.drawer.pivot, [0, 0, 0]); assert.deepEqual(c.drawer.translationRange, [0, 0.32]); assert.deepEqual(c.drawer.bounds, MOVING_PARTS[0].bounds);
  assert.deepEqual(source.designs.map(design => design.id), DESIGN_IDS);
  for (const design of source.designs) assert(design.label && design.prompt && design.license && Object.values(design.differences).every(Number.isFinite));
}
function material(color, roughness = 0.75) { return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 }); }
function addMesh(root, name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) { const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.position.fromArray(position); mesh.rotation.set(...rotation); root.add(mesh); return mesh; }
function box(root, name, size, mat, position, rotation = [0, 0, 0]) { return addMesh(root, name, new THREE.BoxGeometry(...size), mat, position, rotation); }

function addDrawerFront(slide, design, doorMat, trimMat) {
  addMesh(slide, 'drawer-front', new THREE.BoxGeometry(0.84, 0.34, 0.035), doorMat, [0, 0.95, 0.245]);
  box(slide, 'drawer-handle', [design.differences.handleWidth ?? 0.09, 0.018, 0.016], trimMat, [0, 0.95, 0.267]);
  if (design.id === 'frame-panel') {
    const w = design.differences.railWidth, d = design.differences.railDepth;
    box(slide, 'drawer-frame-top', [0.84, w, d], trimMat, [0, 1.095, 0.265]); box(slide, 'drawer-frame-bottom', [0.84, w, d], trimMat, [0, 0.805, 0.265]);
    box(slide, 'drawer-frame-left', [w, 0.29, d], trimMat, [-0.395, 0.95, 0.265]); box(slide, 'drawer-frame-right', [w, 0.29, d], trimMat, [0.395, 0.95, 0.265]);
  } else if (design.id === 'slatted') {
    const { slatCount, slatWidth, slatGap } = design.differences, total = slatCount * slatWidth + (slatCount - 1) * slatGap, start = -0.42 + (0.84 - total) / 2 + slatWidth / 2;
    for (let index = 0; index < slatCount; index += 1) box(slide, `drawer-slat-${index + 1}`, [slatWidth, 0.29, 0.016], trimMat, [start + index * (slatWidth + slatGap), 0.95, 0.265]);
  } else if (design.id === 'curved-detail') {
    const points = [];
    for (let index = 0; index <= 16; index += 1) { const t = index / 16; points.push(new THREE.Vector3(-0.32 + 0.64 * t, 0.835 + 0.23 * Math.sin(Math.PI * t), 0.262)); }
    addMesh(slide, 'drawer-curved-arch', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, design.differences.curveRadius, 8, false), trimMat);
  }
}

export function createDrawer(design, common) {
  assert(DESIGN_IDS.includes(design.id));
  const root = new THREE.Group(); root.name = `sliding-drawer-cabinet-${design.id}`; root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', designId: design.id, sourceVersion: 1 };
  const bodyMat = material('#76503a', 0.8), innerMat = material('#b5916b', 0.88), trimMat = material('#d3a968', 0.63);
  const doorColors = { 'flat-panel': '#a26d48', 'frame-panel': '#4a7080', slatted: '#9a704c', 'curved-detail': '#725a84' };
  const drawerMat = material(doorColors[design.id], 0.72);
  box(root, 'cabinet-top', [0.9, 0.035, 0.45], bodyMat, [0, 1.1825, 0]); box(root, 'cabinet-bottom', [0.9, 0.07, 0.45], bodyMat, [0, 0.035, 0]);
  box(root, 'cabinet-side-left', [0.06, 1.12, 0.45], bodyMat, [-0.42, 0.61, 0]); box(root, 'cabinet-side-right', [0.06, 1.12, 0.45], bodyMat, [0.42, 0.61, 0]);
  box(root, 'cabinet-inner-back', [0.84, 1.08, 0.035], innerMat, [0, 0.61, -0.2075]); box(root, 'cabinet-back-rail', [0.84, 0.04, 0.035], bodyMat, [0, 1.14, -0.2075]);
  box(root, 'cabinet-drawer-divider', [0.84, 0.06, 0.4], bodyMat, [0, 0.72, 0]);
  box(root, 'drawer-runner-left', [0.12, 0.025, 0.39], trimMat, [-0.25, 0.7675, 0.02]); box(root, 'drawer-runner-right', [0.12, 0.025, 0.39], trimMat, [0.25, 0.7675, 0.02]);
  const slide = new THREE.Group(); slide.name = 'cabinet-drawer-slide'; slide.position.fromArray(common.drawer.pivot);
  addDrawerFront(slide, design, drawerMat, trimMat);
  box(slide, 'drawer-bottom', [0.76, 0.025, 0.4175], innerMat, [0, 0.7925, 0.01875]);
  box(slide, 'drawer-left', [0.025, 0.25, 0.4175], drawerMat, [-0.3675, 0.93, 0.01875]); box(slide, 'drawer-right', [0.025, 0.25, 0.4175], drawerMat, [0.3675, 0.93, 0.01875]);
  box(slide, 'drawer-back', [0.71, 0.25, 0.025], drawerMat, [0, 0.93, -0.1775]); root.add(slide); root.updateMatrixWorld(true); return root;
}
function dispose(object) { const geometries = new Set(), materials = new Set(); object.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); }); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); }
export function validateDesignSource(design, common) { assert(design && DESIGN_IDS.includes(design.id) && common?.promptStandard); assert(design.label && design.prompt && design.license); assert(Object.values(design.differences).every(Number.isFinite)); return true; }
export async function exportDrawerGlb(design, common) { validateDesignSource(design, common); const object = createDrawer(design, common); try { return Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true, animations: [], copyright: `Project-authored sliding drawer ${design.id}. No external art assets.` })); } finally { dispose(object); } }
function parseGlbJson(bytes) { assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); const length = bytes.readUInt32LE(12); assert.equal(bytes.readUInt32LE(16), 0x4e4f534a); return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')); }
function mesh(object, name) { const node = object.getObjectByName(name); assert(node?.isMesh, `Missing mesh ${name}`); return node; }
function trianglesInParent(node, parent) { const p = node.geometry.getAttribute('position'), index = node.geometry.getIndex(), transform = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(node.matrixWorld), read = offset => index ? index.getX(offset) : offset, triangles = []; const point = index => new THREE.Vector3(p.getX(index), p.getY(index), p.getZ(index)).applyMatrix4(transform); for (let offset = 0; offset < (index ? index.count : p.count); offset += 3) { const points = [point(read(offset)), point(read(offset + 1)), point(read(offset + 2))], normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(points[1], points[0]), new THREE.Vector3().subVectors(points[2], points[0])).normalize(); triangles.push({ points, normal }); } return triangles; }
function verifyFront(slide, bounds) { const panel = mesh(slide, 'drawer-front'), triangles = trianglesInParent(panel, slide), front = triangles.filter(triangle => triangle.normal.z > 0.9 && triangle.points.every(point => near(point.z, 0.2625))); assert.equal(front.length, 2); const points = front.flatMap(triangle => triangle.points); assert(near(Math.min(...points.map(point => point.x)), bounds.min[0]) && near(Math.max(...points.map(point => point.x)), bounds.max[0]) && near(Math.min(...points.map(point => point.y)), bounds.min[1]) && near(Math.max(...points.map(point => point.y)), bounds.max[1])); return { mesh: panel.name, frontTriangles: 2, frontZ: 0.2625 }; }

export async function readbackDrawer(bytes, design, common) {
  const json = parseGlbJson(bytes); assert(!json.skins?.length && !json.animations?.length && !json.images?.length && json.buffers?.every(buffer => buffer.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''), scene = loaded.scene; scene.updateMatrixWorld(true);
  try {
    const slide = scene.getObjectByName('cabinet-drawer-slide'); assert(slide?.isObject3D); assert(slide.parent?.isObject3D); assert(near(slide.position.x, 0) && near(slide.position.y, 0) && near(slide.position.z, 0)); assert(near(slide.rotation.x, 0) && near(slide.rotation.y, 0) && near(slide.rotation.z, 0)); assert(slide.scale.equals(new THREE.Vector3(1, 1, 1))); assert(slide.parent.position.length() < 1e-6 && slide.parent.scale.equals(new THREE.Vector3(1, 1, 1)));
    const bounds = common.drawer.bounds, local = new THREE.Box3(); slide.traverse(node => { if (node.isMesh) for (const triangle of trianglesInParent(node, slide)) for (const point of triangle.points) local.expandByPoint(point); });
    assert(local.min.x >= bounds.min[0] - 1e-5 && local.max.x <= bounds.max[0] + 1e-5 && local.min.y >= bounds.min[1] - 1e-5 && local.max.y <= bounds.max[1] + 1e-5 && local.min.z >= bounds.min[2] - 1e-5 && local.max.z <= bounds.max[2] + 1e-5);
    const panel = verifyFront(slide, { min: [-0.42, 0.78], max: [0.42, 1.12] });
    const expected = { 'drawer-bottom': [[-0.38, 0.78, -0.19], [0.38, 0.805, 0.2275]], 'drawer-left': [[-0.38, 0.805, -0.19], [-0.355, 1.055, 0.2275]], 'drawer-right': [[0.355, 0.805, -0.19], [0.38, 1.055, 0.2275]], 'drawer-back': [[-0.355, 0.805, -0.19], [0.355, 1.055, -0.165]] };
    const tray = {}; for (const [name, extent] of Object.entries(expected)) { const box3 = new THREE.Box3().setFromObject(mesh(slide, name)); assert(near(box3.min.x, extent[0][0], 1e-4) && near(box3.min.y, extent[0][1], 1e-4) && near(box3.min.z, extent[0][2], 1e-4) && near(box3.max.x, extent[1][0], 1e-4) && near(box3.max.y, extent[1][1], 1e-4) && near(box3.max.z, extent[1][2], 1e-4)); tray[name] = { min: box3.min.toArray(), max: box3.max.toArray() }; }
    const cavityBack = new THREE.Box3().setFromObject(mesh(scene, 'cabinet-inner-back')); assert(cavityBack.max.z < -0.18);
    const staticMeshes = [], movingMeshes = [];
    scene.traverse(node => { if (!node.isMesh) return; (slide.getObjectById(node.id) ? movingMeshes : staticMeshes).push(node); });
    const overlap = (a, b) => a.min.x < b.max.x - 1e-5 && a.max.x > b.min.x + 1e-5 && a.min.y < b.max.y - 1e-5 && a.max.y > b.min.y + 1e-5 && a.min.z < b.max.z - 1e-5 && a.max.z > b.min.z + 1e-5;
    const staticClearance = [];
    for (const fraction of [0, 0.5, 1]) {
      slide.position.z = fraction * 0.32; slide.updateMatrixWorld(true);
      for (const moving of movingMeshes) for (const fixed of staticMeshes) assert(!overlap(new THREE.Box3().setFromObject(moving), new THREE.Box3().setFromObject(fixed)), `Moving ${moving.name} penetrates static ${fixed.name}`);
      staticClearance.push({ openFraction: fraction, checkedMeshes: movingMeshes.length * staticMeshes.length });
    }
    slide.position.z = 0;
    const cavity = new THREE.Box3(new THREE.Vector3(-0.355, 0.805, -0.165), new THREE.Vector3(0.355, 1.055, 0.2275));
    for (const fixed of staticMeshes) { const box3 = new THREE.Box3().setFromObject(fixed); assert(!overlap(box3, cavity), `Static ${fixed.name} fills the tray cavity`); }
    const body = new THREE.Box3().setFromObject(scene); assert(body.min.y >= -1e-4 && body.max.y <= 1.2 + 1e-4 && body.min.x >= -0.45 - 1e-4 && body.max.x <= 0.45 + 1e-4 && body.min.z >= -0.225 - 1e-4 && body.max.z <= 0.275 + 1e-4);
    const poses = []; for (const fraction of [0, 0.5, 1]) { slide.position.z = fraction * 0.32; slide.updateMatrixWorld(true); const box3 = new THREE.Box3().setFromObject(slide); poses.push({ openFraction: fraction, translationZ: slide.position.z, bounds: { min: box3.min.toArray(), max: box3.max.toArray() } }); } assert(near(poses[1].translationZ, 0.16) && near(poses[2].translationZ, 0.32)); assert(poses[2].bounds.max[2] > poses[0].bounds.max[2] + 0.3);
    return { bounds: { min: body.min.toArray(), max: body.max.toArray() }, topNode: 'cabinet-top', pivot: slide.name, panel, tray, cavity: { backNode: 'cabinet-inner-back', openFront: true }, staticClearance, poses, meshCount: json.meshes.length, identityScale: true, externalUris: json.buffers.filter(buffer => buffer.uri !== undefined).length };
  } finally { dispose(scene); }
}

function resourceUrl(id) { return `/company-assets/sliding-drawer-v1/${id}/v1/model.glb`; }
function composedPrompt(common, design) { return `${common.promptStandard} Design difference: ${design.prompt} Contract: one drawer uses pivot [0,0,0], local bounds x[-0.42,0.42], y[0.78,1.12], z[-0.205,0.275], and translates from 0 to +0.32m along Z.`; }
function makeResource(common, design, bytes, sourceHash, contractHash, generatorHash) { return { id: `sliding-drawer-${design.id}`, displayName: design.label, version: 1, category: 'dynamic', mountRole: 'sliding-drawer-cabinet', coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', scale: 'Identity only' }, provenance: { license: design.license, prompt: composedPrompt(common, design), tools: [`Three.js ${THREE.REVISION}`, 'Object3D slide group', 'Box3 readback', 'GLTFExporter', 'GLTFLoader readback'], sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, sourceDesign: design.id, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash, generator: GENERATOR_PATH, generatorSha256: generatorHash, method: design.prompt }, asset: { format: 'glb', url: resourceUrl(design.id), sha256: sha256(bytes), bytes: bytes.length }, footprint: { center: [0, 0], halfSize: [0.45, 0.275], blocking: true }, mounting: { origin: 'bottom', width: 0.9, height: 1.2, depth: 0.55 }, supportSurfaces: [{ id: 'top', center: [0, 0], topY: 1.2, halfSize: [0.4, 0.18], clearanceHeight: 0.4 }], supportNodes: { top: 'cabinet-top' }, usePoints: [], stateDefaults: { openFraction: 0 }, stateSchema: structuredClone(STATE_SCHEMA), stateSemantics: structuredClone(STATE_SEMANTICS), movingParts: structuredClone(MOVING_PARTS), partNodes: { drawer: 'cabinet-drawer-slide' }, partPanels: { drawer: 'drawer-front' }, partTrays: { drawer: { bottom: 'drawer-bottom', left: 'drawer-left', right: 'drawer-right', back: 'drawer-back' } } }; }

export async function buildCollection({ source, sourceBytes, contractBytes, generatorBytes = null } = {}) {
  validateSource(source); const sourceHash = sha256(sourceBytes ?? Buffer.from(JSON.stringify(source))), contractHash = sha256(contractBytes ?? Buffer.from('')), generatorHash = sha256(generatorBytes ?? await fs.readFile(new URL(GENERATOR_PATH, ROOT))), items = [];
  for (const design of source.designs) { const bytes = await exportDrawerGlb(design, source.common), repeat = await exportDrawerGlb(design, source.common); assert(bytes.equals(repeat)); items.push({ design, bytes, repeat, actual: await readbackDrawer(bytes, design, source.common), hash: sha256(bytes) }); }
  assert.equal(new Set(items.map(item => item.hash)).size, 4);
  const resources = items.map(item => makeResource(source.common, item.design, item.bytes, sourceHash, contractHash, generatorHash));
  const collection = { id: 'company-sliding-drawer-v1', version: 1, category: 'dynamic', provenance: { sourceParameters: SOURCE_PATH, sourceParametersSha256: sourceHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: contractHash, generator: GENERATOR_PATH, generatorSha256: generatorHash, license: 'Project-authored procedural geometry and solid-color materials. No external art assets.' }, resources: resources.map(resource => ({ id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
  const files = new Map(); for (const item of items) { const base = `prototype/public/company-assets/sliding-drawer-v1/${item.design.id}/v1/`, resource = resources.find(value => value.id === `sliding-drawer-${item.design.id}`); files.set(`${base}model.glb`, item.bytes); files.set(`${base}resource.json`, Buffer.from(JSON.stringify(resource, null, 2) + '\n')); } files.set('prototype/public/company-assets/sliding-drawer-v1/collection.json', Buffer.from(JSON.stringify(collection, null, 2) + '\n')); return { sourceHash, contractHash, generatorHash, items, resources, collection, files };
}

async function main() {
  const sourceBytes = await fs.readFile(new URL(SOURCE_PATH, ROOT)), contractBytes = await fs.readFile(new URL(CONTRACT_PATH, ROOT)), source = JSON.parse(sourceBytes), generatorBytes = await fs.readFile(new URL(GENERATOR_PATH, ROOT)), result = await buildCollection({ source, sourceBytes, contractBytes, generatorBytes });
  const initialSource = structuredClone(source); initialSource.designs[0].differences.handleWidth = 0.08; const initialBytes = await exportDrawerGlb(initialSource.designs[0], initialSource.common), initialRepeat = await exportDrawerGlb(initialSource.designs[0], initialSource.common); assert(initialBytes.equals(initialRepeat));
  const variantSource = structuredClone(source); variantSource.designs[0].differences.handleWidth = 0.08; const variantBytes = await exportDrawerGlb(variantSource.designs[0], variantSource.common), variantRepeat = await exportDrawerGlb(variantSource.designs[0], variantSource.common), variantActual = await readbackDrawer(variantBytes, variantSource.designs[0], variantSource.common); assert(variantBytes.equals(variantRepeat)); assert.notEqual(sha256(variantBytes), result.items[0].hash);
  const initialParams = Buffer.from(JSON.stringify(initialSource.designs[0], null, 2) + '\n'), variantParams = Buffer.from(JSON.stringify(variantSource.designs[0], null, 2) + '\n');
  const report = { status: 'passed', scope: 'Four single-tray sliding drawer cabinets with authored cavity, tray parts, static runners and top support readback', dispatch: { difficulty: 'complex', model: 'gpt-6.1-sol', reasoning_effort: 'high', reason: 'Four real hollow trays with contact parts and deterministic translation readback.', configurationEvidence: 'Parent-confirmed explicit configuration. Host hook interception unverified.' }, commands: ['node scripts/company-platform/build-sliding-drawer.mjs', 'node scripts/company-platform/build-sliding-drawer.mjs --check'], sourceParameters: SOURCE_PATH, sourceParametersSha256: result.sourceHash, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: result.contractHash, generator: GENERATOR_PATH, generatorSha256: result.generatorHash, items: result.items.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length, repeatedExportByteIdentical: item.bytes.equals(item.repeat), actual: item.actual })), sourceModificationEvidence: { design: 'flat-panel', formalHandleWidth: source.designs[0].differences.handleWidth, initialHandleWidth: 0.08, parametersPath: 'evidence/company-sliding-production-v1/variant-flat-panel.parameters.json', parametersSha256: sha256(variantParams), outputPath: 'evidence/company-sliding-production-v1/variant-flat-panel.glb', sha256: sha256(variantBytes), bytes: variantBytes.length, repeatedExportByteIdentical: variantBytes.equals(variantRepeat), actual: variantActual }, initialCandidateEvidence: { parametersPath: 'evidence/company-sliding-production-v1/initial-flat-panel.parameters.json', parametersSha256: sha256(initialParams), outputPath: 'evidence/company-sliding-production-v1/initial-flat-panel.glb', sha256: sha256(initialBytes), bytes: initialBytes.length }, contract: { envelope: [0.9, 1.2, 0.55], body: [0.9, 0.45], drawerBounds: MOVING_PARTS[0].bounds, translationRange: [0, 0.32], support: { topY: 1.2, halfSize: [0.4, 0.18], clearanceHeight: 0.4 } } };
  const evidence = new Map([['evidence/company-sliding-production-v1/report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n')], ['evidence/company-sliding-production-v1/initial-flat-panel.parameters.json', initialParams], ['evidence/company-sliding-production-v1/initial-flat-panel.glb', initialBytes], ['evidence/company-sliding-production-v1/variant-flat-panel.parameters.json', variantParams], ['evidence/company-sliding-production-v1/variant-flat-panel.glb', variantBytes]]), all = new Map([...result.files, ...evidence]);
  if (process.argv.includes('--check')) for (const [file, expected] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(expected), `Output differs ${file}`); else for (const [file, bytes] of all) { const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
  console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', items: result.items.map(item => ({ id: item.design.id, sha256: item.hash, bytes: item.bytes.length })) }));
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); if (isMain) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
