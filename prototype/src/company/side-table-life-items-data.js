// Static supported life items. Source geometry and embedded images have their
// own production checks and do not change this shared installation function.
export const SIDE_TABLE_LIFE_ITEMS_PROFILE='side-table-life-items-v1';
export const SIDE_TABLE_LIFE_ITEMS_ROLE='side-table-life-items';
export const SIDE_TABLE_LIFE_ITEMS_IDS=['side-table-life-cup','side-table-life-bottle','side-table-life-tissue','side-table-life-pen-notebook'];
export const SIDE_TABLE_LIFE_ITEMS_DESIGNS=['cup','bottle','tissue','pen-notebook'];
export const SIDE_TABLE_LIFE_ITEMS_MOUNTING={origin:'bottom',width:.18,height:.25,depth:.18};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const normalized=value=>Array.isArray(value)?value.map(normalized):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const fields=new Set(['id','version','displayName','name','label','description','notes','limitations','category','mountRole','productionBranch','mount','mounting','coordinates',
  'asset','provenance','footprint','usePoints','stateDefaults','materialSlots']);

export function isSideTableLifeItemsResource(resource) {
  return Boolean(resource&&(resource.mountRole===SIDE_TABLE_LIFE_ITEMS_ROLE||resource.productionBranch===SIDE_TABLE_LIFE_ITEMS_ROLE||SIDE_TABLE_LIFE_ITEMS_IDS.includes(resource.id)));
}

export function validateSideTableLifeItemsResource(resource,fail,path=resource?.id) {
  if(!isSideTableLifeItemsResource(resource))return;
  const asset=resource.asset,coordinates=resource.coordinates,slots=resource.materialSlots;
  if(Object.keys(resource).some(field=>!fields.has(field))||typeof resource.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(resource.id)||
      !Number.isSafeInteger(resource.version)||resource.version<1||resource.mountRole!==SIDE_TABLE_LIFE_ITEMS_ROLE||resource.productionBranch!==SIDE_TABLE_LIFE_ITEMS_ROLE||
      resource.category!=='decor'||resource.mount!=='support-surface'||!equal(resource.mounting,SIDE_TABLE_LIFE_ITEMS_MOUNTING)||
      !equal(resource.footprint,{blocking:false})||!equal(resource.stateDefaults,{})||!equal(resource.usePoints,[])||
      !object(resource.provenance)||!SIDE_TABLE_LIFE_ITEMS_DESIGNS.includes(resource.provenance.sourceDesign)||
      !object(coordinates)||Object.keys(coordinates).some(field=>!['units','up','forward','origin','scale'].includes(field))||
      coordinates.units!=='metres'||coordinates.up!=='+Y'||coordinates.forward!=='+Z'||
      (coordinates.origin!==undefined&&typeof coordinates.origin!=='string')||(coordinates.scale!==undefined&&typeof coordinates.scale!=='string')||
      (slots!==undefined&&(!object(slots)||Object.entries(slots).some(([slot,names])=>!slot||!Array.isArray(names)||!names.length||
        names.some(name=>typeof name!=='string'||!name.trim())||new Set(names).size!==names.length)))||
      !exact(asset,['format','url','sha256','bytes'])||asset.format!=='glb'||typeof asset.url!=='string'||!asset.url.trim()||
      !/^[a-fA-F0-9]{64}$/.test(asset.sha256||'')||!Number.isSafeInteger(asset.bytes)||asset.bytes<20)
    fail('invalid-side-table-life-items-contract',path,'Expected the fixed static life-item support envelope, finite source design and empty state/use points');
}
