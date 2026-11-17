import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMakeupMirrorSample} from '../../prototype/src/company/makeup-mirror-samples.js';
import {deriveCompany,prepareCompanyChange,composeTransform} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {validateMirrorResource} from '../../prototype/src/company/mirror-data.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const mirrors=catalog.resources.filter(r=>r.mountRole==='makeup-mirror'),checks=[];
const report={status:'running',checks,limits:['Real GLB and scene graph CPU verification only; GPU preflight deliberately stubbed here. No browser pixel/reflection/closed-process/C3/performance claim.']};
const fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const bytes=await fs.readFile(new URL('prototype/public'+url,root));return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
let scene;
const ref=r=>({id:r.id,version:r.version}),get=id=>scene.root.getObjectByName(id),node=id=>scene.document.nodes.find(n=>n.id===id);
async function check(name,fn){const result=await fn();checks.push({name,passed:true,result});}
function apply(ops){let handle;try{handle=scene.prepareChange(ops);return scene.commit(handle);}finally{if(handle)scene.discard(handle);}}
function rejection(fn){let error;try{fn();}catch(e){error=e;}assert(error?.code,`Expected typed rejection, got ${error?.stack}`);return{code:error.code,path:error.path};}
try {
  await check('Four distinct real inputs preserve common function while allowing one or three mirror panels',()=>{
    assert.equal(mirrors.length,4);assert.equal(new Set(mirrors.map(r=>r.asset.sha256)).size,4);
    const result=[];
    for(const r of mirrors){validateMirrorResource(r,fail);assert(compareFacilityFunction(mirrors[0],r).compatible);result.push({resource:ref(r),sha256:r.asset.sha256,panels:r.mirrorPanels.length});}
    for(let index=0;index<4;index++)for(const alternate of [false,true]) {
      const sample=createMakeupMirrorSample(catalog,templates,{index,alternate}),d=deriveCompany(sample.document,catalog,templates);
      inspectCompanyPlacement(sample.document,catalog,templates);
      assert.equal(d.facilities.filter(f=>f.resource.mountRole==='makeup-mirror').length,alternate?2:1);
      assert(!sample.document.nodes.some(n=>n.id.endsWith('/clock')));
    }return result;
  });
  await check('Light function, state semantics, actual plane descriptors and unsupported composite mechanisms cannot drift',()=>{
    const cases=[r=>r.light.target[0]=.1,r=>r.light.position[2]=NaN,r=>r.light.kind='point',r=>r.light.distance=0,r=>r.light.color='#ffffff',
      r=>r.stateSchema.intensity.max=100,r=>r.stateDefaults.intensity=Infinity,r=>r.stateSemantics.on='reflection-enabled',
      r=>r.mirrorPanels[0].yaw=.1,r=>r.mirrorPanels[0].node='missing',r=>r.mirrorPanels[0].polygons[0].reverse(),
      r=>r.mirrorSurface.maxFaces=99,r=>r.makeupLamp.maxEmissiveIntensity=100,r=>r.mounting.depth=.08,r=>r.display={}];
    const result=cases.map(change=>{const r=structuredClone(mirrors[0]);change(r);return rejection(()=>validateMirrorResource(r,fail));});
    const changed=structuredClone(mirrors[0]);changed.light.target[0]=.1;assert(!compareFacilityFunction(mirrors[0],changed).compatible);
    const malformed=structuredClone(mirrors[0]);delete malformed.mirrorSurface;malformed.mountRole='other';assert(rejection(()=>validateMirrorResource(malformed,fail)));
    return result;
  });
  const sample=createMakeupMirrorSample(catalog,templates).document;
  await library.preload([...deriveCompany(sample,catalog,templates).facilities.map(f=>f.resource),...mirrors]);
  scene=createCompanyScene(new THREE.Scene(),sample,{catalog,templates,assetLibrary:library,mirrorPreflight:()=>{}});
  await check('Each real GLB swaps only mirror appearance, keeping table, seat, props, mounting and lamp state through serialized recovery',()=>{
    const before=scene.document.nodes.filter(n=>n.id!=='vanity/primary/mirror'),results=[];
    for(const r of mirrors){
      apply([{type:'replace-resource',id:'vanity/primary/mirror',resource:ref(r)}]);
      assert.deepEqual(scene.document.nodes.filter(n=>n.id!=='vanity/primary/mirror'),before);
      assert.deepEqual(node('vanity/primary/mirror').state,{on:true,intensity:7});
      assert.equal(scene.mirrorBindings().length,r.mirrorPanels.length);
      const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);
      const lamp=get('vanity/primary/mirror').getObjectByName('makeup-lamp');assert(lamp?.isMesh);
      for(const m of [lamp.material].flat())assert(Math.abs(m.emissiveIntensity-1.05)<1e-10);
      results.push({resource:ref(r),bindings:scene.mirrorBindings().map(b=>b.snapshot())});
    }return results;
  });
  await check('Joint table and chair turn propagates exact mirror plane, lamp and target transforms; turning only the mirror is rejected',()=>{
    const t={position:[.5,0,-1.3],yaw:Math.PI/2},table=catalog.resources.find(r=>r.id===node('vanity/primary').resource.id);
    apply([{type:'move',id:'vanity/primary',transform:t},{type:'move',id:'vanity/primary/seat',transform:composeTransform(t,table.clearance.seat)}]);
    const d=deriveCompany(scene.document,catalog,templates),mirror=get('vanity/primary/mirror'),actual=mirror.getWorldPosition(new THREE.Vector3()).toArray();
    assert(actual.every((v,i)=>Math.abs(v-d.worlds.get('vanity/primary/mirror').position[i])<1e-8));
    const light=mirror.children.find(n=>n.isSpotLight);assert(light);
    assert.equal(light.intensity,7);assert.equal(light.castShadow,false);
    for(const [object,local]of [[light,mirrors[0].light.position],[light.target,mirrors[0].light.target]]) {
      const expected=mirror.localToWorld(new THREE.Vector3(...local));assert(object.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8);
    }
    const saved=scene.save();const rejected=rejection(()=>apply([{type:'move',id:'vanity/primary/mirror',transform:{position:[.02,.78,-.135],yaw:Math.PI/2}}]));assert.equal(scene.save(),saved);
    return {actual,light:light.getWorldPosition(new THREE.Vector3()).toArray(),target:light.target.getWorldPosition(new THREE.Vector3()).toArray(),rejected};
  });
  await check('Invalid height, overlap, parent, light state and unknown fields retain live scene/document',()=>{
    const saved=scene.save(),old=get('vanity/primary/mirror'),result=[];
    const cases=[
      [{type:'move',id:old.name,transform:{position:[.02,.80,-.135],yaw:0}}],
      [{type:'move',id:old.name,transform:{position:[.02,.78,.08],yaw:0}}],
      [{type:'set-state',id:old.name,state:{intensity:11}}],
      [{type:'set-state',id:old.name,state:{intensity:NaN}}],
      [{type:'set-state',id:old.name,state:{reflectionOn:false}}],
    ];
    for(const ops of cases){result.push(rejection(()=>apply(ops)));assert.equal(scene.save(),saved);assert.equal(get(old.name),old);}
    const invalid=scene.document;invalid.nodes.find(n=>n.id===old.name).parentId=invalid.nodes.find(n=>n.kind==='room').id;
    result.push(rejection(()=>deriveCompany(invalid,catalog,templates)));assert.equal(scene.save(),saved);
    return result;
  });
  await check('Light off and zero output leave every mirror binding available; same-name two rooms keep distinct state and child identity',async()=>{
    apply([{type:'set-state',id:'vanity/primary/mirror',state:{on:false}}]);
    assert(scene.mirrorBindings().length===3);assert.equal(scene.snapshot().lights[0].intensity,0);
    for(const m of [get('vanity/primary/mirror').getObjectByName('makeup-lamp').material].flat())assert.equal(m.emissiveIntensity,0);
    const doc=createMakeupMirrorSample(catalog,templates,{alternate:true,index:2}).document;
    await library.preload(deriveCompany(doc,catalog,templates).facilities.map(f=>f.resource));scene.restore(JSON.stringify(doc));
    apply([{type:'set-state',id:'vanity/primary/mirror',state:{intensity:0}}]);
    assert.deepEqual(node('vanity/secondary/mirror').state,{on:false,intensity:3});
    const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);
    return {states:scene.document.nodes.filter(n=>n.id.endsWith('/mirror')).map(n=>({id:n.id,parentId:n.parentId,state:n.state})),lights:scene.snapshot().lights};
  });
  report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
finally{scene?.dispose();library.dispose();const out=new URL(process.argv[2]||'evidence/company-makeup-mirror-data-v1/report.json',root);await fs.mkdir(new URL('./',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,error:report.error}));}
