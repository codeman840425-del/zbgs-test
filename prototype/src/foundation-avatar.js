import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { createM1Equipment } from "./m1-equipment.js";
import { outfitSelection } from "./outfit-selection.js";
import { foundationProfile } from "./foundation-profiles.js";
import { createLivePresentation } from "./live-presentation.js";
import { createCharacterAppearance } from "./character-appearance.js";
import { createFaceRenderCompaction } from "./face-render-compaction.js";
import { createFacialGeometry } from "./facial-geometry.js";
import { prepareFaceShadowPrograms, waitFaceShadowJob } from "./face-shadow-preparation.js";
import { validateForearmProfile } from "./forearm-envelope-projection.js";
import { validateJointHandProfile } from "./joint-hand-workspace.mjs";

// Each actor owns its prewarm variants. Geometry UUID is deliberately omitted:
// a new clone with identical layouts/material versions reuses the same program.
export function createFaceGeometryWarmup(renderer,scene) {
  const entries=new Map();let disposed=false,lifetime=new AbortController();
  const layout=a=>[a.count,a.itemSize,a.normalized,a.gpuType,(a.array||a.data?.array)?.constructor.name];
  const key=({mesh,geometry})=>JSON.stringify([
    mesh.uuid,!!mesh.isSkinnedMesh,!!mesh.isInstancedMesh,mesh.castShadow,
    renderer.shadowMap?.enabled,renderer.shadowMap?.autoUpdate,renderer.shadowMap?.type,
    mesh.customDepthMaterial?.uuid,mesh.customDepthMaterial?.version,
    Object.keys(geometry.attributes).sort().map(name=>[name,layout(geometry.attributes[name])]),
    Object.keys(geometry.morphAttributes).sort().map(name=>[name,geometry.morphAttributes[name].map(layout)]),
    geometry.morphTargetsRelative,geometry.groups,
    (Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>[m.uuid,m.version]),
  ]);
  const release=entry=>{if(entry.released)return;entry.released=true;for(const material of entry.materials)material.dispose();};
  const current=entry=>{const materials=Array.isArray(entry.mesh.material)?entry.mesh.material:[entry.mesh.material];return materials.length===entry.originals.length&&materials.every((m,i)=>m===entry.originals[i].material&&m.version===entry.originals[i].version);};
  const forget=entry=>{if(entries.get(entry.signature)===entry)entries.delete(entry.signature);release(entry);};

  const invalidate=()=>{lifetime.abort();for(const entry of entries.values())if(entry.settled)release(entry);entries.clear();lifetime=new AbortController();};
  renderer.domElement?.addEventListener('webglcontextlost',invalidate);
  renderer.domElement?.addEventListener('webglcontextrestored',invalidate);

  return {
    prepare(parts) {
      if(disposed)return Promise.reject(Error('人物已卸载'));
      const requests=new Map(parts.map(part=>[key(part),part]));
      const waits=[],fresh=[],staging=new THREE.Scene();
      try {
        for(const [signature,{mesh,geometry}] of requests){
          const existing=entries.get(signature);if(existing){waits.push(existing.promise);continue;}
          const entry={signature,mesh,geometry,originals:[],materials:[],settled:false,released:false,promise:null};fresh.push(entry);
          const copy=mesh.clone(false);copy.geometry=geometry;
          const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          entry.originals=originals.map(material=>({material,version:material.version}));
          const materials=originals.map(m=>{const clone=m.clone();entry.materials.push(clone);return clone;});
          copy.material=Array.isArray(mesh.material)?materials:materials[0];staging.add(copy);
        }
      }catch(error){for(const entry of fresh)release(entry);return Promise.reject(error);}
      if(fresh.length){
        const signal=lifetime.signal;
        const promise=Promise.resolve().then(async()=>{
          if(disposed||signal.aborted)throw Error('人物已卸载');
          await waitFaceShadowJob(renderer.compileAsync(staging,new THREE.PerspectiveCamera(),scene),signal);
          await prepareFaceShadowPrograms(renderer,scene,fresh,signal,(entry,material)=>entry.materials.push(material));
          if(disposed||signal.aborted)throw Error('人物已卸载');
        }).then(()=>{
          if(disposed||signal.aborted||fresh.some(entry=>entries.get(entry.signature)!==entry))throw Error('阴影预备已失效');
          for(const entry of fresh){
            entry.settled=true;
            if(disposed||!current(entry)){forget(entry);continue;}
            // Evict obsolete material versions across every layout only after
            // a current batch succeeds. Pending work releases itself on settle.
            for(const other of entries.values())if(other.mesh===entry.mesh&&other.settled&&!current(other))forget(other);
          }
        }).catch(error=>{
          // A failed new batch must not release any earlier successful variant
          // or a different pending batch from this actor.
          for(const entry of fresh){entry.settled=true;if(entries.get(entry.signature)===entry)entries.delete(entry.signature);release(entry);}
          throw error;
        });
        for(const entry of fresh){entry.promise=promise;entries.set(entry.signature,entry);}
        waits.push(promise);
      }
      return Promise.all(waits).then(()=>undefined);
    },
    dispose(){if(disposed)return;disposed=true;lifetime.abort();renderer.domElement?.removeEventListener('webglcontextlost',invalidate);renderer.domElement?.removeEventListener('webglcontextrestored',invalidate);for(const entry of entries.values())if(entry.settled)release(entry);entries.clear();},
  };
}

export async function loadFoundationAvatar({ scene, renderer, bodyType = "female", attachToScene = true }) {
  const config = foundationProfile(bodyType), url = config.url;
  for (const look of config.outfits) outfitSelection(config, look.index);
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
  root.updateMatrixWorld(true);
  const sourceMaterials = new Map(),
    bodyMaterials = new Map(),
    clothes = [],
    bodyMeshes = [],
    shoes = [],
    size = new THREE.Vector2();
  let debugBody = false,
    outfit = 0,
    lowerBodyRole = outfitSelection(config, 0).bottomRole,
    dynamics = true;
  let equipment, livePresentation, appearance, facialGeometry, faceRenderCompaction;
  const faceWarmup=createFaceGeometryWarmup(renderer,scene);
  const releaseFaceWarmup=()=>faceWarmup.dispose();
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
  appearance = createCharacterAppearance({ vrm, avatarSha256: sha256 });
  livePresentation = createLivePresentation({vrm, root, bodyType: config.referenceBody || bodyType, avatarSha256: sha256});
  // Live expression admission and attachment calibration inspect canonical indices first.
  faceRenderCompaction=createFaceRenderCompaction({vrm,avatarSha256:sha256});
  facialGeometry = createFacialGeometry({ vrm, avatarSha256: sha256,renderCompaction:faceRenderCompaction,prepareRender:parts=>faceWarmup.prepare(parts) });
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
        if (debugBody || lowerBodyRole !== 'skirt') return [];
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
    const priorAppearanceMode = appearance.getState().bodyMode;
    const appearanceResult = appearance.setBodyMode(value ? 'base' : 'dressed');
    if (!appearanceResult.applied) throw new Error(appearanceResult.reason);
    try {
      equipment.setDebugBody(Boolean(value));
    } catch (error) {
      // Coverage preparation can fail before committing its body/garments.
      // Restore the synchronous hair visibility change as well; actor state
      // and diagnostic materials have not yet been changed.
      const restored = appearance.setBodyMode(priorAppearanceMode);
      if (!restored.applied) throw new Error(`Body mode failed: ${error.message}; appearance restore failed: ${restored.reason}`);
      throw error;
    }
    debugBody = Boolean(value);
    for (const [mesh, mat] of sourceMaterials)
      mesh.material = debugBody ? bodyMaterials.get(mesh) : mat;
  }
  setDebugBody(false);
  // Do not render/upload canonical Face geometry while equipment is still loading.
  if (attachToScene) scene.add(root);
  return {
    vrm,
    root,
    profile,
    config,
    livePresentation,
    appearance,
    facialGeometry,
    getAssetProfile: () => profile,
    getEquipmentRecipe: (index) => {
      const {roles}=outfitSelection(config,index);
      return Object.fromEntries(roles.map(key=>[key,structuredClone(surfaces.equipment.get(config.ids[key]).entry)]));
    },
    setMaterialRecipe: (id, recipeId) => equipment.setMaterialRecipe(id, recipeId),
    getMaterialRecipeState: (id) => equipment.getMaterialRecipeState(id),
    setOutfit: (n) => {
      equipment.setOutfit(n);
      outfit = equipment.getInfo().outfit;
      lowerBodyRole = outfitSelection(config, outfit).bottomRole;
    },
    prepareOutfit: (n) => {
      const {bottomRole}=outfitSelection(config,n);
      const update=equipment.prepareOutfit(n);
      return{
        isCurrent:()=>update.isCurrent(),
        commit:()=>{
          update.commit();outfit=n;lowerBodyRole=bottomRole;
        },
        dispose:()=>update.dispose(),
      };
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
      releaseFaceWarmup();
      facialGeometry.dispose();
      faceRenderCompaction?.dispose();
      appearance.dispose();
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
    releaseFaceWarmup();
    facialGeometry?.dispose();
    faceRenderCompaction?.dispose();
    appearance?.dispose();
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
