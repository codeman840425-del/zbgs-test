import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
export async function install(pose){
 const bytes=await(await fetch('/__face_review__/model.vrm')).arrayBuffer();
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.parseAsync(bytes,'/');const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
 const old=window.__debug.avatar();const group=new THREE.Group();group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);group.scale.copy(old.root.scale);
 vrm.scene.position.copy(old.vrm.scene.position);vrm.scene.quaternion.copy(old.vrm.scene.quaternion);vrm.scene.scale.copy(old.vrm.scene.scale);
 group.add(vrm.scene);vrm.humanoid.setNormalizedPose(pose);vrm.expressionManager.resetValues();vrm.update(0);group.updateMatrixWorld(true);
 old.root.visible=false;window.__debug.scene.add(group);
 window.__faceReview={vrm,group,sha};return {sha,expressions:vrm.expressionManager.expressions.map(e=>e.expressionName)};
}