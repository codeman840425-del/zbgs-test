import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader}from'../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin}from'../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const p='assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm',bytes=await fs.readFile(p),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes),'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce');
const loader=new GLTFLoader();loader.register(()=>({name:'CPU-texture-only',loadTexture:async()=>new T.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));loader.register(p=>new VRMLoaderPlugin(p));
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
const rows=[];gltf.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!mats.some(m=>m.name.includes('_Shoes_')))return;
 mesh.skeleton.update();const ids=[...new Set(mesh.geometry.index.array)],v=new T.Vector3();let minY=Infinity,worst=null;
 for(const i of ids){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);if(v.y<minY){minY=v.y;worst=i;}}
 rows.push({mesh:mesh.name,referencedVertices:ids.length,minWorldY:minY,worstSourceIndex:worst});});assert.equal(rows.length,1);
await fs.writeFile('evidence/native-face-factory-independent-v1/floor-result.json',JSON.stringify({avatarSHA:sha(bytes),threeRevision:T.REVISION,method:'Official VRM loader rest; actual referenced Shoes vertices getVertexPosition -> matrixWorld; no shader outline displacement; texture decode 1px CPU fixture',rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(rows));
