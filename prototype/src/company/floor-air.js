import * as THREE from 'three';
import {hasBaseContact} from './base-contact.js';

const indicatorNames = ['air-power-indicator','air-speed-1','air-speed-2','air-speed-3'];
const isColor = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
const matches = (actual, expected) => actual === expected || (
  actual != null && expected != null && typeof actual === 'object' && typeof expected === 'object' &&
  Array.isArray(actual) === Array.isArray(expected) && Object.keys(actual).length === Object.keys(expected).length &&
  Object.keys(expected).every(key => Object.hasOwn(actual,key) && matches(actual[key],expected[key]))
);

export function validateFloorAirResource(resource, fail, path=resource.id) {
  if (resource.mountRole!=='floor-air' && resource.productionBranch!=='fan-and-air-purifier' && resource.visualRotor===undefined) return;
  if (resource.mountRole!=='floor-air' || resource.productionBranch!=='fan-and-air-purifier' ||
      resource.category!=='dynamic' || resource.mount!=='floor-surface' || resource.asset?.format!=='glb' ||
      !matches(resource.mounting,{origin:'bottom',width:.4,height:.8,depth:.4}) ||
      !matches(resource.footprint,{blocking:true,center:[0,0],halfSize:[.2,.2]}) || resource.usePoints?.length ||
      resource.light || resource.surface || resource.supportSurfaces || resource.movingParts ||
      !matches(resource.stateDefaults,{on:true,speed:1}) ||
      !matches(resource.stateSchema,{on:{type:'boolean'},speed:{type:'integer',min:1,max:3}}) ||
      !matches(resource.stateSemantics,{on:'floor-air-enabled-v1',speed:'floor-air-speed-v1'}) ||
      (resource.visualRotor!==undefined && !matches(resource.visualRotor,{node:'air-rotor'})))
    fail('invalid-floor-air-contract',path,'Expected a grounded floor appliance with a power switch and three discrete speed settings');

  if (Object.keys(resource.display || {}).length!==indicatorNames.length)
    fail('invalid-floor-air-display',path+'.display','Expected a power lamp and three independent speed marks');
  indicatorNames.forEach((name,level) => {
    const key=level?'speed'+level:'power', mapping=resource.display[key];
    const binding=level?{stateField:'speed',minimumValue:level,enabledBy:'on'}:{stateField:'on'};
    if (!mapping || !matches(mapping.nodes,[name]) ||
        !isColor(mapping.onColor) || !isColor(mapping.offColor) || !isColor(mapping.emissive) ||
        mapping.emissive.toLowerCase()==='#000000' || mapping.onIntensity!==1 ||
        !matches(mapping,{nodes:[name],...binding,onColor:mapping.onColor,offColor:mapping.offColor,emissive:mapping.emissive,onIntensity:1}))
      fail('invalid-floor-air-display',path+'.display.'+key,'Expected the matching power-gated indicator on the physical control panel');
  });
}

// A visual style can enclose its impeller. An exposed impeller spins on its local Z axis.
export function bindFloorAirRotor(resource, nodes, state) {
  if (!resource.visualRotor) return null;
  const rotor=nodes.get(resource.visualRotor.node), rest=rotor.rotation.z;
  return {apply({clockSeconds}) {
    // One full turn per four seconds at speed one. Reduce time before multiplying so long sessions stay precise.
    rotor.rotation.z=rest+(state.on?(clockSeconds % 4)*Math.PI/2*state.speed:0);
  }};
}

export function validateFloorAirGeometry(scene, resource, fail, path=resource.id) {
  if (resource.mountRole!=='floor-air') return;
  if (!hasBaseContact(scene))
    fail('ungrounded-floor-air',path+'.mounting','The appliance needs physical base triangles touching the floor');
  const nodes=new Map(), meshes=[];
  scene.traverse(node=>{
    const name=node.userData.name || node.name;
    if (indicatorNames.includes(name) || name==='air-rotor') {
      if (nodes.has(name)) fail('duplicate-floor-air-node',path+'.'+name,'Physical controls and the rotor need unique names');
      nodes.set(name,node);
    }
    if (node.isMesh) meshes.push(node);
  });
  const front=new THREE.Vector3(0,0,-1), ray=new THREE.Raycaster();
  for (const name of indicatorNames) {
    const mesh=nodes.get(name);
    if (!mesh?.isMesh || !mesh.material?.emissive || !mesh.material.visible || mesh.material.opacity<=0 ||
        meshes.some(other=>other!==mesh && [other.material].flat().includes(mesh.material)))
      fail('invalid-floor-air-indicator',path+'.'+name,'Each mark needs its own independently lit physical mesh and material');
    const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    ray.set(center.clone().addScaledVector(front,-1),front);
    if (ray.intersectObjects(meshes,false)[0]?.object!==mesh)
      fail('hidden-floor-air-indicator',path+'.'+name,'The indicator must be visible from the appliance front');
    for (let parent=mesh; parent; parent=parent.parent) {
      if (!parent.visible) fail('hidden-floor-air-indicator',path+'.'+name,'The control or its casing was hidden at import');
    }
  }
  const rotor=nodes.get('air-rotor');
  if (Boolean(rotor)!==Boolean(resource.visualRotor) ||
      (rotor && !meshes.some(mesh=>mesh!==rotor && rotor.getObjectById(mesh.id))))
    fail('invalid-floor-air-rotor',path+'.visualRotor','A declared rotor must carry the actual impeller meshes');
}
