import * as THREE from 'three';

const EPS = 1e-6;
const AREA_EPS = 1e-8;
const VOLUME_EPS = 1e-9;

function error(fail, code, path, message, details) { fail(code, path, message, details); }
function key(point) { return point.map(value => Math.round(value / 1e-6)).join(','); }
function overlap(a, b) {
  const ranges = [0, 1, 2].map(axis => [Math.max(a.min[axis], b.min[axis]), Math.min(a.max[axis], b.max[axis])]);
  const lengths = ranges.map(([min, max]) => max - min);
  if (lengths.every(length => length > EPS)) return { kind: 'volume', measure: lengths[0] * lengths[1] * lengths[2] };
  const zero = lengths.findIndex(length => Math.abs(length) <= EPS);
  if (zero < 0 || lengths.some((length, index) => index !== zero && length <= EPS)) return null;
  const measure = lengths.filter((_, index) => index !== zero).reduce((product, length) => product * length, 1);
  return measure > AREA_EPS ? { kind: 'face', measure } : null;
}
function boxRecord(mesh, fail) {
  const positions = mesh.geometry?.getAttribute?.('position');
  const index = mesh.geometry?.getIndex?.();
  const count = index?.count || positions?.count || 0;
  if (!positions || positions.itemSize !== 3 || count !== 36 || count % 3) error(fail, 'ceiling-acoustic-topology', mesh.name, 'Every component must be a complete indexed or non-indexed 12-triangle box', { count });
  const matrix = mesh.matrixWorld;
  const points = [];
  const read = offset => index ? index.getX(offset) : offset;
  for (let i = 0; i < count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, read(i)).applyMatrix4(matrix);
    if (![p.x, p.y, p.z].every(Number.isFinite)) error(fail, 'ceiling-acoustic-topology', mesh.name, 'Vertices must be finite');
    points.push(p);
  }
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  points.forEach(point => { min.min(point); max.max(point); });
  const corners = new Set(points.map(point => key(point.toArray())));
  if (corners.size !== 8) error(fail, 'ceiling-acoustic-box', mesh.name, 'Each actual mesh must be an axis-aligned eight-corner box solid', { corners: corners.size });
  for (const point of points) for (const axis of ['x', 'y', 'z']) if (Math.abs(point[axis] - min[axis]) > EPS && Math.abs(point[axis] - max[axis]) > EPS)
    error(fail, 'ceiling-acoustic-box', mesh.name, 'Box vertices must lie on its three axis-aligned bounds');
  const size = max.clone().sub(min);
  const volume = size.x * size.y * size.z;
  if (!(size.x > 1e-3 && size.y > 1e-3 && size.z > 1e-3 && volume > VOLUME_EPS)) error(fail, 'ceiling-acoustic-nonpositive-volume', mesh.name, 'Every component needs practical positive width, height, depth and volume', { size: size.toArray(), volume });
  const edges = new Map();
  const faces = new Map();
  let signedVolume = 0;
  for (let i = 0; i < count; i += 3) {
    const tri = [points[i], points[i + 1], points[i + 2]];
    const edgeA = tri[1].clone().sub(tri[0]), edgeB = tri[2].clone().sub(tri[0]);
    const cross = edgeA.clone().cross(edgeB);
    const area = cross.length() / 2;
    if (!(area > AREA_EPS)) error(fail, 'ceiling-acoustic-degenerate-face', mesh.name, 'Box faces cannot contain zero-area triangles');
    signedVolume += tri[0].dot(cross) / 6;
    const axisCandidates = [0, 1, 2].filter(axis => tri.every(point => Math.abs(point.getComponent(axis) - min.getComponent(axis)) <= EPS || Math.abs(point.getComponent(axis) - max.getComponent(axis)) <= EPS) && tri.every(point => Math.abs(point.getComponent(axis) - tri[0].getComponent(axis)) <= EPS));
    if (axisCandidates.length !== 1) error(fail, 'ceiling-acoustic-box', mesh.name, 'Every triangle must lie on one full axis-aligned box face', { tri: tri.map(point => point.toArray()), min: min.toArray(), max: max.toArray(), axisCandidates });
    const axis = axisCandidates[0], side = Math.abs(tri[0].getComponent(axis) - min.getComponent(axis)) <= EPS ? 'min' : 'max';
    const normal = cross.normalize();
    if ((side === 'min' && normal.getComponent(axis) > -0.5) || (side === 'max' && normal.getComponent(axis) < 0.5)) error(fail, 'ceiling-acoustic-box-orientation', mesh.name, 'Box face normals must point outward from the enclosed volume');
    const faceKey = `${axis}:${side}`; const face = faces.get(faceKey) || { count: 0, area: 0 }; face.count++; face.area += area; faces.set(faceKey, face);
    for (let j = 0; j < 3; j++) {
      const a = key(tri[j].toArray()), b = key(tri[(j + 1) % 3].toArray()), edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      const value = edges.get(edge) || { count: 0, signs: [] };
      value.count++;
      value.signs.push(a < b ? 1 : -1);
      edges.set(edge, value);
    }
  }
  const open = [...edges.values()].filter(entry => entry.count !== 2 || entry.signs[0] === entry.signs[1]);
  if (open.length) error(fail, 'ceiling-acoustic-open-solid', mesh.name, 'Every box must have closed oppositely-oriented edges');
  for (const axis of [0, 1, 2]) for (const side of ['min', 'max']) { const face = faces.get(`${axis}:${side}`); const expected = [0, 1, 2].filter(item => item !== axis).map(item => size.getComponent(item)).reduce((a, b) => a * b, 1); if (!face || face.count !== 2 || Math.abs(face.area - expected) > 1e-6) error(fail, 'ceiling-acoustic-box-face', mesh.name, 'Each box face must contain exactly two outward triangles covering its full rectangle', { axis, side, face, expected }); }
  if (!(signedVolume > VOLUME_EPS && Math.abs(signedVolume - volume) <= Math.max(1e-7, volume * 1e-5))) error(fail, 'ceiling-acoustic-box-volume', mesh.name, 'Closed oriented box triangles must have positive volume matching the actual bounds', { signedVolume, volume });
  return { mesh, name: mesh.name, min: min.toArray(), max: max.toArray(), size: size.toArray(), volume: signedVolume };
}

export function validateCeilingAcousticGeometry(scene, resource, fail) {
  if (resource?.mountRole !== 'ceiling-acoustic-baffle' && resource?.productionBranch !== 'ceiling-acoustic-baffle') return { checked: false };
  if (typeof fail !== 'function') throw new TypeError('validateCeilingAcousticGeometry requires a fail function');
  if (!scene?.isObject3D) error(fail, 'ceiling-acoustic-scene', 'scene', 'Expected a loaded Three Object3D scene');
  const resourceId = resource.id;
  scene.updateMatrixWorld(true);
  const meshes = [];
  const materials = new Set();
  scene.traverse(node => {
    if (!node.visible) error(fail, 'ceiling-acoustic-visibility', node.name || 'scene', 'Ceiling acoustic geometry cannot hide actual components');
    if (!node.isMesh) return;
    if (node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length || node.geometry?.morphAttributes?.position?.length) error(fail, 'ceiling-acoustic-topology', node.name, 'Ceiling acoustic components must be static non-skinned meshes');
    const assigned = Array.isArray(node.material) ? node.material : [node.material];
    if (assigned.some(material => !material?.isMeshStandardMaterial || material.transparent || material.opacity !== 1 || material.alphaTest > 0 || material.map || material.normalMap || material.roughnessMap || material.metalnessMap || material.emissiveMap || material.aoMap || material.alphaMap)) error(fail, 'ceiling-acoustic-material', node.name, 'Components require opaque untextured MeshStandardMaterial');
    assigned.forEach(material => materials.add(material));
    const index = node.geometry?.getIndex?.();
    const count = index?.count || node.geometry?.getAttribute?.('position')?.count || 0;
    const draw = node.geometry?.drawRange;
    if (draw && draw.start !== 0 || draw && Number.isFinite(draw.count) && draw.count !== count) error(fail, 'ceiling-acoustic-topology', node.name, 'All actual box triangles must be in the GLB draw range');
    if (node.geometry?.groups?.length) error(fail, 'ceiling-acoustic-topology', node.name, 'Box components must use one complete triangle primitive');
    meshes.push(boxRecord(node, fail));
  });
  if (!meshes.length) error(fail, 'ceiling-acoustic-topology', 'scene', 'The GLB must contain actual mesh geometry');
  if (meshes.length > 60 || materials.size > 4) error(fail, 'ceiling-acoustic-budget', 'scene', 'Ceiling acoustic geometry exceeds mesh or material budget', { meshes: meshes.length, materials: materials.size });
  let triangles = meshes.length * 12;
  if (triangles > 1500) error(fail, 'ceiling-acoustic-budget', 'scene', 'Ceiling acoustic geometry exceeds triangle budget', { triangles });
  const envelope = { x: [-.6, .6], y: [-.3, 0], z: [-.2, .2] };
  for (const box of meshes) for (const axis of ['x', 'y', 'z']) if (box.min[['x', 'y', 'z'].indexOf(axis)] < envelope[axis][0] - EPS || box.max[['x', 'y', 'z'].indexOf(axis)] > envelope[axis][1] + EPS)
    error(fail, 'ceiling-acoustic-envelope', box.name, 'Actual component exceeds the fixed top mounting envelope', { min: box.min, max: box.max });
  const pads = meshes.filter(box => box.name.startsWith('ceiling-pad-'));
  if (pads.length !== 4) error(fail, 'ceiling-acoustic-mounting-pads', 'scene', 'Exactly four actual ceiling mounting pads are required', { found: pads.length });
  const expectedPads = new Set(['ceiling-pad-left-front', 'ceiling-pad-right-front', 'ceiling-pad-left-back', 'ceiling-pad-right-back']);
  if (new Set(pads.map(box => box.name)).size !== 4 || [...expectedPads].some(name => !pads.some(box => box.name === name))) error(fail, 'ceiling-acoustic-mounting-pads', 'scene', 'Pad names must identify four unique corners');
  const padLocations = { 'ceiling-pad-left-front': [-.42, .12], 'ceiling-pad-right-front': [.42, .12], 'ceiling-pad-left-back': [-.42, -.12], 'ceiling-pad-right-back': [.42, -.12] };
  for (const pad of pads) {
    if (pad.size.some((value, index) => Math.abs(value - [.05, .02, .05][index]) > 2e-5) || Math.abs(pad.max[1]) > EPS || Math.abs(pad.min[1] + .02) > EPS) error(fail, 'ceiling-acoustic-pad-geometry', pad.name, 'Each pad must be .05 x .02 x .05m and terminate at the ceiling plane', { min: pad.min, max: pad.max });
    const expected = padLocations[pad.name];
    if (!expected || Math.abs((pad.min[0] + pad.max[0]) / 2 - expected[0]) > 2e-5 || Math.abs((pad.min[2] + pad.max[2]) / 2 - expected[1]) > 2e-5) error(fail, 'ceiling-acoustic-pad-location', pad.name, 'Each pad must occupy its unique fixed ±.42/±.12 mounting coordinate', { min: pad.min, max: pad.max, expected });
  }
  const connections = [];
  const neighbors = new Map(meshes.map(box => [box, []]));
  for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) {
    const contact = overlap(meshes[i], meshes[j]);
    if (!contact) continue;
    neighbors.get(meshes[i]).push(meshes[j]); neighbors.get(meshes[j]).push(meshes[i]);
    connections.push({ a: meshes[i].name, b: meshes[j].name, ...contact });
  }
  const reached = new Set(pads), queue = [...pads];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors.get(queue[cursor])) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  const detached = meshes.filter(box => !reached.has(box)).map(box => box.name);
  if (detached.length) error(fail, 'ceiling-acoustic-detached-component', 'scene', 'Every actual component must connect through positive face or volume contact to a ceiling pad', { detached });
  const rods = meshes.filter(box => box.name.startsWith('ceiling-rod-'));
  if (rods.length !== 4) error(fail, 'ceiling-acoustic-rods', 'scene', 'Exactly four positive-thickness suspension rods are required', { found: rods.length });
  const design = resource?.provenance?.sourceDesign;
  const names = meshes.map(box => box.name);
  if (!['cloud', 'linear', 'felt', 'timber-grid'].includes(design)) error(fail, 'ceiling-acoustic-structure', 'resource.provenance.sourceDesign', 'sourceDesign must identify cloud, linear, felt or timber-grid');
  const requirement = design === 'cloud' ? names.includes('cloud-panel') : design === 'linear' ? names.filter(name => name.startsWith('linear-bar-')).length >= 2 : design === 'felt' ? names.includes('felt-top-rail') && names.filter(name => name.startsWith('felt-fin-')).length >= 3 : names.includes('timber-backing') && names.includes('timber-top-rail') && names.some(name => name.startsWith('timber-vertical-')) && names.some(name => name.startsWith('timber-horizontal-'));
  if (!requirement) error(fail, 'ceiling-acoustic-structure', 'scene', `The ${design} resource is missing its distinct structural geometry`, { names });
  return { checked: true, ceilingMounted: true, id: resourceId, meshCount: meshes.length, triangleCount: triangles, materialCount: materials.size, pads: pads.map(box => box.name), rods: rods.map(box => box.name), connections, components: meshes.map(box => ({ name: box.name, min: box.min, max: box.max, volume: box.volume })), tolerances: { positionMetres: EPS, areaSquareMetres: AREA_EPS, volumeCubicMetres: VOLUME_EPS }, limitation: 'CPU admission proves actual imported axis-aligned closed box solids, four ceiling pads, positive thickness rods, envelope and geometric connectivity. It does not prove anchor strength, acoustics, browser performance or visual acceptance.' };
}
