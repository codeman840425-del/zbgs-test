// Wall mirror admission. Actual closed geometry and wall contact are separate gates.
export const MAKEUP_WALL_MIRROR_ROLE='makeup-mirror-wall';
export const MAKEUP_WALL_MIRROR_SCHEMA='makeup-wall-mirror-v1';
export const MAKEUP_WALL_MIRROR_IDS=['makeup-wall-mirror-round','makeup-wall-mirror-lit-frame','makeup-wall-mirror-arch','makeup-wall-mirror-tri-fold'];
export const MAKEUP_WALL_LIGHT={kind:'spot',color:'#fff4df',position:[0,.22,.103],target:[0,.065,.758],distance:1.5,angle:.55,penumbra:.6};
export const MAKEUP_WALL_STATE_SCHEMA={on:{type:'boolean'},intensity:{type:'number',min:0,max:10}};
export const MAKEUP_WALL_STATE_SEMANTICS={on:'makeup-local-light-enabled-v1',intensity:'makeup-local-light-candela-v1'};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const normalized=value=>Array.isArray(value)?value.map(normalized):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const fields=new Set(['id','version','displayName','name','label','description','notes','limitations','category','mountRole','productionBranch','mount','mounting','coordinates','footprint','usePoints',
  'mirrorSurface','mirrorPanels','makeupNodes','makeupLamp','light','stateDefaults','stateSchema','stateSemantics','provenance','asset','materialSlots']);

export function isMakeupWallMirrorResource(resource) {
  return Boolean(resource&&(resource.mountRole===MAKEUP_WALL_MIRROR_ROLE||resource.productionBranch===MAKEUP_WALL_MIRROR_ROLE||
    resource.mirrorSurface?.schema===MAKEUP_WALL_MIRROR_SCHEMA||MAKEUP_WALL_MIRROR_IDS.includes(resource.id)));
}

export function validateMakeupWallMirrorResource(resource,fail,path=resource?.id) {
  if(!isMakeupWallMirrorResource(resource))return;
  const asset=resource.asset,coordinates=resource.coordinates;
  if(Object.keys(resource).some(field=>!fields.has(field))||typeof resource.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(resource.id)||
      !Number.isSafeInteger(resource.version)||resource.version<1||
      resource.mountRole!==MAKEUP_WALL_MIRROR_ROLE||resource.productionBranch!==MAKEUP_WALL_MIRROR_ROLE||resource.category!=='dynamic'||resource.mount!=='wall'||
      !equal(resource.mounting,{origin:'center',width:.7,height:.6,depth:.12})||!equal(resource.usePoints,[])||
      (resource.footprint!==undefined&&!equal(resource.footprint,{center:[0,0],halfSize:[.35,.06],blocking:false}))||
      !object(coordinates)||Object.keys(coordinates).some(field=>!['units','up','forward','origin','scale'].includes(field))||
      coordinates.units!=='metres'||coordinates.up!=='+Y'||coordinates.forward!=='+Z'||
      (coordinates.origin!==undefined&&typeof coordinates.origin!=='string')||(coordinates.scale!==undefined&&typeof coordinates.scale!=='string')||
      !exact(asset,['format','url','sha256','bytes'])||asset.format!=='glb'||typeof asset.url!=='string'||!asset.url.trim()||
      !/^[a-fA-F0-9]{64}$/.test(asset.sha256||'')||!Number.isSafeInteger(asset.bytes)||asset.bytes<20||
      !equal(resource.mirrorSurface,{schema:MAKEUP_WALL_MIRROR_SCHEMA,profile:'single-512-v1',maxFaces:3})||
      !equal(resource.makeupNodes,{mount:'makeup-wall-mount',lamp:'makeup-lamp'})||!equal(resource.makeupLamp,{node:'makeup-lamp',maxEmissiveIntensity:1.5})||
      !equal(resource.light,MAKEUP_WALL_LIGHT)||!equal(resource.stateDefaults,{on:true,intensity:5})||
      !equal(resource.stateSchema,MAKEUP_WALL_STATE_SCHEMA)||!equal(resource.stateSemantics,MAKEUP_WALL_STATE_SEMANTICS))
    fail('invalid-makeup-wall-mirror-contract',path,'Expected the fixed wall mirror, bounded warm local lamp and supported resource fields');
  const panels=resource.mirrorPanels;
  if(!Array.isArray(panels)||![1,3].includes(panels.length))
    fail('invalid-makeup-wall-mirror-panels',path,'Provide the center panel or the complete three-plane group');
  const expected=[['center',[0,0,.038],0],['left',[-.14,0,.038],Math.PI/6],['right',[.14,0,.038],-Math.PI/6]];
  for(const [index,panel] of panels.entries()) {
    const [id,position,yaw]=expected[index];
    if(!exact(panel,['id','node','backNode','position','yaw','polygons'])||panel.id!==id||panel.node!==`makeup-face-${id}`||panel.backNode!==`makeup-back-${id}`||
        !equal(panel.position,position)||panel.yaw!==yaw||!Array.isArray(panel.polygons)||panel.polygons.length!==1)
      fail('invalid-makeup-wall-mirror-panels',path,'Each wall mirror face requires its exact stable key, real plane pose and face/back mapping');
    const polygon=panel.polygons[0];
    if(!Array.isArray(polygon)||polygon.length<3||polygon.length>128||polygon.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>.21||Math.abs(point[1])>.19))
      fail('invalid-makeup-wall-mirror-shape',path,'Mirror contours require finite bounded plane-local points');
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
      if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=1e-10||
          polygon.some(point=>(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]) < -1e-10))
        fail('invalid-makeup-wall-mirror-shape',path,'Mirror contours must be strictly convex and counterclockwise');
    }
  }
}
