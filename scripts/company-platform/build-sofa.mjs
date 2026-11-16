import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { RoundedBoxGeometry } from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

// GLTFExporter uses asynchronous FileReader for Blob conversion, even without textures.
// Node supplies Blob but has no FileReader. No browser/GPU is required here.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};
const root = new URL('../../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scriptHash = hash(await fs.readFile(new URL(import.meta.url)));
const sourceFolder = 'assets-source/company-sofa-v1/';
const productionFolder = 'prototype/public/company-assets/lounge-sofa/';
const outputs = [];
const materialSlots = {
  fabric: ['seat-left', 'seat-right', 'back-left', 'back-right', 'arm-left', 'arm-right'],
  frame: ['base', 'leg-left-front', 'leg-left-rear', 'leg-right-front', 'leg-right-rear'],
};
const originalGlbHashes = new Map([
  [1, 'a457c8e142f5745bb66140f0c15c1748cdcda63f536af5f119a16f7ee633116c'],
  [2, '909662780545112153e591cffbe2463a0e2c3ad1727edd3f84b1a58c4e653c84'],
]);

function build(parameters) {
  const p = parameters;
  assert.equal(p.id, 'lounge-sofa');
  assert([1, 2].includes(p.version));
  assert.equal(p.seat.height, 0.47);
  assert.equal(p.base.bottomY + p.base.height + p.seat.thickness, p.seat.height);
  const sofa = new THREE.Group();
  sofa.name = 'lounge-sofa';
  sofa.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre', version: p.version };
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({
      color, roughness: p.fabric.roughness, metalness: 0,
    }));
    return materials.get(color);
  }
  function rounded(name, size, position, radius, color, taper = 0) {
    assert(size.every(value => value > 0));
    assert(radius > 0 && radius <= Math.min(...size) / 2);
    const geometry = new RoundedBoxGeometry(...size, p.roundedSegments, radius);
    if (taper) {
      const vertices = geometry.attributes.position;
      for (let index = 0; index < vertices.count; index++) {
        const t = THREE.MathUtils.clamp(vertices.getY(index) / size[1] + 0.5, 0, 1);
        vertices.setX(index, vertices.getX(index) * (1 - taper * t));
      }
      vertices.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.name = name;
    mesh.position.fromArray(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    sofa.add(mesh);
  }
  const innerEdge = p.seat.offsetX + p.seat.width / 2;
  const halfWidth = innerEdge + p.arm.width;
  rounded('base', [halfWidth * 2, p.base.height, p.base.depth],
    [0, p.base.bottomY + p.base.height / 2, 0], p.base.radius, p.fabric.baseColor);
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const x = sign * p.seat.offsetX;
    rounded(`seat-${side}`, [p.seat.width, p.seat.thickness, p.seat.depth],
      [x, p.seat.height - p.seat.thickness / 2, p.seat.centerZ], p.seat.radius, p.fabric.color);
    rounded(`back-${side}`, [p.back.width, p.back.height, p.back.depth],
      [x, p.back.bottomY + p.back.height / 2, p.back.centerZ], p.back.radius, p.fabric.color, p.back.topTaper);
    rounded(`arm-${side}`, [p.arm.width, p.arm.height, p.arm.depth],
      [sign * (innerEdge + p.arm.width / 2), p.arm.bottomY + p.arm.height / 2, 0], p.arm.radius, p.fabric.armColor);
    for (const [end, z] of [['front', p.leg.offsetZ], ['rear', -p.leg.offsetZ]]) {
      rounded(`leg-${side}-${end}`, [p.leg.width, p.leg.height, p.leg.width],
        [sign * (halfWidth - p.leg.insetX), p.leg.height / 2, z], 0.008, p.fabric.legColor);
    }
    const point = new THREE.Object3D();
    point.name = `use-point-${side}`;
    point.position.set(x, 0, p.seat.centerZ);
    sofa.add(point);
  }
  sofa.updateMatrixWorld(true);
  return sofa;
}

async function exportModel(parameters) {
  const object = build(parameters);
  try {
    const glb = await new GLTFExporter().parseAsync(object, {
      binary: true, onlyVisible: true, animations: [],
      copyright: 'Project-authored geometry and materials. No external art assets.',
    });
    return Buffer.from(glb);
  } finally {
    const materials = new Set();
    object.traverse(node => {
      node.geometry?.dispose();
      if (node.material) materials.add(node.material);
    });
    materials.forEach(value => value.dispose());
  }
}

async function verify(bytes, parameters, usePoints) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltfJson = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert(!gltfJson.animations?.length && !gltfJson.skins?.length);
  assert(gltfJson.buffers.every(buffer => buffer.uri === undefined));
  assert(!gltfJson.images?.length && !gltfJson.textures?.length);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loaded = await new GLTFLoader().parseAsync(arrayBuffer, '');
  const scene = loaded.scene;
  scene.updateMatrixWorld(true);
  const slotMeshes = Object.values(materialSlots).flat();
  assert.equal(slotMeshes.length, new Set(slotMeshes).size);
  assert.equal(slotMeshes.length, gltfJson.meshes.length);
  for (const name of slotMeshes) assert(scene.getObjectByName(name)?.isMesh, `Missing material-slot mesh ${name}`);
  const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `Readback differs ${a} vs ${b}`);
  const seats = [];
  try {
    assert.equal(loaded.animations.length, 0);
    scene.traverse(node => {
      assert(!node.isSkinnedMesh);
      assert.deepEqual(node.scale.toArray(), [1, 1, 1]);
    });
    for (const point of usePoints) {
      const seat = scene.getObjectByName(point.seatNodeId);
      const back = scene.getObjectByName(point.backNodeId);
      assert(seat?.isMesh && back?.isMesh);
      const bounds = new THREE.Box3().setFromObject(seat);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      near(bounds.max.y, point.seatHeight);
      near(size.x, parameters.seat.width);
      near(size.y, parameters.seat.thickness);
      near(size.z, parameters.seat.depth);
      near(center.x, point.position[0]);
      near(center.z, point.position[2]);
      const marker = scene.getObjectByName(`use-point-${point.id}`).getWorldPosition(new THREE.Vector3());
      marker.toArray().forEach((value, axis) => near(value, point.position[axis]));
      assert(point.approach[2] > bounds.max.z && point.exit[2] > bounds.max.z);
      const backBounds = new THREE.Box3().setFromObject(back);
      near(backBounds.getSize(new THREE.Vector3()).y, parameters.back.height);
      seats.push({ id: point.id, seatNodeId: seat.name, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        backBounds: { min: backBounds.min.toArray(), max: backBounds.max.toArray() } });
    }
    const bounds = new THREE.Box3().setFromObject(scene);
    near(bounds.min.y, 0);
    near(bounds.min.x + bounds.max.x, 0);
    near(bounds.min.z + bounds.max.z, 0);
    return { seats, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, size: bounds.getSize(new THREE.Vector3()).toArray(),
      meshCount: gltfJson.meshes.length, embeddedBuffers: gltfJson.buffers.length,
      animations: 0, skins: 0, externalUris: 0, scales: 'All identity' };
  } finally {
    const materials = new Set();
    scene.traverse(node => {
      node.geometry?.dispose();
      if (node.material) materials.add(node.material);
    });
    materials.forEach(value => value.dispose());
  }
}

for (const file of ['baseline.json', 'variant.json']) {
  const parameterPath = sourceFolder + file;
  const sourceBytes = await fs.readFile(new URL(parameterPath, root));
  const parameters = JSON.parse(sourceBytes);
  const first = await exportModel(parameters);
  const repeat = await exportModel(parameters);
  assert(first.equals(repeat), `Repeated exports differ for ${file}`);
  assert.equal(hash(first), originalGlbHashes.get(parameters.version), 'Metadata update must retain original GLB bytes');
  const usePoints = [['left', -1], ['right', 1]].map(([id, sign]) => ({
    id, position: [sign * parameters.seat.offsetX, 0, parameters.seat.centerZ], yaw: 0, seatHeight: 0.47,
    capacity: 1,
    clearance: { width: parameters.seat.width, depth: Number((parameters.exitZ - parameters.seat.centerZ).toFixed(6)) },
    limitations: [
      'Metres. Fixed 0.47m seat height. Static data preview only. Actual character usage awaits C3.',
      'Clearance width is centred on use-point X. Depth extends forward from use-point Z through the exit point.',
      'Declared allocation only. Character body clearance, reach, contact and approach/exit motion remain unverified.',
    ],
    seatNodeId: `seat-${id}`, backNodeId: `back-${id}`,
    approach: [sign * parameters.seat.offsetX, 0, parameters.approachZ],
    exit: [sign * parameters.seat.offsetX, 0, parameters.exitZ],
  }));
  const readback = await verify(first, parameters, usePoints);
  const resource = {
    id: 'lounge-sofa', version: parameters.version, category: 'multi-use', mountRole: 'sofa',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre. Use-point positions are ground projections of seat centres.', scale: 'Identity only' },
    provenance: {
      license: 'Project-authored geometry and solid-color materials. No external art assets.',
      tools: [`Three.js ${THREE.REVISION}`, 'RoundedBoxGeometry', 'GLTFExporter', 'GLTFLoader independent readback'],
      sourceParameters: parameterPath, sourceParametersSha256: hash(sourceBytes),
      generator: 'scripts/company-platform/build-sofa.mjs', generatorSha256: scriptHash,
      method: 'New parametric mesh construction. Each input independently builds and exports geometry.',
    },
    asset: { format: 'glb', url: `/company-assets/lounge-sofa/v${parameters.version}/model.glb`, sha256: hash(first), bytes: first.length },
    footprint: { center: [0, 0], halfSize: [readback.size[0] / 2, readback.size[2] / 2], blocking: true },
    materialSlots: structuredClone(materialSlots), usePoints, stateDefaults: {},
  };
  outputs.push({ parameters, sourceSha256: hash(sourceBytes), bytes: first, resource, readback });
}
assert.notEqual(outputs[0].resource.asset.sha256, outputs[1].resource.asset.sha256);
const report = {
  status: 'passed', generatorSha256: scriptHash,
  dispatch: { difficulty: 'standard', model: 'gpt-6.1-sol', reasoning_effort: 'medium',
    reason: 'Query-ready material-slot and static seat-space metadata on verified sofa source, with unchanged GLB hashes.',
    configurationEvidence: 'Parent-confirmed existing configuration. Hook interception unverified here.' },
  commands: ['node scripts/company-platform/build-sofa.mjs', 'node scripts/company-platform/build-sofa.mjs --check'],
  metadataUpdate: {
    scope: 'Material-slot mesh mapping, per-seat capacity and static clearance declarations only.',
    originalEvidence: ['report.initial.json', 'disk-readback.initial.json'],
    originalGlbSha256Retained: true, materialSlots,
    seatCapacity: 1, clearance: { width: 0.92, depth: 1.11 },
    clearanceMeaning: 'Width centred on seat/use-point X. Forward depth from use-point Z=0.04 to exit Z=1.15.',
    limits: 'Metres, fixed 0.47m seat height and data preview only. Actual character usage awaits C3.',
  },
  versions: outputs.map(output => ({ version: output.parameters.version, sourceSha256: output.sourceSha256,
    asset: output.resource.asset, repeatedExportByteIdentical: true, readback: output.readback })),
  differences: {
    armWidth: outputs.map(output => output.parameters.arm.width), armHeight: outputs.map(output => output.parameters.arm.height),
    backHeight: outputs.map(output => output.parameters.back.height), backRadius: outputs.map(output => output.parameters.back.radius),
    backTopTaper: outputs.map(output => output.parameters.back.topTaper), fabricColor: outputs.map(output => output.parameters.fabric.color),
    seatHeight: [0.47, 0.47],
  },
  limitations: ['CPU export and GLTFLoader readback only. No browser or GPU preview acceptance.',
    'Two declared seats have no character usage, navigation, contact or approach/exit animation acceptance.',
    'Materials use solid colors with roughness. No scanned fabric, textures or external dependencies.'],
};
const files = outputs.flatMap(output => {
  const folder = `${productionFolder}v${output.parameters.version}/`;
  return [[folder + 'model.glb', output.bytes], [folder + 'resource.json', JSON.stringify(output.resource, null, 2) + '\n']];
});
files.push(['evidence/company-sofa-production-v1/report.json', JSON.stringify(report, null, 2) + '\n']);
for (const [file, bytes] of files) {
  const url = new URL(file, root);
  if (process.argv.includes('--check')) {
    assert(Buffer.from(await fs.readFile(url)).equals(Buffer.from(bytes)), `Output differs ${file}`);
  } else {
    await fs.mkdir(new URL('./', url), { recursive: true });
    await fs.writeFile(url, bytes);
  }
}
console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build',
  versions: report.versions.map(version => ({ version: version.version, sha256: version.asset.sha256, bytes: version.asset.bytes, size: version.readback.size })) }));
