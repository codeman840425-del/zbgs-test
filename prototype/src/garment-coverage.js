import * as THREE from "three";

const digest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map((n) => n.toString(16).padStart(2, "0")).join("");

const sourceBytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/**
 * Reversibly hides authored faces of an inner top while its exact outer entry
 * is selected. The original geometry remains owned by this instance for
 * contact and for restoration. No avatar body geometry is touched.
 */
export async function createGarmentCoverage({ inner, outer, descriptor }) {
  if (!descriptor || !inner || !outer) return null;
  const response = await fetch(descriptor.url, { cache: "no-store" });
  if (!response.ok) throw Error(`Garment coverage HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (await digest(bytes) !== descriptor.sha256) throw Error("Garment coverage integrity mismatch");
  const fit = JSON.parse(new TextDecoder().decode(bytes));
  if (fit.schema !== "zbgs-garment-coverage-mask-v1" ||
      fit.innerTopId !== inner.entry.id || fit.innerTopSha256 !== inner.entry.sha256 ||
      fit.outerId !== outer.entry.id || fit.outerAssetSha256 !== outer.entry.sha256)
    throw Error("Garment coverage requires exact inner and outer asset versions");
  const matches = inner.meshes.filter((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .some((material) => material.name === fit.innerTopMaterial));
  if (matches.length !== 1) throw Error("Garment coverage inner top primitive is ambiguous or missing");
  const mesh = matches[0], original = mesh.geometry, index = original.index;
  if (!index || index.count !== fit.topFaceCount * 3 || index.array.BYTES_PER_ELEMENT !== 4 ||
      fit.topIndexComponentType !== 5125 || original.drawRange.start !== 0 || original.drawRange.count !== Infinity)
    throw Error("Garment coverage top index layout mismatch");
  if (await digest(sourceBytes(index.array)) !== fit.topIndexAccessorSha256)
    throw Error("Garment coverage top source topology mismatch");
  if (!Array.isArray(fit.selectedFaceIds) || !Array.isArray(fit.selectedTriangles))
    throw Error("Invalid garment coverage selection");
  const selected = new Set(fit.selectedFaceIds);
  if (!selected.size || selected.size !== fit.selectedFaceIds.length || selected.size !== fit.selectedTriangles.length)
    throw Error("Invalid garment coverage selection");
  const raw = index.array;
  fit.selectedFaceIds.forEach((face, i) => {
    if (!Number.isInteger(face) || face < 0 || face >= fit.topFaceCount ||
        fit.selectedTriangles[i].length !== 3 || fit.selectedTriangles[i].some((value, k) => value !== raw[face * 3 + k]))
      throw Error("Garment coverage face identity mismatch");
  });
  for (const group of original.groups) {
    if (group.start % 3 || group.count % 3 || group.start < 0 || group.start + group.count > index.count)
      throw Error("Unsupported garment coverage material group");
  }
  let active = false, disposed = false, revision = 0, owned = null;
  const pending = new Set();
  const outerId = outer.entry.id, innerId = inner.entry.id;
  const desired = (ids) => {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw Error("Invalid garment coverage equipment set");
    return ids.includes(outerId) && ids.includes(innerId);
  };
  function prepareEquipmentSet(ids) {
    if (disposed) throw Error("Garment coverage is disposed");
    const nextActive = desired(ids), unchanged = nextActive === active;
    let prepared = null;
    if (!unchanged && nextActive) {
      const prefix = new Uint32Array(fit.topFaceCount + 1), kept = [];
      for (let face = 0; face < fit.topFaceCount; face++) {
        if (!selected.has(face)) kept.push(raw[face * 3], raw[face * 3 + 1], raw[face * 3 + 2]);
        prefix[face + 1] = kept.length;
      }
      prepared = original.clone();
      prepared.setIndex(new THREE.BufferAttribute(new raw.constructor(kept), 1));
      prepared.clearGroups();
      for (const group of original.groups)
        prepared.addGroup(prefix[group.start / 3], prefix[(group.start + group.count) / 3] - prefix[group.start / 3], group.materialIndex);
    }
    const previous = owned;
    let committed = false, cleaned = false;
    const update = {
      isCurrent: () => pending.has(update) && !disposed && preparedRevision === revision,
      commit() {
        if (!update.isCurrent()) throw Error("Garment coverage preparation is no longer current");
        pending.delete(update); committed = true;
        if (unchanged) return;
        mesh.geometry = prepared ?? original;
        owned = prepared; active = nextActive; revision++;
      },
      dispose() {
        if (cleaned) return;
        cleaned = true; pending.delete(update);
        const release = committed ? (unchanged ? null : previous) : prepared;
        release?.dispose();
      },
    };
    const preparedRevision = revision;
    pending.add(update);
    return update;
  }
  return {
    prepareEquipmentSet,
    applyEquipmentSet(ids) {
      const update = prepareEquipmentSet(ids);
      try { update.commit(); } finally { update.dispose(); }
    },
    getInfo() {
      return {
        id: fit.id, status: "exact authored inner-top mask; action and perimeter validation required",
        active, outerId, innerTopId: innerId, hiddenFaces: active ? selected.size : 0,
        fullFaces: fit.topFaceCount, renderFaces: mesh.geometry.index.count / 3,
        completeContactFaces: original.index.count / 3, sourceTopUnchanged: true,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const update of pending) update.dispose();
      mesh.geometry = original;
      owned?.dispose();
      owned = null; active = false;
    },
  };
}
