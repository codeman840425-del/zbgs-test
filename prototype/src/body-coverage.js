import * as THREE from "three";

// Coverage changes rendering only. Contact/calibration must use this accessor.
// A WeakMap keeps complete geometry per instance, outside saved appearance data.
const completeBodies = new WeakMap();
export const completeBodyGeometry = mesh => completeBodies.get(mesh) ?? mesh.geometry;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(n => n.toString(16).padStart(2, "0")).join("");

export async function createBodyCoverage({ body, avatarSha256, topEntry, descriptor }) {
  if (!descriptor) return null;
  const response = await fetch(descriptor.url);
  if (!response.ok) throw Error(`Body coverage HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (await digest(bytes) !== descriptor.sha256) throw Error("Body coverage integrity mismatch");
  const fit = JSON.parse(new TextDecoder().decode(bytes));
  if (fit.schema !== "zbgs-outfit-body-coverage-candidate.1" ||
      fit.avatarSha256 !== avatarSha256 || fit.topId !== topEntry.id || fit.topSha256 !== topEntry.sha256)
    throw Error("Body coverage requires its exact body and top versions");
  const matches = body.filter(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .some(m => m.name === fit.bodyMaterial));
  if (matches.length !== 1) throw Error("Body coverage primitive is ambiguous or missing");
  const mesh = matches[0], original = mesh.geometry, index = original.index;
  if (completeBodies.has(mesh) || !index || index.count !== fit.bodyFaceCount * 3 ||
      index.array.BYTES_PER_ELEMENT !== 4 || fit.bodyIndexComponentType !== 5125)
    throw Error("Body coverage index layout mismatch");
  const raw = index.array;
  if (await digest(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)) !== fit.bodyIndexAccessorSha256)
    throw Error("Body coverage source topology mismatch");
  const selected = new Set(fit.selectedFaceIds);
  if (!selected.size || selected.size !== fit.selectedFaceIds.length ||
      fit.selectedTriangles.length !== selected.size) throw Error("Invalid body coverage selection");
  fit.selectedFaceIds.forEach((face, i) => {
    if (!Number.isInteger(face) || face < 0 || face >= fit.bodyFaceCount ||
        fit.selectedTriangles[i].length !== 3 || fit.selectedTriangles[i].some((v, k) => v !== raw[face * 3 + k]))
      throw Error("Body coverage face identity mismatch");
  });
  if (original.drawRange.start !== 0 || original.drawRange.count !== Infinity)
    throw Error("Body coverage requires complete source draw range");
  const prefix = new Uint32Array(fit.bodyFaceCount + 1), kept = [];
  for (let face = 0; face < fit.bodyFaceCount; face++) {
    if (!selected.has(face)) kept.push(raw[face*3], raw[face*3+1], raw[face*3+2]);
    prefix[face+1] = kept.length;
  }
  // MToon can have surface/outline groups covering the same index range.
  // Remap each original group independently; do not add one draw per hole.
  const groups = original.groups.map(g => {
    if (g.start % 3 || g.count % 3 || g.start < 0 || g.start + g.count > index.count)
      throw Error("Unsupported body coverage material group");
    return { start: prefix[g.start/3], count: prefix[(g.start+g.count)/3]-prefix[g.start/3], materialIndex:g.materialIndex };
  });
  const covered = original.clone();
  covered.setIndex(new THREE.BufferAttribute(new raw.constructor(kept), 1));
  covered.clearGroups();
  groups.forEach(g => covered.addGroup(g.start, g.count, g.materialIndex));
  completeBodies.set(mesh, original);
  let active = false, disposed = false;
  return {
    setEnabled(value) {
      if (disposed) return;
      active = Boolean(value);
      mesh.geometry = active ? covered : original;
    },
    getInfo: () => ({ id:fit.id, status:"experimental; action and perimeter validation required",
      active, hiddenFaces:active ? selected.size : 0, fullFaces:fit.bodyFaceCount,
      renderFaces:mesh.geometry.index.count/3, completeContactFaces:original.index.count/3,
      sourceBodyUnchanged:true, topId:fit.topId, avatarSha256 }),
    dispose() {
      if (disposed) return;
      mesh.geometry = original;
      completeBodies.delete(mesh);
      covered.dispose(); active = false; disposed = true;
    },
  };
}

/** A union of authored, exact-asset coverage masks. This never invents hidden
 * body regions from bounding boxes or claims clothing collision is solved. */
export async function createBodyCoverageSet({ body, avatarSha256, bindings }) {
  if (!Array.isArray(bindings)) throw Error("Coverage bindings must be an array");
  if (!bindings.length) return null;
  if (new Set(bindings.map(b => b.entry.id)).size !== bindings.length)
    throw Error("Duplicate coverage equipment ID");
  const sources = new Map(), masks = [];
  for (const {entry, descriptor} of bindings) {
    if (entry.compatibleAvatarSha256 !== avatarSha256)
      throw Error("Coverage equipment requires its exact body identity");
    const response = await fetch(descriptor.url);
    if (!response.ok) throw Error(`Body coverage HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (await digest(bytes) !== descriptor.sha256) throw Error("Body coverage integrity mismatch");
    const fit = JSON.parse(new TextDecoder().decode(bytes));
    const legacy = fit.schema === "zbgs-outfit-body-coverage-candidate.1";
    if ((!legacy && fit.schema !== "zbgs-equipment-body-coverage.1") ||
        fit.avatarSha256 !== avatarSha256 ||
        (legacy ? fit.topId : fit.itemId) !== entry.id ||
        (legacy ? fit.topSha256 : fit.itemSha256) !== entry.sha256)
      throw Error("Body coverage requires exact body and equipment versions");
    const matches = body.filter(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .some(m => m.name === fit.bodyMaterial));
    if (matches.length !== 1) throw Error("Body coverage primitive is ambiguous or missing");
    const mesh = matches[0], original = mesh.geometry, index = original.index;
    if (completeBodies.has(mesh) || !index || index.count !== fit.bodyFaceCount * 3 ||
        index.array.BYTES_PER_ELEMENT !== 4 || fit.bodyIndexComponentType !== 5125 ||
        original.drawRange.start !== 0 || original.drawRange.count !== Infinity)
      throw Error("Body coverage index layout mismatch");
    const raw = index.array;
    if (await digest(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)) !== fit.bodyIndexAccessorSha256)
      throw Error("Body coverage source topology mismatch");
    if (!Array.isArray(fit.selectedFaceIds) || !Array.isArray(fit.selectedTriangles))
      throw Error("Invalid body coverage selection");
    const faces = new Set(fit.selectedFaceIds);
    if (!faces.size || faces.size !== fit.selectedFaceIds.length || fit.selectedTriangles.length !== faces.size)
      throw Error("Invalid body coverage selection");
    fit.selectedFaceIds.forEach((face, i) => {
      if (!Number.isInteger(face) || face < 0 || face >= fit.bodyFaceCount ||
          !Array.isArray(fit.selectedTriangles[i]) || fit.selectedTriangles[i].length !== 3 ||
          fit.selectedTriangles[i].some((v, k) => v !== raw[face * 3 + k]))
        throw Error("Body coverage face identity mismatch");
    });
    for (const g of original.groups) {
      if (g.start % 3 || g.count % 3 || g.start < 0 || g.start + g.count > index.count)
        throw Error("Unsupported body coverage material group");
    }
    sources.set(mesh, original);
    masks.push({id:entry.id, fit, mesh, faces});
  }
  // Register only after every binding has passed; failed preparation leaves the
  // complete geometry and any active controller untouched.
  for (const mesh of sources.keys()) {
    if (completeBodies.has(mesh)) throw Error("Body coverage already owned by another controller");
  }
  for (const [mesh, original] of sources) completeBodies.set(mesh, original);
  let activeIds = [], disposed = false, revision = 0;
  const owned = new Map(), pending = new Set();
  function prepareEquipmentSet(ids) {
    if (disposed) throw Error("Body coverage is disposed");
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw Error("Invalid coverage equipment set");
    const next = masks.filter(mask => ids.includes(mask.id)).map(mask => mask.id).sort();
    const unchanged = JSON.stringify(next) === JSON.stringify(activeIds);
    const prepared = new Map(), preparedRevision = revision;
    try {
      for (const [mesh, original] of sources) {
        if (unchanged) continue;
        const hidden = new Set(masks.filter(mask => mask.mesh === mesh && next.includes(mask.id)).flatMap(mask => [...mask.faces]));
        if (!hidden.size) continue;
        const raw = original.index.array, count = raw.length / 3;
        const prefix = new Uint32Array(count + 1), kept = [];
        for (let face = 0; face < count; face++) {
          if (!hidden.has(face)) kept.push(raw[face*3],raw[face*3+1],raw[face*3+2]);
          prefix[face+1] = kept.length;
        }
        const geometry = original.clone();prepared.set(mesh, geometry);
        geometry.setIndex(new THREE.BufferAttribute(new raw.constructor(kept),1));
        geometry.clearGroups();
        for (const g of original.groups)
          geometry.addGroup(prefix[g.start/3],prefix[(g.start+g.count)/3]-prefix[g.start/3],g.materialIndex);
      }
    } catch (error) { for (const geometry of prepared.values()) geometry.dispose(); throw error; }
    const update = {
      commit() {
        if (!pending.has(update) || disposed || preparedRevision !== revision)
          throw Error("Body coverage preparation is no longer current");
        pending.delete(update);
        if (unchanged) return;
        for (const [mesh, original] of sources) mesh.geometry = prepared.get(mesh) ?? original;
        for (const geometry of owned.values()) geometry.dispose();
        owned.clear();
        for (const [mesh, geometry] of prepared) owned.set(mesh, geometry);
        prepared.clear();
        activeIds = next;
        revision++;
      },
      dispose() {
        if (!pending.delete(update)) return;
        for (const geometry of prepared.values()) geometry.dispose();
        prepared.clear();
      },
    };
    pending.add(update);
    return update;
  }
  function applyEquipmentSet(ids) {
    if (disposed) return;
    const update = prepareEquipmentSet(ids);
    try { update.commit(); } finally { update.dispose(); }
  }
  return {
    prepareEquipmentSet,
    applyEquipmentSet,
    setEnabled: value => applyEquipmentSet(value ? masks.map(mask => mask.id) : []),
    getInfo() {
      const fullFaces = [...sources.values()].reduce((sum,g) => sum + g.index.count/3,0);
      const renderFaces = [...sources.keys()].reduce((sum,m) => sum + m.geometry.index.count/3,0);
      return {id:masks.length === 1 ? masks[0].fit.id : "equipment-coverage-set",
        status:"exact authored masks; garment fit requires separate validation", active:activeIds.length>0,
        activeItems:[...activeIds], hiddenFaces:fullFaces-renderFaces, fullFaces, renderFaces,
        completeContactFaces:fullFaces,sourceBodyUnchanged:true,avatarSha256,
        topId:masks.length===1 ? masks[0].fit.topId : undefined};
    },
    dispose() {
      if(disposed)return;
      disposed=true;
      for(const update of pending)update.dispose();
      for(const [mesh, original] of sources){mesh.geometry=original;completeBodies.delete(mesh);}
      for(const geometry of owned.values())geometry.dispose();
      owned.clear();activeIds=[];
    },
  };
}
