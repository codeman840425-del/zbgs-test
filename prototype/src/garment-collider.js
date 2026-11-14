import * as THREE from "three";

// Horizontal convex cross-sections of the actually skinned Tops/Bottoms.
// This is a fitted collision proxy for this one skirt, not arbitrary cloth
// self-collision. It preserves the source clothes instead of hiding them.
const cross = (a, b, c) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function hull(points) {
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = points.filter(
    (p, i) =>
      !i ||
      Math.abs(p.x - points[i - 1].x) + Math.abs(p.z - points[i - 1].z) > 1e-7,
  );
  if (unique.length < 3) return [];
  const lower = [],
    upper = [];
  for (const p of unique) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function createGarmentCollider(vrm) {
  const meshes = [];
  vrm.scene.traverse((mesh) => {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (
      mesh.isSkinnedMesh &&
      materials.some((m) => /^(Tops|Bottoms)_/.test(m?.name))
    )
      meshes.push(mesh);
  });
  const spacing = 0.015,
    clearance = 0.008,
    sections = new Map();
  let pointsCount = 0,
    revision = 0;
  function update() {
    const samples = new Map();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const count = mesh.geometry.attributes.position.count;
      const vertices = Array.from({ length: count }, (_, i) =>
        mesh
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(mesh.matrixWorld),
      );
      const indices = mesh.geometry.index;
      const n = indices ? indices.count : count;
      for (let i = 0; i < n; i += 3) {
        const triangle = [0, 1, 2].map(
          (j) => vertices[indices ? indices.getX(i + j) : i + j],
        );
        const lo = Math.ceil(Math.min(...triangle.map((p) => p.y)) / spacing),
          hi = Math.floor(Math.max(...triangle.map((p) => p.y)) / spacing);
        for (let row = lo; row <= hi; row++) {
          const y = row * spacing,
            points = samples.get(row) || [];
          for (let j = 0; j < 3; j++) {
            const a = triangle[j],
              b = triangle[(j + 1) % 3];
            if (
              y < Math.min(a.y, b.y) ||
              y > Math.max(a.y, b.y) ||
              Math.abs(b.y - a.y) < 1e-8
            )
              continue;
            const t = (y - a.y) / (b.y - a.y);
            points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
          }
          samples.set(row, points);
        }
      }
    }
    sections.clear();
    pointsCount = 0;
    for (const [row, points] of samples) {
      const polygon = hull(points);
      if (polygon.length > 2) {
        sections.set(row, polygon);
        pointsCount += polygon.length;
      }
    }
    revision++;
  }
  function contact(p, polygon) {
    if (!polygon) return null;
    let inside = true,
      best = Infinity,
      result = null;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        dx = b.x - a.x,
        dz = b.z - a.z,
        len2 = dx * dx + dz * dz;
      if (cross(a, b, p) < 0) inside = false;
      const t = THREE.MathUtils.clamp(
        ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2,
        0,
        1,
      );
      const x = a.x + t * dx,
        z = a.z + t * dz,
        d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) {
        best = d;
        result = { x, z, nx: dz / Math.sqrt(len2), nz: -dx / Math.sqrt(len2) };
      }
    }
    return { inside, distance: Math.sqrt(best), ...result };
  }
  function collide(p) {
    // Both bracketing slices are used conservatively so sparse source vertices
    // or changing triangle slopes cannot open a gap between sample heights.
    const row = Math.floor(p.y / spacing);
    let corrected = false;
    for (const r of [row, row + 1]) {
      const c = contact(p, sections.get(r));
      if (!c || (!c.inside && c.distance >= clearance)) continue;
      p.x = c.x + c.nx * clearance;
      p.z = c.z + c.nz * clearance;
      corrected = true;
    }
    return corrected;
  }
  function penetration(p) {
    const row = Math.floor(p.y / spacing);
    return Math.max(
      0,
      ...[row, row + 1].map((r) => {
        const c = contact(p, sections.get(r));
        return c?.inside ? c.distance : 0;
      }),
    );
  }
  return {
    update,
    collide,
    penetration,
    info: () => ({
      meshes: meshes.map((m) => m.name),
      spacing,
      clearance,
      sections: sections.size,
      points: pointsCount,
      revision,
    }),
  };
}
