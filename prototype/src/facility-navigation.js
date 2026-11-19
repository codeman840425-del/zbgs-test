// Company navigation supplies already padded world-space obstacle bounds.
// Both endpoints must stay in the actor's room, independently of the camera.
export function createFacilityNavigation(scene, floorId, roomId) {
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
  function clear(a,b,contactFacility=null) {
    return inside(a) && inside(b) && !obstacles.some(o => o.instanceId!==contactFacility && intersects(a,b,o));
  }
  function route(start,end) {
    if (clear(start,end)) return [end];
    if (!clear(start,start) || !clear(end,end)) throw Error('seat-path-unreachable');
    const points=[start,end];
    for (const o of obstacles) {
      for (const signX of [-1,1]) for (const signZ of [-1,1]) {
        const corner=[o.x+signX*(o.hw+.01),start[1],o.z+signZ*(o.hd+.01)];
        if (clear(corner,corner)) points.push(corner);
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
        if (cost<distance[i] && clear(a,b)) { distance[i]=cost;previous[i]=nearest; }
      }
    }
    const path=[];
    for (let i=1;i!==0;i=previous[i]) path.push(points[i]);
    return path.reverse();
  }
  return {route,clear,region};
}
