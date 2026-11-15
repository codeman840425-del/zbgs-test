import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {FBXLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/FBXLoader.js';
// The vendor FBX is the reproducible input; this script never calls its cloud service.
const {values:args}=parseArgs({options:Object.fromEntries(['source-fbx','female-rig','male-rig','baseline','output'].map(k=>[k,{type:'string'}])),strict:true});
for(const k of ['source-fbx','female-rig','male-rig','baseline','output'])if(!args[k])throw Error('Missing --'+k);
const candidate=path.resolve(args.output);
if(fs.existsSync(candidate))throw Error('Output already exists; preserve it and choose a fresh directory');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const contract=JSON.parse(fs.readFileSync(new URL('../../assets-source/rokoko-target-adapter-v1/input-contract.json',import.meta.url)));
// Exact bytes deliberately constrain this adapter to the fixed pilot. No new
// FBX, gender swap, footwear change or runtime rebuild is implicitly accepted.
function checkedBytes(file,expected,label){
 if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())throw Error('Input contract: missing/non-regular '+label);
 const bytes=fs.readFileSync(file);
 if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)throw Error('Input contract: identity mismatch '+label);
 return bytes;
}
const inputBytes=Object.fromEntries(Object.entries(contract.inputs).map(([key,expected])=>[key,checkedBytes(args[key],expected,key)]));
const rigs={};
for(const body of ['female','male']){
 const rig=JSON.parse(inputBytes[body+'-rig']),expected=contract.inputs[body+'-rig'];
 if(rig.avatarSha256!==expected.avatarSha256||rig.footwear?.sha256!==expected.footwearSha256||Object.keys(rig.normalizedBones??{}).length!==expected.normalizedBoneCount)throw Error('Input contract: rig identity '+body);
 rigs[body]=rig;
}
const baseline=path.resolve(args.baseline);
if(!fs.existsSync(baseline)||!fs.lstatSync(baseline).isDirectory())throw Error('Input contract: baseline must be a regular directory');
const relativeOutput=path.relative(baseline,candidate);
if(relativeOutput===''||(!relativeOutput.startsWith('..'+path.sep)&&relativeOutput!=='..'&&!path.isAbsolute(relativeOutput)))throw Error('Input contract: output must be outside baseline');
function baselineFiles(dir,prefix=''){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const rel=prefix+e.name;
  if(e.isSymbolicLink())throw Error('Input contract: baseline symlink '+rel);
  if(e.isDirectory())return baselineFiles(path.join(dir,e.name),rel+'/');
  if(!e.isFile())throw Error('Input contract: baseline non-regular '+rel);
  return [rel];
 });
}
for(const entry of contract.baseline.files)checkedBytes(path.join(baseline,entry.path),entry,'baseline '+entry.path);
if(JSON.stringify(baselineFiles(baseline).sort())!==JSON.stringify(contract.baseline.files.map(f=>f.path).sort()))throw Error('Input contract: baseline file inventory mismatch');
if(JSON.parse(fs.readFileSync(path.join(baseline,'build-info.json'))).shortId!==contract.baseline.shortId)throw Error('Input contract: baseline build identity mismatch');
const raw=inputBytes['source-fbx'];
const scene=new FBXLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
const clip=scene.animations[0];
if(!clip||clip.duration!==contract.sourceClip.duration)throw Error('Input contract: fixed source clip duration mismatch');
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
// Complete conversion and output checks in memory before copying any runtime.
const products=new Map(),variants=[],reports=[];
for(const body of ['female','male']){
 const rigBytes=inputBytes[body+'-rig'],rig=rigs[body];
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
 const file=`rokoko-5359146-${body}-v1.motion.json`,bytes=Buffer.from(JSON.stringify(data));products.set('assets/motion/m1c/'+file,bytes);
 variants.push({avatarSha256:rig.avatarSha256,file,sha256:sha(bytes),bytes:bytes.length});
 reports.push({body,ratio,rootRadiusM:radius,rotationTracks:tracks.length,firstFrameReplaced:true,sourceSamples:900,validMotionSamples:899});
}
const manifest=JSON.parse(fs.readFileSync(path.join(baseline,'assets/motion/m1c/dance-imports.json')));manifest.entries=manifest.entries.filter(e=>e.id!=='rokoko-5359146-30s-v1');
manifest.entries.push({id:'rokoko-5359146-30s-v1',format:'normalized-vrm-motion.1',clip:'Rokoko_Pexels5359146_30s_v1',duration:30,playback:'once-then-idle',rootPolicy:'local-displacement',origin:'Rokoko vendor trial; Pexels 5359146; not production accepted',rootTranslationOwner:'clip hips only',heldPropsAllowed:false,space:{kind:'local-footprint',radiusTargetM:Math.max(...reports.map(r=>r.rootRadiusM))+.75,navigationAllowedDuringPlayback:false},variants});products.set('assets/motion/m1c/dance-imports.json',Buffer.from(JSON.stringify(manifest,null,2)));
for(const expected of contract.expectedOutputs){
 const bytes=products.get('assets/motion/m1c/'+expected.file);
 if(!bytes||bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)throw Error('Output contract: fixed product mismatch '+expected.file);
}
products.set('retarget-report.json',Buffer.from(JSON.stringify({sourceSha256:sha(raw),adapterSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),sourceDuration:clip.duration,presentationDuration:30,sourceMap:map,reports,candidate},null,2)));
products.set('source-world-samples.json',Buffer.from(JSON.stringify({rest:Object.fromEntries(Object.entries(sourceRest).map(([k,v])=>[k,{p:v.p.toArray(),q:v.q.toArray()}])),samples})));
// The final directory only appears after a complete staged write. A failed
// conversion/copy leaves no success-looking output; remove only our own stage.
if(fs.existsSync(candidate))throw Error('Output already exists; preserve it and choose a fresh directory');
fs.mkdirSync(path.dirname(candidate),{recursive:true});
const stage=fs.mkdtempSync(path.join(path.dirname(candidate),'.rokoko-pilot-staging-'));
try{
 fs.cpSync(baseline,stage,{recursive:true});
 for(const [rel,bytes] of products)fs.writeFileSync(path.join(stage,rel),bytes);
 // Windows indexing/antivirus can briefly hold just-written files. Retry only
 // the final rename (at most 1.5s); never retry conversion or overwrite output.
 for(let attempt=0;;attempt++){
  if(fs.existsSync(candidate))throw Error('Output appeared during conversion; preserving it');
  try{fs.renameSync(stage,candidate);break;}
  catch(error){
   if(attempt>=4||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
   await new Promise(resolve=>setTimeout(resolve,100*2**attempt));
  }
 }
}catch(error){fs.rmSync(stage,{recursive:true,force:true});throw error;}
console.log(JSON.stringify({candidate,reports,variants},null,2));
