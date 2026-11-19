import {fileURLToPath} from 'node:url';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {shouldCheckMeetingRooms as shouldCheck,meetingRoomFloors,measureMeetingRoomFloor} from '../../prototype/src/company/meeting-room.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
const rootDefault=fileURLToPath(new URL('../../',import.meta.url));
export function shouldCheckMeetingRooms(document,{catalog=catalogDefault,derived}={}) {
  return shouldCheck(document,{catalog,derived});
}
export async function checkMeetingRooms(document,{catalog=catalogDefault,templates=templatesDefault,root=rootDefault,derived}={}) {
  if(!shouldCheckMeetingRooms(document,{catalog,derived}))return [];
  const resolved=derived??deriveCompany(document,catalog,templates);
  const groups=meetingRoomFloors(document,resolved),placement=inspectCompanyPlacement(document,catalog,templates),results=[];
  for(const group of groups)await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
    results.push(...measureMeetingRoomFloor(document,resolved,placement,group,{catalog,templates,assetLibrary}));
  }});
  return results;
}
export async function checkMeetingRoom(document,rule,options={}) {
  const others=(document.meetingRooms??[]).filter(r=>r.regionId!==rule.regionId);
  const rows=await checkMeetingRooms({...document,meetingRooms:[...others,rule]},options);
  return rows.find(r=>r.regionId===rule.regionId);
}
