import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {createSeatLeases} from './seat-lease.js';
import {attachFacilityBehavior} from './facility-behavior.js';
import {resolveActorRoom,captureFacilityState,restoreFacilityState} from './record-facility-room.js';
import {createFacilityNavigation} from './facility-navigation.js';
import {turnAngleDelta} from './turn-policy.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(yaw=Math.PI,obstacles=[]) {
  const world=new THREE.Scene(),roomRoot=new THREE.Group();world.add(roomRoot);
  const region={id:'studio',transform:{position:[0,0,0],yaw:0},bounds:{width:8,depth:8},inset:.3};
  const point={id:'studio/chair#seat',companyId:'home',revision:1,floorId:'ground',roomId:'studio',
    facilityId:'studio/chair',resource:{id:'real-chair',version:1},capacity:1,seatHeight:.47,
    transform:{position:[1,0,0],yaw},facilityTransform:{position:[1,0,0],yaw},
    contact:{seatNodeId:'cushion',backNodeId:'back'},
    approachPosition:[1+Math.sin(yaw)*.85,0,Math.cos(yaw)*.85],
    exitPosition:[1+Math.sin(yaw)*.9,0,Math.cos(yaw)*.9]};
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.54,.04,.45),new THREE.MeshStandardMaterial());
  seat.position.set(1,.45,0);roomRoot.add(seat);
  const back=seat.clone();roomRoot.add(back);world.updateMatrixWorld(true);
  const leases=createSeatLeases(), holds=new Set();let loading=Promise.resolve();
  const session={scene:{root:roomRoot,revision:1,document:{id:'home'},describeUsePoints:()=>[point],
    describeUsePoint:id=>id===point.id?structuredClone(point):null,
    navigation:()=>({regions:[region],obstacles:[{instanceId:point.facilityId,x:1,z:0,hw:.4,hd:.4},...obstacles]})},
    async retainUsePointContact(){await loading;const h={seat,back,documentId:'home',usePointId:point.id,
      facilityId:point.facilityId,resource:point.resource,transform:point.transform,facilityTransform:point.facilityTransform};holds.add(h);return h;},
    releaseUsePointContact:h=>{assert.ok(holds.delete(h));}};
  const room=resolveActorRoom(world,{session,floorId:'ground',roomId:'studio'});
  function actor(id,pos=[0,0,1.5]) {
    const root=new THREE.Group();root.position.fromArray(pos);
    const avatar={root,updateGarment(){},livePresentation:{setAction(){},getState:()=>({})}};
    let progress=0;
    const motion={setFacilitySeatHeight(){},reset(){progress=0;},getSeatApproach:()=>.24,getMetrics:()=>({
      seatBack:.16,sitProgress:progress,hipWorld:[
        root.position.x-.4*progress*Math.sin(root.rotation.y),1-.44*progress,root.position.z-.4*progress*Math.cos(root.rotation.y)],
    })};
    const controller=attachFacilityBehavior({},{actorId:id,avatar,motion,seatLeases:leases,getRoom:()=>room});
    const instance={identity:{id},revision:1,recordSha256:id,avatar,controller,
      update(dt,{action}){progress=action==='sit'?Math.min(1,progress+dt*2):Math.max(0,progress-dt*2);},
      attach(){world.add(root);},dispose(){controller.disposeRecordController();}};
    return instance;
  }
  return {point,actor,room,leases,holds,world,setLoading:p=>{loading=p;}};
}
function sit(actor,id,point) {
  return actor.controller.requestBehavior({kind:'sit',requestId:id,payload:{usePointId:point.id}});
}
function finish(actor,id) {
  const controller=actor.controller;
  for(let i=0;i<3600 && controller.behaviorTasks.get(id)?.state==='running';i++) controller.simulate(1/60,actor.update);
  const result=controller.behaviorTasks.get(id);assert.equal(result.state,'completed',JSON.stringify(result));
}
test('the moving approach rounds furniture without planting at an ordinary waypoint',async t=>{
  const desk={instanceId:'studio/desk',x:-.5,z:-.85,hw:.35,hd:.20};
  const f=fixture(Math.PI,[desk]),start=[-2,0,-.85],actor=f.actor('walker',start);
  const nav=createFacilityNavigation(f.room.session.scene,'ground','studio');
  const corners=nav.route(start,f.point.approachPosition);
  assert.ok(corners.length>=3);
  assert.ok(!nav.clear(start,f.point.approachPosition));
  actor.avatar.root.rotation.y=Math.atan2(corners[0][0]-start[0],corners[0][2]-start[2]);
  sit(actor,'around-desk',f.point);await turn();
  const frames=[];
  for(let i=0;i<1800 && actor.controller.captureFacilityPose().phase==='approaching';i++) {
    const root=actor.avatar.root,from=root.position.toArray(),yaw=root.rotation.y;
    actor.controller.simulate(1/60,(dt,state,contacts)=>{
      actor.update(dt,state,contacts);
      const to=root.position.toArray(),change=Math.abs(turnAngleDelta(root.rotation.y,yaw));
      assert.ok(nav.clear(from,to),'every swept root segment clears padded furniture');
      if (root.position.x>corners[0][0]-.25 && root.position.x<corners.at(-2)[0]+.25) {
        const heading=Math.atan2(to[0]-from[0],to[2]-from[2]);
        frames.push({speed:state.speed,change,footTurn:!!state.turnPlan,
          slipAngle:Math.abs(turnAngleDelta(heading,root.rotation.y))});
      }
    });
  }
  assert.equal(actor.controller.captureFacilityPose().phase,'fitting');
  assert.ok(frames.length>40);
  assert.ok(frames.every(f=>f.speed>.1 && !f.footTurn),'moving corners retain the gait');
  assert.ok(frames.reduce((sum,f)=>sum+f.change,0)>.15,'the corner sample actually turns');
  assert.ok(frames.every(f=>f.slipAngle<=.061),'travel follows the facing direction');
  t.diagnostic(JSON.stringify({interiorWaypoints:corners.length-1,movingCornerFrames:frames.length,
    minSpeed:Math.min(...frames.map(f=>f.speed)),turnedRadians:frames.reduce((sum,f)=>sum+f.change,0)}));
  finish(actor,'around-desk');actor.dispose();
});
test('rotated seat holds through exit, rejects contention, restores atomically and releases late contact',async()=>{
  const f=fixture(),a=f.actor('alice'),b=f.actor('bob'),group=new Map([['alice',a],['bob',b]]);
  a.attach();b.attach();
  assert.equal(sit(a,'first',f.point).admission,'accepted');
  assert.equal(sit(b,'contend',f.point).reason,'seat-unavailable');
  assert.equal(sit(a,'bad',{id:'missing'}).reason,'unknown-seat-use-point');
  await turn();finish(a,'first');
  const saved=captureFacilityState(f.room,group);
  assert.equal(saved.actors[0].pose.phase,'seated');assert.equal(f.holds.size,1);
  a.controller.requestBehavior({kind:'stand',requestId:'rise'});
  assert.equal(f.leases.forSeat(f.point.id).state,'exiting');
  finish(a,'rise');assert.equal(f.leases.forSeat(f.point.id),null);assert.equal(f.holds.size,0);
  const options={isCurrent:()=>true,prepare:async(old,pos)=>f.actor(old.identity.id,pos)};
  const broken=structuredClone(saved);broken.actors[1].recordSha256='wrong';
  await assert.rejects(restoreFacilityState(f.room,group,broken,options),/version-mismatch/);
  assert.equal(group.get('alice'),a);assert.equal(f.holds.size,0);assert.equal(f.leases.forSeat(f.point.id),null);
  const restored=await restoreFacilityState(f.room,group,saved,options);
  assert.deepEqual(restored,saved);assert.notEqual(group.get('alice'),a);
  group.get('alice').dispose();assert.equal(f.holds.size,0);
  const bob=group.get('bob');let resolve;
  f.setLoading(new Promise(r=>resolve=r));
  sit(bob,'late',f.point);assert.ok(bob.controller.cancelBehavior('late'));
  assert.equal(f.leases.forSeat(f.point.id),null);
  sit(bob,'retry',f.point);resolve();await turn();
  assert.equal(f.holds.size,1);finish(bob,'retry');bob.dispose();assert.equal(f.holds.size,0);
});

const company=process.env.FACILITY_COMPANY_PACKAGE,records=process.env.FACILITY_RECORD_PACKAGE;
test('published rooms use retained GLB seats and signed VRM records on the real motion controller',
  {skip:!company||!records},async t=>{
  const read=async(...segments)=>JSON.parse(await fs.readFile(path.join(...segments),'utf8'));
  const companyModule=name=>import(pathToFileURL(path.join(company,'source/prototype/src/company',name+'.js')));
  const hook=registerHooks({
    resolve(name,context,next){return next(name,/^three(?:\/|$)/.test(name)?{...context,parentURL:import.meta.url}:context);},
    load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);},
  });t.after(()=>hook.deregister());
  await import('../../scripts/headless-avatar-node.mjs');
  globalThis.createImageBitmap=async blob=>{
    const bytes=Buffer.from(await blob.slice(0,24).arrayBuffer());
    return bytes.length===24 && bytes.readUInt32BE(0)===0x89504e47?
      {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}}:{width:1,height:1,close(){}};
  };
  const {createCompanyAuthoring}=await companyModule('authoring'),{createCompanyAssetLibrary}=await companyModule('asset-library');
  const {decodeCompanySave}=await companyModule('persistence');
  const {prepareRecordedCharacter,createRecordAppearanceController}=await import('./character-record-consumer.js');
  const catalog=await read(company,'data/library-catalog.json'),templates=await read(company,'data/templates.json');
  const manifest=await read(records,'records/manifest.json');
  for(const [index,id] of ['plant-home','plant-rental'].entries()) {
    const doc=await decodeCompanySave(JSON.stringify(await read(company,'data/rooms',id,'save.json')),catalog,templates);
    const assetLibrary=createCompanyAssetLibrary({fetchImpl:async url=>new Response(await fs.readFile(path.join(company,'viewer',url)))});
    const leases=createSeatLeases(), world=new THREE.Scene();
    const session=await createCompanyAuthoring(world,doc,{catalog,templates,assetLibrary,isUsePointBusy:id=>!!leases.forSeat(id),
      storage:{getItem:()=>null,setItem(){throw Error('read-only CPU verification');}}});
    try {
      const point=session.scene.describeUsePoints().find(p=>p.id.endsWith('chair#seat'));
      const room=resolveActorRoom(world,{session,floorId:point.floorId,roomId:point.roomId});
      const record=await read(records,manifest.entries[index].url);
      const prepare=position=>prepareRecordedCharacter(record,{scene:world,renderer:{},position,
        createController:ctx=>attachFacilityBehavior(createRecordAppearanceController(ctx.avatar),{...ctx,seatLeases:leases,getRoom:()=>room})});
      const actor=await prepare(room.spawns[0]);
      try {
        actor.attach();assert.equal(sit(actor,'arrive',point).admission,'accepted');
        for(let i=0;i<300 && actor.controller.behaviorTasks.get('arrive').state==='running';i++) {
          await turn();
          try{if(actor.controller.captureFacilityPose().phase!=='idle')break;}catch{ /* Contact is still loading. */ }
        }
        finish(actor,'arrive');
        assert.equal(actor.controller.captureFacilityPose().phase,'seated');
        assert.equal(leases.forSeat(point.id).state,'occupied');
        const actors=new Map([[actor.identity.id,actor]]), saved=captureFacilityState(room,actors);
        const seated=actor.controller.behaviorTasks.get('arrive').result, originalRoot=actor.avatar.root.uuid;
        actor.dispose();assert.equal(leases.forSeat(point.id),null);
        const fresh=await prepare(room.spawns[0]);fresh.attach();actors.set(actor.identity.id,fresh);
        try {
          await restoreFacilityState(room,actors,saved,{isCurrent:()=>true,prepare:(_old,position)=>prepare(position)});
          const restored=actors.get(actor.identity.id);
          assert.notEqual(restored.avatar.root.uuid,originalRoot);assert.equal(restored.recordSha256,actor.recordSha256);
          assert.equal(restored.controller.behaviorTasks.get('arrive').state,'completed');
          restored.controller.requestBehavior({requestId:'exit',kind:'stand'});
          finish(restored,'exit');assert.equal(leases.forSeat(point.id),null);
          t.diagnostic(JSON.stringify({id,actor:actor.identity.id,record:actor.recordSha256,seat:point.id,
            result:seated,reopened:restored.controller.behaviorTasks.get('arrive').result,exit:restored.avatar.root.position.toArray()}));
        } finally {for(const member of actors.values())member.dispose();}
      } finally {actor.dispose();}
    } finally {session.dispose();assetLibrary.dispose();}
  }
});
