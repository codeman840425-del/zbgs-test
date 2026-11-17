import * as THREE from 'three';

const POSITION_EPSILON = 1e-3;
const MATRIX_EPSILON = 1e-6;
const AREA_EPSILON = 1e-7;
const NORMAL_EPSILON = 1e-6;

const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const near = (a, b, tolerance = POSITION_EPSILON) => Math.abs(a - b) <= tolerance;
const samePoint = (a, b, tolerance = POSITION_EPSILON) => a.distanceToSquared(b) <= tolerance * tolerance;
const failWith = (fail, code, path, message, details) => fail(code, path, message, details);

function identityTransform(node, path, fail) {
  if (!node || !node.isObject3D) return;
  const identityRotation = Math.abs(node.quaternion.x) <= MATRIX_EPSILON && Math.abs(node.quaternion.y) <= MATRIX_EPSILON &&
    Math.abs(node.quaternion.z) <= MATRIX_EPSILON && Math.abs(node.quaternion.w - 1) <= MATRIX_EPSILON;
  if (node.position.length() > MATRIX_EPSILON || !identityRotation ||
      Math.abs(node.scale.x - 1) > MATRIX_EPSILON || Math.abs(node.scale.y - 1) > MATRIX_EPSILON ||
      Math.abs(node.scale.z - 1) > MATRIX_EPSILON)
    failWith(fail, 'moving-part-parent-transform', path, 'Pivot parent wrappers must use identity position, rotation and scale');
}

function localToResource(scene, node) {
  return new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(node.matrixWorld);
}

function meshBounds(mesh, transform) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.count) return null;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    if (![x, y, z].every(Number.isFinite)) return null;
    bounds.expandByPoint(point.set(x, y, z).applyMatrix4(transform));
  }
  return bounds;
}

function triangles(mesh, transform) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.count || position.count < 3) return null;
  const index = mesh.geometry.getIndex();
  const count = index ? index.count : position.count;
  if (count % 3) return null;
  const points = [];
  const read = offset => index ? index.getX(offset) : offset;
  for (let triangle = 0; triangle < count / 3; triangle++) {
    const vertices = [0, 1, 2].map(offset => {
      const source = read(triangle * 3 + offset);
      return new THREE.Vector3(position.getX(source), position.getY(source), position.getZ(source)).applyMatrix4(transform);
    });
    if (vertices.some(point => ![point.x, point.y, point.z].every(Number.isFinite))) return null;
    const first = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
    const second = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
    const cross = new THREE.Vector3().crossVectors(first, second);
    const area = cross.length() * .5;
    points.push({points: vertices, normalZ: area > AREA_EPSILON ? cross.z / (2 * area) : 0, area});
  }
  return points;
}

function validatePanelFront(part, panel, pivot, path, fail) {
  const transform = new THREE.Matrix4().copy(pivot.matrixWorld).invert().multiply(panel.matrixWorld);
  const bounds = meshBounds(panel, transform);
  if (!bounds)
    failWith(fail, 'moving-part-panel-geometry', path, 'Door panel must have finite nonempty geometry');
  if (bounds.max.z - bounds.min.z < .01 - POSITION_EPSILON)
    failWith(fail, 'moving-part-panel-thickness', path, 'Door panel must have at least 0.01m actual thickness');
  const all = triangles(panel, transform);
  if (!all)
    failWith(fail, 'moving-part-panel-geometry', path, 'Door panel geometry must contain complete triangles');
  const frontZ = .015;
  const coplanar = all.filter(triangle => triangle.points.every(point => near(point.z, frontZ)));
  if (coplanar.some(triangle => triangle.normalZ < -NORMAL_EPSILON))
    failWith(fail, 'moving-part-panel-front', path, 'Door panel front contains a downward-facing triangle');
  const front = coplanar.filter(triangle => triangle.normalZ > NORMAL_EPSILON && triangle.area > AREA_EPSILON);
  if (front.length !== 2)
    failWith(fail, 'moving-part-panel-front', path, 'Door panel front must contain exactly two +Z triangles');
  const expected = [
    new THREE.Vector3(0, .1, frontZ), new THREE.Vector3(0, 1.12, frontZ),
    new THREE.Vector3(.84, 1.12, frontZ), new THREE.Vector3(.84, .1, frontZ),
  ];
  const unique = [];
  for (const point of front.flatMap(triangle => triangle.points))
    if (!unique.some(existing => samePoint(existing, point))) unique.push(point);
  if (unique.length !== 4 || unique.some(point => !expected.some(candidate => samePoint(candidate, point))))
    failWith(fail, 'moving-part-panel-front', path, 'Door panel front must use the four complete rectangle corners');
  const sets = front.map(triangle => triangle.points.map(point => unique.findIndex(candidate => samePoint(candidate, point))));
  const shared = sets[0].filter(index => sets[1].includes(index));
  if (new Set(sets.flat()).size !== 4 || shared.length !== 2)
    failWith(fail, 'moving-part-panel-front', path, 'Door panel front triangles must share one diagonal and cover all corners');
  const sharedPoints = shared.map(index => unique[index]);
  if (near(sharedPoints[0].x, sharedPoints[1].x) || near(sharedPoints[0].y, sharedPoints[1].y))
    failWith(fail, 'moving-part-panel-front', path, 'Door panel front triangles must share the rectangle diagonal, not an edge');
  const minX = Math.min(...unique.map(point => point.x)), maxX = Math.max(...unique.map(point => point.x));
  const minY = Math.min(...unique.map(point => point.y)), maxY = Math.max(...unique.map(point => point.y));
  if (minX > POSITION_EPSILON || maxX < .84 - POSITION_EPSILON || minY > .1 + POSITION_EPSILON || maxY < 1.12 - POSITION_EPSILON)
    failWith(fail, 'moving-part-panel-front', path, 'Door panel front does not cover the complete required rectangle');
  return {mesh: panel.name, frontTriangles: 2, thickness: bounds.max.z - bounds.min.z};
}

function validateDefinition(part, path, fail) {
  if (!part || typeof part !== 'object' || typeof part.id !== 'string' || !part.id)
    failWith(fail, 'invalid-moving-part', path, 'Moving part must have a nonempty id');
  if (part.kind !== 'hinge' || part.axis !== 'y')
    failWith(fail, 'unsupported-moving-part', path, 'Only hinge parts rotating around the y axis are supported');
  if (typeof part.stateField !== 'string' || !part.stateField || !finiteArray(part.pivot, 3) ||
      !finiteArray(part.rotationRange, 2) || !part.rotationRange.every(Number.isFinite))
    failWith(fail, 'invalid-moving-part', path, 'Moving part requires finite stateField, pivot and rotationRange');
  if (!part.bounds || !finiteArray(part.bounds.min, 3) || !finiteArray(part.bounds.max, 3) ||
      part.bounds.min.some((value, index) => value >= part.bounds.max[index]))
    failWith(fail, 'invalid-moving-part-bounds', `${path}.bounds`, 'Moving part bounds must contain finite min/max with positive extents');
}

/**
 * Validate real hinged-part nodes and panel geometry in a loaded resource scene.
 * @param {THREE.Object3D} scene loaded resource scene
 * @param {object} resource resource metadata containing movingParts, partNodes and partPanels
 * @param {(code:string,path:string,message:string,details?:object)=>never} fail injected error function
 */
export function validateMovingPartGeometry(scene, resource, fail) {
  if (typeof fail !== 'function') throw new TypeError('validateMovingPartGeometry requires a fail function');
  if (!scene?.isObject3D) failWith(fail, 'invalid-moving-part-scene', 'scene', 'Expected a loaded Three Object3D scene');
  if (resource?.movingParts === undefined) return {checked: false, parts: []};
  if (!Array.isArray(resource.movingParts) || resource.movingParts.length !== 1 ||
      !resource.partNodes || typeof resource.partNodes !== 'object' || Array.isArray(resource.partNodes) ||
      !resource.partPanels || typeof resource.partPanels !== 'object' || Array.isArray(resource.partPanels))
    failWith(fail, 'invalid-moving-part-contract', 'resource.movingParts', 'Hinged resources require one moving part and exact partNodes/partPanels maps');
  scene.updateMatrixWorld(true);
  const moving = resource.movingParts;
  const ids = new Set();
  for (const [index, part] of moving.entries()) {
    const path = `resource.movingParts[${index}]`;
    validateDefinition(part, path, fail);
    if (ids.has(part.id)) failWith(fail, 'duplicate-moving-part', `${path}.id`, 'Moving part ids must be unique');
    ids.add(part.id);
  }
  const mapKeys = map => Object.keys(map).sort();
  const sortedIds = [...ids].sort();
  for (const [name, map] of [['partNodes', resource.partNodes], ['partPanels', resource.partPanels]]) {
    const keys = mapKeys(map);
    if (keys.length !== sortedIds.length || keys.some((value, index) => value !== sortedIds[index]))
      failWith(fail, 'invalid-moving-part-contract', `resource.${name}`, `${name} must map every moving part exactly once`);
  }
  const all = [];
  scene.traverse(node => { if (node.isObject3D) all.push(node); });
  const parts = [];
  for (const [index, part] of moving.entries()) {
    const path = `resource.movingParts[${index}]`;
    const pivotName = resource.partNodes[part.id], panelName = resource.partPanels[part.id];
    if (typeof pivotName !== 'string' || !pivotName)
      failWith(fail, 'missing-moving-part-node', `${path}.id`, 'partNodes must name a pivot node');
    if (typeof panelName !== 'string' || !panelName)
      failWith(fail, 'missing-moving-part-panel', `${path}.id`, 'partPanels must name a panel mesh');
    const pivotMatches = all.filter(node => node.name === pivotName);
    if (pivotMatches.length !== 1 || !pivotMatches[0].isObject3D)
      failWith(fail, 'missing-moving-part-node', `${path}.id`, 'Pivot name must uniquely resolve to one actual node', {name: pivotName, matches: pivotMatches.length});
    const panelMatches = all.filter(node => node.name === panelName && node.isMesh);
    if (panelMatches.length !== 1)
      failWith(fail, 'missing-moving-part-panel', `${path}.id`, 'Panel name must uniquely resolve to one actual mesh', {name: panelName, matches: panelMatches.length});
    const pivot = pivotMatches[0], panel = panelMatches[0];
    if (pivot.isMesh)
      failWith(fail, 'invalid-moving-part-node', `${path}.id`, 'partNodes must resolve to a pivot group node, not a mesh');
    for (let parent = pivot.parent; parent && parent !== scene; parent = parent.parent)
      identityTransform(parent, `${path}.parent`, fail);
    const pivotIdentityRotation = Math.abs(pivot.quaternion.x) <= MATRIX_EPSILON && Math.abs(pivot.quaternion.y) <= MATRIX_EPSILON &&
      Math.abs(pivot.quaternion.z) <= MATRIX_EPSILON && Math.abs(pivot.quaternion.w - 1) <= MATRIX_EPSILON;
    if (!near(pivot.position.x, part.pivot[0]) || !near(pivot.position.y, part.pivot[1]) || !near(pivot.position.z, part.pivot[2]) ||
        !pivotIdentityRotation || Math.abs(pivot.scale.x - 1) > MATRIX_EPSILON ||
        Math.abs(pivot.scale.y - 1) > MATRIX_EPSILON || Math.abs(pivot.scale.z - 1) > MATRIX_EPSILON)
      failWith(fail, 'invalid-moving-part-pivot', `${path}.pivot`, 'Pivot node must match the declared resource-space pivot with identity rotation and scale');
    let isDescendant = false;
    for (let parent = panel.parent; parent; parent = parent.parent) if (parent === pivot) isDescendant = true;
    if (!isDescendant)
      failWith(fail, 'moving-part-panel-parent', `${path}.panel`, 'Door panel mesh must be a descendant of its pivot node');
    const pivotInverse = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    const bounds = new THREE.Box3().setFromArray(part.bounds.min.concat(part.bounds.max));
    const movingMeshes = [];
    pivot.traverse(node => { if (node.isMesh) movingMeshes.push(node); });
    if (!movingMeshes.length)
      failWith(fail, 'missing-moving-part-geometry', `${path}.id`, 'Pivot subtree must contain actual mesh geometry');
    for (const mesh of movingMeshes) {
      const actual = meshBounds(mesh, pivotInverse.clone().multiply(mesh.matrixWorld));
      if (!actual || actual.min.x < bounds.min.x - POSITION_EPSILON || actual.max.x > bounds.max.x + POSITION_EPSILON ||
          actual.min.y < bounds.min.y - POSITION_EPSILON || actual.max.y > bounds.max.y + POSITION_EPSILON ||
          actual.min.z < bounds.min.z - POSITION_EPSILON || actual.max.z > bounds.max.z + POSITION_EPSILON)
        failWith(fail, 'moving-part-bounds', `${path}.bounds`, 'Moving subtree geometry exceeds its declared pivot-local bounds', {mesh: mesh.name});
    }
    const panelResult = validatePanelFront(part, panelMatches[0], pivot, `${path}.panel`, fail);
    parts.push({id: part.id, pivot: pivot.name, panel: panelResult.mesh, bounds: part.bounds, panelGeometry: panelResult});
  }
  return {checked: true, parts};
}
