import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createInformationSample} from '../../prototype/src/company/information-samples.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const root=new URL('../../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root))),templates=JSON.parse(await fs.readFile(new URL('prototype/src/company/templates-extended.json',root)));
const out=new URL(process.argv[2]||'evidence/company-information-data-v1/',root),checks=[];
const boards=catalog.resources.filter(r=>r.informationSurface),contents=catalog.resources.filter(r=>r.informationContent),ref=r=>({id:r.id,version:r.version});
let doc=createInformationSample(catalog,templates).document;
const apply=(ops,c=catalog)=>prepareCompanyChange(doc,ops,{catalog:c,templates}).document;
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
try {
await check('Four actual frame resources share fixed function; content is independently compatible',()=>{
  assert.equal(boards.length,4);assert(contents.length>=2);assert.equal(new Set(boards.map(r=>r.asset.sha256)).size,4);
  assert.equal(new Set(contents.map(r=>r.asset.sha256)).size,contents.length);
  for(const b of boards)assert(compareFacilityFunction(boards[0],b).compatible);
  for(const c of contents)assert(compareFacilityFunction(contents[0],c).compatible);
  assert(!compareFacilityFunction(boards[0],contents[0]).compatible);
});
await check('Content replacement preserves frame identity, frame replacement preserves child content and hidden state',async()=>{
  const board=structuredClone(doc.nodes.find(n=>n.id==='information/primary'));
  doc=apply([{type:'replace-resource',id:'information/primary/content',resource:ref(contents[1])},{type:'set-state',id:'information/primary/content',state:{visible:false}}]);
  assert.deepEqual(doc.nodes.find(n=>n.id===board.id),board);
  const content=structuredClone(doc.nodes.find(n=>n.id==='information/primary/content'));
  for(const b of boards){doc=apply([{type:'replace-resource',id:board.id,resource:ref(b)}]);assert.deepEqual(doc.nodes.find(n=>n.id===content.id),content);const saved=await encodeCompanySave(doc,catalog,templates);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),doc);}
});
await check('Side-wall placement composes actual content position and yaw without changing child local transform',()=>{
  const alternate=createInformationSample(catalog,templates,{alternate:true}).document,derived=deriveCompany(alternate,catalog,templates);
  const p=derived.worlds.get('information/primary'),c=derived.worlds.get('information/primary/content');
  assert(Math.abs(c.position[0]-p.position[0]-.031)<1e-10);assert.equal(c.position[1],p.position[1]);assert(Math.abs(c.position[2]-p.position[2])<1e-10);assert.equal(c.yaw,Math.PI/2);
});
await check('Illegal mounting, duplicate slot, incompatible frame, extra state and missing versions reject before modifying input',()=>{
  const saved=JSON.stringify(doc);
  for(const ops of [
    [{type:'move',id:'information/primary/content',transform:{position:[0,.01,.031],yaw:0}}],
    [{type:'move',id:'information/primary/content',transform:{position:[0,0,.031],yaw:Math.PI/2}}],
    [{type:'add-facility',id:'bad',parentId:'information/primary',resource:ref(contents[0]),transform:{position:[0,0,.031],yaw:0}}],
    [{type:'add-facility',id:'bad',parentId:doc.nodes[1].id,resource:ref(contents[0]),transform:{position:[0,0,.031],yaw:0}}],
    [{type:'set-state',id:'information/primary/content',state:{visible:1}}],
    [{type:'set-state',id:'information/primary/content',state:{text:'unvalidated'}}],
    [{type:'replace-resource',id:'information/primary',resource:ref(contents[0])}],
    [{type:'replace-resource',id:'information/primary/content',resource:{id:contents[0].id,version:999}}],
  ]){assert.throws(()=>apply(ops));assert.equal(JSON.stringify(doc),saved);}
});
await check('Save pins content as ordinary dependency; changed content bytes under same version reject; parent removal removes child',async()=>{
  const saved=await encodeCompanySave(doc,catalog,templates),envelope=JSON.parse(saved);
  assert(envelope.dependencies.resources.some(r=>r.id===contents[1].id));
  const changed=structuredClone(catalog);changed.resources.find(r=>r.id===contents[1].id).asset.sha256='0'.repeat(64);
  await assert.rejects(()=>decodeCompanySave(saved,changed,templates),e=>e.code==='dependency-content-mismatch');
  const removed=apply([{type:'remove',id:'information/primary'}]);assert(!removed.nodes.some(n=>n.id.startsWith('information/primary')));
  const restored=await decodeCompanySave(saved,catalog,templates);assert.deepEqual(restored,doc);
});
await fs.mkdir(out,{recursive:false});await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,limits:['Data-contract validation; actual PNG decoding and appearance require browser evidence']},null,2)+'\n');
console.log(JSON.stringify({status:'passed',checks:checks.length}));
}catch(error){await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('failure.json',out),JSON.stringify({status:'failed',checks,error:error.stack},null,2)+'\n');throw error;}
