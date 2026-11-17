// Static side-table function. External-source provenance and real geometry are
// independently verified by the production pipeline and its geometry gate.
export const SIDE_TABLE_PROFILE='side-table-v1';
export const SIDE_TABLE_ROLE='side-table';
export const SIDE_TABLE_IDS=['side-table-round','side-table-square','side-table-nested','side-table-low'];
export const SIDE_TABLE_MOUNTING={origin:'bottom',width:.8,height:.5,depth:.55};
export const SIDE_TABLE_SUPPORT_SURFACES=[{id:'top',center:[0,0],topY:.5,halfSize:[.15,.11],clearanceHeight:.35}];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const normalized=value=>Array.isArray(value)?value.map(normalized):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const fields=new Set(['id','version','displayName','name','label','description','notes','limitations','category','mountRole','productionBranch','mount','mounting','coordinates',
  'asset','provenance','footprint','usePoints','stateDefaults','supportSurfaces','supportNodes','materialSlots']);

export function isSideTableResource(resource) {
  return Boolean(resource&&(resource.mountRole===SIDE_TABLE_ROLE||resource.productionBranch===SIDE_TABLE_ROLE||SIDE_TABLE_IDS.includes(resource.id)));
}

export function validateSideTableResource(resource,fail,path=resource?.id) {
  if(!isSideTableResource(resource))return;
  const asset=resource.asset,coordinates=resource.coordinates;
  if(Object.keys(resource).some(field=>!fields.has(field))||typeof resource.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(resource.id)||
      !Number.isSafeInteger(resource.version)||resource.version<1||resource.mountRole!==SIDE_TABLE_ROLE||resource.productionBranch!==SIDE_TABLE_ROLE||
      resource.category!=='decor'||resource.mount!=='floor-surface'||!equal(resource.mounting,SIDE_TABLE_MOUNTING)||
      !equal(resource.footprint,{center:[0,0],halfSize:[.4,.275],blocking:true})||!equal(resource.stateDefaults,{})||!equal(resource.usePoints,[])||
      !equal(resource.supportSurfaces,SIDE_TABLE_SUPPORT_SURFACES)||!equal(resource.supportNodes,{top:'side-table-top'})||
      !object(coordinates)||Object.keys(coordinates).some(field=>!['units','up','forward','origin','scale'].includes(field))||
      coordinates.units!=='metres'||coordinates.up!=='+Y'||coordinates.forward!=='+Z'||
      (coordinates.origin!==undefined&&typeof coordinates.origin!=='string')||(coordinates.scale!==undefined&&typeof coordinates.scale!=='string')||
      !exact(asset,['format','url','sha256','bytes'])||asset.format!=='glb'||typeof asset.url!=='string'||!asset.url.trim()||
      !/^[a-fA-F0-9]{64}$/.test(asset.sha256||'')||!Number.isSafeInteger(asset.bytes)||asset.bytes<20)
    fail('invalid-side-table-contract',path,'Expected the fixed static side-table mounting, blocking footprint and single rectangular top support');
}
