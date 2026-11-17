import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFloorInformationSample} from '../../prototype/src/company/floor-information-samples.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {validateInformationResource} from '../../prototype/src/company/information-display.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const out=process.argv[2],checks=[],boards=catalog.resources.filter(r=>r.mountRole==='information-board-floor'),contents=catalog.resources.filter(r=>r.informationContent),ref=r=>({id:r.id,version:r.version});
const fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
let doc=createFloorInformationSample(catalog,templates).document;
const apply=ops=>{const next=prepareCompanyChange(doc,ops,{catalog,templates}).document;inspectCompanyPlacement(next,catalog,templates);return next;};
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
try {
await check('Four actual floor appearances share one function, preserve wall/content separation and require blocking support',()=>{
 assert.equal(boards.length,4);assert.equal(new Set(boards.map(r=>r.asset.sha256)).size,4);
 for(const r of boards){validateInformationResource(r,fail);assert(compareFacilityFunction(boards[0],r).compatible);}
 assert(!compareFacilityFunction(boards[0],catalog.resources.find(r=>r.mountRole==='information-board')).compatible);
 for(const mutate of [r=>delete r.footprint,r=>r.footprint.blocking=false,r=>r.footprint.halfSize[1]=.1,r=>delete r.informationNodes.post,r=>r.informationSurface.position[1]=0,r=>r.mounting.origin='center',r=>r.stateDefaults.open=true]){const r=structuredClone(boards[0]);mutate(r);assert.throws(()=>validateInformationResource(r,fail),e=>e.code==='invalid-information-contract');}
});
await check('Both public-entry layouts retain real portal connectivity and two floor footprints',()=>{
 const result=[];
 for(const alternate of [false,true]){const sample=createFloorInformationSample(catalog,templates,{alternate}).document,derived=deriveCompany(sample,catalog,templates),placement=inspectCompanyPlacement(sample,catalog,templates);assert.equal(derived.facilities.filter(f=>f.resource.mountRole==='information-board-floor').length,2);assert(derived.obstacles.some(o=>o.id==='floor-information/primary'));assert.equal(placement.checkedPortals.length,2);result.push({alternate,portals:placement.checkedPortals.length});}
 return result;
});
await check('Four frames and two contents preserve independent identity and state through saves',async()=>{
 doc=apply([{type:'set-state',id:'floor-information/primary/content',state:{visible:false}}]);
 for(const board of boards)for(const content of contents){
  const before=structuredClone(doc.nodes.find(n=>n.id==='floor-information/primary/content'));
  doc=apply([{type:'replace-resource',id:'floor-information/primary',resource:ref(board)}]);assert.deepEqual(doc.nodes.find(n=>n.id===before.id),before);
  const frame=structuredClone(doc.nodes.find(n=>n.id==='floor-information/primary'));
  doc=apply([{type:'replace-resource',id:before.id,resource:ref(content)}]);assert.deepEqual(doc.nodes.find(n=>n.id===frame.id),frame);
  const saved=await encodeCompanySave(doc,catalog,templates);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),doc);
 }
});
await check('Quarter-turn movement and explicit atomic subtree copy retain local mount and separate content identity',()=>{
 const original=structuredClone(doc.nodes.find(n=>n.id==='floor-information/primary/content'));
 doc=apply([{type:'move',id:'floor-information/primary',transform:{position:[-1.8,0,.2],yaw:Math.PI/2}}]);
 assert.deepEqual(doc.nodes.find(n=>n.id===original.id),original);
 const derived=deriveCompany(doc,catalog,templates),parent=derived.worlds.get('floor-information/primary'),child=derived.worlds.get(original.id);
 assert(Math.abs(child.position[0]-parent.position[0]-.031)<1e-9);assert(Math.abs(child.position[1]-parent.position[1]-1.3)<1e-9);
 const frame=doc.nodes.find(n=>n.id==='floor-information/primary');
 doc=apply([{type:'add-facility',id:'floor-information/copy',parentId:frame.parentId,resource:frame.resource,transform:{position:[0,0,.7],yaw:0}},
  {type:'add-facility',id:'floor-information/copy/content',parentId:'floor-information/copy',resource:original.resource,transform:original.transform,state:{visible:true}}]);
 assert.equal(doc.nodes.find(n=>n.id===original.id).state.visible,false);assert.equal(doc.nodes.find(n=>n.id==='floor-information/copy/content').state.visible,true);
 return{copyMechanism:'One transaction with existing add-facility operations; no new copy/group runtime'};
});
await check('Bad ground/rotation/edge/slot and blocking the real portal reject before input changes',()=>{
 const before=JSON.stringify(doc),codes=[];
 const operations=[
  [{type:'move',id:'floor-information/primary',transform:{position:[-1.8,.1,.2],yaw:0}}],
  [{type:'move',id:'floor-information/primary',transform:{position:[-1.8,0,.2],yaw:.4}}],
  [{type:'move',id:'floor-information/primary',transform:{position:[3.4,0,0],yaw:0}}],
  [{type:'move',id:'floor-information/primary/content',transform:{position:[0,0,.031],yaw:0}}],
  [{type:'move',id:'floor-information/primary',transform:{position:[0,0,-1.05],yaw:0}}],
 ];
 for(const ops of operations){assert.throws(()=>apply(ops),e=>{codes.push(e.code);return true;});assert.equal(JSON.stringify(doc),before);}
 assert(codes.includes('blocked-portal'));return{codes};
});
await fs.mkdir(out,{recursive:false});await fs.writeFile(`${out}/report.json`,JSON.stringify({status:'passed',checks,limits:['Data and static placement only; actual GLBs and browser recovery have separate evidence.']},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length}));
}catch(error){await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/failure.json`,JSON.stringify({status:'failed',checks,error:error.stack},null,2)+'\n');throw error;}
