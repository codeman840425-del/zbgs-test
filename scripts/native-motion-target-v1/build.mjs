import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { FBXLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const receipt = p => { const b = fs.readFileSync(p); return { path: path.relative(ROOT, p).replaceAll('\\','/'), bytes: b.length, sha256: sha(b) }; };
const sourceFbx = path.join(ROOT, 'analysis/rokoko-pilot-archive-v1/vendor-output/5359146-frames0000-0719-1080p-end30.fbx');
const outIndex = process.argv.indexOf('--out');
const output = path.resolve(outIndex >= 0 && process.argv[outIndex + 1] ? process.argv[outIndex + 1] : path.join(ROOT, 'assets-source/native-motion-target-v1/generated-v2'));
const targets = [
  { id:'native-female-843ac-v1', avatar:'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm', shoeManifest:'prototype/public/assets/native-factory-v1/native-vroid-factory-fit-v1/equipment.json', shoeId:'native-unmasked-843ac-shoes-v1', floorY:-8.449510756143027e-7 },
  { id:'native-female-face-v1', avatar:'assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm', shoeManifest:'prototype/public/assets/native-face-factory-v2/equipment.json', shoeId:'native-vroid-face-geometry-shoes-v1', floorY:-8.449510756150829e-7 },
  { id:'native-female-waist-v1', avatar:'assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-waist-unmasked.vrm', shoeManifest:'prototype/public/assets/native-waist-factory-v1/equipment.json', shoeId:'native-vroid-waist-geometry-shoes-v1', floorY:-8.449510756150829e-7 },
  { id:'native-male-7586-v1', avatar:'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm', shoeManifest:'prototype/public/assets/native-male-factory-v1/native-vroid-male-equipment-v1/generated/equipment.json', shoeId:'native-unmasked-7586-shoes-v1', floorY:-1.1503509525979781e-6 },
];
const map = {hips:'Hips',spine:'Spine1',chest:'Spine3',upperChest:'Spine4',neck:'Neck',head:'Head',leftShoulder:'LeftShoulder',leftUpperArm:'LeftArm',leftLowerArm:'LeftForeArm',leftHand:'LeftHand',leftUpperLeg:'LeftThigh',leftLowerLeg:'LeftShin',leftFoot:'LeftFoot',leftToes:'LeftToe',rightShoulder:'RightShoulder',rightUpperArm:'RightArm',rightLowerArm:'RightForeArm',rightHand:'RightHand',rightUpperLeg:'RightThigh',rightLowerLeg:'RightShin',rightFoot:'RightFoot',rightToes:'RightToe'};
for (const [side,S] of [['left','Left'],['right','Right']]) for (const [i,f] of [[1,'Thumb'],[2,'Index'],[3,'Middle'],[4,'Ring'],[5,'Little']]) for (const [dst,src] of (i===1?[['Metacarpal','Metacarpal'],['Proximal','Proximal'],['Distal','Distal']]:[['Proximal','Proximal'],['Intermediate','Medial'],['Distal','Distal']])) map[side+f+dst]=`${S}Finger${i}${src}`;
const v = n => n.getWorldPosition(new THREE.Vector3());
const q = n => n.getWorldQuaternion(new THREE.Quaternion());
function configureSource(scene, clip, t) { for (const tr of clip.tracks) { const dot=tr.name.lastIndexOf('.'), node=scene.getObjectByName(tr.name.slice(0,dot)); if (node && ['position','quaternion','scale'].includes(tr.name.slice(dot+1))) node[tr.name.slice(dot+1)].fromArray(tr.createInterpolant().evaluate(t)); } scene.updateMatrixWorld(true); }
function serialRest(entries) { return Object.fromEntries(entries.map(([s,n])=>[s,{worldPosition:v(n).toArray(),worldQuaternion:q(n).toArray(),parent:n.parent?.name??null}])); }
function stripImages(bytes) {
  const jsonLength=bytes.readUInt32LE(12), doc=JSON.parse(bytes.subarray(20,20+jsonLength));
  delete doc.images; delete doc.textures; delete doc.samplers; delete doc.materials;
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives) delete primitive.material;
  const json=Buffer.from(JSON.stringify(doc)); const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
  const bin=bytes.subarray(20+jsonLength), header=Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(20+padded.length+bin.length,8); header.writeUInt32LE(padded.length,12); header.write('JSON',16);
  return Buffer.concat([header,padded,bin]);
}
function loadVrm(bytes) { const loader=new GLTFLoader(); loader.register(p=>new VRMLoaderPlugin(p)); const stripped=stripImages(bytes); return loader.parseAsync(stripped.buffer.slice(stripped.byteOffset,stripped.byteOffset+stripped.byteLength),''); }
function makeTrack(target, sourceScene, sourceRest, sourceSamples, duration, ratio, correction, legacy) {
  const semantics=Object.keys(map).filter(s=>target.has(s));
  const tracks=semantics.map(s=>({name:s+'.quaternion',type:'quaternion',times:[],values:[]}));
  const hip={name:'hips.position',type:'vector',times:[],values:[]};
  for (const sample of [...sourceSamples,{...sourceSamples.at(-1),time:duration}]) {
    const worlds={};
    for(const s of semantics){ const dq=new THREE.Quaternion().fromArray(sample.bones[s].q).multiply(new THREE.Quaternion().fromArray(sourceRest[s].q).invert()); const converted=correction.clone().multiply(dq).multiply(correction.clone().invert()); worlds[s]=converted.multiply(target.get(s).restWorldQ.clone()); }
    for(const tr of tracks){ const s=tr.name.split('.')[0], parentSemantic=target.get(s).parentSemantic; const parent=parentSemantic?worlds[parentSemantic]:target.get(s).actualParentWorldQ; const local=parent.clone().invert().multiply(worlds[s]).normalize(); if(tr.values.length){const prev=new THREE.Quaternion().fromArray(tr.values.slice(-4));if(local.dot(prev)<0)local.set(-local.x,-local.y,-local.z,-local.w);} tr.times.push(sample.time);tr.values.push(...local.toArray()); }
    const delta=new THREE.Vector3().fromArray(sample.bones.hips.p).sub(new THREE.Vector3().fromArray(sourceRest.hips.p)).multiplyScalar(ratio).applyQuaternion(correction);
    const world=delta.add(target.get('hips').restWorldP.clone());
    const local=world.clone().applyMatrix4(target.get('hips').actualParentWorldM.clone().invert()); hip.times.push(sample.time);hip.values.push(...local.toArray());
  }
  return [...tracks,hip];
}
async function main(){
  if(fs.existsSync(output)) throw Error('Output exists, preserve it and use a fresh source package');
  const fbxBytes=fs.readFileSync(sourceFbx), scene=new FBXLoader().parse(fbxBytes.buffer.slice(fbxBytes.byteOffset,fbxBytes.byteOffset+fbxBytes.byteLength),''); const clip=scene.animations[0];
  configureSource(scene,clip,0); const sourceRestNodes=Object.fromEntries(Object.entries(map).map(([s,n])=>[s,scene.getObjectByName(n)]));
  if(Object.values(sourceRestNodes).some(x=>!x)) throw Error('Missing FBX source bone');
  const sourceRest=Object.fromEntries(Object.entries(sourceRestNodes).map(([s,n])=>[s,{p:v(n).toArray(),q:q(n).toArray()}]));
  const lateral=v(sourceRestNodes.leftUpperLeg).sub(v(sourceRestNodes.rightUpperLeg)).normalize(); const forward=lateral.clone().cross(new THREE.Vector3(0,1,0)); const correction=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(forward.x,forward.z));
  const sourceSamples=[]; for(let i=0;i<900;i++){configureSource(scene,clip,Math.max(1,i)/30);sourceSamples.push({time:i/30,bones:Object.fromEntries(Object.entries(map).map(([s,n])=>[s,{p:v(scene.getObjectByName(n)).toArray(),q:q(scene.getObjectByName(n)).toArray()}]))});}
  const reports=[], products=[]; for(const cfg of targets){
    const avatarPath=path.join(ROOT,cfg.avatar), avatarBytes=fs.readFileSync(avatarPath), parsed=await loadVrm(avatarBytes), vrm=parsed.userData.vrm; VRMUtils.rotateVRM0(vrm); vrm.scene.updateMatrixWorld(true);
    const target=new Map(); for(const s of Object.keys(map)){ const n=vrm.humanoid.getNormalizedBoneNode(s); if(!n) continue; let parent=n.parent,parentSemantic=null; while(parent){ parentSemantic=Object.entries(vrm.humanoid.normalizedHumanBones ?? {}).find(([,b])=>b.node===parent)?.[0] ?? null; if(parentSemantic) break; parent=parent.parent; } target.set(s,{node:n,parentSemantic,directParent:parent===n.parent,restWorldP:v(n),restWorldQ:q(n),actualParentWorldM:parent?.matrixWorld.clone()??new THREE.Matrix4(),actualParentWorldQ:parent?q(parent):new THREE.Quaternion()}); }
    const missing=Object.keys(map).filter(s=>!target.has(s)); if(missing.length) throw Error(`${cfg.id} missing bones ${missing.join(',')}`);
    const rig={schema:'native-motion-target-rig-v1',avatarSha256:sha(avatarBytes),profile:cfg.id,sourceFloorY:cfg.floorY,metaVersion:vrm.meta?.metaVersion??null,normalizedBones:Object.fromEntries([...target].map(([s,x])=>[s,{parentSemantic:x.parentSemantic,directParent:x.directParent,restWorldPositionM:x.restWorldP.toArray(),restWorldQuaternion:x.restWorldQ.toArray()}]))}; const rigBytes=Buffer.from(JSON.stringify(rig));
    const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,cfg.shoeManifest))); const shoe=manifest.items.find(x=>x.id===cfg.shoeId); if(!shoe) throw Error(`Missing shoe ${cfg.id}`); const shoePath=path.resolve(path.dirname(path.join(ROOT,cfg.shoeManifest)),shoe.url); const shoeBytes=fs.readFileSync(shoePath);
    const ratio=(target.get('hips').restWorldP.y-cfg.floorY)/sourceRest.hips.p[1];
    const tracks=makeTrack(target,scene,sourceRest,sourceSamples,30,ratio,correction,vrm.meta?.metaVersion==='0');
    const data={schema:'normalized-vrm-motion.1',coordinateSpace:'three-vrm-3.5.5-normalized-local-absolute',avatarSha256:sha(avatarBytes),sourceClipSha256:sha(fbxBytes),normalizedRigSha256:sha(rigBytes),footwearSha256:sha(shoeBytes),clip:{name:'Rokoko_Pexels5359146_30s_v1',duration:30,tracks},provenance:{source:'Rokoko vendor FBX; deterministic CPU target conversion',targetProfile:cfg.id,targetFloorY:cfg.floorY,sourceSamples:900,sourceRestSpace:'FBX world metres; one rest-world conversion; VRM1 native basis',limitations:['source action ownership and visual/runtime acceptance remain pending','no new arm offsets, contact fitting, or controller changes']}};
    const dir=path.join(output,cfg.id); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'motion.json'),JSON.stringify(data)); fs.writeFileSync(path.join(dir,'target-rig.json'),rigBytes); reports.push({id:cfg.id,avatar:receipt(avatarPath),motion:{path:`assets-source/native-motion-target-v1/generated-v2/${cfg.id}/motion.json`,bytes:Buffer.byteLength(JSON.stringify(data)),sha256:sha(Buffer.from(JSON.stringify(data)))},targetBoneCount:target.size,missing,ratio,sourceRestHipY:sourceRest.hips.p[1],targetRestHipY:target.get('hips').restWorldP.y,targetFloorY:cfg.floorY,sourceUnitToTargetMetres:ratio,directParentCount:[...target.values()].filter(x=>x.directParent).length,shoe:{id:shoe.id,sha256:sha(shoeBytes)},duration:30,trackCount:tracks.length});
  }
  const manifest={schema:'native-motion-target-v1',version:2,revision:'generated-v2',sourceClip:receipt(sourceFbx),sourceUnits:'FBX authoring units observed as 94.00000000000125 source units for hips and converted by measured target hip/source hip ratio',correction:{kind:'source-foot-facing-y-axis',angleRad:-Math.atan2(forward.x,forward.z),appliedTo:'hips displacement and every world quaternion delta as C*dq*C^-1'},targets:reports,format:'normalized-vrm-motion.1',runtimeAdmission:false}; fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n'); fs.writeFileSync(path.join(output,'source-rest.json'),JSON.stringify({schema:'native-motion-source-rest-v1',source:receipt(sourceFbx),bones:sourceRest},null,2)+'\n'); console.log(JSON.stringify({output,reports},null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
