import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {appearanceBranches,appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {runCompanyBatch} from './batch.mjs';
const out=process.argv[2];if(!out)throw Error('Provide a new output directory');
await checkManagedOutput(path.resolve(out),undefined,{allowDelivery:false});
await fs.mkdir(out);const batch={schema:'company-batch',version:1,items:[]};
for(const [branch]of appearanceBranches){
 assert(appearanceCandidates(catalog,branch).length>=4,`Missing four appearances: ${branch}`);
 for(let i=0;i<4;i++){
  const sample=createAppearanceSample(branch,i,catalog,templates),id=`four-${branch}-${i+1}`,mapping=new Map([[sample.document.id,id],...sample.document.nodes.map(n=>[n.id,`${id}/${n.id}`])]);
  function remap(v){return Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)])):typeof v==='string'&&mapping.has(v)?mapping.get(v):v;}
  batch.items.push({key:id,document:remap(sample.document)});
 }
}
await fs.writeFile(`${out}/input.json`,JSON.stringify(batch,null,2)+'\n');
const first=await runCompanyBatch(batch,{outputDirectory:`${out}/results`});assert(first.ok,JSON.stringify(first.results.filter(r=>r.status==='failed')));
const retry=await runCompanyBatch(batch,{outputDirectory:`${out}/results`,only:batch.items[0].key});assert(retry.ok&&retry.results[0].status==='idempotent');
const digest=b=>createHash('sha256').update(b).digest('hex'),keep=`${out}/results/${batch.items[0].key}/save.json`,before=digest(await fs.readFile(keep));
const bad=structuredClone(batch);bad.items[1].document.nodes.find(n=>n.resource).resource.version=999;
const mixed=await runCompanyBatch({schema:'company-batch',version:1,items:[bad.items[0],bad.items[1]]},{outputDirectory:`${out}/failure-retry`});
assert.equal(mixed.results[0].status,'created');assert.equal(mixed.results[1].status,'failed');
const repaired=await runCompanyBatch(batch,{outputDirectory:`${out}/failure-retry`,only:batch.items[1].key});assert(repaired.ok);assert.equal(before,digest(await fs.readFile(keep)));
await fs.writeFile(`${out}/report.json`,JSON.stringify({status:'passed',count:first.results.length,branches:appearanceBranches,first,retry,mixed,repaired,oldSaveUnchanged:true,limits:['Actual preview checks are separate from static batch publication']},null,2)+'\n');
console.log(JSON.stringify({status:'passed',count:first.results.length,output:out}));
