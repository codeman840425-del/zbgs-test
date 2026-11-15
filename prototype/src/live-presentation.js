import {fitGlassesTemples} from './glasses-temple-fit.js';
import * as THREE from 'three';
import {createGreetingLayer} from './greeting-layer.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const V=THREE.Vector3,Q=THREE.Quaternion,M=THREE.Matrix4;
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
export function createLivePresentation({vrm,root,bodyType='female',avatarSha256=null}){
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
 const restForward=wp(middle).sub(wp(arm.hand)).normalize(),restAcross=wp(index).sub(wp(little)).normalize();
 restAcross.addScaledVector(restForward,-restAcross.dot(restForward)).normalize();
 const restBasis=new Q().setFromRotationMatrix(new M().makeBasis(restForward,restAcross,new V().crossVectors(restForward,restAcross)));
 const handBasisOffset=restBasis.clone().invert().multiply(handRestQ);
 const palmNormal=new V().crossVectors(restAcross,restForward).normalize();
 const palmLocal=wp(middle).sub(wp(arm.hand)).multiplyScalar(.72).addScaledVector(palmNormal,.012).applyQuaternion(handRestQ.clone().invert());
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
 const slots=Object.fromEntries(Object.keys(IDS).map(k=>[k,{version:0,requested:false,object:null,abort:null,error:null,status:'off',entry:null}]));
 let manifestPromise=null,gripProfile=null,disposed=false,time=0,preset='neutral',speaking=false,gaze=null,currentAction='idle',holdWeight=0,armMetrics=null;
 const oldLookAt=vrm.lookAt?{autoUpdate:vrm.lookAt.autoUpdate,target:vrm.lookAt.target}:null;
 if(vrm.lookAt){vrm.lookAt.autoUpdate=false;vrm.lookAt.target=null;}
 const facialKeys=['happy','aa','ih','ou','ee','oh','blink'];
 function canPerform(action){return action==='dance'&&slots.mic.requested?{allowed:false,reason:'持麦舞蹈尚未制作；请先卸下麦克风。'}:{allowed:true};}
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
  if(!entry)throw Error('当前基模尚无匹配的握麦姿态；麦克风暂不可用，眼镜不受影响。');
  if(!Number.isInteger(entry.bytes)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid grip identity');
  const file=await fetch(entry.url,{signal});if(!file.ok)throw Error('Grip profile HTTP '+file.status);
  const bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('Grip profile integrity check failed');
  const profile=JSON.parse(new TextDecoder().decode(bytes));
  const finite=(array,n)=>Array.isArray(array)&&array.length===n&&array.every(Number.isFinite);
  if(profile.schema!=='zbgs-grip-profile-v1'||profile.compatibleAvatarSha256!==avatarSha256||profile.accessoryId!==IDS.mic||!/^[a-f0-9]{64}$/.test(profile.compatibleAccessorySha256)||!finite(profile.micRawHandLocal?.position,3)||!finite(profile.micRawHandLocal?.quaternion,4)||fingers.some(f=>!finite(profile.normalizedFingerRotations?.[f.name],4)))throw Error('Grip profile binding mismatch');
  for(const values of [profile.micRawHandLocal.quaternion,...Object.values(profile.normalizedFingerRotations)])if(Math.abs(Math.hypot(...values)-1)>1e-4)throw Error('Grip quaternion is not normalized');
  return {...profile,sha256:hash};
 }
 async function setAccessory(kind,value){
  if(disposed)throw Error('Live presentation disposed');const slot=slots[kind];if(!slot)throw Error('Unknown accessory '+kind);
  const desired=Boolean(value);
  if(kind==='mic'&&desired&&greeting.busy())return{applied:false,reason:'招手与持麦组合尚未验证，请等待招手结束。'};
  if(kind==='mic'&&desired&&currentAction==='dance')return{applied:false,reason:'持麦舞蹈尚未制作；请先停止舞蹈。'};
  if(desired&&slot.object&&slot.requested)return{applied:true,cached:true};
  const version=++slot.version;slot.abort?.abort();slot.abort=null;slot.requested=desired;slot.error=null;
  if(!desired){disposeObject(slot.object);slot.object=null;slot.entry=null;slot.status='off';return{applied:true};}
  slot.status='loading';const controller=new AbortController();slot.abort=controller;let object;
  try{
   if(kind==='mic'){const profile=await loadGrip(controller.signal);if(disposed||version!==slot.version)return{applied:false,cancelled:true};gripProfile=profile;}
   const data=await manifest();if(disposed||version!==slot.version)return{applied:false,cancelled:true};
   const entry=data.items.find(x=>x.id===IDS[kind]);if(!entry||!Number.isInteger(entry.bytes)||!/^([a-f0-9]{64})$/.test(entry.sha256))throw Error('Invalid accessory identity');
   if(kind==='mic'&&entry.sha256!==gripProfile.compatibleAccessorySha256)throw Error('Microphone version does not match fitted grip profile');
   const response=await fetch(entry.url,{signal:controller.signal});if(!response.ok)throw Error('Accessory HTTP '+response.status);const bytes=await response.arrayBuffer();
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('Accessory integrity check failed: '+entry.id);
   const gltf=await new GLTFLoader().parseAsync(bytes,new URL('.',new URL(entry.url,window.location.href)).href);object=gltf.scene;object.name='LiveAccessory:'+kind;
   if(kind==='glasses'&&new URLSearchParams(location.search).get('glassesFit')!=='legacy'){object.userData.templeFit=await fitGlassesTemples(object,{bodySHA256:avatarSha256,accessorySHA256:hash,signal:controller.signal});}
   if(disposed||version!==slot.version){disposeObject(object);return{applied:false,cancelled:true};}
   object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});disposeObject(slot.object);slot.object=object;slot.entry=entry;mount.add(object);slot.status='on';postUpdate();return{applied:true,sha256:hash};
  }catch(e){if(object&&object!==slot.object)disposeObject(object);if(disposed||version!==slot.version||e.name==='AbortError')return{applied:false,cancelled:true};slot.error=String(e.message||e);slot.status='error';slot.requested=false;throw e;}
  finally{if(version===slot.version)slot.abort=null;}
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
  const target=slots.mic.object&&slots.mic.requested?1:0;holdWeight=THREE.MathUtils.damp(holdWeight,target,14,dt);if(Math.abs(holdWeight-target)<1e-4)holdWeight=target;
  if(holdWeight>0){
   root.updateMatrixWorld(true);const authored=[arm.upper.quaternion.clone(),arm.lower.quaternion.clone(),arm.hand.quaternion.clone()];
   const rootQ=root.getWorldQuaternion(new Q()),headPosition=wp(bone('head')),shoulder=wp(arm.upper),armLength=armLengths[0]+armLengths[1];
   // Root-local right-side microphone target; follows actual head height during sitting.
   const grip=headPosition.clone().add(new V(-armLength*.19,-armLength*.27,armLength*.34).applyQuaternion(rootQ));
   const forward=new V(0,0,1).applyQuaternion(rootQ),across=new V(0,1,0).applyQuaternion(rootQ);
   const desiredHandQ=new Q().setFromRotationMatrix(new M().makeBasis(forward,across,new V().crossVectors(forward,across))).multiply(handBasisOffset);
   const wrist=grip.clone().sub(palmLocal.clone().applyQuaternion(desiredHandQ));
   const direction=wrist.clone().sub(shoulder),wanted=direction.length();direction.normalize();const length=clamp(wanted,Math.abs(armLengths[0]-armLengths[1])+1e-5,armLength-1e-5),along=(armLengths[0]**2-armLengths[1]**2+length**2)/(2*length),height=Math.sqrt(Math.max(0,armLengths[0]**2-along**2));
   const pole=new V(-.35,-1,.15).applyQuaternion(rootQ);pole.addScaledVector(direction,-pole.dot(direction)).normalize();const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,height),reachable=shoulder.clone().addScaledVector(direction,length);
   orientSegment(arm.upper,arm.lower,elbow);orientSegment(arm.lower,arm.hand,reachable);arm.hand.quaternion.copy(arm.hand.parent.getWorldQuaternion(new Q()).invert().multiply(desiredHandQ));
   for(const [i,b]of [arm.upper,arm.lower,arm.hand].entries())b.quaternion.copy(authored[i].slerp(b.quaternion,holdWeight));
   arm.hand.updateWorldMatrix(true,true);armMetrics={desiredGrip:grip.toArray(),desiredWrist:wrist.toArray(),actualWrist:wp(arm.hand).toArray(),reachClamped:Math.abs(wanted-length)>.001,weight:holdWeight};
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
 const canStartGreeting=()=>['idle','sit'].includes(currentAction)&&!slots.mic.requested&&holdWeight<=.001;
 return{preUpdate,postUpdate,setAccessory,canPerform,canStartGreeting,
  playGreeting(options){if(!canStartGreeting())return Promise.resolve({started:false,error:'greeting-requires-settled-empty-hand-pose'});return greeting.start(options);},
  cancelGreeting: options=>greeting.cancel(options),
  setAction(name){currentAction=name;},
  setExpression(value){if(!['neutral','happy','aa'].includes(value))throw RangeError('Unknown expression');preset=value;},
  setSpeaking(value){speaking=Boolean(value);},
  setGaze(value){if(value==null){gaze=null;return;}const v=Array.isArray(value)?new V(...value):value.clone();if(![v.x,v.y,v.z].every(Number.isFinite))throw TypeError('Finite world gaze target required');gaze=v;},
  getState(){return{greeting:greeting.getState(),bodyType,avatarSha256,preset,speaking,speakingMode:'procedural-vowel-demo-not-audio-lipsync',time,gaze:gaze?.toArray()??null,action:currentAction,actionSupport:canPerform(currentAction),arm:armMetrics,fit:{...fit,glassesTempleProfile:slots.glasses.object?.userData.templeFit??null,eyeSpacing,armLengths:armLengths.slice(),gripProfile:gripProfile?{id:gripProfile.id,sha256:gripProfile.sha256,compatibleAvatarSha256:gripProfile.compatibleAvatarSha256,compatibleAccessorySha256:gripProfile.compatibleAccessorySha256,fitVersion:gripProfile.fitVersion,method:gripProfile.method}:null,verified:false},accessories:Object.fromEntries(Object.entries(slots).map(([k,s])=>[k,{requested:s.requested,status:s.status,loaded:Boolean(s.object),error:s.error,sha256:s.entry?.sha256??null}]))};},
  dispose(){if(disposed)return;disposed=true;greeting.dispose();for(const s of Object.values(slots)){s.version++;s.abort?.abort();disposeObject(s.object);s.object=null;}for(const f of fingers)if(holdWeight>0&&f.authored)f.bone.quaternion.copy(f.authored);for(const k of facialKeys)vrm.expressionManager?.setValue(k,0);if(vrm.lookAt&&oldLookAt){vrm.lookAt.reset();vrm.lookAt.autoUpdate=oldLookAt.autoUpdate;vrm.lookAt.target=oldLookAt.target;}mount.removeFromParent();},
 };
}
