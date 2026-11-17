import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFloorMirrorSample} from '../../prototype/src/company/floor-mirror-samples.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {validateMirrorResource} from '../../prototype/src/company/mirror-data.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const out=process.argv[2],checks=[],mirrors=catalog.resources.filter(r=>r.mountRole==='floor-mirror');
const fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
let doc=createFloorMirrorSample(catalog,templates).document;
const apply=ops=>{const next=prepareCompanyChange(doc,ops,{catalog,templates}).document;inspectCompanyPlacement(next,catalog,templates);return next;};
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
try {
 await check('Four real floor mirrors share a fixed function and cannot substitute for wall installation',()=>{
  assert.equal(mirrors.length,4);assert.equal(new Set(mirrors.map(r=>r.asset.sha256)).size,4);
  for(const r of mirrors){validateMirrorResource(r,fail);assert(compareFacilityFunction(mirrors[0],r).compatible);}
  assert(!compareFacilityFunction(mirrors[0],catalog.resources.find(r=>r.mountRole==='mirror')).compatible);
  for(const mutate of [r=>r.mirrorSurface.position[1]=0,r=>delete r.footprint,r=>r.footprint.blocking=false,r=>r.footprint.halfSize[1]=.1,r=>delete r.mirrorNodes.post,r=>r.mounting.origin='center',r=>r.stateDefaults.open=true]){const r=structuredClone(mirrors[0]);mutate(r);assert.throws(()=>validateMirrorResource(r,fail),e=>e.code==='invalid-mirror-contract');}
 });
 await check('Two layouts retain real doorway connectivity and blocking mirror support',()=>{
  const result=[];
  for(const alternate of [false,true]){const sample=createFloorMirrorSample(catalog,templates,{alternate}).document,derived=deriveCompany(sample,catalog,templates),placement=inspectCompanyPlacement(sample,catalog,templates);assert(derived.obstacles.some(o=>o.id==='floor-mirror/primary'));assert.equal(placement.checkedPortals.length,2);result.push({alternate,portals:placement.checkedPortals.length});}return result;
 });
 await check('Four compatible replacements preserve final placement and exact save recovery',async()=>{
  const original=structuredClone(doc.nodes.find(n=>n.id==='floor-mirror/primary'));
  for(const r of mirrors){doc=apply([{type:'replace-resource',id:original.id,resource:{id:r.id,version:r.version}}]);const n=doc.nodes.find(n=>n.id===original.id);assert.deepEqual(n.transform,original.transform);assert.equal(n.parentId,original.parentId);assert.deepEqual(n.state,original.state);const saved=await encodeCompanySave(doc,catalog,templates);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),doc);}
 });
 await check('Quarter-turn movement rotates physical footprint and copies keep independent instance identities',()=>{
  doc=apply([{type:'move',id:'floor-mirror/primary',transform:{position:[1.2,0,-1.6],yaw:Math.PI/2}}]);
  const obstacle=deriveCompany(doc,catalog,templates).obstacles.find(o=>o.id==='floor-mirror/primary');assert(Math.abs(obstacle.max[0]-obstacle.min[0]-.6)<1e-8);assert(Math.abs(obstacle.max[1]-obstacle.min[1]-.8)<1e-8);
  const primary=doc.nodes.find(n=>n.id==='floor-mirror/primary');doc=apply([{type:'add-facility',id:'floor-mirror/copy',parentId:primary.parentId,resource:primary.resource,transform:{position:[2.3,0,-.5],yaw:0}}]);assert.equal(doc.nodes.filter(n=>n.resource?.id===primary.resource.id).length,2);return{obstacle,copy:'floor-mirror/copy'};
 });
 await check('Floating, free rotation, edge escape, overlap and a blocked real doorway reject without changing input',()=>{
  const before=JSON.stringify(doc),codes=[];
  for(const transform of [{position:[1.2,.1,-1.6],yaw:0},{position:[1.2,0,-1.6],yaw:.4},{position:[3.4,0,0],yaw:0},{position:[2.3,0,-.5],yaw:0},{position:[0,0,2.175],yaw:0}]){assert.throws(()=>apply([{type:'move',id:'floor-mirror/primary',transform}]),e=>{codes.push(e.code);return true;});assert.equal(JSON.stringify(doc),before);}
  assert(codes.includes('blocked-portal'));assert(codes.includes('overlapping-facilities'));return{codes};
 });
 await fs.mkdir(out);await fs.writeFile(`${out}/report.json`,JSON.stringify({status:'passed',checks,limits:['Data/static placement only; actual mesh, GPU reflection, character use and ordinary-PC behavior require separate evidence.']},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length}));
}catch(error){await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/failure.json`,JSON.stringify({status:'failed',checks,error:error.stack},null,2)+'\n');throw error;}
