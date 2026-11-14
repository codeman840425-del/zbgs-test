// Independently check offline Python TRS/skin calculations with installed Three.
// No renderer/browser/network. Removes materials only to avoid texture DOM APIs.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const folder=path.resolve(process.argv[2]||'output/playwright/m1c-source');
const report=JSON.parse(await fs.readFile(path.join(folder,'source-analysis.json'),'utf8'));
const bytes=await fs.readFile(process.argv[3]||'analysis/assets/UAL1_Standard.glb'),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.material;
delete json.materials;delete json.images;delete json.textures;
const text=Buffer.from(JSON.stringify(json));const padding=Buffer.alloc((4-text.length%4)%4,32);const j=Buffer.concat([text,padding]),bin=bytes.subarray(20+jsonLength),head=Buffer.alloc(20);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(20+j.length+bin.length,8);head.writeUInt32LE(j.length,12);head.write('JSON',16);const cooked=Buffer.concat([head,j,bin]);
const gltf=await new GLTFLoader().parseAsync(cooked.buffer.slice(cooked.byteOffset,cooked.byteOffset+cooked.byteLength),'');const mixer=new THREE.AnimationMixer(gltf.scene);
const feet={l:[],r:[]};gltf.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const g=mesh.geometry,refs=g.index?[...new Set(g.index.array)]:Array.from({length:g.attributes.position.count},(_,i)=>i);for(const side of ['l','r'])for(const index of refs){let weight=0;for(let k=0;k<4;k++){const bone=mesh.skeleton.bones[g.attributes.skinIndex.getComponent(index,k)];if(['foot_'+side,'ball_'+side].includes(bone.name))weight+=g.attributes.skinWeight.getComponent(index,k);}if(weight>=.5)feet[side].push({mesh,index});}});
const results=[];let active=null;
for(const expected of report.crosscheckSamples){
 if(active?.getClip().name!==expected.clip){mixer.stopAllAction();active=mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,expected.clip));active.setLoop(THREE.LoopOnce,1);active.clampWhenFinished=true;active.play();active.paused=true;}
 active.time=expected.time;mixer.update(0);gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update();});
 const jointErrors=Object.fromEntries(Object.entries(expected.joints).map(([name,p])=>[name,gltf.scene.getObjectByName(name).getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...p))]));
 const footMinY=Object.fromEntries(Object.entries(feet).map(([side,points])=>[side,Math.min(...points.map(({mesh,index})=>mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).y))]));
 results.push({clip:expected.clip,phase:expected.phase,jointErrors,footMinY,footErrors:Object.fromEntries(['l','r'].map(s=>[s,Math.abs(footMinY[s]-expected.footMinY[s])]))});
}
const maxJointError=Math.max(...results.flatMap(r=>Object.values(r.jointErrors))),maxSkinError=Math.max(...results.flatMap(r=>Object.values(r.footErrors)));
await fs.writeFile(path.join(folder,'three-crosscheck.json'),JSON.stringify({method:'Installed Three GLTFLoader+AnimationMixer+SkinnedMesh, source geometry/joints untouched; texture/material references removed only',footVertexCounts:{l:feet.l.length,r:feet.r.length},maxJointError,maxSkinError,passed:maxJointError<1e-5&&maxSkinError<1e-5,results},null,2));
console.log({maxJointError,maxSkinError,footVertices:[feet.l.length,feet.r.length]});if(maxJointError>=1e-5||maxSkinError>=1e-5)throw Error('Independent evaluator disagreement');
