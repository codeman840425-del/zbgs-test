// Classify, do not change, the existing all-clamp gate. No browser.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2]||'output/playwright/m1/efdf558930a4/female-acceleration-phase-1794699168026/female-base.json';
const out=process.argv[3]||'evidence/female-acceleration-negative-clamp-classification.json';
const r=JSON.parse(fs.readFileSync(file)),cases=[];
for(const run of r.runs){const segments=[];for(let side=0;side<2;side++){let segment=null;function flush(){if(segment){segments.push(segment);segment=null;}}for(let i=0;i<run.rows.length;i++){const row=run.rows[i],foot=row.feet[side],previous=run.rows[i-1],dt=previous?row.t-previous.t:1/120;if(!foot.reachClamp){flush();continue;}const type=foot.contact?'support':'swing-or-unplanted',key=type+'|'+row.stage+'|'+row.mode;
if(segment?.key!==key){flush();segment={key,type,stage:row.stage,mode:row.mode,side:foot.side,start:row.t,end:row.t,seconds:0,samples:0,maxActualSupportError:0,maxTargetError:0,sourcePhaseAtStart:row.phase,runMixAtStart:row.runMix};}
segment.end=row.t;segment.seconds+=dt;segment.samples++;segment.maxActualSupportError=Math.max(segment.maxActualSupportError,foot.actualSupportError||0);segment.maxTargetError=Math.max(segment.maxTargetError,Math.hypot(...foot.raw.map((n,k)=>n-foot.target[k])));
}flush();}cases.push({name:run.name,originalMax:run.max,originalFailureKinds:[...new Set(run.failures.map(x=>x.kind))],segments});}
const result={source:file,scope:'Offline classification of original failed all-clamp gate. No acceptance threshold changed; non-support reach clamp is not automatically harmless.',cases};fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out,cases:cases.filter(c=>c.originalMax.continuousClampSeconds>.1).map(c=>({name:c.name,segments:c.segments.filter(x=>x.seconds>.03).map(({key,...x})=>x)}))},null,2));
