import * as THREE from "three";
import { createGarmentMaterialRecipes } from "./material-recipes.js";
import { resolveEquipmentSet, commitLoadedEquipmentSet } from "./equipment-set.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Load independent garment GLBs onto a compatible existing raw skeleton.
 * No motion/controller dependency, no mutation of the avatar's meshes/materials.
 * The manifest owns bone mapping, slot and rest-bind compatibility constraints.
 */
export async function createEquipment({
  vrm,
  parent = vrm.scene,
  manifestUrl = "/assets/garments/equipment.json",
  avatarSha256,
}) {
  if (!vrm?.humanoid || !parent) throw new TypeError("A loaded VRM is required");
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Equipment manifest HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.schema !== "zbgs-equipment-v1" || !Array.isArray(manifest.items))
    throw new Error("Unsupported equipment manifest");
  const manifestBase = new URL(manifestUrl, window.location.href);
  const entries = new Map(manifest.items.map((item) => [item.id, item]));
  if (entries.size !== manifest.items.length) throw new Error("Duplicate equipment IDs");
  const rawByName = new Map(), bindByBone = new Map();
  vrm.scene.traverse((node) => {
    if (node.isBone) {
      if (rawByName.has(node.name) && rawByName.get(node.name) !== node)
        throw new Error(`Ambiguous raw bone ${node.name}`);
      rawByName.set(node.name, node);
    }
    if (node.isSkinnedMesh)
      node.skeleton.bones.forEach((bone, index) => {
        if (!bindByBone.has(bone)) bindByBone.set(bone, node.skeleton.boneInverses[index]);
      });
  });
  const loader = new GLTFLoader(), loaded = new Map(), pending = new Map(), slotRequests = new Map();
  const materialRequests = new Map();
  let disposed = false;
  let setRevision = 0;
  const sha256 = async (buffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
    .map((n) => n.toString(16).padStart(2, "0")).join("");
  function getEntry(id) {
    const entry = entries.get(id);
    if (!entry) throw new Error(`Unknown equipment ${id}`);
    return entry;
  }
  async function load(id) {
    if (disposed) throw new Error("Equipment adapter is disposed");
    if (loaded.has(id)) return loaded.get(id);
    if (pending.has(id)) return pending.get(id);
    const promise = loadOne(getEntry(id));
    pending.set(id, promise);
    try { return await promise; } finally { pending.delete(id); }
  }
  async function loadOne(entry) {
    // Identity and bind checks are both required. A matching filename is not a fit.
    if (!avatarSha256 || avatarSha256 !== entry.compatibleAvatarSha256)
      throw new Error(`Garment ${entry.id} is not approved for this avatar identity`);
    const mapping = new Map();
    for (const binding of entry.bindings) {
      let bone = rawByName.get(binding.targetRawBone);
      if (!bone && binding.humanoidSemantic)
        bone = vrm.humanoid.getRawBoneNode(binding.humanoidSemantic);
      if (!bone) throw new Error(`Missing raw bone ${binding.targetRawBone}`);
      const inverse = bindByBone.get(bone);
      if (!inverse || binding.inverseBindMatrix.length !== 16 ||
          inverse.elements.some((n, i) => Math.abs(n - binding.inverseBindMatrix[i]) > 1e-5))
        throw new Error(`Rest bind differs for ${binding.targetRawBone}; refit/export is required`);
      mapping.set(binding.sourceBone, { bone, inverse });
    }
    const url = new URL(entry.url, manifestBase);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Garment HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== entry.bytes || await sha256(buffer) !== entry.sha256)
      throw new Error(`Garment integrity check failed for ${entry.id}`);
    const gltf = await loader.parseAsync(buffer, new URL(".", url).href);
    const container = new THREE.Group();
    container.name = `Equipment:${entry.id}`;
    container.visible = false;
    container.userData.equipmentId = entry.id;
    const meshes = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => { if (node.isSkinnedMesh) meshes.push(node); });
    if (!meshes.length) throw new Error(`Garment ${entry.id} has no weighted mesh`);
    const skeletons = new Map();
    let vertices = 0, multiBoneVertices = 0, maxWeightSumError = 0;
    try {
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
      if (!joints || !weights) throw new Error(`Unskinned garment primitive ${mesh.name}`);
      for (let i = 0; i < weights.count; i++) {
        let total = 0, influences = 0;
        for (let k = 0; k < 4; k++) {
          const value = weights.getComponent(i, k), joint = joints.getComponent(i, k);
          if (!Number.isFinite(value) || value < 0 || joint >= mesh.skeleton.bones.length)
            throw new Error("Invalid garment skin attributes");
          total += value;
          if (value > .001) influences++;
        }
        maxWeightSumError = Math.max(maxWeightSumError, Math.abs(total - 1));
        if (influences > 1) multiBoneVertices++;
      }
      if (maxWeightSumError > 1e-5) throw new Error("Garment weights are not normalized");
      let skeleton = skeletons.get(mesh.skeleton);
      if (!skeleton) {
        const bones = mesh.skeleton.bones.map((bone) => {
          const binding = mapping.get(bone.name);
          if (!binding) throw new Error(`Unmapped garment bone ${bone.name}`);
          return binding.bone;
        });
        skeleton = new THREE.Skeleton(bones, mesh.skeleton.boneInverses.map((m) => m.clone()));
        skeletons.set(mesh.skeleton, skeleton);
      }
      // Retain the garment node's authored transform; all joints reference the
      // live avatar. Never add its duplicate armature to the character.
      const authoredTransform = mesh.matrixWorld.clone();
      const authoredBind = mesh.bindMatrix.clone();
      container.add(mesh);
      authoredTransform.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.bind(skeleton, authoredBind);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      vertices += geometry.getAttribute("position").count;
    }
    if (disposed) throw new Error("Equipment disposed while loading");
    // Loading prepares a resource; only an explicit selection makes it visible.
    container.visible = false;
    parent.add(container);
    const result = { id: entry.id, entry, container, meshes, skeletons: new Set(skeletons.values()),
      stats: { primitives: meshes.length, verticesAcrossPrimitives: vertices,
        multiBoneVerticesAcrossPrimitives: multiBoneVertices, maxWeightSumError,
        joints: mapping.size, independentArmatureAttached: false } };
    result.materialRecipes = createGarmentMaterialRecipes({entry,meshes,avatarSha256,manifestBase,threeRevision:THREE.REVISION});
    loaded.set(entry.id, result);
    return result;
    } catch (error) {
      destroy({ container, meshes, skeletons });
      throw error;
    }
  }
  function destroy(item) {
    item.materialRecipes?.dispose();
    item.container.removeFromParent();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const mesh of item.meshes) {
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    }
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose()); new Set(item.skeletons.values()).forEach((s) => s.dispose());
  }
  function invalidateSlotRequests() {
    for (const entry of manifest.items)
      slotRequests.set(entry.slot, (slotRequests.get(entry.slot) || 0) + 1);
  }
  function applyLoadedSet(ids) {
    if (disposed) throw Error("Equipment adapter is disposed");
    const result = commitLoadedEquipmentSet(loaded, manifest.items, ids, avatarSha256);
    setRevision++;
    invalidateSlotRequests();
    return result;
  }
  return {
    list: () => manifest.items.map(({ id, name, slot, limits }) => ({ id, name, slot, limits })),
    load,
    applyLoadedSet,
    async equipSet(ids) {
      if (disposed) throw Error("Equipment adapter is disposed");
      const selected = resolveEquipmentSet(manifest.items, ids, avatarSha256);
      const ticket = ++setRevision;
      // A newer final-set intent supersedes every earlier single-slot request,
      // even while loading or if this set fails. Keep current visibility intact.
      invalidateSlotRequests();
      await Promise.all(selected.map(entry => load(entry.id)));
      if (disposed) throw Error("Equipment adapter is disposed");
      if (ticket !== setRevision) return { applied: false, reason: "superseded" };
      return { applied: true, items: applyLoadedSet(selected.map(entry => entry.id)) };
    },
    async equip(id) {
      setRevision++;
      const entry = getEntry(id), request = (slotRequests.get(entry.slot) || 0) + 1;
      slotRequests.set(entry.slot, request);
      const item = await load(id);
      if (disposed) throw new Error("Equipment adapter is disposed");
      if (slotRequests.get(entry.slot) !== request) return { ...item, applied: false };
      for (const other of loaded.values()) if (other.entry.slot === item.entry.slot) other.container.visible = false;
      item.container.visible = true;
      return { ...item, applied: true };
    },
    unequip(slot = "bottoms-overlay") {
      setRevision++;
      slotRequests.set(slot, (slotRequests.get(slot) || 0) + 1);
      for (const item of loaded.values()) if (item.entry.slot === slot) item.container.visible = false;
    },
    async setMaterialRecipe(id, recipeId) {
      if(disposed)throw new Error("Equipment adapter is disposed");
      getEntry(id);
      const ticket=(materialRequests.get(id)||0)+1;materialRequests.set(id,ticket);
      if(recipeId===null&&!loaded.has(id))return {applied:true,state:null};
      const item=await load(id);
      if(disposed)throw new Error("Equipment adapter is disposed");
      if(materialRequests.get(id)!==ticket)return {applied:false,reason:"superseded"};
      return item.materialRecipes.select(recipeId);
    },
    getMaterialRecipeState(id) { return loaded.get(id)?.materialRecipes.getState() ?? null; },
    get(id) { return loaded.get(id) || null; },
    dispose() {
      if (disposed) return;
      disposed = true;
      loaded.forEach(destroy); loaded.clear();
    },
  };
}
