import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with { type:'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type:'json' };
import { prepareCompanyChange } from '../../prototype/src/company/document.js';
import { decodeCompanySave } from '../../prototype/src/company/persistence.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';
import { inspectCompanyConnections } from '../../prototype/src/company/space.js';
import { checkRoomDoorAccess } from '../../prototype/src/company/public-door-access.js';
import { vertices, rayHit } from '../../prototype/src/company/room-mesh-geometry.js';
import { checkManagedOutput, findManagedProject } from './package-company.mjs';
import { checkStudioLoungeDesk, measureRestingBase, withStudioFloor } from './check-studio-lounge-set.mjs';

const [batchArg, outArg, ...extra] = process.argv.slice(2);
assert(batchArg && !extra.length, 'node test-studio-lounge-set.mjs BATCH_DIR [MANAGED_EVIDENCE_DIR]');
const batch = path.resolve(batchArg);
const source = path.resolve(import.meta.dirname, '../..');
const owner = await findManagedProject(source) ?? source;
const out = path.resolve(outArg ?? path.join(owner, 'output/concept-studio-lounge-v1/inspection'));
const reportPath = path.join(out,'report.json');
await checkManagedOutput(reportPath,source,{allowDelivery:false});
const relativeToBatch = path.relative(await fs.realpath(batch),reportPath);
assert(path.isAbsolute(relativeToBatch) || relativeToBatch.startsWith('..'+path.sep),
  'Inspection evidence must be outside the batch input directory.');
const inputs = new Set(await fs.readdir(batch));
const options = {catalog, templates};
const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const xyz = p => p.toArray().map(n => Number(n.toFixed(6)));
const part = r => r.object.userData.name || r.object.name;
const sha = b => createHash('sha256').update(b).digest('hex');
const cases = [
  {keys:['rental-lounge','rental-lounge-set'],live:'/ground/live',waiting:'/ground/lounge'},
  {keys:['cool-studios','company-alpha-set'],live:'/floor-alpha/alpha-stream',waiting:'/floor-alpha/alpha-rest'},
];

function wallAndLoads(context,roomId) {
  const {scene,records,owned,matrix,facility,derived} = context;
  const id = roomId+'/wall-shelf';
  assert.equal(derived.nodes.get(id)?.parentId,roomId);
  const rack = facility(id).resource;
  assert.equal(rack.mount,'wall');
  const structural = records.filter(r => scene.walls.includes(r.object) && r.object.userData.roomId === roomId);
  const m = matrix(id), inv = m.clone().invert(), front = v(0,0,1).transformDirection(m);
  const support = [];
  for (const r of owned(id)) {
    const back = vertices(r).map(p=>p.clone().applyMatrix4(inv)).filter(p=>Math.abs(p.z)<.001);
    if (back.length < 3) continue;
    const box = new T.Box3().setFromPoints(back);
    if (box.max.x-box.min.x < .001 || box.max.y-box.min.y < .001) continue;
    // Select points from the real rear bearing face, including both horizontal extremes.
    for (const p of [back.reduce((a,b)=>a.x<b.x?a:b),back.reduce((a,b)=>a.x>b.x?a:b)]) {
      const wallPoint=p.clone().applyMatrix4(m);
      const hit=rayHit(structural,wallPoint.clone().addScaledVector(front,.025),wallPoint.clone().addScaledVector(front,-.025));
      assert(hit && hit.normal.dot(front)>.999 && hit.point.distanceTo(wallPoint)<.001, id+' missing wall backing '+part(r));
      support.push({part:part(r),wall:hit.record.id,point:xyz(hit.point),gapM:hit.point.distanceTo(wallPoint)});
    }
  }
  assert(support.length>=2,'Expected a real wall-bearing shelf component.');
  const loads = [['cup','side-table-life-cup','lower'],['notebook','side-table-life-pen-notebook','middle']].map(([suffix,resourceId,level])=>{
    const childId=id+'/'+suffix,node=derived.nodes.get(childId);
    assert.equal(node?.parentId,id);
    assert.equal(node.resource.id,resourceId);
    assert.equal(node.attachment?.surfaceId,level);
    const board=rack.supportNodes[level];
    assert(board);
    return {id:childId,resource:node.resource,level,board,bearing:measureRestingBase(context,childId,id,board)};
  });
  assert.notEqual(loads[0].board,loads[1].board);
  assert(loads[0].bearing[0].point[1] < loads[1].bearing[0].point[1]);
  return {id,resource:derived.nodes.get(id).resource,support,loads};
}

function waitingRoom(doc,context,roomId,placement) {
  const {scene,derived,facility,owned,matrix} = context;
  const room=derived.nodes.get(roomId),sofaId=roomId+'/sofa',tableId=roomId+'/cup-table',cupId=roomId+'/cup';
  assert.equal(room.purpose,'rest');
  assert.equal(derived.nodes.get(sofaId)?.parentId,roomId);
  assert.equal(facility(sofaId).resource.mountRole,'sofa');
  assert.equal(derived.nodes.get(tableId)?.parentId,roomId);
  assert.equal(derived.nodes.get(cupId)?.parentId,tableId);
  assert.equal(derived.nodes.get(cupId).resource.id,'side-table-life-cup');
  const level=derived.nodes.get(cupId).attachment.surfaceId;
  const bearing=measureRestingBase(context,cupId,tableId,facility(tableId).resource.supportNodes[level]);
  const seats=derived.usePoints.filter(p=>p.facilityId===sofaId);
  assert.equal(seats.length,2);
  const targets={};
  const measures=seats.map(p=>{
    assert.equal(p.capacity,1);
    const row=placement.checkedPoints.find(e=>e.id===p.id && e.roomId===roomId);
    assert(row.approachConnected && row.exitConnected);
    const crown=v(...p.position).add(v(0,p.seatHeight,0)).applyMatrix4(matrix(sofaId));
    const hit=rayHit(owned(sofaId),crown.clone().add(v(0,.05,0)),crown.clone().sub(v(0,.05,0)));
    assert.equal(hit && part(hit.record),p.seatNodeId);
    const back = owned(sofaId).find(r=>part(r)===p.backNodeId);
    assert(back && vertices(back).length);
    for (const field of ['approach','exit']) {
      const [x,,z]=row[field].local;
      targets[p.id+' '+field]=[x,z];
    }
    return {id:p.id,cushion:part(hit.record),back:part(back),crown:xyz(hit.point),approach:row.approach,exit:row.exit};
  });
  assert.notDeepEqual(measures[0].approach.world,measures[1].approach.world);
  assert.notEqual(measures[0].cushion,measures[1].cushion);
  const floorId=derived.floorIds.get(roomId);
  const floor=inspectCompanyConnections(doc,catalog,templates).floors.find(f=>f.floorId===floorId);
  const portal=floor.connections.find(c=>[c.from.regionId,c.to.regionId].includes(roomId));
  assert(portal,'Designated lounge must have a connected door.');
  // A registered floor-surface rug is a walking surface. Doorway clearance
  // starts at y=.001 and would otherwise classify the pile as an obstacle.
  const facilities=derived.facilities.filter(f=>f.floorId===floorId);
  const rugs=facilities.filter(f=>f.roomId===roomId && f.resource.mount==='floor-surface' && f.resource.mountRole==='rug');
  const floorSurfaces=rugs.map(f=>{
    assert(!derived.obstacles.some(o=>o.id===f.id),'Solid footprint cannot serve as a walking surface.');
    const box=new T.Box3().setFromPoints(owned(f.id).flatMap(vertices));
    assert(Math.abs(box.min.y)<.001 && box.max.y<=f.resource.mounting.height+.001,'Installed rug extends beyond its signed walking surface.');
    return {id:f.id,resource:derived.nodes.get(f.id).resource,heightM:box.max.y};
  });
  const groups=rugs.map(f=>scene.root.getObjectByName(f.id)), prior=groups.map(g=>g.visible);
  let routes;
  try {
    groups.forEach(g=>g.visible=false);
    routes=checkRoomDoorAccess({scene,derived,facilities,floor,room,placement,targets,portalId:portal.id,
      radius:placement.rules.envelopeRadius,height:1.90+Math.max(0,...floorSurfaces.map(s=>s.heightM))});
  } finally {groups.forEach((g,i)=>g.visible=prior[i]);}
  const relative=matrix(sofaId).invert().multiply(matrix(tableId));
  return {roomId,sofaId,tableId,cupId,resource:derived.nodes.get(cupId).resource,bearing,tableInSofaCoordinates:xyz(v().setFromMatrixPosition(relative)),seats:measures,floorSurfaces,routes};
}

async function snapshot(doc,live,waiting) {
  const placement=inspectCompanyPlacement(doc,catalog,templates);
  const ids=[live+'/station-1',live+'/station-1/desk',live+'/station-1/monitor',live+'/station-1/desk/secondary-monitor',live+'/wall-shelf',
    live+'/wall-shelf/cup',live+'/wall-shelf/notebook',waiting+'/sofa',waiting+'/cup-table',waiting+'/cup'];
  const records=await withStudioFloor(doc,{...options,roomId:live},context=>({
    matrices:Object.fromEntries(ids.map(id=>[id,context.scene.root.getObjectByName(id).matrixWorld.toArray()])),
    shelf:wallAndLoads(context,live)
  }));
  const lounge=await withStudioFloor(doc,{...options,roomId:waiting},c=>waitingRoom(doc,c,waiting,placement));
  return {...records,lounge};
}

const report={status:'running',cases:[]};
try {
  for (const fixture of cases) {
    const keys=fixture.keys.filter(k=>inputs.has(k));
    assert.equal(keys.length,1,'Supply exactly one batch directory for '+fixture.keys.join('/'));
    const key=keys[0];
    const layout=await fs.readFile(path.join(batch,key,'layout.json'));
    const saved=await fs.readFile(path.join(batch,key,'save.json'),'utf8');
    const doc=await decodeCompanySave(saved,catalog,templates);
    assert.deepEqual(doc,JSON.parse(layout));
    const live=doc.id+fixture.live,waiting=doc.id+fixture.waiting,stationId=live+'/station-1';
    const secondaryId=stationId+'/desk/secondary-monitor', testDesk=d=>checkStudioLoungeDesk(d,{...options,stationId,secondaryId});
    const desk=await testDesk(doc), before=await snapshot(doc,live,waiting);
    const station=doc.nodes.find(n=>n.id===stationId),transform=structuredClone(station.transform);
    transform.position[0]+=.05;
    const moved=prepareCompanyChange(doc,[{type:'move',id:stationId,transform}],options).document;
    const after=await snapshot(moved,live,waiting),movedDesk=await testDesk(moved);
    const matrix=(snap,id)=>new T.Matrix4().fromArray(snap.matrices[id]);
    const delta=matrix(after,desk.deskId).multiply(matrix(before,desk.deskId).invert());
    assert(Math.abs(v().setFromMatrixPosition(delta).length()-.05)<1e-8);
    for(const id of Object.keys(before.matrices)){
      const expected=matrix(before,id);
      if(id===stationId||id.startsWith(stationId+'/')) expected.premultiply(delta);
      assert(expected.elements.every((n,i)=>Math.abs(n-after.matrices[id][i])<1e-8),'Unexpected world transform '+id);
    }
    assert.deepEqual(before.lounge,after.lounge);
    assert.deepEqual(before.shelf,after.shelf);
    assert(Math.abs(movedDesk.separationM-desk.separationM)<1e-8);
    // Mutate only a clone: an exactly coincident second screen must be refused.
    const overlap=structuredClone(doc);
    overlap.nodes.find(n=>n.id===secondaryId).transform=structuredClone(doc.nodes.find(n=>n.id===desk.monitors[0].id).transform);
    await assert.rejects(()=>testDesk(overlap),error=>error.code==='invalid-studio-lounge-set');
    report.cases.push({key,layoutSha256:sha(layout),saveSha256:sha(saved),desk,shelf:before.shelf,waiting:before.lounge,
      movement:{operation:{type:'move',id:stationId,transform},worldDelta:delta.toArray(),moved:[stationId,desk.deskId,...desk.monitors.map(x=>x.id)],
        fixed:Object.keys(before.matrices).filter(id=>!id.startsWith(stationId)),separationAfterM:movedDesk.separationM},overlapRejected:true});
  }
  report.status='passed';
} catch(error) {
  report.status='failed';
  report.failure={message:error.message,code:error.code,details:error.details};
  throw error;
} finally {
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(report.status,reportPath);
}
