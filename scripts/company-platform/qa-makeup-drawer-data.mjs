import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMakeupDrawerSample} from '../../prototype/src/company/makeup-drawer-samples.js';
import {deriveCompany,composeTransform} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const inserts=catalog.resources.filter(r=>r.mountRole==='makeup-storage-drawer');
const report={status:'running',checks:[],limits:['Actual GLB loading and common scene graph on CPU. Browser rendering, process restart and character C3 are separate evidence.']};
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const b=await fs.readFile(new URL('prototype/public'+url,root));return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});
let scene;
const id='makeup-drawer/primary',insertId=id+'/insert',contentId=insertId+'/content';
const ref=r=>({id:r.id,version:r.version}),node=id=>scene.document.nodes.find(n=>n.id===id),get=id=>scene.root.getObjectByName(id);
const position=id=>get(id).getWorldPosition(new THREE.Vector3()).toArray();
const near=(a,b)=>assert(a.every((v,i)=>Math.abs(v-b[i])<1e-7),`${a} differs from ${b}`);
function apply(ops){let h;try{h=scene.prepareChange(ops);return scene.commit(h);}finally{if(h)scene.discard(h);}}
function rejected(fn){let e;try{fn();}catch(error){e=error;}assert(e?.code,`Expected typed rejection: ${e?.stack}`);return{code:e.code,path:e.path};}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});}
function agree(){scene.root.updateMatrixWorld(true);const d=deriveCompany(scene.document,catalog,templates);for(const f of d.facilities)near(position(f.id),d.worlds.get(f.id).position);return d;}
try {
  await check('Four distinct compatible insert GLBs fit both actual sample inputs',()=>{
    assert.equal(inserts.length,4);assert.equal(new Set(inserts.map(r=>r.asset.sha256)).size,4);
    for(const r of inserts)assert(compareFacilityFunction(inserts[0],r).compatible);
    for(let index=0;index<4;index++)for(const alternate of [false,true])inspectCompanyPlacement(createMakeupDrawerSample(catalog,templates,{index,alternate}).document,catalog,templates);
    return inserts.map(r=>({resource:ref(r),sha256:r.asset.sha256}));
  });
  const sample=createMakeupDrawerSample(catalog,templates).document;
  await library.preload([...deriveCompany(sample,catalog,templates).facilities.map(f=>f.resource),...inserts]);
  scene=createCompanyScene(new THREE.Scene(),sample,{catalog,templates,assetLibrary:library});
  await check('Replacing inserts retains real host, compact, saved rest transforms and open state',()=>{
    const before=scene.document.nodes.filter(n=>n.id!==insertId),result=[];
    for(const resource of inserts){apply([{type:'replace-resource',id:insertId,resource:ref(resource)}]);assert.deepEqual(scene.document.nodes.filter(n=>n.id!==insertId),before);agree();
      const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);agree();result.push({resource:ref(resource),compactWorld:position(contentId)});}
    return result;
  });
  await check('Actual drawer, inserted storage and nested compact translate together; cabinet-top clock stays still',()=>{
    const rest=structuredClone(node(insertId).transform),childRest=structuredClone(node(contentId).transform),clock=position(id+'/top-clock'),result=[];
    for(const value of [0,.37,.5,1,0,1,0]) {
      apply([{type:'set-state',id,state:{openFraction:value}}]);const d=agree();
      const drawer=get(id).getObjectByName('cabinet-drawer-slide');near(drawer.position.toArray(),[0,0,.32*value]);
      assert.deepEqual(node(insertId).transform,rest);assert.deepEqual(node(contentId).transform,childRest);near(position(id+'/top-clock'),clock);
      const expected=composeTransform(d.worlds.get(id),{position:[0,.455,.03125+.32*value],yaw:0});near(position(insertId),expected.position);
      near(position(contentId),composeTransform(expected,childRest).position);result.push({value,drawer:drawer.position.toArray(),insert:position(insertId),compact:position(contentId)});
    }return result;
  });
  await check('Standalone cabinet can turn independently while its real nested content remains consistent',()=>{
    apply([{type:'move',id,transform:{position:[1.5,0,.4],yaw:Math.PI/2}}]);
    apply([{type:'set-state',id,state:{openFraction:0}}]);const closed=position(contentId);
    apply([{type:'set-state',id,state:{openFraction:1}}]);agree();near(position(contentId),[closed[0]+.32,closed[1],closed[2]]);
    const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);agree();return{closed,opened:position(contentId)};
  });
  await check('Invalid rest height, insert fit, state and missing appearance preserve old scene and saved document',()=>{
    const saved=scene.save(),old=scene.root,results=[];
    const invalid=[
      [{type:'move',id:insertId,transform:{position:[0,.456,.03125],yaw:0}}],
      [{type:'move',id:insertId,transform:{position:[0,.455,.03125],yaw:Math.PI/2}}],
      [{type:'move',id:contentId,transform:{position:[0,.011,-.045],yaw:0}}],
      [{type:'set-state',id,state:{openFraction:1.01}}],
      [{type:'set-state',id,state:{openFraction:NaN}}],
      [{type:'replace-resource',id:insertId,resource:ref(catalog.resources.find(r=>r.mountRole==='makeup-storage'))}],
      [{type:'replace-resource',id:insertId,resource:{id:'missing-drawer-insert',version:1}}],
    ];
    for(const ops of invalid){results.push(rejected(()=>apply(ops)));assert.equal(scene.root,old);assert.equal(scene.save(),saved);}return results;
  });
  await check('Two same-name rooms retain independent host state and nested contents across restoration',async()=>{
    const doc=createMakeupDrawerSample(catalog,templates,{index:2,alternate:true}).document;
    await library.preload(deriveCompany(doc,catalog,templates).facilities.map(f=>f.resource));scene.restore(JSON.stringify(doc));
    const other='makeup-drawer/secondary',before=position(other+'/insert/content');
    apply([{type:'set-state',id,state:{openFraction:.83}}]);near(position(other+'/insert/content'),before);assert.equal(node(other).state.openFraction,.25);
    agree();const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);agree();
    return{primary:node(id),secondary:node(other),contents:[position(contentId),position(other+'/insert/content')]};
  });
  report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
finally{scene?.dispose();library.dispose();const out=new URL(process.argv[2]||'evidence/company-makeup-drawer-data-v1/report.json',root);await fs.mkdir(new URL('./',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));}
