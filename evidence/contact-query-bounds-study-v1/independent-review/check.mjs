import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Vector3 } from '../../../prototype/node_modules/three/build/three.module.js';
import * as base from '../forearm-contact-workspace.original.mjs';
import * as candidate from '../candidate/forearm-contact-workspace.candidate.mjs';
const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const frozen=fs.readFileSync(path.join(out,'../candidate/forearm-contact-workspace.candidate.mjs'));
const runtime=fs.readFileSync(path.join(root,'experiments/m1-query-bounds-candidate/prototype/src/forearm-contact-workspace.js'));
assert.equal(sha(frozen),'87a533cb5f807815e7ee3d436989f01b13bfd0b461d5de72eeb1de6309e60201');
assert.equal(sha(runtime),sha(frozen));
let seed=0x714bae91; const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
const counters={calls:0,validBounds:0,nonnull:0,rejectedNull:0,invalidFallback:0};
const result={candidateSha256:sha(frozen),seed:'0x714bae91',counters,failed:null,rebuilds:[],passed:false};
const C=Array(7),tb={},rb={},iv=base.createProjectedInterval();
function check(tri,rail,tag){
 base.prepareProjectedInterval(tri,C);candidate.prepareQueryTriangleBounds(tri,C,tb);candidate.prepareQueryRailBounds(...rail,rb);
 const previous=base.projectedSegmentIntervalPrepared(...rail,C,iv);const rejected=candidate.queryBoundsRejects(rb,tb);
 counters.calls++;if(tb.valid&&rb.valid)counters.validBounds++;else counters.invalidFallback++;
 if(previous)counters.nonnull++;if(rejected&&!previous)counters.rejectedNull++;
 if(previous&&rejected){result.failed={tag,tri,rail,constants:C.slice(),tb:{...tb},rb:{...rb},interval:JSON.parse(JSON.stringify(previous))};throw Error('Candidate removed old nonnull');}
}
try{
 // Deterministic direct broad/narrow adversarial comparisons, independent of cell coverage.
 for(let i=0;i<60000;i++){
  const span=10**(-6+7*random());
  const thin=[1,1e-4,1e-6*(1+1e-8),1e-6*(1-1e-8),1e-8,0][i%6];
  const angle=random()*Math.PI*2,cs=Math.cos(angle),sn=Math.sin(angle);
  const ox=[0,99,-99,99.999,-99.999][i%5],oy=[0,98,-98][i%3];
  const tr=(x,y)=>[ox+cs*x-sn*y,oy+sn*x+cs*y];
  const a=tr(0,0),b=tr(span,0),c=tr(span*random(),span*thin);const tri=[...a,...b,...c];
  let rail;
  if(i%3===0){
   // Through a barycentric point, including reversed directions.
   const x=random(),y=random()*(1-x),point=[a[0]*(1-x-y)+b[0]*x+c[0]*y,a[1]*(1-x-y)+b[1]*x+c[1]*y];
   const dx=span*(random()-.5),dy=span*(random()-.5);rail=[point[0]-dx,point[1]-dy,point[0]+dx,point[1]+dy];
  }else{
   // AABB outside/inside at 1um, 1e-9 barycentric tolerance and near machine noise.
   const gaps=[0,1e-14,-1e-14,span*1e-9,-span*1e-9,.999999e-6,1.000001e-6,-1.000001e-6,2e-6];
   const gap=gaps[i%gaps.length];const minx=Math.min(a[0],b[0],c[0]),maxx=Math.max(a[0],b[0],c[0]),miny=Math.min(a[1],b[1],c[1]),maxy=Math.max(a[1],b[1],c[1]);
   rail=i%2?[minx-gap,miny-span*.1,minx-gap,maxy+span*.1]:[minx-span*.1,maxy+gap,maxx+span*.1,maxy+gap];
  }
  check(tri,rail,`random-${i}`);check(tri,[rail[2],rail[3],rail[0],rail[1]],`random-${i}-reversed`);
 }
 // Reuse the same triangle identities and workspaces across changed projections/geometry.
 function make(){return [0,1,2].map(id=>({id,points:[new Vector3(),new Vector3(),new Vector3()],projected:Array(6).fill(0),clipConstants:Array(7).fill(0),candidateStamp:0}));}
 const oldWs=base.createProjectedContactWorkspace(),newWs=candidate.createProjectedContactWorkspace();const oldTs=make(),newTs=make();
 function intervalList(ws,rail){return ws.query(...rail).map(t=>{const q=base.projectedSegmentIntervalPrepared(...rail,t.clipConstants,base.createProjectedInterval());return q?{id:t.id,...q,start:q.start.slice(),end:q.end.slice()}:null;}).filter(Boolean);}
 const stages=[['normal',0,.01],['moved-same-cell',.018,.01],['thin',0,1e-10],['zero-area',0,0],['back-to-normal',0,.01],['different-basis',-.006,.008],['empty',0,.01],['repopulate',0,.01]];
 for(const[name,offset,height]of stages){
  for(const triangles of [oldTs,newTs])for(const t of triangles){const x=offset+t.id*.004;t.points[0].set(x,0,0);t.points[1].set(x+.012,0,0);t.points[2].set(x,height,0);}
  const u=name==='different-basis'?new Vector3(0,1,0):new Vector3(1,0,0),v=name==='different-basis'?new Vector3(-1,0,0):new Vector3(0,1,0);
  oldWs.build(name==='empty'?[]:oldTs,u,v);newWs.build(name==='empty'?[]:newTs,u,v);
  for(const rail of [[.002,-.001,.002,.012],[.03,-.001,.03,.012],[.002,.012,.002,-.001],[-.003,-.005,.014,.007]]){
   const old=intervalList(oldWs,rail),next=intervalList(newWs,rail);assert.deepEqual(next,old);
  }
  result.rebuilds.push({name,queries:4,validBounds:newTs.map(t=>t.queryBounds?.valid??null)});
 }
 // Invalid flags must defeat stale bounds; pure predicate only, no unbounded old cell loops.
 const reused={};candidate.prepareQueryRailBounds(0,0,1,1,reused);assert.equal(reused.valid,true);candidate.prepareQueryRailBounds(NaN,0,1,1,reused);assert.equal(reused.valid,false);
 const tbuf={};candidate.prepareQueryTriangleBounds([0,0,.01,0,0,.01],base.prepareProjectedInterval([0,0,.01,0,0,.01],Array(7)),tbuf);assert.equal(tbuf.valid,true);
 candidate.prepareQueryTriangleBounds([Infinity,0,1,0,0,1],Array(7).fill(0),tbuf);assert.equal(tbuf.valid,false);assert.equal(candidate.queryBoundsRejects(reused,tbuf),false);
 result.passed=true;
}catch(e){result.error=e.stack;process.exitCode=1;}
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
