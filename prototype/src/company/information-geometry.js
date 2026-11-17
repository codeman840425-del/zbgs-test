import * as THREE from 'three';

const EPSILON = 1e-3;
const failWith = (fail, code, path, message, details) => fail(code, path, message, details);
const near = (a, b, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;
const finite = value => Number.isFinite(value);

function transformBounds(mesh, transform) {
  const positions = mesh.geometry?.getAttribute?.('position');
  if (!positions?.count) return null;
  const box = new THREE.Box3(), point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    const values = [positions.getX(index), positions.getY(index), positions.getZ(index)];
    if (!values.every(finite)) return null;
    box.expandByPoint(point.set(...values).applyMatrix4(transform));
  }
  return box;
}

function triangles(mesh, transform) {
  const positions = mesh.geometry?.getAttribute?.('position'), index = mesh.geometry?.getIndex();
  if (!positions?.count || (index ? index.count : positions.count) % 3) return null;
  const count = index ? index.count : positions.count, read = offset => index ? index.getX(offset) : offset, result = [];
  for (let offset = 0; offset < count; offset += 3) {
    const sources = [0, 1, 2].map(step => read(offset + step));
    if (sources.some(source => !Number.isInteger(source) || source < 0 || source >= positions.count)) return null;
    const points = sources.map(source => new THREE.Vector3(positions.getX(source), positions.getY(source), positions.getZ(source)).applyMatrix4(transform));
    if (points.some(point => ![point.x, point.y, point.z].every(finite))) return null;
    const cross = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(points[1], points[0]), new THREE.Vector3().subVectors(points[2], points[0]));
    result.push({points, cross, area: cross.length() * .5});
  }
  return result;
}

function requireBoxFaces(actual, dimensions, centerZ, path, fail) {
  const [width, height, depth] = dimensions;
  const faces = [['x', -width / 2, 'x', -1], ['x', width / 2, 'x', 1], ['y', -height / 2, 'y', -1], ['y', height / 2, 'y', 1], ['z', centerZ - depth / 2, 'z', -1], ['z', centerZ + depth / 2, 'z', 1]];
  for (const [planeAxis, plane, normalAxis, sign] of faces) {
    const candidates = actual.filter(triangle => triangle.points.every(point => near(point[planeAxis], plane)) && triangle.cross[normalAxis] * sign > 1e-7);
    const unique = [];
    for (const point of candidates.flatMap(triangle => triangle.points)) if (!unique.some(other => other.distanceToSquared(point) <= EPSILON * EPSILON)) unique.push(point);
    const coords = planeAxis === 'x' ? ['y', 'z'] : planeAxis === 'y' ? ['x', 'z'] : ['x', 'y'];
    const shared = candidates.length === 2 ? candidates[0].points.filter(point => candidates[1].points.some(other => other.distanceToSquared(point) <= EPSILON * EPSILON)) : [];
    const ranges={x:[-width/2,width/2],y:[-height/2,height/2],z:[centerZ-depth/2,centerZ+depth/2]};
    const corners=ranges[coords[0]].flatMap(a=>ranges[coords[1]].map(b=>[a,b]));
    const fullCorners=corners.every(([a,b])=>unique.some(p=>near(p[coords[0]],a)&&near(p[coords[1]],b)));
    if (candidates.length !== 2 || unique.length !== 4 || !fullCorners || shared.length !== 2 || near(shared[0][coords[0]], shared[1][coords[0]]) || near(shared[0][coords[1]], shared[1][coords[1]])) failWith(fail, 'information-back-geometry', path, 'Information back must expose six complete outward solid faces', {face: `${planeAxis}=${plane}`});
  }
}

function resolve(scene, name, path, fail) {
  if (typeof name !== 'string' || !name) failWith(fail, 'information-mapping', path, 'Information node name must be nonempty text');
  const matches = []; scene.traverse(node => { if (node.name === name) matches.push(node); });
  if (matches.length !== 1) failWith(fail, 'information-mapping', path, 'Information node must uniquely resolve to one actual node', {name, matches: matches.length});
  return matches[0];
}

function polygonRectIntersects(points, minX, maxX, minY, maxY) {
  const projected = points.map(point => [point.x, point.y]);
  if (!projected.length) return false;
  const inside = ([x, y]) => x >= minX - EPSILON && x <= maxX + EPSILON && y >= minY - EPSILON && y <= maxY + EPSILON;
  if (projected.some(inside)) return true;
  const rect = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a, b, p) => p[0] >= Math.min(a[0], b[0]) - EPSILON && p[0] <= Math.max(a[0], b[0]) + EPSILON && p[1] >= Math.min(a[1], b[1]) - EPSILON && p[1] <= Math.max(a[1], b[1]) + EPSILON;
  const segmentsIntersect = (a, b, c, d) => {
    const ab = cross(a, b, c), ab2 = cross(a, b, d), cd = cross(c, d, a), cd2 = cross(c, d, b);
    if (Math.abs(ab) <= EPSILON && onSegment(a, b, c)) return true;
    if (Math.abs(ab2) <= EPSILON && onSegment(a, b, d)) return true;
    if (Math.abs(cd) <= EPSILON && onSegment(c, d, a)) return true;
    if (Math.abs(cd2) <= EPSILON && onSegment(c, d, b)) return true;
    return ((ab > EPSILON && ab2 < -EPSILON) || (ab < -EPSILON && ab2 > EPSILON)) && ((cd > EPSILON && cd2 < -EPSILON) || (cd < -EPSILON && cd2 > EPSILON));
  };
  for (let i = 0; i < projected.length; i++) for (let j = 0; j < 4; j++) if (segmentsIntersect(projected[i], projected[(i + 1) % projected.length], rect[j], rect[(j + 1) % 4])) return true;
  const area = projected.reduce((sum, point, index) => sum + point[0] * projected[(index + 1) % projected.length][1] - point[1] * projected[(index + 1) % projected.length][0], 0);
  if (Math.abs(area) <= EPSILON) return false;
  const pointInPolygon = point => { let sign = 0; for (let index = 0; index < projected.length; index++) { const value = cross(projected[index], projected[(index + 1) % projected.length], point); if (Math.abs(value) > EPSILON) { if (!sign) sign = Math.sign(value); else if (sign !== Math.sign(value)) return false; } } return true; };
  return rect.some(pointInPolygon);
}

function clipToZ(points, plane) {
  const clipped = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length], aInside = a.z >= plane, bInside = b.z >= plane;
    if (aInside) clipped.push(a);
    if (aInside !== bInside) { const amount = (plane - a.z) / (b.z - a.z); clipped.push(new THREE.Vector3(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount, plane)); }
  }
  return clipped;
}

function validateBack(scene, resource, fail, path) {
  const mesh = resolve(scene, resource.informationNodes?.back, `${path}.informationNodes.back`, fail);
  if (!mesh.isMesh) failWith(fail, 'information-back-geometry', `${path}.informationNodes.back`, 'Information back must be an actual mesh');
  const transform = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(mesh.matrixWorld), box = transformBounds(mesh, transform);
  if (!box || Math.abs(box.min.x + .45) > EPSILON || Math.abs(box.max.x - .45) > EPSILON || Math.abs(box.min.y + .29) > EPSILON || Math.abs(box.max.y - .29) > EPSILON || Math.abs(box.min.z) > EPSILON || Math.abs(box.max.z - .02) > EPSILON)
    failWith(fail, 'information-back-geometry', `${path}.informationNodes.back`, 'Information back must match the .9 x .58 x .02 centered solid rectangle');
  const actual = triangles(mesh, transform);
  if (!actual || actual.some(triangle => triangle.area < 1e-7)) failWith(fail, 'information-back-geometry', `${path}.informationNodes.back`, 'Information back must contain nondegenerate triangles');
  requireBoxFaces(actual, [.9, .58, .02], .01, `${path}.informationNodes.back`, fail);
  return {mesh, box};
}

function validateBoard(scene, resource, fail, path) {
  const back = validateBack(scene, resource, fail, path), slot = resource.informationSurface;
  if (!slot || slot.schema !== 'information-face-v1' || slot.width !== .88 || slot.height !== .56 || !Array.isArray(slot.position) || slot.position.length !== 3)
    failWith(fail, 'information-surface-contract', `${path}.informationSurface`, 'Information board surface contract is invalid');
  const slotMeshes = []; scene.traverse(node => { if (node.isMesh && node !== back.mesh) slotMeshes.push(node); });
  const inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  for (const mesh of slotMeshes) { const actual = triangles(mesh, inverse.clone().multiply(mesh.matrixWorld)); if (!actual) failWith(fail, 'information-frame-geometry', `${path}.informationSurface`, 'Frame mesh must contain finite indexed triangles', {mesh: mesh.name}); for (const triangle of actual) if (polygonRectIntersects(clipToZ(triangle.points, .031 - EPSILON), -.44, .44, -.28, .28)) failWith(fail, 'information-surface-occluded', `${path}.informationSurface`, 'Frame geometry projects into the required information rectangle', {mesh: mesh.name}); }
  return {kind: 'board', back: back.mesh.name, slot: [slot.width, slot.height]};
}

function validateContent(scene, resource, fail, path) {
  const contract = resource.informationContent, node = resolve(scene, resource.informationNodes?.face, `${path}.informationNodes.face`, fail);
  if (!node.isMesh) failWith(fail, 'information-face-geometry', `${path}.informationNodes.face`, 'Information face must be one actual mesh');
  const meshes = []; scene.traverse(child => { if (child.isMesh) meshes.push(child); });
  if (meshes.length !== 1 || meshes[0] !== node) failWith(fail, 'information-face-geometry', `${path}.informationNodes.face`, 'Content resource must contain exactly one actual mesh');
  if (!contract || contract.schema !== 'information-face-v1' || contract.width !== .88 || contract.height !== .56 || JSON.stringify(contract.pixels) !== JSON.stringify([1100, 700]))
    failWith(fail, 'information-content-contract', `${path}.informationContent`, 'Information content contract is invalid');
  const inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert(), transform = inverse.clone().multiply(node.matrixWorld), actual = triangles(node, transform);
  if (!actual || actual.length !== 2 || actual.some(triangle => triangle.area < 1e-7 || triangle.cross.z <= 1e-7)) failWith(fail, 'information-face-geometry', `${path}.informationNodes.face`, 'Information face must be two nondegenerate +Z triangles');
  const expectedCorners = [new THREE.Vector3(-.44, -.28, 0), new THREE.Vector3(.44, -.28, 0), new THREE.Vector3(.44, .28, 0), new THREE.Vector3(-.44, .28, 0)], unique = [];
  for (const point of actual.flatMap(triangle => triangle.points)) if (!unique.some(other => other.distanceToSquared(point) <= EPSILON * EPSILON)) unique.push(point);
  const shared = actual[0].points.filter(point => actual[1].points.some(other => other.distanceToSquared(point) <= EPSILON * EPSILON));
  if (unique.length !== 4 || unique.some(point => !expectedCorners.some(corner => corner.distanceToSquared(point) <= EPSILON * EPSILON)) || shared.length !== 2 || near(shared[0].x, shared[1].x) || near(shared[0].y, shared[1].y))
    failWith(fail, 'information-face-geometry', `${path}.informationNodes.face`, 'Information face triangles must cover all four rectangle corners across one shared diagonal');
  const positions = node.geometry.getAttribute('position'), uv = node.geometry.getAttribute('uv'), index = node.geometry.getIndex();
  if (!uv || uv.count !== positions.count) failWith(fail, 'information-face-uv', `${path}.informationNodes.face`, 'Information face requires one UV per vertex');
  const expected = [[-.44, -.28, 0, 0, 1], [.44, -.28, 0, 1, 1], [.44, .28, 0, 1, 0], [-.44, .28, 0, 0, 0]], used = new Set();
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const point = new THREE.Vector3(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)).applyMatrix4(transform), s = uv.getX(vertex), t = uv.getY(vertex), match = expected.findIndex((corner, index) => !used.has(index) && near(point.x, corner[0]) && near(point.y, corner[1]) && near(point.z, corner[2]) && near(s, corner[3]) && near(t, corner[4]));
    if (match < 0) failWith(fail, 'information-face-uv', `${path}.informationNodes.face`, 'Information face vertices or UV orientation do not match the fixed rectangle contract');
    used.add(match);
  }
  if (used.size !== 4) failWith(fail, 'information-face-uv', `${path}.informationNodes.face`, 'Information face must cover all four UV corners');
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  if (materials.length !== 1 || !materials[0]?.map || materials[0].transparent || materials[0].opacity !== 1 || materials[0].color?.getHex() !== 0xffffff || materials[0].emissive?.getHex() !== 0)
    failWith(fail, 'information-face-material', `${path}.informationNodes.face`, 'Information face requires a white opaque nonemissive textured material');
  const texture = materials[0].map;
  if (texture.colorSpace !== THREE.SRGBColorSpace || texture.image?.width !== 1100 || texture.image?.height !== 700)
    failWith(fail, 'information-face-texture', `${path}.informationNodes.face`, 'Information texture must be sRGB 1100x700');
  return {kind: 'content', face: node.name, pixels: [1100, 700]};
}

export function validateInformationGeometry(root, resource, fail) {
  if (typeof fail !== 'function') throw new TypeError('validateInformationGeometry requires a fail function');
  if (!root?.isObject3D) failWith(fail, 'invalid-information-scene', 'scene', 'Expected a loaded Three Object3D scene');
  if (!['information-board', 'information-content'].includes(resource?.mountRole)) return {checked: false};
  root.updateMatrixWorld(true);
  return resource.mountRole === 'information-board' ? {checked: true, ...validateBoard(root, resource, fail, resource.id)} : {checked: true, ...validateContent(root, resource, fail, resource.id)};
}
