import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CEILING_ACOUSTIC_IDS,CEILING_ACOUSTIC_DESIGNS,CEILING_ACOUSTIC_MOUNTING,validateCeilingAcousticResource} from '../../prototype/src/company/ceiling-acoustic-data.js';
import {createCeilingAcousticSample} from '../../prototype/src/company/ceiling-acoustic-samples.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const output=process.argv[2];assert(output,'Specify a fresh evidence directory');await fs.mkdir(output);
const synthetic=process.argv.includes('--synthetic'),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const base=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const resources=synthetic?CEILING_ACOUSTIC_IDS.map((id,i)=>({id,version:1,category:'decor',mountRole:'ceiling-acoustic-baffle',productionBranch:'ceiling-acoustic-baffle',mount:'ceiling',mounting:structuredClone(CEILING_ACOUSTIC_MOUNTING),footprint:{center:[0,0],halfSize:[.6,.2],blocking:false},stateDefaults:{},usePoints:[],coordinates:{units:'metres',up:'+Y',forward:'+Z'},provenance:{sourceDesign:CEILING_ACOUSTIC_DESIGNS[i]},asset:{format:'glb',url:'/synthetic.glb',sha256:'0'.repeat(64),bytes:20}})):CEILING_ACOUSTIC_IDS.map(id=>base.resources.find(r=>r.id===id&&r.version===1));
assert(resources.every(Boolean));const catalog={...base,resources:[...base.resources.filter(r=>!CEILING_ACOUSTIC_IDS.includes(r.id)),...resources]};
const opt={catalog,templates},fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
const sample=alternate=>createCeilingAcousticSample(catalog,templates,{alternate}).document,ref=r=>({id:r.id,version:r.version});
const change=(doc,ops)=>{const next=prepareCompanyChange(doc,ops,opt).document;inspectCompanyPlacement(next,catalog,templates);return next;};
const target='ceiling-acoustic/primary',node=(d,id)=>d.nodes.find(n=>n.id===id),checks=[];
async function check(name,fn){try{checks.push({name,passed:true,result:await fn()});}catch(e){checks.push({name,passed:false,code:e.code,error:e.stack});}}
await check('Four fixed resources and new identity/version share the same function',()=>{
  for(const r of [...resources,{...structuredClone(resources[0]),id:'new-ceiling-input',version:2}]){validateCeilingAcousticResource(r,fail);assert(compareFacilityFunction(resources[0],r).compatible);}
  for(const edit of [r=>r.mount='wall',r=>r.mounting.origin='bottom',r=>r.mounting.height=.4,r=>r.footprint.blocking=true,r=>r.stateDefaults.on=true,r=>r.usePoints.push({id:'seat'}),r=>r.productionBranch='plant',r=>r.provenance.sourceDesign='unchecked',r=>r.extra=true]){
    const bad=structuredClone(resources[0]);edit(bad);assert.throws(()=>validateCeilingAcousticResource(bad,fail),e=>e.code==='invalid-ceiling-acoustic-contract');
  }
  assert.throws(()=>validateSupportResource({id:'unknown-mount',mount:'typo-ceiling'},fail),e=>e.code==='unsupported-mount');
  return{resources:resources.map(ref),synthetic};
});
await check('Two layout inputs and quarter turns preserve 2.5m clearance without ground blocking',()=>{
  return[false,true].map(alternate=>{const doc=sample(alternate),d=deriveCompany(doc,catalog,templates);inspectCompanyPlacement(doc,catalog,templates);
    assert(!d.obstacles.some(o=>o.id===target));assert(d.obstacles.some(o=>o.id==='ceiling-acoustic/table'));
    const f=d.facilities.find(f=>f.id===target);assert.equal(f.world.position[1],2.8);return{id:doc.id,world:f.world,clearance:2.5};});
});
await check('Move rotate copy replace and complete save restore preserve local edits',async()=>{
  let doc=change(sample(false),[{type:'move',id:target,transform:{position:[-1,2.8,0],yaw:Math.PI/2}},
    {type:'copy-facility',id:target,newId:'ceiling-copy',transform:{position:[1,2.8,0],yaw:Math.PI/2}}]);
  const transform=structuredClone(node(doc,target).transform),copy=structuredClone(node(doc,'ceiling-copy'));
  for(const r of resources){doc=change(doc,[{type:'replace-resource',id:target,resource:ref(r)}]);assert.deepEqual(node(doc,target).transform,transform);assert.deepEqual(node(doc,'ceiling-copy'),copy);
    assert.deepEqual(await decodeCompanySave(await encodeCompanySave(doc,catalog,templates),catalog,templates),doc);}
  return{nodes:doc.nodes.length,replacements:resources.length};
});
await check('Floating origin wrong parent crossing wall and intersecting mounts fail without mutating old input',()=>{
  const doc=sample(false),before=JSON.stringify(doc),cases=[
    [{type:'move',id:target,transform:{position:[0,2.7,0],yaw:0}}],
    [{type:'move',id:target,transform:{position:[2.5,2.8,0],yaw:0}}],
    [{type:'move',id:target,transform:{position:[0,2.8,1.7],yaw:Math.PI/2}}],
    [{type:'copy-facility',id:target,newId:'bad-copy',transform:{position:[.2,2.8,0],yaw:0}}],
  ],errors=[];
  for(const ops of cases){assert.throws(()=>change(doc,ops),e=>{errors.push(e.code);return Boolean(e.code);});assert.equal(JSON.stringify(doc),before);}
  const bad=structuredClone(doc);node(bad,target).parentId='ceiling-acoustic/table';assert.throws(()=>deriveCompany(bad,catalog,templates),e=>e.code==='invalid-ceiling-parent');
  const raised=structuredClone(doc);raised.nodes.push({id:'high-wall-shelf',kind:'facility',parentId:doc.nodes[1].id,resource:{id:'wall-shelf-side-bracket',version:1},transform:{position:[0,1,-1.9],yaw:0}});
  // Place the ceiling inside the wall shelf's upper reserved height and depth.
  node(raised,target).transform.position=[0,2.8,-1.7];assert.throws(()=>deriveCompany(raised,catalog,templates),e=>e.code==='ceiling-envelope-overlap');
  return{errors,additional:['invalid-ceiling-parent','ceiling-envelope-overlap']};
});
await check('Two floors with identical local positions retain distinct ownership and save identity',async()=>{
  const doc=sample(false),floor=doc.nodes[0],room=doc.nodes[1];doc.scale='building';const original=structuredClone(doc.nodes);
  for(const n of original){const copy=structuredClone(n);copy.id=n.id+'-second';copy.parentId=n.parentId===doc.id?doc.id:n.parentId+'-second';if(n.kind==='floor'){copy.name='二层';copy.level=2;}doc.nodes.push(copy);}
  const d=deriveCompany(doc,catalog,templates);assert.equal(d.facilities.filter(f=>f.resource.mount==='ceiling').length,2);
  assert.equal(d.facilities.find(f=>f.id===target+'-second').world.position[1],2.8);
  assert.deepEqual(await decodeCompanySave(await encodeCompanySave(doc,catalog,templates),catalog,templates),doc);
  const wrong=structuredClone(doc);node(wrong,target+'-second').parentId=room.id;assert.throws(()=>deriveCompany(wrong,catalog,templates),e=>e.code==='ceiling-envelope-overlap');
  return{floorIds:[floor.id,floor.id+'-second'],nodes:doc.nodes.length};
});
await check('Saved resource versions bind the full ceiling contract and fail on descriptor tampering',async()=>{
  const doc=sample(false),save=await encodeCompanySave(doc,catalog,templates),changed=structuredClone(catalog);
  changed.resources.find(r=>r.id===resources[0].id).displayName='Unversioned descriptor edit';
  await assert.rejects(()=>decodeCompanySave(save,changed,templates),e=>e.code==='dependency-content-mismatch');
  return{rejected:'dependency-content-mismatch'};
});
await check('Registered model bytes match descriptors and previous resources remain byte-identical',async()=>{
  if(synthetic)return{skipped:'Synthetic data preflight is not production/GLB evidence'};
  const previous=JSON.parse((await import('node:child_process')).execFileSync('git',['show','931c6045:prototype/src/company/library-catalog.json'],{encoding:'utf8'}));
  for(const r of previous.resources)assert.deepEqual(catalog.resources.find(n=>n.id===r.id&&n.version===r.version),r);
  const actual=[];for(const r of resources){const bytes=await fs.readFile('prototype/public'+r.asset.url),sha=createHash('sha256').update(bytes).digest('hex');assert.equal(bytes.length,r.asset.bytes);assert.equal(sha,r.asset.sha256);actual.push({id:r.id,sha256:sha,bytes:bytes.length});}
  assert.equal(new Set(actual.map(r=>r.sha256)).size,4);return{unchanged:previous.resources.length,actual};
});
const report={status:checks.every(c=>c.passed)?'passed':'failed',synthetic,checks,limits:['CPU data checks only; runtime, actual geometry, C3 and human acceptance are separate.']};
await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
