// Company navigation supplies already padded world-space obstacle bounds.
// Both endpoints must stay in the actor's room, independently of the camera.
export function createFacilityNavigation(scene, floorId, roomId, actorObstacles=()=>[]) {
  const {regions, obstacles} = scene.navigation(floorId);
  const region = regions.find(item => item.id === roomId);
  if (!region) throw Error('unknown-actor-room');
  const {position, yaw} = region.transform;
  function inside([x,,z]) {
    const dx=x-position[0], dz=z-position[2];
    return Math.abs(Math.cos(yaw)*dx-Math.sin(yaw)*dz) <= region.bounds.width/2-region.inset &&
      Math.abs(Math.sin(yaw)*dx+Math.cos(yaw)*dz) <= region.bounds.depth/2-region.inset;
  }
  function intersects(a,b,o) {
    let first=0,last=1;
    for (const [axis,center,half] of [[0,o.x,o.hw],[2,o.z,o.hd]]) {
      const delta=b[axis]-a[axis], offset=a[axis]-center;
      if (Math.abs(delta)<1e-10) {
        if (Math.abs(offset)>=half) return false;
      } else {
        const lo=(-half-offset)/delta, hi=(half-offset)/delta;
        first=Math.max(first,Math.min(lo,hi));
        last=Math.min(last,Math.max(lo,hi));
        if (last<=first) return false;
      }
    }
    return true;
  }
  function clear(a,b,contactFacility=null,people=actorObstacles()) {
    return inside(a) && inside(b) && !obstacles.some(o => o.instanceId!==contactFacility && intersects(a,b,o)) &&
      !people.some(o=>intersects(a,b,o));
  }
  function route(start,end) {
    const people=actorObstacles(),passable=(a,b)=>clear(a,b,null,people);
    if (passable(start,end)) return [end];
    if (!passable(start,start) || !passable(end,end)) throw Error('seat-path-unreachable');
    const points=[start,end];
    for (const o of [...obstacles,...people]) {
      for (const signX of [-1,1]) for (const signZ of [-1,1]) {
        const corner=[o.x+signX*(o.hw+.01),start[1],o.z+signZ*(o.hd+.01)];
        if (passable(corner,corner)) points.push(corner);
      }
    }
    const distance=points.map(()=>Infinity), previous=[], visited=new Set();
    distance[0]=0;
    while (true) {
      let nearest=-1;
      for (let i=0;i<points.length;i++) {
        if (!visited.has(i) && distance[i]<(nearest<0?Infinity:distance[nearest])) nearest=i;
      }
      if (nearest<0) throw Error('seat-path-unreachable');
      if (nearest===1) break;
      visited.add(nearest);
      for (let i=1;i<points.length;i++) {
        if (visited.has(i)) continue;
        const a=points[nearest], b=points[i];
        const cost=distance[nearest]+Math.hypot(a[0]-b[0],a[2]-b[2]);
        if (cost<distance[i] && passable(a,b)) { distance[i]=cost;previous[i]=nearest; }
      }
    }
    const path=[];
    for (let i=1;i!==0;i=previous[i]) path.push(points[i]);
    return path.reverse();
  }
  return {route,clear,region,scene};
}

export function parkingRoute(nav,point,start,clearance,leavesApproachOpen) {
  const yaw=point.transform.yaw,side=[Math.cos(yaw),-Math.sin(yaw)],front=[Math.sin(yaw),Math.cos(yaw)];
  const a=point.transform.position,b=point.approachPosition;
  // The complete seat-to-approach segment includes the seated torso, knees
  // and the incoming standing anchor. Prefer a short lateral step from the
  // authored exit, keeping the next occupant's whole entry corridor open.
  const dx=b[0]-a[0],dz=b[2]-a[2],lengthSq=dx*dx+dz*dz;
  const {exitPosition:exit}=point;
  const candidates=[[1,0],[-1,0],[1,.6],[-1,.6],[0,1.5]];
  // A desk can face the seat while equipment blocks its other side. Search
  // farther into this same room if parking immediately beside the exit would
  // close the only usable aisle. The cell size is the two-body clearance.
  const farthest=Math.ceil(Math.hypot(nav.region.bounds.width,nav.region.bounds.depth)/clearance);
  for (let ring=1;ring<=farthest;ring++) {
    for(let x=-ring;x<=ring;x++) for(let z=-ring;z<=ring;z++)
      if (Math.max(Math.abs(x),Math.abs(z))===ring) candidates.push([x,z]);
  }
  for (const [across,out] of candidates) {
    const p=[exit[0]+clearance*(side[0]*across+front[0]*out),exit[1],
      exit[2]+clearance*(side[1]*across+front[1]*out)];
    const u=lengthSq?Math.min(1,Math.max(0,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/lengthSq)):0;
    if (Math.hypot(p[0]-a[0]-dx*u,p[2]-a[2]-dz*u)<clearance-.001 ||
        !nav.clear(p,p) || !leavesApproachOpen(p)) continue;
    try {return nav.route(start,p);} catch { /* Try the remaining sides in this room. */ }
  }
  throw Error('seat-waiting-space-blocked');
}
