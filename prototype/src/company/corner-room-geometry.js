import * as T from 'three';
import {CompanyError} from './document.js';
import {mayPenetrate,penetrationWitness} from './installed-mesh-geometry.js';
import {rayHit} from './room-mesh-geometry.js';

const contact=.001;
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const rounded=n=>Number(n.toFixed(7))||0, tuple=p=>p.toArray().map(rounded);
const name=r=>r.object.userData.name||r.object.name;

export function measureCornerAbsorber(room,panel,matrix,records,binding){
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
      const witness=penetrationWitness(ownPart,other);if(!witness)continue;
      throw new CompanyError(other.owner?'corner-absorber-room-occupied':'corner-absorber-room-wall',panel.id,
        'Installed triangles intrude into the corner screen.',{corner:binding.corner,component:name(ownPart),other:other.owner?.id??other.object.name,mesh:name(other),...witness});
    }
  }
  return {id:panel.id,roomId:room.id,mountRole:panel.resource.mountRole,corner:binding.corner,resource:panel.node.resource,sha256:panel.resource.asset.sha256,
    position:tuple(vec().setFromMatrixPosition(matrix)),envelope:{min:tuple(occupied.min),max:tuple(occupied.max)},bearings};
}
