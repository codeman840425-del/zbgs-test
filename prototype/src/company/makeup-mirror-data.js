// Fixed tabletop mirror function. Geometry/plane outlines remain separately verified.
import {isMakeupWallMirrorResource,validateMakeupWallMirrorResource} from './makeup-wall-mirror-data.js';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const normalized=v=>Array.isArray(v)?v.map(normalized):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):v;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
export const MAKEUP_LIGHT={kind:'spot',color:'#fff4df',position:[0,.585,.065],target:[0,.43,.72],distance:1.5,angle:.55,penumbra:.6};
export const MAKEUP_STATE_SCHEMA={on:{type:'boolean'},intensity:{type:'number',min:0,max:10}};
export const MAKEUP_STATE_SEMANTICS={on:'makeup-local-light-enabled-v1',intensity:'makeup-local-light-candela-v1'};
export function validateMakeupMirrorResource(r,fail,path=r.id) {
  if(isMakeupWallMirrorResource(r)){validateMakeupWallMirrorResource(r,fail,path);return;}
  const active=r.mountRole==='makeup-mirror'||r.mirrorSurface?.schema==='makeup-mirror-v1';
  if(!active) {
    if(r.mirrorPanels!==undefined||r.makeupNodes!==undefined||r.makeupLamp!==undefined)
      fail('invalid-makeup-mirror-contract',path,'Makeup mappings require their fixed resource contract');
    return;
  }
  if(r.mountRole!=='makeup-mirror'||r.productionBranch!=='makeup-mirror'||r.category!=='dynamic'||r.mount!=='support-surface'||!r.asset||
    !equal(r.mounting,{origin:'bottom',width:.7,height:.6,depth:.16})||!equal(r.usePoints,[])||r.footprint?.blocking||
    !equal(r.mirrorSurface,{schema:'makeup-mirror-v1',profile:'single-512-v1',maxFaces:3})||
    !equal(r.makeupNodes,{base:'makeup-base',post:'makeup-post',lamp:'makeup-lamp'})||
    !equal(r.makeupLamp,{node:'makeup-lamp',maxEmissiveIntensity:1.5})||
    !equal(r.light,MAKEUP_LIGHT)||!equal(r.stateDefaults,{on:true,intensity:5})||
    !equal(r.stateSchema,MAKEUP_STATE_SCHEMA)||!equal(r.stateSemantics,MAKEUP_STATE_SEMANTICS)||
    r.mirrorNodes!==undefined||r.mirrorShape!==undefined||r.movingParts||r.display||r.clockDisplay||r.informationSurface||r.informationContent||r.surface||r.supportSurfaces)
    fail('invalid-makeup-mirror-contract',path,'Expected fixed tabletop support, planar mirror group and bounded local lamp contract');
  const panels=r.mirrorPanels;
  if(!Array.isArray(panels)||![1,3].includes(panels.length))
    fail('invalid-makeup-mirror-panels',path,'Use one central face or the full fixed three-fold group');
  const expected=[['center',[0,.365,0],0],['left',[-.14,.365,0],Math.PI/6],['right',[.14,.365,0],-Math.PI/6]];
  for(const [index,panel]of panels.entries()) {
    const [id,position,yaw]=expected[index];
    if(!exact(panel,['id','node','backNode','position','yaw','polygons'])||panel.id!==id||
      panel.node!==`makeup-face-${id}`||panel.backNode!==`makeup-back-${id}`||!equal(panel.position,position)||panel.yaw!==yaw||
      !Array.isArray(panel.polygons)||panel.polygons.length!==1)
      fail('invalid-makeup-mirror-panels',path,'Face keys, nodes and actual plane transforms must follow the bounded mirror adapter');
    const polygon=panel.polygons[0];
    if(!Array.isArray(polygon)||polygon.length<3||polygon.length>128||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>.21||Math.abs(p[1])>.19))
      fail('invalid-makeup-mirror-shape',path,'Expected a bounded finite convex plane-local outline');
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
      if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=1e-10)
        fail('invalid-makeup-mirror-shape',path,'Mirror outlines must be strictly convex and counterclockwise');
    }
  }
}

export function validateMakeupMirrorAttachments(nodes,resources,fail) {
  for(const node of nodes.values()) {
    const resource=resources.get(`${node.resource?.id}@${node.resource?.version}`);
    if(resource?.mountRole!=='makeup-mirror')continue;
    const parent=nodes.get(node.parentId),parentResource=resources.get(`${parent?.resource?.id}@${parent?.resource?.version}`);
    if(parent?.kind!=='facility'||parentResource?.mountRole!=='vanity-table'||!equal(node.attachment,{surfaceId:'top'}))
      fail('invalid-makeup-mirror-parent',node.id,'A tabletop makeup mirror requires the vanity-table top support surface');
  }
}
