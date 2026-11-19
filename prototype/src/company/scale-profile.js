// Explicit new space grammar. Absence preserves legacy saved layouts verbatim.
export const COMPANY_SPACE_V2={id:'company-space-v2',version:1};
export const BASE_ROOM_AREA=18;
export const MAX_CONFIGURED_FLOORS=20;
export const REQUIRED_PUBLIC_ROLES=['corridor','lobby','lift-access','stair-access','restroom-access'];
export const ATTACHED_PUBLIC_ROLE='meeting-training';
export const ATTACHED_PUBLIC_ROLES=[ATTACHED_PUBLIC_ROLE,'storage-cleaning'];
export const PUBLIC_ROLES=[...REQUIRED_PUBLIC_ROLES,'living',...ATTACHED_PUBLIC_ROLES];
export const supportsAttachedPublicArea=scale=>scale==='leased-floor'||scale==='building';

export function validatePublicAreaOpening(bounds,side,path,fail){
  const {edge,offset,width}=side;
  if(!['north','south','east','west'].includes(edge)||!Number.isFinite(offset)||!Number.isFinite(width)||width<=0)
    fail('invalid-public-area-door',path,'Use a cardinal edge, finite offset and positive door width');
  const span=edge==='north'||edge==='south'?bounds.width:bounds.depth;
  // Retain a real wall return at each end, as with authored entrance openings.
  const cornerReturn=.1;
  if(Math.abs(offset)+width/2+cornerReturn>span/2+1e-7)
    fail('public-area-door-endpoint',path,'Leave at least 0.10 m of wall beyond each opening endpoint',{edge,offset,width,span,cornerReturn});
}

function validateAttachedPublicArea(area,document,profile,floors,floorIds,fail){
  const floor=floors.find(item=>item.id===floorIds.get(area.id));
  if(!profile||!supportsAttachedPublicArea(document.scale)||area.kind!=='area'||!floor||area.parentId!==floor.id)
    fail('invalid-public-area-placement',area.id,'An attached public region must belong directly to a configured full floor');
  const connections=(Array.isArray(floor.connections)?floor.connections:[]).filter(
    connection=>connection?.from?.regionId===area.id||connection?.to?.regionId===area.id);
  if(connections.length!==1)
    fail('invalid-public-area-connection',area.id,'An attached public area requires one doorway to an existing same-floor public area');
  const {from,to}=connections[0], [own,other]=from?.regionId===area.id?[from,to]:[to,from];
  const host=document.nodes.find(node=>node.id===other?.regionId);
  if(host?.kind!=='area'||host.parentId!==floor.id||!REQUIRED_PUBLIC_ROLES.includes(host.publicRole))
    fail('invalid-public-area-host',area.id,'Connect to an existing same-floor corridor or public service area',{hostId:other?.regionId});
  validatePublicAreaOpening(area.bounds,own,area.id+'.door',fail);
  validatePublicAreaOpening(host.bounds,other,area.id+'.door.host',fail);
}
export function companyScaleProfile(document,fail){
  if(document.spaceProfile===undefined)return null;
  const p=document.spaceProfile;
  if(!p||Array.isArray(p)||Object.keys(p).sort().join(',')!=='id,version'||p.id!==COMPANY_SPACE_V2.id||p.version!==1)
    fail('unsupported-space-profile','document.spaceProfile','Expected pinned company-space-v2 version 1; old records are not migrated implicitly');
  const roomsPerFloor={'small-home':1,'single-room':1,'rental-home':3,'leased-floor':16,building:16}[document.scale];
  if(!roomsPerFloor)fail('unsupported-scale','document.scale',String(document.scale));
  const configuredFloors=Array.isArray(document.nodes)?document.nodes.filter(n=>n.kind==='floor').length:0;
  const floorLimit=document.scale==='building'?MAX_CONFIGURED_FLOORS:1;
  const area=['small-home','rental-home'].includes(document.scale)?BASE_ROOM_AREA:BASE_ROOM_AREA*2;
  return {roomsPerFloor,roomArea:area,configuredFloors,capacity:{floors:floorLimit,rooms:roomsPerFloor*configuredFloors,stations:2*roomsPerFloor*configuredFloors}};
}
export function validateScaleProfile(document,{floors,rooms,floorIds},fail){
  const profile=companyScaleProfile(document,fail);
  for(const area of document.nodes.filter(node=>ATTACHED_PUBLIC_ROLES.includes(node.publicRole)))
    validateAttachedPublicArea(area,document,profile,floors,floorIds,fail);
  if(!profile)return;
  for(const floor of floors){
    const current=rooms.filter(r=>floorIds.get(r.id)===floor.id);
    if(current.length!==profile.roomsPerFloor)fail('profile-room-count',floor.id,`This profile requires ${profile.roomsPerFloor} business rooms per floor; fitout and purpose do not remove rooms`);
    if(document.scale==='rental-home'&&!document.nodes.some(n=>n.kind==='area'&&floorIds.get(n.id)===floor.id&&n.publicRole==='living'))
      fail('missing-public-space',floor.id,'A rental home requires a separate shared living area in addition to three business rooms');
    if(['leased-floor','building'].includes(document.scale)){
      const roles=new Set(document.nodes.filter(n=>n.kind==='area'&&floorIds.get(n.id)===floor.id).map(n=>n.publicRole));
      for(const role of REQUIRED_PUBLIC_ROLES)if(!roles.has(role))fail('missing-public-space',floor.id,`Declare the ${role} public region separately from business rooms`);
    }
  }
  for(const room of rooms){
    const area=room.bounds.width*room.bounds.depth;
    if(Math.abs(area-profile.roomArea)>1e-6)fail('profile-room-area',room.id,`Expected ${profile.roomArea} square metres in this scale; furniture is not resized to fit`);
  }
  for(const area of document.nodes.filter(n=>n.kind==='area')){
    if(area.publicRole!==undefined&&!PUBLIC_ROLES.includes(area.publicRole))fail('unsupported-public-role',area.id,'Use a declared public-space role');
  }
}
