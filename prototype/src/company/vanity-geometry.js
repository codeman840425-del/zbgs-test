import * as THREE from 'three';

// Bounded static admission for original closed convex furniture components.
// Float32 positions may differ at a shared interface by a few tens of nm.
const POSITION_EPSILON = 1e-6;
const WELD_EPSILON = 1e-7;
const AREA_EPSILON = 1e-10;
const CONTACT_AREA_EPSILON = 1e-8;
const VOLUME_EPSILON = 1e-12;
const THICKNESS_EPSILON = 1e-5;
const CLIP_EPSILON = 1e-10;
const AXES = ['x', 'y', 'z'];
const KNEE_MIN = [-.33, 0, -.12], KNEE_MAX = [.37, .70, .25];

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
      reject(fail, 'vanity-transform', node.name, 'Vanity components require finite static orientation-preserving affine transforms');
    if (!node.isMesh) return;
    meshCount++;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    const positions = node.geometry?.getAttribute('position'), indices = node.geometry?.getIndex();
    const count = indices ? indices.count : positions?.count;
    if (!positions || !count || count % 3 || count / 3 + triangleCount > 2500 || meshCount > 32 || node.geometry.morphAttributes?.position?.length)
      reject(fail, 'vanity-topology', node.name, 'Vanity meshes require bounded nonempty static triangle geometry');
    const vertices = [], faces = [], edges = new Map();
    const read = offset => {
      const index = indices ? indices.getX(offset) : offset;
      if (!Number.isInteger(index) || index < 0 || index >= positions.count)
        reject(fail, 'vanity-topology', node.name, 'Triangle references an invalid vertex');
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix);
      if (!point.toArray().every(Number.isFinite)) reject(fail, 'vanity-topology', node.name, 'Geometry positions must be finite');
      let welded = vertices.findIndex(other => point.distanceToSquared(other) <= WELD_EPSILON ** 2);
      if (welded < 0) { welded = vertices.length; vertices.push(point); }
      return welded;
    };
    for (let offset = 0; offset < count; offset += 3) {
      const face = [read(offset), read(offset + 1), read(offset + 2)];
      const points = face.map(index => vertices[index]);
      if (new Set(face).size !== 3 || polygonArea(points) <= AREA_EPSILON)
        reject(fail, 'vanity-degenerate-face', node.name, 'Each triangle must have three distinct vertices and real area');
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
        reject(fail, 'vanity-open-or-inconsistent', node.name, 'Every welded edge must have exactly two oppositely directed face uses');
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
        reject(fail, 'vanity-nonpositive-volume', id, 'Each connected component must enclose positive outward-oriented volume', {volume});
      const planes = [], edgeDirections = [];
      for (const triangle of triangles) {
        const plane = planeOf(triangle);
        if (shellVertices.some(point => plane.normal.dot(point) - plane.constant > POSITION_EPSILON))
          reject(fail, 'vanity-nonconvex', id, 'Each connected component must be a closed convex polyhedron');
        const thickness = plane.constant - Math.min(...shellVertices.map(point => plane.normal.dot(point)));
        if (thickness <= THICKNESS_EPSILON)
          reject(fail, 'vanity-no-thickness', id, 'Each component must have positive thickness along every face normal', {thickness});
        if (!planes.some(other => other.normal.dot(plane.normal) > 1 - 1e-10 && Math.abs(other.constant - plane.constant) < WELD_EPSILON)) planes.push(plane);
        for (let edge = 0; edge < 3; edge++) addDirection(edgeDirections,
          new THREE.Vector3().subVectors(triangle[(edge + 1) % 3], triangle[edge]));
      }
      const bounds = new THREE.Box3().setFromPoints(shellVertices);
      components.push({id, mesh: node.name, triangles, vertices: shellVertices, planes, edgeDirections, bounds, volume});
    }
  });
  if (!meshCount || meshCount > 32 || triangleCount > 2500 || materials.size > 4)
    reject(fail, 'vanity-budget', '', 'Vanity geometry must contain 1–32 meshes, at most 2500 triangles and four materials', {meshCount, triangleCount, materials: materials.size});
  return {components, meshCount, triangleCount, materials: materials.size};
}

function boxBody(min, max) {
  const vertices = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]])
    for (const z of [min[2], max[2]]) vertices.push(new THREE.Vector3(x, y, z));
  const edgeDirections = AXES.map(axis => new THREE.Vector3().setComponent(AXES.indexOf(axis), 1));
  return {vertices, edgeDirections, planes: edgeDirections.map(normal => ({normal})), bounds: new THREE.Box3().setFromPoints(vertices)};
}

function validateSlab(component, min, max, fail) {
  if (!component || component.vertices.length !== 8 || AXES.some((axis, index) =>
    Math.abs(component.bounds.min[axis] - min[index]) > POSITION_EPSILON || Math.abs(component.bounds.max[axis] - max[index]) > POSITION_EPSILON) ||
    component.vertices.some(point => AXES.some((axis, index) => Math.min(Math.abs(point[axis] - min[index]), Math.abs(point[axis] - max[index])) > POSITION_EPSILON)))
    reject(fail, 'vanity-top', component?.id, 'The real tabletop slabs must be the specified full rectangular prisms with uniform .035m thickness');
}

/** Validate actual scene-local closed convex vanity-table components. */
export function validateVanityGeometry(scene, resource, fail) {
  if (resource?.mountRole !== 'vanity-table' && resource?.clearance?.schema !== 'vanity-clearance-v1') return {checked: false};
  if (typeof fail !== 'function') throw new TypeError('validateVanityGeometry requires a fail function');
  if (!scene?.isObject3D) reject(fail, 'vanity-scene', '', 'Expected a loaded Three Object3D scene');
  const knee = resource.clearance?.knee;
  if (resource.mountRole !== 'vanity-table' || resource.clearance?.schema !== 'vanity-clearance-v1' ||
    !Array.isArray(knee?.min) || !Array.isArray(knee?.max) || knee.min.length !== 3 || knee.max.length !== 3 ||
    knee.min.some((value, index) => value !== KNEE_MIN[index]) || knee.max.some((value, index) => value !== KNEE_MAX[index]))
    reject(fail, 'vanity-clearance-contract', '', 'Vanity geometry requires the fixed v1 knee-clearance contract');
  // The pinned authoring identity selects the shape being verified. Inferring
  // it from the mesh would let a filled corner silently select the plain gate.
  const sourceDesign = resource.provenance?.sourceDesign;
  if (!['plain', 'drawer-style', 'corner', 'mobile'].includes(sourceDesign))
    reject(fail, 'vanity-shape-profile', '', 'Vanity geometry requires a supported fixed provenance.sourceDesign');
  scene.updateMatrixWorld(true);
  if (!Number.isFinite(scene.matrixWorld.determinant()) || scene.matrixWorld.determinant() === 0)
    reject(fail, 'vanity-transform', '', 'Vanity scene transform must be invertible');
  const result = collectComponents(scene, fail), {components} = result;
  const board = components.filter(component => component.mesh === 'vanity-top');
  if (board.length !== 1) reject(fail, 'vanity-top', '', 'vanity-top must name exactly one connected closed board');
  const top = board[0];
  const corner = sourceDesign === 'corner';
  validateSlab(top, [corner ? -.4 : -.55, .745, -.25], [.55, .78, .25], fail);
  if (corner) {
    const wings = components.filter(component => component.mesh === 'vanity-wing');
    if (wings.length !== 1) reject(fail, 'vanity-top', '', 'The corner tabletop requires exactly one real left-back wing slab');
    validateSlab(wings[0], [-.55, .745, -.25], [-.4, .78, 0], fail);
  }
  const kneeBox = boxBody(KNEE_MIN, KNEE_MAX), notch = boxBody([-.55, .745, 0], [-.4, .78, .25]), grounded = [];
  for (const component of components) {
    const {min, max} = component.bounds;
    if (min.x < -.55 - POSITION_EPSILON || max.x > .55 + POSITION_EPSILON || min.y < -POSITION_EPSILON ||
      max.y > .78 + POSITION_EPSILON || min.z < -.25 - POSITION_EPSILON || max.z > .25 + POSITION_EPSILON)
      reject(fail, 'vanity-envelope', component.id, 'Actual component exceeds the fixed 1.10 × .78 × .50m installation envelope', {min: min.toArray(), max: max.toArray()});
    const kneeMargin = overlapMargin(component, kneeBox);
    if (kneeMargin > POSITION_EPSILON)
      reject(fail, 'vanity-knee-occupied', component.id, 'Actual convex geometry enters the knee-clearance interior', {separatingAxisMargin: kneeMargin});
    if (corner && overlapMargin(component, notch) > POSITION_EPSILON)
      reject(fail, 'vanity-corner-notch', component.id, 'The real corner tabletop must preserve its left-front open notch');
    const groundPoints = component.vertices.filter(point => Math.abs(point.y) <= POSITION_EPSILON);
    if (groundPoints.some((point, index) => groundPoints.slice(index + 1).some(other => point.distanceTo(other) > THICKNESS_EPSILON))) grounded.push(component.id);
  }
  const connections = [], neighbors = new Map(components.map(component => [component.id, []]));
  for (let first = 0; first < components.length; first++) for (let second = first + 1; second < components.length; second++) {
    const a = components[first], b = components[second], measured = contact(a, b);
    if (!measured) continue;
    connections.push({a: a.id, b: b.id, ...measured});
    neighbors.get(a.id).push(b.id); neighbors.get(b.id).push(a.id);
  }
  const reached = new Set([top.id]), queue = [top.id];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const neighbor of neighbors.get(queue[cursor]))
    if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  const detached = components.filter(component => !reached.has(component.id)).map(component => component.id);
  if (detached.length) reject(fail, 'vanity-detached-component', '', 'Every actual connected component must join the table board through real face or volume contact', {detached});
  if (!grounded.some(id => reached.has(id)))
    reject(fail, 'vanity-ground-support', '', 'The table board must have a continuous connected path to a real ground contact of positive length');
  return {checked: true, sourceDesign, meshCount: result.meshCount, triangleCount: result.triangleCount, materials: result.materials,
    components: components.map(component => ({id: component.id, volume: component.volume, triangles: component.triangles.length})),
    connections, grounded, tolerances: {positionMetres: POSITION_EPSILON, weldMetres: WELD_EPSILON,
      minimumThicknessMetres: THICKNESS_EPSILON, contactAreaSquareMetres: CONTACT_AREA_EPSILON, positiveVolumeCubicMetres: VOLUME_EPSILON},
    limitation: 'Static convex connectivity and clearance only. Character use and physical tipping stability require separate validation.'};
}
