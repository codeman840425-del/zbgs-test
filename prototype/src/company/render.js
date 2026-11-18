import {adaptCableGeometry,validateCableVisualPlacement} from './cable-render.js';
import {validateCeilingVisualPlacement,ceilingVisibleForRegion} from './ceiling-placement.js';
import * as THREE from 'three';
import {applyWindowState,validateWindowVisualPlacement} from './window-geometry.js';
import {applyWindowCoverState} from './window-cover-data.js';
import defaultCatalog from './facility-catalog.json' with {type:'json'};
import defaultTemplates from './templates.json' with {type:'json'};
import {CompanyError,deriveCompany,prepareCompanyChange,serializeCompany,restoreCompany} from './document.js';
import {describeArchitecture} from './architecture.js';
import {describeCompanyUsePoint} from './use-point-data.js';
import {createContactResourceStore} from './contact-resources.js';
import {WALL_HEIGHT,WALL_CENTER_Y,evaluateWallVisibility,groupWallSegments,wallEdge} from './wall-visibility.js';
import {applySurfaceFinish,describeSurfaceMeshes} from './surface-finish-render.js';
import {partAngle,partOffset} from './moving-parts.js';
import {bindClockDisplay,validatePresentationInputs} from './clock-display.js';
import {applyInformationDisplay} from './information-display.js';
import {createMirrorBindings,validateMirrorRenderProfile} from './mirror-render.js';
import {inspectCompanyMotionSweep,inspectCompanyPlacement} from './placement.js';

const geometryTypes={BoxGeometry:THREE.BoxGeometry,CylinderGeometry:THREE.CylinderGeometry,PlaneGeometry:THREE.PlaneGeometry,CapsuleGeometry:THREE.CapsuleGeometry,SphereGeometry:THREE.SphereGeometry};
const clone=value=>structuredClone(value);
const releasedTrees=new WeakSet();
function disposeTree(root) {
  if(releasedTrees.has(root))return;releasedTrees.add(root);
  const mirrorOwners=[];root.traverse(object=>{if(object.userData.companyMirrorBinding)mirrorOwners.push(object.userData.companyMirrorBinding);});
  for(const owner of mirrorOwners)owner.dispose();
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of [...(object.material?[object.material].flat():[]),object.customDepthMaterial,object.customDistanceMaterial].filter(Boolean)) {
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
function effectivelyVisible(object) {
  for(let node=object;node;node=node.parent)if(!node.visible)return false;
  return true;
}

// CPU preflight also covers hidden floors/building overview. Temporary instances
// are never attached to the visible scene and own their cloned display resources.
export function validateCeilingDocumentAssets(derived,assetLibrary){
  const floors=new Set(derived.facilities.filter(f=>['ceiling','parent-device-endpoints','wall-opening'].includes(f.resource.mount)).map(f=>f.floorId));
  if(!floors.size)return;
  const temporary=new Map();
  try {
    for(const f of derived.facilities.filter(f=>floors.has(f.floorId))){
      const root=new THREE.Group();temporary.set(f.id,{...f,root});
      if(f.resource.asset&&!assetLibrary)throw new CompanyError('asset-library-required',f.id,'Ceiling clearance requires actual geometry, including facilities on hidden floors');
      const visual=f.resource.asset?assetLibrary.instantiate(f.resource).root:buildResource(f.resource.node,new Map(),f.state);
      root.add(visual);applyWindowState(visual,f.resource,f.state);
      applyWindowCoverState(visual,f.resource,f.state);
      if(derived.cableConnections.has(f.id))adaptCableGeometry(visual,derived.cableConnections.get(f.id));
      root.position.fromArray(f.world.position);root.rotation.y=f.world.yaw;root.updateMatrixWorld(true);
      temporary.get(f.id).visual=visual;
    }
    validateWindowVisualPlacement(temporary,(code,path,message)=>{throw new CompanyError(code,path,message);});
    validateCableVisualPlacement(temporary,derived.cableConnections,(code,path,message)=>{throw new CompanyError(code,path,message);});
    validateCeilingVisualPlacement(temporary,(code,path,message)=>{throw new CompanyError(code,path,message);});
  }finally{for(const f of temporary.values())disposeTree(f.root);}
}

// Presentation/provider only: no actor creation, movement, task or lease implementation.
function validatePlacementGeometry(facilities,derived,groups) {
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
      validateWindowVisualPlacement(facilities,(code,path,message)=>{throw new CompanyError(code,path,message);});
      validateCableVisualPlacement(facilities,derived.cableConnections,(code,path,message)=>{throw new CompanyError(code,path,message);});
      validateCeilingVisualPlacement(facilities,(code,path,message)=>{throw new CompanyError(code,path,message);});
}

export function createCompanyScene(world,initialDocument,{catalog=defaultCatalog,templates=defaultTemplates,visibleFloorId,maxRealtimeLights=2,assetLibrary,mirrorPreflight,mirrorRenderProfile='single-512-v1'}={}) {
  validateMirrorRenderProfile(mirrorRenderProfile);
  if(!world?.isObject3D)throw new TypeError('Company scene requires a Three world');
  let current,disposed=false,generation=0,presentationInputs={clockSeconds:0};
  const prepared=new Map();
  function build(document,floorId,view={mode:'floor',roomId:null},wallView={mode:'full',cameraPosition:null}) {
    const derived=deriveCompany(document,catalog,templates);
    const architecture=describeArchitecture(document,catalog,templates);
    floorId ||= document.nodes.find(n=>n.kind==='floor').id;
    if(derived.nodes.get(floorId)?.kind!=='floor')throw new CompanyError('unknown-floor',floorId,'Choose an existing floor');
    const root=new THREE.Group();root.name=`Company:${document.id}`;
    const groups=new Map(),facilities=new Map(),points=new Map(),floors=[],walls=[],ceilings=[],lights=[];
    const finishMaterials=new Map(),finishes=new Map((derived.surfaceFinishes||[]).map(finish=>[finish.id,finish]));
    function group(id) {
      if(id===document.id)return root;
      if(groups.has(id))return groups.get(id);
      const node=derived.nodes.get(id),object=new THREE.Group();object.name=id;
      const local=derived.localTransforms.get(id);
      object.position.fromArray(local.position);object.rotation.y=local.yaw;
      groups.set(id,object);group(node.parentId).add(object);return object;
    }
    try {
      if(view.mode==='building') {
        // Whole-building views use a lightweight presentation in the host UI.
        // Keep only the logical document here; no indoor meshes are constructed.
        return {root,document:clone(document),derived,architecture,floorId,view,wallView:clone(wallView),groups,facilities,points,floors,walls,ceilings,lights,wallGroups:new Map()};
      }
      for(const node of document.nodes)if(derived.floorIds.get(node.id)===floorId) {
        const parent=group(node.id);
        if(['room','area'].includes(node.kind)) {
          const {width,depth}=node.bounds;
          const floor=structureMesh(width,.12,depth,node.kind==='area'?'#c6c7bc':'#d7d5c7');floor.position.y=-.06;floor.name=`Floor:${node.id}`;parent.add(floor);floors.push(floor);
          floor.userData={roomId:node.id,floorId};
          applySurfaceFinish(floor,finishes.get(`${node.id}#finish:floor`),node,null,assetLibrary,finishMaterials);
          if(finishes.has(`${node.id}#finish:ceiling`)||derived.facilities.some(f=>f.roomId===node.id&&f.resource.mount==='ceiling')) {
            const ceiling=structureMesh(width,.08,depth,'#e2dfd5');ceiling.position.y=WALL_HEIGHT+.04;
            ceiling.name=`Ceiling:${node.id}`;ceiling.userData={roomId:node.id,floorId};
            parent.add(ceiling);ceilings.push(ceiling);
            applySurfaceFinish(ceiling,finishes.get(`${node.id}#finish:ceiling`),node,null,assetLibrary,finishMaterials);
          }
          for(const boundary of architecture.walls.filter(w=>w.regionId===node.id)) {
            const wall=structureMesh(...boundary.size,node.kind==='area'?'#b5c4b8':'#c4d1c1');wall.position.fromArray(boundary.position);wall.name=boundary.id;wall.userData={roomId:node.id,edge:boundary.edge,physicalBoundary:boundary.sourceWallId||boundary.id,height:boundary.size[1]};parent.add(wall);walls.push(wall);
            applySurfaceFinish(wall,finishes.get(`${node.id}#finish:${boundary.edge}`),node,boundary,assetLibrary,finishMaterials);
          }
        }
      }
      for(const entry of derived.facilities.filter(f=>f.floorId===floorId)) {
        const root=group(entry.id);let parts,visual;
        if(entry.resource.asset) {
          if(!assetLibrary)throw new CompanyError('asset-library-required',entry.id,'Preload this GLB resource before preparing its scene');
          const instance=assetLibrary.instantiate(entry.resource);parts=instance.nodes;visual=instance.root;root.add(instance.root);
          // Three's shared shadow material can retain a disposed map uniform when
          // switching textured and untextured casters. Own these materials with
          // the imported mesh so its shadow uniforms end with the same scene.
          instance.root.traverse(object=>{if(object.isMesh){
            object.castShadow=true;object.receiveShadow=true;
            object.customDepthMaterial=new THREE.MeshDepthMaterial();
            object.customDistanceMaterial=new THREE.MeshDistanceMaterial();
          }});
        } else {parts=new Map();visual=buildResource(entry.resource.node,parts,entry.state);root.add(visual);}
        applyWindowState(visual,entry.resource,entry.state);
        applyWindowCoverState(visual,entry.resource,entry.state);
        if(derived.cableConnections.has(entry.id))adaptCableGeometry(visual,derived.cableConnections.get(entry.id));
        for(const part of entry.resource.movingParts||[]) {
          const pivot=parts.get(entry.resource.partNodes[part.id]);
          if(!pivot)throw new CompanyError('missing-moving-part',entry.id,'Moving part must resolve to its imported pivot');
          if(part.kind==='slide')pivot.position.z=part.pivot[2]+partOffset(part,entry.state);
          else pivot.rotation.y=partAngle(part,entry.state);
        }
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
        // Imported models declare their display targets separately from fixed state semantics.
        const screen=entry.resource.display?.screen;
        if(screen) {
          if(!Array.isArray(screen.nodes)||!screen.nodes.length||
            !Number.isFinite(screen.onIntensity)||screen.onIntensity<0||screen.onIntensity>10||
            ![screen.onColor,screen.offColor,screen.emissive].every(c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c)))
            throw new CompanyError('invalid-display-mapping',entry.id,'Screen display requires named meshes, colors and a bounded emissive intensity');
          for(const name of screen.nodes) {
            const mesh=parts.get(name);
            if(!mesh?.isMesh)throw new CompanyError('missing-display-mesh',`${entry.id}.${name}`,'Screen state target must resolve to a mesh');
            for(const material of [mesh.material].flat()) {
              if(!material?.emissive)throw new CompanyError('invalid-display-material',`${entry.id}.${name}`,'Screen target requires an emissive-capable material');
              material.color.set(entry.state.on?screen.onColor:screen.offColor);
              material.emissive.set(entry.state.on?screen.emissive:'#000000');
              material.emissiveIntensity=entry.state.on?screen.onIntensity:0;
            }
          }
        }
        // Other static display resources (for example a camera recording LED or
        // a background content panel) declare their own state field.  This
        // keeps visual state mapping generic without giving each facility a
        // private renderer path.
        for(const [displayKey, mapping] of Object.entries(entry.resource.display||{})) {
          if(displayKey==='screen'||!mapping||!Array.isArray(mapping.nodes)||!mapping.nodes.length)continue;
          const field=mapping.stateField||(displayKey==='status'?'recording':displayKey==='content'?'visible':null);
          if(!field)continue;
          const value=entry.state[field]??entry.resource.stateDefaults?.[field];
          for(const name of mapping.nodes) {
            const mesh=parts.get(name);
            if(!mesh?.isMesh)throw new CompanyError('missing-display-mesh',`${entry.id}.${name}`,'Display target must resolve to a mesh');
            const visible=field==='visible'?Boolean(value):true;
            mesh.visible=visible;
            for(const material of [mesh.material].flat()) {
              if(!material)continue;
              const onColor=mapping.onColor||mapping.accentColor, offColor=mapping.offColor;
              if(onColor&&offColor&&material.color)material.color.set(value?onColor:offColor);
              if(material.emissive&&mapping.emissive) {
                material.emissive.set(value?mapping.emissive:'#000000');
                material.emissiveIntensity=value?Number(mapping.onIntensity??1):0;
              }
            }
          }
        }
        const facility={...entry,root,parts,visual};
        facility.mirrors=createMirrorBindings(entry.resource,parts,entry.id,mirrorRenderProfile);
        facility.mirror=facility.mirrors[0]||null;
        if(facility.mirrors.length)visual.userData.companyMirrorBinding={dispose:()=>{for(const binding of facility.mirrors)binding.dispose();}};
        const lamp=entry.resource.makeupLamp;
        if(lamp) {
          const mesh=parts.get(lamp.node);
          if(!mesh?.isMesh)throw new CompanyError('missing-makeup-lamp',entry.id,'The mirror lamp must resolve to its physical diffuser');
          for(const material of [mesh.material].flat()) {
            if(!material?.emissive)throw new CompanyError('invalid-makeup-lamp-material',entry.id,'The diffuser requires an emissive-capable material');
            material.emissive.set(entry.resource.light.color);
            material.emissiveIntensity=entry.state.on?entry.state.intensity/10*lamp.maxEmissiveIntensity:0;
          }
        }
        applyInformationDisplay(entry.resource,parts,entry.state);
        facility.clock=bindClockDisplay(entry.resource,parts,entry.state);
        facility.clock?.apply(presentationInputs);
        if(['wall','portal','wall-opening'].includes(entry.resource.mount)) {
          const edge=wallEdge(entry.node.transform.yaw);
          const along=['north','south'].includes(edge)?entry.node.transform.position[0]:entry.node.transform.position[2];
          const candidates=architecture.visibilityWalls.filter(w=>w.regionId===entry.roomId&&w.edge===edge);
          const mountedWall=candidates.find(w=>{
            const axis=['north','south'].includes(edge)?0:2;
            return Math.abs(along-w.position[axis])<=w.size[axis]/2+1e-6;
          })||candidates[0];
          facility.wallBinding={edge,wallId:mountedWall?.id||null};
        }
        facilities.set(entry.id,facility);
        if(entry.resource.light) {
          const def=entry.resource.light;
          const light=new THREE.SpotLight(def.color,entry.state.on?entry.state.intensity:0,def.distance,def.angle,def.penumbra,2);
          light.position.fromArray(def.position);light.target.position.fromArray(def.target);light.castShadow=false;
          root.add(light,light.target);lights.push({id:entry.id,roomId:entry.roomId,light,desired:entry.state.on?entry.state.intensity:0});
        }
      }
      root.updateMatrixWorld(true);
      validatePlacementGeometry(facilities,derived,groups);
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
      const wallGroups=groupWallSegments(architecture.visibilityWalls);
      for(const wall of walls)wall.userData.wallGroup=wallGroups.get(wall.userData.physicalBoundary)||wall.userData.physicalBoundary;
      for(const facility of facilities.values())if(facility.wallBinding?.wallId)facility.wallBinding.wallGroup=wallGroups.get(facility.wallBinding.wallId)||facility.wallBinding.wallId;
      return {root,document:clone(document),derived,architecture,floorId,view,wallView:clone(wallView),groups,facilities,points,floors,walls,ceilings,lights,wallGroups};
    } catch(error) {disposeTree(root);throw error;}
  }
  function contactSource(id,visible) {
    const point=current?.derived.usePoints.find(candidate=>candidate.id===id);
    if(!point)return null;
    const facility=current.derived.facilities.find(candidate=>candidate.id===point.facilityId);
    if(!facility)return null;
    const local={position:point.position||[0,0,0],yaw:point.yaw||0};
    const source={usePointId:id,documentId:current.document.id,revision:current.document.revision,facilityId:facility.id,
      resource:facility.resource,state:facility.state,facilityTransform:clone(point.world),transform:clone(describeCompanyUsePoint(current.document,current.derived,id).transform),
      seatNodeId:point.seatNodeId,backNodeId:point.backNodeId,visible,preload:resource=>assetLibrary?.preload?.([resource]),
      isCurrent:()=>{
        const latest=current.derived.usePoints.find(candidate=>candidate.id===id),latestFacility=latest&&current.derived.facilities.find(candidate=>candidate.id===latest.facilityId);
        return Boolean(current.document.id===source.documentId&&latest&&latestFacility&&latest.facilityId===facility.id&&latestFacility.resource.id===facility.resource.id&&latestFacility.resource.version===facility.resource.version&&
          JSON.stringify(latest.world)===JSON.stringify(point.world)&&JSON.stringify({position:latest.position||[0,0,0],yaw:latest.yaw||0})===JSON.stringify(local));
      },
    };
    return source;
  }
  async function captureLogical(source) {
    if(source.resource.asset&&!assetLibrary)throw new CompanyError('asset-library-required',source.facilityId,'Preload this GLB resource before retaining its contact');
    let root,parts;
    if(source.resource.asset) { const instance=assetLibrary.instantiate(source.resource);root=instance.root;parts=instance.nodes; }
    else { parts=new Map();root=buildResource(source.resource.node,parts,source.state); }
    const transform=new THREE.Matrix4().makeRotationY(source.facilityTransform.yaw).setPosition(...source.facilityTransform.position);
    root.matrixAutoUpdate=false;root.matrix.copy(transform);root.matrixWorld.copy(transform);root.updateMatrixWorld(true);
    return {seat:parts.get(source.seatNodeId),back:parts.get(source.backNodeId),dispose:()=>disposeTree(root)};
  }
  async function captureVisible(point) { return {seat:point.chairSeat,back:point.chairBack}; }
  const contactResources=createContactResourceStore({
    resolveVisible:id=>current?.points.get(id)||null,
    resolveLogical:(id,visible)=>contactSource(id,visible),
    captureVisible,captureLogical,
    assetResources:()=>[],
  });
  function guardedBusy(guards={}) {
    const external=guards.isUsePointBusy||(()=>false);
    return id=>external(id)||contactResources.isBusy(id);
  }
  function install(candidate) {
    // Wall viewing is transient presentation state.  Preserve the latest
    // camera/mode when a prepared document candidate is published so a camera
    // update cannot roll back a user's current cutaway.
    const latestWallView=current?.wallView;
    if(latestWallView)candidate.wallView=clone(latestWallView);
    // Validate the candidate while the old root and its GPU resources are still owned.
    // This synchronous host hook cannot publish a document or modify stored bytes.
    const mirrors=[...candidate.facilities.values()].flatMap(f=>f.mirrors||[]);
    try {
      if(mirrors.length) {
        if(typeof mirrorPreflight!=='function')throw new CompanyError('mirror-host-required','company','The host must provide mirror GPU preflight before installing mirror resources');
        const previousVisible=current?.root.visible;
        world.add(candidate.root);if(current)current.root.visible=false;
        try {applyPresentation(candidate);mirrorPreflight({root:candidate.root,mirrors,view:candidate.view});}
        finally {candidate.root.removeFromParent();if(current)current.root.visible=previousVisible;}
      }
    } catch(error) {disposeTree(candidate.root);throw error;}
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
    if(latestWallView)candidate.wallView=clone(latestWallView);
    for(const facility of candidate.facilities.values())facility.clock?.apply(presentationInputs);
    world.add(candidate.root);candidate.root.updateMatrixWorld(true);
    if(current)disposeTree(current.root);current=candidate;generation++;applyPresentation();
  }
  function applyPresentation(target=current) {
    const focused=target.view.mode==='room'?target.view.roomId:null;
    const wallVisibility=evaluateWallVisibility({walls:target.architecture.visibilityWalls,document:target.document,derived:target.derived,
      floorId:target.floorId,view:target.view,mode:target.wallView?.mode,cameraPosition:target.wallView?.cameraPosition,groups:target.wallGroups});
    const hiddenGroups=wallVisibility.hiddenGroups;
    const ceilingVisible=regionId=>ceilingVisibleForRegion({view:target.view,cameraPosition:target.wallView?.cameraPosition,region:target.derived.nodes.get(regionId),group:target.groups.get(regionId)});
    for(const facility of target.facilities.values()) {
      const detailed=!focused||facility.roomId===focused||target.derived.windowOpenings.get(facility.id)?.regions.some(s=>s.regionId===focused);
      const wallHidden=facility.wallBinding?.wallGroup&&hiddenGroups.has(facility.wallBinding.wallGroup);
      const mounted = facility.resource.mountRole !== 'camera-mount' || facility.state.mounted;
      facility.visual.visible = mounted && detailed && !wallHidden;
      if (facility.proxy) facility.proxy.visible = mounted && !detailed;
      if(['wall','portal','wall-opening'].includes(facility.resource.mount))facility.root.visible=detailed&&!wallHidden;
      if(facility.resource.mount==='ceiling'){facility.root.visible=ceilingVisible(facility.roomId);if(facility.proxy)facility.proxy.visible=false;}
      // Wall-mounted assets retain their complete geometry.  Older cutaway
      // clipping planes must be cleared when a candidate is reused.
      facility.visual.traverse(object=>{for(const material of object.material?[object.material].flat():[])if(material.clippingPlanes?.length||material.clipShadows){material.clippingPlanes=[];material.clipShadows=false;material.needsUpdate=true;}});
    }
    // Wall geometry is always physically complete.  Cutaway changes display
    // visibility only, preserving the real 2.8m height and center.
    for(const wall of target.walls){wall.scale.y=1;wall.visible=!hiddenGroups.has(wall.userData.wallGroup);}
    for(const ceiling of target.ceilings) {
      ceiling.visible=ceilingVisible(ceiling.userData.roomId);
    }
    const eligible=target.lights.filter(l=>(!focused||l.roomId===focused)&&effectivelyVisible(l.light)).sort((a,b)=>a.id.localeCompare(b.id));
    const enabled=new Set(eligible.filter(l=>l.desired>0).slice(0,maxRealtimeLights));
    for(const light of target.lights)light.light.intensity=enabled.has(light)?light.desired:0;
    target.root.updateMatrixWorld(true);
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
    for(const wall of current.architecture.navigationWalls.filter(w=>w.floorId===floorId))obstacles.push({name:wall.id,instanceId:wall.id,kind:'wall',x:wall.center[0],z:wall.center[2],hw:wall.halfSize[0],hd:wall.halfSize[1],object:null});
    const rooms=current.document.nodes.filter(n=>['room','area'].includes(n.kind)&&current.derived.floorIds.get(n.id)===floorId);
    return {floorId,floors:floorId===current.floorId?current.floors:[],obstacles,connections:clone(current.architecture.topology.floors.find(f=>f.floorId===floorId).connections),exteriorEntrances:clone(current.architecture.topology.floors.find(f=>f.floorId===floorId).exteriorEntrances||[]),regions:rooms.map(room=>({id:room.id,transform:clone(current.derived.worlds.get(room.id)),bounds:clone(room.bounds),inset:.45}))};
  }
  return {
    get root(){return current.root;},get floor(){return current.floors[0];},get walls(){return [...current.walls];},
    get document(){return clone(current.document);},get revision(){return current.document.revision;},
    get view(){return clone({...current.view,floorId:current.floorId});},
    resolveUsePoint(id){live();return current.points.get(id)||null;},
    listUsePoints(){live();return [...current.points.values()];},
    describeUsePoint(id){live();return describeCompanyUsePoint(current.document,current.derived,id);},
    describeUsePoints({floorId}={}){
      live();if(floorId!==undefined&&current.derived.nodes.get(floorId)?.kind!=='floor')throw new CompanyError('unknown-floor',floorId,'Choose an existing floor');
      return current.derived.usePoints.filter(point=>floorId===undefined||point.floorId===floorId).map(point=>describeCompanyUsePoint(current.document,current.derived,point.id));
    },
    navigation,
    mirrorBindings(){live();return [...current.facilities.values()].flatMap(f=>f.mirrors||[]);},
    get mirrorRenderProfile(){live();return mirrorRenderProfile;},
    setMirrorRenderProfile(profile) {
      live();validateMirrorRenderProfile(profile);
      const bindings=this.mirrorBindings();
      if(bindings.some(binding=>binding.active))throw new CompanyError('mirror-quality-active','mirror','Deactivate all targets before changing host quality');
      for(const binding of bindings)binding.setRenderProfile(profile);
      if(profile!==mirrorRenderProfile)generation++;
      mirrorRenderProfile=profile;
      return profile;
    },
    setPresentationInputs(inputs) {
      live();const next=validatePresentationInputs(inputs);
      for(const facility of current.facilities.values())facility.clock?.apply(next);
      presentationInputs=next;current.root.updateMatrixWorld(true);return {...next};
    },
    get presentationInputs(){live();return {...presentationInputs};},
    surfacePresentation(){live();return describeSurfaceMeshes([...current.floors,...current.walls,...current.ceilings]);},
    snapshot(){return {document:clone(current.document),view:this.view,wallView:clone(current.wallView),visibleFloorId:current.floorId,displayedFacilities:current.facilities.size,points:[...current.points.values()].map(p=>({id:p.id,facilityId:p.facilityId,position:p.chair.getWorldPosition(new THREE.Vector3()).toArray(),yaw:p.world.yaw+(p.yaw||0)})),lights:current.lights.map(l=>({id:l.id,intensity:l.light.intensity,castsShadow:l.light.castShadow})),navigation:navigation().obstacles.map(({object,...o})=>o)};},
    setView({mode='floor',floorId=current.floorId,roomId=null}={}) {
      live();if(!['floor','room','building'].includes(mode))throw new CompanyError('invalid-view',mode,'Use floor, room or building');
      if(current.derived.nodes.get(floorId)?.kind!=='floor')throw new CompanyError('unknown-floor',floorId,'Choose an existing floor');
      if(mode==='room'&&(!['room','area'].includes(current.derived.nodes.get(roomId)?.kind)||current.derived.floorIds.get(roomId)!==floorId))throw new CompanyError('invalid-view-room',roomId,'Focused room must belong to viewed floor');
      const view={mode,roomId};
      if(floorId===current.floorId&&mode!=='building'&&current.view.mode!=='building'){current.view=view;generation++;applyPresentation();}
      else install(build(current.document,floorId,view,current.wallView));
      return this.snapshot();
    },
    setWallView({mode='full',cameraPosition}={}) {
      live();
      if(!['cutaway','full'].includes(mode))throw new CompanyError('invalid-wall-view',mode,'Use cutaway or full');
      let position=current.wallView?.cameraPosition||null;
      if(cameraPosition===null)position=null;
      else if(cameraPosition!==undefined) {
        if(!Array.isArray(cameraPosition)||cameraPosition.length!==3||!cameraPosition.every(Number.isFinite))
          throw new CompanyError('invalid-wall-camera','cameraPosition','Wall view camera position requires three finite numbers');
        position=[...cameraPosition];
      }
      current.wallView={mode,cameraPosition:position};applyPresentation();return this.wallPresentation();
    },
    wallPresentation() {
      live();
      const evaluated=evaluateWallVisibility({walls:current.architecture.visibilityWalls,document:current.document,derived:current.derived,
        floorId:current.floorId,view:current.view,mode:current.wallView?.mode,cameraPosition:current.wallView?.cameraPosition,groups:current.wallGroups});
      const mountedByGroup=new Map();
      for(const facility of current.facilities.values())if(facility.wallBinding?.wallGroup) {
        const list=mountedByGroup.get(facility.wallBinding.wallGroup)||[];
        // Imported asset roots may leave `visible` undefined on a cloned
        // scene node. The facility wrapper is authoritative for display
        // visibility; include the inner root only when it explicitly hides.
        const visible=!evaluated.hiddenGroups.has(facility.wallBinding.wallGroup)&&facility.root.visible!==false&&facility.visual?.visible!==false;
        list.push({id:facility.id,visible});mountedByGroup.set(facility.wallBinding.wallGroup,list);
      }
      return {mode:current.wallView?.mode||'full',effectiveMode:evaluated.effectiveMode,cameraPosition:current.wallView?.cameraPosition?[...current.wallView.cameraPosition]:null,
        targets:evaluated.targets.map(target=>[...target]),walls:current.walls.map(wall=>({id:wall.name,region:wall.userData.roomId,edge:wall.userData.edge,
          height:wall.userData.height||WALL_HEIGHT,visible:wall.visible,mounted:mountedByGroup.get(wall.userData.wallGroup)||[]}))};
    },
    createPlacementProbe(){
      const revision=current.document.revision,identity=current.document.id;
      let candidate=null,ended=false,shape=null,navigationKey=null;
      const release=()=>{if(candidate){disposeTree(candidate.root);candidate=null;}};
      return {
        check:operations=>{
          live();if(ended||revision!==current.document.revision||identity!==current.document.id)throw new CompanyError('revision-conflict','placement','Start placement again after a layout change');
          const result=prepareCompanyChange(current.document,operations,{catalog,templates,isUsePointBusy:guardedBusy({})});
          // Wall/shelf edits with identical topology, blockers and use points
          // share one navigation result; model and mounting checks still run.
          const regions=result.document.nodes.filter(n=>['room','area','floor'].includes(n.kind));
          const key=JSON.stringify([regions,regions.map(n=>result.derived.worlds.get(n.id)),result.derived.obstacles,result.derived.usePoints]);
          if(key!==navigationKey){inspectCompanyPlacement(result.document,catalog,templates);navigationKey=key;}
          const signature=JSON.stringify(result.document.nodes.map(n=>[n.id,n.parentId,n.resource,n.state,n.appearance,n.attachment]));
          // Cable geometry is deformed from endpoints at build time. Keep that
          // path authoritative; ordinary transforms reuse private prepared meshes.
          if(!candidate||shape!==signature||result.derived.cableConnections.size){
            release();candidate=build(result.document,current.floorId,current.view,current.wallView);shape=signature;
          }else{
            for(const [id,object]of candidate.groups){const t=result.derived.localTransforms.get(id);object.position.fromArray(t.position);object.rotation.y=t.yaw;}
            for(const entry of result.derived.facilities){const facility=candidate.facilities.get(entry.id);if(facility)Object.assign(facility,entry);}
            candidate.root.updateMatrixWorld(true);
            validatePlacementGeometry(candidate.facilities,result.derived,candidate.groups);
          }
          return {valid:true};
        },
        visual:id=>candidate?.groups.get(id),
        dispose(){if(ended)return;ended=true;release();},
      };
    },
    prepareChange(operations,guards={}) {
      live();const result=prepareCompanyChange(current.document,operations,{catalog,templates,...guards,isUsePointBusy:guardedBusy(guards)});
      inspectCompanyMotionSweep(current.document,result.document,catalog,templates);
      const candidate=build(result.document,current.floorId,current.view,current.wallView);candidate.operations=clone(operations);candidate.previousRevision=current.document.revision;candidate.generation=generation;
      const handle=Object.freeze({get document(){return clone(candidate.document);},previousRevision:candidate.previousRevision});prepared.set(handle,candidate);return handle;
    },
    commit(handle,guards={}) {
      live();const candidate=prepared.get(handle);if(!candidate)throw new CompanyError('unknown-candidate','company','Only locally prepared candidates can commit');
      if(candidate.generation!==generation)throw new CompanyError('revision-conflict','company','Scene was committed or restored after this candidate was prepared');
      // Recheck authoritative leases/revision just before synchronously publishing.
      prepareCompanyChange(current.document,candidate.operations,{catalog,templates,...guards,isUsePointBusy:guardedBusy(guards),expectedRevision:candidate.previousRevision});
      // install() disposes a rejected candidate. Consume its handle even on
      // failure so a retry cannot publish an already disposed mirror group.
      try { install(candidate); }
      finally { prepared.delete(handle); }
      return this.snapshot();
    },
    discard(handle){const candidate=prepared.get(handle);if(candidate){prepared.delete(handle);disposeTree(candidate.root);}},
    save(){live();return serializeCompany(current.document,catalog,templates);},
    restore(text,{isUsePointBusy=()=>false}={}) {
      live();const busy=id=>isUsePointBusy(id)||contactResources.isBusy(id);for(const point of current.derived.usePoints)if(busy(point.id))throw new CompanyError('facility-busy',point.id,'Leave occupied facilities before replacing the full company document');
      const next=restoreCompany(text,catalog,templates),floorId=next.nodes.some(n=>n.id===current.floorId&&n.kind==='floor')?current.floorId:undefined;
      const nextFloorId=floorId||next.nodes.find(node=>node.kind==='floor')?.id;
      const roomStillExists=current.view.mode!=='room'||next.nodes.some(node=>node.id===current.view.roomId&&['room','area'].includes(node.kind)&&node.parentId===nextFloorId);
      const nextView=roomStillExists?current.view:{mode:current.view.mode==='room'?'floor':current.view.mode,roomId:null};
      install(build(next,nextFloorId,nextView,current.wallView));return this.snapshot();
    },
    retainUsePointContact(id){live();return contactResources.retainUsePointContact(id);},
    releaseUsePointContact(handle){if(handle?.release)handle.release();},
    contactResources:()=>contactResources.resources(),
    dispose(){if(disposed)return;disposed=true;contactResources.dispose();for(const candidate of prepared.values())disposeTree(candidate.root);prepared.clear();disposeTree(current.root);},
  };
}
