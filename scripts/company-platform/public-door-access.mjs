import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {CompanyError} from '../../prototype/src/company/document.js';
import {overlapsObstacle} from '../../prototype/src/company/wardrobe-footprints.js';
import {scanRoomMeshes} from './check-training-clearance.mjs';

const spacing = .20, contact = .001;
const round = n => Math.round(n * 1e7) / 1e7;
const xz = v => [round(v.x), round(v.z)];
const at = p => new T.Vector3(p[0], 0, p[1]);

// All queries are in one region's own coordinates. Include neighbouring meshes: a prop may
// be owned by the corridor while its material surface projects into the door or the room.
export function clearanceQuery(scene, derived, facilities, region, radius, height) {
  const shapes = [];
  const {worldToRoom} = scanRoomMeshes(scene, region, facilities, [], [], (object, owner, transform, bounds) => {
    if (bounds.max.y < contact || bounds.min.y > height - contact) return;
    shapes.push({object, id:owner?.id ?? object.name, transform:transform.clone(), bounds:bounds.clone()});
  });
  const footprints = derived.obstacles.filter(o => o.floorId === derived.floorIds.get(region.id) && o.resource.mount !== 'portal-door').map(o => {
    const corners = o.corners.map(p => new T.Vector3(...p).applyMatrix4(worldToRoom));
    const bounds = new T.Box3().setFromPoints(corners);
    const outline = o.polygon ? corners : [corners[0], corners[1], corners[3], corners[2]];
    return {id:o.id, min:xz(bounds.min), max:xz(bounds.max), polygon:outline.map(xz)};
  });
  function triangles(shape) {
    if (shape.triangles) return shape.triangles;
    const {object, transform} = shape, g = object.geometry, ix = g.index;
    const points = Array.from({length:g.attributes.position.count}, (_, i) =>
      object.getVertexPosition(i, new T.Vector3()).applyMatrix4(transform));
    const vertex = i => points[ix ? ix.getX(i) : i];
    const start = g.drawRange.start, end = Math.min(ix?.count ?? points.length, start + g.drawRange.count);
    shape.triangles = [];
    for (let i = start; i + 2 < end; i += 3) shape.triangles.push(new T.Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
    return shape.triangles;
  }
  return (a, b) => {
    // Centre paths consist of axis-aligned segments, so this box is their continuous square sweep.
    const r = radius - contact;
    const box = new T.Box3(new T.Vector3(Math.min(a[0],b[0])-r,contact,Math.min(a[1],b[1])-r),
      new T.Vector3(Math.max(a[0],b[0])+r,height-contact,Math.max(a[1],b[1])+r));
    const sweep = {min:xz(box.min), max:xz(box.max)};
    const footprint = footprints.find(p => overlapsObstacle(p, sweep));
    if (footprint) return footprint.id;
    return shapes.find(s => box.intersectsBox(s.bounds) && triangles(s).some(t => box.intersectsTriangle(t)))?.id;
  };
}

// Include endpoints explicitly. Four-neighbour edges are swept in full (a clear vertex
// on either side of a thin panel is insufficient). Return actual waypoints as evidence.
function reach(region, radius, block, start, goals) {
  const size = [region.bounds.width,region.bounds.depth];
  const inside = p => size.every((span,i) => Math.abs(p[i]) <= span/2-radius+1e-6);
  if (!inside(start) || block(start,start)) return new Map();
  const axes = size.map((span,i) => {
    const lo = -span/2+radius, hi = span/2-radius;
    const values = [lo,hi,start[i],...goals.filter(inside).map(p => p[i])];
    for (let n=0; lo+n*spacing < hi; n++) values.push(lo+n*spacing);
    return [...new Set(values.map(round))].sort((a,b) => a-b);
  });
  const [xs,zs] = axes, n = xs.length;
  const key = p => xs.indexOf(round(p[0])) + zs.indexOf(round(p[1]))*n;
  const point = k => [xs[k%n],zs[Math.floor(k/n)]];
  const first = key(start), queue = [first], parent = new Map([[first,-1]]);
  const need = new Set(goals.filter(inside).map(key));
  for (let i=0; i<queue.length && need.size; i++) {
    const k=queue[i], x=k%n, z=Math.floor(k/n);
    need.delete(k);
    const neighbours=[];
    if(x) neighbours.push(k-1);
    if(x+1<n) neighbours.push(k+1);
    if(z) neighbours.push(k-n);
    if(z+1<zs.length) neighbours.push(k+n);
    for(const next of neighbours) if(!parent.has(next) && !block(point(k),point(next))) {
      parent.set(next,k); queue.push(next);
    }
  }
  const found = new Map();
  for(const goal of goals) {
    if(!inside(goal) || !parent.has(key(goal))) continue;
    const line=[];
    for(let k=key(goal); k!==-1; k=parent.get(k)) {
      const p=point(k),a=line.at(-2),b=line.at(-1);
      if(a && (a[0]===b[0] && b[0]===p[0] || a[1]===b[1] && b[1]===p[1])) line.pop();
      line.push(p);
    }
    found.set(goal,line.reverse());
  }
  return found;
}

export function checkRoomDoorAccess({scene,derived,facilities,floor,placement,room,portalId,targets,radius,height}) {
  const choices = [];
  for(const conn of floor.connections) {
    const side = [conn.from,conn.to].find(p=>p.regionId===room.id);
    if(!side) continue;
    const peer = side===conn.from ? conn.to : conn.from;
    const region = derived.nodes.get(peer.regionId);
    if (region.kind==='area' || conn.id===portalId) choices.push({id:conn.id,side,region});
  }
  for(const side of floor.exteriorEntrances) if(side.regionId===room.id) choices.push({id:side.id,side});
  choices.sort((a,b)=>Number(b.id===portalId)-Number(a.id===portalId));
  const report = {}, blocked = [], blockers = new Set();
  const roomGroup=scene.root.getObjectByName(room.id), roomBlock=clearanceQuery(scene,derived,facilities,room,radius,height);
  for(const {id,side,region} of choices) {
    if((side.height??Infinity)<height || side.width<2*radius) continue;
    const along = ['north','south'].includes(side.edge) ? 0 : 1, normal = 1-along;
    const inward = ['north','west'].includes(side.edge) ? 1 : -1;
    const center=[side.local.center[0],side.local.center[2]],half=side.width/2-radius;
    const offsets=[0,-half,half];
    for(let x=-half; x<half; x+=spacing/2) offsets.push(x);
    const peerGroup=region && scene.root.getObjectByName(region.id);
    const lanes=[];
    for(const offset of new Set(offsets.map(round))) {
      const threshold=[...center]; threshold[along]+=offset;
      const inner=[...threshold],outer=[...threshold]; inner[normal]+=inward*radius;
      outer[normal]-=inward*radius;
      // Exterior entries have no modelled exterior ground. Check the threshold and the indoor half only.
      const hit=roomBlock(region ? outer : threshold, inner);
      if(hit) {blockers.add(hit);continue;}
      const peerEnd=region && xz(peerGroup.worldToLocal(roomGroup.localToWorld(at(outer))));
      lanes.push({inner:inner.map(round),threshold:threshold.map(round),peerEnd});
    }
    const entry = region && placement.rooms.find(r=>r.id===region.id).entry;
    const incoming = region && lanes.length ? reach(region,radius,clearanceQuery(scene,derived,facilities,region,radius,height),
      [entry[0],entry[2]],lanes.map(l=>l.peerEnd)) : null;
    const open=lanes.filter(l=>!region || incoming?.has(l.peerEnd));
    for(const [role,target] of Object.entries(targets)) {
      if(report[role] || !open.length) continue;
      const joined=reach(room,radius,roomBlock,target,open.map(l=>l.inner));
      const lane=open.find(l=>joined.has(l.inner));
      if(lane) report[role]={portalId:id,fromRegion:region?.id ?? null,threshold:lane.threshold,
        approach:incoming?.get(lane.peerEnd) ?? [],inside:joined.get(lane.inner).toReversed()};
    }
    if(Object.keys(report).length===Object.keys(targets).length) return report;
    blocked.push(id);
  }
  throw new CompanyError('room-door-unreachable',portalId,'No clear physical route from a connected entrance to every authored indoor route.',
    {roomId:room.id,missing:Object.keys(targets).filter(k=>!report[k]),checkedPortals:blocked,thresholdBlockers:[...blockers]});
}
