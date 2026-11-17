// Static authoring reserves. No actor, animation, task or occupancy ownership.
export const VANITY_CLEARANCE = {
  schema:'vanity-clearance-v1',
  knee:{min:[-.33,0,-.12],max:[.37,.70,.25]},
  front:{min:[-1,.25],max:[1,1.50]},
  seat:{mountRole:'vanity-chair-side-entry',position:[.02,0,.55],yaw:Math.PI},
};
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const equal=(a,b)=>JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
const EPS=1e-8;
// architecture.js places the full 0.10m wall thickness inside region bounds.
// This conservative reserve stays inside that inner face, including at doors.
const WALL_INSET=.1;
export function validateVanityResource(r,fail,path=r.id) {
  if(r.mountRole!=='vanity-table'&&r.clearance?.schema!=='vanity-clearance-v1'&&r.mountRole!=='vanity-chair-side-entry')return;
  if(r.mountRole==='vanity-chair-side-entry') {
    const p=r.usePoints?.[0];
    if(r.category!=='seat'||r.usePoints?.length!==1||!p||p.id!=='seat'||p.capacity!==1||p.seatHeight!==.47||p.yaw!==0||
        !equal(p.position,[0,0,0])||!equal(p.approach,[-.65,0,0])||!equal(p.exit,[.65,0,0])||
        !equal(p.clearance,{width:.7,depth:.65})||p.seatNodeId!=='chair-seat'||p.backNodeId!=='chair-back'||
        !equal(r.footprint,{center:[0,0],halfSize:[.275,.255],blocking:true})||!equal(r.stateDefaults,{}))
      fail('invalid-vanity-seat',path,'Expected the explicit side-entry seat contract; original chair semantics are not changed');
    return;
  }
  if(r.mountRole!=='vanity-table'||r.category!=='decor'||r.mount!=='floor-surface'||!r.asset||
      !equal(r.mounting,{origin:'bottom',width:1.10,height:.78,depth:.50})||
      !equal(r.footprint,{center:[0,0],halfSize:[.55,.25],blocking:true})||
      !equal(r.clearance,VANITY_CLEARANCE)||!equal(r.usePoints,[])||!equal(r.stateDefaults,{})||
      !equal(r.supportSurfaces,[{id:'top',center:[.02,0],topY:.78,halfSize:[.40,.22],clearanceHeight:.65}])||
      !equal(r.supportNodes,{top:'vanity-top'})||r.stateSchema!==undefined||r.stateSemantics!==undefined||
      r.movingParts||r.light||r.display||r.clockDisplay||r.mirrorSurface||r.informationSurface||r.informationContent||r.surface)
    fail('invalid-vanity-contract',path,'Expected the fixed static vanity-table v1 mounting, support and clearance contract');
}
function point(t,p) {const c=Math.cos(t.yaw),s=Math.sin(t.yaw);return[t.position[0]+c*p[0]+s*p[2],t.position[1]+p[1],t.position[2]-s*p[0]+c*p[2]];}
function local(t,p) {const x=p[0]-t.position[0],z=p[2]-t.position[2],c=Math.cos(t.yaw),s=Math.sin(t.yaw);return[c*x-s*z,p[1]-t.position[1],s*x+c*z];}
const sameYaw=(a,b)=>Math.abs(Math.sin(a-b))<EPS&&Math.cos(a-b)>0;
const overlaps=(a,b)=>a.min.every((v,i)=>v<b.max[i]-EPS&&a.max[i]>b.min[i]+EPS);

export function validateVanityPlacement(derived,fail) {
  const tables=derived.facilities.filter(f=>f.resource.mountRole==='vanity-table');
  const seats=derived.facilities.filter(f=>f.resource.mountRole==='vanity-chair-side-entry');
  for(const seat of seats)if(seat.node.parentId!==seat.roomId)
    fail('invalid-vanity-seat-parent',seat.id,'The side-entry chair must be an independent direct child of its room or public area');
  const assigned=new Set(),checked=[];
  for(const table of tables) {
    const c=table.resource.clearance,room=derived.nodes.get(table.roomId),roomWorld=derived.worlds.get(table.roomId);
    if(!room||!roomWorld)fail('missing-vanity-room',table.id,'Vanity must belong to a room or public area');
    const corners=[c.front.min[0],c.front.max[0]].flatMap(x=>[c.front.min[1],c.front.max[1]].map(z=>point(table.world,[x,0,z])));
    for(const p of corners) {
      const q=local(roomWorld,p);
      if(Math.abs(q[0])>room.bounds.width/2-WALL_INSET+EPS||Math.abs(q[2])>room.bounds.depth/2-WALL_INSET+EPS)
        fail('outside-vanity-clearance',table.id,'The complete front reserve must stay inside its own room or public area');
    }
    const reserve={min:[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[2]))],max:[Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[2]))]};
    const seatPosition=point(table.world,c.seat.position);
    const matching=seats.filter(s=>s.roomId===table.roomId&&s.floorId===table.floorId&&s.world.position.every((v,i)=>Math.abs(v-seatPosition[i])<EPS)&&sameYaw(s.world.yaw,table.world.yaw+c.seat.yaw));
    if(matching.length>1)fail('duplicate-vanity-seat',table.id,'Only one correctly placed side-entry chair may share the front reserve');
    const seat=matching[0];
    if(seat) {
      if(assigned.has(seat.id))fail('duplicate-vanity-seat',seat.id,'A seat cannot be assigned to more than one vanity');
      assigned.add(seat.id);
    }
    for(const obstacle of derived.obstacles)if(obstacle.floorId===table.floorId&&obstacle.id!==table.id&&obstacle.id!==seat?.id&&overlaps(reserve,obstacle))
      fail('blocked-vanity-clearance',table.id,'A third-party blocking facility intrudes into the front reserve',{obstacleId:obstacle.id});
    checked.push({facilityId:table.id,roomId:table.roomId,floorId:table.floorId,seatId:seat?.id??null,reserve});
  }
  for(const seat of seats)if(!assigned.has(seat.id))fail('unpaired-vanity-seat',seat.id,'Side-entry vanity seat requires an exact same-room table pairing; move or remove the set explicitly');
  return checked;
}
