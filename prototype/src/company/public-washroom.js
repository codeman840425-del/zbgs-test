import * as T from 'three';
import {CompanyError} from './document.js';
import {inspectCompanyConnections} from './space.js';
import {overlapsObstacle} from './wardrobe-footprints.js';
import {createCompanyScene} from './render.js';
import {scanRoomMeshes,rayHit,triangles} from './room-mesh-geometry.js';
import {isGlassPartitionSightPane} from './glass-partition.js';
import {checkRoomDoorAccess,lobbyApproach} from './public-door-access.js';

const radius=.25,height=1.90,contact=.002;
const vector=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const tuple=v=>v.toArray().map(n=>Number(n.toFixed(6))||0);
const part=r=>r.object.userData.name||r.object.name;
const ref=r=>r.id+'@'+r.version;
const keys=o=>Object.keys(o??{}).sort().join(',');
const text=s=>typeof s==='string'&&s.trim().length>0;
const requireThat=(condition,code,where,message,details)=>{
  if(!condition)throw new CompanyError(code,where,message,details);
};

const publicArea=node=>node?.kind==='area'&&node.publicRole==='restroom-access';
const publicBasins=derived=>derived.facilities.filter(f=>f.resource.mountRole==='public-washbasin'&&publicArea(derived.nodes.get(f.roomId)));

export function shouldCheckPublicWashrooms(document,{catalog,derived}) {
  if(Object.hasOwn(document,'publicWashrooms'))return true;
  const isBasin=r=>r.mountRole==='public-washbasin';
  if(derived)return publicBasins(derived).length>0;
  const basins=new Set(catalog.resources.filter(isBasin).map(ref));
  // Floor-mounted basins are immediate children of their room or public area.
  const regions=new Set(document.nodes.filter(publicArea).map(n=>n.id));
  return document.nodes.some(n=>n.kind==='facility'&&regions.has(n.parentId)&&n.resource&&basins.has(ref(n.resource)));
}

function bind(rule,derived,used){
  requireThat(keys(rule)==='portalId,regionId,roles,service'&&keys(rule.roles)==='basin,dispenser,mirror,sign'&&
    [rule.regionId,rule.portalId,...Object.values(rule.roles)].every(text)&&Array.isArray(rule.service)&&
    rule.service.length===2&&rule.service.every(Number.isFinite),'invalid-public-washroom','publicWashrooms','Declare the public area, entry, four installed members and a room-local service point.');
  const area=derived.nodes.get(rule.regionId);
  requireThat(publicArea(area),'washroom-region',rule.regionId,'Select a public restroom service area.');
  const roles={basin:['public-washbasin'],mirror:['makeup-mirror-wall','mirror'],dispenser:['washroom-dispenser'],sign:['information-board-floor']};
  const members={};
  for(const [role,allowed] of Object.entries(roles)){
    const id=rule.roles[role],f=derived.facilities.find(f=>f.id===id);
    requireThat(f?.node.parentId===area.id&&allowed.includes(f.resource.mountRole)&&f.resource.asset?.format==='glb'&&!used.has(id),
      'washroom-member',id,'Select a distinct installed '+role+' in the public washroom.');
    used.add(id);members[role]=f;
  }
  requireThat(members.basin.resource.mount==='floor-surface'&&members.sign.resource.mount==='floor-surface'&&
    members.mirror.resource.mount==='wall'&&members.dispenser.resource.mount==='wall',
    'washroom-mount',area.id,'The basin and sign require a floor, the mirror and dispenser a wall.');
  return {rule,area,...members};
}

function measure(scene,derived,placement,floor,binding){
  const {rule,area,basin,mirror,dispenser,sign}=binding;
  const facilities=derived.facilities.filter(f=>f.floorId===floor.floorId);
  const records=[],tol=contact;
  const {worldToRoom,checkedMeshes}=scanRoomMeshes(scene,area,facilities,[],[],(object,owner,matrix,bounds)=>{
    records.push({object,id:owner?.id??object.name,matrix:matrix.clone(),bounds:bounds.clone()});
  });
  const sightRecords=records.filter(({object})=>!isGlassPartitionSightPane(object));
  const roomFrom=f=>worldToRoom.clone().multiply(scene.root.getObjectByName(f.id).matrixWorld);
  const basis=roomFrom(basin),roomToBasin=basis.clone().invert(),at=(x,y,z)=>vector(x,y,z).applyMatrix4(basis);
  const owned=f=>records.filter(r=>r.id===f.id);
  const named=(f,name)=>{
    const hits=owned(f).filter(r=>part(r)===name);
    requireThat(hits.length===1&&triangles(hits[0]).length>0,'washroom-part',f.id,'Expected one physical mesh for '+name);
    return hits[0];
  };
  const service=vector(rule.service[0],0,rule.service[1]),local=service.clone().applyMatrix4(roomToBasin);
  requireThat(Math.abs(local.x)<=.14&&local.z>=.57&&local.z<=.74,'washroom-service-side',basin.id,'A 0.50 m standing envelope must fit in front of the positive Z side.',{local:tuple(local)});
  const clean=new T.Box3(vector(-.40,.002,.315),vector(.40,height,.995)).applyMatrix4(basis);
  requireThat(Math.max(Math.abs(clean.min.x),Math.abs(clean.max.x))<=area.bounds.width/2&&
    Math.max(Math.abs(clean.min.z),Math.abs(clean.max.z))<=area.bounds.depth/2,'washroom-cleaning-outside',area.id,'Keep the full cleaning space inside the washroom.');
  const obstruction=records.find(r=>clean.intersectsBox(r.bounds)&&triangles(r).some(t=>clean.intersectsTriangle(t)));
  requireThat(!obstruction,'washroom-cleaning-obstructed',obstruction?.id,'A physical surface enters the front standing and cleaning volume.',{mesh:obstruction&&part(obstruction)});
  const xz=p=>[p.x,p.z];
  for(const o of derived.obstacles.filter(o=>o.floorId===floor.floorId&&o.resource.mount!=='portal-door')){
    const corners=o.corners.map(point=>vector(...point).applyMatrix4(worldToRoom));
    const box=new T.Box3().setFromPoints(corners);
    const polygon=(o.polygon?corners:[corners[0],corners[1],corners[3],corners[2]]).map(xz);
    requireThat(!overlapsObstacle({min:xz(box.min),max:xz(box.max),polygon},{min:xz(clean.min),max:xz(clean.max)}),
      'washroom-cleaning-obstructed',o.id,'A reserved footprint enters the front cleaning space.');
  }
  const portal=floor.connections.find(c=>c.id===rule.portalId);
  requireThat(portal&&[portal.from,portal.to].some(s=>s.regionId===area.id)&&[portal.from,portal.to].every(s=>derived.nodes.get(s.regionId)?.kind==='area'),
    'washroom-portal',rule.portalId,'Select an actual connection to the neighbouring public area.');
  const route=checkRoomDoorAccess({scene,derived,facilities,placement,floor,room:area,portalId:rule.portalId,targets:{service:rule.service},radius,height}).service;
  requireThat(route.portalId===rule.portalId,'washroom-portal',rule.portalId,'The specified opening must reach the standing place.');

  const publicApproach=lobbyApproach(scene,derived,facilities,placement,floor,route.fromRegion);
  const floorMesh=scene.root.getObjectByName('Floor:'+area.id);
  requireThat(floorMesh?.isMesh,'washroom-floor',area.id,'Missing actual floor mesh.');
  const floorMatrix=worldToRoom.clone().multiply(floorMesh.matrixWorld);
  const floorRecord={object:floorMesh,id:floorMesh.name,matrix:floorMatrix,bounds:new T.Box3().setFromBufferAttribute(floorMesh.geometry.attributes.position).applyMatrix4(floorMatrix)};
  function floorContact(f){
    const witnesses=[];
    for(const r of owned(f))for(const t of triangles(r)){
      if(t.getArea()<1e-11)continue;
      const sample=t.getMidpoint(vector());
      if(Math.abs(sample.y)>tol||t.getNormal(vector()).y>-.8)continue;
      const hit=rayHit([floorRecord],sample.clone().add(vector(0,.03,0)),sample.clone().sub(vector(0,.03,0)));
      if(hit&&Math.abs(hit.point.y-sample.y)<=tol){
        witnesses.push({mesh:part(r),point:tuple(sample),floor:tuple(hit.point)});
        break;
      }
    }
    requireThat(witnesses.length,'washroom-floor-contact',f.id,'The base requires a physical underside in contact with the real floor.');
    return witnesses;
  }
  const basinFoot=floorContact(basin),signFoot=floorContact(sign);
  const actualBox=new T.Box3();
  for(const r of owned(basin))for(const t of triangles(r))for(const p of [t.a,t.b,t.c])actualBox.expandByPoint(p.clone().applyMatrix4(roomToBasin));
  const size=actualBox.getSize(vector());
  requireThat(size.distanceTo(vector(1.20,.90,.60))<.003,'washroom-basin-envelope',basin.id,'Measured basin geometry must fit the supported 1.20 × 0.90 × 0.60 m envelope.',{size:tuple(size)});
  const bowl=named(basin,'basin-bowl'),tap=named(basin,'basin-faucet'),slab=named(basin,'wash-countertop');
  const lip=rayHit([slab],at(.44,1,.07),at(.44,.55,.07));
  const well=rayHit(records,at(0,1.03,.018),at(0,.15,.018));
  requireThat(lip&&well&&well.record===bowl&&lip.point.y-well.point.y>.027,'washroom-basin-aperture',basin.id,'The upper opening must expose a physical well below the countertop.');
  const frontRay=rayHit(records,service.clone().add(vector(0,1.38,0)),well.point);
  requireThat(frontRay?.record===bowl,'washroom-basin-front',basin.id,'The real recessed bowl must be accessible from its positive Z side.',{first:frontRay&&part(frontRay.record)});
  const tapLocal=new T.Box3();
  for(const t of triangles(tap))for(const p of [t.a,t.b,t.c])tapLocal.expandByPoint(p.clone().applyMatrix4(roomToBasin));
  const zTip=tapLocal.max.z-.006;
  const nozzle=rayHit([tap],at(0,lip.point.y,zTip),at(0,1.02,zTip));
  const inside=nozzle&&rayHit(records,nozzle.point.clone().sub(vector(0,.0005,0)),at(0,.15,zTip));
  requireThat(inside&&inside.record.id===basin.id&&['basin-bowl','basin-drain'].includes(part(inside.record))&&inside.point.y<lip.point.y-.027,
    'washroom-faucet-over-bowl',basin.id,'The physical spout underside must be directly above the open bowl.');

  const wallSet=new Set(scene.walls);
  const walls=records.filter(r=>wallSet.has(r.object)&&r.object.userData.roomId===area.id);
  const side=[portal.from,portal.to].find(s=>s.regionId===area.id);
  const tangent=['north','south'].includes(side.edge)?vector(1,0,0):vector(0,0,1);
  const inward={north:vector(0,0,1),south:vector(0,0,-1),west:vector(1,0,0),east:vector(-1,0,0)}[side.edge];
  const crossing=offset=>{
    const point=vector(side.local.center[0],1.20,side.local.center[2]).addScaledVector(tangent,offset);
    return [point.clone().addScaledVector(inward,-.2),point.clone().addScaledVector(inward,.2)];
  };
  const aperture={width:side.width,edge:side.edge,clear:[],jambs:[]};
  for(const offset of [-.35,0,.35].map(f=>f*side.width)){
    const [from,to]=crossing(offset),block=rayHit(records,from,to);
    requireThat(!block,'washroom-door-opening',rule.portalId,'The declared doorway must have a real open cross-section.',{offset,first:block&&block.record.id});
    aperture.clear.push({from:tuple(from),to:tuple(to)});
  }
  for(const offset of [-1,1].map(sign=>sign*(side.width/2+.10))){
    const [from,to]=crossing(offset),hit=rayHit(walls,from,to);
    requireThat(hit,'washroom-door-jamb',rule.portalId,'A solid wall must bound both sides of the declared aperture.',{offset});
    aperture.jambs.push({wall:hit.record.id,point:tuple(hit.point)});
  }
  function wallContact(f){
    const toRoom=roomFrom(f),inverse=toRoom.clone().invert(),normal=vector(0,0,1).transformDirection(toRoom);
    const namedBack={'makeup-mirror-wall':'makeup-wall-mount','washroom-dispenser':'dispenser-wall-back'}[f.resource.mountRole];
    const supportingParts=namedBack?[named(f,namedBack)]:owned(f);
    const faces=supportingParts.flatMap(r=>triangles(r).map(t=>({r,t})));
    const candidates=[];
    for(const {r,t} of faces){
      const p=t.getMidpoint(vector());
      if(t.getArea()<1e-9||[t.a,t.b,t.c].some(v=>Math.abs(v.clone().applyMatrix4(inverse).z)>tol))continue;
      const hit=rayHit(walls,p.clone().addScaledVector(normal,.025),p.clone().addScaledVector(normal,-.025));
      if(hit&&p.distanceTo(hit.point)<=tol&&hit.normal.dot(normal)>.99)candidates.push({r,p,hit,area:t.getArea()});
    }
    requireThat(candidates.length,'washroom-wall-backing',f.id,'The mounted back face needs physical wall material at the contact plane.');
    // Preserve lateral support witnesses as well as the centre. A mount spanning a doorway cannot use a single edge as its backing.
    const spec=f.resource.mounting, probes=[];
    for(const x of [-.38,.38])for(const y of [-.37,.37]){
      const p=vector(x*spec.width,y*spec.height,0).applyMatrix4(toRoom);
      const hit=rayHit(walls,p.clone().addScaledVector(normal,.025),p.clone().addScaledVector(normal,-.025));
      requireThat(hit&&hit.point.distanceTo(p)<=tol&&hit.normal.dot(normal)>.99,'washroom-wall-opening',f.id,'Mount corners must lie on a solid wall face.',{point:tuple(p)});
      probes.push(tuple(hit.point));
    }
    const c=candidates.sort((a,b)=>b.area-a.area)[0];
    return {wall:c.hit.record.id,mesh:part(c.r),back:tuple(c.p),first:tuple(c.hit.point),normal:tuple(normal),probes};
  }
  const mirrorBack=wallContact(mirror),dispenserBack=wallContact(dispenser);
  const faceName=mirror.resource.mirrorPanels?.find(p=>p.id==='center')?.node??mirror.resource.mirrorNodes?.face;
  const face=named(mirror,faceName);
  const target=face.bounds.getCenter(vector());
  const mirrorLocal=target.clone().applyMatrix4(roomToBasin),view=service.clone().add(vector(0,1.55,0));
  const reflection=rayHit(sightRecords,view,target),forward=vector(0,0,1).transformDirection(basis);
  requireThat(reflection?.record===face&&reflection.normal.dot(forward)>.98&&Math.abs(mirrorLocal.x)<.30&&mirrorLocal.z<-.25&&
    mirrorLocal.y>=1.25&&mirrorLocal.y<=1.90,'washroom-mirror-face',mirror.id,'The wall mirror must be behind the basin and present its actual front panel to the standing position.',
    {first:reflection&&part(reflection.record),mirrorInBasin:tuple(mirrorLocal)});

  const button=named(dispenser,'dispenser-actuator'),outlet=named(dispenser,'dispenser-outlet');
  const reachFrom=service.clone().add(vector(0,1.22,0));
  const taps=triangles(button).filter(t=>t.getArea()>1e-8).map(t=>t.getMidpoint(vector())).sort((a,b)=>reachFrom.distanceToSquared(a)-reachFrom.distanceToSquared(b));
  let press;
  for(const target of taps){
    if(target.distanceTo(reachFrom)>.75)break;
    const hit=rayHit(records,reachFrom,target);
    if(hit?.record===button){press=hit;break;}
  }
  requireThat(press,'washroom-dispenser-reach',dispenser.id,'A real actuator surface must be within 0.75 m and unobstructed from the service reach reference.');
  const nozzleFace=triangles(outlet).filter(t=>t.getArea()>1e-8&&t.getNormal(vector()).y<-.70)
    .map(t=>t.getMidpoint(vector())).sort((a,b)=>a.y-b.y)[0];
  requireThat(nozzleFace,'washroom-dispenser-outlet',dispenser.id,'A physical outlet underside is required.');
  const underside=rayHit(records,nozzleFace.clone().sub(vector(0,.075,0)),nozzleFace);
  requireThat(underside?.record===outlet,'washroom-dispenser-outlet',dispenser.id,'Keep at least 75 mm clear below the actual outlet.',{first:underside&&part(underside.record)});
  const contents=facilities.filter(f=>f.node.parentId===sign.id&&f.resource.mount==='information-surface'&&f.resource.mountRole==='information-content');
  requireThat(contents.length===1&&contents[0].state.visible===true,'washroom-sign-content',sign.id,'Install one visible graphic on the public washroom sign.');
  const content=contents[0],graphic=named(content,content.resource.informationNodes?.face);
  const materials=Array.isArray(graphic.object.material)?graphic.object.material:[graphic.object.material];
  requireThat(graphic.object.geometry.getAttribute('uv')&&materials.some(m=>m.visible&&m.map),
    'washroom-sign-content',content.id,'The sign requires a physical textured graphic face.');
  graphic.object.geometry.computeBoundingBox();
  const box=graphic.object.geometry.boundingBox,entry=vector(route.threshold[0],1.55,route.threshold[1]),signRays=[];
  // Use the connected doorway, including its actual lane, as the reading origin.
  // Four interior corners and the centre check the printable area and its viewing angle.
  for(const [u,v] of [[.12,.15],[.88,.15],[.50,.50],[.12,.85],[.88,.85]]){
    const p=vector(T.MathUtils.lerp(box.min.x,box.max.x,u),T.MathUtils.lerp(box.min.y,box.max.y,v),box.max.z).applyMatrix4(graphic.matrix);
    const hit=rayHit(sightRecords,entry,p);
    const cosine=hit?.normal.dot(entry.clone().sub(p).normalize());
    requireThat(hit?.record===graphic&&hit.point.distanceTo(p)<=.003&&cosine>=.5,'washroom-sign-facing',sign.id,
      'The labelled face must be readable from the public doorway within 60 degrees, with no intervening surface.',
      {reader:tuple(entry),sample:[u,v],first:hit&&part(hit.record),frontCosine:cosine??null});
    signRays.push({sample:[u,v],point:tuple(hit.point),angleDegrees:T.MathUtils.radToDeg(Math.acos(T.MathUtils.clamp(cosine,-1,1)))});
  }
  return {ok:true,regionId:area.id,floorId:floor.floorId,portalId:rule.portalId,roles:{...rule.roles},service:[...rule.service],publicApproach,route,aperture,checkedMeshes,
    clearance:{radius,height,min:tuple(clean.min),max:tuple(clean.max)},assets:Object.fromEntries([basin,mirror,dispenser,sign].map(f=>[f.id,{...f.node.resource,sha256:f.resource.asset.sha256}])),
    basin:{size:tuple(size),floor:basinFoot,slab:tuple(lip.point),well:tuple(well.point),frontHit:tuple(frontRay.point),spout:tuple(nozzle.point),underSpout:tuple(inside.point)},
    mirror:{mesh:faceName,frontHit:tuple(reflection.point),normal:tuple(reflection.normal),backing:mirrorBack},
    dispenser:{mesh:part(button),from:tuple(reachFrom),actuatorHit:tuple(press.point),distanceM:press.distance,outlet:tuple(underside.point),backing:dispenserBack},
    sign:{floor:signFoot,contentId:content.id,resource:{...content.node.resource,sha256:content.resource.asset.sha256},mesh:part(graphic),entry:tuple(entry),rays:signRays}};
}

export function publicWashroomFloors(document,derived) {
  if(!shouldCheckPublicWashrooms(document,{derived}))return [];
  requireThat(Array.isArray(document.publicWashrooms)&&document.publicWashrooms.length,'washroom-declaration-required','publicWashrooms','Each installed public basin needs a washroom declaration.');
  const used=new Set(),bindings=document.publicWashrooms.map(rule=>bind(rule,derived,used));
  for(const f of publicBasins(derived))
    requireThat(used.has(f.id),'washroom-declaration-required',f.id,'Bind every basin installed in a public restroom service area.');
  const floors=new Map();
  for(const b of bindings){
    const id=derived.floorIds.get(b.area.id);
    if(!floors.has(id)){
      const resources=[...derived.facilities,...derived.surfaceFinishes].filter(f=>f.floorId===id).map(f=>f.resource);
      floors.set(id,{id,resources,bindings:[]});
    }
    floors.get(id).bindings.push(b);
  }
  return [...floors.values()];
}

// Keep validation independent of the active editor camera and displayed floor.
// The disposable scene uses loaded facility meshes without acquiring any reflection targets.
export function measurePublicWashroomFloor(document,derived,placement,group,{catalog,templates,assetLibrary}) {
  requireThat(assetLibrary,'washroom-assets-required',group.id,'Load the installed physical assets to validate this public washroom.');
  const floor=inspectCompanyConnections(document,catalog,templates).floors.find(f=>f.floorId===group.id);
  const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
  try{
    scene.root.updateMatrixWorld(true);
    return group.bindings.map(b=>measure(scene,derived,placement,floor,b));
  }finally{scene.dispose();}
}
