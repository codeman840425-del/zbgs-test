// State-driven facility transforms only. Host owns time, actors and tasks.
import {MAKEUP_STORAGE_PROFILE,validateMakeupStorageResource} from './makeup-storage-data.js';
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

export function validateFacilityState(resource, patch, fail, path) {
  if (!object(patch)) fail('invalid-device-state', path, 'State must be an object');
  const defaults=resource.stateDefaults || {}, schema=resource.stateSchema;
  if(schema !== undefined) {
    if(!object(schema)||Object.keys(schema).length!==Object.keys(defaults).length||Object.keys(defaults).some(k=>!Object.hasOwn(schema,k)))
      fail('invalid-state-schema',path,'State schema must define every default field exactly once');
    for(const [field,spec]of Object.entries(schema)) {
      if(!object(spec)||(!((spec.type==='boolean'&&Object.keys(spec).length===1&&typeof defaults[field]==='boolean')||
        (spec.type==='number'&&Object.keys(spec).every(k=>['type','min','max'].includes(k))&&Number.isFinite(spec.min)&&Number.isFinite(spec.max)&&spec.min<=spec.max&&
          Number.isFinite(defaults[field])&&defaults[field]>=spec.min&&defaults[field]<=spec.max))))
        fail('invalid-state-schema',`${path}.${field}`,'Schema requires a boolean or finite bounded number and a valid default');
    }
  }
  for(const [field,value]of Object.entries(patch)) {
    const expected=defaults[field],spec=schema?.[field];
    if(expected===undefined||typeof value!==typeof expected||
        (typeof value==='number'&&(!Number.isFinite(value)||value<(spec?.min??0)||value>(spec?.max??100))))
      fail('invalid-device-state',`${path}.${field}`,'Value must match the declared field type and range');
  }
}

export function validateMovingResource(resource, fail, path=resource.id) {
  validateMakeupStorageResource(resource,fail,path);
  if(resource.stateSchema!==undefined)validateFacilityState(resource,{},fail,path);
  if(resource.movingParts===undefined) {
    if(resource.partNodes!==undefined||resource.partPanels!==undefined||resource.partTrays!==undefined)
      fail('invalid-moving-parts',path,'Moving mesh mappings require a functional movingParts contract');
    return;
  }
  const parts=resource.movingParts;
  const supported=resource.movingProfile===MAKEUP_STORAGE_PROFILE;
  if(!Array.isArray(parts)||parts.length!==1||(!supported&&!resource.footprint?.blocking)||!vector(resource.footprint?.center,2)||
      !vector(resource.footprint?.halfSize,2)||resource.footprint.halfSize.some(n=>n<=0)||(resource.mount&&!supported)||
      !object(resource.partNodes)||!object(resource.partPanels))
    fail('invalid-moving-parts',path,'This contract supports grounded blocking furniture with explicit parts and mesh mappings');
  const ids=new Set();
  for(const p of parts) {
    if(!object(p)||Object.keys(p).some(k=>!['id','stateField','kind','axis','pivot','rotationRange','translationRange','bounds'].includes(k))||
        typeof p.id!=='string'||!idPattern.test(p.id)||ids.has(p.id)||!['hinge','slide'].includes(p.kind)||!vector(p.pivot,3)||
        !object(p.bounds)||Object.keys(p.bounds).some(k=>!['min','max'].includes(k))||!vector(p.bounds.min,3)||!vector(p.bounds.max,3)||
        p.bounds.min.some((n,i)=>n>=p.bounds.max[i])||resource.stateSchema?.[p.stateField]?.type!=='number'||
        resource.stateSchema[p.stateField].min!==0||resource.stateSchema[p.stateField].max!==1)
      fail('invalid-moving-parts',path,'Moving part requires a unique ID, supported mechanism, envelope and 0..1 state field');
    if(p.kind==='hinge') {
      if(p.axis!=='y'||!vector(p.rotationRange,2)||p.rotationRange[0]!==0||p.rotationRange[1]!==-Math.PI/2||p.translationRange!==undefined||
          resource.partTrays!==undefined||resource.stateSemantics?.[p.stateField]!=='hinged-door-opening-fraction')
        fail('invalid-moving-parts',path,'Hinge requires the fixed negative quarter-turn contract');
    } else {
      const tray=resource.partTrays?.[p.id];
      if(p.axis!=='z'||!vector(p.translationRange,2)||p.translationRange[0]!==0||p.translationRange[1]!== (supported ? .09 : .32)||p.rotationRange!==undefined||
          resource.stateSemantics?.[p.stateField]!=='sliding-drawer-opening-fraction'||!object(resource.partTrays)||
          Object.keys(resource.partTrays).length!==1||!object(tray)||Object.keys(tray).sort().join(',')!=='back,bottom,left,right'||
          Object.values(tray).some(n=>typeof n!=='string'||!n)||new Set(Object.values(tray)).size!==4)
        fail('invalid-moving-parts',path,'Slide requires the fixed +Z travel and four actual tray component mappings');
    }
    ids.add(p.id);
  }
  for(const field of ['partNodes','partPanels']) {
    const mapping=resource[field],names=Object.values(mapping);
    if(Object.keys(mapping).length!==ids.size||Object.keys(mapping).some(id=>!ids.has(id))||names.some(n=>typeof n!=='string'||!n)||new Set(names).size!==ids.size)
      fail('invalid-moving-parts',`${path}.${field}`,'Map each part to a distinct named pivot or panel');
  }
}

export function partAngle(part,state) {
  return part.rotationRange[0]+(part.rotationRange[1]-part.rotationRange[0])*state[part.stateField];
}

export function partOffset(part,state) {
  return part.translationRange[0]+(part.translationRange[1]-part.translationRange[0])*state[part.stateField];
}

// Union of body and moving projection. Range includes analytic extrema; not
// a few pose samples. The conservative rectangle is also the navigation input.
export function movingFootprint(resource,state,endState=null) {
  const fp=resource.footprint;
  if(!resource.movingParts?.length||resource.movingProfile===MAKEUP_STORAGE_PROFILE)return fp;
  const min=fp.center.map((n,i)=>n-fp.halfSize[i]),max=fp.center.map((n,i)=>n+fp.halfSize[i]);
  for(const p of resource.movingParts) {
    if(p.kind==='slide') {
      const a=partOffset(p,state),b=endState?partOffset(p,endState):a;
      min[0]=Math.min(min[0],p.pivot[0]+p.bounds.min[0]);max[0]=Math.max(max[0],p.pivot[0]+p.bounds.max[0]);
      min[1]=Math.min(min[1],p.pivot[2]+p.bounds.min[2]+Math.min(a,b));max[1]=Math.max(max[1],p.pivot[2]+p.bounds.max[2]+Math.max(a,b));
      continue;
    }
    const a=partAngle(p,state),b=endState?partAngle(p,endState):a,lo=Math.min(a,b),hi=Math.max(a,b);
    for(const x of [p.bounds.min[0],p.bounds.max[0]])for(const z of [p.bounds.min[2],p.bounds.max[2]]) {
      const angles=[lo,hi];
      for(const basis of [Math.atan2(z,x),Math.atan2(-x,z)])for(let k=-2;k<=2;k++) {
        const t=basis+k*Math.PI;if(t>lo&&t<hi)angles.push(t);
      }
      for(const t of angles) {
        const point=[p.pivot[0]+Math.cos(t)*x+Math.sin(t)*z,p.pivot[2]-Math.sin(t)*x+Math.cos(t)*z];
        for(let i=0;i<2;i++){min[i]=Math.min(min[i],point[i]);max[i]=Math.max(max[i],point[i]);}
      }
    }
  }
  return{blocking:true,center:min.map((n,i)=>(n+max[i])/2),halfSize:min.map((n,i)=>(max[i]-n)/2)};
}
