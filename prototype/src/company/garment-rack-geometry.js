import {Box3,Raycaster,Triangle,Vector3} from 'three';
import {HANGING_ENVELOPE,HOOK_CROWN_ALLOWANCE} from './garment-rack-data.js';

const MILLIMETRE=.001;
const ray=new Raycaster();
function hit(mesh,origin,direction,distance) {
  ray.set(origin,direction);
  ray.near=0;ray.far=distance;
  return ray.intersectObject(mesh,false)[0]?.distance;
}
function visible(mesh) {
  for(let p=mesh;p;p=p.parent)if(!p.visible)return false;
  return mesh.isMesh && [mesh.material].flat().every(m=>m?.visible && (m.opacity??1)>0);
}
function vertices(mesh) {
  const pos=mesh.geometry.attributes.position;
  return Array.from({length:pos.count},(_,i)=>new Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld));
}
function named(scene,name,fail,path) {
  const matches=[];
  scene.traverse(n=>{if(n.name===name||n.userData.name===name)matches.push(n);});
  const mesh=matches[0];
  if(matches.length!==1||!mesh||!visible(mesh)||!mesh.geometry.attributes.position?.count)
    fail('invalid-garment-mesh',path+'.'+name,'Expected one visible physical mesh with this binding.');
  return mesh;
}
// Squared distance from the rail axis to the triangle projected into its YZ plane.
function boreDistance(a,b,c) {
  const points=[a,b,c],cross=[],distances=[];
  for(let i=0;i<3;i++){
    const u=points[i],v=points[(i+1)%3];
    const y=u.y+.015,z=u.z,dy=v.y-u.y,dz=v.z-z;
    cross.push(y*dz-z*dy);
    const length=dy*dy+dz*dz;
    const t=length?Math.max(0,Math.min(1,-(y*dy+z*dz)/length)):0;
    distances.push((y+t*dy)**2+(z+t*dz)**2);
  }
  if(Math.abs(cross.reduce((x,y)=>x+y,0))>1e-14 &&
      (cross.every(v=>v>=0)||cross.every(v=>v<=0)))return 0;
  return Math.min(...distances);
}

// Check triangles, since a frame can span both occupied slots with all vertices outside either slot.
function checkHangingSpace(meshes,rail,profile,fail,path) {
  const {width,height,depth}=HANGING_ENVELOPE;
  const spaces=profile.slots.map(({id,position:[x,y,z]})=>({id,box:new Box3(
    new Vector3(x-width/2,y-height,z-depth/2),new Vector3(x+width/2,y+HOOK_CROWN_ALLOWANCE,z+depth/2))}));
  const radialSquared=v=>(v.y-profile.centerY)**2+v.z**2;
  const cylinder=(profile.radius+.0006)**2;
  const tri=new Triangle();
  for(const mesh of meshes){
    const p=vertices(mesh),index=mesh.geometry.index,count=index?.count??p.length;
    for(let i=0;i<count;i+=3){
      tri.set(p[index?index.getX(i):i],p[index?index.getX(i+1):i+1],p[index?index.getX(i+2):i+2]);
      if(mesh===rail && radialSquared(tri.a)<=cylinder && radialSquared(tri.b)<=cylinder && radialSquared(tri.c)<=cylinder)continue;
      const conflict=spaces.find(s=>s.box.intersectsTriangle(tri));
      if(conflict)fail('blocked-garment-slot',path+'.'+conflict.id,'A physical rack triangle intrudes into the hanging envelope.');
    }
  }
}
export function validateGarmentGeometry(scene,resource,fail,path=resource.id) {
  const rack=resource.mountRole==='garment-rack-wardrobe';
  if(!rack&&resource.mountRole!=='hanging-garment')return;
  scene.updateMatrixWorld(true);
  const meshes=[];
  scene.traverse(obj=>{if(visible(obj))meshes.push(obj);});
  const limits=resource.mounting, bounds=new Box3(),ground=new Box3(),floor=new Vector3();
  for(const mesh of meshes)for(const v of vertices(mesh)){
    bounds.expandByPoint(v);
    if(Math.abs(v.y)<=MILLIMETRE)ground.expandByPoint(v);
  }
  const lowY=rack?0:-limits.height,highY=rack?limits.height:HOOK_CROWN_ALLOWANCE;
  if(bounds.isEmpty()||bounds.min.y<lowY-MILLIMETRE||bounds.max.y>highY+MILLIMETRE||
      Math.max(-bounds.min.x,bounds.max.x)>limits.width/2+MILLIMETRE||
      Math.max(-bounds.min.z,bounds.max.z)>limits.depth/2+MILLIMETRE)
    fail('invalid-garment-envelope',path,'Visible geometry exceeds the fixed mounting envelope.');
  if(rack){
    const rail=named(scene,'garment-rail',fail,path),{radius,centerY,slots}=resource.garmentRail;
    const left=slots[0].position[0],right=slots[1].position[0];
    for(let i=0;i<=8;i++){
      const x=left+(right-left)*i/8;
      for(const [y,z] of [[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2]]){
        const d=hit(rail,new Vector3(x,centerY+.04*y,.04*z),new Vector3(0,-y,-z),.04);
        if(d===undefined||Math.abs(.04-d-radius)>.0006)
          fail('invalid-garment-rail',path+'.garment-rail','The physical X rail must pass through both hook slots at the declared radius.');
      }
    }
    checkHangingSpace(meshes,rail,resource.garmentRail,fail,path);
    ground.getSize(floor);
    if(ground.isEmpty()||floor.x<.20||floor.z<.10)
      fail('invalid-garment-ground',path,'The rack needs physical ground contacts spanning width and depth.');
    return;
  }
  const hook=named(scene,'hanger-hook',fail,path),hanger=named(scene,'garment-hanger',fail,path),cloth=named(scene,'garment-cloth',fail,path);
  const center=new Vector3(0,-.015,0);
  for(const dir of [new Vector3(0,1,0),new Vector3(0,0,-1),new Vector3(0,0,1)]){
    const d=hit(hook,center,dir,.025);
    if(d===undefined||Math.abs(d-.015)>.0005)
      fail('invalid-garment-hook',path+'.hanger-hook','The hook must rest on the top of the rail and wrap around both sides.');
  }
  for(const mesh of meshes){
    const p=vertices(mesh),index=mesh.geometry.index,count=index?.count??p.length;
    if(p.every(v=>v.y<-.030))continue;
    for(let i=0;i<count;i+=3){
      const a=p[index?index.getX(i):i],b=p[index?index.getX(i+1):i+1],c=p[index?index.getX(i+2):i+2];
      if(boreDistance(a,b,c)<(.015-.00025)**2)
        fail('invalid-garment-hook',path+'.'+mesh.name,'Visible garment geometry crosses the rail bore.');
    }
  }
  const hookBox=new Box3().setFromObject(hook,true),hangerBox=new Box3().setFromObject(hanger,true),clothBox=new Box3().setFromObject(cloth,true);
  if(!hookBox.expandByScalar(MILLIMETRE).intersectsBox(hangerBox)||!hangerBox.expandByScalar(MILLIMETRE).intersectsBox(clothBox)||
      hangerBox.max.z-hangerBox.min.z<.10||clothBox.max.y-clothBox.min.y<.10)
    fail('invalid-garment-hanger',path,'The visible shoulder hanger and garment must meet the hanging assembly.');
}
