import {fileURLToPath} from 'node:url';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {shouldCheckWallAbsorbers as applies,wallAbsorberFloors,measureWallAbsorberFloor} from '../../prototype/src/company/wall-absorber-room.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));
export function shouldCheckWallAbsorbers(document,derivedOrOptions={catalog:catalogDefault}){
  return applies(document,derivedOrOptions);
}
export async function checkWallAbsorberRooms(document,{catalog=catalogDefault,templates=templatesDefault,root=defaultRoot,derived}={}){
  if(!applies(document,derived??{catalog}))return [];
  const actual=derived??deriveCompany(document,catalog,templates),placement=inspectCompanyPlacement(document,catalog,templates);
  const result=[];
  for(const group of wallAbsorberFloors(document,actual))
    await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
      result.push(...measureWallAbsorberFloor(document,actual,placement,group,{catalog,templates,assetLibrary}));
    }});
  return result;
}
