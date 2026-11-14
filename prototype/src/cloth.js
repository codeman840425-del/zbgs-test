import * as THREE from "three";
import { createGarmentCollider } from "./garment-collider.js";
// Verlet integration and distance relaxation adapted from Three.js r110
// webgl_animation_cloth (MIT). Added cylindrical topology and body/seat collision.
export function createSkirt(vrm, root, scene) {
  const V = THREE.Vector3,
    rows = 16,
    cols = 48,
    particles = [],
    links = [],
    uv = [],
    indices = [],
    pins = [];
  const bone = (n) => vrm.humanoid.getRawBoneNode(n),
    hips = bone("hips");
  const garmentCollider = createGarmentCollider(vrm);
  root.updateMatrixWorld(true);
  const hip = hips.getWorldPosition(new V()),
    left = bone("leftUpperLeg").getWorldPosition(new V()),
    right = bone("rightUpperLeg").getWorldPosition(new V()),
    knee = bone("leftLowerLeg").getWorldPosition(new V());
  const length = (hip.y - knee.y) * 1.02,
    rx = Math.abs(left.x - right.x) / 2 + 0.084,
    rz = 0.135,
    inverse = hips.matrixWorld.clone().invert(),
    at = (r, s) => r * cols + ((s + cols) % cols);
  for (let r = 0; r <= rows; r++)
    for (let s = 0; s < cols; s++) {
      const t = r / rows,
        a = (s / cols) * Math.PI * 2,
        pleat = 1 + Math.cos(a * 16) * 0.035 * t,
        p = new V(
          hip.x + Math.cos(a) * (rx + t * 0.1) * pleat,
          hip.y + 0.04 - length * t,
          hip.z + Math.sin(a) * (rz + t * 0.1) * pleat,
        );
      particles.push({ p: p.clone(), old: p.clone(), pinned: r === 0 });
      if (!r) pins.push(p.clone().applyMatrix4(inverse));
      uv.push(s / cols, t);
      if (r < rows)
        indices.push(
          at(r, s),
          at(r, s + 1),
          at(r + 1, s),
          at(r, s + 1),
          at(r + 1, s + 1),
          at(r + 1, s),
        );
    }
  const link = (a, b, strength = 1) =>
    links.push([a, b, particles[a].p.distanceTo(particles[b].p), strength]);
  const referenceParticles = particles.map((item) =>
    item.p.clone().applyMatrix4(inverse),
  );
  for (let r = 0; r <= rows; r++)
    for (let s = 0; s < cols; s++) {
      link(at(r, s), at(r, s + 1));
      if (r < rows) {
        link(at(r, s), at(r + 1, s));
        link(at(r, s), at(r + 1, s + 1), 0.5);
        link(at(r, s + 1), at(r + 1, s), 0.5);
      }
      if (r < rows - 1) link(at(r, s), at(r + 2, s), 0.2);
    }
  const g = new THREE.BufferGeometry(),
    arr = new Float32Array(particles.length * 3);
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage),
  );
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#304568";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#23334f";
  ctx.fillRect(0, 0, 512, 30);
  ctx.fillStyle = "#d9c6aa";
  ctx.fillRect(0, 470, 512, 8);
  ctx.fillRect(0, 489, 512, 4);
  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = "rgba(255,255,255,.04)";
    ctx.fillRect(x, 30, 12, 440);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshToonMaterial({ map, side: THREE.DoubleSide }),
  );
  mesh.name = "GravitySkirt";
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  mesh.visible = false;
  const delta = new V(),
    q = new V(),
    v = new V(),
    axis = new V(),
    nearest = new V(),
    lastHip = hip.clone();
  let accumulator = 0,
    steps = 0;
  const capsules = [];
  const surfacePoint = new V(),
    surfaceBefore = new V();
  function constrainPanels() {
    // Vertex-only collision can leave a triangle cutting through a bent thigh
    // even though all three corners are outside. Constrain the actual panel's
    // centre and edge midpoints too; keep the waist pins unchanged.
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      for (const group of [
        ids,
        [ids[0], ids[1]],
        [ids[1], ids[2]],
        [ids[2], ids[0]],
      ]) {
        surfacePoint.set(0, 0, 0);
        for (const id of group) surfacePoint.add(particles[id].p);
        surfacePoint.divideScalar(group.length);
        surfaceBefore.copy(surfacePoint);
        if (!garmentCollider.collide(surfacePoint)) continue;
        const free = group.filter((id) => !particles[id].pinned);
        if (!free.length) continue;
        surfacePoint
          .sub(surfaceBefore)
          .multiplyScalar(group.length / free.length);
        for (const id of free) particles[id].p.add(surfacePoint);
      }
    }
  }
  function collide(p) {
    for (const c of capsules) {
      axis.subVectors(c.b, c.a);
      const t = THREE.MathUtils.clamp(
        v.subVectors(p, c.a).dot(axis) / axis.lengthSq(),
        0,
        1,
      );
      nearest.copy(c.a).addScaledVector(axis, t);
      v.subVectors(p, nearest);
      const d = v.length();
      if (d < c.r) {
        if (d < 1e-5) v.set(0, 0, 1);
        else v.divideScalar(d);
        p.copy(nearest).addScaledVector(v, c.r);
      }
    }
  }
  function update(dt = 0.016, boxes = [], dynamics = true) {
    root.updateMatrixWorld(true);
    garmentCollider.update();
    if (!dynamics) {
      // Explicit diagnostic reference: no gravity or inertia. The UI labels
      // this as dynamics-disabled; the fully dressed acceptance uses dynamics.
      for (let i = 0; i < particles.length; i++) {
        particles[i].p
          .copy(referenceParticles[i])
          .applyMatrix4(hips.matrixWorld);
        particles[i].old.copy(particles[i].p);
        particles[i].p.toArray(arr, i * 3);
      }
      accumulator = 0;
      lastHip.copy(hips.getWorldPosition(q));
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      return;
    }
    const current = hips.getWorldPosition(q),
      jump = current.distanceTo(lastHip);
    if (jump > 0.5) {
      delta.subVectors(current, lastHip);
      for (const item of particles) {
        item.p.add(delta);
        item.old.add(delta);
      }
    }
    lastHip.copy(current);
    capsules.length = 0;
    for (const side of ["left", "right"]) {
      capsules.push({
        a: bone(side + "UpperLeg").getWorldPosition(new V()),
        b: bone(side + "LowerLeg").getWorldPosition(new V()),
        r: 0.087,
      });
      capsules.push({
        a: bone(side + "LowerLeg").getWorldPosition(new V()),
        b: bone(side + "Foot").getWorldPosition(new V()),
        r: 0.06,
      });
    }
    capsules.push({
      a: bone("leftUpperLeg").getWorldPosition(new V()),
      b: bone("rightUpperLeg").getWorldPosition(new V()),
      r: 0.115,
    });
    accumulator += Math.min(dt, 0.05);
    while (accumulator >= 1 / 120) {
      accumulator -= 1 / 120;
      steps++;
      for (const item of particles)
        if (!item.pinned) {
          v.subVectors(item.p, item.old).multiplyScalar(0.97);
          item.old.copy(item.p);
          item.p.add(v);
          item.p.y -= 9.81 / 14400;
        }
      for (let iteration = 0; iteration < 7; iteration++) {
        for (const [a, b, length, strength] of links) {
          const pa = particles[a],
            pb = particles[b];
          delta.subVectors(pb.p, pa.p);
          const dist = delta.length();
          if (dist < 1e-8) continue;
          delta.multiplyScalar((1 - length / dist) * strength);
          const weight = pa.pinned || pb.pinned ? 1 : 0.5;
          if (!pa.pinned) pa.p.addScaledVector(delta, weight);
          if (!pb.pinned) pb.p.subVectors(pb.p, delta.multiplyScalar(weight));
        }
        for (let i = cols; i < particles.length; i++) {
          const p = particles[i].p;
          collide(p);
          garmentCollider.collide(p);
          for (const box of boxes) {
            if (box.projectOut) {
              box.projectOut(p, 0.006);
              continue;
            }
            if (box.containsPoint(p)) {
              const faces = [
                  p.x - box.min.x,
                  box.max.x - p.x,
                  p.y - box.min.y,
                  box.max.y - p.y,
                  p.z - box.min.z,
                  box.max.z - p.z,
                ],
                f = faces.indexOf(Math.min(...faces));
              if (f === 0) p.x = box.min.x - 0.006;
              if (f === 1) p.x = box.max.x + 0.006;
              if (f === 2) p.y = box.min.y - 0.006;
              if (f === 3) p.y = box.max.y + 0.006;
              if (f === 4) p.z = box.min.z - 0.006;
              if (f === 5) p.z = box.max.z + 0.006;
            }
          }
          p.y = Math.max(0.015, p.y);
        }
        for (let s = 0; s < cols; s++) {
          particles[s].p.copy(pins[s]).applyMatrix4(hips.matrixWorld);
          particles[s].old.copy(particles[s].p);
        }
      }
      constrainPanels();
    }
    for (let i = 0; i < particles.length; i++)
      particles[i].p.toArray(arr, i * 3);
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
  update(1 / 60);
  return {
    mesh,
    update,
    reset: () => {
      root.updateWorldMatrix(true, true);
      for (let i = 0; i < particles.length; i++) {
        particles[i].p
          .copy(referenceParticles[i])
          .applyMatrix4(hips.matrixWorld);
        particles[i].old.copy(particles[i].p);
        particles[i].p.toArray(arr, i * 3);
      }
      lastHip.copy(hips.getWorldPosition(q));
      accumulator = 0;
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    },
    info: () => ({
      vertices: particles.length,
      solver: "Three.js Verlet distance constraints",
      gravity: 9.81,
      substep: 1 / 120,
      steps,
      garmentCollider: garmentCollider.info(),
      garmentPenetration: Math.max(
        ...particles.map((p) => garmentCollider.penetration(p.p)),
      ),
      limitations: "近似布料，无自碰撞，非通用体型适配",
    }),
  };
}
