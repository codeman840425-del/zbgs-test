import * as THREE from 'three';

const EPS = 1e-4;

function failWith(fail, code, path, message, details) {
  fail(code, path, message, details);
}

function meshesIn(scene) {
  const meshes = [];
  scene?.traverse?.(node => { if (node.isMesh) meshes.push(node); });
  return meshes;
}

function boundsFor(mesh) {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(mesh);
}

function touches(a, b, tolerance = 0.00025) {
  return a.min.x <= b.max.x + tolerance && a.max.x + tolerance >= b.min.x &&
    a.min.y <= b.max.y + tolerance && a.max.y + tolerance >= b.min.y &&
    a.min.z <= b.max.z + tolerance && a.max.z + tolerance >= b.min.z;
}

function distanceToPoint(box, point) {
  const dx = Math.max(box.min.x - point[0], 0, point[0] - box.max.x);
  const dy = Math.max(box.min.y - point[1], 0, point[1] - box.max.y);
  const dz = Math.max(box.min.z - point[2], 0, point[2] - box.max.z);
  return Math.hypot(dx, dy, dz);
}

function materialIsOpaqueStandard(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every(material => material?.isMeshStandardMaterial && material.transparent !== true && material.opacity >= 0.999 && material.map == null);
}

function closedIndexedSolid(mesh) {
  const index = mesh.geometry?.index;
  if (!index) return false;
  const edges = new Map();
  const values = index.array;
  for (let offset = 0; offset < values.length; offset += 3) {
    for (const [a, b] of [[values[offset], values[offset + 1]], [values[offset + 1], values[offset + 2]], [values[offset + 2], values[offset]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return edges.size > 0 && [...edges.values()].every(count => count === 2);
}

function solidVolume(mesh) {
  const geometry = mesh.geometry, positions = geometry?.getAttribute?.('position'), index = geometry?.index;
  if (!positions || !index) return 0;
  let volume = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(positions, index.getX(offset)); b.fromBufferAttribute(positions, index.getX(offset + 1)); c.fromBufferAttribute(positions, index.getX(offset + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(volume);
}

/** Validate the cable-route branch's static, positive-thickness geometry contract. */
export function validateCableRouteGeometry(scene, resource, fail, path = resource?.id || 'cable-route') {
  if (typeof fail !== 'function') throw new TypeError('validateCableRouteGeometry requires a fail function');
  if (!scene?.isObject3D) { failWith(fail, 'cable-scene', 'scene', 'Expected a loaded Three Object3D scene'); return { checked: false }; }
  if (resource?.mountRole !== 'cable-route' || resource?.geometry?.profile !== 'company-cable-route-v1')
    return { checked: false };
  const envelope = resource.geometry.envelope;
  const endpointA = resource.geometry.endpointA;
  const endpointB = resource.geometry.endpointB;
  if (!envelope || !endpointA || !endpointB) { failWith(fail, 'cable-contract', path, 'Cable resource is missing its fixed geometry contract'); return { checked: false }; }
  scene.updateMatrixWorld(true);
  const meshes = meshesIn(scene);
  scene.traverse(node => {
    if (node.isLight) failWith(fail, 'cable-light', `${path}.scene`, 'Cable route cannot contain lights');
    if (node.isSkinnedMesh || node.isBone) failWith(fail, 'cable-skinned', `${path}.scene`, 'Cable route must be static geometry without skins');
    if (node.isMesh && node.visible === false) failWith(fail, 'cable-hidden', `${path}.mesh.${node.name}`, 'Cable route meshes cannot be hidden');
  });
  if (meshes.length > (resource.geometry.maxMeshes ?? 60)) failWith(fail, 'cable-mesh-limit', path, 'Cable route exceeds mesh limit', { meshCount: meshes.length });
  const materialSet = new Set(); meshes.forEach(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materialSet.add(material)));
  if (materialSet.size > (resource.geometry.maxMaterials ?? 4)) failWith(fail, 'cable-material-limit', path, 'Cable route exceeds material limit', { materials: materialSet.size });
  const endpointMeshes = meshes.filter(mesh => mesh.userData.cableRole === 'endpoint' || /^endpoint-[AB]$/.test(mesh.name));
  const aMeshes = endpointMeshes.filter(mesh => mesh.name === resource.geometry.endpointNodes.A);
  const bMeshes = endpointMeshes.filter(mesh => mesh.name === resource.geometry.endpointNodes.B);
  if (aMeshes.length !== 1 || bMeshes.length !== 1 || endpointMeshes.length !== 2)
    failWith(fail, 'cable-endpoint-uniqueness', `${path}.geometry.endpointNodes`, 'Exactly one endpoint A and one endpoint B are required', { endpointMeshes: endpointMeshes.map(mesh => mesh.name) });
  const endpointBounds = new Map();
  for (const [key, meshesForEndpoint, point] of [['A', aMeshes, endpointA], ['B', bMeshes, endpointB]]) {
    if (!meshesForEndpoint.length) continue;
    const box = boundsFor(meshesForEndpoint[0]); endpointBounds.set(key, box);
    const center = box.getCenter(new THREE.Vector3());
    if (distanceToPoint(box, point) > EPS)
      failWith(fail, 'cable-endpoint-contact', `${path}.geometry.endpointNodes.${key}`, `Endpoint ${key} nose does not reach its fixed contact surface`, { center: center.toArray(), expected: point, bounds: { min: box.min.toArray(), max: box.max.toArray() } });
  }
  const routeMeshes = meshes.filter(mesh => mesh.userData.cableRole === 'route' || resource.geometry.routeNodes.includes(mesh.name));
  if (!routeMeshes.length) failWith(fail, 'cable-route-missing', `${path}.geometry.routeNodes`, 'Cable route has no route meshes');
  const names = meshes.map(mesh => mesh.name);
  if (new Set(names).size !== names.length) failWith(fail, 'cable-node-uniqueness', path, 'Cable mesh names must be unique');
  if (resource.geometry.routeNodes.some(name => !routeMeshes.some(mesh => mesh.name === name)))
    failWith(fail, 'cable-route-missing', `${path}.geometry.routeNodes`, 'Every registered route node must exist');
  const allRelevant = [...endpointMeshes, ...routeMeshes.filter(mesh => !endpointMeshes.includes(mesh))];
  const boxes = allRelevant.map(mesh => ({ mesh, box: boundsFor(mesh) }));
  const rootBounds = new THREE.Box3();
  for (const { box } of boxes) rootBounds.union(box);
  const fixed = resource.geometry.fixedSegmentBounds;
  if (fixed) for (const { mesh, box } of boxes) {
    if (mesh.name === resource.geometry.endpointNodes.A || mesh.name === 'plug-A-head') {
      if (box.max.x > fixed.A[1] + EPS) failWith(fail, 'cable-fixed-segment', `${path}.mesh.${mesh.name}`, 'A plug geometry crosses the central affine boundary');
    } else if (mesh.name === resource.geometry.endpointNodes.B || mesh.name === 'plug-B-head') {
      if (box.min.x < fixed.B[0] - EPS) failWith(fail, 'cable-fixed-segment', `${path}.mesh.${mesh.name}`, 'B plug geometry crosses the central affine boundary');
    } else if (box.min.x < fixed.A[1] - EPS || box.max.x > fixed.B[0] + EPS) {
      failWith(fail, 'cable-fixed-segment', `${path}.mesh.${mesh.name}`, 'Central route geometry crosses a fixed plug boundary');
    }
  }
  const size = rootBounds.getSize(new THREE.Vector3());
  if (rootBounds.min.x < -envelope.width / 2 - EPS || rootBounds.max.x > envelope.width / 2 + EPS ||
      rootBounds.min.y < -envelope.height / 2 - EPS || rootBounds.max.y > envelope.height / 2 + EPS ||
      rootBounds.min.z < -envelope.depth / 2 - EPS || rootBounds.max.z > envelope.depth / 2 + EPS)
    failWith(fail, 'cable-envelope', `${path}.geometry.envelope`, 'Cable route exceeds its fixed envelope', { bounds: { min: rootBounds.min.toArray(), max: rootBounds.max.toArray() }, envelope });
  const sourceEnvelope = resource.geometry.sourceEnvelope;
  if (sourceEnvelope && (rootBounds.min.y < sourceEnvelope.y[0] - EPS || rootBounds.max.y > sourceEnvelope.y[1] + EPS || rootBounds.min.z < sourceEnvelope.z[0] - EPS || rootBounds.max.z > sourceEnvelope.z[1] + EPS))
    failWith(fail, 'cable-envelope', `${path}.geometry.sourceEnvelope`, 'Cable route exceeds its source production envelope', { bounds: { min: rootBounds.min.toArray(), max: rootBounds.max.toArray() }, sourceEnvelope });
  let triangles = 0;
  for (const mesh of meshes) {
    if (!materialIsOpaqueStandard(mesh)) failWith(fail, 'cable-material', `${path}.mesh.${mesh.name}`, 'Cable mesh must use an opaque MeshStandardMaterial without textures');
    const position = mesh.geometry?.getAttribute?.('position');
    if (!position || !position.count) failWith(fail, 'cable-geometry', `${path}.mesh.${mesh.name}`, 'Cable mesh has no position data');
    if (mesh.userData.capped && !closedIndexedSolid(mesh)) failWith(fail, 'cable-open-boundary', `${path}.mesh.${mesh.name}`, 'Capped cable tube must have a closed indexed surface');
    if (solidVolume(mesh) <= 1e-9) failWith(fail, 'cable-solid-volume', `${path}.mesh.${mesh.name}`, 'Cable mesh must enclose a positive solid volume');
    triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : position.count / 3;
    const sizeMesh = boundsFor(mesh).getSize(new THREE.Vector3());
    if (sizeMesh.x <= 1e-5 || sizeMesh.y <= 1e-5 || sizeMesh.z <= 1e-5)
      failWith(fail, 'cable-positive-thickness', `${path}.mesh.${mesh.name}`, 'Cable meshes must have positive thickness in all axes', { size: sizeMesh.toArray() });
  }
  if (triangles > (resource.geometry.maxTriangles ?? 2000)) failWith(fail, 'cable-triangle-limit', path, 'Cable route exceeds triangle limit', { triangles });
  const reachable = new Set([aMeshes[0]].filter(Boolean));
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of boxes.map(item => item.mesh)) {
      if (reachable.has(candidate)) continue;
      const candidateBox = boxes.find(item => item.mesh === candidate).box;
      if ([...reachable].some(source => touches(candidateBox, boxes.find(item => item.mesh === source).box))) { reachable.add(candidate); grew = true; }
    }
  }
  if (reachable.size !== allRelevant.length)
    failWith(fail, 'cable-continuity', `${path}.geometry.routeNodes`, 'Every route segment must touch the endpoint-connected component', { disconnected: allRelevant.filter(mesh => !reachable.has(mesh)).map(mesh => mesh.name) });
  for (const [key, point] of [['A', endpointA], ['B', endpointB]]) {
    const endpointBox = endpointBounds.get(key);
    if (!endpointBox) continue;
    const touchingRoute = routeMeshes.some(mesh => distanceToPoint(boundsFor(mesh), point) <= 0.004);
    if (!touchingRoute) failWith(fail, 'cable-endpoint-contact', `${path}.geometry.endpointNodes.${key}`, `Route does not touch endpoint ${key}`);
  }
  return { checked: true, profile: 'company-cable-route-v1', meshCount: meshes.length, routeMeshCount: routeMeshes.length,
    triangles, bounds: { min: rootBounds.min.toArray(), max: rootBounds.max.toArray() }, size: size.toArray(),
    endpointContacts: { A: endpointA, B: endpointB }, connected: true, opaqueStandardMaterials: true };
}
