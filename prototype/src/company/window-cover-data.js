import * as THREE from 'three';
export const WINDOW_COVER_SYSTEM='window-cover-v1';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['id','stateField','kind','axis','range','nodes','base'];

export function validateWindowCoverResource(r,fail,path=r?.id||'resource'){
  if(r?.mountRole!=='window-cover'&&r?.mount!=='window-cover'&&r?.windowCoverSystem===undefined)return;
  if(!r||r.mountRole!=='window-cover'||r.mount!=='window-cover'||r.category!=='dynamic'||r.windowCoverSystem!==WINDOW_COVER_SYSTEM)
    fail('invalid-window-cover-contract',path,'Expected a window-cover dynamic resource');
  if(!equal(r.mounting,{width:1.6,height:1.2,depth:.08,origin:'center'})||r.footprint||r.usePoints?.length)
    fail('invalid-window-cover-mount',path,'Window covers use the fixed nonblocking 1.6×1.2×0.08 inner-window envelope');
  if(!equal(r.stateDefaults,{openFraction:0})||!equal(r.stateSchema,{openFraction:{type:'number',min:0,max:1}})||r.stateSemantics?.openFraction!=='window-cover-opening-fraction')
    fail('invalid-window-cover-state',path,'Window covers require bounded openFraction state');
  const s=r.windowCoverParts;
  if(!object(s)||!Array.isArray(s.parts)||!s.parts.length||typeof s.mode!=='string')fail('invalid-window-cover-parts',path,'Window cover must declare actual state parts');
  const ids=new Set();
  for(const p of s.parts){
    if(!object(p)||Object.keys(p).some(k=>!fields.includes(k))||typeof p.id!=='string'||ids.has(p.id)||typeof p.stateField!=='string'||p.stateField!=='openFraction'||!['slide','scale','tilt'].includes(p.kind)||!['x','y','z','rotationZ'].includes(p.axis)||!Array.isArray(p.range)||p.range.length!==2||!p.range.every(Number.isFinite)||!Array.isArray(p.nodes)||!p.nodes.length||p.nodes.some(n=>typeof n!=='string'||!n)||(p.base!==undefined&&(!Number.isFinite(p.base))))
      fail('invalid-window-cover-parts',path,'Each cover state part requires a unique mechanism and named display meshes');
    ids.add(p.id);
  }
}

export function validateWindowCoverGeometry(root,r,fail){
  if(r.mountRole!=='window-cover')return;
  validateWindowCoverResource(r,fail);
  const nodes=new Map();root.traverse(n=>{if(n.name){if(!nodes.has(n.name))nodes.set(n.name,[]);nodes.get(n.name).push(n);}});
  for(const part of r.windowCoverParts.parts)for(const name of part.nodes){const matches=nodes.get(name)||[];if(matches.length!==1||!matches[0].isMesh)fail('missing-window-cover-part',`${r.id}.${part.id}`,`State target ${name} must resolve to one mesh`);}
  const initial=r.stateDefaults?.openFraction??0, states=[initial,.5,1], bounds=[];
  for(const value of states){const clone=root.clone(true);applyWindowCoverState(clone,r,{openFraction:value});const box=new THREE.Box3();box.makeEmpty();for(const part of r.windowCoverParts.parts)for(const name of part.nodes){const node=clone.getObjectByName(name);box.union(new THREE.Box3().setFromObject(node));}if(box.min.x<-.801||box.max.x>.801||box.min.y<-.601||box.max.y>.601||box.min.z<-.001||box.max.z>.081)fail('window-cover-state-envelope',r.id,`State ${value} leaves the fixed window display envelope`);bounds.push(box.min.toArray().concat(box.max.toArray()));}
  if(JSON.stringify(bounds[0])===JSON.stringify(bounds[2]))fail('window-cover-static-state',r.id,'Open state must change actual display geometry');
}

export function applyWindowCoverState(root,r,state){
  if(!r.windowCoverParts)return;
  for(const part of r.windowCoverParts.parts){
    const value=state[part.stateField];
    const amount=part.range[0]+(part.range[1]-part.range[0])*value;
    for(const name of part.nodes){
      const node=root.getObjectByName(name);if(!node)continue;
      if(part.kind==='slide')node.position[part.axis]=(part.base??0)+amount;
      else if(part.kind==='scale')node.scale[part.axis]=Math.max(.02,1-amount);
      else if(part.kind==='tilt')node.rotation.z=amount;
    }
  }
  root.updateMatrixWorld(true);
}

export function validateWindowCoverAttachments(nodes,facilities,fail){
  const windows=new Map(facilities.filter(f=>f.resource.windowSystem).map(f=>[f.id,f]));
  for(const f of facilities.filter(f=>f.resource.mount==='window-cover')){
    const targetId=f.node.attachment?.windowId;
    const target=windows.get(targetId);
    if(f.node.parentId!==targetId||!target)fail('invalid-window-cover-attachment',f.id,'Window cover must be a child of an existing real window');
    if(f.roomId!==target.roomId||f.floorId!==target.floorId)fail('invalid-window-cover-attachment',f.id,'Window cover and target window must share room and floor');
    const local=f.node.transform;
    if(Math.abs(local.position[0])>1e-8||Math.abs(local.position[1])>1e-8||Math.abs(local.position[2]-.13)>1e-8||Math.abs(local.yaw)>1e-8)
      fail('invalid-window-cover-offset',f.id,'Window cover uses the fixed inner-glass offset and follows the window orientation');
  }
}
