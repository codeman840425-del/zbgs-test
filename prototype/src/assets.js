import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { createSkirt } from "./cloth.js";
export async function loadAvatar({ scene }) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync("/assets/avatar.vrm"),
    vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  const root = new THREE.Group();
  root.name = "RepresentativeAvatar";
  root.add(vrm.scene);
  scene.add(root);
  root.updateMatrixWorld(true);
  vrm.scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  const cloth = createSkirt(vrm, root, scene),
    bottoms = [];
  let outfit = 0;
  vrm.scene.traverse((o) => {
    if (o.isMesh && o.material?.name?.includes("Bottoms")) bottoms.push(o);
  });
  // These are alternative lower-body equipment slots, not two outer garments
  // worn simultaneously. Body geometry remains enabled for collision inspection.
  function setOutfit(n) {
    outfit = Number(n) ? 1 : 0;
    cloth.mesh.visible = !!outfit;
    for (const mesh of bottoms) mesh.visible = !outfit;
  }
  function getOutfitInfo() {
    return {
      index: outfit,
      name: outfit ? "海军蓝百褶裙" : "黑色短裤",
      source: "pixiv VRM1_Constraint_Twist_Sample v1.0.1",
      skirt: cloth.info(),
      limitations: "近似重力布料；裤裙替换同一装备位；非通用衣库适配",
    };
  }
  return {
    vrm,
    root,
    setOutfit,
    getOutfitInfo,
    skirt: cloth.mesh,
    updateGarment: (sitProgress, dt, colliders = []) =>
      cloth.update(dt, colliders),
  };
}
