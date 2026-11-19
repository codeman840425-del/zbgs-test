import {createFacilityNavigation} from './facility-navigation.js';
import {finitePosition} from './facility-contact.js';

export function resolveActorRoom(scene,{session,floorId,roomId,spawns,primaryUsePointId}={}) {
  if (!session?.scene?.root || scene.getObjectById(session.scene.root.id)!==session.scene.root)
    throw Error('facility-room-must-share-actor-scene');
  const nav=createFacilityNavigation(session.scene,floorId,roomId);
  const {transform,bounds}=nav.region, center=transform.position;
  const pointsInRoom=session.scene.describeUsePoints({floorId}).filter(p=>p.roomId===roomId);
  const supportsVocal=pointsInRoom.some(p=>p.kind==='standing-vocal' && p.contact?.pickupNodeId);
  const primary=primaryUsePointId===undefined ? undefined : pointsInRoom.find(p=>p.id===primaryUsePointId);
  if (primaryUsePointId!==undefined && !primary) throw Error('primary-use-point-outside-actor-room');
  const free=p=>finitePosition(p) && Math.abs(p[1]-center[1])<.001 && nav.clear(p,p);
  if (spawns!==undefined && (!Array.isArray(spawns) || spawns.length<1 || spawns.length>2 || !spawns.every(free)))
    throw Error('invalid-facility-spawns');
  const points=spawns?structuredClone(spawns):[];
  if (!spawns) {
    const reach=(primary??pointsInRoom.find(p=>p.contact?.seatNodeId || p.kind==='standing-vocal'))?.approachPosition;
    const size=Math.ceil(Math.hypot(bounds.width,bounds.depth)/.7);
    for (let ring=0;points.length<2 && ring<=size;ring++) {
      for (let x=-ring;x<=ring && points.length<2;x++) for (let z=-ring;z<=ring && points.length<2;z++) {
        if (Math.max(Math.abs(x),Math.abs(z))!==ring) continue;
        const p=[center[0]+.7*x,center[1],center[2]+.7*z];
        if (!free(p)) continue;
        if (reach) {try {nav.route(p,reach);} catch {continue;}}
        points.push(p);
      }
    }
    if (!points.length) throw Error('no-walkable-facility-spawn');
  }
  if (points.length===2 && Math.hypot(points[0][0]-points[1][0],points[0][2]-points[1][2])<.42)
    throw Error('overlapping-facility-spawns');
  return {session,floorId,roomId,spawns:points,supportsVocal};
}

export function captureFacilityState(room,actors) {
  if (!room) throw Error('facility-room-unbound');
  return {schema:'record-facility-state-v1',companyId:room.session.scene.document.id,
    floorId:room.floorId,roomId:room.roomId,actors:[...actors.values()].map(actor=>({
      actorId:actor.identity.id,recordSha256:actor.recordSha256,revision:actor.revision,
      pose:actor.controller.captureFacilityPose(),
    }))};
}

// Validate and pose all new signed instances off scene. The caller mounts only
// after the whole set is ready; every rejected or superseded candidate is freed.
export async function restoreFacilityState(room,actors,saved,{prepare,isCurrent}) {
  if (!room || saved?.schema!=='record-facility-state-v1' || saved.companyId!==room.session.scene.document.id ||
      saved.roomId!==room.roomId || saved.floorId!==room.floorId || !Array.isArray(saved.actors) ||
      saved.actors.length!==actors.size || new Set(saved.actors.map(a=>a.actorId)).size!==actors.size)
    throw Error('saved-room-or-roster-mismatch');
  const previous=new Map(actors), candidates=[];
  let mounted=false;
  const getPeers=()=>mounted?actors.values():candidates.values();
  function check() {
    if (!isCurrent()) throw Error('room-restore-superseded');
    for (const [id,actor] of previous) {
      if (actors.get(id)!==actor || actor.controller.captureFacilityPose().phase!=='idle') throw Error('room-restore-needs-idle-roster');
    }
  }
  check();
  try {
    for (const entry of saved.actors) {
      const old=previous.get(entry.actorId);
      if (!old || old.recordSha256!==entry.recordSha256 || old.revision!==entry.revision) throw Error('saved-character-version-mismatch');
      const actor=await prepare(old,entry.pose.position,getPeers);
      candidates.push(actor);check();
      await actor.controller.restoreFacilityPose(entry.pose,actor.update);
      check();
    }
    const restored=captureFacilityState(room,new Map(candidates.map(actor=>[actor.identity.id,actor])));
    for (const candidate of candidates) candidate.attach();
    for (const actor of previous.values()) actor.dispose();
    actors.clear();for (const actor of candidates) actors.set(actor.identity.id,actor);
    mounted=true;
    candidates.length=0;
    return restored;
  } catch(error) {for (const actor of candidates) actor.dispose();throw error;}
}
