// Functional admission only. Actual drawer/payload geometry has a separate gate.
export const MAKEUP_DRAWER_HOST_PROFILE='makeup-drawer-host-v1';
export const MAKEUP_DRAWER_HOST_ROLE='makeup-drawer-host';
export const MAKEUP_DRAWER_PAYLOAD_ROLE='makeup-storage-drawer';
export const MAKEUP_DRAWER_IDS=['makeup-drawer-tray','makeup-drawer-divided','makeup-drawer-brush-cup','makeup-drawer-case'];
export const MAKEUP_DRAWER_HOST_PARTS=[{id:'drawer',stateField:'openFraction',kind:'slide',axis:'z',pivot:[0,0,0],translationRange:[0,.32],bounds:{min:[-.42,.43,-.205],max:[.42,.77,.275]}}];
export const MAKEUP_DRAWER_HOST_SURFACES=[
  {id:'top',center:[0,0],topY:.78,halfSize:[.4,.18],clearanceHeight:.4},
  {id:'drawer',center:[0,.03125],topY:.455,halfSize:[.345,.18625],clearanceHeight:.25},
];
export const MAKEUP_DRAWER_PAYLOAD_SURFACES=[{id:'top',center:[0,-.045],topY:.01,halfSize:[.115,.055],clearanceHeight:.14}];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const normalized=value=>Array.isArray(value)?value.map(normalized):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const unrelated=['light','display','clockDisplay','mirrorSurface','mirrorNodes','mirrorPanels','informationSurface','informationContent','surface','clearance'];

export function isMakeupDrawerResource(resource) {
  return resource.mountRole===MAKEUP_DRAWER_HOST_ROLE||resource.movingProfile===MAKEUP_DRAWER_HOST_PROFILE||resource.id==='makeup-drawer-host'||
    resource.mountRole===MAKEUP_DRAWER_PAYLOAD_ROLE||resource.productionBranch===MAKEUP_DRAWER_PAYLOAD_ROLE||MAKEUP_DRAWER_IDS.includes(resource.id);
}

export function validateMakeupDrawerResource(resource,fail,path=resource.id) {
  if (!isMakeupDrawerResource(resource)) return;
  if (!Number.isSafeInteger(resource.version)||resource.version<1||resource.asset?.format!=='glb'||!equal(resource.usePoints,[])||
      resource.coordinates?.units!=='metres'||resource.coordinates?.up!=='+Y'||resource.coordinates?.forward!=='+Z'||unrelated.some(field=>resource[field]!==undefined))
    fail('invalid-makeup-drawer-contract',path,'Drawer hosts and payloads require their fixed GLB function and positive explicit version');
  const host=resource.mountRole===MAKEUP_DRAWER_HOST_ROLE||resource.movingProfile===MAKEUP_DRAWER_HOST_PROFILE||resource.id==='makeup-drawer-host';
  if (host) {
    if (resource.mountRole!==MAKEUP_DRAWER_HOST_ROLE||resource.movingProfile!==MAKEUP_DRAWER_HOST_PROFILE||resource.category!=='dynamic'||resource.mount!==undefined||
        !equal(resource.mounting,{origin:'bottom',width:.9,height:.78,depth:.55})||!equal(resource.footprint,{center:[0,0],halfSize:[.45,.275],blocking:true})||
        !equal(resource.stateDefaults,{openFraction:0})||!equal(resource.stateSchema,{openFraction:{type:'number',min:0,max:1}})||
        !equal(resource.stateSemantics,{openFraction:'sliding-drawer-opening-fraction'})||!equal(resource.movingParts,MAKEUP_DRAWER_HOST_PARTS)||
        !equal(resource.partNodes,{drawer:'cabinet-drawer-slide'})||!equal(resource.partPanels,{drawer:'drawer-front'})||
        !equal(resource.partTrays,{drawer:{bottom:'drawer-bottom',left:'drawer-left',right:'drawer-right',back:'drawer-back'}})||
        !equal(resource.supportSurfaces,MAKEUP_DRAWER_HOST_SURFACES)||!equal(resource.supportNodes,{top:'cabinet-top',drawer:'drawer-bottom'})||
        !equal(resource.supportMotion,{drawer:'drawer'}))
      fail('invalid-makeup-drawer-host',path,'Expected the grounded low drawer host with fixed travel, cavity supports and functional motion mapping');
    return;
  }
  if (resource.mountRole!==MAKEUP_DRAWER_PAYLOAD_ROLE||resource.productionBranch!==MAKEUP_DRAWER_PAYLOAD_ROLE||resource.category!=='decor'||resource.mount!=='support-surface'||
      !equal(resource.mounting,{origin:'bottom',width:.45,height:.18,depth:.25})||resource.footprint?.blocking!==false||!equal(resource.stateDefaults,{})||
      !equal(resource.supportSurfaces,MAKEUP_DRAWER_PAYLOAD_SURFACES)||!equal(resource.supportNodes,{top:'storage-roof'})||
      ['stateSchema','stateSemantics','movingProfile','movingParts','partNodes','partPanels','partTrays','supportMotion'].some(field=>resource[field]!==undefined))
    fail('invalid-makeup-drawer-payload',path,'Payloads require the static bounded upper-storage contract and their own top support');
}

export function validateMakeupDrawerAttachments(nodes,resources,fail) {
  for (const node of nodes.values()) {
    const resource=resources.get(`${node.resource?.id}@${node.resource?.version}`);
    if (resource?.mountRole===MAKEUP_DRAWER_HOST_ROLE) {
      const parent=nodes.get(node.parentId);
      if (!['room','area'].includes(parent?.kind)||Math.abs(node.transform.position[1])>1e-8)
        fail('invalid-makeup-drawer-host-parent',node.id,'A grounded makeup drawer host requires a direct room or area parent');
    }
    if (resource?.mountRole!==MAKEUP_DRAWER_PAYLOAD_ROLE) continue;
    const parent=nodes.get(node.parentId),parentResource=resources.get(`${parent?.resource?.id}@${parent?.resource?.version}`);
    if (parent?.kind!=='facility'||parentResource?.movingProfile!==MAKEUP_DRAWER_HOST_PROFILE||parentResource?.mountRole!==MAKEUP_DRAWER_HOST_ROLE||!equal(node.attachment,{surfaceId:'drawer'}))
      fail('invalid-makeup-drawer-payload-parent',node.id,'A drawer payload requires the fixed real host drawer as its direct support parent');
  }
}
