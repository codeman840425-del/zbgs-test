import assert from 'node:assert/strict';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { solveLimb, createMotion, kneeBendDirection } from '../prototype/src/motion.js';
const { Vector3: V, Group, Bone } = THREE;

// Retargeted ankle movement must not turn the upper-leg slope into a new
// sideways knee pole. Extract the original bend plane before applying IK.
const pole = kneeBendDirection(new V(.1,1,0),new V(.2,.55,.1),new V(.3,.1,0),new V(0,0,1));
assert.ok(pole.distanceTo(new V(0,0,1))<1e-8);
assert.deepEqual(kneeBendDirection(new V(0,1,0),new V(0,.5,0),new V(),new V(0,0,1)).toArray(),[0,0,1]);

// Independent geometric constraints, including unreachable and pole-collinear targets.
for (const target of [new V(.2,-.6,.1), new V(0,-.8,0), new V(0,-3,0), new V(0,0,0)]) {
  const result = solveLimb(new V(), target, .4, .4, new V(0,0,1));
  assert.ok(Math.abs(result.knee.length()-.4)<1e-8);
  assert.ok(Math.abs(result.target.distanceTo(result.knee)-.4)<1e-8);
  assert.ok(result.knee.toArray().every(Number.isFinite));
}

function fixture() {
  const root = new Group(), scene = new Group(), bones = {};
  root.add(scene);
  const add = (name, parent, x,y,z) => { const b = new Bone(); b.name=name; b.position.set(x,y,z); parent.add(b); bones[name]=b; return b; };
  const hips=add('hips',scene,0,1,0), spine=add('spine',hips,0,.2,0), chest=add('chest',spine,0,.15,0);
  add('head',chest,0,.25,0);
  for (const [side,sign] of [['left',1],['right',-1]]) {
    const leg=add(side+'UpperLeg',hips,sign*.1,0,0), shin=add(side+'LowerLeg',leg,0,-.4,0);
    add(side+'Foot',shin,0,-.4,0);
    const arm=add(side+'UpperArm',chest,sign*.2,.1,0), elbow=add(side+'LowerArm',arm,sign*.25,0,0);
    add(side+'Hand',elbow,sign*.22,0,0);
  }
  return {root,scene,bones,vrm:{scene,humanoid:{getNormalizedBoneNode:name=>bones[name]}}};
}
const results=[];
for (const speed of [.35,.75,1.2]) {
  const f=fixture(), motion=createMotion(f.vrm,f.root); let maxSlip=0, maxTravel=0, contacts=0, clamps=0;
  for (let i=0;i<600;i++) {
    const dt=1/60, actualSpeed=speed*Math.min(1,i/30);
    f.root.position.z+=actualSpeed*dt;
    motion.update(dt,{distanceDelta:actualSpeed*dt,speed:actualSpeed,moving:actualSpeed>0,action:'walk'});
    for (const foot of motion.getMetrics().feet) if (foot.contact) {contacts++; maxSlip=Math.max(maxSlip,foot.slip);maxTravel=Math.max(maxTravel,foot.contactTravel);clamps+=foot.reachClamp;}
  }
  assert.ok(maxSlip<.003, `support foot reach error ${maxSlip} at speed ${speed}`);
  assert.ok(maxTravel<.003, `support foot drift ${maxTravel} at speed ${speed}`);
  assert.ok(contacts>100);
  const distance=motion.getMetrics().distance, stride=motion.getMetrics().stride;
  assert.ok(Math.abs(motion.getMetrics().phase-((.3+distance/stride)%1))<1e-9);
  results.push({speed,maxSlip,maxTravel,contacts,clamps});
}
const f=fixture(), motion=createMotion(f.vrm,f.root);
for(let cycle=0;cycle<5;cycle++){
  for(let i=0;i<80+cycle*9;i++){
    f.root.position.z+=.7/60;
    motion.update(1/60,{action:'walk',moving:true,distanceDelta:.7/60});
    for(const foot of motion.getMetrics().feet)if(foot.contact)assert.ok(foot.slip<.003,'restart must not overextend planted leg');
  }
  for(let i=0;i<100;i++)motion.update(1/60,{action:'idle',moving:false,distanceDelta:0});
}
const wrist=f.bones.leftHand.getWorldPosition(new V()),elbow=f.bones.leftLowerArm.getWorldPosition(new V());
assert.ok(elbow.z<wrist.z,'+Z forward: relaxed elbow must be behind the wrist');
let turnContacts=0,turnLiftFrames=0,maxTurnDrift=0;
for(let i=0;i<600;i++){
  f.root.rotation.y+=Math.PI*2/600;
  motion.update(1/60,{action:'idle',moving:false,distanceDelta:0,turning:true});
  for(const foot of motion.getMetrics().feet){
    if(foot.contact){turnContacts++;maxTurnDrift=Math.max(maxTurnDrift,foot.contactTravel);}
    else if(foot.actual[1]>.215)turnLiftFrames++;
  }
}
assert.ok(turnContacts>100&&turnLiftFrames>50);
assert.ok(maxTurnDrift<.003,`turn support drift ${maxTurnDrift}`);
for (const action of ['sit','stand','dance']) {
  for(let i=0;i<480;i++) motion.update(1/60,{action,moving:false,distanceDelta:0});
  assert.ok(motion.getMetrics().feet.flatMap(x=>x.actual).every(Number.isFinite));
  if(action==='sit') assert.ok(motion.getMetrics().sitProgress>.99);
  if(action==='stand') assert.ok(motion.getMetrics().sitProgress<.01);
}
console.log(JSON.stringify({ok:true,fixture:'synthetic anatomical hierarchy; actual VRM/browser acceptance is separate',speeds:results,turn:{turnContacts,turnLiftFrames,maxTurnDrift}},null,2));
