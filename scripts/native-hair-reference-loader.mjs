import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
export async function install(expected){
 const d=window.__debug,a=d.avatar();
 if(a.profile.sha256!=='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81')throw Error('Wrong room actor');
 const bytes=await (await fetch('/__hair_reference__/model.vrm')).arrayBuffer();
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==expected)throw Error('VRM identity mismatch');
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const g=await loader.parseAsync(bytes,'/__hair_reference__/'),v=g.userData.vrm;
 if(!v?.humanoid||v.meta.metaVersion!=='1')throw Error('Expected native VRM1');
 const root=new THREE.Group();root.add(v.scene);d.scene.add(root);
 const previousUpdate=a.update,previousRender=d.renderer.render,visible=a.root.visible;
 let updates=0,deltaTotal=0,maxNormalizedError=0,lastSample=-Infinity,disposed=false;
 const samples=[],pairs=[];
 for(const [name,bone] of Object.entries(a.vrm.humanoid.normalizedHumanBones)){
  const target=v.humanoid.getNormalizedBoneNode(name);if(!target)throw Error('Missing bone '+name);
  pairs.push([bone.node,target]);
 }
 v.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
 const hairMaterials=new Set();v.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/_HAIR/.test(m.name))hairMaterials.add(m.name);});
 function sync(dt){
  root.position.copy(a.root.position);root.quaternion.copy(a.root.quaternion);root.scale.copy(a.root.scale);
  v.scene.position.copy(a.vrm.scene.position);v.scene.quaternion.copy(a.vrm.scene.quaternion);v.scene.scale.copy(a.vrm.scene.scale);
  for(const [s,t] of pairs){t.position.copy(s.position);t.quaternion.copy(s.quaternion);t.scale.copy(s.scale);maxNormalizedError=Math.max(maxNormalizedError,...t.position.toArray().map((x,i)=>Math.abs(x-s.position.toArray()[i])),...t.quaternion.toArray().map((x,i)=>Math.abs(x-s.quaternion.toArray()[i])));}
  for(const e of a.vrm.expressionManager.expressions)if(v.expressionManager.getExpression(e.expressionName))v.expressionManager.setValue(e.expressionName,a.vrm.expressionManager.getValue(e.expressionName));
  root.updateMatrixWorld(true);v.update(dt);root.updateMatrixWorld(true);
  if(dt>0){updates++;deltaTotal+=dt;}
  const s=d.snapshot();
  if(s.simulationTime-lastSample>=.1){lastSample=s.simulationTime;samples.push({t:s.simulationTime,dt,mode:s.mode,speed:s.speed,distance:s.distance,root:root.position.toArray(),moving:s.motion.moving,frame:s.frameMs});}
 }
 a.update=function(dt,state){previousUpdate.call(a,dt,state);sync(dt);};
 d.renderer.render=function(scene,camera){if(!disposed)sync(0);return previousRender.call(this,scene,camera);};
 a.root.visible=false;sync(0);v.springBoneManager?.reset();
 const info={sha:hash,normalizedBonePairs:pairs.length,hairMaterials:[...hairMaterials],springJoints:v.springBoneManager?.joints?.size??null};
 window.__hairReference={info,samples,show(value){root.visible=value;a.root.visible=!value;},reset(){sync(0);v.springBoneManager?.reset();},summary:()=>({updates,deltaTotal,maxNormalizedError}),dispose(){if(disposed)return;disposed=true;a.update=previousUpdate;d.renderer.render=previousRender;a.root.visible=visible;root.removeFromParent();VRMUtils.deepDispose(v.scene);delete window.__hairReference;}};
 return info;
}
