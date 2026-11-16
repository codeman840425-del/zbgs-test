import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils,VRMSpringBoneCollider} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {validateHairSkin,createHairSpring} from '../../prototype/src/hair-spring.js';
import {validateHairFitData,validateHairSelection,hairFitIdentity} from '../../prototype/src/hair-fit-contract.js';
import {HAIRSTYLES} from '../../prototype/src/hairstyle-catalog.js';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),out=path.dirname(fileURLToPath(import.meta.url));
const base=path.join(root,'assets-source/m2-long-hair-v1'),revision=path.join(base,'revisions/rootjoin-v2');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),digest=b=>createHash('sha256').update(b).digest('hex');
const fit=await read(path.join(revision,'fit.json')),manifest=await read(path.join(revision,'manifest.json'));
const oldfit=await read(path.join(base,'generated/fit.json')),oldmanifest=await read(path.join(base,'generated/manifest.json'));
const sourceNames=['prototype/src/hair-spring.js','prototype/src/hair-fit-contract.js','prototype/src/hairstyle-catalog.js','assets-source/m2-long-hair-v1/revisions/rootjoin-v2/female-ponytail.glb','assets-source/m2-long-hair-v1/revisions/rootjoin-v2/fit.json','assets-source/m2-long-hair-v1/revisions/rootjoin-v2/manifest.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceNames.map(async n=>[n,digest(await fs.readFile(path.join(root,n)))])));
const sourceSha256=await hashes(),checks=[],assets=[];
let failure=null,dynamics=null,vrm=null;
const check=(name,passed,details={})=>{checks.push({name,passed,...details});assert(passed,name);};
globalThis.self={URL:globalThis.URL};
async function parse(file,isBody=false){
 const bytes=await fs.readFile(file),loader=new GLTFLoader();if(isBody)loader.register(parser=>new VRMLoaderPlugin(parser));
 loader.register(()=>({name:'CPUOnlyTextureDecode',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');assets.push(asset);return asset;
}
const meshOf=scene=>{const found=[];scene.traverse(n=>{if(n.isMesh)found.push(n);});assert.equal(found.length,1);return found[0];};
try{
 const revised=await parse(path.join(revision,'female-ponytail.glb')),original=await parse(path.join(base,'generated/female-ponytail.glb'));
 const mesh=meshOf(revised.scene),oldmesh=meshOf(original.scene);validateHairSkin(revised.scene,[mesh]);
 check('actual revised GLTF passes runtime rest-skin contract before mounting',mesh.isSkinnedMesh&&mesh.skeleton.bones.length===8);
 const entry={id:manifest.id,compatibleBodies:manifest.compatibleBodies,sourceBodySha256:fit.sourceBodySha256,sourceMaterial:manifest.sourceMaterial,assetSha256:manifest.sha256,manifestSha256:digest(await fs.readFile(path.join(revision,'manifest.json'))),fit:manifest.fit};
 assert.deepEqual(validateHairFitData(fit,entry,fit.targetBodySha256,manifest),fit.attachment);
 assert.throws(()=>validateHairFitData(oldfit,entry,fit.targetBodySha256,manifest));
 check('actual fit validator admits v2 exact resources and rejects v1 fit against v2 asset',true);
 const oldEntry={...entry,assetSha256:oldmanifest.sha256,manifestSha256:digest(await fs.readFile(path.join(base,'generated/manifest.json'))),fit:oldmanifest.fit};
 const at=HAIRSTYLES.findIndex(e=>e.id===entry.id&&e.compatibleBodies.includes(fit.targetBodySha256));assert(at>=0);const current=HAIRSTYLES[at];
 try{
   // Exercise the actual catalog-backed admission with the pinned v2 entry only
   // in this CPU process. No runtime or catalog source file changes.
   HAIRSTYLES[at]=entry;
   assert.throws(()=>validateHairSelection(fit.targetBodySha256,entry.id,{expectedHairFit:hairFitIdentity(oldEntry),expectedHairAssetSha256:oldEntry.assetSha256}),e=>e.code==='resource-identity-mismatch');
   assert.equal(validateHairSelection(fit.targetBodySha256,entry.id,{expectedHairFit:hairFitIdentity(entry),expectedHairAssetSha256:entry.assetSha256}),entry);
 }finally{HAIRSTYLES[at]=current;}
 check('actual catalog-backed admission rejects old saved fit identity after explicit v2 promotion',HAIRSTYLES[at]===current,{catalogChange:'process memory only, restored'});
 vrm=(await parse(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'),true)).userData.vrm;
 VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);vrm.update(0);vrm.scene.updateMatrixWorld(true);
 const head=vrm.humanoid.getRawBoneNode('head'),headBefore=head.matrixWorld.clone(),bodyTransforms=[];
 vrm.scene.traverse(n=>{if(n.isBone)bodyTransforms.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]);});
 const originalJoints=vrm.springBoneManager?.joints.size,originalHeadChildren=head.children.length;
 head.add(revised.scene,original.scene);vrm.scene.updateMatrixWorld(true);
 const point=(m,i)=>m.getVertexPosition(i,new THREE.Vector3());
 const key=(m,i)=>[...new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,i).toArray(),m.geometry.attributes.uv.getX(i),m.geometry.attributes.uv.getY(i)].join(',');
 const lookup=new Map(Array.from({length:oldmesh.geometry.attributes.position.count},(_,i)=>[key(oldmesh,i),i]));
 const map=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>lookup.get(key(mesh,i)));assert(map.every(Number.isInteger));
 let restError=0;map.forEach((j,i)=>restError=Math.max(restError,point(mesh,i).distanceTo(point(oldmesh,j))));
 for(const s of [revised.scene,original.scene]){s.getObjectByName('Pony0').rotation.z=.2;s.getObjectByName('Pony2').rotation.x=-.15;}
 vrm.scene.updateMatrixWorld(true);let capMotion=0,distalError=0,rootMotion=0;
 map.forEach((j,i)=>{
   const p=point(mesh,i),rest=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i);
   if(j<225)capMotion=Math.max(capMotion,p.distanceTo(rest));
   if(j>=289&&j<627)distalError=Math.max(distalError,p.distanceTo(point(oldmesh,j)));
   if(j>=241&&j<257)rootMotion=Math.max(rootMotion,p.distanceTo(rest));
 });
 check('real source skins under original raw head retain cap and distal behavior with blended moving root',restError<1e-7&&capMotion<1e-7&&distalError<1e-7&&rootMotion>.0005,{restErrorM:restError,capMotionM:capMotion,distalPoseDifferenceM:distalError,rootMotionM:rootMotion,manualPose:{Pony0Z:.2,Pony2X:-.15}});
 for(const s of [revised.scene,original.scene]){s.getObjectByName('Pony0').quaternion.identity();s.getObjectByName('Pony2').quaternion.identity();}
 dynamics=createHairSpring({vrm,scene:revised.scene,config:fit.dynamics});dynamics.reset();vrm.update(1/120);dynamics.update(1/120);vrm.scene.updateMatrixWorld(true);
 assert(Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>point(mesh,i)).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
 const solverState=dynamics.getState();dynamics.dispose();dynamics=null;
 check('real revised asset executes one isolated official-solver step then removes owned body proxies',solverState.updates===1&&solverState.bodyColliderCount===3&&solverState.jointCount===6&&vrm.springBoneManager?.joints.size===originalJoints&&head.children.filter(n=>n instanceof VRMSpringBoneCollider).length===0,{solverState});
 check('hair-only pose and lifecycle preserve original body bone TRS and raw head matrix',bodyTransforms.every(([n,p,q,s])=>n.position.equals(p)&&n.quaternion.equals(q)&&n.scale.equals(s))&&head.matrixWorld.equals(headBefore),{bodyBones:bodyTransforms.length,headChildrenBefore:originalHeadChildren});
}catch(error){failure={message:error.message,stack:error.stack};}
finally{
 dynamics?.dispose();for(const a of assets){a.scene.removeFromParent();VRMUtils.deepDispose(a.scene);}
}
const finalSha256=await hashes();check('source bytes remain stable through independent CPU imports',JSON.stringify(sourceSha256)===JSON.stringify(finalSha256));
const report={schema:'hair-rootjoin-independent-runtime-cpu-v1',checks,failure,sourceSha256,finalSha256,limits:['Real revised and v1 GLBs and original female VRM, GLTFLoader and runtime fit/skin/spring modules. Textures use 1x1 CPU placeholders. Embedded original texture bytes were checked separately.','Two explicit auxiliary-bone rotations and one official-solver step only. No actual game animation, chair contact, rendered connector appearance or performance acceptance.']};
await fs.writeFile(path.join(out,'report-runtime-v1.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,failure},null,2));if(failure)process.exitCode=1;
