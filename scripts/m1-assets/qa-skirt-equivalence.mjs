// No browser. Real preserved body/garment geometry, weights and raw bone rig.
// This verifies equivalent geometric results; it does not pass visual quality
// or substitute for fixed-build browser performance measurements.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';


const baseURL=new URL('../../',import.meta.url);
const oldPath=new URL('assets-source/m1/checkpoints/m1-skirt-66.js',baseURL);
const oldText=await readFile(oldPath,'utf8');
const threeURL=new URL('prototype/node_modules/three/build/three.module.js',baseURL).href;
const candidatePath=new URL(process.env.QA_CANDIDATE||'prototype/src/m1-skirt.js',baseURL);
const candidateText=await readFile(candidatePath,'utf8');
const candidate=(await import('data:text/javascript;base64,'+Buffer.from(candidateText.replace('from "three"',`from ${JSON.stringify(threeURL)}`)).toString('base64'))).createM1Skirt;
const reference=(await import('data:text/javascript;base64,'+Buffer.from(oldText.replace('from "three"',`from ${JSON.stringify(threeURL)}`)).toString('base64'))).createM1Skirt;
const loader=new GLTFLoader();
loader.register(()=>({name:'CPUFixtureNoTextureDecode',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
async function load(relative){const b=await readFile(new URL(relative,baseURL));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const avatarBytes=await readFile(new URL('prototype/public/assets/foundation/base-female-roundtrip.vrm',baseURL));
assert.equal(createHash('sha256').update(avatarBytes).digest('hex'),'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95');
const json=JSON.parse(avatarBytes.subarray(20,20+avatarBytes.readUInt32LE(12)).toString());
const avatar=await load('prototype/public/assets/foundation/base-female-roundtrip.vrm');
const root=new THREE.Group();root.add(avatar.scene);avatar.scene.rotation.y=Math.PI;root.updateMatrixWorld(true);
const nodes={};for(const x of json.extensions.VRM.humanoid.humanBones)nodes[x.bone]=avatar.scene.getObjectByName(json.nodes[x.node].name);
const vrm={scene:avatar.scene,humanoid:{getRawBoneNode:name=>nodes[name]}};
const body=[];avatar.scene.traverse(m=>{if(m.isSkinnedMesh&&(Array.isArray(m.material)?m.material:[m.material]).some(x=>/_Body_\d+_SKIN/.test(x.name)))body.push(m);});
assert.equal(body.length,1);
const gltf=await load('prototype/public/assets/m1/m1-uniform-skirt.glb');let source;gltf.scene.traverse(m=>{if(m.isSkinnedMesh)source=m;});assert.ok(source);
const bones=source.skeleton.bones.map(b=>{const existing=avatar.scene.getObjectByName(b.name);assert.ok(existing?.isBone,b.name);return existing;});
const inverse=source.skeleton.boneInverses.map(m=>m.clone()),bind=source.bindMatrix.clone();
const group=new THREE.Group();avatar.scene.add(group);group.add(source);source.bind(new THREE.Skeleton(bones,inverse),bind);root.updateMatrixWorld(true);
const old=reference({vrm,source,body}),next=candidate({vrm,source,body});
assert.deepEqual(next.getInfo().thighRadii,old.getInfo().thighRadii);
const hipRest=nodes.hips.position.clone(),rest=new Map(Object.entries(nodes).map(([n,b])=>[n,b.quaternion.clone()]));
let callbackCount=0,contactCount=0;
function collider(dimensions,position){
 const localBox=new THREE.Box3(new THREE.Vector3(...dimensions).multiplyScalar(-.5),new THREE.Vector3(...dimensions).multiplyScalar(.5));
 const localMatrix=new THREE.Matrix4().makeTranslation(...position),matrixWorld=new THREE.Matrix4(),inverseMatrixWorld=new THREE.Matrix4(),local=new THREE.Vector3();
 return {localBox,matrixWorld,refresh(){matrixWorld.multiplyMatrices(root.matrixWorld,localMatrix);inverseMatrixWorld.copy(matrixWorld).invert();},
 projectOut(p,margin){callbackCount++;local.copy(p).applyMatrix4(inverseMatrixWorld);const lo=localBox.min,hi=localBox.max;
 if(local.x<lo.x-margin||local.x>hi.x+margin||local.y<lo.y-margin||local.y>hi.y+margin||local.z<lo.z-margin||local.z>hi.z+margin)return false;
 const faces=[[local.x-lo.x+margin,'x',lo.x-margin],[hi.x+margin-local.x,'x',hi.x+margin],[local.y-lo.y+margin,'y',lo.y-margin],[hi.y+margin-local.y,'y',hi.y+margin],[local.z-lo.z+margin,'z',lo.z-margin],[hi.z+margin-local.z,'z',hi.z+margin]];
 const face=faces.reduce((a,b)=>a[0]<b[0]?a:b);local[face[1]]=face[2];p.copy(local).applyMatrix4(matrixWorld);contactCount++;return true;}};
}
const boxes=[collider([.55,.07,.5],[0,.435,-.16]),collider([.55,.5,.07],[0,.70,-.38])];
let maxPositionDifference=0,maxNormalDifference=0,maxMetricDifference=0;
const cases=[];
for(const kind of ['walk','sit-rise','yaw-translated-seat']){
 const startingContacts=contactCount;let frameMax=0,maxReferenceStretch=1,maxCandidateStretch=1;
 for(let step=0;step<120;step++){
  const time=step/119,phase=time*Math.PI*6,sit=kind==='walk'?0:Math.sin(time*Math.PI)**2;
  root.position.set(kind==='yaw-translated-seat'?1.7:0,0,kind==='yaw-translated-seat'?-1.3:0);root.rotation.y=kind==='yaw-translated-seat'?time*Math.PI*2:.35;
  nodes.hips.position.copy(hipRest).add(new THREE.Vector3(0,-.37*sit,0));
  nodes.hips.quaternion.copy(rest.get('hips')).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.25*sit,0,0)));
  nodes.leftUpperLeg.quaternion.copy(rest.get('leftUpperLeg')).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(1.45*sit+.55*Math.sin(phase)*(1-sit),0,.04)));
  nodes.rightUpperLeg.quaternion.copy(rest.get('rightUpperLeg')).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(1.45*sit-.55*Math.sin(phase)*(1-sit),0,-.04)));
  root.updateMatrixWorld(true);boxes.forEach(b=>b.refresh());
  const selected=kind==='walk'?[]:boxes;
  old.update(1/120,selected);next.update(1/120,selected);
  maxReferenceStretch=Math.max(maxReferenceStretch,old.getInfo().maxEdgeStretch);maxCandidateStretch=Math.max(maxCandidateStretch,next.getInfo().maxEdgeStretch);
  for(const [name,maximum]of [['position','position'],['normal','normal']]){
   const a=old.mesh.geometry.attributes[name].array,b=next.mesh.geometry.attributes[name].array;assert.equal(a.length,b.length);
   for(let i=0;i<a.length;i++){const difference=Math.abs(a[i]-b[i]);assert.ok(Number.isFinite(difference));if(maximum==='position'){maxPositionDifference=Math.max(maxPositionDifference,difference);frameMax=Math.max(frameMax,difference);}else maxNormalDifference=Math.max(maxNormalDifference,difference);}
  }
  for(const key of ['maxPanelCorrection','maxEdgeStretch'])maxMetricDifference=Math.max(maxMetricDifference,Math.abs(old.getInfo()[key]-next.getInfo()[key]));
 }
 cases.push({kind,frames:120,maxPositionDifference:frameMax,maxReferenceStretch,maxCandidateStretch,combinedContactCount:contactCount-startingContacts});
}
assert.ok(contactCount>0,'Seat fixture must exercise real callbacks');
if(!process.env.QA_SHAPE_EXPERIMENT)assert.ok(maxPositionDifference<=1e-7,`Position changed ${maxPositionDifference}`);
if(!process.env.QA_SHAPE_EXPERIMENT)assert.ok(maxNormalDifference<=1e-6,`Normals changed ${maxNormalDifference}`);
if(!process.env.QA_SHAPE_EXPERIMENT)assert.ok(maxMetricDifference<=1e-10,`Constraint metrics changed ${maxMetricDifference}`);
const result={equivalent:maxPositionDifference<=1e-7&&maxNormalDifference<=1e-6,experiment:Boolean(process.env.QA_SHAPE_EXPERIMENT),referenceSHA256:createHash('sha256').update(oldText).digest('hex'),candidateSHA256:createHash('sha256').update(candidateText).digest('hex'),maxPositionDifference,maxNormalDifference,maxMetricDifference,cases,callbackCount,contactCount,limits:'Real GLB meshes/weights/bones, texture decode replaced for CPU-only fixture. Authored raw-bone pose sweep, not browser retarget or visual acceptance. No browser timing performed.'};
await mkdir(new URL('output/playwright/m1-skirt-optimization/',baseURL),{recursive:true});await writeFile(new URL('output/playwright/m1-skirt-optimization/'+(process.env.QA_SHAPE_EXPERIMENT||'equivalence')+'.json',baseURL),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
