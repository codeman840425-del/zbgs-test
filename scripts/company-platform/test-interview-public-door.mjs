import assert from 'node:assert/strict';
import inputs from './batch-inputs/interview-rooms.json' with {type:'json'};
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {pointInTransform,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {checkInterviewRooms} from './check-interview-room.mjs';

const options={catalog,templates}, tests=[];
const hotel=inputs.items.find(item=>item.key==='interview-hotel');
const build=item=> {
  const layout=prepareCompanyChange(createCompanyScaleV2(item.input,catalog,templates),item.operations,options).document;
  layout.interviewRooms=structuredClone(item.interviewRooms);
  return layout;
};
const original=build(hotel), rule=original.interviewRooms[0];
const floor=original.nodes.find(n=>n.kind==='floor');
const conn=floor.connections.find(c=>c.id===rule.portalId);
const peer=[conn.from,conn.to].find(side=>side.regionId!==rule.regionId);
const obstacle=peer.regionId+'/test-corridor-threshold';
function panelAt(layout,x,z){
  return prepareCompanyChange(layout,[{type:'add-facility',id:obstacle,parentId:peer.regionId,
    resource:{id:'background-grid-panel',version:1},transform:{position:[x,0,z],yaw:0}}],options).document;
}
async function access(layout){
  const [measured]=await checkInterviewRooms(layout,options);
  for(const lane of Object.values(measured.publicAccess)) {
    assert(lane.inside.length>=1);
    if(lane.fromRegion) assert(lane.approach.length>=2);
  }
  return measured.publicAccess;
}
async function refused(layout){
  const before=JSON.stringify(layout);
  await assert.rejects(access(layout),e=>{
    assert.equal(e.code,'room-door-unreachable');assert.equal(e.path,rule.portalId);
    assert(e.details.thresholdBlockers.includes(obstacle));
    assert.deepEqual(e.details.missing,['host','guest']);return true;
  });
  assert.equal(JSON.stringify(layout),before);
}
const clear=await access(original);
assert(Object.values(clear).every(lane=>lane.fromRegion===peer.regionId));
tests.push({name:'original-hotel',clear});
const closed=panelAt(original,-3,-1.3);
await refused(closed);
tests.push({name:'full-panel-outside-sole-door',blocked:obstacle});
const repaired=prepareCompanyChange(closed,[{type:'remove',id:obstacle}],options).document;
assert.deepEqual(repaired.nodes,original.nodes);
assert.deepEqual(await access(repaired),clear);
tests.push({name:'remove-panel-restores-original-paths'});

// The panel still crosses one half of the threshold, but the opposite half admits a full lane.
const partial=await access(panelAt(original,-1.75,-1.30));
assert(Object.values(partial).every(lane=>lane.threshold[0]<0));
tests.push({name:'partially-obstructed-door-left-lane',access:partial});
const detour=await access(panelAt(original,-3,-.60));
tests.push({name:'detour-around-panel-in-corridor',access:detour});

const rotated=structuredClone(closed), turn={position:[3.2,0,-2.1],yaw:Math.PI/2};
for(const n of rotated.nodes.filter(n=>n.parentId===floor.id)){
  n.transform.position=pointInTransform(turn,n.transform.position);n.transform.yaw+=turn.yaw;
}
await refused(rotated);
tests.push({name:'translated-rotated-floor-rejects-same-panel'});

// A second real connection to the same public corridor (different offset on this room's edge).
// Both apertures belong to actual matching walls; no new virtual region or door teleport.
const alternative=structuredClone(closed), af=alternative.nodes.find(n=>n.id===floor.id);
const extra=structuredClone(conn);extra.id=floor.id+'/alternate-interview-door';
extra.from.offset+=2;extra.to.offset+=2;af.connections.push(extra);
const bypass=await access(alternative);
assert(Object.values(bypass).every(lane=>lane.portalId===extra.id && lane.fromRegion===peer.regionId));
tests.push({name:'second-public-door-remains-reachable',access:bypass});
const studio=build(inputs.items.find(item=>item.key==='interview-studio'));
const exterior=await access(studio);
assert(Object.values(exterior).every(lane=>lane.fromRegion===null&&lane.approach.length===0));
tests.push({name:'north-exterior-without-invented-corridor',access:exterior});
console.log(JSON.stringify({ok:true,tests},null,2));
