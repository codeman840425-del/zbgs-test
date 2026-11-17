import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createVanitySample} from '../../prototype/src/company/vanity-samples.js';
import {deriveCompany,composeTransform} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const tables=catalog.resources.filter(r=>r.mountRole==='vanity-table'),checks=[];
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const bytes=await fs.readFile(new URL('prototype/public'+url,root));return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
const report={status:'running',checks,limits:['CPU real GLB/scene verification; browser restart, role C3 and ordinary-PC performance require separate evidence']};let scene;
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
const ref=r=>({id:r.id,version:r.version}),node=id=>scene.document.nodes.find(n=>n.id===id),get=id=>scene.root.getObjectByName(id);
function apply(ops){let handle;try{handle=scene.prepareChange(ops);return scene.commit(handle);}finally{if(handle)scene.discard(handle);}}
try {
  await check('Four real distinct models and both layouts share fixed function and connected side-entry seats',()=>{
    assert.equal(tables.length,4);assert.equal(new Set(tables.map(r=>r.asset.sha256)).size,4);
    for(const r of tables)assert(compareFacilityFunction(tables[0],r).compatible);
    const summaries=[];
    for(let index=0;index<4;index++)for(const alternate of [false,true]) {
      const doc=createVanitySample(catalog,templates,{index,alternate}).document,d=deriveCompany(doc,catalog,templates),p=inspectCompanyPlacement(doc,catalog,templates);
      assert.equal(d.vanityClearances.length,alternate?2:1);assert.equal(p.checkedPoints.length,alternate?2:1);
      for(const c of d.vanityClearances)assert(c.seatId);
      summaries.push({index,alternate,checkedSeats:p.checkedPoints.map(p=>p.id)});
    }return summaries;
  });
  const sample=createVanitySample(catalog,templates).document;
  const needed=deriveCompany(sample,catalog,templates).facilities.map(f=>f.resource);
  await library.preload([...needed,...tables]);
  scene=createCompanyScene(new THREE.Scene(),sample,{catalog,templates,assetLibrary:library});scene.setPresentationInputs({clockSeconds:33330});
  await check('Each actual table appearance retains its real supported children and nondefault clock state through scene restore',()=>{
    const results=[];
    for(const r of tables) {
      const childBefore=scene.document.nodes.filter(n=>n.parentId==='vanity/primary'),seatBefore=node('vanity/primary/seat');
      apply([{type:'replace-resource',id:'vanity/primary',resource:ref(r)}]);
      assert.deepEqual(scene.document.nodes.filter(n=>n.parentId==='vanity/primary'),childBefore);assert.deepEqual(node('vanity/primary/seat'),seatBefore);
      assert.equal(node('vanity/primary/clock').state.brightness,.4);
      const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);assert(get('vanity/primary').getObjectByName('vanity-top'));
      results.push({resource:ref(r),clockState:node('vanity/primary/clock').state});
    }return results;
  });
  await check('Explicit table-and-seat quarter-turn moves real supported geometry together while preserving logical identity',()=>{
    const t={position:[.5,0,-1.3],yaw:Math.PI/2},seat=composeTransform(t,tables[0].clearance.seat);
    apply([{type:'move',id:'vanity/primary',transform:t},{type:'move',id:'vanity/primary/seat',transform:seat}]);
    const d=deriveCompany(scene.document,catalog,templates);inspectCompanyPlacement(scene.document,catalog,templates);
    const result=[];
    for(const id of ['vanity/primary/clock','vanity/primary/ornament-0','vanity/primary/ornament-1','vanity/primary/seat']) {
      const actual=get(id).getWorldPosition(new THREE.Vector3()).toArray(),expected=d.worlds.get(id).position;
      assert(actual.every((v,i)=>Math.abs(v-expected[i])<1e-8));result.push({id,actual,expected});
    }return result;
  });
  await check('Invalid clearance, mounting, seat pairing and parent changes preserve live scene and serialized document',()=>{
    const saved=scene.save(),mesh=get('vanity/primary'),oldRevision=scene.revision,failures=[];
    const cases=[
      [{type:'move',id:'vanity/primary',transform:{position:[.6,0,-1.3],yaw:Math.PI/2}}],
      [{type:'move',id:'vanity/primary/seat',transform:{position:[2,0,1],yaw:0}}],
      [{type:'move',id:'vanity/primary/clock',transform:{position:[.02,.80,-.15],yaw:0}}],
      [{type:'move',id:'vanity/primary/ornament-0',transform:{position:[.02,.78,-.15],yaw:0}}],
      [{type:'set-state',id:'vanity/primary',state:{open:1}}],
      [{type:'replace-resource',id:'vanity/primary/seat',resource:{id:'chair',version:1}}],
    ];
    for(const ops of cases){let rejected;try{apply(ops);}catch(e){rejected=e.code;}assert(rejected);assert.equal(scene.save(),saved);assert.equal(scene.revision,oldRevision);assert.equal(get('vanity/primary'),mesh);failures.push({ops,code:rejected});}
    return failures;
  });
  await check('Two rooms with identical display names retain independent tables, chair targets and clock states',()=>{
    const doc=createVanitySample(catalog,templates,{alternate:true}).document;scene.restore(JSON.stringify(doc));
    apply([{type:'set-state',id:'vanity/primary/clock',state:{on:false}}]);
    assert.equal(node('vanity/secondary/clock').state.on,true);assert.equal(node('vanity/secondary/clock').state.timeOffsetSeconds,7200);
    const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);assert.equal(deriveCompany(scene.document,catalog,templates).vanityClearances.length,2);
  });
  report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
finally{scene?.dispose();library.dispose();const out=new URL(process.argv[2]||'evidence/company-vanity-data-v1/report.json',root);await fs.mkdir(new URL('./',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,error:report.error}));}
