import * as THREE from 'three';

// Reuse the planar coverage algorithm from mirror-geometry and the convex
// contact algorithm from vanity-geometry, keeping legacy validators unchanged.
// Rings are proven extrusions before convex decomposition for contact checks.
// Float32 positions may differ at a shared interface by a few tens of nm.
const POSITION_EPSILON = 1e-6;
const WELD_EPSILON = 1e-7;
const AREA_EPSILON = 1e-10;
const CONTACT_AREA_EPSILON = 1e-8;
const VOLUME_EPSILON = 1e-12;
const THICKNESS_EPSILON = 1e-5;
const CLIP_EPSILON = 1e-10;
const AXES = ['x', 'y', 'z'];
const COVERAGE_EPSILON = 1e-7;
const IDENTITY = new THREE.Matrix4().elements;

function reject(fail, code, component, message, details) {
  fail(code, component ? `scene.${component}` : 'resource', message, details);
}

function addDirection(directions, direction) {
  if (direction.lengthSq() < 1e-20) return;
  const normalized = direction.clone().normalize();
  if (!directions.some(existing => Math.abs(existing.dot(normalized)) > 1 - 1e-10)) directions.push(normalized);
}

function planeOf(points) {
  const normal = new THREE.Vector3().subVectors(points[1], points[0])
    .cross(new THREE.Vector3().subVectors(points[2], points[0])).normalize();
  return {normal, constant: normal.dot(points[0])};
}

function signedVolume(polygons, origin) {
  let volume = 0;
  for (const polygon of polygons) for (let index = 1; index + 1 < polygon.length; index++) {
    const a = polygon[0].clone().sub(origin);
    const b = polygon[index].clone().sub(origin);
    const c = polygon[index + 1].clone().sub(origin);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

function clipPolygon(polygon, plane) {
  const result = [];
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index], end = polygon[(index + 1) % polygon.length];
    const startDistance = plane.normal.dot(start) - plane.constant;
    const endDistance = plane.normal.dot(end) - plane.constant;
    const startInside = startDistance <= CLIP_EPSILON, endInside = endDistance <= CLIP_EPSILON;
    if (startInside) result.push(start);
    if (startInside !== endInside) {
      const amount = Math.max(0, Math.min(1, startDistance / (startDistance - endDistance)));
      result.push(start.clone().lerp(end, amount));
    }
  }
  return result;
}

function clipToBody(polygon, body) {
  let result = polygon;
  for (const plane of body.planes) {
    result = clipPolygon(result, plane);
    if (result.length < 3) return [];
  }
  return result;
}

function polygonArea(polygon) {
  let area = 0;
  for (let index = 1; index + 1 < polygon.length; index++) {
    area += new THREE.Vector3().subVectors(polygon[index], polygon[0])
      .cross(new THREE.Vector3().subVectors(polygon[index + 1], polygon[0])).length() / 2;
  }
  return area;
}

function projectedInterval(body, axis) {
  const values = body.vertices.map(point => point.dot(axis));
  return [Math.min(...values), Math.max(...values)];
}

// Face normals and all edge cross products are the complete separating axes
// for two closed convex polyhedra. AABB is only a cheap preliminary rejection.
function overlapMargin(a, b) {
  if (AXES.some(axis => a.bounds.max[axis] < b.bounds.min[axis] - POSITION_EPSILON ||
    b.bounds.max[axis] < a.bounds.min[axis] - POSITION_EPSILON)) return -Infinity;
  const axes = [];
  for (const plane of [...a.planes, ...b.planes]) addDirection(axes, plane.normal);
  for (const first of a.edgeDirections) for (const second of b.edgeDirections)
    addDirection(axes, new THREE.Vector3().crossVectors(first, second));
  let margin = Infinity;
  for (const axis of axes) {
    const [aMin, aMax] = projectedInterval(a, axis), [bMin, bMax] = projectedInterval(b, axis);
    margin = Math.min(margin, aMax - bMin, bMax - aMin);
    if (margin < -POSITION_EPSILON) return margin;
  }
  return margin;
}

function contact(a, b) {
  const margin = overlapMargin(a, b);
  if (margin < -POSITION_EPSILON) return null;
  if (margin > POSITION_EPSILON) {
    const polygons = a.triangles.map(triangle => clipToBody(triangle, b));
    // Keep each coplanar boundary once when the intersection has shared faces.
    for (const triangle of b.triangles) {
      const plane = planeOf(triangle);
      if (!a.planes.some(other => other.normal.dot(plane.normal) > 1 - 1e-10 &&
        Math.abs(other.constant - plane.constant) < CLIP_EPSILON)) polygons.push(clipToBody(triangle, a));
    }
    const volume = signedVolume(polygons, a.vertices[0]);
    if (volume > VOLUME_EPSILON) return {kind: 'volume', volume};
  }
  let area = 0;
  for (const triangle of a.triangles) {
    const face = planeOf(triangle);
    const opposite = b.planes.find(plane => plane.normal.dot(face.normal) < -1 + 1e-10 &&
      Math.abs(face.constant + plane.constant) <= POSITION_EPSILON);
    if (!opposite) continue;
    // Project only across the explicit boundary tolerance, then intersect real
    // face polygons. An AABB corner or a touching edge has zero surface area.
    const projected = triangle.map(point => point.clone().addScaledVector(opposite.normal,
      opposite.constant - opposite.normal.dot(point)));
    area += polygonArea(clipToBody(projected, b));
  }
  return area > CONTACT_AREA_EPSILON ? {kind: 'face', area} : null;
}


const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = polygon => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point[0] * next[1] - point[1] * next[0];
}, 0)) / 2;

function clipHalfPlane(polygon, a, b, keepInside = true) {
  const result = [], sign = keepInside ? 1 : -1;
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index], end = polygon[(index + 1) % polygon.length];
    const startDistance = cross2(a, b, start) * sign, endDistance = cross2(a, b, end) * sign;
    const startInside = startDistance >= -CLIP_EPSILON, endInside = endDistance >= -CLIP_EPSILON;
    if (startInside) result.push(start);
    if (startInside !== endInside) {
      const amount = startDistance / (startDistance - endDistance);
      result.push([start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount]);
    }
  }
  return result;
}

function intersect(subject, clip) {
  let result = subject;
  for (let index = 0; index < clip.length && result.length; index++)
    result = clipHalfPlane(result, clip[index], clip[(index + 1) % clip.length]);
  return result;
}

// The difference of two convex polygons is partitioned into convex fragments.
// Retaining those fragments makes a real spatial hole test possible.
function subtract(subject, clip) {
  const outside = [];
  let remainder = subject;
  for (let index = 0; index < clip.length && remainder.length; index++) {
    const a = clip[index], b = clip[(index + 1) % clip.length];
    const fragment = clipHalfPlane(remainder, a, b, false);
    if (area(fragment) > CLIP_EPSILON) outside.push(fragment);
    remainder = clipHalfPlane(remainder, a, b);
  }
  return outside;
}


function validateCoverage(triangles, polygons, fail, location, code) {
  let outsideArea = 0, overlapArea = 0, missingTotal = 0;
  for (const [index, triangle] of triangles.entries()) {
    const covered = polygons.reduce((sum, polygon) => sum + area(intersect(triangle.projected, polygon)), 0);
    outsideArea += Math.max(0, area(triangle.projected) - covered);
    if (outsideArea > COVERAGE_EPSILON)
      fail(code || 'mirror-face-outside', location, 'Actual triangles must remain inside the required contours', {triangle: index});
    for (let other = 0; other < index; other++) {
      overlapArea += area(intersect(triangle.projected, triangles[other].projected));
      if (overlapArea > COVERAGE_EPSILON)
        fail(code || 'mirror-face-overlap', location, 'Actual triangles must not overlap or repeat', {triangles: [other, index]});
    }
  }
  for (const [index, polygon] of polygons.entries()) {
    let uncovered = [polygon];
    for (const triangle of triangles) {
      uncovered = uncovered.flatMap(fragment => subtract(fragment, triangle.projected));
      if (!uncovered.length) break;
      if (uncovered.length > 8192)
        fail(code || 'mirror-face-geometry', location, 'Mirror coverage fragment budget exceeded', {polygon: index});
    }
    const missingArea = uncovered.reduce((sum, fragment) => sum + area(fragment), 0);
    missingTotal += missingArea;
    if (missingTotal > COVERAGE_EPSILON)
      fail(code || 'mirror-face-gap', location, 'Actual triangles leave a hole in a required contour', {polygon: index, missingArea});
  }
}


function convexHull(points) {
  const unique = [...new Map(points.map(point => [`${point.x},${point.y}`, [point.x, point.y]])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = input => {
    const result = [];
    for (const point of input) {
      while (result.length > 1 && cross2(result[result.length - 2], result[result.length - 1], point) <= CLIP_EPSILON) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(unique), ...half(unique.slice().reverse())];
}


function collectComponents(scene, faceNames, fail) {
  const inverse = scene.matrixWorld.clone().invert();
  const components = [];
  let meshCount = 0, triangleCount = 0;
  const materials = new Set();
  scene.traverse(node => {
    const matrix = inverse.clone().multiply(node.matrixWorld);
    if (![...node.matrixWorld.elements, ...matrix.elements].every(Number.isFinite) ||
      matrix.elements[3] !== 0 || matrix.elements[7] !== 0 || matrix.elements[11] !== 0 || matrix.elements[15] !== 1 ||
      matrix.determinant() <= 0 || node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length)
      reject(fail, 'makeup-transform', node.name, 'Mirror components require finite static orientation-preserving affine transforms');
    if (node.matrix.elements.some((value, index) => Math.abs(value - IDENTITY[index]) > 1e-7) || !node.visible)
      reject(fail, 'makeup-transform', node.name, 'All resource nodes require baked identity transforms and visible geometry');
    if (!node.isMesh || faceNames.has(node.name)) return;
    meshCount++;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    const positions = node.geometry?.getAttribute('position'), indices = node.geometry?.getIndex();
    const rendered = node.geometry?.drawRange;
    if (rendered?.start !== 0 || rendered.count < (indices?.count || positions?.count || 0))
      reject(fail, 'makeup-topology', node.name, 'All actual triangles must be rendered');
    const count = indices ? indices.count : positions?.count;
    if (!positions || !count || count % 3 || count / 3 + triangleCount > 2500 || meshCount > 32 || node.geometry.morphAttributes?.position?.length)
      reject(fail, 'makeup-topology', node.name, 'Mirror meshes require bounded nonempty static triangle geometry');
    const vertices = [], faces = [], edges = new Map();
    const read = offset => {
      const index = indices ? indices.getX(offset) : offset;
      if (!Number.isInteger(index) || index < 0 || index >= positions.count)
        reject(fail, 'makeup-topology', node.name, 'Triangle references an invalid vertex');
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix);
      if (!point.toArray().every(Number.isFinite)) reject(fail, 'makeup-topology', node.name, 'Geometry positions must be finite');
      let welded = vertices.findIndex(other => point.distanceToSquared(other) <= WELD_EPSILON ** 2);
      if (welded < 0) { welded = vertices.length; vertices.push(point); }
      return welded;
    };
    for (let offset = 0; offset < count; offset += 3) {
      const face = [read(offset), read(offset + 1), read(offset + 2)];
      const points = face.map(index => vertices[index]);
      if (new Set(face).size !== 3 || polygonArea(points) <= AREA_EPSILON)
        reject(fail, 'makeup-degenerate-face', node.name, 'Each triangle must have three distinct vertices and real area');
      const faceIndex = faces.length;
      faces.push(face);
      for (let edge = 0; edge < 3; edge++) {
        const from = face[edge], to = face[(edge + 1) % 3], key = [Math.min(from, to), Math.max(from, to)].join('/');
        if (!edges.has(key)) edges.set(key, []);
        edges.get(key).push({face: faceIndex, from, to});
      }
    }
    triangleCount += faces.length;
    const neighbors = faces.map(() => []);
    for (const uses of edges.values()) {
      if (uses.length !== 2 || uses[0].from !== uses[1].to || uses[0].to !== uses[1].from)
        reject(fail, 'makeup-open-or-inconsistent', node.name, 'Every welded edge must have exactly two oppositely directed face uses');
      neighbors[uses[0].face].push(uses[1].face);
      neighbors[uses[1].face].push(uses[0].face);
    }
    const visited = new Set();
    for (let start = 0; start < faces.length; start++) {
      if (visited.has(start)) continue;
      const queue = [start], shellFaces = [];
      visited.add(start);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor];
        shellFaces.push(faces[index]);
        for (const neighbor of neighbors[index]) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
      const shellVertices = [...new Set(shellFaces.flat())].map(index => vertices[index]);
      const triangles = shellFaces.map(face => face.map(index => vertices[index]));
      const id = `${node.name || 'mesh'}#${components.length}`;
      const volume = signedVolume(triangles, shellVertices[0]);
      if (volume <= VOLUME_EPSILON)
        reject(fail, 'makeup-nonpositive-volume', id, 'Each connected component must enclose positive outward-oriented volume', {volume});
      if (node.name.startsWith('makeup-frame-')) {
        components.push({id, mesh: node.name, triangles, vertices: shellVertices, volume, bounds: new THREE.Box3().setFromPoints(shellVertices), frame: true});
        continue;
      }
      const planes = [], edgeDirections = [];
      for (const triangle of triangles) {
        const plane = planeOf(triangle);
        if (shellVertices.some(point => plane.normal.dot(point) - plane.constant > POSITION_EPSILON))
          reject(fail, 'makeup-nonconvex', id, 'Each connected component must be a closed convex polyhedron');
        const thickness = plane.constant - Math.min(...shellVertices.map(point => plane.normal.dot(point)));
        if (thickness <= THICKNESS_EPSILON)
          reject(fail, 'makeup-no-thickness', id, 'Each component must have positive thickness along every face normal', {thickness});
        if (!planes.some(other => other.normal.dot(plane.normal) > 1 - 1e-10 && Math.abs(other.constant - plane.constant) < WELD_EPSILON)) planes.push(plane);
        for (let edge = 0; edge < 3; edge++) addDirection(edgeDirections,
          new THREE.Vector3().subVectors(triangle[(edge + 1) % 3], triangle[edge]));
      }
      const bounds = new THREE.Box3().setFromPoints(shellVertices);
      components.push({id, mesh: node.name, triangles, vertices: shellVertices, planes, edgeDirections, bounds, volume});
    }
  });
  if (!meshCount || meshCount > 32 || triangleCount > 2500 || materials.size > 4)
    reject(fail, 'makeup-budget', '', 'Mirror geometry must contain 1–32 meshes, at most 2500 triangles and four materials', {meshCount, triangleCount, materials: materials.size});
  return {components, meshCount, triangleCount, materials: materials.size};
}

function toPlane(point, panel) {
  const x = point.x - panel.position[0], z = point.z - panel.position[2];
  const c = Math.cos(panel.yaw), s = Math.sin(panel.yaw);
  return new THREE.Vector3(c * x - s * z, point.y - panel.position[1], s * x + c * z);
}

function fromPlane(point, panel) {
  return point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), panel.yaw).add(new THREE.Vector3(...panel.position));
}

function expectedPanels(design) {
  const rectangle = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top]];
  let center;
  if (design === 'round') center = Array.from({length: 48}, (_, i) => [.18 * Math.cos(2 * Math.PI * i / 48), .18 * Math.sin(2 * Math.PI * i / 48)]);
  if (design === 'lit-frame') center = rectangle(-.2, -.18, .2, .18);
  if (design === 'arch') center = [[-.17, -.185], [.17, -.185], ...Array.from({length: 25}, (_, i) => [.17 * Math.cos(Math.PI * i / 24), .015 + .17 * Math.sin(Math.PI * i / 24)])];
  if (design === 'tri-fold') center = rectangle(-.14, -.185, .14, .185);
  if (!center) return null;
  const panel = (id, position, yaw, polygon) => ({id, node: `makeup-face-${id}`, backNode: `makeup-back-${id}`, position, yaw, polygons: [polygon]});
  const result = [panel('center', [0, 0, .038], 0, center)];
  if (design === 'tri-fold') result.push(panel('left', [-.14, 0, .038], Math.PI / 6, rectangle(-.14, -.185, 0, .185)),
    panel('right', [.14, 0, .038], -Math.PI / 6, rectangle(0, -.185, .14, .185)));
  return result;
}

function validatePanelContract(resource, fail) {
  const design = resource.provenance?.sourceDesign, expected = expectedPanels(design);
  if (!expected)
    reject(fail, 'makeup-shape-profile', '', 'Finite authoring sourceDesign must identify the actual wall-head form');
  if (!Array.isArray(resource.mirrorPanels) || resource.mirrorPanels.length !== expected.length)
    reject(fail, 'makeup-panel-contract', '', 'The fixed design requires all of its distinct mirror planes');
  for (const fixed of expected) {
    const actual = resource.mirrorPanels.find(panel => panel.id === fixed.id);
    if (!actual || actual.node !== fixed.node || actual.backNode !== fixed.backNode ||
        !Array.isArray(actual.position) || actual.position.length !== 3 || actual.position.some((value, index) => Math.abs(value - fixed.position[index]) > 1e-10) ||
        !Number.isFinite(actual.yaw) || Math.abs(actual.yaw - fixed.yaw) > 1e-10 ||
        !Array.isArray(actual.polygons) || actual.polygons.length !== 1 || !Array.isArray(actual.polygons[0]) ||
        actual.polygons[0].length !== fixed.polygons[0].length || actual.polygons[0].some((point, index) =>
          !Array.isArray(point) || point.length !== 2 || point.some((value, axis) => !Number.isFinite(value) || Math.abs(value - fixed.polygons[0][index][axis]) > 1e-10)))
      reject(fail, 'makeup-panel-contract', fixed.id, 'Declared planes and convex contours must match the pinned design, including circle and arch segmentation');
  }
  return expected;
}

function readFace(mesh, panel, fail) {
  const geometry = mesh.geometry, positions = geometry?.getAttribute('position'), indices = geometry?.getIndex();
  const count = indices?.count || positions?.count;
  if (!positions || positions.itemSize !== 3 || !count || count % 3 || count > 7500 || geometry.drawRange.start !== 0 || geometry.drawRange.count < count)
    reject(fail, 'makeup-face-geometry', mesh.name, 'Mirror face requires a bounded complete triangle mesh');
  const triangles = [];
  for (let offset = 0; offset < count; offset += 3) {
    const points = [0, 1, 2].map(step => {
      const index = indices ? indices.getX(offset + step) : offset + step;
      if (!Number.isInteger(index) || index < 0 || index >= positions.count)
        reject(fail, 'makeup-face-geometry', mesh.name, 'Mirror face indices must reference actual vertices');
      return toPlane(new THREE.Vector3().fromBufferAttribute(positions, index), panel);
    });
    const projected = points.map(point => [point.x, point.y]);
    if (points.some(point => !point.toArray().every(Number.isFinite) || Math.abs(point.z) > POSITION_EPSILON) || cross2(...projected) <= 2 * AREA_EPSILON)
      reject(fail, 'makeup-face-geometry', mesh.name, 'Every actual face triangle must lie on its own declared plane and face its true +Z normal');
    triangles.push({projected});
  }
  validateCoverage(triangles, panel.polygons, fail, `scene.${mesh.name}`, 'makeup-face-coverage');
  return triangles.length;
}

function uniqueMesh(scene, name, fail) {
  const matches = [];
  scene.traverse(node => { if (node.name === name) matches.push(node); });
  if (matches.length !== 1 || !matches[0].isMesh)
    reject(fail, 'makeup-node', name, 'The required node must uniquely resolve to one actual mesh', {matches: matches.length});
  return matches[0];
}

function oneComponent(components, name, fail) {
  const matches = components.filter(component => component.mesh === name);
  if (matches.length !== 1) reject(fail, 'makeup-node', name, 'The designated mesh requires exactly one connected closed shell', {components: matches.length});
  return matches[0];
}

function fixedBox(component, min, max, fail) {
  if (component.vertices.length !== 8 || AXES.some((axis, index) =>
    Math.abs(component.bounds.min[axis] - min[index]) > POSITION_EPSILON || Math.abs(component.bounds.max[axis] - max[index]) > POSITION_EPSILON) ||
    component.vertices.some(point => AXES.some((axis, index) => Math.min(Math.abs(point[axis] - min[index]), Math.abs(point[axis] - max[index])) > POSITION_EPSILON)))
    reject(fail, 'makeup-support-box', component.mesh, 'The real wall mounting plate must retain its full fixed closed solid geometry');
}

// A frame is the one permitted concave shell. Its complete cap coverage,
// boundary sides and volume prove an actual extrusion before decomposition.
function validateExtrusion(component, panel, polygons, boundaries, backZ, frontZ, fail, code) {
  const local = component.triangles.map(triangle => triangle.map(point => toPlane(point, panel)));
  const caps = [[], []];
  for (const points of local) {
    if (points.some(point => Math.min(Math.abs(point.z - backZ), Math.abs(point.z - frontZ)) > POSITION_EPSILON))
      reject(fail, code, component.mesh, 'Every extrusion vertex must lie on one of the two real cap planes');
    const normal = planeOf(points).normal;
    const side = [backZ, frontZ].findIndex(z => points.every(point => Math.abs(point.z - z) <= POSITION_EPSILON));
    if (side >= 0) {
      if (normal.z * (side === 0 ? -1 : 1) < 1 - POSITION_EPSILON)
        reject(fail, code, component.mesh, 'Extrusion caps must face outward');
      const projected = points.map(point => [point.x, point.y]);
      caps[side].push({projected: side === 0 ? projected.reverse() : projected});
      continue;
    }
    const onBoundary = boundaries.some(boundary => boundary.some((a, edge) => {
      const b = boundary[(edge + 1) % boundary.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      return points.every(point => Math.abs(cross2(a, b, [point.x, point.y])) <= POSITION_EPSILON * length &&
        (point.x - a[0]) * dx + (point.y - a[1]) * dy >= -POSITION_EPSILON * length &&
        (point.x - b[0]) * dx + (point.y - b[1]) * dy <= POSITION_EPSILON * length) &&
        normal.dot(new THREE.Vector3(dy / length, -dx / length, 0)) > 1 - POSITION_EPSILON;
    }));
    if (!onBoundary) reject(fail, code, component.mesh, 'Every extrusion side must follow the actual outward contour boundary');
  }
  for (const cap of caps) validateCoverage(cap, polygons, fail, `scene.${component.mesh}`, code);
  const expectedVolume = polygons.reduce((sum, polygon) => sum + area(polygon), 0) * (frontZ - backZ);
  if (Math.abs(component.volume - expectedVolume) > Math.max(VOLUME_EPSILON, expectedVolume * 1e-5))
    reject(fail, code, component.mesh, 'Closed shell volume must equal the complete declared extrusion');
  return caps[1];
}

function prismComponent(projected, panel, backZ, frontZ, id, mesh) {
  const vertices = [backZ, frontZ].flatMap(z => projected.map(([x, y]) => fromPlane(new THREE.Vector3(x, y, z), panel)));
  const triangles = [[2, 1, 0], [3, 4, 5], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]].map(indices => indices.map(index => vertices[index]));
  const planes = triangles.map(planeOf), edgeDirections = [];
  for (const triangle of triangles) for (let edge = 0; edge < 3; edge++) addDirection(edgeDirections, triangle[(edge + 1) % 3].clone().sub(triangle[edge]));
  return {id, mesh, triangles, vertices, planes, edgeDirections, volume: signedVolume(triangles, vertices[0]), bounds: new THREE.Box3().setFromPoints(vertices)};
}

function validateFrame(component, panel, fail) {
  const vertices = component.vertices.map(point => toPlane(point, panel)), outer = convexHull(vertices), inner = panel.polygons[0];
  const backZ = Math.min(...vertices.map(point => point.z)), frontZ = Math.max(...vertices.map(point => point.z));
  if (frontZ - backZ <= THICKNESS_EPSILON || backZ < -.04 - POSITION_EPSILON || frontZ > .004 + POSITION_EPSILON ||
      area(outer) <= area(inner) + AREA_EPSILON || inner.some(point => outer.some((a, edge) => cross2(a, outer[(edge + 1) % outer.length], point) < -POSITION_EPSILON)))
    reject(fail, 'makeup-frame-geometry', component.mesh, 'Frame must be a thick ring surrounding its real mirror contour');
  const ring = subtract(outer, inner);
  const front = validateExtrusion(component, panel, ring, [outer, inner.slice().reverse()], backZ, frontZ, fail, 'makeup-frame-geometry');
  return front.map((triangle, index) => prismComponent(triangle.projected, panel, backZ, frontZ, `${component.id}/cap-${index}`, component.mesh));
}

function clipInFront(points) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], insideA = a.z >= -POSITION_EPSILON, insideB = b.z >= -POSITION_EPSILON;
    if (insideA) result.push([a.x, a.y]);
    if (insideA !== insideB) {
      const t = (-POSITION_EPSILON - a.z) / (b.z - a.z);
      result.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]);
    }
  }
  return result;
}

function validateOcclusion(solids, panels, fail) {
  for (const panel of panels) for (const solid of solids) for (const triangle of solid.triangles) {
    let projected = clipInFront(triangle.map(point => toPlane(point, panel)));
    if (projected.length < 2) continue;
    if (projected.length >= 3 && cross2(...projected.slice(0, 3)) < 0) projected = projected.slice().reverse();
    for (const polygon of panel.polygons) {
      const clipped = intersect(projected, polygon), center = clipped.length ? clipped.reduce((sum, point) => [sum[0] + point[0] / clipped.length, sum[1] + point[1] / clipped.length], [0, 0]) : null;
      const interiorLine = area(projected) <= AREA_EPSILON && center && polygon.every((a, edge) => {
        const b = polygon[(edge + 1) % polygon.length];
        return cross2(a, b, center) > POSITION_EPSILON * Math.hypot(b[0] - a[0], b[1] - a[1]);
      });
      if (area(clipped) > COVERAGE_EPSILON || interiorLine)
        reject(fail, 'makeup-surface-occluded', solid.mesh, 'Actual solid geometry intrudes in front of a declared mirror interior', {panel: panel.id});
    }
  }
}


function rejectDuplicateOuterFaces(components, fail) {
  for (let first = 0; first < components.length; first++) for (let second = first + 1; second < components.length; second++) {
    const a = components[first], b = components[second];
    if (!a.bounds.clone().expandByScalar(POSITION_EPSILON).intersectsBox(b.bounds)) continue;
    for (const triangleA of a.triangles) {
      const planeA = planeOf(triangleA);
      const dropped = AXES.reduce((chosen, axis) => Math.abs(planeA.normal[axis]) > Math.abs(planeA.normal[chosen]) ? axis : chosen, 'x');
      const coordinates = AXES.filter(axis => axis !== dropped);
      const project = triangle => {
        const polygon = triangle.map(point => coordinates.map(axis => point[axis]));
        return cross2(...polygon) < 0 ? polygon.reverse() : polygon;
      };
      const polygonA = project(triangleA);
      for (const triangleB of b.triangles) {
        const planeB = planeOf(triangleB);
        if (planeA.normal.dot(planeB.normal) < 1 - 1e-8 || triangleB.some(point => Math.abs(planeA.normal.dot(point) - planeA.constant) > POSITION_EPSILON)) continue;
        const sharedArea = area(intersect(polygonA, project(triangleB))) / Math.abs(planeA.normal[dropped]);
        if (sharedArea > COVERAGE_EPSILON)
          reject(fail, 'storage-duplicate-outer-face', a.mesh, 'Two actual solids expose coplanar equally oriented faces over positive area', {other: b.mesh, sharedArea});
      }
    }
  }
}

/** Static actual wall-mount admission. No legacy tabletop geometry is synthesized. */
export function validateMakeupWallMirrorGeometry(scene, resource, fail, path = resource?.id) {
  if (resource?.mountRole !== 'makeup-mirror-wall' && resource?.mirrorSurface?.schema !== 'makeup-wall-mirror-v1') return {checked: false};
  if (typeof fail !== 'function') throw new TypeError('validateMakeupWallMirrorGeometry requires a fail function');
  const failure = (code, location, message, details) => fail(code.replace(/^makeup-/, 'makeup-wall-').replace(/^storage-/, 'makeup-wall-'), path ? `${path}.${location}` : location, message, details);
  if (!scene?.isObject3D) reject(failure, 'makeup-scene', '', 'Expected the actual loaded Three scene');
  const panels = validatePanelContract(resource, failure), faceNames = new Set(panels.map(panel => panel.node));
  scene.updateMatrixWorld(true);
  const materials = new Set();
  let triangleCount = 0, meshCount = 0;
  scene.traverse(node => {
    if (['makeup-base', 'makeup-post'].includes(node.name))
      reject(failure, 'makeup-tabletop-remnant', node.name, 'The wall resource must remove the tabletop base and post');
    if (!node.isMesh) return;
    meshCount++;
    const geometry = node.geometry, position = geometry?.getAttribute('position');
    if (!position || position.itemSize !== 3) reject(failure, 'makeup-topology', node.name, 'Every actual mesh needs three-component positions');
    const count = geometry.getIndex()?.count || position.count, draw = geometry.drawRange;
    if (!count || count % 3 || draw.start !== 0 || draw.count < count || geometry.morphAttributes?.position?.length)
      reject(failure, 'makeup-topology', node.name, 'Static meshes must render their complete actual triangle sets');
    triangleCount += count / 3;
    const assigned = Array.isArray(node.material) ? node.material : [node.material];
    if (!assigned.length || assigned.some(material => !material || material.visible === false || material.transparent || material.opacity !== 1 || material.alphaTest > 0))
      reject(failure, 'makeup-material', node.name, 'Actual wall mirror faces and solids require opaque visible materials');
    for (const material of assigned) materials.add(material);
    if (Array.isArray(node.material)) {
      let cursor = 0;
      for (const group of [...geometry.groups].sort((a, b) => a.start - b.start)) {
        if (group.start !== cursor || !Number.isInteger(group.count) || group.count <= 0 || group.count % 3 || !Number.isInteger(group.materialIndex) || !assigned[group.materialIndex])
          reject(failure, 'makeup-topology', node.name, 'Material groups must render every actual triangle exactly once');
        cursor += group.count;
      }
      if (cursor !== count) reject(failure, 'makeup-topology', node.name, 'Material groups must cover the complete mesh');
    }
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i);
      if (!point.toArray().every(Number.isFinite) || Math.abs(point.x) > .35 + POSITION_EPSILON || Math.abs(point.y) > .30 + POSITION_EPSILON || point.z < -POSITION_EPSILON || point.z > .12 + POSITION_EPSILON)
        reject(failure, 'makeup-envelope', node.name, 'Every actual vertex must fit the center-origin wall box and remain in front of its wall plane', {point: point.toArray()});
    }
  });
  if (!meshCount || meshCount > 32 || triangleCount > 2500 || materials.size > 4)
    reject(failure, 'makeup-budget', '', 'Actual wall resources must retain the fixed mesh, triangle and material budgets', {meshCount, triangleCount, materials: materials.size});
  const {components: solids} = collectComponents(scene, faceNames, failure), decomposed = [], panelStats = [];
  if (resource.makeupNodes?.mount !== 'makeup-wall-mount' || resource.makeupNodes?.lamp !== 'makeup-lamp' || Object.keys(resource.makeupNodes).length !== 2)
    reject(failure, 'makeup-node', '', 'The wall resource must map its actual wall plate and lamp');
  for (const name of Object.values(resource.makeupNodes)) uniqueMesh(scene, name, failure);
  const mount = oneComponent(solids, 'makeup-wall-mount', failure), lamp = oneComponent(solids, 'makeup-lamp', failure);
  fixedBox(mount, [-.08, -.12, 0], [.08, .12, .02], failure);
  const lightPoint = new THREE.Vector3(0, .22, .103);
  if (lamp.planes.some(plane => plane.normal.dot(lightPoint) > plane.constant + POSITION_EPSILON))
    reject(failure, 'makeup-lamp-geometry', lamp.mesh, 'The actual thick housing must contain the common wall light position');
  let mountingContact;
  for (const panel of panels) {
    const face = uniqueMesh(scene, panel.node, failure), backMesh = uniqueMesh(scene, panel.backNode, failure);
    const triangles = readFace(face, panel, failure), back = oneComponent(solids, backMesh.name, failure);
    validateExtrusion(back, panel, panel.polygons, panel.polygons, -.025, -.009, failure, 'makeup-back-geometry');
    if (panel.id === 'center') {
      mountingContact = contact(back, mount);
      if (mountingContact?.kind !== 'volume' || mountingContact.volume < .0002688 - 1e-8)
        reject(failure, 'makeup-mount-back-contact', back.mesh, 'The actual curved central backing must intersect the full wall plate with the specified positive-volume contact', {mountingContact});
    }
    const name = `makeup-frame-${panel.id}`;
    uniqueMesh(scene, name, failure);
    decomposed.push(...validateFrame(oneComponent(solids, name, failure), panel, failure));
    panelStats.push({id: panel.id, triangles, position: panel.position, yaw: panel.yaw, backingVolume: back.volume});
  }
  const expectedFrames = new Set(panels.map(panel => `makeup-frame-${panel.id}`));
  if (solids.some(solid => solid.frame && !expectedFrames.has(solid.mesh))) reject(failure, 'makeup-node', '', 'Unexpected rings cannot bypass actual solid admission');
  validateOcclusion(solids, panels, failure);
  rejectDuplicateOuterFaces(solids, failure);
  const components = [...solids.filter(solid => !solid.frame), ...decomposed], connections = [], neighbors = new Map(components.map(component => [component.id, []]));
  for (let i = 0; i < components.length; i++) for (let j = i + 1; j < components.length; j++) {
    const a = components[i], b = components[j], measured = contact(a, b);
    if (!measured) continue;
    connections.push({a: a.id, b: b.id, ...measured}); neighbors.get(a.id).push(b.id); neighbors.get(b.id).push(a.id);
  }
  const reached = new Set([mount.id]), queue = [mount.id];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const neighbor of neighbors.get(queue[cursor]))
    if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  const detached = components.filter(component => !reached.has(component.id)).map(component => component.id);
  if (detached.length) reject(failure, 'makeup-detached-component', '', 'Every real backing, wing, frame and lamp must join the actual wall plate through positive contact', {detached});
  const wallArea = mount.triangles.filter(triangle => triangle.every(point => Math.abs(point.z) <= POSITION_EPSILON) && planeOf(triangle).normal.z < -1 + POSITION_EPSILON)
    .reduce((sum, triangle) => sum + polygonArea(triangle), 0);
  if (Math.abs(wallArea - .0384) > COVERAGE_EPSILON) reject(failure, 'makeup-wall-contact', mount.mesh, 'The plate requires the complete actual rear face on the wall plane');
  return {checked: true, sourceDesign: resource.provenance.sourceDesign, meshCount, triangleCount, materials: materials.size, wallMounted: true,
    wallArea, mountingContact, panels: panelStats, connections,
    components: components.map(component => ({id: component.id, mesh: component.mesh, volume: component.volume})),
    tolerances: {positionMetres: POSITION_EPSILON, coverageSquareMetres: COVERAGE_EPSILON, contactSquareMetres: CONTACT_AREA_EPSILON, volumeCubicMetres: VOLUME_EPSILON},
    limitation: 'Static actual geometry, wall-plane contact and support connectivity only. GPU reflection, real illumination, wall-anchor strength and character use require separate evidence.'};
}
