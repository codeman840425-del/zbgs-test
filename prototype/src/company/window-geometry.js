import * as THREE from 'three';
import {WINDOW_SYSTEM,WINDOW_MOUNT,validateWindowResource} from './window-data.js';

function unique(root,name,fail,id){
  const found=[];root.traverse(n=>{if(n.name===name)found.push(n);});
  if(found.length!==1)fail('missing-window-part',id,`Expected one window node named ${name}`);
  return found[0];
}
const contains=(parent,node)=>{for(let p=node.parent;p;p=p.parent)if(p===parent)return true;return false;};
const rays=(root,x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,.4),new THREE.Vector3(0,0,-1),0,.6).intersectObject(root,true);

/** Validate the imported closed geometry, not just the adapter metadata. */
export function validateWindowGeometry(root,resource,fail){
  if(!resource.windowSystem&&resource.mount!=='wall-opening')return;
  validateWindowResource(resource,fail);
  const p=resource.windowParts,sash=unique(root,p.sash,fail,resource.id),fixed=unique(root,p.fixedGlass,fail,resource.id),moving=unique(root,p.movingGlass,fail,resource.id);
  if(!contains(sash,moving)||contains(sash,fixed)||!fixed.isMesh||!moving.isMesh)
    fail('invalid-window-hierarchy',resource.id,'Only the moving pane belongs to the sliding sash');
  if(Math.abs(sash.position.x+.36)>.001||Math.abs(sash.position.y)>.001||sash.rotation.toArray().slice(0,3).some(v=>Math.abs(v)>1e-6))
    fail('invalid-window-sash-origin',resource.id,'The sash must start at x=-0.36, y=0 with no rotation');
  for(const pane of [fixed,moving])for(const material of [pane.material].flat()){
    if(!material?.transparent||!(material.opacity>0&&material.opacity<1))
      fail('invalid-window-glass',resource.id,'Both panes must use actual alpha-blended transparent material');
  }
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  if(Math.abs(size.x-WINDOW_MOUNT.width)>.003||Math.abs(size.y-WINDOW_MOUNT.height)>.003||box.min.z<-.001||box.max.z>WINDOW_MOUNT.depth+.001)
    fail('invalid-window-envelope',resource.id,'The actual frame must match the 1.6 x 1.2 x 0.12 installation');
  for(const [x,pane]of [[-.36,moving],[.36,fixed]])for(const y of [-.26,.26])
    if(!rays(pane,x,y).length)fail('missing-window-glazing',resource.id,'Glass must cover both closed sashes');
  for(const x of [-.7,-.5,-.36,-.2,-.02,.02,.2,.36,.5,.7])for(const y of [-.5,-.3,0,.3,.5])
    if(!rays(root,x,y).length)fail('window-closed-gap',resource.id,'Closed glazing and frames must cover the aperture without unframed gaps');
  const movingBounds=new THREE.Box3().setFromObject(sash),fixedPaneBounds=new THREE.Box3().setFromObject(fixed);
  if(movingBounds.min.z<fixedPaneBounds.max.z+.003)
    fail('window-track-intersection',resource.id,'The sliding sash must remain on a separate track in front of the fixed glass');
  const old=sash.position.x;
  try{
    sash.position.x=old+WINDOW_SYSTEM.sashTravel;root.updateMatrixWorld(true);
    for(const x of [-.50,-.36,-.20])for(const y of [-.26,0,.26])
      if(rays(root,x,y).length)fail('window-open-aperture-blocked',resource.id,'The open left sash must leave a real clear aperture');
    const opened=new THREE.Box3().setFromObject(root);
    if(opened.min.x<-.801||opened.max.x>.801||opened.min.y<-.601||opened.max.y>.601||opened.min.z<-.001||opened.max.z>.121)
      fail('window-open-envelope',resource.id,'Sliding must remain within the fixed window envelope');
  }finally{sash.position.x=old;root.updateMatrixWorld(true);}
}

export function applyWindowState(root,resource,state){
  if(!resource.windowSystem)return;
  const sash=root.getObjectByName(resource.windowParts.sash);
  sash.position.x=-.36+WINDOW_SYSTEM.sashTravel*state.openFraction;
  for(const name of [resource.windowParts.fixedGlass,resource.windowParts.movingGlass]){
    const pane=root.getObjectByName(name);pane.castShadow=false;
    for(const material of [pane.material].flat()){material.depthWrite=false;material.side=THREE.DoubleSide;}
  }
  root.updateMatrixWorld(true);
}

/** Conservative actual mesh envelopes prevent furniture intersecting the window. */
export function validateWindowVisualPlacement(facilities,fail){
  const windows=[...facilities.values()].filter(f=>f.resource.windowSystem);
  for(const window of windows){
    const bounds=new THREE.Box3().setFromObject(window.visual);
    for(const other of facilities.values()){
      if(other.id===window.id||other.floorId!==window.floorId||other.resource.windowSystem)continue;
      other.visual.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const box=new THREE.Box3().setFromObject(mesh),intersection=bounds.clone().intersect(box),size=intersection.getSize(new THREE.Vector3());
        if(!intersection.isEmpty()&&size.x>.002&&size.y>.002&&size.z>.002)
          fail('window-obstructed',window.id,`Window geometry intersects ${other.id}`);
      });
    }
  }
}
