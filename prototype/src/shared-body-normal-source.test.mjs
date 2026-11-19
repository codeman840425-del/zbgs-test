import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import test from 'node:test';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '@pixiv/three-vrm';
import {foundationProfile} from './foundation-profiles.js';
import {shareBodyNormalSource} from './shared-body-normal-source.js';
import {createEquipment} from './equipment.js';
import pins from './native-body-normal-source-pins.json' with {type:'json'};

// The foundation's older JSON imports normally resolve through Vite.
const jsonHook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes:{type:'json'}} : context);
}});
const {loadFoundationAvatar} = await import('./foundation-avatar.js');
jsonHook.deregister();

const bodies = ['native-contour-roundness-a-v1', 'native-contour-cheek-b-v1'];
const publicRoot = new URL('../public/', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');

// The installed GLTF/VRM loader reads the real embedded images. Only browser
// pixel decoding is substituted; closure and exact compressed bytes are observed.
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class extends Event {};
const decoded = [];
globalThis.createImageBitmap = async blob => {
  const png = Buffer.from(await blob.arrayBuffer());
  const image = {
    width:png.readUInt32BE(16), height:png.readUInt32BE(20), digest:sha(png), closes:0,
    close() { this.closes++; },
  };
  decoded.push(image);
  return image;
};
async function parseBody(bodyType) {
  const profile = foundationProfile(bodyType);
  const bytes = await readFile(new URL(profile.url.slice(1), publicRoot));
  assert.equal(sha(bytes), profile.sha256);
  const loader = new GLTFLoader().register(p => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const pin = pins.avatars[profile.sha256];
  const material = await gltf.parser.getDependency('material', pin.material);
  const normal = material.normalMap;
  assert.equal(normal.image.digest, pin.pngSha256);
  assert.deepEqual([normal.image.width, normal.image.height], [2048,2048]);
  return {gltf, normal, material, image:normal.image, bodySha:profile.sha256};
}

test('two real VRMs share only the pinned normal source; first unload leaves the peer alive', async () => {
  const [a,b] = await Promise.all(bodies.map(parseBody));
  const renderer = {isWebGLRenderer:true};
  assert.notEqual(a.normal.source, b.normal.source);
  assert.notEqual(a.normal, b.normal);
  const source = a.normal.source, sourceVersion = source.version;
  const originalColors = [a.material.map.source,b.material.map.source];
  const releaseA = shareBodyNormalSource(renderer, a.gltf, a.bodySha);
  const releaseB = shareBodyNormalSource(renderer, b.gltf, b.bodySha);
  assert.equal(a.normal.source, b.normal.source);
  assert.equal(b.normal.source, source);
  assert.equal(source.version, sourceVersion);
  assert.equal(b.image.closes, 1);
  assert.notEqual(...originalColors);
  assert.equal(a.material.map.source, originalColors[0]);
  assert.equal(b.material.map.source, originalColors[1]);
  let peerDisposals = 0;
  b.normal.addEventListener('dispose', () => peerDisposals++);
  VRMUtils.deepDispose(a.gltf.scene);
  releaseA();
  releaseA();
  assert.equal(peerDisposals, 0);
  assert.equal(b.normal.image.closes, 0);
  VRMUtils.deepDispose(b.gltf.scene);
  assert.ok(peerDisposals > 0);
  assert.equal(source.data.closes, 0);
  releaseB();
  releaseB();
  assert.equal(source.data.closes, 1);
  const fresh = await parseBody(bodies[0]);
  const releaseFresh = shareBodyNormalSource(renderer, fresh.gltf, fresh.bodySha);
  assert.notEqual(fresh.normal.source, source);
  releaseFresh();
  assert.equal(fresh.image.closes, 1);
});

test('unsupported identities, samplers and aliased bitmaps bypass sharing; renderers stay isolated', async () => {
  const [a,b] = await Promise.all(bodies.map(parseBody));
  const renderer = {isWebGLRenderer:true};
  assert.equal(shareBodyNormalSource(renderer, a.gltf, 'unknown'), undefined);
  a.normal.minFilter = THREE.NearestFilter;
  assert.equal(shareBodyNormalSource(renderer, a.gltf, a.bodySha), undefined);
  a.normal.minFilter = THREE.LinearFilter;
  const clone = a.normal.clone();
  const extra = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({map:clone}));
  a.gltf.scene.add(extra);
  assert.equal(shareBodyNormalSource(renderer, a.gltf, a.bodySha), undefined);
  extra.removeFromParent();
  const releaseA = shareBodyNormalSource(renderer, a.gltf, a.bodySha);
  const releaseB = shareBodyNormalSource({isWebGLRenderer:true}, b.gltf, b.bodySha);
  assert.notEqual(a.normal.source, b.normal.source);
  releaseB();
  assert.equal(b.image.closes, 1);
  assert.equal(a.image.closes, 0);
  releaseA();
});

test('a factory failure after joining a live peer releases its lease on the real cleanup path', async t => {
  const peer = await parseBody(bodies[0]);
  const renderer = {isWebGLRenderer:true};
  const releasePeer = shareBodyNormalSource(renderer, peer.gltf, peer.bodySha);
  const profile = foundationProfile(bodies[1]);
  const fetchOriginal = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('blob:')) return fetchOriginal(url, options);
    if (url === profile.manifestUrl) return new Response(null, {status:503});
    assert.equal(url, profile.url);
    return new Response(await readFile(new URL(url.slice(1), publicRoot)));
  });
  const start = decoded.length;
  const scene = new THREE.Scene();
  await assert.rejects(loadFoundationAvatar({scene, renderer, bodyType:bodies[1]}), /Equipment manifest HTTP 503/);
  assert.equal(scene.children.length, 0);
  const failedNormals = decoded.slice(start).filter(image => image.digest === peer.image.digest);
  assert.equal(failedNormals.length, 1);
  assert.equal(failedNormals[0].closes, 1);
  assert.ok(decoded.slice(start).every(image => image.closes === 1));
  assert.equal(peer.image.closes, 0);
  releasePeer();
  assert.equal(peer.image.closes, 1);
});

test('normal loading and disposal through both equipped foundation actors preserve the surviving source', async t => {
  const origin = new URL('http://foundation.test/');
  globalThis.location = origin;
  globalThis.window = {location:origin};
  const fetchOriginal = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, origin);
    if (url.protocol === 'blob:') return fetchOriginal(input, options);
    assert.equal(url.origin, origin.origin);
    assert.ok(url.pathname.startsWith('/assets/'));
    return new Response(await readFile(new URL(url.pathname.slice(1), publicRoot)));
  });
  const renderer = {isWebGLRenderer:true}, scene = new THREE.Scene();
  const actors = await Promise.all(bodies.map(bodyType => loadFoundationAvatar({bodyType, renderer, scene})));
  const digest = pins.avatars[foundationProfile(bodies[0]).sha256].pngSha256;
  const [a,b] = actors.map(actor => {
    const normals = new Set();
    actor.vrm.scene.traverse(mesh => {
      if (mesh.isMesh) for (const mat of [mesh.material].flat()) {
        if (mat.normalMap?.image.digest === digest) normals.add(mat.normalMap);
      }
    });
    assert.equal(normals.size, 1);
    return [...normals][0];
  });
  assert.notEqual(a,b);
  assert.equal(a.source,b.source);
  const image = a.image;
  const wrapperDisposals = [0,0];
  a.addEventListener('dispose', () => wrapperDisposals[0]++);
  b.addEventListener('dispose', () => wrapperDisposals[1]++);
  actors[1].dispose();
  assert.deepEqual(wrapperDisposals,[0,1]);
  assert.equal(image.closes, 0);
  assert.equal(actors[0].root.parent, scene);
  assert.equal(actors[1].root.parent, null);
  actors[0].dispose();
  assert.deepEqual(wrapperDisposals,[1,1]);
  assert.equal(image.closes, 1);
  assert.equal(scene.children.length, 0);
});

test('garment disposal during decode or attachment releases every private image without committing', async t => {
  const profile = foundationProfile(bodies[0]);
  const {gltf} = await parseBody(bodies[0]);
  const origin = new URL('http://foundation.test/');
  globalThis.window = {location:origin};
  const fetchOriginal = globalThis.fetch;
  t.mock.method(globalThis,'fetch',async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, origin);
    if (url.protocol === 'blob:') return fetchOriginal(input, options);
    assert.equal(url.origin,origin.origin);
    return new Response(await readFile(new URL(url.pathname.slice(1),publicRoot)));
  });
  for (const phase of ['decoding','attaching']) await t.test(phase, async t => {
    const parent = new THREE.Group();
    const adapter = await createEquipment({vrm:gltf.userData.vrm, parent, manifestUrl:profile.manifestUrl,
      manifestSha256:profile.manifestSha256, avatarSha256:profile.sha256});
    const start = decoded.length;
    const started = Promise.withResolvers(), resume = Promise.withResolvers();
    if (phase === 'decoding') {
      const decode = globalThis.createImageBitmap;
      t.mock.method(globalThis,'createImageBitmap',async blob => {
        const image = await decode(blob);
        started.resolve();
        await resume.promise;
        return image;
      });
    } else {
      parent.addEventListener('childadded',() => adapter.dispose());
    }
    const result = adapter.load(profile.ids.top);
    if (phase === 'decoding') {
      await started.promise;
      adapter.dispose();
      resume.resolve();
    }
    await assert.rejects(result, /Equipment disposed while (loading|attaching)/);
    adapter.dispose();
    assert.equal(adapter.get(profile.ids.top), null);
    assert.deepEqual(parent.children,[]);
    assert.ok(decoded.length > start);
    assert.ok(decoded.slice(start).every(image => image.closes === 1));
  });
  VRMUtils.deepDispose(gltf.scene);
});
