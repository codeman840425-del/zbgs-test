const RACK='garment-rack-wardrobe';
const GARMENT='hanging-garment';
const EPS=1e-7;
export const HANGING_ENVELOPE={origin:'top',width:.14,height:.86,depth:.432};
export const HOOK_CROWN_ALLOWANCE=.010;

export const GARMENT_RAIL = {radius:.015,centerY:1.50,
  slots:[{id:'left',position:[-.24,1.515,0]},{id:'right',position:[.24,1.515,0]}]};
export const GARMENT_CLEARANCE = {schema:'garment-rack-front-v1',front:{min:[-.44,.25],max:[.44,.85]}};
const same=(a,b)=>a===b || (a && b && typeof a==='object' && typeof b==='object' &&
  Array.isArray(a)===Array.isArray(b) && Object.keys(a).length===Object.keys(b).length &&
  Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));

export function garmentSlotTransform(slotId) {
  const slot=GARMENT_RAIL.slots.find(s=>s.id===slotId);
  return slot ? {position:[...slot.position],yaw:0} : null;
}

export function validateGarmentResource(r,fail,path=r.id) {
  const rack=r.mountRole===RACK || r.productionBranch===RACK || r.garmentRail!==undefined || r.clearance?.schema===GARMENT_CLEARANCE.schema;
  const garment=r.mountRole===GARMENT || r.productionBranch===GARMENT || r.mount==='garment-rail';
  if(!rack&&!garment)return;
  const role=rack?RACK:GARMENT;
  const footprint=rack?{center:[0,0],halfSize:[.5,.25],blocking:true}:{center:[0,0],halfSize:[.07,.216],blocking:false};
  const mounting=rack?{origin:'bottom',width:1,height:1.8,depth:.5}:HANGING_ENVELOPE;
  if(r.mountRole!==role||r.productionBranch!==role||r.category!=='decor'||r.asset?.format!=='glb'||
      r.mount!==(rack?'floor-surface':'garment-rail')||r.parent!==(rack?'room.floor':RACK)||
      !same(r.footprint,footprint)||!same(r.mounting,mounting)||!same(r.usePoints,[])||!same(r.stateDefaults,{})||
      r.coordinates?.units!=='metres'||r.coordinates?.up!=='+Y'||r.coordinates?.forward!=='+Z'||
      ['surface','supportSurfaces','supportNodes','supportMotion','movingParts','stateSchema','stateSemantics','light',
       'display','capacity','cablePorts','cableConnection','mirrorSurface','clockDisplay','windowSystem','informationSurface',
       'informationContent','backdropRoll'].some(key=>r[key]!==undefined)||
      (rack?!same(r.garmentRail,GARMENT_RAIL)||!same(r.clearance,GARMENT_CLEARANCE):r.clearance!==undefined))
    fail('invalid-garment-contract',path,'Expected the fixed static open rack or hanging garment contract.');
}

export function attachGarment(nodes,resources,node,op,fail) {
  const host=nodes.find(n=>n.id===op.parentId),old=nodes.find(n=>n.id===node.parentId);
  const role=n=>resources.get(n?.resource?.id+'@'+n?.resource?.version)?.mountRole;
  const transform=garmentSlotTransform(op.slotId);
  if(!same(Object.keys(op).sort(),['id','parentId','slotId','type'])||node.kind!=='facility'||role(node)!==GARMENT||
      role(old)!==RACK||role(host)!==RACK||!transform)
    fail('invalid-garment-attachment',node.id,'Choose a hanging garment and a valid rail slot on an open rack.');
  if(old.parentId!==host.parentId)
    fail('cross-room-garment',node.id,'Both racks must belong to the same room or public area.');
  node.parentId=host.id;
  node.attachment={slotId:op.slotId};
  node.transform=transform;
}

// The front reserve is a room-local layout constraint. It produces no actor use point or navigation obstacle.
export function validateGarmentPlacement(derived,pointInTransform,localPoint,fail) {
  const occupied=new Map();
  for(const f of derived.facilities){
    if(f.resource.mountRole===GARMENT){
      const n=f.node,host=derived.nodes.get(n.parentId);
      const slotId=n.attachment?.slotId,slot=garmentSlotTransform(slotId);
      if(!same(n.attachment,{slotId}) || !slot || host?.kind!=='facility' ||
          derived.resources.get(host.resource.id+'@'+host.resource.version)?.mountRole!==RACK)
        fail('invalid-garment-attachment',n.id,'A hanging garment requires one left or right slot on its parent rack.');
      if(!slot.position.every((v,i)=>Math.abs(v-n.transform.position[i])<=EPS)||Math.abs(n.transform.yaw)>EPS)
        fail('invalid-garment-fit',n.id,'The garment hook must stay at the exact rail position and orientation.');
      const key=JSON.stringify([host.id,slotId]);
      if(occupied.has(key))fail('garment-slot-occupied',n.id,'Both garments claim the same rail slot.',{otherId:occupied.get(key)});
      occupied.set(key,n.id);
    }
    if(f.resource.mountRole!==RACK)continue;
    const room=derived.nodes.get(f.roomId),owner=derived.worlds.get(f.roomId);
    const {front}=f.resource.clearance;
    const corners=[front.min[0],front.max[0]].flatMap(x=>[front.min[1],front.max[1]].map(z=>pointInTransform(f.world,[x,0,z])));
    for(const p of corners){
      const [x,,z]=localPoint(owner,p);
      if(Math.abs(x)>room.bounds.width/2-.1+EPS||Math.abs(z)>room.bounds.depth/2-.1+EPS)
        fail('outside-garment-clearance',f.id,'The entire front working area must remain inside its room walls.');
    }
    const xs=corners.map(p=>p[0]),zs=corners.map(p=>p[2]);
    const low=[Math.min(...xs),Math.min(...zs)],high=[Math.max(...xs),Math.max(...zs)];
    const blocker=derived.obstacles.find(b=>b.floorId===f.floorId&&b.id!==f.id&&
      low.every((v,i)=>v<b.max[i]-EPS&&high[i]>b.min[i]+EPS));
    if(blocker)fail('blocked-garment-clearance',f.id,'The front working area is occupied.',{obstacleId:blocker.id});
  }
}
