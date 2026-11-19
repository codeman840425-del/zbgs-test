import * as THREE from 'three';
import {CompanyError} from './document.js';
import {createCompanyScene} from './render.js';
import {inspectCompanyConnections} from './space.js';
import {overlapsObstacle} from './wardrobe-footprints.js';
import {scanRoomMeshes} from './room-mesh-geometry.js';
import {checkRoomDoorAccess,clearanceQuery} from './public-door-access.js';

const teaRoles={counter:'tea-counter',machine:'tea-machine',cup:'tea-cup'};
const roleSet=new Set(Object.values(teaRoles));
const opposite={west:'east',east:'west',north:'south',south:'north'};
const radius=.25,height=1.90,tolerance=.001;
const v=(...coordinates)=>new THREE.Vector3(...coordinates);
const rounded=n=>Math.round(n*1e7)/1e7||0;
const tuple=point=>point.toArray().map(rounded);
const token=value=>typeof value==='string' && value.trim().length>0;
const pair=value=>Array.isArray(value) && value.length===2 && value.every(Number.isFinite);
const keys=object=>Object.keys(object ?? {}).sort().join(',');
const assetKey=reference=>reference?.id+'@'+reference?.version;
const at=([x,z])=>v(x,height/2,z);
const fail=(code,path,message,details)=>{throw new CompanyError(code,path,message,details);};
const matrix=({position,yaw})=>new THREE.Matrix4().makeRotationY(yaw).setPosition(...position);

// Completeness attaches to a counter, not every loose cup or machine in the area.
function completeCounters(facilities) {
  const counters=new Set(facilities.filter(f=>f.resource.mountRole===teaRoles.counter).map(f=>f.id));
  const cupParents=new Set(facilities.filter(f=>f.resource.mountRole===teaRoles.cup).map(f=>f.node.parentId));
  return new Set(facilities.filter(f=>f.resource.mountRole===teaRoles.machine && counters.has(f.node.parentId) &&
    (cupParents.has(f.id) || cupParents.has(f.node.parentId))).map(f=>f.node.parentId));
}

export function shouldCheckTeaStations(document,{catalog,derived}) {
  if (Object.hasOwn(document,'teaStations')) return true;
  if (derived) return completeCounters(derived.facilities).size>0;
  const tea=new Map(catalog.resources.filter(resource=>roleSet.has(resource.mountRole)).map(resource=>[assetKey(resource),resource]));
  const candidates=(document.nodes ?? []).flatMap(node=>{
    const resource=node.kind==='facility' && tea.get(assetKey(node.resource));
    return resource?[{id:node.id,node,resource}]:[];
  });
  return completeCounters(candidates).size>0;
}

function bindRule(rule,index,derived,used) {
  const path='teaStations['+index+']';
  const hasPassage=Object.hasOwn(rule ?? {},'passage');
  if (keys(rule)!==(hasPassage?'passage,portalId,regionId,roles,service':'portalId,regionId,roles,service') ||
      !token(rule?.regionId) || !token(rule.portalId) || !pair(rule.service) ||
      keys(rule.roles)!=='counter,cup,machine' || !Object.values(rule.roles).every(token) ||
      new Set(Object.values(rule.roles)).size!==3)
    fail('invalid-tea-station',path,'Declare a public area, entry, three distinct facility IDs and a room-local service point.');
  const area=derived.nodes.get(rule.regionId);
  if (area?.kind!=='area' || !token(area.publicRole))
    fail('tea-station-area',rule.regionId,'A tea station belongs to an actual public area.');
  const members={};
  for (const [role,mountRole] of Object.entries(teaRoles)) {
    const id=rule.roles[role], member=derived.facilities.find(f=>f.id===id);
    if (member?.roomId!==area.id || member.resource.mountRole!==mountRole || member.resource.asset?.format!=='glb' || used.has(id))
      fail('tea-station-member',id,'Select a distinct physical '+role+' in the named public area.',{role,areaId:area.id});
    members[role]=member;
    used.add(id);
  }
  const {counter,machine,cup}=members;
  const box=counter.resource.mounting;
  if (counter.node.parentId!==area.id || counter.resource.mount!=='floor-surface' ||
      ![box?.width,box?.height,box?.depth].every((n,i)=>Math.abs(n-[1.20,.90,.60][i])<=tolerance))
    fail('tea-station-mount',counter.id,'The physical 1.20 × 0.90 × 0.60 m counter must sit directly on the public floor.');
  if (machine.resource.mount!=='support-surface' || machine.node.parentId!==counter.id || machine.node.attachment?.surfaceId!=='counter')
    fail('tea-station-mount',machine.id,'Place the machine on the named counter surface.',{parentId:counter.id,surfaceId:'counter'});
  const cupOnTray=cup.node.parentId===machine.id && cup.node.attachment?.surfaceId==='tray';
  const cupOnCounter=cup.node.parentId===counter.id && cup.node.attachment?.surfaceId==='counter';
  if (cup.resource.mount!=='support-surface' || (!cupOnTray && !cupOnCounter))
    fail('tea-station-mount',cup.id,'Place the cup on this machine tray or this counter.');
  return {rule,area,members,cupHost:cupOnTray?machine:counter};
}

function assertInside(area,box,path) {
  if (box.min.x < -area.bounds.width/2 || box.max.x > area.bounds.width/2 ||
      box.min.z < -area.bounds.depth/2 || box.max.z > area.bounds.depth/2)
    fail('tea-station-clearance-outside',path,'Keep the declared clearance wholly inside its public area.',{min:tuple(box.min),max:tuple(box.max)});
}

function volumesFor(binding,derived,floor) {
  const {area,rule,members:{counter}}=binding;
  const toArea=matrix(derived.worlds.get(area.id)).invert();
  const cleaning=new THREE.Box3(v(-.4,0,.32),v(.4,height,1.17)).applyMatrix4(toArea.clone().multiply(matrix(counter.world)));
  assertInside(area,cleaning,counter.id);
  if (!cleaning.clone().expandByScalar(-(radius-tolerance)).containsPoint(at(rule.service)))
    fail('tea-station-service-point',counter.id,'Place the service standing point within the front cleaning space, with a full 0.50 m approach envelope.',{service:rule.service});
  const availablePortals=new Map();
  for (const connection of floor.connections) {
    const sides=[connection.from,connection.to];
    const index=sides.findIndex(side=>side.regionId===area.id);
    if (index>=0) availablePortals.set(connection.id,{...sides[index],peerId:sides[1-index].regionId});
  }
  for (const side of floor.exteriorEntrances.filter(side=>side.regionId===area.id))
    availablePortals.set(side.id,side);
  if (!availablePortals.has(rule.portalId))
    fail('tea-station-portal',rule.portalId,'Choose a real door on the named public area.');
  const regions=[{name:'cleaning',box:cleaning}];
  if (area.publicRole==='corridor' && !Object.hasOwn(rule,'passage'))
    fail('tea-station-passage-required',area.id,'A corridor station needs a separate public through-passage with two existing end doors.');
  if (Object.hasOwn(rule,'passage')) {
    const passage=rule.passage;
    if (keys(passage)!=='maxX,maxZ,minX,minZ,portalIds' ||
      ![passage.minX,passage.maxX,passage.minZ,passage.maxZ].every(Number.isFinite) ||
      Math.min(passage.maxX-passage.minX,passage.maxZ-passage.minZ)<2*radius ||
      !Array.isArray(passage.portalIds) || passage.portalIds.length!==2 ||
      !passage.portalIds.every(token) || new Set(passage.portalIds).size!==2)
      fail('invalid-tea-station-passage',area.id,'Give finite passage bounds at least 0.50 m wide and two distinct physical door IDs.');
    const [first,second]=passage.portalIds.map(id=>availablePortals.get(id));
    if (!first || !second || opposite[first.edge]!==second.edge)
      fail('tea-station-passage-portals',area.id,'Select two real doors on opposite ends of the named public area.',{portalIds:passage.portalIds});
    if (area.publicRole==='corridor') {
      const {width,depth}=area.bounds;
      const alongX=['west','east'].includes(first.edge);
      const crossesShortAxis=width!==depth && alongX!==(width>depth);
      const leadsToPrivateRoom=[first,second].some(side=>side.peerId && derived.nodes.get(side.peerId)?.kind!=='area');
      if (crossesShortAxis || leadsToPrivateRoom)
        fail('tea-station-passage-portals',area.id,'A corridor passage must connect its longitudinal public ends.',{portalIds:passage.portalIds});
    }
    const box=new THREE.Box3(v(passage.minX,0,passage.minZ),v(passage.maxX,height,passage.maxZ));
    assertInside(area,box,area.id);
    if (box.intersectsBox(cleaning)) fail('tea-station-passage-overlap',area.id,'The cleaning space cannot occupy the through-passage.');
    regions.push({name:'public-passage',box});
  }
  return {cleaning,regions,doorIds:[...availablePortals.keys()]};
}

function checkVolumes(scene,area,facilities,derived,floorId,regions) {
  const volumes=regions.map(({name,box})=>({name,box:box.clone().expandByScalar(-tolerance)}));
  const failures=[];
  const {worldToRoom,checkedMeshes}=scanRoomMeshes(scene,area,facilities,volumes,failures);
  const xz=point=>[point.x,point.z];
  for (const obstacle of derived.obstacles.filter(o=>o.floorId===floorId && o.resource.mount!=='portal-door')) {
    const points=obstacle.corners.map(point=>v(...point).applyMatrix4(worldToRoom));
    const bounds=new THREE.Box3().setFromPoints(points);
    const polygon=(obstacle.polygon?points:[points[0],points[1],points[3],points[2]]).map(xz);
    for (const {name,box} of volumes) if (overlapsObstacle({min:xz(bounds.min),max:xz(bounds.max),polygon},{min:xz(box.min),max:xz(box.max)}))
      failures.push({region:name,kind:'blocking-footprint',componentId:obstacle.id});
  }
  if (failures.length)
    fail('tea-station-clearance-obstructed',failures[0].componentId,'Actual geometry or reserved footprint enters the tea station cleaning or passage volume.',{areaId:area.id,failures});
  return checkedMeshes;
}

function contactWitness(scene,parent,child,surfaceId,facilityGroups) {
  const parentGroup=scene.root.getObjectByName(parent.id), childGroup=scene.root.getObjectByName(child.id);
  const surface=parent.resource.supportSurfaces?.find(entry=>entry.id===surfaceId);
  const meshName=parent.resource.supportNodes?.[surfaceId];
  const name=object=>object.userData.name || object.name;
  function ownedMeshes(group) {
    const meshes=[];
    function visit(node) {
      if (node!==group && facilityGroups.has(node)) return;
      if (node.isMesh) meshes.push(node);
      for (const child of node.children) visit(child);
    }
    if (group) visit(group);
    return meshes;
  }
  const supporters=ownedMeshes(parentGroup).filter(object=>name(object)===meshName);
  if (!surface || supporters.length!==1 || !childGroup)
    fail('tea-station-contact',child.id,'The named support must resolve to one actual mesh.',{parentId:parent.id,surfaceId,meshName});
  const supportY=parent.world.position[1]+surface.topY;
  const meshes=ownedMeshes(childGroup), local=v(), ray=new THREE.Raycaster(v(),v(0,-1,0),.005,.075);
  let contact;
  for (const mesh of meshes) {
    const attribute=mesh.geometry.getAttribute('position');
    for (let i=0;i<(attribute?.count ?? 0);i++) {
      mesh.getVertexPosition(i,local).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(local.y-supportY)>tolerance) continue;
      ray.ray.origin.copy(local);ray.ray.origin.y+=.04;
      const hit=ray.intersectObject(supporters[0],false)[0];
      if (hit && Math.abs(hit.point.y-local.y)<=tolerance) {
        contact={parentId:parent.id,childId:child.id,surfaceId,mesh:meshName,point:tuple(hit.point)};
        break;
      }
    }
    if (contact) break;
  }
  if (!contact) fail('tea-station-contact',child.id,'Actual child bottom must touch the named physical support.',{parentId:parent.id,surfaceId,meshName});
  return contact;
}

function route(scene,derived,facilities,floor,placement,area,portalId,target,preview,key) {
  // Within one drag point each occupancy state has its own clearance query per
  // region. None of these queries or their transformed triangles survive the point.
  let queryFor;
  if(preview){
    if(!preview.queries.has(derived))preview.queries.set(derived,new Map());
    const regions=preview.queries.get(derived);
    queryFor=region=>{
      if(!regions.has(region.id))regions.set(region.id,clearanceQuery(scene,derived,facilities,region,radius,height));
      return regions.get(region.id);
    };
  }
  const found=checkRoomDoorAccess({scene,derived,facilities,floor,placement,room:area,portalId,
    targets:{access:target},radius,height,queryFor,previous:preview?.prior.get(key)});
  if (found.access.portalId!==portalId)
    fail('tea-station-door-unreachable',portalId,'The selected real door must itself reach the required service or passage point.',{areaId:area.id,found:found.access.portalId});
  preview?.next.set(key,found);
  return found.access;
}

function measure(scene,binding,derived,placement,floor,facilities,groups,preview) {
  const {area,rule,members,cupHost}=binding, floorId=floor.floorId;
  const {cleaning,regions,doorIds}=volumesFor(binding,derived,floor);
  const checkedMeshes=checkVolumes(scene,area,facilities,derived,floorId,regions);
  const contacts=[contactWitness(scene,members.counter,members.machine,'counter',groups),
    contactWitness(scene,cupHost,members.cup,members.cup.node.attachment.surfaceId,groups)];
  const doorRoute=(physical,id,target,occupancy)=>route(scene,physical,facilities,floor,placement,area,id,target,preview,
    preview && JSON.stringify([floorId,area.id,members.counter.id,occupancy,id]));
  const serviceDoors=doorIds.map(id=>doorRoute(derived,id,rule.service,'service'));
  const occupiedCleaningPassage=[];
  if (rule.passage) {
    const toWorld=matrix(derived.worlds.get(area.id));
    const corners=[cleaning.min.x,cleaning.max.x].flatMap(x=>[cleaning.min.z,cleaning.max.z].map(z=>v(x,0,z).applyMatrix4(toWorld).toArray()));
    const occupied={...derived,obstacles:[...derived.obstacles,{id:area.id+'/occupied-tea-cleaning',floorId,resource:{mount:'floor-surface'},corners}]};
    const center=regions[1].box.getCenter(v()), checkpoint=[rounded(center.x),rounded(center.z)];
    for (const portalId of rule.passage.portalIds)
      occupiedCleaningPassage.push(doorRoute(occupied,portalId,checkpoint,'cleaning'));
  }
  return {ok:true,regionId:area.id,floorId,portalId:rule.portalId,roles:{...rule.roles},service:[...rule.service],
    contacts,serviceDoors,occupiedCleaningPassage,checkedMeshes,
    clearance:regions.map(({name,box})=>({name,min:tuple(box.min),max:tuple(box.max)}))};
}

export function teaStationFloors(document,derived){
  const complete=completeCounters(derived.facilities);
  if (!Object.hasOwn(document,'teaStations')) {
    if (!complete.size) return [];
    fail('tea-station-binding-required',[...complete][0],'A complete installed tea station needs a portable teaStations declaration.');
  }
  if (!Array.isArray(document.teaStations) || !document.teaStations.length)
    fail('invalid-tea-stations','teaStations','Expected a nonempty array of tea station declarations.');
  const used=new Set(),bindings=document.teaStations.map((rule,index)=>bindRule(rule,index,derived,used));
  const bound=new Set(bindings.map(binding=>binding.members.counter.id));
  for (const id of complete) if (!bound.has(id)) fail('tea-station-binding-required',id,'This complete installed station lacks a declaration.');
  const floors=new Map();
  for(const binding of bindings){
    const id=derived.floorIds.get(binding.area.id);
    if(!floors.has(id)){
      const facilities=derived.facilities.filter(f=>f.floorId===id);
      const finishes=derived.surfaceFinishes.filter(f=>f.floorId===id);
      floors.set(id,{id,facilities,resources:[...facilities,...finishes].map(f=>f.resource),bindings:[]});
    }
    floors.get(id).bindings.push(binding);
  }
  return [...floors.values()];
}

// The drag preview already owns a private prepared full-floor mesh tree.
export function measurePreparedTeaStationFloor(scene,derived,placement,group,floor,probePaths) {
  scene.root.updateMatrixWorld(true);
  const groups=new Set(group.facilities.map(item=>scene.root.getObjectByName(item.id)));
  const preview=probePaths && {prior:probePaths,next:new Map(),queries:new Map()};
  const reports=group.bindings.map(binding=>measure(scene,binding,derived,placement,floor,group.facilities,groups,preview));
  if(preview){
    probePaths.clear();
    for(const [key,path] of preview.next)probePaths.set(key,path);
  }
  return reports;
}

export function measureTeaStationFloor(document,derived,placement,group,{catalog,templates,assetLibrary}) {
  if(!assetLibrary)fail('tea-station-assets-required',group.id,'Load the actual station, supports and room obstacles for this floor.');
  const floor=inspectCompanyConnections(document,catalog,templates).floors.find(f=>f.floorId===group.id);
  const scene=createCompanyScene(new THREE.Scene(),document,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
  try{return measurePreparedTeaStationFloor(scene,derived,placement,group,floor);}
  finally {scene.dispose();}
}
