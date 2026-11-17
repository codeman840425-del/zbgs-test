import * as THREE from 'three';

const EPSILON = 1e-3;
const near = (a, b, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;
const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const failWith = (fail, code, path, message, details) => fail(code, path, message, details);

function identity(node, path, fail) {
  const q = node.quaternion;
  if (node.position.length() > 1e-6 || Math.abs(q.x) > 1e-6 || Math.abs(q.y) > 1e-6 ||
      Math.abs(q.z) > 1e-6 || Math.abs(q.w - 1) > 1e-6 || Math.abs(node.scale.x - 1) > 1e-6 ||
      Math.abs(node.scale.y - 1) > 1e-6 || Math.abs(node.scale.z - 1) > 1e-6)
    failWith(fail, 'clock-parent-transform', path, 'Clock resource parent wrappers must have identity transforms');
}

function localBounds(mesh, transform) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.count) return null;
  const box = new THREE.Box3(), point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    if (![x, y, z].every(Number.isFinite)) return null;
    box.expandByPoint(point.set(x, y, z).applyMatrix4(transform));
  }
  return box;
}

function frontFace(mesh, transform, path, fail) {
  const position = mesh.geometry?.getAttribute?.('position'), index = mesh.geometry?.getIndex();
  if (!position?.count || (index ? index.count : position.count) % 3) failWith(fail, 'clock-display-geometry', path, 'Display mesh must contain finite complete triangles');
  const count = index ? index.count : position.count, read = offset => index ? index.getX(offset) : offset;
  let positive = 0;
  for (let offset = 0; offset < count; offset += 3) {
    const points = [0, 1, 2].map(step => {
      const source = read(offset + step);
      return new THREE.Vector3(position.getX(source), position.getY(source), position.getZ(source)).applyMatrix4(transform);
    });
    if (points.some(point => ![point.x, point.y, point.z].every(Number.isFinite))) failWith(fail, 'clock-display-geometry', path, 'Display mesh vertices must be finite');
    const cross = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(points[1], points[0]), new THREE.Vector3().subVectors(points[2], points[0]));
    if (cross.z > 1e-7) positive++;
  }
  if (positive < 1) failWith(fail, 'clock-display-front', path, 'Display mesh must expose a +Z front face');
}

function resolveNamed(scene, name, mesh, path, fail) {
  if (typeof name !== 'string' || !name) failWith(fail, 'clock-mapping', path, 'Clock mapping names must be nonempty strings');
  const matches = [];
  scene.traverse(node => { if (node.name === name && (!mesh || node.isMesh)) matches.push(node); });
  if (matches.length !== 1) failWith(fail, mesh ? 'clock-display-node' : 'clock-pivot-node', path, 'Clock mapping must uniquely resolve to the requested actual node', {name, matches: matches.length});
  return matches[0];
}

function validateAncestors(node, scene, path, fail) {
  for (let parent = node.parent; parent && parent !== scene; parent = parent.parent) identity(parent, path, fail);
}

function staticOcclusion(scene, staticMeshes, samples, frontZ, path, fail) {
  const raycaster = new THREE.Raycaster();
  for (const sample of samples) {
    const origin = scene.localToWorld(new THREE.Vector3(sample[0], sample[1], 1));
    const target = scene.localToWorld(new THREE.Vector3(sample[0], sample[1], 0));
    raycaster.set(origin, target.sub(origin).normalize());
    for (const mesh of staticMeshes) {
      const requiredFrontZ = sample[2] ?? frontZ;
      const hit = raycaster.intersectObject(mesh, true).find(entry => {
        const local = scene.worldToLocal(entry.point.clone());
        return local.z > requiredFrontZ - EPSILON;
      });
      if (hit) failWith(fail, 'clock-display-occluded', path, 'Static frame geometry blocks a required front display position', {mesh: mesh.name, sample});
    }
  }
}

function validateBase(scene, resource, fail, path) {
  const kind = resource.clockDisplay.kind;
  const dimensions = kind === 'analog' ? [.22, .01, .08] : [.38, .01, .06];
  const name = resource.clockNodes.base;
  const base = resolveNamed(scene, name, true, `${path}.clockNodes.base`, fail);
  if (base.parent === null) failWith(fail, 'clock-base-parent', `${path}.clockNodes.base`, 'Supported clock base must belong to the resource root');
  validateAncestors(base, scene, `${path}.clockNodes.base`, fail);
  const frameName = resource.clockNodes.frame, frameNode = resolveNamed(scene, frameName, false, `${path}.clockNodes.frame`, fail);
  for (let parent = base.parent; parent; parent = parent.parent) if (parent === frameNode) failWith(fail, 'clock-base-parent', `${path}.clockNodes.base`, 'Supported clock base must remain outside the display frame group');
  const transform = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(base.matrixWorld), box = localBounds(base, transform);
  if (!box || Math.abs(box.min.x + dimensions[0] / 2) > EPSILON || Math.abs(box.max.x - dimensions[0] / 2) > EPSILON ||
      Math.abs(box.min.y) > EPSILON || Math.abs(box.max.y - dimensions[1]) > EPSILON ||
      Math.abs(box.min.z + dimensions[2] / 2) > EPSILON || Math.abs(box.max.z - dimensions[2] / 2) > EPSILON)
    failWith(fail, 'clock-base-geometry', `${path}.clockNodes.base`, 'Supported clock base must match its complete centered solid rectangle');
  if (box.max.y - box.min.y < .009) failWith(fail, 'clock-base-thickness', `${path}.clockNodes.base`, 'Supported clock base must have actual thickness');
  const triangles = base.geometry?.getAttribute?.('position'), index = base.geometry?.getIndex();
  if (!triangles || (index ? index.count : triangles.count) % 3) failWith(fail, 'clock-base-geometry', `${path}.clockNodes.base`, 'Supported clock base must contain complete triangles');
  const faces = [
    ['y', dimensions[1], 'y', 1, [new THREE.Vector3(-dimensions[0] / 2, dimensions[1], -dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, dimensions[1], dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, dimensions[1], dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, dimensions[1], -dimensions[2] / 2)]],
    ['y', 0, 'y', -1, [new THREE.Vector3(-dimensions[0] / 2, 0, -dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, 0, -dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, 0, dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, 0, dimensions[2] / 2)]],
    ['x', -dimensions[0] / 2, 'x', -1, [new THREE.Vector3(-dimensions[0] / 2, 0, -dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, 0, dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, dimensions[1], dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, dimensions[1], -dimensions[2] / 2)]],
    ['x', dimensions[0] / 2, 'x', 1, [new THREE.Vector3(dimensions[0] / 2, 0, -dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, dimensions[1], -dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, dimensions[1], dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, 0, dimensions[2] / 2)]],
    ['z', -dimensions[2] / 2, 'z', -1, [new THREE.Vector3(-dimensions[0] / 2, 0, -dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, dimensions[1], -dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, dimensions[1], -dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, 0, -dimensions[2] / 2)]],
    ['z', dimensions[2] / 2, 'z', 1, [new THREE.Vector3(-dimensions[0] / 2, 0, dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, 0, dimensions[2] / 2), new THREE.Vector3(dimensions[0] / 2, dimensions[1], dimensions[2] / 2), new THREE.Vector3(-dimensions[0] / 2, dimensions[1], dimensions[2] / 2)]],
  ];
  const count = index ? index.count : triangles.count, read = offset => index ? index.getX(offset) : offset, actualTriangles = [];
  for (let offset = 0; offset < count; offset += 3) { const points = [0, 1, 2].map(step => { const source = read(offset + step); return new THREE.Vector3(triangles.getX(source), triangles.getY(source), triangles.getZ(source)).applyMatrix4(transform); }); const cross = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(points[1], points[0]), new THREE.Vector3().subVectors(points[2], points[0])); actualTriangles.push({points, cross}); }
  for (const [planeAxis, plane, normalAxis, normalSign, corners] of faces) {
    const candidates = actualTriangles.filter(triangle => triangle.points.every(point => near(point[planeAxis], plane)) && triangle.cross[normalAxis] * normalSign > 1e-7);
    const unique = [];
    for (const point of candidates.flatMap(triangle => triangle.points)) if (!unique.some(other => other.distanceToSquared(point) <= EPSILON * EPSILON)) unique.push(point);
    const shared = candidates.length === 2 ? candidates[0].points.filter(point => candidates[1].points.some(other => other.distanceToSquared(point) <= EPSILON * EPSILON)) : [];
    if (candidates.length !== 2 || unique.length !== 4 || unique.some(point => !corners.some(corner => corner.distanceToSquared(point) <= EPSILON * EPSILON)) || shared.length !== 2)
      failWith(fail, 'clock-base-surface', `${path}.clockNodes.base`, 'Supported clock base must expose six complete outward rectangular faces', {face: `${planeAxis}=${plane}`, candidates: candidates.length, corners: unique.length, shared: shared.length});
    const coords = planeAxis === 'x' ? ['y', 'z'] : planeAxis === 'y' ? ['x', 'z'] : ['x', 'y'];
    if (near(shared[0][coords[0]], shared[1][coords[0]]) || near(shared[0][coords[1]], shared[1][coords[1]])) failWith(fail, 'clock-base-surface', `${path}.clockNodes.base`, 'Each base face must use a shared diagonal, not an edge');
  }
  const frame = resolveNamed(scene, resource.clockNodes.frame, false, `${path}.clockNodes.frame`, fail), frameInverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const baseChildren = [];
  frame.traverse(mesh => { if (mesh.isMesh) baseChildren.push(mesh); });
  const baseBounds = box;
  const baseContactBox = baseBounds.clone().expandByScalar(EPSILON), connected = baseChildren.some(mesh => {
    const transform = frameInverse.clone().multiply(mesh.matrixWorld), position = mesh.geometry?.getAttribute?.('position'), index = mesh.geometry?.getIndex();
    if (!position) return false;
    const count = index ? index.count : position.count, read = offset => index ? index.getX(offset) : offset;
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const points = [0, 1, 2].map(step => { const source = read(offset + step); return new THREE.Vector3(position.getX(source), position.getY(source), position.getZ(source)).applyMatrix4(transform); });
      if (points.some(point => ![point.x, point.y, point.z].every(Number.isFinite))) continue;
      const cross = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(points[1], points[0]), new THREE.Vector3().subVectors(points[2], points[0]));
      if (cross.lengthSq() < 1e-12) continue;
      if (baseContactBox.intersectsTriangle(new THREE.Triangle(points[0], points[1], points[2]))) return true;
    }
    return false;
  });
  if (!connected) failWith(fail, 'clock-base-connection', `${path}.clockNodes.base`, 'Supported clock base must have an actual solid connection to the display body');
  return {base: base.name, dimensions};
}

function validateSupported(scene, resource, fail, path) {
  const framePosition = resource.clockDisplay.frame;
  if (!finiteArray(framePosition, 3)) failWith(fail, 'clock-frame-contract', `${path}.clockDisplay.frame`, 'Supported clocks require a finite frame position');
  if (!resource.clockNodes || typeof resource.clockNodes !== 'object' || typeof resource.clockNodes.frame !== 'string' || typeof resource.clockNodes.base !== 'string')
    failWith(fail, 'clock-frame-contract', `${path}.clockNodes`, 'Supported clocks require frame and base node mappings');
  const frame = resolveNamed(scene, resource.clockNodes.frame, false, `${path}.clockNodes.frame`, fail);
  if (frame.isMesh) failWith(fail, 'clock-frame-node', `${path}.clockNodes.frame`, 'Clock frame must be a group');
  if (!near(frame.position.x, framePosition[0]) || !near(frame.position.y, framePosition[1]) || !near(frame.position.z, framePosition[2]) ||
      Math.abs(frame.rotation.x) > 1e-6 || Math.abs(frame.rotation.y) > 1e-6 || Math.abs(frame.rotation.z) > 1e-6 ||
      Math.abs(frame.scale.x - 1) > 1e-6 || Math.abs(frame.scale.y - 1) > 1e-6 || Math.abs(frame.scale.z - 1) > 1e-6)
    failWith(fail, 'clock-frame-transform', `${path}.clockNodes.frame`, 'Clock frame must match the declared resource-root translation with zero pose and unit scale');
  validateAncestors(frame, scene, `${path}.clockNodes.frame`, fail);
  const displayNames = resource.clockDisplay.kind === 'analog' ? ['hour', 'minute', 'second'].map(key => resource.clockNodes[key]) : [...(resource.clockNodes.digits || []).flat(), ...(resource.clockNodes.colons || [])];
  for (const [index, name] of displayNames.entries()) {
    const displayNode = resolveNamed(scene, name, resource.clockDisplay.kind === 'digital', `${path}.clockNodes.display[${index}]`, fail);
    let inside = false;
    for (let parent = displayNode.parent; parent; parent = parent.parent) if (parent === frame) inside = true;
    if (!inside) failWith(fail, 'clock-frame-parent', `${path}.clockNodes.display[${index}]`, 'Every mapped display node must be a descendant of the fixed display frame');
  }
  const result = resource.clockDisplay.kind === 'analog' ? validateAnalog(frame, resource, fail, path, (() => { const meshes = []; frame.traverse(node => { if (node.isMesh) meshes.push(node); }); return meshes; })()) : validateDigital(frame, resource, fail, path, (() => { const meshes = []; frame.traverse(node => { if (node.isMesh) meshes.push(node); }); return meshes; })());
  const base = validateBase(scene, resource, fail, path);
  return {...result, frame: frame.name, base};
}

function validateAnalog(scene, resource, fail, path, allMeshes) {
  const mapping = resource.clockNodes;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) failWith(fail, 'clock-mapping', `${path}.clockNodes`, 'Analog clockNodes must map hour, minute and second');
  const names = ['hour', 'minute', 'second'].map(key => mapping[key]);
  if (names.some(name => typeof name !== 'string') || new Set(names).size !== names.length) failWith(fail, 'clock-mapping', `${path}.clockNodes`, 'Analog pivot names must be distinct');
  const pivots = names.map((name, index) => { const pivot = resolveNamed(scene, name, false, `${path}.clockNodes.${['hour', 'minute', 'second'][index]}`, fail); if (pivot.isMesh) failWith(fail, 'clock-pivot-node', `${path}.clockNodes`, 'Analog clock pivots must be groups'); validateAncestors(pivot, scene, `${path}.clockNodes`, fail); return pivot; });
  const expectedZ = [.045, .055, .065], lengths = [.085, .12, .14], inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const staticMeshes = allMeshes.filter(mesh => !pivots.some(pivot => { for (let parent = mesh.parent; parent; parent = parent.parent) if (parent === pivot) return true; return false; }));
  for (let index = 0; index < pivots.length; index++) {
    const pivot = pivots[index];
    if (!near(pivot.position.x, 0) || !near(pivot.position.y, 0) || !near(pivot.position.z, expectedZ[index]) ||
        Math.abs(pivot.rotation.x) > 1e-6 || Math.abs(pivot.rotation.y) > 1e-6 || Math.abs(pivot.rotation.z) > 1e-6 ||
        Math.abs(pivot.scale.x - 1) > 1e-6 || Math.abs(pivot.scale.y - 1) > 1e-6 || Math.abs(pivot.scale.z - 1) > 1e-6)
      failWith(fail, 'clock-pivot-transform', `${path}.clockNodes.${['hour', 'minute', 'second'][index]}`, 'Analog pivot has an invalid position, pose or scale');
    const pivotInverse = new THREE.Matrix4().copy(pivot.matrixWorld).invert(), pointers = [];
    pivot.traverse(mesh => { if (mesh.isMesh && mesh.visible !== false) { const transform = pivotInverse.clone().multiply(mesh.matrixWorld), box = localBounds(mesh, transform); if (!box) failWith(fail, 'clock-pointer-geometry', `${path}.clockNodes`, 'Analog pointer mesh must contain finite geometry'); if (box.max.z - box.min.z < .001) failWith(fail, 'clock-pointer-thickness', `${path}.clockNodes`, 'Analog pointer mesh must have actual solid thickness'); frontFace(mesh, transform, `${path}.clockNodes`, fail); pointers.push(box); } });
    if (!pointers.length) failWith(fail, 'clock-pointer-geometry', `${path}.clockNodes`, 'Analog pivot must contain a visible solid pointer mesh');
    const bounds = pointers.reduce((total, box) => total.union(box), new THREE.Box3());
    if (bounds.min.y < -EPSILON || bounds.max.y < lengths[index] - .006 || bounds.max.y > lengths[index] + .006)
      failWith(fail, 'clock-pointer-geometry', `${path}.clockNodes`, 'Analog pointer must extend along +Y to its declared length');
    const radius = Math.max(...[bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].map(y => Math.hypot(x, y))));
    if (radius > .175 + EPSILON) failWith(fail, 'clock-pointer-envelope', `${path}.clockNodes`, 'Analog pointer rotation envelope exceeds the fixed wall-clock mounting envelope');
    const frontSamples = [[0, lengths[index] * .25], [0, lengths[index] * .5], [0, lengths[index] * .75]];
    staticOcclusion(scene, staticMeshes, frontSamples, expectedZ[index], `${path}.clockNodes`, fail);
  }
  return {kind: 'analog', pivots: names, pointerLengths: lengths};
}

function validateDigital(scene, resource, fail, path, allMeshes) {
  const mapping = resource.clockNodes;
  if (!mapping || !Array.isArray(mapping.digits) || mapping.digits.length !== 6 || !Array.isArray(mapping.colons) || mapping.colons.length !== 4)
    failWith(fail, 'clock-mapping', `${path}.clockNodes`, 'Digital clockNodes require six seven-segment digits and four colon meshes');
  const names = mapping.digits.flat();
  if (mapping.digits.some(digit => !Array.isArray(digit) || digit.length !== 7) || names.length !== 42 || new Set([...names, ...mapping.colons]).size !== 46)
    failWith(fail, 'clock-mapping', `${path}.clockNodes`, 'Digital segment and colon names must be unique and complete');
  const digitCenters = [-.195, -.13, -.0325, .0325, .13, .195], segmentNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const staticMeshes = allMeshes.filter(mesh => !names.includes(mesh.name) && !mapping.colons.includes(mesh.name));
  const samples = [];
  for (let digit = 0; digit < 6; digit++) for (let segment = 0; segment < 7; segment++) {
    const mesh = resolveNamed(scene, mapping.digits[digit][segment], true, `${path}.clockNodes.digits[${digit}][${segment}]`, fail);
    validateAncestors(mesh, scene, `${path}.clockNodes.digits`, fail);
    const transform = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(mesh.matrixWorld), box = localBounds(mesh, transform);
    if (!box || box.max.z <= 0 || box.max.z - box.min.z < .001) failWith(fail, 'clock-display-geometry', `${path}.clockNodes.digits[${digit}][${segment}]`, 'Digital segment must be a visible solid front mesh');
    const horizontal = segmentNames[segment] === 'a' || segmentNames[segment] === 'd' || segmentNames[segment] === 'g';
    const sideOffset = .021;
    const expectedX = horizontal ? digitCenters[digit] : digitCenters[digit] + ([1, 2].includes(segment) ? sideOffset : -sideOffset);
    const expectedY = horizontal ? (segmentNames[segment] === 'a' ? .045 : segmentNames[segment] === 'd' ? -.045 : 0) : (segmentNames[segment] === 'b' || segmentNames[segment] === 'f' ? .0225 : -.0225);
    const along = horizontal ? box.max.x - box.min.x : box.max.y - box.min.y, thick = horizontal ? box.max.y - box.min.y : box.max.x - box.min.x;
    if (Math.abs((box.min.x + box.max.x) / 2 - expectedX) > .015 || Math.abs((box.min.y + box.max.y) / 2 - expectedY) > .015 || along < .025 || along > .05 || thick < .003 || thick > .015)
      failWith(fail, 'clock-display-geometry', `${path}.clockNodes.digits[${digit}][${segment}]`, 'Digital segment has an invalid position or dimension');
    frontFace(mesh, transform, `${path}.clockNodes.digits[${digit}][${segment}]`, fail); samples.push([(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z]);
  }
  const colonExpected = [[-.08125, .02], [-.08125, -.02], [.08125, .02], [.08125, -.02]], colonUsed = new Set();
  for (let index = 0; index < 4; index++) {
    const mesh = resolveNamed(scene, mapping.colons[index], true, `${path}.clockNodes.colons[${index}]`, fail);
    validateAncestors(mesh, scene, `${path}.clockNodes.colons`, fail);
    const transform = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(mesh.matrixWorld), box = localBounds(mesh, transform), center = box && [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2], expectedIndex = center ? colonExpected.findIndex((expected, targetIndex) => !colonUsed.has(targetIndex) && Math.abs(center[0] - expected[0]) <= .015 && Math.abs(center[1] - expected[1]) <= .015) : -1;
    if (!box || box.max.z <= 0 || expectedIndex < 0 || box.max.x - box.min.x > .02 || box.max.y - box.min.y > .02)
      failWith(fail, 'clock-display-geometry', `${path}.clockNodes.colons[${index}]`, 'Colon point mesh has an invalid position or size');
    colonUsed.add(expectedIndex);
    frontFace(mesh, transform, `${path}.clockNodes.colons[${index}]`, fail); samples.push([(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z]);
  }
  staticOcclusion(scene, staticMeshes, samples, 0, `${path}.clockNodes`, fail);
  return {kind: 'digital', digits: 6, segments: 42, colons: 4};
}

/** Validate real analog or digital clock display geometry. */
export function validateClockGeometry(scene, resource, fail, path = resource?.id) {
  if (typeof fail !== 'function') throw new TypeError('validateClockGeometry requires a fail function');
  if (!scene?.isObject3D) failWith(fail, 'invalid-clock-scene', 'scene', 'Expected a loaded Three Object3D scene');
  const kind = resource?.clockDisplay?.kind;
  if (kind !== 'analog' && kind !== 'digital') return {checked: false, kind: null};
  scene.updateMatrixWorld(true);
  if (resource?.mount === 'support-surface') return {checked: true, ...validateSupported(scene, resource, fail, path)};
  const meshes = []; scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  const result = kind === 'analog' ? validateAnalog(scene, resource, fail, path, meshes) : validateDigital(scene, resource, fail, path, meshes);
  return {checked: true, ...result};
}
