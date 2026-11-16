import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {VRMSpringBoneManager,VRMSpringBoneJoint} from '../../prototype/node_modules/@pixiv/three-vrm-springbone/lib/three-vrm-springbone.module.js';
const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../..');
const checks=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
function check(name,passed,data={}){checks.push({name,passed,...data});}
function rig(center='head',gravityPower=0,headRotation=0){
 const avatar=new THREE.Object3D(),chest=new THREE.Bone(),head=new THREE.Bone(),mount=new THREE.Object3D(),bone=new THREE.Bone(),child=new THREE.Bone();
 avatar.name='Avatar';chest.name='Chest';head.name='RawHead';mount.name='HairAttachment';bone.name='Hair0';child.name='Hair1';
 avatar.add(chest);chest.add(head);head.add(mount);mount.add(bone);bone.add(child);
 head.position.y=1.5;head.rotation.z=headRotation;bone.position.x=.2;child.position.y=-1;
 avatar.updateMatrixWorld(true);
 const joint=new VRMSpringBoneJoint(bone,child,{stiffness:0,gravityPower,gravityDir:new THREE.Vector3(0,-1,0),dragForce:.6});
 joint.center=center==='head'?head:avatar;
 const manager=new VRMSpringBoneManager();manager.addJoint(joint);manager.setInitState();manager.reset();
 return{avatar,chest,head,mount,bone,child,joint,manager};
}
function localTip(r){return r.head.worldToLocal(r.child.getWorldPosition(new THREE.Vector3()));}
function parentChain(o){const names=[];while(o){names.push(o.name);o=o.parent;}return names;}
const raw=rig(),historical=rig('avatar');
const rawStart=localTip(raw),historicalStart=localTip(historical);
for(const r of [raw,historical]){r.head.position.add(new THREE.Vector3(.3,-.25,.1));r.head.rotation.x=.6;r.manager.update(1/60);}
const rawError=localTip(raw).distanceTo(rawStart),historicalChange=localTip(historical).distanceTo(historicalStart);
check('official head center carries history through head translation and rotation',rawError<1e-12&&historicalChange>.1,{rawHeadLocalDisplacementM:rawError,avatarSceneLocalDisplacementM:historicalChange});
const expectedHead=new THREE.Matrix4().compose(raw.head.position,raw.head.quaternion,raw.head.scale);
const matrixError=Math.max(...raw.head.matrixWorld.elements.map((v,i)=>Math.abs(v-expectedHead.elements[i])));
check('official manager refreshes stale raw-head world matrix through actual parent ancestry',matrixError<1e-12,{matrixError,chain:parentChain(raw.bone),centerExplicitlyInDependencies:raw.joint.dependencies.has(raw.head)});
const falling=rig('head',1,Math.PI/2),fallStart=falling.child.getWorldPosition(new THREE.Vector3());
falling.manager.update(1/60);const fallEnd=falling.child.getWorldPosition(new THREE.Vector3());
check('gravity stays world-down under a rotated head center',fallEnd.y<fallStart.y-.01,{worldDisplacement:fallEnd.sub(fallStart).toArray()});
const shared=rig(),otherMount=new THREE.Object3D(),otherBone=new THREE.Bone(),otherChild=new THREE.Bone();
shared.head.add(otherMount);otherMount.add(otherBone);otherBone.add(otherChild);otherChild.position.y=-1;shared.avatar.updateMatrixWorld(true);
const otherJoint=new VRMSpringBoneJoint(otherBone,otherChild,{stiffness:0,gravityPower:0,dragForce:.6});otherJoint.center=shared.head;
const otherManager=new VRMSpringBoneManager();otherManager.addJoint(otherJoint);otherManager.setInitState();otherManager.reset();
const sharedCache=shared.head.userData.inverseCacheProxy;
shared.manager.deleteJoint(shared.joint);shared.head.rotation.x=.2;otherManager.update(1/60);
const sharedError=shared.head.worldToLocal(otherChild.getWorldPosition(new THREE.Vector3())).distanceTo(new THREE.Vector3(0,-1,0));
check('removing one manager joint leaves another manager using the same head center functional',sharedError<1e-12&&shared.head.userData.inverseCacheProxy===sharedCache,{headLocalErrorM:sharedError,inverseProxyRetainedAfterDelete:true});
const isolated=rig();
check('separate actor heads own separate inverse caches',isolated.head.userData.inverseCacheProxy!==sharedCache);
const beforeLocal={position:isolated.head.position.toArray(),quaternion:isolated.head.quaternion.toArray(),scale:isolated.head.scale.toArray()};
isolated.manager.update(1/60);isolated.manager.deleteJoint(isolated.joint);
const afterLocal={position:isolated.head.position.toArray(),quaternion:isolated.head.quaternion.toArray(),scale:isolated.head.scale.toArray()};
check('official center does not change raw-head local TRS but retains inverse-cache instrumentation',JSON.stringify(beforeLocal)===JSON.stringify(afterLocal)&&Boolean(isolated.head.userData.inverseCacheProxy),{cacheRemains:true});
const files=['prototype/node_modules/@pixiv/three-vrm-springbone/lib/three-vrm-springbone.module.js','prototype/node_modules/@pixiv/three-vrm-springbone/package.json','prototype/src/hair-spring.js','prototype/src/hair-fit-contract.js','prototype/src/character-appearance.js','prototype/src/foundation-avatar.js','prototype/src/hairstyle-catalog.js','prototype/public/assets/m2-long-hair-rootjoin-v2/fit.json','prototype/public/assets/m2-long-hair-rootjoin-v2/manifest.json','prototype/public/assets/m2-long-hair-rootjoin-v2/female-ponytail.glb','evidence/m2-hair-seat-feasibility-v2/result.json'];
const sourceSha256=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(path.join(root,f)))])));
const report={scope:'installed official solver semantics only',checks,sourceSha256,limits:['Object3D/Bone fixtures use the installed official manager and joint. They do not replay actual captured avatar motion or establish visible naturalness.','No original avatar animation, hair mesh, chair collision or browser is exercised in these semantics checks. Candidate identity and loading are reviewed separately.','Center setter instruments its matrixWorld.elements through a shared inverseCacheProxy. deleteJoint does not release that instrumentation. No per-joint center=null cleanup is attempted because it would remove a shared cache still used by another joint.']};
await fs.writeFile(path.join(out,'solver-semantics.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:checks.length,failed:checks.filter(x=>!x.passed)},null,2));
assert(checks.every(c=>c.passed));
