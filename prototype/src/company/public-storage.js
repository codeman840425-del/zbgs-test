import * as T from 'three';
import {CompanyError,prepareCompanyChange} from './document.js';
import {createCompanyScene} from './render.js';
import {inspectCompanyConnections} from './space.js';
import {inspectCompanyPlacement} from './placement.js';
import {scanRoomMeshes,triangles,vertices,rayHit} from './room-mesh-geometry.js';
import {lobbyApproach,checkRoomDoorAccess} from './public-door-access.js';

const radius=.25,height=1.9;
const stock=n=>n?.kind==='area'&&n.publicRole==='storage-cleaning';
const roles=['storage-shelf','hinged-cabinet','cart-and-equipment-storage'];
const loadRole='storage-cleaning-shelf';
const member=r=>roles.includes(r?.mountRole)||r?.mountRole===loadRole;
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const xyz=p=>p.toArray().map(n=>Number(n.toFixed(6))||0);
const part=r=>r.object.userData.name||r.object.name;
const str=s=>typeof s==='string'&&s.trim().length>0;
const ownKeys=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join(',')===keys;
function check(ok,code,path,message,details){if(!ok)throw new CompanyError(code,path,message,details);}

export function shouldCheckPublicStorage(document,{catalog,derived}={}){
  if(Object.hasOwn(document,'publicStorageRooms'))return true;
  if(derived)return derived.facilities.some(f=>stock(derived.nodes.get(f.roomId))&&member(f.resource));
  const areas=new Set(document.nodes.filter(stock).map(n=>n.id));
  if(!areas.size)return false;
  const refs=new Set(catalog.resources.filter(member).map(r=>r.id+'@'+r.version));
  const parents=new Map(document.nodes.map(n=>[n.id,n.parentId]));
  return document.nodes.some(n=>{
    if(!n.resource||!refs.has(n.resource.id+'@'+n.resource.version))return false;
    let parent=n.parentId;const seen=new Set();
    while(parent&&!seen.has(parent)){if(areas.has(parent))return true;seen.add(parent);parent=parents.get(parent);}
    return false;
  });
}

function bind(rule,derived){
  const where=rule?.regionId??'publicStorageRooms';
  check(ownKeys(rule,'cabinetId,cabinetService,cartId,picks,portalId,rackId,regionId')&&
    [rule.regionId,rule.portalId,rule.rackId,rule.cabinetId,rule.cartId].every(str)&&
    Array.isArray(rule.cabinetService)&&rule.cabinetService.length===2&&rule.cabinetService.every(Number.isFinite)&&
    Array.isArray(rule.picks)&&rule.picks.length>=2,'invalid-public-storage',where,'Declare an equipped public storage area, doorway, cabinet service point and shelf loads.');
  const area=derived.nodes.get(rule.regionId);
  check(stock(area),'storage-public-area',where,'Use the designated public storage and cleaning area.');
  const floorId=derived.floorIds.get(area.id),facilities=derived.facilities.filter(f=>f.floorId===floorId);
  const ids=[rule.rackId,rule.cabinetId,rule.cartId];
  const hosts=ids.map((id,i)=>{
    const f=facilities.find(f=>f.id===id&&f.roomId===area.id&&f.node.parentId===area.id&&f.resource.mountRole===roles[i]);
    check(f,'storage-member',id,'Bind the correct installed facility in this public area.');return f;
  });
  check(facilities.filter(f=>f.roomId===area.id&&roles.includes(f.resource.mountRole)).every(f=>ids.includes(f.id)),
    'storage-unbound-member',area.id,'Bind the installed storage equipment.');
  const seen=new Set(),picks=rule.picks.map(p=>{
    check(ownKeys(p,'hostId,loadId,surfaceId')&&[p.hostId,p.loadId,p.surfaceId].every(str),'storage-pick',where,'Name the support, shelf and actual load.');
    const host=[hosts[0],hosts[2]].find(f=>f.id===p.hostId),load=facilities.find(f=>f.id===p.loadId);
    const surface=host?.resource.supportSurfaces?.find(s=>s.id===p.surfaceId);
    check(host&&surface&&load?.resource.mountRole===loadRole&&load.roomId===area.id&&load.node.parentId===host.id&&load.node.attachment?.surfaceId===surface.id&&!seen.has(load.id),
      'storage-pick',p.loadId,'Each declared load must sit on its specified real rack or cart shelf.');
    seen.add(load.id);return {host,load,surface};
  });
  check([hosts[0],hosts[2]].every(h=>picks.some(p=>p.host.id===h.id)),'storage-pick',where,'Both rack and cart need a stocked, accessible shelf.');
  check(facilities.filter(f=>f.roomId===area.id&&f.resource.mountRole===loadRole).every(f=>seen.has(f.id)),
    'storage-unbound-load',area.id,'Declare the shelf and front access for every cleaning load.');
  return {rule,area,floorId,facilities,hosts,picks};
}

export function publicStorageFloors(document,derived){
  if(!shouldCheckPublicStorage(document,{derived}))return [];
  check(Array.isArray(document.publicStorageRooms)&&document.publicStorageRooms.length,'storage-declaration-required','publicStorageRooms','Declare the furnished public storage area.');
  const groups=new Map(),seen=new Set();
  for(const rule of document.publicStorageRooms){
    const b=bind(rule,derived);
    check(!seen.has(b.area.id),'storage-duplicate-room',b.area.id,'Declare the storage area once.');seen.add(b.area.id);
    if(!groups.has(b.floorId))groups.set(b.floorId,{id:b.floorId,bindings:[],resources:[...b.facilities,...derived.surfaceFinishes.filter(f=>f.floorId===b.floorId)].map(f=>f.resource)});
    groups.get(b.floorId).bindings.push(b);
  }
  for(const f of derived.facilities)if(stock(derived.nodes.get(f.roomId))&&member(f.resource))
    check(seen.has(f.roomId),'storage-declaration-required',f.id,'Declare the furnished public storage area.');
  return [...groups.values()];
}

function checkPick({host,load,surface},records,roomMatrix){
  const matrix=roomMatrix(host),inverse=matrix.clone().invert();
  const local=records.map(r=>({...r,matrix:inverse.clone().multiply(r.matrix),bounds:r.bounds.clone().applyMatrix4(inverse)}));
  const hostRecords=local.filter(r=>r.id===host.id),cargo=local.filter(r=>r.id===load.id);
  check(cargo.length,'storage-load-geometry',load.id,'The load has no visible physical mesh.');
  const points=cargo.flatMap(r=>vertices(r)),bounds=new T.Box3().setFromPoints(points),bottom=bounds.min.y;
  check(Math.abs(bottom-surface.topY)<=.003,'storage-support-contact',load.id,'The load bottom must touch its actual support height.',{bottom,topY:surface.topY});
  const deckName=host.resource.supportNodes?.[surface.id],deck=hostRecords.find(r=>part(r)===deckName);
  check(deck,'storage-support-contact',host.id,'Missing named physical shelf.');
  const bottomPoints=points.filter(p=>p.y<=bottom+.001);
  // Spread contact witnesses over the real footing. A loose end overhanging an edge cannot pass on a single centre ray.
  const extrema=[[1,1],[1,-1],[-1,1],[-1,-1]].map(([dx,dz])=>bottomPoints.reduce((a,p)=>p.x*dx+p.z*dz>a.x*dx+a.z*dz?p:a));
  const contacts=extrema.map(p=>{
    const hit=rayHit(hostRecords,p.clone().add(v(0,.012,0)),p.clone().sub(v(0,.015,0)));
    check(hit?.record===deck&&Math.abs(hit.point.y-p.y)<=.003&&hit.normal.y>.96,'storage-support-contact',load.id,
      'The actual load footing must hit the named shelf.',{mesh:hit&&part(hit.record),point:xyz(p)});
    return xyz(hit.point.clone().applyMatrix4(matrix));
  });
  const shell=new T.Box3();for(const r of hostRecords)shell.union(new T.Box3().setFromPoints(vertices(r)));
  const front=shell.max.z,standing=v((bounds.min.x+bounds.max.x)/2,0,front+radius+.10);
  const obstacles=local.filter(r=>r.id!==load.id);
  const collision=box=>obstacles.find(r=>r.bounds.intersectsBox(box)&&triangles(r).some(t=>box.intersectsTriangle(t)));
  // Locate a short rigid lift, if needed, followed by a straight front withdrawal of the whole bounding box.
  // The starting deck is allowed to touch the cargo. Every other surface is included.
  const sweep=bounds.clone();sweep.min.y+=.001;sweep.max.y-=.001;
  const distance=front+.025-bounds.min.z;
  let witness,first;
  for(const lift of [0,.02,.04,.06,.08]){
    const up=sweep.clone();up.max.y+=lift;
    const slide=sweep.clone().translate(v(0,lift,0));slide.max.z+=Math.max(0,distance);
    const hit=collision(up)||collision(slide);
    if(!hit){witness={liftM:lift,travelM:Math.max(0,distance),start:xyz(bounds.min),endFrontZ:slide.max.z};break;}
    first??={id:hit.id,mesh:part(hit)};
  }
  check(witness,'storage-pick-blocked',load.id,'Keep a clear front withdrawal space for the installed load.',first);
  const point=standing.applyMatrix4(matrix);
  return {hostId:host.id,surfaceId:surface.id,loadId:load.id,deck:deckName,contacts,loadSize:xyz(bounds.getSize(v())),withdrawal:witness,stand:[point.x,point.z]};
}

function cabinetWitness(cabinet,service,records,roomMatrix,fraction){
  const matrix=roomMatrix(cabinet),inverse=matrix.clone().invert(),p=cabinet.resource.movingParts[0];
  const leaf=records.find(r=>r.id===cabinet.id&&part(r)===cabinet.resource.partPanels.door);
  check(leaf,'storage-cabinet-geometry',cabinet.id,'The installed hinged leaf is missing.');
  const pivot=v(...p.pivot),axis=v(0,1,0),angle=fraction*p.rotationRange[1];
  const leafPoint=v(p.bounds.max[0]*.90,(p.bounds.min[1]+p.bounds.max[1])/2,0).applyAxisAngle(axis,angle).add(pivot);
  const n=v(0,0,1).applyAxisAngle(axis,angle),world=q=>q.applyMatrix4(matrix);
  const hit=rayHit([leaf],world(leafPoint.clone().addScaledVector(n,.06)),world(leafPoint.clone().addScaledVector(n,-.06)));
  check(hit&&Math.abs(hit.normal.dot(n.clone().transformDirection(matrix)))>.97,'storage-cabinet-pose',cabinet.id,
    'The real door leaf must turn on its registered hinge.',{fraction});
  const stand=v(service[0],0,service[1]).applyMatrix4(inverse);
  const dx=Math.max(0,Math.abs(stand.x)-cabinet.resource.mounting.width/2),dz=stand.z-pivot.z;
  check(dz>0&&Math.hypot(dx,dz)<=.85,'storage-cabinet-service',cabinet.id,'Place the service point within reach of the front opening.',{local:xyz(stand)});
  return {fraction,leaf:part(leaf),hit:xyz(hit.point),localHit:xyz(hit.point.clone().applyMatrix4(inverse)),service};
}

// For each five-degree interval enclose the continuously rotating leaf and handle in the
// interval midpoint basis. radius*sin(halfStep) bounds lateral travel; 1-cos bounds
// radial travel. The boxes are conservative, and independent of blockers' metadata.
function checkDoorSweep(cabinet,records,roomMatrix,scene){
  const def=cabinet.resource.movingParts[0],cabMatrix=roomMatrix(cabinet);
  const pivotName=cabinet.resource.partNodes.door,group=scene.root.getObjectByName(cabinet.id);
  const pivot=group.getObjectByName(pivotName),moving=new Set();
  check(pivot,'storage-cabinet-geometry',cabinet.id,'Missing the installed moving door group.');
  pivot.traverse(o=>moving.add(o));
  const toPivot=cabMatrix.clone().multiply(new T.Matrix4().makeTranslation(...def.pivot));
  const inverse=toPivot.clone().invert(),foreign=records.filter(r=>r.id!==cabinet.id);
  const localPoints=records.filter(r=>moving.has(r.object)).flatMap(r=>vertices(r).map(p=>p.clone().applyMatrix4(inverse)));
  const body=new T.Box3().setFromPoints(localPoints);
  check(!body.isEmpty(),'storage-cabinet-geometry',cabinet.id,'Missing the installed moving door geometry.');
  const maxAbs=(k)=>Math.max(Math.abs(body.min[k]),Math.abs(body.max[k]));
  const steps=18,step=def.rotationRange[1]/steps,half=Math.abs(step)/2;
  const sin=Math.sin(half),cosError=1-Math.cos(half);
  const pad=v(maxAbs('x')*cosError+maxAbs('z')*sin,0,maxAbs('z')*cosError+maxAbs('x')*sin);
  const volume=body.clone().expandByVector(pad);
  for(let i=0;i<steps;i++){
    const fromMid=toPivot.clone().multiply(new T.Matrix4().makeRotationY(step*(i+.5)));
    const roomBox=volume.clone().applyMatrix4(fromMid),toMid=fromMid.clone().invert();
    for(const r of foreign){
      if(!roomBox.intersectsBox(r.bounds))continue;
      const inMid={object:r.object,matrix:toMid.clone().multiply(r.matrix)};
      check(!triangles(inMid).some(t=>volume.intersectsTriangle(t)),'storage-door-sweep',cabinet.id,
        'Another physical mesh intrudes into the cabinet door travel.',{other:r.id,mesh:part(r),fractionInterval:[i/steps,(i+1)/steps]});
    }
  }
  return {rotationRad:def.rotationRange[1],intervals:steps,closedMovingBounds:{min:xyz(body.min),max:xyz(body.max)},lateralMarginM:pad.z};
}

export function measurePublicStorageFloor(document,derived,placement,group,{catalog,templates,assetLibrary}){
  check(assetLibrary,'storage-assets-required',group.id,'Load the installed cabinet, rack, cart and goods.');
  const opts={catalog,templates},floor=inspectCompanyConnections(document,catalog,templates).floors.find(f=>f.floorId===group.id);
  const results=[];
  for(const original of group.bindings){
    const {rule,area}=original,cabinet=original.hosts[1],saved=cabinet.state.openFraction;
    let sweep;
    const portal=floor.connections.find(c=>c.id===rule.portalId);
    check(portal&&[portal.from,portal.to].some(s=>s.regionId===area.id)&&[portal.from,portal.to].every(s=>derived.nodes.get(s.regionId)?.kind==='area'),
      'storage-entry',area.id,'Connect the storage room through an installed public doorway.');
    let previous=document;const states=[];
    for(const fraction of new Set([0,.5,1,saved])){
      // Each change uses the production moving-part sweep and remains private to this measurement.
      const next=prepareCompanyChange(previous,[{type:'set-state',id:cabinet.id,state:{openFraction:fraction}}],opts);
      previous=next.document;
      const physical=next.derived,b=bind(rule,physical);
      const at=fraction===saved?placement:inspectCompanyPlacement(previous,catalog,templates);
      const scene=createCompanyScene(new T.Scene(),previous,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
      try{
        scene.root.updateMatrixWorld(true);
        const records=[],{worldToRoom,checkedMeshes}=scanRoomMeshes(scene,area,b.facilities,[],[],(object,f,matrix,bounds)=>
          records.push({object,id:f?.id??object.name,matrix:matrix.clone(),bounds:bounds.clone()}));
        const roomMatrix=f=>worldToRoom.clone().multiply(scene.root.getObjectByName(f.id).matrixWorld);
        const picks=b.picks.map(p=>checkPick(p,records,roomMatrix));
        if(fraction===0)sweep=checkDoorSweep(b.hosts[1],records,roomMatrix,scene);
        const door=cabinetWitness(b.hosts[1],rule.cabinetService,records,roomMatrix,fraction);
        const targets={cabinet:rule.cabinetService,...Object.fromEntries(picks.map(p=>['pick:'+p.loadId,p.stand]))};
        const route=checkRoomDoorAccess({scene,derived:physical,facilities:b.facilities,floor,placement:at,room:area,portalId:rule.portalId,targets,radius,height});
        check(Object.values(route).every(r=>r.portalId===rule.portalId),'storage-entry',area.id,'All service positions must be reachable through the declared public doorway.');
        const publicApproach=lobbyApproach(scene,physical,b.facilities,at,floor,route.cabinet.fromRegion,{radius,height,code:'storage-entry'});
        states.push({fraction,door,picks,route,publicApproach,checkedMeshes});
      }finally{scene.dispose();}
    }
    results.push({ok:true,regionId:area.id,floorId:group.id,portalId:rule.portalId,savedOpenFraction:saved,sweep,states});
  }
  return results;
}
