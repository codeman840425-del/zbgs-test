import * as T from 'three';
import {CompanyError,prepareCompanyChange} from './document.js';
import {inspectCompanyConnections} from './space.js';
import {createCompanyScene} from './render.js';
import {scanRoomMeshes,rayHit,vertices} from './room-mesh-geometry.js';
import {checkRoomDoorAccess,clearanceQuery} from './public-door-access.js';

const radius=.25,height=1.9,eyeHeight=1.50,thresholdDepth=.28;
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const xyz=p=>p.toArray().map(n=>Number(n.toFixed(6))||0);
const xz=p=>[p.x,p.z].map(n=>Number(n.toFixed(6))||0);
const name=r=>r.object.userData.name||r.object.name;
const str=x=>typeof x==='string'&&x.trim().length>0;
const list=(data,n)=>Array.isArray(data)&&data.length===n&&data.every(Number.isFinite);
const keys=(data,required,optional=[])=>data&&typeof data==='object'&&!Array.isArray(data)&&
  required.every(k=>Object.hasOwn(data,k))&&Object.keys(data).every(k=>required.includes(k)||optional.includes(k));
function check(ok,code,where,message,details){if(!ok)throw new CompanyError(code,where,message,details);}

export const shouldCheckWayfinding=document=>Object.hasOwn(document,'wayfindingRooms');

export function wayfindingFloors(document,derived){
  if(!shouldCheckWayfinding(document))return [];
  const rules=document.wayfindingRooms,seen=new Set();
  check(Array.isArray(rules)&&rules.length,'invalid-wayfinding','wayfindingRooms','Declare at least one signed public floor.');
  return rules.map(rule=>{
    const where=rule?.floorId??'wayfindingRooms';
    check(keys(rule,['floorId','signs'],['service'])&&Array.isArray(rule.signs)&&rule.signs.length&&str(rule.floorId)&&
      derived.nodes.get(rule.floorId)?.kind==='floor'&&!seen.has(rule.floorId),'invalid-wayfinding',where,'Bind each signed floor once.');
    seen.add(where);
    const facilities=derived.facilities.filter(f=>f.floorId===where),byId=new Map(facilities.map(f=>[f.id,f]));
    const floor=derived.nodes.get(where),readings=new Set();
    function doorway(item){
      const area=derived.nodes.get(item.regionId),from=derived.nodes.get(item.fromRegionId),conn=floor.connections?.find(c=>c.id===item.portalId);
      check(area?.kind==='area'&&from?.kind==='area'&&area.id!==from.id&&area.parentId===where&&from.parentId===where&&conn&&
        [conn.from.regionId,conn.to.regionId].every(id=>id===area.id||id===from.id),'wayfinding-doorway',item.portalId,'Use the actual public doorway between the declared source and receiving areas.');
      return area;
    }
    const signs=rule.signs.map(s=>{
      check(keys(s,['regionId','fromRegionId','portalId','boardId','contentId','meaning'])&&Object.values(s).every(str),
        'invalid-wayfinding-sign',where,'Declare the source doorway, board, content and intended destination.');
      const area=doorway(s),board=byId.get(s.boardId),content=byId.get(s.contentId);
      check(board?.roomId===area.id&&board.resource.informationSurface&&!readings.has(JSON.stringify([board.id,s.portalId]))&&content?.roomId===area.id&&
        content.node.parentId===board.id&&content.resource.informationContent,'wayfinding-sign-binding',s.boardId,'Bind one installed graphic to each board in its public area.');
      readings.add(JSON.stringify([board.id,s.portalId]));
      check(['arrivals','training','lift','stairs'].includes(s.meaning)&&content.resource.wayfindingMeaning===s.meaning&&
        content.resource.provenance?.sourceDesign===s.meaning,
        'wayfinding-content-meaning',s.contentId,'The printed destination must match the declared service.',{expected:s.meaning,found:content.resource.wayfindingMeaning??null});
      const role={lift:'lift-access',stairs:'stair-access'}[s.meaning];
      check(!role||area.publicRole===role,'wayfinding-destination',s.regionId,'Install the arrival marker in its actual public destination.');
      return {s,area,board,content};
    });
    const service=rule.service;
    if(service!==undefined){
      check(keys(service,['regionId','fromRegionId','portalId','counterId','registerId','surfaceId','registerParts','stand'],
        ['waitingSeatId','coatRackId','garmentId'])&&Object.entries(service).filter(([k])=>!['stand','registerParts'].includes(k)).every(([,x])=>str(x))&&
        list(service.stand,2)&&keys(service.registerParts,['book','pen'])&&Object.values(service.registerParts).every(str)&&service.registerParts.book!==service.registerParts.pen&&
        !!service.coatRackId===!!service.garmentId,'invalid-wayfinding-service',where,'Declare the service counter, physical register parts and standing position.');
      doorway(service);
      const same=(a,b)=>['regionId','fromRegionId','portalId'].every(k=>a[k]===b[k]);
      const serviceSigns=signs.filter(({s})=>['arrivals','training'].includes(s.meaning));
      check(serviceSigns.some(({s})=>same(s,service))&&serviceSigns.every(({s})=>s.regionId===service.regionId),'wayfinding-destination',where,'The arrivals or training face must identify this service at its real entrance.');
      const counter=byId.get(service.counterId),register=byId.get(service.registerId);
      check(counter?.roomId===service.regionId&&counter.resource.supportSurfaces?.some(p=>p.id===service.surfaceId)&&
        register?.node.parentId===counter.id&&register.node.attachment?.surfaceId===service.surfaceId,
        'wayfinding-counter-binding',service.registerId,'Place the declared register on the service counter surface.');
      if(service.waitingSeatId){
        const seat=byId.get(service.waitingSeatId);
        check(seat?.roomId===service.regionId&&seat.resource.usePoints?.some(p=>p.seatNodeId),'wayfinding-seat-binding',service.waitingSeatId,'Bind an installed seat in the service area.');
      }
      if(service.coatRackId){
        const rack=byId.get(service.coatRackId),garment=byId.get(service.garmentId);
        check(rack?.roomId===service.regionId&&garment?.node.parentId===rack.id&&garment.resource.mount==='garment-rail'&&
          rack.resource.garmentRail?.slots.some(p=>p.id===garment.node.attachment?.slotId),'wayfinding-coat-binding',service.garmentId,'Bind a hanging garment on its actual rail slot.');
      }
    }else check(!signs.some(({s})=>['arrivals','training'].includes(s.meaning)),'wayfinding-destination',where,'An arrivals or training desk sign needs a service destination.');
    return {id:where,bindings:[{rule,signs,facilities,byId}],resources:[...facilities,...derived.surfaceFinishes.filter(f=>f.floorId===where)].map(f=>f.resource)};
  });
}

function roomMeasurements(scene,area,facilities){
  const records=[];
  const {worldToRoom,checkedMeshes}=scanRoomMeshes(scene,area,facilities,[],[],(object,f,matrix,bounds)=>
    records.push({id:f?.id??object.name,object,matrix:matrix.clone(),bounds:bounds.clone()}));
  const roomMatrix=f=>worldToRoom.clone().multiply(scene.root.getObjectByName(f.id).matrixWorld);
  function part(f,partName){
    const rows=records.filter(r=>r.id===f.id&&name(r)===partName);
    check(rows.length===1,'wayfinding-part',f.id,'The declared physical part must exist once.',{part:partName});
    return rows[0];
  }
  return {records,roomMatrix,part,checkedMeshes};
}

function readerPosition(floor,s){
  const conn=floor.connections.find(c=>c.id===s.portalId),side=[conn.from,conn.to].find(side=>side.regionId===s.regionId);
  const eye=v(...side.local.center);eye.y=eyeHeight;
  const inward={north:[0,1],south:[0,-1],east:[-1,0],west:[1,0]}[side.edge];
  eye.x+=inward[0]*thresholdDepth;eye.z+=inward[1]*thresholdDepth;
  return eye;
}

function readSign(binding,m,eye){
  const {s,board,content}=binding,graphic=m.part(content,content.resource.informationNodes.face);
  const material=Array.isArray(graphic.object.material)?graphic.object.material:[graphic.object.material];
  check(graphic.object.geometry.getAttribute('uv')&&material.some(m=>m.visible&&m.map),'wayfinding-graphic',s.contentId,'The installed face needs its visible printed texture and UVs.');
  graphic.object.geometry.computeBoundingBox();const bounds=graphic.object.geometry.boundingBox,rays=[];
  for(const [u,w] of [[.50,.50],[.12,.15],[.88,.15],[.12,.85],[.88,.85]]){
    const end=v(T.MathUtils.lerp(bounds.min.x,bounds.max.x,u),T.MathUtils.lerp(bounds.min.y,bounds.max.y,w),bounds.max.z).applyMatrix4(graphic.matrix);
    const face=rayHit([graphic],eye,end),cosine=face?.normal.dot(eye.clone().sub(end).normalize())??-1;
    check(face&&cosine>=.5,'wayfinding-sign-facing',board.id,
      'Face the print toward its public doorway within sixty degrees.',{sample:[u,w],cosine});
    const hit=rayHit(m.records,eye,end);
    check(hit?.record===graphic&&hit.point.distanceTo(end)<=.003,'wayfinding-print-blocked',board.id,
      'Clear the line of sight from the public doorway to the printed face.',{sample:[u,w],first:hit?.record.id,part:hit&&name(hit.record)});
    rays.push({uv:[u,w],hit:xyz(hit.point),angleDegrees:T.MathUtils.radToDeg(Math.acos(T.MathUtils.clamp(cosine,-1,1))),distanceM:hit.distance});
  }
  return {...s,reader:xyz(eye),resource:{...content.node.resource,assetSha256:content.resource.asset.sha256,
    imageSha256:content.resource.provenance.contentPngSha256,title:content.resource.provenance.title,subtitle:content.resource.provenance.subtitle},visible:content.state.visible,rays};
}

function measureService(service,b,m,targets,placement){
  const counter=b.byId.get(service.counterId),register=b.byId.get(service.registerId);
  const surface=counter.resource.supportSurfaces.find(s=>s.id===service.surfaceId),deck=m.part(counter,counter.resource.supportNodes[surface.id]);
  const matrix=m.roomMatrix(counter),inv=matrix.clone().invert();
  const foot=v(service.stand[0],0,service.stand[1]),stand=foot.clone().applyMatrix4(inv);
  const hostEdge=surface.center[1]+surface.halfSize[1],localOffset=stand.z-hostEdge;
  check(localOffset>=radius-.001&&Math.abs(stand.x-surface.center[0])<=surface.halfSize[0]+.001,'wayfinding-counter-service',counter.id,
    'The service point must stand in front of the usable counter surface.',{localStand:xyz(stand)});
  const book=m.part(register,service.registerParts.book),pen=m.part(register,service.registerParts.pen);
  const cargo=m.records.filter(r=>r.id===register.id),points=cargo.flatMap(r=>vertices(r));
  const bottom=points.reduce((y,p)=>Math.min(y,p.y),Infinity),ground=points.filter(p=>p.y<=bottom+.001),contacts=[];
  for(const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    const p=ground.reduce((a,b)=>a.x*dx+a.z*dz>b.x*dx+b.z*dz?a:b);
    const hit=rayHit(m.records.filter(r=>r.id===counter.id),p.clone().add(v(0,.015,0)),p.clone().sub(v(0,.016,0)));
    check(hit?.record===deck&&hit.normal.y>.96&&Math.abs(p.y-hit.point.y)<.003,'wayfinding-counter-contact',register.id,'The real register base must rest on the named countertop.');
    contacts.push(xyz(hit.point));
  }
  const bookTop=book.bounds.getCenter(v());bookTop.y=book.bounds.max.y;
  const bookHit=rayHit([book],bookTop.clone().add(v(0,.02,0)),bookTop.clone().sub(v(0,.03,0)));
  const reach=bookHit?Math.hypot(foot.x-bookHit.point.x,foot.z-bookHit.point.z):Infinity;
  check(bookHit&&reach<=.80,'wayfinding-counter-service',register.id,'Keep the register within the service point’s static 0.80 m horizontal reach.',{reach});
  const viewer=foot.clone();viewer.y=eyeHeight;
  const sight=rayHit(m.records,viewer,bookHit.point);
  check(sight?.record===book,'wayfinding-register-view',register.id,'The visitor must be able to see the register on the counter.',{first:sight?.record.id,part:sight&&name(sight.record)});
  // Probe the upper end of the actual pen. The lower shaft may be occluded by its holder.
  const tip=vertices(pen).filter(p=>p.y>=pen.bounds.max.y-.004);
  let penHit;
  for(const point of tip){const hit=rayHit(m.records,viewer,point);if(hit?.record===pen){penHit=hit;break;}}
  check(penHit,'wayfinding-register-view',register.id,'The pen tip must be visible above its holder from the service position.');
  targets.counter=service.stand;
  const seats=[];
  if(service.waitingSeatId)for(const p of placement.checkedPoints.filter(p=>p.facilityId===service.waitingSeatId)){
    const f=b.byId.get(service.waitingSeatId),slot=f.resource.usePoints.find(s=>p.id===f.id+'#'+s.id);
    check(slot&&p.approachConnected&&p.exitConnected,'wayfinding-seat-binding',p.id,'The waiting seat needs approach and exit points.');
    const seat=m.part(f,slot.seatNodeId),center=v(...p.position.local);center.y+=slot.seatHeight;
    const hit=rayHit(m.records,center.clone().add(v(0,.24,0)),center.clone().sub(v(0,.07,0)));
    check(hit?.record===seat&&Math.abs(hit.point.y-center.y)<.003,'wayfinding-seat-contact',p.id,'The seat must match its real cushion at the bound use point.');
    for(const key of ['approach','exit'])targets[p.id+'/'+key]=[p[key].local[0],p[key].local[2]];
    seats.push({id:p.id,contact:xyz(hit.point),mesh:name(seat)});
  }
  if(service.waitingSeatId)check(seats.length>0,'wayfinding-seat-binding',service.waitingSeatId,'No installed seat use point.');
  let coat;
  if(service.coatRackId){
    const rack=b.byId.get(service.coatRackId),garment=b.byId.get(service.garmentId),mRack=m.roomMatrix(rack),area=rack.resource.clearance.front;
    const point=v((area.min[0]+area.max[0])/2,0,(area.min[1]+area.max[1])/2).applyMatrix4(mRack);
    targets.coat=xz(point);
    const hook=m.part(garment,'hanger-hook'),rail=m.part(rack,'garment-rail');
    const slot=rack.resource.garmentRail.slots.find(s=>s.id===garment.node.attachment.slotId);
    const center=v(...slot.position).applyMatrix4(mRack),hit=rayHit([rail],center.clone().add(v(0,.04,0)),center.clone().sub(v(0,.05,0)));
    check(hit&&Math.abs(hit.point.y-center.y)<=.004&&hook.bounds.distanceToPoint(hit.point)<=.012,'wayfinding-coat-contact',garment.id,
      'The real hook must surround its occupied rail slot.');
    coat={rackId:rack.id,garmentId:garment.id,slot:slot.id,railContact:xyz(hit.point),approach:targets.coat};
  }
  return {regionId:service.regionId,counterId:counter.id,registerId:register.id,mesh:name(deck),contacts,
    book:name(book),pen:name(pen),penHit:xyz(penHit.point),bookTop:xyz(bookHit.point),reachM:reach,stand:service.stand,seats,coat:coat??null};
}

export function measureWayfindingFloor(document,derived,placement,group,{catalog,templates,assetLibrary}){
  check(assetLibrary,'wayfinding-assets-required',group.id,'Load the installed meshes and print content.');
  const [b]=group.bindings,show=b.signs.filter(x=>!x.content.state.visible).map(({content})=>({type:'set-state',id:content.id,state:{visible:true}}));
  const measured=show.length?prepareCompanyChange(document,show,{catalog,templates}).document:document;
  const floor=inspectCompanyConnections(document,catalog,templates).floors.find(f=>f.floorId===group.id);
  const scene=createCompanyScene(new T.Scene(),measured,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
  try{
    scene.root.updateMatrixWorld(true);
    const rooms=new Map(),signs=[],routes=[];let service=null;
    for(const entry of b.signs){
      const {area,s}=entry;
      if(!rooms.has(area.id))rooms.set(area.id,roomMeasurements(scene,area,b.facilities));
      const m=rooms.get(area.id),eye=readerPosition(floor,s),point=xz(eye);
      const blocker=clearanceQuery(scene,derived,b.facilities,area,radius,height)(point,point);
      check(!blocker,'wayfinding-reader-blocked',s.portalId,'The entrance reading position must remain clear.',{blocker});
      signs.push(readSign(entry,m,eye));
      const targets={reader:point},station=b.rule.service;
      if(!service&&station&&station.regionId===area.id&&station.portalId===s.portalId)
        service=measureService(station,b,m,targets,placement);
      const route=checkRoomDoorAccess({scene,derived,facilities:b.facilities,floor,placement,room:area,portalId:s.portalId,targets,radius,height});
      check(Object.values(route).every(r=>r.portalId===s.portalId&&r.fromRegion===s.fromRegionId),'wayfinding-doorway',s.portalId,'Use the declared source entrance for the service and the reading position.');
      routes.push({boardId:s.boardId,regionId:area.id,targets:route});
    }
    return [{ok:true,floorId:group.id,signs,service,routes}];
  }finally{scene.dispose();}
}
