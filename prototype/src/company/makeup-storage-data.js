// Fixed tabletop storage function. Loaded geometry is validated separately.
import {isMakeupDrawerResource,validateMakeupDrawerResource,MAKEUP_DRAWER_PAYLOAD_ROLE} from './makeup-drawer-data.js';
export const MAKEUP_STORAGE_PROFILE='supported-slide-v1';
export const MAKEUP_STORAGE_IDS=['makeup-storage-tray','makeup-storage-divided','makeup-storage-brush-cup','makeup-storage-case'];
export const MAKEUP_STORAGE_MOUNTING={origin:'bottom',width:.45,height:.25,depth:.25};
export const MAKEUP_STORAGE_PARTS=[{id:'drawer',stateField:'openFraction',kind:'slide',axis:'z',pivot:[0,0,0],translationRange:[0,.09],bounds:{min:[-.205,.016,-.115],max:[.205,.078,.035]}}];
export const MAKEUP_STORAGE_SURFACES=[
  {id:'top',center:[0,-.045],topY:.100,halfSize:[.115,.055],clearanceHeight:.140},
  {id:'drawer',center:[0,-.005],topY:.022,halfSize:[.180,.020],clearanceHeight:.040},
];
export const MAKEUP_STORAGE_CONTENT_ID='makeup-storage-content-compact';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const normalized=value=>Array.isArray(value)?value.map(normalized):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const unsupported=['light','display','clockDisplay','mirrorSurface','mirrorNodes','mirrorPanels','informationSurface','informationContent','surface'];

export function validateMakeupStorageResource(resource,fail,path=resource.id) {
  if (resource.movingProfile==='exterior-door-leaf-v1') return;
  if (isMakeupDrawerResource(resource)&&!MAKEUP_STORAGE_IDS.includes(resource.id)&&resource.id!==MAKEUP_STORAGE_CONTENT_ID) {
    validateMakeupDrawerResource(resource,fail,path); return;
  }
  const carrier=resource.mountRole==='makeup-storage'||resource.productionBranch==='makeup-storage'||MAKEUP_STORAGE_IDS.includes(resource.id)||resource.movingProfile===MAKEUP_STORAGE_PROFILE;
  const content=resource.mountRole==='makeup-storage-content'||resource.id===MAKEUP_STORAGE_CONTENT_ID;
  if (!carrier&&!content) {
    if (resource.movingProfile!==undefined||resource.supportMotion!==undefined)
      fail('invalid-supported-motion',path,'Moving profiles and supportMotion require the fixed tabletop storage contract');
    return;
  }
  if (!Number.isSafeInteger(resource.version)||resource.version<1||resource.mount!=='support-surface'||resource.footprint?.blocking!==false||
      !equal(resource.usePoints,[])||resource.coordinates?.units!=='metres'||resource.coordinates?.up!=='+Y'||resource.coordinates?.forward!=='+Z'||
      resource.asset?.format!=='glb'||unsupported.some(field=>resource[field]!==undefined))
    fail('invalid-makeup-storage-contract',path,'Storage and its compact content require their fixed supported GLB contract without unrelated mechanisms');
  if (content) {
    if (carrier||resource.mountRole!=='makeup-storage-content'||resource.category!=='decor'||
        !equal(resource.mounting,{origin:'bottom',width:.024,height:.035,depth:.024})||!equal(resource.stateDefaults,{})||
        ['stateSchema','stateSemantics','movingProfile','movingParts','partNodes','partPanels','partTrays','supportMotion','supportSurfaces','supportNodes'].some(field=>resource[field]!==undefined))
      fail('invalid-makeup-storage-content',path,'Only the fixed static compact witness fits this limited storage-content adapter');
    return;
  }
  if (resource.mountRole!=='makeup-storage'||resource.productionBranch!=='makeup-storage'||resource.category!=='dynamic'||
      resource.movingProfile!==MAKEUP_STORAGE_PROFILE||!equal(resource.mounting,MAKEUP_STORAGE_MOUNTING)||
      !equal(resource.stateDefaults,{openFraction:0})||!equal(resource.stateSchema,{openFraction:{type:'number',min:0,max:1}})||
      !equal(resource.stateSemantics,{openFraction:'sliding-drawer-opening-fraction'})||!equal(resource.movingParts,MAKEUP_STORAGE_PARTS)||
      !equal(resource.partNodes,{drawer:'storage-drawer-slide'})||!equal(resource.partPanels,{drawer:'storage-drawer-front'})||
      !equal(resource.partTrays,{drawer:{bottom:'storage-drawer-bottom',left:'storage-drawer-left',right:'storage-drawer-right',back:'storage-drawer-back'}})||
      !equal(resource.supportSurfaces,MAKEUP_STORAGE_SURFACES)||!equal(resource.supportNodes,{top:'storage-roof',drawer:'storage-drawer-bottom'})||
      !equal(resource.supportMotion,{drawer:'drawer'}))
    fail('invalid-makeup-storage-contract',path,'Expected the common short-travel drawer, full reserved mounting box and exact dynamic support mappings');
}

export function validateMakeupStorageAttachments(nodes,resources,fail) {
  for (const node of nodes.values()) {
    const resource=resources.get(`${node.resource?.id}@${node.resource?.version}`);
    if (!['makeup-storage','makeup-storage-content'].includes(resource?.mountRole)) continue;
    const parent=nodes.get(node.parentId),parentResource=resources.get(`${parent?.resource?.id}@${parent?.resource?.version}`);
    const storage=resource.mountRole==='makeup-storage';
    const payload=parentResource?.mountRole===MAKEUP_DRAWER_PAYLOAD_ROLE;
    const validParent=storage ? parentResource?.mountRole==='vanity-table' : payload||parentResource?.mountRole==='makeup-storage'&&parentResource?.movingProfile===MAKEUP_STORAGE_PROFILE;
    const validSurface=storage||payload ? node.attachment?.surfaceId==='top' : ['top','drawer'].includes(node.attachment?.surfaceId);
    if (parent?.kind!=='facility'||!validParent||!validSurface)
      fail('invalid-makeup-storage-parent',node.id,storage?'Storage requires a direct vanity-table top attachment':'The compact witness requires a storage top/drawer or a drawer-payload top attachment');
  }
}
