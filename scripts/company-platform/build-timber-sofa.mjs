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
const sourcePath = 'assets-source/company-timber-sofa/parameters.json';
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const contractPath = 'prototype/public/company-assets/lounge-sofa/v1/resource.json';
const contractBytes = await fs.readFile(new URL(contractPath, root));
const contract = JSON.parse(contractBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const generatorSha256 = sha(await fs.readFile(new URL(import.meta.url)));
const materialSlots = {
  fabric: ['seat-left', 'seat-right', 'back-left', 'back-right'],
  frame: ['post-left-front', 'post-left-rear', 'post-right-front', 'post-right-rear',
    'arm-left', 'arm-right', 'rail-front', 'rail-rear', 'rail-left', 'rail-right', 'rail-centre',
    'back-support-left', 'back-support-right', 'back-crossbar'],
};
function validate(p) {
  assert.equal(p.id, 'timber-sofa', 'Expected timber-sofa source identity');
  assert.equal(p.version, 1, 'Only source version 1 is supported');
  for (const group of ['seat', 'back', 'frame']) {
    assert(p[group] && Object.values(p[group]).every(Number.isFinite), `${group} parameters must be finite numbers`);
  }
  assert.equal(p.seat.height, 0.47, 'Seat height must preserve the 0.47m replacement contract');
  assert.equal(p.seat.centerX, 0.48, 'Fixed two-seat contract requires X=+/-0.48m');
  assert.equal(p.seat.centerZ, 0.04, 'Fixed two-seat contract requires seat Z=0.04m');
  assert.equal(p.seat.width, 0.92, 'Seat width must cover the unchanged fixed clearance width');
  assert.equal(p.approachZ, 1.02); assert.equal(p.exitZ, 1.15);
  assert.equal(p.back.contactY, 0.72); assert.equal(p.back.contactZ, -0.3);
  assert(p.seat.thickness > 0 && p.seat.thickness < 0.12, 'Thin seat thickness must be in (0, 0.12)m');
  assert(p.seat.width > 0.7 && p.seat.centerX > p.seat.width / 2, 'Two independent seat cushions require a positive central gap');
  assert(p.back.tilt < 0 && p.back.tilt > -0.4, 'Back panels must lean rearward within 0.4 radians');
  assert.equal(p.frame.railTopY, p.seat.height - p.seat.thickness, 'Rails must support the cushion bottoms');
  assert(p.frame.postHeight > p.seat.height && p.frame.postRadius > 0, 'Open arm posts must extend above the seats');
}
function makeModel(p) {
  validate(p);
  const rootObject = new THREE.Group();
  rootObject.name = 'timber-sofa';
  rootObject.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Wood-frame ground centre', sourceVersion: 1 };
  const fabric = new THREE.MeshStandardMaterial({ color: p.materials.fabric, roughness: p.materials.fabricRoughness });
  const timber = new THREE.MeshStandardMaterial({ color: p.materials.frame, roughness: p.materials.frameRoughness });
  function add(name, geometry, material, position, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.fromArray(position); mesh.rotation.set(...rotation);
    rootObject.add(mesh);
  }
  function rounded(name, size, position, radius, rotation = [0, 0, 0]) {
    assert(radius > 0 && radius <= Math.min(...size) / 2, `Invalid rounded radius for ${name}`);
    add(name, new RoundedBoxGeometry(...size, p.roundedSegments, radius), fabric, position, rotation);
  }
  function rail(name, size, position, rotation = [0, 0, 0]) {
    add(name, new THREE.BoxGeometry(...size), timber, position, rotation);
  }
  const frame = p.frame;
  const railY = frame.railTopY - frame.railHeight / 2;
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const x = sign * p.seat.centerX;
    rounded(`seat-${side}`, [p.seat.width, p.seat.thickness, p.seat.depth],
      [x, p.seat.height - p.seat.thickness / 2, p.seat.centerZ], p.seat.radius);
    rounded(`back-${side}`, [p.back.width, p.back.height, p.back.depth],
      [x, p.back.centerY, p.back.contactZ +
        (-Math.sin(p.back.tilt) * (p.back.contactY - p.back.centerY) - p.back.depth / 2) / Math.cos(p.back.tilt)],
      p.back.radius, [p.back.tilt, 0, 0]);
    for (const [end, zSign] of [['front', 1], ['rear', -1]]) {
      add(`post-${side}-${end}`, new THREE.CylinderGeometry(frame.postRadius, frame.postRadius, frame.postHeight, 12),
        timber, [sign * frame.halfWidth, frame.postHeight / 2, zSign * frame.halfDepth]);
    }
    add(`arm-${side}`, new THREE.CylinderGeometry(frame.armRadius, frame.armRadius, frame.halfDepth * 2, 12),
      timber, [sign * frame.halfWidth, frame.postHeight, 0], [Math.PI / 2, 0, 0]);
    rail(`rail-${side}`, [frame.railThickness, frame.railHeight, frame.halfDepth * 2],
      [sign * frame.halfWidth, railY, 0]);
    rail(`back-support-${side}`, [0.035, frame.backSupportHeight, 0.035],
      [x, frame.backSupportY, frame.backSupportZ], [p.back.tilt, 0, 0]);
  }
  for (const [end, zSign] of [['front', 1], ['rear', -1]]) {
    rail(`rail-${end}`, [frame.halfWidth * 2, frame.railHeight, frame.railThickness],
      [0, railY, zSign * (frame.halfDepth - frame.railThickness / 2)]);
  }
  rail('rail-centre', [frame.railThickness, frame.railHeight, frame.halfDepth * 2], [0, railY, 0]);
  rail('back-crossbar', [frame.halfWidth * 2, 0.035, 0.035], [0, 0.5, -frame.halfDepth]);
  rootObject.updateMatrixWorld(true);
  return rootObject;
}
function dispose(object) {
  const materials = new Set();
  object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); });
  materials.forEach(material => material.dispose());
}
async function exportGlb(p) {
  const object = makeModel(p);
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true, animations: [],
      copyright: 'Project-authored timber sofa. No external art assets.' }));
  } finally { dispose(object); }
}
async function readback(bytes, p) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert(!json.skins?.length && !json.animations?.length && !json.images?.length);
  assert(json.buffers.every(buffer => buffer.uri === undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const object = loaded.scene;
  object.updateMatrixWorld(true);
  const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `Readback differs ${a} vs ${b}`);
  try {
    object.traverse(node => { assert(!node.isSkinnedMesh); node.scale.toArray().forEach(value => near(value, 1)); });
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    near(bounds.min.y, 0);
    assert(size.x >= 2.1 && size.x <= 2.4 && size.z <= 1.04, 'Actual mesh bounds exceed rest-area fit limits');
    const slotNames = Object.values(materialSlots).flat();
    assert.equal(slotNames.length, json.meshes.length);
    assert.equal(new Set(slotNames).size, slotNames.length);
    for (const name of slotNames) assert(object.getObjectByName(name)?.isMesh, `Missing material slot mesh ${name}`);
    const usePoints = structuredClone(contract.usePoints), contacts = [];
    for (const side of ['left', 'right']) {
      const seat = object.getObjectByName(`seat-${side}`), back = object.getObjectByName(`back-${side}`);
      const seatBox = new THREE.Box3().setFromObject(seat);
      const seatCenter = seatBox.getCenter(new THREE.Vector3());
      const seatSize = seatBox.getSize(new THREE.Vector3());
      near(seatBox.max.y, 0.47); near(seatSize.x, p.seat.width); near(seatSize.z, p.seat.depth);
      const backBox = new THREE.Box3().setFromObject(back);
      assert(backBox.min.y > seatBox.max.y + 0.015, 'Back cushions must remain visibly separate from the seats');
      const frontPoint = back.localToWorld(new THREE.Vector3(0, 0, p.back.depth / 2));
      const frontNormal = new THREE.Vector3(0, 0, 1).transformDirection(back.matrixWorld);
      near(frontNormal.y, -Math.sin(p.back.tilt)); near(frontNormal.z, Math.cos(p.back.tilt));
      assert(frontNormal.y > 0 && frontNormal.z > 0, 'Back contact face must tilt rearward and face forward');
      const point = usePoints.find(value => value.id === side);
      near(seatCenter.x, point.position[0]); near(seatCenter.z, point.position[2]);
      assert.equal(point.seatNodeId, seat.name); assert.equal(point.backNodeId, back.name);
      const seatHit = new THREE.Raycaster(new THREE.Vector3(point.position[0], 1.5, point.position[2]), new THREE.Vector3(0, -1, 0))
        .intersectObject(seat, false)[0];
      assert(seatHit, 'Fixed seat contact ray must hit actual cushion triangles'); near(seatHit.point.y, point.seatHeight);
      const backHit = new THREE.Raycaster(new THREE.Vector3(point.position[0], p.back.contactY, 1), new THREE.Vector3(0, 0, -1))
        .intersectObject(back, false)[0];
      assert(backHit, 'Fixed back contact ray must hit actual back triangles'); near(backHit.point.z, p.back.contactZ);
      contacts.push({ id: side, seatBounds: { min: seatBox.min.toArray(), max: seatBox.max.toArray() },
        backBounds: { min: backBox.min.toArray(), max: backBox.max.toArray() },
        fixedSeatContact: seatHit.point.toArray(), fixedBackContact: backHit.point.toArray(),
        backFrontFace: { position: frontPoint.toArray(), normal: frontNormal.toArray() } });
    }
    const visualFootprint = { center: [center.x, center.z], halfSize: [size.x / 2, size.z / 2] };
    for (const axis of [0, 1]) {
      assert(Math.abs(visualFootprint.center[axis] - contract.footprint.center[axis]) + visualFootprint.halfSize[axis] <=
        contract.footprint.halfSize[axis] + 1e-6, 'Visual model exceeds the unchanged functional footprint');
    }
    return { usePoints, contacts, footprint: structuredClone(contract.footprint), visualFootprint,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, size: size.toArray(), meshCount: json.meshes.length,
      geometryTypes: { cylinderMeshes: 6, roundedCushions: 4, boxFrameMeshes: 8 }, identityScale: true,
      externalUris: 0, skins: 0, animations: 0 };
  } finally { dispose(object); }
}
const variant = structuredClone(source);
variant.back.width = 0.88;
variant.back.tilt = -0.24;
variant.frame.armRadius = 0.024;
variant.frame.postRadius = 0.022;
const candidates = [
  { name: 'primary', parameters: source, parameterBytes: sourceBytes },
  { name: 'geometry-variant-evidence-only', parameters: variant, parameterBytes: Buffer.from(JSON.stringify(variant, null, 2) + '\n') },
];
const results = [];
for (const candidate of candidates) {
  const bytes = await exportGlb(candidate.parameters);
  const repeat = await exportGlb(candidate.parameters);
  assert(bytes.equals(repeat), `Repeated export differs for ${candidate.name}`);
  const actual = await readback(bytes, candidate.parameters);
  results.push({ ...candidate, bytes, actual, sha256: sha(bytes), parameterSha256: sha(candidate.parameterBytes), repeatByteIdentical: true });
}
assert.notEqual(results[0].sha256, results[1].sha256, 'Actual geometry edit must change GLB bytes');
assert.deepEqual(results[0].actual.usePoints, results[1].actual.usePoints);
assert.deepEqual(results[0].actual.footprint, results[1].actual.footprint);
const main = results[0];
const resource = {
  id: 'timber-sofa', version: 1, category: 'multi-use', mountRole: 'sofa',
  coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Wood-frame ground centre', scale: 'Identity only' },
  provenance: { license: 'Project-authored schematic geometry and solid-color materials. No external art assets.',
    tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'CylinderGeometry', 'RoundedBoxGeometry', 'GLTFExporter', 'GLTFLoader readback'],
    sourceParameters: sourcePath, sourceParametersSha256: main.parameterSha256,
    functionalContractSource: contractPath, functionalContractSourceSha256: sha(contractBytes),
    generator: 'scripts/company-platform/build-timber-sofa.mjs', generatorSha256,
    method: 'New open timber frame, cylindrical arm posts/rails, thin cushions and separate rear-leaning back panels.' },
  asset: { format: 'glb', url: '/company-assets/timber-sofa/v1/model.glb', sha256: main.sha256, bytes: main.bytes.length },
  footprint: main.actual.footprint, materialSlots, usePoints: main.actual.usePoints, stateDefaults: {},
};
const report = { status: 'passed', scope: 'New parametric static furniture production and standard GLB CPU readback',
  dispatch: { difficulty: 'standard', model: 'gpt-6.1-sol', reasoning_effort: 'medium',
    reason: 'Structurally different open-frame two-seat geometry through existing deterministic GLB production conventions.',
    configurationEvidence: 'Parent-confirmed existing configuration. Host hook interception unverified.' },
  commands: ['node scripts/company-platform/build-timber-sofa.mjs', 'node scripts/company-platform/build-timber-sofa.mjs --check',
    'node evidence/company-timber-sofa-v1/verify-disk.mjs'],
  generatorSha256, sourceParametersSha256: main.parameterSha256,
  results: results.map(result => ({ name: result.name, sha256: result.sha256, bytes: result.bytes.length,
    parameterSha256: result.parameterSha256, repeatedExportByteIdentical: result.repeatByteIdentical, actual: result.actual })),
  structuralDifferences: ['Open frame without upholstered base slab', 'Six cylindrical frame meshes including slender long posts and open arm rails',
    'Two 0.09m thin seat cushions', 'Separate rear-leaning thin back panels with explicit front-face normals',
    'Appearance adapted offline to unchanged two-seat functional geometry and contact anchors'],
  functionalContract: { source: contractPath, sourceSha256: sha(contractBytes), usePointsByteSemanticsEqual: true,
    footprintExactEqual: true, contactAnchors: { seatHeight: 0.47, seatX: [-0.48, 0.48], seatZ: 0.04, backY: 0.72, backZ: -0.3 } },
  evidenceVariant: { registered: false, changed: { armRadius: [0.03, 0.024], postRadius: [0.025, 0.022],
    backWidth: [0.94, 0.88], backTilt: [-0.16, -0.24] }, functionalContractUnchanged: true },
  errorHandling: 'Invalid source identity, nonfinite parameters, contract height/support mismatch, missing named meshes, footprint overflow, contact separation or nondeterminism reject before any output is written.',
  limitations: ['Project-authored schematic sample. Final art style and browser/GPU visual acceptance remain unverified.',
    'Metadata and contact-face geometry only. Character seating, body contact, navigation, approach/exit animation and actual use await C3.'],
};
const files = [
  ['prototype/public/company-assets/timber-sofa/v1/model.glb', main.bytes],
  ['prototype/public/company-assets/timber-sofa/v1/resource.json', JSON.stringify(resource, null, 2) + '\n'],
  ['evidence/company-timber-sofa-v1/variant.parameters.json', results[1].parameterBytes],
  ['evidence/company-timber-sofa-v1/variant.glb', results[1].bytes],
  ['evidence/company-timber-sofa-v1/report.json', JSON.stringify(report, null, 2) + '\n'],
];
for (const [file, bytes] of files) {
  const url = new URL(file, root);
  if (process.argv.includes('--check')) assert((await fs.readFile(url)).equals(Buffer.from(bytes)), `Output differs ${file}`);
  else { await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
}
console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build',
  results: results.map(result => ({ name: result.name, sha256: result.sha256, size: result.actual.size, meshCount: result.actual.meshCount })) }));
