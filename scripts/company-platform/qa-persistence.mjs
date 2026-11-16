import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import document from '../../prototype/src/company/examples/c1-two-stations.json' with {type:'json'};
import {createCompanySaveStore,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
const store=createCompanySaveStore({storage,catalog,templates}),checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});}
await check('Complete two-station parent graph and device states survive storage serialization',async()=>{
 await store.save(document);assert.deepEqual(await store.load(document.id),document);
 assert.equal(JSON.parse(store.export(document.id)).dependencies.resources.length,6);
});
const saved=store.export(document.id);
await check('A new store instance reads persisted bytes and independent identities',async()=>{
 const reopened=createCompanySaveStore({storage,catalog,templates});const result=await reopened.load(document.id);result.nodes[0].name='local';assert.deepEqual(await store.load(document.id),document);
});
await check('Template content cannot silently update an already saved company',async()=>{
 const updated=structuredClone(templates);updated.templates[0].parts[0].transform.position[2]-=.1;
 await assert.rejects(()=>decodeCompanySave(saved,catalog,updated),e=>e.code==='dependency-content-mismatch');assert.equal(store.export(document.id),saved);
});
await check('Resource content at a reused version is rejected rather than relabelled',async()=>{
 const updated=structuredClone(catalog);updated.resources[0].node.children[0].material.color='#ffffff';
 await assert.rejects(()=>decodeCompanySave(saved,updated,templates),e=>e.code==='dependency-content-mismatch');assert.equal(store.export(document.id),saved);
});
await check('Missing resource, illegal parent and corrupt input cannot replace valid bytes',async()=>{
 for(const mutation of [e=>{e.document.nodes.find(n=>n.kind==='facility').resource.version=99;},e=>{e.document.nodes.find(n=>n.kind==='facility').parentId='missing';}]) {
  const broken=JSON.parse(saved);mutation(broken);await assert.rejects(()=>store.import(JSON.stringify(broken)));assert.equal(store.export(document.id),saved);
 }
 await assert.rejects(()=>store.import('{'),e=>e.code==='invalid-save-json');assert.equal(store.export(document.id),saved);
});
await check('Storage failure preserves the previous value and produces a concrete reason',async()=>{
 const quota=createCompanySaveStore({catalog,templates,storage:{getItem:storage.getItem,setItem(){throw new Error('quota exceeded');}}});
 await assert.rejects(()=>quota.save(document),e=>e.code==='save-write-failed'&&e.message.includes('quota'));assert.equal(store.export(document.id),saved);
});
await check('Stale async save preparation cannot overwrite a newer scene revision',async()=>{
 await assert.rejects(()=>store.save(document,{isCurrent:()=>false}),e=>e.code==='revision-conflict');assert.equal(store.export(document.id),saved);
});
const out=new URL('../../evidence/company-c1-persistence-v1/',import.meta.url);await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,limits:['Storage adapter and encoding checks only. Actual browser shutdown and shared actor runtime restore are still required for C1.']},null,2)+'\n');
console.log(`${checks.length} persistence/dependency checks passed`);
