import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createLivePresentation} from './live-presentation.js';

const sourceRoot = new URL('../public/', import.meta.url);
const manifestText = await readFile(new URL('assets/m1c/accessories.json', sourceRoot), 'utf8');
const manifest = JSON.parse(manifestText);
const glassesBytes = await readFile(new URL('assets/m1c/studio-glasses-v1.glb', sourceRoot));
const femaleFitBytes = await readFile(new URL('assets/m1c/glasses-fit/female.json', sourceRoot));
const gripManifestText = await readFile(new URL('assets/m1c/grips/manifest.json', sourceRoot), 'utf8');
const gripManifest = JSON.parse(gripManifestText);
const gripEntry = gripManifest.items.find(item => item.compatibleAvatarSha256 === '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95');
const gripBytes = await readFile(new URL(gripEntry.url.slice(1), sourceRoot));
const microphoneBytes = await readFile(new URL('assets/m1c/studio-microphone-v1.glb', sourceRoot));

globalThis.window = {location: {href: 'http://localhost/'}};
globalThis.location = {search: ''};

function makeAvatar() {
  const root = new THREE.Group();
  const bones = new Map();
  const add = (name, parent = root, position = [0, 0, 0]) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.fromArray(position);
    parent.add(bone);
    bones.set(name, bone);
    return bone;
  };
  const chest = add('upperChest', root, [0, 1.2, 0]);
  add('head', chest, [0, .35, 0]);
  add('rightUpperArm', chest, [.2, .1, 0]);
  const lower = add('rightLowerArm', bones.get('rightUpperArm'), [.25, -.35, 0]);
  const hand = add('rightHand', lower, [.2, -.3, 0]);
  add('rightMiddleProximal', hand, [0, -.04, .02]);
  add('rightIndexProximal', hand, [.03, -.04, .02]);
  add('rightLittleProximal', hand, [-.03, -.04, .02]);
  root.updateMatrixWorld(true);
  const humanoid = {
    getNormalizedBoneNode: name => bones.get(name),
    getRawBoneNode: name => bones.get(name),
  };
  return {root, vrm: {humanoid, scene: root, meta: {metaVersion: '1'}}};
}

function propScene() {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(.02, .02, .02);
  const material = new THREE.MeshBasicMaterial();
  scene.add(new THREE.Mesh(geometry, material));
  return {scene, geometry, material};
}

function response(bytes, status = 200) {
  return new Response(bytes, {status, headers: {'content-type': 'application/octet-stream'}});
}

function fetchFor({delayGlb = false, failGlb = false, mic = false} = {}) {
  let releaseGlb;
  const fetchMock = async (url, options = {}) => {
    if (url.endsWith('/assets/m1c/accessories.json')) return response(manifestText, 200);
    if (url.endsWith('/assets/m1c/glasses-fit/female.json')) return response(femaleFitBytes, 200);
    if (url.endsWith('/assets/m1c/grips/manifest.json')) return response(gripManifestText, 200);
    if (mic && url.endsWith(gripEntry.url)) return response(gripBytes, 200);
    if (mic && url.endsWith('/assets/m1c/studio-microphone-v1.glb')) return response(microphoneBytes, 200);
    if (url.endsWith('/assets/m1c/studio-glasses-v1.glb')) {
      if (failGlb) return response('failed', 503);
      if (delayGlb) {
        await new Promise(resolve => { releaseGlb = resolve; options.signal?.addEventListener('abort', resolve, {once: true}); });
      }
      return response(glassesBytes, 200);
    }
    return response('missing', 404);
  };
  return {fetchMock, release: () => releaseGlb?.()};
}

const originalFetch = globalThis.fetch;
const originalParse = GLTFLoader.prototype.parseAsync;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  GLTFLoader.prototype.parseAsync = originalParse;
});

function createPresentation({withLookAt = false} = {}) {
  const {root, vrm} = makeAvatar();
  let failLookAt = false;
  if (withLookAt) vrm.lookAt = {
    autoUpdate: true,
    target: null,
    reset() {},
    lookAt() {},
    update() {if (failLookAt) throw Error('post-update failure');},
  };
  return {root, vrm, setLookAtFailure(value) {failLookAt = value;}, live: createLivePresentation({vrm, root, bodyType: 'female', avatarSha256: '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'})};
}

test('prepare keeps committed state until synchronous commit and removal releases it', async () => {
  const {live} = createPresentation();
  const mocked = fetchFor();
  globalThis.fetch = mocked.fetchMock;
  GLTFLoader.prototype.parseAsync = originalParse;

  const added = await live.setAccessory('glasses', true);
  assert.equal(added.applied, true);
  assert.equal(live.getState().accessories.glasses.requested, true);
  const pendingRemoval = await live.prepareAccessory('glasses', false);
  assert.equal(live.getState().accessories.glasses.requested, true);
  assert.equal(live.getState().accessories.glasses.loaded, true);
  assert.deepEqual(pendingRemoval.identity.bodySHA256, '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95');
  pendingRemoval.validateCommit();
  const removed = pendingRemoval.commit();
  assert.equal(removed.applied, true);
  assert.equal(live.getState().accessories.glasses.requested, false);
  assert.equal(live.getState().accessories.glasses.loaded, false);
  live.dispose();
});

test('resource errors preserve the prior empty committed state and report error state', async () => {
  const {live} = createPresentation();
  const mocked = fetchFor({failGlb: true});
  globalThis.fetch = mocked.fetchMock;
  await assert.rejects(live.setAccessory('glasses', true), /Accessory HTTP 503/);
  const state = live.getState().accessories.glasses;
  assert.equal(state.requested, false);
  assert.equal(state.loaded, false);
  assert.equal(state.status, 'off');
  assert.match(state.error, /Accessory HTTP 503/);
  live.dispose();
});

test('microphone preparation carries exact body and grip identities and rechecks dance admission', async () => {
  const {live} = createPresentation();
  const mocked = fetchFor({mic: true});
  globalThis.fetch = mocked.fetchMock;
  GLTFLoader.prototype.parseAsync = originalParse;
  const prepared = await live.prepareAccessory('mic', true);
  assert.equal(prepared.identity.bodySHA256, '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95');
  assert.equal(prepared.identity.accessorySHA256, gripEntry.accessorySha256);
  assert.equal(prepared.identity.fit.id, gripEntry.id);
  assert.equal(prepared.identity.fit.sha256, gripEntry.sha256);
  live.setAction('dance');
  assert.throws(() => prepared.validateCommit(), /持麦舞蹈尚未制作/);
  prepared.release();
  assert.equal(live.getState().accessories.mic.requested, false);
  live.setAction('idle');
  let disposed = false;
  GLTFLoader.prototype.parseAsync = async () => {
    const parsed = propScene();
    const dispose = parsed.geometry.dispose.bind(parsed.geometry);
    parsed.geometry.dispose = () => {disposed = true; dispose();};
    return parsed;
  };
  const committed = await live.setAccessory('mic', true);
  assert.equal(committed.applied, true);
  live.dispose();
  assert.equal(disposed, true);
});

test('latest disable invalidates a delayed load without changing the committed record', async () => {
  const {live} = createPresentation();
  const mocked = fetchFor({delayGlb: true});
  globalThis.fetch = mocked.fetchMock;
  GLTFLoader.prototype.parseAsync = originalParse;
  const pending = live.prepareAccessory('glasses', true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(live.getState().accessories.glasses.status, 'loading');
  const removal = await live.prepareAccessory('glasses', false);
  assert.equal((await removal.commit()).applied, true);
  mocked.release();
  assert.deepEqual(await pending, {applied: false, cancelled: true});
  assert.equal(live.getState().accessories.glasses.loaded, false);
  live.dispose();
});

test('a later live commit failure rolls back its candidate and an earlier commit can be explicitly rolled back', async () => {
  const {live, setLookAtFailure, vrm} = createPresentation({withLookAt: true});
  const mocked = fetchFor({mic: true});
  globalThis.fetch = mocked.fetchMock;
  GLTFLoader.prototype.parseAsync = originalParse;
  const originalHand = vrm.humanoid.getNormalizedBoneNode('rightHand').quaternion.clone();
  const glasses = await live.prepareAccessory('glasses', true);
  const microphone = await live.prepareAccessory('mic', true);
  glasses.commit();
  assert.equal(live.getState().accessories.glasses.loaded, true);
  setLookAtFailure(true);
  assert.throws(() => microphone.commit(), /post-update failure/);
  assert.equal(live.getState().accessories.mic.loaded, false);
  assert.equal(live.getState().accessories.glasses.loaded, true);
  assert.deepEqual(vrm.humanoid.getNormalizedBoneNode('rightHand').quaternion.toArray(), originalHand.toArray());
  setLookAtFailure(false);
  glasses.rollback();
  assert.equal(live.getState().accessories.glasses.loaded, false);
  live.dispose();
});

test('one-time mount child-added failure restores the empty committed prop state', async () => {
  const {root, live} = createPresentation();
  const mocked = fetchFor();
  globalThis.fetch = mocked.fetchMock;
  GLTFLoader.prototype.parseAsync = originalParse;
  const mount = root.children.find(child => child.name === 'LivePresentation:female');
  let fail = true;
  const listener = () => {if (fail) {fail = false; throw Error('mount child-added failure');}};
  mount.addEventListener('childadded', listener);
  await assert.rejects(live.setAccessory('glasses', true), /mount child-added failure/);
  assert.equal(live.getState().accessories.glasses.loaded, false);
  assert.equal(live.getState().accessories.glasses.requested, false);
  mount.removeEventListener('childadded', listener);
  assert.equal((await live.setAccessory('glasses', true)).applied, true);
  assert.equal(live.getState().accessories.glasses.loaded, true);
  live.dispose();
});
