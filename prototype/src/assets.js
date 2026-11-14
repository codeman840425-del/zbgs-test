import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { createSkirt } from "./cloth.js";
import { createEquipment } from "./equipment.js";
import { loadFoundationAvatar } from "./foundation-avatar.js";
export async function loadAvatar({ scene, renderer }) {
  if (!new URLSearchParams(location.search).has("legacy"))
    return loadFoundationAvatar({ scene, renderer });
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const response = await fetch("/assets/avatar.vrm");
  if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
  const avatarBuffer = await response.arrayBuffer();
  const avatarSha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", avatarBuffer)),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const gltf = await loader.parseAsync(avatarBuffer, "/assets/"),
    vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  const root = new THREE.Group();
  root.name = "RepresentativeAvatar";
  root.add(vrm.scene);
  scene.add(root);
  root.updateMatrixWorld(true);
  const outlineMaterials = [],
    outlineSize = new THREE.Vector2();
  vrm.scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = false;
      for (const material of Array.isArray(o.material)
        ? o.material
        : [o.material]) {
        // The source's 0.8 mm world-space outline falls below a screen pixel
        // at the room camera and breaks into dotted edges. Keep MToon shading
        // and double-sided source surfaces, but use a stable screen outline.
        if (material.outlineWidthMode && material.outlineWidthMode !== "none") {
          material.outlineWidthMode = "screenCoordinates";
          material.outlineWidthFactor = 0.0018;
          outlineMaterials.push(material);
        }
        if (material.name.startsWith("Tops_")) material.color?.set("#e2eaf0");
        if (/^(Body_00_SKIN|Face_00_SKIN)/.test(material.name))
          material.color?.set("#fff1e7");
      }
    }
  });
  const cloth = createSkirt(vrm, root, scene);
  const equipment = await createEquipment({ vrm, avatarSha256 });
  const newPantsId = "athletic-bermuda-v1";
  await equipment.load(newPantsId);
  let outfit = 0,
    debugBody = false,
    dynamics = true;
  const originals = new Map(),
    diagnostic = new Map();
  vrm.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (!materials.some((m) => /^(Body_00_SKIN|Tops_|Bottoms_)/.test(m.name)))
      return;
    originals.set(mesh, mesh.material);
    diagnostic.set(
      mesh,
      new THREE.MeshStandardMaterial({
        color: materials.some((m) => m.name.startsWith("Tops_"))
          ? "#738b97"
          : materials.some((m) => m.name.startsWith("Bottoms_"))
            ? "#475c6c"
            : "#a4afb1",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
  });
  // Preserve all original clothes, including the shorts underneath the skirt.
  // MToon uses material arrays; the old scalar-name visibility filter never
  // matched the shorts. Remove that ineffective code, do not "fix" it by hiding.
  function setOutfit(n) {
    outfit = [0, 1, 2].includes(Number(n)) ? Number(n) : 0;
    if (outfit === 2 && !debugBody) void equipment.equip(newPantsId);
    else equipment.unequip("bottoms-overlay");
    cloth.mesh.visible = outfit === 1 && !debugBody;
  }
  function setDebugBody(enabled) {
    debugBody = Boolean(enabled);
    // The source torso has missing skin beneath the shirt. Keep its actual
    // skinned shirt and shorts, with flat diagnostic materials and no outline.
    // This is NOT a newly completed body or a fitted practice-suit asset.
    for (const [mesh, materials] of originals)
      mesh.material = debugBody ? diagnostic.get(mesh) : materials;
    setOutfit(outfit);
  }
  function setDynamics(enabled) {
    dynamics = Boolean(enabled);
    vrm.springBoneManager?.reset();
  }
  function update(dt) {
    if (renderer) {
      const width = 2 / Math.max(1, renderer.getSize(outlineSize).y);
      for (const material of outlineMaterials)
        material.outlineWidthFactor = width;
    }
    vrm.update(dynamics ? dt : 0);
    if (!dynamics) vrm.springBoneManager?.reset();
  }
  const getDebugState = () => ({
    mode: debugBody ? "base" : "dressed",
    dynamics,
    label: debugBody ? "基础动作（保留衣片覆盖）" : "完整穿衣",
    description:
      "原模型胸腹皮肤缺面。基础模式保留原上衣及短裤的蒙皮几何，使用纯色材质；不是完整裸模或新制贴身服。",
    bodyComplete: false,
    originalCoveragePreserved: true,
  });
  function getOutfitInfo() {
    return {
      index: outfit,
      name: ["黑色短裤", "海军蓝百褶裙", "新增及膝裤 · 适配试验"][outfit],
      source: "pixiv VRM1_Constraint_Twist_Sample v1.0.1",
      skirt: cloth.info(),
      equipment: outfit === 2 ? equipment.get(newPantsId)?.stats : null,
      limitations: "保留原短裤；裙为近似重力布料，非通用衣库适配",
    };
  }
  return {
    vrm,
    equipment,
    root,
    setOutfit,
    setDebugBody,
    setDynamics,
    getDebugState,
    update,
    resetSecondary: () => {
      vrm.springBoneManager?.reset();
      cloth.reset();
    },
    getOutfitInfo,
    skirt: cloth.mesh,
    // Keep existing continuous draping for now: resetting a skipped solver at
    // seated re-equip failed visual QA. See RESPONSE-PERF-BASELINE.md.
    updateGarment: (sitProgress, dt, colliders = []) =>
      cloth.update(dt, colliders, dynamics),
  };
}
