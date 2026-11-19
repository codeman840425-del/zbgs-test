import {Box3, Raycaster, Vector3} from 'three';

const indicators = ['#84e9ba', '#83d6ff', '#ffb775'];
const partNames = ['wall-ac-louver', 'wall-ac-status', 'wall-ac-mount', 'wall-ac-outlet-back'];
const tolerance = .001;
export const wallHvacMountHeight = 2.24;

// Work in the parent room's coordinates so turning a whole floor preserves the installation.
export function wallHvacSpans(facilities, roomId, yaw, centerY, height) {
  const alongAxis = Math.abs(Math.sin(yaw)) < .5 ? 0 : 2;
  return facilities.filter(({node, resource}) =>
    resource.mountRole === 'wall-hvac' && node.parentId === roomId &&
    Math.cos(node.transform.yaw - yaw) > .999999 &&
    Math.abs(node.transform.position[1] - centerY) < (resource.mounting.height + height) / 2 - 1e-8
  ).map(({id, node, resource}) => ({id, offset: node.transform.position[alongAxis], width: resource.mounting.width}));
}

export function validateWallHvacResource(resource, fail, path = resource.id) {
  if (resource.productionBranch !== 'hvac' && resource.mountRole !== 'wall-hvac' && resource.wallHvac === undefined) return;
  const {wallHvac, mounting, stateDefaults, stateSchema, stateSemantics} = resource;
  if (resource.productionBranch !== 'hvac' || resource.mountRole !== 'wall-hvac' || resource.category !== 'dynamic' ||
      resource.mount !== 'wall' || resource.parent !== 'room.wall' || resource.asset?.format !== 'glb' ||
      mounting?.origin !== 'center' || mounting.width !== 1 || mounting.height !== .35 || mounting.depth !== .22 ||
      resource.footprint?.blocking || resource.usePoints?.length || resource.light || resource.movingParts ||
      stateDefaults?.on !== false || stateDefaults.mode !== 1 || Object.keys(stateDefaults).length !== 2 ||
      stateSchema?.on?.type !== 'boolean' || stateSchema.mode?.type !== 'integer' || stateSchema.mode.min !== 1 ||
      stateSchema.mode.max !== 3 || stateSemantics?.on !== 'wall-hvac-enabled-v1' || stateSemantics.mode !== 'wall-hvac-mode-v1')
    fail('invalid-wall-hvac-contract', path, 'Expected a wall-mounted indoor unit with power and three saved modes');
  const angles = wallHvac?.modeRadians;
  if (wallHvac?.louver !== partNames[0] || wallHvac.status !== partNames[1] || !Number.isFinite(wallHvac.closedRadians) ||
      !Array.isArray(angles) || angles.length !== 3 || new Set(angles).size !== 3 ||
      angles.some(angle => !Number.isFinite(angle) || angle === wallHvac.closedRadians ||
        Math.abs(angle - wallHvac.closedRadians) > Math.PI / 2))
    fail('invalid-wall-hvac-louver', path + '.wallHvac', 'Expected closed and three distinct open angles for the physical outlet flap');
}

export function validateWallHvacGeometry(root, resource, fail, path) {
  if (!resource.wallHvac) return;
  const parts = new Map(), meshes = [];
  root.traverse(node => {
    if (node.isMesh && node.geometry?.getAttribute('position')?.count >= 3) {
      let ancestor = node;
      while (ancestor && ancestor.visible) ancestor = ancestor.parent;
      if (!ancestor && [node.material].flat().some(material => material?.visible && material.opacity > 0)) meshes.push(node);
    }
    if (!partNames.includes(node.name)) return;
    if (parts.has(node.name)) fail('duplicate-wall-hvac-part', path + '.' + node.name, 'Expected one part with this name');
    parts.set(node.name, node);
  });
  for (const name of partNames) {
    const part = parts.get(name);
    if (!part || !meshes.some(mesh => part.getObjectById(mesh.id))) fail('missing-wall-hvac-part', path + '.' + name, 'The named part must contain visible geometry');
  }
  const lamp = parts.get(resource.wallHvac.status);
  if (!lamp.isMesh || !lamp.material?.emissive || meshes.some(mesh => mesh !== lamp && [mesh.material].flat().includes(lamp.material)))
    fail('invalid-wall-hvac-indicator', path + '.' + lamp.name, 'The status window needs its own emissive-capable material');
  const mount = new Box3().setFromObject(parts.get('wall-ac-mount'), true);
  if (Math.abs(mount.min.z) > tolerance)
    fail('wall-hvac-mount-gap', path + '.wall-ac-mount', 'The back of the mounting plate must touch the wall plane');
  const pivot = parts.get(resource.wallHvac.louver), {closedRadians, modeRadians} = resource.wallHvac;
  const original = pivot.quaternion.clone();
  if (Math.abs(pivot.rotation.x - closedRadians) > .0001)
    fail('wall-hvac-closed-pose', path + '.' + pivot.name, 'The imported flap must start at the declared closed angle');
  const back = parts.get('wall-ac-outlet-back');
  const duct = new Box3().setFromObject(back, true);
  const center = duct.getCenter(new Vector3());
  const ray = new Raycaster(undefined, new Vector3(0, 0, -1));
  function checkOutlet(expected) {
    root.updateMatrixWorld(true);
    return [.25, .5, .75].map(fraction => {
      ray.ray.origin.set(duct.min.x + fraction * (duct.max.x - duct.min.x), center.y, .45);
      const hit = ray.intersectObjects(meshes, false).find(({object, face}) => {
        const material = Array.isArray(object.material) ? object.material[face.materialIndex] : object.material;
        return material.visible && material.opacity > 0;
      });
      if (!hit || !expected.getObjectById(hit.object.id))
        fail('wall-hvac-outlet-occluded', path + '.' + expected.name, 'The room-facing outlet must reveal the blade when closed and the recessed back when fully open');
      return hit.distance;
    });
  }
  try {
    const closedDepths = checkOutlet(pivot);
    for (const angle of [closedRadians, ...modeRadians]) {
      pivot.rotation.x = angle;
      const box = new Box3().setFromObject(root, true);
      if (box.min.x < -.5 - tolerance || box.max.x > .5 + tolerance || box.min.y < -.175 - tolerance ||
          box.max.y > .175 + tolerance || box.min.z < -tolerance || box.max.z > .22 + tolerance)
        fail('wall-hvac-pose-exceeds-mount', path + '.' + pivot.name, 'The open or closed unit extends outside its installation envelope');
    }
    const largestSwing = modeRadians.reduce((a, b) => Math.abs(b - closedRadians) > Math.abs(a - closedRadians) ? b : a);
    pivot.rotation.x = largestSwing;
    const openDepths = checkOutlet(back);
    if (openDepths.some((depth, index) => depth <= closedDepths[index] + tolerance))
      fail('wall-hvac-outlet-depth', path + '.' + back.name, 'The three open sight lines must reach behind the closed blade');
  } finally {
    pivot.quaternion.copy(original);
    root.updateMatrixWorld(true);
  }
}

export function applyWallHvacState(root, resource, state) {
  if (!resource.wallHvac) return;
  const {louver, status, closedRadians, modeRadians} = resource.wallHvac;
  const mode = state.mode - 1;
  root.getObjectByName(louver).rotation.x = state.on ? modeRadians[mode] : closedRadians;
  const material = root.getObjectByName(status).material;
  material.emissive.set(state.on ? indicators[mode] : '#000000');
  material.emissiveIntensity = state.on ? 1 : 0;
}
