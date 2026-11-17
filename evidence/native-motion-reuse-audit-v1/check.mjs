// Read-only source/rest inspection. Does not bake animation, write rigs, or fit poses.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import { FBXLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { foundationProfile } from '../../prototype/src/foundation-profiles.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p), receipt=p=>{const b=read(p);return {path:p,bytes:b.length,sha256:sha(b)};};
const output=process.argv[2];if(!output||fs.existsSync(output))throw Error('Supply fresh result JSON path');
const contract=JSON.parse(read('assets-source/rokoko-target-adapter-v1/input-contract.json'));
const archived={
 'source-fbx':'analysis/rokoko-pilot-archive-v1/vendor-output/5359146-frames0000-0719-1080p-end30.fbx',
 'female-rig':'analysis/rokoko-pilot-archive-v1/reference/assets-source/video-target-adaptation-v1/female-normalized-rig.json',
 'male-rig':'analysis/rokoko-pilot-archive-v1/reference/assets-source/video-target-adaptation-v1/male-normalized-rig.json',
};
const inputs=Object.entries(archived).map(([k,p])=>{const r=receipt(p),e=contract.inputs[k];if(r.sha256!==e.sha256||r.bytes!==e.bytes)throw Error('Archive mismatch '+k);return {key:k,...r};});
const sourceBytes=read(archived['source-fbx']),fbx=new FBXLoader().parse(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength),'');
const clip=fbx.animations[0];
for(const t of clip.tracks){const i=t.name.lastIndexOf('.'),n=fbx.getObjectByName(t.name.slice(0,i)),p=t.name.slice(i+1);if(n&&['position','quaternion','scale'].includes(p))n[p].fromArray(t.createInterpolant().evaluate(0));}
fbx.updateMatrixWorld(true);
const sourceMap={hips:'Hips',spine:'Spine1',chest:'Spine3',upperChest:'Spine4',neck:'Neck',head:'Head'};
for(const [side,S] of [['left','Left'],['right','Right']]){
 for(const [target,source] of Object.entries({Shoulder:'Shoulder',UpperArm:'Arm',LowerArm:'ForeArm',Hand:'Hand',UpperLeg:'Thigh',LowerLeg:'Shin',Foot:'Foot',Toes:'Toe'}))sourceMap[side+target]=S+source;
 for(const [i,f] of [[1,'Thumb'],[2,'Index'],[3,'Middle'],[4,'Ring'],[5,'Little']])for(const [dst,src] of (i===1?[['Metacarpal','Metacarpal'],['Proximal','Proximal'],['Distal','Distal']]:[['Proximal','Proximal'],['Intermediate','Medial'],['Distal','Distal']]))if(fbx.getObjectByName(`${S}Finger${i}${src}`))sourceMap[side+f+dst]=`${S}Finger${i}${src}`;
}
const world=n=>({p:n.getWorldPosition(new T.Vector3()).toArray(),q:n.getWorldQuaternion(new T.Quaternion()).toArray()});
const sourceRest=Object.fromEntries(Object.entries(sourceMap).map(([s,n])=>{const node=fbx.getObjectByName(n);if(!node)throw Error('Missing source '+n);return[s,world(node)];}));
// Same non-rendering parse as existing exporter. Thumbnail extraction defaults false in installed VRMLoader.
function strip(bytes){const len=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+len));for(const m of j.meshes||[])for(const p of m.primitives)delete p.material;delete j.materials;delete j.images;delete j.textures;if(j.extensions?.VRM){j.extensions.VRM.materialProperties=[];delete j.extensions.VRM.meta.texture;}const a=Buffer.from(JSON.stringify(j)),txt=Buffer.concat([a,Buffer.alloc((4-a.length%4)%4,32)]),bin=bytes.subarray(20+len),h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+txt.length+bin.length,8);h.writeUInt32LE(txt.length,12);h.write('JSON',16);return Buffer.concat([h,txt,bin]);}
const targets=[];
for(const id of ['native-female-843ac-v1','native-female-face-v1','native-female-waist-v1','native-male-7586-v1']){
 const cfg=foundationProfile(id),file='prototype/public'+cfg.url,b=read(file);if(sha(b)!==cfg.sha256)throw Error('Target SHA '+id);
 const bytes=strip(b),loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));const {userData:{vrm}}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const before=vrm.scene.quaternion.toArray();VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
 const byNode=new Map(Object.entries(vrm.humanoid.normalizedHumanBones).map(([s,b])=>[b.node,s]));
 const bones=Object.fromEntries([...byNode].map(([n,s])=>{let p=n.parent;while(p&&!byNode.has(p))p=p.parent;return[s,{...world(n),parent:p?byNode.get(p):null,localPosition:n.position.toArray(),localQuaternion:n.quaternion.toArray()}];}));
 const missing=Object.keys(sourceMap).filter(s=>!bones[s]);
 const unmappedParents=Object.keys(sourceMap).filter(s=>bones[s]?.parent&&!sourceMap[bones[s].parent]);
 const manifestPath='prototype/public'+cfg.manifestUrl,mb=read(manifestPath),manifest=JSON.parse(mb),shoe=manifest.items.find(x=>x.id===cfg.ids.shoes);
 if(shoe.compatibleAvatarSha256!==cfg.sha256)throw Error('Shoe fit identity');
 const shoePath=manifestPath.slice(0,manifestPath.lastIndexOf('/')+1)+shoe.url,sb=read(shoePath);if(sha(sb)!==shoe.sha256)throw Error('Shoe SHA');
 const rawByName=new Map(),inverseByBone=new Map();vrm.scene.traverse(n=>{if(n.isBone)rawByName.set(n.name,n);if(n.isSkinnedMesh)n.skeleton.bones.forEach((bone,i)=>inverseByBone.set(bone,n.skeleton.boneInverses[i]));});
 const bindingErrors=shoe.bindings.map(binding=>{const raw=rawByName.get(binding.targetRawBone),inv=inverseByBone.get(raw);if(!raw||!inv)throw Error('Missing shoe bind '+binding.targetRawBone);return {bone:binding.targetRawBone,max:Math.max(...inv.elements.map((v,i)=>Math.abs(v-binding.inverseBindMatrix[i])))};});
 targets.push({profile:id,avatar:receipt(file),metaVersion:vrm.meta.metaVersion,rotateVRM0ChangedQuaternion:JSON.stringify(before)!==JSON.stringify(vrm.scene.quaternion.toArray()),normalizedBoneCount:byNode.size,mappedSourceBoneCount:Object.keys(sourceMap).length,missingSourceSemantics:missing,unmappedParents,rawNormalizedRestMaxErrorM:Math.max(...[...byNode].map(([n,s])=>n.getWorldPosition(new T.Vector3()).distanceTo(vrm.humanoid.getRawBoneNode(s).getWorldPosition(new T.Vector3())))),restBones:bones,sourceFloorY:cfg.sourceFloorY,hipRatio:bones.hips.p[1]/sourceRest.hips.p[1],footwear:{manifest:receipt(manifestPath),id:shoe.id,...receipt(shoePath),oldExporterBindCheckMax:Math.max(...bindingErrors.map(x=>x.max)),bindings:bindingErrors.length},shoeSkinnedPoseNotRechecked:true});
}
const manifests=JSON.parse(read('prototype/public/assets/motion/m1c/dance-imports.json'));
const normalizedEntries=manifests.entries.filter(x=>x.format==='normalized-vrm-motion.1').map(e=>({id:e.id,workbenchRole:e.workbenchRole,variants:e.variants.map(v=>{const r=receipt('prototype/public/assets/motion/m1c/'+v.file);if(r.sha256!==v.sha256||r.bytes!==v.bytes)throw Error('Frozen motion bytes');return{avatarSha256:v.avatarSha256,...r};}),newTargetCoverage:targets.map(t=>({profile:t.profile,available:e.variants.some(v=>v.avatarSha256===t.avatar.sha256)}))}));
const result={schema:'native-motion-reuse-readonly-audit-v1',scope:'source identity and normalized rest only; no new motion, rig export, skin/contact, GPU or fitting',inputs,fbx:{duration:clip.duration,trackCount:clip.tracks.length,unitScaleFactorMetadata:fbx.userData.unitScaleFactor,sceneQuaternion:fbx.quaternion.toArray(),sceneScale:fbx.scale.toArray(),sourceMap,sourceRest},targets,normalizedEntries,dependencies:['scripts/pose-reference/retarget-rokoko-pilot.mjs','scripts/video-motion/export-target-rigs.mjs','prototype/src/motion-source.js','prototype/src/normalized-motion.js','prototype/src/foundation-profiles.js','prototype/node_modules/three/examples/jsm/loaders/FBXLoader.js','prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js'].map(receipt)};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({source:inputs[0],fbx:{duration:clip.duration,tracks:clip.tracks.length,unitScaleFactor:fbx.userData.unitScaleFactor,hips:sourceRest.hips},targets:targets.map(({profile,metaVersion,normalizedBoneCount,mappedSourceBoneCount,missingSourceSemantics,unmappedParents,rawNormalizedRestMaxErrorM,hipRatio})=>({profile,metaVersion,normalizedBoneCount,mappedSourceBoneCount,missingSourceSemantics,unmappedParents,rawNormalizedRestMaxErrorM,hipRatio})),output},null,2));
