// Same CPU rest measurement as native-vroid-waist-body-texture-fit-v1/measure-floor.mjs.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';

const [file, expectedSHA, shoeMaterial] = process.argv.slice(2);
const bytes = await fs.readFile(file);
assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedSHA);
const loader = new GLTFLoader();
loader.register(() => ({name:'CPUTextureFixture', loadTexture:async () => new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
loader.register(parser => new VRMLoaderPlugin(parser));
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);
const rows = [];
gltf.scene.traverse(mesh => {
  if (!mesh.isSkinnedMesh) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!materials.some(material => material.name === shoeMaterial)) return;
  mesh.skeleton.update();
  const indices = new Set(mesh.geometry.index.array), point = new THREE.Vector3();
  let raw = Infinity, rest = Infinity;
  for (const index of indices) {
    raw = Math.min(raw, mesh.geometry.attributes.position.getY(index));
    rest = Math.min(rest,mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld).y);
  }
  assert(Number.isFinite(raw) && Number.isFinite(rest));
  rows.push({raw,rest,vertices:indices.size});
});
assert.equal(rows.length,1);
console.log(JSON.stringify({...rows[0],bodySha256:expectedSHA,material:shoeMaterial,threeRevision:THREE.REVISION,method:'Indexed shoe vertices, runtime CPU rest skinning then matrixWorld; texture-only fixture'}));
