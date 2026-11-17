import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMakeupStorageSample} from '../../prototype/src/company/makeup-storage-samples.js';
import {deriveCompany,composeTransform} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const storage=catalog.resources.filter(r=>r.mountRole==='makeup-storage');
const report={status:'running',checks:[],limits:['Actual GLB loader and scene graph on CPU; mirror GPU preflight stubbed. Browser rendering, process restart and character use are separate evidence.']};
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const b=await fs.readFile(new URL('prototype/public'+url,root));return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});
let scene;
const ref=r=>({id:r.id,version:r.version}),node=id=>scene.document.nodes.find(n=>n.id===id),get=id=>scene.root.getObjectByName(id);
const position=id=>get(id).getWorldPosition(new THREE.Vector3()).toArray();
const near=(a,b)=>assert(a.every((v,i)=>Math.abs(v-b[i])<1e-7),`${a} differs from ${b}`);
function apply(ops){let h;try{h=scene.prepareChange(ops);return scene.commit(h);}finally{if(h)scene.discard(h);}}
function rejected(fn){let e;try{fn();}catch(error){e=error;}assert(e?.code,`Expected typed rejection: ${e?.stack}`);return{code:e.code,path:e.path};}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});}
function positionsAgree(){scene.root.updateMatrixWorld(true);const d=deriveCompany(scene.document,catalog,templates);for(const f of d.facilities)near(position(f.id),d.worlds.get(f.id).position);return d;}
try {
  await check('Four genuinely different GLBs share function and fit both inputs',()=>{
    assert.equal(storage.length,4);assert.equal(new Set(storage.map(r=>r.asset.sha256)).size,4);
    for(const r of storage)assert(compareFacilityFunction(storage[0],r).compatible);
    for(let index=0;index<4;index++)for(const alternate of [false,true])inspectCompanyPlacement(createMakeupStorageSample(catalog,templates,{index,alternate}).document,catalog,templates);
    return storage.map(r=>({resource:ref(r),sha256:r.asset.sha256}));
  });
  const sample=createMakeupStorageSample(catalog,templates).document;
  await library.preload([...deriveCompany(sample,catalog,templates).facilities.map(f=>f.resource),...storage]);
  scene=createCompanyScene(new THREE.Scene(),sample,{catalog,templates,assetLibrary:library,mirrorPreflight:()=>{}});
  const id='vanity/primary/storage';
  await check('Actual four-way replacement retains rest coordinates, contents, independent top and parent state',()=>{
    const before=scene.document.nodes.filter(n=>n.id!==id),result=[];
    for(const resource of storage) {
      apply([{type:'replace-resource',id,resource:ref(resource)}]);
      assert.deepEqual(scene.document.nodes.filter(n=>n.id!==id),before);assert.equal(node(id).state.openFraction,.65);
      const d=positionsAgree();assert.equal(d.facilities.find(f=>f.id===id).resource.footprint.blocking,false);
      const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);positionsAgree();
      result.push({resource:ref(resource),content:position(id+'/content'),top:position(id+'/top-content')});
    }return result;
  });
  await check('Closed/partial/full and repeated travel moves actual drawer and independent contents without cumulative drift',()=>{
    const savedRest=structuredClone(node(id+'/content').transform),top=position(id+'/top-content'),result=[];
    for(const value of [0,.37,.5,1,0,1,0]) {
      apply([{type:'set-state',id,state:{openFraction:value}}]);const d=positionsAgree();
      const drawer=get(id).getObjectByName('storage-drawer-slide');assert(drawer);assert(Math.abs(drawer.position.z-value*.09)<1e-10);
      assert.deepEqual(node(id+'/content').transform,savedRest);near(position(id+'/top-content'),top);
      const expected=composeTransform(d.worlds.get(id),{position:[0,.022,-.005+.09*value],yaw:0});near(position(id+'/content'),expected.position);
      result.push({value,drawer:drawer.position.toArray(),content:position(id+'/content')});
    }return result;
  });
  await check('Joint table/seat turn shares world transforms with moving child and preserves serialized rest state',()=>{
    const transform={position:[.5,0,-1.3],yaw:Math.PI/2},table=catalog.resources.find(r=>r.id===node('vanity/primary').resource.id);
    apply([{type:'move',id:'vanity/primary',transform},{type:'move',id:'vanity/primary/seat',transform:composeTransform(transform,table.clearance.seat)}]);
    apply([{type:'set-state',id,state:{openFraction:0}}]);const closed=position(id+'/content');
    apply([{type:'set-state',id,state:{openFraction:1}}]);positionsAgree();near(position(id+'/content'),[closed[0]+.09,closed[1],closed[2]]);
    const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);positionsAgree();return{closed,opened:position(id+'/content')};
  });
  await check('Bad placement, content, state and incompatible replacements preserve actual old scene and saved document',()=>{
    const saved=scene.save(),old=scene.root,results=[];
    const invalid=[
      [{type:'move',id,transform:{position:[.02,.78,.075],yaw:Math.PI/2}}],
      [{type:'move',id,transform:{position:[.02,.78,-.135],yaw:0}}],
      [{type:'move',id:id+'/content',transform:{position:[0,.023,-.005],yaw:0}}],
      [{type:'move',id:id+'/content',transform:{position:[0,.022,.019],yaw:0}}],
      [{type:'set-state',id,state:{openFraction:1.01}}],
      [{type:'set-state',id,state:{openFraction:NaN}}],
      [{type:'set-state',id,state:{open:true}}],
      [{type:'replace-resource',id,resource:ref(catalog.resources.find(r=>r.mountRole==='sliding-drawer-cabinet'))}],
      [{type:'replace-resource',id,resource:{id:'missing-makeup-storage',version:1}}],
    ];
    for(const ops of invalid){results.push(rejected(()=>apply(ops)));assert.equal(scene.root,old);assert.equal(scene.save(),saved);}
    return results;
  });
  await check('Two real turned rooms keep separate contents and nondefault state across restoration',async()=>{
    const doc=createMakeupStorageSample(catalog,templates,{index:2,alternate:true}).document;
    await library.preload(deriveCompany(doc,catalog,templates).facilities.map(f=>f.resource));scene.restore(JSON.stringify(doc));
    const other='vanity/secondary/storage',before=position(other+'/content');
    apply([{type:'set-state',id,state:{openFraction:.83}}]);near(position(other+'/content'),before);assert.equal(node(other).state.openFraction,.25);
    positionsAgree();const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);positionsAgree();
    return{id:node(id),other:node(other),contents:[position(id+'/content'),position(other+'/content')]};
  });
  report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
finally{scene?.dispose();library.dispose();const out=new URL(process.argv[2]||'evidence/company-makeup-storage-data-v1/report.json',root);await fs.mkdir(new URL('./',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));}
