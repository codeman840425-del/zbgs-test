import {fileURLToPath} from 'node:url';
import defaultCatalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import defaultTemplates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {shouldCheckTeaStations as hasTeaStations,teaStationFloors,measureTeaStationFloor} from '../../prototype/src/company/tea-station-room.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));

export function shouldCheckTeaStations(document,{catalog=defaultCatalog,derived}={}) {
  return hasTeaStations(document,{catalog,derived});
}

export async function checkTeaStations(document,{catalog=defaultCatalog,templates=defaultTemplates,root=defaultRoot,derived}={}) {
  if (!shouldCheckTeaStations(document,{catalog,derived})) return [];
  const resolved=derived??deriveCompany(document,catalog,templates);
  const groups=teaStationFloors(document,resolved),placement=inspectCompanyPlacement(document,catalog,templates);
  const byCounter=new Map();
  for(const group of groups){
    await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
      for(const result of measureTeaStationFloor(document,resolved,placement,group,{catalog,templates,assetLibrary}))
        byCounter.set(result.roles.counter,result);
    }});
  }
  // Preserve declaration order when stations on different floors are interleaved.
  return document.teaStations.map(rule=>byCounter.get(rule.roles.counter));
}
