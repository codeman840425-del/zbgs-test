import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {prepareCompanyChange} from '../../prototype/src/company/document.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';

const root=new URL('../../',import.meta.url);
const branches=['camera-device','background-display'];
const report={status:'passed',checks:[],limitations:['CPU document and placement checks only; browser rendering and C3 character activity are separate acceptance layers.']};
for(const branch of branches){
  const candidates=appearanceCandidates(catalog,branch);
  assert.equal(candidates.length,4,`${branch} must expose four looks`);
  assert.equal(new Set(candidates.map(r=>r.id)).size,4,`${branch} looks must have distinct ids`);
  const documents=[];
  for(const [index,resource] of candidates.entries()){
    const sample=createAppearanceSample(branch,index,catalog,templates);
    inspectCompanyPlacement(sample.document,catalog,templates);
    const target=sample.document.nodes.find(n=>n.id===sample.target);
    assert(target,`${branch} sample target missing`);
    assert.deepEqual(target.resource,{id:resource.id,version:resource.version});
    if(branch==='camera-device'){
      const desk=sample.document.nodes.find(n=>n.id.endsWith('/desk'));assert.equal(target.parentId,desk.id);assert.equal(target.transform.position[1],.84);
    } else {assert.equal(catalog.resources.find(r=>r.id===resource.id).mount,'floor-surface');assert.equal(target.transform.position[1],0);}
    documents.push(sample.document);
  }
  const base=documents[0];
  const targetId=base.nodes.find(n=>n.resource?.id===candidates[0].id).id;
  const replacement=prepareCompanyChange(base,[{type:'replace-resource',id:targetId,resource:{id:candidates[1].id,version:1}}],{catalog,templates}).document;
  assert.equal(replacement.nodes.find(n=>n.id===targetId).resource.id,candidates[1].id);assert.equal(replacement.nodes.find(n=>n.id===targetId).transform.position[1],base.nodes.find(n=>n.id===targetId).transform.position[1]);
  const text=await encodeCompanySave(replacement,catalog,templates);assert.deepEqual(await decodeCompanySave(text,catalog,templates),replacement);
  report.checks.push({branch,looks:candidates.map(r=>r.id),targetId,saveBytes:Buffer.byteLength(text)});
}
const out=process.argv[2]||'evidence/company-camera-background-v1/data-report.json';await fs.writeFile(new URL(out,root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
