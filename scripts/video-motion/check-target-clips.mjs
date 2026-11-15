import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const root=new URL('../../',import.meta.url),out=new URL('assets-source/video-target-adaptation-v1/',root),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const reports=[];
for(const body of ['female','male']){
 const rig=JSON.parse(await fs.readFile(new URL(body+'-normalized-rig.json',out))),asset=JSON.parse(await fs.readFile(new URL(body+'-squat-normalized.json',out))),reference=JSON.parse(await fs.readFile(new URL(body+'-world-reference.json',out)));
 const bytes=await fs.readFile(new URL('prototype/public'+rig.source,root));if(hash(bytes)!==asset.avatarSha256)throw Error('wrong target');
 const len=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+len));for(const m of j.meshes)for(const p of m.primitives)delete p.material;delete j.materials;delete j.textures;delete j.images;j.extensions.VRM.materialProperties=[];delete j.extensions.VRM.meta.texture;
 const a=Buffer.from(JSON.stringify(j)),txt=Buffer.concat([a,Buffer.alloc((4-a.length%4)%4,32)]),bin=bytes.subarray(20+len),h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+txt.length+bin.length,8);h.writeUInt32LE(txt.length,12);h.write('JSON',16);const cooked=Buffer.concat([h,txt,bin]);const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));const {userData:{vrm}}=await loader.parseAsync(cooked.buffer.slice(cooked.byteOffset,cooked.byteOffset+cooked.byteLength),'');VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
 const json=structuredClone(asset.clip);for(const tr of json.tracks){const [semantic,property]=tr.name.split('.');const bone=vrm.humanoid.getNormalizedBoneNode(semantic);if(!bone||!['quaternion','position'].includes(property))throw Error('bad semantic');tr.name=bone.name+'.'+property;}
 const clip=T.AnimationClip.parse(json);if(!clip.validate())throw Error('invalid clip');const mixer=new T.AnimationMixer(vrm.scene);const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 let error=0,rawError=0;const samples=[];
 for(let k=0;k<240;k++){mixer.setTime(reference.times[k]);vrm.scene.updateMatrixWorld(true);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);for(let i=0;i<reference.names.length;i++){const s=reference.names[i],norm=vrm.humanoid.getNormalizedBoneNode(s),raw=vrm.humanoid.getRawBoneNode(s),p=norm.getWorldPosition(new T.Vector3()),wanted=new T.Vector3(...reference.world[k][i].slice(0,3).map(row=>row[3]));error=Math.max(error,p.distanceTo(wanted));rawError=Math.max(rawError,p.distanceTo(raw.getWorldPosition(new T.Vector3())));}if([0,95,195,239].includes(k))samples.push({frame:k,hips:vrm.humanoid.getRawBoneNode('hips').getWorldPosition(new T.Vector3()).toArray(),leftFoot:vrm.humanoid.getRawBoneNode('leftFoot').getWorldPosition(new T.Vector3()).toArray(),rightFoot:vrm.humanoid.getRawBoneNode('rightFoot').getWorldPosition(new T.Vector3()).toArray()});}
 const result={body,frames:240,tracks:clip.tracks.length,maximumNormalizedPositionVsOfflineMetres:error,maximumRawVsNormalizedOriginMetres:rawError,samples,passed:error<1e-5&&rawError<1e-5};reports.push(result);if(!result.passed)throw Error(JSON.stringify(result));
}
await fs.writeFile(new URL('actual-vrm-mixer-check.json',out),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
