import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import catalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompany,prepareCompanyChange,deriveCompany,restoreCompany} from '../../prototype/src/company/document.js';

const context={catalog,templates}, checks=[];
const original=prepareCompanyChange(createCompany({},catalog),[{type:'add-workstation',id:'station-original',parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[-1.5,0,0],yaw:0}}],context).document;
const originalBytes=JSON.stringify(original);
const find=(document,id)=>document.nodes.find(n=>n.id===id);
function check(name,fn){try{const details=fn();checks.push({name,passed:true,details});}catch(error){checks.push({name,passed:false,code:error.code,error:error.message});}}
function rejects(operations,code,options=context){
  assert.throws(()=>prepareCompanyChange(original,operations,options),error=>error.code===code);
  assert.equal(JSON.stringify(original),originalBytes);
  return {expectedError:code,inputUnchanged:true};
}

check('Original failure fixed: valid arbitrary stable part IDs copy with edits and parent identity preserved',()=>{
  const input=structuredClone(original);
  const remap=new Map(input.nodes.filter(n=>n.stationId==='station-original').map(n=>[n.id,`asset-${n.partKey}`]));
  for(const n of input.nodes){n.id=remap.get(n.id)||n.id;n.parentId=remap.get(n.parentId)||n.parentId;}
  find(input,'asset-monitor').state={on:false};
  find(input,'asset-keyboard').transform={position:[.15,.84,.19],yaw:Math.PI/2};
  restoreCompany(JSON.stringify(input),catalog,templates);
  const result=prepareCompanyChange(input,[{type:'copy-workstation',id:'station-original',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}],context);
  assert.equal(new Set(result.document.nodes.map(n=>n.id)).size,result.document.nodes.length);
  assert.equal(find(result.document,'station-copy/monitor').parentId,'station-copy/desk');
  assert.equal(find(result.document,'station-copy/monitor').stationId,'station-copy');
  assert.equal(find(result.document,'station-copy/monitor').state.on,false);
  assert.deepEqual(find(result.document,'station-copy/keyboard').transform,find(input,'asset-keyboard').transform);
  assert.deepEqual(result.derived.usePoints.map(point=>point.id),['asset-chair#seat','station-copy/chair#seat']);
  find(result.document,'station-copy/keyboard').transform.position[0]=.2;
  assert.equal(find(result.document,'asset-keyboard').transform.position[0],.15);
  return {newUsePoint:'station-copy/chair#seat',sourceUsePoint:'asset-chair#seat'};
});
check('Original failure fixed: required desk cannot become keyboard',()=>rejects([
  {type:'replace-resource',id:'station-original/desk',resource:{id:'keyboard',version:1}},
],'incompatible-replacement'));
check('Original failure fixed: restore rejects chair slot without its seat contract',()=>{
  const bad=structuredClone(original);find(bad,'station-original/chair').resource={id:'keyboard',version:1};
  assert.throws(()=>restoreCompany(JSON.stringify(bad),catalog,templates),error=>error.code==='incompatible-template-part');
  assert.equal(JSON.stringify(original),originalBytes);
  return {expectedError:'incompatible-template-part'};
});

function deskVariant(change){
  const candidate=structuredClone(catalog),desk=structuredClone(candidate.resources.find(resource=>resource.id==='desk'));
  desk.id='synthetic-desk-contract';desk.version=1;change(desk);candidate.resources.push(desk);
  return {catalog:candidate,templates};
}
const replaceDesk=[{type:'replace-resource',id:'station-original/desk',resource:{id:'synthetic-desk-contract',version:1}}];
check('Changed declared desk height rejects unadapted devices and keeps original',()=>rejects(replaceDesk,'invalid-surface-fit',deskVariant(desk=>{desk.surface.topY=1;})));
check('Narrower declared desk surface rejects microphone mount beyond its edge',()=>rejects(replaceDesk,'invalid-surface-fit',deskVariant(desk=>{desk.surface.halfSize=[.5,.3];})));
check('Desk with missing declared support rejects attached devices',()=>rejects(replaceDesk,'missing-mount-surface',deskVariant(desk=>{delete desk.surface;})));
check('Compatible declared desk contract replacement preserves edited local assembly',()=>{
  const input=structuredClone(original);find(input,'station-original/keyboard').transform.position[0]=.15;
  const options=deskVariant(()=>{}),result=prepareCompanyChange(input,replaceDesk,options);
  assert.equal(find(result.document,'station-original/desk').resource.id,'synthetic-desk-contract');
  assert.deepEqual(find(result.document,'station-original/keyboard').transform,find(input,'station-original/keyboard').transform);
  const before=deriveCompany(input,catalog,templates);
  assert.deepEqual(result.derived.worlds.get('station-original/monitor'),before.worlds.get('station-original/monitor'));
  return {scope:'Synthetic catalog metadata contract input only, with identical geometry and support dimensions.'};
});
check('Local monitor height change rejects floating installation',()=>rejects([
  {type:'move',id:'station-original/monitor',transform:{position:[0,.9,-.25],yaw:0}},
],'invalid-surface-fit'));
check('Local monitor origin outside support rejects in X and Z',()=>{
  for(const position of [[1.1,.84,0],[0,.84,.6]])rejects([{type:'move',id:'station-original/monitor',transform:{position,yaw:0}}],'invalid-surface-fit');
  return {testedAxes:['X','Z']};
});
check('Legal local monitor edit remains supported after parent desk quarter-turn',()=>{
  const result=prepareCompanyChange(original,[
    {type:'move',id:'station-original/desk',transform:{position:[0,0,-.9],yaw:Math.PI/2}},
    {type:'move',id:'station-original/monitor',transform:{position:[.1,.84,-.15],yaw:Math.PI/2}},
  ],context);
  const actual=result.derived.worlds.get('station-original/monitor');
  [-1.65,.84,-1].forEach((value,index)=>assert.ok(Math.abs(actual.position[index]-value)<1e-12));
  assert.deepEqual(find(result.document,'station-original/keyboard').transform,find(original,'station-original/keyboard').transform);
  assert.equal(JSON.stringify(original),originalBytes);
  return {world:actual};
});
const files=['prototype/src/company/document.js','prototype/src/company/facility-catalog.json','prototype/src/company/templates.json'];
const inputs=[];
for(const file of files)inputs.push({path:file,sha256:createHash('sha256').update(await fs.readFile(new URL(`../../${file}`,import.meta.url))).digest('hex')});
const report={status:checks.every(row=>row.passed)?'passed':'failed',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Targeted original-failure retest and parent surface attachment invariants',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},inputs,checks,
  scope:'Only three original failures and affected surface/assembly checks. Original initial-report.json retained.',
  limits:['CPU authoring data only. Synthetic catalog variants test declared surface compatibility and are not new produced art assets.','Mount checks establish declared installation origin height and XZ bounds. They do not establish full device geometry containment, physical support, actor reach or browser behavior.']};
await fs.writeFile(new URL('./recheck.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.status!=='passed')process.exitCode=1;
