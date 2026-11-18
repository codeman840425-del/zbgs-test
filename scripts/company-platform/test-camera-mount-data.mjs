import fs from 'node:fs';
import {appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {deriveCompany,CompanyError} from '../../prototype/src/company/document.js';
const catalog=JSON.parse(fs.readFileSync('prototype/src/company/library-catalog.json','utf8'));
const templates=JSON.parse(fs.readFileSync('prototype/src/company/templates.json','utf8'));
const candidates=appearanceCandidates(catalog,'camera-mount');
const outcomes=[];
for(const [index,resource] of candidates.entries()){
  const sample=createAppearanceSample('camera-mount',index,catalog,templates);deriveCompany(sample.document,catalog,templates);
  outcomes.push({id:resource.id,mount:resource.mount,parent:resource.parent,status:'passed'});
}
const bad=createAppearanceSample('camera-mount',0,catalog,templates).document;
const mount=bad.nodes.find(node=>node.id==='sample/object');mount.parentId=bad.nodes.find(node=>node.kind==='room').id;
let code;try{deriveCompany(bad,catalog,templates);}catch(error){if(error instanceof CompanyError)code=error.code;else throw error;}
if(code!=='missing-mount-surface')throw Error(`Expected missing-mount-surface, received ${code}`);
outcomes.push({id:'invalid-parent',status:'passed',code});
console.log(JSON.stringify({status:'passed',groups:outcomes.length,outcomes},null,2));
