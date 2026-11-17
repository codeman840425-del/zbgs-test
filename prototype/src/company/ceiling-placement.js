import * as THREE from 'three';
import {envelopeInWorld,envelopesOverlap,CEILING_HEIGHT} from './ceiling-acoustic-data.js';
// This is a conservative placement envelope check, not arbitrary mesh intersection.
// It uses actual loaded geometry, even for old resources without a mounting descriptor.
export function validateCeilingVisualPlacement(facilities,fail){
  const mounted=[...facilities.values()].filter(f=>f.resource.mount==='ceiling');
  if(!mounted.length)return;
  const boxes=new Map();
  for(const f of facilities.values()){
    const b=new THREE.Box3().setFromObject(f.visual,true);
    // Existing mechanisms only translate Z or rotate around Y. Reserve full
    // radial/linear travel of each part, independently of its current state.
    for(const p of f.resource.movingParts||[]){
      const pivot=p.pivot,lo=p.bounds.min,hi=p.bounds.max;
      let min,max;
      if(p.kind==='slide'){
        min=[pivot[0]+lo[0],pivot[1]+lo[1],pivot[2]+lo[2]+Math.min(...p.translationRange)];
        max=[pivot[0]+hi[0],pivot[1]+hi[1],pivot[2]+hi[2]+Math.max(...p.translationRange)];
      }else{
        const radius=Math.max(...[lo[0],hi[0]].flatMap(x=>[lo[2],hi[2]].map(z=>Math.hypot(x,z))));
        min=[pivot[0]-radius,pivot[1]+lo[1],pivot[2]-radius];max=[pivot[0]+radius,pivot[1]+hi[1],pivot[2]+radius];
      }
      b.union(new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max)).applyMatrix4(f.root.matrixWorld));
    }
    if(!b.isEmpty())boxes.set(f.id,{min:b.min.toArray(),max:b.max.toArray()});
  }
  for(const f of mounted){
    const reserved=envelopeInWorld(f.resource,f.world);
    for(const other of facilities.values())if(other.id!==f.id&&other.floorId===f.floorId){
      const box=boxes.get(other.id);
      if(box&&envelopesOverlap(reserved,box))fail('ceiling-visual-overlap',f.id,`Reserved top volume intersects actual model or motion of ${other.id}`);
    }
  }
}
export function ceilingVisibleForRegion({view,cameraPosition,region,group}){
  if(view.mode!=='room'||view.roomId!==region.id||!cameraPosition||!group)return false;
  const local=group.worldToLocal(new THREE.Vector3(...cameraPosition));
  return local.y>.05&&local.y<CEILING_HEIGHT-.05&&Math.abs(local.x)<region.bounds.width/2-.05&&Math.abs(local.z)<region.bounds.depth/2-.05;
}
