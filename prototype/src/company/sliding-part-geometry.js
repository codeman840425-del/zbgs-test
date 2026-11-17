import * as THREE from 'three';

const EPSILON = 1e-3;
const AREA_EPSILON = 1e-7;
const NORMAL_EPSILON = 1e-6;

const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const near = (a, b, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;
const samePoint = (a, b, tolerance = EPSILON) => a.distanceToSquared(b) <= tolerance * tolerance;
const failWith = (fail, code, path, message, details) => fail(code, path, message, details);

function identity(node, path, fail) {
  const q = node.quaternion;
  if (node.position.length() > 1e-6 || Math.abs(q.x) > 1e-6 || Math.abs(q.y) > 1e-6 ||
      Math.abs(q.z) > 1e-6 || Math.abs(q.w - 1) > 1e-6 ||
      Math.abs(node.scale.x - 1) > 1e-6 || Math.abs(node.scale.y - 1) > 1e-6 || Math.abs(node.scale.z - 1) > 1e-6)
    failWith(fail, 'sliding-part-parent-transform', path, 'Active group parent wrappers must have identity transforms');
}

function boundsOf(mesh, transform) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.count) return null;
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    if (![x, y, z].every(Number.isFinite)) return null;
    bounds.expandByPoint(point.set(x, y, z).applyMatrix4(transform));
  }
  return bounds;
}

function trianglesOf(mesh, transform) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.count || position.count < 3) return null;
  const index = mesh.geometry.getIndex(), count = index ? index.count : position.count;
  if (count % 3) return null;
  const read = offset => index ? index.getX(offset) : offset, triangles = [];
  for (let triangle = 0; triangle < count / 3; triangle++) {
    const points = [0, 1, 2].map(offset => {
      const source = read(triangle * 3 + offset);
      return new THREE.Vector3(position.getX(source), position.getY(source), position.getZ(source)).applyMatrix4(transform);
    });
    if (points.some(point => ![point.x, point.y, point.z].every(Number.isFinite))) return null;
    const first = new THREE.Vector3().subVectors(points[1], points[0]);
    const second = new THREE.Vector3().subVectors(points[2], points[0]);
    const cross = new THREE.Vector3().crossVectors(first, second), area = cross.length() * .5;
    triangles.push({points, normal: cross.clone().normalize(), area});
  }
  return triangles;
}

function requireRectangle(mesh, transform, plane, expectedCorners, planeAxis, normalAxis, normalSign, path, fail) {
  const triangles = trianglesOf(mesh, transform);
  if (!triangles) failWith(fail, 'sliding-part-geometry', path, 'Required tray mesh must contain finite complete triangle geometry');
  const coplanar = triangles.filter(triangle => triangle.points.every(point => near(point[planeAxis], plane)));
  const positive = coplanar.filter(triangle => triangle.normal[normalAxis] * normalSign > NORMAL_EPSILON && triangle.area > AREA_EPSILON);
  const negative = coplanar.some(triangle => triangle.normal[normalAxis] * normalSign < -NORMAL_EPSILON);
  if (negative) failWith(fail, 'sliding-part-surface', path, 'Required surface contains an inward-facing triangle');
  if (positive.length !== 2) failWith(fail, 'sliding-part-surface', path, 'Required surface must contain exactly two outward-facing triangles');
  const unique = [];
  for (const point of positive.flatMap(triangle => triangle.points))
    if (!unique.some(existing => samePoint(existing, point))) unique.push(point);
  if (unique.length !== 4 || unique.some(point => !expectedCorners.some(expected => samePoint(expected, point))))
    failWith(fail, 'sliding-part-surface', path, 'Required surface must use all four declared rectangle corners');
  const sets = positive.map(triangle => triangle.points.map(point => unique.findIndex(expected => samePoint(expected, point))));
  const shared = sets[0].filter(index => sets[1].includes(index));
  if (new Set(sets.flat()).size !== 4 || shared.length !== 2)
    failWith(fail, 'sliding-part-surface', path, 'Required surface triangles must cover one complete rectangle');
  const sharedPoints = shared.map(index => unique[index]);
  const planeCoordinates = planeAxis === 'y' ? ['x', 'z'] : planeAxis === 'x' ? ['y', 'z'] : ['x', 'y'];
  const diagonal = !near(sharedPoints[0][planeCoordinates[0]], sharedPoints[1][planeCoordinates[0]]) &&
    !near(sharedPoints[0][planeCoordinates[1]], sharedPoints[1][planeCoordinates[1]]);
  if (!diagonal) failWith(fail, 'sliding-part-surface', path, 'Required surface triangles must share the rectangle diagonal, not an edge');
}

function mapNames(resource, ids, fail) {
  const nodes = resource.partNodes, panels = resource.partPanels, trays = resource.partTrays;
  if (!nodes || !panels || !trays || typeof nodes !== 'object' || typeof panels !== 'object' || typeof trays !== 'object' ||
      Array.isArray(nodes) || Array.isArray(panels) || Array.isArray(trays))
    failWith(fail, 'invalid-sliding-part-contract', 'resource', 'Sliding resources require partNodes, partPanels and partTrays maps');
  const sorted = [...ids].sort();
  for (const [field, map] of [['partNodes', nodes], ['partPanels', panels], ['partTrays', trays]]) {
    const keys = Object.keys(map).sort();
    if (keys.length !== sorted.length || keys.some((value, index) => value !== sorted[index]))
      failWith(fail, 'invalid-sliding-part-contract', `resource.${field}`, `${field} must map every sliding part exactly once`);
  }
  const tray = trays[sorted[0]];
  if (!tray || typeof tray !== 'object' || Array.isArray(tray) || Object.keys(tray).sort().join(',') !== 'back,bottom,left,right')
    failWith(fail, 'invalid-sliding-part-contract', 'resource.partTrays', 'Each partTray must map bottom, left, right and back meshes exactly');
  return {nodes, panels, tray};
}

function contacts(a, b) {
  const overlap = (minA, maxA, minB, maxB) => minA <= maxB + EPSILON && maxA >= minB - EPSILON;
  const touching = (minA, maxA, minB, maxB) => minA <= maxB + EPSILON && maxA >= minB - EPSILON &&
    (near(maxA, minB) || near(maxB, minA) || (minA < maxB && maxA > minB));
  return (touching(a.min.x, a.max.x, b.min.x, b.max.x) && overlap(a.min.y, a.max.y, b.min.y, b.max.y) && overlap(a.min.z, a.max.z, b.min.z, b.max.z)) ||
    (touching(a.min.y, a.max.y, b.min.y, b.max.y) && overlap(a.min.x, a.max.x, b.min.x, b.max.x) && overlap(a.min.z, a.max.z, b.min.z, b.max.z)) ||
    (touching(a.min.z, a.max.z, b.min.z, b.max.z) && overlap(a.min.x, a.max.x, b.min.x, b.max.x) && overlap(a.min.y, a.max.y, b.min.y, b.max.y));
}

function intersectsInterior(box, interior) {
  return box.min.x < interior.max.x - EPSILON && box.max.x > interior.min.x + EPSILON &&
    box.min.y < interior.max.y - EPSILON && box.max.y > interior.min.y + EPSILON &&
    box.min.z < interior.max.z - EPSILON && box.max.z > interior.min.z + EPSILON;
}

/** Validate one real sliding tray hierarchy. Non-slide resources are ignored. */
export function validateSlidingPartGeometry(scene, resource, fail) {
  if (typeof fail !== 'function') throw new TypeError('validateSlidingPartGeometry requires a fail function');
  if (!scene?.isObject3D) failWith(fail, 'invalid-sliding-part-scene', 'scene', 'Expected a loaded Three Object3D scene');
  const parts = resource?.movingParts;
  if (!Array.isArray(parts) || !parts.some(part => part?.kind === 'slide')) return {checked: false, parts: []};
  if (parts.length !== 1) failWith(fail, 'invalid-sliding-part-contract', 'resource.movingParts', 'This contract validates one sliding drawer part');
  const part = parts[0];
  if (part.kind !== 'slide' || part.axis !== 'z' || !finiteArray(part.pivot, 3) ||
      !finiteArray(part.translationRange, 2) || part.translationRange[0] !== 0 || part.translationRange[1] !== .32 ||
      !part.bounds || !finiteArray(part.bounds.min, 3) || !finiteArray(part.bounds.max, 3))
    failWith(fail, 'invalid-sliding-part-contract', 'resource.movingParts[0]', 'Sliding drawer requires the fixed z-axis translation and bounds contract');
  if (part.pivot.some(value => Math.abs(value) > EPSILON) || part.bounds.min.some((value, index) => value >= part.bounds.max[index]))
    failWith(fail, 'invalid-sliding-part-contract', 'resource.movingParts[0]', 'Sliding drawer pivot and bounds are invalid');
  const {nodes, panels, tray} = mapNames(resource, new Set([part.id]), fail);
  scene.updateMatrixWorld(true);
  const all = [];
  scene.traverse(node => { if (node.isObject3D) all.push(node); });
  const pivotMatches = all.filter(node => node.name === nodes[part.id]);
  if (pivotMatches.length !== 1 || pivotMatches[0].isMesh)
    failWith(fail, 'missing-sliding-part-node', 'resource.partNodes', 'Sliding group name must uniquely resolve to a non-mesh node');
  const panelName = panels[part.id], trayNames = [tray.bottom, tray.left, tray.right, tray.back];
  const names = [panelName, ...trayNames];
  if (names.some(name => typeof name !== 'string' || !name) || new Set(names).size !== names.length)
    failWith(fail, 'invalid-sliding-part-contract', 'resource.partPanels', 'Panel and tray component names must be distinct nonempty strings');
  const meshes = names.map(name => {
    const matches = all.filter(node => node.name === name && node.isMesh);
    if (matches.length !== 1) failWith(fail, 'missing-sliding-part-mesh', 'resource.partPanels', 'Each mapped tray component must uniquely resolve to one mesh', {name, matches: matches.length});
    return matches[0];
  });
  const pivot = pivotMatches[0];
  for (let parent = pivot.parent; parent && parent !== scene; parent = parent.parent) identity(parent, 'resource.partNodes.parent', fail);
  if (!near(pivot.position.x, part.pivot[0]) || !near(pivot.position.y, part.pivot[1]) || !near(pivot.position.z, part.pivot[2]))
    failWith(fail, 'invalid-sliding-part-pivot', 'resource.movingParts[0].pivot', 'Sliding group position must equal the declared closed pivot');
  identity(pivot, 'resource.partNodes', fail);
  const descendant = mesh => { for (let parent = mesh.parent; parent; parent = parent.parent) if (parent === pivot) return true; return false; };
  if (meshes.some(mesh => !descendant(mesh))) failWith(fail, 'sliding-part-parent', 'resource.partPanels', 'All tray components must be descendants of the sliding group');
  const pivotInverse = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const actualMeshes = [];
  pivot.traverse(node => { if (node.isMesh) actualMeshes.push(node); });
  const declaredBounds = new THREE.Box3().setFromArray(part.bounds.min.concat(part.bounds.max));
  const localBoxes = new Map();
  for (const mesh of actualMeshes) {
    const box = boundsOf(mesh, pivotInverse.clone().multiply(mesh.matrixWorld));
    if (!box || box.min.x < declaredBounds.min.x - EPSILON || box.max.x > declaredBounds.max.x + EPSILON ||
        box.min.y < declaredBounds.min.y - EPSILON || box.max.y > declaredBounds.max.y + EPSILON ||
        box.min.z < declaredBounds.min.z - EPSILON || box.max.z > declaredBounds.max.z + EPSILON)
      failWith(fail, 'sliding-part-bounds', 'resource.movingParts[0].bounds', 'Every active tray mesh must stay inside the declared pivot-local bounds', {mesh: mesh.name});
    localBoxes.set(mesh, box);
  }
  const panel = meshes[0], bottom = meshes[1], left = meshes[2], right = meshes[3], back = meshes[4];
  const panelTransform = pivotInverse.clone().multiply(panel.matrixWorld);
  const panelBox = localBoxes.get(panel);
  if (panelBox.max.z - panelBox.min.z < .01 - EPSILON)
    failWith(fail, 'sliding-part-thickness', 'resource.partPanels', 'Drawer front must have actual thickness of at least 0.01m');
  requireRectangle(panel, panelTransform, .2625, [new THREE.Vector3(-.42, .78, .2625), new THREE.Vector3(-.42, 1.12, .2625), new THREE.Vector3(.42, 1.12, .2625), new THREE.Vector3(.42, .78, .2625)], 'z', 'z', 1, 'resource.partPanels', fail);
  const bottomTransform = pivotInverse.clone().multiply(bottom.matrixWorld), bottomBox = localBoxes.get(bottom);
  if (bottomBox.max.y - bottomBox.min.y < .01 - EPSILON)
    failWith(fail, 'sliding-part-thickness', 'resource.partTrays.bottom', 'Drawer bottom must have actual thickness of at least 0.01m');
  requireRectangle(bottom, bottomTransform, .805, [new THREE.Vector3(-.38, .805, -.19), new THREE.Vector3(-.38, .805, .2275), new THREE.Vector3(.38, .805, .2275), new THREE.Vector3(.38, .805, -.19)], 'y', 'y', 1, 'resource.partTrays.bottom', fail);
  const expected = {
    left: [-.38, .805, -.19, -.355, 1.055, .2275], right: [.355, .805, -.19, .38, 1.055, .2275], back: [-.355, .805, -.19, .355, 1.055, -.165],
  };
  const wallPlanes = {left: [-.355, 'x', 1], right: [.355, 'x', -1], back: [-.165, 'z', 1]};
  const wallCorners = {
    left: [new THREE.Vector3(-.355, .805, -.19), new THREE.Vector3(-.355, 1.055, -.19), new THREE.Vector3(-.355, 1.055, .2275), new THREE.Vector3(-.355, .805, .2275)],
    right: [new THREE.Vector3(.355, .805, -.19), new THREE.Vector3(.355, 1.055, -.19), new THREE.Vector3(.355, 1.055, .2275), new THREE.Vector3(.355, .805, .2275)],
    back: [new THREE.Vector3(-.355, .805, -.165), new THREE.Vector3(.355, .805, -.165), new THREE.Vector3(.355, 1.055, -.165), new THREE.Vector3(-.355, 1.055, -.165)],
  };
  for (const [name, mesh] of [['left', left], ['right', right], ['back', back]]) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = expected[name], box = localBoxes.get(mesh);
    if (![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite) ||
        Math.abs(box.min.x - minX) > EPSILON || Math.abs(box.min.y - minY) > EPSILON || Math.abs(box.min.z - minZ) > EPSILON ||
        Math.abs(box.max.x - maxX) > EPSILON || Math.abs(box.max.y - maxY) > EPSILON || Math.abs(box.max.z - maxZ) > EPSILON)
      failWith(fail, 'sliding-part-wall-geometry', `resource.partTrays.${name}`, 'Tray wall must match its fixed solid placement envelope');
    const thickness = name === 'back' ? box.max.z - box.min.z : box.max.x - box.min.x;
    if (thickness < .01 - EPSILON) failWith(fail, 'sliding-part-thickness', `resource.partTrays.${name}`, 'Tray wall must have actual thickness of at least 0.01m');
    requireRectangle(mesh, pivotInverse.clone().multiply(mesh.matrixWorld), wallPlanes[name][0], wallCorners[name], wallPlanes[name][1], wallPlanes[name][1], wallPlanes[name][2], `resource.partTrays.${name}`, fail);
  }
  const componentBoxes = {front: localBoxes.get(panel), bottom: bottomBox, left: localBoxes.get(left), right: localBoxes.get(right), back: localBoxes.get(back)};
  const links = {front: ['bottom', 'left', 'right'], bottom: ['front', 'left', 'right', 'back'], left: ['bottom', 'back'], right: ['bottom', 'back'], back: ['bottom', 'left', 'right']};
  for (const [name, neighbors] of Object.entries(links)) if (!neighbors.some(other => contacts(componentBoxes[name], componentBoxes[other])))
    failWith(fail, 'sliding-part-disconnected', `resource.partTrays.${name}`, 'Tray component must physically contact its required neighboring wall');
  const interior = new THREE.Box3(new THREE.Vector3(-.355, .805, -.165), new THREE.Vector3(.355, 1.055, .2275));
  for (const mesh of actualMeshes) {
    const box = localBoxes.get(mesh);
    if (intersectsInterior(box, interior)) failWith(fail, 'sliding-part-cavity-occupied', 'resource.partTrays', 'Active tray geometry intrudes into the declared interior clearance', {mesh: mesh.name});
  }
  const staticMeshes = [];
  scene.traverse(node => { if (node.isMesh && !descendant(node)) staticMeshes.push(node); });
  for (const mesh of staticMeshes) {
    const box = boundsOf(mesh, new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(mesh.matrixWorld));
    if (!box) continue;
    if (intersectsInterior(box, interior)) failWith(fail, 'sliding-static-cavity-occupied', 'resource', 'Static geometry intrudes into the receiving cavity');
    for (const active of localBoxes.values()) {
      const swept = new THREE.Box3(new THREE.Vector3(active.min.x, active.min.y, active.min.z), new THREE.Vector3(active.max.x, active.max.y, active.max.z + .32));
      if (swept.min.x < box.max.x - EPSILON && swept.max.x > box.min.x + EPSILON && swept.min.y < box.max.y - EPSILON && swept.max.y > box.min.y + EPSILON && swept.min.z < box.max.z - EPSILON && swept.max.z > box.min.z + EPSILON)
        failWith(fail, 'sliding-static-sweep-occupied', 'resource', 'Static geometry intersects the tray translation envelope', {mesh: mesh.name});
    }
  }
  return {checked: true, parts: [{id: part.id, group: pivot.name, panel: panel.name, tray: {bottom: bottom.name, left: left.name, right: right.name, back: back.name}, cavity: interior} ]};
}
