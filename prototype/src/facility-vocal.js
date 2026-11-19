import {MathUtils,Raycaster,Triangle,Vector3} from 'three';

// The same 32 welded FaceMouth / facial-skin seam used by the offline VRM
// mouth-anchor audit. Resolve referenced vertices once and measure their
// evaluated morph + skin positions in the actor's current pose.
function lipSeam(avatar) {
  const skinPositions=new Set(), lips=new Map(), vector=new Vector3();
  let mouth;
  avatar.vrm.scene.traverse(mesh=>{
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    const isMouth=material?.name.includes('FaceMouth');
    if (!mesh.isSkinnedMesh || (!isMouth && !/_Face_.*SKIN/.test(material?.name))) return;
    if (isMouth && mouth) throw Error('ambiguous-vocal-mouth');
    if (isMouth) mouth=mesh;
    const positions=mesh.geometry.attributes.position, indices=mesh.geometry.index;
    for (const i of new Set(indices?.array??Array.from({length:positions.count},(_,i)=>i))) {
      vector.fromBufferAttribute(positions,i);
      const key=[vector.x,vector.y,vector.z].map(x=>Math.round(x*1e7)).join(',');
      if (isMouth) lips.set(key,i);else skinPositions.add(key);
    }
  });
  const rim=[...lips].filter(([key])=>skinPositions.has(key)).map(([,i])=>i);
  if (!mouth || rim.length!==32) throw Error('vocal-lip-seam-unavailable');
  return ()=> {
    const center=new Vector3();
    for (const i of rim) center.add(mouth.getVertexPosition(i,vector));
    return mouth.localToWorld(center.divideScalar(rim.length));
  };
}

export function vocalPerformer(avatar) {
  const left=avatar.vrm?.humanoid?.getRawBoneNode('leftEye');
  const right=avatar.vrm?.humanoid?.getRawBoneNode('rightEye');
  if (!left || !right || !avatar.livePresentation) throw Error('vocal-performer-landmarks-unavailable');
  const mouth=lipSeam(avatar);
  return {mouth,eye:()=>left.getWorldPosition(new Vector3()).lerp(right.getWorldPosition(new Vector3()),.5)};
}

// The company provider publishes a visible standing anchor and an actual GLB
// pickup mesh. Only chairs have retained contact handles.
export function vocalPickup(room,point) {
  const scene=room.session.scene, resolved=scene.resolveUsePoint(point.id);
  const mesh=resolved?.pickupMesh, anchor=resolved?.anchor;
  const mounted=obj=>{for(let p=obj;p;p=p.parent)if(p===scene.root)return true;return false;};
  if (!mesh?.isMesh || mesh.name!==point.contact.pickupNodeId || !mounted(mesh) || !mounted(anchor))
    throw Error('vocal-pickup-unavailable');
  const facing=anchor.getWorldDirection(new Vector3()), yaw=point.transform.yaw;
  if (anchor.getWorldPosition(new Vector3()).distanceTo(new Vector3(...point.transform.position))>.001 ||
      facing.distanceTo(new Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.001)
    throw Error('stale-vocal-anchor');
  return mesh;
}

function meshCenter(mesh) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.localToWorld(mesh.geometry.boundingBox.getCenter(new Vector3()));
}

// Same rear-cap normal and acceptance window as the released company's
// check-singing-room.mjs. Read only this instance's installed microphone.
export function pickupAxis(mesh,facilityRoot) {
  const handle=facilityRoot.getObjectByName('singing-mic-handle');
  if (!handle?.isMesh) throw Error('vocal-pickup-axis-unavailable');
  const toward=meshCenter(mesh).sub(meshCenter(handle)).normalize(), axis=new Vector3();
  const g=handle.geometry,tri=new Triangle(),normal=new Vector3();
  const vertex=(i,v)=>handle.localToWorld(handle.getVertexPosition(g.index?g.index.getX(i):i,v));
  for(let i=0;i<(g.index?.count??g.attributes.position.count);i+=3) {
    vertex(i,tri.a);vertex(i+1,tri.b);vertex(i+2,tri.c);
    tri.getNormal(normal);if(normal.dot(toward)<-.998)axis.sub(normal);
  }
  if (!axis.lengthSq()) throw Error('vocal-pickup-axis-unavailable');
  return axis.normalize();
}

export function measureVocalContact(performer,mesh,point,axis) {
  const mouth=performer.mouth(),eye=performer.eye();
  const center=meshCenter(mesh);
  const direction=center.clone().sub(mouth).normalize();
  const hit=new Raycaster(mouth,direction).intersectObject(mesh,false)[0];
  if (!hit || !Number.isFinite(hit.distance)) throw Error('vocal-pickup-surface-unavailable');
  const incidenceDegrees=MathUtils.radToDeg(axis.angleTo(mouth.clone().sub(hit.point)));
  const facingDegrees=MathUtils.radToDeg(new Vector3(Math.sin(point.transform.yaw),0,Math.cos(point.transform.yaw))
    .angleTo(hit.point.clone().sub(mouth).setY(0)));
  return {usePointId:point.id,pickupNodeId:mesh.name,pickupWorld:hit.point.toArray(),
    mouthWorld:mouth.toArray(),eyeWorld:eye.toArray(),mouthDistance:hit.distance,incidenceDegrees,facingDegrees,
    withinPickupWindow:hit.distance>=.06 && hit.distance<=.26 && incidenceDegrees<=35 && facingDegrees<=45};
}
