import {fileURLToPath} from 'node:url';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {publicWashroomFloors,measurePublicWashroomFloor,shouldCheckPublicWashrooms as hasPublicWashrooms} from '../../prototype/src/company/public-washroom.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

export function shouldCheckPublicWashrooms(document,{catalog=catalogDefault,derived}={}) {
  return hasPublicWashrooms(document,{catalog,derived});
}
const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));

export async function checkPublicWashrooms(document,{catalog=catalogDefault,templates=templatesDefault,root=defaultRoot,derived}={}){
  if(!shouldCheckPublicWashrooms(document,{catalog,derived}))return [];
  const resolved=derived??deriveCompany(document,catalog,templates);
  const groups=publicWashroomFloors(document,resolved),placement=inspectCompanyPlacement(document,catalog,templates),results=[];
  for(const group of groups){
    await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
      results.push(...measurePublicWashroomFloor(document,resolved,placement,group,{catalog,templates,assetLibrary}));
    }});
  }
  return results;
}
