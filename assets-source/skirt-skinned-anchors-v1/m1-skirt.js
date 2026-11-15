import * as THREE from "three";
import { skirtSupportWeight, blendSkirtSupports, skirtLateralAxis } from "./skirt-support.js";

/** Pose-guided constraints on the actual source skirt topology and UVs.
 * This is a fitted corrective, not a cloth/self-collision simulation. */
export function createM1Skirt({ vrm, source, body, fit }) {
  if (!fit || !Number.isFinite(fit.fixedBandMinY) || !fit.guide ||
      source.geometry.attributes.position.count !== fit.vertexCount)
    throw Error("Skirt requires an explicit matching corrective fit");
  if (Object.values(source.geometry.morphAttributes).some(a => a.length))
    throw Error("Skirt corrective does not support morph targets; a fitted adapter is required");
  const V = THREE.Vector3,
    hips = vrm.humanoid.getRawBoneNode("hips");
  const sourceGeometry = source.geometry,
    positions = sourceGeometry.attributes.position;
  const hipIndex = source.skeleton.bones.indexOf(hips);
  if (hipIndex < 0) throw Error("M1 skirt requires its real hips bind");
  const hipBindInverse = source.skeleton.boneInverses[hipIndex];
  const references = [],
    particles = [],
    sourceIndices = [],
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
      sourceIndices.push(i);
    } else {
      const particle = lookup.get(key), first = sourceIndices[particle];
      const weights = id => {
        const result = new Map();
        for (let k = 0; k < 4; k++) {
          const joint = sourceGeometry.attributes.skinIndex.getComponent(id, k);
          const weight = sourceGeometry.attributes.skinWeight.getComponent(id, k);
          if (weight) result.set(joint, (result.get(joint) || 0) + weight);
        }
        return result;
      };
      const a = weights(first), b = weights(i);
      if (references[particle].distanceToSquared(reference) > 1e-24 ||
          a.size !== b.size || [...a].some(([joint, weight]) => b.get(joint) !== weight))
        throw Error(`Skirt weld ${first}/${i} has non-equivalent positions or skin weights`);
    }
    map.push(lookup.get(key));
  }
  // Validate before allocating/attaching the replacement render mesh.
  const geometry = sourceGeometry.clone();
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  const material = (Array.isArray(source.material) ? source.material : [source.material])
    .map(m => { const copy = m.clone(); copy.side = THREE.DoubleSide; return copy; });
  const mesh = new THREE.Mesh(geometry, Array.isArray(source.material) ? material : material[0]);
  mesh.name = "M1_UniformSkirt_Constrained";
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  source.parent.add(mesh);
  source.visible = false;
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
  const free = (i) => references[i].y < fit.fixedBandMinY;
  // The topology and pins are immutable. Preserve the exact old group/order
  // while avoiding 22,400 temporary group arrays/filter results per update.
  const panels = [];
  for (const tri of triangles)
    for (const group of [tri, [tri[0],tri[1]], [tri[1],tri[2]], [tri[2],tri[0]]]) {
      const movable = group.filter(free);
      if (movable.length) panels.push({group,movable,factor:group.length/movable.length});
    }
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
  const guide = references.map(r=>({
    front:smooth((fit.guide.frontOffset-r.z)/fit.guide.frontSpan),
    depth:Math.max(0,fit.guide.depthOrigin-r.y),
    side:smooth((r.x+fit.guide.sideOffset)/fit.guide.sideSpan),
    drape:smooth((fit.guide.drapeOrigin-r.y)/fit.guide.drapeSpan),
  }));
  const legs = ["left", "right"].map((side) => ({
    side,
    upper: vrm.humanoid.getRawBoneNode(side + "UpperLeg"),
    lower: vrm.humanoid.getRawBoneNode(side + "LowerLeg"),
    a: new V(),
    b: new V(),
    radius: 0,
    bend: 0,
    axis: new V(),
    axisLengthSq: 0,
    horizontal: new V(),
    bounds: new THREE.Box3(),
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
    before = new V(),
    originalSample = new V(),
    localA = new V(),
    localB = new V(),
    pelvisAcross = new V();
  const boxCache = new WeakMap();
  const activeBoxes = [];
  const supportHeights = [0, 0], supportWeights = [0, 0];
  const hipInverse = new THREE.Matrix4(),
    meshInverse = new THREE.Matrix4();
  let revision = 0,
    maxCorrection = 0,
    maxEdgeStretch = 1;
  function collision(p, boxes) {
    let changed = false;
    for (const leg of legs) {
      if (!leg.bounds.containsPoint(p)) continue;
      const t = THREE.MathUtils.clamp(
        offset.subVectors(p, leg.a).dot(leg.axis) / leg.axisLengthSq,
        0,
        1,
      );
      near.copy(leg.a).addScaledVector(leg.axis, t);
      offset.subVectors(p, near);
      const d = offset.length();
      if (d < leg.radius) {
        if (d < 1e-7) offset.set(0, 1, 0);
        else offset.divideScalar(d);
        p.copy(near).addScaledVector(offset, leg.radius);
        changed = true;
      }
    }
    for (const item of activeBoxes) {
      const box=item.box;
      if(item.bounds && !item.bounds.containsPoint(p))continue;
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
      leg.axis.subVectors(leg.b,leg.a);
      leg.axisLengthSq=leg.axis.lengthSq();
      leg.bounds.makeEmpty().expandByPoint(leg.a).expandByPoint(leg.b).expandByScalar(leg.radius+1e-12);
      const a = localA.copy(leg.a).applyMatrix4(hipInverse),
        b = localB.copy(leg.b).applyMatrix4(hipInverse);
      const d = b.sub(a);
      leg.bend = THREE.MathUtils.clamp(
        Math.atan2(-d.z, -d.y),
        0,
        Math.PI * 0.49,
      );
    }
    pelvisAcross.subVectors(legs[1].a, legs[0].a);
    for (const leg of legs) skirtLateralAxis(leg.axis, pelvisAcross, leg.horizontal);
    activeBoxes.length=0;
    for(const box of boxes){
      let item=boxCache.get(box);
      if(!item){item={box,bounds:box.localBox&&box.matrixWorld?new THREE.Box3():null};boxCache.set(box,item);}
      // An expanded local OBB transformed to a conservative world AABB only
      // skips points that projectOut would already reject. The actual OBB
      // callback still decides every possible contact.
      if(item.bounds)item.bounds.copy(box.localBox).expandByScalar(.006+1e-12).applyMatrix4(box.matrixWorld);
      activeBoxes.push(item);
    }
    const bendDrape=smooth((Math.max(legs[0].bend,legs[1].bend)-.65)/.55);
    maxCorrection = 0;
    for (let i = 0; i < references.length; i++) {
      const r = references[i],
        {front,depth,side} = guide[i];
      // The attachment band is authored with spine/chest/hips weights. A
      // constrained hem must not replace those weights with a rigid hips bind.
      // Existing free-panel constraints attach to these live skinned anchors.
      if (!free(i)) {
        source.getVertexPosition(sourceIndices[i], particles[i]).applyMatrix4(source.matrixWorld);
        continue;
      }
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
        guide[i].drape * bendDrape;
      if (drape > 0) {
        for (let j = 0; j < legs.length; j++) {
          const leg = legs[j];
          const t = THREE.MathUtils.clamp(
            offset.subVectors(particles[i], leg.a).dot(leg.axis) / leg.axisLengthSq,
            0,
            1,
          );
          near.copy(leg.a).addScaledVector(leg.axis, t);
          const lateral = Math.abs(
              offset.subVectors(particles[i], near).dot(leg.horizontal),
            );
          supportWeights[j] = skirtSupportWeight(lateral, leg.radius);
          supportHeights[j] = near.y +
                Math.sqrt(
                  Math.max(0, leg.radius * leg.radius - lateral * lateral),
                ) + 0.004;
        }
        particles[i].y = blendSkirtSupports(particles[i].y,
          supportHeights[0], supportWeights[0], supportHeights[1], supportWeights[1], drape);
      }
      collision(particles[i], boxes);
    }
    // Jacobi accumulation: shared vertices receive the mean correction from
    // one immutable iteration state. The old sequential full projection per
    // incident triangle could amplify one leg movement into a long spike.
    for (let pass = 0; pass < 8; pass++) {
      clearCorrections();
      for (const {group,movable,factor} of panels) {
          sample.set(0, 0, 0);
          for (const i of group) sample.add(particles[i]);
          sample.divideScalar(group.length);
          originalSample.copy(sample);
          if (!collision(sample, boxes)) continue;
          delta
            .subVectors(sample, originalSample)
            .multiplyScalar(factor);
          maxCorrection = Math.max(maxCorrection, delta.length());
          for (const i of movable) addCorrection(i, delta);
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
      fitId: fit.id,
      fitStatus: fit.status,
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
