import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {overlapsObstacle} from '../../prototype/src/company/wardrobe-footprints.js';
import {deriveCompany,pointInTransform,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkInterviewRooms,validateInterviewRoom} from './check-interview-room.mjs';

const input=process.argv[2]??fileURLToPath(new URL('./batch-inputs/interview-rooms.json',import.meta.url));
const batch=JSON.parse(await fs.readFile(input,'utf8'));
const options={catalog,templates},cases=[],rooms=[];
let held;
const facility=(document,id)=>document.nodes.find(node=>node.id===id);
async function rejects(document,code,path,confirm){
  const old=JSON.stringify(document);
  await assert.rejects(checkInterviewRooms(document,options),error=>{
    assert.equal(error.code,code,error.message);
    if(path)assert.equal(error.path,path,error.message);
    confirm?.(error.details);
    cases.push({code,path:error.path});return true;
  });
  assert.equal(JSON.stringify(document),old);
}

for(const item of batch.items){
  const base=createCompanyScaleV2(item.input,catalog,templates);
  const {document}=prepareCompanyChange(base,item.operations,options);
  document.interviewRooms=structuredClone(item.interviewRooms);
  const [rule]=document.interviewRooms;
  const saved=await encodeCompanySave(document,catalog,templates);
  const restored=await decodeCompanySave(saved,catalog,templates);
  assert.deepEqual(restored,document);
  const [measured]=await checkInterviewRooms(restored,options);
  const report=await validateInterviewRoom({document,...options,...rule});
  assert.deepEqual(measured,report);
  assert(measured.seats.every(s=>s.micDistance<=.90&&s.towardPartnerDegrees<=45&&s.contact[1]>.40));
  assert.equal(new Set(measured.seats.map(s=>s.usePoint)).size,2);
  const rotated=structuredClone(document),turn={position:[2.5,0,-4],yaw:Math.PI/2};
  for(const region of rotated.nodes.filter(n=>n.parentId===measured.floorId)){
    region.transform.position=pointInTransform(turn,region.transform.position);
    region.transform.yaw+=turn.yaw;
  }
  const [rotatedCheck]=await checkInterviewRooms(rotated,options);
  const rounded=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v));
  assert.deepEqual(rounded(rotatedCheck),rounded(measured));
  rooms.push({key:item.key,reopened:true,rotated:true,fullReportEqualAtSixDecimalPlaces:true,measured});
  const {hostChair,guestChair,hostMic,guestMic}=rule.roles;
  const repeated=structuredClone(document);
  repeated.interviewRooms[0].roles.guestChair=hostChair;
  await rejects(repeated,'invalid-interview-roles',rule.regionId);
  const swapped=structuredClone(document);
  const h=facility(swapped,hostMic),g=facility(swapped,guestMic);
  [h.transform,g.transform]=[g.transform,h.transform];
  await rejects(swapped,'interview-mic-position',hostMic);
  const swappedSeats=structuredClone(document);
  const a=facility(swappedSeats,hostChair),b=facility(swappedSeats,guestChair);
  [a.transform,b.transform]=[b.transform,a.transform];
  await rejects(swappedSeats,'interview-route-seat',hostChair);
  const overlap=structuredClone(document),r=overlap.interviewRooms[0].routes;
  r.host[0]=[...r.guest[0]];
  const intro=r.host[1],old=rule.routes.host[0];
  const tangent=Math.abs(old[0]-intro[0])<1e-6?0:1;
  const bend=[...intro];bend[tangent]=r.guest[0][tangent];r.host.splice(1,0,bend);
  await rejects(overlap,'interview-routes-overlap',rule.regionId);
  const wrongPortal=structuredClone(document);wrongPortal.interviewRooms[0].portalId='foreign-opening';
  await rejects(wrongPortal,'interview-door-missing','foreign-opening');
  const other=restored.nodes.find(n=>n.kind==='room'&&n.id!==rule.regionId);
  if(other){
    const foreign=structuredClone(document);
    const borrowed={...structuredClone(facility(foreign,hostChair)),id:'elsewhere/guest-chair',parentId:other.id,
      transform:{position:[0,0,0],yaw:0}};
    foreign.nodes.push(borrowed);
    foreign.interviewRooms[0].roles.guestChair=borrowed.id;
    await rejects(foreign,'interview-wrong-member',borrowed.id,d=>assert.equal(d.actualRoomId,other.id));
  }
  if(item.key==='interview-studio')held=document;
}
assert(rooms.length>=2&&held);
const [studio]=held.interviewRooms;
// Bind a previously non-default real grille on the imported ribbon GLB. Only this in-memory catalog copy changes.
const hostMic=facility(held,studio.roles.hostMic),pickupResource=hostMic.resource.id;
function pickupOptions(pickupNode){
  return {...options,catalog:{...catalog,resources:catalog.resources.map(resource=>
    resource.id===pickupResource&&resource.version===hostMic.resource.version?{...resource,microphone:{pickupNode}}:resource)}};
}
const [explicit]=await checkInterviewRooms(held,pickupOptions('grille3'));
const measuredMic=explicit.seats.find(seat=>seat.mic===hostMic.id);
assert.equal(measuredMic.micMesh,'grille3');
assert.equal(rooms.find(r=>r.key==='interview-studio').measured.seats.find(s=>s.mic===hostMic.id).micMesh,'head');
const badPickupNames=['absent-capsule','',null,pickupResource]; // Last entry is the real GLB root group.
for(const name of badPickupNames){
  await assert.rejects(checkInterviewRooms(held,pickupOptions(name)),error=>{
    assert.equal(error.code,'invalid-interview-pickup-node');
    assert.equal(error.path,'resources.'+pickupResource+'.microphone.pickupNode');
    assert.equal(error.details.instanceId,hostMic.id);
    assert.equal(error.details.pickupNode,name);
    if(name===pickupResource)assert.equal(error.details.matches,1);
    return true;
  });
}
const pickup={resource:hostMic.resource,authoredMesh:measuredMic.micMesh,micHead:measuredMic.micHead,rejected:badPickupNames};

const missing=structuredClone(held);
missing.nodes=missing.nodes.filter(n=>n.id!==studio.roles.guestChair);
await rejects(missing,'interview-wrong-member',studio.roles.guestChair);
const back=structuredClone(held);facility(back,studio.roles.hostChair).transform.yaw+=Math.PI;
await rejects(back,'interview-facing',studio.roles.hostChair);
const withoutTable=structuredClone(held),tableId=rooms.find(r=>r.key==='interview-studio').measured.table.id;
withoutTable.nodes=withoutTable.nodes.filter(n=>n.id!==tableId&&n.parentId!==tableId);
assert.equal((await checkInterviewRooms(withoutTable,options))[0].table,null);

// At the outer turn, the half-open diagonal leaf's AABB clips the lane but its installed panel and footprint clear it.
const corner=structuredClone(held),cabinet='assets/diagonal-door';
corner.nodes.push({kind:'facility',id:cabinet,parentId:studio.regionId,resource:{id:'enclosed-wardrobe-glass',version:1},
  transform:{position:[2.38,0,1.18],yaw:Math.PI},state:{rightOpen:.5,leftOpen:0}});
const guestRoute=studio.routes.guest,from=guestRoute[2],to=guestRoute[3],padding=.25-.001;
const segment={min:[Math.min(from[0],to[0])-padding,Math.min(from[1],to[1])-padding],
  max:[Math.max(from[0],to[0])+padding,Math.max(from[1],to[1])+padding]};
const leaves=deriveCompany(corner,catalog,templates).obstacles.filter(o=>o.id===cabinet&&o.partId==='right');
assert(leaves.some(o=>overlapsObstacle({min:o.min,max:o.max},segment))&&leaves.every(o=>!overlapsObstacle(o,segment)));
assert((await checkInterviewRooms(corner,options))[0].ok);
facility(corner,cabinet).transform.position[2]-=.015;
await rejects(corner,'interview-clearance-obstructed',cabinet);

function panel(x,z,yaw){
  const doc=structuredClone(held);
  doc.nodes.push({kind:'facility',id:'props/opaque-screen',parentId:studio.regionId,resource:{id:'background-grid-panel',version:1},
    transform:{position:[x,0,z],yaw}});
  return doc;
}
await rejects(panel(1.94,-.95,Math.PI/2),'interview-clearance-obstructed','props/opaque-screen',d=>assert.equal(d.kind,'mesh-surface'));
await rejects(panel(0,.78,0),'interview-occluded','props/opaque-screen',d=>assert(d.target&&d.part));
const duplicate=structuredClone(held);duplicate.interviewRooms.push(duplicate.interviewRooms[0]);
await rejects(duplicate,'invalid-interview-rooms',studio.regionId);
await rejects({...held,interviewRooms:[]},'invalid-interview-rooms','document.interviewRooms');
console.log(JSON.stringify({status:'passed',rooms,pickup,optionalTable:true,diagonalDoor:{broadPhaseOverlap:true,accepted:true,closerByMetres:.015,rejected:true},rejections:cases},null,2));
