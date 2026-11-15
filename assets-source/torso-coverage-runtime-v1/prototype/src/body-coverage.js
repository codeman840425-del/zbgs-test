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
