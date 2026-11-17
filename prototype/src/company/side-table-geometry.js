import * as THREE from 'three';
import {validateSupportGeometry} from './support-geometry.js';

const POSITION_EPSILON = 1e-6;
const AREA_EPSILON = 1e-12;
const COVERAGE_EPSILON = 1e-8;
const CLIP_EPSILON = 1e-12;
const VOLUME_EPSILON = 1e-10;
const AXES = ['x', 'y', 'z'];
const IDENTITY = new THREE.Matrix4().elements;

function reject(fail, code, component, message, details) {
  fail(code, component ? `scene.${component}` : 'resource', message, details);
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

function polygonArea(polygon) {
  let area = 0;
  for (let index = 1; index + 1 < polygon.length; index++) {
    area += new THREE.Vector3().subVectors(polygon[index], polygon[0])
      .cross(new THREE.Vector3().subVectors(polygon[index + 1], polygon[0])).length() / 2;
  }
  return area;
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

function projection(points, normal) {
  const dropped = AXES.reduce((best, axis) => Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best, 'x');
  const coordinates = AXES.filter(axis => axis !== dropped), polygon = points.map(point => coordinates.map(axis => point[axis]));
  return {polygon: cross2(...polygon.slice(0, 3)) < 0 ? polygon.reverse() : polygon, factor: Math.abs(normal[dropped])};
}

function readMeshes(scene, fail) {
  const meshes = [], names = new Set(), materials = new Set();
  let triangleCount = 0;
  scene.traverse(node => {
    if (!node.visible || !node.matrix.elements.every(Number.isFinite) || node.matrix.elements.some((value, i) => Math.abs(value - IDENTITY[i]) > 1e-7) ||
        node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length)
      reject(fail, 'side-table-transform', node.name, 'Actual source geometry requires visible static baked identity nodes and wrappers');
    if (!node.isMesh) return;
    if (!node.name || names.has(node.name)) reject(fail, 'side-table-node', node.name, 'Actual table mesh names must be unique');
    names.add(node.name);
    const geometry = node.geometry, position = geometry?.getAttribute('position'), index = geometry?.getIndex(), count = index?.count || position?.count;
    if (!position || position.itemSize !== 3 || !count || count % 3 || geometry.drawRange.start !== 0 || geometry.drawRange.count < count || geometry.morphAttributes?.position?.length)
      reject(fail, 'side-table-topology', node.name, 'Each real mesh must render its full bounded static triangle set');
    const assigned = Array.isArray(node.material) ? node.material : [node.material];
    if (!assigned.length || assigned.some(material => !material || !material.visible || material.transparent || material.opacity !== 1 || material.alphaTest > 0))
      reject(fail, 'side-table-material', node.name, 'The table requires actual opaque visible source materials');
    for (const material of assigned) materials.add(material);
    if (Array.isArray(node.material)) {
      let cursor = 0;
      for (const group of [...geometry.groups].sort((a, b) => a.start - b.start)) {
        if (group.start !== cursor || !Number.isInteger(group.count) || group.count <= 0 || group.count % 3 || !Number.isInteger(group.materialIndex) || !assigned[group.materialIndex])
          reject(fail, 'side-table-topology', node.name, 'Material groups must render every actual triangle exactly once');
        cursor += group.count;
      }
      if (cursor !== count) reject(fail, 'side-table-topology', node.name, 'Actual material groups must cover the full mesh');
    }
    const triangles = [];
    for (let offset = 0; offset < count; offset += 3) {
      const points = [0, 1, 2].map(step => {
        const source = index ? index.getX(offset + step) : offset + step;
        if (!Number.isInteger(source) || source < 0 || source >= position.count) reject(fail, 'side-table-topology', node.name, 'Triangle indices must reference actual positions');
        const point = new THREE.Vector3().fromBufferAttribute(position, source);
        if (!point.toArray().every(Number.isFinite) || Math.abs(point.x) > .4 + POSITION_EPSILON || point.y < -POSITION_EPSILON || point.y > .5 + POSITION_EPSILON || Math.abs(point.z) > .275 + POSITION_EPSILON)
          reject(fail, 'side-table-envelope', node.name, 'Every referenced source vertex must fit the complete installation box', {point: point.toArray()});
        return point;
      });
      const area = polygonArea(points);
      if (area <= AREA_EPSILON) reject(fail, 'side-table-degenerate-face', node.name, 'Zero-area source triangles must be cleaned instead of counted as real boundary');
      triangles.push({points, normal: planeOf(points).normal, area, mesh: node.name});
    }
    triangleCount += triangles.length;
    meshes.push({name: node.name, node, triangles});
  });
  if (!meshes.length || meshes.length > 32 || triangleCount > 2500 || materials.size > 4)
    reject(fail, 'side-table-budget', '', 'Actual side tables require at most 2500 triangles, 32 meshes and four materials');
  return {meshes, triangleCount, materials: materials.size};
}

function requiredMesh(meshes, name, fail) {
  const mesh = meshes.find(mesh => mesh.name === name);
  if (!mesh) reject(fail, 'side-table-node', name, 'The finite source adaptation requires its actual named part');
  return mesh;
}

// Original Kenney faces contain collinear edge subdivisions. Atomizing a long
// edge at its real source vertices verifies geometric closure without adding
// zero-area triangles or merging independently closed cabinet/door solids.
function closedBody(meshes, id, fail) {
  const triangles = meshes.flatMap(mesh => mesh.triangles), vertices = [], faces = [];
  for (const triangle of triangles) faces.push(triangle.points.map(point => {
    let index = vertices.findIndex(other => point.distanceToSquared(other) <= POSITION_EPSILON ** 2);
    if (index < 0) { index = vertices.length; vertices.push(point); }
    return index;
  }));
  const edges = new Map();
  for (const [faceIndex, face] of faces.entries()) for (let edge = 0; edge < 3; edge++) {
    const start = vertices[face[edge]], end = vertices[face[(edge + 1) % 3]], direction = end.clone().sub(start), length = direction.length();
    if (length <= POSITION_EPSILON) reject(fail, 'side-table-edge', id, 'Actual boundary edges must have positive geometric length');
    const splits = [];
    for (const [index, point] of vertices.entries()) {
      const amount = point.clone().sub(start).dot(direction) / direction.lengthSq();
      if (amount < -POSITION_EPSILON / length || amount > 1 + POSITION_EPSILON / length) continue;
      if (point.distanceTo(start.clone().addScaledVector(direction, amount)) <= POSITION_EPSILON) splits.push({index, amount});
    }
    splits.sort((a, b) => a.amount - b.amount);
    for (let split = 1; split < splits.length; split++) {
      const from = splits[split - 1].index, to = splits[split].index;
      if (vertices[from].distanceToSquared(vertices[to]) <= POSITION_EPSILON ** 2) continue;
      const key = `${Math.min(from, to)}/${Math.max(from, to)}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({from, to, faceIndex});
    }
  }
  const neighbors = faces.map(() => []);
  for (const [edge, uses] of edges) {
    if (uses.length !== 2 || uses[0].from !== uses[1].to || uses[0].to !== uses[1].from)
      reject(fail, 'side-table-open-boundary', id, 'Every real atomic boundary edge needs exactly two opposite triangle uses', {edge, uses});
    neighbors[uses[0].faceIndex].push(uses[1].faceIndex); neighbors[uses[1].faceIndex].push(uses[0].faceIndex);
  }
  const reached = new Set([0]), queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors[queue[cursor]]) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  if (reached.size !== triangles.length) reject(fail, 'side-table-components', id, 'A declared source solid must be one connected actual closed shell');
  const volume = signedVolume(triangles.map(triangle => triangle.points), vertices[0]);
  if (volume <= VOLUME_EPSILON) reject(fail, 'side-table-volume', id, 'Every actual shell must enclose positive outward-oriented volume', {volume});
  return {id, triangles, vertices, volume, bounds: new THREE.Box3().setFromPoints(vertices)};
}

function coplanarArea(a, b) {
  if (Math.abs(a.normal.dot(b.normal)) < 1 - 1e-8 || b.points.some(point => Math.abs(a.normal.dot(point.clone().sub(a.points[0]))) > POSITION_EPSILON)) return 0;
  const first = projection(a.points, a.normal), second = projection(b.points, a.normal);
  return area(intersect(first.polygon, second.polygon)) / first.factor;
}

function contactArea(a, b) {
  if (!a.bounds.clone().expandByScalar(POSITION_EPSILON).intersectsBox(b.bounds)) return 0;
  let total = 0;
  for (const first of a.triangles) for (const second of b.triangles) if (first.normal.dot(second.normal) < -1 + 1e-8) total += coplanarArea(first, second);
  return total;
}

function duplicateFaces(triangles, fail) {
  for (let first = 0; first < triangles.length; first++) for (let second = first + 1; second < triangles.length; second++) {
    const a = triangles[first], b = triangles[second];
    if (a.normal.dot(b.normal) > 1 - 1e-8 && coplanarArea(a, b) > COVERAGE_EPSILON)
      reject(fail, 'side-table-duplicate-face', a.mesh, 'Actual equally oriented coplanar table faces overlap over positive area', {other: b.mesh, triangles: [first, second]});
  }
}

function groundContacts(body, required, fail) {
  const triangles = body.triangles.filter(triangle => triangle.normal.y < -1 + 1e-7 && triangle.points.every(point => Math.abs(point.y) <= POSITION_EPSILON));
  const groups = [];
  for (const triangle of triangles) {
    const touching = groups.filter(group => group.some(other => triangle.points.some(point => other.points.some(vertex => point.distanceTo(vertex) <= POSITION_EPSILON))));
    if (!touching.length) groups.push([triangle]);
    else {
      const combined = [triangle, ...touching.flat()];
      for (const group of touching) groups.splice(groups.indexOf(group), 1);
      groups.push(combined);
    }
  }
  const areas = groups.map(group => group.reduce((sum, triangle) => sum + triangle.area, 0));
  if (groups.length !== required || areas.some(area => area <= COVERAGE_EPSILON))
    reject(fail, 'side-table-ground-contact', body.id, 'Each actual table needs its own complete positive-area ground contacts', {required, areas});
  return areas;
}

function rectangle(left, right, back, front) { return [[left, back], [right, back], [right, front], [left, front]]; }

function topCoverage(body, polygon, topY, fail) {
  const top = body.triangles.filter(triangle => triangle.points.every(point => Math.abs(point.y - topY) <= POSITION_EPSILON));
  if (top.some(triangle => triangle.normal.y < 1 - 1e-7)) reject(fail, 'side-table-board', body.id, 'Every actual tabletop triangle must face upward');
  validateCoverage(top.map(triangle => ({projected: projection(triangle.points, triangle.normal).polygon})), [polygon], fail, `scene.${body.id}`, 'side-table-board');
}

function rectangularBoard(body, minX, maxX, back, front, bottomY, topY, fail) {
  const outline = rectangle(minX, maxX, back, front);
  topCoverage(body, outline, topY, fail);
  const sides = [['x', minX, -1], ['x', maxX, 1], ['z', back, -1], ['z', front, 1]];
  for (const [axis, plane, sign] of sides) {
    const coordinate = axis === 'x' ? 'z' : 'x', low = axis === 'x' ? back : minX, high = axis === 'x' ? front : maxX;
    const triangles = body.triangles.filter(triangle => triangle.normal[axis] * sign > 1 - 1e-7 && triangle.points.every(point => Math.abs(point[axis] - plane) <= POSITION_EPSILON) && triangle.points.some(point => point.y > bottomY + POSITION_EPSILON));
    const projected = triangles.map(triangle => {
      const points = triangle.points.map(point => [point[coordinate], point.y]);
      const projected = cross2(...points) < 0 ? points.reverse() : points;
      return {projected: intersect(projected, rectangle(low, high, bottomY, topY))};
    });
    validateCoverage(projected, [rectangle(low, high, bottomY, topY)], fail, `scene.${body.id}`, 'side-table-board');
  }
  for (const triangle of body.triangles) {
    if (!triangle.points.some(point => point.y > bottomY + POSITION_EPSILON)) continue;
    const cap = triangle.points.every(point => Math.abs(point.y - topY) <= POSITION_EPSILON) && triangle.normal.y > 1 - 1e-7;
    const side = sides.some(([axis, plane, sign]) => triangle.normal[axis] * sign > 1 - 1e-7 && triangle.points.every(point => Math.abs(point[axis] - plane) <= POSITION_EPSILON));
    if (!cap && !side) reject(fail, 'side-table-board', body.id, 'The actual thick board cannot hide an interior opening or thin false top');
  }
  return {bottomY, topY, thickness: topY - bottomY};
}

function roundBoard(board, support, fail) {
  const bottom = board.bounds.min.y, top = .5;
  if (bottom < .42 || bottom > .44 || Math.abs(support.bounds.max.y - bottom) > POSITION_EPSILON)
    reject(fail, 'side-table-round-board', board.id, 'The thick circle and retained source support must meet at the actual original slab cut');
  const circle = Array.from({length: 48}, (_, i) => [.26 * Math.cos(2 * Math.PI * i / 48), .26 * Math.sin(2 * Math.PI * i / 48)]);
  topCoverage(board, circle, top, fail);
  const lower = board.triangles.filter(triangle => triangle.points.every(point => Math.abs(point.y - bottom) <= POSITION_EPSILON));
  if (lower.some(triangle => triangle.normal.y > -1 + 1e-7)) reject(fail, 'side-table-round-board', board.id, 'The real circle underside must face downward');
  validateCoverage(lower.map(triangle => ({projected: projection(triangle.points, triangle.normal).polygon})), [circle], fail, `scene.${board.id}`, 'side-table-round-board');
  for (const triangle of board.triangles) {
    if (triangle.points.every(point => Math.abs(point.y - top) <= POSITION_EPSILON || Math.abs(point.y - bottom) <= POSITION_EPSILON) &&
        triangle.points.every(point => Math.abs(point.y - triangle.points[0].y) <= POSITION_EPSILON)) continue;
    const side = circle.some((a, i) => {
      const b = circle[(i + 1) % circle.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      return triangle.points.every(point => Math.abs(cross2(a, b, [point.x, point.z])) <= POSITION_EPSILON * length && point.y >= bottom - POSITION_EPSILON && point.y <= top + POSITION_EPSILON) &&
        triangle.normal.dot(new THREE.Vector3(dz / length, 0, -dx / length)) > 1 - 1e-7;
    });
    if (!side) reject(fail, 'side-table-round-board', board.id, 'The closed circle must use the actual 48-segment side boundary and full thickness');
  }
  const expected = area(circle) * (top - bottom);
  if (Math.abs(board.volume - expected) > 1e-8) reject(fail, 'side-table-round-board', board.id, 'The actual circle partition must enclose exactly the complete thick slab');
  const capArea = contactArea(board, support);
  if (Math.abs(capArea - .002704) > 2e-7) reject(fail, 'side-table-board-support', board.id, 'The retained source column needs its real full cut-section contact with the new circle', {capArea});
  const steps = new Set(support.triangles.filter(triangle => triangle.normal.y > .999999 && triangle.points.every(point => Math.abs(point.y - triangle.points[0].y) <= POSITION_EPSILON) && triangle.points[0].y > .03 && triangle.points[0].y < .12)
    .map(triangle => Math.round(triangle.points[0].y / POSITION_EPSILON)));
  if (steps.size < 2) reject(fail, 'side-table-source-form', support.id, 'The actual source pedestal must retain its distinct lower support tiers');
  return {bottomY: bottom, topY: top, thickness: top - bottom, capArea, segments: 48, partitionArea: .066};
}

function strictlyInside(point, body) {
  let angle = 0;
  for (const triangle of body.triangles) {
    const [a, b, c] = triangle.points;
    if (new THREE.Triangle(a, b, c).closestPointToPoint(point, new THREE.Vector3()).distanceTo(point) <= POSITION_EPSILON) return false;
    const x = a.clone().sub(point), y = b.clone().sub(point), z = c.clone().sub(point), lx = x.length(), ly = y.length(), lz = z.length();
    angle += 2 * Math.atan2(x.dot(y.clone().cross(z)), lx * ly * lz + x.dot(y) * lz + y.dot(z) * lx + z.dot(x) * ly);
  }
  return Math.abs(angle) > 2 * Math.PI;
}

function crossing(a, b) {
  const normal = b.normal, origin = b.points[0], distances = a.points.map(point => normal.dot(point.clone().sub(origin)));
  for (let edge = 0; edge < 3; edge++) {
    const first = distances[edge], second = distances[(edge + 1) % 3];
    if (first * second >= -(POSITION_EPSILON ** 2)) continue;
    const point = a.points[edge].clone().lerp(a.points[(edge + 1) % 3], first / (first - second));
    const barycentric = new THREE.Triangle(...b.points).getBarycoord(point, new THREE.Vector3());
    if (barycentric && Math.min(barycentric.x, barycentric.y, barycentric.z) > 1e-6) return true;
  }
  return false;
}

function penetration(a, b) {
  if (!a.bounds.intersectsBox(b.bounds)) return null;
  if (a.vertices.some(point => strictlyInside(point, b)) || b.vertices.some(point => strictlyInside(point, a))) return {kind: 'inside'};
  for (const first of a.triangles) for (const second of b.triangles) if (crossing(first, second) || crossing(second, first)) return {kind: 'surface-crossing'};
  return null;
}

function boardBounds(body, min, max, fail) {
  if (AXES.some((axis, index) => Math.abs(body.bounds.min[axis] - min[index]) > POSITION_EPSILON || Math.abs(body.bounds.max[axis] - max[index]) > POSITION_EPSILON))
    reject(fail, 'side-table-source-form', body.id, 'The actual finite source table must retain its specified dimensions and ground base');
}

/** Finite Kenney-derived static source shells, real top partition and support. */
export function validateSideTableGeometry(scene, resource, fail, path = resource?.id) {
  if (resource?.mountRole !== 'side-table' && resource?.productionBranch !== 'side-table') return {checked: false};
  if (typeof fail !== 'function') throw new TypeError('validateSideTableGeometry requires a fail function');
  const failure = (code, location, message, details) => fail(code, path ? `${path}.${location}` : location, message, details);
  if (!scene?.isObject3D) reject(failure, 'side-table-scene', '', 'Expected the actual imported Three scene');
  const design = resource.provenance?.sourceDesign;
  if (!['round', 'square', 'nested', 'low'].includes(design)) reject(failure, 'side-table-source-form', '', 'The finite source design must match one of the four actual structural forms');
  scene.updateMatrixWorld(true);
  const collected = readMeshes(scene, failure), {meshes} = collected;
  requiredMesh(meshes, 'side-table-top', failure);
  const sourceGroups = design === 'round' ? [['board', ['side-table-top', 'side-table-round-board']], ['pedestal', ['side-table-round-support']]] :
    design === 'square' ? [['cabinet', ['side-table-top', 'side-table-square-body']], ['door', ['side-table-square-door', 'side-table-square-handle']]] :
    design === 'nested' ? [['main', ['side-table-top', 'side-table-nested-main']], ['small', ['side-table-nested-small']]] : [['low', ['side-table-top', 'side-table-low-body']]];
  const used = new Set(), bodies = [];
  for (const [id, names] of sourceGroups) {
    const selected = names.map(name => requiredMesh(meshes, name, failure));
    for (const mesh of selected) used.add(mesh);
    bodies.push(closedBody(selected, id, failure));
  }
  for (const mesh of meshes.filter(mesh => !used.has(mesh))) bodies.push(closedBody([mesh], mesh.name, failure));
  duplicateFaces(meshes.flatMap(mesh => mesh.triangles), failure);
  const ground = [], boards = [];
  if (design === 'round') {
    boards.push(roundBoard(bodies[0], bodies[1], failure));
    ground.push({id: bodies[1].id, areas: groundContacts(bodies[1], 1, failure)});
  } else if (design === 'square') {
    boardBounds(bodies[0], [-.25, 0, -.225], [.25, .5, .225], failure);
    boards.push(rectangularBoard(bodies[0], -.25, .25, -.225, .225, .5 * .2132 / .2332, .5, failure));
    ground.push({id: bodies[0].id, areas: groundContacts(bodies[0], 1, failure)});
  } else if (design === 'nested') {
    boardBounds(bodies[0], [-.29, 0, -.22], [.19, .5, .22], failure);
    const center = bodies[1].bounds.getCenter(new THREE.Vector3()).x;
    if (center < .23 - POSITION_EPSILON || center > .24 + POSITION_EPSILON) reject(failure, 'side-table-nested-position', 'small', 'The finite static nested offset must retain the validated .23m to .24m source range');
    boardBounds(bodies[1], [center - .15, 0, -.13], [center + .15, .34, .13], failure);
    boards.push(rectangularBoard(bodies[0], -.29, .19, -.22, .22, .5 * .18 / .23, .5, failure));
    boards.push(rectangularBoard(bodies[1], center - .15, center + .15, -.13, .13, .34 * .18 / .23, .34, failure));
    for (const body of bodies.slice(0, 2)) ground.push({id: body.id, areas: groundContacts(body, 4, failure)});
  } else {
    boardBounds(bodies[0], [-.375, 0, -.225], [.375, .5, .225], failure);
    boards.push(rectangularBoard(bodies[0], -.375, .375, -.225, .225, .5 * .18 / .23, .5, failure));
    ground.push({id: bodies[0].id, areas: groundContacts(bodies[0], 4, failure)});
  }
  const connections = [], neighbors = new Map(bodies.map(body => [body.id, []]));
  for (let first = 0; first < bodies.length; first++) for (let second = first + 1; second < bodies.length; second++) {
    const a = bodies[first], b = bodies[second], overlap = penetration(a, b), area = contactArea(a, b);
    if (overlap) reject(failure, 'side-table-intersection', a.id, 'Actual independently closed source solids penetrate each other', {other: b.id, overlap});
    if (design === 'nested' && first === 0 && second === 1 && area > COVERAGE_EPSILON)
      reject(failure, 'side-table-nested-gap', '', 'The two actual tables must retain separate static support and clearance');
    if (area > COVERAGE_EPSILON) { connections.push({a: a.id, b: b.id, area}); neighbors.get(a.id).push(b.id); neighbors.get(b.id).push(a.id); }
  }
  const grounded = new Set(ground.map(entry => entry.id)), queue = [...grounded];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors.get(queue[cursor])) if (!grounded.has(next)) { grounded.add(next); queue.push(next); }
  const detached = bodies.filter(body => !grounded.has(body.id)).map(body => body.id);
  if (detached.length) reject(failure, 'side-table-detached', '', 'Every actual closed solid needs a continuous positive-area contact path to its table ground', {detached});
  const support = validateSupportGeometry(scene, resource, failure);
  return {checked: true, profile: 'side-table-v1', sourceDesign: design, meshCount: meshes.length, triangleCount: collected.triangleCount,
    materials: collected.materials, support, boards, ground, connections, solids: bodies.map(body => ({id: body.id, triangles: body.triangles.length, volume: body.volume})),
    tolerances: {positionMetres: POSITION_EPSILON, boundaryEdgeMetres: POSITION_EPSILON, areaSquareMetres: COVERAGE_EPSILON},
    limitation: 'Finite actual static source shells, complete board boundary, contact and independent ground checks. Source identity is additionally pinned by the producer original-vertex readback. No mechanical strength, dynamic nesting or character-use claim.'};
}
