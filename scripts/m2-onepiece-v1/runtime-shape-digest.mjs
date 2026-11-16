// Locked Three.js/GLTFLoader CPU canonicalization for Body skin weights.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.self={URL:globalThis.URL};
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return originalParse.apply(this,args);};
const path=process.argv[2];if(!path)throw Error('Body VRM path required');
const bytes=await fs.readFile(path),loader=new GLTFLoader(),parsed=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
let result=null;parsed.scene.traverse(mesh=>{if(result||!mesh.isMesh)return;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!materials.some(m=>m?.name==='M00_001_01_Body_00_SKIN'))return;const attr=mesh.geometry.getAttribute('skinWeight'),view=attr.array.buffer.slice(attr.array.byteOffset,attr.array.byteOffset+attr.array.byteLength);result={sha256:createHash('sha256').update(Buffer.from(view)).digest('hex'),count:attr.count,itemSize:attr.itemSize,threeRevision:THREE.REVISION,loader:'GLTFLoader.parseAsync + SkinnedMesh.normalizeSkinWeights'};});
if(!result)throw Error('Registered Body skin surface not found');console.log(JSON.stringify(result));
