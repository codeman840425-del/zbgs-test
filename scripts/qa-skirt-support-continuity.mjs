// Regression for the measured hard-edge discontinuity, using actual room input.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {skirtSupportWeight,blendSkirtSupports,skirtLateralAxis} from '../prototype/src/skirt-support.js';
import {Vector3} from '../prototype/node_modules/three/build/three.module.js';
const dir='evidence/front-skirt-f7bdc3be3de4-coverage-full/';
const input=JSON.parse(fs.readFileSync(dir+'predicate-input.json','utf8'));
const events=JSON.parse(fs.readFileSync(dir+'predicate-continuity.json','utf8')).events;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const lerp=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
function sample(a,b,t){return {p:lerp(a.p,b.p,t),drape:a.drape+(b.drape-a.drape)*t,legs:a.legs.map((l,i)=>({a:lerp(l.a,b.legs[i].a,t),b:lerp(l.b,b.legs[i].b,t),radius:l.radius}))};}
function evaluate(q){
 const supports=q.legs.map(l=>{const axis=sub(l.b,l.a),n=Math.hypot(axis[2],axis[0]),h=n?[axis[2]/n,0,-axis[0]/n]:[0,0,0];
  const t=Math.max(0,Math.min(1,dot(sub(q.p,l.a),axis)/dot(axis,axis))),near=l.a.map((x,i)=>x+axis[i]*t),lateral=Math.abs(dot(sub(q.p,near),h));
  return {height:near[1]+Math.sqrt(Math.max(0,l.radius*l.radius-lateral*lateral))+.004,weight:skirtSupportWeight(lateral,l.radius),old:lateral<l.radius*1.1};});
 const covered=supports.filter(s=>s.old),surface=covered.length?Math.max(...covered.map(s=>s.height)):q.p[1];
 return {old:q.p[1]+(surface-q.p[1])*q.drape,new:blendSkirtSupports(q.p[1],supports[0].height,supports[0].weight,supports[1].height,supports[1].weight,q.drape)};
}
const results=events.map(e=>{const a=input.rows[e.frameIndex],b=input.rows[e.frameIndex+1],x=evaluate(sample(a,b,e.t-1e-8)),y=evaluate(sample(a,b,e.t+1e-8));return {frameIndex:e.frameIndex,oldJumpM:Math.abs(y.old-x.old),newJumpM:Math.abs(y.new-x.new)};});
assert(results.length>0);assert(Math.max(...results.map(r=>r.oldJumpM))>.05,'Fixture must retain the confirmed old failure');
assert(Math.max(...results.map(r=>r.newJumpM))<1e-6,'Continuous inputs cannot produce centimetre support jumps');
for(const r of [.05,.086817,.15]){assert.equal(skirtSupportWeight(0,r),1);assert.equal(skirtSupportWeight(1.1*r,r),0);assert(Math.abs(skirtSupportWeight(r,r)-1)<1e-12);}
assert.equal(blendSkirtSupports(.6,.8,1,.7,1,1),.8);
assert.equal(blendSkirtSupports(.9,.8,1,.7,1,1),.8);
assert.equal(blendSkirtSupports(.6,.8,0,.7,0,1),.6);
let oldAxisMaxDegrees=0,newAxisMaxDegrees=0,previous;
for(const row of input.rows){
 const across=new Vector3().fromArray(row.legs[1].a).sub(new Vector3().fromArray(row.legs[0].a));
 const axes=row.legs.map(l=>{const axis=new Vector3().fromArray(l.b).sub(new Vector3().fromArray(l.a));
  const next=skirtLateralAxis(axis,across,new Vector3());
  assert(Math.abs(next.dot(axis))<1e-12);assert(Math.abs(next.length()-1)<1e-12);
  return {old:new Vector3(axis.z,0,-axis.x).normalize(),next};});
 if(previous)for(let k=0;k<2;k++){
  const angle=(a,b)=>Math.acos(Math.min(1,Math.abs(a.dot(b))))*180/Math.PI;
  oldAxisMaxDegrees=Math.max(oldAxisMaxDegrees,angle(axes[k].old,previous[k].old));
  newAxisMaxDegrees=Math.max(newAxisMaxDegrees,angle(axes[k].next,previous[k].next));
 }
 previous=axes;
}
assert(oldAxisMaxDegrees>80,'Must retain the observed nearly vertical axis failure');
assert(newAxisMaxDegrees<2,'Anatomical axis must stay continuous on this complete captured stride');
console.log(JSON.stringify({status:'pass',scope:'Actual captured support boundaries and lateral axes only; not complete mesh or collision acceptance',oldAxisMaxDegrees,newAxisMaxDegrees,results},null,2));
