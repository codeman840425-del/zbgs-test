import * as THREE from 'three';
import {VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider,
  VRMSpringBoneColliderShape, VRMSpringBoneColliderShapeSphere, VRMSpringBoneColliderShapeCapsule} from '@pixiv/three-vrm';

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

// Borrow the room's oriented-box projection without owning its mesh or matrices.
// A world sphere is conservatively expanded into a scalar local-box margin.
const finitePoint = p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const identityElement = (v,i) => Math.abs(v-(i%5===0?1:0))<1e-5;
function topRoot(node) {
  while (node.parent) node = node.parent;
  return node;
}
function validateRoomProxy(proxy, inverseCheck) {
  check(proxy?.mesh?.isObject3D && proxy.localBox?.isBox3 &&
    proxy.matrixWorld === proxy.mesh.matrixWorld && proxy.inverseMatrixWorld?.isMatrix4 &&
    typeof proxy.projectOut === 'function', '环境碰撞代理无效');
  const matrix = proxy.mesh.matrixWorld, inverse = proxy.inverseMatrixWorld;
  check(matrix.elements.every(Number.isFinite) && inverse.elements.every(Number.isFinite) &&
    Math.abs(matrix.determinant()) > 1e-12 &&
    Math.abs(matrix.elements[3])<1e-12 && Math.abs(matrix.elements[7])<1e-12 && Math.abs(matrix.elements[11])<1e-12 &&
    Math.abs(matrix.elements[15]-1)<1e-12, '环境碰撞变换无效');
  const lo = proxy.localBox.min, hi = proxy.localBox.max;
  check(finitePoint(lo) && finitePoint(hi) &&
    lo.x < hi.x && lo.y < hi.y && lo.z < hi.z, '环境碰撞包围盒无效');
  inverseCheck.multiplyMatrices(inverse, matrix);
  check(inverseCheck.elements.every(identityElement), '环境碰撞逆矩阵未刷新');
}

export function validateHairEnvironmentColliders(proxies) {
  check(Array.isArray(proxies) && proxies.length <= 24, '环境碰撞列表无效');
  const seen = new Set(), inverseCheck = new THREE.Matrix4();
  for (const proxy of proxies) {
    check(!seen.has(proxy), '环境碰撞代理重复');
    seen.add(proxy); validateRoomProxy(proxy, inverseCheck);
  }
  return proxies;
}

class RoomBoxShape extends VRMSpringBoneColliderShape {
  constructor(proxy) {
    super();
    this.proxy = proxy;
    this.offset = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.inverseCheck = new THREE.Matrix4();
  }
  get type() { return 'room-oriented-box'; }
  calculateCollision(_colliderMatrix, point, radius, target) {
    validateRoomProxy(this.proxy, this.inverseCheck);
    check(finitePoint(point) && Number.isFinite(radius) && radius >= 0, '环境碰撞采样无效');
    const e = this.proxy.inverseMatrixWorld.elements;
    const margin = radius * Math.max(Math.hypot(e[0],e[4],e[8]),
      Math.hypot(e[1],e[5],e[9]), Math.hypot(e[2],e[6],e[10]));
    check(Number.isFinite(margin), '环境碰撞半径转换无效');
    this.projected.copy(point);
    target.set(0,0,0);
    if (!this.proxy.projectOut(this.projected, margin)) return 0;
    target.subVectors(this.projected, point);
    const length = target.length();
    check(Number.isFinite(length), '环境碰撞修正无效');
    if (length === 0) return 0;
    target.multiplyScalar(1 / length);
    return -length;
  }
}

// Separate official manager prevents loading or resetting a staged hairstyle
// from resetting the original VRM's hair. Called once after humanoid/raw sync.
export function createHairSpring({vrm,scene,config,environmentColliders=[]}) {
  validateHairSpringConfig(config);
  const manager=new VRMSpringBoneManager(), colliders=[], joints=[], names=new Map();
  const environmentGroup = {colliders:[]}, ownedColliders = new Set(), cleanupErrors = [];
  let environmentSources = [], environmentRoots = [], sceneRoot = topRoot(scene), changingEnvironment = false;
  let initialized=false,disposed=false,wasEnabled=true,updates=0,resets=0;
  scene.traverse(node=>{if(node.name){const values=names.get(node.name)||[];values.push(node);names.set(node.name,values);}});
  const bone=name=>{const list=names.get(name);check(list?.length===1&&list[0].isBone,`缺少唯一附加骨 ${name}`);return list[0];};
  try{
    for(const c of config.colliders){
      const parent=vrm.humanoid.getRawBoneNode(c.bone);check(parent,`缺少人体碰撞挂点 ${c.bone}`);
      const params={offset:new THREE.Vector3().fromArray(c.offset),radius:c.radius};
      if(c.shape==='capsule')params.tail=new THREE.Vector3().fromArray(c.tail);
      const collider=new VRMSpringBoneCollider(c.shape==='sphere'?new VRMSpringBoneColliderShapeSphere(params):new VRMSpringBoneColliderShapeCapsule(params));
      colliders.push(collider);ownedColliders.add(collider);parent.add(collider);
    }
    for(const j of config.joints){
      const b=bone(j.bone),child=bone(j.child);check(child.parent===b,'附加骨链父子关系不匹配');
      check(child.position.length()>1e-5,'附加骨长度为零');
      const joint=new VRMSpringBoneJoint(b,child,{hitRadius:j.hitRadius,stiffness:j.stiffness,
        gravityPower:j.gravityPower,gravityDir:new THREE.Vector3().fromArray(j.gravityDir),dragForce:j.dragForce},[{colliders},environmentGroup]);
      joints.push(joint);manager.addJoint(joint);
    }
    setEnvironmentColliders(environmentColliders);
  }catch(error){dispose();throw error;}
  function removeColliders(values) {
    for (const collider of values) {
      ownedColliders.delete(collider);
      try { collider.removeFromParent(); }
      catch (error) { cleanupErrors.push(String(error)); }
    }
  }
  function dispose() {
    if(disposed)return;
    disposed=true;
    environmentSources=[]; environmentRoots=[]; environmentGroup.colliders=[];
    removeColliders(ownedColliders);
    joints.forEach(j=>manager.deleteJoint(j));
  }
  function setEnvironmentColliders(proxies) {
    if (disposed) return;
    check(Array.isArray(proxies), '环境碰撞列表无效');
    if (proxies.length === environmentSources.length &&
        environmentSources.every((proxy,i)=>proxy===proxies[i])) return;
    check(!changingEnvironment, '环境碰撞更新重入');
    validateHairEnvironmentColliders(proxies);
    const sources = proxies.slice(), next = [];
    changingEnvironment = true;
    try {
      for (const proxy of sources) {
        const collider = new VRMSpringBoneCollider(new RoomBoxShape(proxy));
        next.push(collider); ownedColliders.add(collider);
        proxy.mesh.add(collider);
        if (disposed) { removeColliders(next); return; }
      }
      const previous = environmentGroup.colliders;
      environmentSources = sources; environmentRoots = sources.map(proxy=>topRoot(proxy.mesh));
      sceneRoot = topRoot(scene); environmentGroup.colliders = next;
      // Official manager caches the collider ancestry dependency order.
      // Membership changes invalidate it through the public joint API.
      refreshDependencies();
      removeColliders(previous);
    } catch (error) {
      removeColliders(next); throw error;
    } finally { changingEnvironment = false; }
  }
  function refreshDependencies() {
    for (const joint of joints) { manager.deleteJoint(joint); manager.addJoint(joint); }
  }
  function refreshAttachmentRoots() {
    const current = topRoot(scene);
    let changed = current !== sceneRoot;
    sceneRoot = current;
    for (let i=0;i<environmentSources.length;i++) {
      const root = topRoot(environmentSources[i].mesh);
      if (root !== environmentRoots[i]) changed = true;
      environmentRoots[i] = root;
    }
    // Detached actors can be reset before joining the room. Its first shared
    // update must sort against the now-connected dependency tree.
    if (changed) refreshDependencies();
  }
  function reset(){
    if(disposed)return;
    refreshAttachmentRoots();
    scene.updateWorldMatrix(true,true);
    if(!initialized){manager.setInitState();initialized=true;}
    manager.reset();scene.updateWorldMatrix(true,true);resets++;
  }
  return {
    reset, setEnvironmentColliders,
    update(dt,enabled=true){
      if(disposed)return;
      if(!initialized)reset();
      if(enabled!==wasEnabled){reset();wasEnabled=enabled;}
      if(!enabled||dt===0)return;
      check(Number.isFinite(dt)&&dt>0&&dt<=.1,'时间步超出共用动画循环范围');
      refreshAttachmentRoots();
      manager.update(dt);updates++;
    },
    getState:()=>({implementation:'three-vrm-springbone-3.5.5',jointCount:joints.length,colliderCount:colliders.length,
      bodyColliderCount:colliders.length,environmentColliderCount:environmentGroup.colliders.length,
      environmentCollisionScope:'conservative-expanded-oriented-box-point-sphere',cleanupErrors:[...cleanupErrors],
      initialized,enabled:wasEnabled,updates,resets,localRotations:joints.map(j=>j.bone.quaternion.toArray()),
      worldTails:joints.map(j=>j.child.getWorldPosition(new THREE.Vector3()).toArray())}),
    dispose,
  };
}
