// Reuses material-free CPU loader/normalized update convention from
// scripts/video-motion/export-target-rigs.mjs. No renderer, controller, or asset mutation.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
const root=new URL('../../',import.meta.url), pkg=new URL('./',import.meta.url);
const mode=process.argv[2],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(new URL(p,root));
const spec=JSON.parse(await fs.readFile(new URL('spec.json',pkg)));
for(const [p,h] of Object.entries(spec.pins))if(sha(await read(p))!==h)throw Error('Input pin changed: '+p);
const cfg=foundationProfile('male'), bytes=await read('prototype/public'+cfg.url);
if(cfg.id!==spec.avatarId||sha(bytes)!==spec.avatarSha256||cfg.sha256!==spec.avatarSha256)throw Error('Source/profile identity');
const jsonLength=bytes.readUInt32LE(12), original=JSON.parse(bytes.subarray(20,20+jsonLength));
const j=structuredClone(original);
for(const m of j.meshes||[])for(const p of m.primitives)delete p.material;
delete j.materials;delete j.images;delete j.textures;
if(j.extensions?.VRM){j.extensions.VRM.materialProperties=[];delete j.extensions.VRM.meta.texture;}
const a=Buffer.from(JSON.stringify(j)),txt=Buffer.concat([a,Buffer.alloc((4-a.length%4)%4,32)]),bin=bytes.subarray(20+jsonLength),h=Buffer.alloc(20);
h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+txt.length+bin.length,8);h.writeUInt32LE(txt.length,12);h.write('JSON',16);
const b=Buffer.concat([h,txt,bin]),loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
const gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
const nodes=await Promise.all(original.nodes.map((_,i)=>gltf.parser.getDependency('node',i)));
const nodeIds=new Map(nodes.map((n,i)=>[n,i]));
const norm=Object.fromEntries(Object.entries(vrm.humanoid.normalizedHumanBones).map(([s,b])=>[s,b.node]));
const semantic=new Map(Object.entries(norm).map(([s,n])=>[n,s]));
const snap=n=>({name:n.name,parentName:n.parent?.name??null,position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),matrix:n.matrix.toArray(),worldMatrix:n.matrixWorld.toArray(),worldPosition:n.getWorldPosition(new T.Vector3()).toArray(),worldQuaternion:n.getWorldQuaternion(new T.Quaternion()).toArray()});
const snapshot=()=>({raw:nodes.map((n,id)=>({id,parentId:nodeIds.get(n.parent)??null,...snap(n)})),normalized:Object.fromEntries(Object.entries(norm).map(([s,n])=>[s,{parentSemantic:semantic.get(n.parent)??null,rawNodeId:nodeIds.get(vrm.humanoid.getRawBoneNode(s)),...snap(n)}]))});
const baseline=snapshot(),selected=new Set();
for(const side of ['left','right'])for(const part of ['Shoulder','UpperArm','LowerArm','Hand']){
 let n=norm[side+part];if(!n)throw Error('Missing semantic '+side+part);
 while(semantic.has(n)){selected.add(semantic.get(n));n=n.parent;}
}
const ordered=Object.keys(norm).filter(s=>selected.has(s));
for(const s of ordered){const n=norm[s];if(n.scale.toArray().some(x=>Math.abs(x-1)>1e-12))throw Error('Nonunit scale '+s);if(n.quaternion.angleTo(new T.Quaternion())>1e-10)throw Error('Nonidentity normalized rest '+s);if(semantic.has(n.parent)&&!selected.has(semantic.get(n.parent)))throw Error('Missing ancestor');}
const roots=ordered.filter(s=>!semantic.has(norm[s].parent));
if(roots.length!==1)throw Error('Ambiguous normalized root');
const anchor=norm[roots[0]].parent;
if(anchor.getWorldScale(new T.Vector3()).toArray().some(x=>Math.abs(x-1)>1e-12))throw Error('Anchor scale');
function applyInput(c){vrm.humanoid.resetNormalizedPose();if(c.bone)norm[c.bone].quaternion.setFromAxisAngle(new T.Vector3(...c.axis),c.angleRadians);vrm.scene.updateMatrixWorld(true);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);}
async function write(name,v){await fs.writeFile(new URL(name,pkg),JSON.stringify(v,null,2)+'\n',{flag:'wx'});}
if(mode==='export'){
 const cases=[];
 for(const c of spec.cases){if(c.kind!=='rest')applyInput(c);cases.push({input:c,...snapshot()});}
 const skins=[];vrm.scene.traverse(n=>{if(n.isSkinnedMesh)skins.push({mesh:n.name,boneNodeIds:n.skeleton.bones.map(x=>nodeIds.get(x)),inverseBindMatrices:n.skeleton.boneInverses.map(x=>x.toArray()),bindMatrix:n.bindMatrix.toArray()});});
 await write('source-rig.json',{schema:'vrm-mink-source-rig-v1',avatarId:cfg.id,avatarSha256:sha(bytes),threeRevision:T.REVISION,metaVersion:vrm.meta.metaVersion,sourceNodes:original.nodes,sourceSkins:original.skins,sourceScenes:original.scenes,scene:snap(vrm.scene),anchor:snap(anchor),baseline,selectedSemantics:ordered,selectedRoot:roots[0],skins,cases});
 console.log(JSON.stringify({stage:'export',originalNodes:nodes.length,normalizedBones:Object.keys(norm).length,selected:ordered,cases:cases.length}));
}else if(mode==='replay'){
 const source=JSON.parse(await fs.readFile(new URL('source-rig.json',pkg))),round=JSON.parse(await fs.readFile(new URL('solver-roundtrip.json',pkg)));
 const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const qerr=(a,b)=>{const d=new T.Quaternion(...a).invert().multiply(new T.Quaternion(...b)).normalize();return 2*Math.atan2(Math.hypot(d.x,d.y,d.z),Math.abs(d.w));};
 const results=[];
 for(const c of round.cases){
  vrm.humanoid.resetNormalizedPose();
  // Consume independently reconstructed local rotations, not the input qpos.
  for(const s of ordered)norm[s].quaternion.fromArray(c.recoveredNormalizedLocal[s].quaternion);
  vrm.scene.updateMatrixWorld(true);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const actual=snapshot(),expected=source.cases.find(x=>x.input.id===c.id);
  const rows=actual.raw.map((r,i)=>({nodeId:i,name:r.name,positionErrorMm:dist(r.worldPosition,expected.raw[i].worldPosition)*1000,rotationErrorRad:qerr(r.worldQuaternion,expected.raw[i].worldQuaternion),matrixMaxError:Math.max(...r.worldMatrix.map((v,k)=>Math.abs(v-expected.raw[i].worldMatrix[k]))),parentUnchanged:r.parentId===expected.raw[i].parentId}));
  const normalizedRows=ordered.map(s=>({semantic:s,worldPositionErrorMm:dist(actual.normalized[s].worldPosition,expected.normalized[s].worldPosition)*1000,localQuaternionErrorRad:qerr(actual.normalized[s].quaternion,expected.normalized[s].quaternion)}));
  results.push({id:c.id,actual,rawErrors:rows,normalizedErrors:normalizedRows,maxRawPositionErrorMm:Math.max(...rows.map(x=>x.positionErrorMm)),maxRawRotationErrorRad:Math.max(...rows.map(x=>x.rotationErrorRad))});
 }
 const single=source.cases.find(x=>x.input.bone),rest=source.cases[0];
 const wristDisplacementMm=dist(single.normalized.leftHand.worldPosition,rest.normalized.leftHand.worldPosition)*1000;
 const pass=results.every(r=>r.maxRawPositionErrorMm<=spec.positionToleranceMm&&r.maxRawRotationErrorRad<=spec.rotationToleranceRad&&r.rawErrors.every(x=>x.parentUnchanged))&&wristDisplacementMm>1;
 const result={schema:'vrm-mink-runtime-replay-v1',status:pass?'passed':'failed',sourceRigSha256:sha(await fs.readFile(new URL('source-rig.json',pkg))),solverReadbackSha256:sha(await fs.readFile(new URL('solver-roundtrip.json',pkg))),originalNodeCount:nodes.length,selectedSemantics:ordered,wristDisplacementMm,results,scope:'Actual three-vrm normalized-to-raw replay, no renderer, motion controller, IK, collision, LBS surface or garment qualification'};
 await write('runtime-replay.json',result);console.log(JSON.stringify({stage:'replay',status:result.status,wristDisplacementMm,cases:results.map(x=>({id:x.id,maxRawPositionErrorMm:x.maxRawPositionErrorMm,maxRawRotationErrorRad:x.maxRawRotationErrorRad}))}));
 if(!pass)process.exitCode=2;
}else throw Error('mode must be export or replay');
