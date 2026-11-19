import {compareFacilityFunction} from './appearance-contract.js';

const requiredFields=['approach','coordinateSpace','exit','eye','mouth','position','slotId','yaw'];
const vector=value=>Array.isArray(value) && value.length===3 && value.every(Number.isFinite);
const facePoint=value=>vector(value)&&value[1]>0&&value[1]<1.9&&Math.hypot(value[0],value[2])<=.25;
const fields=value=>value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort().join(','):'';
const samePoint=(a,b)=>a.every((v,i)=>v===b[i]);

// Signed room presets change the installed mesh and the matching reference together.
// The resource on the facility is the single persisted selector.
export function vocalHeightName(profiles,resource) {
  return Object.keys(profiles).find(name=>profiles[name]?.resource?.id===resource?.id &&
    profiles[name]?.resource?.version===resource?.version);
}

function verifyVocalHeights(rule,mic,resources,fail) {
  const profiles=rule.heightProfiles;
  const invalid=detail=>fail('invalid-vocal-height-profile',mic.id,detail);
  if(fields(profiles)!=='low,standard') invalid('Expected standard and low microphone height presets');
  const installed={};
  for(const [name,profile] of Object.entries(profiles)) {
    if(fields(profile)!=='eye,mouth,resource'||fields(profile.resource)!=='id,version'||
        ![profile.mouth,profile.eye].every(facePoint)||profile.eye[1]<=profile.mouth[1]) invalid('Invalid height preset '+name);
    const asset=resources.get(profile.resource.id+'@'+profile.resource.version);
    if(!asset) fail('missing-resource-version',mic.id,profile.resource.id+'@'+profile.resource.version);
    if(asset.mountRole!=='floor-vocal-microphone'||asset.mount!=='floor-surface'||
        !asset.microphone?.pickupNode||!asset.microphone?.pickupFit) invalid('Height preset requires a fitted floor microphone');
    installed[name]=asset;
  }
  const standard=installed.standard, low=installed.low;
  const differences=compareFacilityFunction(standard,low).differences;
  const lowerDrop=low.microphone.pickupFit.mastDropMetres, upperDrop=standard.microphone.pickupFit.mastDropMetres??0;
  if(!Number.isFinite(lowerDrop)||!Number.isFinite(upperDrop)||upperDrop<0||lowerDrop<=upperDrop||
      !differences.length||differences.some(d=>d.field!=='pickupFit.mastDropMetres')||
      low.microphone.pickupNode!==standard.microphone.pickupNode||
      profiles.low.mouth[1]>=profiles.standard.mouth[1]) invalid('Presets must share the mount and differ by mast height');
  const active=vocalHeightName(profiles,mic.node.resource);
  if(!active||!samePoint(rule.performer.mouth,profiles[active].mouth)||!samePoint(rule.performer.eye,profiles[active].eye))
    invalid('Installed resource and performer references must select the same preset');
  return active;
}

// A standing slot belongs to an installed microphone in an explicitly authored singing room.
// A legacy room-space performer reference describes staging only.
export function hasVocalSlot(performer) {
  return performer!=null && ['coordinateSpace','slotId','approach','exit'].some(key=>Object.hasOwn(performer,key));
}

export function installedVocalSlots(rules,facilities,fail,resources) {
  const points=[];
  for(const rule of Array.isArray(rules)?rules:[]) {
    const spec=rule?.performer;
    if(!hasVocalSlot(spec)) {
      if(rule && Object.hasOwn(rule,'heightProfiles')) fail('invalid-vocal-height-profile',rule.regionId,'Presets require an installed standing slot');
      continue;
    }
    const location=rule.regionId ?? 'singingRooms';
    if(Object.keys(spec).sort().join()!==requiredFields.join() || spec.coordinateSpace!=='facility' || spec.slotId!=='vocal' ||
        !Number.isFinite(spec.yaw) || ![spec.position,spec.approach,spec.exit].every(v=>vector(v)&&v[1]===0) ||
        ![spec.mouth,spec.eye].every(facePoint) ||
        spec.eye[1]<=spec.mouth[1])
      fail('invalid-vocal-use-point',location,'Expected facility-local vocal slot with ground targets and performer-local mouth and eye references');
    const mic=facilities.find(f=>f.id===rule.roles?.mic);
    if(!mic || mic.roomId!==rule.regionId || mic.resource.mountRole!=='floor-vocal-microphone' ||
        mic.resource.mount!=='floor-surface' || !mic.resource.microphone?.pickupNode)
      fail('vocal-use-owner-mismatch',rule.roles?.mic??location,'The slot requires a floor microphone with a pickup mesh in its declared room');
    const heightProfile=Object.hasOwn(rule,'heightProfiles')?verifyVocalHeights(rule,mic,resources,fail):undefined;
    points.push({id:mic.id+'#'+spec.slotId,slotId:spec.slotId,kind:'standing-vocal',...(heightProfile?{heightProfile}:{}),
      facilityId:mic.id,floorId:mic.floorId,roomId:mic.roomId,world:mic.world,
      position:spec.position,yaw:spec.yaw,approach:spec.approach,exit:spec.exit,capacity:1,
      clearance:{width:.50,depth:.50,height:1.90},pickupNodeId:mic.resource.microphone.pickupNode,
      performerReferences:{coordinateSpace:'use-point',mouth:spec.mouth,eye:spec.eye}});
  }
  return points;
}
