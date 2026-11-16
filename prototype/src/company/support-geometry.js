import * as THREE from 'three';

// Support geometry is deliberately a small, rectangular contract.  It checks
// the imported triangles in the resource's own scene space and does not claim
// to be a collision or general rigid-body simulation.
const EPSILON = 1e-3;
const AREA_EPSILON = 1e-7;
const NORMAL_EPSILON = 1e-6;

const isFiniteVector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const near = (a, b, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;
const samePoint = (a, b, tolerance = EPSILON) => a.distanceToSquared(b) <= tolerance * tolerance;

function failWith(fail, code, path, message, details) {
  // The loader supplies its CompanyError-producing fail function. Keeping the
  // dependency injected also makes this validator usable by CPU fixtures.
  return fail(code, path, message, details);
}

function validateSurfaceDefinition(surface, path, fail) {
  const fields = Object.keys(surface || {}).sort();
  const expected = ['center', 'clearanceHeight', 'halfSize', 'id', 'topY'];
  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index]))
    failWith(fail, 'invalid-support-surface', path, 'Support surface must contain only id, center, topY, halfSize and clearanceHeight');
  if (typeof surface.id !== 'string' || !surface.id)
    failWith(fail, 'invalid-support-surface', `${path}.id`, 'Support surface id must be nonempty text');
  if (!isFiniteVector(surface.center, 2))
    failWith(fail, 'invalid-support-surface', `${path}.center`, 'Support surface center must contain two finite coordinates');
  if (!Number.isFinite(surface.topY))
    failWith(fail, 'invalid-support-surface', `${path}.topY`, 'Support surface topY must be finite');
  if (!isFiniteVector(surface.halfSize, 2) || surface.halfSize.some(value => value <= 0))
    failWith(fail, 'invalid-support-surface', `${path}.halfSize`, 'Support surface halfSize must contain two positive finite values');
  if (!Number.isFinite(surface.clearanceHeight) || surface.clearanceHeight <= 0)
    failWith(fail, 'invalid-support-surface', `${path}.clearanceHeight`, 'Support surface clearanceHeight must be a positive finite value');
}

function matrixToSceneSpace(scene, node) {
  const inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  return inverse.multiply(node.matrixWorld);
}

function triangleVertices(geometry, index) {
  const positions = geometry.getAttribute('position');
  const indexed = geometry.getIndex();
  const readIndex = offset => indexed ? indexed.getX(offset) : offset;
  return [0, 1, 2].map(offset => {
    const source = readIndex(index * 3 + offset);
    return new THREE.Vector3(positions.getX(source), positions.getY(source), positions.getZ(source));
  });
}

function transformedTriangles(node, scene) {
  const geometry = node.geometry;
  const positions = geometry?.getAttribute?.('position');
  if (!positions?.count || positions.count < 3)
    return null;
  const indexed = geometry.getIndex();
  const elementCount = indexed ? indexed.count : positions.count;
  if (elementCount % 3) return null;
  const triangleCount = elementCount / 3;
  if (!triangleCount)
    return null;
  const transform = matrixToSceneSpace(scene, node);
  const triangles = [];
  for (let index = 0; index < triangleCount; index++) {
    const points = triangleVertices(geometry, index).map(point => point.applyMatrix4(transform));
    const edgeA = new THREE.Vector3().subVectors(points[1], points[0]);
    const edgeB = new THREE.Vector3().subVectors(points[2], points[0]);
    const cross = new THREE.Vector3().crossVectors(edgeA, edgeB);
    const area = cross.length() * 0.5;
    triangles.push({points, normalY: area > AREA_EPSILON ? cross.y / (2 * area) : 0, area});
  }
  return triangles;
}

function verifyTop(surface, node, scene, path, fail) {
  const triangles = transformedTriangles(node, scene);
  if (!triangles)
    failWith(fail, 'invalid-support-topology', path, 'Support node must contain nonempty triangle geometry');
  const coplanar = triangles.filter(triangle => triangle.points.every(point => near(point.y, surface.topY)));
  if (coplanar.some(triangle => triangle.normalY < -NORMAL_EPSILON))
    failWith(fail, 'inward-support-top', path, 'Support top contains a downward-facing triangle');
  const upward = coplanar.filter(triangle => triangle.normalY > NORMAL_EPSILON && triangle.area > AREA_EPSILON);
  if (upward.length !== 2)
    failWith(fail, 'invalid-support-topology', path, 'Support top must be exactly two upward coplanar triangles');
  // The physical board may be wider than the usable patch (the production
  // shelves are 0.92 x 0.31m around a 0.84 x 0.26m patch). Infer its four
  // corners from the actual triangles, then require the declared patch to fit
  // fully inside that rectangle.
  const points = upward.flatMap(triangle => triangle.points);
  const unique = [];
  for (const point of points) if (!unique.some(existing => samePoint(existing, point))) unique.push(point);
  if (unique.length !== 4)
    failWith(fail, 'invalid-support-topology', path, 'Support top triangles must use four corners of one rectangle');
  const minX = Math.min(...unique.map(point => point.x)), maxX = Math.max(...unique.map(point => point.x));
  const minZ = Math.min(...unique.map(point => point.z)), maxZ = Math.max(...unique.map(point => point.z));
  if (unique.some(point => !(near(point.x, minX) || near(point.x, maxX)) || !(near(point.z, minZ) || near(point.z, maxZ))))
    failWith(fail, 'invalid-support-topology', path, 'Support top triangles must be axis-aligned rectangle corners');
  const cornerIndex = point => unique.findIndex(expected => samePoint(expected, point));
  const sets = upward.map(triangle => triangle.points.map(cornerIndex));
  if (sets.some(set => set.some(index => index < 0) || new Set(set).size !== 3))
    failWith(fail, 'invalid-support-topology', path, 'Support top triangles must use the four actual rectangle corners');
  const union = new Set(sets.flat());
  const shared = sets[0].filter(index => sets[1].includes(index));
  if (union.size !== 4 || shared.length !== 2)
    failWith(fail, 'invalid-support-topology', path, 'Support top triangles must share one diagonal and cover all four corners');
  const sharedPoints = shared.map(index => unique[index]);
  if (sharedPoints.length !== 2 || near(sharedPoints[0].x, sharedPoints[1].x) || near(sharedPoints[0].z, sharedPoints[1].z))
    failWith(fail, 'invalid-support-topology', path, 'Support top triangles must share the rectangle diagonal, not an edge');
  const [patchX, patchZ] = surface.center;
  const [patchHalfX, patchHalfZ] = surface.halfSize;
  if (patchX - patchHalfX < minX - EPSILON || patchX + patchHalfX > maxX + EPSILON ||
      patchZ - patchHalfZ < minZ - EPSILON || patchZ + patchHalfZ > maxZ + EPSILON)
    failWith(fail, 'invalid-support-topology', path, 'Actual support top does not cover the declared rectangular patch');
  const expectedArea = surface.halfSize[0] * surface.halfSize[1] * 4;
  const actualArea = upward[0].area + upward[1].area;
  if (actualArea + 2e-5 < expectedArea)
    failWith(fail, 'invalid-support-topology', path, 'Support top triangles do not cover the declared rectangle');
  return {mesh: node.name, triangles: 2, area: actualArea, topY: surface.topY};
}

function meshBoundsInScene(node, scene) {
  const geometry = node.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position?.count) return null;
  const transform = matrixToSceneSpace(scene, node);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.set(position.getX(index), position.getY(index), position.getZ(index)).applyMatrix4(transform);
    box.expandByPoint(point);
  }
  return box;
}

function overlaps(aMin, aMax, bMin, bMax, tolerance = EPSILON) {
  return aMin < bMax - tolerance && aMax > bMin + tolerance;
}

function checkClearance(surface, supportNode, meshes, scene, path, fail) {
  const [cx, cz] = surface.center;
  const [hx, hz] = surface.halfSize;
  const min = {x: cx - hx, z: cz - hz, y: surface.topY};
  const max = {x: cx + hx, z: cz + hz, y: surface.topY + surface.clearanceHeight};
  for (const mesh of meshes) {
    if (mesh === supportNode) continue;
    const box = meshBoundsInScene(mesh, scene);
    if (!box) continue;
    if (overlaps(box.min.x, box.max.x, min.x, max.x) &&
        overlaps(box.min.z, box.max.z, min.z, max.z) &&
        overlaps(box.min.y, box.max.y, min.y, max.y))
      failWith(fail, 'support-clearance-occupied', path, 'Another mesh enters the declared support clearance prism', {mesh: mesh.name});
  }
}

function requiresGroundContact(resource) {
  return resource.mount === 'support-surface' ||
    (Array.isArray(resource.supportSurfaces) && resource.supportSurfaces.length > 0 &&
      resource.footprint?.blocking === true && !['wall', 'portal'].includes(resource.mount));
}

function groundContact(scene, meshes, path, fail) {
  const sceneBox = new THREE.Box3();
  for (const mesh of meshes) {
    const box = meshBoundsInScene(mesh, scene);
    if (box) sceneBox.union(box);
  }
  const bottomY = sceneBox.min.y;
  if (!Number.isFinite(bottomY) || !near(bottomY, 0))
    failWith(fail, 'support-mount-ground-contact', path, 'Support resource geometry must touch the installation plane at y=0 within 1mm', {bottomY});
  return bottomY;
}

/**
 * Validate supportSurfaces/supportNodes against actual loaded mesh triangles.
 *
 * @param {THREE.Object3D} scene loaded resource scene, with world matrices refreshed
 * @param {object} resource resource metadata containing the support contract
 * @param {(code:string,path:string,message:string,details?:object)=>never} fail injected CompanyError factory
 * @returns {{checked:boolean, surfaces:Array, bottomY?:number}}
 */
export function validateSupportGeometry(scene, resource, fail) {
  if (!scene?.isObject3D) failWith(fail, 'invalid-support-scene', 'scene', 'Expected a loaded Three Object3D scene');
  if (typeof fail !== 'function') throw new TypeError('validateSupportGeometry requires a fail function');
  const hasSurfaces = resource?.supportSurfaces !== undefined;
  const hasNodes = resource?.supportNodes !== undefined;
  if (!hasSurfaces && !hasNodes) {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse(node => { if (node.isMesh) meshes.push(node); });
    return requiresGroundContact(resource || {})
      ? {checked: false, surfaces: [], bottomY: groundContact(scene, meshes, 'resource', fail)}
      : {checked: false, surfaces: []};
  }
  if (!Array.isArray(resource.supportSurfaces) || !resource.supportSurfaces.length)
    failWith(fail, 'invalid-support-contract', 'resource.supportSurfaces', 'Resources with support geometry require a nonempty supportSurfaces array');
  if (!resource.supportNodes || typeof resource.supportNodes !== 'object' || Array.isArray(resource.supportNodes))
    failWith(fail, 'invalid-support-contract', 'resource.supportNodes', 'Resources with support geometry require a surfaceId to mesh-name map');
  scene.updateMatrixWorld(true);
  const surfaces = resource.supportSurfaces;
  const ids = new Set();
  for (const [index, surface] of surfaces.entries()) {
    const path = `resource.supportSurfaces[${index}]`;
    validateSurfaceDefinition(surface, path, fail);
    if (ids.has(surface.id)) failWith(fail, 'duplicate-support-surface', `${path}.id`, 'Support surface ids must be unique');
    ids.add(surface.id);
  }
  const nodeKeys = Object.keys(resource.supportNodes).sort();
  const idKeys = [...ids].sort();
  if (nodeKeys.length !== idKeys.length || nodeKeys.some((value, index) => value !== idKeys[index]))
    failWith(fail, 'invalid-support-nodes', 'resource.supportNodes', 'supportNodes must map every support surface exactly once');
  const meshes = [];
  scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  const used = new Set();
  const checked = [];
  for (const [index, surface] of surfaces.entries()) {
    const path = `resource.supportSurfaces[${index}]`;
    const name = resource.supportNodes[surface.id];
    if (typeof name !== 'string' || !name)
      failWith(fail, 'missing-support-node', `${path}.id`, 'supportNodes must name an actual support mesh');
    const matches = meshes.filter(mesh => mesh.name === name);
    if (matches.length !== 1)
      failWith(fail, 'missing-support-node', `${path}.id`, 'Support node name must uniquely resolve to one actual mesh', {name, matches: matches.length});
    const node = matches[0];
    if (used.has(node)) failWith(fail, 'duplicate-support-node', `${path}.id`, 'Each support surface must map to a different mesh');
    used.add(node);
    checked.push(verifyTop(surface, node, scene, `${path}.supportNodes`, fail));
    const supportBounds = meshBoundsInScene(node, scene);
    if (supportBounds.max.y > surface.topY + EPSILON)
      failWith(fail, 'support-clearance-occupied', `${path}.supportNodes`, 'Support mesh geometry rises into its own declared clearance prism', {mesh: node.name, maxY: supportBounds.max.y});
    checkClearance(surface, node, meshes, scene, `${path}.clearanceHeight`, fail);
  }
  const bottomY = requiresGroundContact(resource)
    ? groundContact(scene, meshes, 'resource.supportSurfaces', fail) : undefined;
  return {checked: true, surfaces: checked, ...(bottomY === undefined ? {} : {bottomY})};
}
