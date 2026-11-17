// Explicit new space grammar. Absence preserves legacy saved layouts verbatim.
export const COMPANY_SPACE_V2={id:'company-space-v2',version:1};
export const BASE_ROOM_AREA=18;
export const MAX_CONFIGURED_FLOORS=20;
export const REQUIRED_PUBLIC_ROLES=['corridor','lobby','lift-access','stair-access','restroom-access'];
export const PUBLIC_ROLES=[...REQUIRED_PUBLIC_ROLES,'living'];
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
  const profile=companyScaleProfile(document,fail);if(!profile)return;
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
