import * as THREE from 'three';
import {hasBaseContact} from './base-contact.js';

const stateSchema = {
  on: {type:'boolean'}, intensity: {type:'number', min:0, max:10}, angle: {type:'number', min:-.35, max:.35},
};
const stateSemantics = {
  on:'desk-lamp-enabled-v1', intensity:'desk-lamp-candela-v1', angle:'desk-lamp-pitch-radians-v1',
};
const aim = {
  pivot:'desk-lamp-head', emitter:'desk-lamp-diffuser', axis:[1,0,0], direction:[0,0,1], stateField:'angle', offset:.003,
};
const diffuser = {
  nodes:[aim.emitter], stateField:'on', onColor:'#fff3de', offColor:'#d5ccc0', emissive:'#fff1d5', onIntensity:1.5,
};
const mount = {origin:'bottom', width:.3, height:.5, depth:.3};
const optics = {kind:'spot', color:'#fff1d5', distance:1.4, angle:.55, penumbra:.65};
const tolerance = .001;

function equal(a,b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k=>Object.hasOwn(a,k) && equal(a[k],b[k]));
}
const vec3 = value => Array.isArray(value) && value.length===3 && value.every(Number.isFinite);

export function validateDeskLampResource(resource,fail,path=resource.id) {
  const lamp = resource.mountRole==='desk-lamp' || resource.productionBranch==='desk-lamp';
  if (!lamp && !resource.light?.aim) return;
  const {position,target,...light} = resource.light || {};
  if (resource.mountRole!=='desk-lamp' || resource.productionBranch!=='desk-lamp' ||
      resource.category!=='dynamic' || resource.asset?.format!=='glb' || resource.mount!=='desk-surface' ||
      resource.footprint?.blocking || resource.usePoints?.length || !equal(resource.mounting,mount) ||
      !equal(resource.stateDefaults,{on:true,intensity:4,angle:0}) || !equal(resource.stateSchema,stateSchema) ||
      !equal(resource.stateSemantics,stateSemantics) || !equal(resource.display,{diffuser}) ||
      !equal(light,{...optics,aim}) || !vec3(position) || !vec3(target))
    fail('invalid-desk-lamp-contract',path,'Expected a desk-mounted lamp with a bounded pitch, dimmer, mapped diffuser and calibrated spotlight');
}

// Ray coordinates are expressed in the fixture frame. Model hierarchies may carry source transforms.
function beam(emitter,fixture) {
  emitter.updateWorldMatrix(true,false);
  const relative = new THREE.Matrix4().copy(fixture.matrixWorld).invert().multiply(emitter.matrixWorld);
  const direction = new THREE.Vector3(0,0,1).transformDirection(relative);
  const position = new THREE.Vector3().setFromMatrixPosition(relative).addScaledVector(direction,aim.offset);
  return {position,target:position.clone().add(direction)};
}

export function validateDeskLampGeometry(scene,resource,fail,path=resource.id) {
  if (resource.mountRole!=='desk-lamp') return;
  const unique = name => {
    const nodes=[];
    scene.traverse(n=>{if(n.name===name || n.userData.name===name) nodes.push(n);});
    if(nodes.length!==1) fail('invalid-desk-lamp-node',path+'.'+name,'Expected exactly one matching node in the actual lamp model');
    return nodes[0];
  };
  const head=unique(aim.pivot), face=unique(aim.emitter);
  if (head===face || !head.getObjectById(face.id) || !face.isMesh || ![face.material].flat().every(m=>m?.emissive && m.visible))
    fail('invalid-desk-lamp-diffuser',path,'The articulated head must carry a visible mesh with an emissive-capable material');
  const {geometry}=face;
  geometry.computeBoundingBox();
  if (geometry.boundingBox.distanceToPoint(new THREE.Vector3())>tolerance)
    fail('invalid-desk-lamp-diffuser',path,'The local emitter origin must lie within the physical diffuser');
  // The centre ray must actually meet a front-facing triangle at the named emission point.
  const ray = new THREE.Ray(new THREE.Vector3(0,0,tolerance),new THREE.Vector3(0,0,-1));
  const points=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],hit=new THREE.Vector3();
  const positions=geometry.attributes.position, indices=geometry.index;
  let covered=false;
  for(let i=0;i<(indices?.count ?? positions.count) && !covered;i+=3) {
    for(let j=0;j<3;j++) points[j].fromBufferAttribute(positions,indices?indices.getX(i+j):i+j);
    covered=Boolean(ray.intersectTriangle(...points,true,hit)) && Math.abs(hit.z)<=tolerance;
  }
  if(!covered) fail('invalid-desk-lamp-diffuser',path,'The actual positive-Z emitting face must cover its emission centre');
  scene.updateWorldMatrix(true,true);
  const neutral=beam(face,scene);
  for (const field of ['position','target']) if (neutral[field].distanceTo(new THREE.Vector3(...resource.light[field]))>tolerance)
    fail('invalid-desk-lamp-calibration',path+'.light.'+field,'The neutral declared light must coincide with the measured diffuser ray');
  if(!hasBaseContact(scene)) fail('invalid-desk-lamp-base',path,'The actual lamp base must have positive-area contact with the desktop');
  const original=head.quaternion.clone();
  try {
    for(const angle of [stateSchema.angle.min,0,stateSchema.angle.max]) {
      head.quaternion.copy(original); head.rotateX(angle);
      scene.updateWorldMatrix(true,true);
      const bounds=new THREE.Box3().setFromObject(scene,true);
      if(bounds.min.x < -mount.width/2-tolerance || bounds.max.x > mount.width/2+tolerance ||
         bounds.min.z < -mount.depth/2-tolerance || bounds.max.z > mount.depth/2+tolerance ||
         bounds.min.y < -tolerance || bounds.max.y > mount.height+tolerance ||
         beam(face,scene).target.y >= beam(face,scene).position.y)
        fail('invalid-desk-lamp-pitch',path,'The articulated head must stay inside its mount and direct its beam down toward the desktop');
    }
  } finally {head.quaternion.copy(original);scene.updateWorldMatrix(true,true);}
}

// Both installation preflight and rendering start with the authored neutral pose.
export function poseDeskLampHead(parts,angle) {
  parts.get(aim.pivot).rotateX(angle);
}

export function poseDeskLamp(parts,fixture,light,angle) {
  poseDeskLampHead(parts,angle);
  const ray=beam(parts.get(aim.emitter),fixture);
  light.position.copy(ray.position);
  light.target.position.copy(ray.target);
}
