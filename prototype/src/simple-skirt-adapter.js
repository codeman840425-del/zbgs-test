import * as THREE from "three";

/** Single diagnostic garment, AFTER createEquipment verified SHA/body/raw bind.
 * No guide, cloth, body pose writes or authored sitting response is hidden here.
 */
export function createSimpleSkirtAdapter({ vrm, item, body }) {
  if (item.id !== "m1-sixfold-skirt-layer-transition-v1" || item.meshes.length !== 2)
    throw new Error("Unexpected diagnostic garment primitives");
  const controls = new Map(), skeletons = new Map();
  const expected = new Set([
    "J_Sec_L_SkirtBack", "J_Sec_L_SkirtFront", "J_Sec_L_SkirtSide",
    "J_Sec_R_SkirtBack", "J_Sec_R_SkirtFront", "J_Sec_R_SkirtSide",
  ]);
  for (const mesh of item.meshes) {
    if (!mesh.isSkinnedMesh || Array.isArray(mesh.material))
      throw new Error("One actual alpha/material primitive per SkinnedMesh is required");
    const original = mesh.skeleton;
    let replacement = skeletons.get(original);
    if (!replacement) {
      const bones = original.bones.map((source) => {
        if (!expected.has(source.name)) return source;
        let record = controls.get(source.name);
        if (!record) {
          const side = source.name.includes("_L_") ? "left" : "right";
          const parent = vrm.humanoid.getRawBoneNode(side + "UpperLeg");
          if (source.parent !== parent) throw new Error("Skirt helper parent differs from authored fit");
          source.updateMatrix();
          const bone = new THREE.Bone();
          bone.name = `${item.id}:private:${source.name}`;
          bone.matrixAutoUpdate = false;
          // These nodes are deliberately not added to humanoid or spring lists.
          record = { sourceName: source.name, parent, restLocal: source.matrix.clone(), bone };
          controls.set(source.name, record);
        }
        return record.bone;
      });
      replacement = new THREE.Skeleton(bones, original.boneInverses.map((m) => m.clone()));
      skeletons.set(original, replacement);
    }
    mesh.bind(replacement, mesh.bindMatrix.clone());
    mesh.userData.assetRole = "skirt";
    mesh.userData.diagnosticGarment = item.id;
  }
  if (controls.size !== 6) throw new Error("Expected six verified private garment helpers");
  // The equipment loader owns final disposal; replace its owned skeleton set.
  for (const previous of skeletons.keys()) previous.dispose();
  item.skeletons = new Set(skeletons.values());

  // Actual BODY sampling, not a reused old skirt shell or arbitrary radius.
  vrm.scene.updateMatrixWorld(true);
  const p = new THREE.Vector3(), delta = new THREE.Vector3(), nearest = new THREE.Vector3();
  const measures = ["left", "right"].map((side) => {
    const upper = vrm.humanoid.getRawBoneNode(side + "UpperLeg");
    const lower = vrm.humanoid.getRawBoneNode(side + "LowerLeg");
    const a = upper.getWorldPosition(new THREE.Vector3());
    const b = lower.getWorldPosition(new THREE.Vector3());
    const axis = b.clone().sub(a), length2 = axis.lengthSq(), distances = [];
    for (const mesh of body) {
      const joint = mesh.skeleton.bones.indexOf(upper);
      const joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      for (const index of new Set(mesh.geometry.index.array)) {
        let weight = 0;
        for (let k = 0; k < 4; k++) if (joints.getComponent(index, k) === joint) weight += weights.getComponent(index, k);
        if (weight < 0.25) continue;
        mesh.getVertexPosition(index, p).applyMatrix4(mesh.matrixWorld);
        const t = delta.subVectors(p, a).dot(axis) / length2;
        if (t < 0.13 || t > 0.86) continue;
        nearest.copy(a).addScaledVector(axis, t);
        const distance = p.distanceTo(nearest);
        if (distance < Math.sqrt(length2) * 0.3) distances.push(distance);
      }
    }
    distances.sort((a, b) => a - b);
    if (!distances.length) throw new Error("Actual body thigh calibration is empty");
    const bodyRadius97 = distances[Math.floor(distances.length * 0.97)];
    return { side, samples: distances.length, bodyRadius97, existingHandClearance: 0.009, radius: bodyRadius97 + 0.009 };
  });
  let revision = 0, disposed = false;
  const matrix = new THREE.Matrix4();
  function update() {
    if (disposed) return;
    let changed = false;
    for (const control of controls.values()) {
      // Parent is the current solved raw thigh, local orientation is owned by
      // this garment. Shared secondary spring cannot overwrite this palette.
      matrix.multiplyMatrices(control.parent.matrixWorld, control.restLocal);
      if (!matrix.equals(control.bone.matrixWorld)) changed = true;
      control.bone.matrix.copy(matrix);
      control.bone.matrixWorld.copy(matrix);
      control.bone.matrixWorldNeedsUpdate = false;
    }
    for (const skeleton of item.skeletons) skeleton.update();
    if (changed) revision++;
  }
  update();
  return {
    meshes: item.meshes,
    update,
    getInfo: () => ({
      type: "diagnostic-private-palette-skin",
      qualified: false,
      id: item.id,
      legacyGuide: false,
      authoredSittingResponse: false,
      thighRadii: measures.map((m) => m.radius),
      actualBodyMeasurement: measures,
      revision,
      privateNodes: [...controls.values()].map((c) => ({ name: c.bone.name, source: c.sourceName, parentSemantic: c.parent.name })),
      finalMeshes: item.meshes.map((m) => ({ name: m.name, uuid: m.uuid, skinned: m.isSkinnedMesh })),
      limits: "Standing layer failure retained; source sitting response not authored. Not a physical-cloth or contact pass.",
    }),
    dispose: () => { disposed = true; controls.clear(); },
  };
}
