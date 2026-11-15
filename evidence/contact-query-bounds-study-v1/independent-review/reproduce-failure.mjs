import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';import assert from'node:assert/strict';
import{Vector3}from'../../../prototype/node_modules/three/build/three.module.js';
import*as old from'../forearm-contact-workspace.original.mjs';import*as candidate from'../candidate/forearm-contact-workspace.candidate.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),witness=JSON.parse(fs.readFileSync(path.join(dir,'result.json'))).failed;const results=[];
for(const[tag,dx,dy]of[['exact-witness',0,0],['same-geometry-rebased',99,-98]]){
 const tri=witness.tri.map((x,i)=>x-(i%2?dy:dx)),rail=witness.rail.map((x,i)=>x-(i%2?dy:dx));
 function mesh(){return{id:0,points:[0,1,2].map(i=>new Vector3(tri[i*2],tri[i*2+1],.02)),projected:Array(6).fill(0),clipConstants:Array(7).fill(0),candidateStamp:0};}
 const a=mesh(),b=mesh(),wa=old.createProjectedContactWorkspace(),wb=candidate.createProjectedContactWorkspace();wa.build([a],new Vector3(1,0,0),new Vector3(0,1,0));wb.build([b],new Vector3(1,0,0),new Vector3(0,1,0));
 const before=wa.query(...rail).slice(),after=wb.query(...rail).slice();
 function measure(candidates){let amount=0;const intervals=[];for(const t of candidates){const q=old.projectedSegmentIntervalPrepared(...rail,t.clipConstants,old.createProjectedInterval());if(!q)continue;intervals.push({...q,start:q.start.slice(),end:q.end.slice()});for(let k=0;k<=4;k++){const at=q.lo+(q.hi-q.lo)*k/4;const hit=new Vector3();for(let j=0;j<3;j++)hit.addScaledVector(t.points[j],q.start[j]+(q.end[j]-q.start[j])*at);const depth=hit.z;if(depth>-.008&&depth<.3)amount=Math.max(amount,depth+.008);}}return{amount,intervals};}
 const previous=measure(before),next=measure(after);results.push({tag,tri,rail,validBounds:b.queryBounds.valid,oldCandidateCount:before.length,newCandidateCount:after.length,old:previous,candidate:next});
 if(tag==='exact-witness'){assert.equal(before.length,1);assert.equal(after.length,0);assert.equal(previous.intervals.length,1);assert(previous.amount>0.0279);assert.equal(next.amount,0);}
}
fs.writeFileSync(path.join(dir,'workspace-witness.json'),JSON.stringify({scope:'Minimal actual workspace then original five affine depth samples, opaque surface, z=.02m/outward+Z, rail depth0. No character mutation. Rebased case is same geometric witness near scene origin, not a parameter sweep.',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
