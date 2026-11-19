import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {CompanyError,deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {WALL_HEIGHT} from '../../prototype/src/company/wall-visibility.js';
import {inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createLocalRoomAssetLibrary,scanRoomMeshes} from './check-training-clearance.mjs';

const margin=.001;
const memberKeys=['counter','stockShelf','featured','camera','backdrop','sampleLow','sampleMid','sampleHigh'];
const fail=(code,at,message,details)=>{throw new CompanyError(code,at,message,details);};
const coord=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const xyz=p=>p.toArray().map(n=>Number(n.toFixed(6)));
const partName=o=>o.userData.name||o.name||o.type;
const serialBox=b=>({min:xyz(b.min),max:xyz(b.max)});

function checkRule(rule) {
  const p=rule?.presenter;
  if(typeof rule?.roomId!=='string'||typeof rule.portalId!=='string'||!Array.isArray(rule.approach)||
    !rule.approach.every(coord)||!coord(p?.offset)||![rule.aisleWidth,p.width,p.depth,p.height].every(Number.isFinite)||
    Math.min(rule.aisleWidth,p.width,p.depth)<.5||p.height<=2*margin||p.height>WALL_HEIGHT||
    !Number.isFinite(rule.maxOffAxisDegrees)||rule.maxOffAxisDegrees<=0||rule.maxOffAxisDegrees>=90)
    fail('invalid-showcase-rule','showcase','Specify a room, doorway, room-local bends, presenter prism and forward framing angle.');
  const members=rule.members;
  if(!members||typeof members!=='object'||Array.isArray(members)||Object.keys(members).length!==memberKeys.length||
    !memberKeys.every(key=>Object.hasOwn(members,key)&&typeof members[key]==='string'&&members[key].trim())||
    new Set(Object.values(members)).size!==memberKeys.length)
    fail('invalid-showcase-members','showcase.members','Provide distinct installed instance IDs for all showcase members.',{keys:memberKeys});
}

function reserve(rule,room,counterLocal,portal) {
  const p=rule.presenter, delta=v(p.offset[0],0,p.offset[1]).applyMatrix4(counterLocal);
  const points=[[portal.local.center[0],portal.local.center[2]],...rule.approach,[delta.x,delta.z]];
  if(rule.aisleWidth>portal.width||p.height>(portal.height??WALL_HEIGHT)+1e-7)
    fail('showcase-door-fit',rule.portalId,'The physical doorway must contain the aisle width and clear height.');
  const regions=[];
  function add(name,minX,maxX,minZ,maxZ) {
    if(minX < -room.bounds.width/2-1e-6 || maxX>room.bounds.width/2+1e-6 ||
      minZ < -room.bounds.depth/2-1e-6 || maxZ>room.bounds.depth/2+1e-6)
      fail('showcase-reserve-outside',room.id,'Showcase clearance extends beyond the room.',{name,minX,maxX,minZ,maxZ});
    regions.push({name,box:new THREE.Box3(v(minX+margin,margin,minZ+margin),v(maxX-margin,p.height-margin,maxZ-margin))});
  }
  const corners=[-1,1].flatMap(i=>[-1,1].map(j=>v(p.offset[0]+i*p.width/2,0,p.offset[1]+j*p.depth/2).applyMatrix4(counterLocal)));
  add('presenter',Math.min(...corners.map(c=>c.x)),Math.max(...corners.map(c=>c.x)),
    Math.min(...corners.map(c=>c.z)),Math.max(...corners.map(c=>c.z)));
  const half=rule.aisleWidth/2;
  for(let i=1;i<points.length;i++){
    const [x,z]=points[i-1],[u,w]=points[i],dx=u-x,dz=w-z;
    const alongX=Math.abs(dz)<1e-6,alongZ=Math.abs(dx)<1e-6;
    if(alongX===alongZ)fail('invalid-showcase-route',room.id,'Use nonzero orthogonal route segments.',{from:[x,z],to:[u,w]});
    if(i===1 && !(portal.edge==='west'&&alongX&&dx>0 || portal.edge==='east'&&alongX&&dx<0 ||
      portal.edge==='north'&&alongZ&&dz>0 || portal.edge==='south'&&alongZ&&dz<0))
      fail('invalid-showcase-route',rule.portalId,'The first segment must enter the room perpendicular to its actual threshold.');
    // Extend only interior bends, covering a square corner at each change of travel direction.
    const start=i===1?0:half,end=i===points.length-1?0:half;
    const xx=alongX?x-Math.sign(dx)*start:x,uu=alongX?u+Math.sign(dx)*end:u;
    const zz=alongZ?z-Math.sign(dz)*start:z,ww=alongZ?w+Math.sign(dz)*end:w;
    add('aisle-'+i,Math.min(xx,uu)-(alongX?0:half),Math.max(xx,uu)+(alongX?0:half),
      Math.min(zz,ww)-(alongZ?0:half),Math.max(zz,ww)+(alongZ?0:half));
    if(i===1){const box=regions.at(-1).box;
      if(portal.edge==='west')box.min.x=x-1e-7;
      if(portal.edge==='east')box.max.x=x+1e-7;
      if(portal.edge==='north')box.min.z=z-1e-7;
      if(portal.edge==='south')box.max.z=z+1e-7;
    }
  }
  return {regions,points};
}

function measuredBounds(record) {
  const box=new THREE.Box3(),vertex=v(),positions=record.object.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    record.object.getVertexPosition(i,vertex).applyMatrix4(record.matrix);
    box.expandByPoint(vertex);
  }
  return box;
}

function hitMesh(record,ray) {
  if(!ray.intersectsBox(record.bounds))return null;
  const {object,matrix}=record,g=object.geometry,index=g.index,positions=g.attributes.position;
  const a=v(),b=v(),c=v(),hit=v();
  let closest=null;
  const start=g.drawRange.start,end=Math.min(index?.count??positions.count,start+g.drawRange.count);
  for(let k=start;k+2<end;k+=3){
    for(const [i,vertex] of [a,b,c].entries()) object.getVertexPosition(index?index.getX(k+i):k+i,vertex).applyMatrix4(matrix);
    if(ray.intersectTriangle(a,b,c,false,hit)){
      const distance=hit.distanceTo(ray.origin);
      if(distance>.00001&&(!closest||distance<closest.distance))closest={distance,position:xyz(hit)};
    }
  }
  return closest;
}

function firstHit(records,ray) {
  let first=null;
  for(const r of records){
    const hit=hitMesh(r,ray);
    if(hit&&(!first||hit.distance<first.distance))first={...hit,instanceId:r.owner?.id??r.object.name,mesh:partName(r.object)};
  }
  return first;
}

function measureShot(rule,records,camera,featured,backdrop,worldToRoom,scene){
  const byId=id=>records.filter(r=>r.owner?.id===id);
  const lens=byId(camera.id).find(r=>partName(r.object)===camera.resource.camera?.lensNode);
  if(!lens||camera.resource.camera?.forward!=='+Z')
    fail('showcase-lens-missing',camera.id,'The installed camera must have its optical mesh and +Z convention.');
  const cameraToRoom=worldToRoom.clone().multiply(scene.root.getObjectByName(camera.id).matrixWorld);
  const forward=v(0,0,1).transformDirection(cameraToRoom),right=v(1,0,0).transformDirection(cameraToRoom);
  const lensBounds=measuredBounds(lens),center=lensBounds.getCenter(v());
  const start=center.clone().addScaledVector(forward,lensBounds.getSize(v()).length()+.001);
  const optical=hitMesh(lens,new THREE.Ray(start,forward.clone().negate()));
  if(!optical)fail('showcase-lens-missing',camera.id,'The optical centerline did not intersect the actual lens surface.');
  const origin=v().fromArray(optical.position);
  const meshes=byId(featured.id);
  const bounds=meshes.reduce((b,r)=>b.union(measuredBounds(r)),new THREE.Box3());
  if(bounds.isEmpty())fail('showcase-product-missing',featured.id,'The selected featured product has no visible geometry.');
  const middle=bounds.getCenter(v()),size=bounds.getSize(v()),width=Math.abs(right.x)*size.x+Math.abs(right.z)*size.z;
  const shot=[];
  for(const [horizontal,vertical] of [[0,0],[-.18,0],[.18,0],[0,.18],[0,-.18]]){
    const aim=middle.clone().addScaledVector(right,horizontal*width);aim.y+=vertical*size.y;
    const dir=aim.sub(origin).normalize(),angle=THREE.MathUtils.radToDeg(dir.angleTo(forward));
    const ray=new THREE.Ray(origin,dir),target=firstHit(meshes,ray);
    if(!target)continue;
    if(angle>rule.maxOffAxisDegrees)fail('showcase-off-axis',camera.id,'The featured product is outside the authored framing angle.',
      {targetId:featured.id,lens:xyz(origin),target:target.position,angle,maxOffAxisDegrees:rule.maxOffAxisDegrees});
    const first=firstHit(records.filter(r=>r!==lens),ray);
    if(first?.instanceId!==featured.id)fail('showcase-occluded',first?.instanceId??featured.id,'Foreground geometry blocks the lens-to-product ray.',
      {cameraId:camera.id,featuredId:featured.id,lens:xyz(origin),target:target.position,blocker:first});
    shot.push({angleDegrees:angle,...target});
  }
  if(!shot.length)fail('showcase-product-missing',featured.id,'No sampled sightline hits an actual product triangle.');
  // Check background behind the display at lens height; product framing and background are separate samples.
  const bg=firstHit(byId(backdrop.id),new THREE.Ray(origin,forward));
  if(!bg||bg.distance<=middle.clone().sub(origin).dot(forward))
    fail('showcase-backdrop-missing',backdrop.id,'The forward centerline must reach the installed backdrop behind the product.',{lens:xyz(origin),forward:xyz(forward)});
  return {lens:xyz(origin),forward:xyz(forward),framingHalfAngleDegrees:rule.maxOffAxisDegrees,productHits:shot,backdrop:bg};
}

export async function checkShowcaseRoom(document,rule,{catalog=catalogDefault,templates=templatesDefault}={}) {
  checkRule(rule);
  const d=deriveCompany(document,catalog,templates),room=d.nodes.get(rule.roomId);
  if(room?.kind!=='room')fail('showcase-room-missing',rule.roomId,'Choose an installed room.');
  const floorId=d.floorIds.get(room.id),facilities=d.facilities.filter(f=>f.floorId===floorId);
  function installed(name,role) {
    const id=rule.members[name],f=d.facilities.find(candidate=>candidate.id===id);
    if(f?.roomId!==room.id||f.resource.mountRole!==role)
      fail('showcase-wrong-subject',id,'Expected an installed '+role+' in the selected room.',
        {member:name,roomId:room.id,actualRoomId:f?.roomId??null,expectedRole:role});
    return f;
  }
  const camera=installed('camera','camera-static'),counter=installed('counter','hinged-cabinet'),
    shelf=installed('stockShelf','storage-shelf'),backdrop=installed('backdrop','background-panel');
  const mounts=[['featured',counter,'top'],['sampleLow',shelf,'lower'],['sampleMid',shelf,'middle'],['sampleHigh',shelf,'top']]
    .map(([name,host,surface])=>{
      const item=installed(name,'showcase-product');
      if(item.resource.productionBranch!=='showcase-product'||item.resource.mount!=='support-surface'||
        item.node.parentId!==host.id||item.node.attachment?.surfaceId!==surface||!host.resource.supportNodes?.[surface])
        fail('showcase-wrong-mount',item.id,'The product must occupy the designated actual display surface.',{hostId:host.id,surface});
      return {item,host,surface};
    });
  const layout=inspectCompanyPlacement(document,catalog,templates);
  const floor=inspectCompanyConnections(document,catalog,templates).floors.find(f=>f.floorId===floorId);
  const conn=floor.connections.find(c=>c.id===rule.portalId);
  const portal=[conn?.from,conn?.to,...floor.exteriorEntrances.filter(c=>c.id===rule.portalId)].find(p=>p?.regionId===room.id);
  if(!portal||!layout.checkedPortals.some(p=>p.connectionId===rule.portalId&&p.regionId===room.id))
    fail('showcase-door-missing',rule.portalId,'Choose a validated physical doorway of this room.');
  const library=createLocalRoomAssetLibrary();let scene;
  try{
    await library.preload([...facilities,...d.surfaceFinishes.filter(f=>f.floorId===floorId)].map(f=>f.resource));
    scene=createCompanyScene(new THREE.Scene(),document,{catalog,templates,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    const roomMatrix=scene.root.getObjectByName(room.id).matrixWorld.clone().invert();
    const counterMatrix=roomMatrix.clone().multiply(scene.root.getObjectByName(counter.id).matrixWorld);
    const {regions,points}=reserve(rule,room,counterMatrix,portal),failures=[],records=[];
    const {checkedMeshes}=scanRoomMeshes(scene,room,facilities,regions,failures,(object,owner,matrix,bounds)=>{
      records.push({object,owner,matrix:matrix.clone(),bounds:bounds.clone()});
    });
    for(const o of d.obstacles.filter(o=>o.floorId===floorId&&o.resource.mount!=='portal-door')){
      const box=new THREE.Box3().setFromPoints(o.corners.map(c=>v().fromArray(c).applyMatrix4(roomMatrix)));
      for(const r of regions)if(box.max.x>r.box.min.x&&box.min.x<r.box.max.x&&box.max.z>r.box.min.z&&box.min.z<r.box.max.z)
        failures.push({region:r.name,kind:'blocking-footprint',componentId:o.id,footprint:serialBox(box)});
    }
    if(failures.length){
      for(const f of failures)f.roomLocalReserve=serialBox(regions.find(r=>r.name===f.region).box);
      fail('showcase-clearance-obstructed',failures[0].componentId,'A facility or structural surface enters the presenter or route reserve.',{roomId:room.id,failures});
    }
    const supports=mounts.map(({item,host,surface})=>{
      const support=records.find(r=>r.owner?.id===host.id&&partName(r.object)===host.resource.supportNodes[surface]);
      const product=records.filter(r=>r.owner?.id===item.id);
      const bottom=Math.min(...product.map(r=>measuredBounds(r).min.y)),top=support&&measuredBounds(support).max.y;
      if(!Number.isFinite(bottom)||!Number.isFinite(top)||Math.abs(bottom-top)>margin)
        fail('showcase-support-contact',item.id,'Installed product bottom and actual support top must meet within 1 mm.',{hostId:host.id,surface,top,bottom});
      return {id:item.id,resource:item.node.resource,host:host.id,surface,mesh:partName(support.object),roomTopY:top,productBottomY:bottom};
    });
    const sight=measureShot(rule,records,camera,mounts[0].item,backdrop,roomMatrix,scene);
    return {ok:true,roomId:room.id,floorId,members:{...rule.members},portalId:rule.portalId,portalEdge:portal.edge,route:points,
      reserves:regions.map(r=>({region:r.name,...serialBox(r.box)})),checkedMeshes,supports,sight,
      limits:'Static room-local triangle and footprint checks with 1 mm contact tolerance. Sight samples are double-sided opaque surface tests. The framing half-angle is authored; character occupancy, lens calibration and full image coverage are outside this check.'};
  }finally{scene?.dispose();library.dispose();}
}

export async function checkProductShowcases(document,options) {
  const rules=document.productShowcases;
  if(!Array.isArray(rules)||!rules.length)
    fail('invalid-product-showcases','document.productShowcases','Expected a nonempty array of room showcase rules.');
  const rooms=new Set();
  for(const [index,rule] of rules.entries()){
    if(typeof rule?.roomId!=='string'||!rule.roomId||rooms.has(rule.roomId))
      fail('invalid-product-showcases',`document.productShowcases[${index}].roomId`,'Each showcase must select a distinct room.',{roomId:rule?.roomId});
    rooms.add(rule.roomId);
  }
  const reports=[];
  for(const rule of rules)reports.push(await checkShowcaseRoom(document,rule,options));
  return reports;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [file,rules,...extra]=process.argv.slice(2);
    if(!file||!rules||extra.length)throw Error('Usage: node check-showcase-room.mjs LAYOUT.json RULE_OR_ROOM_RULES.json');
    const [document,input]=await Promise.all([file,rules].map(async f=>JSON.parse(await fs.readFile(f,'utf8'))));
    console.log(JSON.stringify(await checkShowcaseRoom(document,input.roomId?input:input[document.id]),null,2));
  }catch(error){console.log(JSON.stringify({ok:false,code:error.code??'showcase-input',path:error.path,message:error.message,details:error.details},null,2));process.exitCode=1;}
}
