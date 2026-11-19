import * as THREE from 'three';
import {canonicalJson} from './character-record.js';
import {createFacilityNavigation} from './facility-navigation.js';

export const finitePosition = p => Array.isArray(p) && p.length===3 && p.every(Number.isFinite);

// An unrelated document edit may raise the revision while leaving this binding valid.
export function pointIdentity(point) {
  const {id,companyId,floorId,roomId,facilityId,resource,transform,facilityTransform,
    approachPosition,exitPosition,seatHeight,contact} = point;
  return {id,companyId,floorId,roomId,facilityId,resource,transform,facilityTransform,
    approachPosition,exitPosition,seatHeight,contact};
}

export function findFacilityPoint(room,id) {
  if (!room) throw Error('facility-room-unbound');
  const point=room.session.scene.describeUsePoint(id);
  if (!point || point.id!==id) throw Error('unknown-seat-use-point');
  if (point.floorId!==room.floorId || point.roomId!==room.roomId) throw Error('seat-outside-actor-room');
  if (!finitePosition(point.transform?.position) || !Number.isFinite(point.transform.yaw) ||
      !finitePosition(point.facilityTransform?.position) || !finitePosition(point.approachPosition) ||
      !finitePosition(point.exitPosition) || !Number.isFinite(point.seatHeight) || point.seatHeight<=0 ||
      point.capacity!==1 || !point.contact?.seatNodeId || !point.contact?.backNodeId) throw Error('invalid-seat-use-point');
  return point;
}

// The garment and hair controllers consume oriented-box proxies in mesh space.
function garmentCollider(mesh,name) {
  mesh.geometry.computeBoundingBox();
  const localBox=mesh.geometry.boundingBox.clone(), matrixWorld=mesh.matrixWorld;
  const inverseMatrixWorld=matrixWorld.clone().invert(), local=new THREE.Vector3();
  return {mesh,name,localBox,matrixWorld,inverseMatrixWorld,projectOut(point,margin=0) {
    local.copy(point).applyMatrix4(inverseMatrixWorld);
    let nearest=Infinity, axis, boundary;
    for (const key of ['x','y','z']) {
      const lo=localBox.min[key]-margin, hi=localBox.max[key]+margin;
      if (local[key]<lo || local[key]>hi) return false;
      if (local[key]-lo<nearest) { nearest=local[key]-lo;axis=key;boundary=lo; }
      if (hi-local[key]<nearest) { nearest=hi-local[key];axis=key;boundary=hi; }
    }
    local[axis]=boundary; point.copy(local).applyMatrix4(matrixWorld);return true;
  }};
}

export async function retainFacilitySeat(room,point,rig) {
  const {session}=room;
  const handle=await session.retainUsePointContact(point.id);
  try {
    const current=findFacilityPoint(room,point.id);
    if (canonicalJson(pointIdentity(current))!==canonicalJson(pointIdentity(point)) ||
        handle.usePointId!==point.id || handle.documentId!==point.companyId || handle.facilityId!==point.facilityId ||
        canonicalJson(handle.resource)!==canonicalJson(point.resource) ||
        canonicalJson(handle.transform)!==canonicalJson(point.transform) ||
        canonicalJson(handle.facilityTransform)!==canonicalJson(point.facilityTransform)) throw Error('stale-seat-contact');
    const {position,yaw}=point.transform, floorY=point.facilityTransform.position[1];
    if (!handle.seat?.isMesh || !handle.back?.isMesh) throw Error('missing-seat-mesh');
    const ray=new THREE.Raycaster(), down=new THREE.Vector3(0,-1,0);
    function hitBelow(x,z,originY) {
      ray.ray.origin.set(x,originY,z);
      ray.ray.direction.copy(down);
      return ray.intersectObject(handle.seat,false)[0]?.point;
    }
    const surface=hitBelow(position[0],position[2],floorY+point.seatHeight+.15);
    if (!surface || Math.abs(surface.y-floorY-point.seatHeight)>.005) throw Error('seat-height-mismatch');
    const distance=rig.getMetrics().seatBack+rig.getSeatApproach();
    const foot=[position[0]+Math.sin(yaw)*distance,floorY,position[2]+Math.cos(yaw)*distance];
    const nav=createFacilityNavigation(session.scene,room.floorId,room.roomId);
    if (!nav.clear(point.approachPosition,foot,point.facilityId) || !nav.clear(foot,point.exitPosition,point.facilityId))
      throw Error('seat-contact-path-blocked');
    return {point,foot,hitBelow,height:surface.y-floorY,
      colliders:[garmentCollider(handle.seat,'chairSeat'),garmentCollider(handle.back,'chairBack')],
      release:()=>session.releaseUsePointContact(handle)};
  } catch (error) { session.releaseUsePointContact(handle);throw error; }
}
