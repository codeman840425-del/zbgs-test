// One wall installation/support function; appearance geometry remains separate.
export const WALL_SHELF_ROLE='wall-shelf';
export const WALL_SHELF_DESIGNS=['side-bracket','cantilever','frame','back-panel'];
export const WALL_SHELF_IDS=WALL_SHELF_DESIGNS.map(id=>`wall-shelf-${id}`);
export const WALL_SHELF_MOUNTING={origin:'bottom',width:1,height:1.8,depth:.35};
export const WALL_SHELF_FOOTPRINT={center:[0,.175],halfSize:[.5,.175],blocking:true};
export const WALL_SHELF_SUPPORTS=[
  {id:'lower',center:[0,.19],topY:.35,halfSize:[.4,.1],clearanceHeight:.45},
  {id:'middle',center:[0,.19],topY:.95,halfSize:[.4,.1],clearanceHeight:.45},
  {id:'top',center:[0,.19],topY:1.55,halfSize:[.4,.1],clearanceHeight:.25},
];
export const WALL_SHELF_NODES=Object.fromEntries(WALL_SHELF_SUPPORTS.map(s=>[s.id,`wall-shelf-board-${s.id}`]));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const normalized=v=>Array.isArray(v)?v.map(normalized):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):v;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const allowed=new Set(['id','version','displayName','name','label','description','notes','limitations','category','mountRole','productionBranch','mount','mounting',
  'coordinates','asset','provenance','footprint','usePoints','stateDefaults','supportSurfaces','supportNodes','materialSlots']);
export function isWallShelfResource(r) {
  return Boolean(r&&(r.mountRole===WALL_SHELF_ROLE||r.productionBranch===WALL_SHELF_ROLE||WALL_SHELF_IDS.includes(r.id)));
}
export function validateWallShelfResource(r,fail,path=r?.id) {
  if(!isWallShelfResource(r))return;
  const a=r.asset,c=r.coordinates,slots=r.materialSlots;
  const surfaces=Array.isArray(r.supportSurfaces)?[...r.supportSurfaces].sort((a,b)=>String(a?.id).localeCompare(String(b?.id))):r.supportSurfaces;
  const expected=[...WALL_SHELF_SUPPORTS].sort((a,b)=>a.id.localeCompare(b.id));
  if(Object.keys(r).some(k=>!allowed.has(k))||typeof r.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(r.id)||
      !Number.isSafeInteger(r.version)||r.version<1||r.category!=='decor'||r.mountRole!==WALL_SHELF_ROLE||r.productionBranch!==WALL_SHELF_ROLE||r.mount!=='wall'||
      !equal(r.mounting,WALL_SHELF_MOUNTING)||!equal(r.footprint,WALL_SHELF_FOOTPRINT)||!equal(r.stateDefaults,{})||!equal(r.usePoints,[])||
      !equal(surfaces,expected)||!equal(r.supportNodes,WALL_SHELF_NODES)||!object(r.provenance)||!WALL_SHELF_DESIGNS.includes(r.provenance.sourceDesign)||
      !object(c)||Object.keys(c).some(k=>!['units','up','forward','origin','scale'].includes(k))||c.units!=='metres'||c.up!=='+Y'||c.forward!=='+Z'||
      (c.origin!==undefined&&typeof c.origin!=='string')||(c.scale!==undefined&&typeof c.scale!=='string')||
      (slots!==undefined&&(!object(slots)||Object.entries(slots).some(([slot,names])=>!slot||!Array.isArray(names)||!names.length||
        names.some(n=>typeof n!=='string'||!n.trim())||new Set(names).size!==names.length)))||
      !exact(a,['format','url','sha256','bytes'])||a.format!=='glb'||typeof a.url!=='string'||!a.url.trim()||
      !/^[a-fA-F0-9]{64}$/.test(a.sha256||'')||!Number.isSafeInteger(a.bytes)||a.bytes<20)
    fail('invalid-wall-shelf-contract',path,'Expected the fixed wall-mounted shelf envelope, blocking projection, three support surfaces and static state');
}
