import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {createEquipment} from './prototype/src/equipment.js';
import {createMotion} from './prototype/src/motion.js';
import {loadRetargetedMotions} from './prototype/src/motion-source.js';

const materialNames=mesh=>(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.name.replace(/ \(Outline\)$/,''));
const clothNames={top:'N00_004_01_Tops_01_CLOTH (Instance)',shorts:'N00_001_01_Bottoms_01_CLOTH (Instance)',shoes:'N00_004_01_Shoes_01_CLOTH (Instance)'};
const digest=async buffer=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function install(input){
  const d=window.__debug,old=d.avatar();if(!old?.root)throw Error('Original room primary not ready');
  const bytes=await(await fetch('/__native_equipment_qa__/model.vrm')).arrayBuffer();
  if(await digest(bytes)!==input.avatarSha256)throw Error('Candidate SHA mismatch');
  const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
  const gltf=await loader.parseAsync(bytes,'/__native_equipment_qa__/');const vrm=gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);vrm.update(0);
  const group=new THREE.Group();group.name='NativeEquipmentComparison';group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);
  // Same independently measured source-floor convention as the first native room study.
  vrm.scene.position.y=-input.sourceFloorY;group.add(vrm.scene);group.updateMatrixWorld(true);
  const sourceClothes={},preserved=[];
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;mesh.frustumCulled=false;mesh.castShadow=true;
    const names=materialNames(mesh),role=Object.keys(clothNames).find(r=>names.includes(clothNames[r]));
    if(role){if(names.some(n=>n!==clothNames[role]))throw Error('Mixed original cloth primitive');if(sourceClothes[role])throw Error('Duplicate original garment mesh');sourceClothes[role]=mesh;}
    else preserved.push({mesh,visible:mesh.visible,names});
  });
  if(Object.keys(sourceClothes).length!==3)throw Error('Original garment primitives incomplete');
  let adapter,motion;const oldVisible=old.root.visible;
  try{
    // Bind at actual source rest before the motion controller changes the raw skeleton.
    adapter=await createEquipment({vrm,avatarSha256:input.avatarSha256,manifestUrl:'/__native_equipment_qa__/equipment.json'});
    await Promise.all(input.entries.map(e=>adapter.load(e.id)));
    const originalIds=input.originalEntries.map(e=>e.id);
    const initial=await adapter.equipSet(originalIds);if(!initial.applied)throw Error('Independent final set not committed');
    // Calibrate shared footwear from the original once, avoiding duplicate
    // original/extracted shoe surfaces during motion initialization.
    for(const entry of input.entries)adapter.get(entry.id).container.visible=false;
    const initialGearMaterials=input.entries.flatMap(entry=>adapter.get(entry.id).meshes.flatMap(mesh=>(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>({entry:entry.id,name:material.name,isMToonMaterial:material.isMToonMaterial,isOutline:material.isOutline,alphaTest:material.alphaTest,alphaTestUniform:material.uniforms?.alphaTest?.value,uvScrollX:material.uvAnimationScrollXOffset,uvScrollY:material.uvAnimationScrollYOffset}))));
    if(initialGearMaterials.length!==8||initialGearMaterials.some(m=>!m.isMToonMaterial||m.alphaTest!==.5||m.alphaTestUniform!==.5||m.uvScrollX!==0||m.uvScrollY!==0))throw Error('Prepared MToon first-frame uniforms not initialized');
    const motions=await loadRetargetedMotions(vrm,{avatarSha256:input.avatarSha256,targetFloorY:group.position.y});
    motion=createMotion(vrm,group,motions,{});motion.reset();
    const pairs=input.originalEntries.map(entry=>{
      const role=Object.keys(sourceClothes).find(r=>entry.id.includes('-'+r+'-'));
      const item=adapter.get(entry.id);if(!role||item.meshes.length!==1)throw Error('Unexpected extracted garment role/mesh count');
      const source=sourceClothes[role],independent=item.meshes[0];
      const a=source.geometry.index.array,b=independent.geometry.index.array;
      if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Original index identity mismatch '+role);
      if(source.geometry.attributes.position.count!==independent.geometry.attributes.position.count)throw Error('Source row count mismatch '+role);
      return {role,entry,source,independent,item,indices:[...new Set(a)]};
    });
    let mode='embedded',look='original',closed=false,captureGPU=false,lastGPUAlpha=[];
    const restoreDrawCallbacks=[];
    const observedPairs=[...pairs,{role:'customTop',independent:adapter.get(input.customTopId).meshes[0]}];
    for(const pair of observedPairs)for(const mesh of [pair.source,pair.independent].filter(Boolean)){
      const before=mesh.onAfterRender;restoreDrawCallbacks.push(()=>mesh.onAfterRender=before);
      mesh.onAfterRender=function(...args){before.apply(this,args);if(!captureGPU)return;const material=args[4],gl=d.renderer.getContext(),program=gl.getParameter(gl.CURRENT_PROGRAM);lastGPUAlpha.push({role:pair.role,independent:mesh===pair.independent,name:material.name,isOutline:material.isOutline,alphaTest:material.alphaTest,alphaTestUniform:material.uniforms.alphaTest.value,alphaTestGPU:gl.getUniform(program,gl.getUniformLocation(program,'alphaTest'))});};
    }
    function setMode(next){
      if(!['embedded','independent'].includes(next))throw Error('Invalid comparison mode');mode=next;
      for(const pair of pairs){pair.source.visible=next==='embedded';pair.item.container.visible=next==='independent';}
      for(const record of preserved)if(record.mesh.visible!==record.visible)throw Error('Preserved body/hair visibility changed');
    }
    function lookState(){
      return {look,avatarSha256:input.avatarSha256,sourceClothesVisible:Object.fromEntries(Object.entries(sourceClothes).map(([k,m])=>[k,m.visible])),
        equipment:input.entries.map(entry=>{const item=adapter.get(entry.id);return {id:entry.id,sha256:item.entry.sha256,visible:item.container.visible,slot:item.entry.slot,meshUUIDs:item.meshes.map(m=>m.uuid),alpha:item.meshes.flatMap(m=>(Array.isArray(m.material)?m.material:[m.material]).map(a=>({name:a.name,isOutline:a.isOutline,alphaTest:a.alphaTest,uniform:a.uniforms?.alphaTest?.value,uvX:a.uvAnimationScrollXOffset,uvY:a.uvAnimationScrollYOffset}))) };}),
        preservedSource:preserved.map(r=>({uuid:r.mesh.uuid,name:r.mesh.name,visible:r.mesh.visible,geometryUUID:r.mesh.geometry.uuid,positionVersion:r.mesh.geometry.attributes.position.version,normalVersion:r.mesh.geometry.attributes.normal?.version,materials:(Array.isArray(r.mesh.material)?r.mesh.material:[r.mesh.material]).map(m=>({uuid:m.uuid,color:m.color?.toArray(),opacity:m.opacity}))})),
        rawPose:Object.fromEntries(Object.entries(vrm.humanoid.rawHumanBones).map(([semantic,b])=>[semantic,{position:b.node.position.toArray(),quaternion:b.node.quaternion.toArray(),scale:b.node.scale.toArray()}]))};
    }
    async function selectLook(next){
      if(!['original','custom'].includes(next))throw Error('Unknown custom-top look');
      const ids=originalIds.map(id=>id===input.originalTopId&&next==='custom'?input.customTopId:id);
      const committed=await adapter.equipSet(ids);if(!committed.applied)throw Error('Equipment transaction not applied');
      Object.values(sourceClothes).forEach(mesh=>{mesh.visible=false;});mode='independent';look=next;
      const state=lookState();if(state.equipment.some(e=>e.visible!==ids.includes(e.id)))throw Error('Committed equipment visibility mismatch');
      return {committed,state};
    }
    function materials(mesh){return (Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>({name:m.name,type:m.type,isMToonMaterial:!!m.isMToonMaterial,isOutline:!!m.isOutline,side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,opacity:m.opacity,color:m.color?.toArray(),shadeColorFactor:m.shadeColorFactor?.toArray(),outlineWidthFactor:m.outlineWidthFactor,outlineWidthMode:m.outlineWidthMode,map:m.map?{width:m.map.image?.width,height:m.map.image?.height,flipY:m.map.flipY,colorSpace:m.map.colorSpace}:null,shadeMap:m.shadeMultiplyTexture?{width:m.shadeMultiplyTexture.image?.width,height:m.shadeMultiplyTexture.image?.height}:null}));}
    function observe(){
      group.updateMatrixWorld(true);vrm.scene.traverse(mesh=>mesh.skeleton?.update());
      const result=pairs.map(pair=>{
        let maximumWorldErrorM=0,worstSourceIndex=null;
        for(const id of pair.indices){const a=pair.source.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(pair.source.matrixWorld),b=pair.independent.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(pair.independent.matrixWorld);const error=a.distanceTo(b);if(![...a,...b,error].every(Number.isFinite))throw Error('Nonfinite garment comparison '+pair.role+' source index '+id);if(error>maximumWorldErrorM){maximumWorldErrorM=error;worstSourceIndex=id;}}
        return {role:pair.role,entry:pair.entry.id,sourceMesh:pair.source.name,independentMesh:pair.independent.name,drawnSourceIndices:pair.indices.length,maximumWorldErrorM,worstSourceIndex,sourceVisible:pair.source.visible,independentVisible:pair.item.container.visible,sourceMaterials:materials(pair.source),independentMaterials:materials(pair.independent)};
      });
      return {mode,look,motion:motion.getMetrics(),pairs:result,state:lookState(),firstDrawGPUAlpha:lastGPUAlpha,preservedVisibilityUnchanged:preserved.every(r=>r.mesh.visible===r.visible)};
    }
    function step(dt,moving){motion.update(dt,{action:moving?'walk':'idle',moving,speed:1.05,distanceDelta:moving?dt*1.05:0,treadmill:moving,locomotionIntent:'walk',allowUnplannedTurn:false});vrm.update(dt);adapter.update(dt);group.updateMatrixWorld(true);}
    function reset(){motion.reset();for(let i=0;i<60;i++)step(1/60,false);}
    setMode('embedded');reset();old.root.visible=false;d.scene.add(group);group.updateMatrixWorld(true);
    await selectLook('original');
    const head=vrm.humanoid.getRawBoneNode('head').getWorldPosition(new THREE.Vector3());
    const target=group.position.clone();target.y+=.85;
    const cuffTarget=group.position.clone();cuffTarget.y+=1.1;
    const cameras={front:{target:target.toArray(),position:target.clone().add(new THREE.Vector3(0,.08,3.2).applyQuaternion(group.quaternion)).toArray()},side:{target:target.toArray(),position:target.clone().add(new THREE.Vector3(3.2,.08,0).applyQuaternion(group.quaternion)).toArray()},cuffs:{target:cuffTarget.toArray(),position:cuffTarget.clone().add(new THREE.Vector3(0,.02,1.65).applyQuaternion(group.quaternion)).toArray()}};
    let cameraId='front';const render=d.renderer.render;
    d.renderer.render=function(scene,camera){const preset=cameras[cameraId],actual=d.cameraObject();actual.position.fromArray(preset.position);actual.up.set(0,1,0);actual.lookAt(...preset.target);actual.updateMatrixWorld(true);return render.call(this,scene,actual);};
    const note=document.createElement('div');note.id='native-equipment-note';Object.assign(note.style,{position:'fixed',top:'8px',left:'8px',background:'#fff5dc',padding:'6px',zIndex:99999});document.body.appendChild(note);
    function draw(){note.textContent='Native VRoid top switch · '+look+' · fixed '+input.build+' · test overlay';d.renderer.render(d.scene,d.cameraObject());}
    window.__nativeEquipmentQA={
      info:{avatarSha256:input.avatarSha256,metaVersion:vrm.meta.metaVersion,sourceFloorY:input.sourceFloorY,retargetRatio:motions.ratio,sourceWalkDuration:motions.clips.walk.duration,headWorld:head.toArray(),cameras,ids:pairs.map(p=>p.entry.id),preserved:preserved.map(r=>({name:r.mesh.name,materials:r.names,visible:r.visible})),initialEquipmentCommit:initial,initialGearMaterials},
      infoFraming:'Same original/independent cameras, slightly wider and lower than failed v4 to retain complete shoes.',
      selectLook,lookState,step,reset,observe,draw,metrics:()=>motion.getMetrics(),camera:id=>{if(!cameras[id])throw Error('Unknown camera');cameraId=id;},png:()=>{lastGPUAlpha=[];captureGPU=true;try{draw();}finally{captureGPU=false;}return d.renderer.domElement.toDataURL('image/png');},
      dispose(){if(closed)return;closed=true;restoreDrawCallbacks.forEach(f=>f());d.renderer.render=render;note.remove();adapter.dispose();motion.dispose();group.removeFromParent();old.root.visible=oldVisible;VRMUtils.deepDispose(vrm.scene);delete window.__nativeEquipmentQA;}
    };
    draw();return window.__nativeEquipmentQA.info;
  }catch(error){adapter?.dispose();motion?.dispose();group.removeFromParent();old.root.visible=oldVisible;VRMUtils.deepDispose(vrm.scene);throw error;}
}
