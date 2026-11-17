// Static top mounting. Coordinates and reserved space are independent of camera visibility.
export const CEILING_ACOUSTIC_ROLE='ceiling-acoustic-baffle';
export const CEILING_ACOUSTIC_DESIGNS=['cloud','linear','felt','timber-grid'];
export const CEILING_ACOUSTIC_IDS=CEILING_ACOUSTIC_DESIGNS.map(d=>`ceiling-acoustic-${d}`);
export const CEILING_ACOUSTIC_MOUNTING={origin:'top',width:1.2,height:.3,depth:.4};
export const CEILING_HEIGHT=2.8;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const normalized=v=>Array.isArray(v)?v.map(normalized):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):v;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const EPS=1e-6;
const allowed=new Set(['id','version','displayName','name','label','description','notes','limitations','category','mountRole','productionBranch','mount','mounting','coordinates','asset','provenance','footprint','usePoints','stateDefaults','materialSlots']);
export function isCeilingAcousticResource(r){return Boolean(r&&(r.mount=== 'ceiling'||r.mountRole===CEILING_ACOUSTIC_ROLE||r.productionBranch===CEILING_ACOUSTIC_ROLE||CEILING_ACOUSTIC_IDS.includes(r.id)));}
export function validateCeilingAcousticResource(r,fail,path=r?.id){
  if(!isCeilingAcousticResource(r))return;
  const a=r.asset,c=r.coordinates;
  if(Object.keys(r).some(k=>!allowed.has(k))||!Number.isSafeInteger(r.version)||r.version<1||
      typeof r.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(r.id)||
      r.category!=='decor'||r.mountRole!==CEILING_ACOUSTIC_ROLE||r.productionBranch!==CEILING_ACOUSTIC_ROLE||r.mount!=='ceiling'||
      !equal(r.mounting,CEILING_ACOUSTIC_MOUNTING)||!equal(r.footprint,{center:[0,0],halfSize:[.6,.2],blocking:false})||
      !equal(r.usePoints,[])||!equal(r.stateDefaults,{})||!CEILING_ACOUSTIC_DESIGNS.includes(r.provenance?.sourceDesign)||
      c?.units!=='metres'||c.up!=='+Y'||c.forward!=='+Z'||
      !object(a)||Object.keys(a).some(k=>!['format','url','sha256','bytes'].includes(k))||a.format!=='glb'||typeof a.url!=='string'||!a.url.trim()||
      !/^[a-fA-F0-9]{64}$/.test(a.sha256||'')||!Number.isSafeInteger(a.bytes)||a.bytes<20||
      (r.materialSlots!==undefined&&(!object(r.materialSlots)||Object.values(r.materialSlots).some(names=>!Array.isArray(names)||!names.length||names.some(n=>typeof n!=='string'||!n.trim())||new Set(names).size!==names.length))))
    fail('invalid-ceiling-acoustic-contract',path,'Expected static top-mounted acoustic component with the fixed 1.2 × .3 × .4 envelope and no ground blocking');
}
export function envelopeInWorld(resource,world){
  const m=resource.mounting;if(!m)return null;
  const wall=['wall','portal','information-surface'].includes(resource.mount);
  const lo=m.origin==='top'?-m.height:wall&&m.origin==='center'?-m.height/2:0;
  const corners=[];
  for(const x of [-m.width/2,m.width/2])for(const z of wall?[0,m.depth]:[-m.depth/2,m.depth/2]){
    const c=Math.cos(world.yaw),s=Math.sin(world.yaw);
    corners.push([world.position[0]+x*c+z*s,world.position[2]-x*s+z*c]);
  }
  return {min:[Math.min(...corners.map(p=>p[0])),world.position[1]+lo,Math.min(...corners.map(p=>p[1]))],
    max:[Math.max(...corners.map(p=>p[0])),world.position[1]+lo+m.height,Math.max(...corners.map(p=>p[1]))]};
}
export const envelopesOverlap=(a,b)=>a.min.every((v,i)=>v<b.max[i]-EPS&&a.max[i]>b.min[i]+EPS);
export function validateCeilingAttachments({nodes,facilities},fail){
  const mounted=facilities.filter(f=>f.resource.mount==='ceiling');
  for(const f of mounted){
    const room=nodes.get(f.node.parentId),m=f.resource.mounting,[x,y,z]=f.node.transform.position;
    if(!['room','area'].includes(room?.kind))fail('invalid-ceiling-parent',f.id,'Top mounting requires a direct room/area parent');
    const swapped=Math.abs(Math.sin(f.node.transform.yaw))>.5,hx=(swapped?m.depth:m.width)/2,hz=(swapped?m.width:m.depth)/2;
    if(Math.abs(y-CEILING_HEIGHT)>EPS||Math.abs(x)+hx>room.bounds.width/2-.1+EPS||Math.abs(z)+hz>room.bounds.depth/2-.1+EPS)
      fail('invalid-ceiling-fit',f.id,'Whole rotated envelope must fit within the room at the 2.8m ceiling plane');
    const box=envelopeInWorld(f.resource,f.world);
    for(const other of facilities)if(other.id!==f.id&&other.floorId===f.floorId){
      const b=envelopeInWorld(other.resource,other.world);
      if(b&&envelopesOverlap(box,b))fail('ceiling-envelope-overlap',f.id,`Reserved top envelope intersects ${other.id}`);
    }
  }
}
