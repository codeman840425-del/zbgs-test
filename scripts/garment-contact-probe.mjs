// Independent actual-triangle intersection check (not the cloth proxy).
// Run in browser context with page.evaluate(measureGarmentContact).
export function measureGarmentContact() {
  const a = window.__debug.avatar(),
    skirt = a.skirt;
  const sub = (p, q) => p.map((v, i) => v - q[i]);
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cross = (p, q) => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
  function triangles(mesh) {
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry,
      vertices = Array.from({ length: g.attributes.position.count }, (_, i) =>
        mesh
          .getVertexPosition(i, mesh.position.clone())
          .applyMatrix4(mesh.matrixWorld)
          .toArray(),
      );
    const idx = g.index,
      count = idx ? idx.count : vertices.length,
      out = [];
    for (let i = 0; i < count; i += 3) {
      const p = [0, 1, 2].map((j) => vertices[idx ? idx.getX(i + j) : i + j]);
      const e = [sub(p[1], p[0]), sub(p[2], p[1]), sub(p[0], p[2])];
      out.push({
        p,
        e,
        n: cross(e[0], e[1]),
        min: [0, 1, 2].map((j) => Math.min(...p.map((v) => v[j]))),
        max: [0, 1, 2].map((j) => Math.max(...p.map((v) => v[j]))),
        index: i / 3,
      });
    }
    return out;
  }
  function intersects(a, b) {
    if (
      [0, 1, 2].some(
        (j) => a.max[j] < b.min[j] - 1e-7 || b.max[j] < a.min[j] - 1e-7,
      )
    )
      return false;
    const axes = [
      a.n,
      b.n,
      ...a.e.flatMap((e) => b.e.map((f) => cross(e, f))),
      ...a.e.map((e) => cross(a.n, e)),
      ...b.e.map((e) => cross(b.n, e)),
    ];
    return axes.every((axis) => {
      if (dot(axis, axis) < 1e-20) return true;
      const p = a.p.map((v) => dot(v, axis)),
        q = b.p.map((v) => dot(v, axis));
      return (
        Math.max(...p) >= Math.min(...q) - 1e-9 &&
        Math.max(...q) >= Math.min(...p) - 1e-9
      );
    });
  }
  const cloth = triangles(skirt),
    results = [];
  a.root.traverse((mesh) => {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (
      !mesh.isSkinnedMesh ||
      !materials.some((m) => /^(Tops|Bottoms)_/.test(m?.name))
    )
      return;
    let count = 0;
    const pairs = [];
    for (const body of triangles(mesh))
      for (const panel of cloth)
        if (intersects(body, panel)) {
          count++;
          if (pairs.length < 12)
            pairs.push({
              garmentTriangle: body.index,
              skirtTriangle: panel.index,
            });
        }
    results.push({
      mesh: mesh.name,
      visible: mesh.visible,
      intersections: count,
      examples: pairs,
    });
  });
  return {
    time: window.__debug.snapshot().motion.actionTime,
    mode: window.__debug.snapshot().mode,
    results,
  };
}
