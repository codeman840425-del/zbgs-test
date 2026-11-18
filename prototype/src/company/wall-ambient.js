import * as THREE from 'three';

export const WALL_AMBIENT_ROLE = 'ambient-led-and-neon';
const faceName = 'ambient-diffuser';
const optics = {kind:'spot',color:'#e19447',distance:1.6,angle:.60,penumbra:.60};
const direction = [0,-.56,.66];
const mount = {origin:'center',width:.62,height:.35,depth:.04};
const schema = {on:{type:'boolean'},intensity:{type:'number',min:0,max:8},colorHue:{type:'number',min:0,max:359}};
const semantics = {on:'wall-ambient-enabled-v1',intensity:'wall-ambient-candela-v1',colorHue:'wall-ambient-color-hue-degrees-v1'};
const diffuser = {nodes:[faceName],stateField:'on',offColor:'#e2e0da',onIntensity:1.5};
const tolerance = .001;

function equal(a,b) {
  if(a===b) return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b)) return false;
  return Object.keys(a).length===Object.keys(b).length && Object.keys(b).every(k=>Object.hasOwn(a,k)&&equal(a[k],b[k]));
}

export function validateWallAmbientResource(resource,fail,path=resource.id) {
  if(resource.mountRole!==WALL_AMBIENT_ROLE && resource.productionBranch!==WALL_AMBIENT_ROLE) return;
  if(resource.mountRole!==WALL_AMBIENT_ROLE || resource.productionBranch!==WALL_AMBIENT_ROLE ||
      resource.category!=='dynamic' || resource.mount!=='wall' || resource.parent!=='room.wall' ||
      resource.asset?.format!=='glb' || !equal(resource.mounting,mount) || resource.footprint?.blocking ||
      (resource.usePoints!==undefined&&!equal(resource.usePoints,[])) ||
      !equal(resource.coordinates,{units:'metres',up:'+Y',forward:'+Z'}) || !equal(resource.display,{diffuser}) ||
      !equal(resource.stateDefaults,{on:true,intensity:4,colorHue:30}) ||
      !equal(resource.stateSchema,schema) || !equal(resource.stateSemantics,semantics))
    fail('invalid-wall-ambient-contract',path,'Expected a wall-mounted RGB diffuser with bounded hue, power and intensity');
  const {position,target,...fixed}=resource.light||{};
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(!equal(fixed,optics)||!vector(position)||!vector(target)||
      Math.abs(position[0])>mount.width/2 || Math.abs(position[1])>mount.height/2 ||
      Math.abs(position[2]-mount.depth)>1e-6 ||
      direction.some((d,i)=>Math.abs(target[i]-position[i]-d)>1e-6))
    fail('invalid-wall-ambient-optics',path+'.light','Expected the calibrated outward and downward wall spotlight');
}

export function validateWallAmbientGeometry(scene,resource,fail,path=resource.id) {
  if(resource.mountRole!==WALL_AMBIENT_ROLE) return;
  scene.updateMatrixWorld(true);
  const matches=[], visible=[];
  scene.traverse(node=>{
    if(node.isLight) fail('invalid-wall-ambient-embedded-light',path,'The fixture GLB must leave light allocation to the room budget');
    if((node.userData.name||node.name)===faceName) matches.push(node);
  });
  scene.traverseVisible(node=>{if(node.isMesh)visible.push(node);});
  const face=matches[0], location=path+'.'+faceName;
  if(matches.length!==1 || !visible.includes(face) || !face.material?.isMeshStandardMaterial ||
      !face.material.visible || face.material.opacity<=0 || face.geometry.attributes.position.count<3)
    fail('invalid-wall-ambient-diffuser',location,'Expected one visible PBR diffuser mesh');
  const bodies=visible.filter(mesh=>mesh!==face && [mesh.material].flat().some(m=>m?.visible&&m.opacity>0));
  if(bodies.some(mesh=>[mesh.material].flat().some(m=>m===face.material || (m.emissive?.getHex() && m.emissiveIntensity>0))))
    fail('invalid-wall-ambient-diffuser',location,'The diffuser must be the only emitting surface and have an independent material');
  const bounds=new THREE.Box3().setFromObject(scene,true);
  if(bounds.min.x < -mount.width/2-tolerance || bounds.max.x > mount.width/2+tolerance ||
      bounds.min.y < -mount.height/2-tolerance || bounds.max.y > mount.height/2+tolerance ||
      bounds.min.z < -tolerance || bounds.max.z > mount.depth+tolerance)
    fail('invalid-wall-ambient-envelope',path,'The real fixture extends outside its wall mounting envelope');
  // Only positive-area housing triangles on the wall count as a backplate.
  let area=0;
  const [a,b,c]=Array.from({length:3},()=>new THREE.Vector3());
  for(const mesh of bodies) {
    const pos=mesh.geometry.attributes.position, idx=mesh.geometry.index;
    for(let i=0;i<(idx?.count??pos.count);i+=3) {
      [a,b,c].forEach((p,j)=>p.fromBufferAttribute(pos,idx?idx.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
      if(Math.max(Math.abs(a.z),Math.abs(b.z),Math.abs(c.z))<=tolerance)
        area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
    }
  }
  if(area<1e-5) fail('invalid-wall-ambient-backing',path,'The real housing must have a rear bearing surface on the wall');
  const source=new THREE.Vector3(...resource.light.position);
  const ray=new THREE.Raycaster(source.clone().add(new THREE.Vector3(0,0,.01)),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObjects([face,...bodies],false)[0];
  if(hit?.object!==face || !hit.face ||
      hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(face.matrixWorld)).z<=0 ||
      hit.point.z>source.z+tolerance || source.z-hit.point.z>.005+tolerance)
    fail('invalid-wall-ambient-calibration',location,'The light origin must project onto an exposed front triangle of the actual diffuser');
}

export function applyWallAmbientLight(parts,resource,state,light) {
  const material=parts.get(faceName).material;
  const display=resource.display.diffuser;
  const emitting=state.on&&state.intensity>0;
  light.color.setHSL(state.colorHue/360,.72,.58,THREE.SRGBColorSpace);
  if(emitting) {
    material.color.copy(light.color);
    material.emissive.copy(light.color);
  } else {
    material.color.set(display.offColor);
    material.emissive.set(0);
  }
  material.emissiveIntensity=emitting?display.onIntensity*state.intensity/resource.stateSchema.intensity.max:0;
}
