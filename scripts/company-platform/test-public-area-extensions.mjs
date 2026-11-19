import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import oldPreviews from '../../prototype/src/company/examples/c2-scale-v2.json' with {type:'json'};
import {describeArchitecture} from '../../prototype/src/company/architecture.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {runCompanyBatch} from './batch.mjs';
import {checkManagedOutput} from './package-company.mjs';

const root=await fs.realpath(path.resolve(import.meta.dirname,'../..'));
const stage=path.join(root,'output/meeting-training-v1/area');
const [run='run-01',...extra]=process.argv.slice(2);
assert(!extra.length&&/^run-[0-9]+$/.test(run),'Use an optional fresh run-N name');
const out=path.join(stage,run);
await checkManagedOutput(out,root,{allowDelivery:false});
await fs.mkdir(stage,{recursive:true});
await fs.mkdir(out);
const emptyPath=target=>assert.rejects(fs.lstat(target),{code:'ENOENT'});
const read=file=>fs.readFile(file);
const data=async file=>JSON.parse(await read(file));
const json=value=>JSON.stringify(value,null,2)+'\n';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=(filename,value)=>fs.writeFile(path.join(out,filename),json(value),{flag:'wx'});
const full=doc=>createCompanyScaleV2(doc,catalog,templates);
const almost=(a,b)=>Math.abs(a-b)<1e-7;
const samePoint=(a,b)=>assert(a.every((value,i)=>almost(value,b[i])),JSON.stringify({a,b}));
const byId=(doc,id)=>doc.nodes.find(node=>node.id===id);
const selectFloor=(doc,id)=>doc.nodes.find(node=>node.id===id&&node.kind==='floor');
const roomCount=(doc,id)=>doc.nodes.filter(node=>node.kind==='room'&&node.parentId===id).length;
const areaName='meeting';

function input(key,depth,{building=false,offset=0,width=8,host='lobby',edge='west'}={}){
  const area={id:areaName,name:'公共会议培训区',role:'meeting-training',width,depth,connect:{areaId:host,edge,offset,width:1.4}};
  const floors=building?[{id:'ground'},{id:'upper',publicAreas:[area]}]:[{id:'ground',publicAreas:[area]}];
  return {id:key,scale:building?'building':'leased-floor',spaceProfile:{id:'company-space-v2',version:1},furnishingVersion:2,floors};
}
const leased=input('leased-meeting-area',6);
const building=input('building-meeting-area',8,{building:true});
const fixtureItems=[{key:'floor',input:leased},{key:'building',input:building}];
const batch={schema:'company-batch',version:1,items:fixtureItems};
await write('room-inputs.json',batch);
const published=path.join(out,'published');
const accepted=await runCompanyBatch(batch,{outputDirectory:published});
assert(accepted.ok,JSON.stringify(accepted.results));
assert(accepted.results.every(item=>item.status==='created'));

const checked=[];
for(const [index,{key,input:requested}] of fixtureItems.entries()){
  const installed=path.join(published,key);
  const save=await read(path.join(installed,'save.json'));
  const doc=await decodeCompanySave(save.toString('utf8'),catalog,templates);
  assert.deepEqual(doc,await data(path.join(installed,'layout.json')));
  const oldSpec=structuredClone(requested);
  for(const floorInput of oldSpec.floors)delete floorInput.publicAreas;
  const baseline=full(oldSpec);
  const floorId=doc.id+(index===0?'/ground':'/upper');
  const hostId=floorId+'/lobby';
  const areaId=floorId+'/'+areaName,portalId=floorId+'/portal-'+areaName;
  const newArea=byId(doc,areaId);
  const floor=selectFloor(doc,floorId);
  assert.deepEqual(newArea,{id:areaId,kind:'area',parentId:floorId,name:'公共会议培训区',bounds:{width:8,depth:index===0?6:8},
    transform:{position:[-34,0,0],yaw:0},publicRole:'meeting-training',entry:{position:[3.45,0,0]}});
  const floors=doc.nodes.filter(node=>node.kind==='floor');
  for(const floor of floors)assert.equal(roomCount(doc,floor.id),16);
  assert.equal(floor.connections.length,selectFloor(baseline,floorId).connections.length+1);
  assert.deepEqual(floor.connections.at(-1),{id:portalId,from:{regionId:hostId,edge:'west',offset:0,width:1.4},
    to:{regionId:areaId,edge:'east',offset:0,width:1.4}});
  const plant=hostId+'/plant';
  assert.deepEqual(byId(doc,plant).transform.position,[2.6,0,1]);
  const stripped=structuredClone(doc);
  assert.equal(stripped.trainingBinding.source.kind,'batch-input');
  delete stripped.trainingBinding;
  stripped.nodes=stripped.nodes.filter(node=>node.id!==areaId);
  selectFloor(stripped,floorId).connections.pop();
  byId(stripped,plant).transform=byId(baseline,plant).transform;
  assert.deepEqual(stripped,baseline,'Preserve earlier facilities, floor shapes, IDs and ordinary doors');

  const architecture=describeArchitecture(doc,catalog,templates);
  const topo=architecture.topology.floors.find(floor=>floor.floorId===floorId);
  const portal=topo.connections.find(connection=>connection.id===portalId);
  samePoint(portal.from.world.center,[-30,0,0]);
  samePoint(portal.from.world.start,portal.to.world.start);
  samePoint(portal.from.world.end,portal.to.world.end);
  assert.deepEqual(portal.from.world.normal,[-1,0,0]);
  assert.deepEqual(portal.to.world.normal,[1,0,0]);
  const walls=architecture.walls.filter(wall=>wall.floorId===floorId&&
    ((wall.regionId===hostId&&wall.edge==='west')||(wall.regionId===areaId&&wall.edge==='east')));
  const inCrossing=(wall,z)=>Math.abs(wall.center[2]-z)<wall.halfSize[1]&&
    wall.center[0]+wall.halfSize[0]>-30.35&&wall.center[0]-wall.halfSize[0]<-29.65;
  for(const z of [-.55,0,.55])assert(!walls.some(wall=>inCrossing(wall,z)),'Real wall segments must leave the aperture clear');
  for(const z of [-.8,.8])assert.equal(walls.filter(wall=>inCrossing(wall,z)).length,2,'Both common walls retain their jambs');
  const placement=inspectCompanyPlacement(doc,catalog,templates);
  const hostDoors=placement.checkedPortals.filter(item=>item.regionId===hostId&&item.connected);
  const peers=placement.checkedPortals.filter(item=>item.connectionId===portalId);
  assert.equal(hostDoors.length,4);
  assert.deepEqual(hostDoors.map(item=>item.connectionId).sort(),['portal-corridor-lobby','portal-lobby-lift','portal-lobby-stair',
    'portal-'+areaName].map(stem=>floorId+'/'+stem).sort());
  assert.equal(peers.length,2);
  assert(peers.every(side=>side.connected));
  samePoint(peers.find(side=>side.regionId===hostId).interior.world,[-29.65,0,0]);
  samePoint(peers.find(side=>side.regionId===areaId).interior.world,[-30.35,0,0]);
  checked.push({key,companyId:doc.id,floorId,areaId,portalId,roomCounts:floors.map(floor=>[floor.id,roomCount(doc,floor.id)]),
    area:newArea.bounds,entry:newArea.entry.position,wallPlanes: walls.map(({regionId,edge,center,halfSize})=>({regionId,edge,center,halfSize})),
    portalSides:peers,connectedLobbyDoors:hostDoors.map(item=>item.connectionId),plant:byId(doc,plant).transform.position,
    saveSha256:digest(save)});
}

const offsetInputs=[input('west-return-positive',6,{offset:.7}),input('west-return-negative',6,{offset:-.7}),
  input('north-lift-attachment',6,{host:'lift-access',edge:'north',width:6})];
const offsets=offsetInputs.map((spec,index)=>{
  const doc=full(spec), portal=doc.nodes[0].connections.at(-1);
  assert.equal(portal.to.edge,index===2?'south':'east');
  const area=byId(doc,doc.id+'/ground/meeting');
  samePoint(area.transform.position,index===2?[-27,0,-7.5]:[-34,0,index===0?.7:-.7]);
  if(index===2)assert.deepEqual(byId(doc,doc.id+'/ground/lobby/plant').transform.position,[-2,0,0]);
  return {spec,portal,area:area.transform};
});

const enclosing=(id,change,base=leased)=>{
  const received=structuredClone(base);
  received.id=id;
  change(received.floors.at(-1).publicAreas[0],received,received.floors.at(-1));
  return {key:id,input:received};
};
const wrongConfigurations=[
  [enclosing('invalid-scope',(_a,d)=>{d.scale='rental-home';}), 'invalid-public-area-placement'],
  [enclosing('invalid-size',a=>{a.depth=2.99;}), 'invalid-public-area-size'],
  [enclosing('unknown-purpose',a=>{a.role='training';}), 'unsupported-public-role'],
  [enclosing('business-host',a=>{a.connect.areaId='room-1';}), 'invalid-public-area-host'],
  [enclosing('foreign-host',a=>{a.connect.areaId='building-meeting-area/ground/lobby';},building), 'invalid-public-area-host'],
  [enclosing('wrong-wall-edge',a=>{a.connect.edge='northeast';}), 'invalid-public-area-door'],
  [enclosing('door-end-return',a=>{a.connect.offset=.71;}), 'public-area-door-endpoint'],
  [enclosing('overlap-business',a=>{a.connect.areaId='corridor-1';a.connect.edge='north';}), 'overlapping-regions'],
  [enclosing('overlap-public',a=>{a.connect.edge='north';}), 'overlapping-regions'],
  [enclosing('duplicate-area',a=>{a.id='lobby';}), 'duplicate-id'],
  [enclosing('existing-door',(_a,_d,floor)=>{floor.exteriorEntrances=[
    {id:'existing-exit',regionId:'lobby',edge:'west',offset:0,width:1.4,height:2.2}
  ];}), 'overlapping-exterior-entrance'],
  [enclosing('narrow-door',a=>{a.connect.width=.59;}), 'narrow-portal'],
];
const changedLayout=(key,change)=>{
  const doc=full({...leased,id:key});
  const floor=selectFloor(doc,doc.id+'/ground');
  change(doc,floor,floor.connections.at(-1));
  return {key,document:doc};
};
wrongConfigurations.push(
  [changedLayout('missing-meeting-link',(_doc,floor)=>floor.connections.pop()),'invalid-public-area-connection'],
  [changedLayout('wrong-meeting-link',(_doc,floor,c)=>{c.from.regionId=floor.id+'/room-1';}),'invalid-public-area-host'],
  [changedLayout('gap-in-meeting-link',(_doc,_floor,c)=>{c.to.offset=.12;}),'portal-geometry-mismatch'],
  [changedLayout('placement-witness',(doc,floor)=>{byId(doc,floor.id+'/lobby/plant').transform.position=[-2,0,0];}),'blocked-portal'],
);
const bad={...batch,items:wrongConfigurations.map(([row])=>row)};
await write('rejected-inputs.json',bad);
const invalidRoot=path.join(out,'refusals');
const refused=await runCompanyBatch(bad,{outputDirectory:invalidRoot});
assert.equal(refused.ok,false);
for(const [index,[{key},expected]] of wrongConfigurations.entries()){
  const result=refused.results[index];
  assert.equal(result.key,key);
  assert.equal(result.status,'failed',JSON.stringify(result));
  assert.equal(result.code,expected,JSON.stringify(result));
  assert(result.path&&result.message);
  await emptyPath(path.join(invalidRoot,key));
}
const plantRejection=refused.results.find(result=>result.key==='placement-witness');
assert.equal(plantRejection.path,'placement-witness/ground/portal-'+areaName);
assert.equal(plantRejection.details.obstacleId,'placement-witness/ground/lobby/plant');
const retry=await runCompanyBatch({...batch,items:[{key:'door-end-return',input:offsetInputs[0]}]},{outputDirectory:invalidRoot});
assert(retry.ok&&retry.results[0].status==='created');
const again=await runCompanyBatch(batch,{outputDirectory:published});
assert(again.ok&&again.results.every(item=>item.status==='idempotent'));
for(const item of checked)assert.equal(digest(await read(path.join(published,item.key,'save.json'))),item.saveSha256);

const oldInputs={smallHome:'small-home',studio:'studio',base:'single-room',alternate:'single-alternate',rental:'rental-home',
  flat:'leased-floor',twoFloors:'two-floors',building:'five-floors-16'};
const historical=[];
for(const [alias,file] of Object.entries(oldInputs)){
  const old=await data(path.join(import.meta.dirname,'space-v2-inputs',file+'.json'));
  const rebuilt=json(full(old)), signed=json(oldPreviews[alias]);
  assert.equal(digest(rebuilt),digest(signed),'The shipped '+alias+' preview input must reproduce exactly');
  historical.push({alias,sha256:digest(rebuilt)});
}
const report={status:'passed',checked,offsets,invalid:refused.results,retry:retry.results[0],historical,
  evidence:'Existing batch authoring, cold save decode, actual wall-run cuts, and both 0.35 m portal interiors use shared code.'};
await write('report.json',report);
console.log(JSON.stringify({status:report.status,out,roomWidths:checked.map(room=>room.area),rejected:refused.results.length,
  unchangedLegacyPreviews:historical.length}));
