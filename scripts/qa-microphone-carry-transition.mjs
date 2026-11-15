// Offline actual-avatar pose mathematics; no renderer or visual acceptance.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';
registerHooks({load(url,context,next){if(url.endsWith('.json'))return{format:'module',source:'export default '+readFileSync(new URL(url),'utf8'),shortCircuit:true};return next(url,context)}});
globalThis.location=new URL('http://geometry.local/');
const {loadGeometryAvatar,THREE}=await import('./headless-avatar-node.mjs');
const {microphoneCarryTarget,microphoneArmTarget,microphoneElbow}=await import('../prototype/src/microphone-pose.js');
const {MICROPHONE_PRESENTATION_FITS}=await import('../prototype/src/microphone-presentation-fits.js');
const V=THREE.Vector3,Q=THREE.Quaternion,sha=b=>createHash('sha256').update(b).digest('hex'),wp=b=>b.getWorldPosition(new V());
const out=path.resolve(process.argv[2]??'evidence/microphone-carry-transition-f7bdc3be3de4');await fs.mkdir(out,{recursive:true});
try{await fs.access(path.join(out,'report.json'));throw Error('Refuse existing report');}catch(e){if(e.code!=='ENOENT')throw e;}
const source={};for(const name of ['microphone-pose.js','microphone-presentation-fits.js','live-presentation.js']){const bytes=await fs.readFile('prototype/src/'+name);source[name]=sha(bytes);await fs.writeFile(path.join(out,name),bytes);}
const results=[];
for(const body of ['female','male']){
 const {avatar:a}=await loadGeometryAvatar(body);a.root.updateMatrixWorld(true);
 const fit=Object.values(MICROPHONE_PRESENTATION_FITS).find(x=>x.id==='microphone-use-'+body+'-v1');
 const gripBytes=await fs.readFile('prototype/public/assets/m1c/grips/'+body+'-source-grip-v1.json'),grip=JSON.parse(gripBytes);
 assert.equal(grip.compatibleAvatarSha256,fit.bodySha256,'Exact body/grip pairing');
 const bone=n=>a.vrm.humanoid.getNormalizedBoneNode(n),raw=n=>a.vrm.humanoid.getRawBoneNode(n);
 const shoulder=wp(bone('rightUpperArm')),elbow=wp(bone('rightLowerArm')),wrist=wp(bone('rightHand')),chest=wp(bone('upperChest')??bone('chest'));
 const lengths=[shoulder.distanceTo(elbow),elbow.distanceTo(wrist)],rawToNormalized=raw('rightHand').getWorldQuaternion(new Q()).invert().multiply(bone('rightHand').getWorldQuaternion(new Q()));
 const palmRaw=wp(raw('rightMiddleProximal')).sub(wp(raw('rightHand'))).normalize().applyQuaternion(raw('rightHand').getWorldQuaternion(new Q()).invert());
 const palmMic=palmRaw.clone().applyQuaternion(new Q(...grip.micRawHandLocal.quaternion).invert());assert.ok(palmMic.distanceTo(new V(1,0,0))<1e-6,'Original palm is not microphone +X');
 const mouth=raw('head').localToWorld(new V(...fit.mouthRawHeadLocal));
 function endpoints(yaw){const rotation=new Q().setFromAxisAngle(new V(0,1,0),yaw),rot=p=>p.clone().applyQuaternion(rotation),s=rot(shoulder),pole=rot(new V(-.35,-1,.15));
  const common={shoulder:s,lengths,pole,capsuleLocal:fit.capsuleLocal,mount:grip.micRawHandLocal,rawToNormalized};
  return{rotation,s,pole,carry:microphoneCarryTarget({...common,wrist:rot(chest.clone().add(new V(...fit.carryWristChestOffset))),up:rot(new V(0,1,0))}),talk:microphoneArmTarget({...common,capsule:rot(mouth.clone().add(new V(...fit.speakingTipOffset))),axis:rot(new V(...fit.speakingTipOffset).negate())})};
 }
 function sample(e,w){const at=e.carry.wrist.clone().lerp(e.talk.wrist,w),q=e.carry.handQuaternion.clone().slerp(e.talk.handQuaternion,w),arm=microphoneElbow(e.s,at,lengths,e.pole),forearm=arm.reachable.clone().sub(arm.elbow).normalize(),rawQ=q.clone().multiply(rawToNormalized.clone().invert()),palm=palmRaw.clone().applyQuaternion(rawQ);
  const angle=THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(forearm.dot(palm),-1,1)));
  const micQ=rawQ.clone().multiply(new Q(...grip.micRawHandLocal.quaternion)),origin=arm.reachable.clone().add(new V(...grip.micRawHandLocal.position).applyQuaternion(rawQ)),tip=new V(...fit.capsuleLocal).applyQuaternion(micQ).add(origin);
  return{w,wrist:at.toArray(),elbow:arm.elbow.toArray(),handQuaternion:q.toArray(),tip:tip.toArray(),angle,clamped:arm.clamped};
 }
 const base=endpoints(0),samples=Array.from({length:241},(_,i)=>sample(base,i/240)),orientations=[];
 for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI]){const e=endpoints(yaw);let maxPositionError=0,maxQuaternionError=0;for(let i=0;i<samples.length;i++){const r=sample(e,i/240),ref=samples[i];for(const key of ['wrist','elbow','tip'])maxPositionError=Math.max(maxPositionError,new V(...ref[key]).applyQuaternion(e.rotation).distanceTo(new V(...r[key])));const expected=e.rotation.clone().multiply(new Q(...ref.handQuaternion));maxQuaternionError=Math.max(maxQuaternionError,1-Math.abs(expected.dot(new Q(...r.handQuaternion))));}assert.ok(maxPositionError<1e-8&&maxQuaternionError<1e-10,'Root orientation covariance failed');orientations.push({yaw,maxPositionError,maxQuaternionError});}
 let weight=0,last=sample(base,0),maxWristStep=0,maxElbowStep=0,maxAngularStep=0;const transition=[];
 for(let i=0;i<240;i++){weight=THREE.MathUtils.damp(weight,i<120?1:0,fit.transitionRate,1/120);if(Math.abs(weight-(i<120?1:0))<1e-4)weight=i<120?1:0;const row=sample(base,weight);maxWristStep=Math.max(maxWristStep,new V(...row.wrist).distanceTo(new V(...last.wrist)));maxElbowStep=Math.max(maxElbowStep,new V(...row.elbow).distanceTo(new V(...last.elbow)));maxAngularStep=Math.max(maxAngularStep,new Q(...row.handQuaternion).angleTo(new Q(...last.handQuaternion)));transition.push({...row,i});last=row;}
 assert.ok(samples.every(x=>!x.clamped&&Number.isFinite(x.angle)),'Unreachable/nonfinite interpolated pose');assert.ok(samples[0].angle<1e-4,'Carry not neutral');assert.ok(Math.max(...samples.map(x=>x.angle))<=Math.max(samples[0].angle,samples.at(-1).angle)+1e-6,'Intermediate wrist overshoot');
 const result={body,bodySHA:fit.bodySha256,gripSHA:sha(gripBytes),lengths,palmMic:palmMic.toArray(),carryAngle:samples[0].angle,talkAngle:samples.at(-1).angle,maxIntermediateAngle:Math.max(...samples.map(x=>x.angle)),maxWristStep,maxElbowStep,maxHandAngularStepDegrees:THREE.MathUtils.radToDeg(maxAngularStep),orientations};results.push(result);await fs.writeFile(path.join(out,body+'-samples.json'),JSON.stringify({samples,transition}));a.dispose();
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'geometry-regression-pass',source,scriptSHA:sha(await fs.readFile(new URL(import.meta.url))),results,scope:'Actual F/M normalized/rest geometry and original raw grip. Production target helper and exact production lerp/slerp/damp formulas; 241 interpolation samples, 240 temporal samples, four yaw orientations. No rendered/live-room/sit-source/finger-skin or acoustic/visual acceptance. Report build f7bdc3be3de4 is context; source bytes separately pinned.',limitations:['Carry up projection is singular if forearm parallel to up; selected original-body fixtures are not singular.','Authored shoulder/head motion may alter interpolation and requires normal-speed room video.','HoldWeight equip/unequip author-pose blend and actual triangle collision are not tested here.']},null,2));
console.log(JSON.stringify({out,source,results},null,2));

