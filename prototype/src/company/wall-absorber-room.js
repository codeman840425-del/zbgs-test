import * as T from 'three';
import {CompanyError} from './document.js';
import {createCompanyScene} from './render.js';
import {triangles,rayHit} from './room-mesh-geometry.js';
import {insideClosedMesh,installedRoomMeshes} from './installed-mesh-geometry.js';
import {measureCornerAbsorber} from './corner-room-geometry.js';

const role='wall-absorber-panel';
const contactTolerance=.001, overlapTolerance=.0001;
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const tuple=p=>p.toArray().map(n=>Number(n.toFixed(7))||0);
const part=r=>r.object.userData.name||r.object.name;
const cornerRole='corner-absorber';
const isPanel=f=>f.resource.mountRole===role||f.resource.mountRole===cornerRole;

export function shouldCheckWallAbsorbers(document,derivedOrOptions){
  if(derivedOrOptions?.facilities)return derivedOrOptions.facilities.some(isPanel);
  const panels=new Set(derivedOrOptions.catalog.resources.filter(r=>r.mountRole===role||r.mountRole===cornerRole).map(r=>r.id+'@'+r.version));
  return document.nodes.some(n=>n.kind==='facility'&&panels.has(n.resource.id+'@'+n.resource.version));
}

export function wallAbsorberFloors(document,derived){
  const floors=new Map();
  for(const panel of derived.facilities.filter(isPanel)){
    if(!floors.has(panel.floorId))floors.set(panel.floorId,new Map());
    const rooms=floors.get(panel.floorId);
    if(!rooms.has(panel.roomId))rooms.set(panel.roomId,[]);
    rooms.get(panel.roomId).push(panel);
  }
  return [...floors].map(([id,rooms])=>{
    const facilities=derived.facilities.filter(f=>f.floorId===id);
    return {id,facilities,bindings:[...rooms].map(([roomId,panels])=>({
      room:derived.nodes.get(roomId),panels,rule:{roomId,panels:panels.map(p=>p.id)}
    })),resources:[...facilities,...derived.surfaceFinishes.filter(f=>f.floorId===id)].map(f=>f.resource)};
  });
}

function installationBox(f,transform){
  const {width,height,depth}=f.resource.mounting;
  return new T.Box3(vec(-width/2,-height/2,0),vec(width/2,height/2,depth)).applyMatrix4(transform);
}

function measurePanel(room,panel,matrix,records,panels,transformFor){
  const own=records.filter(r=>r.owner?.id===panel.id),bounds=installationBox(panel,matrix);
  const interior=bounds.clone().expandByScalar(-overlapTolerance);
  const normal=vec(0,0,1).transformDirection(matrix),origin=vec().setFromMatrixPosition(matrix);
  const walls=records.filter(r=>r.wallFace&&r.object.userData.roomId===room.id);
  const box=b=>({min:tuple(b.min),max:tuple(b.max)});

  for(const other of panels){
    if(other===panel)continue;
    const otherBox=installationBox(other,transformFor(other));
    if(interior.intersectsBox(otherBox))
      throw new CompanyError('wall-absorber-occupied',panel.id,'Two installed acoustic panel envelopes overlap.',
        {other:other.id,volume:box(bounds.clone().intersect(otherBox))});
  }
  for(const r of records){
    // Corner/flat pairs are measured against both actual sets of surfaces by the corner pass.
    if(r.owner?.id===panel.id||[cornerRole,'glass-partition'].includes(r.owner?.resource.mountRole)||!r.bounds.intersectsBox(interior))continue;
    const surface=triangles(r).some(t=>interior.intersectsTriangle(t));
    if(!surface&&!insideClosedMesh(interior.getCenter(vec()),r))continue;
    throw new CompanyError(r.owner?'wall-absorber-occupied':'wall-absorber-wall',panel.id,
      r.owner?'An installed facility enters the panel volume.':'The panel protrudes into a structural wall.',
      {other:r.owner?.id??r.object.name,mesh:part(r),kind:surface?'triangle-in-panel':'panel-inside-solid',envelope:box(bounds)});
  }

  const signedDepth=p=>normal.dot(vec().subVectors(p,origin));
  let rear=null,maxRearArea=0,frontDepth=-Infinity;
  for(const r of own)for(const face of triangles(r)){
    const depths=[signedDepth(face.a),signedDepth(face.b),signedDepth(face.c)];
    frontDepth=Math.max(frontDepth,...depths);
    if(depths.some(n=>Math.abs(n)>contactTolerance))continue;
    const area=face.getArea()*Math.abs(face.getNormal(vec()).dot(normal));
    if(area>maxRearArea){maxRearArea=area;rear={r,point:face.getMidpoint(vec())};}
  }
  if(!rear||maxRearArea<1e-10||frontDepth<=contactTolerance)
    throw new CompanyError('wall-absorber-wall',panel.id,'The installed mesh must have a real rear bearing face and positive thickness.');
  const checkWall=p=>{
    const hit=rayHit(walls,p.clone().addScaledVector(normal,.025),p.clone().addScaledVector(normal,-.025));
    if(!hit||hit.point.distanceTo(p)>contactTolerance+1e-7||hit.normal.dot(normal)<.999)
      throw new CompanyError('wall-absorber-wall',panel.id,'The complete rear installation needs solid inward-facing wall backing.',{point:tuple(p),first:hit?.record.object.name??null});
    return {wall:hit.record.object.name,point:tuple(hit.point),gapM:Number(hit.point.distanceTo(p).toFixed(7))};
  };
  const {width,height}=panel.resource.mounting;
  const support=[];
  for(const [u,v] of [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]])
    support.push(checkWall(vec(u*(width/2-overlapTolerance),v*(height/2-overlapTolerance),0).applyMatrix4(matrix)));
  return {id:panel.id,roomId:room.id,resource:panel.node.resource,sha256:panel.resource.asset.sha256,
    position:tuple(origin),normal:tuple(normal),envelope:box(bounds),frontDepthM:Number(frontDepth.toFixed(7)),
    bearing:{part:part(rear.r),meshPoint:tuple(rear.point),...checkWall(rear.point)},support};
}

// Both an authoring candidate and a full-floor scene expose these prepared objects.
// Their geometry is independent of cutaway walls, overview proxies and other presentation controls.
export function inspectWallAbsorberObjects(derived,{floorId,groups,facilities,walls}){
  const panels=derived.facilities.filter(f=>f.floorId===floorId&&isPanel(f));
  if(!panels.length)return [];
  const measured=[];
  for(const roomId of new Set(panels.map(panel=>panel.roomId))){
    const room=derived.nodes.get(roomId),roomGroup=groups.get(roomId);
    if(!roomGroup)throw new CompanyError('wall-absorber-scene',roomId,'The panel room must have prepared installation geometry.');
    const {records,worldToRoom}=installedRoomMeshes(roomGroup,{floorId,facilities,walls});
    const transformFor=f=>worldToRoom.clone().multiply(groups.get(f.id).matrixWorld);
    for(const panel of panels.filter(f=>f.roomId===roomId)){
      const matrix=transformFor(panel);
      if(panel.resource.mountRole===cornerRole)
        measured.push(measureCornerAbsorber(room,panel,matrix,records,derived.cornerMounts.get(panel.id)));
      else measured.push(measurePanel(room,panel,matrix,records,panels.filter(f=>f.resource.mountRole===role),transformFor));
    }
  }
  return [{ok:true,floorId,panels:measured}];
}

export function measureWallAbsorberFloor(document,derived,placement,group,{catalog,templates,assetLibrary}){
  const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
  try{return scene.wallAbsorberMeasurements();}
  finally{scene.dispose();}
}
