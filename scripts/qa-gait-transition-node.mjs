// Replay captured controller/root input through real assets + actual motion
// factory in Node. No rendered or browser acceptance claim; texture decode off.
import {gunzipSync} from 'node:zlib';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {loadGeometryAvatar,THREE} from './headless-avatar-node.mjs';
const [moduleFile,traceFile,outFile]=process.argv.slice(2);if(!outFile)throw Error('Usage: node scripts/qa-gait-transition-node.mjs <motion.js> <fps.json> <report.json>');
let text=fs.readFileSync(moduleFile,'utf8'),sha=createHash('sha256').update(text).digest('hex');
text=text.replace('"three"',JSON.stringify(pathToFileURL(path.resolve('prototype/node_modules/three/build/three.module.js')).href)).replace('"./segment-triangle-projection.js"',JSON.stringify(pathToFileURL(path.resolve('prototype/src/segment-triangle-projection.js')).href));
const {createMotion}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
const trace=JSON.parse(traceFile.endsWith('.gz')?gunzipSync(fs.readFileSync(traceFile)):fs.readFileSync(traceFile)),results=[];
const repetitions=Math.max(1,Number(process.env.REPLAY_REPEATS)||1);
for(const name of ['run--90deg','run-90deg'].flatMap(x=>Array(repetitions).fill(x))){
 const original=trace.results.find(x=>x.name===name);if(!original)continue;const {avatar:a,motions}=await loadGeometryAvatar('male');const root=a.root,V=THREE.Vector3;
 const m=createMotion(a.vrm,root,motions,a.profile.motion),start=original.rows[0],yaw=start.yaw,forward=new V(Math.sin(yaw),0,Math.cos(yaw));
 root.rotation.y=yaw;root.updateMatrixWorld(true);m.reset();m.update(0,{action:'walk',moving:false,speed:2.55,distanceDelta:0,allowUnplannedTurn:false});
 const warmDistance=((start.jogPhase-m.getMetrics().jogPhase+1)%1+2)*motions.jogDistance;
 root.position.fromArray(start.position).addScaledVector(forward,-warmDistance);root.updateMatrixWorld(true);
 let remaining=warmDistance;while(remaining>1e-9){const d=Math.min(remaining,2.55/120);root.position.addScaledVector(forward,d);m.update(1/120,{action:'walk',moving:true,speed:2.55,distanceDelta:d,allowUnplannedTurn:false});a.update(0,{action:'walk'});remaining-=d;}
 const initial=m.getMetrics(),rows=[];let peak=0,maxStep=0,clampTime=[0,0],maxClamp=0,previous=initial;
 for(const input of original.rows.slice(1)){
  root.position.fromArray(input.position);root.rotation.y=input.yaw;
  const updateStart=performance.now();m.update(input.dt,{action:input.mode==='turn'?'idle':input.mode,moving:input.moving,speed:input.speed,distanceDelta:input.speed*input.dt,turning:input.turning,turnPlan:input.motionPolicy?input.planner:null,allowUnplannedTurn:false});const updateMs=performance.now()-updateStart;a.update(0,{action:input.mode});const s=m.getMetrics();
  const row={t:input.t,updateMs,phase:s.phase,jogPhase:s.jogPhase,runMix:s.runMix,gaitTransition:s.gaitTransition,feet:s.feet};
  for(let i=0;i<2;i++){const f=s.feet[i];peak=Math.max(peak,f.slip);clampTime[i]=f.contact&&f.reachClamp?clampTime[i]+input.dt:0;maxClamp=Math.max(maxClamp,clampTime[i]);maxStep=Math.max(maxStep,new V().fromArray(f.actual).distanceTo(new V().fromArray(previous.feet[i].actual)));}
  rows.push(row);previous=s;
 }
 results.push({name,initialReplay:{phase:initial.phase,jogPhase:initial.jogPhase,runMix:initial.runMix,feet:initial.feet.map(x=>x.actual)},capturedInitial:{phase:start.walkPhase,jogPhase:start.jogPhase,runMix:start.runMix,feet:start.feet.map(x=>x.raw)},peakSupport:peak,maxSupportClamp:maxClamp,maxAnkleStep:maxStep,transitions:rows.filter((x,i)=>x.gaitTransition?.frame!==rows[i-1]?.gaitTransition?.frame).map(x=>({t:x.t,updateMs:x.updateMs,...x.gaitTransition})),rows});m.dispose();a.dispose();
}
const result={scope:'Real assets and motion factory, captured root trajectory replay after constant-speed warmup; not exact captured prior history, browser/rendering still required',moduleFile,sourceSha256:sha,traceFile,results};fs.writeFileSync(outFile,JSON.stringify(result)+'\n');console.log(JSON.stringify({sourceSha256:sha,results:results.map(({rows,...r})=>r)},null,2));
