// Offline actual VRM + actual production retargeter. No renderer/server/browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {loadRetargetedMotions} from '../../../prototype/src/motion-source.js';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const root=path.join(repo,'prototype/public');
globalThis.ProgressEvent=class {constructor(type,data){this.type=type;Object.assign(this,data);}};
globalThis.fetch=async input=>{const u=new URL(typeof input==='string'?input:input.url,'http://offline');const bytes=await fs.readFile(path.join(root,u.pathname));return new Response(bytes,{status:200,headers:{'Content-Length':String(bytes.length)}});};
THREE.DefaultLoadingManager.setURLModifier(url=>new URL(url,'http://offline').href);
const loader=new GLTFLoader();loader.register(()=>({name:'QA_MATERIALS_ONLY',loadMaterial:async()=>new THREE.MeshBasicMaterial()}));loader.register(p=>new VRMLoaderPlugin(p));
const data=await fs.readFile(path.join(root,'assets/foundation/base-female-roundtrip.vrm'));
const gltf=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'http://offline/assets/foundation/');const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
const motions=await loadRetargetedMotions(vrm),mixer=new THREE.AnimationMixer(vrm.scene),actions={};for(const name of ['idle','sitEnter','sitIdle','sitExit']){actions[name]=mixer.clipAction(motions.clips[name]);actions[name].play();}
const records=[],V=THREE.Vector3;let last=null;
for(let frame=1;frame<=270;frame++){
 let name,time;
 if(frame<=60){name='idle';time=(1+frame/30)%motions.clips.idle.duration;}
 else if(frame<=180){time=(frame-60)/30;name=time<motions.clips.sitEnter.duration?'sitEnter':'sitIdle';if(name==='sitIdle')time=(time-motions.clips.sitEnter.duration)%motions.clips.sitIdle.duration;}
 else{name='sitExit';time=Math.min((frame-180)/30,motions.clips.sitExit.duration-1e-5);}
 for(const a of Object.values(actions))a.setEffectiveWeight(0);actions[name].time=time;actions[name].setEffectiveWeight(1);mixer.update(0);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
 const hip=vrm.humanoid.getNormalizedBoneNode('hips'),inv=hip.matrixWorld.clone().invert(),rawInv=vrm.humanoid.getRawBoneNode('hips').matrixWorld.clone().invert(),pose={},rawHipLocal={};
 for(const side of ['left','right'])for(const part of ['UpperArm','LowerArm','Hand']){const point=vrm.humanoid.getNormalizedBoneNode(side+part).getWorldPosition(new V());pose[side+part]=point.clone().applyMatrix4(inv).toArray();rawHipLocal[side+part]=point.clone().applyMatrix4(rawInv).toArray();}
 records.push({frame,name,time,hipLocal:pose,rawHipLocal,steps:last?Object.fromEntries(Object.keys(pose).map(k=>[k,new V(...pose[k]).distanceTo(new V(...last[k]))])):null});last=pose;
}
await fs.writeFile(path.join(repo,'assets-source/forearm-collision-v2/evidence/source-arm-track.generated.json'),JSON.stringify({method:'Production retargeted clip sampled on actual normalized VRM humanoid, relative to hips; no fitSeatHands or pelvis/foot correction',records},null,2));console.log(JSON.stringify(records.filter(r=>r.frame>=75&&r.frame<=83).map(r=>({frame:r.frame,clip:r.name,time:r.time,steps:r.steps})),null,2));
