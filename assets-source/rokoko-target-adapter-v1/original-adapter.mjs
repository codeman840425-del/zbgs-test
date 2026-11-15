import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as T from 'file:///F:/gamemake/prototype/node_modules/three/build/three.module.js';
import {FBXLoader} from 'file:///F:/gamemake/prototype/node_modules/three/examples/jsm/loaders/FBXLoader.js';
const base=path.dirname(fileURLToPath(import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync(path.join(base,'vendor-output/5359146-frames0000-0719-1080p-end30.fbx'));
const scene=new FBXLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
const clip=scene.animations[0];
const bindings=clip.tracks.flatMap(t=>{const dot=t.name.lastIndexOf('.'),name=t.name.slice(0,dot),prop=t.name.slice(dot+1),node=scene.getObjectByName(name);return node&&['position','quaternion','scale'].includes(prop)?[{node,prop,track:t,interp:t.createInterpolant()}]:[]});
function pose(time){for(const b of bindings)b.node[b.prop].fromArray(b.interp.evaluate(time));scene.updateMatrixWorld(true);}
const map={hips:'Hips',spine:'Spine1',chest:'Spine3',upperChest:'Spine4',neck:'Neck',head:'Head'};
for(const [side,S] of [['left','Left'],['right','Right']]){
 for(const [target,source] of Object.entries({Shoulder:'Shoulder',UpperArm:'Arm',LowerArm:'ForeArm',Hand:'Hand',UpperLeg:'Thigh',LowerLeg:'Shin',Foot:'Foot',Toes:'Toe'}))map[side+target]=S+source;
 for(const [i,f] of [[1,'Thumb'],[2,'Index'],[3,'Middle'],[4,'Ring'],[5,'Little']])for(const [dst,src] of (i===1?[['Metacarpal','Metacarpal'],['Proximal','Proximal'],['Distal','Distal']]:[['Proximal','Proximal'],['Intermediate','Medial'],['Distal','Distal']]))if(scene.getObjectByName(`${S}Finger${i}${src}`))map[side+f+dst]=`${S}Finger${i}${src}`;
}
pose(0);
const sourceRest=Object.fromEntries(Object.entries(map).map(([k,n])=>{const b=scene.getObjectByName(n);if(!b)throw Error(n);return[k,{p:b.getWorldPosition(new T.Vector3()),q:b.getWorldQuaternion(new T.Quaternion())}]}));
const samples=[];
for(let i=0;i<900;i++){
 // Reference pose at FBX t=0 is not a measured dance pose. Hold the first
 // valid pose only over [0,1/30]; preserve every later timestamp and sample.
 pose(Math.max(1,i)/30);
 samples.push({time:i/30,bones:Object.fromEntries(Object.entries(map).map(([k,n])=>{const b=scene.getObjectByName(n);return[k,{p:b.getWorldPosition(new T.Vector3()).toArray(),q:b.getWorldQuaternion(new T.Quaternion()).toArray()}]}))});
}
const candidate=path.join(base,'candidate-rokoko-v1');if(!fs.existsSync(candidate))fs.cpSync(path.join(base,'game-baseline-038341558517'),candidate,{recursive:true});
const out=path.join(candidate,'assets/motion/m1c'),variants=[],reports=[];
for(const body of ['female','male']){
 const rigBytes=fs.readFileSync(path.join(base,`reference/assets-source/video-target-adaptation-v1/${body}-normalized-rig.json`)),rig=JSON.parse(rigBytes);
 const bones=rig.normalizedBones,semantics=Object.keys(map).filter(k=>bones[k]);
 const times=[...samples.map(s=>s.time),30];
 const tracks=semantics.map(k=>({name:k+'.quaternion',type:'quaternion',times,values:[]}));
 const hipTrack={name:'hips.position',type:'vector',times,values:[]};
 const ratio=bones.hips.worldPosition[1]/sourceRest.hips.p.y;
 let radius=0,firstMax=0;
 for(const sample of [...samples,{...samples.at(-1),time:30}]){
  const worlds={};
  for(const k of semantics){
   const dq=new T.Quaternion().fromArray(sample.bones[k].q).multiply(sourceRest[k].q.clone().invert());
   worlds[k]=dq.multiply(new T.Quaternion().fromArray(bones[k].worldQuaternion));
  }
  for(const track of tracks){const k=track.name.split('.')[0],p=bones[k].parentSemantic;
   const parent=p?worlds[p]:new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray(bones[k].actualParentWorldMatrix));
   if(!parent)throw Error('Unmapped parent '+p);
   const q=parent.clone().invert().multiply(worlds[k]).normalize();
   if(track.values.length&&q.dot(new T.Quaternion().fromArray(track.values,track.values.length-4))<0)q.set(-q.x,-q.y,-q.z,-q.w);
   track.values.push(...q.toArray());
  }
  const rootWorld=new T.Vector3().fromArray(sample.bones.hips.p).sub(sourceRest.hips.p).multiplyScalar(ratio).add(new T.Vector3().fromArray(bones.hips.worldPosition));
  radius=Math.max(radius,Math.hypot(rootWorld.x,rootWorld.z));
  const local=rootWorld.applyMatrix4(new T.Matrix4().fromArray(bones.hips.actualParentWorldMatrix).invert());hipTrack.values.push(...local.toArray());
 }
 const data={schema:'normalized-vrm-motion.1',coordinateSpace:'three-vrm-3.5.5-normalized-local-absolute',avatarSha256:rig.avatarSha256,sourceClipSha256:sha(raw),normalizedRigSha256:sha(rigBytes),footwearSha256:rig.footwear.sha256,clip:{name:'Rokoko_Pexels5359146_30s_v1',duration:30,tracks:[...tracks,hipTrack]},provenance:{source:'Rokoko Studio 2.6.2 Newton FBX',inputVideo:'Pexels Sergey Makashin 5359146, frames 0-719, 24000/1001 fps',providerOutputFps:30,firstFrame:'Export reference T-pose replaced with first valid sample; [0,1/30] hold, all later times unchanged',lastFrame:'Last motion sample at 899/30 held to presentation endpoint 30; no time scaling',filters:'Studio default Locomotion ON; no advisor smoothing/IK',spine:'World rotations collapse Newton Spine2 into mapped Spine3/chest',root:'Reference hip-height proportional displacement; target parent world inverse applied exactly once',limitations:['Source video is a reference, not CC0 motion ownership claim','Per-body foot contact/garment fit and naturalness await visual acceptance','No new runtime/controller branch']}};
 const file=`rokoko-5359146-${body}-v1.motion.json`,bytes=Buffer.from(JSON.stringify(data));fs.writeFileSync(path.join(out,file),bytes);
 variants.push({avatarSha256:rig.avatarSha256,file,sha256:sha(bytes),bytes:bytes.length});
 reports.push({body,ratio,rootRadiusM:radius,rotationTracks:tracks.length,firstFrameReplaced:true,sourceSamples:900,validMotionSamples:899});
}
const mf=path.join(out,'dance-imports.json'),manifest=JSON.parse(fs.readFileSync(mf));manifest.entries=manifest.entries.filter(e=>e.id!=='rokoko-5359146-30s-v1');
manifest.entries.push({id:'rokoko-5359146-30s-v1',format:'normalized-vrm-motion.1',clip:'Rokoko_Pexels5359146_30s_v1',duration:30,playback:'once-then-idle',rootPolicy:'local-displacement',origin:'Rokoko vendor trial; Pexels 5359146; not production accepted',rootTranslationOwner:'clip hips only',heldPropsAllowed:false,space:{kind:'local-footprint',radiusTargetM:Math.max(...reports.map(r=>r.rootRadiusM))+.75,navigationAllowedDuringPlayback:false},variants});fs.writeFileSync(mf,JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(base,'retarget-report.json'),JSON.stringify({sourceSha256:sha(raw),adapterSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),sourceDuration:clip.duration,presentationDuration:30,sourceMap:map,reports,candidate},null,2));
fs.writeFileSync(path.join(base,'source-world-samples.json'),JSON.stringify({rest:Object.fromEntries(Object.entries(sourceRest).map(([k,v])=>[k,{p:v.p.toArray(),q:v.q.toArray()}])),samples}));
console.log(JSON.stringify({candidate,reports,variants},null,2));
