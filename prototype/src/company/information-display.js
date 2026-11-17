// Fixed content slots reuse ordinary versioned GLB child facilities and saves.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const noFunction=(r,floor=false)=>(floor||!r.footprint?.blocking)&&!r.usePoints?.length&&!r.light&&!r.display&&!r.clockDisplay&&!r.movingParts&&!r.supportSurfaces;
export function validateInformationResource(r,fail,path=r.id) {
  if(r.informationSurface===undefined&&r.informationContent===undefined) {
    if(r.informationNodes!==undefined||r.mount==='information-surface')fail('invalid-information-contract',path,'Information mappings and mount require a fixed contract');
    return;
  }
  const board=r.informationSurface!==undefined, floor=board&&r.mountRole==='information-board-floor', spec=board?r.informationSurface:r.informationContent;
  if((board&&r.informationContent!==undefined)||!r.asset||!noFunction(r,floor)||
      !exact(spec,board?['schema','width','height','position']:['schema','width','height','pixels'])||
      spec.schema!=='information-face-v1'||spec.width!==.88||spec.height!==.56||
      !equal(board?spec.position:spec.pixels,board?[0,floor?1.3:0,.031]:[1100,700])||
      r.mount!==(board?(floor?'floor-surface':'wall'):'information-surface')||r.mountRole!==(board?(floor?'information-board-floor':'information-board'):'information-content')||
      !exact(r.mounting,['origin','width','height','depth'])||r.mounting.origin!==(floor?'bottom':'center')||
      r.mounting.width!==(board?1:.88)||r.mounting.height!==(board?(floor?1.7:.7):.56)||r.mounting.depth!==(board?(floor?.6:.05):.001)||
      !exact(r.informationNodes,board?(floor?['back','base','post']:['back']):['face'])||
      r.informationNodes[board?'back':'face']!==(board?'information-back':'information-face'))
    fail('invalid-information-contract',path,'Expected a fixed wall/floor board or independent content face contract');
  if(floor&&(!exact(r.footprint,['center','halfSize','blocking'])||!equal(r.footprint.center,[0,0])||
      !equal(r.footprint.halfSize,[.5,.3])||r.footprint.blocking!==true||
      r.informationNodes.base!=='information-base'||r.informationNodes.post!=='information-post'))
    fail('invalid-information-contract',path,'Floor board requires its fixed blocking footprint and solid stand mappings');
  if(board) {
    if(!exact(r.stateDefaults,[])||r.stateSchema!==undefined||r.stateSemantics!==undefined)
      fail('invalid-information-contract',path,'Board frame has no independent display state');
  } else if(!exact(r.stateDefaults,['visible'])||r.stateDefaults.visible!==true||
      !exact(r.stateSchema,['visible'])||!exact(r.stateSchema.visible,['type'])||r.stateSchema.visible.type!=='boolean'||
      !exact(r.stateSemantics,['visible'])||r.stateSemantics.visible!=='information-content-visible')
    fail('invalid-information-contract',path,'Content visible must be a declared boolean');
}
export function validateInformationAttachments(nodes,resources,fail) {
  const occupied=new Set();
  for(const n of nodes.values()) {
    const r=resources.get(`${n.resource?.id}@${n.resource?.version}`);
    if(!r?.informationContent)continue;
    const parent=nodes.get(n.parentId),pr=resources.get(`${parent?.resource?.id}@${parent?.resource?.version}`);
    if(parent?.kind!=='facility'||!pr?.informationSurface)
      fail('missing-information-surface',n.id,'Content must belong to a board with a compatible content slot');
    if(n.transform.yaw!==0||n.transform.position.some((v,i)=>Math.abs(v-pr.informationSurface.position[i])>1e-8)||
        r.informationContent.width!==pr.informationSurface.width||r.informationContent.height!==pr.informationSurface.height||
        r.informationContent.schema!==pr.informationSurface.schema)
      fail('invalid-information-fit',n.id,'Content must exactly occupy its parent slot, without local rotation or offset');
    if(occupied.has(parent.id))fail('occupied-information-surface',n.id,'A board has at most one content instance');
    occupied.add(parent.id);
  }
}
export function applyInformationDisplay(resource,nodes,state) {
  if(!resource.informationContent)return;
  const face=nodes.get(resource.informationNodes.face);
  if(!face?.isMesh)throw Object.assign(Error('Missing actual information face'),{code:'missing-information-face',path:resource.id});
  face.visible=state.visible;
}
