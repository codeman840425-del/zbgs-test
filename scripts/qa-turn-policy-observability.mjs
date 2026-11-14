// PURE scheduler diagnostics, not actual CharacterScene/mesh acceptance.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const modulePath=path.resolve(process.argv.find(x=>x.startsWith('--module='))?.slice(9)||'prototype/src/turn-policy.js');
const {createTurnPolicy,turnAngleDelta}=await import(pathToFileURL(modulePath));
const results=[];
for(const fps of [30,60,120])for(const angle of [1,5,15,45,90,180])for(const sign of [-1,1]){
 const p=createTurnPolicy();p.reset(0);const goal=sign*angle*Math.PI/180;let requests=0,progressResets=0,previous=p.sample(),maxPlantedYawChange=0;const rows=[];
 p.requestHeading(goal);requests++;
 for(let i=0;i<fps*5;i++){const before=p.sample();p.requestHeading(goal);requests++;const after=p.sample();if(before.active&&(before.stepId!==after.stepId||before.progress!==after.progress||before.yaw!==after.yaw))progressResets++;const row=p.update(1/fps);for(let k=0;k<2;k++)if(previous.feet[k].contact&&row.feet[k].contact)maxPlantedYawChange=Math.max(maxPlantedYawChange,Math.abs(turnAngleDelta(row.feet[k].yaw,previous.feet[k].yaw)));rows.push({t:(i+1)/fps,...row});previous=row;if(!row.active)break;}
 results.push({fps,degrees:sign*angle,requests,uniqueHeading:1,duplicateHeading:requests-1,progressResets,maxPlantedYawChange,duration:rows.at(-1).t,completed:!rows.at(-1).active,finalError:Math.abs(turnAngleDelta(rows.at(-1).yaw,goal)),rows});
}
const passed=results.every(x=>x.completed&&x.finalError<1e-7&&x.progressResets===0&&x.maxPlantedYawChange<1e-7);const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'output/turn-policy-observability';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Pure selected-source scheduler; no browser, path, foot IK or fixed-build acceptance',modulePath,sourceSha256:createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),passed,results},null,2));console.log(JSON.stringify({out,passed,cases:results.length}));if(!passed)process.exitCode=1;
