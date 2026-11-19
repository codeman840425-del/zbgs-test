import {createBehaviorTasks} from './behavior-tasks.js';
import {createTurnPolicy,turnAngleDelta,movingSteering} from './turn-policy.js';
import {canonicalJson} from './character-record.js';
import {findFacilityPoint,finitePosition,pointIdentity,retainFacilitySeat} from './facility-contact.js';
import {createFacilityNavigation} from './facility-navigation.js';

// The record host supplies its existing frame clock and instance.update(). The
// same rig evaluates walking, turns, sitting and garment contacts for every body.
export function attachFacilityBehavior(controller,{actorId,avatar,motion,seatLeases,getRoom}) {
  const root=avatar.root, turn=createTurnPolicy(), ownerGeneration=crypto.randomUUID();
  let disposed=false, mode='idle', phase='idle', target=null, token=null, binding=null;
  let path=[], speed=0, pendingContact=null, contactTask=null, revision=null, nav=null;
  let alignAfterCollision=false;
  const tasks=createBehaviorTasks({ownerId:actorId,onEvent({type,task}) {
    if (['cancelled','failed'].includes(type) && task.kind==='sit' && task.requestId===contactTask) {
      path=[];speed=0;turn.reset(root.rotation.y);
      if (token && seatLeases.get(token)?.state==='reserved') {
        seatLeases.requestRelease(token,task.reason);
        clearBinding();
      } else if (binding) beginExit();
    }
  }});
  function setMode(next) {
    if (mode!==next) {mode=next;avatar.livePresentation?.setAction(next);}
  }
  function clearBinding() {
    token=null;target=null;contactTask=null;path=[];phase='idle';alignAfterCollision=false;
    const previous=binding;binding=null;
    try { motion.setFacilitySeatHeight(null);avatar.updateGarment?.(0,0,[]); }
    finally { previous?.release(); }
    setMode('idle');
  }
  function beginExit() {
    if (!token || !binding) return;
    seatLeases.beginExit(token);phase='rising';path=[];speed=0;setMode('stand');
  }
  function refreshNav() {
    const room=getRoom(), current=room.session.scene.revision;
    if (!nav || current!==revision) {
      nav=createFacilityNavigation(room.session.scene,room.floorId,room.roomId);revision=current;
    }
    return nav;
  }
  function startSit(task,resumePhase=null) {
    const room=getRoom(), point=findFacilityPoint(room,task.payload.usePointId);
    const reserved=seatLeases.reserve({seatId:point.id,ownerId:actorId,ownerGeneration,requestId:task.requestId});
    if (!reserved.accepted) throw Error(reserved.reason);
    token=reserved.lease.token;contactTask=task.requestId;target=point;phase='loading';
    const ownToken=token;
    pendingContact=retainFacilitySeat(room,point,motion).then(candidate=>{
      if (disposed || token!==ownToken || tasks.active()?.requestId!==task.requestId) {candidate.release();return;}
      binding=candidate;
      motion.setFacilitySeatHeight(binding.height);
      const pos=root.position.toArray(), navigation=refreshNav();
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
    if (spec.kind==='sit') {
      try {
        findFacilityPoint(getRoom(),spec.payload.usePointId);
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
        if (spec.kind==='sit') startSit(reply.task,resumePhase);
        else if (!binding) tasks.complete(reply.task.requestId,{mode:'idle'});
        else if (phase!=='exiting' && phase!=='rising') beginExit();
      } catch(error) {tasks.fail(reply.task.requestId,error.message);}
    }
    return {...reply,task:tasks.get(reply.task.requestId)};
  }
  function steer(yaw,dt) {
    if (!turn.sample().active) turn.reset(root.rotation.y);
    turn.requestHeading(yaw);
    const plan=turn.update(dt);root.rotation.y=plan.yaw;return plan;
  }
  function advanceApproach(dt) {
    const navigation=refreshNav(),pos=root.position.toArray();
    const distanceTo=p=>Math.hypot(p[0]-pos[0],p[2]-pos[2]);
    // Once the next segment is visible, pursue it without planting at the
    // visibility-graph corner. Every proposed curved step is checked below.
    while (path.length>1 && distanceTo(path[0])<.30 && navigation.clear(pos,path[1])) path.shift();
    let next=path[0];
    if (!navigation.clear(pos,next)) {
      try {path=navigation.route(pos,target.approachPosition);next=path[0];}
      catch(error) {tasks.fail(contactTask,error.message);return {};}
    }
    const dist=distanceTo(next);
    if (dist<.0001) {
      path.shift();
      if (!path.length) {phase='fitting';path=[binding.foot];speed=0;}
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
  function advance(dt,update) {
    tasks.tick(dt);
    let moved=0,plan=null,turning=false;
    if (binding && path.length && phase==='approaching') {
      ({moved=0,plan=null,turning=false}=advanceApproach(dt));
    } else if (binding && path.length) {
      const next=path[0], x=next[0]-root.position.x,z=next[2]-root.position.z,dist=Math.hypot(x,z);
      const toYaw=Math.atan2(x,z);
      const yaw=dist>.0001?toYaw:phase==='fitting'?target.transform.yaw:root.rotation.y;
      if (turn.sample().active || Math.abs(turnAngleDelta(yaw,root.rotation.y))>.015) {
        speed=0;setMode('idle');plan=steer(yaw,dt);
      } else if (dist>.0001) {
        const navigation=refreshNav();
        if (!navigation.clear(root.position.toArray(),next,target.facilityId)) {
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
          phase='sitting';setMode('sit');seatLeases.occupy(token);
        } else if (!path.length && phase==='exiting') setMode('idle');
      }
    }
    update(dt,{action:mode,distanceDelta:moved,speed:dt?moved/dt:0,moving:moved>0,
      locomotion:'walk',turning:turning||!!plan,turnPlan:plan,allowUnplannedTurn:false,
      speaking:avatar.livePresentation?.getState().speaking},binding?.colliders??[]);
    if (!binding) return;
    const metrics=motion.getMetrics();
    if (phase==='sitting' && metrics.sitProgress===1) {
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
      const hip=metrics.hipWorld, top=target.facilityTransform.position[1]+binding.height;
      if (hip[1]>top+.25 && !binding.hitBelow(hip[0],hip[2],hip[1])) {
        seatLeases.releaseAfterExit(token);clearBinding();
        const active=tasks.active();if (active?.kind==='stand') tasks.complete(active.requestId,{mode:'idle'});
      }
    }
  }
  function capture() {
    if (!['idle','approaching','fitting','seated'].includes(phase)) throw Error('facility-pose-in-transition');
    const active=tasks.active();
    return {phase,position:root.position.toArray(),yaw:root.rotation.y,
      seat:target?pointIdentity(target):null,requestId:contactTask,
      remainingSeconds:active?active.deadline-tasks.diagnostics().simulationTime:null};
  }
  async function restore(saved,update) {
    if (phase!=='idle' || !finitePosition(saved?.position) || !Number.isFinite(saved.yaw) ||
       !['idle','approaching','fitting','seated'].includes(saved.phase)) throw Error('invalid-facility-pose');
    const navigation=refreshNav();
    const point=saved.seat?findFacilityPoint(getRoom(),saved.seat.id):null;
    if (Math.abs(saved.position[1]-navigation.region.transform.position[1])>.001 ||
        !navigation.clear(saved.position,saved.position,['seated','fitting'].includes(saved.phase)?point?.facilityId:null))
      throw Error('invalid-facility-position');
    if (saved.phase==='idle' ? point!==null : !point || canonicalJson(pointIdentity(point))!==canonicalJson(saved.seat))
      throw Error('saved-seat-version-mismatch');
    if (point && (typeof saved.requestId!=='string' || !saved.requestId)) throw Error('invalid-saved-seat-request');
    root.position.fromArray(saved.position);root.rotation.y=saved.yaw;turn.reset(saved.yaw);motion.reset();
    if (!point) {update(0,{action:'idle'});return;}
    const reply=requestBehavior({requestId:saved.requestId,kind:'sit',payload:{usePointId:point.id},
      timeoutSeconds:saved.phase==='seated'?60:saved.remainingSeconds},saved.phase);
    if (reply.admission!=='accepted') throw Error(reply.reason);
    await pendingContact;
    if (saved.phase==='seated') {
      if (!binding || root.position.distanceToSquared({x:binding.foot[0],y:binding.foot[1],z:binding.foot[2]})>.00001 ||
          Math.abs(turnAngleDelta(saved.yaw,point.transform.yaw))>.02) throw Error('saved-seat-alignment-mismatch');
      for (let i=0;i<600 && tasks.active();i++) advance(1/60,update);
    }
    const task=tasks.get(saved.requestId);
    if (!binding || (saved.phase==='seated'?task.state!=='completed':task.state!=='running')) throw Error(task.reason||'seat-restore-failed');
  }
  return Object.assign(controller,{requestBehavior:request=>requestBehavior(request),cancelBehavior:id=>tasks.cancel(id),behaviorTasks:tasks,
    simulate:advance,captureFacilityPose:capture,restoreFacilityPose:restore,
    disposeRecordController() {
      disposed=true;root.removeFromParent();tasks.dispose();
      if (token) seatLeases.releaseRemovedInstance(token);
      clearBinding();
    }});
}
