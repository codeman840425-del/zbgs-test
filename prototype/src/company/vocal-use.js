const requiredFields=['approach','coordinateSpace','exit','eye','mouth','position','slotId','yaw'];
const vector=value=>Array.isArray(value) && value.length===3 && value.every(Number.isFinite);

// A standing slot belongs to an installed microphone in an explicitly authored singing room.
// A legacy room-space performer reference describes staging only.
export function hasVocalSlot(performer) {
  return performer!=null && ['coordinateSpace','slotId','approach','exit'].some(key=>Object.hasOwn(performer,key));
}

export function installedVocalSlots(rules,facilities,fail) {
  const points=[];
  for(const rule of Array.isArray(rules)?rules:[]) {
    const spec=rule?.performer;
    if(!hasVocalSlot(spec)) continue;
    const location=rule.regionId ?? 'singingRooms';
    if(Object.keys(spec).sort().join()!==requiredFields.join() || spec.coordinateSpace!=='facility' || spec.slotId!=='vocal' ||
        !Number.isFinite(spec.yaw) || ![spec.position,spec.approach,spec.exit].every(v=>vector(v)&&v[1]===0) ||
        ![spec.mouth,spec.eye].every(v=>vector(v)&&v[1]>0&&v[1]<1.9&&Math.hypot(v[0],v[2])<=.25) ||
        spec.eye[1]<=spec.mouth[1])
      fail('invalid-vocal-use-point',location,'Expected facility-local vocal slot with ground targets and performer-local mouth and eye references');
    const mic=facilities.find(f=>f.id===rule.roles?.mic);
    if(!mic || mic.roomId!==rule.regionId || mic.resource.mountRole!=='floor-vocal-microphone' ||
        mic.resource.mount!=='floor-surface' || !mic.resource.microphone?.pickupNode)
      fail('vocal-use-owner-mismatch',rule.roles?.mic??location,'The slot requires a floor microphone with a pickup mesh in its declared room');
    points.push({id:mic.id+'#'+spec.slotId,slotId:spec.slotId,kind:'standing-vocal',
      facilityId:mic.id,floorId:mic.floorId,roomId:mic.roomId,world:mic.world,
      position:spec.position,yaw:spec.yaw,approach:spec.approach,exit:spec.exit,capacity:1,
      clearance:{width:.50,depth:.50,height:1.90},pickupNodeId:mic.resource.microphone.pickupNode,
      performerReferences:{coordinateSpace:'use-point',mouth:spec.mouth,eye:spec.eye}});
  }
  return points;
}
