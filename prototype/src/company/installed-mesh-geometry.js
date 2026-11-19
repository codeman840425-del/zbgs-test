import * as T from 'three';
import {triangles} from './room-mesh-geometry.js';

const penetration=.0001;
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const tuple=p=>p.toArray().map(n=>Number(n.toFixed(7))||0);

// Point enclosed by a closed triangle shell; a segment or AABB test alone misses an entire
// panel enclosed inside a larger solid. Open planes and rings need no fictitious solid interior.
export function insideClosedMesh(point,record){
  if(!record.bounds.containsPoint(point))return false;
  const a=vec(),b=vec(),c=vec(),cross=vec();
  let solidAngle=0;
  for(const t of triangles(record)){
    a.subVectors(t.a,point);b.subVectors(t.b,point);c.subVectors(t.c,point);
    const la=a.length(),lb=b.length(),lc=c.length();
    solidAngle+=2*Math.atan2(a.dot(cross.crossVectors(b,c)),la*lb*lc+a.dot(b)*lc+b.dot(c)*la+c.dot(a)*lb);
  }
  const turns=Math.abs(solidAngle)/(4*Math.PI);
  return turns>.99&&Math.abs(turns-Math.round(turns))<1e-5;
}

// Broad phase only: a zero-thickness mesh inside a volume is still a possible
// intrusion. Only an actual separation or coincidence of outer limits is clear.
export function mayPenetrate(a,b){
  return ['x','y','z'].every(k=>a.max[k]>b.min[k]+penetration && b.max[k]>a.min[k]+penetration);
}
function surfaces(record){
  if(record.solidSurfaces)return record.solidSurfaces;
  record.solidSurfaces=[];
  for(const tri of triangles(record)){
    const normal=tri.getNormal(vec());
    if(normal.lengthSq()<.5)continue;
    record.solidSurfaces.push({tri,normal,corners:[tri.a,tri.b,tri.c],box:new T.Box3().setFromPoints([tri.a,tri.b,tri.c])});
  }
  return record.solidSurfaces;
}
function inside(p,record,contains){
  if(!['x','y','z'].every(k=>p[k]>record.bounds.min[k]+penetration && p[k]<record.bounds.max[k]-penetration) || !contains(p,record))return false;
  // A winding test alone is ambiguous exactly on a face or at an edge.
  const closest=vec();
  return !surfaces(record).some(f=>f.box.distanceToPoint(p)<=penetration && f.tri.closestPointToPoint(p,closest).distanceToSquared(p)<=penetration**2);
}

// Allow tangency, shared edges and coplanar face contact. A transverse cut has
// an edge crossing the target face and either enters the solid or passes strictly
// through the interior of the triangle (also catches a projecting open sheet).
function cut(source,target,targetRecord,contains){
  const delta=vec(),point=vec(),probe=vec(),bary=vec();
  for(let i=0;i<3;i++){
    const a=source.corners[i],b=source.corners[(i+1)%3];
    const sa=delta.subVectors(a,target.tri.a).dot(target.normal);
    const sb=delta.subVectors(b,target.tri.a).dot(target.normal);
    if(!((sa < -penetration && sb > penetration)||(sb < -penetration && sa > penetration)))continue;
    const t=sa/(sa-sb);point.copy(a).lerp(b,t);
    if(!target.tri.getBarycoord(point,bary)||Math.min(bary.x,bary.y,bary.z)<-1e-8)continue;
    // Barycentric weights times the corresponding altitude are metric distances from edges.
    const area=2*target.tri.getArea(),c=target.corners;
    if(Math.min(bary.x*area/c[1].distanceTo(c[2]),bary.y*area/c[0].distanceTo(c[2]),bary.z*area/c[0].distanceTo(c[1]))>penetration)return point.clone();
    // In a triangulated quad the cut may lie on its diagonal. Probe both sides
    // of that seam so a render diagonal cannot turn a crossing into tangency.
    for(const end of [a,b]){
      const distance=point.distanceTo(end);
      probe.copy(point).lerp(end,Math.min(.5,4*penetration/distance));
      if(inside(probe,targetRecord,contains))return probe.clone();
    }
  }
  return null;
}
export function penetrationWitness(a,b,contains=insideClosedMesh){
  if(!mayPenetrate(a.bounds,b.bounds))return null;
  const common=a.bounds.clone().intersect(b.bounds),center=common.getCenter(vec());
  if(inside(center,a,contains)&&inside(center,b,contains))return {kind:'overlapping-solids',point:tuple(center)};
  const left=surfaces(a).filter(f=>f.box.intersectsBox(common)),right=surfaces(b).filter(f=>f.box.intersectsBox(common));
  // Enclosure can have no crossing boundary triangles (including a small piece
  // wholly inside a large body). Derive actual points, never a centre of an empty envelope.
  for(const [rows,against] of [[left,b],[right,a]]){
    const seen=new Set();
    for(const f of rows)for(const p of f.corners){
      if(seen.has(p))continue;seen.add(p);
      if(inside(p,against,contains))return {kind:'surface-inside-solid',point:tuple(p)};
    }
  }
  for(const f of left)for(const g of right){
    if(!f.box.intersectsBox(g.box))continue;
    const p=cut(f,g,b,contains)??cut(g,f,a,contains);
    if(p)return {kind:'intersecting-triangles',point:tuple(p)};
  }
  return null;
}

// Room-local solids are collected independently of camera cutaway and floor LOD.
// Descendant visibility still carries the installed state (open/hidden attachments).
export function installedRoomMeshes(roomGroup,{floorId,facilities,walls,floors=[],ceilings=[]}){
  const inverse=roomGroup.matrixWorld.clone().invert(), records=[];
  function record(object,owner,structure){
    if(!object.isMesh)return;
    const matrix=inverse.clone().multiply(object.matrixWorld);
    const geometry=object.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    records.push({object,owner,structure,wallFace:structure==='wall',matrix,bounds:geometry.boundingBox.clone().applyMatrix4(matrix)});
  }
  for(const slab of floors)record(slab,null,'floor');
  for(const slab of ceilings)record(slab,null,'ceiling');
  for(const wall of walls){
    record(wall,null,'wall');
    for(const trim of wall.children)if(trim.userData.baseboard)record(trim,null,'baseboard');
  }
  for(const facility of facilities.values()){
    if(facility.floorId!==floorId||(facility.resource.mountRole==='camera-mount'&&!facility.state.mounted))continue;
    record(facility.visual,facility);
    for(const branch of facility.visual.children)branch.traverseVisible(mesh=>record(mesh,facility));
  }
  return {records,worldToRoom:inverse};
}
