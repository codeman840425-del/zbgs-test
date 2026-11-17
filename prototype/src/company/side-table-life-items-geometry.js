import * as THREE from 'three';
import {isSideTableLifeItemsResource} from './side-table-life-items-data.js';

const POSITION_EPSILON = 1e-6;
const AREA_EPSILON = 1e-12;
const COVERAGE_EPSILON = 1e-8;
const CLIP_EPSILON = 1e-12;
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
      fail(code || 'life-items-face-outside', location, 'Actual triangles must remain inside the required contours', {triangle: index});
    for (let other = 0; other < index; other++) {
      overlapArea += area(intersect(triangle.projected, triangles[other].projected));
      if (overlapArea > COVERAGE_EPSILON)
        fail(code || 'life-items-face-overlap', location, 'Actual triangles must not overlap or repeat', {triangles: [other, index]});
    }
  }
  for (const [index, polygon] of polygons.entries()) {
    let uncovered = [polygon];
    for (const triangle of triangles) {
      uncovered = uncovered.flatMap(fragment => subtract(fragment, triangle.projected));
      if (!uncovered.length) break;
      if (uncovered.length > 8192)
        fail(code || 'life-items-face-geometry', location, 'Boundary coverage fragment budget exceeded', {polygon: index});
    }
    const missingArea = uncovered.reduce((sum, fragment) => sum + area(fragment), 0);
    missingTotal += missingArea;
    if (missingTotal > COVERAGE_EPSILON)
      fail(code || 'life-items-face-gap', location, 'Actual triangles leave a hole in a required contour', {polygon: index, missingArea});
  }
}

function projection(points, normal) {
  const dropped = AXES.reduce((best, axis) => Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best, 'x');
  const coordinates = AXES.filter(axis => axis !== dropped), polygon = points.map(point => coordinates.map(axis => point[axis]));
  return {polygon: cross2(...polygon.slice(0, 3)) < 0 ? polygon.reverse() : polygon, factor: Math.abs(normal[dropped])};
}

function readMeshes(scene, fail) {
  scene.updateMatrixWorld(true);
  const meshes = [], names = new Set(), materials = new Set();
  let triangleCount = 0;
  scene.traverse(node => {
    if (!node.visible || !node.matrix.elements.every(Number.isFinite) || node.matrix.elements.some((value, i) => Math.abs(value - IDENTITY[i]) > 1e-7) ||
        node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length)
      reject(fail, 'life-items-transform', node.name, 'Actual source geometry requires visible static baked identity nodes and wrappers');
    if (!node.isMesh) return;
    if (!node.name || names.has(node.name)) reject(fail, 'life-items-node', node.name, 'Actual life-item mesh names must be unique');
    names.add(node.name);
    const geometry = node.geometry, position = geometry?.getAttribute('position'), index = geometry?.getIndex(), count = index?.count || position?.count;
    if (!position || position.itemSize !== 3 || !count || count % 3 || geometry.drawRange.start !== 0 || geometry.drawRange.count < count || geometry.morphAttributes?.position?.length)
      reject(fail, 'life-items-topology', node.name, 'Each real mesh must render its full bounded static triangle set');
    const assigned = Array.isArray(node.material) ? node.material : [node.material];
    if (!assigned.length || assigned.some(material => !material || !material.visible || material.transparent || material.opacity !== 1 || material.alphaTest > 0))
      reject(fail, 'life-items-material', node.name, 'Life items require actual opaque visible source materials');
    for (const material of assigned) materials.add(material);
    if (Array.isArray(node.material)) {
      let cursor = 0;
      for (const group of [...geometry.groups].sort((a, b) => a.start - b.start)) {
        if (group.start !== cursor || !Number.isInteger(group.count) || group.count <= 0 || group.count % 3 || !Number.isInteger(group.materialIndex) || !assigned[group.materialIndex])
          reject(fail, 'life-items-topology', node.name, 'Material groups must render every actual triangle exactly once');
        cursor += group.count;
      }
      if (cursor !== count) reject(fail, 'life-items-topology', node.name, 'Actual material groups must cover the full mesh');
    }
    const triangles = [];
    for (let offset = 0; offset < count; offset += 3) {
      const points = [0, 1, 2].map(step => {
        const source = index ? index.getX(offset + step) : offset + step;
        if (!Number.isInteger(source) || source < 0 || source >= position.count) reject(fail, 'life-items-topology', node.name, 'Triangle indices must reference actual positions');
        const point = new THREE.Vector3().fromBufferAttribute(position, source);
        if (!point.toArray().every(Number.isFinite) || Math.abs(point.x) > .09 + POSITION_EPSILON || point.y < -POSITION_EPSILON || point.y > .25 + POSITION_EPSILON || Math.abs(point.z) > .09 + POSITION_EPSILON)
          reject(fail, 'life-items-envelope', node.name, 'Every referenced source vertex must fit the complete installation box', {point: point.toArray()});
        return point;
      });
      const area = polygonArea(points);
      if (area <= AREA_EPSILON) reject(fail, 'life-items-degenerate-face', node.name, 'Zero-area source triangles must be cleaned instead of counted as real boundary');
      triangles.push({points, normal: planeOf(points).normal, area, mesh: node.name});
    }
    triangleCount += triangles.length;
    meshes.push({name: node.name, node, triangles});
  });
  if (!meshes.length || meshes.length > 32 || triangleCount > 2500 || materials.size > 4)
    reject(fail, 'life-items-budget', '', 'Actual life items require at most 2500 triangles, 32 meshes and four materials');
  return {meshes, triangleCount, materials: materials.size};
}

function splitComponents(mesh, fail) {
  const vertices = [], faces = [], edges = new Map();
  for (const triangle of mesh.triangles) faces.push(triangle.points.map(point => {
    let index = vertices.findIndex(other => point.distanceToSquared(other) <= POSITION_EPSILON ** 2);
    if (index < 0) { index = vertices.length; vertices.push(point); }
    return index;
  }));
  for (const [face, ids] of faces.entries()) for (let edge = 0; edge < 3; edge++) {
    const a = ids[edge], b = ids[(edge + 1) % 3], key = `${Math.min(a, b)}/${Math.max(a, b)}`;
    if (a === b) reject(fail, 'life-items-edge', mesh.name, 'Real source edges must have nonzero length');
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({face, a, b});
  }
  const neighbors = faces.map(() => []);
  for (const uses of edges.values()) {
    if (uses.length > 2 || uses.length === 2 && (uses[0].a !== uses[1].b || uses[0].b !== uses[1].a))
      reject(fail, 'life-items-winding', mesh.name, 'Actual shared boundary edges require consistent orientation');
    if (uses.length === 2) { neighbors[uses[0].face].push(uses[1].face); neighbors[uses[1].face].push(uses[0].face); }
  }
  const seen = new Set(), components = [];
  for (let start = 0; start < faces.length; start++) {
    if (seen.has(start)) continue;
    const queue = [start]; seen.add(start);
    for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors[queue[cursor]]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    const faceSet = new Set(queue), points = [...new Set(queue.flatMap(face => faces[face]))].map(index => vertices[index]);
    const boundary = [...edges.values()].filter(uses => uses.length === 1 && faceSet.has(uses[0].face)).map(uses => [vertices[uses[0].a], vertices[uses[0].b]]);
    const triangles = queue.map(face => mesh.triangles[face]), volume = signedVolume(triangles.map(triangle => triangle.points), points[0]);
    components.push({name: mesh.name, triangles, vertices: points, boundary, closed: boundary.length === 0, volume, bounds: new THREE.Box3().setFromPoints(points)});
  }
  return components;
}

function closed(mesh, fail) {
  const components = splitComponents(mesh, fail);
  if (components.length !== 1 || !components[0].closed || components[0].volume <= 1e-12)
    reject(fail, 'life-items-closed-solid', mesh.name, 'This semantic part must be one actual positive-volume closed shell');
  return components[0];
}

function bounds(body, min, max, fail) {
  if (AXES.some((axis, i) => Math.abs(body.bounds.min[axis] - min[i]) > POSITION_EPSILON || Math.abs(body.bounds.max[axis] - max[i]) > POSITION_EPSILON))
    reject(fail, 'life-items-part-bounds', body.name, 'Actual semantic-part geometry must fit its finite recipe dimensions');
}

function box(body, min, max, fail) {
  bounds(body, min, max, fail);
  if (body.vertices.length !== 8 || body.vertices.some(point => AXES.some((axis, i) => Math.min(Math.abs(point[axis] - min[i]), Math.abs(point[axis] - max[i])) > POSITION_EPSILON)))
    reject(fail, 'life-items-solid-box', body.name, 'The actual part requires the entire closed rectangular solid');
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(mask => new THREE.Vector3(...min.map((value, axis) => mask & (1 << axis) ? max[axis] : value)));
  boundaryCoverage(body, [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].map(ids => ids.map(index => corners[index])), fail);
}

function contact(a, b) {
  if (!a.bounds.clone().expandByScalar(POSITION_EPSILON).intersectsBox(b.bounds)) return 0;
  let shared = 0;
  for (const first of a.triangles) for (const second of b.triangles) {
    if (first.normal.dot(second.normal) > -1 + 1e-8 || second.points.some(point => Math.abs(first.normal.dot(point.clone().sub(first.points[0]))) > POSITION_EPSILON)) continue;
    const projected = projection(first.points, first.normal), other = projection(second.points, first.normal);
    shared += area(intersect(projected.polygon, other.polygon)) / projected.factor;
  }
  return shared;
}

function distance(point, body) {
  let minimum = Infinity;
  for (const triangle of body.triangles) minimum = Math.min(minimum, new THREE.Triangle(...triangle.points).closestPointToPoint(point, new THREE.Vector3()).distanceTo(point));
  return minimum;
}

function inside(point, body) {
  if (distance(point, body) <= POSITION_EPSILON) return false;
  let angle = 0;
  for (const triangle of body.triangles) {
    const [a, b, c] = triangle.points.map(vertex => vertex.clone().sub(point));
    angle += 2 * Math.atan2(a.dot(b.clone().cross(c)), a.length() * b.length() * c.length() + a.dot(b) * c.length() + b.dot(c) * a.length() + c.dot(a) * b.length());
  }
  return Math.abs(angle) > 2 * Math.PI;
}

function boundarySamples(body) {
  return body.boundary.flatMap(([a, b]) => [a, b, a.clone().lerp(b, .5)]);
}

function ground(body, fail) {
  const area = body.triangles.filter(triangle => triangle.normal.y < -.999999 && triangle.points.every(point => Math.abs(point.y) <= POSITION_EPSILON))
    .reduce((sum, triangle) => sum + triangle.area, 0);
  if (area <= COVERAGE_EPSILON) reject(fail, 'life-items-base-contact', body.name, 'The actual primary body needs positive-area tabletop contact');
  return area;
}

function clipPolygon(polygon, normal, constant) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = normal.dot(a) - constant, db = normal.dot(b) - constant;
    if (da <= 1e-12) result.push(a);
    if ((da <= 1e-12) !== (db <= 1e-12)) result.push(a.clone().lerp(b, da / (da - db)));
  }
  return result;
}

function clearPrism(triangles, planes, fail, code, part) {
  for (const triangle of triangles) {
    let fragment = triangle.points;
    for (const plane of planes) { fragment = clipPolygon(fragment, plane.normal, plane.constant); if (fragment.length < 3) break; }
    if (polygonArea(fragment) > 1e-10) reject(fail, code, part, 'Actual triangles obstruct the finite open region');
  }
}

function openingPrism(x, z, radius, floor, top) {
  const planes = [{normal: new THREE.Vector3(0, -1, 0), constant: -floor}, {normal: new THREE.Vector3(0, 1, 0), constant: top}];
  for (let i = 0; i < 16; i++) {
    const angle = 2 * Math.PI * i / 16, normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    planes.push({normal, constant: radius + normal.x * x + normal.z * z});
  }
  return planes;
}

function sourceTexture(mesh, fail) {
  const material = mesh.node.material, uv = mesh.node.geometry.getAttribute('uv'), position = mesh.node.geometry.getAttribute('position');
  if (Array.isArray(material) || !material.map?.isTexture || material.map.channel !== 0 || material.map.colorSpace !== THREE.SRGBColorSpace ||
      material.side !== THREE.DoubleSide || !uv || uv.itemSize !== 2 || uv.count !== position.count)
    reject(fail, 'life-items-source-texture', mesh.name, 'The Food source requires its real opaque colormap, original UV channel and double-sided material semantics');
  for (let i = 0; i < uv.count; i++) if (![uv.getX(i), uv.getY(i)].every(Number.isFinite)) reject(fail, 'life-items-source-uv', mesh.name, 'Actual source UV coordinates must remain finite');
  const values = new Set(Array.from({length: uv.count}, (_, i) => `${uv.getX(i)}/${uv.getY(i)}`));
  if (values.size < 4) reject(fail, 'life-items-source-uv', mesh.name, 'The original gradient mapping cannot collapse to a single swatch');
}

function cup(mesh, holder, fail) {
  sourceTexture(mesh, fail);
  const scaleXZ = holder ? .217391300 : .410794798, height = holder ? .075 : .11, floorY = holder ? .01125 : .0165;
  const x = holder ? .055 : 0, z = holder ? 0 : .03105832263827324 * scaleXZ;
  const components = splitComponents(mesh, fail), vessel = components.find(component => component.closed && component.bounds.min.y <= POSITION_EPSILON);
  if (!vessel || components.length !== 2 || vessel.volume <= 1e-12) reject(fail, 'life-items-cup-shell', mesh.name, 'The actual source needs its closed hollow vessel and embedded open-ended handle');
  bounds({name: mesh.name, bounds: new THREE.Box3().setFromPoints(components.flatMap(component => component.vertices))},
    [x - .115 * scaleXZ, 0, z - .17711664736270905 * scaleXZ], [x + .115 * scaleXZ, height, z + .115 * scaleXZ], fail);
  const handle = components.find(component => component !== vessel);
  if (!handle.boundary.length || boundarySamples(handle).some(point => !inside(point, vessel)))
    reject(fail, 'life-items-handle-contact', mesh.name, 'Every actual handle-end boundary must remain buried in the closed vessel material');
  const centerRay = new THREE.Ray(new THREE.Vector3(x, height + .02, z), new THREE.Vector3(0, -1, 0)), hits = [];
  for (const triangle of vessel.triangles) {
    const hit = centerRay.intersectTriangle(...triangle.points, false, new THREE.Vector3());
    if (hit) hits.push(hit.y);
  }
  if (!hits.length || Math.abs(Math.max(...hits) - floorY) > POSITION_EPSILON)
    reject(fail, 'life-items-cup-floor', mesh.name, 'The real unobstructed inner floor must remain at its finite source height');
  clearPrism(mesh.triangles, openingPrism(x, z, holder ? .012 : .024, floorY + POSITION_EPSILON, height + .01), fail, 'life-items-opening', mesh.name);
  for (let i = 0; i < 8; i++) {
    const angle = 2 * Math.PI * i / 8, direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const ray = new THREE.Ray(new THREE.Vector3(x, height * .65, z), direction), distances = [];
    for (const triangle of vessel.triangles) {
      const hit = ray.intersectTriangle(...triangle.points, false, new THREE.Vector3());
      if (hit && !distances.some(value => Math.abs(value - hit.distanceTo(ray.origin)) <= POSITION_EPSILON)) distances.push(hit.distanceTo(ray.origin));
    }
    distances.sort((a, b) => a - b);
    if (distances.length < 2 || distances[1] - distances[0] < .001)
      reject(fail, 'life-items-cup-wall', mesh.name, 'The actual inner and outer source walls must have distinct positive thickness');
  }
  return {vessel, handle, floorY, x, z, height, groundArea: ground(vessel, fail)};
}

function bottle(mesh, fail) {
  sourceTexture(mesh, fail);
  const scale = .396270215, components = splitComponents(mesh, fail);
  const collar = components.find(component => component.closed), body = components.find(component => component.bounds.min.y <= POSITION_EPSILON);
  const cover = components.find(component => component !== collar && component !== body);
  if (components.length !== 3 || !collar || !body || !cover || collar.volume <= 1e-12 || body.closed || cover.closed)
    reject(fail, 'life-items-bottle-assembly', mesh.name, 'The actual bottle must retain its body, closed collar and open-bottom cover assembly');
  bounds({name: mesh.name, bounds: new THREE.Box3().setFromPoints(components.flatMap(component => component.vertices))},
    [-.09024599939584732 * scale, 0, -.07815533131361008 * scale], [.09024599939584732 * scale, .23, .07815533131361008 * scale], fail);
  if (!body.boundary.length || boundarySamples(body).some(point => !inside(point, collar)))
    reject(fail, 'life-items-bottle-neck', mesh.name, 'Every actual open neck boundary must be sealed by its original collar embed');
  if (!cover.boundary.length || boundarySamples(cover).some(point => Math.abs(point.y - collar.bounds.max.y) > POSITION_EPSILON || distance(point, collar) > POSITION_EPSILON))
    reject(fail, 'life-items-bottle-cover', mesh.name, 'The actual cover boundary must touch the collar top within Float32 source tolerance');
  return {body, collar, cover, groundArea: ground(body, fail), sourceInterface: 'Embedded body rim and cover rim against closed collar'};
}

// Compare full polygonal boundary coverage, including holes and thin folded
// sheets. This finite recipe check does not approximate concave solids by boxes.
function boundaryCoverage(body, surfaces, fail) {
  const groups = surfaces.map(() => []);
  for (const triangle of body.triangles) {
    const index = surfaces.findIndex(surface => {
      const plane = planeOf(surface);
      return triangle.points.every(point => Math.abs(plane.normal.dot(point) - plane.constant) <= POSITION_EPSILON);
    });
    if (index < 0) reject(fail, 'life-items-recipe-surface', body.name, 'Every real triangle must lie on a declared finite boundary surface');
    const normal = planeOf(surfaces[index]).normal;
    groups[index].push({projected: projection(triangle.points, normal).polygon});
  }
  surfaces.forEach((surface, index) => {
    const projected = projection(surface, planeOf(surface).normal).polygon;
    validateCoverage(groups[index], [projected], fail, `scene.${body.name}`, 'life-items-recipe-coverage');
  });
}

function extrusionSurfaces(outline, holes, axis, min, max) {
  const axes = AXES.filter(value => value !== axis);
  const point = (value, level) => new THREE.Vector3().setComponent(AXES.indexOf(axis), level)
    .setComponent(AXES.indexOf(axes[0]), value[0]).setComponent(AXES.indexOf(axes[1]), value[1]);
  const contours = [outline, ...holes], flat = contours.flat();
  const caps = THREE.ShapeUtils.triangulateShape(outline.map(p => new THREE.Vector2(...p)), holes.map(hole => hole.map(p => new THREE.Vector2(...p))));
  const surfaces = [];
  // Use one coplanar region per cap triangle so matching triangles can cross
  // triangulation edges. Cap triangles are combined by the caller below.
  for (const level of [min, max]) surfaces.push(caps.map(ids => ids.map(index => point(flat[index], level))));
  for (const contour of contours) for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    surfaces.push([[point(a, min), point(b, min), point(b, max), point(a, max)]]);
  }
  return surfaces;
}

function extrusion(body, outline, holes, axis, min, max, fail) {
  const surfaces = extrusionSurfaces(outline, holes, axis, min, max), groups = surfaces.map(() => []);
  for (const triangle of body.triangles) {
    const index = surfaces.findIndex(polygons => {
      const plane = planeOf(polygons[0]);
      return triangle.points.every(point => Math.abs(plane.normal.dot(point) - plane.constant) <= POSITION_EPSILON);
    });
    if (index < 0) reject(fail, 'life-items-recipe-surface', body.name, 'Actual boundary must preserve the finite extrusion, folds and hole');
    groups[index].push({projected: projection(triangle.points, planeOf(surfaces[index][0]).normal).polygon});
  }
  surfaces.forEach((polygons, index) => validateCoverage(groups[index], polygons.map(polygon => projection(polygon, planeOf(polygons[0]).normal).polygon), fail, `scene.${body.name}`, 'life-items-recipe-coverage'));
}

const TISSUE_BOXES = {
  'life-tissue-base': [[-.08, 0, -.05], [.08, .003, .05]],
  'life-tissue-side-left': [[-.08, .003, -.05], [-.077, .072, .05]],
  'life-tissue-side-right': [[.077, .003, -.05], [.08, .072, .05]],
  'life-tissue-side-back': [[-.077, .003, -.05], [.077, .072, -.047]],
  'life-tissue-side-front': [[-.077, .003, .047], [.077, .072, .05]]
};
const NOTEBOOK_BOXES = {
  'life-notebook-cover-bottom': [[-.086, 0, -.074], [.019, .0015, .074]],
  'life-notebook-pages': [[-.0845, .0015, -.0725], [.0175, .0105, .0725]],
  'life-notebook-cover-top': [[-.086, .0105, -.074], [.019, .012, .074]],
  'life-notebook-spine': [[-.086, .0015, -.074], [-.0845, .0105, .074]]
};

function tissue(get, fail) {
  const parts = Object.entries(TISSUE_BOXES).map(([name, [min, max]]) => {
    const body = closed(get(name), fail); box(body, min, max, fail); return body;
  });
  const lid = closed(get('life-tissue-lid'), fail);
  extrusion(lid, [[-.08, -.05], [.08, -.05], [.08, .05], [-.08, .05]],
    [[[-.028, -.005], [-.028, .005], [.028, .005], [.028, -.005]]], 'y', .072, .075, fail);
  const paper = closed(get('life-tissue-paper'), fail), top = paper.bounds.max.y;
  if (top < .125 - POSITION_EPSILON || top > .135 + POSITION_EPSILON)
    reject(fail, 'life-items-paper-height', paper.name, 'The finite second input permits paper tops from .125 to .135 metres');
  const path = [[.003, 0], [.083, 0], [.106, .012], [top, -.006]];
  const outline = [...path.map(([y, z]) => [y, z - .0001]), ...[...path].reverse().map(([y, z]) => [y, z + .0001])];
  extrusion(paper, outline, [], 'x', -.026, .026, fail);
  const base = parts[0];
  if (contact(base, paper) < 1e-6) reject(fail, 'life-items-paper-contact', paper.name, 'Thin folded paper must actually rest on the inner base');
  for (const side of parts.slice(1)) if (contact(side, base) <= COVERAGE_EPSILON || contact(side, lid) <= COVERAGE_EPSILON)
    reject(fail, 'life-items-tissue-contact', side.name, 'Actual walls must connect the base and slotted lid');
  return {groundArea: ground(base, fail), paperTopY: top, actualSlot: [.056, .010], paperThickness: .0002, paperBaseContact: contact(base, paper)};
}

function penNotebook(get, fail) {
  const holder = cup(get('life-pen-holder'), true, fail), pens = [];
  for (let i = 0; i < 3; i++) {
    const pen = closed(get(`life-pen-${i + 1}`), fail), bottom = holder.floorY, length = [.12, .13, .14][i];
    const x = .055 + [-.007, 0, .007][i], z = [0, .006, 0][i];
    const heights = [bottom, bottom + .004, bottom + length - .005, bottom + length], radii = [.0007, .0025, .0025, .002];
    const ring = (level, step) => new THREE.Vector3(x + radii[level] * Math.cos(step * Math.PI / 4), heights[level], z + radii[level] * Math.sin(step * Math.PI / 4));
    const surfaces = [Array.from({length: 8}, (_, j) => ring(0, j)), Array.from({length: 8}, (_, j) => ring(3, j))];
    for (let level = 0; level < 3; level++) for (let j = 0; j < 8; j++) surfaces.push([ring(level, j), ring(level, (j + 1) % 8), ring(level + 1, (j + 1) % 8), ring(level + 1, j)]);
    boundaryCoverage(pen, surfaces, fail);
    if (contact(pen, holder.vessel) < 1e-7) reject(fail, 'life-items-pen-contact', pen.name, 'Actual closed pen tips must have positive area contact with the inner floor');
    clearPrism(holder.vessel.triangles, openingPrism(x, z, .00251, bottom + POSITION_EPSILON, holder.height + POSITION_EPSILON), fail, 'life-items-pen-wall', pen.name);
    pens.push({name: pen.name, floorContactArea: contact(pen, holder.vessel), topY: pen.bounds.max.y});
  }
  const notebook = Object.entries(NOTEBOOK_BOXES).map(([name, [min, max]]) => {
    const body = closed(get(name), fail); box(body, min, max, fail); return body;
  });
  if (contact(notebook[0], notebook[1]) <= COVERAGE_EPSILON || contact(notebook[1], notebook[2]) <= COVERAGE_EPSILON || contact(notebook[3], notebook[0]) <= COVERAGE_EPSILON || contact(notebook[3], notebook[2]) <= COVERAGE_EPSILON)
    reject(fail, 'life-items-notebook-contact', '', 'Actual notebook covers, pages and spine must contact');
  return {holderGroundArea: holder.groundArea, notebookGroundArea: ground(notebook[0], fail), pens, notebookHolderGap: holder.vessel.bounds.min.x - notebook[0].bounds.max.x};
}

export function validateSideTableLifeItemsGeometry(scene, resource, fail) {
  if (!isSideTableLifeItemsResource(resource)) return {checked: false};
  const design = resource.provenance?.sourceDesign;
  if (!['cup', 'bottle', 'tissue', 'pen-notebook'].includes(design)) reject(fail, 'life-items-design', '', 'Expected a finite life-item source design');
  const actual = readMeshes(scene, fail), used = new Set();
  const get = name => {
    const mesh = actual.meshes.find(candidate => candidate.name === name);
    if (!mesh) reject(fail, 'life-items-node', name, 'Required semantic mesh is missing');
    used.add(name); return mesh;
  };
  let details;
  if (design === 'cup') {
    const result = cup(get('life-cup-source'), false, fail);
    details = {groundArea: result.groundArea, openDepth: result.height - result.floorY, embeddedHandle: true};
  } else if (design === 'bottle') {
    const result = bottle(get('life-bottle-source'), fail);
    details = {groundArea: result.groundArea, sourceInterface: result.sourceInterface};
  } else if (design === 'tissue') details = tissue(get, fail);
  else details = penNotebook(get, fail);
  if (actual.meshes.some(mesh => !used.has(mesh.name))) reject(fail, 'life-items-extra-node', '', 'Finite life-item recipe cannot contain unverified extra geometry');
  return {checked: true, profile: 'side-table-life-items-v1', design, triangleCount: actual.triangleCount, meshCount: actual.meshes.length, materialCount: actual.materials, ...details};
}
