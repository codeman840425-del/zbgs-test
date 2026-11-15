import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { createM1Equipment } from "./m1-equipment.js";
import { foundationProfile } from "./foundation-profiles.js";
import { createLivePresentation } from "./live-presentation.js";
import { validateForearmProfile } from "./forearm-envelope-projection.js";
import { validateJointHandProfile } from "./joint-hand-workspace.mjs";

export async function loadFoundationAvatar({ scene, renderer, bodyType = "female", attachToScene = true }) {
  const config = foundationProfile(bodyType), url = config.url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Foundation HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const sha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (sha256 !== config.sha256) throw new Error("Foundation identity mismatch");
  let forearmCollision = null;
  if (config.forearmCollision) {
    const response = await fetch(config.forearmCollision.url);
    if (!response.ok) throw new Error("Forearm collision profile failed to load");
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(n => n.toString(16).padStart(2, "0")).join("");
    if (digest !== config.forearmCollision.sha256) throw new Error("Forearm collision profile integrity mismatch");
    forearmCollision = JSON.parse(new TextDecoder().decode(bytes));
    if (!validateForearmProfile(forearmCollision, sha256)) throw new Error("Forearm collision body identity mismatch");
  }
  let jointHandCollision = null;
  if (config.handSurfaceContact) {
    const response = await fetch(config.handSurfaceContact.url);
    if (!response.ok) throw new Error("Joint-hand profile failed to load");
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
    if (digest !== config.handSurfaceContact.sha256) throw new Error("Joint-hand profile integrity mismatch");
    jointHandCollision = JSON.parse(new TextDecoder().decode(bytes));
    if (!validateJointHandProfile(jointHandCollision, sha256)) throw new Error("Joint-hand body identity/schema mismatch");
  }
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buffer, "/assets/foundation/");
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  const root = new THREE.Group();
  root.name = "M1CompleteFoundation";
  root.add(vrm.scene);
  if (attachToScene) scene.add(root);
  root.updateMatrixWorld(true);
  const sourceMaterials = new Map(),
    bodyMaterials = new Map(),
    clothes = [],
    bodyMeshes = [],
    shoes = [],
    size = new THREE.Vector2();
  let debugBody = false,
    outfit = 0,
    dynamics = true;
  let equipment, livePresentation;
  try {
  vrm.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (materials.some((m) => /Body_.*SKIN/.test(m.name))) {
      bodyMeshes.push(mesh);
      sourceMaterials.set(mesh, mesh.material);
      bodyMaterials.set(
        mesh,
        materials.map(
          (sourceMaterial) =>
            new THREE.MeshStandardMaterial({
              color: "#728e9b",
              roughness: 1,
              side: THREE.DoubleSide,
              // Keep the outline group, but do not redraw its unexpanded skin.
              visible: sourceMaterial.isOutline !== true,
            }),
        ),
      );
    }
    if (materials.some((m) => /Shoes/i.test(m.name))) shoes.push(mesh);
    else if (materials.some((m) => /_CLOTH/.test(m.name))) clothes.push(mesh);
  });
  equipment = await createM1Equipment({ vrm, avatarSha256: sha256, bodyType });
  const surfaces = equipment.getAssetProfile();
  livePresentation = createLivePresentation({vrm, root, bodyType: config.referenceBody || bodyType, avatarSha256: sha256});
  const meshRoles = {};
  for (const role of [
    "body",
    "face",
    "hair",
    "top",
    "shoes",
    "pants",
    "skirt",
  ]) {
    const label = role === "shoes" ? "footwear" : role;
    meshRoles[label] = ((role === "pants" ? surfaces.allPants : surfaces[role]) ?? []).map((mesh) => {
      mesh.userData.assetRole = label;
      return mesh.uuid;
    });
  }
  let lastGarmentColliders = [],
    garmentPreparedForHands = false;
  const profile = {
    id: config.id,
    bodyType,
    url,
    sha256,
    bodyComplete: true,
    meshRoles,
    footwear: { kind: "shoes", meshes: surfaces.shoes.map((m) => m.name) },
    garmentStatus: "independent new-body equipment; visual acceptance pending",
    motion: {
      forearmCollision: new URLSearchParams(location.search).get("forearm") === "legacy" ? null : forearmCollision,
      forearmCollisionBodySHA256: sha256,
      handSurfaceContact: new URLSearchParams(location.search).get("handSkin") === "legacy" || !jointHandCollision ? null : { bodySHA256: sha256, jointProfile: jointHandCollision },
      forearmProfileTiming: new URLSearchParams(location.search).has("forearmTiming"),
      preserveAuthoredSitHands: new URLSearchParams(location.search).get("handTarget") !== "lap",
      deriveSeatFromBody: true,
      get preserveAuthoredHands() { return livePresentation.getState().speaking; },
      seatClothAllowance: 0.006,
      seatHeight: 0.47,
      seatHandRadii: equipment.getInfo().skirtDynamics?.thighRadii,
      seatHandSurfaces: (refresh = true) => {
        if (debugBody || outfit !== 1) return [];
        // fitSeatHands runs after current normalized pelvis/legs are solved.
        // Copy them to raw bones before sampling this frame's garment surface.
        if (refresh) {
          vrm.humanoid.update();
          vrm.scene.updateMatrixWorld(true);
          equipment.update(0, lastGarmentColliders);
          garmentPreparedForHands = true;
        }
        return surfaces.skirt;
      },
    },
    qa: {
      outfits: [
        { name: "base", bodyMode: "base", outfit: 0, dynamics: false },
        ...config.outfits.map((o) => ({ name: o.role, bodyMode: "dressed", outfit: o.index, dynamics: true })),
      ],
    },
  };
  // Training pants are exported 6 mm outside the actual body surface. A
  // measured 6 mm pelvis raise lifts the lowest thigh patch by 3.66 mm once
  // floor IK is applied (fixed shoe). Compensate this measured lever ratio,
  // rather than pretending the hip and the thigh underside move together.
  Object.defineProperty(profile.motion, "seatLayerThickness", {
    get: () => (debugBody ? 0 : (config.outfitSeatLayerThickness?.[outfit] ?? config.seatLayerThickness)),
  });
  function setDebugBody(value) {
    debugBody = Boolean(value);
    for (const [mesh, mat] of sourceMaterials)
      mesh.material = debugBody ? bodyMaterials.get(mesh) : mat;
    equipment.setDebugBody(debugBody);
  }
  setDebugBody(false);
  return {
    vrm,
    root,
    profile,
    config,
    livePresentation,
    getAssetProfile: () => profile,
    setMaterialRecipe: (id, recipeId) => equipment.setMaterialRecipe(id, recipeId),
    getMaterialRecipeState: (id) => equipment.getMaterialRecipeState(id),
    setOutfit: (n) => {
      equipment.setOutfit(n);
      outfit = equipment.getInfo().outfit;
    },
    setDebugBody,
    setDynamics: (value) => {
      dynamics = Boolean(value);
      vrm.springBoneManager?.reset();
    },
    setExpression: name => livePresentation.setExpression(name),
    update: (dt, state = {}) => {
      livePresentation.preUpdate(dt, state);
      vrm.update(dynamics ? dt : 0);
      if (!dynamics) vrm.springBoneManager?.reset();
      root.updateMatrixWorld(true);
      livePresentation.postUpdate();
    },
    resetSecondary: () => vrm.springBoneManager?.reset(),
    updateGarment: (_sit, dt, colliders) => {
      lastGarmentColliders = colliders || [];
      // fitSeatHands is the last motion operation; only arm bones changed
      // after its same-frame skirt evaluation. Do not run the identical
      // stateless skirt constraint pass again in this same simulation step.
      if (garmentPreparedForHands) {
        garmentPreparedForHands = false;
        return;
      }
      equipment.update(dt, lastGarmentColliders);
    },
    getDebugState: () => ({
      mode: debugBody ? "base" : "dressed",
      dynamics,
      bodyComplete: true,
      baseLabel: "完整人体诊断",
      label: config.label,
      description:
        `${config.label}：完整人体与独立装备；基础模式保留同一套鞋。当前组合须独立验收，画风待确认。`,
      asset: profile,
    }),
    dispose: () => {
      livePresentation.dispose();
      equipment.dispose();
      root.removeFromParent();
      for (const [mesh, material] of sourceMaterials) mesh.material = material;
      for (const materials of bodyMaterials.values()) materials.forEach(m => m.dispose());
      VRMUtils.deepDispose(vrm.scene);
    },
    getOutfitInfo: () => ({
      index: outfit,
      name: `新人体 · ${config.outfits.find((o) => o.index === outfit).label}`,
      fitStatus: config.outfitFitStatus?.[outfit] || "candidate: current outfit requires independent acceptance",
      source: config.source,
      equipment: equipment.getInfo(),
      limitations: "新人体M1连续动作验收中",
    }),
  };
  } catch (error) {
    // The factory has not returned an avatar yet; callers cannot dispose it.
    // Release partially built equipment and the VRM here, including failures
    // before createM1Equipment returns (manifest/network/identity errors).
    livePresentation?.dispose();
    equipment?.dispose();
    root.removeFromParent();
    for (const [mesh, material] of sourceMaterials) mesh.material = material;
    for (const materials of bodyMaterials.values()) materials.forEach(m => m.dispose());
    VRMUtils.deepDispose(vrm.scene);
    throw error;
  }
}
