import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { createM1Equipment } from "./m1-equipment.js";

export async function loadFoundationAvatar({ scene, renderer }) {
  const url = "/assets/foundation/base-female-roundtrip.vrm";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Foundation HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const sha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (
    sha256 !==
    "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95"
  )
    throw new Error("Foundation identity mismatch");
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buffer, "/assets/foundation/");
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  const root = new THREE.Group();
  root.name = "M1CompleteFoundation";
  root.add(vrm.scene);
  scene.add(root);
  root.updateMatrixWorld(true);
  const sourceMaterials = new Map(),
    bodyMaterials = new Map(),
    clothes = [],
    bodyMeshes = [],
    shoes = [],
    size = new THREE.Vector2();
  let debugBody = false,
    outfit = 0,
    dynamics = true,
    faceTime = 0,
    facePreset = "neutral";
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
          () =>
            new THREE.MeshStandardMaterial({
              color: "#728e9b",
              roughness: 1,
              side: THREE.DoubleSide,
            }),
        ),
      );
    }
    if (materials.some((m) => /Shoes/i.test(m.name))) shoes.push(mesh);
    else if (materials.some((m) => /_CLOTH/.test(m.name))) clothes.push(mesh);
  });
  const equipment = await createM1Equipment({ vrm, avatarSha256: sha256 });
  const surfaces = equipment.getAssetProfile();
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
    meshRoles[label] = (surfaces[role] ?? []).map((mesh) => {
      mesh.userData.assetRole = label;
      return mesh.uuid;
    });
  }
  let lastGarmentColliders = [],
    garmentPreparedForHands = false;
  const profile = {
    id: "beta-base-female-m1",
    url,
    sha256,
    bodyComplete: true,
    meshRoles,
    footwear: { kind: "shoes", meshes: surfaces.shoes.map((m) => m.name) },
    garmentStatus: "independent new-body equipment; visual acceptance pending",
    motion: {
      deriveSeatFromBody: true,
      seatClothAllowance: 0.006,
      seatHeight: 0.47,
      seatHandRadii: equipment.getInfo().skirtDynamics.thighRadii,
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
        { name: "pants", bodyMode: "dressed", outfit: 0, dynamics: true },
        { name: "skirt", bodyMode: "dressed", outfit: 1, dynamics: true },
      ],
    },
  };
  // Training pants are exported 6 mm outside the actual body surface. A
  // measured 6 mm pelvis raise lifts the lowest thigh patch by 3.66 mm once
  // floor IK is applied (fixed shoe). Compensate this measured lever ratio,
  // rather than pretending the hip and the thigh underside move together.
  Object.defineProperty(profile.motion, "seatLayerThickness", {
    get: () => (debugBody ? 0 : 0.006 / 0.61),
  });
  function setDebugBody(value) {
    debugBody = Boolean(value);
    for (const [mesh, mat] of sourceMaterials)
      mesh.material = debugBody ? bodyMaterials.get(mesh) : mat;
    equipment.setDebugBody(debugBody);
  }
  setDebugBody(false);
  // This page also retains ?legacy. Only relabel controls for the new adapter.
  document.querySelector('[data-outfit="0"] b').textContent = "独立及膝裤";
  const oldTrial = document.querySelector('[data-outfit="2"]');
  oldTrial.hidden = true;
  oldTrial.nextElementSibling.textContent =
    "M1A女性候选：裤装与裙装分别加载并复用当前骨架；视觉验收尚未完成。";
  const faceControls = document.createElement("div");
  faceControls.className = "debug-row";
  for (const [id, label] of [
    ["neutral", "自然眨眼"],
    ["happy", "微笑"],
    ["aa", "口型 A"],
  ]) {
    const button = document.createElement("button");
    button.textContent = label;
    button.dataset.expression = id;
    button.onclick = () => {
      facePreset = id;
    };
    faceControls.append(button);
  }
  document.querySelector(".debug-controls").append(faceControls);
  function updateFace(dt) {
    faceTime += dt;
    for (const id of ["happy", "aa"])
      vrm.expressionManager?.setValue(id, facePreset === id ? 0.65 : 0);
    const blinkPhase = faceTime % 3.6;
    vrm.expressionManager?.setValue(
      "blink",
      blinkPhase < 0.18 ? Math.sin((blinkPhase / 0.18) * Math.PI) : 0,
    );
  }
  return {
    vrm,
    root,
    profile,
    getAssetProfile: () => profile,
    setOutfit: (n) => {
      outfit = Number(n) === 1 ? 1 : 0;
      equipment.setOutfit(outfit);
    },
    setDebugBody,
    setDynamics: (value) => {
      dynamics = Boolean(value);
      vrm.springBoneManager?.reset();
    },
    setExpression: (name) => {
      if (!["neutral", "happy", "aa"].includes(name))
        throw new Error("Unsupported M1 expression");
      facePreset = name;
    },
    update: (dt) => {
      updateFace(dt);
      vrm.update(dynamics ? dt : 0);
      if (!dynamics) vrm.springBoneManager?.reset();
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
      label: "新完整人体候选",
      description:
        "新人体完整皮肤；裤装与裙装是独立装备，基础模式保留同一套鞋。当前为M1A女性候选，画风待确认。",
      asset: profile,
    }),
    getOutfitInfo: () => ({
      index: outfit,
      name: outfit ? "新人体 · 独立裙装" : "新人体 · 独立及膝裤",
      source: "Base_Female / reconstructed Blender source",
      equipment: equipment.getInfo(),
      limitations: "新人体M1连续动作验收中",
    }),
  };
}
