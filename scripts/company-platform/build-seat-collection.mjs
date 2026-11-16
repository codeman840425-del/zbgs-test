import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { RoundedBoxGeometry } from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); })
      .catch(error => this.onerror?.(error));
  }
};

const root = new URL('../../', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sourceRoot = 'assets-source/company-seat-collection/';
const outputRoot = 'prototype/public/company-assets/seat-collection/';
const evidenceRoot = 'evidence/company-seat-collection-v1/';
const generatorSha256 = sha256(await fs.readFile(new URL(import.meta.url)));
const catalogPath = 'prototype/src/company/library-catalog.json';
const catalogBytes = await fs.readFile(new URL(catalogPath, root));
const catalog = JSON.parse(catalogBytes);
const chairReference = catalog.resources.find(resource => resource.id === 'chair' && resource.version === 1);
assert(chairReference, 'chair@1 reference is required');
const chairReferenceSha256 = sha256(Buffer.from(canonicalJson(chairReference)));
const sofaContractPath = 'prototype/public/company-assets/lounge-sofa/v1/resource.json';
const sofaContractBytes = await fs.readFile(new URL(sofaContractPath, root));
const sofaContract = JSON.parse(sofaContractBytes);
const chairContract = {
  id: 'chair', version: 1, footprint: structuredClone(chairReference.footprint),
  usePoints: structuredClone(chairReference.usePoints), stateDefaults: structuredClone(chairReference.stateDefaults),
};
const promptTemplate = '为公司场景制作一份可运行 3D 外观资源。designId={{designId}}，造型方向={{styleDirection}}，目标规格={{targetProfileId}}@{{targetProfileVersion}}。保持使用点、座高、接近/离开点、clearance、footprint 与状态语义，调整轮廓、构件和材质，座面与靠背真实三角形覆盖固定接触区域，完成 GLB 导出、锁定 Three.js 导入回读和重复生成检查。';
const materialSlots = {
  chair: { seat: ['chair-seat'], back: ['chair-back'], structure: [] },
  sofa: { fabric: ['seat-left', 'seat-right', 'back-left', 'back-right'], structure: [] },
};

const sourceFiles = [
  ['chair-cantilever', 'chair', 'Cantilever sled frame with rear spreader', {
    kind: 'chair', frame: 'cantilever', seatWidth: 0.55, seatDepth: 0.5, backWidth: 0.54, backHeight: 0.5,
    seatRadius: 0.035, backRadius: 0.025, colors: { seat: '#687b86', back: '#7e9aa6', structure: '#263238' },
  }],
  ['chair-pedestal', 'chair', 'Central pedestal with four-foot star base', {
    kind: 'chair', frame: 'pedestal', seatWidth: 0.55, seatDepth: 0.5, backWidth: 0.5, backHeight: 0.5,
    seatRadius: 0.055, backRadius: 0.04, colors: { seat: '#b26a4b', back: '#c58663', structure: '#4a3024' },
  }],
  ['chair-ladder', 'chair', 'Ladder-back with visible rear uprights and rungs', {
    kind: 'chair', frame: 'ladder', seatWidth: 0.55, seatDepth: 0.5, backWidth: 0.5, backHeight: 0.5,
    seatRadius: 0.02, backRadius: 0.02, colors: { seat: '#c4a66a', back: '#d5bd87', structure: '#604c2a' },
  }],
  ['chair-crossbeam', 'chair', 'Crossbeam side frame with diagonal braces', {
    kind: 'chair', frame: 'crossbeam', seatWidth: 0.55, seatDepth: 0.5, backWidth: 0.54, backHeight: 0.5,
    seatRadius: 0.028, backRadius: 0.028, colors: { seat: '#6576a8', back: '#8294ca', structure: '#252d55' },
  }],
  ['sofa-modular', 'lounge-sofa', 'Split modular sofa with broad plinth and block arms', {
    kind: 'sofa', frame: 'modular', seatWidth: 0.92, seatDepth: 0.74, backWidth: 0.92, backHeight: 0.5,
    seatRadius: 0.045, backRadius: 0.04, colors: { seat: '#4b6e86', back: '#5f8aa7', structure: '#273b4a' },
  }],
  ['sofa-arch', 'lounge-sofa', 'Open arch back with paired round supports and floating cushions', {
    kind: 'sofa', frame: 'arch', seatWidth: 0.92, seatDepth: 0.74, backWidth: 0.92, backHeight: 0.5,
    seatRadius: 0.065, backRadius: 0.06, colors: { seat: '#a35c64', back: '#c0787f', structure: '#4c2930' },
  }],
];

function material(color, roughness = 0.78) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}
function add(rootObject, name, geometry, mat, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  rootObject.add(mesh);
  return mesh;
}
function box(rootObject, name, size, mat, position, rotation = [0, 0, 0]) {
  return add(rootObject, name, new THREE.BoxGeometry(...size), mat, position, rotation);
}
function rounded(rootObject, name, size, radius, mat, position, rotation = [0, 0, 0]) {
  assert(radius > 0 && radius <= Math.min(...size) / 2, `Invalid radius for ${name}`);
  return add(rootObject, name, new RoundedBoxGeometry(...size, 3, radius), mat, position, rotation);
}
function cylinder(rootObject, name, radius, height, mat, position, rotation = [0, 0, 0], radialSegments = 12) {
  return add(rootObject, name, new THREE.CylinderGeometry(radius, radius, height, radialSegments), mat, position, rotation);
}
function dispose(object) {
  const materials = new Set();
  object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); });
  materials.forEach(value => value.dispose());
}

function buildChair(parameters) {
  const seatMat = material(parameters.colors.seat), backMat = material(parameters.colors.back), structureMat = material(parameters.colors.structure);
  const object = new THREE.Group();
  object.name = parameters.designId;
  object.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', targetProfileId: 'chair', targetProfileVersion: 1 };
  rounded(object, 'chair-seat', [parameters.seatWidth, 0.07, parameters.seatDepth], parameters.seatRadius, seatMat, [0, 0.435, 0]);
  rounded(object, 'chair-back', [parameters.backWidth, parameters.backHeight, 0.07], parameters.backRadius, backMat, [0, 0.73, -0.22]);
  box(object, 'seat-support-rail', [0.46, 0.035, 0.38], structureMat, [0, 0.395, 0]);
  for (const x of [-0.20, 0.20]) box(object, `back-support-${x < 0 ? 'left' : 'right'}`, [0.035, 0.10, 0.035], structureMat, [x, 0.445, -0.22]);
  const s = parameters.frame;
  if (s === 'cantilever') {
    for (const x of [-0.235, 0.235]) {
      cylinder(object, `sled-${x < 0 ? 'left' : 'right'}`, 0.018, 0.44, structureMat, [x, 0.018, 0], [Math.PI / 2, 0, 0]);
      cylinder(object, `front-leg-${x < 0 ? 'left' : 'right'}`, 0.018, 0.44, structureMat, [x, 0.22, 0.185]);
      cylinder(object, `rear-leg-${x < 0 ? 'left' : 'right'}`, 0.018, 0.44, structureMat, [x, 0.22, -0.185]);
    }
    box(object, 'sled-front-crossbar', [0.47, 0.03, 0.03], structureMat, [0, 0.16, 0.185]);
  } else if (s === 'pedestal') {
    cylinder(object, 'pedestal-column', 0.055, 0.40, structureMat, [0, 0.20, 0], [0, 0, 0], 16);
    cylinder(object, 'pedestal-hub', 0.12, 0.035, structureMat, [0, 0.04, 0], [0, 0, 0], 16);
    for (const [name, angle] of [['front', 0], ['right', Math.PI / 2], ['rear', Math.PI], ['left', -Math.PI / 2]]) {
      box(object, `pedestal-foot-${name}`, [0.42, 0.025, 0.035], structureMat, [0, 0.025, 0], [0, angle, 0]);
    }
  } else if (s === 'ladder') {
    for (const x of [-0.22, 0.22]) {
      box(object, `ladder-upright-${x < 0 ? 'left' : 'right'}`, [0.035, 0.96, 0.035], structureMat, [x, 0.48, -0.22]);
      for (const [i, y] of [0.58, 0.70, 0.82].entries()) box(object, `ladder-rung-${i + 1}-${x < 0 ? 'left' : 'right'}`, [0.44, 0.028, 0.028], structureMat, [0, y, -0.22]);
    }
    for (const [x, z] of [[-0.22, -0.18], [-0.22, 0.18], [0.22, -0.18], [0.22, 0.18]]) box(object, `ladder-leg-${x < 0 ? 'left' : 'right'}-${z < 0 ? 'rear' : 'front'}`, [0.035, 0.42, 0.035], structureMat, [x, 0.21, z]);
  } else if (s === 'crossbeam') {
    for (const x of [-0.235, 0.235]) {
      box(object, `crossbeam-side-${x < 0 ? 'left' : 'right'}`, [0.035, 0.42, 0.035], structureMat, [x, 0.21, 0]);
      box(object, `crossbeam-diagonal-${x < 0 ? 'left' : 'right'}`, [0.035, 0.56, 0.035], structureMat, [x, 0.28, 0], [0.32, 0, 0]);
      box(object, `crossbeam-rail-${x < 0 ? 'left' : 'right'}`, [0.035, 0.035, 0.45], structureMat, [x, 0.14, 0]);
    }
    box(object, 'crossbeam-front', [0.47, 0.03, 0.03], structureMat, [0, 0.15, 0.19]);
    box(object, 'crossbeam-rear', [0.47, 0.03, 0.03], structureMat, [0, 0.15, -0.19]);
  } else throw new Error(`Unsupported chair frame ${s}`);
  object.updateMatrixWorld(true);
  return { object, materials: { seatMat, backMat, structureMat } };
}

function buildSofa(parameters) {
  const seatMat = material(parameters.colors.seat), backMat = material(parameters.colors.back), structureMat = material(parameters.colors.structure);
  const object = new THREE.Group();
  object.name = parameters.designId;
  object.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', targetProfileId: 'lounge-sofa', targetProfileVersion: 1 };
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    rounded(object, `seat-${side}`, [parameters.seatWidth, 0.07, parameters.seatDepth], parameters.seatRadius, seatMat, [sign * 0.48, 0.435, 0.04]);
    rounded(object, `back-${side}`, [parameters.backWidth, parameters.backHeight, 0.08], parameters.backRadius, backMat, [sign * 0.48, 0.82, -0.34]);
    rounded(object, `seat-support-${side}`, [0.88, 0.07, 0.68], 0.02, structureMat, [sign * 0.48, 0.375, 0.04]);
    box(object, `back-support-${side}`, [0.04, 0.32, 0.04], structureMat, [sign * 0.84, 0.43, -0.34]);
  }
  if (parameters.frame === 'modular') {
    rounded(object, 'modular-plinth', [2.08, 0.35, 0.84], 0.06, structureMat, [0, 0.175, 0]);
    for (const [side, sign] of [['left', -1], ['right', 1]]) rounded(object, `modular-arm-${side}`, [0.16, 0.66, 0.84], 0.06, structureMat, [sign * 1.02, 0.33, 0]);
    box(object, 'modular-divider', [0.035, 0.27, 0.70], structureMat, [0, 0.24, -0.02]);
    for (const [side, sign] of [['left', -1], ['right', 1]]) box(object, `modular-foot-${side}`, [0.07, 0.08, 0.07], structureMat, [sign * 0.82, 0.04, 0.30]);
  } else if (parameters.frame === 'arch') {
    rounded(object, 'arch-base', [2.06, 0.28, 0.82], 0.09, structureMat, [0, 0.14, 0]);
    for (const [side, sign] of [['left', -1], ['right', 1]]) {
      rounded(object, `arch-arm-${side}`, [0.15, 0.66, 0.82], 0.06, structureMat, [sign * 1.02, 0.33, 0]);
      cylinder(object, `arch-post-${side}`, 0.035, 0.83, structureMat, [sign * 0.96, 0.62, -0.34]);
      cylinder(object, `arch-shoulder-${side}`, 0.035, 0.52, structureMat, [sign * 0.78, 1.0, -0.34], [0, 0, Math.PI / 2]);
    }
    box(object, 'arch-crossbar', [1.64, 0.035, 0.035], structureMat, [0, 1.0, -0.34]);
    for (const [side, sign] of [['left', -1], ['right', 1]]) box(object, `arch-foot-${side}`, [0.08, 0.08, 0.08], structureMat, [sign * 0.80, 0.04, 0.28]);
  } else throw new Error(`Unsupported sofa frame ${parameters.frame}`);
  object.updateMatrixWorld(true);
  return { object, materials: { seatMat, backMat, structureMat } };
}

async function exportGlb(parameters) {
  const { object } = parameters.kind === 'chair' ? buildChair(parameters) : buildSofa(parameters);
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(object, {
      binary: true, onlyVisible: true, animations: [],
      copyright: 'Project-authored schematic geometry and solid-color materials. No external art assets.',
    }));
  } finally { dispose(object); }
}

async function readback(bytes, parameters, contract) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const gltfJson = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  assert(!gltfJson.animations?.length && !gltfJson.skins?.length && !gltfJson.images?.length);
  assert(gltfJson.buffers.every(buffer => buffer.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = loaded.scene;
  scene.updateMatrixWorld(true);
  try {
    const meshes = [];
    scene.traverse(node => { if (node.isMesh) { meshes.push(node.name); node.scale.toArray().forEach(value => assert(Math.abs(value - 1) < 1e-6, 'Readback scale must remain identity')); } });
    assert.equal(meshes.length, gltfJson.meshes.length);
    assert.equal(new Set(meshes).size, meshes.length);
    const pointChecks = [];
    for (const point of contract.usePoints) {
      const seat = scene.getObjectByName(point.seatNodeId), back = scene.getObjectByName(point.backNodeId);
      assert(seat?.isMesh && back?.isMesh, `Missing contact mesh for ${point.id}`);
      const seatBounds = new THREE.Box3().setFromObject(seat), seatSize = seatBounds.getSize(new THREE.Vector3());
      assert(Math.abs(seatBounds.max.y - point.seatHeight) < 1e-6, `${point.id} seat top mismatch`);
      assert(seatSize.x >= (parameters.kind === 'chair' ? 0.54 : 0.90));
      const seatRay = new THREE.Raycaster(new THREE.Vector3(point.position[0], 1.5, point.position[2]), new THREE.Vector3(0, -1, 0)).intersectObject(seat, false)[0];
      assert(seatRay && Math.abs(seatRay.point.y - point.seatHeight) < 1e-6, `${point.id} seat contact ray missed`);
      const backRay = new THREE.Raycaster(new THREE.Vector3(point.position[0], 0.72, 1), new THREE.Vector3(0, 0, -1)).intersectObject(back, false)[0];
      assert(backRay, `${point.id} back contact ray missed`);
      if (parameters.kind === 'chair') assert(backRay.point.z < -0.15 && backRay.point.z > -0.27, `${point.id} chair back contact outside reference region`);
      else assert(backRay.point.z < -0.28 && backRay.point.z > -0.32, `${point.id} sofa back contact outside anchor`);
      pointChecks.push({ id: point.id, seatBounds: { min: seatBounds.min.toArray(), max: seatBounds.max.toArray() }, backContact: backRay.point.toArray(), seatContact: seatRay.point.toArray() });
    }
    const bounds = new THREE.Box3().setFromObject(scene);
    assert(Math.abs(bounds.min.y) < 1e-6, `${parameters.designId} model must stand on ground, minY=${bounds.min.y}`);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const footprintValues = [[center.x, size.x], [center.z, size.z]];
    for (const axis of [0, 1]) {
      const [visualCenter, visualSize] = footprintValues[axis];
      assert(Math.abs(visualCenter - contract.footprint.center[axis]) + visualSize / 2 <= contract.footprint.halfSize[axis] + 1e-5, `${parameters.designId} visual model exceeds unchanged functional footprint axis ${axis}: center=${visualCenter} size=${visualSize} limit=${contract.footprint.halfSize[axis]}`);
    }
    return { bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, size: size.toArray(), center: center.toArray(), meshCount: meshes.length, meshNames: meshes, pointChecks, animations: 0, skins: 0, images: 0, externalUris: 0, identityScale: true };
  } finally { dispose(scene); }
}

const results = [];
for (const [designId, targetProfileId, styleDirection, baseParameters] of sourceFiles) {
  const sourcePath = `${sourceRoot}${designId}.json`;
  const sourceBytes = await fs.readFile(new URL(sourcePath, root));
  const source = JSON.parse(sourceBytes);
  assert.equal(source.designId, designId);
  assert.equal(source.targetProfileId, targetProfileId);
  const parameters = { ...structuredClone(source.parameters), designId, kind: targetProfileId === 'chair' ? 'chair' : 'sofa' };
  const contract = parameters.kind === 'chair' ? chairContract : sofaContract;
  const first = await exportGlb(parameters), repeat = await exportGlb(parameters);
  assert(first.equals(repeat), `${designId} repeated export differs`);
  const actual = await readback(first, parameters, contract);
  const hash = sha256(first);
  const sourceHash = sha256(sourceBytes);
  const resource = {
    id: designId, version: 1, designId, targetProfileId, targetProfileVersion: 1,
    category: parameters.kind === 'chair' ? 'seat' : 'multi-use', mountRole: parameters.kind === 'chair' ? 'chair' : 'sofa',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', scale: 'Identity only' },
    provenance: {
      license: 'Project-authored schematic geometry and solid-color materials. No external art assets.',
      tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'CylinderGeometry', 'RoundedBoxGeometry', 'GLTFExporter', 'GLTFLoader independent readback'],
      sourceParameters: sourcePath, sourceParametersSha256: sourceHash, generator: 'scripts/company-platform/build-seat-collection.mjs', generatorSha256,
      method: styleDirection, promptTemplate, prompt: promptTemplate.replace('{{designId}}', designId).replace('{{styleDirection}}', styleDirection).replace('{{targetProfileId}}', targetProfileId).replace('{{targetProfileVersion}}', '1'),
    },
    parameters: structuredClone(source.parameters),
    functionalContract: { targetProfileId, targetProfileVersion: 1, reference: parameters.kind === 'chair' ? 'chair@1' : 'lounge-sofa@1', source: parameters.kind === 'chair' ? catalogPath : sofaContractPath, sourceSha256: parameters.kind === 'chair' ? chairReferenceSha256 : sha256(sofaContractBytes) },
    asset: { format: 'glb', url: `/company-assets/seat-collection/${designId}/v1/model.glb`, sha256: hash, bytes: first.length },
    footprint: structuredClone(contract.footprint), usePoints: structuredClone(contract.usePoints), stateDefaults: structuredClone(contract.stateDefaults),
    materialSlots: parameters.kind === 'chair'
      ? { seat: ['chair-seat'], back: ['chair-back'], structure: actual.meshNames.filter(name => !['chair-seat', 'chair-back'].includes(name)) }
      : { fabric: ['seat-left', 'seat-right', 'back-left', 'back-right'], structure: actual.meshNames.filter(name => !['seat-left', 'seat-right', 'back-left', 'back-right'].includes(name)) },
    meshNames: actual.meshNames,
    checks: actual,
  };
  results.push({ designId, targetProfileId, styleDirection, sourcePath, sourceBytes, sourceHash, bytes: first, hash, resource, actual, repeatByteIdentical: true });
}

const collection = {
  status: 'passed', collectionId: 'company-seat-collection-v1', generatedAt: '2026-11-16', generator: 'scripts/company-platform/build-seat-collection.mjs', generatorSha256,
  dispatch: { difficulty: 'complex', model: 'gpt-6.1-sol', reasoning_effort: 'high', reason: 'Four independent single-seat structures plus two independent two-seat sofa structures with exact contact and footprint contracts.', configurationEvidence: 'Parent dispatch selected sol/high. Host hook interception not independently verified.' },
  contracts: { chair: { source: catalogPath, sourceSha256: chairReferenceSha256, reference: 'chair@1', footprint: chairContract.footprint }, sofa: { source: sofaContractPath, sourceSha256: sha256(sofaContractBytes), reference: 'lounge-sofa@1', footprint: sofaContract.footprint } },
  resources: results.map(result => ({ designId: result.designId, targetProfileId: result.targetProfileId, targetProfileVersion: 1, sourcePath: result.sourcePath, resourcePath: `${outputRoot}${result.designId}/v1/resource.json`, assetPath: `${outputRoot}${result.designId}/v1/model.glb`, sourceSha256: result.sourceHash, glbSha256: result.hash, bytes: result.bytes.length, repeatByteIdentical: true, structure: result.styleDirection, checks: result.actual })),
  limitations: ['CPU GLTFExporter and GLTFLoader readback only. Browser/GPU preview and character seating remain unverified.', 'Existing library-catalog.json and runtime render/preview files were not modified.'],
};
const report = { status: 'passed', collectionId: collection.collectionId, generatorSha256, dispatch: collection.dispatch, commands: ['node scripts/company-platform/build-seat-collection.mjs', 'node scripts/company-platform/build-seat-collection.mjs --check'], results: collection.resources, actualGeometryDifferences: results.map(result => ({ designId: result.designId, styleDirection: result.styleDirection, meshCount: result.actual.meshCount, size: result.actual.size })), limitations: collection.limitations };
const files = [];
for (const result of results) {
  files.push([`${outputRoot}${result.designId}/v1/model.glb`, result.bytes]);
  files.push([`${outputRoot}${result.designId}/v1/resource.json`, JSON.stringify(result.resource, null, 2) + '\n']);
}
files.push([`${outputRoot}collection.json`, JSON.stringify(collection, null, 2) + '\n']);
files.push([`${evidenceRoot}report.json`, JSON.stringify(report, null, 2) + '\n']);
files.push([`${evidenceRoot}collection.json`, JSON.stringify(collection, null, 2) + '\n']);
for (const [file, bytes] of files) {
  const url = new URL(file, root);
  if (process.argv.includes('--check')) assert((await fs.readFile(url)).equals(Buffer.from(bytes)), `Output differs ${file}`);
  else { await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
}
console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: collection.resources.map(value => ({ designId: value.designId, sha256: value.glbSha256, bytes: value.bytes })) }));
