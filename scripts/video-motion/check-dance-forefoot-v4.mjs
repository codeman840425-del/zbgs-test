// Actual VRM replay of forefoot v4, exact runtime calibration and dense shoe geometry; no runtime edits.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const root=new URL('../../',import.meta.url),out=new URL('assets-source/video-dance-forefoot-v4/',root),base=out,rigDir=new URL('assets-source/video-target-adaptation-v1/',root),recordDir=new URL('evidence/video-motion-room-ce09c265dadd/',root);
await fs.mkdir(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const summary=[];
for(const body of ['female','male']){
 const rig=await read(new URL(body+'-normalized-rig.json',rigDir)),asset=await read(new URL(body+'-dance-forefoot-v4.json',base)),reference=await read(new URL(body+'-world-reference.json',base)),v1report=await read(new URL('assets-source/video-dance-target-v1/'+body+'-report.json',root));
 const bytes=await fs.readFile(new URL('prototype/public'+rig.source,root));if(hash(bytes)!==asset.avatarSha256)throw Error('wrong target');
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
 const calibration=[];for(let i=0;i<121;i++){const time=Math.min(i/120*clip.duration,clip.duration-1e-6);evalAt(time);const s=sole();calibration.push({time,lowestSoftSoleY:Math.min(...['left','right'].flatMap(side=>[s[side].heelSoftMinY,s[side].toeSoftMinY])),lowestAllVertexY:Math.min(s.left.minimumY,s.right.minimumY)});}
 const lift=-Math.min(...calibration.map(s=>s.lowestSoftSoleY)),sourceRows=[];
 let matrixPositionError=0,rawError=0;
 for(let k=0;k<73;k++){
  evalAt(reference.times[k]);const soles=sole();
  for(let i=0;i<reference.names.length;i++){
   const name=reference.names[i],p=nodes[name].getWorldPosition(new T.Vector3()),wanted=new T.Vector3(...reference.world[k][i].slice(0,3).map(r=>r[3]));
   matrixPositionError=Math.max(matrixPositionError,p.distanceTo(wanted));
   rawError=Math.max(rawError,p.distanceTo(vrm.humanoid.getRawBoneNode(name).getWorldPosition(new T.Vector3())));
  }
  sourceRows.push({sourceFrame:138+k,sourcePTS:(138+k)*1001,timeBase:'1/24000',clipTime:reference.times[k],feet:Object.fromEntries(['left','right'].map(side=>[side,{...soles[side],afterRuntimeLiftMinimumY:soles[side].minimumY+lift,afterRuntimeLiftToeSoftMinY:soles[side].toeSoftMinY+lift}]))});
 }
 // Also test continuous interpolation more densely than calibration and source keys.
 const dense=[];for(let k=0;k<=720;k++){const t=clip.duration*k/720;evalAt(t);const s=sole();dense.push({time:t,feet:s,footWorldQuaternions:Object.fromEntries(['left','right'].map(side=>[side,nodes[side+'Foot'].getWorldQuaternion(new T.Quaternion()).toArray()])),minY:Math.min(s.left.minimumY,s.right.minimumY),afterRuntimeLiftMinY:Math.min(s.left.minimumY,s.right.minimumY)+lift});}
 const result={body,assetSha256:hash(await fs.readFile(new URL(body+'-dance-forefoot-v4.json',base))),avatarSha256:hash(bytes),runtimeGroundLift:lift,calibration121:calibration,sourceRows,dense721:dense,maximumNormalizedPositionVsOfflineMetres:matrixPositionError,maximumRawVsNormalizedOriginMetres:rawError,minimumAfterRuntimeLiftAtSourceKeys:Math.min(...sourceRows.flatMap(r=>['left','right'].map(s=>r.feet[s].afterRuntimeLiftMinimumY))),minimumAfterRuntimeLiftDense721:Math.min(...dense.map(r=>r.afterRuntimeLiftMinY)),coordinateReplayPassed:matrixPositionError<1e-5&&rawError<1e-5,limits:['CPU actual VRM/Mixer geometry validation, no browser/visual acceptance.','Reproduces pinned ce09 ground-lift rule; actual new runtime recording still needed.','Dense721 is finite sampling, not a proof over all real times.']};
 await fs.writeFile(new URL(body+'-actual-vrm-ground-check.json',out),JSON.stringify(result,null,2));summary.push({body,runtimeGroundLift:lift,maximumNormalizedPositionVsOfflineMetres:matrixPositionError,maximumRawVsNormalizedOriginMetres:rawError,minimumAfterRuntimeLiftAtSourceKeys:result.minimumAfterRuntimeLiftAtSourceKeys,minimumAfterRuntimeLiftDense721:result.minimumAfterRuntimeLiftDense721,coordinateReplayPassed:result.coordinateReplayPassed});
}
await fs.writeFile(new URL('actual-vrm-summary.json',out),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
