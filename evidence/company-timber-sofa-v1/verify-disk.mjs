import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const root = new URL('../../', import.meta.url);
const contract = JSON.parse(await fs.readFile(new URL('prototype/public/company-assets/lounge-sofa/v1/resource.json', root), 'utf8'));
const resource = JSON.parse(await fs.readFile(new URL('prototype/public/company-assets/timber-sofa/v1/resource.json', root), 'utf8'));
const production = JSON.parse(await fs.readFile(new URL('report.json', import.meta.url), 'utf8'));
assert.deepEqual(resource.usePoints, contract.usePoints);
assert.deepEqual(resource.footprint, contract.footprint);
assert.equal(resource.mountRole, 'sofa'); assert.equal(resource.category, 'multi-use');
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `Geometry differs ${a} vs ${b}`);
const records = [];
for (const [index, path] of [
  'prototype/public/company-assets/timber-sofa/v1/model.glb',
  'evidence/company-timber-sofa-v1/variant.glb',
].entries()) {
  const bytes = await fs.readFile(new URL(path, root));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, production.results[index].sha256);
  if (index === 0) { assert.equal(sha256, resource.asset.sha256); assert.equal(bytes.length, resource.asset.bytes); }
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert(!json.skins?.length && !json.animations?.length && !json.images?.length);
  assert(json.buffers.every(buffer => !buffer.uri));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = loaded.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene), size = bounds.getSize(new THREE.Vector3());
  const fp = resource.footprint;
  assert(bounds.min.x >= fp.center[0] - fp.halfSize[0] - 1e-6);
  assert(bounds.max.x <= fp.center[0] + fp.halfSize[0] + 1e-6);
  assert(bounds.min.z >= fp.center[1] - fp.halfSize[1] - 1e-6);
  assert(bounds.max.z <= fp.center[1] + fp.halfSize[1] + 1e-6);
  assert(size.x >= 2.1 && size.x <= 2.4 && size.z <= 1.04);
  near(bounds.min.y, 0);
  const names = Object.values(resource.materialSlots).flat();
  assert.equal(new Set(names).size, 18);
  assert.equal(json.meshes.length, 18);
  const slots = {};
  for (const [slot, meshNames] of Object.entries(resource.materialSlots)) {
    const materials = new Set();
    for (const name of meshNames) {
      const object = scene.getObjectByName(name);
      assert(object?.isMesh);
      materials.add(object.material);
    }
    assert.equal(materials.size, 1);
    slots[slot] = { meshes: meshNames.length, color: [...materials][0].color.getHexString() };
  }
  assert.notEqual(slots.fabric.color, slots.frame.color);
  const contacts = [];
  for (const point of resource.usePoints) {
    const seat = scene.getObjectByName(point.seatNodeId), back = scene.getObjectByName(point.backNodeId);
    const seatBounds = new THREE.Box3().setFromObject(seat), backBounds = new THREE.Box3().setFromObject(back);
    const center = seatBounds.getCenter(new THREE.Vector3());
    near(center.x, point.position[0]); near(center.z, point.position[2]); near(seatBounds.max.y, 0.47);
    near(seatBounds.max.y - seatBounds.min.y, 0.09);
    assert(backBounds.min.y > seatBounds.max.y + 0.015);
    const topHit = new THREE.Raycaster(new THREE.Vector3(point.position[0], 1.5, point.position[2]), new THREE.Vector3(0, -1, 0))
      .intersectObject(seat, false)[0];
    const backHit = new THREE.Raycaster(new THREE.Vector3(point.position[0], 0.72, 1), new THREE.Vector3(0, 0, -1))
      .intersectObject(back, false)[0];
    assert(topHit && backHit);
    near(topHit.point.y, point.seatHeight); near(backHit.point.z, -0.3);
    const normal = backHit.face.normal.clone().transformDirection(back.matrixWorld);
    assert(normal.y > 0.1 && normal.z > 0.95);
    contacts.push({ id: point.id, seat: topHit.point.toArray(), back: backHit.point.toArray(), backNormal: normal.toArray() });
  }
  const materials = new Set();
  scene.traverse(object => {
    assert(!object.isSkinnedMesh);
    object.scale.toArray().forEach(value => near(value, 1));
    object.geometry?.dispose();
    if (object.material) materials.add(object.material);
  });
  materials.forEach(material => material.dispose());
  records.push({ path, sha256, bytes: bytes.length, size: size.toArray(), actualBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    fixedFootprintRetained: true, slots, contacts });
}
assert.notEqual(records[0].sha256, records[1].sha256);
assert.notEqual(records[0].contacts[0].backNormal[1], records[1].contacts[0].backNormal[1]);
const result = { status: 'passed', method: 'Separate GLTFLoader process reading actual disk GLBs, with triangle-level contact rays',
  fixedFunctionContractExactMatch: true, records,
  limitations: ['CPU static geometry evidence. Real character use and browser/GPU visual acceptance remain unverified.'] };
await fs.writeFile(new URL('disk-readback.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
