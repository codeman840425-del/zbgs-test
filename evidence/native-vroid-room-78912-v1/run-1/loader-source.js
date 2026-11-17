
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {loadRetargetedMotions} from './prototype/src/motion-source.js';
import {createMotion} from './prototype/src/motion.js';

function visible(mesh) {
  for(let node=mesh;node;node=node.parent) if(!node.visible)return false;
  return true;
}
function bounds(vrm) {
  const box=new THREE.Box3();let vertices=0;
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh||!visible(mesh))return;
    mesh.skeleton?.update();
    const ids=new Set(mesh.geometry.index?.array??Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i));
    for(const i of ids){box.expandByPoint(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));vertices++;}
  });
  if(!vertices||box.isEmpty()||![...box.min,...box.max].every(Number.isFinite))throw Error('Candidate visible bounds invalid');
  return {minimum:box.min.toArray(),maximum:box.max.toArray(),vertices};
}
export async function install(expected) {
  const d=window.__debug,old=d.avatar();if(!old?.root)throw Error('Primary room not ready');
  const response=await fetch('/__native_vroid_qa__/model.vrm');if(!response.ok)throw Error('Candidate route unavailable');
  const bytes=await response.arrayBuffer();
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==expected.sha256)throw Error('Candidate browser SHA mismatch');
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes,'/__native_vroid_qa__/');const vrm=gltf.userData.vrm;
  if(!vrm?.humanoid)throw Error('Export has no supported VRM humanoid');
  const group=new THREE.Group();group.name='NativeVRoidStudy:'+expected.id;
  let motion,raf,disposed=false;
  const oldVisible=old.root.visible;
  try {
    VRMUtils.rotateVRM0(vrm);vrm.update(0);
    const rest=bounds(vrm);
    const sourceFloorY=expected.sourceFloorY??rest.minimum[1];
    if(!Number.isFinite(sourceFloorY))throw Error('Invalid candidate source floor');
    // Apply the candidate's floor once. Never copy the original VRM0 scene transform.
    vrm.scene.position.y-=sourceFloorY;group.add(vrm.scene);
    group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);
    if(old.root.scale.distanceTo(new THREE.Vector3(1,1,1))>1e-8)throw Error('Baseline root scale needs explicit unit review');
    group.updateMatrixWorld(true);
    const motions=await loadRetargetedMotions(vrm,{avatarSha256:sha,targetFloorY:group.getWorldPosition(new THREE.Vector3()).y});
    motion=createMotion(vrm,group,motions,{});motion.reset();
    const materials=[],bones={};
    vrm.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;mesh.frustumCulled=false;mesh.castShadow=true;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.push(material.name);
    });
    for(const [semantic,bone] of Object.entries(vrm.humanoid.normalizedHumanBones))
      bones[semantic]={normalizedName:bone.node.name,rawName:vrm.humanoid.getRawBoneNode(semantic)?.name};
    const info={id:expected.id,sha256:sha,metaVersion:vrm.meta?.metaVersion,
      defaultEmbeddedMaterials:[...new Set(materials)],normalizedBones:bones,
      sourceRestBounds:rest,sourceFloorY,floorMethod:expected.sourceFloorY===null?'visible source-rest minimum; sole semantics pending':'explicit measured source floor',
      retargetRatio:motions.ratio,clipTracks:Object.fromEntries(Object.entries(motions.clips).map(([id,c])=>[id,c.tracks.length])),
      unavailableDances:motions.unavailableDances,
      expressions:vrm.expressionManager?.expressions.map(e=>e.expressionName)??[],
      footwearCalibration:motion.getFootLockCalibration(),oldPrimaryVisibleBefore:oldVisible};
    old.root.visible=false;d.scene.add(group);
    const samples=[];let previous=d.snapshot(),lastSample=0,phase='stand';
    let tickError=null,updates=0;
    function tick() {
      if(disposed)return;
      try {
        const state=d.snapshot();const dt=state.simulationTime-previous.simulationTime;
        if(dt>0){
          group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);
          motion.update(dt,{action:state.mode,moving:state.motion.moving,speed:state.speed,
            distanceDelta:Math.max(0,state.distance-previous.distance),locomotionIntent:'walk',allowUnplannedTurn:false});
          vrm.update(dt);group.updateMatrixWorld(true);updates++;
        }
        previous=state;
        if(performance.now()-lastSample>=100){
          lastSample=performance.now();samples.push({ms:lastSample,phase,roomMode:state.mode,roomSimulationTime:state.simulationTime,
            root:group.position.toArray(),motion:motion.getMetrics()});
        }
      }catch(error){tickError=String(error.stack??error);return;}
      raf=requestAnimationFrame(tick);
    }
    window.__nativeVRoidStudy={info,samples,
      snapshot:()=>({info,phase,tickError,updates,root:group.position.toArray(),motion:motion.getMetrics()}),
      phase:value=>{phase=value;},
      expression:name=>{
        const manager=vrm.expressionManager;manager?.resetValues();
        if(!manager?.getExpression(name))return {name,supported:false};
        manager.setValue(name,1);vrm.update(0);
        return {name,supported:true,actualValue:manager.getValue(name)};
      },
      dispose:()=>{
        if(disposed)return;disposed=true;cancelAnimationFrame(raf);motion.dispose();group.removeFromParent();
        old.root.visible=oldVisible;VRMUtils.deepDispose(vrm.scene);delete window.__nativeVRoidStudy;
      }};
    tick();return info;
  }catch(error){motion?.dispose();group.removeFromParent();old.root.visible=oldVisible;VRMUtils.deepDispose(vrm.scene);throw error;}
}
