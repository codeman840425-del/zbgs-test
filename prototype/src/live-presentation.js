import {createEyeBlinkCompatibility} from './eye-blink-compatibility.js';
import {fitGlassesTemples,glassesFitMode,glassesProfileForBody} from './glasses-temple-fit.js';
import {assertGlassesHeadDependency} from './glasses-head-dependency.js';
import {readGlassesTarget,assertAccessoryTransactionCommit} from './accessory-transaction-context.js';
import {microphoneArmTarget,microphoneCarryTarget,microphoneElbow} from './microphone-pose.js';
import {MICROPHONE_PRESENTATION_FITS} from './microphone-presentation-fits.js';
import * as THREE from 'three';
import {createGreetingLayer} from './greeting-layer.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const V=THREE.Vector3,Q=THREE.Quaternion;
const IDS={mic:'studio-microphone-v1',glasses:'studio-glasses-v1'};
const clamp=THREE.MathUtils.clamp;
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const wp=b=>b.getWorldPosition(new V());
function disposeObject(object){
 if(!object)return;object.removeFromParent();const geometries=new Set(),materials=new Set(),textures=new Set();
 object.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());
}
function orientSegment(bone,child,target){
 const at=wp(bone),from=wp(child).sub(at).normalize(),to=target.clone().sub(at).normalize();
 const delta=new Q().setFromUnitVectors(from,to),world=bone.getWorldQuaternion(new Q()),parent=bone.parent.getWorldQuaternion(new Q());
 bone.quaternion.copy(parent.invert().multiply(delta).multiply(world));bone.updateWorldMatrix(true,true);
}
/** Independent per-avatar live layer. Call after motion, before vrm.update;
 * postUpdate follows raw-bone/world-matrix synchronization. No audio input. */
export function createLivePresentation({vrm,root,bodyType='female',avatarSha256=null,getHeadState}){
 if(!vrm?.humanoid||!root)throw new TypeError('Loaded VRM and world root required');
 const greeting=createGreetingLayer({vrm});
 const bone=name=>vrm.humanoid.getNormalizedBoneNode(name),raw=name=>vrm.humanoid.getRawBoneNode(name);
 const arm={upper:bone('rightUpperArm'),lower:bone('rightLowerArm'),hand:bone('rightHand')};
 const head=raw('head'),leftEye=raw('leftEye'),rightEye=raw('rightEye');
 if(!head||!arm.upper||!arm.lower||!arm.hand)throw new Error('Required humanoid head/right arm semantics missing');
 root.updateMatrixWorld(true);
 const armLengths=[wp(arm.upper).distanceTo(wp(arm.lower)),wp(arm.lower).distanceTo(wp(arm.hand))];
 const finger=part=>bone('right'+part),middle=finger('MiddleProximal'),index=finger('IndexProximal'),little=finger('LittleProximal');
 if(!middle||!index||!little)throw new Error('Microphone requires humanoid right finger semantics');
 const rootRestQ=root.getWorldQuaternion(new Q()),rawHeadRestQ=head.getWorldQuaternion(new Q());
 const headToFrame=rawHeadRestQ.clone().invert().multiply(rootRestQ);
 const handRestQ=arm.hand.getWorldQuaternion(new Q());
 const microphoneFit=MICROPHONE_PRESENTATION_FITS[avatarSha256]??null;
 const normalizedHead=bone('head'),chest=bone('upperChest')??bone('chest');
 const normalizedHeadToFrame=normalizedHead.getWorldQuaternion(new Q()).invert().multiply(rootRestQ);
 const rawHandToNormalized=raw('rightHand').getWorldQuaternion(new Q()).invert().multiply(handRestQ);
 const mouthLocal=microphoneFit?normalizedHead.worldToLocal(head.localToWorld(new V(...microphoneFit.mouthRawHeadLocal))):null;
 const restForward=wp(middle).sub(wp(arm.hand)).normalize(),restAcross=wp(index).sub(wp(little)).normalize();
 restAcross.addScaledVector(restForward,-restAcross.dot(restForward)).normalize();
 const palmNormal=new V().crossVectors(restAcross,restForward).normalize();
 const fingers=[];
 for(const name of ['Index','Middle','Ring','Little'])for(const [segment,angle]of [['Proximal',.75],['Intermediate',1.08],['Distal',.7]]){
  const b=finger(name+segment);if(!b)continue;
  const child=b.children.find(x=>x.isBone),forward=child?wp(child).sub(wp(b)).normalize():restForward.clone();
  const hinge=new V().crossVectors(forward,palmNormal).normalize().applyQuaternion(b.getWorldQuaternion(new Q()).invert());
  fingers.push({name:'right'+name+segment,bone:b,rest:b.quaternion.clone(),axis:hinge,angle});
 }
 for(const [segment,angle]of [['Metacarpal',.45],['Proximal',.6],['Distal',.7]]){
  const b=finger('Thumb'+segment);if(!b)continue;
  const child=b.children.find(x=>x.isBone),forward=child?wp(child).sub(wp(b)).normalize():restForward.clone();
  const hinge=new V().crossVectors(forward,palmNormal).normalize().applyQuaternion(b.getWorldQuaternion(new Q()).invert());
  fingers.push({name:'rightThumb'+segment,bone:b,rest:b.quaternion.clone(),axis:hinge,angle});
 }
 const eyesMid=leftEye&&rightEye?wp(leftEye).add(wp(rightEye)).multiplyScalar(.5):wp(head).add(new V(0,.055,.06).applyQuaternion(rootRestQ));
 let eyeSpacing=leftEye&&rightEye?wp(leftEye).distanceTo(wp(rightEye)):.064;
 let eyeAnchor=eyesMid.clone(),glassesForward=.025,eyeFitMethod='humanoid-eye-pivot-fallback';
 // Eye bones are rotation pivots inside the head, not the visible eye plane.
 // Fit this source family once from its actual rendered iris/face geometry,
 // then store the bridge in the real raw-head frame for every later pose.
 const headAtRest=wp(head),frameInverse=rootRestQ.clone().invert(),iris=[new THREE.Box3(),new THREE.Box3()],skin=[];
 vrm.scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const isIris=materials.some(m=>/_EyeIris_/.test(m.name)),isSkin=materials.some(m=>/_Face_.*SKIN/.test(m.name));if(!isIris&&!isSkin)return;
  const ids=new Set(mesh.geometry.index?.array??Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i));
  for(const i of ids){const point=mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld).sub(headAtRest).applyQuaternion(frameInverse);if(isIris)iris[point.x<0?0:1].expandByPoint(point);if(isSkin)skin.push(point);}
 });
 if(iris.every(b=>!b.isEmpty())){
  const centers=iris.map(b=>b.getCenter(new V())),mid=centers[0].clone().add(centers[1]).multiplyScalar(.5);eyeSpacing=Math.abs(centers[1].x-centers[0].x);
  let front=mid.z;for(const p of skin)if(Math.abs(p.y-mid.y)<.02&&Math.abs(p.x-mid.x)<eyeSpacing*.9)front=Math.max(front,p.z);
  glassesForward=front-mid.z+.004;eyeAnchor=mid.applyQuaternion(rootRestQ).add(headAtRest);eyeFitMethod='rendered-iris-centers-and-face-front-band';
 }
 const eyeLocal=head.worldToLocal(eyeAnchor.clone());
 const fit={glassesForward,glassesUp:0,glassesScale:clamp(eyeSpacing/.064,.8,1.5),micScale:1,eyeFitMethod};
 const mount=new THREE.Group();mount.name='LivePresentation:'+bodyType;root.add(mount);
  const slots=Object.fromEntries(Object.keys(IDS).map(k=>[k,{version:0,requested:false,object:null,abort:null,pending:null,error:null,status:'off',entry:null,identity:null}]));
 let manifestPromise=null,gripProfile=null,disposed=false,time=0,preset='neutral',speaking=false,gaze=null,currentAction='idle',holdWeight=0,talkHoldWeight=0,armMetrics=null;
 const oldLookAt=vrm.lookAt?{autoUpdate:vrm.lookAt.autoUpdate,target:vrm.lookAt.target}:null;
 if(vrm.lookAt){vrm.lookAt.autoUpdate=false;vrm.lookAt.target=null;}
 const facialKeys=['happy','aa','ih','ou','ee','oh','blink'];
 const eyeBlinkCompatibility=createEyeBlinkCompatibility({vrm,avatarSha256});
  const micRequestedOrPreparing=()=>slots.mic.requested||Boolean(slots.mic.pending?.desired);
  function canPerform(action){return action==='dance'&&micRequestedOrPreparing()?{allowed:false,reason:'持麦舞蹈尚未制作；请先卸下麦克风。'}:{allowed:true};}
 async function manifest(){
  if(!manifestPromise)manifestPromise=fetch('/assets/m1c/accessories.json',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Accessory manifest HTTP '+response.status);const data=await response.json();if(data.schema!=='zbgs-accessory-candidate-v1'||!Array.isArray(data.items))throw Error('Unsupported accessory manifest');return data;}).catch(e=>{manifestPromise=null;throw e;});
  return manifestPromise;
 }
 async function loadGrip(signal){
  if(gripProfile)return gripProfile;
  const response=await fetch('/assets/m1c/grips/manifest.json',{signal,cache:'no-store'});
  if(!response.ok)throw Error('Grip manifest HTTP '+response.status);
  const manifest=await response.json();if(manifest.schema!=='zbgs-grip-profile-manifest-v1'||!Array.isArray(manifest.items))throw Error('Invalid grip manifest');
  const entry=manifest.items.find(x=>x.compatibleAvatarSha256===avatarSha256);
  if(!entry)throw Error('当前基模尚未完成握麦姿态适配；麦克风暂不可用。');
  if(!Number.isInteger(entry.bytes)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid grip identity');
  const file=await fetch(entry.url,{signal});if(!file.ok)throw Error('Grip profile HTTP '+file.status);
  const bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('Grip profile integrity check failed');
  const profile=JSON.parse(new TextDecoder().decode(bytes));
  const finite=(array,n)=>Array.isArray(array)&&array.length===n&&array.every(Number.isFinite);
  if(profile.schema!=='zbgs-grip-profile-v1'||profile.compatibleAvatarSha256!==avatarSha256||profile.accessoryId!==IDS.mic||!/^[a-f0-9]{64}$/.test(profile.compatibleAccessorySha256)||!finite(profile.micRawHandLocal?.position,3)||!finite(profile.micRawHandLocal?.quaternion,4)||fingers.some(f=>!finite(profile.normalizedFingerRotations?.[f.name],4)))throw Error('Grip profile binding mismatch');
  if(!microphoneFit||microphoneFit.microphoneSha256!==profile.compatibleAccessorySha256)throw Error('Microphone presentation fit binding mismatch');
  for(const values of [profile.micRawHandLocal.quaternion,...Object.values(profile.normalizedFingerRotations)])if(Math.abs(Math.hypot(...values)-1)>1e-4)throw Error('Grip quaternion is not normalized');
  return {...profile,sha256:hash};
 }
  function slotSettledStatus(slot){return slot.object&&slot.requested?'on':'off';}
  // Associate the requirement with this actual load. URL changes and failed
  // replacements cannot change the requirement of a mounted or staged object.
  const headDependencies=new WeakMap();
  function assertHeadChange(change,accessoryTransaction){
   const slot=slots.glasses,target=readGlassesTarget(accessoryTransaction,avatarSha256,vrm);
   if(target?.enabled===false)return;
   const mounted=headDependencies.get(slot.object)?.dependency,pending=headDependencies.get(slot.pending);
   const dependencies=target?.enabled
    ? [slot.object?mounted:glassesProfileForBody(avatarSha256)?.headDependency]
    : [mounted,accessoryTransaction&&pending?.owner===accessoryTransaction?undefined:pending?.dependency];
   for(const dependency of dependencies){
    if(dependency===undefined)continue;
    const state=target??getHeadState?.();
    assertGlassesHeadDependency(dependency,change.appearance??state?.appearance,change.geometry??state?.geometry);
   }
  }
  function accessoryRestriction(kind,desired){
   if(kind!=='mic'||!desired)return null;
   if(greeting.busy())return'招手与持麦组合尚未验证，请等待招手结束。';
   if(currentAction==='dance')return'持麦舞蹈尚未制作；请先停止舞蹈。';
   return null;
  }
  function assertAccessoryIdentity(candidate){
   const identity=candidate.identity,entry=candidate.entry;
   if(!identity||identity.bodySHA256!==avatarSha256||identity.accessorySHA256!==entry.sha256)
    throw Error('Live accessory body/resource identity mismatch');
   if(candidate.kind==='mic'){
    const profile=candidate.profile;
    if(!profile||profile.compatibleAvatarSha256!==avatarSha256||profile.compatibleAccessorySha256!==entry.sha256||
      identity.fit?.id!==profile.id||identity.fit?.sha256!==profile.sha256||identity.fit?.fitVersion!==profile.fitVersion)
      throw Error('Microphone grip identity mismatch');
   }else if(candidate.kind==='glasses'){
    const fit=identity.fit;
    if(!fit||fit.bodySHA256!==avatarSha256||fit.accessorySHA256!==entry.sha256||!fit.id)
      throw Error('Glasses fit identity mismatch');
   }
  }
  /** Prepare one live prop without touching the currently committed prop or pose. */
  async function prepareAccessory(kind,value,{accessoryTransaction}={}){
   if(disposed)throw Error('Live presentation disposed');
   const slot=slots[kind];if(!slot)throw Error('Unknown accessory '+kind);
   const desired=Boolean(value),restriction=accessoryRestriction(kind,desired);
   if(restriction)return{applied:false,reason:restriction};
   // A newer intent cancels only an older uncommitted preparation. Mounted
   // objects stay untouched until the returned transaction commits.
   slot.pending?.release?.();
   const version=++slot.version,controller=new AbortController();
   const candidate={kind,desired,version,controller,object:null,profile:null,entry:null,identity:null,cached:false,live:true,committed:false,finalized:false,commitError:null,finalize:()=>{},rollback:null};
   candidate.releasesHeadDependency=kind==='glasses'&&!desired&&headDependencies.has(slot.object);
   const mode=kind==='glasses'&&desired?glassesFitMode():null;
   const headDependency=kind==='glasses'&&desired
    ? (slot.object?headDependencies.get(slot.object)?.dependency:glassesProfileForBody(avatarSha256,mode)?.headDependency):undefined;
   if(headDependency!==undefined)headDependencies.set(candidate,{dependency:headDependency,owner:accessoryTransaction});
   const checkHead=()=>{
    if(headDependency===undefined)return;
    const target=readGlassesTarget(accessoryTransaction,avatarSha256,vrm);
    const state=target??getHeadState?.();
    assertGlassesHeadDependency(headDependency,state?.appearance,state?.geometry);
   };
   slot.pending=candidate;slot.abort=controller;slot.error=null;slot.status='loading';
   candidate.isCurrent=()=>candidate.live&&!disposed&&slot.version===version&&slot.pending===candidate;
   candidate.ensureCurrent=()=>{if(!candidate.isCurrent())throw new DOMException('Stale live accessory preparation','AbortError');};
   candidate.release=()=>{
    if(candidate.committed){candidate.finalize();return;}
    if(!candidate.live)return;
    candidate.live=false;controller.abort();
    if(slot.pending===candidate){slot.pending=null;if(slot.abort===controller)slot.abort=null;slot.status=slotSettledStatus(slot);}
    if(candidate.object){disposeObject(candidate.object);candidate.object=null;}
   };
   candidate.rollback=()=>candidate.release();
   candidate.validateCommit=()=>{
    if(!candidate.isCurrent())throw Error('Live accessory preparation expired');
    checkHead();
    const recheck=accessoryRestriction(kind,desired);if(recheck)throw Error(recheck);
    if(desired){assertAccessoryIdentity(candidate);if(!candidate.cached&&!candidate.object)throw Error('Live accessory resource missing');}
    return true;
   };
   candidate.commit=()=>{
    assertAccessoryTransactionCommit(accessoryTransaction,vrm);
    candidate.validateCommit();
    const previous=slot.object,previousEntry=slot.entry,previousIdentity=slot.identity,previousRequested=slot.requested,
      previousError=slot.error,previousGripProfile=gripProfile;
    candidate.previousState={object:previous,entry:previousEntry,identity:previousIdentity,requested:previousRequested,error:previousError,gripProfile:previousGripProfile};
    let installedObject=null;
    try{
     if(desired){
      if(!candidate.cached)candidate.object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
      if(!candidate.cached){slot.object=candidate.object;candidate.object=null;installedObject=slot.object;mount.add(slot.object);}
      slot.entry=candidate.entry;slot.identity=candidate.identity;slot.requested=true;slot.error=null;slot.status='on';
      if(kind==='mic'&&!candidate.cached)gripProfile=candidate.profile;
     }else{
      slot.object=null;slot.entry=null;slot.identity=null;slot.requested=false;slot.error=null;slot.status='off';
     }
     postUpdate();
    }
    catch(error){
     if(installedObject){installedObject.removeFromParent();disposeObject(installedObject);installedObject=null;}
     else if(!candidate.cached&&candidate.object){disposeObject(candidate.object);candidate.object=null;}
     slot.object=previous;slot.entry=previousEntry;slot.identity=previousIdentity;slot.requested=previousRequested;slot.status=slotSettledStatus(slot);slot.error=String(error.message||error)||previousError;gripProfile=previousGripProfile;
     candidate.commitError=error;
     candidate.live=false;slot.pending=null;if(slot.abort===controller)slot.abort=null;
     throw error;
    }
    candidate.live=false;candidate.committed=true;slot.pending=null;if(slot.abort===controller)slot.abort=null;
    candidate.rollback=()=>{
     if(candidate.finalized)throw Error('Live accessory update already finalized');
     if(!candidate.committed)return candidate.release();
     if(!candidate.cached&&slot.object){const failed=slot.object;failed.removeFromParent();disposeObject(failed);}
     slot.object=previous;slot.entry=previousEntry;slot.identity=previousIdentity;slot.requested=previousRequested;slot.error=previousError;slot.status=slotSettledStatus(slot);gripProfile=previousGripProfile;
     candidate.committed=false;candidate.finalized=true;
    };
    // Keep the old resource until the caller releases the committed update.
    // This gives a multi-domain coordinator a synchronous rollback window.
    candidate.finalize=()=>{if(candidate.finalized)return;candidate.finalized=true;if(previous&&previous!==slot.object)disposeObject(previous);};
    return{applied:true,...(desired?{sha256:candidate.identity.accessorySHA256,identity:structuredClone(candidate.identity),...(candidate.cached?{cached:true}:{})}:{})};
   };
   try{
    checkHead();
    if(desired&&slot.object&&slot.requested){
     candidate.cached=true;candidate.entry=slot.entry;candidate.identity=slot.identity;candidate.profile=kind==='mic'?gripProfile:null;
     candidate.validateCommit();return candidate;
    }
    if(!desired){
     candidate.entry=slot.entry;
     candidate.identity=slot.identity??{bodySHA256:avatarSha256,accessorySHA256:slot.entry?.sha256??null,fit:null};
     return candidate;
    }
    if(kind==='mic'){candidate.profile=await loadGrip(controller.signal);candidate.ensureCurrent();}
    const data=await manifest();candidate.ensureCurrent();
    const entry=data.items.find(x=>x.id===IDS[kind]);
    if(!entry||!Number.isInteger(entry.bytes)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid accessory identity');
    candidate.entry=entry;
    if(kind==='mic'&&entry.sha256!==candidate.profile.compatibleAccessorySha256)throw Error('Microphone version does not match fitted grip profile');
    const response=await fetch(entry.url,{signal:controller.signal});if(!response.ok)throw Error('Accessory HTTP '+response.status);const bytes=await response.arrayBuffer();candidate.ensureCurrent();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('Accessory integrity check failed: '+entry.id);
    const gltf=await new GLTFLoader().parseAsync(bytes,new URL('.',new URL(entry.url,window.location.href)).href);
    // Assign before the freshness check so a parse that completes after an
    // abort still enters the candidate cleanup path and cannot leak its scene.
    candidate.object=gltf.scene;candidate.ensureCurrent();candidate.object.name='LiveAccessory:'+kind;
    let fitIdentity=kind==='mic'?{id:candidate.profile.id,sha256:candidate.profile.sha256,fitVersion:candidate.profile.fitVersion,bodySHA256:avatarSha256,accessorySHA256:hash}:null;
    if(kind==='glasses'&&mode!=='legacy'){
     fitIdentity=await fitGlassesTemples(candidate.object,{bodySHA256:avatarSha256,accessorySHA256:hash,signal:controller.signal,mode});candidate.ensureCurrent();candidate.object.userData.templeFit=fitIdentity;
     if(headDependency!==undefined)headDependencies.set(candidate.object,{dependency:headDependency});
    }else if(kind==='glasses'){
     // Retain the historical diagnostic branch for source-measurement runs.
     // Production character records require a fitted profile SHA and reject
     // this explicit legacy identity during record admission.
     fitIdentity={id:'legacy-glasses-fit-v1',sha256:null,bodySHA256:avatarSha256,accessorySHA256:hash,verified:false};
     candidate.object.userData.templeFit=fitIdentity;
    }
    candidate.identity={bodySHA256:avatarSha256,accessorySHA256:hash,fit:fitIdentity};
    candidate.ensureCurrent();
    return candidate;
   }catch(e){
    if(candidate.object){disposeObject(candidate.object);candidate.object=null;}
    if(disposed||!candidate.isCurrent()||e.name==='AbortError'){candidate.release();return{applied:false,cancelled:true};}
    slot.pending=null;if(slot.abort===controller)slot.abort=null;slot.error=String(e.message||e);slot.status=slotSettledStatus(slot);candidate.live=false;throw e;
   }
  }
  async function setAccessory(kind,value){
   const update=await prepareAccessory(kind,value);if(!update?.commit)return update;
   try{update.validateCommit();return update.commit();}
   catch(e){const restriction=accessoryRestriction(kind,Boolean(value));if(update.commitError)throw update.commitError;if(restriction&&update.isCurrent())return{applied:false,reason:restriction};if(!update.isCurrent())return{applied:false,cancelled:true};throw e;}
   finally{update.release();}
  }
 function preUpdate(dt,{action='idle'}={}){
  if(disposed)return;if(!Number.isFinite(dt)||dt<0)throw RangeError('Live dt must be finite and nonnegative');time+=dt;currentAction=action;
  if(!['idle','sit'].includes(action))greeting.cancel({immediate:true});
  greeting.update(dt);
  const expressions=vrm.expressionManager;
  for(const key of facialKeys)expressions?.setValue(key,0);
  expressions?.setValue('happy',preset==='happy'?.65:0);
  if(speaking){const syllable=time/.27,phase=syllable%1,key=['aa','ih','ou','ee','oh'][Math.floor(syllable)%5];expressions?.setValue(key,.66*Math.sin(Math.PI*phase)**2);}
  else expressions?.setValue('aa',preset==='aa'?.65:0);
  const blink=time%3.6;expressions?.setValue('blink',blink<.18?Math.sin(blink/.18*Math.PI):0);
  eyeBlinkCompatibility.update();
  const target=slots.mic.object&&slots.mic.requested?1:0;holdWeight=THREE.MathUtils.damp(holdWeight,target,14,dt);if(Math.abs(holdWeight-target)<1e-4)holdWeight=target;
  const talkingTarget=target&&speaking&&['idle','sit'].includes(action)?1:0;
  talkHoldWeight=THREE.MathUtils.damp(talkHoldWeight,talkingTarget,microphoneFit?.transitionRate??10,dt);
  if(Math.abs(talkHoldWeight-talkingTarget)<1e-4)talkHoldWeight=talkingTarget;
  if(holdWeight>0){
   root.updateMatrixWorld(true);const authored=[arm.upper.quaternion.clone(),arm.lower.quaternion.clone(),arm.hand.quaternion.clone()];
   const rootQ=root.getWorldQuaternion(new Q()),shoulder=wp(arm.upper);
   // Use this substep's normalized pose. Raw bones are synchronized later by
   // vrm.update, so sampling the previous raw head here would introduce lag.
   const mouth=normalizedHead.localToWorld(mouthLocal.clone());
   const headFrame=normalizedHead.getWorldQuaternion(new Q()).multiply(normalizedHeadToFrame);
   const talkingTip=mouth.clone().add(new V(...microphoneFit.speakingTipOffset).applyQuaternion(headFrame));
   const carriedWrist=wp(chest).add(new V(...microphoneFit.carryWristChestOffset).applyQuaternion(rootQ));
   const pole=new V(-.35,-1,.15).applyQuaternion(rootQ);
   const shared={capsuleLocal:microphoneFit.capsuleLocal,mount:gripProfile.micRawHandLocal,rawToNormalized:rawHandToNormalized,shoulder,lengths:armLengths,pole};
   // The source grip's microphone X follows the palm's long direction. Choose
   // its free roll from the reaching arm, not the room X axis (which forced
   // a sideways wrist bend when the capsule was tilted toward the mouth).
   const carried=microphoneCarryTarget({...shared,wrist:carriedWrist,up:new V(0,1,0).applyQuaternion(rootQ)});
   const carriedTip=carried.capsule;
   const talking=microphoneArmTarget({...shared,capsule:talkingTip,axis:mouth.clone().sub(talkingTip)});
   const desiredHandQ=carried.handQuaternion.slerp(talking.handQuaternion,talkHoldWeight);
   const wrist=carried.wrist.lerp(talking.wrist,talkHoldWeight);
   const {elbow,reachable,clamped:reachClamped}=microphoneElbow(shoulder,wrist,armLengths,pole);
   orientSegment(arm.upper,arm.lower,elbow);orientSegment(arm.lower,arm.hand,reachable);arm.hand.quaternion.copy(arm.hand.parent.getWorldQuaternion(new Q()).invert().multiply(desiredHandQ));
   for(const [i,b]of [arm.upper,arm.lower,arm.hand].entries())b.quaternion.copy(authored[i].slerp(b.quaternion,holdWeight));
   arm.hand.updateWorldMatrix(true,true);armMetrics={desiredGrip:talkingTip.toArray(),desiredWrist:wrist.toArray(),actualWrist:wp(arm.hand).toArray(),mouth:mouth.toArray(),talkingTip:talkingTip.toArray(),carryTip:carriedTip.toArray(),talkHoldWeight,reachClamped,weight:holdWeight,presentationFit:microphoneFit.id};
  }else armMetrics=null;
  // Capture the current authored finger pose after motion. Talking clips can
  // animate these joints; an unloaded live layer must not reset them to rest.
  // The motion owner restores its full authored humanoid pose before this pass.
  for(const f of fingers){
   f.authored=f.bone.quaternion.clone();
   if(holdWeight>0){const values=gripProfile?.normalizedFingerRotations[f.name];const grip=values?new Q(...values):f.rest.clone().multiply(new Q().setFromAxisAngle(f.axis,f.angle));f.bone.quaternion.slerp(grip,holdWeight);}
  }
 }
 function attachWorld(object,position,quaternion,scale){
  mount.updateWorldMatrix(true,false);object.position.copy(mount.worldToLocal(position));object.quaternion.copy(mount.getWorldQuaternion(new Q()).invert().multiply(quaternion));object.scale.setScalar(scale);object.updateMatrixWorld(true);
 }
 function postUpdate(){
  if(disposed)return;root.updateMatrixWorld(true);
  if(vrm.lookAt){if(gaze)vrm.lookAt.lookAt(gaze);else vrm.lookAt.reset();vrm.lookAt.update(0);}
  if(slots.glasses.object){const frameQ=head.getWorldQuaternion(new Q()).multiply(headToFrame),bridge=head.localToWorld(eyeLocal.clone()).add(new V(0,fit.glassesUp,fit.glassesForward).applyQuaternion(frameQ));attachWorld(slots.glasses.object,bridge,frameQ,fit.glassesScale);}
  if(slots.mic.object){
   const hand=raw('rightHand'),mount=gripProfile.micRawHandLocal;
   const grip=hand.localToWorld(new V(...mount.position)),q=hand.getWorldQuaternion(new Q()).multiply(new Q(...mount.quaternion));attachWorld(slots.mic.object,grip,q,fit.micScale);
  }
  root.updateMatrixWorld(true);
 }
 // Admission and execution share the same real hand-layer readiness. Removing
 // the prop is immediate, but its arm pose still needs to blend out.
  const canStartGreeting=()=>['idle','sit'].includes(currentAction)&&!micRequestedOrPreparing()&&holdWeight<=.001;
  return{preUpdate,postUpdate,setAccessory,prepareAccessory,assertHeadChange,canPerform,canStartGreeting,
  setEyeBlinkCompatibility:mode=>eyeBlinkCompatibility.setMode(mode),
  refreshEyeBlinkCompatibility(){eyeBlinkCompatibility.update();vrm.expressionManager?.update();return eyeBlinkCompatibility.getState();},
  playGreeting(options){if(!canStartGreeting())return Promise.resolve({started:false,error:'greeting-requires-settled-empty-hand-pose'});return greeting.start(options);},
  cancelGreeting: options=>greeting.cancel(options),
  setAction(name){currentAction=name;},
  setExpression(value){if(!['neutral','happy','aa'].includes(value))throw RangeError('Unknown expression');preset=value;},
  setSpeaking(value){speaking=Boolean(value);},
  setGaze(value){if(value==null){gaze=null;return;}const v=Array.isArray(value)?new V(...value):value.clone();if(![v.x,v.y,v.z].every(Number.isFinite))throw TypeError('Finite world gaze target required');gaze=v;},
   getState(){return{eyeBlinkCompatibility:eyeBlinkCompatibility.getState(),greeting:greeting.getState(),bodyType,avatarSha256,preset,speaking,speakingMode:'procedural-vowel-demo-not-audio-lipsync',time,gaze:gaze?.toArray()??null,action:currentAction,actionSupport:canPerform(currentAction),arm:armMetrics,fit:{...fit,glassesTempleProfile:slots.glasses.object?.userData.templeFit??null,eyeSpacing,armLengths:armLengths.slice(),gripProfile:gripProfile?{id:gripProfile.id,sha256:gripProfile.sha256,compatibleAvatarSha256:gripProfile.compatibleAvatarSha256,compatibleAccessorySha256:gripProfile.compatibleAccessorySha256,fitVersion:gripProfile.fitVersion,method:gripProfile.method}:null,verified:false},accessories:Object.fromEntries(Object.entries(slots).map(([k,s])=>[k,{version:s.version,requested:s.requested,status:s.status,loaded:Boolean(s.object),error:s.error,sha256:s.entry?.sha256??null,identity:s.identity?structuredClone(s.identity):null,pending:s.pending?{desired:s.pending.desired,version:s.pending.version,identity:s.pending.identity?structuredClone(s.pending.identity):null}:null}]))};},
   dispose(){if(disposed)return;disposed=true;eyeBlinkCompatibility.dispose();greeting.dispose();for(const s of Object.values(slots)){s.version++;s.pending?.release?.();s.pending=null;s.abort?.abort();s.abort=null;disposeObject(s.object);s.object=null;}for(const f of fingers)if(holdWeight>0&&f.authored)f.bone.quaternion.copy(f.authored);for(const k of facialKeys)vrm.expressionManager?.setValue(k,0);if(vrm.lookAt&&oldLookAt){vrm.lookAt.reset();vrm.lookAt.autoUpdate=oldLookAt.autoUpdate;vrm.lookAt.target=oldLookAt.target;}mount.removeFromParent();},
 };
}
