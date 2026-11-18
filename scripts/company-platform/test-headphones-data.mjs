import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {prepareCompanyChange} from '../../prototype/src/company/document.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const root=new URL('../../',import.meta.url),branch='headphones-and-stand',report={status:'passed',checks:[],limitations:['CPU document and placement checks only; wearing or picking up headphones is C3.']};
const candidates=appearanceCandidates(catalog,branch);assert.equal(candidates.length,4);assert.equal(new Set(candidates.map(r=>r.id)).size,4);const docs=[];
for(const [index,r] of candidates.entries()){const sample=createAppearanceSample(branch,index,catalog,templates);inspectCompanyPlacement(sample.document,catalog,templates);const n=sample.document.nodes.find(x=>x.id===sample.target);assert(n);assert.deepEqual(n.resource,{id:r.id,version:1});assert.equal(n.parentId,'sample/station/desk');assert.equal(n.transform.position[1],.84);docs.push(sample.document)}
const base=docs[0],targetId=base.nodes.find(n=>n.resource?.id===candidates[0].id).id,replaced=prepareCompanyChange(base,[{type:'replace-resource',id:targetId,resource:{id:candidates[1].id,version:1}}],{catalog,templates}).document;assert.equal(replaced.nodes.find(n=>n.id===targetId).resource.id,candidates[1].id);assert.deepEqual(replaced.nodes.find(n=>n.id===targetId).transform,base.nodes.find(n=>n.id===targetId).transform);const saved=await encodeCompanySave(replaced,catalog,templates);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),replaced);report.checks.push({branch,looks:candidates.map(r=>r.id),targetId,saveBytes:Buffer.byteLength(saved)});const out=process.argv[2]||'evidence/company-headphones-v1/data-report.json';await fs.writeFile(new URL(out,root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
