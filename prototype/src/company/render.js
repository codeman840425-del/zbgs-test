import * as THREE from 'three';
import defaultCatalog from './facility-catalog.json' with {type:'json'};
import defaultTemplates from './templates.json' with {type:'json'};
import {CompanyError,deriveCompany,prepareCompanyChange,serializeCompany,restoreCompany} from './document.js';

const geometryTypes={BoxGeometry:THREE.BoxGeometry,CylinderGeometry:THREE.CylinderGeometry,PlaneGeometry:THREE.PlaneGeometry,CapsuleGeometry:THREE.CapsuleGeometry,SphereGeometry:THREE.SphereGeometry};
const clone=value=>structuredClone(value);
function disposeTree(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of object.material?[object.material].flat():[]) {
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
    if(object.isLight)object.dispose?.();
  });
  for(const texture of textures)texture.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
  root.removeFromParent();
}
function buildResource(definition,nodes,state) {
  let object,geometry,material;
  try {
  if(definition.type==='group') {
    object=new THREE.Group();for(const child of definition.children)object.add(buildResource(child,nodes,state));
  } else {
    const Geometry=geometryTypes[definition.geometry?.type];
    if(!Geometry)throw new CompanyError('unsupported-geometry',definition.id,String(definition.geometry?.type));
    geometry=new Geometry(...definition.geometry.parameters);
    material=new THREE.MeshStandardMaterial({color:definition.material.color,roughness:definition.material.roughness??.85});
    if(definition.screen) {
      material.color.set(state.on?'#b5ddd1':'#142422');material.emissive.set(state.on?'#539e91':'#000000');material.emissiveIntensity=state.on ? 0.35 : 0;
    }
    object=new THREE.Mesh(geometry,material);
    object.castShadow=definition.castShadow;object.receiveShadow=definition.receiveShadow;
  }
  object.name=definition.id;object.position.fromArray(definition.position);object.rotation.set(...definition.rotation);object.scale.fromArray(definition.scale);
  nodes.set(definition.id,object);return object;
  } catch(error) {
    // A recursive branch may not yet be attached to the outer scene. Its owner
    // must release it here, including failures before a Mesh was constructed.
    if(object)disposeTree(object);else {geometry?.dispose();material?.dispose();}
    throw error;
  }
}
function structureMesh(width,height,depth,color) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshStandardMaterial({color,roughness:.9}));
  mesh.receiveShadow=true;return mesh;
}

// Presentation/provider only: no actor creation, movement, task or lease implementation.
export function createCompanyScene(world,initialDocument,{catalog=defaultCatalog,templates=defaultTemplates,visibleFloorId,maxRealtimeLights=2}={}) {
  if(!world?.isObject3D)throw new TypeError('Company scene requires a Three world');
  let current,disposed=false,generation=0;
  const prepared=new Map();
  function build(document,floorId) {
    const derived=deriveCompany(document,catalog,templates);
    floorId ||= document.nodes.find(n=>n.kind==='floor').id;
    if(derived.nodes.get(floorId)?.kind!=='floor')throw new CompanyError('unknown-floor',floorId,'Choose an existing floor');
    const root=new THREE.Group();root.name=`Company:${document.id}`;
    const groups=new Map(),facilities=new Map(),points=new Map(),floors=[],walls=[],lights=[];
    function group(id) {
      if(id===document.id)return root;
      if(groups.has(id))return groups.get(id);
      const node=derived.nodes.get(id),object=new THREE.Group();object.name=id;
      object.position.fromArray(node.transform.position);object.rotation.y=node.transform.yaw;
      groups.set(id,object);group(node.parentId).add(object);return object;
    }
    try {
      for(const node of document.nodes)if(derived.floorIds.get(node.id)===floorId) {
        const parent=group(node.id);
        if(['room','area'].includes(node.kind)) {
          const {width,depth}=node.bounds;
          const floor=structureMesh(width,.12,depth,node.kind==='area'?'#c6c7bc':'#d7d5c7');floor.position.y=-.06;floor.name=`Floor:${node.id}`;parent.add(floor);floors.push(floor);
          // C1 cutaway: the two open sides are viewing boundaries. The role provider
          // retains the room's physical movement bounds independently of rendering.
          if(node.kind==='room') {
            const back=structureMesh(width,2.8,.12,'#cbd4c6');back.position.set(0,1.4,-depth/2);back.name=`BackWall:${node.id}`;
            const left=structureMesh(.12,2.8,depth,'#c4d1c1');left.position.set(-width/2,1.4,0);left.name=`LeftWall:${node.id}`;
            parent.add(back,left);walls.push(back,left);
          }
        }
      }
      for(const entry of derived.facilities.filter(f=>f.floorId===floorId)) {
        const root=group(entry.id),parts=new Map();root.add(buildResource(entry.resource.node,parts,entry.state));
        const facility={...entry,root,parts};facilities.set(entry.id,facility);
        if(entry.resource.light) {
          const def=entry.resource.light;
          const light=new THREE.SpotLight(def.color,entry.state.on?entry.state.intensity:0,def.distance,def.angle,def.penumbra,2);
          light.position.fromArray(def.position);light.target.position.fromArray(def.target);light.castShadow=false;
          root.add(light,light.target);lights.push({id:entry.id,light,desired:entry.state.on?entry.state.intensity:0});
        }
      }
      root.updateMatrixWorld(true);
      for(const point of derived.usePoints.filter(p=>p.floorId===floorId)) {
        const facility=facilities.get(point.facilityId),chairSeat=facility.parts.get(point.seatNodeId),chairBack=facility.parts.get(point.backNodeId);
        if(!chairSeat?.isMesh || !chairBack?.isMesh)throw new CompanyError('missing-contact-mesh',point.id,'Seat and back must resolve to actual resource meshes');
        points.set(point.id,{...point,chair:facility.root,chairSeat,chairBack,footprint:facility.resource.footprint});
      }
      lights.sort((a,b)=>a.id.localeCompare(b.id));
      for(let i=0;i<lights.length;i++)lights[i].light.intensity=i<maxRealtimeLights?lights[i].desired:0;
      return {root,document:clone(document),derived,floorId,groups,facilities,points,floors,walls,lights};
    } catch(error) {disposeTree(root);throw error;}
  }
  function install(candidate) {
    // Keep unchanged seat Object3Ds alive so an occupied actor's existing contact
    // references survive a screen/light edit elsewhere in the scene.
    if(current)for(const [id,nextFacility]of candidate.facilities) {
      const oldFacility=current.facilities.get(id);
      const effectiveNode=facility=>({...facility.node,state:facility.state});
      if(!nextFacility.resource.usePoints?.length||!oldFacility||JSON.stringify(effectiveNode(oldFacility))!==JSON.stringify(effectiveNode(nextFacility)))continue;
      const placeholder=nextFacility.root,oldRoot=oldFacility.root,parent=placeholder.parent;
      oldRoot.removeFromParent();oldRoot.position.copy(placeholder.position);oldRoot.quaternion.copy(placeholder.quaternion);
      disposeTree(placeholder);parent.add(oldRoot);
      nextFacility.root=oldRoot;nextFacility.parts=oldFacility.parts;candidate.groups.set(id,oldRoot);
      for(const point of candidate.points.values())if(point.facilityId===id) {
        point.chair=oldRoot;point.chairSeat=oldFacility.parts.get(point.seatNodeId);point.chairBack=oldFacility.parts.get(point.backNodeId);
      }
    }
    world.add(candidate.root);candidate.root.updateMatrixWorld(true);
    if(current)disposeTree(current.root);current=candidate;generation++;
  }
  install(build(initialDocument,visibleFloorId));
  function live(){if(disposed)throw new CompanyError('scene-disposed','company','Scene has been disposed');}
  function navigation() {
    const obstacles=current.derived.obstacles.filter(o=>o.floorId===current.floorId).map(o=>{
      const facility=current.facilities.get(o.id),padding=facility.resource.usePoints?.length ? 0.1 : 0.22;
      return {name:o.id,instanceId:o.id,kind:facility.resource.usePoints?.length?'seat':'facility',x:(o.min[0]+o.max[0])/2,z:(o.min[1]+o.max[1])/2,
        hw:(o.max[0]-o.min[0])/2+padding,hd:(o.max[1]-o.min[1])/2+padding,object:facility.root,footprint:clone(o.footprint)};
    });
    const rooms=current.document.nodes.filter(n=>['room','area'].includes(n.kind)&&current.derived.floorIds.get(n.id)===current.floorId);
    return {floorId:current.floorId,floors:current.floors,obstacles,regions:rooms.map(room=>({id:room.id,transform:clone(current.derived.worlds.get(room.id)),bounds:clone(room.bounds),inset:.45}))};
  }
  return {
    get root(){return current.root;},get floor(){return current.floors[0];},get walls(){return [...current.walls];},
    get document(){return clone(current.document);},get revision(){return current.document.revision;},
    resolveUsePoint(id){live();return current.points.get(id)||null;},
    listUsePoints(){live();return [...current.points.values()];},
    navigation,
    snapshot(){return {document:clone(current.document),visibleFloorId:current.floorId,points:[...current.points.values()].map(p=>({id:p.id,facilityId:p.facilityId,position:p.chair.getWorldPosition(new THREE.Vector3()).toArray(),yaw:p.world.yaw})),lights:current.lights.map(l=>({id:l.id,intensity:l.light.intensity,castsShadow:l.light.castShadow})),navigation:navigation().obstacles.map(({object,...o})=>o)};},
    prepareChange(operations,guards={}) {
      live();const result=prepareCompanyChange(current.document,operations,{catalog,templates,...guards});
      const candidate=build(result.document,current.floorId);candidate.operations=clone(operations);candidate.previousRevision=current.document.revision;candidate.generation=generation;
      const handle=Object.freeze({get document(){return clone(candidate.document);},previousRevision:candidate.previousRevision});prepared.set(handle,candidate);return handle;
    },
    commit(handle,guards={}) {
      live();const candidate=prepared.get(handle);if(!candidate)throw new CompanyError('unknown-candidate','company','Only locally prepared candidates can commit');
      if(candidate.generation!==generation)throw new CompanyError('revision-conflict','company','Scene was committed or restored after this candidate was prepared');
      // Recheck authoritative leases/revision just before synchronously publishing.
      prepareCompanyChange(current.document,candidate.operations,{catalog,templates,...guards,expectedRevision:candidate.previousRevision});
      prepared.delete(handle);install(candidate);return this.snapshot();
    },
    discard(handle){const candidate=prepared.get(handle);if(candidate){prepared.delete(handle);disposeTree(candidate.root);}},
    save(){live();return serializeCompany(current.document,catalog,templates);},
    restore(text,{isUsePointBusy=()=>false}={}) {
      live();for(const point of current.points.values())if(isUsePointBusy(point.id))throw new CompanyError('facility-busy',point.id,'Leave occupied facilities before replacing the full company document');
      const next=restoreCompany(text,catalog,templates);install(build(next,current.floorId));return this.snapshot();
    },
    dispose(){if(disposed)return;disposed=true;for(const candidate of prepared.values())disposeTree(candidate.root);prepared.clear();disposeTree(current.root);},
  };
}
