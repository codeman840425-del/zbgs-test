import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {VRMSpringBoneCollider} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createHairSpring} from '../../prototype/src/hair-spring.js';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..'),checks=[];
const captured=JSON.parse(await fs.readFile(path.join(out,'actual508-samples.json'),'utf8'));
const main=await fs.readFile(path.join(root,'prototype/src/main.js'),'utf8');
const chairCollider=new Function('THREE',main.slice(main.indexOf('function chairCollider('),main.indexOf('chairBounds.push('))+'\nreturn chairCollider;')(THREE);
const finite=v=>v.toArray().every(Number.isFinite);
function box(world,size=new THREE.Vector3(.1,.1,.1),matrix=new THREE.Matrix4()){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size.toArray()),new THREE.MeshBasicMaterial());mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrix);world.add(mesh);world.updateMatrixWorld(true);const proxy=chairCollider(mesh,'test-box');proxy.refresh();return proxy;
}
function rig(pivot,tip,jointCount=1){
 const world=new THREE.Group(),scene=new THREE.Group(),bone=new THREE.Bone(),child=new THREE.Bone();world.add(scene);scene.add(bone);bone.position.copy(pivot);bone.name='joint0';child.name='joint1';child.position.subVectors(tip,pivot);bone.add(child);
 const joints=[{bone:'joint0',child:'joint1',hitRadius:.01,stiffness:0,gravityPower:0,gravityDir:[0,-1,0],dragForce:.4}];
 if(jointCount===2){const end=new THREE.Bone();end.name='joint2';end.position.set(0,-.1,0);child.add(end);joints.push({...joints[0],bone:'joint1',child:'joint2'});}
 world.updateMatrixWorld(true);return{world,scene,bone,child,config:{schema:'hair-spring-v1',joints,colliders:[]},vrm:{humanoid:{getRawBoneNode:()=>null}}};
}
function nodes(p){return p.mesh.children.filter(n=>n instanceof VRMSpringBoneCollider);}
function margin(p,r){const e=p.inverseMatrixWorld.elements;return r*Math.max(Math.hypot(e[0],e[4],e[8]),Math.hypot(e[1],e[5],e[9]),Math.hypot(e[2],e[6],e[10]));}
function interiorSegment(p,pivot,tip,r,tolerance=1e-10){
 const a=pivot.clone().applyMatrix4(p.inverseMatrixWorld),b=tip.clone().applyMatrix4(p.inverseMatrixWorld),m=margin(p,r);let enter=0,exit=1;
 for(let axis=0;axis<3;axis++){
  const lo=p.localBox.min.getComponent(axis)-m+tolerance,hi=p.localBox.max.getComponent(axis)+m-tolerance,x=a.getComponent(axis),d=b.getComponent(axis)-x;
  if(d===0){if(x<=lo||x>=hi)return false;}else{const t0=(lo-x)/d,t1=(hi-x)/d;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));if(enter>=exit)return false;}
 }
 return enter<exit;
}
function solve(shape,pivot,tip,r){
 const direction=new THREE.Vector3(),distance=shape.calculateCollision(null,tip,r,direction),corrected=tip.clone();
 if(distance<0)corrected.addScaledVector(direction,-distance);
 const normalized=corrected.clone().sub(pivot).normalize().multiplyScalar(pivot.distanceTo(tip)).add(pivot);
 return{distance,direction,corrected,normalized};
}
function test(name,run){checks.push({name,passed:true,...run()});}
let failure=null;
try{
 test('actual captured outside endpoints and intersecting middle correct on fixed length sphere',()=>{
  const s=captured.samples[1],bones=s.meshes[0].bones,pivot=new THREE.Vector3(...bones.find(b=>b.name==='Pony5').world),tip=new THREE.Vector3(...bones.find(b=>b.name==='Pony6').world),r=rig(pivot,tip),b=s.boxes.find(b=>b.name==='chairBack');
  const p=box(r.world,new THREE.Vector3(...b.localMax.map((v,i)=>v-b.localMin[i])),new THREE.Matrix4().fromArray(b.matrixWorld));r.config.joints[0].hitRadius=.0065;
  const m=createHairSpring({...r,environmentColliders:[p]});m.reset();assert(interiorSegment(p,pivot,tip,.0065));const result=solve(nodes(p)[0].shape,pivot,tip,.0065);
  assert(result.distance<0);assert(Math.abs(result.normalized.distanceTo(pivot)-tip.distanceTo(pivot))<1e-12);assert(result.corrected.distanceTo(result.normalized)<1e-12);assert(!interiorSegment(p,pivot,result.normalized,.0065));
  m.update(1/120);r.world.updateMatrixWorld(true);assert(r.child.getWorldPosition(new THREE.Vector3()).distanceTo(result.normalized)<1e-12);m.dispose();
  return{correctionM:-result.distance,boneLengthM:tip.distanceTo(pivot),postNormalizationShiftM:result.corrected.distanceTo(result.normalized)};
 });
 test('inside endpoint and parallel-normal degeneracy choose a finite sphere-plane circle point',()=>{
  const pivot=new THREE.Vector3(0,.2,0),tip=new THREE.Vector3(),r=rig(pivot,tip),p=box(r.world),m=createHairSpring({...r,environmentColliders:[p]});
  const result=solve(nodes(p)[0].shape,pivot,tip,.01);assert(result.distance<0&&finite(result.normalized));assert(!interiorSegment(p,pivot,result.normalized,.01));assert(Math.abs(result.normalized.distanceTo(pivot)-.2)<1e-12);m.dispose();
 });
 test('rotated nonuniformly scaled and moved OBB keeps sphere length and current dependency transform',()=>{
  const transform=new THREE.Matrix4().compose(new THREE.Vector3(.4,.8,-.3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.7,.2)),new THREE.Vector3(1.7,.6,1.2));
  const pivot=new THREE.Vector3(0,.2,0).applyMatrix4(transform),tip=new THREE.Vector3().applyMatrix4(transform),r=rig(pivot,tip),p=box(r.world,undefined,transform),m=createHairSpring({...r,environmentColliders:[p]});m.reset();const node=nodes(p)[0],state=m.getState();
  let solved=solve(node.shape,pivot,tip,.01);assert(solved.distance<0);assert(!interiorSegment(p,pivot,solved.normalized,.01));assert(Math.abs(pivot.distanceTo(solved.normalized)-pivot.distanceTo(tip))<1e-12);
  p.mesh.matrix.setPosition(.42,.8,-.3);p.mesh.updateWorldMatrix(true,false);console.log(JSON.stringify({world:p.mesh.matrixWorld.elements,inverse:p.inverseMatrixWorld.elements,matrix:p.mesh.matrix.elements,auto:p.mesh.matrixWorldAutoUpdate}));assert.throws(()=>solve(node.shape,pivot,tip,.01),/逆矩阵/);p.refresh();
  solved=solve(node.shape,pivot,tip,.01);assert(!interiorSegment(p,pivot,solved.normalized,.01));for(let i=0;i<50;i++)m.setEnvironmentColliders([p]);assert.equal(nodes(p)[0],node);assert.equal(m.getState().updates,state.updates);assert.equal(m.getState().resets,state.resets);
  m.update(1/120);assert(node.colliderMatrix.equals(p.mesh.matrixWorld));m.dispose();assert.equal(nodes(p).length,0);
 });
 test('sphere entirely inside expanded box reports infeasibility and returns finite no correction',()=>{
  const pivot=new THREE.Vector3(),tip=new THREE.Vector3(0,.1,0),r=rig(pivot,tip),p=box(r.world,new THREE.Vector3(1,1,1)),m=createHairSpring({...r,environmentColliders:[p]});
  const result=solve(nodes(p)[0].shape,pivot,tip,.01);assert.equal(result.distance,0);assert(finite(result.normalized));assert.equal(nodes(p)[0].shape.lastOutcome,'no-fixed-length-endpoint');
  m.reset();m.update(1/120);assert(m.getState().localRotations.flat().every(Number.isFinite));assert(m.getState().environmentCollisionDiagnostics[0].unresolvedCollisions>0);m.dispose();
 });
 test('inside pivot with already outside endpoint preserves it and reports unresolved segment',()=>{
  const pivot=new THREE.Vector3(),tip=new THREE.Vector3(.7,0,0),r=rig(pivot,tip),p=box(r.world,new THREE.Vector3(1,1,1)),m=createHairSpring({...r,environmentColliders:[p]});
  const result=solve(nodes(p)[0].shape,pivot,tip,.01);assert.equal(result.distance,0);assert(result.corrected.equals(tip));assert.equal(nodes(p)[0].shape.lastOutcome,'pivot-inside-expanded-box');m.dispose();
 });
 test('logical proxy counts remain separate from per-joint physical ownership through replace clear dispose',()=>{
  const r=rig(new THREE.Vector3(0,.2,0),new THREE.Vector3(),2),a=box(r.world),b=box(r.world),m=createHairSpring({...r,environmentColliders:[a]});
  assert.equal(m.getState().environmentColliderCount,1);assert.equal(m.getState().environmentColliderObjectCount,2);assert.equal(nodes(a).length,2);
  for(let i=0;i<20;i++)m.setEnvironmentColliders(i%2?[a,b]:[b]);assert.equal(nodes(a).length+nodes(b).length,4);m.setEnvironmentColliders([]);assert.equal(nodes(a).length+nodes(b).length,0);m.dispose();
 });
 test('partial second-joint attachment failure rolls back all new physical colliders',()=>{
  const r=rig(new THREE.Vector3(0,.2,0),new THREE.Vector3(),2),a=box(r.world),b=box(r.world),m=createHairSpring({...r,environmentColliders:[a]});let calls=0;
  const fail=()=>{if(++calls===2)throw Error('fixture second joint attachment');};b.mesh.addEventListener('childadded',fail);assert.throws(()=>m.setEnvironmentColliders([b]),/fixture/);b.mesh.removeEventListener('childadded',fail);
  assert.equal(nodes(a).length,2);assert.equal(nodes(b).length,0);assert.equal(m.getState().environmentColliderCount,1);m.dispose();assert.equal(nodes(a).length,0);
 });
 test('invalid sample radius pivot and transforms reject explicitly',()=>{
  const r=rig(new THREE.Vector3(0,.2,0),new THREE.Vector3()),p=box(r.world),m=createHairSpring({...r,environmentColliders:[p]}),shape=nodes(p)[0].shape;
  assert.throws(()=>solve(shape,new THREE.Vector3(0,.2,0),new THREE.Vector3(NaN,0,0),.01));assert.throws(()=>solve(shape,new THREE.Vector3(0,.2,0),new THREE.Vector3(),NaN));
  r.bone.matrixWorld.elements[12]=NaN;assert.throws(()=>solve(shape,new THREE.Vector3(0,.2,0),new THREE.Vector3(),.01));m.dispose();
 });
}catch(e){failure={message:e.message,stack:e.stack};}
const report={sourceSha256:createHash('sha256').update(await fs.readFile(path.join(root,'prototype/src/hair-spring.js'))).digest('hex'),checks,failure,limits:['Real official manager/joints with CPU fixtures. Segment clearance comparisons allow1e-10 local floating tolerance.','A common outer face is a conservative separating constraint. It can redirect the strand more than a tangent corner solution.','Contained fixed-length spheres and inside pivots expose unresolved diagnostics. No body/triangle/continuous collision or browser acceptance.']};
await fs.writeFile(path.join(out,'constraint-report-v3-debug.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(failure)process.exitCode=1;
