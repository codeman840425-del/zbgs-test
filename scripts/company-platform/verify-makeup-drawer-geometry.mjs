import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {validateMakeupDrawerGeometry} from '../../prototype/src/company/makeup-drawer-geometry.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-drawer-geometry-v1');
const runDirectory=path.join(output,`run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(runDirectory,{recursive:true});
const checks=[],realAssets=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,location,message,details)=>{throw Object.assign(new Error(message),{code,path:location,details});};
const invoke=(scene,resource)=>validateMakeupDrawerGeometry(scene,resource,fail);

function independent(root,name) {
  const mesh=root.getObjectByName(name);
  assert(mesh?.isMesh,`Missing fixture ${name}`);
  mesh.geometry=mesh.geometry.clone();
  return mesh;
}

function box(name,min,max,material) {
  const geometry=new THREE.BoxGeometry(...max.map((value,i)=>value-min[i]));
  geometry.translate(...max.map((value,i)=>(value+min[i])/2));
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;
}

function add(root,name,min,max,moving=false) {
  const base=root.getObjectByName('cabinet-bottom')||root.getObjectByName('storage-roof');
  const mesh=box(name,min,max,base.material);
  (moving?root.getObjectByName('cabinet-drawer-slide'):root).add(mesh);
  return mesh;
}

function mutate(name,scene,resource,change,codes,inspect) {
  const root=scene.clone(true),definition=structuredClone(resource);
  change(root,definition);
  let error;
  try{invoke(root,definition);}catch(caught){error=caught;}
  assert(error,`${resource.id} / ${name} unexpectedly passed`);
  assert((Array.isArray(codes)?codes:[codes]).includes(error.code),`${name} expected ${codes}, got ${error.code}: ${error.message}`);
  inspect?.(error);
  checks.push({name:`${resource.id} / ${name}`,passed:true,rejection:{code:error.code,path:error.path,message:error.message,details:error.details}});
}

function removeTriangle(root,name) {
  const mesh=independent(root,name),geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
  const positions=geometry.getAttribute('position');
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(positions.array).slice(9),3));
  mesh.geometry=geometry;
}

let failure;
try{
  assert.deepEqual(validateMakeupDrawerGeometry(null,{mountRole:'legacy-sliding-drawer'},fail),{checked:false});
  checks.push({name:'Legacy geometry keeps its original admission path',passed:true});
  const resources=[];
  for(const design of ['host','tray','divided','brush-cup','case']){
    const directory=`prototype/public/company-assets/makeup-drawer-v1/${design}/v1`;
    const resource=JSON.parse(await fs.readFile(`${directory}/resource.json`,'utf8')),bytes=await fs.readFile(`${directory}/model.glb`);
    assert.equal(sha(bytes),resource.asset.sha256);assert.equal(bytes.length,resource.asset.bytes);
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const actual=invoke(scene,resource),support=validateSupportGeometry(scene,resource,fail);
    assert(actual.checked);resources.push(resource);
    realAssets.push({design,sha256:sha(bytes),bytes:bytes.length,resourcePath:`${directory}/resource.json`,actual,support});
    checks.push({name:`${design} / actual GLB and existing support gate pass`,passed:true});
    const renamed=structuredClone(resource);renamed.id=`independent-${resource.id}`;renamed.version=2;
    assert(invoke(scene,renamed).checked);checks.push({name:`${design} / explicit same-function identity and version remain supported`,passed:true});
    const baseName=design==='host'?'cabinet-bottom':'storage-roof';
    mutate('missing actual base',scene,resource,root=>root.getObjectByName(baseName).removeFromParent(),'makeup-drawer-node');
    mutate('base cannot be a flat plane',scene,resource,root=>independent(root,baseName).geometry.scale(1,0,1),['makeup-drawer-degenerate-face','makeup-drawer-open-or-inconsistent','makeup-drawer-nonpositive-volume']);
    mutate('missing floor triangle',scene,resource,root=>removeTriangle(root,baseName),'makeup-drawer-open-or-inconsistent');
    mutate('unbaked node transform',scene,resource,root=>{root.getObjectByName(baseName).position.x=.001;},'makeup-drawer-transform');
    mutate('invisible base cannot support a real load',scene,resource,root=>{root.getObjectByName(baseName).visible=false;},'makeup-drawer-transform');
    mutate('transparent floor cannot fake a closed cavity',scene,resource,root=>{
      const mesh=independent(root,baseName);mesh.material=mesh.material.clone();mesh.material.transparent=true;mesh.material.opacity=.1;
    },'makeup-drawer-material');
    if(design==='host'){
      for(const name of ['cabinet-top','cabinet-side-left','cabinet-side-right','cabinet-inner-back','cabinet-drawer-divider','drawer-runner-left','drawer-runner-right','drawer-front','drawer-bottom','drawer-left','drawer-right','drawer-back','drawer-handle'])
        mutate(`missing ${name}`,scene,resource,root=>root.getObjectByName(name).removeFromParent(),'makeup-drawer-node');
      mutate('missing actual slide group',scene,resource,root=>root.getObjectByName('cabinet-drawer-slide').removeFromParent(),'makeup-drawer-node');
      mutate('drawer bottom must belong to actual slide subtree',scene,resource,root=>root.add(root.getObjectByName('drawer-bottom')),'makeup-drawer-motion-mapping');
      mutate('fixed roof cannot be moved as part of the drawer',scene,resource,root=>root.getObjectByName('cabinet-drawer-slide').add(root.getObjectByName('cabinet-top')),'makeup-drawer-motion-mapping');
      mutate('moving support cannot be mapped to roof metadata',scene,resource,(root,r)=>{r.supportNodes.drawer='cabinet-top';},'makeup-drawer-motion-mapping');
      mutate('original five millimetre runner gap is rejected',scene,resource,root=>{
        const positions=independent(root,'drawer-runner-left').geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++)if(positions.getY(i)<.42)positions.setY(i,.410);
      },'makeup-drawer-solid-box');
      mutate('short rail cannot lose full-open contact',scene,resource,root=>{
        const positions=independent(root,'drawer-runner-right').geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++)if(positions.getZ(i)>.2)positions.setZ(i,.1);
      },'makeup-drawer-solid-box');
      mutate('wrong actual drawer floor elevation',scene,resource,root=>independent(root,'drawer-bottom').geometry.translate(0,.005,0),['makeup-drawer-solid-box','makeup-drawer-duplicate-outer-face']);
      mutate('front crossing obstacle exists only at intermediate stroke',scene,resource,root=>add(root,'intermediate-only-blocker',[-.03,.5,.267],[.03,.52,.273]),'makeup-drawer-slide-collision',error=>{
        assert(error.details.interval.start>0);assert(error.details.interval.end<1);assert.equal(error.details.fixed,'intermediate-only-blocker');
      });
      mutate('actual tray blocker cannot fill receiving cavity',scene,resource,root=>add(root,'cavity-blocker',[-.1,.5,-.05],[.1,.6,.05],true),'makeup-drawer-drawer-cavity');
      mutate('full-open upward payload access must remain clear',scene,resource,root=>add(root,'access-overhang',[-.05,.775,.24],[.05,.779,.25]),'makeup-drawer-payload-access');
      mutate('fixed block cannot borrow moving front support',scene,resource,root=>add(root,'fixed-on-moving-front',[.30,.77,.23],[.32,.778,.24]),'makeup-drawer-detached-component');
      mutate('actual duplicated outer front is rejected',scene,resource,root=>add(root,'duplicate-front-skin',[-.05,.5,.2275],[.05,.55,.2625],true),'makeup-drawer-duplicate-outer-face');
      mutate('extra moving detail must fit declared part bounds',scene,resource,root=>add(root,'moving-too-high',[-.03,.771,.265],[.03,.775,.273],true),'makeup-drawer-moving-bounds');
      mutate('static closed-pose envelope cannot grow silently',scene,resource,root=>add(root,'outside',[.44,.2,0],[.46,.25,.02]),'makeup-drawer-envelope');
      mutate('floating shell inside a required mesh is not a connected solid',scene,resource,root=>{
        const mesh=independent(root,'cabinet-bottom'),extra=box('hidden',[.30,.72,.24],[.32,.735,.25],mesh.material);
        mesh.geometry=mergeGeometries([mesh.geometry.toNonIndexed(),extra.geometry.toNonIndexed()]);
      },'makeup-drawer-node');
    }else{
      mutate('actual payload base cannot be at old carrier height',scene,resource,root=>independent(root,'storage-roof').geometry.translate(0,.09,0),['makeup-drawer-solid-box','makeup-drawer-duplicate-outer-face']);
      mutate('shared top patch must have real clearance',scene,resource,root=>add(root,'top-blocker',[-.03,.04,-.07],[.03,.05,-.03]),'makeup-drawer-top-clearance');
      mutate('source form cannot be substituted by resource label',scene,resource,(root,r)=>{r.provenance.sourceDesign='unverified';},'makeup-drawer-shape-profile');
      mutate('extra closed piece requires genuine connection',scene,resource,root=>add(root,'floating-block',[.19,.17,.08],[.21,.175,.1]),'makeup-drawer-detached-component');
      mutate('payload full height remains bounded',scene,resource,root=>add(root,'too-high',[.19,.17,.08],[.21,.19,.1]),'makeup-drawer-envelope');
      if(design==='brush-cup'){
        for(const side of ['left','right'])for(const kind of ['wall','bottom'])mutate(`missing ${side} cup ${kind}`,scene,resource,root=>root.getObjectByName(`storage-cup-${side}-${kind}`).removeFromParent(),'makeup-drawer-node');
        mutate('actual wrong bore cannot pass using circle metadata',scene,resource,root=>{
          const positions=independent(root,'storage-cup-left-wall').geometry.getAttribute('position');
          for(let i=0;i<positions.count;i++){positions.setX(i,-.17+(positions.getX(i)+.17)*.9);positions.setZ(i,-.045+(positions.getZ(i)+.045)*.9);}
        },'makeup-drawer-extrusion');
        mutate('filled cylinder cannot stand in for open cup',scene,resource,root=>{
          independent(root,'storage-cup-left-wall').geometry=new THREE.CylinderGeometry(.035,.035,.144,32).translate(-.17,.088,-.045);
        },'makeup-drawer-extrusion');
        mutate('cup mouth must not have an actual lid',scene,resource,root=>add(root,'cup-lid',[-.204,.08,-.079],[-.136,.09,-.011]),'makeup-drawer-cup-cavity');
        mutate('old overlapping cup skirt must be rejected',scene,resource,root=>{
          const positions=independent(root,'storage-cup-left-wall').geometry.getAttribute('position');for(let i=0;i<positions.count;i++)if(positions.getY(i)<.02)positions.setY(i,.01);
        },'makeup-drawer-duplicate-outer-face');
      }else{
        for(const side of ['left','right','front','back'])mutate(`missing real upper ${side} wall`,scene,resource,root=>root.getObjectByName(`storage-upper-${side}`).removeFromParent(),'makeup-drawer-node');
        if(design==='divided'){
          mutate('two compartments require actual crosswall',scene,resource,root=>root.getObjectByName('storage-divider-cross-left').removeFromParent(),'makeup-drawer-node');
          mutate('compartment cannot be filled behind valid metadata',scene,resource,root=>add(root,'filled-cell',[-.21,.01,-.11],[-.14,.08,-.055]),'makeup-drawer-cell-cavity');
        }
        if(design==='case'){
          mutate('actual case handle grip is required',scene,resource,root=>root.getObjectByName('storage-case-handle-left-grip').removeFromParent(),'makeup-drawer-node');
          mutate('side handle aperture cannot be a filled solid',scene,resource,root=>add(root,'filled-handle',[-.225,.11,-.073],[-.215,.148,-.017]),'makeup-drawer-handle-aperture');
        }
      }
    }
  }
  const originalDirectory='evidence/company-makeup-drawer-production-v1/failures/divider-back-duplicate-outer-face';
  const originalBytes=await fs.readFile(`${originalDirectory}/host.glb`);
  const originalResource=JSON.parse(await fs.readFile(`${originalDirectory}/host-resource.json`,'utf8'));
  const {scene:originalHost}=await new GLTFLoader().parseAsync(originalBytes.buffer.slice(originalBytes.byteOffset,originalBytes.byteOffset+originalBytes.byteLength),'');
  let originalRejection;
  try{invoke(originalHost,originalResource);}catch(error){originalRejection=error;}
  assert.equal(originalRejection?.code,'makeup-drawer-duplicate-outer-face');
  assert.equal(originalRejection.details.other,'cabinet-drawer-divider');
  checks.push({name:'Preserved actual original host with divider/back duplicate faces remains rejected',passed:true,
    originalAsset:{path:`${originalDirectory}/host.glb`,sha256:sha(originalBytes)},
    rejection:{code:originalRejection.code,path:originalRejection.path,details:originalRejection.details}});
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{
    const bytes=await fs.readFile(`prototype/public${url}`);
    return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }});
  try{await library.preload(resources);checks.push({name:'Actual asset-library loader admits all five through the new gate and skips only obsolete slide profile',passed:true});}
  finally{library.dispose();}
}catch(error){failure={message:error.message,code:error.code,path:error.path,details:error.details,stack:error.stack};}
const sourceHashes={};
for(const filename of ['prototype/src/company/makeup-drawer-geometry.js','prototype/src/company/asset-library.js','scripts/company-platform/verify-makeup-drawer-geometry.mjs'])sourceHashes[filename]=sha(await fs.readFile(filename));
const report={status:failure?'failed':'passed',checks,realAssets,failure,sourceHashes,
  limits:['Actual imported closed-pose host and four payload GLBs. Exact finite solids, convex cup decomposition and complete pure-translation SAT prove geometry and reserved payload-envelope fit. No GPU, mechanical-strength, tipping-stability or character-use acceptance.']};
await fs.writeFile(path.join(runDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'latest.json'),JSON.stringify({status:report.status,report:path.relative(process.cwd(),path.join(runDirectory,'report.json')).replaceAll('\\','/')},null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,assets:realAssets.length,report:path.join(runDirectory,'report.json'),failure},null,2));
if(failure)process.exitCode=1;
