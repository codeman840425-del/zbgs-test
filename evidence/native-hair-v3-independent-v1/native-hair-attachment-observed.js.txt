import * as THREE from 'three';
import {VRMSpringBoneLoaderPlugin} from '@pixiv/three-vrm';
import {createEquipmentLoader,initializeEquipmentMaterials,updateEquipmentMaterials,collectEquipmentTextures} from './equipment-material-loader.js';

const check=(ok,message)=>{if(!ok)throw Error(`原生发型适配：${message}`);};
const finiteVector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a,b)=>a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<1e-5);

export function validateNativeHairFit(fit,entry,body,manifest) {
  const a=fit?.attachment,s=fit?.nativeSpring;
  check(manifest?.schema==='character-hairstyle-v2'&&manifest.physics==='vrm-spring-native'&&
    manifest.mount==='avatar-rest-local'&&manifest.skinned===true&&manifest.id===entry.id&&
    manifest.sha256===entry.assetSha256&&manifest.compatibleBodies?.includes(body),'清单身份不匹配');
  check(fit?.schema==='character-hair-fit-v3'&&fit.physics===manifest.physics&&
    fit.id===entry.fit?.id&&fit.version===entry.fit.version&&fit.styleId===entry.id&&
    fit.targetBodySha256===body&&fit.sourceBodySha256===entry.sourceBodySha256&&
    fit.sourceVrmSha256===fit.sourceBodySha256&&fit.assetSha256===entry.assetSha256&&
    manifest.sourceBodySha256===fit.sourceBodySha256&&manifest.sourceVrmSha256===fit.sourceVrmSha256&&
    /^[a-f0-9]{64}$/.test(fit.sourceBodySha256),'来源或版型身份不匹配');
  check(manifest.fit&&Object.keys(entry.fit).every(k=>manifest.fit[k]===entry.fit[k]),'版型登记不匹配');
  check(Array.isArray(fit.sourceMaterials)&&fit.sourceMaterials.length>0&&fit.sourceMaterials.length<=8&&
    fit.sourceMaterials.every(n=>typeof n==='string'&&n.includes('_HAIR'))&&new Set(fit.sourceMaterials).size===fit.sourceMaterials.length&&
    same(fit.sourceMaterials,entry.sourceMaterials)&&same(fit.sourceMaterials,manifest.sourceMaterials),'材质集合不匹配');
  check(a?.parent==='vrm.scene'&&a.space==='avatar-rest-local'&&same(a.position,[0,0,0])&&
    same(a.quaternion,[0,0,0,1])&&same(a.scale,[1,1,1]),'挂接空间不匹配');
  check(fit.hideOriginal?.hideWholeBody===false&&Array.isArray(fit.hideOriginal.materialNames)&&
    fit.hideOriginal.materialNames.length>0&&fit.hideOriginal.materialNames.every(n=>fit.sourceMaterials.includes(n))&&
    new Set(fit.hideOriginal.materialNames).size===fit.hideOriginal.materialNames.length,'原发隐藏范围无效');
  check(Array.isArray(fit.externalFrames)&&fit.externalFrames.length>0&&fit.externalFrames.length<=32,'身体参考帧缺失');
  const nodes=new Set(),names=new Set(),targets=new Set();
  for(const frame of fit.externalFrames) {
    const rest=frame.restLocal;
    check(Number.isSafeInteger(frame.node)&&frame.node>=0&&!nodes.has(frame.node)&&
      typeof frame.name==='string'&&!names.has(frame.name)&&typeof frame.targetRawNode==='string'&&!targets.has(frame.targetRawNode)&&
      (frame.humanoidSemantic===null||typeof frame.humanoidSemantic==='string')&&
      finiteVector(rest?.position,3)&&finiteVector(rest.quaternion,4)&&finiteVector(rest.scale,3)&&
      rest.scale.every(v=>v>0)&&Math.abs(Math.hypot(...rest.quaternion)-1)<1e-5&&finiteVector(frame.sourceRestMatrix,16),'参考帧数据无效');
    nodes.add(frame.node);names.add(frame.name);targets.add(frame.targetRawNode);
  }
  check(s?.extension==='VRMC_springBone'&&s.specVersion==='1.0'&&typeof s.centerProxy==='string'&&names.has(s.centerProxy)&&
    ['springCount','expectedJointCount','colliderCount','colliderGroupCount'].every(k=>Number.isSafeInteger(s[k])&&s[k]>0&&s[k]<=128)&&
    Number.isSafeInteger(fit.expectedMeshCount)&&fit.expectedMeshCount>0&&fit.expectedMeshCount<=8&&
    Array.isArray(fit.expectedSkinJointCounts)&&fit.expectedSkinJointCounts.length===fit.expectedMeshCount&&
    fit.expectedSkinJointCounts.every(n=>Number.isSafeInteger(n)&&n>1&&n<=64),'原生动态结构无效');
  return a;
}

// Separate loaders own all replacement resources. Track resolved dependencies
// too, so a later parser failure or late dependency cannot leak staged resources.
export async function loadNativeHairAttachment({vrm,bytes,url,fit,sha256,hairFit}) {
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  const released=new Set();
  let closed=false,scene=null,manager=null,frames=[],initialized=false,updates=0,time=0;
  const release=resource=>{if(!released.has(resource)){released.add(resource);resource.dispose();}};
  const ownMaterial=m=>{
    if(!m?.isMaterial)return;
    materials.add(m);collectEquipmentTextures(m,textures);
    if(closed){release(m);for(const texture of textures)release(texture);}
  };
  const ownObject=object=>object?.traverse?.(node=>{
    if(!node.isMesh)return;
    geometries.add(node.geometry);if(node.skeleton)skeletons.add(node.skeleton);
    for(const m of Array.isArray(node.material)?node.material:[node.material])ownMaterial(m);
    if(closed){release(node.geometry);if(node.skeleton)release(node.skeleton);}
  });
  function dispose() {
    if(closed)return;closed=true;
    scene?.removeFromParent();
    if(manager){for(const collider of manager.colliders)collider.removeFromParent();for(const joint of [...manager.joints])manager.deleteJoint(joint);}
    for(const resources of [geometries,skeletons,materials,textures])for(const resource of resources)release(resource);
    frames=[];
  }
  try {
    const loader=createEquipmentLoader();
    loader.register(parser=>{
      const get=parser.getDependency.bind(parser);
      parser.getDependency=(type,index)=>{
        const result=get(type,index);
        result.then(value=>{
          if(type==='texture'&&value?.isTexture){textures.add(value);if(closed)release(value);}
          else if(type==='material')ownMaterial(value);
          else if(type==='mesh'||type==='node')ownObject(value);
        },()=>{});
        return result;
      };
      return {name:'NativeHairResourceOwnership'};
    });
    loader.register(parser=>new VRMSpringBoneLoaderPlugin(parser));
    const gltf=await loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));
    scene=gltf.scene;scene.visible=false;scene.userData.nativeHairAttachment=true;manager=gltf.userData.vrmSpringBoneManager;
    ownObject(scene);
    const doc=gltf.parser.json,s=fit.nativeSpring,ext=doc.extensions?.VRMC_springBone;
    check(!doc.extensions?.VRMC_vrm&&!doc.extensions?.VRM&&!gltf.animations.length,'资源包含完整人物或动画');
    check(doc.buffers?.length===1&&!doc.buffers[0].uri&&doc.images?.every(image=>Number.isSafeInteger(image.bufferView)), '资源含外部依赖');
    check(scene.position.lengthSq()===0&&scene.quaternion.equals(new THREE.Quaternion())&&scene.scale.equals(new THREE.Vector3(1,1,1)),'场景根变换不匹配');
    check(doc.meshes?.length===fit.expectedMeshCount&&doc.skins?.length===fit.expectedSkinJointCounts.length&&
      doc.skins.every((skin,i)=>skin.joints.length===fit.expectedSkinJointCounts[i]),'网格或骨表数量不匹配');
    check(fit.meshes?.length===doc.meshes.length&&fit.skins?.length===doc.skins.length,'源属性清单缺失');
    async function verifyAccessor(signature,index) {
      const a=doc.accessors?.[index],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
      const width={5121:1,5123:2,5125:4,5126:4}[a?.componentType]*components[a?.type];
      check(signature?.accessor===index&&a&&!a.sparse&&Number.isFinite(width)&&
        ['componentType','type','count'].every(k=>a[k]===signature[k])&&Boolean(a.normalized)===signature.normalized,'源属性结构不匹配');
      // GLTFLoader normalizes skin weights in its shared decoded buffer. Verify
      // author bytes against the original GLB, before that runtime conversion.
      const view=doc.bufferViews[a.bufferView],header=new DataView(bytes),binOffset=28+header.getUint32(12,true);
      const input=new Uint8Array(bytes,binOffset+(view.byteOffset??0),view.byteLength);
      const packed=new Uint8Array(a.count*width),stride=view.byteStride??width,offset=a.byteOffset??0;
      check(offset+(a.count-1)*stride+width<=input.length,'源属性越界');
      for(let i=0;i<a.count;i++)packed.set(input.subarray(offset+i*stride,offset+i*stride+width),i*width);
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',packed))].map(v=>v.toString(16).padStart(2,'0')).join('');
      check(digest===signature.sha256,`源属性字节身份不匹配 accessor ${index}`);
    }
    for(const mesh of fit.meshes) {
      const primitive=doc.meshes[mesh.mesh]?.primitives?.[mesh.primitive];
      check(primitive&&doc.nodes[mesh.node]?.mesh===mesh.mesh&&doc.nodes[mesh.node]?.skin===mesh.skin&&
        primitive.material===mesh.material&&doc.materials[mesh.material]?.name===mesh.materialName&&
        same(Object.keys(primitive.attributes).sort(),Object.keys(mesh.attributes).sort()),'网格消费关系不匹配');
      for(const [semantic,signature] of Object.entries(mesh.attributes))await verifyAccessor(signature,primitive.attributes[semantic]);
      await verifyAccessor(mesh.indices,primitive.indices);
    }
    for(const skin of fit.skins) {
      const source=doc.skins[skin.index];
      check(same(source?.joints,skin.joints)&&same(source.joints.map(index=>doc.nodes[index].name),skin.jointNames),'骨表顺序不匹配');
      await verifyAccessor(skin.inverseBindMatrices,source.inverseBindMatrices);
    }
    check(ext?.specVersion===s.specVersion&&ext.springs?.length===s.springCount&&
      ext.colliders?.length===s.colliderCount&&ext.colliderGroups?.length===s.colliderGroupCount&&manager&&
      manager.joints.size===s.expectedJointCount&&manager.colliders.length===s.colliderCount&&manager.colliderGroups.length===s.colliderGroupCount,'官方动态加载不完整');
    check(same([...manager.joints].map(j=>j.bone.name).sort(),[...s.jointNames].sort()),'动态骨集合不匹配');
    const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node);});
    check(meshes.length>0&&meshes.every(mesh=>Object.keys(mesh.geometry.morphAttributes).length===0),'含未登记形态键');
    const cleanName=m=>m.isOutline?m.name.replace(/ \(Outline\)$/,''):m.name;
    check([...materials].every(m=>m.isMToonMaterial&&fit.sourceMaterials.includes(cleanName(m)))&&
      fit.sourceMaterials.every(name=>[...materials].some(m=>!m.isOutline&&m.name===name)),'自有MToon材质集合不匹配');
    scene.updateMatrixWorld(true);
    for(const mesh of meshes) {
      const skin=mesh.skeleton,g=mesh.geometry,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
      check(mesh.isSkinnedMesh&&skin&&fit.skins.some(s=>same(s.jointNames,skin.bones.map(b=>b.name)))&&
        skin.bones.every(b=>b.isBone&&scene.getObjectByName(b.name)===b)&&
        skin.boneInverses.length===skin.bones.length&&skin.boneInverses.every(m=>m.elements.every(Number.isFinite))&&
        indices?.itemSize===4&&weights?.itemSize===4&&indices.count===g.attributes.position.count&&weights.count===indices.count,'加载蒙皮结构不匹配');
      for(let i=0;i<weights.count;i++) {
        let sum=0;
        for(let axis=0;axis<4;axis++) {
          const w=weights.getComponent(i,axis),joint=indices.getComponent(i,axis);
          check(Number.isFinite(w)&&w>=0&&w<=1&&Number.isInteger(joint)&&joint>=0&&joint<skin.bones.length,'加载权重或骨索引无效');sum+=w;
        }
        check(Math.abs(sum-1)<1e-4,'加载权重未归一化');
      }
    }
    const allTargets=new Map();
    function collectTarget(node) {
      if(node.userData.nativeHairAttachment)return;
      const list=allTargets.get(node.name)??[];list.push(node);allTargets.set(node.name,list);
      node.children.forEach(collectTarget);
    }
    collectTarget(vrm.scene);
    frames=await Promise.all(fit.externalFrames.map(async record=>{
      const proxy=await gltf.parser.getDependency('node',record.node),matches=allTargets.get(record.targetRawNode);
      check(proxy.name===record.name&&matches?.length===1,'参考骨缺失或名称歧义');
      const target=matches[0],rest=record.humanoidSemantic?vrm.humanoid.rawRestPose?.[record.humanoidSemantic]:null;
      check(!record.humanoidSemantic||vrm.humanoid.getRawBoneNode(record.humanoidSemantic)===target,'目标骨语义不匹配');
      check(record.humanoidSemantic?Boolean(rest):record.parentName===null&&target.parent===vrm.scene,'非语义参考帧无静止依据');
      const local=record.restLocal;
      check(near(proxy.position.toArray(),local.position)&&near(proxy.quaternion.toArray(),local.quaternion)&&near(proxy.scale.toArray(),local.scale)&&
        near(proxy.matrixWorld.elements,record.sourceRestMatrix)&&
        near(rest?.position??target.position.toArray(),local.position)&&near(rest?.rotation??target.quaternion.toArray(),local.quaternion)&&
        near(target.scale.toArray(),local.scale),'来源或目标静止参考不匹配');
      check((proxy.parent===scene?null:proxy.parent?.name)===record.parentName&&
        (target.parent===vrm.scene?null:target.parent?.name)===record.targetParentName,'参考骨层级不匹配');
      check(![...manager.joints].some(j=>j.bone===proxy),'身体代理被原生spring写入');
      proxy.matrixAutoUpdate=false;
      let depth=0;for(let p=proxy.parent;p;p=p.parent)depth++;
      return {proxy,target,depth};
    }));
    frames.sort((a,b)=>a.depth-b.depth);
    check([...manager.joints].every(j=>j.center?.name===s.centerProxy&&scene.getObjectByName(s.centerProxy)===j.center),'动态参考空间改变');
    for(const mesh of meshes){mesh.castShadow=true;mesh.frustumCulled=false;mesh.userData.assetRole='hair';}
    initializeEquipmentMaterials(meshes);
    const items=[{container:scene,meshes}],inverse=new THREE.Matrix4();
    function sync() {
      check(!closed,'资源已销毁');
      for(const {proxy,target} of frames){
        target.updateWorldMatrix(true,false);proxy.parent.updateWorldMatrix(true,false);
        check(Number.isFinite(proxy.parent.matrixWorld.determinant())&&Math.abs(proxy.parent.matrixWorld.determinant())>1e-12,'参考空间不可逆');
        proxy.matrix.copy(inverse.copy(proxy.parent.matrixWorld).invert()).multiply(target.matrixWorld);
        check(proxy.matrix.elements.every(Number.isFinite),'参考空间非有限');
        proxy.matrix.decompose(proxy.position,proxy.quaternion,proxy.scale);
        proxy.matrixWorldNeedsUpdate=true;proxy.updateWorldMatrix(false,false);
      }
    }
    function reset() {if(closed)return;sync();manager.reset();}
    return {native:true,scene,sha256,hairFit,materialBase:new Map(),dispose,
      attach() {
        check(!closed&&!initialized,'挂接生命周期无效');
        vrm.scene.add(scene);check(!closed,'挂接时资源已销毁');
        sync();manager.setInitState();initialized=true;
      },
      dynamics:{reset,
        update(dt,enabled=true) {
          check(Number.isFinite(dt)&&dt>=0,'时间步无效');
          if(closed||!scene.visible)return;
          sync();if(enabled&&dt>0){manager.update(dt);updates++;time+=dt;}else if(!enabled)manager.reset();
          updateEquipmentMaterials(items,enabled?dt:0);
        },
        getState:()=>({method:'official-native-VRMC_springBone',jointCount:manager.joints.size,
          colliderCount:manager.colliders.length,externalFrameCount:frames.length,updates,simulationTime:time,
          reference:s.centerProxy,environmentColliders:0,disposed:closed}),
      }};
  } catch(error){dispose();throw error;}
}
