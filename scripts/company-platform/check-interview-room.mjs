import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import defaultCatalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import defaultTemplates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {CompanyError,deriveCompany} from '../../prototype/src/company/document.js';
import {overlapsObstacle} from '../../prototype/src/company/wardrobe-footprints.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {WALL_HEIGHT} from '../../prototype/src/company/wall-visibility.js';
import {scanRoomMeshes} from './check-training-clearance.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));
const rolesRequired=['hostChair','guestChair','hostMic','guestMic','camera'];
const speakers=['host','guest'];
const radius=.25,height=1.90,tolerance=.001,eps=1e-6;
const fail=(code,at,message,details)=>{throw new CompanyError(code,at,message,details);};
const vec=(x,y,z)=>new T.Vector3(x,y,z);
const tuple=p=>p.toArray().map(n=>Number(n.toFixed(7)));
const token=value=>typeof value==='string'&&value.trim().length>0;
const keys=(value,list)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===list.length&&list.every(k=>Object.hasOwn(value,k));
const component=o=>o.userData.name||o.name||o.type;

function checkRule(rule){
  if(!keys(rule,['regionId','roles','portalId','routes'])||!token(rule.regionId)||!token(rule.portalId))
    fail('invalid-interview-rule','interviewRooms','Specify the room, physical doorway, two routes and cast roles.');
  if(!keys(rule.roles,rolesRequired)||!Object.values(rule.roles).every(token)||new Set(Object.values(rule.roles)).size!==rolesRequired.length)
    fail('invalid-interview-roles',rule.regionId,'Five distinct installed instance IDs are required.');
  if(!keys(rule.routes,speakers)||!speakers.every(k=>Array.isArray(rule.routes[k])&&rule.routes[k].length>=2&&
    rule.routes[k].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))))
    fail('invalid-interview-route',rule.regionId,'Each route requires finite room-local XZ points from its doorway to its own exit.');
}

function findMembers(derived,rule){
  const members={};
  for(const key of rolesRequired){
    const id=rule.roles[key],role=key==='camera'?'camera-static':key.endsWith('Chair')?'chair':'desk-microphone';
    const f=derived.facilities.find(entry=>entry.id===id);
    if(f?.roomId!==rule.regionId||f.resource.mountRole!==role)
      fail('interview-wrong-member',id,'Expected an installed '+role+' in the interview room.',{key,roomId:rule.regionId,actualRoomId:f?.roomId??null});
    if(role!=='chair'){
      const host=derived.facilities.find(entry=>entry.id===f.node.parentId);
      if(f.resource.mount!=='desk-surface'||host?.resource.mountRole!=='desk'||host.roomId!==rule.regionId)
        fail('interview-wrong-mount',id,'Interview cameras and microphones require their installed desktop parent.');
    }
    members[key]=f;
  }
  return members;
}

function portalFor(document,rule,options,floorId,placement){
  const floor=inspectCompanyConnections(document,options.catalog,options.templates).floors.find(f=>f.floorId===floorId);
  const conn=floor.connections.find(c=>c.id===rule.portalId);
  const p=[conn?.from,conn?.to,...floor.exteriorEntrances.filter(e=>e.id===rule.portalId)].find(q=>q?.regionId===rule.regionId);
  if(!p||!placement.checkedPortals.some(q=>q.regionId===rule.regionId&&q.connectionId===rule.portalId))
    fail('interview-door-missing',rule.portalId,'Choose a validated entrance to the selected room.');
  if((p.height??WALL_HEIGHT)<height-eps)fail('interview-door-fit',rule.portalId,'The opening is below the route height.');
  return p;
}

function routeRegions(speaker,route,portal,exit,chair,room){
  const [first,last]=[route[0],route.at(-1)];
  const alongX=portal.edge==='east'||portal.edge==='west';
  const axis=alongX?0:1,across=1-axis,sign=portal.edge==='east'||portal.edge==='south'?-1:1;
  const center=[portal.local.center[0],portal.local.center[2]];
  if(Math.abs(first[axis]-center[axis])>eps||Math.abs(first[across]-center[across])+radius>portal.width/2+eps||
    Math.abs(first[across]-route[1][across])>eps||sign*(route[1][axis]-first[axis])<=eps)
    fail('interview-door-fit',chair,'Start the full route at its physical doorway and enter perpendicular to its threshold.',{roomId:room.id,first,edge:portal.edge});
  if(Math.hypot(last[0]-exit[0],last[1]-exit[2])>eps)
    fail('interview-route-seat',chair,'End this route at its own installed chair exit.',{last,exit});
  const regions=[];
  for(let i=1;i<route.length;i++){
    const [a,b]=[route[i-1],route[i]];
    if((Math.abs(b[0]-a[0])<eps)===(Math.abs(b[1]-a[1])<eps))
      fail('invalid-interview-route',chair,'Declare nonzero orthogonal route segments.',{a,b});
    const box=new T.Box3(vec(Math.min(a[0],b[0])-radius,0,Math.min(a[1],b[1])-radius),
      vec(Math.max(a[0],b[0])+radius,height,Math.max(a[1],b[1])+radius));
    if(i===1)(sign>0?box.min:box.max)[alongX?'x':'z']=first[axis];
    regions.push({name:speaker+'/aisle-'+i,box,speaker});
  }
  return regions;
}

function prepareRegions(rule,scene,members,placement,portal,room){
  const group=scene.root.getObjectByName(room.id),local=world=>group.worldToLocal(world.clone());
  const regions=[],seats={};
  for(const speaker of speakers){
    const chair=members[speaker+'Chair'],points=scene.listUsePoints().filter(p=>p.facilityId===chair.id);
    if(points.length!==1||points[0].capacity!==1||!points[0].chairSeat?.isMesh||!points[0].chairBack?.isMesh)
      fail('interview-seat-contact',chair.id,'Each chair must supply its own one-person seat and back meshes.');
    const point=points[0],admitted=placement.checkedPoints.find(p=>p.id===point.id);
    const peer=members[speaker==='host'?'guestChair':'hostChair'];
    const otherSeat=scene.listUsePoints().find(p=>p.facilityId===peer.id);
    if(!otherSeat)fail('interview-seat-contact',peer.id,'The partner chair has no installed seat.');
    const towards=otherSeat.chair.getWorldPosition(vec()).sub(point.chair.getWorldPosition(vec()));
    const facing=vec(0,0,1).transformDirection(point.chair.matrixWorld);
    const facingAngle=T.MathUtils.radToDeg(facing.angleTo(towards));
    if(facingAngle>45+eps)fail('interview-facing',chair.id,'The seat forward axis must face the conversation partner within 45 degrees.',{facingAngle});
    if(!admitted?.approachConnected||!admitted.exitConnected)
      fail('interview-seat-unreachable',chair.id,'Its registered approach and exit must both be reachable.');
    const route=rule.routes[speaker];
    regions.push(...routeRegions(speaker,route,portal,admitted.exit.local,chair.id,room));
    const front=chair.resource.footprint.center[1]+chair.resource.footprint.halfSize[1];
    const corners=[];
    for(const x of [-point.clearance.width/2,point.clearance.width/2])for(const z of [front,Math.max(point.exit[2],point.approach[2])+radius])
      corners.push(local(point.chair.localToWorld(vec(x,0,z))));
    const box=new T.Box3().setFromPoints(corners);box.min.y=0;box.max.y=height;
    regions.push({name:speaker+'/seat-front',box,speaker});
    const center=local(point.chair.getWorldPosition(vec()));
    regions.push({name:speaker+'/above-seat',speaker,ownChair:chair.id,box:new T.Box3(
      vec(center.x-radius,center.y+point.seatHeight,center.z-radius),vec(center.x+radius,height,center.z+radius))});
    seats[speaker]={chair,point,admitted,center,facingAngle};
  }
  for(const r of regions){
    const {min,max}=r.box;
    if(min.x < -room.bounds.width/2-eps||max.x>room.bounds.width/2+eps||min.z < -room.bounds.depth/2-eps||max.z>room.bounds.depth/2+eps)
      fail('interview-route-outside',room.id,'The full-width use area must stay in the room.',{region:r.name,min:tuple(min),max:tuple(max)});
  }
  for(const a of regions.filter(r=>r.speaker==='host'))for(const b of regions.filter(r=>r.speaker==='guest')){
    const overlap=a.box.clone().intersect(b.box).getSize(vec());
    if(Math.min(overlap.x,overlap.y,overlap.z)>eps)
      fail('interview-routes-overlap',room.id,'The two reserved routes and seat use areas overlap.',{host:a.name,guest:b.name});
  }
  return {seats,regions,local};
}

function scanInstallation(scene,derived,facilities,room,floorId,reserves){
  // Keep the door threshold plane in the mesh check; allow 1 mm of floor and boundary contact elsewhere.
  const scans=reserves.map(r=>{
    const box=r.box.clone().expandByScalar(-tolerance);
    if(r.name.endsWith('/aisle-1')){
      for(const [axis,span] of [['x',room.bounds.width],['z',room.bounds.depth]]){
        if(Math.abs(r.box.min[axis]+span/2)<eps)box.min[axis]=r.box.min[axis]-eps;
        if(Math.abs(r.box.max[axis]-span/2)<eps)box.max[axis]=r.box.max[axis]+eps;
      }
    }
    return {...r,box};
  });
  const records=[],failures=[];
  const {checkedMeshes,worldToRoom}=scanRoomMeshes(scene,room,facilities,scans,failures,(object,owner)=>records.push({object,id:owner?.id??object.name}));
  for(const o of derived.obstacles.filter(o=>o.floorId===floorId&&o.resource.mount!=='portal-door')){
    const corners=o.corners.map(p=>vec(...p).applyMatrix4(worldToRoom));
    const aabb=new T.Box3().setFromPoints(corners);
    // Plain footprint corners are stored in grid order, while moving leaves already supply a convex outline.
    const perimeter=o.polygon?corners:[corners[0],corners[1],corners[3],corners[2]];
    const obstacle={min:[aabb.min.x,aabb.min.z],max:[aabb.max.x,aabb.max.z],polygon:perimeter.map(p=>[p.x,p.z])};
    for(const r of scans){
      const {min,max}=r.box;
      if(o.id!==r.ownChair&&overlapsObstacle(obstacle,{min:[min.x,min.z],max:[max.x,max.z]}))
        failures.push({region:r.name,componentId:o.id,kind:'blocking-footprint'});
    }
  }
  const hit=failures.find(f=>scans.find(r=>r.name===f.region)?.ownChair!==f.componentId);
  if(hit)fail('interview-clearance-obstructed',hit.componentId,'Installed geometry or a blocking facility enters a reserved use area.',
    {...hit,roomId:room.id});
  return {records,checkedMeshes};
}

function hasPickupSurface(mesh){
  const geometry=mesh.geometry,positions=geometry?.getAttribute('position');
  if(!positions)return false;
  const index=geometry.index,start=geometry.drawRange.start,end=Math.min(index?.count??positions.count,start+geometry.drawRange.count);
  const a=vec(),b=vec(),c=vec();
  for(let i=start;i+2<end;i+=3){
    mesh.getVertexPosition(index?index.getX(i):i,a);
    mesh.getVertexPosition(index?index.getX(i+1):i+1,b);
    mesh.getVertexPosition(index?index.getX(i+2):i+2,c);
    const area=b.sub(a).cross(c.sub(a)).lengthSq();
    if(Number.isFinite(area)&&area>0)return true;
  }
  return false;
}

function pickupMesh(mic,scene,records){
  const binding=mic.resource.microphone;
  const installed=records.filter(r=>r.id===mic.id);
  if(binding&&Object.hasOwn(binding,'pickupNode')){
    const name=binding.pickupNode,matches=[];
    if(token(name))scene.root.getObjectByName(mic.id).traverse(object=>{
      if(component(object)===name)matches.push(object);
    });
    const mesh=matches[0];
    if(matches.length!==1||!mesh.isMesh||!installed.some(r=>r.object===mesh)||!hasPickupSurface(mesh))
      fail('invalid-interview-pickup-node','resources.'+mic.resource.id+'.microphone.pickupNode',
        'Bind one visible microphone pickup mesh by its authored node name; it must contain a nondegenerate triangle.',
        {instanceId:mic.id,resource:mic.node.resource,pickupNode:name??null,matches:matches.length});
    return mesh;
  }
  for(const name of ['head','grille','microphone']){
    const found=installed.find(r=>component(r.object)===name);
    if(found)return found.object;
  }
  fail('interview-mic-head-missing',mic.id,'The installed microphone must provide a physical pickup mesh.');
}

function measureScene(scene,members,records,seats,local){
  const byName=(id,name)=>records.find(r=>r.id===id&&component(r.object)===name)?.object;
  const camera=members.camera,root=scene.root.getObjectByName(camera.id),lens=byName(camera.id,camera.resource.camera?.lensNode);
  if(!lens||camera.resource.camera?.forward!=='+Z')fail('interview-lens-missing',camera.id,'A forward-facing physical lens is required.');
  const forward=vec(0,0,1).transformDirection(root.matrixWorld);
  // A private two-sided material gives a physical surface test from either side of a thin panel, without mutating runtime meshes.
  const doubleSide=new T.MeshBasicMaterial({side:T.DoubleSide});
  try{
    const probe=new T.Mesh(lens.geometry,doubleSide),probes=records.map(r=>{
      const o=new T.Mesh(r.object.geometry,doubleSide);o.matrixWorld.copy(r.object.matrixWorld);o.userData.source=r;
      return o;
    });
    const cast=(origin,dir,meshes)=>new T.Raycaster(origin,dir.clone().normalize(),1e-6).intersectObjects(meshes,false)[0];
    function hitOn(origin,dir,object){probe.geometry=object.geometry;probe.matrixWorld.copy(object.matrixWorld);return cast(origin,dir,[probe]);}
    const lensBox=new T.Box3().setFromObject(lens,true);
    const front=hitOn(lensBox.getCenter(vec()).addScaledVector(forward,lensBox.getSize(vec()).length()+.001),forward.clone().negate(),lens);
    if(!front)fail('interview-lens-missing',camera.id,'The optical centerline misses the declared lens mesh.');
    const clearScene=probes.filter(p=>p.userData.source.object!==lens),measured=[];
    for(const speaker of speakers){
      const {chair,point,admitted,facingAngle}=seats[speaker],other=seats[speaker==='host'?'guest':'host'].point;
      const origin=point.chair.getWorldPosition(vec()),otherOrigin=other.chair.getWorldPosition(vec());
      const contact=hitOn(origin.clone().add(vec(0,point.seatHeight+.5,0)),vec(0,-1,0),point.chairSeat);
      if(!contact||Math.abs(contact.point.y-origin.y-point.seatHeight)>tolerance)
        fail('interview-seat-contact',chair.id,'Seat center must meet its declared height at the actual cushion within 1 mm.');
      const delta=contact.point.clone().sub(front.point),d=delta.clone().transformDirection(root.matrixWorld.clone().invert());
      const horizontal=T.MathUtils.radToDeg(Math.atan2(d.x,d.z)),vertical=T.MathUtils.radToDeg(Math.atan2(d.y,Math.hypot(d.x,d.z)));
      if(d.z<=0||Math.abs(horizontal)>36+eps||Math.abs(vertical)>22+eps)
        fail('interview-off-axis',camera.id,'The seat is outside the authored two-person framing window.',{chair:chair.id,horizontal,vertical});
      const first=cast(front.point,delta,clearScene)?.object.userData.source;
      if(first?.object!==point.chairSeat)fail('interview-occluded',first?.id??chair.id,'The actual seat surface must be the first hit from the lens.',
        {chair:chair.id,blocker:first?.id,part:first&&component(first.object),lens:tuple(local(front.point)),target:tuple(local(contact.point))});
      const mic=members[speaker+'Mic'];
      const capsule=pickupMesh(mic,scene,records);
      const tip=new T.Box3().setFromObject(capsule,true).getCenter(vec());
      const distance=Math.hypot(tip.x-origin.x,tip.z-origin.z),otherDistance=Math.hypot(tip.x-otherOrigin.x,tip.z-otherOrigin.z);
      if(distance>.90+eps||distance+eps>=otherDistance||tip.y<=contact.point.y)
        fail('interview-mic-position',mic.id,'The pickup must be above its seat, within 0.90 m horizontally, and closer to this seat than to the other.',{distance,otherDistance});
      measured.push({speaker,chair:chair.id,usePoint:point.id,seatMesh:component(point.chairSeat),backMesh:component(point.chairBack),
        contact:tuple(local(contact.point)),horizontalDegrees:horizontal,verticalDegrees:vertical,towardPartnerDegrees:facingAngle,
        mic:mic.id,micParent:mic.node.parentId,micMesh:component(capsule),micHead:tuple(local(tip)),micDistance:distance,
        approach:admitted.approach.local,exit:admitted.exit.local});
    }
    return {lens:tuple(local(front.point)),seats:measured};
  }finally{doubleSide.dispose();}
}

export async function checkInterviewRoom(document,rule,{catalog=defaultCatalog,templates=defaultTemplates,root=defaultRoot}={}){
  checkRule(rule);
  const derived=deriveCompany(document,catalog,templates),room=derived.nodes.get(rule.regionId);
  if(room?.kind!=='room')fail('interview-room-missing',rule.regionId,'Select a real installed room.');
  const floorId=derived.floorIds.get(room.id),facilities=derived.facilities.filter(f=>f.floorId===floorId);
  const members=findMembers(derived,rule),placement=inspectCompanyPlacement(document,catalog,templates);
  const portal=portalFor(document,rule,{catalog,templates},floorId,placement);
  let report;
  await preflightLibraryAssets({root,resources:[...facilities,...derived.surfaceFinishes.filter(f=>f.floorId===floorId)].map(f=>f.resource),validate:library=>{
    const scene=createCompanyScene(new T.Scene(),document,{assetLibrary:library,catalog,templates,visibleFloorId:floorId,mirrorPreflight:()=>{}});
    try{
      const {seats,regions,local}=prepareRegions(rule,scene,members,placement,portal,room);
      const {records,checkedMeshes}=scanInstallation(scene,derived,facilities,room,floorId,regions);
      const tables=facilities.filter(f=>f.roomId===room.id&&f.resource.mountRole==='side-table'&&f.resource.supportNodes?.top);
      const midpoint=seats.host.center.clone().lerp(seats.guest.center,.5);
      const tops=tables.map(f=>({id:f.id,mesh:records.find(r=>r.id===f.id&&component(r.object)===f.resource.supportNodes.top)?.object}))
        .filter(t=>t.mesh).map(t=>({id:t.id,mesh:component(t.mesh),center:tuple(local(new T.Box3().setFromObject(t.mesh,true).getCenter(vec())))}));
      tops.sort((a,b)=>Math.hypot(a.center[0]-midpoint.x,a.center[2]-midpoint.z)-Math.hypot(b.center[0]-midpoint.x,b.center[2]-midpoint.z));
      report={ok:true,regionId:room.id,floorId,roles:{...rule.roles},portalId:rule.portalId,table:tops[0]??null,routes:rule.routes,
        routeWidth:2*radius,clearHeight:height,checkedRegions:regions.length,checkedMeshes,
        ...measureScene(scene,members,records,seats,local),
        scope:'Installed rigid mesh, static lane and seat contact checks. Framing and microphone distance are layout limits; performer fit, audio and dynamic occupancy require C3.'};
    }finally{scene.dispose();}
  }});
  return report;
}

export function validateInterviewRoom({document,catalog,templates,root,regionId,roles,portalId,routes}){
  return checkInterviewRoom(document,{regionId,roles,portalId,routes},{catalog,templates,root});
}

export async function checkInterviewRooms(document,options){
  const rules=document.interviewRooms;
  if(!Array.isArray(rules)||!rules.length)fail('invalid-interview-rooms','document.interviewRooms','Expected a nonempty array of interview rooms.');
  const seen=new Set();
  for(const rule of rules){
    checkRule(rule);
    if(seen.has(rule.regionId))fail('invalid-interview-rooms',rule.regionId,'Only one interview constraint may own a room.');
    seen.add(rule.regionId);
  }
  const reports=[];
  for(const rule of rules)reports.push(await checkInterviewRoom(document,rule,options));
  return reports;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [layout,rule,...extra]=process.argv.slice(2);
    if(!layout||extra.length)throw Error('Usage: node check-interview-room.mjs LAYOUT.json [RULE.json]');
    const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
    const document=await read(layout);
    console.log(JSON.stringify(rule?await checkInterviewRoom(document,await read(rule)):await checkInterviewRooms(document),null,2));
  }catch(e){console.log(JSON.stringify({ok:false,code:e.code??'interview-input',path:e.path,message:e.message,details:e.details},null,2));process.exitCode=1;}
}
