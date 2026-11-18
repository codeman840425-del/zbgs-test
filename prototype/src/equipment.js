import * as THREE from "three";
import { createGarmentMaterialRecipes } from "./material-recipes.js";
import { resolveEquipmentSet, commitLoadedEquipmentSet, prepareLoadedEquipmentSet } from "./equipment-set.js";
import { createEquipmentLoader, initializeEquipmentMaterials, updateEquipmentMaterials, collectEquipmentTextures } from './equipment-material-loader.js';
import { shapeFitDescriptor } from './shape-fit-registry.js';
import { layerFitRequirement, validateLayerFit, assertLayerFitSet } from './garment-layer-fit.js';

// GLTFLoader sanitizes node names and retains the exact glTF name in userData.
const boneNames = bone => [...new Set([bone.name, bone.userData?.name]
  .filter(name => typeof name === 'string' && name.length > 0))];
const sha256 = async buffer => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
  .map(n => n.toString(16).padStart(2, '0')).join('');

async function pinnedCatalog(response, expected, label = 'manifest') {
  const bytes = await response.arrayBuffer();
  if (await sha256(bytes) !== expected) throw Error(`Equipment ${label} integrity mismatch`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Load independent garment GLBs onto a compatible existing raw skeleton.
 * No motion/controller dependency, no mutation of the avatar's meshes/materials.
 * The manifest owns bone mapping, slot and rest-bind compatibility constraints.
 */
export async function createEquipment({
  vrm,
  parent = vrm.scene,
  manifestUrl = "/assets/garments/equipment.json",
  manifestSha256,
  avatarSha256,
  additionalManifests = [],
}) {
  if (!vrm?.humanoid || !parent) throw new TypeError("A loaded VRM is required");
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Equipment manifest HTTP ${response.status}`);
  const manifest = manifestSha256 === undefined ? await response.json() : await pinnedCatalog(response, manifestSha256);
  if (manifest.schema !== "zbgs-equipment-v1" || !Array.isArray(manifest.items))
    throw new Error("Unsupported equipment manifest");
  // Additive catalogs keep the original manifest URL and every legacy entry
  // byte-for-byte equivalent for saved recipe validation. Extensions are pinned.
  if(!Array.isArray(additionalManifests))throw Error('Invalid additional equipment manifests');
  for(const descriptor of additionalManifests){
    if(typeof descriptor?.url!=='string'||!descriptor.url.startsWith('/assets/')||!/^[a-f0-9]{64}$/.test(descriptor.sha256))throw Error('Invalid additional equipment manifest identity');
    const extraResponse=await fetch(descriptor.url,{cache:'no-store'});
    if(!extraResponse.ok)throw Error(`Equipment extension HTTP ${extraResponse.status}`);
    const extra=await pinnedCatalog(extraResponse,descriptor.sha256,'extension');
    if(extra.schema!=='zbgs-equipment-v1'||!Array.isArray(extra.items)||extra.items.some(item=>item.compatibleAvatarSha256!==avatarSha256||!item.url?.startsWith('/assets/')))throw Error('Invalid equipment extension body or absolute resource URL');
    manifest.items.push(...extra.items);
  }
  const manifestBase = new URL(manifestUrl, window.location.href);
  const entries = new Map(manifest.items.map((item) => [item.id, item]));
  if (entries.size !== manifest.items.length) throw new Error("Duplicate equipment IDs");
  const rawByName = new Map(), bindByBone = new Map(), sourceSurfaceNames = new Map();
  vrm.scene.traverse((node) => {
    if(node.isMesh){
      const materials=Array.isArray(node.material)?node.material:[node.material];
      sourceSurfaceNames.set(node,new Set(materials.map(material=>material?.name?.replace(/ \(Outline\)$/,''))));
    }
    if (node.isBone) {
      for (const name of boneNames(node)) {
        if (rawByName.has(name) && rawByName.get(name) !== node)
          throw new Error(`Ambiguous raw bone ${name}`);
        rawByName.set(name, node);
      }
    }
    if (node.isSkinnedMesh)
      node.skeleton.bones.forEach((bone, index) => {
        if (!bindByBone.has(bone)) bindByBone.set(bone, node.skeleton.boneInverses[index]);
      });
  });
  const loader = createEquipmentLoader(), loaded = new Map(), pending = new Map(), slotRequests = new Map();
  const materialRequests = new Map();
  let disposed = false;
  let setRevision = 0;
  const packed = attribute => {
    if (!attribute || attribute.normalized) throw Error('Body shape attribute format is incompatible');
    const Type = attribute.isInterleavedBufferAttribute ? attribute.data.array.constructor : attribute.array.constructor;
    const values = new Type(attribute.count * attribute.itemSize);
    for (let i=0;i<attribute.count;i++) for(let c=0;c<attribute.itemSize;c++) values[i*attribute.itemSize+c]=attribute.getComponent(i,c);
    return values;
  };
  const digestAttribute = async attribute => {
    const values=packed(attribute), bytes=values.buffer.slice(values.byteOffset,values.byteOffset+values.byteLength);
    return {sha256:await sha256(bytes),componentType:values instanceof Float32Array?5126:values instanceof Uint32Array?5125:values instanceof Uint16Array?5123:values instanceof Uint8Array?5121:null,type:attribute.itemSize===1?'SCALAR':attribute.itemSize===2?'VEC2':attribute.itemSize===3?'VEC3':'VEC4',count:attribute.count,itemSize:attribute.itemSize};
  };
  const fitJson = async (entry, url, expectedSha) => {
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`Garment ${entry.id} fit resource HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();if(await sha256(bytes)!==expectedSha)throw Error(`Garment ${entry.id} fit resource integrity mismatch`);
    let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error(`Garment ${entry.id} fit resource is not valid JSON`);}
    return value;
  };
  const shapeDependencies = new Map();
  function bodySurfaceMeshes(materialName) {
    const result=[];vrm.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      // Diagnostic body rendering swaps materials. Fit still binds the
      // original mesh identity and its current geometry, not a display color.
      if(sourceSurfaceNames.get(mesh)?.has(materialName))result.push(mesh);
    });return result;
  }
  async function prepareShapeDependency(entry) {
    const descriptor=shapeFitDescriptor(entry,avatarSha256);if(!descriptor){if(entry.fitResource)throw Error(`Garment ${entry.id} declares an unsupported shape fit dependency`);return null;}
    if(!entry.fitResource?.url||!entry.fitResource.url.startsWith('/assets/')||!/^[a-f0-9]{64}$/.test(entry.fitResource.sha256))throw Error(`Garment ${entry.id} is missing a pinned local fit resource`);
    const fitUrl=new URL(entry.fitResource.url,manifestBase);
    const fit=await fitJson(entry,fitUrl,entry.fitResource.sha256);
    if(fit.schema!=='m2-onepiece-fit-v1'||fit.id!==entry.fitId||fit.styleId!==entry.styleId||fit.targetBodySha256!==avatarSha256||fit.assetSha256!==entry.sha256||fit.slot!==entry.slot)
      throw Error(`Garment ${entry.id} fit resource identity is incompatible`);
    const shapeResponse=await fetch(new URL(descriptor.url,manifestBase),{cache:'no-store'});if(!shapeResponse.ok)throw Error(`Garment ${entry.id} shape fit HTTP ${shapeResponse.status}`);
    const shapeBytes=await shapeResponse.arrayBuffer();if(await sha256(shapeBytes)!==descriptor.sha256)throw Error(`Garment ${entry.id} shape fit integrity mismatch`);
    let shape;try{shape=JSON.parse(new TextDecoder().decode(shapeBytes));}catch{throw Error(`Garment ${entry.id} shape fit is not valid JSON`);}
    if(shape.schema!=='m2-shape-fit-v1'||shape.dependency!=='body-surface'||shape.baseAvatarSha256!==avatarSha256||shape.garmentId!==entry.id||shape.garmentSha256!==entry.sha256||!Array.isArray(shape.surfaces)||!shape.surfaces.length)
      throw Error(`Garment ${entry.id} shape fit identity is incompatible`);
    const snapshots=[];
    for(const row of shape.surfaces){
      const meshes=bodySurfaceMeshes(row.materialName);if(meshes.length!==1)throw Error(`Body surface ${row.materialName} is ambiguous or missing`);
      const mesh=meshes[0],matrix=mesh.matrix.elements;
      if(row.nodeMatrix?.some((value,index)=>Math.abs(value-matrix[index])>1e-6))throw Error(`Body surface transform differs for ${entry.id}`);
      mesh.updateMatrix();
      const geometry=mesh.geometry,attrs={position:geometry.getAttribute('position'),index:geometry.index,skinIndex:geometry.getAttribute('skinIndex'),skinWeight:geometry.getAttribute('skinWeight')};
      const refs={geometry,index:attrs.index,position:attrs.position,skinIndex:attrs.skinIndex,skinWeight:attrs.skinWeight};
      const versions=Object.fromEntries(Object.entries(attrs).map(([key,attribute])=>[key,{attribute:attribute?.version??0,data:attribute?.isInterleavedBufferAttribute?(attribute.data.version??0):null}]));
      const expected=row.geometry;
      const actual={};for(const key of Object.keys(expected))actual[key]=await digestAttribute(attrs[key]);
      for(const key of Object.keys(expected)){const e=expected[key],a=actual[key];if(!a||e.sha256!==a.sha256||e.count!==a.count||e.itemSize!==a.itemSize||e.componentType!==a.componentType)throw Error(`Body surface ${row.materialName} ${key} differs; refit is required (${e.sha256}/${a?.sha256})`);}
      if(mesh.geometry!==refs.geometry)throw Error(`Body surface geometry replaced while preparing shape fit`);
      for(const key of Object.keys(attrs)){const attribute=attrs[key],version=versions[key],current=key==='index'?mesh.geometry.index:mesh.geometry.getAttribute(key);if(current!==refs[key]||(attribute?.version??0)!==version.attribute||(attribute?.isInterleavedBufferAttribute&&attribute.data.version!==version.data))throw Error(`Body surface ${row.materialName} ${key} changed while preparing shape fit`);}
      snapshots.push({mesh,row,attributes:attrs,refs,versions});
    }
    return {entry,fit,shape,snapshots,assertCurrentSync:()=>{
      for(const {mesh,row,attributes,refs,versions} of snapshots){mesh.updateMatrix();if(row.nodeMatrix?.some((value,index)=>Math.abs(value-mesh.matrix.elements[index])>1e-6))throw Error(`Body surface transform changed for ${entry.id}; refit is required`);if(mesh.geometry!==refs.geometry)throw Error(`Body surface geometry replaced for ${entry.id}; refit is required`);for(const key of Object.keys(row.geometry)){const current=key==='index'?mesh.geometry.index:mesh.geometry.getAttribute(key);if(current!==refs[key])throw Error(`Body surface ${row.materialName} ${key} replaced; refit is required`);const version=versions[key];if((attributes[key]?.version??0)!==version.attribute||(attributes[key]?.isInterleavedBufferAttribute&&attributes[key].data.version!==version.data))throw Error(`Body surface ${row.materialName} ${key} changed; refit is required`);}}return true;
    },assertCurrent:async()=>{
      for(const {mesh,row} of snapshots){if(row.nodeMatrix?.some((value,index)=>Math.abs(value-mesh.matrix.elements[index])>1e-6))throw Error(`Body surface transform changed for ${entry.id}; refit is required`);for(const key of Object.keys(row.geometry)){const actual=await digestAttribute(key==='index'?mesh.geometry.index:mesh.geometry.getAttribute(key));if(actual.sha256!==row.geometry[key].sha256)throw Error(`Body surface ${row.materialName} ${key} changed; refit is required`);}}
      return true;
    }};
  }
  const assertShapeDependencies = async ids => {for(const id of ids){const dependency=shapeDependencies.get(id);if(dependency)await dependency.assertCurrent();}};
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
    const layerFit=layerFitRequirement(entry);
    if(layerFit){
      const fit=await fitJson(entry,new URL(layerFit.url,manifestBase),layerFit.sha256);
      validateLayerFit(entry,fit,avatarSha256,manifest.items);
    }
    const shapeDependency=await prepareShapeDependency(entry);
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
      if (mapping.has(binding.sourceBone)) throw new Error(`Duplicate garment bone binding ${binding.sourceBone}`);
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
          const names = boneNames(bone).filter(name => mapping.has(name));
          if (!names.length) throw new Error(`Unmapped garment bone ${bone.name}`);
          if (names.length !== 1) throw new Error(`Ambiguous garment bone ${bone.name}`);
          return mapping.get(names[0]).bone;
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
    initializeEquipmentMaterials(meshes);
    if (disposed) throw new Error("Equipment disposed while loading");
    // Loading prepares a resource; only an explicit selection makes it visible.
    container.visible = false;
    parent.add(container);
    // Three dispatches childadded synchronously; a scene owner may dispose
    // the actor in that callback before this resource enters the loaded map.
    if (disposed) throw new Error("Equipment disposed while attaching");
    const result = { id: entry.id, entry, container, meshes, skeletons: new Set(skeletons.values()),
      stats: { primitives: meshes.length, verticesAcrossPrimitives: vertices,
        multiBoneVerticesAcrossPrimitives: multiBoneVertices, maxWeightSumError,
        joints: mapping.size, independentArmatureAttached: false } };
    result.materialRecipes = createGarmentMaterialRecipes({entry,meshes,avatarSha256,manifestBase,threeRevision:THREE.REVISION});
    if(shapeDependency)shapeDependencies.set(entry.id,shapeDependency);
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
        collectEquipmentTextures(material, textures);
      }
    }
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose()); new Set(item.skeletons.values()).forEach((s) => s.dispose());
  }
  function cancelledMaterialTransaction(reason = 'superseded') {
    return Object.freeze({
      revision: null,
      recipeId: null,
      reason,
      isCurrent: () => false,
      validateCommit: () => { throw Error(`Material recipe preparation is ${reason}`); },
      commit: () => { throw Error(`Material recipe preparation is ${reason}`); },
      rollback: () => {},
      dispose: () => {},
      release: () => {},
    });
  }
  function originalUnloadedMaterialTransaction(id, ticket) {
    let released = false;
    const current = () => !disposed && !released && materialRequests.get(id) === ticket && !loaded.has(id);
    return {
      id,
      recipeId: 'original',
      revision: ticket,
      identity: null,
      isCurrent: current,
      validateCommit() {
        if (!current()) throw Error('Material recipe preparation is no longer current');
        return true;
      },
      commit() {
        if (!current()) throw Error('Material recipe preparation is no longer current');
        return { applied: true, state: null };
      },
      rollback() {},
      release() { released = true; },
      dispose() { released = true; },
    };
  }
  async function prepareMaterialRecipe(id, recipeId) {
    if (disposed) throw new Error("Equipment adapter is disposed");
    getEntry(id);
    const ticket = (materialRequests.get(id) || 0) + 1;
    materialRequests.set(id, ticket);
    if ((recipeId === null || recipeId === 'original') && !loaded.has(id)) return originalUnloadedMaterialTransaction(id, ticket);
    let item;
    try { item = await load(id); }
    catch (error) {
      if (disposed || materialRequests.get(id) !== ticket) return cancelledMaterialTransaction(disposed ? 'disposed' : 'superseded');
      throw error;
    }
    if (disposed) throw new Error("Equipment adapter is disposed");
    if (materialRequests.get(id) !== ticket) return cancelledMaterialTransaction();
    let prepared;
    try { prepared = await item.materialRecipes.prepareMaterialRecipe(recipeId); }
    catch (error) {
      if (disposed || materialRequests.get(id) !== ticket) return cancelledMaterialTransaction(disposed ? 'disposed' : 'superseded');
      throw error;
    }
    if (disposed || loaded.get(id) !== item || materialRequests.get(id) !== ticket) {
      prepared.dispose();
      return cancelledMaterialTransaction(disposed ? 'disposed' : 'superseded');
    }
    const isCurrent = () => !disposed && loaded.get(id) === item && materialRequests.get(id) === ticket && prepared.isCurrent();
    return {
      id,
      recipeId: prepared.recipeId,
      revision: prepared.revision,
      identity: prepared.identity,
      isCurrent,
      validateCommit() {
        if (!isCurrent()) throw Error('Material recipe preparation is no longer current');
        return prepared.validateCommit();
      },
      commit() {
        if (!isCurrent()) throw Error('Material recipe preparation is no longer current');
        return prepared.commit();
      },
      rollback() { return prepared.rollback(); },
      release() { return prepared.release(); },
      dispose() { return prepared.dispose(); },
    };
  }
  function invalidateSlotRequests() {
    for (const entry of manifest.items)
      slotRequests.set(entry.slot, (slotRequests.get(entry.slot) || 0) + 1);
  }
  function applyLoadedSet(ids) {
    if (disposed) throw Error("Equipment adapter is disposed");
    for(const id of ids){const dependency=shapeDependencies.get(id);if(dependency)dependency.assertCurrentSync();}
    const result = commitLoadedEquipmentSet(loaded, manifest.items, ids, avatarSha256);
    setRevision++;
    invalidateSlotRequests();
    return result;
  }
  return {
    update(deltaSeconds) {
      if (!disposed) updateEquipmentMaterials(loaded.values(), deltaSeconds);
    },
    list: () => manifest.items.map(({ id, name, slot, limits }) => ({ id, name, slot, limits })),
    // The manifest is available before a garment is loaded. Static admission
    // and saved-recipe identity checks must not allocate all catalog meshes.
    describe: (id) => structuredClone(getEntry(id)),
    load,
    applyLoadedSet,
    prepareLoadedSet(ids) {
      if(disposed)throw Error("Equipment adapter is disposed");
      const apply=prepareLoadedEquipmentSet(loaded,manifest.items,ids,avatarSha256);
      const ticket=++setRevision;invalidateSlotRequests();
      const previousVisibility=new Map([...loaded].map(([id,item])=>[id,item.container.visible]));
      let live=true,committed=false,rolledBack=false;
      const update={
        isCurrent:()=>live&&!disposed&&ticket===setRevision,
        commit(){
          if(!update.isCurrent())throw Error("Equipment preparation is no longer current");
          for(const id of ids){const dependency=shapeDependencies.get(id);if(dependency)dependency.assertCurrentSync();}
          try{const result=apply();committed=true;live=false;return result;}
          catch(error){for(const [id,visible] of previousVisibility)loaded.get(id).container.visible=visible;throw error;}
        },
        rollback(){
          if(!committed||rolledBack)return;
          if(disposed)throw Error("Equipment adapter is disposed");
          for(const [id,visible] of previousVisibility)loaded.get(id).container.visible=visible;
          setRevision++;invalidateSlotRequests();
          rolledBack=true;
        },
        dispose(){live=false;},
      };
      return update;
    },
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
      await assertShapeDependencies(selected.map(entry => entry.id));
      if(disposed) throw Error("Equipment adapter is disposed");
      if(ticket !== setRevision) return { applied: false, reason: "superseded" };
      return { applied: true, items: applyLoadedSet(selected.map(entry => entry.id)) };
    },
    async equip(id) {
      setRevision++;
      const entry = getEntry(id), request = (slotRequests.get(entry.slot) || 0) + 1;
      slotRequests.set(entry.slot, request);
      const item = await load(id);
      if (disposed) throw new Error("Equipment adapter is disposed");
      if (slotRequests.get(entry.slot) !== request) return { ...item, applied: false };
      // Other slots may have changed while loading. Validate the current final
      // selection before changing visibility, keeping independent slot tickets.
      const ids = [...loaded.values()]
        .filter(other => other.container.visible && other.entry.slot !== entry.slot)
        .map(other => other.id);
      if(disposed) throw new Error("Equipment adapter is disposed");
      if(slotRequests.get(entry.slot) !== request) return { ...item, applied: false };
      await assertShapeDependencies([...ids,id]);
      if(disposed) throw new Error("Equipment adapter is disposed");
      if(slotRequests.get(entry.slot) !== request) return { ...item, applied: false };
      // Another slot can change while its shape digest is awaited. Re-read
      // the actual visible set and validate synchronously at the commit point;
      // never resurrect an item removed during that asynchronous window.
      const currentIds = [...loaded.values()]
        .filter(other => other.container.visible && other.entry.slot !== entry.slot)
        .map(other => other.id);
      for (const selectedId of [...currentIds, id])
        shapeDependencies.get(selectedId)?.assertCurrentSync();
      commitLoadedEquipmentSet(loaded, manifest.items, [...currentIds, id], avatarSha256);
      return { ...item, applied: true };
    },
    unequip(slot = "bottoms-overlay") {
      assertLayerFitSet([...loaded.values()].filter(item=>item.container.visible&&item.entry.slot!==slot).map(item=>item.entry));
      setRevision++;
      slotRequests.set(slot, (slotRequests.get(slot) || 0) + 1);
      for (const item of loaded.values()) if (item.entry.slot === slot) {
        materialRequests.set(item.id, (materialRequests.get(item.id) || 0) + 1);
        item.materialRecipes.cancelPending?.();
        item.container.visible = false;
      }
    },
    async prepareMaterialRecipe(id, recipeId) { return prepareMaterialRecipe(id, recipeId); },
    getMaterialRecipeRevision(id) {
      getEntry(id);
      const state = loaded.get(id)?.materialRecipes.getState();
      return Object.freeze({
        request: materialRequests.get(id) || 0,
        inner: state?.revision ?? 0,
        pending: state?.pending?.revision ?? null,
      });
    },
    async setMaterialRecipe(id, recipeId) {
      if (recipeId === null && !loaded.has(id)) {
        if (disposed) throw new Error("Equipment adapter is disposed");
        getEntry(id);
        materialRequests.set(id, (materialRequests.get(id) || 0) + 1);
        return { applied: true, state: null };
      }
      const prepared = await prepareMaterialRecipe(id, recipeId);
      if (!prepared.isCurrent()) return { applied: false, reason: prepared.reason || 'superseded' };
      try {
        const result = prepared.commit();
        prepared.release();
        return result;
      } catch (error) {
        prepared.dispose();
        throw error;
      }
    },
    getMaterialRecipeState(id) { return loaded.get(id)?.materialRecipes.getState() ?? null; },
    get(id) { return loaded.get(id) || null; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of materialRequests.keys()) materialRequests.set(id, materialRequests.get(id) + 1);
      loaded.forEach(destroy); loaded.clear();
      shapeDependencies.clear();
    },
  };
}
