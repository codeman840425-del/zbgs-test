// Isolated real-asset geometry tests. No browser, texture or visual-quality claim.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {loadGeometryAvatar,THREE} from './headless-avatar-node.mjs';
const [moduleFile,outFile]=process.argv.slice(2);if(!outFile)throw Error('Usage: node scripts/qa-gait-phase-sweep-node.mjs <motion-copy.js> <out.json>');
let text=fs.readFileSync(moduleFile,'utf8'),sha=createHash('sha256').update(text).digest('hex');text=text.replace('"three"',JSON.stringify(pathToFileURL(path.resolve('prototype/node_modules/three/build/three.module.js')).href)).replace('"./segment-triangle-projection.js"',JSON.stringify(pathToFileURL(path.resolve('prototype/src/segment-triangle-projection.js')).href));
const {createMotion}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
const dt=1/120,results=[];
for(const body of ['female']){
 const {avatar:a,motions}=await loadGeometryAvatar(body),root=a.root,V=THREE.Vector3;
 const m=createMotion(a.vrm,root,motions,a.profile.motion);
 for(const direction of ['walk-to-run'])for(const triggerPhase of (process.env.ACCEL_PHASES?process.env.ACCEL_PHASES.split(',').map(Number):[.05,.15,.25,.35,.45,.55,.65,.75,.85,.95]))for(const omega of [0]){
  root.position.set(0,0,0);root.rotation.set(0,0,0);m.reset();let speed=0,previous=null;
  function step(requestedSpeed,omega=0){const acceleration=requestedSpeed<speed?2.5:1.5;speed+=Math.max(-acceleration*dt,Math.min(acceleration*dt,requestedSpeed-speed));root.rotation.y+=omega*dt;root.position.x+=Math.sin(root.rotation.y)*speed*dt;root.position.z+=Math.cos(root.rotation.y)*speed*dt;m.update(dt,{action:'walk',moving:speed>1e-6,speed,distanceDelta:speed*dt,allowUnplannedTurn:false});a.update(0,{action:'walk'});return m.getMetrics();}
  const startSpeed=direction==='run-to-walk'?2.55:.85,endSpeed=direction==='run-to-walk'?.85:2.55;
  for(let tick=0;tick<480;tick++)step(startSpeed);
  for(let tick=0;tick<1000;tick++){const s=step(startSpeed),p=direction==='run-to-walk'?s.jogPhase:s.phase;if(Math.abs(((p-triggerPhase+1.5)%1)-.5)<.006){previous=s;break;}}
  if(!previous)throw Error('Failed to reach source phase');
  const initial={acceleration:1.5,deceleration:2.5,phase:previous.phase,jogPhase:previous.jogPhase,feet:previous.feet.map(f=>({contact:f.contact,kind:f.contactPoint}))};
  const samples=[];let peakSupport=0,maxStep=0,maxTarget=0,maxClamp=0,contactTravel=0,clamp=[0,0],transitions=[],floor=Infinity;
  const calibration=m.getFootLockCalibration(),meshes=new Map();root.traverse(o=>{if(o.isSkinnedMesh)meshes.set(o.uuid,o);});
  function soleY(side,kind){const refs=calibration[side].selection.patches[kind];const ys=refs.map(({mesh,vertex})=>{const o=meshes.get(mesh);return o.getVertexPosition(vertex,new V()).applyMatrix4(o.matrixWorld).y;}),min=Math.min(...ys);let y=0,w=0;for(const v of ys){const k=Math.exp(-(v-min)/.001);y+=v*k;w+=k;}return y/w;}
  for(let tick=0;tick<180;tick++){
   const s=step(endSpeed,tick<60?omega:0);root.updateWorldMatrix(true,true);
   for(let i=0;i<2;i++){const f=s.feet[i],p=previous.feet[i];peakSupport=Math.max(peakSupport,f.slip);clamp[i]=f.contact&&f.reachClamp?clamp[i]+dt:0;maxClamp=Math.max(maxClamp,clamp[i]);maxStep=Math.max(maxStep,new V().fromArray(f.actual).distanceTo(new V().fromArray(p.actual)));maxTarget=Math.max(maxTarget,new V().fromArray(f.target).distanceTo(new V().fromArray(p.target)));contactTravel=Math.max(contactTravel,f.contactTravel);floor=Math.min(floor,soleY(i,'heel'),soleY(i,'toe'));}
   samples.push({t:tick*dt,speed,root:root.position.toArray(),phase:s.phase,jogPhase:s.jogPhase,runMix:s.runMix,gaitTransition:s.gaitTransition,feet:s.feet});
   if(s.gaitTransition?.frame!==previous.gaitTransition?.frame)transitions.push({t:tick*dt,...s.gaitTransition});previous=s;
  }
  results.push({body,direction,triggerPhase,omega,initial,peakSupport,maxStep,maxTarget,maxClamp,contactTravel,floor,transitions,samples});
 }
 m.dispose();a.dispose();
}
const result={sourceSha256:sha,moduleFile,scope:'Actual factory + original geometry/skin/motion bytes; Controller straight free-space speed law 1.5 acceleration/2.5 deceleration, not actual CharacterScene execution; no room/browser acceptance',results};fs.writeFileSync(outFile,JSON.stringify(result,null,2));console.log(JSON.stringify({outFile,cases:results.length,maxima:Object.fromEntries(['peakSupport','maxStep','maxTarget','maxClamp','contactTravel'].map(k=>[k,Math.max(...results.map(r=>r[k]))])),floor:Math.min(...results.map(r=>r.floor))}));
