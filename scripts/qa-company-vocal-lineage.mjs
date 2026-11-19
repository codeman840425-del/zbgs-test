// CPU integration at the released company scene and recorded-character entry points.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {readFile, realpath, mkdir, writeFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import projectOutputs from './project-output.cjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=path.join(root,'evidence/m2-company-vocal-lineage-intake-v1');
const defaults=path.resolve(root,'../gamemake-company-platform-c1/company-workspace/deliveries');
const {values}=parseArgs({options:{
  company:{type:'string',default:path.join(defaults,'vocal-use-v1.1')},
  reviewed:{type:'string',default:path.join(defaults,'vocal-use-v1')},
  game:{type:'string',default:'output/m2-company-seat-fixed/pair'},
  output:{type:'string'},
}});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const project=await projectOutputs.productionRoot();
const out=values.output?await projectOutputs.projectOutput(values.output,project):undefined;
if(out)assert.equal(path.dirname(out),path.join(evidence,'cpu'),'Expected an in-project evidence/cpu output');
const receipt=JSON.parse(await readFile(path.join(evidence,'reader.json')));
const source=await realpath(values.company), reviewed=await realpath(values.reviewed);
const manifestName='transfer-manifest.json';
const manifestBytes=await readFile(path.join(source,manifestName));
assert.equal(sha(manifestBytes),receipt.manifest);
assert.equal(sha(await readFile(path.join(reviewed,manifestName))),receipt.reviewedManifest);
const manifest=JSON.parse(manifestBytes);
const pins=new Map(manifest.files.map(f=>[f.path,f]));
async function published(file) {
  const pin=pins.get(file);
  assert.ok(pin,'Unpinned company input '+file);
  const bytes=await readFile(path.join(source,file));
  assert.equal(bytes.length,pin.bytes,file);assert.equal(sha(bytes),pin.sha256,file);
  return bytes;
}
const companyModule=name=>import(pathToFileURL(path.join(source,'source/prototype/src/company',name+'.js')).href);
const characterURL=new URL('../prototype/src/character-record-consumer.js',import.meta.url).href;
const hook=registerHooks({
  resolve(name,ctx,next){return next(name,/^three(?:\/|$)/.test(name)?{...ctx,parentURL:characterURL}:ctx);},
  load(url,ctx,next){return next(url,url.endsWith('.json')?{...ctx,importAttributes:{type:'json'}}:ctx);},
});
const {THREE}=await import('./headless-avatar-node.mjs');
globalThis.createImageBitmap=async blob=>{
  const bytes=Buffer.from(await blob.slice(0,24).arrayBuffer());
  return bytes.length===24 && bytes.readUInt32BE(0)===0x89504e47
    ? {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}}
    : {width:1,height:1,close(){}};
};
// Verify the released company's module bytes before executing its scene factory.
for(const f of manifest.files.filter(f=>f.path.startsWith('source/prototype/src/company/') || f.path.startsWith('source/scripts/company-platform/package-template/')))
  await published(f.path);
const {createCompanyAuthoring}=await companyModule('authoring');
const {createCompanyAssetLibrary}=await companyModule('asset-library');
const {decodeCompanySave}=await companyModule('persistence');
const {readInheritedVocalRoom}=await import(pathToFileURL(path.join(source,'source/scripts/company-platform/package-template/vocal-origin.mjs')).href);
const {prepareRecordedCharacter,createRecordAppearanceController}=await import(characterURL);
const {resolveActorRoom,captureFacilityState,restoreFacilityState}=await import('../prototype/src/record-facility-room.js');
const {createSeatLeases}=await import('../prototype/src/seat-lease.js');
const {attachFacilityBehavior}=await import('../prototype/src/facility-behavior.js');
const catalog=JSON.parse(await published('data/library-catalog.json'));
const templates=JSON.parse(await published('data/templates.json'));
const roomDocument=async key=>decodeCompanySave((await published('data/rooms/'+key+'/save.json')).toString(),catalog,templates);
const recordsFile='evidence/m2-uniform-lite-operator-v1/records.json';
const bytes=await readFile(path.join(root,recordsFile));
assert.equal(sha(bytes),'d38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989');
const signed=JSON.parse(bytes);
assert.equal(new Set(signed.map(r=>r.identity.id)).size,2);
const recordById=new Map(signed.map(r=>[r.identity.id,r]));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const report={schema:'company-vocal-lineage-character-cpu-v1',companyManifest:receipt.manifest,
  companyBuild:manifest.buildId,reviewedManifest:receipt.reviewedManifest,recordFile:recordsFile,
  recordsSha256:sha(bytes),records:signed.map(r=>({id:r.identity.id,recordSha256:r.integrity.recordSha256})),
  characterCommit:git('rev-parse','HEAD'),runtimeTree:git('rev-parse','HEAD:prototype/src'),rooms:[]};
assert.equal(git('status','--porcelain','--','prototype/src'),'','Source under test must be clean');

async function openScene(key) {
  const doc=await roomDocument(key);
  assert.equal(doc.id,key);
  const world=new THREE.Scene(), leases=createSeatLeases();
  const library=createCompanyAssetLibrary({fetchImpl:async url=>new Response(await published('viewer/'+String(url).replace(/^\//,'')))});
  let session;
  const actors=new Map();
  let room;
  async function select(floorId,roomId){
    if([...actors.values()].some(a=>a.controller.captureFacilityPose().phase!=='idle'))throw Error('facility-room-in-use');
    await session.setView({mode:'room',floorId,roomId});
    room=resolveActorRoom(world,{session,floorId,roomId});
    for(const [i,actor] of [...actors.values()].entries()){
      actor.avatar.root.position.fromArray(room.spawns[i]);
      actor.motion.reset();actor.update(0,{action:'idle'});actor.avatar.resetSecondary();
    }
  }
  const prepare=(record,position,getPeers=()=>actors.values())=>prepareRecordedCharacter(record,{scene:world,renderer:{},position,
    createController:ctx=>attachFacilityBehavior(createRecordAppearanceController(ctx.avatar),{...ctx,seatLeases:leases,getRoom:()=>room,getPeers})});
  async function mount(record,index){
    const a=await prepare(record,room.spawns[index]);
    assert.equal(a.recordSha256,record.integrity.recordSha256);
    a.attach();actors.set(a.identity.id,a);return a;
  }
  function drop(a){a.dispose();actors.delete(a.identity.id);}
  let closed=false;
  function close(){if(closed)return;closed=true;for(const a of [...actors.values()])drop(a);session?.dispose();library.dispose();}
  try {
    session=await createCompanyAuthoring(world,doc,{catalog,templates,assetLibrary:library,isUsePointBusy:id=>Boolean(leases.forSeat(id)),
      storage:{getItem:()=>null,setItem(){throw Error('Unexpected company authoring save');}}});
    return {session,leases,actors,select,mount,drop,close,capture:()=>captureFacilityState(room,actors),
      restore:saved=>restoreFacilityState(room,actors,saved,{prepare:(old,p,peers)=>prepare(recordById.get(old.identity.id),p,peers),isCurrent:()=>true})};
  } catch(error){close();throw error;}
}
const request=(a,id,point,kind='sit',timeoutSeconds=60)=>a.controller.requestBehavior({requestId:id,kind,timeoutSeconds,payload:{usePointId:point.id}});
const tick=(a,dt)=>a.controller.simulate(dt,a.update);
function finish(a,id){
  for(let i=0;i<3600 && a.controller.behaviorTasks.get(id).state==='running';i++)tick(a,1/60);
  const task=a.controller.behaviorTasks.get(id);
  assert.equal(task.state,'completed',JSON.stringify(task));return task;
}
const summary=r=>({admission:r.admission,reason:r.reason??r.task.reason,state:r.task.state});

async function seatControl(ctx,point){
  await ctx.select(point.floorId,point.roomId);
  const [a,b]=[...ctx.actors.values()];
  assert.equal(request(a,'cancel-arrival',point).admission,'accepted');
  const contention=summary(request(b,'other-arrival',point));
  assert.equal(contention.reason,'seat-unavailable');
  const reserved=ctx.leases.forSeat(point.id);
  assert.equal(reserved.state,'reserved');
  await turn();tick(a,1/60);
  assert.equal(a.controller.captureFacilityPose().phase,'approaching');
  assert.equal(a.controller.cancelBehavior('cancel-arrival'),true);
  assert.equal(ctx.leases.forSeat(point.id),null);
  assert.equal(request(b,'destroy-arrival',point).admission,'accepted');
  assert.throws(()=>b.controller.captureFacilityPose(),/facility-pose-in-transition/);
  ctx.drop(b);
  assert.equal(ctx.leases.forSeat(point.id),null);
  await turn();assert.equal(ctx.leases.forSeat(point.id),null);
  await ctx.mount(recordById.get(b.identity.id),1);
  // A short simulated budget deliberately expires before reaching the real seat.
  assert.equal(request(a,'timed-arrival',point,'sit',.5).admission,'accepted');
  await turn();for(let i=0;i<6;i++)tick(a,1/60);
  const saved=JSON.parse(JSON.stringify(ctx.capture()));
  const pose=saved.actors.find(e=>e.actorId===a.identity.id).pose;
  assert.equal(pose.phase,'approaching');assert.ok(Math.abs(pose.remainingSeconds-.4)<1e-8);
  ctx.close();
  // Rebuild the released scene, both signed VRMs and the shared reservation table from the serialized state.
  const cold=await openScene(point.companyId);
  try {
    await cold.select(point.floorId,point.roomId);
    for(const [i,r] of signed.entries())await cold.mount(r,i);
    const expired=structuredClone(saved);
    expired.actors.find(row=>row.actorId===a.identity.id).pose.remainingSeconds=0;
    await assert.rejects(cold.restore(expired),/positive finite simulation seconds/);
    assert.equal(cold.leases.forSeat(point.id),null);
    const restored=await cold.restore(saved);
    assert.deepEqual(restored,saved);
    const moving=cold.actors.get(a.identity.id);
    for(let i=0;i<23;i++)tick(moving,1/60);
    assert.equal(moving.controller.behaviorTasks.get('timed-arrival').state,'running');
    tick(moving,.02);
    assert.equal(moving.controller.behaviorTasks.get('timed-arrival').reason,'timeout');
    assert.equal(cold.leases.forSeat(point.id),null);
    const survivor=cold.actors.get(b.identity.id);
    assert.equal(request(survivor,'blocked-by-standing-peer',point).admission,'accepted');
    await turn();
    const blocked=survivor.controller.behaviorTasks.get('blocked-by-standing-peer');
    assert.equal(blocked.reason,'seat-body-space-blocked');
    assert.equal(cold.leases.forSeat(point.id),null);
    cold.drop(moving);
    assert.equal(request(survivor,'sit-to-completion',point).admission,'accepted');
    await turn();const finished=finish(survivor,'sit-to-completion');
    const occupied=cold.leases.forSeat(point.id);
    assert.equal(occupied.state,'occupied');
    assert.equal(survivor.controller.captureFacilityPose().phase,'seated');
    assert.equal(survivor.controller.cancelBehavior('sit-to-completion'),false);
    assert.equal(cold.leases.forSeat(point.id).ownerId,b.identity.id);
    cold.drop(survivor);assert.equal(cold.leases.forSeat(point.id),null);
    return {point:point.id,seatMesh:point.contact.seatNodeId,contention,reserved:reserved.state,
      cancelledDuringApproach:'released',destroyedDuringContactLoad:'released',destroyedAfterSeated:'released',
      blockedWithStandingPeer:blocked.reason,completedAfterPeerRemoval:finished.state,retainedAfterCompletion:occupied.state,
      activeTime:{schema:saved.schema,phase:pose.phase,initialSeconds:.5,remainingSeconds:pose.remainingSeconds,
        restoredRemainingSeconds:restored.actors.find(e=>e.actorId===a.identity.id).pose.remainingSeconds,
        zeroRemainingRejected:true,after23Ticks:'running',afterAdditionalSeconds:.02,termination:'timeout',leaseReleased:true}};
  } finally {cold.close();}
}

let previous=null;
try {
  for(const {room:key,reviewedRoom,result:baseline} of receipt.rooms) {
    if(!baseline.ok){
      await assert.rejects(readInheritedVocalRoom({packageRoot:source,sourceRoomKey:key,manifestSha256:receipt.manifest},
        {packageRoot:reviewed,sourceRoomKey:reviewedRoom,manifestSha256:receipt.reviewedManifest}),error=>error.message===baseline.message);
      report.wrongReviewedRoom={key,reviewedRoom,rejected:baseline.message};continue;
    }
    const authority=await readInheritedVocalRoom({packageRoot:source,sourceRoomKey:key,manifestSha256:receipt.manifest},
      {packageRoot:reviewed,sourceRoomKey:key,manifestSha256:receipt.reviewedManifest});
    assert.equal(authority.saveSha256,baseline.saveSha256);
    assert.deepEqual(authority.points,baseline.points);
    const [descriptor]=authority.points;
    const ctx=await openScene(key);
    try {
      const point=ctx.session.scene.describeUsePoint(descriptor.id);
      assert.deepEqual(point,descriptor);
      await ctx.select(point.floorId,point.roomId);
      for(const [i,r] of signed.entries())await ctx.mount(r,i);
      const saved=ctx.capture();
      if(previous)await assert.rejects(ctx.restore(previous),/saved-room-or-roster-mismatch/);
      previous=JSON.parse(JSON.stringify(saved));
      const checks=[];
      for(const a of ctx.actors.values()) {
        const vocal=summary(request(a,'request-vocal',point,point.kind));
        const sit=summary(request(a,'vocal-as-seat',point));
        assert.equal(vocal.reason,'unsupported-facility-behavior');
        assert.equal(sit.reason,'invalid-seat-use-point');
        assert.equal(ctx.leases.forSeat(point.id),null);
        checks.push({id:a.identity.id,vocal,sit});assert.equal(a.controller.captureFacilityPose().phase,'idle');
      }
      const result={key,slot:point.id,worldTarget:point.transform.position,kind:point.kind,capacity:point.capacity,
        pickupNode:point.contact.pickupNodeId,spatialContractMatchesReleasedReader:true,signedActors:checks,
        foreignSnapshotRejected:report.rooms.length>0};
      const chair=ctx.session.scene.describeUsePoints({floorId:point.floorId}).find(p=>p.contact?.seatNodeId&&p.contact?.backNodeId);
      if(chair)result.realSeatControl=await seatControl(ctx,chair);
      if(key===receipt.rooms[0].room){
        const other=receipt.rooms[1];
        await ctx.session.load(await roomDocument(other.room));
        const target=ctx.session.scene.describeUsePoint(other.result.points[0].id);
        assert.ok(target);
        await ctx.select(target.floorId,target.roomId);
        assert.equal(ctx.capture().companyId,other.room);
        assert.equal(ctx.session.scene.describeUsePoint(point.id),null);
        await assert.rejects(ctx.restore(saved),/saved-room-or-roster-mismatch/);
        result.liveCompanySwitch={from:key,to:other.room,actorIds:[...ctx.actors.keys()],newPoint:target.id,oldPointAbsent:true,oldSnapshotRejected:true};
      }
      report.rooms.push(result);
    } finally {ctx.close();}
  }
  assert.equal(report.rooms.length,2);
  assert.ok(report.rooms.some(r=>r.realSeatControl),'Expected the released rental work chair');
  const packGame=values.game;
  const packPin='3cba17b8df616540b404c8739dcf82c40bb580e49fceb37a6209fb73d2b36d43';
  assert.equal(sha(await readFile(path.resolve(root,packGame,'runtime-package.json'))),packPin);
  const packDest=await projectOutputs.projectOutput(path.join(evidence,'cpu','unexpected-package'),project);
  const absent=()=>assert.rejects(lstat(packDest),{code:'ENOENT'});
  await absent();
  const packaged=spawnSync(process.execPath,['scripts/production/package-facility-room.mjs','--game',packGame,'--game-sha256',packPin,'--room',source,'--out',packDest],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.equal(packaged.status,1,packaged.stderr);
  assert.equal(packaged.stderr.trim(),'Transfer manifest SHA-256 mismatch: transfer-manifest.json');
  await absent();
  report.existingPackageEntry={game:packGame,gameManifest:packPin,releasedCompanyManifest:receipt.manifest,exitCode:packaged.status,reason:packaged.stderr.trim(),outputAbsent:true};
  report.status='vocal-behavior-unavailable-seat-control-passed';
  report.scope='Real released room GLBs, source factory, validated character records, VRM skeletons and motion controller. Node uses image metadata only. No GPU, browser, wall-clock simulation, vocal task emulation or business progress.';
  report.unexecuted=['Accepted vocal approach, active-time save/restore and expiry of a vocal task, vocal slot contention and release, mouth/eye contact and visual room handoff. Current character facility behavior accepts only sit/stand.'];
  console.log(JSON.stringify(report,null,2));
  if(out){await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
} finally {hook.deregister();}
