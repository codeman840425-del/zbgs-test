import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEquipment} from './equipment.js';
import {createBodyCoverageSet} from './body-coverage.js';

const originalFetch = globalThis.fetch;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('body coverage commit can be rolled back after a later-domain failure injection', async () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0,
  ]), 3));
  const rawIndex = new Uint32Array([0, 1, 2, 0, 2, 3]);
  geometry.setIndex(new THREE.BufferAttribute(rawIndex, 1));
  geometry.addGroup(0, rawIndex.length, 0);
  const material = new THREE.MeshBasicMaterial();
  material.name = 'BodyMat';
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bodySha = 'body-test-sha';
  const entry = {id: 'top-test', sha256: 'asset-test-sha', compatibleAvatarSha256: bodySha};
  const descriptor = {
    schema: 'zbgs-equipment-body-coverage.1',
    avatarSha256: bodySha,
    itemId: entry.id,
    itemSha256: entry.sha256,
    bodyMaterial: material.name,
    bodyFaceCount: 2,
    bodyIndexComponentType: 5125,
    bodyIndexAccessorSha256: await digest(new Uint8Array(rawIndex.buffer)),
    selectedFaceIds: [0],
    selectedTriangles: [[0, 1, 2]],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(descriptor));
  globalThis.fetch = async () => new Response(bytes, {status: 200});
  const owner = await createBodyCoverageSet({body: [mesh], avatarSha256: bodySha, bindings: [{entry, descriptor: {url: '/coverage.json', sha256: await digest(bytes)}}]});
  const update = owner.prepareEquipmentSet([entry.id]);
  const before = mesh.geometry;
  update.commit();
  assert.notEqual(mesh.geometry, before);
  try {
    throw Error('later equipment domain failure');
  } catch {
    update.rollback();
  } finally {
    update.dispose();
  }
  assert.equal(mesh.geometry, before);
  assert.deepEqual(owner.getInfo().activeItems, []);
  owner.dispose();
  material.dispose();
  geometry.dispose();
});

test('primary equipment catalog refuses changed bytes before accessing the rig', async () => {
  const original = '{"schema":"zbgs-equipment-v1","items":[]}';
  globalThis.fetch = async () => new Response(original + ' ');
  const options = {
    vrm: {humanoid: {}, scene: {}},
    manifestUrl: '/assets/test-equipment.json',
    manifestSha256: await digest(new TextEncoder().encode(original)),
  };
  await assert.rejects(createEquipment(options), /Equipment manifest integrity mismatch/);
});
