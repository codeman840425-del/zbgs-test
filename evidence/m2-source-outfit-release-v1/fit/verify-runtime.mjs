// Run with Node from the repository root. This probe only writes to stdout.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '../../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createEquipment} from '../../../prototype/src/equipment.js';

const publicRoot = new URL('../../../prototype/public/', import.meta.url);
const origin = 'http://stripped-outfit.test';
const oldManifest = '/assets/raw-male-equipment-v1/equipment.json';
const releaseManifest = '/assets/source-outfit-release-v1/equipment.json';
const readPublic = path => readFile(new URL('.' + path, publicRoot));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const oldBodySha = 'ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c';
const releaseBodySha = 'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4';
const fetchNative = globalThis.fetch;
globalThis.self = globalThis;
globalThis.window = {location:{href:origin + '/'}};
globalThis.ProgressEvent ??= class extends Event {};
globalThis.createImageBitmap = async blob => {
  const header = Buffer.from(await blob.slice(0, 24).arrayBuffer());
  const png = header.length === 24 && header.readUInt32BE(0) === 0x89504e47;
  return {width:png ? header.readUInt32BE(16) : 1, height:png ? header.readUInt32BE(20) : 1, close() {}};
};
const requests = [];
globalThis.fetch = async input => {
  const uri = new URL(input instanceof Request ? input.url : input, origin);
  if (uri.protocol === 'blob:') return fetchNative(input);
  assert.equal(uri.origin, origin);
  assert.ok(uri.pathname.startsWith('/assets/'));
  requests.push(uri.pathname);
  return new Response(await readPublic(uri.pathname));
};

async function body(url, expected) {
  const bytes = await readPublic(url);
  assert.equal(sha(bytes), expected);
  const loader = new GLTFLoader().register(parser => new VRMLoaderPlugin(parser));
  const {userData:{vrm}} = await loader.parseAsync(Uint8Array.from(bytes).buffer, origin + '/assets/foundation/');
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.updateMatrixWorld(true);
  return vrm;
}

const oldVrm = await body('/assets/raw-male-equipment-v1/Base_Male.vrm', oldBodySha);
const releaseVrm = await body('/assets/source-outfit-release-v1/body.vrm', releaseBodySha);
const original = await createEquipment({vrm:oldVrm, avatarSha256:oldBodySha, manifestUrl:oldManifest});
const release = await createEquipment({vrm:releaseVrm, avatarSha256:releaseBodySha, manifestUrl:releaseManifest});
const wrongTarget = await createEquipment({vrm:oldVrm, avatarSha256:oldBodySha, manifestUrl:releaseManifest});
try {
  const oldIds = original.list().map(row => row.id);
  const releaseIds = release.list().map(row => row.id);
  const beforeWrongBody = requests.length;
  await assert.rejects(wrongTarget.equipSet(releaseIds), /requires its exact body identity/);
  assert.equal(requests.length, beforeWrongBody);
  const newRequests = requests.length;
  assert.equal((await release.equipSet(releaseIds)).applied, true);
  assert.deepEqual(requests.slice(newRequests).sort(), releaseIds.map(id => release.describe(id).url).sort());
  assert.equal((await original.equipSet(oldIds)).applied, true);
  const rows = [];
  for (const id of releaseIds) {
    const target = release.get(id);
    const fixture = original.get(oldIds.find(old => original.describe(old).sha256 === target.entry.sha256));
    assert.ok(target.container.visible && fixture.container.visible);
    assert.equal(fixture.meshes.length, target.meshes.length);
    let maxRestVertexDelta = 0, vertices = 0;
    for (const [index, mesh] of target.meshes.entries()) {
      const prior = fixture.meshes[index];
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      target.container.updateMatrixWorld(true);
      fixture.container.updateMatrixWorld(true);
      const count = mesh.geometry.attributes.position.count;
      assert.equal(count, prior.geometry.attributes.position.count);
      for (let vertex = 0; vertex < count; vertex++) {
        mesh.getVertexPosition(vertex, a).applyMatrix4(mesh.matrixWorld);
        prior.getVertexPosition(vertex, b).applyMatrix4(prior.matrixWorld);
        maxRestVertexDelta = Math.max(maxRestVertexDelta, a.distanceTo(b));
      }
      vertices += count;
    }
    assert.equal(maxRestVertexDelta, 0);
    rows.push({id, assetSha256:target.entry.sha256, vertices, maxRestVertexDelta});
  }
  release.dispose();
  assert.ok(releaseIds.every(id => !releaseVrm.scene.getObjectByName('Equipment:' + id)));
  assert.ok(oldIds.every(id => original.get(id)?.container.visible));
  process.stdout.write(JSON.stringify({passed:true, releaseBodySha, distinctSourceBodyRejectedBeforeFetch:true,
    assetUrlsShared:true, rows, disposalKeepsSourceActor:true,
    scope:'Actual Three GLTF/VRM and equipment adapter CPU rest. Image decode and asset HTTP are fixtures.'}, null, 2) + '\n');
} finally {
  wrongTarget.dispose();
  release.dispose();
  original.dispose();
  VRMUtils.deepDispose(releaseVrm.scene);
  VRMUtils.deepDispose(oldVrm.scene);
  globalThis.fetch = fetchNative;
}
