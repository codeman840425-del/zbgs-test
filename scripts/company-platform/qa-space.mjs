import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createScaledCompany,inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {deriveCompany} from '../../prototype/src/company/document.js';

const checks=[],examples=[],documents=new Map();
const out=new URL('../../evidence/company-space-v1/',import.meta.url);await fs.mkdir(out,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function check(name,fn){try{checks.push({name,passed:true,observed:fn()});}catch(error){checks.push({name,passed:false,code:error.code,error:error.stack});}}
const expected={
  'single-room':{floors:1,rooms:1,stations:2,areas:0},
  'rental-home':{floors:1,rooms:3,stations:2,areas:3},
  'leased-floor':{floors:1,rooms:10,stations:5,areas:5},
  'building-two-floors':{floors:2,rooms:4,stations:4,areas:4},
  building:{floors:5,rooms:15,stations:10,areas:15},
  maximum:{floors:5,rooms:50,stations:100,areas:25},
};
for(const [name,count]of Object.entries(expected)){
  const file=new URL(`./space-inputs/${name}.json`,import.meta.url),bytes=await fs.readFile(file),input=JSON.parse(bytes);
  const untouched=JSON.stringify(input),document=createScaledCompany(input,catalog,templates),derived=deriveCompany(document,catalog,templates),geometry=inspectCompanyConnections(document,catalog,templates);
  documents.set(name,{input,document,derived,geometry});
  check(`${name} explicit input derives expected actual fitout and scoped identities`,()=>{
    assert.equal(derived.capacity.floors,count.floors);assert.equal(derived.capacity.businessRooms,count.rooms);assert.equal(derived.capacity.installedStations,count.stations);
    assert.equal(document.nodes.filter(node=>node.kind==='area').length,count.areas);
    assert.equal(new Set(document.nodes.map(node=>node.id)).size,document.nodes.length);
    assert(document.nodes.every(node=>node.id.startsWith(`${document.id}/floor-`)));
    for(const floor of document.nodes.filter(node=>node.kind==='floor'))assert.equal(floor.transform.position[1],0);
    assert.equal(JSON.stringify(input),untouched);return{actual:derived.capacity,publicAreas:count.areas,connections:geometry.floors.reduce((sum,floor)=>sum+floor.connections.length,0)};
  });
  await fs.writeFile(new URL(`${name}.layout.json`,out),JSON.stringify(document,null,2)+'\n');
  await fs.writeFile(new URL(`${name}.portals.json`,out),JSON.stringify(geometry,null,2)+'\n');
  examples.push({name,inputSha256:digest(bytes),documentSha256:digest(JSON.stringify(document)),actual:derived.capacity});
}
check('Two actual floor layouts change station2 pose while retaining shared resources',()=>{
  const {document}=documents.get('building-two-floors');
  const first=document.nodes.find(node=>node.id==='two-floor-demo/floor-1/room-1/station-2');
  const second=document.nodes.find(node=>node.id==='two-floor-demo/floor-2/room-1/station-2');
  assert.deepEqual(first.transform,{position:[1.5,0,0],yaw:0});assert.deepEqual(second.transform,{position:[1.6,0,-.3],yaw:Math.PI/2});
  const resources=id=>document.nodes.filter(node=>node.stationId===id).map(node=>node.resource);
  assert.deepEqual(resources(first.id),resources(second.id));return{parallel:first.transform,turned:second.transform};
});
check('Ten-room floor has exact 3m corridor and 1.4m paired room portals',()=>{
  const {document,geometry}=documents.get('leased-floor');const floor=geometry.floors[0];
  assert.equal(floor.regionIds.length,15);assert.equal(floor.connections.length,14);
  for(const connection of floor.connections){assert.equal(connection.from.width,1.4);assert.equal(connection.to.width,1.4);assert(Math.abs(connection.from.world.center[0]-connection.to.world.center[0])<1e-10);assert(Math.abs(connection.from.world.center[2]-connection.to.world.center[2])<1e-10);}
  const first=floor.connections.find(connection=>connection.id.endsWith('/portal-room-1'));
  assert.deepEqual(first.from.world.center,[-18.4,0,-1.5]);assert.deepEqual(first.to.world.center,[-18.4,0,-1.5]);
  assert.deepEqual(first.from.local.interior,[0,0,3.15]);assert.deepEqual(first.to.local.interior,[0,0,-1.15]);
  const south=floor.connections.find(connection=>connection.id.endsWith('/portal-room-6'));assert.equal(south.from.edge,'north');assert.equal(south.from.world.center[2],1.5);
  const cells=document.nodes.filter(node=>node.kind==='area');assert(cells.every(cell=>cell.bounds.width===9.2&&cell.bounds.depth===3));return{regions:15,connections:14,north:first.from.world.center,south:south.from.world.center};
});
check('Room purposes control actual resources instead of only labels',()=>{
  const {document,derived}=documents.get('rental-home');
  assert.equal(derived.facilities.filter(f=>f.resource.id==='lounge-sofa').length,1);
  assert.equal(derived.nodes.get('rental-demo/floor-1/room-2/desk').resource.id,'desk');
  assert.equal(derived.nodes.get('rental-demo/floor-1/room-2/chair').resource.id,'chair');
  assert.equal(document.nodes.filter(node=>node.kind==='workstation').length,2);
  const input={id:'empty-fitout',scale:'single-room',floors:[{rooms:[{purpose:'streaming'}]}]};
  assert.equal(deriveCompany(createScaledCompany(input,catalog,templates),catalog,templates).capacity.installedStations,0);return{streamingStations:2,independentWorkFurniture:2,restSofas:1,missingStationsDefaultsTo:0};
});
check('Portal world intervals and interior samples rotate with the floor frame',()=>{
  const document=structuredClone(documents.get('leased-floor').document),floor=document.nodes.find(node=>node.kind==='floor');
  floor.transform={position:[12,0,-8],yaw:Math.PI/2};
  const inspected=inspectCompanyConnections(document,catalog,templates),portal=inspected.floors[0].connections.find(connection=>connection.id.endsWith('/portal-room-1'));
  [10.5,0,10.4].forEach((value,index)=>assert(Math.abs(portal.from.world.center[index]-value)<1e-10));
  [1,0,0].forEach((value,index)=>assert(Math.abs(portal.from.world.normal[index]-value)<1e-10));
  assert.deepEqual(portal.from.local.interior,[0,0,3.15]);
  return{floorTransform:floor.transform,worldCenter:portal.from.world.center,normal:portal.from.world.normal};
});
function rejectsInput(name,edit,code,source='building-two-floors'){
  check(name,()=>{const input=structuredClone(documents.get(source).input);edit(input);const bytes=JSON.stringify(input);assert.throws(()=>createScaledCompany(input,catalog,templates),error=>error.code===code);assert.equal(JSON.stringify(input),bytes);return{code,inputUnchanged:true};});
}
rejectsInput('Reject six viewing floors',input=>input.floors=Array.from({length:6},()=>structuredClone(input.floors[0])),'space-floor-capacity');
rejectsInput('Reject eleven rooms on one floor',input=>input.floors[0].rooms=Array.from({length:11},()=>({purpose:'streaming'})),'floor-room-capacity');
rejectsInput('Reject third station in a room',input=>input.floors[0].rooms[0].stations=3,'room-capacity');
rejectsInput('Reject streaming stations in rest room',input=>input.floors[0].rooms[0].purpose='rest','room-capacity');
rejectsInput('Reject unrecognized floor layout',input=>input.floorLayouts=['renamed-only'],'unsupported-floor-layout');
rejectsInput('Reject rental business room number above three',input=>input.floors[0].rooms.push({purpose:'work'}),'space-room-capacity','rental-home');
function rejectsDocument(name,edit,code,source='leased-floor'){
  check(name,()=>{const document=structuredClone(documents.get(source).document);edit(document);const before=JSON.stringify(document);assert.throws(()=>inspectCompanyConnections(document,catalog,templates),error=>error.code===code);assert.equal(JSON.stringify(document),before);return{code,inputUnchanged:true};});
}
const getFloor=document=>document.nodes.find(node=>node.kind==='floor');
rejectsDocument('Reject offset portals which only look close',document=>getFloor(document).connections[0].to.offset=.1,'portal-geometry-mismatch');
rejectsDocument('Reject nonadjacent room boundary crossing',document=>{const c=getFloor(document).connections.find(connection=>connection.id.endsWith('/portal-room-1'));c.to.regionId=c.from.regionId.replace('room-1','room-2');c.from.edge='east';c.to.edge='west';},'portal-geometry-mismatch');
rejectsDocument('Reject corridor cell left disconnected',document=>getFloor(document).connections.splice(0,1),'disconnected-regions');
rejectsDocument('Reject an unconnected business room',document=>getFloor(document).connections.pop(),'disconnected-regions');
rejectsDocument('Reject overlapping region interiors',document=>document.nodes.find(node=>node.id.endsWith('/corridor-1')).transform.position[2]=-1,'overlapping-regions');
rejectsDocument('Reject repeated portal interval with a distinct ID',document=>{const floor=getFloor(document);floor.connections.push({...structuredClone(floor.connections[0]),id:`${floor.id}/repeated-interval`});},'overlapping-portals');
rejectsDocument('Reject duplicate connection identity',document=>getFloor(document).connections.push(structuredClone(getFloor(document).connections[0])),'duplicate-connection-id');
rejectsDocument('Reject cross-floor target even when layers overlap visually',document=>{const floors=document.nodes.filter(node=>node.kind==='floor');floors[0].connections[0].to.regionId=`${floors[1].id}/corridor-1`;},'cross-floor-connection','building-two-floors');
rejectsDocument('Reject illegal room hierarchy',document=>{document.nodes.find(node=>node.kind==='room').parentId=document.id;},'invalid-parent');
rejectsDocument('Reject eleven business rooms on a floor within the building total limit',document=>{
  const floor=getFloor(document),source=document.nodes.find(node=>node.kind==='room');
  for(let index=0;index<9;index++)document.nodes.push({...structuredClone(source),id:`${floor.id}/overflow-${index}`,transform:{position:[100+index*10,0,0],yaw:0}});
},'floor-room-capacity','building-two-floors');
rejectsDocument('Reject duplicate room IDs despite repeated display names being valid',document=>{const rooms=document.nodes.filter(node=>node.kind==='room');rooms[1].id=rooms[0].id;},'duplicate-instance');
rejectsDocument('Reject 101 installed stations at the shared document capacity gate',document=>{
  const source=document.nodes.find(node=>node.kind==='workstation');const subtree=document.nodes.filter(node=>node.id===source.id||node.stationId===source.id);const nextId=`source-extra`;
  for(const original of subtree){const node=structuredClone(original);node.id=node.id.replace(source.id,nextId);node.parentId=node.parentId.replace(source.id,nextId);if(node.stationId)node.stationId=nextId;document.nodes.push(node);}
},'scale-capacity','maximum');
const inputs=[];
for(const file of ['prototype/src/company/space.js','prototype/src/company/document.js','prototype/src/company/library-catalog.json','prototype/src/company/templates.json'])inputs.push({path:file,sha256:digest(await fs.readFile(new URL(`../../${file}`,import.meta.url)))});
const report={status:checks.every(row=>row.passed)?'passed':'failed',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Four-tier common hierarchy and exact same-floor portal geometry',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},inputs,examples,checks,
  limits:['CPU document and portal geometry only. No renderer, GPU, browser or character navigation.', 'Y=0 viewing layers do not provide vertical movement. Public corridor cells do not consume business-room capacity.','Portal interior samples await integration with static placement paths; coincident edges alone do not prove reachability.']};
await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,failures:checks.filter(row=>!row.passed)},null,2));if(report.status!=='passed')process.exitCode=1;
