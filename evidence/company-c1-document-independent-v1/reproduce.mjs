import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import catalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompany,prepareCompanyChange,deriveCompany,restoreCompany,serializeCompany} from '../../prototype/src/company/document.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=path.dirname(fileURLToPath(import.meta.url));
const context={catalog,templates};
const rows=[];
const original=prepareCompanyChange(createCompany({},catalog),[{type:'add-workstation',id:'station-original',parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[-1.5,0,0],yaw:0}}],context).document;
const originalBytes=JSON.stringify(original);
const change=operations=>prepareCompanyChange(original,operations,context);
const busyContext={...context,isUsePointBusy:id=>id==='station-original/chair#seat'};
function examine(name,fn){try{rows.push({name,...fn()});}catch(error){rows.push({name,status:'unexpected-error',code:error.code,message:error.message});}}
function node(document,id){return document.nodes.find(n=>n.id===id);}
function rejected(operations,code,options=busyContext){
  assert.throws(()=>prepareCompanyChange(original,operations,options),error=>error.code===code);
  assert.equal(JSON.stringify(original),originalBytes);
  return {status:'passed',expectedError:code,inputUnchanged:true};
}

examine('Parent rotation and local desk edit preserve independent siblings',()=>{
  const rotated=change([{type:'move',id:'station-original',transform:{position:[-1.5,0,0],yaw:Math.PI/2}}]);
  const monitor=rotated.derived.worlds.get('station-original/monitor');
  assert.ok(Math.abs(monitor.position[0]-(-2.65))<1e-12);
  assert.ok(Math.abs(monitor.position[2])<1e-12);
  const local=prepareCompanyChange(rotated.document,[{type:'move',id:'station-original/desk',transform:{position:[0,0,-1.1],yaw:Math.PI/2}}],context);
  const expectedMonitor=[-2.6,.84,.25];
  local.derived.worlds.get('station-original/monitor').position.forEach((value,index)=>assert.ok(Math.abs(value-expectedMonitor[index])<1e-12));
  assert.deepEqual(local.derived.worlds.get('station-original/chair'),rotated.derived.worlds.get('station-original/chair'));
  assert.equal(JSON.stringify(original),originalBytes);
  return {status:'passed',monitorWorld:local.derived.worlds.get('station-original/monitor')};
});
for(const [name,operations] of [
  ['Busy direct chair move',[{type:'move',id:'station-original/chair',transform:{position:[0,0,.8],yaw:Math.PI}}]],
  ['Busy room ancestor move',[{type:'move',id:'company-demo/room-1',transform:{position:[0,0,1],yaw:0}}]],
  ['Busy remove then recreate same station',[{type:'remove',id:'station-original'},{type:'add-workstation',id:'station-original',parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[1.5,0,0],yaw:0}}]],
  ['Busy no-op replacement still rejects',[{type:'replace-resource',id:'station-original/chair',resource:{id:'chair',version:1}}]],
  ['Busy move then inverse move cannot erase affected set',[{type:'move',id:'station-original',transform:{position:[-1.5,0,.1],yaw:0}},{type:'move',id:'station-original',transform:node(original,'station-original').transform}]],
])examine(name,()=>rejected(operations,'facility-busy'));

examine('Copy retains actual local edits and mutable state with independent new identities',()=>{
  const edited=change([{type:'move',id:'station-original/keyboard',transform:{position:[.15,.84,.19],yaw:Math.PI/2}},{type:'set-state',id:'station-original/monitor',state:{on:false}}]);
  const copied=prepareCompanyChange(edited.document,[{type:'copy-workstation',id:'station-original',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}],context);
  assert.deepEqual(node(copied.document,'station-copy/keyboard').transform,node(edited.document,'station-original/keyboard').transform);
  assert.equal(node(copied.document,'station-copy/monitor').state.on,false);
  assert.equal(new Set(copied.document.nodes.map(n=>n.id)).size,copied.document.nodes.length);
  node(copied.document,'station-copy/keyboard').transform.position[0]=.27;
  assert.equal(node(copied.document,'station-original/keyboard').transform.position[0],.15);
  assert.equal(node(edited.document,'station-original/keyboard').transform.position[0],.15);
  return {status:'passed',instanceCount:copied.document.nodes.length};
});

examine('Restored valid stable IDs need not have a station prefix but copy assumes one',()=>{
  const arbitrary=structuredClone(original);
  const remap=new Map(arbitrary.nodes.filter(n=>n.stationId==='station-original').map(n=>[n.id,`asset-${n.partKey}`]));
  for(const n of arbitrary.nodes){n.id=remap.get(n.id)||n.id;n.parentId=remap.get(n.parentId)||n.parentId;}
  restoreCompany(JSON.stringify(arbitrary),catalog,templates);
  let result;
  try{result=prepareCompanyChange(arbitrary,[{type:'copy-workstation',id:'station-original',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}],context);}catch(error){
    return {status:'defect-reproduced',code:error.code,message:error.message,validInputAcceptedByRestore:true,expected:'Copy a valid document with unique IDs based on the actual graph rather than slicing an undeclared ID prefix'};
  }
  return {status:'fixed-or-not-reproduced',nodes:result.document.nodes.length};
});

examine('Replacing required supporting desk with keyboard retains floating children',()=>{
  const result=change([{type:'replace-resource',id:'station-original/desk',resource:{id:'keyboard',version:1}}]);
  const support=result.derived.facilities.find(f=>f.id==='station-original/desk');
  assert.equal(support.resource.id,'keyboard');
  assert.equal(node(result.document,'station-original/monitor').parentId,'station-original/desk');
  return {status:'defect-reproduced',replacementAccepted:true,supportResource:support.resource.id,
    monitorWorld:result.derived.worlds.get('station-original/monitor'),keyboardResourceOrigin:support.resource.coordinates.origin,
    expected:'Reject replacement that removes the declared desktop support needed by attached devices'};
});

examine('Restore accepts a template chair part pointing at a keyboard resource',()=>{
  const bad=structuredClone(original);
  node(bad,'station-original/chair').resource={id:'keyboard',version:1};
  const restored=restoreCompany(JSON.stringify(bad),catalog,templates);
  const derived=deriveCompany(restored,catalog,templates);
  return {status:'defect-reproduced',accepted:true,usePointCount:derived.usePoints.length,
    expected:'Restore must enforce template part compatibility as well as member identity and attachment'};
});

examine('Required part membership cannot migrate to another existing station',()=>{
  const two=change([{type:'copy-workstation',id:'station-original',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}]).document;
  node(two,'station-original/monitor').stationId='station-copy';
  assert.throws(()=>restoreCompany(JSON.stringify(two),catalog,templates),error=>['missing-template-part','duplicate-template-part'].includes(error.code));
  return {status:'passed'};
});

examine('Failed later operation preserves original and no prefix of the transaction commits',()=>rejected([
  {type:'set-state',id:'station-original/monitor',state:{on:false}},
  {type:'move',id:'station-original',transform:{position:[30,0,0],yaw:0}},
],'outside-room',context));

examine('Serialization restores independent authoring data without using an occupancy callback',()=>{
  const bytes=serializeCompany(original,catalog,templates);
  const restored=restoreCompany(bytes,catalog,templates);
  assert.deepEqual(restored,original);
  assert.equal(Object.hasOwn(restored,'leases'),false);
  assert.equal(Object.hasOwn(restored,'occupancy'),false);
  restored.nodes[0].name='restored';assert.notEqual(original.nodes[0].name,'restored');
  return {status:'passed',scope:'Only document data is restored. No runtime seat reservation API exists in this module.'};
});

examine('CLI existing-output collision keeps source and output bytes',()=>{
  const source=path.join(directory,'cli-source.json'),operations=path.join(directory,'cli-operations.json'),output=path.join(directory,'cli-existing.json');
  return {status:'pending-cli',source,operations,output};
});
const cliRow=rows.find(r=>r.status==='pending-cli');
if(cliRow){
  await fs.writeFile(cliRow.source,serializeCompany(original,catalog,templates));
  await fs.writeFile(cliRow.operations,JSON.stringify([{type:'set-state',id:'station-original/monitor',state:{on:false}}]));
  await fs.writeFile(cliRow.output,'existing-output-sentinel\n');
  const before=await fs.readFile(cliRow.source,'utf8');
  const result=spawnSync(process.execPath,['scripts/company-platform/company.mjs','apply',cliRow.source,cliRow.operations,cliRow.output],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.equal(await fs.readFile(cliRow.output,'utf8'),'existing-output-sentinel\n');
  assert.equal(await fs.readFile(cliRow.source,'utf8'),before);
  Object.assign(cliRow,{status:'passed',exitCode:result.status,stderr:result.stderr.trim()});
}
const files=['prototype/src/company/document.js','prototype/src/company/facility-catalog.json','prototype/src/company/templates.json','scripts/company-platform/company.mjs'];
const inputs=[];
for(const file of files)inputs.push({path:file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')});
const report={scope:'Independent CPU data-only review',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Identity, parent frames, compound busy transactions and atomic recovery invariants',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},inputs,rows,
  limits:['No browser, GPU, real character, navigation or physical placement claim. C2 common navigation/room placement remains outside this data-only review.','No runtime occupancy is restored by document.js. Full application state restoration requires scene/actor integration checks.']};
await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(rows.map(({name,status,code})=>({name,status,code})),null,2));
