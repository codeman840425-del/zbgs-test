import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import designs from '../../assets-source/company-architecture-collection/designs.mjs';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }).catch(error => this.onerror?.(error));
  }
};

const root = new URL('../../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = 'assets-source/company-architecture-collection/designs.mjs';
const sourceHash = hash(await fs.readFile(new URL(sourcePath, root)));
const generatorHash = hash(await fs.readFile(new URL(import.meta.url)));

const refs = new Map([
  ['floor-panel', {
    id: 'floor-panel-standard', version: 1, category: 'decor', mountRole: 'floor-panel', mount: 'floor-surface',
    coordinates: {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre of a 1x1 tile'},
    mounting: {width: 1, depth: 1, height: .01, origin: 'bottom'}, usePoints: [], stateDefaults: {}
  }],
  ['wall-panel', {
    id: 'wall-panel-standard', version: 1, category: 'decor', mountRole: 'wall-panel', mount: 'wall',
    coordinates: {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre; back plane z=0'},
    mounting: {width: 1, height: 2.8, depth: .05, origin: 'bottom'}, usePoints: [], stateDefaults: {}
  }],
  ['door-frame', {
    id: 'door-frame-standard', version: 1, category: 'decor', mountRole: 'door-frame', mount: 'portal',
    coordinates: {units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre on XZ portal interface; +Z inward'},
    mounting: {width: 1.7, height: 2.4, depth: .1, origin: 'bottom', apertureWidth: 1.4, apertureHeight: 2.2}, usePoints: [], stateDefaults: {}
  }],
  ['window-panel', {
    id: 'window-panel-standard', version: 1, category: 'decor', mountRole: 'window-panel', mount: 'wall',
    coordinates: {units: 'metres', up: '+Y', forward: '+Z', origin: 'Wall XY mounting centre; back plane z=0; +Z inward'},
    mounting: {width: .9, height: .8, depth: .1, origin: 'center'},
    productionProfile: {id: 'window-panel-wall-mount-v2', backPlaneZ: 0, localZRange: [0, .1], localZOffset: .05, visualOnly: true},
    usePoints: [], stateDefaults: {}
  }],
  ['rug', {
    id: 'rug-standard', version: 1, category: 'decor', mountRole: 'rug', mount: 'floor-surface',
    coordinates: {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre of floor-surface decor'},
    mounting: {width: 1.6, depth: 1.1, height: .01, origin: 'bottom'}, usePoints: [], stateDefaults: {}
  }]
]);

function make(design) {
  const group = new THREE.Group();
  group.name = design.id;
  for (const p of design.parts) {
    const geometry = new THREE[p.geometry](...p.args);
    const material = new THREE.MeshStandardMaterial({color: p.color, roughness: p.roughness});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = p.name;
    mesh.position.fromArray(p.position);
    mesh.rotation.fromArray(p.rotation);
    mesh.scale.fromArray(p.scale);
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

function release(object) {
  object.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
}

async function encode(design) {
  const group = make(design);
  try { return Buffer.from(await new GLTFExporter().parseAsync(group, {binary: true})); }
  finally { release(group); }
}

function closeEnough(a, b, tolerance = .0015) { return Math.abs(a - b) <= tolerance; }
function assertEnvelope(branch, bounds) {
  const tolerance = .0015;
  if (branch === 'floor-panel') {
    assert(bounds.min.x >= -.5 - tolerance && bounds.max.x <= .5 + tolerance);
    assert(bounds.min.z >= -.5 - tolerance && bounds.max.z <= .5 + tolerance);
    assert(bounds.min.y >= -tolerance && bounds.max.y <= .01 + tolerance);
  }
  if (branch === 'wall-panel') {
    assert(bounds.min.x >= -.5 - tolerance && bounds.max.x <= .5 + tolerance);
    assert(bounds.min.y >= -tolerance && bounds.max.y <= 2.8 + tolerance);
    assert(bounds.min.z >= -tolerance && bounds.max.z <= .05 + tolerance);
  }
  if (branch === 'door-frame') {
    assert(bounds.min.x >= -.85 - tolerance && bounds.max.x <= .85 + tolerance);
    assert(bounds.min.y >= -tolerance && bounds.max.y <= 2.4 + tolerance);
    assert(bounds.min.z >= -tolerance && bounds.max.z <= .1 + tolerance);
  }
  if (branch === 'window-panel') {
    assert(bounds.min.x >= -.45 - tolerance && bounds.max.x <= .45 + tolerance);
    assert(bounds.min.y >= -.4 - tolerance && bounds.max.y <= .4 + tolerance);
    assert(bounds.min.z >= -tolerance && bounds.max.z <= .1 + tolerance);
  }
  if (branch === 'rug') {
    assert(bounds.min.x >= -.8 - tolerance && bounds.max.x <= .8 + tolerance);
    assert(bounds.min.z >= -.55 - tolerance && bounds.max.z <= .55 + tolerance);
    assert(bounds.min.y >= -tolerance && bounds.max.y <= .01 + tolerance);
  }
}

function assertDoorOpening(loaded) {
  const tolerance = .0001;
  loaded.traverse(node => {
    if (!node.isMesh) return;
    const box = new THREE.Box3().setFromObject(node);
    const intersectsOpening = box.max.x > -.7 + tolerance && box.min.x < .7 - tolerance && box.max.y > tolerance && box.min.y < 2.2 - tolerance;
    assert(!intersectsOpening, `${node.name} intrudes into 1.4x2.2 door opening`);
  });
}

function assertWindowBackplane(loaded) {
  const tolerance = .0015;
  const bounds = new THREE.Box3().setFromObject(loaded);
  assert(bounds.min.z >= -tolerance && bounds.max.z <= .1 + tolerance, 'Window model exceeds [0,.10] wall envelope');
  let touchesBackplane = false;
  loaded.traverse(node => {
    if (!node.isMesh) return;
    const meshBounds = new THREE.Box3().setFromObject(node);
    if (Math.abs(meshBounds.min.z) <= tolerance) touchesBackplane = true;
  });
  assert(touchesBackplane, 'Window model has no geometry on back plane z=0');
}

const results = [];
const resources = [];
for (const design of designs) {
  const reference = refs.get(design.branch);
  assert(reference, `Unknown architecture branch ${design.branch}`);
  const bytes = await encode(design);
  assert(bytes.equals(await encode(design)), `${design.id} export is not deterministic`);
  const parsed = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const loaded = parsed.scene;
  loaded.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(loaded);
  assertEnvelope(design.branch, bounds);
  if (design.branch === 'door-frame') assertDoorOpening(loaded);
  if (design.branch === 'window-panel') assertWindowBackplane(loaded);
  let triangles = 0;
  const geometryHash = createHash('sha256');
  loaded.traverse(node => {
    if (!node.isMesh) return;
    triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3;
    geometryHash.update(Buffer.from(node.geometry.attributes.position.array.buffer));
    geometryHash.update(JSON.stringify(node.matrixWorld.toArray()));
  });
  assert(triangles < 15000, `${design.id} exceeds technical sample budget`);

  const resource = structuredClone(reference);
  Object.assign(resource, {
    id: design.id,
    version: 1,
    displayName: design.label,
    productionBranch: design.branch,
    designId: design.id,
    asset: {format: 'glb', url: `/company-assets/architecture-collection/${design.id}/v1/model.glb`, sha256: hash(bytes), bytes: bytes.length},
    materialSlots: {construction: design.parts.map(part => part.name)},
    provenance: {
      license: 'Project-authored construction geometry and solid materials. No external assets.',
      sourceParameters: sourcePath,
      sourceParametersSha256: sourceHash,
      generator: 'scripts/company-platform/build-architecture-collection.mjs',
      generatorSha256: generatorHash,
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader'],
      classification: design.classification,
      reference: `${reference.id}@${reference.version}`
    }
  });
  assert(compareFacilityFunction(reference, resource).compatible);
  const dir = `prototype/public/company-assets/architecture-collection/${design.id}/v1`;
  await fs.mkdir(new URL(`${dir}/`, root), {recursive: true});
  await fs.writeFile(new URL(`${dir}/model.glb`, root), bytes);
  await fs.writeFile(new URL(`${dir}/resource.json`, root), `${JSON.stringify(resource, null, 2)}\n`);
  resources.push(`${dir}/resource.json`);
  results.push({
    id: design.id,
    branch: design.branch,
    label: design.label,
    resourcePath: `${dir}/resource.json`,
    geometryHash: geometryHash.digest('hex'),
    sha256: hash(bytes),
    triangles,
    meshes: design.parts.length,
    bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()},
    mounting: reference.mounting,
    apertureClear: design.branch === 'door-frame',
    backplaneChecked: design.branch === 'window-panel',
    backplaneZ: design.branch === 'window-panel' ? 0 : null,
    repeatByteIdentical: true,
    functionCompatible: true,
    prompt: `为公司场景制作 ${design.label}。固定功能规格为 ${JSON.stringify(reference)}。保留固定单位、基点、挂载和包络，以独立构造几何形成真实结构差异。门框只制作显示框体，窗板只制作显示面板，不添加开合机制。`
  });
  release(loaded);
}

for (const branch of new Set(results.map(result => result.branch))) {
  const list = results.filter(result => result.branch === branch);
  assert.equal(list.length, 4, `${branch} must contain exactly four initial designs`);
  assert.equal(new Set(list.map(result => result.geometryHash)).size, 4, `${branch} contains duplicate geometry`);
}

await fs.mkdir(new URL('evidence/company-architecture-collection-v1/', root), {recursive: true});
await fs.writeFile(new URL('assets-source/company-architecture-collection/collection.json', root), `${JSON.stringify({resources}, null, 2)}\n`);
await fs.writeFile(new URL('evidence/company-architecture-collection-v1/report.json', root), `${JSON.stringify({
  status: 'source-export-readback-passed',
  collection: 'architecture-collection',
  previousWindowPanelFailure: {
    reference: 'evidence/company-four-preview-architecture-dev-v1/report.json',
    resource: 'window-panel-cross',
    error: 'asset-mount-envelope-mismatch',
    oldBounds: {min: [-.45, -.4, -.05], max: [.45, .4, .05]},
    note: 'Previous preview rejected the old local Z range. The corrected export keeps the same .9x.8x.1 contract and shifts every window mesh to back plane z=0 through front z=.10.'
  },
  previousHerringboneIssue: {
    reference: 'evidence/company-four-preview-architecture-dev-v1/floor-panel-4.png',
    resource: 'floor-panel-herringbone',
    note: 'The prior preview showed five separated parallel short bars. The corrected source uses three repeated V pairs with opposite angles inside the fixed 1x1 tile.'
  },
  branchCounts: Object.fromEntries([...new Set(results.map(result => result.branch))].map(branch => [branch, results.filter(result => result.branch === branch).length])),
  results,
  limits: [
    'Display resources only. No door leaf, door open/close, window opening, or navigation change is implemented.',
    'The fixed unit tile and mounting envelopes do not change physical navigation or the original room walls.',
    'Character use and browser integrated replacement remain separate checks.'
  ]
}, null, 2)}\n`);
console.log(JSON.stringify({resources: resources.length, branches: [...new Set(results.map(result => result.branch))], status: 'passed'}));
