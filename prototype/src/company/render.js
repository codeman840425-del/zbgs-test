import * as THREE from 'three';
import defaultCatalog from './facility-catalog.json' with {type:'json'};
import defaultTemplates from './templates.json' with {type:'json'};
import {CompanyError,deriveCompany,prepareCompanyChange,serializeCompany,restoreCompany} from './document.js';
import {describeArchitecture} from './architecture.js';

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
export function createCompanyScene(world,initialDocument,{catalog=defaultCatalog,templates=defaultTemplates,visibleFloorId,maxRealtimeLights=2,assetLibrary}={}) {
  if(!world?.isObject3D)throw new TypeError('Company scene requires a Three world');
  let current,disposed=false,generation=0;
  const prepared=new Map();
  function build(document,floorId,view={mode:'floor',roomId:null}) {
    const derived=deriveCompany(document,catalog,templates);
    const architecture=describeArchitecture(document,catalog,templates);
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
      if(view.mode==='building') {
        document.nodes.filter(n=>n.kind==='floor').forEach((floor,index)=>{
          const layer=new THREE.Group();layer.name=`Overview:${floor.id}`;layer.position.y=index*4;root.add(layer);
          for(const region of document.nodes.filter(n=>['room','area'].includes(n.kind)&&derived.floorIds.get(n.id)===floor.id)) {
            const colors={streaming:'#bfd5c2',work:'#c5ccd8',rest:'#e0c6a8',training:'#d2c4d7'};
            const frame=derived.worlds.get(region.id),slab=structureMesh(region.bounds.width,.25,region.bounds.depth,region.kind==='area'?'#a8b8ac':colors[region.purpose]);
            slab.position.fromArray(frame.position);slab.rotation.y=frame.yaw;slab.userData={floorId:floor.id,roomId:region.id};layer.add(slab);
            const stations=document.nodes.filter(n=>n.kind==='workstation'&&n.parentId===region.id);
            for(const station of stations) {
              const screen=derived.facilities.find(f=>f.node.stationId===station.id&&f.resource.id==='monitor');
              const marker=structureMesh(1.4,.35,.7,screen?.state.on?'#416c57':'#747b79');marker.position.fromArray(derived.worlds.get(station.id).position);marker.position.y+=.3;layer.add(marker);
            }
          }
        });
        root.updateMatrixWorld(true);
        return {root,document:clone(document),derived,architecture,floorId,view,groups,facilities,points,floors,walls,lights};
      }
      for(const node of document.nodes)if(derived.floorIds.get(node.id)===floorId) {
        const parent=group(node.id);
        if(['room','area'].includes(node.kind)) {
          const {width,depth}=node.bounds;
          const floor=structureMesh(width,.12,depth,node.kind==='area'?'#c6c7bc':'#d7d5c7');floor.position.y=-.06;floor.name=`Floor:${node.id}`;parent.add(floor);floors.push(floor);
          floor.userData={roomId:node.id,floorId};
          for(const boundary of architecture.walls.filter(w=>w.regionId===node.id)) {
            const wall=structureMesh(...boundary.size,node.kind==='area'?'#b5c4b8':'#c4d1c1');wall.position.fromArray(boundary.position);wall.name=boundary.id;wall.userData={roomId:node.id,physicalBoundary:boundary.id};parent.add(wall);walls.push(wall);
          }
        }
      }
      for(const entry of derived.facilities.filter(f=>f.floorId===floorId)) {
        const root=group(entry.id);let parts,visual;
        if(entry.resource.asset) {
          if(!assetLibrary)throw new CompanyError('asset-library-required',entry.id,'Preload this GLB resource before preparing its scene');
          const instance=assetLibrary.instantiate(entry.resource);parts=instance.nodes;visual=instance.root;root.add(instance.root);
          instance.root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
        } else {parts=new Map();visual=buildResource(entry.resource.node,parts,entry.state);root.add(visual);}
        for(const [slot,values]of Object.entries(entry.node.appearance?.materials||{})) {
          const targets=entry.resource.materialSlots?.[slot];
          if(!Array.isArray(targets)||!targets.length)throw new CompanyError('unknown-material-slot',`${entry.id}.${slot}`,'This appearance slot is not declared by the resource');
          for(const name of targets) {
            const mesh=parts.get(name);
            if(!mesh?.isMesh||!mesh.material)throw new CompanyError('missing-material-target',`${entry.id}.${slot}`,`No mesh material at ${name}`);
            for(const material of [mesh.material].flat()) {
              if(values.color!==undefined)material.color.set(values.color);
              if(values.roughness!==undefined)material.roughness=values.roughness;
            }
          }
        }
        const facility={...entry,root,parts,visual};facilities.set(entry.id,facility);
        if(entry.resource.light) {
          const def=entry.resource.light;
          const light=new THREE.SpotLight(def.color,entry.state.on?entry.state.intensity:0,def.distance,def.angle,def.penumbra,2);
          light.position.fromArray(def.position);light.target.position.fromArray(def.target);light.castShadow=false;
          root.add(light,light.target);lights.push({id:entry.id,roomId:entry.roomId,light,desired:entry.state.on?entry.state.intensity:0});
        }
      }
      root.updateMatrixWorld(true);
      for(const facility of facilities.values()) {
        const room=derived.nodes.get(facility.roomId);
        if(room) {
          const localBounds=new THREE.Box3().setFromObject(facility.root).applyMatrix4(groups.get(room.id).matrixWorld.clone().invert());
          if(localBounds.min.x < -room.bounds.width/2-.001 || localBounds.max.x > room.bounds.width/2+.001 ||
             localBounds.min.z < -room.bounds.depth/2-.001 || localBounds.max.z > room.bounds.depth/2+.001)
            throw new CompanyError('visual-outside-room',facility.id,'Actual model extends outside the containing room');
        }
        if(facility.resource.mount==='desk-surface') {
          const parent=facilities.get(facility.node.parentId),surface=parent?.resource.surface;
          if(surface) {
            const localBounds=new THREE.Box3().setFromObject(facility.root).applyMatrix4(parent.root.matrixWorld.clone().invert());
            if(localBounds.min.x < -surface.halfSize[0]-.01 || localBounds.max.x > surface.halfSize[0]+.01 ||
               localBounds.min.z < -surface.halfSize[1]-.01 || localBounds.max.z > surface.halfSize[1]+.01)
              throw new CompanyError('visual-surface-overhang',facility.id,'The complete device model exceeds its declared desk support surface');
          }
        }
      }
      for(const point of derived.usePoints.filter(p=>p.floorId===floorId)) {
        const facility=facilities.get(point.facilityId),chairSeat=facility.parts.get(point.seatNodeId),chairBack=facility.parts.get(point.backNodeId);
        if(!chairSeat?.isMesh || !chairBack?.isMesh)throw new CompanyError('missing-contact-mesh',point.id,'Seat and back must resolve to actual resource meshes');
        let chair=facility.root;
        if(point.position||point.yaw) {chair=new THREE.Group();chair.name=`UsePoint:${point.id}`;chair.position.fromArray(point.position||[0,0,0]);chair.rotation.y=point.yaw||0;facility.root.add(chair);}
        points.set(point.id,{...point,chair,chairSeat,chairBack,footprint:facility.resource.footprint});
      }
      for(const facility of facilities.values())if(facility.resource.footprint?.blocking) {
        const footprint=facility.resource.footprint;
        const proxy=structureMesh(footprint.halfSize[0]*2,.45,footprint.halfSize[1]*2,'#789587');
        proxy.position.set(footprint.center[0],.225,footprint.center[1]);proxy.name=`Simplified:${facility.id}`;proxy.visible=false;facility.root.add(proxy);facility.proxy=proxy;
      }
      lights.sort((a,b)=>a.id.localeCompare(b.id));
      for(let i=0;i<lights.length;i++)lights[i].light.intensity=i<maxRealtimeLights?lights[i].desired:0;
      return {root,document:clone(document),derived,architecture,floorId,view,groups,facilities,points,floors,walls,lights};
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
      // The contact-bearing resource is unchanged, but attached facility
      // instances may have been added, removed or edited. Reconcile those
      // branches separately instead of silently retaining the entire old tree.
      const nextChildren=candidate.document.nodes.filter(n=>n.parentId===id).map(n=>candidate.groups.get(n.id)).filter(Boolean);
      for(const child of nextChildren)child.removeFromParent();
      for(const node of current.document.nodes.filter(n=>n.parentId===id)) {
        const child=current.groups.get(node.id);if(child?.parent===oldRoot)current.root.add(child);
      }
      oldRoot.removeFromParent();oldRoot.position.copy(placeholder.position);oldRoot.quaternion.copy(placeholder.quaternion);
      disposeTree(placeholder);parent.add(oldRoot);
      for(const child of nextChildren)oldRoot.add(child);
      nextFacility.root=oldRoot;nextFacility.parts=oldFacility.parts;nextFacility.visual=oldFacility.visual;nextFacility.proxy=oldFacility.proxy;candidate.groups.set(id,oldRoot);
      for(const point of candidate.points.values())if(point.facilityId===id) {
        point.chair=current.points.get(point.id)?.chair||oldRoot;point.chairSeat=oldFacility.parts.get(point.seatNodeId);point.chairBack=oldFacility.parts.get(point.backNodeId);
      }
    }
    world.add(candidate.root);candidate.root.updateMatrixWorld(true);
    if(current)disposeTree(current.root);current=candidate;generation++;applyPresentation();
  }
  function applyPresentation() {
    const focused=current.view.mode==='room'?current.view.roomId:null;
    for(const facility of current.facilities.values()) {
      const detailed=!focused||facility.roomId===focused;
      facility.visual.visible=detailed;if(facility.proxy)facility.proxy.visible=!detailed;
    }
    // A low cutaway is a display transform only; physical wall records remain 2.8m.
    for(const wall of current.walls){wall.scale.y=.18;wall.position.y=2.8*.18/2;}
    const eligible=current.lights.filter(l=>!focused||l.roomId===focused).sort((a,b)=>a.id.localeCompare(b.id));
    const enabled=new Set(eligible.filter(l=>l.desired>0).slice(0,maxRealtimeLights));
    for(const light of current.lights)light.light.intensity=enabled.has(light)?light.desired:0;
    current.root.updateMatrixWorld(true);
  }
  install(build(initialDocument,visibleFloorId));
  function live(){if(disposed)throw new CompanyError('scene-disposed','company','Scene has been disposed');}
  function navigation(floorId=current.floorId) {
    if(current.derived.nodes.get(floorId)?.kind!=='floor')throw new CompanyError('unknown-floor',floorId,'Choose an existing floor');
    const obstacles=current.derived.obstacles.filter(o=>o.floorId===floorId).map(o=>{
      const facility=current.derived.facilities.find(f=>f.id===o.id),padding=facility.resource.usePoints?.length ? 0.1 : 0.22;
      return {name:o.id,instanceId:o.id,kind:facility.resource.usePoints?.length?'seat':'facility',x:(o.min[0]+o.max[0])/2,z:(o.min[1]+o.max[1])/2,
        hw:(o.max[0]-o.min[0])/2+padding,hd:(o.max[1]-o.min[1])/2+padding,object:current.facilities.get(o.id)?.root||null,footprint:clone(o.footprint)};
    });
    for(const wall of current.architecture.walls.filter(w=>w.floorId===floorId))obstacles.push({name:wall.id,instanceId:wall.id,kind:'wall',x:wall.center[0],z:wall.center[2],hw:wall.halfSize[0],hd:wall.halfSize[1],object:null});
    const rooms=current.document.nodes.filter(n=>['room','area'].includes(n.kind)&&current.derived.floorIds.get(n.id)===floorId);
    return {floorId,floors:floorId===current.floorId?current.floors:[],obstacles,connections:clone(current.architecture.topology.floors.find(f=>f.floorId===floorId).connections),regions:rooms.map(room=>({id:room.id,transform:clone(current.derived.worlds.get(room.id)),bounds:clone(room.bounds),inset:.45}))};
  }
  return {
    get root(){return current.root;},get floor(){return current.floors[0];},get walls(){return [...current.walls];},
    get document(){return clone(current.document);},get revision(){return current.document.revision;},
    get view(){return clone({...current.view,floorId:current.floorId});},
    resolveUsePoint(id){live();return current.points.get(id)||null;},
    listUsePoints(){live();return [...current.points.values()];},
    navigation,
    snapshot(){return {document:clone(current.document),view:this.view,visibleFloorId:current.floorId,displayedFacilities:current.facilities.size,points:[...current.points.values()].map(p=>({id:p.id,facilityId:p.facilityId,position:p.chair.getWorldPosition(new THREE.Vector3()).toArray(),yaw:p.world.yaw+(p.yaw||0)})),lights:current.lights.map(l=>({id:l.id,intensity:l.light.intensity,castsShadow:l.light.castShadow})),navigation:navigation().obstacles.map(({object,...o})=>o)};},
    setView({mode='floor',floorId=current.floorId,roomId=null}={}) {
      live();if(!['floor','room','building'].includes(mode))throw new CompanyError('invalid-view',mode,'Use floor, room or building');
      if(current.derived.nodes.get(floorId)?.kind!=='floor')throw new CompanyError('unknown-floor',floorId,'Choose an existing floor');
      if(mode==='room'&&(!['room','area'].includes(current.derived.nodes.get(roomId)?.kind)||current.derived.floorIds.get(roomId)!==floorId))throw new CompanyError('invalid-view-room',roomId,'Focused room must belong to viewed floor');
      const view={mode,roomId};
      if(floorId===current.floorId&&mode!=='building'&&current.view.mode!=='building'){current.view=view;generation++;applyPresentation();}
      else install(build(current.document,floorId,view));
      return this.snapshot();
    },
    prepareChange(operations,guards={}) {
      live();const result=prepareCompanyChange(current.document,operations,{catalog,templates,...guards});
      const candidate=build(result.document,current.floorId,current.view);candidate.operations=clone(operations);candidate.previousRevision=current.document.revision;candidate.generation=generation;
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
      live();for(const point of current.derived.usePoints)if(isUsePointBusy(point.id))throw new CompanyError('facility-busy',point.id,'Leave occupied facilities before replacing the full company document');
      const next=restoreCompany(text,catalog,templates),floorId=next.nodes.some(n=>n.id===current.floorId&&n.kind==='floor')?current.floorId:undefined;
      install(build(next,floorId));return this.snapshot();
    },
    dispose(){if(disposed)return;disposed=true;for(const candidate of prepared.values())disposeTree(candidate.root);prepared.clear();disposeTree(current.root);},
  };
}
