// Geometry regression receipts, not a substitute for actual fixed-room tests.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir='evidence/female-acceleration-fix',expected='2413410e856e6122eb6ff0ae01aa10d7968a568bd21ac87c01e10a88f64027d3',sha=createHash('sha256').update(fs.readFileSync('evidence/motion-source-snapshots/'+expected+'.js')).digest('hex');assert.equal(sha,expected);
const files=['all-acceleration','full-original-sweep','male-run-exit'];const reports=files.map(f=>JSON.parse(fs.readFileSync(`${dir}/${f}-summary.json`,'utf8')));
const limits={peakSupport:.03,maxStep:.06,maxTarget:.06,maxClamp:.1,contactTravel:.015};
for(const r of reports)assert.equal(r.sourceSha256,sha,'Exact tested isolated source identity');
for(const r of reports.slice(0,2))for(const c of r.results){for(const [key,limit]of Object.entries(limits))assert.ok(c[key]<=limit,`${c.body}/${c.triggerPhase}/${key}: ${c[key]}`);assert.ok(c.floor>=-.006);}
for(const c of reports[2].results){assert.ok(c.peakSupport<=.03);assert.equal(c.maxSupportClamp,0);assert.ok(c.maxAnkleStep<=.06);}
const negative=JSON.parse(fs.readFileSync('evidence/female-acceleration-room-negative.json','utf8'));assert.equal(negative.actualRoomFailureReproduced,true);assert.equal(negative.cases.filter(c=>c.max.supportError>.03).length,4);
const result={passed:true,scope:'Isolated real asset/factory geometry checks plus fixed-room negative evidence; candidate room success NOT verified',candidateSha256:sha,limits,cases:reports.map((r,i)=>({report:files[i],count:r.results.length,maxSupport:Math.max(...r.results.map(c=>c.peakSupport))})),negativeBuild:negative.build,negativeFailedPhases:[.76,.77,.78,.79]};fs.writeFileSync('evidence/female-acceleration-candidate-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
