import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {createOpaqueAlphaProof} from '../source/opaque-alpha-proof.mjs';
import {prepareAlphaTriangle,alphaBarycentricPrepared} from '../../../prototype/src/forearm-contact-workspace.js';
const proof=createOpaqueAlphaProof(),bary=new THREE.Vector3();
let checks=0,shortcuts=0,fallbacks=0,seed=117;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function reference(t,p){
  alphaBarycentricPrepared(t,p,bary);const v=t.uvValues,a=t.alpha;
  const u=0+v[0]*bary.x+v[2]*bary.y+v[4]*bary.z,w=0+v[1]*bary.x+v[3]*bary.y+v[5]*bary.z;
  const x=Math.max(0,Math.min(a.width-1,Math.floor(u*a.width))),y=Math.max(0,Math.min(a.height-1,Math.floor((a.flip?1-w:w)*a.height)));
  return a.pixels[(y*a.width+x)*4+3]/255>=a.cutoff;
}
function triangle(points,uv,alpha){const t={points:points.map(p=>new THREE.Vector3(...p)),uvValues:uv,alpha,alphaEdge0:new THREE.Vector3(),alphaEdge1:new THREE.Vector3(),alphaDelta:new THREE.Vector3()};prepareAlphaTriangle(t);proof.prepare(t);return t;}
function check(t,p){const actual=proof.opaque(t,p);if(actual){shortcuts++;assert.equal(reference(t,p),true,'Proof may never skip a reference-transparent sample');}else fallbacks++;checks++;}
const textures=[];
for(const flip of [false,true])for(const cutoff of [.5,1,1.01]){
 const pixels=new Uint8ClampedArray(16*16*4).fill(255);textures.push({pixels,width:16,height:16,cutoff,flip});
 const hole=pixels.slice();hole[(7*16+8)*4+3]=0;hole[(8*16+8)*4+3]=127;hole[(9*16+8)*4+3]=128;textures.push({pixels:hole,width:16,height:16,cutoff,flip});
}
// Optional actual texture extracted byte-for-byte from the source GLB; no sparse opacity guess.
const input=process.argv[2];if(input){const j=JSON.parse(fs.readFileSync(input));textures.push({...j,pixels:Uint8ClampedArray.from(Buffer.from(j.rgbaBase64,'base64'))});textures.push({...textures.at(-1),flip:!j.flip});}
for(const a of textures)for(let i=0;i<90;i++){
 const origin=[(rand()-.5)*6,rand()*2,rand()*6],size=.002+rand()*.3;
 const pts=[origin,origin.map(x=>x+size*(rand()-.5)),origin.map(x=>x+size*(rand()-.5))];
 if(i%10===0)pts[2]=pts[1].slice(); // exact degenerate
 if(i%10===1)pts[2]=pts[1].map((x,k)=>x+(k===1?1e-14:0)); // ill-conditioned
 const uv=Array.from({length:6},()=>rand()*2-.5),t=triangle(pts,uv,a);
 if(i%10<=1)assert.equal(t.opaqueAlphaBounds,null,'Unstable triangle must keep reference');
 for(let k=0;k<100;k++){
  const p=new THREE.Vector3(...[0,1,2].map(axis=>{const lo=Math.min(...pts.map(p=>p[axis])),hi=Math.max(...pts.map(p=>p[axis]));return lo+(hi-lo)*rand();}));check(t,p);
 }
 for(const p of t.points){check(t,p);check(t,p.clone().addScalar(Number.EPSILON));}
}
// Known opaque successful fast path, transparent region and degenerate UV0 behavior.
const a=textures[0],t=triangle([[0,0,0],[1,0,0],[0,1,0]],[.2,.2,.3,.2,.2,.3],a);
assert(proof.opaque(t,new THREE.Vector3(.2,.3,0)));assert(!proof.opaque(t,new THREE.Vector3(.2,.3,1e-16)));
// Exact integer pixel boundaries, signed clamp and ulp neighbours.
for(const flip of [false,true])for(const value of [-2,-Number.EPSILON,0,1/16,1,2])for(const eps of [-Number.EPSILON,0,Number.EPSILON]){
 const alpha={...textures[1],flip},u=value+eps;
 const tri=triangle([[0,0,0],[1,0,0],[0,1,0]],[u,u,u,u,u,u],alpha);
 for(const p of [new THREE.Vector3(0,0,0),new THREE.Vector3(.25,.25,0),new THREE.Vector3(1,1,0)])check(tri,p);
}
// Cache replacements: each fresh prepare must reflect new source fields.
const changing={...textures[0],pixels:textures[0].pixels.slice()},ct=triangle([[0,0,0],[1,0,0],[0,1,0]],[0,0,0,0,0,0],changing);
assert(proof.opaque(ct,new THREE.Vector3(.2,.2,0)));
changing.pixels=new Uint8ClampedArray(16*16*4);proof.prepare(ct);assert(!proof.opaque(ct,new THREE.Vector3(.2,.2,0)));
changing.cutoff=0.0001;changing.flip=true;proof.prepare(ct);check(ct,new THREE.Vector3(.2,.2,0));
changing.width=8;changing.height=32;proof.prepare(ct);check(ct,new THREE.Vector3(.2,.2,0));
assert(shortcuts>0&&fallbacks>0);
const report={passed:true,checks,shortcuts,fallbacks,stats:proof.stats,textureInput:input||null,helperSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../source/opaque-alpha-proof.mjs',import.meta.url))).digest('hex'),scope:'Reference alpha equivalence at sampled queries plus conservative proof audit; not pose or runtime performance acceptance'};
console.log(JSON.stringify(report,null,2));
