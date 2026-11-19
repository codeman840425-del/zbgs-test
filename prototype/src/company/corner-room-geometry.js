import * as T from 'three';
import {CompanyError} from './document.js';
import {triangles,rayHit} from './room-mesh-geometry.js';

const contact=.001, penetration=.0001;
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const rounded=n=>Number(n.toFixed(7))||0, tuple=p=>p.toArray().map(rounded);
const name=r=>r.object.userData.name||r.object.name;

// Broad phase only: a zero-thickness mesh inside a volume is still a possible
// intrusion. Only an actual separation or coincidence of outer limits is clear.
function mayPenetrate(a,b){
  return ['x','y','z'].every(k=>a.max[k]>b.min[k]+penetration && b.max[k]>a.min[k]+penetration);
}
function surfaces(record){
  if(record.cornerSurfaces)return record.cornerSurfaces;
  record.cornerSurfaces=[];
  for(const tri of triangles(record)){
    const normal=tri.getNormal(vec());
    if(normal.lengthSq()<.5)continue;
    record.cornerSurfaces.push({tri,normal,corners:[tri.a,tri.b,tri.c],box:new T.Box3().setFromPoints([tri.a,tri.b,tri.c])});
  }
  return record.cornerSurfaces;
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
function penetrationWitness(a,b,contains){
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

export function measureCornerAbsorber(room,panel,matrix,records,binding,contains){
  if(!binding)throw new CompanyError('corner-absorber-scene',panel.id,'Missing the derived two-wall corner attachment.');
  const own=records.filter(r=>r.owner?.id===panel.id),allWalls=records.filter(r=>r.wallFace&&r.object.userData.roomId===room.id);
  if(!own.length)throw new CompanyError('corner-absorber-scene',panel.id,'The loaded corner absorber has no visible installed mesh.');
  const bearings={};
  for(const {plane,edge} of binding.bearings){
    const inward=(plane==='x'?vec(1,0,0):vec(0,0,1)).transformDirection(matrix);
    const patch=panel.resource.cornerMount.bearings[plane],walls=allWalls.filter(r=>r.object.userData.edge===edge),samples=[];
    for(const tx of [.01,.5,.99])for(const ty of [.01,.5,.99]){
      const along=T.MathUtils.lerp(...patch.along,tx),y=T.MathUtils.lerp(...patch.y,ty);
      const p=(plane==='x'?vec(0,y,along):vec(along,y,0)).applyMatrix4(matrix);
      const roomSide=p.clone().addScaledVector(inward,.025),back=p.clone().addScaledVector(inward,-.025);
      const fitting=rayHit(own,back,roomSide),wall=rayHit(walls,roomSide,back);
      if(!fitting||!wall||fitting.normal.dot(inward)>-.999||wall.normal.dot(inward)<.999||
          p.distanceTo(fitting.point)>contact||p.distanceTo(wall.point)>contact||fitting.point.distanceTo(wall.point)>contact)
        throw new CompanyError('corner-absorber-room-bearing',panel.id,'Both installed bearing surfaces need their own solid room walls.',
          {corner:binding.corner,plane,edge,point:tuple(p),fitting:fitting&&name(fitting.record),wall:wall?.record.object.name??null});
      samples.push({point:tuple(p),mesh:name(fitting.record),meshPoint:tuple(fitting.point),wall:wall.record.object.name,
        wallPoint:tuple(wall.point),gapM:rounded(fitting.point.distanceTo(wall.point))});
    }
    bearings[plane]={edge,samples};
  }
  const occupied=new T.Box3();for(const r of own)occupied.union(r.bounds);
  for(const other of records){
    if(other.owner?.id===panel.id||!mayPenetrate(occupied,other.bounds))continue;
    for(const ownPart of own){
      const witness=penetrationWitness(ownPart,other,contains);if(!witness)continue;
      throw new CompanyError(other.owner?'corner-absorber-room-occupied':'corner-absorber-room-wall',panel.id,
        'Installed triangles intrude into the corner screen.',{corner:binding.corner,component:name(ownPart),other:other.owner?.id??other.object.name,mesh:name(other),...witness});
    }
  }
  return {id:panel.id,roomId:room.id,mountRole:panel.resource.mountRole,corner:binding.corner,resource:panel.node.resource,sha256:panel.resource.asset.sha256,
    position:tuple(vec().setFromMatrixPosition(matrix)),envelope:{min:tuple(occupied.min),max:tuple(occupied.max)},bearings};
}
