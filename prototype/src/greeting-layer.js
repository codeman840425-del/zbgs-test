// One authored source gesture, not a generic gesture library. The conversion
// matches motion-source.js / pixiv's rest-world quaternion convention.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const GREETING_ID = 'greeting-wave-left-v1';
const URL = '/assets/motion/m1c/greeting/';
const SHA = 'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06';
const BYTES = 1566668;
const CLIP = 'Greeting_Wave_Left_Once_v1';
// Pinned source config: the start/end ramps are quintic interpolation from
// standing Idle to the boundary wave pose. Re-anchor those ramps to THIS
// frame's authored pose (including seated hands), not the source Idle endpoint.
const RAISE_END = .65, LOWER_START = 2.05;
const MAP = {upperarm_l:'leftUpperArm', lowerarm_l:'leftLowerArm', hand_l:'leftHand'};
for (const [src, dst] of [['index','Index'],['middle','Middle'],['ring','Ring'],['pinky','Little'],['thumb','Thumb']])
  for(let i=1;i<=3;i++) MAP[`${src}_0${i}_l`] = 'left'+dst+(src==='thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal'])[i-1];
const smooth = t => {t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const sourceRamp = t => {t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};

function disposeLibrary(scene) {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  scene?.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}

export function retargetGreeting(library, targets, legacyBasis=false) {
  library.scene.updateMatrixWorld(true);
  const clip=THREE.AnimationClip.findByName(library.animations,CLIP);
  if(!clip||Math.abs(clip.duration-2.8)>.0001)throw Error('greeting-clip-invalid');
  const lateral=library.scene.getObjectByName('thigh_l').getWorldPosition(new THREE.Vector3()).sub(library.scene.getObjectByName('thigh_r').getWorldPosition(new THREE.Vector3())).normalize();
  const forward=lateral.cross(new THREE.Vector3(0,1,0));
  const correction=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(forward.x,forward.z)), inv=correction.clone().invert();
  const tracks=[];
  for(const [sourceName,semantic] of Object.entries(MAP)){
    const target=targets.get(semantic),bone=library.scene.getObjectByName(sourceName);
    const track=clip.tracks.find(t=>t.name===sourceName+'.quaternion');
    if(!target||!bone||!track)throw Error('greeting-bone-missing:'+semantic);
    const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()), inverseRest=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const values=[];
    for(let i=0;i<track.values.length;i+=4){
      const q=new THREE.Quaternion().fromArray(track.values,i).premultiply(parent).multiply(inverseRest).premultiply(correction).multiply(inv);
      if(legacyBasis){q.x=-q.x;q.z=-q.z;}
      values.push(...q.multiply(target.rest).normalize().toArray());
    }
    const converted=new THREE.QuaternionKeyframeTrack(semantic,track.times.slice(),values);
    tracks.push({semantic,bone:target.bone,sample:converted.createInterpolant(),value:new THREE.Quaternion()});
  }
  return {tracks,duration:clip.duration};
}

export function createGreetingLayer({vrm,fetchResource=globalThis.fetch,parse=bytes=>new GLTFLoader().parseAsync(bytes,URL)}) {
  // Snapshot at avatar construction, before the motion mixer writes a pose.
  const targets=new Map(Object.values(MAP).map(name=>{const bone=vrm.humanoid.getNormalizedBoneNode(name);return [name,bone?{bone,rest:bone.quaternion.clone()}:null];}));
  let loaded=null,abort=null,version=0,disposed=false;
  let state={id:GREETING_ID,status:'idle',time:0,weight:0,requestId:null,error:null,sha256:null};
  let fadeTime=0,fadeWeight=0;
  const busy=()=>['loading','playing','fading'].includes(state.status);
  async function start({requestId}={}){
    if(disposed)throw Error('greeting-disposed');
    if(busy())return {started:false,duplicate:true,requestId:state.requestId};
    const generation=++version;abort=new AbortController();const signal=abort.signal;
    state={id:GREETING_ID,status:'loading',time:0,weight:0,requestId,error:null,sha256:null};
    try{
      if(!loaded){
        const response=await fetchResource(URL+'greeting-wave-left-v1.glb',{signal});
        if(!response.ok)throw Error('greeting-resource-http:'+response.status);
        const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        if(bytes.byteLength!==BYTES||hash!==SHA)throw Error('greeting-resource-integrity');
        if(disposed||generation!==version)return {started:false,cancelled:true};
        const library=await parse(bytes);
        try{
          if(disposed||generation!==version)return {started:false,cancelled:true};
          loaded=retargetGreeting(library,targets,vrm.meta?.metaVersion==='0');
        }finally{disposeLibrary(library.scene);}
      }
      if(disposed||generation!==version)return {started:false,cancelled:true};
      state.status='playing';state.sha256=SHA;return {started:true,requestId};
    }catch(error){
      if(disposed||generation!==version)return {started:false,cancelled:true};
      state.status='failed';state.error=error.message;return {started:false,error:error.message,requestId};
    }finally{if(generation===version)abort=null;}
  }
  function cancel({immediate=false}={}){
    ++version;abort?.abort();abort=null;
    if(!busy())return;
    if(immediate||state.status==='loading'||state.weight===0){state.status='cancelled';state.weight=0;return;}
    if(state.status!=='fading'){fadeTime=0;fadeWeight=state.weight;state.status='fading';}
  }
  function update(dt){
    if(!Number.isFinite(dt)||dt<0)throw RangeError('Invalid greeting dt');
    if(disposed||!['playing','fading'].includes(state.status))return;
    if(state.status==='playing'){
      state.time=Math.min(loaded.duration,state.time+dt);
      state.weight=smooth(state.time/.2)*smooth((loaded.duration-state.time)/.2);
      if(state.time>=loaded.duration){state.status='completed';state.weight=0;return;}
    }else{
      fadeTime+=dt;state.weight=fadeWeight*(1-smooth(fadeTime/.2));
      if(fadeTime>=.2){state.status='cancelled';state.weight=0;return;}
    }
    // Motion restores the entire authored normalized pose each tick. Never
    // capture an old frame here or write excluded/root/right-hand tracks.
    const sampleTime=THREE.MathUtils.clamp(state.time,RAISE_END,LOWER_START);
    const ramp=state.time<RAISE_END?sourceRamp(state.time/RAISE_END):state.time>LOWER_START?1-sourceRamp((state.time-LOWER_START)/(loaded.duration-LOWER_START)):1;
    for(const track of loaded.tracks){track.value.fromArray(track.sample.evaluate(sampleTime));track.bone.quaternion.slerp(track.value,state.weight*ramp);}
  }
  return {start,cancel,update,busy,getState:()=>({...state,duration:loaded?.duration??2.8,layer:'left-arm-and-fingers-only',fadeSeconds:.2,endpointPolicy:'current-authored-pose-source-quintic-ramps'}),dispose(){if(disposed)return;cancel({immediate:true});disposed=true;loaded=null;}};
}
