import {deriveCompany,prepareCompanyChange} from './document.js';
import {inspectCompanyPlacement} from './placement.js';
import {listPlacementTargets,createFacilityPlacement} from './facility-edit-data.js';

// Explicit upgrade for an old room without a door opening. Never mutates a save
// merely because it was loaded; the UI labels both structural and frame edits.
export function planEntranceAndFrame(document,catalog,templates,resource,regionId){
  if(resource?.mount!=='portal'||!resource.mounting?.apertureHeight)return null;
  const derived=deriveCompany(document,catalog,templates),room=derived.nodes.get(regionId),floor=derived.nodes.get(derived.floorIds.get(regionId));
  if(!room||!floor)return null;
  const id=`${regionId}/exterior-entry`,width=resource.mounting.apertureWidth,height=resource.mounting.apertureHeight;
  if(document.nodes.some(n=>n.id===id)||(floor.exteriorEntrances||[]).some(e=>e.id===id))return null;
  for(const edge of ['south','west','east','north'])for(const offset of [-1.2,0,1.2]){
    const entrance={id,regionId,edge,offset,width,height};
    const operation={type:'set-exterior-entrances',id:floor.id,entrances:[...(floor.exteriorEntrances||[]),entrance]};
    try{
      const opened=prepareCompanyChange(document,[operation],{catalog,templates}).document;
      const target=listPlacementTargets(opened,catalog,resource,regionId,{templates}).find(t=>t.portalId===id);
      if(!target)continue;
      const frame=createFacilityPlacement(opened,catalog,resource,target.id,{},regionId,{templates});
      const candidate=prepareCompanyChange(document,[operation,frame.operation],{catalog,templates}).document;
      inspectCompanyPlacement(candidate,catalog,templates);
      return {entrance,operations:[operation,frame.operation],frameId:frame.id,label:`${{south:'南',west:'西',east:'东',north:'北'}[edge]}墙 · 偏移 ${offset} 米 · 门洞 ${width} × ${height} 米`};
    }catch(error){if(!error.code)throw error;}
  }
  return null;
}
