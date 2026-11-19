import {createBehaviorTasks} from './behavior-tasks.js';
import {createTurnPolicy,turnAngleDelta,movingSteering} from './turn-policy.js';
import {canonicalJson} from './character-record.js';
import {findFacilityPoint,finitePosition,pointIdentity,retainFacilitySeat} from './facility-contact.js';
import {createFacilityNavigation,parkingRoute} from './facility-navigation.js';
import {measureVocalContact,pickupAxis,registeredVocalPerformer,vocalPerformer,vocalPickup} from './facility-vocal.js';
import {Vector3} from 'three';

// The record host supplies its existing frame clock and instance.update(). The
// same rig evaluates walking, turns, sitting and garment contacts for every body.
export function attachFacilityBehavior(controller,{actorId,avatar,motion,seatLeases,getRoom,getPeers=()=>[]}) {
  const root=avatar.root, turn=createTurnPolicy(), ownerGeneration=crypto.randomUUID();
  const bone=name=>avatar.vrm?.humanoid?.getRawBoneNode(name);
  const chest=bone('chest')??bone('hips'),left=bone('leftUpperArm'),right=bone('rightUpperArm');
  const bodyPosition=new Vector3();
  // Neutral upper-arm joint spacing plus soft tissue and sleeve clearance.
  const radius=left && right ? Math.max(.22,left.getWorldPosition(new Vector3()).distanceTo(right.getWorldPosition(new Vector3()))/2+.065) : .24;
  function footprint() {
    const center=chest?chest.getWorldPosition(bodyPosition):root.position;
    return {position:root.position.toArray(),x:(root.position.x+center.x)/2,z:(root.position.z+center.z)/2,
      hw:Math.abs(root.position.x-center.x)/2+radius,hd:Math.abs(root.position.z-center.z)/2+radius,radius};
  }
  function peers() {return [...getPeers()].filter(actor=>actor.identity.id!==actorId).map(actor=>actor.controller.facilityFootprint());}
  function personObstacles() {
    return peers().map(body=>({...body,hw:body.hw+radius+.04,hd:body.hd+radius+.04}));
  }
  let disposed=false, mode='idle', phase='idle', target=null, token=null, binding=null;
  let path=[], speed=0, pendingContact=null, contactTask=null, revision=null, nav=null;
  let alignAfterCollision=false,waitingPoint=null;
  let performer=null,lastVocal=null,previousPresentation=null,vocalLoad=null;
  const isVocal=()=>target?.kind==='standing-vocal';
  const tasks=createBehaviorTasks({ownerId:actorId,onEvent({type,task}) {
    if (['cancelled','failed'].includes(type) && task.requestId===contactTask) {
      path=[];speed=0;turn.reset(root.rotation.y);
      if (phase==='checking-vocal') {
        // The body is already standing on the anchor. Keep its reservation
        // until it clears the same physical corridor as a departing performer.
        binding.exitReason=task.reason;phase='exiting';path=[target.exitPosition];setMode('idle');
      } else if (token && seatLeases.get(token)?.state==='reserved') {
        seatLeases.requestRelease(token,task.reason);
        clearBinding();
      } else if (binding) beginExit();
    }
  }});
  function setMode(next) {
    if (mode!==next) {mode=next;avatar.livePresentation?.setAction(next);}
  }
  function clearBinding() {
    vocalLoad?.abort();vocalLoad=null;
    stopVocal();
    token=null;target=null;contactTask=null;path=[];phase='idle';alignAfterCollision=false;waitingPoint=null;
    const previous=binding;binding=null;
    try { motion.setFacilitySeatHeight(null);avatar.updateGarment?.(0,0,[]); }
    finally { previous?.release?.(); }
    setMode('idle');
  }
  function beginExit() {
    if (!token || !binding) return;
    seatLeases.beginExit(token);speed=0;
    if (isVocal()) {stopVocal();phase='exiting';path=[target.exitPosition];setMode('idle');}
    else {phase='rising';path=[];setMode('stand');}
  }
  function stopVocal() {
    if (!previousPresentation) return;
    avatar.livePresentation.setSpeaking(previousPresentation.speaking);
    avatar.livePresentation.setGaze(previousPresentation.gaze);
    previousPresentation=null;
  }
  function refreshNav() {
    const room=getRoom(), current=room.session.scene.revision;
    if (!nav || current!==revision || nav.scene!==room.session.scene || nav.region.id!==room.roomId) {
      nav=createFacilityNavigation(room.session.scene,room.floorId,room.roomId,personObstacles);revision=current;
    }
    return nav;
  }
  function clearSeatCorridor() {
    try {
      const others=peers(),room=getRoom();
      const clearance=radius+Math.max(radius,...others.map(p=>p.radius))+.22;
      function leavesApproachOpen(p) {
        return others.every(peer=>{
          const pad=radius+peer.radius+.10;
          const nextNav=createFacilityNavigation(room.session.scene,room.floorId,room.roomId,
            ()=>[{x:p[0],z:p[2],hw:pad,hd:pad}]);
          try {nextNav.route(peer.position,target.approachPosition);return true;} catch {return false;}
        });
      }
      path=parkingRoute(refreshNav(),target,root.position.toArray(),clearance,leavesApproachOpen);
      waitingPoint=path.at(-1);phase='clearing';
    } catch(error) {
      phase='waiting-blocked';path=[];setMode('idle');
      const task=tasks.active();if (task) tasks.fail(task.requestId,error.message);
    }
  }
  function startVocalApproach(room,point,resumePhase) {
    const scene=room.session.scene,object=scene.resolveUsePoint(point.id),mesh=vocalPickup(room,point);
    binding={foot:point.transform.position,mesh,axis:pickupAxis(mesh,object.anchor.parent),
      scene,revision:scene.revision,object,sceneRoot:scene.root};
    const navigation=refreshNav(),pos=root.position.toArray();
    if (!navigation.clear(point.approachPosition,binding.foot) || !navigation.clear(binding.foot,point.exitPosition))
      throw Error('vocal-contact-path-blocked');
    if (resumePhase==='fitting' || resumePhase==='vocal') {
      if (!navigation.clear(pos,binding.foot)) throw Error('vocal-contact-path-blocked');
      phase='fitting';path=[binding.foot];
    } else {path=navigation.route(pos,point.approachPosition);phase='approaching';}
  }
  function startFacility(task,resumePhase=null) {
    const room=getRoom(), point=findFacilityPoint(room,task.payload.usePointId,task.kind);
    const reserved=seatLeases.reserve({seatId:point.id,ownerId:actorId,ownerGeneration,requestId:task.requestId});
    if (!reserved.accepted) throw Error(reserved.reason);
    token=reserved.lease.token;contactTask=task.requestId;target=point;phase='loading';
    const ownToken=token;
    if (isVocal()) {
      lastVocal=null;pendingContact=null;
      if (performer || avatar.config?.lipAnchor===undefined) {
        performer??=vocalPerformer(avatar);startVocalApproach(room,point,resumePhase);
        return;
      }
      vocalLoad=new AbortController();
      pendingContact=registeredVocalPerformer(avatar,vocalLoad.signal).then(candidate=>{
        if(disposed || token!==ownToken)return;
        const currentRoom=getRoom(), current=findFacilityPoint(currentRoom,point.id,task.kind);
        if(currentRoom.session!==room.session || canonicalJson(pointIdentity(current))!==canonicalJson(pointIdentity(point)))
          throw Error('stale-vocal-use-point');
        vocalLoad=null;performer=candidate;startVocalApproach(currentRoom,current,resumePhase);
      }).catch(error=>{if(token===ownToken)tasks.fail(task.requestId,error.message);});
      return;
    }
    pendingContact=retainFacilitySeat(room,point,motion).then(candidate=>{
      if (disposed || token!==ownToken || tasks.active()?.requestId!==task.requestId) {candidate.release();return;}
      binding=candidate;
      motion.setFacilitySeatHeight(binding.height);
      const pos=root.position.toArray(), navigation=refreshNav();
      if (!navigation.clear(binding.foot,point.transform.position,point.facilityId)) throw Error('seat-body-space-blocked');
      if (resumePhase==='fitting' || resumePhase==='seated') {
        if (!navigation.clear(pos,binding.foot,point.facilityId)) throw Error('restored-seat-path-blocked');
        phase='fitting';path=[binding.foot];
      } else {
        path=navigation.route(pos,point.approachPosition);phase='approaching';
      }
    }).catch(error=>{ if (token===ownToken) tasks.fail(task.requestId,error.message); });
  }
  function requestBehavior(request,resumePhase=null) {
    const spec={timeoutSeconds:60,...request,payload:request?.payload??{}};
    if (spec.requestId && tasks.get(spec.requestId)) return tasks.request(spec);
    let rejection=null;
    if (spec.kind==='sit' || spec.kind==='standing-vocal') {
      try {
        findFacilityPoint(getRoom(),spec.payload.usePointId,spec.kind);
        if (seatLeases.forSeat(spec.payload.usePointId)) rejection='seat-unavailable';
        else if (token) rejection='owner-already-has-seat';
      } catch(error) {rejection=error.message;}
    } else if (spec.kind!=='stand') rejection='unsupported-facility-behavior';
    if (rejection) return tasks.request(spec,rejection);
    if (spec.queue) return tasks.request(spec,'facility-queue-unsupported');
    const active=tasks.active();
    if (active) tasks.cancel(active.requestId,'superseded');
    const reply=tasks.request(spec);
    if (reply.admission==='accepted') {
      try {
        if (spec.kind!=='stand') startFacility(reply.task,resumePhase);
        else if (!binding) tasks.complete(reply.task.requestId,{mode:'idle'});
        else if (phase==='waiting-blocked') clearSeatCorridor();
        else if (!['exiting','rising','clearing'].includes(phase)) beginExit();
      } catch(error) {tasks.fail(reply.task.requestId,error.message);}
    }
    return {...reply,task:tasks.get(reply.task.requestId)};
  }
  function steer(yaw,dt) {
    if (!turn.sample().active) turn.reset(root.rotation.y);
    turn.requestHeading(yaw);
    const plan=turn.update(dt);root.rotation.y=plan.yaw;return plan;
  }
  function advanceRoute(dt) {
    const navigation=refreshNav(),pos=root.position.toArray();
    const distanceTo=p=>Math.hypot(p[0]-pos[0],p[2]-pos[2]);
    // Once the next segment is visible, pursue it without planting at the
    // visibility-graph corner. Every proposed curved step is checked below.
    while (path.length>1 && distanceTo(path[0])<.30 && navigation.clear(pos,path[1])) path.shift();
    let next=path[0];
    if (!navigation.clear(pos,next)) {
      try {path=navigation.route(pos,phase==='clearing'?waitingPoint:target.approachPosition);next=path[0];}
      catch(error) {
        if (phase==='clearing') clearSeatCorridor();else tasks.fail(contactTask,error.message);
        return {};
      }
    }
    const dist=distanceTo(next);
    if (dist<.0001) {
      path.shift();
      if (!path.length) {
        speed=0;
        if (phase==='clearing') {phase='cleared';setMode('idle');}
        else {phase='fitting';path=[binding.foot];}
      }
      return {};
    }
    const dx=next[0]-pos[0],dz=next[2]-pos[2],heading=Math.atan2(dx,dz);
    const angle=turnAngleDelta(heading,root.rotation.y);
    if (turn.sample().active || (speed===0 && Math.abs(angle)>(alignAfterCollision ? .015 : .27))) {
      setMode('idle');return {plan:steer(heading,dt),turning:true};
    }
    const steering=movingSteering(angle,dist,speed,.85);
    const yaw=root.rotation.y+Math.sign(angle)*Math.min(Math.abs(angle),steering.yawRate*dt);
    const desired=path.length>1?steering.desiredSpeed:Math.min(steering.desiredSpeed,Math.sqrt(3.6*dist));
    speed+=Math.max(-2.5*dt,Math.min(1.5*dt,desired-speed));
    const moved=Math.min(dist,speed*dt),alongFacing=dist>.10 && Math.abs(angle)>.06;
    const destination=[pos[0]+(alongFacing?Math.sin(yaw):dx/dist)*moved,pos[1],
      pos[2]+(alongFacing?Math.cos(yaw):dz/dist)*moved];
    if (!navigation.clear(pos,destination)) {
      // The straight route is clear, but its moving turn swept into furniture.
      // Keep this waypoint and use a planted recovery from the last safe pose.
      speed=0;alignAfterCollision=true;setMode('idle');return {};
    }
    alignAfterCollision=false;root.rotation.y=yaw;root.position.fromArray(destination);setMode('walk');
    return {moved,turning:Math.abs(angle)>.2};
  }
  function sampleVocal() {
    return {...measureVocalContact(performer,binding.mesh,target,binding.axis),requestId:contactTask,
      footWorld:root.position.toArray(),yaw:root.rotation.y};
  }
  function verifyVocalTarget() {
    const room=getRoom(), scene=room?.session.scene;
    if (scene!==binding.scene || room.roomId!==target.roomId || room.floorId!==target.floorId) throw Error('stale-vocal-use-point');
    const resolved=scene.resolveUsePoint(target.id);
    if (binding.revision!==scene.revision || binding.object!==resolved || binding.sceneRoot!==scene.root) {
      const current=findFacilityPoint(room,target.id,'standing-vocal');
      if (canonicalJson(pointIdentity(current))!==canonicalJson(pointIdentity(target))) throw Error('stale-vocal-use-point');
      binding.mesh=vocalPickup(room,current);binding.axis=pickupAxis(binding.mesh,resolved.anchor.parent);
      binding.revision=scene.revision;binding.object=resolved;binding.sceneRoot=scene.root;
    }
  }
  function invalidateVocal(reason) {
    const active=tasks.active();
    if (active) tasks.fail(active.requestId,reason);
    if (token) {
      seatLeases.requestRelease(token,reason);seatLeases.beginExit(token);seatLeases.releaseAfterExit(token);
      clearBinding();
    }
    if (lastVocal) lastVocal={...lastVocal,reason};
  }
  function advance(dt,update) {
    tasks.tick(dt);
    if (isVocal() && binding) {
      try {verifyVocalTarget();} catch (error) {invalidateVocal(error.message);}
    }
    let moved=0,plan=null,turning=false;
    if (binding && path.length && (phase==='approaching' || phase==='clearing')) {
      ({moved=0,plan=null,turning=false}=advanceRoute(dt));
    } else if (binding && path.length) {
      const next=path[0], x=next[0]-root.position.x,z=next[2]-root.position.z,dist=Math.hypot(x,z);
      const toYaw=Math.atan2(x,z);
      const yaw=dist>.0001?toYaw:phase==='fitting'?target.transform.yaw:root.rotation.y;
      if (turn.sample().active || Math.abs(turnAngleDelta(yaw,root.rotation.y))>.015) {
        speed=0;setMode('idle');plan=steer(yaw,dt);
      } else if (dist>.0001) {
        const navigation=refreshNav();
        if (!navigation.clear(root.position.toArray(),next,isVocal()?null:target.facilityId)) {
          if (phase==='fitting') tasks.fail(contactTask,'seat-contact-path-blocked');
          else { const active=tasks.active();if (active) tasks.fail(active.requestId,'seat-exit-blocked'); }
          speed=0;
        } else {
          speed=Math.min(.85,speed+1.5*dt,Math.sqrt(2*2.5*dist));
          moved=Math.min(dist,speed*dt);
          root.position.x+=x/dist*moved;root.position.z+=z/dist*moved;setMode('walk');
        }
      } else {
        path.shift();speed=0;
        if (!path.length && phase==='fitting') {
          if (isVocal()) {
            if (!refreshNav().clear(binding.foot,binding.foot)) tasks.fail(contactTask,'vocal-contact-path-blocked');
            else {phase='checking-vocal';setMode('idle');}
          }
          else if (!refreshNav().clear(binding.foot,target.transform.position,target.facilityId)) tasks.fail(contactTask,'seat-body-space-blocked');
          else {phase='sitting';setMode('sit');seatLeases.occupy(token);}
        } else if (!path.length && phase==='exiting') setMode('idle');
      }
    }
    update(dt,{action:mode,distanceDelta:moved,speed:dt?moved/dt:0,moving:moved>0,
      locomotion:'walk',turning:turning||!!plan,turnPlan:plan,allowUnplannedTurn:false,
      stationaryVocal:phase==='vocal'?binding.stance:undefined,
      speaking:avatar.livePresentation?.getState().speaking},binding?.colliders??[]);
    if (!binding) return;
    const metrics=motion.getMetrics();
    if (phase==='checking-vocal' || phase==='vocal') {
      // At the end of a walk the feet may still be gathering and the gait IK
      // may still lower the pelvis. Assess the standing performance pose.
      if (phase==='checking-vocal' && !metrics.standingSupportReady) return;
      try {lastVocal=sampleVocal();} catch(error) {invalidateVocal(error.message);return;}
      if (!lastVocal.withinPickupWindow) {
        lastVocal.reason='vocal-performer-outside-pickup-window';
        if (phase==='checking-vocal') tasks.fail(contactTask,lastVocal.reason);
        else {seatLeases.requestRelease(token,lastVocal.reason);beginExit();}
      } else if (phase==='checking-vocal') {
        const {gaze,speaking}=avatar.livePresentation.getState();previousPresentation={gaze,speaking};
        binding.stance={distance:binding.savedDistance??lastVocal.mouthDistance,pickupWorld:lastVocal.pickupWorld,
          mouthHeadLocal:avatar.vrm.humanoid.getNormalizedBoneNode('head').worldToLocal(new Vector3(...lastVocal.mouthWorld)).toArray()};
        avatar.livePresentation.setGaze(lastVocal.pickupWorld);avatar.livePresentation.setSpeaking(true);
        seatLeases.occupy(token);phase='vocal';
        tasks.complete(contactTask,{mode:'standing-vocal',...lastVocal});
      }
    } else if (phase==='sitting' && metrics.sitProgress===1) {
      const hip=metrics.hipWorld;
      const hit=binding.hitBelow(hip[0],hip[2],hip[1]+.02);
      if (!hit || Math.abs(hit.y-(target.facilityTransform.position[1]+binding.height))>.025)
        tasks.fail(contactTask,'pelvis-outside-seat-surface');
      else {
        phase='seated';
        tasks.complete(contactTask,{mode,usePointId:target.id,position:root.position.toArray(),surface:hit.toArray()});
      }
    } else if (phase==='rising' && metrics.sitProgress===0) {
      phase='exiting';path=[target.exitPosition];setMode('idle');
    } else if (phase==='exiting' && !path.length) {
      clearSeatCorridor();
    } else if (phase==='cleared' && isVocal()) {
      if (seatLeases.get(token)?.state==='reserved') seatLeases.requestRelease(token,binding.exitReason);
      else seatLeases.releaseAfterExit(token);
      clearBinding();
      const active=tasks.active();if (active?.kind==='stand') tasks.complete(active.requestId,{mode:'idle'});
    } else if (phase==='cleared') {
      const hip=metrics.hipWorld, top=target.facilityTransform.position[1]+binding.height;
      if (hip[1]>top+.25 && !binding.hitBelow(hip[0],hip[2],hip[1])) {
        seatLeases.releaseAfterExit(token);clearBinding();
        const active=tasks.active();if (active?.kind==='stand') tasks.complete(active.requestId,{mode:'idle'});
      }
    }
  }
  function capture() {
    if (!['idle','approaching','fitting','seated','vocal'].includes(phase)) throw Error('facility-pose-in-transition');
    const active=tasks.active();
    return {phase,position:root.position.toArray(),yaw:root.rotation.y,
      seat:target && !isVocal()?pointIdentity(target):null,...(isVocal()?{vocal:pointIdentity(target)}:{}),
      ...(phase==='vocal'?{vocalWorkingDistance:binding.stance.distance}:{}),requestId:contactTask,
      remainingSeconds:active?active.deadline-tasks.diagnostics().simulationTime:null};
  }
  async function restore(saved,update) {
    if (phase!=='idle' || !finitePosition(saved?.position) || !Number.isFinite(saved.yaw) ||
       !['idle','approaching','fitting','seated','vocal'].includes(saved.phase)) throw Error('invalid-facility-pose');
    if ((saved.vocal && saved.seat) || (saved.phase==='vocal' && !saved.vocal) || (saved.vocal && saved.phase==='seated'))
      throw Error('invalid-facility-pose');
    const navigation=refreshNav();
    const identity=saved.vocal??saved.seat,kind=saved.vocal?'standing-vocal':'sit';
    const point=identity?findFacilityPoint(getRoom(),identity.id,kind):null;
    if (Math.abs(saved.position[1]-navigation.region.transform.position[1])>.001 ||
        !navigation.clear(saved.position,saved.position,!saved.vocal && ['seated','fitting'].includes(saved.phase)?point?.facilityId:null))
      throw Error('invalid-facility-position');
    if (saved.phase==='idle' ? point!==null : !point || canonicalJson(pointIdentity(point))!==canonicalJson(identity))
      throw Error(saved.vocal?'saved-vocal-version-mismatch':'saved-seat-version-mismatch');
    if (point && (typeof saved.requestId!=='string' || !saved.requestId)) throw Error('invalid-saved-seat-request');
    if (point && !['vocal','seated'].includes(saved.phase) && !(Number.isFinite(saved.remainingSeconds) && saved.remainingSeconds>0))
      throw RangeError('timeoutSeconds must be positive finite simulation seconds');
    if (saved.phase==='vocal' && (saved.remainingSeconds!==null || !Number.isFinite(saved.vocalWorkingDistance) ||
        saved.vocalWorkingDistance<.06 || saved.vocalWorkingDistance>.26 ||
        new Vector3(...saved.position).distanceToSquared(new Vector3(...point.transform.position))>1e-8 ||
        Math.abs(turnAngleDelta(saved.yaw,point.transform.yaw))>.015)) throw Error('saved-vocal-alignment-mismatch');
    root.position.fromArray(saved.position);root.rotation.y=saved.yaw;turn.reset(saved.yaw);motion.reset();
    if (!point) {update(0,{action:'idle'});return;}
    const reply=requestBehavior({requestId:saved.requestId,kind,payload:{usePointId:point.id},
      timeoutSeconds:['seated','vocal'].includes(saved.phase)?60:saved.remainingSeconds},saved.phase);
    if (reply.admission!=='accepted') throw Error(reply.reason);
    await pendingContact;
    if (saved.phase==='vocal' && binding) {binding.savedDistance=saved.vocalWorkingDistance;advance(0,update);}
    if (saved.phase==='seated') {
      if (!binding || root.position.distanceToSquared({x:binding.foot[0],y:binding.foot[1],z:binding.foot[2]})>.00001 ||
          Math.abs(turnAngleDelta(saved.yaw,point.transform.yaw))>.02) throw Error('saved-seat-alignment-mismatch');
      for (let i=0;i<600 && tasks.active();i++) advance(1/60,update);
    }
    const task=tasks.get(saved.requestId);
    if (!binding || (['seated','vocal'].includes(saved.phase)?task.state!=='completed':task.state!=='running')) throw Error(task.reason||'facility-restore-failed');
  }
  return Object.assign(controller,{requestBehavior:request=>requestBehavior(request),cancelBehavior:id=>tasks.cancel(id),behaviorTasks:tasks,
    simulate:advance,captureFacilityPose:capture,restoreFacilityPose:restore,facilityFootprint:footprint,
    vocalContact:()=>lastVocal?structuredClone(lastVocal):null,
    disposeRecordController() {
      disposed=true;root.removeFromParent();tasks.dispose();
      if (token) seatLeases.releaseRemovedInstance(token);
      clearBinding();lastVocal=null;performer=null;
    }});
}
