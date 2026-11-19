import {fileURLToPath} from 'node:url';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {shouldCheckPublicStorage as needed,publicStorageFloors,measurePublicStorageFloor} from '../../prototype/src/company/public-storage.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const rootDefault=fileURLToPath(new URL('../../',import.meta.url));
export function shouldCheckPublicStorage(document,{catalog=catalogDefault,derived}={}){
  return needed(document,{catalog,derived});
}
export async function checkPublicStorageRooms(document,{catalog=catalogDefault,templates=templatesDefault,root=rootDefault,derived}={}){
  if(!shouldCheckPublicStorage(document,{catalog,derived}))return [];
  const resolved=derived??deriveCompany(document,catalog,templates),result=[];
  const placement=inspectCompanyPlacement(document,catalog,templates);
  for(const group of publicStorageFloors(document,resolved))await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
    result.push(...measurePublicStorageFloor(document,resolved,placement,group,{catalog,templates,assetLibrary}));
  }});
  return result;
}
