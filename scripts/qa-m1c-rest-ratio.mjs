// Offline normalized-humanoid check, no browser/renderer/product mutation.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const folder='output/playwright/m1c-source';
const report=JSON.parse(await fs.readFile(`${folder}/source-analysis.json`,'utf8'));
const results={};
for(const [body,expected] of Object.entries(report.currentBodyRestRatios)) {
 const bytes=await fs.readFile(expected.path);const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 if(sha!==expected.sha256)throw Error(`Body changed: ${body}`);
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
 // Keep geometry, skeleton, humanoid and animation data. Texture/material only
 // removed in memory so a DOM is not needed; normalized bone origins unaffected.
 for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 delete json.materials;delete json.images;delete json.textures;
 if(json.extensions.VRM)json.extensions.VRM.materialProperties=[];
 if(json.extensions.VRM?.meta)delete json.extensions.VRM.meta.texture;
 const raw=Buffer.from(JSON.stringify(json)),j=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bin=bytes.subarray(20+length),head=Buffer.alloc(20);
 head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(20+j.length+bin.length,8);head.writeUInt32LE(j.length,12);head.write('JSON',16);
 const cooked=Buffer.concat([head,j,bin]);const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.parseAsync(cooked.buffer.slice(cooked.byteOffset,cooked.byteOffset+cooked.byteLength),'');const vrm=gltf.userData.vrm;
 VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
 const normalizedHip=vrm.humanoid.getNormalizedBoneNode('hips').getWorldPosition(new THREE.Vector3());
 const floor=vrm.scene.getWorldPosition(new THREE.Vector3()).y;
 const ratio=(normalizedHip.y-floor)/expected.sourceHipWorldY;
 results[body]={sha256:sha,normalizedHip:normalizedHip.toArray(),sceneFloorY:floor,ratio,errorVsOffline:Math.abs(ratio-expected.ratio)};
 if(Math.abs(ratio-expected.ratio)>1e-6)throw Error(`Normalized ratio mismatch: ${body}`);
}
await fs.writeFile(`${folder}/normalized-rest-ratio.json`,JSON.stringify({passed:true,results},null,2));console.log(results);
