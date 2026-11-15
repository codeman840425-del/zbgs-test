// Small independent adversarial set, not the captured fixture/performance matrix.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as old from '../candidate/workspace.base.mjs';
import * as next from '../candidate/workspace.candidate.mjs';
import {Vector3} from '../../../prototype/node_modules/three/build/three.module.js';

const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expected='7323344102f54dc6248e57a233e7e50e316febefeb0d1911f74ba1ec99d4a2c8';
assert.equal(sha(path.resolve(dir,'../candidate/workspace.candidate.mjs')),expected);
assert.equal(sha(path.join(root,'experiments/m1-query-shortcircuit-candidate/prototype/src/forearm-contact-workspace.js')),expected);
assert.equal(sha(path.resolve(dir,'../candidate/workspace.base.mjs')),'e33830b3aebdad8ddec33fe43b7daef4e698f1d6684a6ff730092918e69bead7');
const L=2**100,tri=[0,0,1,0,0,1],records=[];
const fresh=()=>({lo:123,hi:456,start:[111,222,333],end:[444,555,666]});
const cfor=t=>next.prepareProjectedInterval(t,Array(7));
function compare(name,rail,c,{scratch=false}={}){
 const a=fresh(),b=fresh(),before=old.projectedSegmentIntervalPrepared(...rail,c,a),after=next.projectedSegmentIntervalPrepared(...rail,c,b);
 assert.equal(before===null,after===null,name+' null status');
 if(before!==null){assert.strictEqual(before,a);assert.strictEqual(after,b);assert.deepEqual(after,before,name+' complete nonnull output');}
 if(scratch)assert.deepEqual(b,a,name+' fallback scratch');
 records.push({name,guard:c.finiteClipArithmetic===true,railBounded:rail.every(x=>Math.abs(x)<=L),nonnull:before!==null,output:after,fullScratchChecked:scratch});
 return {a,b,before,after};
}
for(const [name,rail] of [
 ['interior',[.2,.2,.4,.3]],['crossing',[-1,.2,2,.2]],['early-plane0',[2,2,3,3]],
 ['early-plane1',[-1,.2,-.5,.2]],['parallel-outside',[-1,.2,-1,.5]],
 ['zero-length-inside',[.3,.3,.3,.3]],['zero-length-outside',[2,2,2,2]],
 ['signed-zero',[-0,0,0,-0]],['edge',[0,0,1,0]],['tiny-parallel',[-5e-10,0,-5e-10,0]]
])compare(name,rail,cfor(tri));
for(const [name,t,rail] of [
 ['negative-winding',[0,0,0,1,1,0],[-1,.2,2,.2]],
 ['denominator-below-cutoff',[0,0,1,0,0,5e-13],[0,0,1,1]],
 ['denominator-at-cutoff',[0,0,1,0,0,1e-12],[0,0,1,1]],
 ['degenerate',[0,0,1,0,2,0],[0,0,1,1]]
])compare(name,rail,cfor(t));
const witness=JSON.parse(fs.readFileSync(path.join(root,'evidence/contact-query-bounds-study-v1/independent-review/result.json'))).failed;
const wedge=[];
for(const [name,dx,dy] of [['thin-wedge',0,0],['thin-wedge-rebased',99,-98]]){
 const t=witness.tri.map((v,i)=>v-(i%2?dy:dx)),rail=witness.rail.map((v,i)=>v-(i%2?dy:dx));
 const result=compare(name,rail,cfor(t));assert(result.after);assert(result.after.lo>result.after.hi);
 function workspace(module){const item={points:[0,1,2].map(i=>new Vector3(t[2*i],t[2*i+1],.02)),projected:Array(6).fill(0),clipConstants:Array(7),candidateStamp:0};const w=module.createProjectedContactWorkspace();w.build([item],new Vector3(1,0,0),new Vector3(0,1,0));return w.query(...rail).map(v=>{const q=module.projectedSegmentIntervalPrepared(...rail,v.clipConstants,module.createProjectedInterval());let amount=0;if(q)for(let k=0;k<=4;k++){const at=q.lo+(q.hi-q.lo)*k/4;const hit=new Vector3();for(let j=0;j<3;j++)hit.addScaledVector(v.points[j],q.start[j]+(q.end[j]-q.start[j])*at);if(hit.z>-.008&&hit.z<.3)amount=Math.max(amount,hit.z+.008);}return {interval:q,amount};});}
 const a=workspace(old),b=workspace(next);assert.deepEqual(b,a);assert.equal(b.length,1);assert.equal(b[0].amount,.02800000000014552);wedge.push({name,candidates:b.length,...b[0]});
}
// Synthetic constant-domain extrema exercise the sufficient bound, independent
// of whether a specific coherent triangle happens to generate these constants.
for(const [name,c] of [
 ['bounded-max-positive-den',[L,L,-L,L,L,-L,1e-12]],
 ['bounded-max-negative-den',[L,L,-L,L,L,-L,-1e-12]]
]){c.finiteClipArithmetic=true;compare(name,[-L,L,L,-L],c);}
for(const [name,rail,c] of [
 ['missing-guard',[2,2,3,3],Array.from(cfor(tri))],
 ['nan-rail',[2,2,NaN,3],cfor(tri)],
 ['infinite-rail',[2,2,Infinity,3],cfor(tri)],
 ['one-ulp-outside-limit',[L+2**48,0,L,0],cfor(tri)],
 ['nan-denominator',[2,2,3,3],cfor([NaN,0,1,0,0,1])],
 ['overflow-prepare',[0,0,1,1],cfor([1e308,1e308,-1e308,0,0,-1e308])],
 ['finite-large-prepare',[0,0,1,1],cfor([2**101,0,0,0,0,1])]
])compare(name,rail,c,{scratch:true});
// Explicit guard invalidation/recovery on the same cached constants array.
const reusable=Array(7),guardTransitions=[];
for(const [name,t,valid] of [['valid',tri,true],['over-limit',[2**101,0,0,0,0,1],false],['nan',[NaN,0,1,0,0,1],false],['degenerate',[0,0,0,0,0,0],true],['restored',tri,true]]){
 reusable.finiteClipArithmetic=true;next.prepareProjectedInterval(t,reusable);assert.equal(reusable.finiteClipArithmetic,valid,name);guardTransitions.push({name,guard:valid});compare('reprepare-'+name,[.2,.2,.3,.3],reusable,{scratch:!valid});
}
// Actual repeated build must reprepare the same array; no new triangle object.
const item={points:[new Vector3(),new Vector3(1,0,0),new Vector3(0,1,0)],projected:Array(6),clipConstants:Array(7),candidateStamp:0};
const w=next.createProjectedContactWorkspace(),u=new Vector3(1,0,0),v=new Vector3(0,1,0);w.build([item],u,v);const cached=item.clipConstants;cached.finiteClipArithmetic=false;item.points.forEach(p=>p.add(new Vector3(.08,.08,0)));w.build([item],u,v);assert.strictEqual(item.clipConstants,cached);assert.equal(cached.finiteClipArithmetic,true);assert.deepEqual(Array.from(cached),Array.from(cfor(item.projected)));assert.equal(w.query(.2,.2,.3,.3).length,1);
// Null scratch differs intentionally; subsequent nonnull overwrites all slots.
const a=fresh(),b=fresh(),c=cfor(tri);assert.equal(old.projectedSegmentIntervalPrepared(2,2,3,3,c,a),null);assert.equal(next.projectedSegmentIntervalPrepared(2,2,3,3,c,b),null);assert.notDeepEqual(a,b);const nullScratch={old:structuredClone(a),candidate:structuredClone(b)};
assert.deepEqual(next.projectedSegmentIntervalPrepared(.2,.2,.3,.3,c,b),old.projectedSegmentIntervalPrepared(.2,.2,.3,.3,c,a));
const report={candidateBuild:'6fb6c051aacd',candidateSha256:expected,passed:true,directChecks:records.length,records,wedge,guardTransitions,repeatedWorkspaceBuildPassed:true,nullScratch,reusedNonnullScratchExact:true,scope:'Bounded independent offline review only; no fixture replay, browser, character-state or performance claim. Nonfinite numbers serialized as explicit strings.'};
const replace=(key,value)=>typeof value==='number'&&!Number.isFinite(value)?String(value):Object.is(value,-0)?'-0':value;
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,replace,2)+'\n');
console.log(JSON.stringify({passed:true,directChecks:records.length,wedge,guardTransitions,repeatedWorkspaceBuildPassed:true,reusedNonnullScratchExact:true},null,2));
