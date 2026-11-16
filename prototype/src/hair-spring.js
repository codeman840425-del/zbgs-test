import * as THREE from 'three';
import {VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeSphere, VRMSpringBoneColliderShapeCapsule} from '@pixiv/three-vrm';

const check=(ok,reason)=>{if(!ok)throw Error(`发型动态适配：${reason}`);};
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const scalar=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
const name=x=>typeof x==='string'&&x.length>0&&x.length<=128;

export function validateHairSpringConfig(config) {
  check(config?.schema==='hair-spring-v1','未知配置版本');
  check(Array.isArray(config.joints)&&config.joints.length>0&&config.joints.length<=32,'骨链数量无效');
  const seen=new Set();
  for(const j of config.joints){
    check(j&&name(j.bone)&&name(j.child)&&j.bone!==j.child&&!seen.has(j.bone),'骨链名称重复或缺失');
    seen.add(j.bone);
    check(scalar(j.hitRadius,0,.15)&&scalar(j.stiffness,0,50)&&scalar(j.gravityPower,0,5)&&
      scalar(j.dragForce,0,1)&&vector(j.gravityDir,3)&&Math.abs(Math.hypot(...j.gravityDir)-1)<1e-5,'骨链物理参数无效');
  }
  check(Array.isArray(config.colliders)&&config.colliders.length<=24,'碰撞配置无效');
  for(const c of config.colliders)check(c&&name(c.bone)&&['sphere','capsule'].includes(c.shape)&&
    vector(c.offset,3)&&scalar(c.radius,.001,.6)&&(c.shape!=='capsule'||vector(c.tail,3)),'碰撞形状无效');
  return config;
}

// The replacement owns its auxiliary skeleton; it must never borrow or mutate
// humanoid bones. Body bones supply only collision frames and the head mount.
export function validateHairSkin(scene,meshes) {
  scene.updateWorldMatrix(true,false);scene.updateMatrixWorld(true);
  const nodes=new Set();scene.traverse(n=>nodes.add(n));
  check(meshes.length>0&&meshes.length<=8,'蒙皮网格数量无效');
  for(const mesh of meshes){
    const g=mesh.geometry, skin=mesh.skeleton, indices=g.attributes.skinIndex, weights=g.attributes.skinWeight;
    check(mesh.isSkinnedMesh&&skin&&indices?.itemSize===4&&weights?.itemSize===4&&
      indices.count===g.attributes.position.count&&weights.count===indices.count,'蒙皮属性缺失');
    check(skin.bones.length>1&&skin.bones.length<=64&&skin.bones.every(b=>b.isBone&&nodes.has(b))&&
      skin.boneInverses.length===skin.bones.length&&skin.boneInverses.every(m=>m.elements.every(Number.isFinite)), '绑定骨架无效');
    // v2 exports are authored in their rest pose, before any head attachment.
    // Finite inverse binds alone can still displace every strand at load time.
    for(let i=0;i<skin.bones.length;i++){
      const rest=new THREE.Matrix4().copy(mesh.bindMatrixInverse).multiply(skin.bones[i].matrixWorld)
        .multiply(skin.boneInverses[i]).multiply(mesh.bindMatrix);
      const error=Math.max(...rest.elements.map((v,k)=>Math.abs(v-(k%5===0?1:0))));
      check(Number.isFinite(error)&&error<1e-5,`静止绑定不匹配 ${mesh.name}/${skin.bones[i].name}[${i}]，误差 ${error}`);
    }
    for(let i=0;i<weights.count;i++){
      let sum=0;
      for(let axis=0;axis<4;axis++){
        const w=weights.getComponent(i,axis),b=indices.getComponent(i,axis);
        check(scalar(w,0,1)&&Number.isInteger(b)&&b>=0&&b<skin.bones.length,'蒙皮索引或权重无效');sum+=w;
      }
      check(Math.abs(sum-1)<1e-4,'权重未归一化');
    }
  }
}

// Separate official manager prevents loading or resetting a staged hairstyle
// from resetting the original VRM's hair. Called once after humanoid/raw sync.
export function createHairSpring({vrm,scene,config}) {
  validateHairSpringConfig(config);
  const manager=new VRMSpringBoneManager(), colliders=[], joints=[], names=new Map();
  let initialized=false,disposed=false,wasEnabled=true,updates=0,resets=0;
  scene.traverse(node=>{if(node.name){const values=names.get(node.name)||[];values.push(node);names.set(node.name,values);}});
  const bone=name=>{const list=names.get(name);check(list?.length===1&&list[0].isBone,`缺少唯一附加骨 ${name}`);return list[0];};
  try{
    for(const c of config.colliders){
      const parent=vrm.humanoid.getRawBoneNode(c.bone);check(parent,`缺少人体碰撞挂点 ${c.bone}`);
      const params={offset:new THREE.Vector3().fromArray(c.offset),radius:c.radius};
      if(c.shape==='capsule')params.tail=new THREE.Vector3().fromArray(c.tail);
      const collider=new VRMSpringBoneCollider(c.shape==='sphere'?new VRMSpringBoneColliderShapeSphere(params):new VRMSpringBoneColliderShapeCapsule(params));
      colliders.push(collider);parent.add(collider);
    }
    for(const j of config.joints){
      const b=bone(j.bone),child=bone(j.child);check(child.parent===b,'附加骨链父子关系不匹配');
      check(child.position.length()>1e-5,'附加骨长度为零');
      const joint=new VRMSpringBoneJoint(b,child,{hitRadius:j.hitRadius,stiffness:j.stiffness,
        gravityPower:j.gravityPower,gravityDir:new THREE.Vector3().fromArray(j.gravityDir),dragForce:j.dragForce},[{colliders}]);
      joints.push(joint);manager.addJoint(joint);
    }
  }catch(error){colliders.forEach(c=>c.removeFromParent());throw error;}
  function reset(){
    if(disposed)return;
    scene.updateWorldMatrix(true,true);
    if(!initialized){manager.setInitState();initialized=true;}
    manager.reset();scene.updateWorldMatrix(true,true);resets++;
  }
  return {
    reset,
    update(dt,enabled=true){
      if(disposed)return;
      if(!initialized)reset();
      if(enabled!==wasEnabled){reset();wasEnabled=enabled;}
      if(!enabled||dt===0)return;
      check(Number.isFinite(dt)&&dt>0&&dt<=.1,'时间步超出共用动画循环范围');
      manager.update(dt);updates++;
    },
    getState:()=>({implementation:'three-vrm-springbone-3.5.5',jointCount:joints.length,colliderCount:colliders.length,
      initialized,enabled:wasEnabled,updates,resets,localRotations:joints.map(j=>j.bone.quaternion.toArray()),
      worldTails:joints.map(j=>j.child.getWorldPosition(new THREE.Vector3()).toArray())}),
    dispose(){if(disposed)return;disposed=true;colliders.forEach(c=>c.removeFromParent());joints.forEach(j=>manager.deleteJoint(j));},
  };
}
