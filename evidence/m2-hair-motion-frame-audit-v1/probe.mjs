import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from 'file:///F:/gamemake/prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from 'file:///F:/gamemake/prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils,VRMSpringBoneManager} from 'file:///F:/gamemake/prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';

const base='F:/gamemake', out=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const pinnedSource=await fs.readFile(path.join(out,'../../prototype/src/hair-spring.js'));
const runtimeSource=await fs.readFile(path.join(base,'prototype/src/hair-spring.js'));
if(sha(pinnedSource)!==sha(runtimeSource))throw Error('Main runtime source differs from pinned audit source');
const {createHairSpring}=await import(pathToFileURL(path.join(base,'prototype/src/hair-spring.js')));
const fitBytes=await fs.readFile(path.join(base,'prototype/public/assets/m2-long-hair-rootjoin-v2/fit.json'));
const fit=JSON.parse(fitBytes), hairBytes=await fs.readFile(path.join(base,'prototype/public/assets/m2-long-hair-rootjoin-v2/female-ponytail.glb'));
const bodyBytes=await fs.readFile(path.join(base,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
const contactBytes=await fs.readFile(path.join(base,'evidence/m2-long-hair-contacts-8b3-v1/report.json'));
const contact=JSON.parse(contactBytes);
const intervals=contact.measurements.frameIntervals.filter(x=>x.phase==='pants-seat').map(x=>x.ms).sort((a,b)=>a-b);
const dt=intervals[Math.floor(intervals.length/2)]/1000;
const parse=async(bytes,vrm=false)=>{
  const loader=new GLTFLoader();
  if(vrm)loader.register(parser=>new VRMLoaderPlugin(parser));
  loader.register(()=>({name:'CPUTexturePlaceholder',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
};
const loaded=await parse(bodyBytes,true), template=loaded.userData.vrm;
VRMUtils.rotateVRM0(template);template.update(0);template.scene.updateWorldMatrix(true,true);
const rawNames=Object.fromEntries(['head','chest'].map(name=>[name,template.humanoid.getRawBoneNode(name).name]));
const hairTemplate=(await parse(hairBytes)).scene;
const cases=[];
function make(center,preRefresh=true) {
  const world=new THREE.Group(), actorRoot=new THREE.Group(), vrmScene=template.scene.clone(true), hair=hairTemplate.clone(true);
  world.add(actorRoot);actorRoot.add(vrmScene);
  const raw=Object.fromEntries(Object.entries(rawNames).map(([key,name])=>[key,vrmScene.getObjectByName(name)]));
  raw.head.add(hair);hair.position.fromArray(fit.attachment.position);hair.quaternion.fromArray(fit.attachment.quaternion);hair.scale.fromArray(fit.attachment.scale);
  world.updateMatrixWorld(true);
  const capturedJoints=[],original=VRMSpringBoneManager.prototype.addJoint;
  VRMSpringBoneManager.prototype.addJoint=function(joint){
    if(center!=='world')joint.center=center==='actorRoot'?actorRoot:vrmScene;
    capturedJoints.push(joint);return original.call(this,joint);
  };
  let manager;
  try {manager=createHairSpring({scene:hair,vrm:{humanoid:{getRawBoneNode:name=>raw[name]}},config:fit.dynamics});}
  finally {VRMSpringBoneManager.prototype.addJoint=original;}
  manager.reset();
  const restHeadQ=raw.head.quaternion.clone();
  return {world,actorRoot,vrmScene,hair,raw,manager,capturedJoints,restHeadQ,preRefresh};
}
function measure(r,time) {
  r.world.updateMatrixWorld(true);
  const anchor=r.hair.getObjectByName('Pony0').getWorldPosition(new THREE.Vector3());
  const tail=r.hair.getObjectByName('Pony6').getWorldPosition(new THREE.Vector3());
  const relative=tail.clone().sub(anchor), direction=relative.clone().normalize();
  const headInverse=new THREE.Matrix4().copy(r.raw.head.matrixWorld).invert();
  const inHead=tail.clone().applyMatrix4(headInverse).sub(anchor.clone().applyMatrix4(headInverse));
  const segments=fit.dynamics.joints.map(j=>r.hair.getObjectByName(j.bone).getWorldPosition(new THREE.Vector3()).distanceTo(r.hair.getObjectByName(j.child).getWorldPosition(new THREE.Vector3())));
  return {time,rootPosition:r.actorRoot.position.toArray(),tailFromAnchorWorld:relative.toArray(),directionWorld:direction.toArray(),
    directionHead:inHead.normalize().toArray(),chordLength:relative.length(),chainLength:segments.reduce((a,b)=>a+b,0),segmentLengths:segments,
    angleFromWorldDownDeg:Math.acos(THREE.MathUtils.clamp(-direction.y,-1,1))*180/Math.PI,
    rotations:r.manager.getState().localRotations};
}
const sampleTimes=[0,1,2,2.1,3,4,5.9,6.1,6.5,7,8,10];
for(const center of ['world','actorRoot','vrmScene']) {
  for(const motion of ['static','root-translation','head-relative-motion']) {
    const r=make(center),samples=[measure(r,0)];let next=1;
    for(let step=1;step<=Math.ceil(10/dt);step++) {
      const t=step*dt;
      if(motion==='root-translation')r.actorRoot.position.z=1.05*Math.max(0,Math.min(t-2,4));
      if(motion==='head-relative-motion') {
        const pitch=t<2||t>6?0:.25*Math.sin((t-2)*2*Math.PI);
        r.raw.head.quaternion.copy(r.restHeadQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch));
      }
      if(r.preRefresh)r.world.updateMatrixWorld(true);
      r.manager.update(dt);
      if(next<sampleTimes.length&&t>=sampleTimes[next]) {samples.push(measure(r,t));next++;}
    }
    cases.push({center,motion,preRefresh:true,samples});r.manager.dispose();
  }
}
// Same input without an explicit caller matrix pass, relying on public manager ancestor updates.
for(const center of ['world','actorRoot']) {
  const r=make(center,false),samples=[measure(r,0)];let next=1;
  for(let step=1;step<=Math.ceil(10/dt);step++) {
    const t=step*dt;r.actorRoot.position.z=1.05*Math.max(0,Math.min(t-2,4));r.manager.update(dt);
    if(next<sampleTimes.length&&t>=sampleTimes[next]){samples.push(measure(r,t));next++;}
  }
  cases.push({center,motion:'root-translation',preRefresh:false,samples});r.manager.dispose();
}
const summary=cases.map(c=>({center:c.center,motion:c.motion,preRefresh:c.preRefresh,
  samples:c.samples.map(s=>({time:s.time,angle:s.angleFromWorldDownDeg,direction:s.directionWorld,chordLength:s.chordLength,chainLength:s.chainLength}))}));
const find=(center,motion,preRefresh=true)=>cases.find(c=>c.center===center&&c.motion===motion&&c.preRefresh===preRefresh);
const comparisons={};
for(const center of ['world','actorRoot']) {
  const a=find(center,'root-translation'),b=find(center,'root-translation',false);
  comparisons[center+'PreRefreshRotationMaxError']=Math.max(...a.samples.flatMap((s,i)=>s.rotations.flat().map((x,k)=>Math.abs(x-b.samples[i].rotations.flat()[k]))));
  comparisons[center+'PreRefreshDirectionMaxError']=Math.max(...a.samples.flatMap((s,i)=>s.directionWorld.map((x,k)=>Math.abs(x-b.samples[i].directionWorld[k]))));
  comparisons[center+'PreRefreshChainLengthMaxErrorM']=Math.max(...a.samples.map((s,i)=>Math.abs(s.chainLength-b.samples[i].chainLength)));
}
for(const center of ['actorRoot','vrmScene']) {
  const a=find(center,'root-translation'),b=find(center,'static');
  comparisons[center+'TranslationVsStaticRotationMaxError']=Math.max(...a.samples.flatMap((s,i)=>s.rotations.flat().map((x,k)=>Math.abs(x-b.samples[i].rotations.flat()[k]))));
}
// Required affected check. Move/yaw actor against fixed captured world chair.
// Compare with the equivalent actor-local fixture where only chair transforms.
const capture=JSON.parse(await fs.readFile(path.join(base,'evidence/m2-hair-chair-actual-508-v1/report.json'),'utf8')).samples[1];
function roomFixture() {
  const world=new THREE.Group(),actorRoot=new THREE.Group(),vrmScene=new THREE.Group(),hair=hairTemplate.clone(true);
  world.add(actorRoot);actorRoot.add(vrmScene);vrmScene.add(hair);
  actorRoot.matrixAutoUpdate=false;hair.matrixAutoUpdate=false;hair.matrix.fromArray(capture.meshes[0].bones[0].matrixWorld);
  capture.hair.localRotations.forEach((q,i)=>hair.getObjectByName('Pony'+i).quaternion.fromArray(q));
  const proxies=capture.boxes.map(b=>{
    const mesh=new THREE.Object3D();mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(b.matrixWorld);world.add(mesh);
    return {name:b.name,mesh,localBox:new THREE.Box3(new THREE.Vector3(...b.localMin),new THREE.Vector3(...b.localMax)),
      matrixWorld:mesh.matrixWorld,inverseMatrixWorld:new THREE.Matrix4(),projectOut(){}};
  });
  world.updateMatrixWorld(true);proxies.forEach(p=>p.inverseMatrixWorld.copy(p.matrixWorld).invert());
  const original=VRMSpringBoneManager.prototype.addJoint;
  VRMSpringBoneManager.prototype.addJoint=function(j){j.center=vrmScene;return original.call(this,j);};
  let manager;
  try {manager=createHairSpring({scene:hair,vrm:{humanoid:{getRawBoneNode:()=>null}},
    config:{...fit.dynamics,colliders:[]},environmentColliders:proxies});}
  finally {VRMSpringBoneManager.prototype.addJoint=original;}
  manager.reset();return {world,actorRoot,vrmScene,hair,proxies,manager};
}
const actualRoom=roomFixture(),localRoom=roomFixture(),roomChecks=[];
const pivot=new THREE.Vector3().fromArray(capture.meshes[0].bones[0].world);
for(const [label,yaw] of [['translate',0],['translate-and-yaw',.2]]) {
  const transform=new THREE.Matrix4().makeTranslation(pivot.x+.02,pivot.y,pivot.z+.03)
    .multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
  actualRoom.actorRoot.matrix.copy(transform);
  const inverse=new THREE.Matrix4().copy(transform).invert();
  localRoom.proxies.forEach((p,i)=>p.mesh.matrix.multiplyMatrices(inverse,new THREE.Matrix4().fromArray(capture.boxes[i].matrixWorld)));
  for(const r of [actualRoom,localRoom]) {
    r.world.updateMatrixWorld(true);r.proxies.forEach(p=>p.inverseMatrixWorld.copy(p.matrixWorld).invert());
    r.manager.update(dt);r.world.updateMatrixWorld(true);
  }
  const errors=fit.dynamics.joints.flatMap(j=>[j.bone,j.child]).map(name=>
    actualRoom.hair.getObjectByName(name).getWorldPosition(new THREE.Vector3()).distanceTo(
      localRoom.hair.getObjectByName(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(transform)));
  const colliderMatricesMatch=[actualRoom,localRoom].every(r=>r.proxies.every(p=>p.mesh.children.filter(c=>c.shape).every(c=>c.colliderMatrix.equals(p.matrixWorld))));
  roomChecks.push({label,yaw,maxWorldEquivarianceErrorM:Math.max(...errors),colliderMatricesMatch,
    actualDiagnostics:actualRoom.manager.getState().environmentCollisionDiagnostics});
}
actualRoom.manager.dispose();localRoom.manager.dispose();
const report={revision:execFileSync('git',['rev-parse','HEAD'],{cwd:path.join(out,'../..'),encoding:'utf8'}).trim(),
  sourceSha256:sha(pinnedSource),fitSha256:sha(fitBytes),hairSha256:sha(hairBytes),bodySha256:sha(bodyBytes),contactReportSha256:sha(contactBytes),
  dt,dtSource:'actual pants-seat median frame interval, fixed for every paired run',speedMPerS:1.05,config:fit.dynamics,
  rawBoneNames:rawNames,vrmSceneLocalTransform:{position:template.scene.position.toArray(),quaternion:template.scene.quaternion.toArray(),scale:template.scene.scale.toArray()},
  cases,comparisons,roomChecks,limits:['CPU kinematic root/head tests, exact source/GLB/fit/body skeleton. No browser, visual or actual walk animation replay.',
    'Body head/chest collision proxies preserved from actual fit and actual raw rest skeleton. Room colliders omitted to isolate motion integration.',
    'CPU texture placeholders replace bitmap decoding only. Full actual geometry and bone hierarchy loaded.',
    'Center experiment set by temporary official addJoint interception before reset, no source/runtime parameter edits.',
    'Required room-coordinate check uses actual captured pose/seat/back. Body proxies omitted there because raw-body world frames were not captured.']};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({dt,comparisons,cases:summary},null,2)+'\n');
console.log(JSON.stringify({dt,comparisons,roomChecks:roomChecks.map(({actualDiagnostics,...rest})=>({...rest,collisions:actualDiagnostics.reduce((n,d)=>n+d.collisions,0)}))},null,2));
