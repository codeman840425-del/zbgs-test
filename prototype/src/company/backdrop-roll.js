import * as THREE from 'three';

const role = 'background-fabric';
const slotY = .11;
const travel = 1.78;
const topY = slotY + travel;
const tolerance = .001;
const names = ['fabric-sheet', 'lift-rail', 'lift-mast'];
const instances = new WeakMap();

// Match a fixed, unversioned functional contract regardless of JSON key order.
function matches(value, expected) {
  if (value === expected) return true;
  if (!value || !expected || typeof value !== 'object' || typeof expected !== 'object' ||
      Array.isArray(value) !== Array.isArray(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(value).length === keys.length && keys.every(key => matches(value[key], expected[key]));
}

export function validateBackdropResource(resource, fail, path = resource?.id || 'resource') {
  if (resource?.mountRole !== role && resource?.productionBranch !== role && resource?.backdropRoll === undefined) return;
  if (resource.mountRole !== role || resource.productionBranch !== role || resource.category !== 'dynamic' ||
      resource.mount !== 'floor-surface' || resource.parent !== 'room.floor' || resource.asset?.format !== 'glb' ||
      !matches(resource.usePoints ?? [], []) || !matches(resource.coordinates, {units:'metres',up:'+Y',forward:'+Z'}))
    fail('invalid-backdrop-contract', path, 'A retractable fabric backdrop requires a floor-mounted dynamic GLB');
  if (!matches(resource.mounting, {width:2.1, height:1.93, depth:.30, origin:'bottom'}) ||
      !matches(resource.footprint, {center:[0, 0], halfSize:[1.05, .15], blocking:true}))
    fail('invalid-backdrop-mount', path, 'The grounded base reserves the same 2.10 脳 0.30 m footprint at every deployment');
  if (!matches(resource.backdropRoll, {slotY, travel}))
    fail('invalid-backdrop-contract', path + '.backdropRoll', 'The fabric feeds through the 0.11 m slot with 1.78 m travel');
  if (!matches(resource.stateDefaults, {deployment:1}) ||
      !matches(resource.stateSchema, {deployment:{type:'number', min:0, max:1}}) ||
      !matches(resource.stateSemantics, {deployment:'backdrop-deployment-fraction'}))
    fail('invalid-backdrop-state', path, 'Expected bounded deployment with 1 fully extended');
}

const bounds = mesh => new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position'));
const near = (a, b) => Math.abs(a - b) <= tolerance;

export function validateBackdropGeometry(root, resource, fail) {
  if (!resource.backdropRoll) return;
  root.updateMatrixWorld(true);
  const targets = new Map();
  const fixed = new THREE.Box3(), housing = [];
  const identity = new THREE.Matrix4();
  root.traverseVisible(mesh => {
    const name = mesh.userData.name || mesh.name;
    if (!names.includes(name)) {
      if (mesh.isMesh && [mesh.material].flat().some(mat => mat.visible && mat.opacity > 0)) {
        housing.push(mesh);
        fixed.union(bounds(mesh).applyMatrix4(mesh.matrixWorld));
      }
      return;
    }
    const path = resource.id + '.' + name;
    if (targets.has(name) || !mesh.isMesh || mesh.isSkinnedMesh || mesh.morphTargetInfluences?.length || mesh.children.length ||
        ![mesh.material].flat().some(mat => mat?.visible && mat.opacity > 0))
      fail('invalid-backdrop-part', path, 'Expected exactly one static leaf mesh with this authored name');
    for (let node = mesh; node; node = node.parent) {
      if (!node.visible || node.matrix.elements.some((v, i) => Math.abs(v - identity.elements[i]) > 1e-6))
        fail('invalid-backdrop-transform', path, 'Bake moving geometry into the facility-local coordinate frame');
      if (node === root) break;
    }
    targets.set(name, mesh);
  });
  for (const name of names) if (!targets.has(name))
    fail('missing-backdrop-part', resource.id + '.' + name, 'No mesh with the required authored name');
  const [sheet, rail, mast] = names.map(name => targets.get(name));
  const sheetBox = bounds(sheet), railBox = bounds(rail), mastBox = bounds(mast);
  if (fixed.isEmpty() || !near(fixed.min.y, 0) || fixed.max.y < slotY - tolerance || fixed.max.y > slotY + .04)
    fail('invalid-backdrop-base', resource.id, 'The fixed housing must reach the slot and clear the backdrop opening');
  const up = new THREE.Vector3(0,1,0), down = new THREE.Vector3(0,-1,0), frontRay = new THREE.Vector3(0,0,-1);
  // The production feet span ±0.64–0.90 m and are at least 0.23 m deep.
  // Probe for actual ground contact fore and aft on each side, without using part names.
  for (const side of [-1, 1]) for (const z of [-.07, .07]) {
    let contactSamples = 0;
    for (let i = 0; i <= 52 && contactSamples < 2; i++) {
      const x = side * (.54 + i * .009);
      const ray = new THREE.Raycaster(new THREE.Vector3(x,-.01,z),up,0,.011);
      if (ray.intersectObjects(housing,false).some(hit => near(hit.point.y,0))) contactSamples++;
    }
    if (contactSamples < 2) fail('invalid-backdrop-feet', resource.id, 'Require ground-bearing surfaces on both sides and across the depth of the base');
  }
  if (!near(sheetBox.min.y, slotY) || !near(sheetBox.max.y, topY) ||
      !near(mastBox.min.y, slotY) || !near(mastBox.max.y, topY))
    fail('invalid-backdrop-travel', resource.id, 'Sheet and telescoping mast must span the complete slot-to-head travel');
  const touchesRail = box => railBox.clone().expandByScalar(tolerance).intersectsBox(box);
  if (railBox.min.y < travel - tolerance || railBox.max.y < topY - tolerance ||
      !touchesRail(sheetBox) || !touchesRail(mastBox))
    fail('invalid-backdrop-rail', resource.id + '.lift-rail', 'Top rail must meet the sheet and mast and clear the floor when lowered');
  const box = new THREE.Box3().setFromObject(root, true);
  if (box.min.x < -1.051 || box.max.x > 1.051 || box.min.y < -tolerance || box.max.y > 1.931 ||
      box.min.z < -.151 || box.max.z > .151)
    fail('backdrop-envelope', resource.id, 'Geometry exceeds the floor installation envelope');
  const geometry = sheet.geometry, vertices = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  if (!uv || uv.itemSize !== 2 || uv.count !== vertices.count || !sheet.material?.isMaterial)
    fail('invalid-backdrop-sheet', resource.id + '.fabric-sheet', 'The continuous fabric needs a single material and per-vertex UVs');
  const levels = new Set();
  for (let i = 0; i < vertices.count; i++) {
    if (!Number.isFinite(uv.getX(i)) || !Number.isFinite(uv.getY(i)))
      fail('invalid-backdrop-sheet', resource.id + '.fabric-sheet', 'Fabric texture coordinates must be finite');
    levels.add(Math.round(vertices.getY(i) * 1e5));
  }
  if (levels.size < 33)
    fail('invalid-backdrop-sheet', resource.id + '.fabric-sheet', 'Expected at least 32 vertical intervals across the fabric travel');
  const center = sheetBox.getCenter(new THREE.Vector3());
  if (sheetBox.max.x-sheetBox.min.x < 1.8-tolerance)
    fail('invalid-backdrop-sheet', resource.id + '.fabric-sheet', 'The authored working face must span at least 1.80 m');
  const mastCenter = mastBox.getCenter(new THREE.Vector3());
  const railAt = (x,z) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x,topY+.06,z),down,0,.10);
    return ray.intersectObject(rail).length > 0;
  };
  if (!railAt(mastCenter.x,mastCenter.z))
    fail('invalid-backdrop-rail', resource.id + '.lift-rail', 'Top rail lacks a physical connection above the mast');
  for (const fraction of [.02,.25,.5,.75,.98]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(mastCenter.x,slotY+travel*fraction,.3),frontRay);
    if (!ray.intersectObject(mast).length)
      fail('invalid-backdrop-travel',resource.id+'.lift-mast','Missing support along the slot-to-rail span');
  }
  for (const xOffset of [-.86,-.43,0,.43,.86]) {
    const x = center.x + xOffset;
    const header = new THREE.Raycaster(new THREE.Vector3(x,topY-.002,.3),frontRay).intersectObject(sheet)[0];
    if (!header || !railAt(x,header.point.z))
      fail('invalid-backdrop-rail', resource.id + '.lift-rail', 'The physical rail must hold the fabric across its working width');

    for (const fraction of [.15, .5, .85]) {
      const origin = new THREE.Vector3(x, slotY + travel * fraction, .3);
      const hit = new THREE.Raycaster(origin, frontRay).intersectObject(sheet)[0];
      if (!hit?.face || hit.face.normal.z <= 0)
        fail('invalid-backdrop-sheet', resource.id + '.fabric-sheet', 'The visible face must cover the opening and face +Z');
      const {a,b,c} = hit.face;
      const uvArea = (uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a)) - (uv.getY(b)-uv.getY(a))*(uv.getX(c)-uv.getX(a));
      if (!(Math.abs(uvArea) > 1e-12)) fail('invalid-backdrop-sheet', resource.id + '.fabric-sheet', 'The sampled fabric surface has collapsed texture coordinates');
    }
  }
}

// Clip each original triangle in material space. Edge intersections interpolate
// every attribute at the same fraction, including UVs on the printed fabric.
function exposedGeometry(source, offset) {
  const p = source.getAttribute('position'), index = source.index;
  const count = index?.count ?? p.count, cut = slotY + offset, samples = [];
  for (let i = 0; i < count; i += 3) {
    const polygon = [];
    for (let j = 0; j < 3; j++) {
      const ia = i + j, ib = i + (j + 1) % 3;
      const a = index ? index.getX(ia) : ia, b = index ? index.getX(ib) : ib;
      const y = p.getY(a), next = p.getY(b);
      if (y >= cut) polygon.push([a, a, 0]);
      if ((y < cut && next > cut) || (y > cut && next < cut))
        polygon.push([a, b, (cut - y) / (next - y)]);
    }
    for (let j = 1; j + 1 < polygon.length; j++) samples.push(polygon[0], polygon[j], polygon[j + 1]);
  }
  const clipped = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    const result = new Float32Array(samples.length * attr.itemSize);
    let i = 0;
    for (const [a, b, t] of samples) for (let c = 0; c < attr.itemSize; c++) {
      const value = attr.getComponent(a, c);
      result[i++] = value + (attr.getComponent(b, c) - value) * t - (name === 'position' && c === 1 ? offset : 0);
    }
    clipped.setAttribute(name, new THREE.BufferAttribute(result, attr.itemSize));
  }
  clipped.computeBoundingBox();
  clipped.computeBoundingSphere();
  return clipped;
}

export function applyBackdropState(root, resource, state) {
  if (!resource.backdropRoll) return;
  const value = state.deployment;
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw Object.assign(new Error('Expected a deployment fraction in [0, 1]'), {code:'invalid-backdrop-state', path:resource.id + '.deployment'});
  let binding = instances.get(root);
  if (!binding) {
    const [sheet, rail, mast] = names.map(name => root.getObjectByName(name));
    binding = {sheet, rail, mast, source:sheet.geometry};
    instances.set(root, binding);
  }
  if (binding.value === value) return;
  const {sheet, rail, mast, source} = binding;
  const offset = travel * (1 - value);
  const next = value === 1 ? source.clone() : exposedGeometry(source, value === 0 ? travel + tolerance : offset);
  if (binding.value !== undefined) sheet.geometry.dispose();
  sheet.geometry = next;
  sheet.visible = value > 0;
  rail.position.y = -offset;
  mast.position.y = slotY * (1 - value);
  mast.scale.y = value;
  mast.visible = value > 0;
  binding.value = value;
  root.updateMatrixWorld(true);
}
