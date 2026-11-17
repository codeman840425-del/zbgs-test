import {CompanyError,createCompany,deriveCompany,prepareCompanyChange,identityTransform,pointInTransform} from './document.js';
import {companyScaleProfile} from './scale-profile.js';

// C2 grammar is deliberately rectangular and finite. Floors are viewing layers
// at Y=0. Legacy records admit 1..10 rooms; explicit profiles set new counts.
// Connections join exact boundary
// intervals on the same floor. Character navigation and vertical travel are not
// implemented here. See the explicit JSON inputs for partial and maximum fitout.
const limits={
  'single-room':{floors:1,rooms:1},
  'rental-home':{floors:1,rooms:3},
  'leased-floor':{floors:1,rooms:10},
  building:{floors:5,rooms:50},
};
const edges={
  north:{axis:0,normal:[0,0,-1]},south:{axis:0,normal:[0,0,1]},
  west:{axis:2,normal:[-1,0,0]},east:{axis:2,normal:[1,0,0]},
};
const epsilon=1e-7;
const fail=(code,path,message)=>{throw new CompanyError(code,path,message);};
const idPattern=/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
function knownFields(value,fields,path){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))
    fail('invalid-space-input',path,'Input contains an unsupported field or object shape');
}
function named(value,path){if(value!==undefined&&typeof value!=='string')fail('invalid-space-input',path,'Name must be text');}

function portalGeometry(portal,derived,floorId,path){
  if(!portal||!Object.hasOwn(edges,portal.edge)||!Number.isFinite(portal.offset)||
      !Number.isFinite(portal.width)||portal.width<=0)
    fail('invalid-portal',path,'Expected a regionId, cardinal edge, finite offset and positive width');
  const region=derived.nodes.get(portal.regionId);
  if(!region||!['room','area'].includes(region.kind))fail('invalid-portal-region',path,'A portal must reference a room or public area');
  if(derived.floorIds.get(region.id)!==floorId)fail('cross-floor-connection',path,'Both portal regions must belong to this floor');
  const edge=edges[portal.edge],span=edge.axis===0?region.bounds.width:region.bounds.depth;
  if(Math.abs(portal.offset)+portal.width/2>span/2+epsilon)
    fail('outside-portal-edge',path,'The complete portal interval must fit its region edge');
  const center=[0,0,0];
  if(edge.axis===0)center[2]=edge.normal[2]*region.bounds.depth/2;
  else center[0]=edge.normal[0]*region.bounds.width/2;
  center[edge.axis]=portal.offset;
  const start=[...center],end=[...center],interior=center.map((value,index)=>value-edge.normal[index]*.35);
  start[edge.axis]-=portal.width/2;end[edge.axis]+=portal.width/2;
  const frame=derived.worlds.get(region.id),origin=pointInTransform(frame,[0,0,0]);
  const worldNormal=pointInTransform(frame,edge.normal).map((value,index)=>value-origin[index]);
  return {...portal,local:{start,end,center,interior},world:{
    start:pointInTransform(frame,start),end:pointInTransform(frame,end),center:pointInTransform(frame,center),
    interior:pointInTransform(frame,interior),normal:worldNormal,
  }};
}
const closePoint=(a,b)=>a.every((value,index)=>Math.abs(value-b[index])<epsilon);

export function inspectCompanyConnections(document,catalog,templates){
  const derived=deriveCompany(document,catalog,templates),floors=[];
  const roomLimit=companyScaleProfile(document,fail)?.roomsPerFloor||10;
  const identities=new Set([document.id,...derived.nodes.keys()]);
  for(const floor of document.nodes.filter(node=>node.kind==='floor')){
    const regions=document.nodes.filter(node=>['room','area'].includes(node.kind)&&derived.floorIds.get(node.id)===floor.id);
    const rooms=regions.filter(node=>node.kind==='room');
    if(!rooms.length||rooms.length>roomLimit)fail('floor-room-capacity',floor.id,`Each floor requires 1..${roomLimit} business rooms for its pinned profile`);
    for(const region of regions)if(region.parentId!==floor.id)
      fail('invalid-region-parent',region.id,'C2 rectangular regions must belong directly to their floor');
    const bounds=regions.map(region=>{
      const world=derived.worlds.get(region.id),corners=[-1,1].flatMap(x=>[-1,1].map(z=>pointInTransform(world,[x*region.bounds.width/2,0,z*region.bounds.depth/2])));
      return {id:region.id,min:[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[2]))],max:[Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[2]))]};
    });
    for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
      const a=bounds[i],b=bounds[j];
      if(a.min[0]<b.max[0]-epsilon&&a.max[0]>b.min[0]+epsilon&&a.min[1]<b.max[1]-epsilon&&a.max[1]>b.min[1]+epsilon)
        fail('overlapping-regions',a.id,`Region interior overlaps ${b.id}`);
    }
    const connections=floor.connections??[];
    if(!Array.isArray(connections))fail('invalid-connections',floor.id,'Connections must be an array');
    const intervals=new Map(),adjacent=new Map(regions.map(region=>[region.id,new Set()])),geometry=[];
    for(const [index,connection]of connections.entries()){
      const path=`${floor.id}.connections[${index}]`;
      if(!connection||typeof connection.id!=='string'||!idPattern.test(connection.id)||identities.has(connection.id))
        fail('duplicate-connection-id',path,'Connection IDs must be globally unique stable identifiers');
      identities.add(connection.id);
      const from=portalGeometry(connection.from,derived,floor.id,`${path}.from`),to=portalGeometry(connection.to,derived,floor.id,`${path}.to`);
      if(from.regionId===to.regionId)fail('self-connection',path,'A connection must join two distinct regions');
      const aligned=(closePoint(from.world.start,to.world.start)&&closePoint(from.world.end,to.world.end))||
        (closePoint(from.world.start,to.world.end)&&closePoint(from.world.end,to.world.start));
      const opposite=from.world.normal.reduce((sum,value,axis)=>sum+value*to.world.normal[axis],0);
      if(!aligned||Math.abs(opposite+1)>epsilon)
        fail('portal-geometry-mismatch',path,'Portal intervals must coincide in world space with opposite outward normals');
      for(const portal of [from,to]){
        const key=`${portal.regionId}:${portal.edge}`,lo=portal.offset-portal.width/2,hi=portal.offset+portal.width/2;
        const previous=intervals.get(key)||[];
        if(previous.some(interval=>lo<interval.hi-epsilon&&hi>interval.lo+epsilon))
          fail('overlapping-portals',path,'A boundary interval cannot be connected more than once');
        previous.push({lo,hi});intervals.set(key,previous);
      }
      adjacent.get(from.regionId).add(to.regionId);adjacent.get(to.regionId).add(from.regionId);
      geometry.push({id:connection.id,from,to});
    }
    const reached=new Set([regions[0].id]),queue=[regions[0].id];
    for(let index=0;index<queue.length;index++)for(const id of adjacent.get(queue[index]))if(!reached.has(id)){reached.add(id);queue.push(id);}
    if(reached.size!==regions.length)fail('disconnected-regions',floor.id,'Every room and corridor cell on this floor must share one connected portal graph');
    floors.push({floorId:floor.id,regionIds:regions.map(region=>region.id),businessRooms:rooms.length,connections:geometry,exteriorEntrances:[...derived.exteriorEntrances.values()].filter(e=>e.floorId===floor.id)});
  }
  return {scope:'C2 same-floor rectangular portal geometry only',interiorInset:.35,capacity:derived.capacity,floors,
    limits:['Floors are viewing layers at Y=0. No stairs, lifts or cross-floor connections.',
      'Coincident portals and interior samples do not prove obstacle clearance or character navigation.']};
}

export function createScaledCompany(input,catalog,templates){
  knownFields(input,['id','name','scale','floorLayouts','floors'],'input');
  if(!Object.hasOwn(limits,input.scale))fail('unsupported-scale','input.scale',String(input.scale));
  const capacity=limits[input.scale];named(input.name,'input.name');
  if(!Array.isArray(input.floors)||!input.floors.length||input.floors.length>capacity.floors)
    fail('space-floor-capacity','input.floors',`This tier permits 1..${capacity.floors} viewing floors`);
  const layouts=input.floorLayouts??['parallel'];
  if(!Array.isArray(layouts)||!layouts.length||layouts.some(layout=>!['parallel','turned'].includes(layout)))
    fail('unsupported-floor-layout','input.floorLayouts','Use a nonempty sequence of parallel/turned layouts');
  const document={...createCompany({id:input.id,name:input.name??input.id},catalog),scale:input.scale,nodes:[]};
  const operations=[];let roomTotal=0;
  for(const [floorIndex,floorInput]of input.floors.entries()){
    const path=`input.floors[${floorIndex}]`;knownFields(floorInput,['name','rooms'],path);named(floorInput.name,`${path}.name`);
    const roomLimit=input.scale==='single-room'?1:10;
    if(!Array.isArray(floorInput.rooms)||!floorInput.rooms.length||floorInput.rooms.length>roomLimit)
      fail('floor-room-capacity',`${path}.rooms`,`Expected 1..${roomLimit} business rooms on this floor`);
    roomTotal+=floorInput.rooms.length;
    if(roomTotal>capacity.rooms)fail('space-room-capacity','input.floors','Business room count exceeds the selected tier');
    const floorId=`${document.id}/floor-${floorIndex+1}`,layout=layouts[floorIndex%layouts.length];
    const floor={id:floorId,kind:'floor',parentId:document.id,name:floorInput.name??`楼层${floorIndex+1}`,transform:identityTransform(),connections:[]};
    document.nodes.push(floor);
    const corridor=input.scale!=='single-room',columns=Math.min(floorInput.rooms.length,5);
    if(corridor)for(let column=0;column<columns;column++){
      const id=`${floorId}/corridor-${column+1}`;
      document.nodes.push({id,kind:'area',parentId:floorId,name:'公共通道',bounds:{width:9.2,depth:3},transform:{position:[(column-(columns-1)/2)*9.2,0,0],yaw:0}});
      if(column)floor.connections.push({id:`${floorId}/portal-corridor-${column}`,
        from:{regionId:`${floorId}/corridor-${column}`,edge:'east',offset:0,width:1.4},to:{regionId:id,edge:'west',offset:0,width:1.4}});
    }
    for(const [roomIndex,roomInput]of floorInput.rooms.entries()){
      const roomPath=`${path}.rooms[${roomIndex}]`;knownFields(roomInput,['name','purpose','stations','sofaVersion','furniture'],roomPath);named(roomInput.name,`${roomPath}.name`);
      if(!['streaming','work','rest','training'].includes(roomInput.purpose))fail('invalid-room-purpose',roomPath,'Declare streaming, work, rest or training');
      const stationCount=roomInput.stations??0;
      if(!Number.isInteger(stationCount)||stationCount<0||stationCount>2||(roomInput.purpose!=='streaming'&&stationCount))
        fail('room-capacity',roomPath,'Only streaming rooms may install zero, one or two workstations');
      if(roomInput.sofaVersion!==undefined&&(![1,2].includes(roomInput.sofaVersion)||roomInput.purpose!=='rest'))
        fail('invalid-room-content',roomPath,'sofaVersion 1/2 is supported in rest rooms');
      if(roomInput.furniture!==undefined&&(roomInput.furniture!=='desk-chair'||!['work','training'].includes(roomInput.purpose)))
        fail('invalid-room-content',roomPath,'desk-chair furniture is supported in work/training rooms');
      const roomId=`${floorId}/room-${roomIndex+1}`,south=roomIndex>=columns,column=roomIndex%columns;
      document.nodes.push({id:roomId,kind:'room',parentId:floorId,name:roomInput.name??`房间${roomIndex+1}`,purpose:roomInput.purpose,bounds:{width:9,depth:7},
        transform:{position:corridor?[(column-(columns-1)/2)*9.2,0,south?5:-5]:[0,0,0],yaw:0}});
      if(corridor)floor.connections.push({id:`${floorId}/portal-room-${roomIndex+1}`,
        from:{regionId:roomId,edge:south?'north':'south',offset:0,width:1.4},
        to:{regionId:`${floorId}/corridor-${column+1}`,edge:south?'south':'north',offset:0,width:1.4}});
      for(let station=0;station<stationCount;station++)operations.push({type:'add-workstation',id:`${roomId}/station-${station+1}`,parentId:roomId,
        template:{id:'stream-station',version:1},transform:layout==='turned'&&station===1?{position:[1.6,0,-.3],yaw:Math.PI/2}:{position:[station===0?-1.5:1.5,0,0],yaw:0}});
      if(roomInput.sofaVersion!==undefined)operations.push({type:'add-facility',id:`${roomId}/sofa`,parentId:roomId,resource:{id:'lounge-sofa',version:roomInput.sofaVersion},transform:{position:[0,0,0],yaw:south?Math.PI:0}});
      if(roomInput.furniture)for(const [id,position,yaw]of [['desk',[0,0,-.9],0],['chair',[0,0,.55],Math.PI]])
        operations.push({type:'add-facility',id:`${roomId}/${id}`,parentId:roomId,resource:{id,version:1},transform:{position,yaw}});
    }
  }
  const result=operations.length?prepareCompanyChange(document,operations,{catalog,templates}).document:document;
  inspectCompanyConnections(result,catalog,templates);return result;
}
