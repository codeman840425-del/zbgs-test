import fs from 'node:fs/promises';import path from 'node:path';import zlib from 'node:zlib';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import {createProjectedContactWorkspace,createProjectedInterval,projectedSegmentIntervalPrepared} from './forearm-contact-workspace.original.mjs';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const file=path.join(root,'capture/fixture.json.gz'),bytes=await fs.readFile(file),data=JSON.parse(zlib.gunzipSync(bytes));
// Study only: no runtime pruning. Conservative domain guard falls back to old narrow phase.
export function rejectBounds(rail,p,c){
 const values=[...rail,...p,...c];if(!values.every(Number.isFinite)||Math.max(...values.map(Math.abs))>100)return {reject:false,fallback:'nonfinite-or-extreme'};
 const minU=Math.min(p[0],p[2],p[4]),maxU=Math.max(p[0],p[2],p[4]),minV=Math.min(p[1],p[3],p[5]),maxV=Math.max(p[1],p[3],p[5]);
 const span=Math.max(maxU-minU,maxV-minV),railSpan=Math.max(Math.abs(rail[2]-rail[0]),Math.abs(rail[3]-rail[1]));
 if(span<1e-6||span>10||railSpan>10||Math.abs(c[6])<=Math.max(1e-12,span*span*1e-6))return {reject:false,fallback:'degenerate-or-ill-conditioned'};
 const margin=1e-6+64*Number.EPSILON*Math.max(1,...values.map(Math.abs));
 const reject=Math.max(rail[0],rail[2])<minU-margin||Math.min(rail[0],rail[2])>maxU+margin||Math.max(rail[1],rail[3])<minV-margin||Math.min(rail[1],rail[3])>maxV+margin;
 return {reject,margin};
}
const result={base:'038341558517',diagnostic:data.identity,fixtureSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),scope:'Read-only real fixtures; no runtime bounds applied. AABB margins are broad-phase conservatism, not changed contact tolerance. Exact old nonnull interval outputs must remain. Performance not measured.',poses:[],totals:{candidates:0,null:0,nonnull:0,rejectedNull:0,rejectedNonnull:0,fallback:0,queries:0},mismatches:[],synthetic:[]};
for(const f of data.fixtures){const row={label:f.label,time:f.t,candidates:0,null:0,nonnull:0,rejectedNull:0,rejectedNonnull:0,fallback:0,queries:0,grids:[]};
 for(const g of f.grids){const ws=createProjectedContactWorkspace(),ts=g.triangles.map((t,i)=>({id:i,points:t.points.map(p=>new Vector3(...p)),projected:Array(6).fill(0),clipConstants:Array(7).fill(0),candidateStamp:0}));ws.build(ts,new Vector3(...g.u),new Vector3(...g.v));for(let i=0;i<ts.length;i++){assert.deepEqual(ts[i].projected,g.triangles[i].projected);assert.deepEqual(ts[i].clipConstants,g.triangles[i].clipConstants);}
 for(const q of g.queries){row.queries++;const candidates=ws.query(...q.rail);assert.deepEqual(candidates.map(t=>t.id),q.candidates);const expected=new Map(q.nonnull.map(n=>[n.triangle,n]));for(const t of candidates){const interval=projectedSegmentIntervalPrepared(...q.rail,t.clipConstants,createProjectedInterval()),e=expected.get(t.id);if(interval){assert(e,'Original interval missing in capture');assert.deepEqual(interval,{lo:e.lo,hi:e.hi,start:e.start,end:e.end});row.nonnull++;}else{assert(!e,'Captured nonnull replayed null');row.null++;}const bound=rejectBounds(q.rail,t.projected,t.clipConstants);row.candidates++;if(bound.fallback)row.fallback++;if(bound.reject){if(interval){row.rejectedNonnull++;result.mismatches.push({label:f.label,side:g.side,rail:q.rail,triangle:t.id,interval,bound,projected:t.projected});}else row.rejectedNull++;}}}
 }
 row.rejectedShareOfAll=row.rejectedNull/row.candidates;row.rejectedShareOfNull=row.rejectedNull/row.null;result.poses.push(row);for(const k in result.totals)result.totals[k]+=row[k];
}
const p=[0,0,1,0,0,1],c=[-1,-1,1,0,0,1,1];
for(const [name,rail,points,constants,expected]of[
 ['touch-edge',[0,0,1,0],p,c,false],['submicron-gap',[-.0000005,0,-.0000005,1],p,c,false],['separated',[-.001,0,-.001,1],p,c,true],['degenerate',[-1,0,-1,1],[0,0,0,0,0,0],Array(7).fill(0),false],['nonfinite',[NaN,0,1,1],p,c,false],['extreme',[1e10,0,1e10,1],p,c,false],['ill-conditioned',[0,0,1,0],p,[0,0,0,0,0,0,1e-10],false]]){const actual=rejectBounds(rail,points,constants);assert.equal(actual.reject,expected);result.synthetic.push({name,...actual});}
result.totals.rejectedShareOfAll=result.totals.rejectedNull/result.totals.candidates;result.totals.rejectedShareOfNull=result.totals.rejectedNull/result.totals.null;result.passed=result.mismatches.length===0;
await fs.writeFile(path.join(root,'distribution.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({totals:result.totals,poses:result.poses.map(x=>({label:x.label,all:x.candidates,null:x.null,nonnull:x.nonnull,rejected:x.rejectedNull,share:x.rejectedShareOfAll})),passed:result.passed}));assert(result.passed);
