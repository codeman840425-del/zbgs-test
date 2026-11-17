// Real native source, official VRM/MToon/spring plugins and owned replacement.
// Only image decode/upload is replaced by a CPU Texture placeholder.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin} from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {HAIRSTYLES} from '../prototype/src/hairstyle-catalog.js';
import {createCharacterAppearance} from '../prototype/src/character-appearance.js';
import {loadNativeHairAttachment,validateNativeHairFit} from '../prototype/src/native-hair-attachment.js';

const out=path.resolve(process.argv[2]??'evidence/native-hair-attachment-runtime-v1');
await fs.mkdir(out);
const directory='assets-source/native-vroid-hair-equipment-v1/generated/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await fs.readFile(directory+'hair.glb'),fitBytes=await fs.readFile(directory+'fit.json');
const manifestBytes=await fs.readFile(directory+'manifest.json'),fit=JSON.parse(fitBytes),manifest=JSON.parse(manifestBytes);
const extraction=JSON.parse(await fs.readFile(directory+'extraction.json'));
assert.equal(sha(bytes),manifest.sha256);assert.equal(sha(fitBytes),manifest.fit.sha256);
const entry={id:manifest.id,label:'CPU source candidate',manifestUrl:'/native-test/manifest.json',manifestSha256:sha(manifestBytes),
  assetSha256:manifest.sha256,sourceBodySha256:manifest.sourceBodySha256,sourceMaterials:manifest.sourceMaterials,
  compatibleBodies:manifest.compatibleBodies,fit:manifest.fit};
const buffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const originalParse=GLTFLoader.prototype.parseAsync,originalFetch=globalThis.fetch;
let ownedTextures=0,disposedTextures=0,gate=null;
GLTFLoader.prototype.parseAsync=function(...args) {
  this.register(()=>({name:'NativeCpuTexturePlaceholder',loadTexture:async()=>{
    const texture=new THREE.Texture({width:2048,height:2048});texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
    ownedTextures++;texture.addEventListener('dispose',()=>disposedTextures++);return texture;
  }}));
  return originalParse.apply(this,args);
};
globalThis.fetch=async input=>{
  const url=String(input);
  if(gate&&url===manifest.url){const g=gate;gate=null;g.enter();await g.promise;}
  const resource=url===entry.manifestUrl?manifestBytes:url===entry.fit.url?fitBytes:url===manifest.url?bytes:null;
  return new Response(resource,{status:resource?200:404});
};
const appearances=[],attachments=[],checks=[];
async function avatar(file) {
  const source=await fs.readFile(file),loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
  const result=await loader.parseAsync(buffer(source),'');
  const vrm=result.userData.vrm;assert(vrm);vrm.update(0);return vrm;
}
function hairMeshes(scene) {
  const meshes=[];scene.traverse(n=>{
    const m=n.material;
    if(n.isSkinnedMesh&&m&&!Array.isArray(m)&&!m.isOutline&&m.name.includes('_HAIR'))meshes.push(n);
  });return meshes;
}
function bodyPose(vrm,step) {
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.05*Math.sin(step/9),.18*Math.sin(step/17),0)).toArray();
  vrm.humanoid.setNormalizedPose({head:{rotation},chest:{rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(.04,0,.05*Math.sin(step/11))).toArray()}});
}
function compareHair(a,b) {
  const left=hairMeshes(a),right=hairMeshes(b);assert.equal(left.length,right.length);
  let max=0;
  for(const m of left) {
    const other=right.find(n=>n.material.name===m.material.name);assert(other);
    const sourceIds=extraction.meshes.find(row=>fit.meshes[row.outputMesh].materialName===m.material.name).sourceVertexIds;
    assert.equal(m.geometry.attributes.position.count,sourceIds.length);
    const indices=m.geometry.index.array;
    for(const index of new Set(indices)) {
      const x=m.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(m.matrixWorld);
      const y=other.getVertexPosition(sourceIds[index],new THREE.Vector3()).applyMatrix4(other.matrixWorld);
      max=Math.max(max,x.distanceTo(y));
    }
  }return max;
}
try {
  const target=await avatar('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm');
  const full=await avatar('assets-source/native-vroid-hairset-study-v1/generated/male-hairset001.vrm');
  assert.equal(sha(await fs.readFile('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm')),fit.targetBodySha256);
  assert.equal(sha(await fs.readFile('assets-source/native-vroid-hairset-study-v1/generated/male-hairset001.vrm')),fit.sourceBodySha256);
  validateNativeHairFit(fit,entry,fit.targetBodySha256,manifest);
  const attachment=await loadNativeHairAttachment({vrm:target,bytes:buffer(bytes),url:manifest.url,fit,sha256:entry.assetSha256,hairFit:{kind:'explicit-fit-v1',id:fit.id,version:fit.version,sha256:sha(fitBytes)}});
  attachments.push(attachment);
  assert.equal(attachment.scene.parent,null);assert.equal(attachment.scene.visible,false);
  attachment.attach();attachment.scene.visible=true;attachment.dynamics.reset();
  target.scene.updateMatrixWorld(true);full.scene.updateMatrixWorld(true);
  // Source cap remains visible here only to inspect the owned subscene directly.
  const restMaximumM=compareHair(attachment.scene,full.scene);assert(restMaximumM<1e-6);
  let dynamicMaximumM=0;const dynamics=[];
  for(let i=0;i<36;i++) {
    bodyPose(target,i);bodyPose(full,i);
    target.update(1/60);full.update(1/60);attachment.dynamics.update(1/60,true);
    target.scene.updateMatrixWorld(true);full.scene.updateMatrixWorld(true);
    const error=compareHair(attachment.scene,full.scene);
    const frames=fit.externalFrames.map(frame=>{
      const a=attachment.scene.getObjectByName(frame.name),b=full.scene.getObjectByName(frame.name);
      const t=target.scene.getObjectByName(frame.targetRawNode);return {name:frame.name,error:Math.max(...a.matrixWorld.elements.map((v,k)=>Math.abs(v-b.matrixWorld.elements[k]))),proxyToTarget:Math.max(...a.matrixWorld.elements.map((v,k)=>Math.abs(v-t.matrixWorld.elements[k]))),targetToFull:Math.max(...t.matrixWorld.elements.map((v,k)=>Math.abs(v-b.matrixWorld.elements[k])))};
    });
    dynamics.push({step:i,error,frames,frameMaximum:Math.max(...frames.map(f=>f.error))});
    dynamicMaximumM=Math.max(dynamicMaximumM,error);
  }
  await fs.writeFile(path.join(out,'source-equivalence.json'),JSON.stringify({restMaximumM,dynamicMaximumM,dynamics},null,2)+'\n');
  assert(dynamicMaximumM<1e-6,`actual source equivalence maximum ${dynamicMaximumM}m`);
  checks.push({name:'actual source and independent two-HAIR rest/posed official spring vertices match',restMaximumM,dynamicMaximumM});
  const prior=attachment.dynamics.getState();attachment.dynamics.update(0,true);
  assert.equal(attachment.dynamics.getState().updates,prior.updates);
  attachment.scene.visible=false;attachment.dynamics.update(1/60,true);
  assert.equal(attachment.dynamics.getState().updates,prior.updates);
  attachment.scene.visible=true;attachment.dynamics.reset();attachment.dynamics.update(1/60,false);
  assert.equal(attachment.dynamics.getState().updates,prior.updates);
  checks.push({name:'dt0/hidden/disabled do not integrate; visibility reset uses current proxies'});

  for(const mutation of [f=>f.targetBodySha256='0'.repeat(64),f=>f.sourceMaterials.pop(),f=>f.attachment.parent='head']) {
    const bad=structuredClone(fit);mutation(bad);assert.throws(()=>validateNativeHairFit(bad,entry,fit.targetBodySha256,manifest));
  }
  const wrong=structuredClone(fit);wrong.externalFrames[1].restLocal.position[1]+=.01;
  await assert.rejects(loadNativeHairAttachment({vrm:target,bytes:buffer(bytes),url:manifest.url,fit:wrong}),/静止参考/);
  checks.push({name:'wrong target/material/attachment and actual rest mismatch reject'});

  HAIRSTYLES.push(entry);
  const actor=await avatar('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm');
  const appearance=createCharacterAppearance({vrm:actor,avatarSha256:fit.targetBodySha256,preserveHairInBaseMode:true});appearances.push(appearance);
  bodyPose(actor,8);actor.update(1/60);
  const oldHair=hairMeshes(actor.scene),oldVisibility=oldHair.map(n=>n.visible);
  const prepared=await appearance.prepareUpdate({hairStyle:entry.id});
  assert(prepared.isCurrent,JSON.stringify(prepared));assert(prepared.isCurrent());assert.equal(appearance.getState().hairStyle,'original');
  assert.deepEqual(oldHair.map(n=>n.visible),oldVisibility);
  prepared.commit();prepared.dispose();
  assert.equal(appearance.getState().hairStyle,entry.id);assert(oldHair.every(n=>!n.visible));
  appearance.updateDynamics(1/60,true);
  assert.equal(appearance.getState().hairDynamics.updates,1);
  assert((await appearance.set({hairStyle:'original'})).applied);assert.deepEqual(oldHair.map(n=>n.visible),oldVisibility);
  assert((await appearance.set({hairStyle:entry.id})).applied);
  assert.equal((await appearance.set({hairColor:'brown'})).applied,false);
  appearance.dispose();appearance.dispose();assert.deepEqual(oldHair.map(n=>n.visible),oldVisibility);
  checks.push({name:'actual appearance prepare is hidden, synchronous commit/switch/reset/own material/native original-only paths work while animated'});

  const lateVrm=await avatar('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm');
  const late=createCharacterAppearance({vrm:lateVrm,avatarSha256:fit.targetBodySha256,preserveHairInBaseMode:true});appearances.push(late);
  let enter,release;const started=new Promise(r=>enter=r);gate={enter,promise:new Promise(r=>release=r)};
  const job=late.set({hairStyle:entry.id});await started;late.dispose();release();
  const result=await job;assert.equal(result.applied,false);assert.equal(late.getState().hairStyle,'original');
  assert(hairMeshes(lateVrm.scene).every(n=>n.visible));
  checks.push({name:'dispose during deferred asset request cannot resurrect owned scene or hide original hair'});
  attachment.dispose();attachment.dispose();assert.equal(attachment.scene.parent,null);
  const sources={};for(const name of ['native-hair-attachment.js','character-appearance.js','hair-fit-contract.js'])sources[name]=sha(await fs.readFile('prototype/src/'+name));
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,checks,sources,
    input:{asset:sha(bytes),fit:sha(fitBytes),manifest:sha(manifestBytes)},ownedTextures,disposedTextures,
    limits:'Real GLB/VRM geometry, skin, official spring and MToon. CPU texture placeholders only. Catalog insertion is fixture-local. No GPU visual/performance/contact acceptance.'},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,out}));
} catch(error) {await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({checks,error:error.stack},null,2)+'\n');throw error;}
finally {
  for(const appearance of appearances)appearance.dispose();for(const attachment of attachments)attachment.dispose();
  const index=HAIRSTYLES.indexOf(entry);if(index>=0)HAIRSTYLES.splice(index,1);
  globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;
}
