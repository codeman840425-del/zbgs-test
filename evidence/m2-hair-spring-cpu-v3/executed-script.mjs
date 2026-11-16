import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {createHairSpring,validateHairSkin,validateHairSpringConfig} from '../prototype/src/hair-spring.js';

const out=path.resolve(process.argv[2]||'evidence/m2-hair-spring-cpu-v1');
await fs.mkdir(out,{recursive:false});
await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-script.mjs'));
const checks=[];
const config={schema:'hair-spring-v1',joints:[{bone:'tail',child:'tip',hitRadius:.005,
  stiffness:1,gravityPower:.15,gravityDir:[0,-1,0],dragForce:.4}],
  colliders:[{bone:'head',shape:'sphere',offset:[0,.4,0],radius:.05}]};
function rig(){
  const root=new THREE.Group(),head=new THREE.Bone(),scene=new THREE.Group();root.add(head);head.add(scene);
  const tail=new THREE.Bone(),tip=new THREE.Bone();tail.name='tail';tip.name='tip';tip.position.y=-.2;tail.add(tip);scene.add(tail);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.01,-.15,0,-.01,-.15,0],3));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,1,0,0,0,1,0,0],4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,.5,.5,0,0,.5,.5,0,0],4));g.setIndex([0,1,2]);
  const mesh=new THREE.SkinnedMesh(g,new THREE.MeshBasicMaterial());scene.add(mesh);root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton([tail,tip]);mesh.bind(skeleton);root.updateMatrixWorld(true);
  const vrm={humanoid:{getRawBoneNode:semantic=>semantic==='head'?head:null}};
  return{root,head,scene,tail,tip,mesh,vrm};
}
try{
 const a=rig(),b=rig();validateHairSkin(a.scene,[a.mesh]);
 const ma=createHairSpring({...a,config}),mb=createHairSpring({...b,config});ma.reset();mb.reset();
 a.mesh.skeleton.update();const before=a.mesh.getVertexPosition(1,new THREE.Vector3()).clone();
 const peerBefore=mb.getState(),initialHeadChildren=a.head.children.length;
 a.head.rotation.z=.45;
 for(let i=0;i<120;i++){
   a.root.updateMatrixWorld(true);ma.update(1/60);a.root.updateMatrixWorld(true);a.mesh.skeleton.update();
   const length=a.tip.getWorldPosition(new THREE.Vector3()).distanceTo(a.tail.getWorldPosition(new THREE.Vector3()));
   assert(Math.abs(length-.2)<1e-8);assert(ma.getState().localRotations.flat().every(Number.isFinite));
 }
 const after=a.mesh.getVertexPosition(1,new THREE.Vector3());assert(before.distanceTo(after)>.001);
 assert.deepEqual(mb.getState(),peerBefore);
 checks.push({name:'actual official solver deforms weighted vertex, preserves bone length, isolates peer',passed:true,localVertexDelta:before.distanceTo(after)});
 const moving=ma.getState();ma.update(0);assert.deepEqual(ma.getState(),moving);
 ma.update(1/60,false);const disabled=ma.getState();ma.update(1/60,false);assert.deepEqual(ma.getState(),disabled);
 ma.update(1/60,true);assert.equal(ma.getState().updates,moving.updates+1);
 ma.reset();const first=a.tail.quaternion.toArray();ma.reset();assert.deepEqual(a.tail.quaternion.toArray(),first);
 checks.push({name:'zero delta freezes; disable resets once; re-enable resumes; reset does not accumulate',passed:true});
 assert.throws(()=>ma.update(-1));assert.throws(()=>ma.update(NaN));assert.throws(()=>ma.update(1));
 for(const bad of [null,{...config,joints:[undefined]}, {...config,joints:[config.joints[0],config.joints[0]]},
   {...config,joints:[{...config.joints[0],gravityDir:[0,0,0]}]}])assert.throws(()=>validateHairSpringConfig(bad));
 checks.push({name:'nonfinite/unsupported time and malformed chain rejected',passed:true});
 const broken=structuredClone(config);broken.joints[0].child='missing';
 assert.throws(()=>createHairSpring({...a,config:broken}));assert.equal(a.head.children.length,initialHeadChildren);
 a.mesh.geometry.attributes.skinWeight.setX(1,.9);assert.throws(()=>validateHairSkin(a.scene,[a.mesh]));
 a.mesh.geometry.attributes.skinWeight.setX(1,.5);a.mesh.skeleton.bones[1]=b.tip;assert.throws(()=>validateHairSkin(a.scene,[a.mesh]));
 checks.push({name:'bad chain cleans colliders; bad weights and borrowed skeleton rejected',passed:true});
 ma.dispose();ma.dispose();mb.dispose();assert.equal(a.head.children.length,initialHeadChildren-1);
 checks.push({name:'dispose removes body collider and is idempotent',passed:true});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'passed',checks,
   scope:'Actual imported Three.js and three-vrm-springbone solver with small authored CPU skin fixture; no real hair asset/render/visual/performance acceptance'},null,2));
 console.log(JSON.stringify({status:'passed',checks}));
}catch(error){await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'failed',checks,error:String(error)},null,2));throw error;}
