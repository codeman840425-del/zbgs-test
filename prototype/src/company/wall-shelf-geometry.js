import * as THREE from 'three';
import {validateSupportGeometry} from './support-geometry.js';

// This is intentionally a bounded admission check for the four static wall
// shelf recipes.  It operates on the triangles imported from the GLB.  The
// support contract remains the single source of truth for bearing patches.
const EPS = 1e-6;
const WELD = 1e-7;
const AREA_EPS = 1e-10;
const VOLUME_EPS = 1e-12;
const MAX_TRIANGLES = 2500;
const MAX_MESHES = 40;
const MAX_MATERIALS = 4;
const DESIGNS = new Set(['side-bracket', 'cantilever', 'frame', 'back-panel']);

const failAt = (fail, code, path, message, details) => fail(code, path, message, details);

function sceneMeshes(scene, fail) {
  scene.updateMatrixWorld(true);
  const inverse = scene.matrixWorld.clone().invert();
  const meshes = [];
  let triangleCount = 0;
  const materials = new Set();
  scene.traverse(node => {
    const matrix = inverse.clone().multiply(node.matrixWorld);
    if (![...matrix.elements].every(Number.isFinite) || matrix.determinant() <= 0 ||
      node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length)
      failAt(fail, 'wall-shelf-transform', node.name || 'node', 'Wall shelf geometry requires finite static orientation-preserving transforms');
    if (!node.isMesh) return;
    const positions = node.geometry?.getAttribute?.('position');
    const count = node.geometry?.getIndex?.()?.count || positions?.count || 0;
    if (!positions || positions.itemSize !== 3 || !count || count % 3 || node.geometry.morphAttributes?.position?.length)
      failAt(fail, 'wall-shelf-topology', node.name || 'mesh', 'Every wall shelf mesh must contain complete static triangles');
    triangleCount += count / 3;
    if (triangleCount > MAX_TRIANGLES || meshes.length + 1 > MAX_MESHES)
      failAt(fail, 'wall-shelf-budget', node.name || 'mesh', 'Wall shelf exceeds the fixed mesh or triangle budget', {triangleCount, meshes: meshes.length + 1});
    const assigned = Array.isArray(node.material) ? node.material : [node.material];
    if (!assigned.length || assigned.some(material => !material || material.isMeshStandardMaterial !== true || material.visible === false || material.transparent || material.opacity !== 1 || material.alphaTest > 0 ||
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'].some(key => material[key])))
      failAt(fail, 'wall-shelf-material', node.name || 'mesh', 'Wall shelf components require opaque untextured MeshStandardMaterial faces');
    for (const material of assigned) materials.add(material);
    if (materials.size > MAX_MATERIALS)
      failAt(fail, 'wall-shelf-budget', node.name || 'mesh', 'Wall shelf exceeds the four-material budget', {materials: materials.size});
    const transform = inverse.clone().multiply(node.matrixWorld);
    const triangles = [];
    const index = node.geometry.getIndex();
    const point = source => new THREE.Vector3().fromBufferAttribute(positions, source).applyMatrix4(transform);
    const read = offset => index ? index.getX(offset) : offset;
    const bounds = new THREE.Box3();
    for (let offset = 0; offset < count; offset++) {
      const p = point(read(offset));
      if (![p.x, p.y, p.z].every(Number.isFinite)) failAt(fail, 'wall-shelf-topology', node.name, 'Wall shelf vertices must be finite');
      bounds.expandByPoint(p);
    }
    for (let tri = 0; tri < count / 3; tri++) {
      const points = [0, 1, 2].map(offset => point(read(tri * 3 + offset)));
      const cross = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0]));
      const area = cross.length() / 2;
      if (area <= AREA_EPS) failAt(fail, 'wall-shelf-degenerate-face', node.name, 'Wall shelf meshes cannot contain zero-area triangles');
      triangles.push({points, area, normal: cross.normalize()});
    }
    meshes.push({node, name: node.name, triangles, bounds, transform});
  });
  return {meshes, triangleCount, materials: materials.size};
}

function signedVolume(mesh) {
  let volume = 0;
  for (const triangle of mesh.triangles) {
    const [a, b, c] = triangle.points;
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  return volume;
}

function edgeKey(point) {
  return [point.x, point.y, point.z].map(value => Math.round(value / WELD)).join(',');
}

function closedPositive(mesh, fail) {
  const edges = new Map();
  for (const triangle of mesh.triangles) for (let i = 0; i < 3; i++) {
    const a = edgeKey(triangle.points[i]), b = edgeKey(triangle.points[(i + 1) % 3]);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const entry = edges.get(key) || {count: 0, directions: []};
    entry.count++;
    entry.directions.push(a < b ? 1 : -1);
    edges.set(key, entry);
  }
  const open = [...edges].filter(([, entry]) => entry.count !== 2 || entry.directions[0] === entry.directions[1]).map(([key, entry]) => ({key, count: entry.count, directions: entry.directions}));
  if (open.length) failAt(fail, 'wall-shelf-open-or-inconsistent', mesh.name, 'Every wall shelf component must be a closed positive-thickness solid', {openEdges: open.slice(0, 4)});
  const volume = signedVolume(mesh);
  const thickness = Math.min(mesh.bounds.max.x - mesh.bounds.min.x, mesh.bounds.max.y - mesh.bounds.min.y, mesh.bounds.max.z - mesh.bounds.min.z);
  if (!(volume > VOLUME_EPS && thickness > 1e-5)) failAt(fail, 'wall-shelf-nonpositive-volume', mesh.name, 'Wall shelf components require positive enclosed volume and thickness', {volume, thickness});
  mesh.volume = volume;
}

function trianglePoint(point, triangle) {
  const [a, b, c] = triangle.points;
  const normal = triangle.normal;
  if (Math.abs(normal.dot(point.clone().sub(a))) > EPS) return false;
  const v0 = c.clone().sub(a), v1 = b.clone().sub(a), v2 = point.clone().sub(a);
  const dot00 = v0.dot(v0), dot01 = v0.dot(v1), dot02 = v0.dot(v2), dot11 = v1.dot(v1), dot12 = v1.dot(v2);
  const denominator = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denominator) < 1e-20) return false;
  const u = (dot11 * dot02 - dot01 * dot12) / denominator;
  const v = (dot00 * dot12 - dot01 * dot02) / denominator;
  return u >= -EPS && v >= -EPS && u + v <= 1 + EPS;
}

function projectedPoint(point, axis) {
  const axes = ['x', 'y', 'z'].filter(item => item !== axis);
  return [point[axes[0]], point[axes[1]]];
}

function cross2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function inTriangle2(point, triangle) {
  const values = triangle.map((_, index) => cross2(triangle[index], triangle[(index + 1) % 3], point));
  return values.every(value => value >= -EPS) || values.every(value => value <= EPS);
}
function segmentsCross(a, b, c, d) {
  const ab = cross2(a, b, c), ab2 = cross2(a, b, d), cd = cross2(c, d, a), cd2 = cross2(c, d, b);
  return ((ab >= -EPS && ab2 <= EPS) || (ab <= EPS && ab2 >= -EPS)) && ((cd >= -EPS && cd2 <= EPS) || (cd <= EPS && cd2 >= -EPS));
}
function coplanarFaceContact(a, b) {
  const dot = a.normal.dot(b.normal);
  if (Math.abs(dot + 1) > 1e-8) return false;
  const axis = ['x', 'y', 'z'].reduce((chosen, value) => Math.abs(a.normal[value]) > Math.abs(a.normal[chosen]) ? value : chosen, 'x');
  const plane = a.normal.dot(a.points[0]);
  if (b.points.some(point => Math.abs(a.normal.dot(point) - plane) > EPS)) return false;
  const orient = polygon => { let area = 0; for (let i = 0; i < polygon.length; i++) area += polygon[i][0] * polygon[(i + 1) % polygon.length][1] - polygon[(i + 1) % polygon.length][0] * polygon[i][1]; return area < 0 ? polygon.slice().reverse() : polygon; };
  const first = orient(a.points.map(point => projectedPoint(point, axis))), second = orient(b.points.map(point => projectedPoint(point, axis)));
  if (!first.some(point => inTriangle2(point, second)) && !second.some(point => inTriangle2(point, first)) &&
      ![0, 1, 2].some(i => [0, 1, 2].some(j => segmentsCross(first[i], first[(i + 1) % 3], second[j], second[(j + 1) % 3])))) return false;
  // A shared edge or point is not a structural connection.  Clip the actual
  // projected triangle and require a positive interface area.
  const clip = (subject, boundary) => {
    let polygon = subject;
    for (let i = 0; i < boundary.length && polygon.length; i++) {
      const edgeA = boundary[i], edgeB = boundary[(i + 1) % boundary.length], next = [];
      for (let j = 0; j < polygon.length; j++) {
        const start = polygon[j], end = polygon[(j + 1) % polygon.length];
        const ds = cross2(edgeA, edgeB, start), de = cross2(edgeA, edgeB, end), insideS = ds >= -EPS, insideE = de >= -EPS;
        if (insideS) next.push(start);
        if (insideS !== insideE) { const t = ds / (ds - de); next.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]); }
      }
      polygon = next;
    }
    return polygon;
  };
  const clipped = clip(first, second);
  let area = 0;
  for (let i = 1; i + 1 < clipped.length; i++) area += Math.abs(cross2(clipped[0], clipped[i], clipped[i + 1])) / 2;
  return area > 1e-8;
}

function convexBody(mesh, fail) {
  const planes = mesh.triangles.map(triangle => ({normal: triangle.normal, constant: triangle.normal.dot(triangle.points[0])}));
  for (const plane of planes) for (const point of mesh.triangles.flatMap(triangle => triangle.points))
    if (plane.normal.dot(point) > plane.constant + EPS) failAt(fail, 'wall-shelf-nonconvex', mesh.name, 'Wall shelf components must be bounded convex solids for the contact proof');
  const edges = [];
  for (const triangle of mesh.triangles) for (let i = 0; i < 3; i++) {
    const edge = triangle.points[(i + 1) % 3].clone().sub(triangle.points[i]);
    if (edge.lengthSq() && !edges.some(existing => Math.abs(existing.dot(edge) / Math.sqrt(existing.lengthSq() * edge.lengthSq())) > 1 - 1e-8)) edges.push(edge);
  }
  return {mesh, vertices: mesh.triangles.flatMap(triangle => triangle.points), planes, edges};
}
function projection(body, axis) { const values = body.vertices.map(point => point.dot(axis)); return [Math.min(...values), Math.max(...values)]; }
function convexContact(a, b) {
  const axes = [...a.planes.map(plane => plane.normal), ...b.planes.map(plane => plane.normal)];
  for (const first of a.edges) for (const second of b.edges) { const axis = new THREE.Vector3().crossVectors(first, second); if (axis.lengthSq() > 1e-16) axes.push(axis.normalize()); }
  let margin = Infinity;
  for (const axis of axes) { const [aMin, aMax] = projection(a, axis), [bMin, bMax] = projection(b, axis); margin = Math.min(margin, aMax - bMin, bMax - aMin); if (margin < -EPS) return null; }
  if (margin > EPS) return {kind: 'volume', margin};
  for (const ta of a.mesh.triangles) for (const tb of b.mesh.triangles) if (coplanarFaceContact(ta, tb)) return {kind: 'face'};
  return null;
}

function wallContact(mesh) {
  const faces = mesh.triangles.filter(triangle => triangle.points.every(point => Math.abs(point.z) <= EPS) && triangle.normal.z < -0.5);
  const area = faces.reduce((sum, triangle) => sum + triangle.area, 0);
  return {area, faces};
}

function wallFaceExtents(faces) {
  const points = faces.flatMap(triangle => triangle.points);
  if (!points.length) return null;
  return {minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)), minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y))};
}

function requireDesignParts(design, meshes, fail) {
  const names = meshes.map(mesh => mesh.name.toLowerCase());
  const boardNames = new Set(['wall-shelf-board-lower', 'wall-shelf-board-middle', 'wall-shelf-board-top']);
  const extras = names.filter(name => !boardNames.has(name));
  const has = pattern => extras.some(name => pattern.test(name));
  const okay = design === 'side-bracket' ? has(/bracket|rail|side/) :
    design === 'cantilever' ? has(/cantilever|arm|hanger/) :
    design === 'frame' ? extras.filter(name => /frame|upright|side/.test(name)).length >= 2 :
    has(/back[-_]?panel|backpanel|back[-_]?board/);
  if (!okay) failAt(fail, 'wall-shelf-structure', `resource.provenance.sourceDesign`, `The ${design} recipe is missing its real structural parts`, {meshes: extras});
}

/** Validate an actual imported static wall-shelf GLB. */
export function validateWallShelfGeometry(scene, resource, fail, path = resource?.id) {
  if (resource?.mountRole !== 'wall-shelf' && resource?.productionBranch !== 'wall-shelf') return {checked: false};
  if (typeof fail !== 'function') throw new TypeError('validateWallShelfGeometry requires a fail function');
  const reportFail = (code, location, message, details) => fail(code, path ? `${path}.${location}` : location, message, details);
  if (!scene?.isObject3D) failAt(reportFail, 'wall-shelf-scene', 'scene', 'Expected a loaded wall shelf Three Object3D scene');
  const design = resource?.provenance?.sourceDesign;
  if (!DESIGNS.has(design)) failAt(reportFail, 'wall-shelf-structure', 'resource.provenance.sourceDesign', 'Wall shelf sourceDesign must name one of the four structural recipes');
  const {meshes, triangleCount, materials} = sceneMeshes(scene, reportFail);
  if (!meshes.length) failAt(reportFail, 'wall-shelf-topology', 'scene', 'Wall shelf GLB must contain actual mesh geometry');
  const expectedBoards = ['lower', 'middle', 'top'];
  const support = validateSupportGeometry(scene, resource, reportFail);
  const byName = new Map(meshes.map(mesh => [mesh.name, mesh]));
  for (const id of expectedBoards) {
    const name = resource.supportNodes?.[id];
    const board = byName.get(name);
    if (!board) failAt(reportFail, 'wall-shelf-node', `resource.supportNodes.${id}`, 'Support node must resolve to one actual board mesh');
    closedPositive(board, reportFail);
    const surface = resource.supportSurfaces.find(item => item.id === id);
    const size = board.bounds.max.clone().sub(board.bounds.min);
    if (Math.abs(size.x - .92) > 2e-6 || Math.abs(size.y - .035) > 2e-6 || Math.abs(size.z - .31) > 2e-6 ||
      Math.abs(board.bounds.min.x + .46) > 2e-6 || Math.abs(board.bounds.max.x - .46) > 2e-6 ||
      Math.abs(board.bounds.min.y - (surface.topY - .035)) > 2e-6 || Math.abs(board.bounds.max.y - surface.topY) > 2e-6 ||
      Math.abs(board.bounds.min.z - .035) > 2e-6 || Math.abs(board.bounds.max.z - .345) > 2e-6)
      failAt(reportFail, 'wall-shelf-board-geometry', board.name, 'Actual shelf board must equal the contract .92 x .035 x .31m slab at its declared top', {min: board.bounds.min.toArray(), max: board.bounds.max.toArray(), size: size.toArray()});
  }
  for (const mesh of meshes) {
    closedPositive(mesh, reportFail);
    mesh.convex = convexBody(mesh, reportFail);
    if (mesh.bounds.min.x < -.5 - EPS || mesh.bounds.max.x > .5 + EPS || mesh.bounds.min.y < -EPS || mesh.bounds.max.y > 1.8 + EPS || mesh.bounds.min.z < -EPS || mesh.bounds.max.z > .35 + EPS)
      failAt(reportFail, 'wall-shelf-envelope', mesh.name, 'Every actual wall shelf vertex must remain inside the fixed wall mounting envelope', {min: mesh.bounds.min.toArray(), max: mesh.bounds.max.toArray()});
  }
  const wallMeshes = meshes.map(mesh => ({mesh, contact: wallContact(mesh)})).filter(entry => entry.contact.area > 1e-8);
  const wallArea = wallMeshes.reduce((sum, entry) => sum + entry.contact.area, 0);
  const extents = wallFaceExtents(wallMeshes.flatMap(entry => entry.contact.faces));
  // Rails and bars are deliberately finite.  They must span the structural
  // width and nearly the full height, while the enclosing mounting envelope
  // remains the fixed compatibility contract.
  if (wallArea < .01 || !extents || extents.minX > -.40 + EPS || extents.maxX < .40 - EPS || extents.minY > .30 + EPS || extents.maxY < 1.50 - EPS)
    failAt(reportFail, 'wall-shelf-wall-contact', 'scene', 'Wall shelf must expose real finite rear faces on z=0 across its structural width and height', {wallArea, extents});
  requireDesignParts(design, meshes, reportFail);
  const neighbors = new Map(meshes.map(mesh => [mesh, []]));
  const connections = [];
  for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) {
    const contact = convexContact(meshes[i].convex, meshes[j].convex);
    if (contact) { neighbors.get(meshes[i]).push(meshes[j]); neighbors.get(meshes[j]).push(meshes[i]); connections.push({a: meshes[i].name, b: meshes[j].name, ...contact}); }
  }
  const seeds = wallMeshes.map(entry => entry.mesh);
  const reached = new Set(seeds), queue = [...seeds];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors.get(queue[cursor])) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  const detached = meshes.filter(mesh => !reached.has(mesh)).map(mesh => mesh.name);
  if (detached.length) failAt(reportFail, 'wall-shelf-detached-component', 'scene', 'Every actual board and support must connect to a real wall-contact solid', {detached});
  return {checked: true, wallMounted: true, sourceDesign: design, meshCount: meshes.length, triangleCount, materials, wallArea, wallExtents: extents, support, connections,
    components: meshes.map(mesh => ({name: mesh.name, volume: mesh.volume})), tolerances: {positionMetres: EPS, weldMetres: WELD, volumeCubicMetres: VOLUME_EPS},
    limitation: 'CPU triangle admission proves static wall contact, closed solids, support patches and structural connectivity. It does not prove anchor strength, runtime save/reopen, ordinary-computer performance or human visual acceptance.'};
}

