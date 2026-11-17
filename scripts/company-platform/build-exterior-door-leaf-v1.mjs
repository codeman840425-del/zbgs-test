import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }).catch(error => { this.onerror?.(error); });
  }
};

const root = new URL('../../', import.meta.url);
const sourcePath = 'assets-source/company-exterior-door-leaf-v1/parameters.json';
const contractPath = 'docs/COMPANY-EXTERIOR-DOOR-LEAF-CONTRACT-v1.txt';
const generatorPath = 'scripts/company-platform/build-exterior-door-leaf-v1.mjs';
const source = JSON.parse(await fs.readFile(new URL(sourcePath, root), 'utf8'));
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const contractBytes = await fs.readFile(new URL(contractPath, root));
const generatorBytes = await fs.readFile(new URL(generatorPath, root));
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
const contractHash = createHash('sha256').update(contractBytes).digest('hex');
const generatorHash = createHash('sha256').update(generatorBytes).digest('hex');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;
const outputRoot = 'prototype/public/company-assets/exterior-door-leaf-v1';
const checkMode = process.argv.includes('--check');

function material(color, roughness = .72, transparent = false) {
  return new THREE.MeshStandardMaterial({ color, roughness, transparent, opacity: transparent ? .42 : 1, depthWrite: !transparent });
}
function box(parent, name, size, position, mat, role = 'solid') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.userData.doorRole = role;
  parent.add(mesh);
  return mesh;
}
function baseDoor(rootNode, design) {
  const pivot = new THREE.Group();
  pivot.name = 'exterior-door-pivot';
  pivot.position.fromArray(source.common.pivot);
  pivot.userData.doorRole = 'pivot';
  rootNode.add(pivot);
  const leaf = new THREE.Group();
  leaf.name = 'exterior-door-leaf-group';
  leaf.userData.doorRole = 'moving-subtree';
  pivot.add(leaf);
  const base = box(leaf, 'exterior-door-leaf', [source.common.width, source.common.height, .02], [.68, 1.08, -.01], material(design.baseColor), 'panel');
  return { pivot, leaf, base };
}
function makeDoor(design) {
  const rootNode = new THREE.Group();
  rootNode.name = `exterior-door-leaf-${design.id}`;
  rootNode.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre at exterior doorway', designId: design.id };
  const { pivot, leaf, base } = baseDoor(rootNode, design);
  const accent = material(design.accentColor, .58);
  if (design.id === 'plain') {
    box(leaf, 'handle-plate', [.12, .42, .014], [1.14, 1.03, .007], accent, 'handle');
    box(leaf, 'handle-grip', [.04, .2, .018], [1.08, 1.03, .009], accent, 'handle');
  }
  if (design.id === 'glass-panel') {
    const glass = material(design.accentColor, .18, true);
    for (const [index, y] of [1.48, .68].entries()) {
      box(leaf, `glass-panel-${index + 1}`, [.98, .52, .01], [.68, y, .005], glass, 'glass');
      box(leaf, `glass-panel-${index + 1}-top`, [1.04, .045, .018], [.68, y + .285, .009], accent, 'rail');
      box(leaf, `glass-panel-${index + 1}-bottom`, [1.04, .045, .018], [.68, y - .285, .009], accent, 'rail');
    }
    box(leaf, 'glass-panel-mid-rail', [1.04, .045, .018], [.68, 1.08, .009], accent, 'rail');
  }
  if (design.id === 'slatted') {
    for (let index = 0; index < 7; index++) {
      const x = .12 + index * .1866666667;
      box(leaf, `slat-${index + 1}`, [.07, 1.96, .014], [x, 1.08, .007], accent, 'slat');
    }
    box(leaf, 'slatted-rail-top', [1.18, .06, .018], [.68, 2.1, .009], accent, 'rail');
    box(leaf, 'slatted-rail-bottom', [1.18, .06, .018], [.68, .06, .009], accent, 'rail');
  }
  if (design.id === 'solid-panel') {
    for (const [index, y] of [1.5, .66].entries()) {
      box(leaf, `panel-${index + 1}-inset`, [.9, .58, .012], [.68, y, .006], accent, 'inset-panel');
      box(leaf, `panel-${index + 1}-top`, [1, .045, .018], [.68, y + .32, .009], accent, 'rail');
      box(leaf, `panel-${index + 1}-bottom`, [1, .045, .018], [.68, y - .32, .009], accent, 'rail');
      box(leaf, `panel-${index + 1}-left`, [.045, .68, .018], [.17, y, .009], accent, 'rail');
      box(leaf, `panel-${index + 1}-right`, [.045, .68, .018], [1.19, y, .009], accent, 'rail');
    }
  }
  rootNode.updateMatrixWorld(true);
  return { root: rootNode, pivot, leaf, base };
}
function dispose(object) {
  const materials = new Set();
  object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); });
  materials.forEach(value => value.dispose());
}
function localBounds(mesh, parent) {
  const transform = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(mesh.matrixWorld);
  const position = mesh.geometry.getAttribute('position');
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) bounds.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(transform));
  return bounds;
}
function meshes(scene) {
  const result = [];
  scene.traverse(node => { if (node.isMesh) result.push(node); });
  return result;
}
function geometryHash(scene) {
  const digest = createHash('sha256');
  for (const mesh of meshes(scene)) {
    digest.update(mesh.name);
    digest.update(Buffer.from(mesh.geometry.getAttribute('position').array.buffer));
    digest.update(Buffer.from(mesh.geometry.index?.array?.buffer || new Uint8Array()));
  }
  return digest.digest('hex');
}
function actualSummary(scene, design) {
  scene.updateMatrixWorld(true);
  const pivot = scene.getObjectByName('exterior-door-pivot');
  const panel = scene.getObjectByName('exterior-door-leaf');
  assert(pivot && panel && !panel.isGroup, `${design.id} must contain a pivot and concrete panel mesh`);
  assert.deepEqual(pivot.position.toArray(), source.common.pivot, `${design.id} pivot mismatch`);
  assert(pivot.rotation.toArray().slice(0, 3).every(value => near(value, 0)), `${design.id} pivot rotation mismatch`);
  assert(pivot.scale.toArray().every(value => near(value, 1)), `${design.id} pivot scale mismatch`);
  let node = panel.parent, descendant = false;
  while (node) { if (node === pivot) descendant = true; node = node.parent; }
  assert(descendant, `${design.id} panel must be under the pivot`);
  const localPanel = localBounds(panel, pivot);
  assert(near(localPanel.min.x, 0) && near(localPanel.max.x, source.common.width), `${design.id} panel width exceeds contract`);
  assert(near(localPanel.min.y, 0) && near(localPanel.max.y, source.common.height), `${design.id} panel height exceeds contract`);
  assert(near(localPanel.min.z, -.02) && near(localPanel.max.z, 0), `${design.id} panel depth exceeds contract`);
  const moving = new THREE.Box3();
  for (const mesh of meshes(pivot)) moving.union(localBounds(mesh, pivot));
  assert(moving.min.x >= -.001 && moving.max.x <= source.common.width + .001 && moving.min.y >= -.001 && moving.max.y <= source.common.height + .001 && moving.min.z >= -.021 && moving.max.z <= .021, `${design.id} activity subtree exceeds door envelope`);
  const world = new THREE.Box3().setFromObject(scene);
  assert(world.min.x >= -.701 && world.max.x <= .701 && world.min.y >= -.001 && world.max.y <= 2.201, `${design.id} leaf exceeds 1.4x2.2 opening`);
  const panelPositions = panel.geometry.getAttribute('position');
  assert(panelPositions.count >= 24 && panel.geometry.index?.count >= 36, `${design.id} panel must contain solid triangles`);
  return { id: design.id, geometryHash: geometryHash(scene), meshCount: meshes(scene).length, panelTriangles: (panel.geometry.index?.count || panelPositions.count) / 3, localBounds: { min: localPanel.min.toArray(), max: localPanel.max.toArray() }, worldBounds: { min: world.min.toArray(), max: world.max.toArray() }, pivot: pivot.position.toArray(), panel: panel.name };
}
async function readback(bytes, design) {
  const parsed = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const summary = actualSummary(parsed.scene, design);
  dispose(parsed.scene);
  return summary;
}
function expectFailure(scene, design, mutate, expected) {
  mutate(scene);
  try { actualSummary(scene, design); }
  catch (error) { assert.match(error.message, expected); return { passed: true, error: error.message }; }
  throw new Error(`Expected ${expected} to reject`);
}
function mutateClone(scene) {
  const clone = scene.clone(true);
  clone.traverse(node => { if (node.geometry) node.geometry = node.geometry.clone(); });
  return clone;
}

const generated = [], results = [];
for (const design of source.designs) {
  const built = makeDoor(design);
  const summary = actualSummary(built.root, design);
  const bytes = Buffer.from(await new GLTFExporter().parseAsync(built.root, { binary: true }));
  const repeat = Buffer.from(await new GLTFExporter().parseAsync(makeDoor(design).root, { binary: true }));
  assert(bytes.equals(repeat), `${design.id} export is not byte deterministic`);
  const read = await readback(bytes, design);
  assert.equal(read.geometryHash, summary.geometryHash);
  const loaded = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const negatives = [];
  negatives.push(expectFailure(mutateClone(loaded), design, scene => { scene.getObjectByName('exterior-door-pivot').position.x += .01; }, /pivot/));
  negatives.push(expectFailure(mutateClone(loaded), design, scene => { scene.getObjectByName('exterior-door-leaf').scale.x = 1.05; }, /exceeds|opening/));
  negatives.push(expectFailure(mutateClone(loaded), design, scene => { scene.getObjectByName('exterior-door-leaf').position.z = .03; }, /exceeds|opening/));
  dispose(loaded);
  dispose(built.root);
  const id = `exterior-door-leaf-${design.id}`;
  const resource = {
    id, version: 1, displayName: design.label, category: 'dynamic', mountRole: 'exterior-door-leaf', mount: 'portal-door',
    coordinates: source.common.coordinates,
    mounting: { width: source.common.width, height: source.common.height, depth: source.common.thickness, origin: 'bottom', apertureWidth: source.common.aperture.width, apertureHeight: source.common.aperture.height },
    stateDefaults: { openFraction: 0 }, stateSchema: { openFraction: { type: 'number', min: 0, max: 1 } }, stateSemantics: { openFraction: 'exterior-door-opening-fraction' },
    movingProfile: 'exterior-door-leaf-v1', productionBranch: 'exterior-door-leaf',
    footprint: { blocking: true, center: [0, .019], halfSize: [.68, .021] },
    movingParts: [{ id: 'door', stateField: 'openFraction', kind: 'hinge', axis: 'y', pivot: source.common.pivot, rotationRange: source.common.rotationRange, bounds: { min: [0, 0, -.021], max: [source.common.width, source.common.height, .021] } }],
    partNodes: { door: 'exterior-door-pivot' }, partPanels: { door: 'exterior-door-leaf' }, usePoints: [],
    provenance: { license: 'Project-authored construction geometry and solid materials. No external assets.', sourceParameters: sourcePath, sourceParametersSha256: sourceHash, functionalContractSource: contractPath, functionalContractSourceSha256: contractHash, generator: generatorPath, generatorSha256: generatorHash, tools: [`Three.js ${THREE.REVISION}`, 'Object3D pivot group', 'GLTFExporter', 'GLTFLoader'], method: design.difference, sourceDesign: design.id, reference: 'exterior-door-leaf-v1' },
    asset: { format: 'glb', url: `/company-assets/exterior-door-leaf-v1/${design.id}/v1/model.glb`, sha256: hash(bytes), bytes: bytes.length },
    materialSlots: { construction: meshes((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene).map(mesh => mesh.name) },
    checks: read,
  };
  generated.push({ design, resource, bytes, negativeCases: negatives });
  results.push({ id, version: 1, sha256: resource.asset.sha256, bytes: resource.asset.bytes, actual: read, negativeCases: negatives });
}
assert.equal(new Set(results.map(item => item.actual.geometryHash)).size, source.designs.length, 'Four door leaf geometries must differ');
const collection = { id: source.id, version: source.version, category: 'dynamic', productionBranch: 'exterior-door-leaf', sourceParameters: sourcePath, sourceParametersSha256: sourceHash, functionalContractSource: contractPath, functionalContractSourceSha256: contractHash, generator: generatorPath, generatorSha256: generatorHash, resources: generated.map(({ resource }) => ({ id: resource.id, version: 1, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256 })) };
const files = new Map();
for (const { resource, bytes, design } of generated) {
  const base = `${outputRoot}/${design.id}/v1/`;
  files.set(`${base}model.glb`, bytes);
  files.set(`${base}resource.json`, Buffer.from(JSON.stringify(resource, null, 2) + '\n'));
}
files.set(`${outputRoot}/collection.json`, Buffer.from(JSON.stringify(collection, null, 2) + '\n'));
const report = { status: 'passed', scope: 'CPU source/export/readback for four exterior door leaf resources', commands: ['node scripts/company-platform/build-exterior-door-leaf-v1.mjs', 'node scripts/company-platform/build-exterior-door-leaf-v1.mjs --check'], sourceParameters: sourcePath, sourceParametersSha256: sourceHash, functionalContractSource: contractPath, functionalContractSourceSha256: contractHash, generator: generatorPath, generatorSha256: generatorHash, items: results, limitations: ['Runtime integration, navigation, persistence, browser and character-through-door evidence are delivered by the separate integration package.'] };
if (checkMode) {
  for (const [file, bytes] of files) assert((await fs.readFile(new URL(file, root))).equals(bytes), `Stale generated file ${file}`);
} else {
  for (const [file, bytes] of files) { const url = new URL(file, root); await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
  const evidenceUrl = new URL('evidence/company-exterior-door-leaf-v1/report.json', root); await fs.mkdir(new URL('./', evidenceUrl), { recursive: true }); await fs.writeFile(evidenceUrl, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, resources: results.map(item => ({ id: item.id, sha256: item.sha256, bytes: item.bytes, triangles: item.actual.panelTriangles })) }, null, 2));
