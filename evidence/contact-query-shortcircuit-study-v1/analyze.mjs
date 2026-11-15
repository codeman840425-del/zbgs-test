import fs from 'node:fs/promises';import zlib from 'node:zlib';import assert from 'node:assert/strict';import crypto from 'node:crypto';import path from 'node:path';
import * as original from '../contact-query-bounds-study-v1/forearm-contact-workspace.original.mjs';
const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
// Arithmetic-only sufficient finite-domain guard. This is not a geometric tolerance.
// Each |rail/c|<=2^100; |den|>=1e-12 => bary/clip operations stay far below binary64 overflow.
const LIMIT=2**100;
export const constantsFinite=c=>c.length===7&&c.every(x=>Number.isFinite(x)&&Math.abs(x)<=LIMIT);
export const railFinite=r=>r.length===4&&r.every(x=>Number.isFinite(x)&&Math.abs(x)<=LIMIT);
const stats=()=>({baryDivisions:0,clipDivisions:0,clipPlanes:0,nullAt:[0,0,0],intervalNonNull:0,fallback:0,degenerate:0});
function oldCost(rail,c,s){const o=original.createProjectedInterval(),x=original.projectedSegmentIntervalPrepared(...rail,c,o);if(Math.abs(c[6])<1e-12){s.degenerate++;return x;}s.baryDivisions+=4;let lo=0,hi=1;for(let k=0;k<3;k++){s.clipPlanes++;const delta=o.end[k]-o.start[k];if(Math.abs(delta)<1e-12){if(o.start[k]<-1e-9){s.nullAt[k]++;return x;}}else{ s.clipDivisions++;if(delta>0)lo=Math.max(lo,-o.start[k]/delta);else hi=Math.min(hi,-o.start[k]/delta);}}if(x)s.intervalNonNull++;else s.nullAt[2]++;return x;}
// Study function only, never imported by product. Identical old formulas/order within each scalar.
export function shortcircuit(rail,c,out,s=stats(),guard=constantsFinite(c)&&railFinite(rail)){
 if(!guard){s.fallback++;return original.projectedSegmentIntervalPrepared(...rail,c,out);}
 const [su,sv,eu,ev]=rail,denominator=c[6];if(Math.abs(denominator)<1e-12){s.degenerate++;return null;}
 const start=out.start,end=out.end;let lo=0,hi=1;
 for(let k=0;k<3;k++){
  if(k===0){start[0]=(c[0]*(su-c[4])+c[1]*(sv-c[5]))/denominator;end[0]=(c[0]*(eu-c[4])+c[1]*(ev-c[5]))/denominator;s.baryDivisions+=2;}
  else if(k===1){start[1]=(c[2]*(su-c[4])+c[3]*(sv-c[5]))/denominator;end[1]=(c[2]*(eu-c[4])+c[3]*(ev-c[5]))/denominator;s.baryDivisions+=2;}
  else {start[2]=1-start[0]-start[1];end[2]=1-end[0]-end[1];}
  s.clipPlanes++;const delta=end[k]-start[k];
  if(Math.abs(delta)<1e-12){if(start[k]<-1e-9){s.nullAt[k]++;return null;}}
  else if(delta>0){s.clipDivisions++;lo=Math.max(lo,-start[k]/delta);}
  else{s.clipDivisions++;hi=Math.min(hi,-start[k]/delta);}
  if(lo>hi+1e-9){s.nullAt[k]++;return null;}
 }
 out.lo=Math.max(0,lo);out.hi=Math.min(1,hi);s.intervalNonNull++;return out;
}
const bytes=await fs.readFile(path.join(dir,'../contact-query-bounds-study-v1/capture/fixture.json.gz')),input=JSON.parse(zlib.gunzipSync(bytes));
const report={scope:'Offline arithmetic distribution/equivalence only; not runtime candidate/performance. All old 1e-12/1e-9 semantics retained.',fixtureSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),limit:LIMIT,poses:[],totals:{queries:0,old:stats(),lazy:stats()},witness:[],fallbacks:[]};
for(const pose of input.fixtures){const row={label:pose.label,queries:0,old:stats(),lazy:stats()};for(const g of pose.grids){const guards=g.triangles.map(t=>constantsFinite(t.clipConstants));for(const q of g.queries){const guardRail=railFinite(q.rail);for(const id of q.candidates){const c=g.triangles[id].clipConstants,a=oldCost(q.rail,c,row.old),b=shortcircuit(q.rail,c,original.createProjectedInterval(),row.lazy,guards[id]&&guardRail);assert.deepEqual(b,a);row.queries++;}}}report.poses.push(row);report.totals.queries+=row.queries;for(const group of ['old','lazy'])for(const k of Object.keys(row[group]))if(Array.isArray(row[group][k]))row[group][k].forEach((v,i)=>report.totals[group][k][i]+=v);else report.totals[group][k]+=row[group][k];}
const witness=JSON.parse(await fs.readFile(path.join(dir,'../contact-query-bounds-study-v1/independent-review/workspace-witness.json'),'utf8'));
function clearance(tri,x){if(!x)return 0;let amount=0;for(let k=0;k<=4;k++){const at=x.lo+(x.hi-x.lo)*k/4;let depth=0;for(let j=0;j<3;j++)depth+=.02*(x.start[j]+(x.end[j]-x.start[j])*at);if(depth>-.008&&depth<.3)amount=Math.max(amount,depth+.008);}return amount;}
for(const w of witness.results){const c=original.prepareProjectedInterval(w.tri,Array(7)),a=original.projectedSegmentIntervalPrepared(...w.rail,c,original.createProjectedInterval()),b=shortcircuit(w.rail,c,original.createProjectedInterval());assert.deepEqual(b,a);const amount=clearance(w.tri,b);assert.equal(amount,w.old.amount);report.witness.push({tag:w.tag,guard:constantsFinite(c)&&railFinite(w.rail),interval:b,oldAmount:w.old.amount,newAmount:amount});}
const samples=[{name:'NaN-rail',r:[NaN,0,1,1],c:[-1,-1,1,0,0,1,1]},{name:'Infinity-constant',r:[0,0,1,1],c:[Infinity,-1,1,0,0,1,1]},{name:'finite-overflow-risk',r:[1e308,0,-1e308,1],c:[1e308,1e308,1e308,1e308,0,0,1]},{name:'huge-denominator',r:[0,0,1,1],c:[-1,-1,1,0,0,1,1e308]},{name:'NaN-denominator',r:[0,0,1,1],c:[-1,-1,1,0,0,1,NaN]},{name:'degenerate-finite',r:[0,0,1,1],c:Array(7).fill(0)},{name:'finite-domain-limit',r:[LIMIT,-LIMIT,-LIMIT,LIMIT],c:[LIMIT,-LIMIT,-LIMIT,LIMIT,-LIMIT,LIMIT,1e-12]},{name:'just-outside-domain',r:[LIMIT*2,0,1,1],c:[-1,-1,1,0,0,1,1]},{name:'signed-zero',r:[-0,0,1,-0],c:[-1,-1,1,0,0,1,1]}];
for(const w of samples){const s=stats(),a=original.projectedSegmentIntervalPrepared(...w.r,w.c,original.createProjectedInterval()),b=shortcircuit(w.r,w.c,original.createProjectedInterval(),s);assert.deepEqual(b,a);report.fallbacks.push({name:w.name,guard:constantsFinite(w.c)&&railFinite(w.r),fallbackCalls:s.fallback,oldIsNull:a===null,newIsNull:b===null,passed:true});}
report.passed=true;await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({totals:report.totals,witness:report.witness.map(x=>({tag:x.tag,guard:x.guard,amount:x.newAmount})),passed:report.passed}));
