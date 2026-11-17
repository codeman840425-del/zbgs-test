// Actual source/constructors with1px CPU texture decode, no factory registration.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createCharacterAppearance } from '../../prototype/src/character-appearance.js';
import { createFacialGeometry } from '../../prototype/src/facial-geometry.js';
import { createLivePresentation } from '../../prototype/src/live-presentation.js';
import { createRigidAccessoryLayer } from '../../prototype/src/rigid-accessory-layer.js';
import { createFaceRenderCompaction } from '../../prototype/src/face-render-compaction.js';
import { EAR_MANIFEST_SHA, HAT_MANIFEST_SHA } from '../../prototype/src/accessory-recipe.js';
import { facialPaletteContract } from '../../prototype/src/facial-palette-contract.js';

const root = process.cwd(), sha = '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef';
const bytes = await fs.readFile(root + '/assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm');
assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
const fetches = [];
globalThis.location = new URL('https://factory-seam.fixture/');
globalThis.window = { location };
globalThis.fetch = async input => {
  const url = new URL(String(input), location);
  assert.ok(url.pathname.startsWith('/assets/'));
  fetches.push(url.pathname);
  const data = await fs.readFile(root + '/prototype/public' + url.pathname);
  return new Response(data);
};
const loader = new GLTFLoader();
loader.register(() => ({ name: 'CPUTextureDecodeOnly', loadTexture: async () =>
  new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
loader.register(parser => new VRMLoaderPlugin(parser));
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const vrm = gltf.userData.vrm, group = new THREE.Group();
group.add(vrm.scene); vrm.update(0); group.updateMatrixWorld(true);
let appearance, geometry, live, ears, hat;
const result = { schema: 'native-vroid-factory-submodule-cpu-probe-v1', avatarSha256: sha,
  scope: 'Actual GLTFLoader and constructor/admission calls, no profile registration or full factory', findings: [] };
try {
  appearance = createCharacterAppearance({ vrm, avatarSha256: sha });
  geometry = createFacialGeometry({ vrm, avatarSha256: sha });
  live = createLivePresentation({ vrm, root: group, bodyType: 'female', avatarSha256: sha });
  ears = createRigidAccessoryLayer({ vrm, avatarSha256: sha, manifestSha256: EAR_MANIFEST_SHA });
  hat = createRigidAccessoryLayer({ vrm, avatarSha256: sha, kind: 'hat', manifestSha256: HAT_MANIFEST_SHA,
    getHairState: () => appearance.getState() });
  result.defaults = { appearance: appearance.getState(), geometry: geometry.getState(),
    live: live.getState(), ears: ears.getState(), hat: hat.getState(),
    faceCompaction: createFaceRenderCompaction({ vrm, avatarSha256: sha }), paletteContract: facialPaletteContract(sha) };
  result.baseRequest = appearance.setBodyMode('base');
  assert.equal(result.baseRequest.applied, false);
  result.hairRequest = await appearance.set({ hairStyle: 'female-bob-v1' });
  assert.equal(result.hairRequest.applied, false);
  result.skinToneRequest = await appearance.set({ skinTone: 'warm' });
  assert.equal(result.skinToneRequest.applied, true);
  await appearance.set({ reset: true });
  result.irisRequest = await appearance.set({ eyeColor: 'green' });
  assert.equal(result.irisRequest.applied, false);
  result.surfaceRequest = await appearance.set({ surfaceLayers: [{ id: 'freckles', opacity: 1 }] });
  assert.equal(result.surfaceRequest.applied, false);
  result.geometryRequest = await geometry.set({ mouthWidth: .1 });
  assert.equal(result.geometryRequest.applied, false);
  result.neutralGeometryReset = await geometry.set({ reset: true });
  assert.equal(result.neutralGeometryReset.applied, true);
  result.emptyEars = await ears.setSelection('none');
  result.emptyHat = await hat.setSelection('none');
  for (const [label, callback] of [['ears', () => ears.setSelection('left')],
    ['hat', () => hat.setSelection('single')], ['mic', () => live.setAccessory('mic', true)]]) {
    try { result[label + 'Request'] = await callback(); }
    catch (error) { result[label + 'Request'] = { rejected: true, message: error.message }; }
  }
  live.setExpression('happy'); live.preUpdate(1 / 60, { action: 'idle' });
  vrm.update(1 / 60); group.updateMatrixWorld(true); live.postUpdate();
  result.expressionRequest = { happyWeight: vrm.expressionManager.getValue('happy'),
    blinkWeight: vrm.expressionManager.getValue('blink'), compatibility: live.getState().eyeBlinkCompatibility };
  result.fetches = fetches;
  result.status = 'bounded-submodule-probe-completed';
  result.limits = ['1px CPU texture decode, no raster/render judgement',
    'Full loadFoundationAvatar/createM1Equipment not run; profile was not forged',
    'No visual, mixed-expression, greeting, accessory or motion acceptance'];
  await fs.writeFile(root + '/evidence/native-vroid-factory-seam-review-v1/cpu-probe.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, baseRequest: result.baseRequest,
    styles: result.defaults.appearance.availableStyles, skinTone: result.skinToneRequest,
    iris: result.irisRequest, geometry: result.geometryRequest, expression: result.expressionRequest }));
} finally {
  ears?.dispose(); hat?.dispose(); geometry?.dispose(); appearance?.dispose(); live?.dispose();
  VRMUtils.deepDispose(vrm.scene);
}
