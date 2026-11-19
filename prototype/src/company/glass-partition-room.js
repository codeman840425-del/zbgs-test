import * as T from 'three';
import {CompanyError} from './document.js';
import {createCompanyScene} from './render.js';
import {rayHit} from './room-mesh-geometry.js';
import {installedRoomMeshes,mayPenetrate,penetrationWitness} from './installed-mesh-geometry.js';

const role='glass-partition',contactTolerance=.001;
const isPartition=f=>f.resource.mountRole===role;
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const tuple=p=>p.toArray().map(n=>Number(n.toFixed(7))||0);
const name=r=>r.object.userData.name||r.object.name;

export function shouldCheckGlassPartitions(document,derivedOrOptions){
  const derived=derivedOrOptions.derived??derivedOrOptions;
  if(derived.facilities)return derived.facilities.some(isPartition);
  const ids=new Set(derivedOrOptions.catalog.resources.filter(r=>r.mountRole===role).map(r=>r.id+'@'+r.version));
  return document.nodes.some(n=>n.kind==='facility'&&ids.has(n.resource.id+'@'+n.resource.version));
}

export function glassPartitionFloors(document,derived){
  const floors=new Map();
  for(const part of derived.facilities.filter(isPartition)){
    if(!floors.has(part.floorId))floors.set(part.floorId,new Map());
    const rooms=floors.get(part.floorId);
    if(!rooms.has(part.roomId))rooms.set(part.roomId,[]);
    rooms.get(part.roomId).push(part);
  }
  return [...floors].map(([id,rooms])=>{
    const facilities=derived.facilities.filter(f=>f.floorId===id);
    return {id,facilities,bindings:[...rooms].map(([roomId,partitions])=>({
      room:derived.nodes.get(roomId),partitions,rule:{roomId,partitions:partitions.map(p=>p.id)}
    })),resources:[...facilities,...derived.surfaceFinishes.filter(f=>f.floorId===id)].map(f=>f.resource)};
  });
}

function measurePartition(room,partition,matrix,records){
  const own=records.filter(r=>r.owner?.id===partition.id),{width,height,depth}=partition.resource.mounting;
  const bounds=new T.Box3();
  for(const r of own)bounds.union(r.bounds);
  const bearings={};
  for(const surface of ['floor','ceiling']){
    const y=surface==='floor'?0:height,inward=vec(0,surface==='floor'?1:-1,0);
    const support=records.filter(r=>r.structure===surface&&r.object.userData.roomId===room.id);
    const samples=[];
    for(const u of [-.49,-.25,0,.25,.49])for(const v of [-.375,0,.375]){
      const p=vec(u*width,y,v*depth).applyMatrix4(matrix);
      const inside=p.clone().addScaledVector(inward,.025),outside=p.clone().addScaledVector(inward,-.025);
      const fitting=rayHit(own,outside,inside),slab=rayHit(support,inside,outside);
      if(!slab||!fitting||slab.normal.dot(inward)<.999||fitting.normal.dot(inward)>-.999||
          slab.point.distanceTo(p)>contactTolerance||fitting.point.distanceTo(p)>contactTolerance||
          slab.point.distanceTo(fitting.point)>contactTolerance)
        throw new CompanyError('glass-partition-room-bearing',partition.id,'The installed rail must bear on its own room’s structural surface.',
          {surface,roomId:room.id,point:tuple(p),rail:fitting&&name(fitting.record),slab:slab?.record.object.name??null,
            railPoint:fitting&&tuple(fitting.point),slabPoint:slab&&tuple(slab.point)});
      samples.push({point:tuple(p),mesh:name(fitting.record),meshPoint:tuple(fitting.point),slab:slab.record.object.name,
        slabPoint:tuple(slab.point),gapM:Number(slab.point.distanceTo(fitting.point).toFixed(7))||0});
    }
    bearings[surface]={samples};
  }
  for(const other of records){
    if(other.owner?.id===partition.id||!mayPenetrate(bounds,other.bounds))continue;
    for(const piece of own){
      const witness=penetrationWitness(piece,other);
      if(witness)throw new CompanyError(other.owner?'glass-partition-room-occupied':'glass-partition-room-wall',partition.id,
        'An installed glazing, rail or frame intersects another physical surface.',{roomId:room.id,
          component:name(piece),other:other.owner?.id??other.object.name,mesh:name(other),structure:other.structure??null,...witness});
    }
  }
  return {id:partition.id,roomId:room.id,resource:partition.node.resource,sha256:partition.resource.asset.sha256,
    position:tuple(vec().setFromMatrixPosition(matrix)),envelope:{min:tuple(bounds.min),max:tuple(bounds.max)},bearings};
}

export function inspectGlassPartitionObjects(derived,prepared){
  const {floorId,groups}=prepared,parts=derived.facilities.filter(f=>f.floorId===floorId&&isPartition(f));
  if(!parts.length)return [];
  const partitions=[];
  for(const roomId of new Set(parts.map(p=>p.roomId))){
    const room=derived.nodes.get(roomId),group=groups.get(roomId);
    if(!group)throw new CompanyError('glass-partition-room-bearing',roomId,'Missing the partition’s prepared room.');
    const {records,worldToRoom}=installedRoomMeshes(group,prepared);
    for(const part of parts.filter(p=>p.roomId===roomId)){
      const matrix=worldToRoom.clone().multiply(groups.get(part.id).matrixWorld);
      partitions.push(measurePartition(room,part,matrix,records));
    }
  }
  return [{ok:true,floorId,partitions}];
}

export function measureGlassPartitionFloor(document,derived,placement,group,{catalog,templates,assetLibrary}){
  const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
  try{return scene.glassPartitionMeasurements();}
  finally{scene.dispose();}
}
