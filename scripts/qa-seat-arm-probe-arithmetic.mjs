// Tests the actual QA probe helper, not a substitute for product geometry QA.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
const file='scripts/qa-variant-seat-arms.cjs',source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function segmentTriangle(a,b,t){'),end=source.indexOf(' const alphaCache=',start);assert.ok(start>0&&end>start);
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const test=new Function('sub','dot','cross',source.slice(start,end)+';return segmentTriangle;')(sub,dot,cross),triangle=[[0,0,0],[1,0,0],[0,1,0]],checks=[];
function check(name,f){f();checks.push(name);}
check('Interior finite crossing and barycentric point',()=>{const r=test([.2,.2,-1],[.2,.2,1],triangle);assert.equal(r.fraction,.5);assert.ok(r.bary.every((x,i)=>Math.abs(x-[.6,.2,.2][i])<1e-12));});
check('Both triangle windings are tested',()=>assert.ok(test([.2,.2,-1],[.2,.2,1],[...triangle].reverse())));
check('Infinite ray hit outside finite segment is rejected',()=>assert.equal(test([.2,.2,1],[.2,.2,2],triangle),null));
check('Plane crossing outside triangle is rejected',()=>assert.equal(test([2,2,-1],[2,2,1],triangle),null));
check('Endpoint-only touching is excluded explicitly',()=>assert.equal(test([.2,.2,0],[.2,.2,1],triangle),null));
check('Coplanar overlap is deliberately unclassified',()=>assert.equal(test([.2,.2,0],[.3,.3,0],triangle),null));
const result={passed:true,qaScriptSha256:createHash('sha256').update(source).digest('hex'),checks,limits:'Arithmetic fixtures for the actual finite-edge probe only. Does not prove alpha GPU coverage, source weights, posed collision depth or naturalness.'};
fs.writeFileSync('evidence/m1-variants-175a487d5ea3/probe-arithmetic.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
