import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {deriveCompany} from '../../prototype/src/company/document.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {checkSingingRoom,rayHit} from './check-singing-room.mjs';
import {scanRoomMeshes} from './check-training-clearance.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=path.join(root,'assets-source/company-vocal-fit-check-v1/observations.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await fs.readFile(file));
const vector=xyz=>new T.Vector3().fromArray(xyz);
const angle=(a,b)=>T.MathUtils.radToDeg(a.angleTo(b));
const threshold={lowerDistanceM:.06,upperDistanceM:.26,upperIncidenceDeg:35,upperFacingDeg:45};
const rooms=['singing-studio','singing-rental'];
const baselineHash='9cbbc83645f96894fa370494b0813be70c247be7e4442ebff204945d4c928a18';

async function loadInputs(directory) {
  let manifestSha256=null;
  try {manifestSha256=sha(await fs.readFile(path.join(directory,'transfer-manifest.json')));}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  const assetRoot=manifestSha256 ? path.join(directory,'source') : root;
  const dataDir=manifestSha256 ? path.join(directory,'data') : path.join(assetRoot,'prototype/src/company');
  const catalog=await json(path.join(dataDir,'library-catalog.json'));
  const templates=await json(path.join(dataDir,manifestSha256?'templates.json':'templates-extended.json'));
  return {directory,assetRoot,catalog,templates,manifestSha256,roomsDir:manifestSha256?path.join(dataDir,'rooms'):directory};
}

function rangeMargins(distanceM,incidenceDeg,facingDeg) {
  return {aboveMinimumM:distanceM-threshold.lowerDistanceM,belowMaximumM:threshold.upperDistanceM-distanceM,
    incidenceDeg:threshold.upperIncidenceDeg-incidenceDeg,facingDeg:threshold.upperFacingDeg-facingDeg};
}

function summarize(rows) {
  const worst={};
  for(const field of Object.keys(rows[0].margin)) {
    const limiting=rows.reduce((a,b)=>a.margin[field]<b.margin[field]?a:b);
    worst[field]={value:limiting.margin[field],sample:limiting.sample};
  }
  const externalCameraSight={};
  for(const label of ['mouth','eye']) {
    const lines=rows.flatMap(row=>row.externalCameraSight[label]?[row.externalCameraSight[label]]:[]);
    externalCameraSight[label]={observed:lines.length,clear:lines.filter(line=>line.clear).length};
  }
  return {samples:rows.length,passed:rows.filter(row=>row.passed).length,worst,externalCameraSight};
}

function observe(scene,derived,room,point,contract,observations) {
  scene.root.updateMatrixWorld(true);
  const pickup=scene.resolveUsePoint(point.id).pickupMesh;
  assert.equal(pickup.name,point.contact.pickupNodeId);
  const records=[];
  const facilities=derived.facilities.filter(item=>item.floorId===point.floorId);
  const {worldToRoom,checkedMeshes}=scanRoomMeshes(scene,room,facilities,[],[],(object,owner,matrix,bounds)=>{
    records.push({object,id:owner?.id??object.name,matrix:matrix.clone(),bounds:bounds.clone()});
  });
  const target=records.find(record=>record.object===pickup);
  assert(target,'The scene scan must include the resolved pickup');
  const otherFacilityIds=[...new Set(records.map(record=>record.id).filter(id=>id!==point.facilityId))];
  for(const id of Object.values(contract.roles)) assert(id===point.facilityId || otherFacilityIds.includes(id),id);

  const stand=scene.root.getObjectByName(point.facilityId);
  const micToRoom=worldToRoom.clone().multiply(stand.matrixWorld), roomToMic=micToRoom.clone().invert();
  // The game aims at the local geometry-box center after the mesh transform.
  // The installation checker independently measures the physical handle axis in room coordinates.
  pickup.geometry.computeBoundingBox();
  const center=pickup.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(target.matrix);
  const posedBox=new T.Box3(), vertex=new T.Vector3();
  for(let i=0;i<pickup.geometry.attributes.position.count;i++) {
    posedBox.expandByPoint(pickup.getVertexPosition(i,vertex).applyMatrix4(target.matrix));
  }
  const axis=vector(contract.microphone.axis).normalize();
  const localFacing=new T.Vector3(Math.sin(point.local.yaw),0,Math.cos(point.local.yaw));
  const facing=localFacing.transformDirection(micToRoom);
  const camera=scene.root.getObjectByName(contract.roles.camera);
  const roomToCamera=worldToRoom.clone().multiply(camera.matrixWorld).invert();
  const lens=records.find(record=>record.id===contract.roles.camera&&record.object.name===contract.camera.node);
  assert(lens,'The scan must contain the installed physical lens');
  const lensFront=vector(contract.camera.lens);
  const cameraBlockers=records.filter(record=>record!==lens);
  function externalCameraSight(target) {
    const hit=rayHit(cameraBlockers,lensFront,target);
    const direction=target.clone().sub(lensFront).transformDirection(roomToCamera);
    return {clear:!hit,firstBlocker:hit?{facility:hit.record.id,mesh:hit.record.object.name,
      surfaceFacilityM:hit.point.clone().applyMatrix4(roomToMic).toArray(),distanceFromLensM:hit.distance}:null,
      horizontalDeg:T.MathUtils.radToDeg(Math.atan2(direction.x,direction.z)),
      verticalDeg:T.MathUtils.radToDeg(Math.atan2(direction.y,Math.hypot(direction.x,direction.z)))};
  }
  const rows=observations.map(sample=>{
    const mouth=vector(sample.mouthM).applyMatrix4(micToRoom);
    const first=rayHit(records,mouth,center);
    assert(first,'No geometry hit for '+sample.id);
    const incidenceDeg=angle(axis,mouth.clone().sub(first.point));
    const facingDeg=angle(facing,first.point.clone().sub(mouth).setY(0));
    const margin=rangeMargins(first.distance,incidenceDeg,facingDeg);
    return {sample:sample.id,firstFacility:first.record.id,firstMesh:first.record.object.name,
      pickupFirst:first.record===target,surfaceM:first.point.clone().applyMatrix4(roomToMic).toArray(),distanceM:first.distance,
      incidenceDeg,facingDeg,margin,externalCameraSight:{mouth:externalCameraSight(mouth),
        ...(sample.eyeM&&{eye:externalCameraSight(vector(sample.eyeM).applyMatrix4(micToRoom))})},
      passed:first.record===target&&Object.values(margin).every(value=>value>=0)};
  });
  return {checkedMeshes,otherFacilityIds,gameAimCenterM:center.clone().applyMatrix4(roomToMic).toArray(),
    posedVertexBoxCenterM:posedBox.getCenter(new T.Vector3()).applyMatrix4(roomToMic).toArray(),
    physicalAxis:axis.transformDirection(roomToMic).toArray(),
    externalCamera:{lensNode:lens.object.name,facility:contract.roles.camera,lensFrontFacilityM:lensFront.clone().applyMatrix4(roomToMic).toArray(),
      scope:'Installed desk-camera lens to historical posed mouth and eye; companion diagnostic, independent of the pickup window and game replay viewpoint.'},rows};
}

async function inspectRoom(input,roomId,data,baseline) {
  const {directory,assetRoot,catalog,templates,manifestSha256,roomsDir}=input;
  const dir=path.join(roomsDir,roomId), raw=await fs.readFile(path.join(dir,'save.json'));
  const document=await decodeCompanySave(raw.toString('utf8'),catalog,templates);
  assert.deepEqual(document,await json(path.join(dir,'layout.json')));
  assert.equal(document.id,roomId);
  const [rule]=document.singingRooms;
  const contract=await checkSingingRoom(document,rule,{root:assetRoot,catalog,templates});
  const point=contract.usePoint;
  // Only transfer old measurements when the pose origin, facing and local routes agree.
  assert.deepEqual(point.local,data.rooms[roomId].usePoint);
  assert.equal(point.facilityId,data.rooms[roomId].facility);
  const derived=deriveCompany(document,catalog,templates);
  const room=derived.nodes.get(rule.regionId);
  const mic=derived.facilities.find(item=>item.id===point.facilityId).resource;
  if(baseline) assert.equal(mic.asset.sha256,baselineHash);
  const resources=[...derived.facilities,...derived.surfaceFinishes].filter(item=>item.floorId===point.floorId).map(item=>item.resource);
  if(manifestSha256) {
    for(const resource of resources.filter(resource=>resource.asset?.url)) {
      const file=path.join(directory,'viewer',resource.asset.url.slice(1));
      assert.equal(sha(await fs.readFile(file)),resource.asset.sha256,resource.id+' viewer GLB');
    }
  }
  const samples=data.samples.filter(row=>row.room===roomId);
  let measured;
  await preflightLibraryAssets({root:assetRoot,resources,validate:library=>{
    const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:point.floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try {measured=observe(scene,derived,room,point,contract,samples);}
    finally {scene.dispose();}
  }});
  const authorsReference=contract.microphone;
  const margin=rangeMargins(authorsReference.distanceMetres,authorsReference.incidenceDegrees,authorsReference.facingDegrees);
  const failures=[];
  for(const [index,row] of measured.rows.entries()) {
    const sample=samples[index];
    if(!row.pickupFirst) failures.push({id:sample.id,reason:'another surface lies ahead of the pickup',mesh:row.firstMesh});
    if(baseline && (vector(row.surfaceM).distanceTo(vector(sample.surfaceM))>2e-6 ||
        Math.abs(row.distanceM-sample.distanceM)>2e-6 || Math.abs(row.incidenceDeg-sample.incidenceDeg)>1e-4 ||
        Math.abs(row.facingDeg-sample.facingDeg)>1e-4)) failures.push({id:sample.id,reason:'original observed contact differs'});
    const actor=data.actors.find(actor=>actor.id===sample.actor);
    if(row.passed!==(!baseline||actor.body==='male')) failures.push({id:sample.id,reason:'unexpected pickup-window result'});
  }
  const byBody={};
  for(const actor of data.actors) byBody[actor.body]=summarize(measured.rows.filter((_,i)=>samples[i].actor===actor.id));
  return {room:roomId,saveSha256:sha(raw),mic:{id:mic.id,version:mic.version,sha256:mic.asset.sha256},facilityTransform:point.facilityTransform,
    ...measured,authorsReference:{distanceM:authorsReference.distanceMetres,incidenceDeg:authorsReference.incidenceDegrees,
      facingDeg:authorsReference.facingDegrees,margin},byBody,failures};
}

const [candidatePath,baselinePath,outputPath,...extra]=process.argv.slice(2);
assert(candidatePath&&baselinePath&&outputPath&&!extra.length,'Usage: node check-vocal-fit-contacts.mjs NEW_BATCH_OR_PACKAGE BASELINE_BATCH_OR_PACKAGE NEW_OUTPUT_DIR');
const output=path.resolve(outputPath);
await checkManagedOutput(output,undefined,{allowDelivery:false});
const bytes=await fs.readFile(fixture), data=JSON.parse(bytes);
assert.equal(data.schema,'company-vocal-fit-observations');
assert.equal(data.baselineMicSha256,baselineHash);
assert.equal(new Set(data.samples.map(s=>s.id)).size,57);
assert.equal(data.samples.length,57);
assert.deepEqual(data.actors.map(actor=>data.samples.filter(s=>s.actor===actor.id).length),[7,50]);
try {
  await fs.lstat(output);
  throw Error('Evidence directory already exists: '+output);
} catch(error) {if(error.code!=='ENOENT') throw error;}
const report={schema:'company-vocal-fit-contact-replay',version:1,scope:'Replay of 57 saved posed mouths against current physical room meshes. No new performer animation was run.',observationsSha256:sha(bytes),threshold,checks:{}};
for(const [name,location] of [['baseline',baselinePath],['candidate',candidatePath]]) {
  const input=await loadInputs(path.resolve(location)), result=[];
  if(name==='baseline'&&input.manifestSha256) assert.equal(input.manifestSha256,data.sources[0].baselineCompanyManifestSha256);
  for(const roomId of rooms) result.push(await inspectRoom(input,roomId,data,name==='baseline'));
  const totals={};
  for(const actor of data.actors) totals[actor.body]={
    samples:result.reduce((n,r)=>n+r.byBody[actor.body].samples,0),
    passed:result.reduce((n,r)=>n+r.byBody[actor.body].passed,0)};
  report.checks[name]={packageManifestSha256:input.manifestSha256,rooms:result,totals};
}
report.passed=Object.values(report.checks).every(check=>check.rooms.every(room=>room.failures.length===0));
await checkManagedOutput(output,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output);
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,output,baseline:report.checks.baseline.totals,candidate:report.checks.candidate.totals}));
if(!report.passed) process.exitCode=1;
