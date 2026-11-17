import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createMirrorSample} from '../../prototype/src/company/mirror-samples.js';
import {prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {validateMirrorResource} from '../../prototype/src/company/mirror-data.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const out=process.argv[2],checks=[],mirrors=catalog.resources.filter(r=>r.mountRole==='mirror');
const fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
try {
 await check('Four real mirror resources share one function but distinct actual geometry and contours',()=>{
  assert.equal(mirrors.length,4);assert.equal(new Set(mirrors.map(r=>r.asset.sha256)).size,4);
  assert.equal(new Set(mirrors.map(r=>JSON.stringify(r.mirrorShape))).size,4);
  for(const r of mirrors){validateMirrorResource(r,fail);assert(compareFacilityFunction(mirrors[0],r).compatible);}
 });
 await check('Each appearance and the side-wall input validate and save with stable identity',async()=>{
  const placements=[];
  for(const alternate of [false,true]) {
   let doc=createMirrorSample(catalog,templates,{alternate}).document;
   inspectCompanyPlacement(doc,catalog,templates);
   const before=structuredClone(doc.nodes.find(n=>n.id==='mirror/primary'));
   for(const r of mirrors){
    doc=prepareCompanyChange(doc,[{type:'replace-resource',id:before.id,resource:{id:r.id,version:r.version}}],{catalog,templates}).document;
    const node=doc.nodes.find(n=>n.id===before.id);assert.deepEqual(node.transform,before.transform);assert.equal(node.parentId,before.parentId);assert.deepEqual(node.state,before.state);
    const saved=await encodeCompanySave(doc,catalog,templates);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),doc);
   }
   placements.push({alternate,transform:before.transform});
  }
  return placements;
 });
 await check('Changed mechanism, budget, plane, installation and invalid polygon contracts reject',()=>{
  const codes=[];
  for(const mutate of [r=>r.mirrorSurface.profile='unbounded',r=>r.mirrorSurface.position[2]=0,r=>r.mount='floor-surface',r=>r.mounting.width=1,r=>r.stateDefaults.on=true,r=>r.mirrorNodes.face='missing',r=>r.mirrorShape.polygons[0].reverse(),r=>r.mirrorShape.polygons[0][0][0]=NaN]){
   const r=structuredClone(mirrors[0]);mutate(r);assert.throws(()=>validateMirrorResource(r,fail),e=>{codes.push(e.code);return e.code.startsWith('invalid-mirror-');});
  }
  const staticResource=structuredClone(mirrors[0]);delete staticResource.mirrorSurface;delete staticResource.mirrorShape;delete staticResource.mirrorNodes;
  assert(!compareFacilityFunction(mirrors[0],staticResource).compatible);
  return {codes};
 });
 await fs.mkdir(out);await fs.writeFile(`${out}/report.json`,JSON.stringify({status:'passed',checks,limits:['Data only; geometry, GPU reflection, host recovery and role use require separate evidence.']},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length}));
}catch(error){await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/failure.json`,JSON.stringify({status:'failed',checks,error:error.stack},null,2)+'\n');throw error;}
