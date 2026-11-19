import {fileURLToPath} from 'node:url';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {shouldCheckWayfinding,wayfindingFloors,measureWayfindingFloor} from '../../prototype/src/company/wayfinding.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

export {shouldCheckWayfinding};
const rootDefault=fileURLToPath(new URL('../../',import.meta.url));
export async function checkWayfindingRooms(document,{catalog=catalogDefault,templates=templatesDefault,root=rootDefault,derived}={}){
  if(!shouldCheckWayfinding(document))return [];
  const actual=derived??deriveCompany(document,catalog,templates),placement=inspectCompanyPlacement(document,catalog,templates),rows=[];
  for(const group of wayfindingFloors(document,actual))await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
    rows.push(...measureWayfindingFloor(document,actual,placement,group,{catalog,templates,assetLibrary}));
  }});
  return rows;
}
