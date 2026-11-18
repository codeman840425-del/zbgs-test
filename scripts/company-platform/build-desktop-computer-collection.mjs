import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({target: this});
    }).catch(error => this.onerror?.(error));
  }
};

const root = new URL('../../', import.meta.url);
const sourcePath = 'assets-source/company-desktop-computer-v1/parameters.json';
const contractPath = 'assets-source/company-desktop-computer-v1/contracts/desktop-computer.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-desktop-computer-collection.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const contractBytes = await fs.readFile(new URL(contractPath, root));
const contract = JSON.parse(contractBytes);
const branchBytes = await fs.readFile(new URL(branchPath, root));
const branches = JSON.parse(branchBytes);
const generatorHash = hash(await fs.readFile(new URL(generatorPath, root)));

const branch = branches.groups.find(group => group.id === 'computer-audio')?.branches
  .find(candidate => candidate.id === 'desktop-computer');
assert(branch, 'environment desktop-computer branch is required');
assert.deepEqual(branch.fixedFunctionAndInstall.dimensionsMeters, {
  width: 0.22,
  height: 0.45,
  depth: 0.45,
  verification: 'pending'
});
assert.equal(source.designs.length, 4);
assert.equal(contract.mount, 'desk-surface');
assert.equal(contract.parent, 'desk.desktop');

const material = (color, roughness = 0.45, metalness = 0.08) =>
  new THREE.MeshStandardMaterial({color, roughness, metalness});
const mesh = (parent, name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) => {
  const item = new THREE.Mesh(geometry, mat);
  item.name = name;
  item.position.fromArray(position);
  item.rotation.fromArray(rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
};
const box = (parent, name, size, mat, position, rotation = [0, 0, 0]) =>
  mesh(parent, name, new THREE.BoxGeometry(...size), mat, position, rotation);
const rounded = (parent, name, size, mat, position, radius = 0.01, rotation = [0, 0, 0]) =>
  mesh(parent, name, new RoundedBoxGeometry(...size, 4, radius), mat, position, rotation);
const cylinder = (parent, name, radius, height, mat, position, rotation = [0, 0, 0], segments = 20) =>
  mesh(parent, name, new THREE.CylinderGeometry(radius, radius, height, segments), mat, position, rotation);

function rootGroup(designId) {
  const group = new THREE.Group();
  group.name = designId;
  group.userData = {
    units: 'metres',
    up: '+Y',
    forward: '+Z',
    branch: 'desktop-computer',
    mount: 'desk-surface',
    origin: 'desk contact plane'
  };
  return group;
}

function addCommonDetails(group, mats, statusPosition) {
  box(group, 'computer-accent', [0.012, 0.012, 0.012], mats.accent, [0, 0.03, 0.19]);
  box(group, 'computer-detail', [0.032, 0.012, 0.012], mats.detail, [-0.058, 0.03, 0.19]);
  box(group, 'screen-surface', [0.064, 0.012, 0.006], mats.screen, [0, 0.115, 0.19]);
  box(group, 'power-status', [0.014, 0.008, 0.006], mats.status, statusPosition);
  box(group, 'power-port-back', [0.032, 0.014, 0.008], mats.detail, [0, 0.12, -0.21]);
}

function model(design) {
  const group = rootGroup(design.designId);
  const mats = {
    body: material(design.frameColor, 0.5, 0.12),
    accent: material(design.accentColor, 0.32, 0.22),
    detail: material(design.detailColor, 0.28, 0.18),
    screen: material(design.screenColor, 0.2, 0.28),
    status: material(design.statusColor, 0.24, 0.3)
  };

  if (design.variant === 'desktop-tower') {
    rounded(group, 'computer-body', [0.18, 0.38, 0.36], mats.body, [0, 0.19, 0], 0.014);
    box(group, 'front-bay', [0.132, 0.18, 0.012], mats.detail, [0, 0.15, 0.185]);
    for (const y of [0.075, 0.095, 0.115]) box(group, `vent-${y}`, [0.085, 0.006, 0.006], mats.accent, [0, y, 0.194]);
    box(group, 'power-button', [0.02, 0.02, 0.008], mats.accent, [0.063, 0.055, 0.192]);
    addCommonDetails(group, mats, [0.063, 0.055, 0.198]);
  } else if (design.variant === 'compact-tower') {
    rounded(group, 'computer-body', [0.19, 0.27, 0.32], mats.body, [0, 0.135, 0], 0.025);
    rounded(group, 'front-bay', [0.13, 0.17, 0.012], mats.detail, [0, 0.13, 0.166], 0.004);
    box(group, 'drive-slot', [0.09, 0.009, 0.008], mats.accent, [0, 0.17, 0.176]);
    box(group, 'drive-slot-lower', [0.09, 0.009, 0.008], mats.accent, [0, 0.145, 0.176]);
    box(group, 'carry-handle', [0.085, 0.018, 0.13], mats.accent, [0, 0.285, 0], [0, 0, 0]);
    box(group, 'power-button', [0.022, 0.022, 0.008], mats.accent, [-0.062, 0.085, 0.175]);
    addCommonDetails(group, mats, [-0.062, 0.085, 0.182]);
  } else if (design.variant === 'all-in-one') {
    rounded(group, 'computer-body', [0.2, 0.16, 0.05], mats.body, [0, 0.33, 0.01], 0.012);
    box(group, 'screen-bezel', [0.172, 0.13, 0.008], mats.detail, [0, 0.33, 0.04]);
    box(group, 'screen-surface', [0.15, 0.105, 0.006], mats.screen, [0, 0.332, 0.046]);
    box(group, 'stand-neck', [0.025, 0.16, 0.065], mats.accent, [0, 0.18, 0.005]);
    rounded(group, 'stand-base', [0.16, 0.025, 0.22], mats.body, [0, 0.0125, 0], 0.008);
    box(group, 'computer-accent', [0.012, 0.012, 0.012], mats.accent, [0.078, 0.23, 0.038]);
    box(group, 'computer-detail', [0.024, 0.012, 0.012], mats.detail, [-0.06, 0.23, 0.038]);
    box(group, 'power-status', [0.014, 0.008, 0.006], mats.status, [0, 0.255, 0.048]);
    box(group, 'power-port-back', [0.032, 0.014, 0.008], mats.detail, [0, 0.12, -0.21]);
  } else {
    rounded(group, 'computer-body', [0.18, 0.4, 0.4], mats.body, [0, 0.2, 0], 0.01);
    box(group, 'side-panel', [0.012, 0.3, 0.27], mats.accent, [-0.096, 0.21, 0]);
    for (const y of [0.12, 0.25]) cylinder(group, `front-fan-${y}`, 0.045, 0.01, mats.detail, [0, y, 0.205], [Math.PI / 2, 0, 0], 24);
    box(group, 'fan-cross-left', [0.078, 0.006, 0.008], mats.accent, [-0.002, 0.12, 0.212]);
    box(group, 'fan-cross-right', [0.006, 0.078, 0.008], mats.accent, [0, 0.12, 0.212]);
    box(group, 'top-status-bar', [0.11, 0.008, 0.012], mats.status, [0, 0.414, 0.08]);
    box(group, 'computer-accent', [0.012, 0.012, 0.012], mats.accent, [0.07, 0.07, 0.21]);
    box(group, 'computer-detail', [0.032, 0.012, 0.012], mats.detail, [-0.06, 0.07, 0.21]);
    box(group, 'screen-surface', [0.06, 0.012, 0.006], mats.screen, [0, 0.07, 0.21]);
    box(group, 'power-status', [0.014, 0.008, 0.006], mats.status, [0.07, 0.07, 0.22]);
    box(group, 'power-port-back', [0.032, 0.014, 0.008], mats.detail, [0, 0.12, -0.22]);
  }
  group.updateMatrixWorld(true);
  return group;
}

function dispose(object) {
  const materials = new Set();
  object.traverse(node => {
    node.geometry?.dispose();
    if (node.material) for (const item of [node.material].flat()) materials.add(item);
  });
  materials.forEach(item => item.dispose());
}

async function exportGlb(object) {
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(object, {
      binary: true,
      animations: [],
      copyright: 'Project-authored desktop-computer collection.'
    }));
  } finally {
    dispose(object);
  }
}

async function inspectGlb(bytes, design) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert(!document.images?.length, `${design.designId} must not embed external images`);
  assert(document.buffers.every(item => item.uri === undefined), `${design.designId} must be self-contained`);
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = loaded.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const names = [];
  const geometryHash = createHash('sha256');
  let triangles = 0;
  scene.traverse(node => {
    if (!node.isMesh) return;
    names.push(node.name);
    const position = node.geometry.getAttribute('position');
    assert(position?.count, `${design.designId} has empty mesh ${node.name}`);
    triangles += (node.geometry.index?.count ?? position.count) / 3;
    geometryHash.update(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength));
    for (let index = 0; index < position.count; index++) {
      for (const value of [position.getX(index), position.getY(index), position.getZ(index)]) assert(Number.isFinite(value));
    }
  });
  for (const required of ['computer-body', 'computer-accent', 'computer-detail', 'screen-surface', 'power-status', 'power-port-back']) {
    assert(scene.getObjectByName(required)?.isMesh, `${design.designId} missing ${required}`);
  }
  assert(bounds.min.y >= -0.000001, `${design.designId} below contact plane`);
  assert(bounds.max.y <= 0.45 + 0.001, `${design.designId} exceeds height envelope`);
  assert(bounds.min.x >= -0.11 - 0.001 && bounds.max.x <= 0.11 + 0.001, `${design.designId} exceeds width envelope`);
  assert(bounds.min.z >= -0.225 - 0.001 && bounds.max.z <= 0.225 + 0.001, `${design.designId} exceeds depth envelope`);
  return {
    meshCount: names.length,
    triangles,
    nodeNames: names,
    bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()},
    geometrySha256: geometryHash.digest('hex')
  };
}

async function emit(url, bytes, checkMode) {
  if (checkMode) {
    assert((await fs.readFile(url)).equals(bytes), `Output differs ${url.pathname}`);
  } else {
    await fs.mkdir(new URL('./', url), {recursive: true});
    await fs.writeFile(url, bytes);
  }
}

const checkMode = process.argv.includes('--check');
const records = [];
for (const design of source.designs) {
  const bytes = await exportGlb(model(design));
  const repeated = await exportGlb(model(design));
  assert(bytes.equals(repeated), `${design.designId} export is not deterministic`);
  const probe = await inspectGlb(bytes, design);
  const parameter = Buffer.from(JSON.stringify({
    ...design,
    type: 'desktop-computer',
    productionPrompt: `为公司场景制作 ${design.label}，保持桌面承载、固定包络和可见电源状态端点。`
  }, null, 2) + '\n');
  const resource = {
    id: design.designId,
    displayName: design.label,
    version: 1,
    category: contract.category,
    mountRole: contract.mountRole,
    productionBranch: contract.productionBranch,
    mount: contract.mount,
    parent: contract.parent,
    mounting: structuredClone(contract.mounting),
    coordinates: structuredClone(contract.coordinates),
    footprint: structuredClone(contract.footprint),
    usePoints: [],
    stateDefaults: structuredClone(contract.stateDefaults),
    stateSchema: structuredClone(contract.stateSchema),
    stateSemantics: structuredClone(contract.stateSemantics),
    materialSlots: structuredClone(contract.materialSlots),
    powerStatusEndpoint: structuredClone(contract.powerStatusEndpoint),
    cablePorts: structuredClone(contract.cablePorts),
    provenance: {
      license: source.license,
      tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'RoundedBoxGeometry', 'CylinderGeometry', 'GLTFExporter', 'GLTFLoader readback'],
      sourceParameters: sourcePath,
      sourceParametersSha256: hash(sourceBytes),
      functionalContractSource: contractPath,
      functionalContractSourceSha256: hash(contractBytes),
      environmentBranchSource: branchPath,
      environmentBranch: 'desktop-computer',
      environmentBranchSourceSha256: hash(branchBytes),
      generator: generatorPath,
      generatorSha256: generatorHash,
      designId: design.designId,
      method: design.style
    },
    asset: {
      format: 'glb',
      url: `/company-assets/desktop-computer-v1/desktop-computer/${design.designId}/v1/model.glb`,
      sha256: hash(bytes),
      bytes: bytes.length
    },
    checks: {
      ...probe,
      repeatedExportByteIdentical: true,
      gltfReadback: true,
      cpuOnly: true
    },
    display: {
      status: {
        stateField: 'on',
        nodes: ['power-status'],
        onColor: design.statusColor,
        offColor: '#20252b',
        emissive: design.statusColor,
        onIntensity: 1.2
      }
    }
  };
  for (const names of Object.values(resource.materialSlots)) {
    for (const name of names) assert(probe.nodeNames.includes(name), `${design.designId} missing material node ${name}`);
  }
  assert(probe.nodeNames.includes(resource.powerStatusEndpoint.node), `${design.designId} missing power status endpoint`);
  const base = `prototype/public/company-assets/desktop-computer-v1/desktop-computer/${design.designId}/v1/`;
  const src = `assets-source/company-desktop-computer-v1/desktop-computer/${design.designId}/`;
  const evidence = `evidence/company-desktop-computer-v1/${design.designId}/`;
  const report = {
    status: 'passed',
    designId: design.designId,
    displayName: design.label,
    style: design.style,
    sourceParameters: `${src}parameters.json`,
    sourceParametersSha256: hash(parameter),
    functionalContract: {
      id: 'desktop-computer@1',
      source: contractPath,
      sha256: hash(contractBytes),
      mount: contract.mount,
      parent: contract.parent,
      powerStatusEndpoint: resource.powerStatusEndpoint
    },
    asset: resource.asset,
    checks: resource.checks,
    limitations: [
      'CPU GLB export and GLTFLoader readback only.',
      'No real computer behavior, operating-system UI, thermal simulation or cable routing.',
      'Desk-surface parent integration remains pending against the historical room.floor branch record.'
    ]
  };
  await emit(new URL(base + 'model.glb', root), bytes, checkMode);
  await emit(new URL(base + 'resource.json', root), Buffer.from(JSON.stringify(resource, null, 2) + '\n'), checkMode);
  await emit(new URL(src + 'parameters.json', root), parameter, checkMode);
  await emit(new URL(evidence + 'report.json', root), Buffer.from(JSON.stringify(report, null, 2) + '\n'), checkMode);
  records.push({
    id: resource.id,
    version: 1,
    type: 'desktop-computer',
    resourcePath: `${base}resource.json`,
    modelPath: `${base}model.glb`,
    sourcePath: `${src}parameters.json`,
    evidencePath: `${evidence}report.json`,
    sha256: resource.asset.sha256,
    bytes: resource.asset.bytes,
    meshCount: probe.meshCount,
    triangles: probe.triangles,
    geometrySha256: probe.geometrySha256,
    contract: 'desktop-computer@1'
  });
}
assert.equal(new Set(records.map(record => record.geometrySha256)).size, 4, 'desktop geometries must differ');
const collection = {
  schemaVersion: 1,
  id: 'company-desktop-computer-v1',
  generatedAt: '2026-11-17',
  generator: generatorPath,
  generatorSha256: generatorHash,
  sourceParameters: sourcePath,
  sourceParametersSha256: hash(sourceBytes),
  environmentBranchSource: branchPath,
  environmentBranch: 'desktop-computer',
  environmentBranchMount: contract.mount,
  environmentBranchSourceSha256: hash(branchBytes),
  contract: contractPath,
  contractSha256: hash(contractBytes),
  resources: records,
  verification: {
    cpuOnly: true,
    glbReadback: true,
    repeatedExportsByteIdentical: true,
    geometryHashesDistinct: true,
    envelopeAndDeskContactChecks: true,
    visiblePowerStatusEndpoint: true,
    roleBoundary: 'No real computer behavior or cable routing'
  },
  limitations: [
    'Static display asset only. No real computer behavior or cable routing is implemented.',
    'No library-catalog.json or facility-catalog.json update is made by this package.'
  ]
};
const collectionBytes = Buffer.from(JSON.stringify(collection, null, 2) + '\n');
await emit(new URL('assets-source/company-desktop-computer-v1/collection.json', root), collectionBytes, checkMode);
await emit(new URL('evidence/company-desktop-computer-v1/collection.json', root), collectionBytes, checkMode);
console.log(JSON.stringify({
  status: 'passed',
  mode: checkMode ? 'check' : 'build',
  resources: records.map(record => ({
    id: record.id,
    sha256: record.sha256,
    bytes: record.bytes,
    meshCount: record.meshCount,
    triangles: record.triangles,
    geometrySha256: record.geometrySha256
  }))
}));
