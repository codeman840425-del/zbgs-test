import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

// Separate process and disk inputs. This verifier never imports the generator.
const root = new URL('../../', import.meta.url);
const records = [];
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6);
for (const version of [1, 2]) {
  const folder = new URL(`prototype/public/company-assets/lounge-sofa/v${version}/`, root);
  const resource = JSON.parse(await fs.readFile(new URL('resource.json', folder), 'utf8'));
  const bytes = await fs.readFile(new URL('model.glb', folder));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), resource.asset.sha256);
  assert.equal(bytes.length, resource.asset.bytes);
  assert.equal(resource.version, version);
  assert.equal(resource.id, 'lounge-sofa');
  assert.equal(resource.usePoints.length, 2);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert(!json.animations?.length && !json.skins?.length && !json.images?.length);
  assert(json.buffers.every(buffer => !buffer.uri));
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = model.scene;
  scene.updateMatrixWorld(true);
  const slotNames = Object.values(resource.materialSlots).flat();
  assert.equal(new Set(slotNames).size, 11);
  assert.deepEqual(resource.materialSlots.fabric, ['seat-left', 'seat-right', 'back-left', 'back-right', 'arm-left', 'arm-right']);
  assert.deepEqual(resource.materialSlots.frame, ['base', 'leg-left-front', 'leg-left-rear', 'leg-right-front', 'leg-right-rear']);
  for (const name of slotNames) assert(scene.getObjectByName(name)?.isMesh);
  const bounds = new THREE.Box3().setFromObject(scene);
  near(bounds.min.y, 0);
  near(bounds.max.x, resource.footprint.halfSize[0]);
  near(-bounds.min.x, resource.footprint.halfSize[0]);
  near(bounds.max.z, resource.footprint.halfSize[1]);
  const seatMeasurements = [];
  for (const point of resource.usePoints) {
    assert.equal(point.capacity, 1);
    near(point.clearance.width, 0.92);
    near(point.clearance.depth, 1.11);
    near(point.clearance.depth, point.exit[2] - point.position[2]);
    assert(point.limitations.some(value => value.includes('C3')));
    const seat = scene.getObjectByName(point.seatNodeId);
    const back = scene.getObjectByName(point.backNodeId);
    assert(seat?.isMesh && back?.isMesh);
    const box = new THREE.Box3().setFromObject(seat);
    near(box.max.y, 0.47);
    near(point.seatHeight, box.max.y);
    const center = box.getCenter(new THREE.Vector3());
    near(center.x, point.position[0]);
    near(center.z, point.position[2]);
    near(point.position[1], 0);
    near(box.max.x - box.min.x, 0.92);
    near(box.max.z - box.min.z, 0.74);
    assert(point.approach[2] > box.max.z && point.exit[2] > box.max.z);
    const backBox = new THREE.Box3().setFromObject(back);
    const vertices = back.geometry.attributes.position;
    const upperXs = [];
    for (let index = 0; index < vertices.count; index++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(back.matrixWorld);
      if (vertex.y > backBox.min.y + (backBox.max.y - backBox.min.y) * 0.75) upperXs.push(vertex.x);
    }
    seatMeasurements.push({ id: point.id, topY: box.max.y, width: box.max.x - box.min.x, depth: box.max.z - box.min.z,
      backHeight: backBox.max.y - backBox.min.y, backUpperQuarterWidth: Math.max(...upperXs) - Math.min(...upperXs) });
  }
  let meshes = 0;
  const materials = new Set();
  scene.traverse(node => {
    assert.deepEqual(node.scale.toArray(), [1, 1, 1]);
    assert(!node.isSkinnedMesh);
    if (node.isMesh) meshes++;
    node.geometry?.dispose();
    if (node.material) materials.add(node.material);
  });
  materials.forEach(material => material.dispose());
  assert.equal(meshes, 11);
  records.push({ version, sha256: resource.asset.sha256, bytes: bytes.length, meshes,
    materialSlots: resource.materialSlots,
    seatSpace: resource.usePoints.map(point => ({ id: point.id, capacity: point.capacity, clearance: point.clearance })),
    size: bounds.getSize(new THREE.Vector3()).toArray(), seats: seatMeasurements });
}
assert.notEqual(records[0].sha256, records[1].sha256);
assert(records[1].seats[0].backHeight > records[0].seats[0].backHeight);
assert(records[1].seats[0].backUpperQuarterWidth < records[0].seats[0].backUpperQuarterWidth);
const report = { status: 'passed', method: 'Independent GLTFLoader process reading actual disk GLBs and resource metadata', records,
  limits: ['CPU file verification. Browser/GPU preview and character usage remain unverified.'] };
await fs.writeFile(new URL('disk-readback.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
