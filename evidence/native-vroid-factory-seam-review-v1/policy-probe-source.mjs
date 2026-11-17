import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createCharacterAppearance } from '../../prototype/src/character-appearance.js';
const sha = '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef';
const bytes = await fs.readFile('assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm');
const loader = new GLTFLoader();
loader.register(() => ({ name: 'CPUTextureDecodeOnly', loadTexture: async () =>
  new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
loader.register(parser => new VRMLoaderPlugin(parser));
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const vrm = gltf.userData.vrm;
const hair = [];
vrm.scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.every(material => /_HAIR/.test(material.name))) hair.push({ mesh, visible: mesh.visible });
});
const appearance = createCharacterAppearance({ vrm, avatarSha256: sha, preserveHairInBaseMode: true });
try {
  const base = appearance.setBodyMode('base');
  assert.equal(base.applied, true);
  assert.ok(hair.length && hair.every(row => row.mesh.visible === row.visible));
  const state = appearance.getState();
  assert.equal(state.effectiveHairStyle, 'original'); assert.equal(state.noHairAdmission, null);
  assert.deepEqual(state.availableStyles, ['original']);
  const none = await appearance.set({ hairStyle: 'none' }); assert.equal(none.applied, false);
  assert.equal(appearance.setBodyMode('dressed').applied, true);
  await fs.writeFile('evidence/native-vroid-factory-seam-review-v1/source-body-policy-probe.json',
    JSON.stringify({ schema: 'native-source-body-policy-cpu-v1', status: 'passed-bounded-appearance-policy',
      base, hairMeshesPreserved: hair.length, noHairAdmission: state.noHairAdmission,
      effectiveHairStyle: state.effectiveHairStyle, styles: state.availableStyles, noneRejected: none,
      limits: 'Actual appearance policy only; foundation material/coverage branches are source reviewed, no renderer or full factory' }, null, 2) + '\n', { flag: 'wx' });
  console.log('Explicit preserve-hair base policy passed, without adding no-hair admission');
} finally { appearance.dispose(); VRMUtils.deepDispose(vrm.scene); }
