import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {MToonMaterial} from '../../prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js';
import {createBodyTextureCoverage} from '../../prototype/src/body-texture-coverage.js';
const dir=new URL('./',import.meta.url), manifest=JSON.parse(fs.readFileSync(new URL('./manifest.json',dir))), png=fs.readFileSync(new URL('./native-tops-body.png',dir));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(sha(png),manifest.covered.sha256);
const entries=manifest.equipment, avatar=manifest.avatarSha256, ids=entries.map(e=>e.id);
const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap;let closes=0;
globalThis.fetch=async url=>new Response(String(url).endsWith('manifest.json')?fs.readFileSync(new URL('./manifest.json',dir)):png,{status:200});
globalThis.createImageBitmap=async blob=>{assert.equal(sha(Buffer.from(await blob.arrayBuffer())),manifest.covered.sha256);let closed=false;return{width:2048,height:2048,close(){assert.equal(closed,false);closed=true;closes++;}}};
function fixture(){const map=new THREE.Texture({width:2048,height:2048});Object.assign(map,{flipY:false,colorSpace:THREE.SRGBColorSpace,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});const material=new MToonMaterial({map,shadeMultiplyTexture:map,alphaTest:.5,transparent:false});material.name=manifest.materialName;material.update(0);const outline=material.clone();outline.name=material.name+' (Outline)';outline.isOutline=true;const mesh=new THREE.Mesh(new THREE.BufferGeometry(),[material,outline]);return{body:[mesh],map,material,outline};}
const tests=[];
try{
 const f=fixture();f.material.color.set('#8b6c5d');const before=f.material.color.clone();const descriptor={url:'https://test/manifest.json',sha256:sha(fs.readFileSync(new URL('./manifest.json',dir)))};await assert.rejects(createBodyTextureCoverage({body:f.body,avatarSha256:avatar,entries,descriptor}),/unsupported avatar identity/);assert(f.material.color.equals(before));assert.equal(f.material.map,f.map);tests.push('new face identity rejected by current admissions without material mutation');
 const bad=fixture();await assert.rejects(createBodyTextureCoverage({body:bad.body,avatarSha256:'0'.repeat(64),entries,descriptor}),/unsupported avatar identity/);tests.push('wrong avatar rejected');
 const badEntries=entries.map(e=>({...e,compatibleAvatarSha256:'0'.repeat(64)}));const bad2=fixture();await assert.rejects(createBodyTextureCoverage({body:bad2.body,avatarSha256:avatar,entries:badEntries,descriptor}),/unsupported avatar identity/);tests.push('new identity remains fail-closed before equipment');
 const report={schema:'native-vroid-face-body-texture-fit-cpu-check-v1',status:'admission-blocked-new-avatar-identity',passed:tests.length,tests,avatarSha256:avatar,manifestSha256:descriptor.sha256,pngSha256:sha(png),bitmapCloses:closes,scope:'Actual Three/MToon body-texture-coverage fail-closed checks. Current shared admissions intentionally has no face-derived avatar entry, so no transaction commit is claimed. No WebGL, runtime or visual acceptance.'};fs.writeFileSync(new URL('./cpu-check.json',dir),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}finally{globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;}
