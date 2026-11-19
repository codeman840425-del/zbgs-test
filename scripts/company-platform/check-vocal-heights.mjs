import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {deriveCompany} from '../../prototype/src/company/document.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {checkSingingRoom,rayHit,scoreRowsAt,triangles} from './check-singing-room.mjs';
import {scanRoomMeshes} from './check-training-clearance.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const fixture='assets-source/company-vocal-height-check-v1/observations.json';
const oldMicSha='c31e1b2eb9f6f2407974da44d3652ea817ce285fa1de4ebee7e3c55b4af3652a';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await fs.readFile(path.join(root,fixture)),data=JSON.parse(bytes);
assert.equal(hash(JSON.stringify(data)),'50901e184ca8519bd1894c2bcf793cc818834db48faa9489338656fa9bd73765','Signed observation data changed');
const profiles=['low','standard'],rooms=Object.keys(data.rooms);
const vec=arr=>new T.Vector3(...arr),deg=(a,b)=>T.MathUtils.radToDeg(a.angleTo(b));
const facing=yaw=>new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
const component=record=>record.object.userData.name||record.object.name;
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const samePoint=(a,b)=>finite3(a)&&finite3(b)&&vec(a).distanceTo(vec(b))<2e-6;
const bounds={distanceM:[.06,.26],incidenceDeg:35,facingDeg:45,lowMouthVerticalAbsM:.04,
  pageCenterDistanceM:[.35,1.8],pageCenterIncidenceDeg:60,pageCenterGlanceDeg:60,cameraHorizontalDeg:35,cameraVerticalDeg:23};
const allBetween=(v,[min,max])=>v>=min&&v<=max;
const ids=new Set(),origins=new Set();
for(const f of data.frames) {
  assert(data.rooms[f.room]&&profiles.includes(f.profile)&&!ids.has(f.id));
  ids.add(f.id);
  assert([f.mouthM,f.eyeM,f.originalSurfaceM].every(finite3)&&f.eyeM[1]>f.mouthM[1]);
  assert(Number.isInteger(f.frame)&&Number.isFinite(f.yawRad)&&/^[0-9a-f]{64}$/.test(f.fieldsSha256));
  const sourceId=(f.source||'chief')+f.pointer;
  assert(!origins.has(sourceId));origins.add(sourceId);
}
for(const source of ['chief','fusion']) for(const [i,profile] of profiles.entries()) {
  const count=data.frames.filter(f=>(f.source||'chief')===source&&f.profile===profile).length;
  assert.equal(count,(source==='chief'?[20,6]:[8,4])[i]);
}
function sourceFields(p) {
  const c=p.contact;
  return [p.frame,p.body,p.record,p.lipVertexCount,c.lipAnchor.descriptorSha256,c.usePointId,c.yaw,
    c.mouthWorld,c.eyeWorld,c.pickupWorld,c.mouthDistance,c.incidenceDegrees,c.facingDegrees];
}
async function verifySource(chief,fusion) {
  const reports={};
  for(const [key,file,pin] of [['chief',chief,data.source.reportSha256],['fusion',fusion,data.fusion.reportSha256]]) {
    const raw=await fs.readFile(file);assert.equal(hash(raw),pin,key+' source hash');
    reports[key]=JSON.parse(raw);
  }
  assert.equal(reports.chief.combinedSha256,data.source.combinedManifestSha256);
  assert.equal(reports.chief.roomManifest,data.source.companyManifestSha256);
  assert(reports.fusion.intake.some(row=>row.manifest===data.source.combinedManifestSha256));
  for(const f of data.frames) {
    const record=f.pointer.substring(1).split('/').reduce((value,key)=>value[key],reports[f.source||'chief']);
    const c=record.contact, actor=data.actors[f.profile],room=data.rooms[f.room],t=room.facilityTransform;
    assert.equal(hash(JSON.stringify(sourceFields(record))),f.fieldsSha256,f.id+' source fields');
    assert.deepEqual([record.body,record.record,record.lipVertexCount,c.lipAnchor.method,c.lipAnchor.descriptorSha256,c.usePointId],
      [actor.bodySha256,actor.recordSha256,32,'posed-rim-vertices',actor.descriptorSha256,room.sourceUsePointId]);
    const inverse=new T.Matrix4().makeRotationY(t.yaw).setPosition(vec(t.position)).invert();
    for(const [absolute,local] of [[c.mouthWorld,f.mouthM],[c.eyeWorld,f.eyeM],[c.pickupWorld,f.originalSurfaceM]])
      assert(samePoint(vec(absolute).applyMatrix4(inverse).toArray(),local),f.id+' inverse facility transform');
    assert(samePoint(c.mouthWorld,record.lipCenter)&&samePoint(c.eyeWorld,record.eye));
    assert.equal(c.yaw-t.yaw,f.yawRad);
    assert.deepEqual([c.mouthDistance,c.incidenceDegrees,c.facingDegrees],[f.originalDistanceM,f.originalIncidenceDeg,f.originalFacingDeg]);
    if(f.source==='fusion') {
      const tally=side=>record.pages.filter(p=>p.side===side&&p.visible).length;
      assert.deepEqual(f.upstreamGrid,{perPage:record.pages.length/2,leftVisible:tally('left'),rightVisible:tally('right')});
    }
  }
  return {ok:true,checked:data.frames.length,chiefSha256:data.source.reportSha256,fusionSha256:data.fusion.reportSha256,fixtureSha256:hash(bytes)};
}
function pageTargets(records,score,scoreToRoom) {
  const page=records.find(r=>r.id===score.id&&component(r)===score.resource.musicStand.pageNode);
  assert(page,'Missing bound physical score page mesh');
  const inverse=scoreToRoom.clone().invert();
  const faces=triangles(page).map(tri=>new T.Triangle(...[tri.a,tri.b,tri.c].map(v=>v.clone().applyMatrix4(inverse))));
  const box=new T.Box3().setFromPoints(faces.flatMap(tri=>[tri.a,tri.b,tri.c]));
  const pages=[];
  for(const [side,index] of [['left',0],['right',1]]) {
    const samples=[];
    function target(kind,column,row,u,v) {
      const x=T.MathUtils.lerp(box.min.x,box.max.x,(index+u)/2);
      const y=T.MathUtils.lerp(box.min.y,box.max.y,v);
      const front=new T.Vector3(x,y,box.max.z+.16).applyMatrix4(scoreToRoom);
      const back=new T.Vector3(x,y,box.min.z-.16).applyMatrix4(scoreToRoom);
      const hit=rayHit([page],front,back);
      assert(hit,'No paper surface at '+side+' '+kind+' '+column+'/'+row);
      samples.push({kind,column,row,u,v,point:hit.point,normal:hit.normal});
    }
    target('center',0,0,.5,.5);
    for(let col=0;col<20;col++) for(let row=0;row<13;row++) target('grid',col,row,(col+.5)/20,(row+.5)/13);
    for(const [col,u] of [.05,.08,.25,.5,.75,.92,.95].entries()) {
      const x=T.MathUtils.lerp(box.min.x,box.max.x,(index+u)/2);
      const lines=scoreRowsAt(x,box,faces).filter(s=>s.feature==='relief').sort((a,b)=>a.v-b.v);
      for(const [row,line] of lines.entries()) target('staff',col,row,u,line.v);
    }
    assert(samples.some(t=>t.kind==='staff'),'Missing raised staff lines on '+side);
    pages.push({side,samples,page});
  }
  return pages;
}
function tally() {return {total:0,visible:0};}
function readPage({side,samples,page},eye,actorFacing,records) {
  const groups={grid:tally(),lowestGridRow:tally(),staff:tally(),lowestStaffLine:tally()};
  const blockedBy={},firstBlocked={};
  let center;
  for(const sample of samples) {
    const hit=rayHit(records,eye,sample.point);
    const visible=hit?.record===page&&hit.point.distanceTo(sample.point)<=.004;
    if(sample.kind==='center') {
      const ray=sample.point.clone().sub(eye);
      const distanceM=ray.length(), incidenceDeg=deg(sample.normal,ray.clone().negate()),glanceDeg=deg(actorFacing,ray.setY(0));
      center={visible,distanceM,incidenceDeg,glanceDeg,passed:visible&&allBetween(distanceM,bounds.pageCenterDistanceM)&&
        incidenceDeg<=bounds.pageCenterIncidenceDeg&&glanceDeg<=bounds.pageCenterGlanceDeg};
      continue;
    }
    const fields=[sample.kind];
    if(sample.row===0) fields.push(sample.kind==='grid'?'lowestGridRow':'lowestStaffLine');
    for(const group of fields) {
      groups[group].total++;
      if(visible){groups[group].visible++;continue;}
      firstBlocked[group]??={column:sample.column,row:sample.row,u:sample.u,v:sample.v,facility:hit?.record.id??null,
        mesh:hit?component(hit.record):null,targetRoomM:sample.point.toArray(),firstRoomM:hit?.point.toArray()??null};
    }
    if(!visible) {
      const name=hit?hit.record.id+'/'+component(hit.record):'no intersection';blockedBy[name]=(blockedBy[name]??0)+1;
    }
  }
  const passed=center.passed&&Object.values(groups).every(g=>g.total>0&&g.visible===g.total);
  return {side,passed,center,...groups,blockedBy,firstBlocked};
}
async function loadInput(folder,baseline) {
  let manifest=null,manifestHash=null;
  try {const raw=await fs.readFile(path.join(folder,'transfer-manifest.json'));manifest=JSON.parse(raw);manifestHash=hash(raw);}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  if(baseline) assert.equal(manifestHash,data.source.companyManifestSha256,'Baseline must be the signed source room package');
  const pins=new Map(manifest?.files.map(p=>[p.path,p])||[]);
  async function read(rel) {
    const raw=await fs.readFile(path.join(folder,rel));
    if(manifest) {
      const pin=pins.get(rel);assert(pin&&pin.bytes===raw.length&&pin.sha256===hash(raw),'Package file identity: '+rel);
    }
    return raw;
  }
  const assetRoot=manifest?path.join(folder,'source'):root;
  const catalog=manifest?JSON.parse(await read('data/library-catalog.json')):JSON.parse(await fs.readFile(path.join(root,'prototype/src/company/library-catalog.json')));
  const templates=manifest?JSON.parse(await read('data/templates.json')):JSON.parse(await fs.readFile(path.join(root,'prototype/src/company/templates-extended.json')));
  return {assetRoot,catalog,templates,read,manifest,manifestHash};
}
async function inspect(input,key,room,profile,baseline) {
  const {assetRoot,catalog,templates,read,manifest}=input,dir=(manifest?'data/rooms/':'')+key+'/';
  const raw=await read(dir+'save.json'),doc=await decodeCompanySave(raw.toString(),catalog,templates);
  assert.deepEqual(doc,JSON.parse(await read(dir+'layout.json')));assert.equal(doc.id,room,'Snapshot company mismatch for '+key);
  assert.equal(doc.singingRooms.length,1);
  const [rule]=doc.singingRooms;
  const contract=await checkSingingRoom(doc,rule,{catalog,templates,root:assetRoot}),slot=contract.usePoint;
  assert.equal(slot.id,data.rooms[room].sourceUsePointId);assert.deepEqual(slot.local,data.rooms[room].localSlot);
  const derived=deriveCompany(doc,catalog,templates), facilities=derived.facilities.filter(f=>f.floorId===slot.floorId);
  const role=k=>facilities.find(f=>f.id===rule.roles[k]);
  const mic=role('mic'),score=role('score'),camera=role('camera');
  if(baseline || profile==='standard') assert.equal(mic.resource.asset.sha256,oldMicSha,'Expected original standard pickup');
  if(!baseline) {
    const current=rule.heightProfiles?.[profile];assert(current,'Missing explicit '+profile+' definition for '+key);
    assert.equal(slot.heightProfile,profile,'Wrong snapshot height profile: '+key);
    assert.deepEqual(current.resource,slot.resource);assert.deepEqual(current.mouth,slot.performerReferences.mouth);
    assert.deepEqual(current.eye,slot.performerReferences.eye);
    assert.deepEqual([rule.performer.mouth,rule.performer.eye],[current.mouth,current.eye]);
    if(profile==='low') assert.notEqual(mic.resource.asset.sha256,oldMicSha,'Low mode must change the physical pickup');
  }
  if(manifest) {
    assert.deepEqual(JSON.parse(await read(dir+'use-points.json')).points.find(p=>p.id===slot.id),slot);
  }
  const resources=[...facilities,...derived.surfaceFinishes.filter(f=>f.floorId===slot.floorId)].map(f=>f.resource);
  if(manifest) for(const r of resources.filter(r=>r.asset?.url)) assert.equal(hash(await read('viewer'+r.asset.url)),r.asset.sha256);
  const frames=data.frames.filter(f=>f.room===room&&f.profile===profile), measurements=[];
  await preflightLibraryAssets({root:assetRoot,resources,validate:library=>{
    const scene=createCompanyScene(new T.Scene(),doc,{catalog,templates,visibleFloorId:slot.floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try {
      scene.root.updateMatrixWorld(true);
      const records=[],region=derived.nodes.get(slot.roomId);
      const {worldToRoom}=scanRoomMeshes(scene,region,facilities,[],[],(object,owner,matrix,box)=>{
        records.push({object,id:owner?.id??object.name,matrix:matrix.clone(),bounds:box.clone()});
      });
      const toRoom=id=>worldToRoom.clone().multiply(scene.root.getObjectByName(id).matrixWorld);
      const micToRoom=toRoom(mic.id),roomToMic=micToRoom.clone().invert(),roomToCamera=toRoom(camera.id).invert();
      const pickup=scene.resolveUsePoint(slot.id).pickupMesh,pickupRecord=records.find(r=>r.object===pickup);
      assert(pickupRecord);
      pickup.geometry.computeBoundingBox();const center=pickup.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(pickupRecord.matrix);
      const axis=vec(contract.microphone.axis),slotFacing=facing(slot.local.yaw).transformDirection(micToRoom);
      const lens=records.find(r=>r.id===camera.id&&component(r)===contract.camera.node);assert(lens);
      const blockers=records.filter(r=>r!==lens),lensPoint=vec(contract.camera.lens);
      const targets=pageTargets(records,score,toRoom(score.id));
      function sight(p) {
        const first=rayHit(blockers,lensPoint,p),dir=p.clone().sub(lensPoint).transformDirection(roomToCamera);
        const horizontalDeg=T.MathUtils.radToDeg(Math.atan2(dir.x,dir.z)),verticalDeg=T.MathUtils.radToDeg(Math.atan2(dir.y,Math.hypot(dir.x,dir.z)));
        return {clear:!first,horizontalDeg,verticalDeg,firstBlocker:first?{facility:first.record.id,mesh:component(first.record)}:null,
          passed:!first&&Math.abs(horizontalDeg)<=bounds.cameraHorizontalDeg&&Math.abs(verticalDeg)<=bounds.cameraVerticalDeg};
      }
      for(const f of frames) {
        const mouth=vec(f.mouthM).applyMatrix4(micToRoom),eye=vec(f.eyeM).applyMatrix4(micToRoom);
        const hit=rayHit(records,mouth,center);assert(hit,f.id+' has no physical surface hit');
        const pickupFirst=hit.record===pickupRecord,direction=hit.point.clone().sub(mouth);
        const incidenceDeg=deg(axis,direction.clone().negate()),facingDeg=deg(slotFacing,direction.clone().setY(0));
        const surfaceM=hit.point.clone().applyMatrix4(roomToMic).toArray();
        const pickupOK=pickupFirst&&allBetween(hit.distance,bounds.distanceM)&&incidenceDeg<=bounds.incidenceDeg&&facingDeg<=bounds.facingDeg;
        const aboveMouthM=surfaceM[1]-f.mouthM[1],aboveEyeM=surfaceM[1]-f.eyeM[1];
        const heightOK=profile==='standard'||(Math.abs(aboveMouthM)<=bounds.lowMouthVerticalAbsM&&aboveEyeM<0);
        if(baseline||profile==='standard') {
          assert(samePoint(surfaceM,f.originalSurfaceM)&&Math.abs(hit.distance-f.originalDistanceM)<2e-6,f.id+' original pickup surface mismatch');
          assert(Math.abs(incidenceDeg-f.originalIncidenceDeg)<1e-4&&Math.abs(facingDeg-f.originalFacingDeg)<1e-4,f.id+' original pickup angles mismatch');
        }
        const face=facing(f.yawRad).transformDirection(micToRoom),pages=targets.map(page=>readPage(page,eye,face,records));
        const cameraSight={mouth:sight(mouth),eye:sight(eye)};
        if(baseline&&f.upstreamGrid?.perPage===260) for(const p of pages)
          assert.equal(p.grid.visible,f.upstreamGrid[p.side+'Visible'],f.id+' independent full-page count');
        measurements.push({id:f.id,source:f.source||'chief',frame:f.frame,pickupFirst,firstMesh:component(hit.record),surfaceM,
          distanceM:hit.distance,incidenceDeg,facingDeg,aboveMouthM,aboveEyeM,pickupOK,heightOK,pages,cameraSight,
          passed:pickupOK&&heightOK&&pages.every(p=>p.passed)&&Object.values(cameraSight).every(x=>x.passed)});
      }
    } finally {scene.dispose();}
  }});
  const range=values=>[Math.min(...values),Math.max(...values)];
  const observedRange=field=>range(measurements.map(m=>m[field]));
  const signedMargins={
    pickupDistanceM:Math.min(...measurements.map(m=>Math.min(m.distanceM-bounds.distanceM[0],bounds.distanceM[1]-m.distanceM))),
    incidenceDeg:bounds.incidenceDeg-Math.max(...measurements.map(m=>m.incidenceDeg)),
    facingDeg:bounds.facingDeg-Math.max(...measurements.map(m=>m.facingDeg))
  };
  if(profile==='low') {
    signedMargins.absoluteMouthHeightM=bounds.lowMouthVerticalAbsM-Math.max(...measurements.map(m=>Math.abs(m.aboveMouthM)));
    signedMargins.eyeClearanceM=-Math.max(...measurements.map(m=>m.aboveEyeM));
  }
  const visibility={};
  for(const group of ['grid','lowestGridRow','staff','lowestStaffLine']) {
    const samples=measurements.flatMap(m=>m.pages.map(p=>p[group]));
    visibility[group]={rays:samples.reduce((a,p)=>a+p.total,0),visible:samples.reduce((a,p)=>a+p.visible,0)};
  }
  const cameraRays=measurements.flatMap(m=>Object.values(m.cameraSight));
  const summary={distanceM:observedRange('distanceM'),incidenceDeg:observedRange('incidenceDeg'),facingDeg:observedRange('facingDeg'),
    aboveMouthM:observedRange('aboveMouthM'),aboveEyeM:observedRange('aboveEyeM'),signedMargins,visibility,
    pickupFirst:measurements.filter(m=>m.pickupFirst).length,camera:{rays:cameraRays.length,passed:cameraRays.filter(r=>r.passed).length}};
  return {key,room,profile,summary,saveSha256:hash(raw),mic:{...slot.resource,sha256:mic.resource.asset.sha256},
    score:{id:score.resource.id,version:score.resource.version,sha256:score.resource.asset.sha256},observed:frames.length,
    passed:measurements.filter(m=>m.passed).length,measurements};
}
async function main(args) {
  if(args[0]==='--verify-source') {
    assert.equal(args.length,3,'--verify-source CHIEF_REPORT FUSION_REPORT');
    console.log(JSON.stringify(await verifySource(args[1],args[2])));return;
  }
  const [inputArg,outArg,...flags]=args;
  assert(inputArg&&outArg,'PACKAGE_OR_BATCH NEW_OUTPUT [--baseline | --low STUDIO_KEY RENTAL_KEY --standard STUDIO_KEY RENTAL_KEY]');
  const baseline=flags.length===1&&flags[0]==='--baseline',mapping={};
  if(baseline) {for(const p of profiles) mapping[p]=rooms;}
  else {
    assert.equal(flags.length,6,'Supply two rooms for both height profiles');
    for(let i=0;i<6;i+=3) {
      const p=flags[i].slice(2);assert(flags[i]==='--'+p&&profiles.includes(p)&&!mapping[p]);
      const pair=flags.slice(i+1,i+3);assert(pair.every(k=>/^[a-z][a-z0-9-]{0,62}$/.test(k)),'Invalid room key');
      mapping[p]=pair;
    }
    assert.equal(new Set(Object.values(mapping).flat()).size,4,'Require four distinct profile snapshots');
  }
  const output=path.resolve(outArg);
  await checkManagedOutput(output,undefined,{allowDelivery:false});
  try {await fs.lstat(output);throw Error('Use a fresh evidence directory');}catch(e){if(e.code!=='ENOENT')throw e;}
  const input=await loadInput(path.resolve(inputArg),baseline),checks=[];
  for(const profile of profiles) for(const [i,room] of rooms.entries()) checks.push(await inspect(input,mapping[profile][i],room,profile,baseline));
  const all=checks.flatMap(c=>c.measurements);
  const compliant=all.every(row=>row.passed);
  const report={schema:'company-vocal-height-replay',version:1,mode:baseline?'signed-baseline':'profile-snapshots',manifestSha256:input.manifestHash,
    fixtureSha256:hash(bytes),checksScriptSha256:hash(await fs.readFile(import.meta.filename)),bounds,checks,
    scope:'Static facility meshes and same-frame signed mouth/eye landmarks. Character self-occlusion, animation, gaze, audio and ordinary-PC timing require in-game evidence.',
    total:all.length,passed:all.filter(f=>f.passed).length,compliant};
  await checkManagedOutput(output,undefined,{allowDelivery:false});await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({mode:report.mode,measurements:all.length,compliant,passed:report.passed,output}));
  if(!compliant)process.exitCode=1;
}
await main(process.argv.slice(2));
