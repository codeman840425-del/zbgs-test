import * as THREE from 'three';

const EPS = 1e-5;

const asArray = value => Array.isArray(value) ? value : [value];

function fail(failFn, code, path, message, details = {}) {
  failFn(code, path, message, details);
}

function meshByName(scene, name, path, failFn) {
  const mesh = scene.getObjectByName(name);
  if (!mesh?.isMesh) fail(failFn, 'cable-port-mesh', `${path}.${name}`, 'Cable port mapping must resolve to a mesh');
  return mesh;
}

function materialIsOpaque(mesh) {
  return asArray(mesh.material).every(material => material?.isMeshStandardMaterial &&
    material.transparent !== true && material.opacity >= 0.999 && material.map == null);
}

function bounds(mesh) {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(mesh);
}

function centreOf(mesh) {
  return bounds(mesh).getCenter(new THREE.Vector3());
}

function rayHitsBacking(scene, origin, direction, backing, expectedDepth, tolerance) {
  const ray = new THREE.Raycaster(origin, direction.normalize(), 0, expectedDepth + tolerance);
  const hit = ray.intersectObject(scene, true).find(candidate => candidate.object.isMesh && candidate.object !== backing);
  const backingHit = new THREE.Raycaster(origin, direction.normalize(), 0, expectedDepth + tolerance)
    .intersectObject(backing, true).find(candidate => candidate.object === backing);
  return { hit, backingHit };
}

function assertTouch(a, b, path, failFn) {
  const expanded = bounds(a).clone().expandByScalar(.0005);
  if (!expanded.intersectsBox(bounds(b)))
    fail(failFn, 'cable-port-frame-contact', path, 'Port frame must touch its backing mesh');
}

/**
 * Validate one visual cable connector against its loaded GLB geometry.
 * The connector is a four-sided frame with the original body acting as the
 * cavity bottom. This is deliberately geometric and does not simulate USB.
 */
export function validateCablePortGeometry(scene, resource, failFn, path = resource?.id || 'cable-port') {
  if (typeof failFn !== 'function') throw new TypeError('validateCablePortGeometry requires a fail function');
  if (!scene?.isObject3D) { fail(failFn, 'cable-port-scene', path, 'Expected a loaded Three Object3D scene'); return { checked: false }; }
  const ports = resource?.cablePorts;
  const nodeMap = resource?.cablePortNodes;
  if (!Array.isArray(ports) || !ports.length || !nodeMap || typeof nodeMap !== 'object') {
    fail(failFn, 'cable-port-contract', path, 'Cable port resource requires cablePorts and cablePortNodes');
    return { checked: false };
  }
  scene.updateMatrixWorld(true);
  const checks = [];
  for (const port of ports) {
    if (!port || typeof port.id !== 'string' || !Array.isArray(port.position) || port.position.length !== 3 ||
        !port.position.every(Number.isFinite) || !Array.isArray(port.direction) || port.direction.length !== 3 ||
        !port.direction.every(Number.isFinite) || new THREE.Vector3(...port.direction).lengthSq() < EPS)
      fail(failFn, 'cable-port-contract', `${path}.cablePorts`, 'Port id, position and direction must be finite');
    const mapping = nodeMap[port.id];
    if (!mapping || !Array.isArray(mapping.frame) || mapping.frame.length !== 4 || typeof mapping.backing !== 'string')
      fail(failFn, 'cable-port-contract', `${path}.cablePortNodes.${port.id}`, 'Port mapping requires four frame meshes and one backing mesh');
    const frame = mapping.frame.map(name => meshByName(scene, name, `${path}.cablePortNodes.${port.id}.frame`, failFn));
    const backing = meshByName(scene, mapping.backing, `${path}.cablePortNodes.${port.id}.backing`, failFn);
    if (new Set(mapping.frame).size !== 4) fail(failFn, 'cable-port-frame', `${path}.cablePortNodes.${port.id}.frame`, 'Frame mesh names must be distinct');
    if (frame.some(mesh => !materialIsOpaque(mesh)) || !materialIsOpaque(backing))
      fail(failFn, 'cable-port-material', `${path}.cablePortNodes.${port.id}`, 'Port frame and backing require opaque MeshStandardMaterial');
    frame.forEach(mesh => {
      const size = bounds(mesh).getSize(new THREE.Vector3());
      if (size.x <= EPS || size.y <= EPS || size.z <= EPS)
        fail(failFn, 'cable-port-positive-thickness', `${path}.cablePortNodes.${port.id}.${mesh.name}`, 'Port frame must have positive thickness');
      assertTouch(mesh, backing, `${path}.cablePortNodes.${port.id}.${mesh.name}`, failFn);
    });
    const centre = frame.reduce((sum, mesh) => sum.add(centreOf(mesh)), new THREE.Vector3()).multiplyScalar(1 / frame.length);
    const expected = new THREE.Vector3(...port.position);
    const direction = new THREE.Vector3(...port.direction).normalize();
    const axis = new THREE.Vector3(Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z));
    const frameDepth = frame.reduce((sum, mesh) => sum + bounds(mesh).getSize(new THREE.Vector3()).dot(axis), 0) / frame.length;
    const faceCentre = centre.clone().addScaledVector(direction, frameDepth / 2);
    if (faceCentre.distanceTo(expected) > .0015)
      fail(failFn, 'cable-port-position', `${path}.cablePorts.${port.id}.position`, 'Port frame face differs from its declared contact point', { faceCentre: faceCentre.toArray(), expected: expected.toArray() });
    const faceOrigin = expected.clone().addScaledVector(direction, .0005);
    const {hit, backingHit} = rayHitsBacking(scene, faceOrigin, direction.clone().negate(), backing, .0065, .0005);
    if (hit && !frame.includes(hit.object))
      fail(failFn, 'cable-port-blocked', `${path}.cablePorts.${port.id}`, 'Port opening is blocked by another mesh');
    if (!backingHit)
      fail(failFn, 'cable-port-no-backing', `${path}.cablePorts.${port.id}`, 'Port opening must terminate against the original body within 6mm');
    checks.push({id: port.id, frame: mapping.frame, backing: mapping.backing, position: [...port.position], direction: [...port.direction], backingDepth: backingHit.distance});
  }
  return {checked: true, ports: checks, realMeshMappings: true, cpuOnly: true};
}
