import {GARMENT_RAIL,WARDROBE_ROLE,WARDROBE_PROFILE,isWardrobeDeclaration} from './garment-rack-data.js';
export {WARDROBE_PROFILE,isWardrobeDeclaration};

export const WARDROBE_PARTS=[['left',-1],['right',1]].map(([id,sign])=>({
  id,stateField:id+'Open',kind:'hinge',axis:'y',pivot:[sign*.469,.08,.260],
  rotationRange:[0,sign*Math.PI/2],bounds:{min:[sign<0?0:-.467,0,-.006],max:[sign<0?.467:0,1.64,.027]},
}));
export const WARDROBE_CLEARANCE={schema:'garment-rack-front-v1',front:{min:[-.44,.29],max:[.44,.89]}};
const fraction={type:'number',min:0,max:1};
const contract={
  mountRole:WARDROBE_ROLE,productionBranch:WARDROBE_ROLE,category:'dynamic',mount:'floor-surface',parent:'room.floor',
  coordinates:{units:'metres',up:'+Y',forward:'+Z'},mounting:{origin:'bottom',width:1,height:1.8,depth:.58},
  footprint:{center:[0,0],halfSize:[.5,.29],blocking:true},usePoints:[],
  stateDefaults:{leftOpen:0,rightOpen:0},stateSchema:{leftOpen:fraction,rightOpen:fraction},
  stateSemantics:{leftOpen:'hinged-door-opening-fraction',rightOpen:'hinged-door-opening-fraction'},
  movingProfile:WARDROBE_PROFILE,movingParts:WARDROBE_PARTS,
  partNodes:{left:'wardrobe-left-pivot',right:'wardrobe-right-pivot'},partPanels:{left:'wardrobe-left-panel',right:'wardrobe-right-panel'},
  clearance:WARDROBE_CLEARANCE,
};
function same(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  return Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
}
export function validateWardrobeResource(resource,fail,path=resource.id){
  if(!isWardrobeDeclaration(resource))return;
  for(const [field,required] of Object.entries({...contract,garmentRail:GARMENT_RAIL}))
    if(!same(resource[field],required))fail('invalid-wardrobe-contract',path+'.'+field,'Expected the fixed two-door wardrobe installation and motion contract.');
  if(resource.asset?.format!=='glb'||resource.provenance?.environmentBranch!=='garment-rack-wardrobe'||
      ['surface','supportSurfaces','supportMotion','supportNodes','partTrays','light','display','cablePorts','cableConnection','capacity',
       'informationSurface','informationContent','mirrorSurface','clockDisplay','backdropRoll','windowSystem'].some(k=>resource[k]!==undefined))
    fail('invalid-wardrobe-contract',path,'An enclosed wardrobe requires the garment-rack branch, two doors, and a fixed clothes rail.');
}
