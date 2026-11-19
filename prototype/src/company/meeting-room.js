import * as T from 'three';
import {CompanyError,deriveCompany,prepareCompanyChange} from './document.js';
import {inspectCompanyConnections} from './space.js';
import {createCompanyScene} from './render.js';
import {rayHit,triangles,scanRoomMeshes} from './room-mesh-geometry.js';
import {checkRoomDoorAccess,clearanceQuery,lobbyApproach} from './public-door-access.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const xyz=p=>p.toArray().map(x=>Number(x.toFixed(6))||0),name=r=>r.object.userData.name||r.object.name;
const angle=(a,b)=>T.MathUtils.radToDeg(a.angleTo(b));
const check=(ok,code,location,message,details)=>{if(!ok)throw new CompanyError(code,location,message,details);};
const modes=['conference','classroom','u-shape','whiteboard-discussion'],radius=.25,height=1.90;
const id=x=>typeof x==='string'&&x.trim().length>0;

// From the two signed seat-clearance d914 game records seated for 120 frames each in their original plant rooms.
// Coordinates are offsets from the physical cushion crown, in the chair's local XYZ basis.
// The two discrete probes use the rounded lower/near and upper/far boundaries of that observed motion.
const reference={
  sourceProbeSha256:'32a2134f64d14de290f4f761ca7e868ff7dabd5cc961de2c42bd2a2d1e76af18',sourceFramesPerBody:120,
  sourceBuild:'d9140194fb84',companyManifest:'6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2',
  recordIds:['e9a1c33db6c2b119f1b0c2b97b5a1eb1101352efdd356692052c872ce33ec757','54ade1c32e23e7cb509626c175923e59b10c1c2d331aba08dce09002f9b048e2'],
  eyeOffsets:{female:[[.007,.671,.099],[.008,.674,.117]],male:[[.008,.708,.117],[.009,.713,.136]]},
  kneeMin:[-.085,.005,-.006],kneeMax:[.150,.15,.425],
  maximumSeatTurnDegrees:85,maximumPaperIncidenceDegrees:60,standingRadiusM:radius,standingHeightM:height
};

function bind(document,rule,derived) {
  const where=rule?.regionId||'meetingRooms';
  check(rule&&Object.keys(rule).sort().join(',')==='boardId,chairs,contentId,layout,portalId,presenter,regionId,tables'&&modes.includes(rule.layout)&&
    [rule.regionId,rule.portalId,rule.boardId,rule.contentId].every(id)&&Array.isArray(rule.tables)&&Array.isArray(rule.chairs)&&
    rule.chairs.length>=2&&[...rule.tables,...rule.chairs].every(id)&&Array.isArray(rule.presenter)&&rule.presenter.length===2&&rule.presenter.every(Number.isFinite),
    'invalid-meeting-room',where,'Declare a public meeting layout, doorway, distinct tables and chairs, a graphic board and presenter point.');
  const ids=[rule.boardId,rule.contentId,...rule.tables,...rule.chairs];
  check(new Set(ids).size===ids.length,'meeting-duplicate-member',where,'Each installed member must have a distinct ID.');
  const area=derived.nodes.get(rule.regionId);
  check(area?.kind==='area'&&area.publicRole==='meeting-training','meeting-public-area',where,'Use the designated meeting and training area.');
  const floorId=derived.floorIds.get(area.id),facilities=derived.facilities.filter(f=>f.floorId===floorId);
  const member=(memberId,test)=>{
    const f=facilities.find(x=>x.id===memberId&&x.roomId===area.id);
    check(f&&test(f),'meeting-member',memberId,'Bind a compatible physical member in this area.');
    return f;
  };
  const board=member(rule.boardId,f=>f.resource.mountRole==='information-board-floor'&&f.node.parentId===area.id);
  const content=member(rule.contentId,f=>f.resource.mount==='information-surface'&&f.node.parentId===board.id&&f.resource.informationNodes?.face);
  const tables=rule.tables.map(i=>member(i,f=>f.resource.surface?.topY>0&&f.node.parentId===area.id));
  const chairs=rule.chairs.map(i=>member(i,f=>f.resource.category==='seat'&&f.node.parentId===area.id));
  const installed=facilities.filter(f=>f.roomId===area.id&&(f.resource.category==='seat'||f.resource.mountRole==='desk'));
  check(installed.every(f=>ids.includes(f.id)),'meeting-unbound-member',area.id,'Every installed seat and desk in the meeting area needs a declaration.');
  return {rule,area,floorId,facilities,board,content,tables,chairs};
}

function checkLayout(rule,tables,seats,board,axis,side) {
  const loc=p=>[p.clone().sub(board).dot(side),p.clone().sub(board).dot(axis)];
  const nearby=seats.map(s=>s.servedTable);
  const dots=seats.flatMap(a=>seats.map(b=>a.forward.dot(b.forward)));
  const opposed=Math.min(...dots)<-.9;
  const rowCoordinates=seats.map(s=>loc(s.position)[1]);
  const rowDepth=Math.max(...rowCoordinates)-Math.min(...rowCoordinates);
  // Use physical top rectangles projected into the graphic board's horizontal basis.
  const tops=tables.map(t=>{
    const pts=t.corners.map(loc),bounds=[0,1].map(i=>[Math.min(...pts.map(p=>p[i])),Math.max(...pts.map(p=>p[i]))]);
    return {id:t.id,x:bounds[0],z:bounds[1],topAt:t.topAt};
  });
  const overlap=(x,y)=>Math.min(x[1],y[1])-Math.max(x[0],y[0]);
  const joints=[];
  for(const [i,a] of tops.entries())for(const b of tops.slice(i+1)){
    const x=overlap(a.x,b.x),z=overlap(a.z,b.z);
    const across=x<z?'x':'z',along=across==='x'?'z':'x';
    if(Math.min(x,z)<-.035||Math.max(x,z)<.10)continue;
    const [lo,hi]=(a[across][0]+a[across][1])<(b[across][0]+b[across][1])?[a,b]:[b,a];
    const middle=(Math.max(a[along][0],b[along][0])+Math.min(a[along][1],b[along][1]))/2;
    const witness=(t,near)=>{
      const x=across==='x'?near:middle,z=across==='z'?near:middle;
      return t.topAt(board.clone().addScaledVector(side,x).addScaledVector(axis,z));
    };
    const end=witness(lo,lo[across][1]-.006),start=witness(hi,hi[across][0]+.006);
    if(end&&start&&Math.abs(end.y-start.y)<.003&&end.distanceTo(start)<.049)
      joints.push({a:lo.id,b:hi.id,nearA:xyz(end),nearB:xyz(start)});
  }
  const touch=(a,b)=>joints.some(j=>j.a===a.id&&j.b===b.id||j.a===b.id&&j.b===a.id);
  const edges=joints.map(j=>[j.a,j.b]);
  const connected=new Set(tops.slice(0,1).map(t=>t.id));
  for(let i=0;i<tops.length;i++)for(const [a,b] of edges){
    if(connected.has(a)||connected.has(b)){connected.add(a);connected.add(b);}
  }
  const served=nearby.every(Boolean),sameDirection=dots.every(d=>d>.98);
  let opening=null;
  function requireShape(ok,message){check(ok,'meeting-layout-shape',rule.regionId,message,{layout:rule.layout,nearby,rowDepth,edges});}
  const midX=(Math.min(...tops.map(t=>t.x[0]))+Math.max(...tops.map(t=>t.x[1])))/2;
  const midZ=(Math.min(...tops.map(t=>t.z[0]))+Math.max(...tops.map(t=>t.z[1])))/2;
  const filled=tops.some(t=>midX>=t.x[0]-.001&&midX<=t.x[1]+.001&&midZ>=t.z[0]-.001&&midZ<=t.z[1]+.001);
  if(rule.layout==='conference')requireShape(served&&opposed&&filled&&tops.length>0&&connected.size===tops.length,'A conference table requires one joined worktop assembly and chairs facing one another across it.');
  if(rule.layout==='classroom')requireShape(served&&sameDirection&&new Set(nearby).size>=2&&rowDepth>.7&&tops.length>=2&&connected.size<tops.length,
    'Training requires at least two distinct rows of desks and seats facing a common teaching direction.');
  if(rule.layout==='u-shape'){
    const long=tops.filter(t=>t.z[1]-t.z[0]>t.x[1]-t.x[0]).sort((a,b)=>a.x[0]-b.x[0]);
    const [left,right]=[long[0],long.at(-1)];
    const bridge=left&&right&&tops.find(t=>t!==left&&t!==right&&touch(t,left)&&touch(t,right)&&
      (t.z[0]+t.z[1])>(left.z[0]+left.z[1])&&t.x[0]<right.x[0]&&t.x[1]>left.x[1]);
    const z=left&&right?(Math.max(left.z[0],right.z[0])+Math.min(left.z[1],right.z[1]))/2:0;
    if(bridge){
      const x=(left.x[1]+right.x[0])/2;
      const empty=tops.every(t=>x<t.x[0]||x>t.x[1]||z<t.z[0]||z>t.z[1]);
      if(empty)opening={freeWidthM:right.x[0]-left.x[1],left:left.id,right:right.id,bridge:bridge.id,clearPoint:[x,z]};
    }
    requireShape(served&&opposed&&opening?.freeWidthM>=2*radius&&connected.size===tops.length,
      'A U requires two side rails, a touching rear bridge and a clear opening toward the board.');
  }
  if(rule.layout==='whiteboard-discussion'){
    const cross=seats.flatMap((a,i)=>seats.slice(i+1).flatMap((b,j)=>seats.slice(i+j+2).map(c=>
      Math.abs((b.position.x-a.position.x)*(c.position.z-a.position.z)-(b.position.z-a.position.z)*(c.position.x-a.position.x)))));
    requireShape(seats.length>=3&&nearby.every(t=>!t)&&Math.max(...cross)>.1,'Discussion seats must form an open group around a floor board, clear of the work tables.');
  }
  return {edges,joints,rowDepth,opposed,tableForSeat:nearby,opening};
}

function measure(scene,b,derived,placement,floor){
  const {rule,area,facilities,board,content}=b,records=[];
  const {worldToRoom,checkedMeshes}=scanRoomMeshes(scene,area,facilities,[],[],(object,f,matrix,bounds)=>records.push({object,id:f?.id??object.name,matrix:matrix.clone(),bounds:bounds.clone()}));
  const roomFrom=f=>worldToRoom.clone().multiply(scene.root.getObjectByName(f.id).matrixWorld);
  const named=(f,s)=>{const hit=records.filter(r=>r.id===f.id&&name(r)===s);check(hit.length===1,'meeting-part',f.id,'Expected one installed '+s);return hit[0];};
  const graphic=named(content,content.resource.informationNodes.face);
  const mats=Array.isArray(graphic.object.material)?graphic.object.material:[graphic.object.material];
  check(graphic.object.geometry.getAttribute('uv')&&mats.some(m=>m.visible&&m.map),'meeting-board-graphic',content.id,'The teaching board requires a textured graphic face.');
  graphic.object.geometry.computeBoundingBox();const box=graphic.object.geometry.boundingBox;
  const paper=(u,w)=>v(T.MathUtils.lerp(box.min.x,box.max.x,u),T.MathUtils.lerp(box.min.y,box.max.y,w),box.max.z).applyMatrix4(graphic.matrix);
  const target=paper(.5,.5),boardAxis=v(0,0,1).transformDirection(roomFrom(board)),sideAxis=v(1,0,0).transformDirection(roomFrom(board));
  const position=v(rule.presenter[0],0,rule.presenter[1]),presenterBox=new T.Box3(position.clone().add(v(-radius,.002,-radius)),position.clone().add(v(radius,height,radius)));
  const block=clearanceQuery(scene,derived,facilities,area,radius,height)(rule.presenter,rule.presenter);
  const diff=position.clone().sub(target);
  const beside=Math.abs(diff.dot(sideAxis)),front=diff.dot(boardAxis);
  check(!block&&beside>=content.resource.informationContent.width/2+radius&&beside<=1.6&&front>=-.05&&front<=1.5,
    'meeting-presenter-position',area.id,'The presenter needs a clear standing place beside the board on its reading side.',{block,beside,front});
  const desks=b.tables.map(t=>{
    const matrix=roomFrom(t),s=t.resource.surface,[hx,hz]=s.halfSize,near=(x,z)=>v(x,s.topY,z).applyMatrix4(matrix);
    const upperParts=new Set();
    const tableRecords=records.filter(r=>r.id===t.id);
    const probes=[[0,0],[-.88,-.88],[-.88,.88],[.88,-.88],[.88,.88]].map(([u,w])=>{
      const p=near(u*hx,w*hz),hit=rayHit(tableRecords,p.clone().add(v(0,.12,0)),p.clone().sub(v(0,.12,0)));
      check(hit&&Math.abs(hit.point.y-p.y)<=.003,'meeting-table-top',t.id,'A declared desk surface must have physical support across its top.');
      upperParts.add(hit.record);return {point:xyz(hit.point),mesh:name(hit.record)};
    });
    const topY=near(0,0).y,rect=new T.Box3();
    for(const record of upperParts)for(const tri of triangles(record)){
      if([tri.a,tri.b,tri.c].every(p=>Math.abs(p.y-topY)<.003)&&tri.getNormal(v()).y>.98)
        for(const p of [tri.a,tri.b,tri.c])rect.expandByPoint(p);
    }
    check(!rect.isEmpty(),'meeting-table-top',t.id,'Missing upward physical tabletop triangles.');
    const corners=[[rect.min.x,rect.min.z],[rect.max.x,rect.min.z],[rect.max.x,rect.max.z],[rect.min.x,rect.max.z]].map(([x,z])=>v(x,topY,z));
    const topAt=point=>{
      const start=v(point.x,topY+.10,point.z),end=v(point.x,topY-.10,point.z),hit=rayHit([...upperParts],start,end);
      return hit&&Math.abs(hit.point.y-topY)<.003?hit.point:null;
    };
    return {id:t.id,corners,probes,rect,topAt};
  });
  const dest={presenter:rule.presenter},seats=[];
  for(const chair of b.chairs){
    const installed=placement.checkedPoints.filter(p=>p.facilityId===chair.id);
    const identified=derived.usePoints.filter(p=>p.facilityId===chair.id);
    check(identified.length===1,'meeting-seat-contract',chair.id,'Each declared chair requires one actual seat.');
    const p=scene.resolveUsePoint(identified[0].id),a=installed?.find(s=>s.id===p?.id);
    check(p&&a?.capacity===1&&a.approachConnected&&a.exitConnected&&p.chairSeat&&p.chairBack,'meeting-seat-contract',chair.id,'The physical chair must have bound seat, back, entrance and exit.');
    const matrix=worldToRoom.clone().multiply(p.chair.matrixWorld),center=v(...a.position.local),forward=v(0,0,1).transformDirection(matrix);
    const chairSeat=records.find(r=>r.object===p.chairSeat),chairBack=records.find(r=>r.object===p.chairBack);
    check(chairSeat&&chairBack,'meeting-seat-parts',chair.id,'Seat and back meshes must be present in the installed floor.');
    const y=center.y+p.seatHeight,crown=v(center.x,y,center.z),rotation=new T.Matrix4().extractRotation(matrix);
    const seatOffset=(x,h,z)=>v(x,h,z).applyMatrix4(rotation).add(crown);
    const contacts=[[0,0],[-.02,0],[.02,0],[0,-.02],[0,.02]].map(([x,z])=>{
      const place=seatOffset(x,0,z),hit=rayHit(records,place.clone().add(v(0,.32,0)),place.clone().sub(v(0,.10,0)));
      check(hit?.record===chairSeat&&Math.abs(hit.point.y-y)<=.001,'meeting-seat-contact',chair.id,'The real cushion must be first hit at the registered height.',{first:hit&&name(hit.record)});
      return xyz(hit.point);
    });
    const withoutChair=records.filter(r=>r.id!==chair.id);
    function clearBox(label,volume){
      const hit=withoutChair.find(r=>volume.intersectsBox(r.bounds)&&triangles(r).some(t=>volume.intersectsTriangle(t)));
      check(!hit,'meeting-seat-clearance',chair.id,'Another physical surface intrudes into the reserved '+label+'.',{label,blocker:hit?.id,mesh:hit&&name(hit),min:xyz(volume.min),max:xyz(volume.max)});
      return {min:xyz(volume.min),max:xyz(volume.max)};
    }
    const kneeBox=new T.Box3(v(...reference.kneeMin).add(v(0,p.seatHeight,0)),v(...reference.kneeMax).add(v(0,p.seatHeight,0))).applyMatrix4(matrix);
    const knee=clearBox('knees',kneeBox);
    const transfers={};
    for(const field of ['approach','exit']){
      const foot=v(...a[field].local),volume=new T.Box3().setFromPoints([center,foot]);
      volume.min.add(v(-radius,.002,-radius));volume.max.add(v(radius,height,radius));
      transfers[field]=clearBox(field,volume);
      dest[p.id+'/'+field]=[foot.x,foot.z];
    }
    const ray=new T.Ray(),tablesAhead=desks.map(t=>{
      const start=v(center.x,(t.rect.min.y+t.rect.max.y)/2,center.z);ray.set(start,forward);
      const hit=ray.intersectBox(t.rect,v());return hit?{id:t.id,distance:start.distanceTo(hit)}:null;
    }).filter(r=>r&&r.distance<=p.clearance.depth+.05).sort((a,b)=>a.distance-b.distance);
    const observations=[];
    for(const [body,offsets] of Object.entries(reference.eyeOffsets))for(const off of offsets){
      const eye=seatOffset(...off),direction=target.clone().sub(eye),facingDegrees=angle(forward,direction.clone().setY(0));
      check(facingDegrees<=reference.maximumSeatTurnDegrees,'meeting-seat-facing',chair.id,'The teaching board must be within the front viewing sector.',{facingDegrees});
      const rays=[];
      for(const [u,w] of [[.5,.5],[.10,.13],[.90,.13],[.10,.87],[.90,.87]]){
        const end=paper(u,w),hit=rayHit(records,eye,end),delta=end.clone().sub(eye);
        const incidence=hit?angle(hit.normal,delta.clone().negate()):180;
        const shadow=new T.Ray(eye,delta.clone().normalize()).intersectBox(presenterBox,v());
        check(hit?.record===graphic&&hit.point.distanceTo(end)<.003&&incidence<=reference.maximumPaperIncidenceDegrees,
          'meeting-board-visibility',chair.id,'The actual graphic must be the first surface on every reading ray.',{sample:[u,w],first:hit?.record.id,mesh:hit&&name(hit.record),incidence,body});
        check(!shadow||shadow.distanceTo(eye)>delta.length(),'meeting-presenter-occludes',chair.id,'The presenter reserve hides part of the shared content.',{sample:[u,w],body});
        rays.push({uv:[u,w],degrees:incidence,hit:xyz(hit.point)});
      }
      observations.push({body,eye:xyz(eye),facingDegrees,distanceM:direction.length(),horizontalSpanDegrees:angle(paper(.10,.5).sub(eye),paper(.90,.5).sub(eye)),
        verticalSpanDegrees:angle(paper(.5,.13).sub(eye),paper(.5,.87).sub(eye)),rays});
    }
    seats.push({id:chair.id,slotId:p.id,seatMesh:name(chairSeat),backMesh:name(chairBack),crown:xyz(crown),contacts,knee,transfers,forward,position:center,
      servedTable:tablesAhead[0]?.id??null,approach:a.approach.local,exit:a.exit.local,observations});
  }
  const portal=floor.connections.find(c=>c.id===rule.portalId);
  check(portal&&[portal.from,portal.to].some(s=>s.regionId===area.id)&&[portal.from,portal.to].every(s=>derived.nodes.get(s.regionId)?.kind==='area'),
    'meeting-entry',area.id,'Use the existing doorway to the public lobby.');
  const route=checkRoomDoorAccess({scene,derived,facilities,floor,placement,room:area,portalId:rule.portalId,targets:dest,radius,height});
  check(Object.values(route).every(r=>r.portalId===rule.portalId),'meeting-entry',area.id,'Every seat and the presenter must be reachable from the actual public entrance.');
  const publicApproach=lobbyApproach(scene,derived,facilities,placement,floor,route.presenter.fromRegion,{radius,height,code:'meeting-entry'});
  const arrangement=checkLayout(rule,desks,seats,target,boardAxis,sideAxis);
  return {ok:true,regionId:area.id,floorId:floor.floorId,layout:rule.layout,checkedMeshes,portalId:rule.portalId,presenter:rule.presenter,
    board:{id:board.id,contentId:content.id,graphic:name(graphic),sha256:content.resource.asset.sha256,center:xyz(target),forward:xyz(boardAxis)},
    seats:seats.map(s=>({...s,forward:xyz(s.forward),position:xyz(s.position)})),tables:desks.map(t=>({id:t.id,corners:t.corners.map(xyz),probes:t.probes})),arrangement,publicApproach,route};
}

const themed=n=>n?.kind==='area'&&n.publicRole==='meeting-training';
const meetingMember=r=>r&&(r.category==='seat'||r.mountRole==='information-board-floor'||r.mountRole==='desk');

export function shouldCheckMeetingRooms(document,{catalog,derived}={}) {
  if(Object.hasOwn(document,'meetingRooms'))return true;
  if(derived)return derived.facilities.some(f=>themed(derived.nodes.get(f.roomId))&&meetingMember(f.resource));
  const areas=new Set(document.nodes.filter(themed).map(n=>n.id));
  if(!areas.size)return false;
  const refs=new Set(catalog.resources.filter(meetingMember).map(r=>r.id+'@'+r.version));
  return document.nodes.some(n=>areas.has(n.parentId)&&n.resource&&refs.has(n.resource.id+'@'+n.resource.version));
}

export function meetingRoomFloors(document,derived) {
  if(!shouldCheckMeetingRooms(document,{derived}))return [];
  check(Array.isArray(document.meetingRooms)&&document.meetingRooms.length>0,'meeting-declaration-required','meetingRooms','An equipped public meeting area needs a layout declaration.');
  const groups=new Map(),seen=new Set();
  for(const rule of document.meetingRooms) {
    const b=bind(document,rule,derived);
    check(!seen.has(b.area.id),'meeting-duplicate-region',b.area.id,'Each meeting area has one layout declaration.');seen.add(b.area.id);
    if(!groups.has(b.floorId))groups.set(b.floorId,{id:b.floorId,resources:[...b.facilities,...derived.surfaceFinishes.filter(f=>f.floorId===b.floorId)].map(f=>f.resource),bindings:[]});
    groups.get(b.floorId).bindings.push(b);
  }
  for(const f of derived.facilities.filter(f=>themed(derived.nodes.get(f.roomId))&&meetingMember(f.resource)))
    check(seen.has(f.roomId),'meeting-declaration-required',f.id,'Bind the furnished meeting area.');
  return [...groups.values()];
}

export function measureMeetingRoomFloor(document,derived,placement,group,{catalog,templates,assetLibrary}) {
  check(assetLibrary,'meeting-assets-required',group.id,'Load the installed meshes to measure this meeting area.');
  const hidden=group.bindings.filter(b=>!b.content.state.visible);
  const show=hidden.map(b=>({type:'set-state',id:b.content.id,state:{visible:true}}));
  const measured=show.length?prepareCompanyChange(document,show,{catalog,templates}).document:document;
  const physical=show.length?deriveCompany(measured,catalog,templates):derived;
  const floor=inspectCompanyConnections(measured,catalog,templates).floors.find(f=>f.floorId===group.id);
  const scene=createCompanyScene(new T.Scene(),measured,{catalog,templates,visibleFloorId:group.id,assetLibrary,mirrorPreflight:()=>{}});
  try{
    scene.root.updateMatrixWorld(true);
    return group.bindings.map(original=>{
      const visible=original.content.state.visible,binding=show.length?bind(measured,original.rule,physical):original;
      return {...measure(scene,binding,physical,placement,floor),visible,readingState:visible?'displayed':'validated-in-visible-copy',reference};
    });
  }finally{scene.dispose();}
}
