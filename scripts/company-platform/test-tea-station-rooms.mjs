import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import {fileURLToPath} from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkTeaStations,shouldCheckTeaStations} from './check-tea-station.mjs';
import {runCompanyBatch} from './batch.mjs';

const [directory,input=fileURLToPath(new URL('./batch-inputs/tea-station-rooms.json',import.meta.url)),...extra]=process.argv.slice(2);
if(!directory || extra.length) throw Error('Usage: node test-tea-station-rooms.mjs NEW_OUTPUT_DIRECTORY [BATCH_JSON]');
const out=path.resolve(directory),published=path.join(out,'published');
const read=name=>fs.readFile(name,'utf8');
const json=async name=>JSON.parse(await read(name));
const write=(name,data)=>fs.writeFile(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const options={catalog,templates};
const keys=['tea-rental','tea-floor'];
const files=['input.json','layout.json','save.json','report.json'];
const reference=(id,version=1)=>({id,version});
const referenceNode=(doc,id)=>doc.nodes.find(node=>node.id===id);
const roomRule=doc=>doc.teaStations[0];
const run=(batch,only,outputDirectory=published)=>runCompanyBatch(batch,{outputDirectory,only});
const source=await json(input);
assert.deepEqual(source.items.map(item=>item.key),keys);
const pick=key=>source.items.find(item=>item.key===key);
const installed=(doc,role)=>referenceNode(doc,roomRule(doc).roles[role]);
const edit=(doc,ops)=>prepareCompanyChange(doc,ops,options).document;
const operationsBatch=(key,document,operations=[])=>({schema:'company-batch',version:1,items:[{key,document,operations}]});
const add=(id,parentId,resource,position,yaw=0)=>({type:'add-facility',id,parentId,resource:reference(resource),transform:{position,yaw}});
const pins=async()=>Object.fromEntries(await Promise.all(keys.flatMap(key=>files.map(async file=>{
  const relative=key+'/'+file;
  return [relative,sha(await fs.readFile(path.join(published,relative)))];
}))));
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(out);
const first=await run(source);
await write('build-receipt.json',first);
assert(first.ok,JSON.stringify(first));
assert.deepEqual(first.results.map(row=>row.status),['created','created']);
const oldPins=await pins();
const documents=new Map();
const rooms=[];
for(const key of keys) {
  const folder=path.join(published,key), save=await read(path.join(folder,'save.json'));
  const doc=await decodeCompanySave(save,catalog,templates), [rule]=doc.teaStations;
  assert.deepEqual(doc,await json(path.join(folder,'layout.json')));
  assert.deepEqual(doc.teaStations,pick(key).teaStations);
  const derived=deriveCompany(doc,catalog,templates);
  assert(shouldCheckTeaStations(doc,{derived}));
  const [admitted]=await checkTeaStations(doc,{...options,derived});
  assert.deepEqual([admitted],(await json(path.join(folder,'report.json'))).checks.teaStations);
  assert.equal(admitted.regionId,rule.regionId);
  assert.equal(admitted.portalId,rule.portalId);
  assert.deepEqual(admitted.roles,rule.roles);
  assert.deepEqual(admitted.contacts.map(c=>c.surfaceId),['counter','tray']);
  assert.deepEqual(admitted.contacts.map(c=>c.parentId),[rule.roles.counter,rule.roles.machine]);
  assert.equal(admitted.serviceDoors.length,key==='tea-rental'?3:6);
  assert(admitted.serviceDoors.every(gate=>JSON.stringify(gate.inside.at(-1))===JSON.stringify(rule.service)));
  assert.deepEqual(admitted.occupiedCleaningPassage.map(r=>r.portalId),rule.passage?.portalIds??[]);
  assert.equal(installed(doc,'machine').state.on,false);
  const before=createCompanyScaleV2(pick(key).input,catalog,templates);
  const remaining=doc.nodes.filter(node=>!Object.values(rule.roles).includes(node.id));
  assert.deepEqual(remaining,before.nodes);
  assert(!shouldCheckTeaStations(before,options));
  assert.deepEqual(await checkTeaStations(before,options),[]);
  documents.set(key,doc);
  rooms.push({key,coldRead:true,saveSha256:sha(Buffer.from(save)),admitted});
}

const rental=documents.get('tea-rental'), floor=documents.get('tea-floor');
const rentalRule=roomRule(rental), floorRule=roomRule(floor);
const counterOn=Object.values(rentalRule.roles);
const moveCup={type:'attach-surface',id:rentalRule.roles.cup,parentId:rentalRule.roles.counter,surfaceId:'counter',
  transform:{position:[-.31,.90,.13],yaw:Math.PI/2}};
const switched={type:'set-state',id:rentalRule.roles.machine,state:{on:true}};
const movedOut=path.join(out,'counter-cup');
const movedResult=await run(operationsBatch('tea-rental',rental,[moveCup,switched]),'tea-rental',movedOut);
assert(movedResult.ok,JSON.stringify(movedResult));
const movedBytes=await read(path.join(movedOut,'tea-rental','save.json'));
const moved=await decodeCompanySave(movedBytes,catalog,templates);
assert.deepEqual(moved.teaStations,rental.teaStations);
assert.deepEqual(Object.values(roomRule(moved).roles),counterOn);
assert.equal(installed(moved,'cup').parentId,rentalRule.roles.counter);
assert.deepEqual(installed(moved,'cup').transform,moveCup.transform);
assert.equal(installed(moved,'machine').state.on,true);
const [movedCheck]=await checkTeaStations(moved,options);
assert.deepEqual(movedCheck.contacts.map(row=>row.surfaceId),['counter','counter']);
const returned=edit(moved,[{...moveCup,parentId:rentalRule.roles.machine,surfaceId:'tray',transform:undefined},
  {type:'set-state',id:rentalRule.roles.machine,state:{on:false}}]);
const returnedSave=await encodeCompanySave(returned,catalog,templates);
const coldReturn=await decodeCompanySave(returnedSave,catalog,templates);
assert.deepEqual({...coldReturn,revision:rental.revision},rental);
assert.deepEqual(await checkTeaStations(coldReturn,options),[rooms[0].admitted]);

const knownCounterLooks=['tea-counter-water','tea-counter-pantry','tea-counter-coffee','tea-counter-open'];
const looks=[];
for(const id of knownCounterLooks) {
  const changed=edit(rental,[{type:'replace-resource',id:rentalRule.roles.counter,resource:reference(id)}]);
  assert.deepEqual(changed.teaStations,rental.teaStations);
  assert.deepEqual(installed(changed,'counter').transform,installed(rental,'counter').transform);
  assert.deepEqual(installed(changed,'machine'),installed(rental,'machine'));
  assert.deepEqual(installed(changed,'cup'),installed(rental,'cup'));
  const [checked]=await checkTeaStations(changed,options);
  assert.deepEqual(checked.contacts.map(row=>row.surfaceId),['counter','tray']);
  looks.push({id,assetSha256:catalog.resources.find(r=>r.id===id&&r.version===1).asset.sha256});
}
assert.equal(new Set(looks.map(row=>row.assetSha256)).size,4);

const loose=edit(moved,[{type:'remove',id:rentalRule.roles.machine}]);
delete loose.teaStations;
assert(referenceNode(loose,rentalRule.roles.cup));
assert(!shouldCheckTeaStations(loose,options));
assert(!shouldCheckTeaStations(loose,{derived:deriveCompany(loose,catalog,templates)}));
assert.deepEqual(await checkTeaStations(loose,options),[]);
const legacyOut=path.join(out,'ordinary-loose-tea-items');
const looseResult=await run(operationsBatch('tea-rental',loose),'tea-rental',legacyOut);
assert(looseResult.ok,JSON.stringify(looseResult));
assert(!Object.hasOwn(await json(path.join(legacyOut,'tea-rental','layout.json')),'teaStations'));

const failures=[];
async function reject(name,key,doc,ops,code,errorPath) {
  const result=await run(operationsBatch(key,doc,ops),key);
  const [failed]=result.results;
  assert.equal(result.ok,false,name);
  assert.equal(failed.status,'failed',name);
  assert.equal(failed.code,code,name+' '+failed.message);
  if (errorPath) assert.equal(failed.path,errorPath,name);
  assert.deepEqual(await pins(),oldPins);
  assert.deepEqual((await fs.readdir(published)).sort(),[...keys].sort());
  failures.push({name,...failed,preservedFiles:Object.keys(oldPins).length});
}
const missing=structuredClone(rental);
delete missing.teaStations;
assert(shouldCheckTeaStations(missing,options));
await reject('complete-station-without-declaration','tea-rental',missing,[],'tea-station-binding-required',rentalRule.roles.counter);
const duplicate=structuredClone(rental);
duplicate.teaStations.push(structuredClone(rentalRule));
await reject('duplicate-station-members','tea-rental',duplicate,[],'tea-station-member',rentalRule.roles.counter);
const wrong=structuredClone(rental);
wrong.teaStations[0].roles.machine=rentalRule.regionId+'/plant';
await reject('wrong-registered-member','tea-rental',wrong,[],'tea-station-member',wrong.teaStations[0].roles.machine);
const corridorNoPass=structuredClone(floor);
delete corridorNoPass.teaStations[0].passage;
await reject('corridor-without-through-passage','tea-floor',corridorNoPass,[],'tea-station-passage-required',floorRule.regionId);
const wrongDoors=structuredClone(floor);
wrongDoors.teaStations[0].passage.portalIds[1]='tea-floor/ground/portal-room-4';
await reject('two-doors-are-not-opposite-ends','tea-floor',wrongDoors,[],'tea-station-passage-portals',floorRule.regionId);
const sideDoors=structuredClone(floor);
sideDoors.teaStations[0].passage.portalIds=['tea-floor/ground/portal-room-4','tea-floor/ground/portal-room-12'];
await reject('side-room-doors-do-not-form-public-through-passage','tea-floor',sideDoors,[],'tea-station-passage-portals',floorRule.regionId);
const invalidService=structuredClone(rental);
invalidService.teaStations[0].service=[-1.2,-.65];
await reject('unsafe-service-point','tea-rental',invalidService,[],'tea-station-service-point',rentalRule.roles.counter);

const wrongHost=rentalRule.regionId+'/unrelated-counter';
await reject('declared-cup-on-a-different-counter','tea-rental',moved,[
  add(wrongHost,rentalRule.regionId,'tea-counter-open',[1.45,0,1.30]),
  {...moveCup,parentId:wrongHost},
],'tea-station-mount',rentalRule.roles.cup);
const added=rentalRule.regionId+'/second-tea-station';
const addedRoles={counter:added,machine:added+'/machine',cup:added+'/cup'};
const attach=(id,parentId,resource,surfaceId)=>({type:'add-facility',id,parentId,resource:reference(resource),attachment:{surfaceId}});
const secondStation=[
  add(added,rentalRule.regionId,'tea-counter-pantry',[1.54,0,1.35],Math.PI),
  attach(addedRoles.machine,added,'tea-coffee-machine','counter'),
  attach(addedRoles.cup,addedRoles.machine,'tea-ceramic-cup','tray'),
];
const two=edit(rental,secondStation);
two.teaStations.push({...rentalRule,roles:addedRoles,service:[1.54,.57]});
const twoReports=await checkTeaStations(two,options);
assert.deepEqual(twoReports.map(row=>row.roles),[rentalRule.roles,addedRoles]);
assert(twoReports.every(row=>row.serviceDoors.length===3));
await reject('second-complete-station-omitted','tea-rental',rental,secondStation,'tea-station-binding-required',added);

const cleaning=rentalRule.regionId+'/cleaning-obstruction';
await reject('actual-cleaning-space-occupied','tea-rental',rental,[
  add(cleaning,rentalRule.regionId,'side-table-round',[-1.55,0,-.75]),
],'tea-station-clearance-obstructed',cleaning);
const passage=floorRule.regionId+'/passage-obstruction';
await reject('actual-through-passage-occupied','tea-floor',floor,[
  add(passage,floorRule.regionId,'side-table-round',[0,0,-.65]),
],'tea-station-clearance-obstructed',passage);
for(const [key,doc,transform,door] of [
  ['tea-rental',rental,{position:[1.72,0,0],yaw:Math.PI/2},'tea-rental/ground/portal-work-living'],
  ['tea-floor',floor,{position:[3,0,1.05],yaw:Math.PI},'tea-floor/ground/portal-room-13'],
]) await reject('counter-moved-to-existing-door',key,doc,[{type:'move',id:roomRule(doc).roles.counter,transform}],'blocked-portal',door);

const retry=await run(source);
assert(retry.ok);
assert.deepEqual(retry.results.map(row=>row.status),['idempotent','idempotent']);
assert.deepEqual(await pins(),oldPins);
const result={status:'passed',rooms,looks,failures,movedCup:{coldRead:true,id:rentalRule.roles.cup,
  movedSaveSha256:sha(Buffer.from(movedBytes)),contacts:movedCheck.contacts,returned:true},twoIndependentStations:twoReports,looseItemsAllowed:true,originalPins:oldPins};
await write('report.json',result);
console.log(JSON.stringify({status:result.status,rooms:keys,negatives:failures.length,report:path.join(out,'report.json')}));
