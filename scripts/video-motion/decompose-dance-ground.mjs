// Offline actual-VRM replay and shoe-material ground decomposition; no motion edits.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const root=new URL('../../',import.meta.url),out=new URL('assets-source/video-dance-ground-decomposition-v1/',root),base=new URL('assets-source/video-dance-target-v2/',root),rigDir=new URL('assets-source/video-target-adaptation-v1/',root),recordDir=new URL('evidence/video-motion-room-ce09c265dadd/',root);
await fs.mkdir(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const summary=[];
for(const body of ['female','male']){
 const rig=await read(new URL(body+'-normalized-rig.json',rigDir)),asset=await read(new URL(body+'-dance-normalized-v2.json',base)),reference=await read(new URL(body+'-world-reference.json',base)),v1report=await read(new URL('assets-source/video-dance-target-v1/'+body+'-report.json',root));
 const traceBytes=await fs.readFile(new URL(body+'.trace.json.gz',recordDir)),trace=JSON.parse(zlib.gunzipSync(traceBytes)),bytes=await fs.readFile(new URL('prototype/public'+rig.source,root));if(hash(bytes)!==asset.avatarSha256)throw Error('wrong target');
 const len=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+len));for(const m of j.meshes)for(const p of m.primitives)delete p.material;delete j.materials;delete j.textures;delete j.images;j.extensions.VRM.materialProperties=[];delete j.extensions.VRM.meta.texture;
 const a=Buffer.from(JSON.stringify(j)),txt=Buffer.concat([a,Buffer.alloc((4-a.length%4)%4,32)]),bin=bytes.subarray(20+len),h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+txt.length+bin.length,8);h.writeUInt32LE(txt.length,12);h.write('JSON',16);const cooked=Buffer.concat([h,txt,bin]);const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));const {userData:{vrm}}=await loader.parseAsync(cooked.buffer.slice(cooked.byteOffset,cooked.byteOffset+cooked.byteLength),'');VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
 const nodes=Object.fromEntries(reference.names.map(s=>[s,vrm.humanoid.getNormalizedBoneNode(s)]));
 const invRest=Object.fromEntries(Object.entries(rig.normalizedBones).map(([s,b])=>[s,new T.Matrix4().fromArray(b.worldMatrix).invert()]));
 const vertices=Object.fromEntries(['left','right'].map(side=>[side,rig.footwear.skinSamples[side].map(v=>({...v,rest:new T.Vector3(...v.world)}))]));
 const patches={};
 for(const side of ['left','right']){
  patches[side]={};const footZ=rig.lengths[side].ankleRest[2];
  for(const kind of ['heel','toe']){
   const region=vertices[side].filter(v=>kind==='heel'?v.world[2]<=footZ+.015:v.world[2]>=footZ+.015),min=Math.min(...region.map(v=>v.world[1]));patches[side][kind]=region.map((v,i)=>v).filter(v=>v.world[1]<min+.012);
  }
 }
 const json=structuredClone(asset.clip);for(const tr of json.tracks){const [s,p]=tr.name.split('.');tr.name=nodes[s].name+'.'+p;}
 const clip=T.AnimationClip.parse(json),mixer=new T.AnimationMixer(vrm.scene),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 function evalAt(time){action.paused=false;action.enabled=true;mixer.setTime(time);vrm.scene.updateMatrixWorld(true);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);}
 function skin(v){const p=new T.Vector3();for(const inf of v.influences)if(inf.weight>0)p.addScaledVector(v.rest.clone().applyMatrix4(invRest[inf.semantic]).applyMatrix4(nodes[inf.semantic].matrixWorld),inf.weight);return p;}
 function sole(){const result={};for(const side of ['left','right']){
  const all=vertices[side].map(skin);result[side]={minimumY:Math.min(...all.map(v=>v.y)),ankleY:nodes[side+'Foot'].getWorldPosition(new T.Vector3()).y};
  for(const kind of ['heel','toe']){const ys=patches[side][kind].map(v=>skin(v).y),min=Math.min(...ys),weights=ys.map(y=>Math.exp(-(y-min)/.001));result[side][kind+'SoftMinY']=ys.reduce((s,y,i)=>s+y*weights[i],0)/weights.reduce((a,b)=>a+b,0);}
 }return result;}
 const traceDance=trace.frames.filter(f=>f.mode==='dance'&&f.motion.dance?.id===asset.id),liftSet=[...new Set(traceDance.map(f=>f.motion.dance.groundLift))];if(liftSet.length!==1)throw Error('varying lift');const lift=liftSet[0];
 const calibration=[];for(let i=0;i<121;i++){const time=Math.min(i/120*clip.duration,clip.duration-1e-6);evalAt(time);const s=sole();calibration.push({time,lowestSoftSoleY:Math.min(...['left','right'].flatMap(side=>[s[side].heelSoftMinY,s[side].toeSoftMinY])),lowestAllVertexY:Math.min(s.left.minimumY,s.right.minimumY)});}
 const recomputedLift=-Math.min(...calibration.map(s=>s.lowestSoftSoleY)),sourceRows=[];
 for(let k=0;k<73;k++){
  evalAt(reference.times[k]);const s=sole(),hipsY=nodes.hips.getWorldPosition(new T.Vector3()).y,restHipsY=rig.normalizedBones.hips.worldMatrix[13],placement=v1report.firstFrameOnlyUniformPlacementYOffsetM;
  const feet={};for(const side of ['left','right'])feet[side]={...s[side],poseRelativeSoleToHipsY:s[side].minimumY-hipsY,soleToAnkleY:s[side].minimumY-s[side].ankleY,afterFullRuntimeLiftMinimumY:s[side].minimumY+lift,afterFullRuntimeLiftHeelSoftY:s[side].heelSoftMinY+lift,afterFullRuntimeLiftToeSoftY:s[side].toeSoftMinY+lift};
  sourceRows.push({sourceFrame:138+k,sourcePTS:(138+k)*1001,timeBase:'1/24000',sourceSeconds:(138+k)*1001/24000,clipTime:reference.times[k],restHipsY,source2DProjectedHipDeltaY:hipsY-restHipsY-placement,firstFramePlacementY:placement,assetHipsY:hipsY,runtimeGroundLift:lift,afterFullRuntimeLiftHipsY:hipsY+lift,feet});
 }
 const traceRows=[];for(const f of traceDance.filter(f=>f.motion.danceMix>=.99999&&f.motion.dance.time<clip.duration)){
  const time=f.motion.dance.time;evalAt(time);const origin=new T.Vector3(...f.root),hip=nodes.hips.getWorldPosition(new T.Vector3()).add(origin),modelHip=f.motion.authoredHipWorld,actual=f.motion.hipWorld,L=lift*f.motion.danceMix;
  const feet={};for(const side of ['left','right']){const p=nodes[side+'Foot'].getWorldPosition(new T.Vector3()).add(origin),actualFoot=f.joints[side+'Foot'];feet[side]={assetAnkleY:p.y,traceActualAnkleY:actualFoot[1],expectedLift:L,residualAfterLift:actualFoot[1]-p.y-L};}
  traceRows.push({recordTimeMs:f.t,clipTime:time,mix:f.motion.danceMix,expectedLift:L,assetHipY:hip.y,traceAuthoredHipY:modelHip[1],traceActualHipY:actual[1],authoredHipResidualY:modelHip[1]-hip.y,actualMinusAuthoredY:actual[1]-modelHip[1],hipLiftResidualY:actual[1]-modelHip[1]-L,feet});
 }
 const result={body,build:'ce09c265dadd',assetSha256:hash(await fs.readFile(new URL(body+'-dance-normalized-v2.json',base))),traceSha256:hash(traceBytes),rigSha256:hash(await fs.readFile(new URL(body+'-normalized-rig.json',rigDir))),recordedGroundLift:lift,recomputed121SampleSoftSoleGroundLift:recomputedLift,groundLiftReproductionError:recomputedLift-lift,patchCounts:Object.fromEntries(['left','right'].map(s=>[s,Object.fromEntries(['heel','toe'].map(k=>[k,patches[s][k].length]))])),calibration,sourceRows,fullyMixedTraceRows:traceRows,
 traceChecks:{rows:traceRows.length,minMix:Math.min(...traceRows.map(r=>r.mix)),maxAbsAuthoredHipResidualY:Math.max(...traceRows.map(r=>Math.abs(r.authoredHipResidualY))),maxAbsHipLiftResidualY:Math.max(...traceRows.map(r=>Math.abs(r.hipLiftResidualY))),maxAbsAnkleLiftResidualY:Math.max(...traceRows.flatMap(r=>['left','right'].map(s=>Math.abs(r.feet[s].residualAfterLift))))},
 limits:['Sourceframe table assumes full danceMix1; actual early/late blends are separately excluded from trace equivalence.','Trace records ankles, not per-vertex shoe skin; shoe values reconstructed from exact pinned equipment skin data.','All-vertex minimum and runtime121-sample patch soft-min are different observables.','Model input has no calibrated physical floor; asset/root adaptation errors are not proof that rawMotionBERT has metric ground penetration.']};
 await fs.writeFile(new URL(body+'-decomposition.json',out),JSON.stringify(result,null,2));summary.push({body,recordedGroundLift:lift,recomputedLift,groundLiftReproductionError:result.groundLiftReproductionError,traceChecks:result.traceChecks});
}
await fs.writeFile(new URL('runtime-summary.json',out),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
