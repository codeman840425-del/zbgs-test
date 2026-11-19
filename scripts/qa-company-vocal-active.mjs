// Real company scenes and signed characters on the shared production CPU clock.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {readFile, realpath, mkdir, writeFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import outputs from './project-output.cjs';

const root=await outputs.productionRoot();
const delivery=path.resolve(root,'../gamemake-company-platform-c1/company-workspace/deliveries');
const {values}=parseArgs({options:{
  company:{type:'string',default:path.join(delivery,'vocal-use-v1.1')},
  reviewed:{type:'string',default:path.join(delivery,'vocal-use-v1')},
  runtime:{type:'string',default:root}, commit:{type:'string'}, output:{type:'string'},
}});
const safe=values.output?await outputs.projectOutput(values.output,root):null;
if(safe){
  assert.equal(path.dirname(safe),path.join(root,'evidence/m2-company-vocal-active-v1/cpu'),
    'Use a new file under the project evidence/cpu directory');
  const existing=await lstat(safe).catch(error=>{if(error.code!=='ENOENT')throw error;});
  if(existing)throw Error('Evidence already exists: '+safe);
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const archived='evidence/m2-company-vocal-lineage-intake-v1/reader.json';
const recordsFile='evidence/m2-uniform-lite-operator-v1/records.json';
const KIND='standing-vocal', INVALID='vocal-performer-outside-pickup-window';
const dt=1/60, nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const report={schema:'company-vocal-active-character-cpu-v1',status:'incomplete',rooms:[],
  limits:['Released company GLBs and scene, signed costumes and VRM, and real motion/room controllers.',
    'Simulated 1/60 s steps. CPU image metadata stub, no GPU, playback, sound or visual acceptance.'],
  referenceWindow:{mouthToPickupSurfaceM:[.06,.26],incidenceDegreesMax:35,facingDegreesMax:45,yawToleranceRad:.015}};
let hook;

async function inputs(){
  const runtime=await realpath(values.runtime);
  const rel=path.relative(root,runtime);
  assert(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep),'Runtime must be within the main project');
  const git=(...args)=>execFileSync('git',args,{cwd:runtime,encoding:'utf8'}).trim();
  assert.match(values.commit??'',/^[a-f0-9]{7,40}$/,'Requires --commit for the exact character source');
  const commit=git('rev-parse','--verify','--end-of-options',values.commit+'^{commit}');
  const verifyRuntime=()=>{
    assert.equal(git('rev-parse','HEAD'),commit);
    assert.equal(git('status','--porcelain','--untracked-files=all','--','prototype/src','prototype/public','prototype/package-lock.json'),'');
  };
  verifyRuntime();
  const lockFile='prototype/package-lock.json';
  const lock=sha(await readFile(path.join(runtime,lockFile)));
  assert.equal(lock,sha(await readFile(path.join(root,lockFile))),'Headless Node dependencies must match the tested runtime lock');
  Object.assign(report,{characterCommit:commit,runtimeTree:git('rev-parse','HEAD:prototype/src'),
    runtimePath:rel||'.',lockSha256:lock,scriptSha256:sha(await readFile(new URL(import.meta.url))),nodeVersion:process.version});

  const receipt=JSON.parse(await readFile(path.join(root,archived)));
  const company=await realpath(values.company),reviewed=await realpath(values.reviewed);
  const bytes=await readFile(path.join(company,'transfer-manifest.json'));
  assert.equal(sha(bytes),receipt.manifest);
  assert.equal(sha(await readFile(path.join(reviewed,'transfer-manifest.json'))),receipt.reviewedManifest);
  const manifest=JSON.parse(bytes),pins=new Map(manifest.files.map(row=>[row.path,row]));
  async function readPublished(relative){
    const pin=pins.get(relative);assert(pin,'Unpinned company file '+relative);
    const content=await readFile(path.join(company,relative));
    assert.equal(content.length,pin.bytes,relative);assert.equal(sha(content),pin.sha256,relative);
    return content;
  }
  Object.assign(report,{companyManifest:receipt.manifest,companyBuild:manifest.buildId,reviewedManifest:receipt.reviewedManifest});
  for(const row of manifest.files.filter(row=>row.path.startsWith('source/prototype/src/company/')||
    row.path.startsWith('source/scripts/company-platform/package-template/')))
    await readPublished(row.path);
  const bytesRecords=await readFile(path.join(root,recordsFile));
  assert.equal(sha(bytesRecords),'d38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989');
  const records=JSON.parse(bytesRecords);
  assert.deepEqual(records.map(record=>record.identity.gender),['female','male']);
  report.recordsSha256=sha(bytesRecords);
  report.records=records.map(record=>({id:record.identity.id,bodySha256:record.appearanceRecipe.base.sha256,
    recordSha256:record.integrity.recordSha256}));

  const character=file=>pathToFileURL(path.join(runtime,'prototype/src',file+'.js')).href;
  const companyModule=file=>import(pathToFileURL(path.join(company,'source/prototype/src/company',file+'.js')).href);
  const mainLoader=pathToFileURL(path.join(root,'prototype/src/character-record-consumer.js')).href;
  hook=registerHooks({
    resolve(name,ctx,next){return next(name,/^(?:three|@pixiv\/[^/]+)(?:\/|$)/.test(name)?{...ctx,parentURL:mainLoader}:ctx);},
    load(url,ctx,next){return next(url,url.endsWith('.json')?{...ctx,importAttributes:{type:'json'}}:ctx);},
  });
  const THREE=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href);
  const assetRoot=await realpath(path.join(runtime,'prototype/public'));
  const originalFetch=globalThis.fetch,NativeRequest=globalThis.Request,origin='http://vocal-geometry.local/';
  globalThis.self=globalThis;
  globalThis.window={location:{href:origin,search:''}};
  globalThis.location=globalThis.window.location;
  globalThis.ProgressEvent=class extends Event {constructor(type,init={}){super(type);Object.assign(this,init);}};
  globalThis.Request=class extends NativeRequest {constructor(input,init){super(typeof input==='string'&&input.startsWith('/')?new URL(input,origin):input,init);}};
  globalThis.createImageBitmap=async blob=>{
    const bytes=Buffer.from(await blob.slice(0,24).arrayBuffer());
    return bytes.length===24&&bytes.readUInt32BE(0)===0x89504e47
      ? {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}}
      : {width:1,height:1,close(){}};
  };
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,origin);
    if(['blob:','data:'].includes(url.protocol))return originalFetch(input,init);
    assert.equal(url.origin,new URL(origin).origin,'Unexpected runtime network fetch');
    const file=await realpath(path.resolve(assetRoot,'.'+decodeURIComponent(url.pathname)));
    assert(file.startsWith(assetRoot+path.sep),'Runtime asset escaped the fixed public tree');
    const data=await readFile(file);
    return new Response(data,{headers:{'content-length':String(data.length)}});
  };
  const [{createCompanyAuthoring},{createCompanyAssetLibrary},{decodeCompanySave},
    {prepareRecordedCharacter,createRecordAppearanceController},{resolveActorRoom,captureFacilityState,restoreFacilityState},
    {createSeatLeases},{attachFacilityBehavior},{readInheritedVocalRoom}]=await Promise.all([
    companyModule('authoring'),companyModule('asset-library'),companyModule('persistence'),
    import(character('character-record-consumer')),import(character('record-facility-room')),
    import(character('seat-lease')),import(character('facility-behavior')),
    import(pathToFileURL(path.join(company,'source/scripts/company-platform/package-template/vocal-origin.mjs')).href),
  ]);
  const catalog=JSON.parse(await readPublished('data/library-catalog.json'));
  const templates=JSON.parse(await readPublished('data/templates.json'));
  const definitions=[];
  for(const {room:key,reviewedRoom,result} of receipt.rooms){
    const actual=()=>readInheritedVocalRoom({packageRoot:company,sourceRoomKey:key,manifestSha256:receipt.manifest},
      {packageRoot:reviewed,sourceRoomKey:reviewedRoom,manifestSha256:receipt.reviewedManifest});
    if(!result.ok){
      await assert.rejects(actual,error=>error.message===result.message);
      report.wrongReviewedRoom={room:key,reviewedRoom,rejection:result.message};
      continue;
    }
    const lineage=await actual();assert.equal(lineage.saveSha256,result.saveSha256);assert.deepEqual(lineage.points,result.points);
    const document=()=>readPublished('data/rooms/'+key+'/save.json').then(raw=>decodeCompanySave(raw.toString(),catalog,templates));
    const [point]=lineage.points;
    definitions.push({key,point,document,saveSha256:lineage.saveSha256});
  }

  async function open(definition){
    const world=new THREE.Scene(),leases=createSeatLeases(),actors=new Map();
    const library=createCompanyAssetLibrary({fetchImpl:async url=>new Response(await readPublished('viewer/'+String(url).replace(/^\//,'')))});
    let session,room;
    const prepare=(record,position,getPeers=()=>actors.values())=>prepareRecordedCharacter(record,{scene:world,renderer:{},position,
      createController:ctx=>attachFacilityBehavior(createRecordAppearanceController(ctx.avatar),{...ctx,seatLeases:leases,getRoom:()=>room,getPeers})});
    async function mount(record,idx){
      const actor=await prepare(record,room.spawns[idx]);assert.equal(actor.recordSha256,record.integrity.recordSha256);
      assert.equal(actor.avatar.getAssetProfile().sha256,record.appearanceRecipe.base.sha256);
      actor.attach();actors.set(actor.identity.id,actor);return actor;
    }
    async function select(point){
      assert(![...actors.values()].some(actor=>actor.controller.captureFacilityPose().phase!=='idle'),'facility-room-in-use');
      await session.setView({mode:'room',floorId:point.floorId,roomId:point.roomId});
      room=resolveActorRoom(world,{session,floorId:point.floorId,roomId:point.roomId,primaryUsePointId:point.id});
      for(const [i,actor] of [...actors.values()].entries()){
        actor.avatar.root.position.fromArray(room.spawns[i]);actor.motion.reset();actor.update(0,{action:'idle'});actor.avatar.resetSecondary();
      }
    }
    function drop(actor){actor.dispose();actors.delete(actor.identity.id);}
    let closed=false;
    function close(){
      if(closed)return;
      closed=true;
      for(const actor of [...actors.values()])drop(actor);
      session?.dispose();library.dispose();
    }
    try{
      session=await createCompanyAuthoring(world,await definition.document(),{catalog,templates,assetLibrary:library,
        isUsePointBusy:id=>Boolean(leases.forSeat(id)),storage:{getItem:()=>null,setItem(){throw Error('Unexpected company authoring save');}}});
      assert.deepEqual(session.scene.describeUsePoint(definition.point.id),definition.point);
      await select(definition.point);
      for(const [idx,record] of records.entries())await mount(record,idx);
      return {session,leases,actors,mount,select,drop,close,capture:()=>captureFacilityState(room,actors),
        restore:saved=>restoreFacilityState(room,actors,saved,{prepare:(old,pos,peers)=>prepare(records.find(r=>r.identity.id===old.identity.id),pos,peers),isCurrent:()=>true})};
    }catch(error){close();throw error;}
  }
  return {THREE,records,definitions,open,verifyRuntime};
}

const request=(actor,id,point,kind=KIND,timeoutSeconds=60)=>actor.controller.requestBehavior({
  requestId:id,kind,timeoutSeconds,payload:point?{usePointId:point.id}:{},
});
const pose=actor=>actor.controller.captureFacilityPose();
const task=(actor,id)=>actor.controller.behaviorTasks.get(id);
const lease=(ctx,point)=>ctx.leases.forSeat(point.id);
const outcome=reply=>({admission:reply.admission,state:reply.task.state,reason:reply.task.reason});
const serialize=value=>JSON.parse(JSON.stringify(value));
const activate=(actor,id,point,kind,seconds)=>{
  const reply=request(actor,id,point,kind,seconds);
  assert.equal(reply.admission,'accepted',JSON.stringify(reply));return reply;
};
function tick(ctx,seconds=dt){
  for(const actor of ctx.actors.values())actor.controller.simulate(seconds,actor.update);
}
function drive(ctx,actor,id){
  let travelled=0,walkFrames=0,previous=actor.avatar.root.position.clone(),frames=0;
  while(task(actor,id).state==='running'&&frames<3600){
    tick(ctx);frames++;
    const root=actor.avatar.root.position;
    travelled+=root.distanceTo(previous);previous.copy(root);
    walkFrames+=Number(actor.avatar.livePresentation.getState().action==='walk');
  }
  return {task:task(actor,id),travelledM:travelled,frames,walkFrames};
}

function contactReadback(THREE,ctx,actor,point){
  const {Vector3,Box3,Triangle,Raycaster}=THREE;
  const vec=()=>new Vector3(),shared=new Set(),lipRows=[];
  const keys=geometry=>{
    const p=geometry.attributes.position,index=geometry.index;
    const indices=new Set();
    for(let i=0;i<(index?.count??p.count);i++)indices.add(index?index.getX(i):i);
    return [...indices].map(i=>[i,JSON.stringify([p.getX(i),p.getY(i),p.getZ(i)])]);
  };
  actor.avatar.root.updateWorldMatrix(true,true);
  actor.avatar.vrm.scene.traverseVisible(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const names=[mesh.material].flat().map(material=>material.name);
    if(names.some(name=>/_Face_\d+_SKIN(?: \(Outline\))?$/.test(name)))
      for(const [,key] of keys(mesh.geometry))shared.add(key);
    if(names.some(name=>/_FaceMouth_\d+_FACE(?: \(Outline\))?$/.test(name)))
      for(const [index,key] of keys(mesh.geometry))lipRows.push({mesh,index,key});
  });
  const unique=new Map(lipRows.filter(row=>shared.has(row.key)).map(row=>[row.key,row]));
  assert.equal(unique.size,32,'Pinned real FaceMouth/Face_SKIN lip boundary differs');
  const mouth=vec();
  for(const {mesh,index} of unique.values())mouth.add(mesh.getVertexPosition(index,vec()).applyMatrix4(mesh.matrixWorld));
  mouth.multiplyScalar(1/unique.size);
  const humanoid=actor.avatar.vrm.humanoid;
  const eye=humanoid.getRawBoneNode('leftEye').getWorldPosition(vec())
    .lerp(humanoid.getRawBoneNode('rightEye').getWorldPosition(vec()),.5);
  const scene=ctx.session.scene,live=scene.resolveUsePoint(point.id),pickup=live?.pickupMesh;
  assert(pickup?.isMesh&&pickup.name===point.contact.pickupNodeId);
  scene.root.updateMatrixWorld(true);
  const center=pickup.localToWorld(new Box3().setFromBufferAttribute(pickup.geometry.attributes.position).getCenter(vec()));
  const handle=live.anchor.parent.getObjectByName('singing-mic-handle');
  assert(handle?.isMesh,'Missing physical microphone handle');
  const handleCenter=handle.localToWorld(new Box3().setFromBufferAttribute(handle.geometry.attributes.position).getCenter(vec()));
  const toward=center.clone().sub(handleCenter).normalize(),axis=vec();
  const {position}=handle.geometry.attributes,index=handle.geometry.index;
  const vertex=i=>vec().fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(handle.matrixWorld);
  for(let i=0;i<(index?.count??position.count);i+=3){
    const normal=new Triangle(vertex(i),vertex(i+1),vertex(i+2)).getNormal(vec());
    if(normal.dot(toward)<-.998)axis.sub(normal);
  }
  assert(axis.lengthSq()>0,'No physical rear cap defining microphone axis');axis.normalize();
  const ray=new Raycaster(mouth,center.clone().sub(mouth).normalize(),.00001,mouth.distanceTo(center)+.002);
  const pickupHit=ray.intersectObject(pickup,false)[0];
  const furniture=[];scene.root.traverseVisible(node=>{if(node.isMesh)furniture.push(node);});
  const first=ray.intersectObjects(furniture,false)[0];
  const reference=point.performerReferences;
  const worldRef=xyz=>live.anchor.localToWorld(new Vector3(...xyz));
  const mouthReference=worldRef(reference.mouth),eyeReference=worldRef(reference.eye);
  const root=actor.avatar.root, yawError=Math.atan2(Math.sin(root.rotation.y-point.transform.yaw),Math.cos(root.rotation.y-point.transform.yaw));
  const forward=new Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).setY(0);
  const surface=pickupHit?.point??null;
  const incidence=surface?THREE.MathUtils.radToDeg(axis.angleTo(mouth.clone().sub(surface))):null;
  const facing=surface?THREE.MathUtils.radToDeg(forward.angleTo(surface.clone().sub(mouth).setY(0))):null;
  const distance=pickupHit?.distance??null;
  const inWindow=surface!==null&&distance>=.06&&distance<=.26&&incidence<=35&&facing<=45;
  const metrics=actor.motion.getMetrics();
  const independent={lipPoints:unique.size,mouth:mouth.toArray(),eyes:eye.toArray(),mouthReference:mouthReference.toArray(),
    eyeReference:eyeReference.toArray(),mouthReferenceErrorM:mouth.distanceTo(mouthReference),eyeReferenceErrorM:eye.distanceTo(eyeReference),
    actualPickupNode:pickup.name,pickupCenter:center.toArray(),pickupSurface:surface?.toArray()??null,physicalAxis:axis.toArray(),
    firstCompanySurface:first?.object.name??null,pickupOccluded:first?.object!==pickup,mouthToPickupM:distance,
    eyeToPickupM:surface?eye.distanceTo(surface):null,incidenceDegrees:incidence,facingDegrees:facing,withinPickupWindow:inWindow,
    actorRoot:root.position.toArray(),rootYaw:root.rotation.y,authoredYaw:point.transform.yaw,yawErrorRad:yawError,
    support:{ready:metrics.standingSupportReady,hipWorld:metrics.hipWorld,
      feet:metrics.feet.map(({side,contact,actual,supportActual})=>({side,contact,ankleWorld:actual,soleSupportWorld:supportActual}))}};
  return {independent,controller:actor.controller.vocalContact()};
}

function proveContact(THREE,contact,point,admitted){
  const {Vector3}=THREE;
  const {independent,controller:liveRead}=contact;
  assert(liveRead,'Missing actual controller contact data');
  assert.equal(liveRead.usePointId,point.id);assert.equal(liveRead.pickupNodeId,independent.actualPickupNode);
  const approx=(a,b,error)=>assert(Math.abs(a-b)<error,JSON.stringify({a,b,error}));
  const sameVector=(a,b)=>assert(new Vector3(...a).distanceTo(new Vector3(...b))<1e-6,JSON.stringify({a,b}));
  sameVector(liveRead.mouthWorld,independent.mouth);sameVector(liveRead.eyeWorld,independent.eyes);
  sameVector(liveRead.pickupWorld,independent.pickupSurface);
  assert(new Vector3(...liveRead.footWorld).distanceTo(new Vector3(...point.transform.position))<=.0001);
  sameVector(liveRead.footWorld,independent.actorRoot);
  approx(liveRead.mouthDistance,independent.mouthToPickupM,1e-6);
  approx(liveRead.incidenceDegrees,independent.incidenceDegrees,1e-5);
  approx(liveRead.facingDegrees,independent.facingDegrees,.86);
  assert.equal(liveRead.withinPickupWindow,admitted);
  assert.equal(independent.withinPickupWindow,admitted);
  assert.equal(independent.pickupOccluded,false);
  assert(Math.abs(independent.yawErrorRad)<=.015+1e-8,'Root heading missed the authored placement yaw');
  assert.equal(independent.support.ready,true);
  assert.equal(independent.support.feet.length,2);
  assert(independent.support.feet.every(foot=>foot.contact),'Both feet must establish support at the contact check');
}

const released=(ctx,token)=>ctx.leases.history().filter(event=>event.lease.token===token).at(-1);
const presence=actor=>({uuid:actor.avatar.root.uuid,bodySha256:actor.avatar.getAssetProfile().sha256,recordSha256:actor.recordSha256});
const actorPose=(snapshot,actor)=>snapshot.actors.find(entry=>entry.actorId===actor.identity.id).pose;

function reject(actor,id,point,reason,kind){
  const result=outcome(request(actor,id,point,kind));
  assert.deepEqual(result,{admission:'rejected',state:null,reason});
  return result;
}

function waitForRelease(ctx,actor,point){
  const start=actor.avatar.root.position.clone(),previous=start.clone();
  let travelled=0,frames=0;
  for(;lease(ctx,point)&&frames<3600;frames++){
    tick(ctx);
    travelled+=actor.avatar.root.position.distanceTo(previous);
    previous.copy(actor.avatar.root.position);
  }
  return {frames,travelledM:travelled,start:start.toArray(),end:previous.toArray(),lease:lease(ctx,point)};
}

async function timedRestore(open,definition,ctx,actor){
  const {point}=definition,id='timed-approach';
  activate(actor,id,point,KIND,.5);
  for(let i=0;i<6;i++)tick(ctx);
  const saved=serialize(ctx.capture()),moving=actorPose(saved,actor);
  assert.equal(moving.phase,'approaching');
  assert.equal(moving.requestId,id);assert.equal(moving.seat,null);assert.equal(moving.vocal.id,point.id);
  assert(Math.abs(moving.remainingSeconds-.4)<1e-8);
  const cold=await open(definition);
  try{
    const original=[...cold.actors.values()].map(presence);
    const invalid=structuredClone(saved);actorPose(invalid,actor).remainingSeconds=0;
    await assert.rejects(cold.restore(invalid),/positive finite simulation seconds/);
    assert.equal(lease(cold,point),null);
    assert.deepEqual([...cold.actors.values()].map(presence),original);
    const restored=await cold.restore(saved);
    assert.deepEqual(restored,saved);
    const runner=cold.actors.get(actor.identity.id);
    assert.notEqual(runner.avatar.root.uuid,actor.avatar.root.uuid);
    assert.notEqual(runner.avatar.root.uuid,original[0].uuid);
    assert.equal(lease(cold,point).ownerId,actor.identity.id);
    const token=lease(cold,point).token;
    for(let i=0;i<23;i++)tick(cold);
    assert.equal(task(runner,id).state,'running');
    tick(cold,.02);
    assert.equal(task(runner,id).state,'failed');
    assert.equal(task(runner,id).reason,'timeout');
    assert.equal(lease(cold,point),null);
    return {saved:moving,restored:actorPose(restored,actor),expired:task(runner,id),release:released(cold,token),
      zeroBudgetRejected:true,original,restoredActor:presence(runner)};
  }finally{cold.close();}
}

async function chairControl(ctx,point,male){
  await ctx.select(point);
  const chairId='real-work-chair';
  const initial=activate(male,chairId,point,'sit');
  // The fixture loads through the real company contact-retention entry point.
  for(let i=0;i<60&&task(male,chairId).state==='running';i++){
    try{if(pose(male).phase==='approaching')break;}
    catch(error){if(error.message!=='facility-pose-in-transition')throw error;}
    await nextTurn();
  }
  const sit=drive(ctx,male,chairId);
  assert.equal(sit.task.state,'completed',JSON.stringify({initial,sit}));
  assert.equal(pose(male).phase,'seated');
  assert.equal(male.motion.getMetrics().sitProgress,1);
  assert.equal(lease(ctx,point).state,'occupied');
  assert(Number.isFinite(sit.task.result.surface[1]));
  activate(male,'real-chair-exit',null,'stand');
  const stand=drive(ctx,male,'real-chair-exit');
  assert.equal(stand.task.state,'completed',JSON.stringify(stand));
  assert.equal(male.motion.getMetrics().sitProgress,0);assert.equal(lease(ctx,point),null);
  return {point:point.id,seatMesh:point.contact.seatNodeId,sit,stand};
}

async function scenarios({THREE,records,definitions,open},definition){
  const {key,point,saveSha256}=definition,other=definitions.find(value=>value!==definition);
  const row={room:key,point:point.id,saveSha256};report.rooms.push(row);
  let ctx=await open(definition);
  try{
    let [female,male]=[...ctx.actors.values()];
    row.roster=[presence(female),presence(male)];
    row.chairOnly=reject(female,'wrong-seat-task',point,'invalid-seat-use-point','sit');
    activate(female,'cancel-approach',point);
    const reserved=lease(ctx,point);
    assert.equal(reserved.state,'reserved');
    row.reservedContention=reject(male,'contend-reservation',point,'seat-unavailable');
    for(let i=0;i<6;i++)tick(ctx);
    assert.equal(pose(female).phase,'approaching');
    assert.equal(female.controller.cancelBehavior('cancel-approach'),true);
    assert.equal(lease(ctx,point),null);
    row.cancelled={task:task(female,'cancel-approach'),release:released(ctx,reserved.token)};

    activate(male,'destroy-approach',point);
    const destroyed=lease(ctx,point);
    assert.equal(destroyed.state,'reserved');
    ctx.drop(male);
    assert.equal(male.avatar.root.parent,null);
    assert.equal(lease(ctx,point),null);
    row.destroyedDuringApproach={task:task(male,'destroy-approach'),release:released(ctx,destroyed.token)};
    assert.equal(row.destroyedDuringApproach.task.reason,'owner-destroyed');
    assert.equal(row.destroyedDuringApproach.release.lease.releaseReason,'owner-destroyed');
    male=await ctx.mount(records[1],1);
    row.activeTime=await timedRestore(open,definition,ctx,female);
    assert(female.controller.cancelBehavior('timed-approach'));
    await ctx.select(point);

    activate(female,'female-actual-fit',point);
    row.female={arrival:drive(ctx,female,'female-actual-fit'),retainedAtFailure:lease(ctx,point),
      contact:contactReadback(THREE,ctx,female,point)};
    assert.equal(row.female.arrival.task.reason,INVALID,JSON.stringify(row.female));
    assert.equal(row.female.arrival.task.state,'failed');
    assert(row.female.arrival.travelledM>.1&&row.female.arrival.walkFrames>0);
    proveContact(THREE,row.female.contact,point,false);
    assert(row.female.contact.independent.mouthToPickupM>.26);
    assert.equal(row.female.retainedAtFailure.state,'reserved');
    row.female.blockedDuringReturn=reject(male,'contend-failed-return',point,'seat-unavailable');
    row.female.return=waitForRelease(ctx,female,point);
    assert.equal(row.female.return.lease,null,JSON.stringify(row.female.return));
    assert(row.female.return.travelledM>.1);
    assert.equal(pose(female).phase,'idle');
    row.female.release=released(ctx,row.female.retainedAtFailure.token);
    assert.equal(row.female.release.lease.releaseReason,INVALID);

    const maleArrival=activate(male,'male-actual-fit',point);
    row.male={admission:maleArrival,arrival:drive(ctx,male,'male-actual-fit'),
      contact:contactReadback(THREE,ctx,male,point)};
    assert.equal(row.male.arrival.task.state,'completed',JSON.stringify({
      reason:row.male.arrival.task.reason,mouthDistance:row.male.contact.independent.mouthToPickupM,
    }));
    assert(row.male.arrival.travelledM>.1&&row.male.arrival.walkFrames>0);
    proveContact(THREE,row.male.contact,point,true);
    row.male.hold={frames:0,minDistanceM:Infinity,maxDistanceM:0,maxIncidenceDegrees:0,maxFacingDegrees:0,samples:[]};
    const hold=row.male.hold;
    for(let i=1;i<=900;i++){
      tick(ctx);
      hold.frames=i;
      const live=male.controller.vocalContact();
      if(!live?.withinPickupWindow)hold.failedContact=live;
      assert(live?.withinPickupWindow,JSON.stringify(live));
      assert.equal(pose(male).phase,'vocal');
      hold.minDistanceM=Math.min(hold.minDistanceM,live.mouthDistance);
      hold.maxDistanceM=Math.max(hold.maxDistanceM,live.mouthDistance);
      hold.maxIncidenceDegrees=Math.max(hold.maxIncidenceDegrees,live.incidenceDegrees);
      hold.maxFacingDegrees=Math.max(hold.maxFacingDegrees,live.facingDegrees);
      if(i%75)continue;
      const sample=contactReadback(THREE,ctx,male,point);
      const expression=male.avatar.vrm.expressionManager;
      const vowels=Object.fromEntries(['aa','ih','ou','ee','oh'].map(name=>[name,expression.getValue(name)]));
      proveContact(THREE,sample,point,true);
      assert.equal(male.avatar.livePresentation.getState().speaking,true);
      hold.samples.push({frame:i,mouthWorld:sample.independent.mouth,eyes:sample.independent.eyes,
        mouthToPickupM:sample.independent.mouthToPickupM,incidenceDegrees:sample.independent.incidenceDegrees,
        facingDegrees:sample.independent.facingDegrees,vowels});
    }
    assert(hold.samples.some(sample=>Object.values(sample.vowels).some(weight=>weight>0)),'Procedural vocal expression did not reach actual VRM');
    assert(new Set(hold.samples.map(sample=>JSON.stringify(sample.vowels))).size>1);
    assert(new Set(hold.samples.map(sample=>JSON.stringify(sample.mouthWorld))).size>1);
    row.male.lease=lease(ctx,point);
    assert.equal(row.male.lease.state,'occupied');
    assert.equal(row.male.lease.ownerId,male.identity.id);
    assert.equal(male.controller.cancelBehavior('male-actual-fit'),false);
    row.male.occupiedContention=reject(female,'contend-occupied',point,'seat-unavailable');
    await assert.rejects(ctx.select(other.point),/facility-room-in-use/);
    const active=serialize(ctx.capture()),saved=actorPose(active,male);
    assert.equal(saved.phase,'vocal');assert.equal(saved.vocal.id,point.id);
    assert.equal(saved.seat,null);assert.equal(saved.remainingSeconds,null);
    ctx.close();ctx=await open(definition);
    const coldOriginal=[...ctx.actors.values()].map(presence);
    const changed=structuredClone(active);
    actorPose(changed,male).yaw=saved.yaw+.2;
    await assert.rejects(ctx.restore(changed),/saved-vocal-alignment-mismatch/);
    assert.deepEqual([...ctx.actors.values()].map(presence),coldOriginal);
    assert.equal(lease(ctx,point),null);
    const restored=await ctx.restore(active);
    [female,male]=[...ctx.actors.values()];
    row.male.cold={saved,restored:actorPose(restored,male),original:coldOriginal,misalignedSnapshotRejected:true,
      restoredActor:presence(male),contact:contactReadback(THREE,ctx,male,point)};
    assert.equal(row.male.cold.restored.phase,'vocal');
    assert.deepEqual(row.male.cold.restored,saved);
    assert.notEqual(male.avatar.root.uuid,coldOriginal[1].uuid);
    assert.notEqual(male.avatar.root.uuid,row.roster[1].uuid);
    proveContact(THREE,row.male.cold.contact,point,true);
    assert.equal(lease(ctx,point).state,'occupied');
    assert.equal(lease(ctx,point).ownerId,male.identity.id);

    const occupied=lease(ctx,point);
    activate(male,'depart-after-restore',null,'stand');
    assert.equal(lease(ctx,point).state,'exiting');
    row.male.exitContention=reject(female,'contend-exiting',point,'seat-unavailable');
    row.male.departure=drive(ctx,male,'depart-after-restore');
    assert.equal(row.male.departure.task.state,'completed',JSON.stringify(row.male.departure));
    assert(row.male.departure.travelledM>.1&&row.male.departure.walkFrames>0);
    assert.equal(lease(ctx,point),null);
    assert.equal(pose(male).phase,'idle');
    assert.equal(male.avatar.livePresentation.getState().speaking,false);
    row.male.departureLeaseEvents=ctx.leases.history().filter(event=>event.lease.token===occupied.token);
    assert.deepEqual(row.male.departureLeaseEvents.map(event=>event.type),['reserved','occupied','exiting','released']);

    await ctx.select(point);
    activate(male,'destroy-occupied',point);
    const destroyArrival=drive(ctx,male,'destroy-occupied');
    assert.equal(destroyArrival.task.state,'completed',JSON.stringify(destroyArrival));
    const destroyToken=lease(ctx,point).token;
    ctx.drop(male);
    assert.equal(male.avatar.root.parent,null);
    assert(female.avatar.root.parent);
    assert.equal(lease(ctx,point),null);
    row.male.destroyedWhileOccupied=released(ctx,destroyToken);
    assert.equal(row.male.destroyedWhileOccupied.lease.releaseReason,'owner-destroyed');
    male=await ctx.mount(records[1],1);
    const chair=ctx.session.scene.describeUsePoints({floorId:point.floorId})
      .find(candidate=>candidate.contact?.seatNodeId&&candidate.contact?.backNodeId);
    if(chair){
      // A separate signed viewer stood in the tight chair approach in the frozen
      // negative control. Preserve the empty approach for the seated positive.
      ctx.drop(female);
      row.realChair=await chairControl(ctx,chair,male);
      female=await ctx.mount(records[0],0);
    }

    const priorActors=Object.fromEntries([...ctx.actors].map(([id,actor])=>[id,actor.avatar.root.uuid]));
    await ctx.session.load(await other.document());
    await ctx.select(other.point);
    assert.equal(ctx.capture().companyId,other.key);
    assert(!ctx.session.scene.describeUsePoint(point.id));
    assert(ctx.session.scene.describeUsePoint(other.point.id));
    await assert.rejects(ctx.restore(active),/saved-room-or-roster-mismatch/);
    assert.deepEqual(Object.fromEntries([...ctx.actors].map(([id,actor])=>[id,actor.avatar.root.uuid])),priorActors);
    assert.equal(lease(ctx,other.point),null);
    row.roomSwitch={oldPointAbsent:true,staleSnapshotRejected:true,activeSwitchRejected:true,from:key,to:other.key,sameMountedActors:priorActors};
  }finally{ctx.close();}
}

try{
  const fixture=await inputs();
  assert.equal(fixture.definitions.length,2);
  const errors=[];
  for(const definition of fixture.definitions){
    try{await scenarios(fixture,definition);}
    catch(error){
      report.rooms.at(-1).error=error.stack;
      errors.push(definition.key+': '+error.message);
    }
  }
  fixture.verifyRuntime();
  assert.equal(errors.length,0,errors.join('\n'));
  assert(report.rooms.some(row=>row.realChair),'Expected a real rental work chair');
  report.status='passed';report.exitCode=0;
}catch(error){
  report.status='failed';report.exitCode=1;report.error=error.stack;process.exitCode=1;
}finally{
  hook?.deregister();
  const result=JSON.stringify(report,null,2)+'\n';
  if(safe){await mkdir(path.dirname(safe),{recursive:true});await writeFile(safe,result,{flag:'wx'});}
  else console.log(result);
  for(const row of report.rooms)if(row.error)console.error(row.error);
  if(report.error)console.error(report.error);
}
