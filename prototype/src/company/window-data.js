import {floorPortalSides} from './exterior-entrance-data.js';
// Window installation and state are scene data. A raised sill is not a portal.
export const WINDOW_SYSTEM=Object.freeze({id:'horizontal-window-v1',version:1,apertureWidth:1.44,apertureHeight:1.04,sashTravel:.72,minimumSill:.6});
export const WINDOW_MOUNT=Object.freeze({id:'window-opening-mount-v1',width:1.6,height:1.2,depth:.12,origin:'center'});
const EPS=1e-6;
const canonical=v=>v&&typeof v==='object'?JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]))):JSON.stringify(v);
export function validateWindowResource(r,fail){
  if(r.windowSystem===undefined&&r.windowParts===undefined&&r.mount!=='wall-opening'&&r.mountRole!=='window-opening-and-glass'&&r.productionBranch!=='window-opening-and-glass')return;
  if(r.mount!=='wall-opening'||r.mountRole!=='window-opening-and-glass'||canonical(r.windowSystem)!==canonical(WINDOW_SYSTEM)||canonical(r.mounting)!==canonical(WINDOW_MOUNT)||r.footprint?.blocking||r.movingParts||r.usePoints?.length)
    fail('invalid-window-contract',r.id,'Expected the pinned raised horizontal window installation contract');
  if(canonical(r.stateDefaults)!==canonical({openFraction:0})||r.stateSchema?.openFraction?.type!=='number'||r.stateSchema.openFraction.min!==0||r.stateSchema.openFraction.max!==1||Object.keys(r.stateSchema).length!==1||r.stateSemantics?.openFraction!=='horizontal-window-opening-fraction')
    fail('invalid-window-state',r.id,'Window opening fraction must be bounded from 0 to 1');
  const parts=r.windowParts;
  if(!parts||Object.keys(parts).sort().join(',')!=='fixedGlass,movingGlass,sash'||Object.values(parts).some(v=>typeof v!=='string'||!v)||new Set(Object.values(parts)).size!==3)
    fail('invalid-window-parts',r.id,'Map the movable sash, fixed glass and moving glass to distinct model nodes');
}
const worldPoint=(t,p)=>{const c=Math.cos(t.yaw),s=Math.sin(t.yaw);return[t.position[0]+c*p[0]+s*p[2],t.position[1]+p[1],t.position[2]-s*p[0]+c*p[2]];};
const localPoint=(t,p)=>{const c=Math.cos(t.yaw),s=Math.sin(t.yaw),x=p[0]-t.position[0],z=p[2]-t.position[2];return[c*x-s*z,p[1]-t.position[1],s*x+c*z];};
const edgeOf=yaw=>['north','west','south','east'][((Math.round(yaw/(Math.PI/2))%4)+4)%4];
const edgeShape=(region,edge)=>({axis:['north','south'].includes(edge)?0:2,normal:['north','south'].includes(edge)?2:0,plane:(['north','west'].includes(edge)?-1:1)*(region.bounds[['north','south'].includes(edge)?'depth':'width']/2),span:region.bounds[['north','south'].includes(edge)?'width':'depth']});
const overlaps=(a,b,aw=a.width,bw=b.width,ah=a.height,bh=b.height)=>Math.abs(a.offset-b.offset)<(aw+bw)/2-EPS&&a.bottom<b.bottom+bh-EPS&&a.bottom+ah>b.bottom+EPS;

/** Derive both sides of each physical opening from its one stable facility ID. */
export function deriveWindowOpenings({nodes,worlds,floorIds,facilities},fail){
  const result=new Map(),regions=[...nodes.values()].filter(n=>['room','area'].includes(n.kind));
  for(const f of facilities.filter(f=>f.resource.windowSystem)){
    if(Math.abs(f.node.transform.yaw/(Math.PI/2)-Math.round(f.node.transform.yaw/(Math.PI/2)))>EPS)fail('invalid-window-orientation',f.id,'Windows require a quarter turn along their wall');
    const own=nodes.get(f.node.parentId),edge=edgeOf(f.node.transform.yaw),shape=edgeShape(own,edge),center=[...f.node.transform.position];
    center[shape.normal]=shape.plane;
    const boundary=worldPoint(worlds.get(own.id),center),axis=shape.axis,ends=[-1,1].map(sign=>{const p=[...center];p[axis]+=sign*WINDOW_SYSTEM.apertureWidth/2;return worldPoint(worlds.get(own.id),p);});
    const sides=[];
    for(const region of regions.filter(r=>floorIds.get(r.id)===f.floorId)){
      const frame=worlds.get(region.id),mid=localPoint(frame,boundary),localEnds=ends.map(p=>localPoint(frame,p));
      for(const candidateEdge of ['north','south','west','east']){
        const candidate=edgeShape(region,candidateEdge);
        if(localEnds.some(p=>Math.abs(p[candidate.normal]-candidate.plane)>EPS))continue;
        const offset=mid[candidate.axis],left=offset-WINDOW_SYSTEM.apertureWidth/2,right=offset+WINDOW_SYSTEM.apertureWidth/2;
        if(right<=-candidate.span/2+EPS||left>=candidate.span/2-EPS)continue;
        if(Math.abs(offset)+WINDOW_MOUNT.width/2>candidate.span/2-.001)
          fail('window-crosses-region-seam',f.id,'The complete window must fit both sides of a shared wall');
        const bottom=mid[1]-WINDOW_SYSTEM.apertureHeight/2;
        if(bottom<WINDOW_SYSTEM.minimumSill-EPS||bottom+WINDOW_SYSTEM.apertureHeight>2.8-.05+EPS)
          fail('invalid-window-sill',f.id,'Keep the fixed aperture above the raised sill and below the wall head');
        const side={id:f.id,regionId:region.id,edge:candidateEdge,offset,bottom,width:WINDOW_SYSTEM.apertureWidth,height:WINDOW_SYSTEM.apertureHeight};
        const floor=nodes.get(f.floorId),portals=floorPortalSides(floor).filter(p=>p.regionId===region.id&&p.edge===candidateEdge);
        if(portals.some(p=>Math.abs(p.offset-offset)<(p.width+WINDOW_MOUNT.width)/2-EPS))
          fail('window-over-portal',f.id,'A window cannot replace an existing door or connection');
        sides.push(side);
      }
    }
    if(!sides.some(s=>s.regionId===own.id&&s.edge===edge)||sides.length>2)
      fail('invalid-window-boundary',f.id,'A window must have one exterior wall side or two matching room sides');
    for(const other of result.values())for(const a of sides)for(const b of other.regions)
      if(a.regionId===b.regionId&&a.edge===b.edge&&overlaps({...a,bottom:a.bottom-.08},{...b,bottom:b.bottom-.08},1.6,1.6,1.2,1.2))
        fail('overlapping-windows',f.id,`Window frame overlaps ${other.id}`);
    result.set(f.id,{id:f.id,floorId:f.floorId,regions:sides,openFraction:f.state.openFraction,boundary,groundPassable:false});
  }
  for(const opening of result.values())for(const side of opening.regions){
    for(const f of facilities.filter(f=>f.node.parentId===side.regionId&&f.resource.mount==='wall')){
      if(edgeOf(f.node.transform.yaw)!==side.edge)continue;
      const m=f.resource.mounting,position=f.node.transform.position,axis=['north','south'].includes(side.edge)?0:2;
      const panel={offset:position[axis],bottom:m.origin==='center'?position[1]-m.height/2:position[1],width:m.width,height:m.height};
      if(overlaps(side,panel))fail('wall-display-over-window',f.id,`Wall-mounted object covers the window opening ${opening.id}`);
    }
  }
  return result;
}
