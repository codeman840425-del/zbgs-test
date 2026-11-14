// Scheduler-only review. No claim about rendered humanoid contact/quality.
// Preserve the old whole-shoe observability test unchanged as baseline.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const src=path.resolve(process.argv[2]||'prototype/src/turn-policy.js');
const bytes=fs.readFileSync(src),sha=createHash('sha256').update(bytes).digest('hex');
const dir=path.resolve('analysis/turn-edit-review');fs.mkdirSync(dir,{recursive:true});
const snapshot=path.join(dir,sha+'.mjs');fs.writeFileSync(snapshot,bytes);
const {createTurnPolicy}=await import(pathToFileURL(snapshot));
const d=Math.PI/180, results=[];
for(const fps of [30,60,120])for(const name of ['180','360','small-to-large','late-retarget','stop']){
 const p=createTurnPolicy();p.reset(0);name==='360'?p.requestRotation(360*d):p.requestHeading((name==='small-to-large'?5:180)*d);
 let edited=false,edit=null,previous=p.sample(),bothContactYaw=0,maxBothContactRemaining=0,swingAfterEdit=0;const rows=[];
 for(let i=0;i<fps*10;i++){
  const before=p.sample();
  if(!edited&&((name==='small-to-large'&&i/fps>=.1)||(name==='late-retarget'&&before.progress>=.97)||(name==='stop'&&before.progress>=.3))){
   edited=true;edit={time:i/fps,before};if(name==='stop')p.stop();else p.requestHeading(name==='small-to-large'?180*d:before.yaw-150*d);edit.after=p.sample();
  }
  const s=p.update(1/fps);if(edited&&s.feet.some(f=>f.swing))swingAfterEdit++;
  if(s.active&&s.feet.every(f=>f.contact)&&previous.feet.every(f=>f.contact)){bothContactYaw+=Math.abs(s.yaw-previous.yaw);maxBothContactRemaining=Math.max(maxBothContactRemaining,Math.abs(s.remaining));}
  rows.push({t:(i+1)/fps,...s});previous=s;if(!s.active)break;
 }
 results.push({name,fps,completed:!previous.active,duration:rows.at(-1).t,edit,swingAfterEdit,bothContactYawDegrees:bothContactYaw/d,maxBothContactRemainingDegrees:maxBothContactRemaining/d,rows});
}
const report={scope:'Pure scheduler output; no browser/mesh acceptance',source:src,sourceSha256:sha,results};
fs.writeFileSync(path.join(dir,sha+'-full.json'),JSON.stringify(report)+'\n');
const compact={...report,traceStorage:'Full repeatable traces are analysis/turn-edit-review/<sha>-full.json; committed evidence keeps transitions',results:results.map(r=>({...r,samples:r.rows.length,rows:r.rows.filter((s,i,all)=>i===0||i===all.length-1||s.stepId!==all[i-1].stepId||s.feet.some((f,k)=>f.contact!==all[i-1].feet[k].contact)||(r.edit&&Math.abs(s.t-r.edit.time)<2/r.fps))}))};
const out=path.resolve('evidence/turn-policy-edit-review-'+sha.slice(0,12)+'.json');fs.writeFileSync(out,JSON.stringify(compact,null,2)+'\n');
console.log(JSON.stringify({out,sourceSha256:sha,results:results.map(({rows,edit,...r})=>({...r,edit:edit?{time:edit.time,beforeKind:edit.before.kind,afterKind:edit.after.kind,progress:edit.after.progress}:null}))},null,2));
