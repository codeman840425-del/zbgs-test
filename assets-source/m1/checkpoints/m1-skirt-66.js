import * as THREE from "three";

/** Pose-guided constraints on the actual source skirt topology and UVs.
 * This is a fitted corrective, not a cloth/self-collision simulation. */
export function createM1Skirt({ vrm, source, body }) {
  const V = THREE.Vector3,
    hips = vrm.humanoid.getRawBoneNode("hips");
  const sourceGeometry = source.geometry,
    positions = sourceGeometry.attributes.position;
  const hipIndex = source.skeleton.bones.indexOf(hips);
  if (hipIndex < 0) throw Error("M1 skirt requires its real hips bind");
  const hipBindInverse = source.skeleton.boneInverses[hipIndex];
  const geometry = sourceGeometry.clone();
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  const material = (
    Array.isArray(source.material) ? source.material : [source.material]
  ).map((m) => {
    const x = m.clone();
    x.side = THREE.DoubleSide;
    return x;
  });
  const mesh = new THREE.Mesh(
    geometry,
    Array.isArray(source.material) ? material : material[0],
  );
  mesh.name = "M1_UniformSkirt_Constrained";
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  source.parent.add(mesh);
  source.visible = false;
  const references = [],
    particles = [],
    map = [],
    lookup = new Map();
  for (let i = 0; i < positions.count; i++) {
    const reference = new V()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(source.bindMatrix)
      .applyMatrix4(hipBindInverse);
    const key = reference
      .toArray()
      .map((n) => n.toFixed(6))
      .join(",");
    if (!lookup.has(key)) {
      lookup.set(key, particles.length);
      references.push(reference);
      particles.push(new V());
    }
    map.push(lookup.get(key));
  }
  const ids = geometry.index.array,
    triangles = [];
  for (let i = 0; i < ids.length; i += 3)
    triangles.push([map[ids[i]], map[ids[i + 1]], map[ids[i + 2]]]);
  const edges = [],
    edgeKeys = new Set();
  for (const [a, b, c] of triangles)
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = [Math.min(i, j), Math.max(i, j)].join(":");
      const length = references[i].distanceTo(references[j]);
      if (length < 1e-5 || edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push([i, j, length]);
    }
  const accumulated = particles.map(() => new V()),
    contributions = new Uint16Array(particles.length);
  const free = (i) => references[i].y < 0.09;
  function clearCorrections() {
    contributions.fill(0);
    accumulated.forEach((p) => p.set(0, 0, 0));
  }
  function addCorrection(i, v, scale = 1) {
    if (!free(i)) return;
    accumulated[i].addScaledVector(v, scale);
    contributions[i]++;
  }
  function applyCorrections() {
    for (let i = 0; i < particles.length; i++)
      if (contributions[i])
        particles[i].addScaledVector(accumulated[i], 1 / contributions[i]);
  }
  const smooth = (x) => {
    x = THREE.MathUtils.clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const legs = ["left", "right"].map((side) => ({
    side,
    upper: vrm.humanoid.getRawBoneNode(side + "UpperLeg"),
    lower: vrm.humanoid.getRawBoneNode(side + "LowerLeg"),
    a: new V(),
    b: new V(),
    radius: 0,
    bend: 0,
  }));
  vrm.scene.updateMatrixWorld(true);
  // Fit thigh radii from the actual current body surface in its initial rest pose.
  for (const leg of legs) {
    leg.upper.getWorldPosition(leg.a);
    leg.lower.getWorldPosition(leg.b);
    const axis = new V().subVectors(leg.b, leg.a),
      length2 = axis.lengthSq(),
      distances = [];
    for (const m of body) {
      const used = new Set(
        m.geometry.index?.array ||
          Array.from(
            { length: m.geometry.attributes.position.count },
            (_, i) => i,
          ),
      );
      const legJoint = m.skeleton.bones.indexOf(leg.upper),
        js = m.geometry.attributes.skinIndex,
        ws = m.geometry.attributes.skinWeight;
      for (const i of used) {
        let legWeight = 0;
        for (let k = 0; k < 4; k++)
          if (js.getComponent(i, k) === legJoint)
            legWeight += ws.getComponent(i, k);
        if (legWeight < 0.25) continue;
        const p = m.getVertexPosition(i, new V()).applyMatrix4(m.matrixWorld);
        const t = new V().subVectors(p, leg.a).dot(axis) / length2;
        if (t < 0.13 || t > 0.86) continue;
        const nearest = leg.a.clone().addScaledVector(axis, t);
        const d = p.distanceTo(nearest);
        // Reject the other thigh and torso; the segment-length gate scales with this body.
        if (d < Math.sqrt(length2) * 0.3) distances.push(d);
      }
    }
    distances.sort((a, b) => a - b);
    if (!distances.length) throw Error("M1 cannot fit thigh collision radius");
    leg.radius = distances[Math.floor(distances.length * 0.97)] + 0.009;
  }
  const target = new V(),
    axis = new V(),
    offset = new V(),
    near = new V(),
    delta = new V(),
    sample = new V(),
    before = new V();
  const hipInverse = new THREE.Matrix4(),
    meshInverse = new THREE.Matrix4();
  let revision = 0,
    maxCorrection = 0,
    maxEdgeStretch = 1;
  function collision(p, boxes) {
    let changed = false;
    for (const leg of legs) {
      axis.subVectors(leg.b, leg.a);
      const t = THREE.MathUtils.clamp(
        offset.subVectors(p, leg.a).dot(axis) / axis.lengthSq(),
        0,
        1,
      );
      near.copy(leg.a).addScaledVector(axis, t);
      offset.subVectors(p, near);
      const d = offset.length();
      if (d < leg.radius) {
        if (d < 1e-7) offset.set(0, 1, 0);
        else offset.divideScalar(d);
        p.copy(near).addScaledVector(offset, leg.radius);
        changed = true;
      }
    }
    for (const box of boxes) {
      before.copy(p);
      if (box.projectOut) box.projectOut(p, 0.006);
      else if (box.containsPoint?.(p)) {
        const values = [
          p.x - box.min.x,
          box.max.x - p.x,
          p.y - box.min.y,
          box.max.y - p.y,
          p.z - box.min.z,
          box.max.z - p.z,
        ];
        const k = values.indexOf(Math.min(...values)),
          component = ["x", "x", "y", "y", "z", "z"][k];
        p[component] =
          k % 2 ? box.max[component] + 0.006 : box.min[component] - 0.006;
      }
      if (before.distanceToSquared(p) > 1e-12) changed = true;
    }
    return changed;
  }
  function update(_dt = 0, boxes = []) {
    vrm.scene.updateMatrixWorld(true);
    hipInverse.copy(hips.matrixWorld).invert();
    meshInverse.copy(mesh.matrixWorld).invert();
    for (const leg of legs) {
      leg.upper.getWorldPosition(leg.a);
      leg.lower.getWorldPosition(leg.b);
      const a = leg.a.clone().applyMatrix4(hipInverse),
        b = leg.b.clone().applyMatrix4(hipInverse);
      const d = b.sub(a);
      leg.bend = THREE.MathUtils.clamp(
        Math.atan2(-d.z, -d.y),
        0,
        Math.PI * 0.49,
      );
    }
    maxCorrection = 0;
    for (let i = 0; i < references.length; i++) {
      const r = references[i],
        front = smooth((0.07 - r.z) / 0.14),
        depth = Math.max(0, 0.045 - r.y),
        side = smooth((r.x + 0.04) / 0.08);
      const bend =
        THREE.MathUtils.lerp(legs[0].bend, legs[1].bend, side) * front;
      target.copy(r);
      target.y += depth * (1 - Math.cos(bend));
      target.z -= depth * Math.sin(bend);
      particles[i].copy(target).applyMatrix4(hips.matrixWorld);
      // The front panel rests on the upper thigh surface when seated instead
      // of remaining a rigid horizontal shelf at the raised waistband level.
      const drape =
        front *
        smooth((0.055 - r.y) / 0.1) *
        smooth((Math.max(...legs.map((l) => l.bend)) - 0.65) / 0.55);
      if (drape > 0) {
        let surface = -Infinity;
        for (const leg of legs) {
          axis.subVectors(leg.b, leg.a);
          const t = THREE.MathUtils.clamp(
            offset.subVectors(particles[i], leg.a).dot(axis) / axis.lengthSq(),
            0,
            1,
          );
          near.copy(leg.a).addScaledVector(axis, t);
          const horizontal = new V(axis.z, 0, -axis.x).normalize(),
            lateral = Math.abs(
              offset.subVectors(particles[i], near).dot(horizontal),
            );
          if (lateral < leg.radius * 1.1)
            surface = Math.max(
              surface,
              near.y +
                Math.sqrt(
                  Math.max(0, leg.radius * leg.radius - lateral * lateral),
                ) +
                0.004,
            );
        }
        if (Number.isFinite(surface))
          particles[i].y = THREE.MathUtils.lerp(particles[i].y, surface, drape);
      }
      if (r.y < 0.09) collision(particles[i], boxes);
    }
    // Jacobi accumulation: shared vertices receive the mean correction from
    // one immutable iteration state. The old sequential full projection per
    // incident triangle could amplify one leg movement into a long spike.
    for (let pass = 0; pass < 8; pass++) {
      clearCorrections();
      for (const tri of triangles) {
        for (const group of [
          tri,
          [tri[0], tri[1]],
          [tri[1], tri[2]],
          [tri[2], tri[0]],
        ]) {
          sample.set(0, 0, 0);
          for (const i of group) sample.add(particles[i]);
          sample.divideScalar(group.length);
          const original = sample.clone();
          if (!collision(sample, boxes)) continue;
          const movable = group.filter(free);
          if (!movable.length) continue;
          delta
            .subVectors(sample, original)
            .multiplyScalar(group.length / movable.length);
          maxCorrection = Math.max(maxCorrection, delta.length());
          for (const i of movable) addCorrection(i, delta);
        }
      }
      applyCorrections();
      // Enforce the actual mesh's local connectivity. A skirt panel may fold,
      // but adjacent points must not separate without a material stretch cost.
      clearCorrections();
      for (const [a, b, rest] of edges) {
        delta.subVectors(particles[b], particles[a]);
        const length = delta.length();
        const allowed = rest * 1.25;
        if (length <= allowed || length < 1e-8) continue;
        delta.multiplyScalar((length - allowed) / length);
        const factor = free(a) && free(b) ? 0.5 : 1;
        addCorrection(a, delta, factor);
        addCorrection(b, delta, -factor);
      }
      applyCorrections();
    }
    maxEdgeStretch = 1;
    for (const [a, b, rest] of edges)
      if (rest > 0.005)
        maxEdgeStretch = Math.max(
          maxEdgeStretch,
          particles[a].distanceTo(particles[b]) / rest,
        );
    const array = geometry.attributes.position;
    for (let i = 0; i < map.length; i++) {
      target.copy(particles[map[i]]).applyMatrix4(meshInverse);
      array.setXYZ(i, target.x, target.y, target.z);
    }
    array.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    revision++;
  }
  return {
    mesh,
    update,
    getInfo: () => ({
      method:
        "Actual source skirt pose-guided vertex constraints + fitted thigh/chair collision; no cloth inertia/self-collision",
      revision,
      maxPanelCorrection: maxCorrection,
      maxEdgeStretch,
      constraintIterations: 8,
      thighRadii: legs.map((l) => l.radius),
      bend: legs.map((l) => l.bend),
      weldedVertices: particles.length,
    }),
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.forEach((m) => m.dispose());
      source.visible = true;
    },
  };
}
