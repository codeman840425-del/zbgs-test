import * as THREE from 'three';

// GLB positions are Float32. These tolerances are in metres and square metres.
const POSITION_EPSILON = 1e-6;
const AREA_EPSILON = 1e-7;
const CLIP_EPSILON = 1e-12;
const PLANE_Z = .026;
const IDENTITY = new THREE.Matrix4().elements;
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

function validatePolygons(resource, fail, path) {
  const polygons = resource.mirrorShape?.polygons;
  const location = `${path}.mirrorShape.polygons`;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 64)
    fail('mirror-shape', location, 'Mirror shape requires one to 64 convex polygons');
  let vertices = 0;
  let overlapArea = 0;
  for (const [index, polygon] of polygons.entries()) {
    const polygonPath = `${location}[${index}]`;
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 512)
      fail('mirror-shape', polygonPath, 'A mirror polygon requires three to 512 vertices');
    vertices += polygon.length;
    for (const [pointIndex, point] of polygon.entries()) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
          Math.abs(point[0]) > .4 + POSITION_EPSILON || Math.abs(point[1]) > .9 + POSITION_EPSILON)
        fail('mirror-shape', `${polygonPath}[${pointIndex}]`, 'Mirror polygon points must be finite and inside the installation envelope');
      if (polygon.slice(0, pointIndex).some(other => Math.hypot(point[0] - other[0], point[1] - other[1]) <= POSITION_EPSILON))
        fail('mirror-shape', polygonPath, 'Mirror polygon vertices must be distinct');
    }
    if (area(polygon) <= AREA_EPSILON)
      fail('mirror-shape', polygonPath, 'Mirror polygons must have positive area');
    // Every other vertex must lie to the left of each directed edge. Checking
    // only consecutive turns would also accept some self-intersecting stars.
    for (let edge = 0; edge < polygon.length; edge++) {
      const a = polygon[edge], b = polygon[(edge + 1) % polygon.length];
      if (polygon.some(point => cross2(a, b, point) < -CLIP_EPSILON))
        fail('mirror-shape', polygonPath, 'Mirror polygons must be convex and counterclockwise');
    }
    for (let other = 0; other < index; other++) {
      overlapArea += area(intersect(polygon, polygons[other]));
      if (overlapArea > AREA_EPSILON)
        fail('mirror-shape-overlap', polygonPath, 'Declared mirror polygons must not overlap', {other});
    }
  }
  if (vertices > 2048) fail('mirror-shape', location, 'Mirror contour exceeds the bounded validation budget');
  return polygons;
}

function validateTransforms(scene, face, fail, path) {
  scene.traverse(node => {
    const local = node.matrix.elements, world = node.matrixWorld.elements;
    const values = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray(), ...local, ...world];
    if (!values.every(Number.isFinite) || [local, world].some(matrix => matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) ||
        node.matrix.determinant() <= 0 || node.matrixWorld.determinant() <= 0)
      fail('mirror-transform', path, 'Mirror nodes require finite affine nonsingular orientation-preserving transforms', {node: node.name});
    if (node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length)
      fail('mirror-transform', path, 'Mirror resource geometry must be static', {node: node.name});
  });
  for (let node = face; node; node = node.parent) {
    if (node.matrix.elements.some((value, index) => Math.abs(value - IDENTITY[index]) > POSITION_EPSILON))
      fail('mirror-parent-transform', `${path}.mirrorNodes.face`, 'Mirror face and its resource ancestors must have identity transforms', {node: node.name});
    if (!node.visible) fail('mirror-face-geometry', `${path}.mirrorNodes.face`, 'Mirror face and its ancestors must be visible', {node: node.name});
    if (node === scene) break;
  }
}

function readMesh(mesh, transform, fail, path) {
  const geometry = mesh.geometry, positions = geometry?.getAttribute?.('position'), indices = geometry?.getIndex();
  const count = indices ? indices.count : positions?.count;
  if (!positions || positions.itemSize !== 3 || !positions.count || !count || count % 3 || count > 24576)
    fail('mirror-mesh-geometry', path, 'Mirror meshes require a bounded set of complete triangles', {mesh: mesh.name});
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count < count)
    fail('mirror-mesh-geometry', path, 'Mirror meshes must render their full triangle set', {mesh: mesh.name});
  const uv = geometry.getAttribute('uv');
  if (uv && (uv.itemSize !== 2 || uv.count !== positions.count))
    fail('mirror-mesh-geometry', path, 'Mirror UVs must match their actual position vertices', {mesh: mesh.name});
  const points = [];
  const bounds = new THREE.Box3();
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const point = new THREE.Vector3(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)).applyMatrix4(transform);
    if (![point.x, point.y, point.z].every(Number.isFinite))
      fail('mirror-mesh-geometry', path, 'Mirror mesh vertices must be finite', {mesh: mesh.name, vertex});
    if (uv && ![uv.getX(vertex), uv.getY(vertex)].every(Number.isFinite))
      fail('mirror-mesh-geometry', path, 'Mirror mesh UVs must be finite', {mesh: mesh.name, vertex});
    if (Math.abs(point.x) > .4 + POSITION_EPSILON || Math.abs(point.y) > .9 + POSITION_EPSILON ||
        point.z < -POSITION_EPSILON || point.z > .04 + POSITION_EPSILON)
      fail('mirror-envelope', path, 'Every mirror vertex must remain inside the fixed installation envelope', {mesh: mesh.name, vertex, point: point.toArray()});
    points.push(point);
    bounds.expandByPoint(point);
  }
  const triangles = [];
  for (let offset = 0; offset < count; offset += 3) {
    const sources = [0, 1, 2].map(step => indices ? indices.getX(offset + step) : offset + step);
    if (sources.some(source => !Number.isInteger(source) || source < 0 || source >= points.length))
      fail('mirror-mesh-geometry', path, 'Mirror triangle indices must reference existing vertices', {mesh: mesh.name, offset});
    const vertices = sources.map(source => points[source]);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(vertices[1], vertices[0]), new THREE.Vector3().subVectors(vertices[2], vertices[0]));
    if (normal.length() <= 2 * CLIP_EPSILON)
      fail('mirror-mesh-geometry', path, 'Mirror meshes must not contain degenerate triangles', {mesh: mesh.name, triangle: offset / 3});
    triangles.push({points: vertices, normal, projected: vertices.map(point => [point.x, point.y])});
  }
  return {mesh, triangles, bounds};
}

function validateFace(actual, polygons, fail, path) {
  const location = `${path}.mirrorNodes.face`, triangles = actual.triangles;
  let outsideArea = 0, overlapArea = 0, missingTotal = 0;
  if (triangles.length > 2048)
    fail('mirror-face-geometry', location, 'Mirror face exceeds the bounded planar triangle validation budget');
  for (const [index, triangle] of triangles.entries()) {
    if (triangle.points.some(point => Math.abs(point.z - PLANE_Z) > POSITION_EPSILON) || triangle.normal.z <= 2 * CLIP_EPSILON)
      fail('mirror-face-geometry', location, 'Every mirror face triangle must be nondegenerate, coplanar at z=.026 and face +Z', {triangle: index});
    const covered = polygons.reduce((sum, polygon) => sum + area(intersect(triangle.projected, polygon)), 0);
    outsideArea += Math.max(0, area(triangle.projected) - covered);
    if (outsideArea > AREA_EPSILON)
      fail('mirror-face-outside', location, 'Actual mirror triangles must remain inside the declared mirror contours', {triangle: index});
    for (let other = 0; other < index; other++) {
      overlapArea += area(intersect(triangle.projected, triangles[other].projected));
      if (overlapArea > AREA_EPSILON)
        fail('mirror-face-overlap', location, 'Actual mirror triangles must not overlap or repeat', {triangles: [other, index]});
    }
  }
  for (const [index, polygon] of polygons.entries()) {
    let uncovered = [polygon];
    for (const triangle of triangles) {
      uncovered = uncovered.flatMap(fragment => subtract(fragment, triangle.projected));
      if (!uncovered.length) break;
      if (uncovered.length > 8192)
        fail('mirror-face-geometry', location, 'Mirror coverage fragment budget exceeded', {polygon: index});
    }
    const missingArea = uncovered.reduce((sum, fragment) => sum + area(fragment), 0);
    missingTotal += missingArea;
    if (missingTotal > AREA_EPSILON)
      fail('mirror-face-gap', location, 'Actual mirror triangles leave a hole in a declared contour', {polygon: index, missingArea});
  }
}

function clipFront(points) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    const aInside = a.z >= PLANE_Z - POSITION_EPSILON, bInside = b.z >= PLANE_Z - POSITION_EPSILON;
    if (aInside) result.push([a.x, a.y]);
    if (aInside !== bInside) {
      const amount = (PLANE_Z - POSITION_EPSILON - a.z) / (b.z - a.z);
      result.push([a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount]);
    }
  }
  return result;
}

function closedPositiveVolume(actual) {
  // Weld position seams so GLB normal/UV splits do not turn closed solids open.
  const vertexIds = new Map(), edges = new Map();
  let volume = 0;
  const id = point => {
    const key = [point.x, point.y, point.z].map(value => Math.round(value / POSITION_EPSILON)).join(',');
    if (!vertexIds.has(key)) vertexIds.set(key, vertexIds.size);
    return vertexIds.get(key);
  };
  for (const triangle of actual.triangles) {
    const [a, b, c] = triangle.points;
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    const ids = triangle.points.map(id);
    for (let edge = 0; edge < 3; edge++) {
      const first = ids[edge], second = ids[(edge + 1) % 3];
      if (first === second) return false;
      const key = first < second ? `${first},${second}` : `${second},${first}`;
      const record = edges.get(key) || {count: 0, orientation: 0};
      record.count++;
      record.orientation += first < second ? 1 : -1;
      edges.set(key, record);
    }
  }
  return volume > CLIP_EPSILON && [...edges.values()].every(edge => edge.count === 2 && edge.orientation === 0);
}

function validateBody(body, polygons, fail, path) {
  let backing = 0, occludedArea = 0;
  for (const actual of body) {
    for (const [index, triangle] of actual.triangles.entries()) {
      let projected = clipFront(triangle.points);
      if (triangle.normal.z < 0) projected = projected.slice().reverse();
      for (const [polygonIndex, polygon] of polygons.entries()) {
        const clipped = intersect(projected, polygon);
        occludedArea += area(clipped);
        // A vertical fin has zero projected area but can still cross the
        // mirror interior and occlude it from an oblique viewing direction.
        const center = clipped.length ? clipped.reduce((sum, point) => [sum[0] + point[0] / clipped.length, sum[1] + point[1] / clipped.length], [0, 0]) : null;
        const interiorLine = area(projected) <= CLIP_EPSILON && center && polygon.every((a, edge) => {
          const b = polygon[(edge + 1) % polygon.length];
          return cross2(a, b, center) > POSITION_EPSILON * Math.hypot(b[0] - a[0], b[1] - a[1]);
        });
        if (occludedArea > AREA_EPSILON || interiorLine)
          fail('mirror-surface-occluded', `${path}.mirrorShape`, 'Actual frame or back geometry intrudes in front of the declared mirror interior', {mesh: actual.mesh.name, triangle: index, polygon: polygonIndex});
      }
    }
    if (actual.bounds.max.z < PLANE_Z - POSITION_EPSILON &&
        actual.bounds.max.z - actual.bounds.min.z > POSITION_EPSILON && closedPositiveVolume(actual)) backing++;
  }
  if (!backing) fail('mirror-back-geometry', path, 'Mirror resource requires actual closed positive-volume backing behind its face');
  if (body.length < 2)
    fail('mirror-frame-geometry', path, 'Mirror resource requires separate actual frame and backing meshes');
  return backing;
}

export function validateMirrorGeometry(scene, resource, fail, path = resource?.id) {
  if (typeof fail !== 'function') throw new TypeError('validateMirrorGeometry requires a fail function');
  if (resource?.mountRole !== 'mirror') return {checked: false};
  if (!scene?.isObject3D) fail('invalid-mirror-scene', path || 'scene', 'Expected a loaded Three Object3D scene');
  const surface = resource.mirrorSurface;
  if (surface?.schema !== 'planar-mirror-v1' || surface.profile !== 'single-512-v1' ||
      !Array.isArray(surface.position) || surface.position.length !== 3 ||
      surface.position.some((value, index) => value !== [0, 0, PLANE_Z][index]))
    fail('mirror-surface-contract', `${path}.mirrorSurface`, 'Mirror surface must use the fixed planar schema, profile and position');
  if (resource.mirrorNodes?.face !== 'mirror-surface')
    fail('mirror-mapping', `${path}.mirrorNodes.face`, 'Mirror face must map to mirror-surface');
  const matches = [];
  scene.traverse(node => { if (node.name === 'mirror-surface') matches.push(node); });
  if (matches.length !== 1 || !matches[0].isMesh)
    fail('mirror-mapping', `${path}.mirrorNodes.face`, 'Mirror face must uniquely resolve to one actual mesh', {matches: matches.length});
  const face = matches[0], polygons = validatePolygons(resource, fail, path);
  scene.updateMatrixWorld(true);
  validateTransforms(scene, face, fail, path);
  const inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert(), actual = [];
  scene.traverse(node => {
    if (node.isMesh) actual.push(readMesh(node, inverse.clone().multiply(node.matrixWorld), fail, path));
  });
  const faceGeometry = actual.find(entry => entry.mesh === face);
  validateFace(faceGeometry, polygons, fail, path);
  const body = actual.filter(entry => entry.mesh !== face), backingMeshes = validateBody(body, polygons, fail, path);
  return {checked: true, kind: 'mirror', face: face.name, polygons: polygons.length,
    faceTriangles: faceGeometry.triangles.length, bodyMeshes: body.length, backingMeshes,
    contourArea: polygons.reduce((sum, polygon) => sum + area(polygon), 0)};
}
