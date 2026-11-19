import {fileURLToPath} from 'node:url';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {shouldCheckGlassPartitions as applies,glassPartitionFloors,measureGlassPartitionFloor} from '../../prototype/src/company/glass-partition-room.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));
export function shouldCheckGlassPartitions(document,derivedOrOptions={catalog:catalogDefault}){
  return applies(document,derivedOrOptions);
}
export async function checkGlassPartitionRooms(document,{catalog=catalogDefault,templates=templatesDefault,root=defaultRoot,derived}={}){
  if(!applies(document,derived??{catalog}))return [];
  const actual=derived??deriveCompany(document,catalog,templates),placement=inspectCompanyPlacement(document,catalog,templates);
  const result=[];
  for(const group of glassPartitionFloors(document,actual))
    await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
      result.push(...measureGlassPartitionFloor(document,actual,placement,group,{catalog,templates,assetLibrary}));
    }});
  return result;
}
