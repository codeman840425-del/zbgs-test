import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {VRMSpringBoneCollider} from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createHairSpring,validateHairEnvironmentColliders} from '../prototype/src/hair-spring.js';

const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const out=path.resolve(process.argv[2]||'evidence/m2-hair-environment-cpu-v1');
await fs.mkdir(out,{recursive:false});
await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-script.mjs'));
const sources=['prototype/src/hair-spring.js','prototype/src/character-appearance.js','prototype/src/foundation-avatar.js','prototype/src/main.js','prototype/package-lock.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(root,n))).digest('hex')])));
const sourceSha256=await hashes(),checks=[];
const main=await fs.readFile(path.join(root,'prototype/src/main.js'),'utf8');
const snippet=main.slice(main.indexOf('function chairCollider('),main.indexOf('chairBounds.push('));
const chairCollider=new Function('THREE',snippet+'\nreturn chairCollider;')(THREE);
const config={schema:'hair-spring-v1',joints:[{bone:'tail',child:'tip',hitRadius:.01,stiffness:0,gravityPower:0,gravityDir:[0,-1,0],dragForce:.4}],colliders:[{bone:'head',shape:'sphere',offset:[0,.4,0],radius:.03}]};
function rig(){
  const root=new THREE.Group(),head=new THREE.Bone(),scene=new THREE.Group(),tail=new THREE.Bone(),tip=new THREE.Bone();
  tail.name='tail';tip.name='tip';tip.position.y=-.2;tail.add(tip);scene.add(tail);head.add(scene);root.add(head);root.updateMatrixWorld(true);
  return{root,head,scene,tail,tip,vrm:{humanoid:{getRawBoneNode:n=>n==='head'?head:null}}};
}
function room(parent){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.06),new THREE.MeshBasicMaterial());
  mesh.position.set(0,-.2,.025);parent.add(mesh);mesh.updateWorldMatrix(true,false);
  const proxy=chairCollider(mesh,'actual-chair-proxy-fixture');proxy.refresh();return proxy;
}
function envNodes(proxy){return proxy.mesh.children.filter(n=>n instanceof VRMSpringBoneCollider);}
function refresh(proxy){proxy.mesh.updateWorldMatrix(true,false);proxy.refresh();}
function test(name,run){const details=run();checks.push({name,passed:true,...details});}
const fsSyncFoundation=await fs.readFile(path.join(root,'prototype/src/foundation-avatar.js'),'utf8');
let fatal=null;
try{
 const a=rig(),p=room(a.root),q=room(a.root),manager=createHairSpring({...a,config,environmentColliders:[p]});manager.reset();
 const shape=envNodes(p)[0].shape,target=new THREE.Vector3(),point=new THREE.Vector3(0,-.2,0),originalPoint=point.clone();
 test('real official collider adapts actual main chairCollider projection',()=>{
   const d=shape.calculateCollision(null,point,.01,target);
   assert(Math.abs(d+.015)<1e-10);assert(target.distanceTo(new THREE.Vector3(0,0,-1))<1e-10);assert(point.equals(originalPoint));
   const noHit=shape.calculateCollision(null,new THREE.Vector3(2,2,2),.01,target);assert.equal(noHit,0);assert.equal(target.length(),0);
   assert.equal(shape.calculateCollision(null,new THREE.Vector3(0,-.2,-.015),.01,target),0);
   return{distanceM:d};
 });
 test('official solver responds finitely and preserves fixed bone length',()=>{
   const before=a.tip.getWorldPosition(new THREE.Vector3());manager.update(1/120);a.root.updateMatrixWorld(true);
   const after=a.tip.getWorldPosition(new THREE.Vector3());assert(after.z<-.014);assert(Math.abs(after.distanceTo(a.tail.getWorldPosition(new THREE.Vector3()))-.2)<1e-10);
   assert(manager.getState().localRotations.flat().every(Number.isFinite));
   return{before:before.toArray(),after:after.toArray(),residualPointDepthM:Math.max(0,after.z+.015)};
 });
 test('moving rotated scaled box reuses same collider and current owner matrices',()=>{
   const node=envNodes(p)[0],state=manager.getState();
   p.mesh.position.set(.3,-.1,.2);p.mesh.rotation.set(.1,.7,.2);p.mesh.scale.set(2,.5,1.5);refresh(p);
   const local=new THREE.Vector3(0,0,-.025),world=local.clone().applyMatrix4(p.matrixWorld);
   const d=shape.calculateCollision(null,world,.01,target);assert(d<0);assert(Math.abs(target.length()-1)<1e-10);
   const corrected=world.clone().addScaledVector(target,-d).applyMatrix4(p.inverseMatrixWorld);
   // min local scale .5 produces conservative local margin .02 on every face.
   assert(Math.abs(corrected.z-(-.03-.02))<1e-8);
   for(let i=0;i<20;i++)manager.setEnvironmentColliders([p]);
   assert.equal(envNodes(p)[0],node);assert.equal(manager.getState().updates,state.updates);assert.equal(manager.getState().resets,state.resets);
   manager.update(1/120);assert(manager.getState().localRotations.flat().every(Number.isFinite));
   return{worldCorrectionM:-d,conservativeLocalMarginM:.02};
 });
 test('invalid proxies stale inverses and invalid samples reject explicitly',()=>{
   for(const bad of [null,{},[p,p],[{...p,projectOut:null}],[{...p,localBox:new THREE.Box3()}]])assert.throws(()=>validateHairEnvironmentColliders(bad));
   p.mesh.position.x+=.1;p.mesh.updateWorldMatrix(true,false);assert.throws(()=>shape.calculateCollision(null,point,.01,target),/逆矩阵/);refresh(p);
   assert.throws(()=>shape.calculateCollision(null,new THREE.Vector3(NaN,0,0),.01,target));
   assert.throws(()=>shape.calculateCollision(null,point,-1,target));
   p.mesh.scale.x=0;refresh(p);assert.throws(()=>shape.calculateCollision(null,point,.01,target));p.mesh.scale.x=2;refresh(p);
   const prev=manager.getState();assert.throws(()=>manager.setEnvironmentColliders([p,p]));assert.equal(manager.getState().environmentColliderCount,prev.environmentColliderCount);
 });
 test('replace clear in-place list change and dispose preserve body proxies',()=>{
   const state=manager.getState(),list=[q];manager.setEnvironmentColliders(list);assert.equal(envNodes(p).length,0);assert.equal(envNodes(q).length,1);
   list[0]=p;manager.setEnvironmentColliders(list);assert.equal(envNodes(q).length,0);assert.equal(envNodes(p).length,1);
   for(let i=0;i<20;i++)manager.setEnvironmentColliders(i%2?[p]:[q]);
   assert.equal(envNodes(p).length+envNodes(q).length,1);manager.setEnvironmentColliders([]);
   assert.equal(envNodes(p).length+envNodes(q).length,0);assert.equal(manager.getState().bodyColliderCount,1);assert.equal(manager.getState().colliderCount,1);
   assert.equal(manager.getState().updates,state.updates);assert.equal(manager.getState().resets,state.resets);
   manager.dispose();manager.dispose();assert.equal(a.head.children.filter(n=>n instanceof VRMSpringBoneCollider).length,0);
 });
 test('attachment failure retains previous environment and removes partial new proxies',()=>{
   const b=rig(),one=room(b.root),two=room(b.root),three=room(b.root),m=createHairSpring({...b,config,environmentColliders:[one]});
   const throwAdd=()=>{throw Error('fixture childadded failure');};three.mesh.addEventListener('childadded',throwAdd);
   assert.throws(()=>m.setEnvironmentColliders([two,three]),/fixture/);three.mesh.removeEventListener('childadded',throwAdd);
   assert.equal(envNodes(one).length,1);assert.equal(envNodes(two).length+envNodes(three).length,0);assert.equal(m.getState().environmentColliderCount,1);m.dispose();assert.equal(envNodes(one).length,0);
 });
 test('reentrant disposal during environment attachment leaves no owned colliders',()=>{
   const b=rig(),p=room(b.root),m=createHairSpring({...b,config});m.reset();
   const dispose=()=>m.dispose();p.mesh.addEventListener('childadded',dispose);m.setEnvironmentColliders([p]);p.mesh.removeEventListener('childadded',dispose);
   assert.equal(envNodes(p).length,0);assert.equal(b.head.children.filter(n=>n instanceof VRMSpringBoneCollider).length,0);assert.equal(m.getState().environmentColliderCount,0);
 });
 test('foundation passes room colliders before garment precomputed early return',()=>{
   const text=fsSyncFoundation;assert(text.indexOf('appearance.setEnvironmentColliders(lastGarmentColliders);')<text.indexOf('if (garmentPreparedForHands)',text.indexOf('updateGarment:')));
 });
}catch(error){fatal={message:error.message,stack:error.stack};}
const finalSha256=await hashes();
const report={status:fatal?'failed':'passed',sourceSha256,finalSha256,checks,fatal,scope:'Real Three187 and official three-vrm3.5.5 solver with short bone fixture and actual extracted main chairCollider function. Conservative expanded oriented-box point-sphere proxy. No triangle or continuous collision guarantee, actual long-hair/browser/GPU or performance acceptance.'};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(fatal)process.exitCode=1;
