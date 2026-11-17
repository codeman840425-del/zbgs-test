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
const COVERAGE_EPSILON = 1e-8;
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
        fail(code || 'mirror-face-geometry', location, 'Storage coverage fragment budget exceeded', {polygon: index});
    }
    const missingArea = uncovered.reduce((sum, fragment) => sum + area(fragment), 0);
    missingTotal += missingArea;
    if (missingTotal > COVERAGE_EPSILON)
      fail(code || 'mirror-face-gap', location, 'Actual triangles leave a hole in a required contour', {polygon: index, missingArea});
  }
}


function collectComponents(scene, fail) {
  const inverse = scene.matrixWorld.clone().invert();
  const components = [];
  let meshCount = 0, triangleCount = 0;
  const materials = new Set();
  scene.traverse(node => {
    const matrix = inverse.clone().multiply(node.matrixWorld);
    if (![...node.matrixWorld.elements, ...matrix.elements].every(Number.isFinite) ||
      matrix.elements[3] !== 0 || matrix.elements[7] !== 0 || matrix.elements[11] !== 0 || matrix.elements[15] !== 1 ||
      matrix.determinant() <= 0 || node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length)
      reject(fail, 'storage-transform', node.name, 'Storage components require finite static orientation-preserving affine transforms');
    if (node.matrix.elements.some((value, index) => Math.abs(value - IDENTITY[index]) > 1e-7) || !node.visible)
      reject(fail, 'storage-transform', node.name, 'All resource nodes require baked identity transforms and visible geometry');
    if (!node.isMesh) return;
    meshCount++;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    const positions = node.geometry?.getAttribute('position'), indices = node.geometry?.getIndex();
    const rendered = node.geometry?.drawRange;
    if (rendered?.start !== 0 || rendered.count < (indices?.count || positions?.count || 0))
      reject(fail, 'storage-topology', node.name, 'All actual triangles must be rendered');
    const assigned = Array.isArray(node.material) ? node.material : [node.material];
    if (!assigned.length || assigned.some(material => !material || material.visible === false || material.transparent || material.opacity !== 1 || material.alphaTest > 0))
      reject(fail, 'storage-material', node.name, 'Storage solids require opaque visible materials');
    const count = indices ? indices.count : positions?.count;
    if (Array.isArray(node.material)) {
      let cursor = 0;
      for (const group of [...node.geometry.groups].sort((a, b) => a.start - b.start)) {
        if (group.start !== cursor || !Number.isInteger(group.count) || group.count <= 0 || group.count % 3 || !Number.isInteger(group.materialIndex) || !assigned[group.materialIndex])
          reject(fail, 'storage-topology', node.name, 'Material groups must render every actual triangle exactly once');
        cursor += group.count;
      }
      if (cursor !== count) reject(fail, 'storage-topology', node.name, 'Material groups must cover the full mesh');
    }
    if (!positions || !count || count % 3 || count / 3 + triangleCount > 2500 || meshCount > 32 || node.geometry.morphAttributes?.position?.length)
      reject(fail, 'storage-topology', node.name, 'Storage meshes require bounded nonempty static triangle geometry');
    const vertices = [], faces = [], edges = new Map();
    const read = offset => {
      const index = indices ? indices.getX(offset) : offset;
      if (!Number.isInteger(index) || index < 0 || index >= positions.count)
        reject(fail, 'storage-topology', node.name, 'Triangle references an invalid vertex');
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix);
      if (!point.toArray().every(Number.isFinite)) reject(fail, 'storage-topology', node.name, 'Geometry positions must be finite');
      let welded = vertices.findIndex(other => point.distanceToSquared(other) <= WELD_EPSILON ** 2);
      if (welded < 0) { welded = vertices.length; vertices.push(point); }
      return welded;
    };
    for (let offset = 0; offset < count; offset += 3) {
      const face = [read(offset), read(offset + 1), read(offset + 2)];
      const points = face.map(index => vertices[index]);
      if (new Set(face).size !== 3 || polygonArea(points) <= AREA_EPSILON)
        reject(fail, 'storage-degenerate-face', node.name, 'Each triangle must have three distinct vertices and real area');
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
        reject(fail, 'storage-open-or-inconsistent', node.name, 'Every welded edge must have exactly two oppositely directed face uses');
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
        reject(fail, 'storage-nonpositive-volume', id, 'Each connected component must enclose positive outward-oriented volume', {volume});
      if (/^storage-cup-(left|right)-wall$/.test(node.name)) {
        components.push({id, mesh: node.name, node, triangles, vertices: shellVertices, volume, bounds: new THREE.Box3().setFromPoints(shellVertices), ring: true});
        continue;
      }
      const planes = [], edgeDirections = [];
      for (const triangle of triangles) {
        const plane = planeOf(triangle);
        if (shellVertices.some(point => plane.normal.dot(point) - plane.constant > POSITION_EPSILON))
          reject(fail, 'storage-nonconvex', id, 'Each connected component must be a closed convex polyhedron');
        const thickness = plane.constant - Math.min(...shellVertices.map(point => plane.normal.dot(point)));
        if (thickness <= THICKNESS_EPSILON)
          reject(fail, 'storage-no-thickness', id, 'Each component must have positive thickness along every face normal', {thickness});
        if (!planes.some(other => other.normal.dot(plane.normal) > 1 - 1e-10 && Math.abs(other.constant - plane.constant) < WELD_EPSILON)) planes.push(plane);
        for (let edge = 0; edge < 3; edge++) addDirection(edgeDirections,
          new THREE.Vector3().subVectors(triangle[(edge + 1) % 3], triangle[edge]));
      }
      const bounds = new THREE.Box3().setFromPoints(shellVertices);
      components.push({id, mesh: node.name, node, triangles, vertices: shellVertices, planes, edgeDirections, bounds, volume});
    }
  });
  if (!meshCount || meshCount > 32 || triangleCount > 2500 || materials.size > 4)
    reject(fail, 'storage-budget', '', 'Storage geometry must contain 1–32 meshes, at most 2500 triangles and four materials', {meshCount, triangleCount, materials: materials.size});
  return {components, meshCount, triangleCount, materials: materials.size};
}

const CORE_BOXES = {
  'storage-base': [[-.225, 0, -.125], [.225, .010, .035]],
  'storage-side-left': [[-.225, .010, -.125], [-.212, .090, .035]],
  'storage-side-right': [[.212, .010, -.125], [.225, .090, .035]],
  'storage-back': [[-.212, .010, -.125], [.212, .090, -.119]],
  'storage-roof': [[-.225, .090, -.125], [.225, .100, .035]],
  'storage-runner-left': [[-.1775, .010, -.115], [-.1625, .016, .030]],
  'storage-runner-right': [[.1625, .010, -.115], [.1775, .016, .030]],
  'storage-drawer-bottom': [[-.205, .016, -.115], [.205, .022, .025]],
  'storage-drawer-left': [[-.205, .022, -.115], [-.199, .078, .025]],
  'storage-drawer-right': [[.199, .022, -.115], [.205, .078, .025]],
  'storage-drawer-back': [[-.199, .022, -.115], [.199, .078, -.109]],
  'storage-drawer-front': [[-.199, .022, .019], [.199, .078, .025]],
  'storage-drawer-handle': [[-.035, .043, .025], [.035, .057, .035]],
};

function uniqueNode(scene, name, fail) {
  const matches = [];
  scene.traverse(node => { if (node.name === name) matches.push(node); });
  if (matches.length !== 1) reject(fail, 'storage-node', name, 'Every required actual node must have one unique name', {matches: matches.length});
  return matches[0];
}

function oneComponent(components, name, fail) {
  const matches = components.filter(component => component.mesh === name);
  if (matches.length !== 1) reject(fail, 'storage-node', name, 'Each designated mesh must contain one actual connected closed shell', {components: matches.length});
  return matches[0];
}

function requireBox(component, min, max, fail) {
  if (component.ring || component.vertices.length !== 8 || AXES.some((axis, index) =>
    Math.abs(component.bounds.min[axis] - min[index]) > POSITION_EPSILON || Math.abs(component.bounds.max[axis] - max[index]) > POSITION_EPSILON) ||
    component.vertices.some(point => AXES.some((axis, index) => Math.min(Math.abs(point[axis] - min[index]), Math.abs(point[axis] - max[index])) > POSITION_EPSILON)))
    reject(fail, 'storage-solid-box', component.mesh, 'The actual closed convex component must be the entire required rectangular solid');
}

function boxBody(min, max) {
  const vertices = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) vertices.push(new THREE.Vector3(x, y, z));
  const edgeDirections = AXES.map((axis, i) => new THREE.Vector3().setComponent(i, 1));
  const planes = edgeDirections.flatMap((direction, i) => [{normal: direction, constant: max[i]}, {normal: direction.clone().negate(), constant: -min[i]}]);
  return {vertices, planes, edgeDirections, bounds: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))};
}

function translated(body, z) {
  const shift = new THREE.Vector3(0, 0, z);
  return {...body, vertices: body.vertices.map(point => point.clone().add(shift)),
    triangles: body.triangles.map(triangle => triangle.map(point => point.clone().add(shift))),
    planes: body.planes.map(plane => ({normal: plane.normal, constant: plane.constant + plane.normal.z * z})), bounds: body.bounds.clone().translate(shift)};
}

function bodyContact(a, b) {
  if (!a.bounds.intersectsBox(b.bounds)) return null;
  for (const first of a.pieces || [a]) for (const second of b.pieces || [b]) {
    const measured = contact(first, second);
    if (measured) return measured;
  }
  return null;
}

// Complete SAT axes remain fixed during a translation. Intersect their time
// intervals to prove the entire continuous slide, including non-sampled states.
function penetrationInterval(a, b, travel = 0) {
  const swept = a.bounds.clone(); swept.expandByPoint(a.bounds.min.clone().add(new THREE.Vector3(0, 0, travel))); swept.expandByPoint(a.bounds.max.clone().add(new THREE.Vector3(0, 0, travel)));
  if (AXES.some(axis => swept.max[axis] < b.bounds.min[axis] || b.bounds.max[axis] < swept.min[axis])) return null;
  const axes = [];
  for (const plane of [...a.planes, ...b.planes]) addDirection(axes, plane.normal);
  for (const first of a.edgeDirections) for (const second of b.edgeDirections) addDirection(axes, first.clone().cross(second));
  let start = 0, end = 1;
  for (const axis of axes) {
    const [aMin, aMax] = projectedInterval(a, axis), [bMin, bMax] = projectedInterval(b, axis), speed = axis.z * travel;
    if (Math.abs(speed) < 1e-14) {
      if (Math.min(aMax - bMin, bMax - aMin) <= POSITION_EPSILON) return null;
      continue;
    }
    const first = (bMin + POSITION_EPSILON - aMax) / speed, second = (bMax - POSITION_EPSILON - aMin) / speed;
    start = Math.max(start, Math.min(first, second)); end = Math.min(end, Math.max(first, second));
    if (end - start <= 1e-12) return null;
  }
  return end - start > 1e-12 ? {start, end} : null;
}

function intrusion(body, obstacle, travel = 0) {
  for (const first of body.pieces || [body]) for (const second of obstacle.pieces || [obstacle]) {
    const interval = penetrationInterval(first, second, travel);
    if (interval) return interval;
  }
  return null;
}

const circle = (radius, segments) => Array.from({length: segments}, (_, i) => [radius * Math.cos(2 * Math.PI * i / segments), radius * Math.sin(2 * Math.PI * i / segments)]);
const localCup = (point, x, z) => new THREE.Vector3(point.x - x, z - point.z, point.y);
const worldCup = (point, x, z) => new THREE.Vector3(point.x + x, point.z, z - point.y);

function validateExtrusion(component, local, polygons, boundaries, bottom, top, fail) {
  const caps = [[], []];
  for (const triangle of component.triangles) {
    const points = triangle.map(local), normal = planeOf(points).normal;
    if (points.some(point => Math.min(Math.abs(point.z - bottom), Math.abs(point.z - top)) > POSITION_EPSILON))
      reject(fail, 'storage-extrusion', component.mesh, 'Every actual prism vertex must belong to its real upper or lower plane');
    const cap = [bottom, top].findIndex(z => points.every(point => Math.abs(point.z - z) <= POSITION_EPSILON));
    if (cap >= 0) {
      if (normal.z * (cap === 0 ? -1 : 1) < 1 - POSITION_EPSILON) reject(fail, 'storage-extrusion', component.mesh, 'Actual cap triangles must face outward');
      const projected = points.map(point => [point.x, point.y]);
      caps[cap].push({projected: cap === 0 ? projected.reverse() : projected});
      continue;
    }
    const side = boundaries.some(boundary => boundary.some((a, edge) => {
      const b = boundary[(edge + 1) % boundary.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      return points.every(point => Math.abs(cross2(a, b, [point.x, point.y])) <= POSITION_EPSILON * length &&
        (point.x - a[0]) * dx + (point.y - a[1]) * dy >= -POSITION_EPSILON * length &&
        (point.x - b[0]) * dx + (point.y - b[1]) * dy <= POSITION_EPSILON * length) && normal.dot(new THREE.Vector3(dy / length, -dx / length, 0)) > 1 - POSITION_EPSILON;
    }));
    if (!side) reject(fail, 'storage-extrusion', component.mesh, 'Every real prism side must follow the full inner or outer contour');
  }
  for (const cap of caps) validateCoverage(cap, polygons, fail, `scene.${component.mesh}`, 'storage-extrusion');
  const expected = polygons.reduce((sum, polygon) => sum + area(polygon), 0) * (top - bottom);
  if (Math.abs(component.volume - expected) > Math.max(VOLUME_EPSILON, expected * 1e-5)) reject(fail, 'storage-extrusion', component.mesh, 'Actual closed volume must equal the declared complete extrusion');
  return caps[1];
}

function trianglePrism(projected, fromLocal, bottom, top) {
  const vertices = [bottom, top].flatMap(z => projected.map(([x, y]) => fromLocal(new THREE.Vector3(x, y, z))));
  const triangles = [[2, 1, 0], [3, 4, 5], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]].map(indices => indices.map(i => vertices[i]));
  const edgeDirections = [];
  for (const triangle of triangles) for (let edge = 0; edge < 3; edge++) addDirection(edgeDirections, triangle[(edge + 1) % 3].clone().sub(triangle[edge]));
  return {vertices, triangles, planes: triangles.map(planeOf), edgeDirections, bounds: new THREE.Box3().setFromPoints(vertices)};
}

function validateCup(wall, floor, x, top, fail) {
  const outer = circle(.035, 32), inner = circle(.029, 32), ring = subtract(outer, inner);
  const local = point => localCup(point, x, -.045), world = point => worldCup(point, x, -.045);
  const caps = validateExtrusion(wall, local, ring, [outer, inner.slice().reverse()], .106, top, fail);
  wall.pieces = caps.map(cap => trianglePrism(cap.projected, world, .106, top));
  validateExtrusion(floor, local, [outer], [outer], .100, .106, fail);
  // The .04m square fits inside the real polygonal bore, with an upward path.
  const bore = boxBody([x - .020, .106, -.065], [x + .020, .26, -.025]);
  if (intrusion(bore, wall) || intrusion(bore, floor)) reject(fail, 'storage-cup-cavity', wall.mesh, 'The thick cup needs its real floor, open bore and unobstructed .04m upward access');
}

function requireClear(body, obstacles, fail, code, travel = 0) {
  for (const obstacle of obstacles) {
    const interval = intrusion(body, obstacle, travel);
    if (interval) reject(fail, code, obstacle.mesh, 'Actual closed geometry intrudes into required clearance or continuous motion', {interval});
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

function validateUpper(scene, components, design, fail) {
  const require = (name, min, max) => { uniqueNode(scene, name, fail); const part = oneComponent(components, name, fail); requireBox(part, min, max, fail); return part; };
  if (design === 'brush-cup') {
    for (const [side, x, top] of [['left', -.17, .25], ['right', .17, .22]]) {
      const wallName = `storage-cup-${side}-wall`, floorName = `storage-cup-${side}-bottom`;
      uniqueNode(scene, wallName, fail); uniqueNode(scene, floorName, fail);
      validateCup(oneComponent(components, wallName, fail), oneComponent(components, floorName, fail), x, top, fail);
      requireClear(boxBody([x - .020, .106, -.065], [x + .020, .26, -.025]), components, fail, 'storage-cup-cavity');
    }
    return;
  }
  let height = design === 'case' ? .20 : design === 'divided' ? .19 : oneComponent(components, 'storage-upper-left', fail).bounds.max.y;
  if (design === 'tray' && (height < .13 - POSITION_EPSILON || height > .15 + POSITION_EPSILON)) reject(fail, 'storage-upper-profile', '', 'The shallow tray rim must be between .13m and .15m high');
  const thickness = design === 'case' ? .010 : .008, inside = .225 - thickness;
  require('storage-upper-left', [-.225, .1, -.125], [-inside, height, .035]);
  require('storage-upper-right', [inside, .1, -.125], [.225, height, .035]);
  require('storage-upper-back', [-inside, .1, -.125], [inside, height, -.125 + thickness]);
  require('storage-upper-front', [-inside, .1, .035 - thickness], [inside, height, .035]);
  if (design === 'divided') {
    require('storage-divider-left', [-.130, .1, -.117], [-.124, .19, .027]);
    require('storage-divider-right', [.124, .1, -.117], [.130, .19, .027]);
    require('storage-divider-cross-left', [-.217, .1, -.048], [-.130, .19, -.042]);
    require('storage-drawer-divider', [-.003, .022, -.109], [.003, .065, -.031]);
    // Separate actual side cells, with closed roof floors and open access.
    for (const [back, front] of [[-.112, -.053], [-.037, .022]]) requireClear(boxBody([-.212, .1, back], [-.135, .25, front]), components, fail, 'storage-cell-cavity');
  }
  if (design === 'case') {
    for (const [side, minX, maxX] of [['left', -.225, -.215], ['right', .215, .225]]) {
      require(`storage-case-handle-${side}-rear`, [minX, .20, -.085], [maxX, .25, -.073]);
      require(`storage-case-handle-${side}-front`, [minX, .20, -.017], [maxX, .25, -.005]);
      require(`storage-case-handle-${side}-grip`, [minX, .238, -.073], [maxX, .25, -.017]);
      requireClear(boxBody([minX, .205, -.068], [maxX, .233, -.022]), components, fail, 'storage-handle-aperture');
    }
  }
}

function connectedNetwork(components, base, fail) {
  const connections = [], neighbors = new Map(components.map(component => [component.id, []]));
  for (let i = 0; i < components.length; i++) for (let j = i + 1; j < components.length; j++) {
    const a = components[i], b = components[j], measured = bodyContact(a, b);
    if (!measured) continue;
    connections.push({a: a.id, b: b.id, ...measured}); neighbors.get(a.id).push(b.id); neighbors.get(b.id).push(a.id);
  }
  const reached = new Set([base.id]), queue = [base.id];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const neighbor of neighbors.get(queue[cursor])) if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  const detached = components.filter(component => !reached.has(component.id)).map(component => component.id);
  if (detached.length) reject(fail, 'storage-detached-component', '', 'Every real solid must join the base through positive face area or volume contact', {detached});
  return connections;
}

function validateContent(scene, resource, collected, fail) {
  if (resource.provenance?.sourceDesign !== 'compact') reject(fail, 'storage-content-profile', '', 'The content witness requires its finite compact source design');
  for (const [name, bottom, top] of [['storage-content-body', 0, .028], ['storage-content-cap', .028, .035]]) {
    uniqueNode(scene, name, fail);
    const component = oneComponent(collected.components, name, fail), outline = circle(.012, 24);
    validateExtrusion(component, point => localCup(point, 0, 0), [outline], [outline], bottom, top, fail);
  }
  for (const component of collected.components) for (const point of component.vertices) if (Math.abs(point.x) > .012 + POSITION_EPSILON || point.y < -POSITION_EPSILON || point.y > .035 + POSITION_EPSILON || Math.abs(point.z) > .012 + POSITION_EPSILON)
    reject(fail, 'storage-content-envelope', component.mesh, 'Actual content geometry must fit the compact witness envelope');
  const base = oneComponent(collected.components, 'storage-content-body', fail), connections = connectedNetwork(collected.components, base, fail);
  return {checked: true, sourceDesign: 'compact', meshCount: collected.meshCount, triangleCount: collected.triangleCount, connections, limitation: 'A closed compact witness only. No cosmetic interaction or arbitrary-content fit claim.'};
}

/** Closed-pose loader admission. Pure-translation SAT proves continuous motion. */
export function validateMakeupStorageGeometry(scene, resource, fail, path = resource?.id) {
  if (!['makeup-storage', 'makeup-storage-content'].includes(resource?.mountRole)) return {checked: false};
  if (typeof fail !== 'function') throw new TypeError('validateMakeupStorageGeometry requires a fail function');
  const failure = (code, location, message, details) => fail(code, path ? `${path}.${location}` : location, message, details);
  if (!scene?.isObject3D) reject(failure, 'storage-scene', '', 'Expected the actual loaded Three scene');
  scene.updateMatrixWorld(true);
  const collected = collectComponents(scene, failure), {components} = collected;
  rejectDuplicateOuterFaces(components, failure);
  if (resource.mountRole === 'makeup-storage-content') return validateContent(scene, resource, collected, failure);
  const design = resource.provenance?.sourceDesign;
  if (!['tray', 'divided', 'brush-cup', 'case'].includes(design)) reject(failure, 'storage-shape-profile', '', 'Actual production provenance must select one of the four fixed upper mechanisms');
  const pivot = uniqueNode(scene, 'storage-drawer-slide', failure);
  if (pivot.isMesh || resource.partNodes?.drawer !== pivot.name || resource.supportNodes?.drawer !== 'storage-drawer-bottom' || resource.supportNodes?.top !== 'storage-roof' || resource.supportMotion?.drawer !== 'drawer')
    reject(failure, 'storage-motion-mapping', '', 'The actual moving group and support nodes must follow the fixed supported-slide map');
  const moving = components.filter(component => { for (let node = component.node; node; node = node.parent) if (node === pivot) return true; return false; });
  const fixed = components.filter(component => !moving.includes(component));
  for (const [name, [min, max]] of Object.entries(CORE_BOXES)) {
    uniqueNode(scene, name, failure); const component = oneComponent(components, name, failure); requireBox(component, min, max, failure);
    if (name.startsWith('storage-drawer-') !== moving.includes(component)) reject(failure, 'storage-motion-mapping', name, 'Real drawer parts belong to the moving subtree and real carrier parts remain fixed');
  }
  for (const component of components) for (const point of component.vertices) {
    const maxZ = point.z + (moving.includes(component) ? .09 : 0);
    if (Math.abs(point.x) > .225 + POSITION_EPSILON || point.y < -POSITION_EPSILON || point.y > .25 + POSITION_EPSILON || point.z < -.125 - POSITION_EPSILON || maxZ > .125 + POSITION_EPSILON)
      reject(failure, 'storage-envelope', component.mesh, 'Every real vertex must fit the entire installation envelope throughout the slide');
    if (moving.includes(component) && (Math.abs(point.x) > .205 + POSITION_EPSILON || point.y < .016 - POSITION_EPSILON || point.y > .078 + POSITION_EPSILON || point.z < -.115 - POSITION_EPSILON || point.z > .035 + POSITION_EPSILON))
      reject(failure, 'storage-moving-bounds', component.mesh, 'Every actual moving vertex must fit the declared closed-pose moving-part bounds');
  }
  validateUpper(scene, components, design, failure);
  if (components.some(component => component.ring && !component.pieces)) reject(failure, 'storage-upper-profile', '', 'Only the two proven brush-cup ring meshes may use convex decomposition');
  for (const part of moving) for (const obstacle of fixed) {
    const interval = intrusion(part, obstacle, .09);
    if (interval) reject(failure, 'storage-slide-collision', part.mesh, 'Actual moving solids intersect fixed geometry during the continuous slide', {fixed: obstacle.mesh, interval});
  }
  requireClear(boxBody([-.115, .100, -.100], [.115, .240, .010]), fixed, failure, 'storage-top-clearance');
  requireClear(boxBody([-.180, .022, -.025], [.180, .062, .015]), moving.filter(part => part.mesh !== 'storage-drawer-bottom'), failure, 'storage-drawer-clearance');
  requireClear(boxBody([-.012, .022, -.017], [.012, .057, .007]), fixed, failure, 'storage-content-motion', .09);
  // For every fraction >= .75, the whole declared drawer patch is ahead of
  // fixed geometry. Relative motion cancels when checking its moving walls.
  requireClear(boxBody([-.180, .022, .0425], [.180, .285, .105]), fixed, failure, 'storage-drawer-access');
  requireClear(boxBody([-.180, .022, -.025], [.180, .285, .015]), moving.filter(part => part.mesh !== 'storage-drawer-bottom'), failure, 'storage-drawer-access');
  const bottom = oneComponent(components, 'storage-drawer-bottom', failure), support = [];
  for (const name of ['storage-runner-left', 'storage-runner-right']) {
    const rail = oneComponent(components, name, failure);
    for (const offset of [0, .09]) {
      const measured = contact(translated(bottom, offset), rail);
      if (!measured || measured.kind !== 'face' || measured.area < .000825 - COVERAGE_EPSILON) reject(failure, 'storage-runner-support', name, 'Each true rail must retain positive support contact through the complete slide', {offset, measured});
      support.push({rail: name, offset, ...measured});
    }
  }
  const base = oneComponent(components, 'storage-base', failure);
  // A fixed piece cannot borrow support from a moving wall at the closed pose.
  // Both rigid subassemblies remain independently connected through the stroke.
  const connections = [...connectedNetwork(fixed, base, failure), ...connectedNetwork(moving, bottom, failure)];
  const groundArea = base.triangles.filter(triangle => triangle.every(point => Math.abs(point.y) <= POSITION_EPSILON)).reduce((sum, triangle) => sum + polygonArea(triangle), 0);
  if (groundArea <= CONTACT_AREA_EPSILON) reject(failure, 'storage-ground-contact', base.mesh, 'The actual closed base requires positive-area table contact');
  return {checked: true, sourceDesign: design, meshCount: collected.meshCount, triangleCount: collected.triangleCount, materials: collected.materials,
    movingComponents: moving.map(part => part.mesh), continuousSlide: {range: [0, .09], method: 'Complete convex SAT interval intersection for pure translation'}, support, connections, groundArea,
    access: {minimumOpenFraction: .75, fullSupportPatch: true, compactEnvelope: [.024, .035, .024]},
    tolerances: {positionMetres: POSITION_EPSILON, coverageSquareMetres: COVERAGE_EPSILON, contactSquareMetres: CONTACT_AREA_EPSILON},
    limitation: 'Static closed solids, convex or proven cup-ring decomposition, continuous pure-translation fit and access only. No hand interaction, mechanical strength or tipping stability claim.'};
}
