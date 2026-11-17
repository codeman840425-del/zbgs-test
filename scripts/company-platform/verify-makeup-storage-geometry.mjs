import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {validateMakeupStorageGeometry} from '../../prototype/src/company/makeup-storage-geometry.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-storage-geometry-v1');
const runDirectory=path.join(output,`run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(runDirectory,{recursive:true});
const checks=[],realAssets=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,location,message,details)=>{throw Object.assign(new Error(message),{code,path:location,details});};
const invoke=(scene,resource)=>validateMakeupStorageGeometry(scene,resource,fail);
const core=['storage-base','storage-side-left','storage-side-right','storage-back','storage-roof','storage-runner-left','storage-runner-right',
  'storage-drawer-bottom','storage-drawer-left','storage-drawer-right','storage-drawer-back','storage-drawer-front','storage-drawer-handle'];
function independent(root,name){const mesh=root.getObjectByName(name);assert(mesh?.isMesh);mesh.geometry=mesh.geometry.clone();return mesh;}
function box(name,min,max,material){const geometry=new THREE.BoxGeometry(...max.map((value,i)=>value-min[i]));geometry.translate(...max.map((value,i)=>(value+min[i])/2));const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;}
function add(root,name,min,max,moving=false){const material=root.getObjectByName('storage-base').material,mesh=box(name,min,max,material);(moving?root.getObjectByName('storage-drawer-slide'):root).add(mesh);return mesh;}
function reject(name,root,resource,codes,inspect){let error;try{invoke(root,resource);}catch(caught){error=caught;}assert(error,`${name} unexpectedly passed`);assert((Array.isArray(codes)?codes:[codes]).includes(error.code),`${name} expected ${codes}, received ${error.code}: ${error.message}`);inspect?.(error);checks.push({name,passed:true,rejection:{code:error.code,path:error.path,message:error.message,details:error.details}});}
function mutate(name,scene,resource,change,codes,inspect){const root=scene.clone(true),r=structuredClone(resource);change(root,r);reject(`${resource.id} / ${name}`,root,r,codes,inspect);}

let failure;
try{
  assert.deepEqual(validateMakeupStorageGeometry(null,{mountRole:'legacy-drawer'},fail),{checked:false});
  checks.push({name:'Legacy profiles keep their separate geometry path',passed:true});
  for(const design of ['tray','divided','brush-cup','case','content-compact']){
    const directory=`prototype/public/company-assets/makeup-storage-v1/${design}/v1`,resource=JSON.parse(await fs.readFile(`${directory}/resource.json`,'utf8'));
    const bytes=await fs.readFile(`${directory}/model.glb`);assert.equal(sha(bytes),resource.asset.sha256);assert.equal(bytes.length,resource.asset.bytes);
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const actual=invoke(scene,resource),support=validateSupportGeometry(scene,resource,fail);
    assert(actual.checked);realAssets.push({design,sha256:sha(bytes),bytes:bytes.length,resourcePath:`${directory}/resource.json`,actual,support});
    checks.push({name:`${design} / actual GLB and existing generic support geometry both pass`,passed:true});
    const newIdentity=structuredClone(resource);newIdentity.id=`independent-${resource.id}`;newIdentity.version=7;
    assert(invoke(scene,newIdentity).checked);checks.push({name:`${design} / same actual mechanism accepts explicit new identity/version`,passed:true});
    if(design==='content-compact'){
      for(const name of ['storage-content-body','storage-content-cap']){
        mutate(`missing ${name}`,scene,resource,root=>root.getObjectByName(name).removeFromParent(),'storage-node');
        mutate(`flat ${name}`,scene,resource,root=>independent(root,name).geometry.scale(1,0,1),['storage-degenerate-face','storage-open-or-inconsistent','storage-nonpositive-volume']);
      }
      mutate('content cannot exceed actual envelope',scene,resource,root=>independent(root,'storage-content-cap').geometry.translate(.01,0,0),['storage-extrusion','storage-content-envelope']);
      mutate('closed compact bottom cannot lose a triangle',scene,resource,root=>{
        const mesh=independent(root,'storage-content-body'),g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone(),p=g.getAttribute('position');g.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(p.array).slice(9),3));mesh.geometry=g;
      },'storage-open-or-inconsistent');
      continue;
    }
    for(const name of core)mutate(`missing real ${name}`,scene,resource,root=>root.getObjectByName(name).removeFromParent(),'storage-node');
    mutate('moving bottom outside declared moving subtree',scene,resource,root=>root.add(root.getObjectByName('storage-drawer-bottom')),'storage-motion-mapping');
    mutate('fixed roof cannot ride on moving drawer',scene,resource,root=>root.getObjectByName('storage-drawer-slide').add(root.getObjectByName('storage-roof')),'storage-motion-mapping');
    mutate('motion support mapping cannot refer to static roof',scene,resource,(root,r)=>{r.supportNodes.drawer='storage-roof';},'storage-motion-mapping');
    mutate('unbaked transform is rejected',scene,resource,root=>{root.getObjectByName('storage-runner-left').position.y=.001;},'storage-transform');
    mutate('opaque backing cannot be a hidden mesh',scene,resource,root=>{root.getObjectByName('storage-base').visible=false;},'storage-transform');
    mutate('transparent bottom cannot fake support',scene,resource,root=>{const mesh=independent(root,'storage-drawer-bottom');mesh.material=mesh.material.clone();mesh.material.transparent=true;mesh.material.opacity=.2;},'storage-material');
    mutate('same-facing exterior patches cannot overlap across meshes',scene,resource,root=>add(root,'duplicate-front-skin',[-.02,.04,.019],[.02,.06,.025],true),'storage-duplicate-outer-face');
    for(const name of ['storage-base','storage-roof','storage-drawer-bottom','storage-runner-right'])mutate(`flat real ${name}`,scene,resource,root=>independent(root,name).geometry.scale(1,0,1),['storage-degenerate-face','storage-open-or-inconsistent','storage-nonpositive-volume']);
    mutate('open floor topology cannot fake drawer capacity',scene,resource,root=>{
      const mesh=independent(root,'storage-drawer-bottom'),g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone(),p=g.getAttribute('position');g.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(p.array).slice(9),3));mesh.geometry=g;
    },'storage-open-or-inconsistent');
    mutate('tapered underside cannot fake uniform fixed floor',scene,resource,root=>{
      const p=independent(root,'storage-drawer-bottom').geometry.getAttribute('position');for(let i=0;i<p.count;i++)if(p.getY(i)<.02)p.setX(i,p.getX(i)*.8);
    },'storage-solid-box');
    mutate('shortened actual rail cannot lose full-open support',scene,resource,root=>{
      const p=independent(root,'storage-runner-left').geometry.getAttribute('position');for(let i=0;i<p.count;i++)if(p.getZ(i)>0)p.setZ(i,-.04);
    },'storage-solid-box');
    mutate('disconnected rail cannot be credited by name',scene,resource,root=>independent(root,'storage-runner-right').geometry.translate(0,-.003,0),'storage-solid-box');
    mutate('front plate collision occurs only between end states',scene,resource,root=>add(root,'mid-stroke-fixed-obstacle',[-.02,.030,.055],[.02,.045,.070]),'storage-slide-collision',error=>{
      assert(error.details.interval.start>0);assert(error.details.interval.end<1);assert.equal(error.details.fixed,'mid-stroke-fixed-obstacle');
    });
    mutate('fixed ornament cannot borrow contact from the closed moving front',scene,resource,root=>add(root,'fixed-block-on-moving-front',[-.02,.078,.020],[.02,.085,.024]),'storage-detached-component');
    mutate('actual divider intrudes in moving support clearance',scene,resource,root=>add(root,'illegal-drawer-divider',[-.01,.022,-.02],[.01,.065,.01],true),'storage-drawer-clearance');
    mutate('upper common patch must remain genuinely open',scene,resource,root=>add(root,'top-blocker',[-.02,.13,-.06],[.02,.14,-.03]),'storage-top-clearance');
    mutate('access above three-quarter opening cannot be blocked',scene,resource,root=>add(root,'access-blocker',[-.02,.11,.06],[.02,.12,.08]),'storage-drawer-access');
    mutate('full slide envelope includes added moving detail',scene,resource,root=>add(root,'overtravel-detail',[-.02,.03,.034],[.02,.04,.040],true),'storage-envelope');
    mutate('floating closed decoration cannot count as connected structure',scene,resource,root=>add(root,'floating-closed-block',[-.215,.23,.08],[-.195,.24,.10]),'storage-detached-component');
    mutate('disconnected shell hidden in otherwise grounded mesh',scene,resource,root=>{
      const mesh=independent(root,'storage-base'),extra=box('hidden',[-.215,.23,.08],[-.195,.24,.1],mesh.material);mesh.geometry=mergeGeometries([mesh.geometry.toNonIndexed(),extra.geometry.toNonIndexed()]);
    },'storage-node');
    mutate('out-of-envelope vertex cannot be masked by hierarchy',scene,resource,root=>add(root,'outside',[.22,.15,-.06],[.23,.16,-.04]),'storage-envelope');
    mutate('unsupported form cannot be inferred from resource id',scene,resource,(root,r)=>{r.provenance.sourceDesign='unverified';},'storage-shape-profile');
    if(design==='brush-cup'){
      for(const side of ['left','right'])for(const kind of ['wall','bottom'])mutate(`missing real cup ${side} ${kind}`,scene,resource,root=>root.getObjectByName(`storage-cup-${side}-${kind}`).removeFromParent(),'storage-node');
      mutate('cup cannot substitute filled cylinder for open ring',scene,resource,root=>{
        const mesh=independent(root,'storage-cup-left-wall');mesh.geometry=new THREE.CylinderGeometry(.035,.035,.15,32).translate(-.17,.175,-.045);
      },['storage-extrusion','storage-duplicate-outer-face']);
      mutate('cup opening rejects actual cover plate',scene,resource,root=>add(root,'cup-cover',[-.204,.19,-.079],[-.136,.20,-.011]),'storage-cup-cavity');
      mutate('cup cavity AABB cannot support a floating interior block',scene,resource,root=>add(root,'floating-in-cup',[-.18,.14,-.055],[-.16,.16,-.035]),'storage-cup-cavity');
      mutate('floating complete cup cannot be repaired by relabeling',scene,resource,root=>{
        independent(root,'storage-cup-right-wall').geometry.translate(0,.002,0);independent(root,'storage-cup-right-bottom').geometry.translate(0,.002,0);
      },'storage-extrusion');
    }else{
      for(const side of ['left','right','front','back'])mutate(`upper opening requires real ${side} wall`,scene,resource,root=>root.getObjectByName(`storage-upper-${side}`).removeFromParent(),'storage-node');
      if(design==='divided'){
        mutate('division requires actual separating crosswall',scene,resource,root=>root.getObjectByName('storage-divider-cross-left').removeFromParent(),'storage-node');
        mutate('side cell must retain its real accessible cavity',scene,resource,root=>add(root,'cell-filler',[-.21,.1,-.11],[-.14,.18,-.055]),'storage-cell-cavity');
      }
      if(design==='case'){
        mutate('side handle needs real connected grip',scene,resource,root=>root.getObjectByName('storage-case-handle-left-grip').removeFromParent(),'storage-node');
        mutate('handle cannot fake a hole with filled solid',scene,resource,root=>add(root,'fake-handle-hole',[-.225,.20,-.073],[-.215,.238,-.017]),'storage-handle-aperture');
      }
    }
  }
  for(const [failureDirectory,design] of [['cup-external-coplanar-skirt','brush-cup'],['case-handle-external-coplanar','case']]){
    const directory=`evidence/company-makeup-storage-production-v1/failures/${failureDirectory}`;
    const resource=JSON.parse(await fs.readFile(`${directory}/${design}-resource.json`,'utf8'));
    const bytes=await fs.readFile(`${directory}/${design}-model.glb`);
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    reject(`preserved actual ${design} original duplicate exterior`,scene,resource,'storage-duplicate-outer-face');
    checks.at(-1).originalAsset={path:`${directory}/${design}-model.glb`,sha256:sha(bytes)};
  }
}catch(error){failure={message:error.message,code:error.code,path:error.path,details:error.details,stack:error.stack};}
const report={status:failure?'failed':'passed',checkedAt:new Date().toISOString(),checks,realAssets,failure,
  verifier:{path:'prototype/src/company/makeup-storage-geometry.js',sha256:sha(await fs.readFile('prototype/src/company/makeup-storage-geometry.js'))},
  limits:['Actual imported GLB triangles, continuous pure-translation SAT, real support and open cavities only. Mechanical strength, tipping stability, browser rendering and character interaction require separate evidence.']};
await fs.writeFile(path.join(runDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'latest.json'),JSON.stringify({status:report.status,report:path.relative(process.cwd(),path.join(runDirectory,'report.json')).replaceAll('\\','/')},null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,assets:realAssets.length,report:path.join(runDirectory,'report.json'),failure},null,2));
if(failure)process.exitCode=1;
