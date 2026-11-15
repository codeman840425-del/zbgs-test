import assert from 'node:assert/strict';
import {Vector3} from '../prototype/node_modules/three/build/three.module.js';
import {alphaImageIsOpaque, opaqueAlphaHitSafe, prepareAlphaTriangle, alphaBarycentricPrepared} from '../prototype/src/forearm-contact-workspace.js';

const alpha={width:4,height:3,cutoff:.5,flip:false,pixels:new Uint8Array(48).fill(255)};
assert.equal(alphaImageIsOpaque(alpha),true);
const masked={...alpha,pixels:alpha.pixels.slice()};masked.pixels[19]=127;
assert.equal(alphaImageIsOpaque(masked),false,'A single transparent texel must retain original MASK tests');
masked.pixels[19]=128;assert.equal(alphaImageIsOpaque(masked),true,'Use the original byte/255 cutoff comparison');
for(const value of [{...alpha,width:0},{...alpha,pixels:new Uint8Array(4)},{...alpha,cutoff:NaN},null])assert.equal(alphaImageIsOpaque(value),false);
const triangle=(points,uv=[.1,.2,.8,.1,.4,.9])=>({points:points.map(p=>new Vector3(...p)),uvValues:uv,alpha:{...alpha,fullyOpaque:true},alphaEdge0:new Vector3(),alphaEdge1:new Vector3(),alphaDelta:new Vector3()});
function oldVisible(t,point){
 const b=new Vector3();alphaBarycentricPrepared(t,point,b);
 const uv=t.uvValues,u=uv[0]*b.x+uv[2]*b.y+uv[4]*b.z,v=uv[1]*b.x+uv[3]*b.y+uv[5]*b.z;
 const x=Math.max(0,Math.min(t.alpha.width-1,Math.floor(u*t.alpha.width))),y=Math.max(0,Math.min(t.alpha.height-1,Math.floor(v*t.alpha.height)));
 return t.alpha.pixels[(y*t.alpha.width+x)*4+3]/255>=t.alpha.cutoff;
}
let certified=0;
for(const scale of [.0001,.01,1,100]){
 const t=triangle([[0,0,0],[scale,0,0],[0,scale,0]]);prepareAlphaTriangle(t);
 for(let i=-5;i<=15;i++)for(let j=-5;j<=15;j++){
  const p=new Vector3(scale*i/10,scale*j/10,0);
  if(opaqueAlphaHitSafe(t,p)){assert.equal(oldVisible(t,p),true);certified++;}
 }
}
for(const t of [triangle([[0,0,0],[0,0,0],[0,0,0]]),triangle([[0,0,0],[1e-15,0,0],[0,1e-15,0]]),triangle([[1e8,0,0],[1e8,1,0],[1e8,0,1]]),triangle([[0,0,0],[1,0,0],[0,1,0]],[NaN,0,1,0,0,1])]){
 prepareAlphaTriangle(t);assert.equal(Boolean(opaqueAlphaHitSafe(t,new Vector3())),false,'Degenerate or extreme input must fall back');
}
const t=triangle([[0,0,0],[1,0,0],[0,1,0]]);prepareAlphaTriangle(t);
for(const p of [new Vector3(NaN,0,0),new Vector3(Infinity,0,0),new Vector3(1e9,0,0)])assert.equal(Boolean(opaqueAlphaHitSafe(t,p)),false);
// Preserve the five-sample depth gate: endpoints alone discard a valid middle hit.
const depths=[-.1,.05,.2,.35,.5],clear=ds=>Math.max(0,...ds.filter(d=>d>-.008&&d<.3).map(d=>d+.008));
assert.equal(clear(depths),.20800000000000002);assert.equal(clear([depths[0],depths[4]]),0);
console.log(JSON.stringify({passed:true,certifiedComparisons:certified,scope:'Opaque-image certificate, original MASK boundary, pathological fallback and five-sample gate; actual avatar pose comparison separate'}));
