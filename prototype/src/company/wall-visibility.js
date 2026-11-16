// Display-only wall cutaway calculations.  The document and architecture
// records remain the source of physical dimensions and are never mutated here.

export const WALL_HEIGHT = 2.8;
export const WALL_CENTER_Y = WALL_HEIGHT / 2;

const EPSILON = 1e-7;

function finitePosition(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function wallAxis(wall) {
  return wall.halfSize[0] >= wall.halfSize[1] ? 'x' : 'z';
}

function wallIntervalsOverlap(a, b) {
  const axis = wallAxis(a);
  const along = axis === 'x' ? 0 : 2;
  const aMin = a.center[along] - a.halfSize[axis === 'x' ? 0 : 1];
  const aMax = a.center[along] + a.halfSize[axis === 'x' ? 0 : 1];
  const bMin = b.center[along] - b.halfSize[axis === 'x' ? 0 : 1];
  const bMax = b.center[along] + b.halfSize[axis === 'x' ? 0 : 1];
  return Math.min(aMax, bMax) - Math.max(aMin, bMin) > EPSILON;
}

function sameWallPlane(a, b) {
  if (a.floorId !== b.floorId || wallAxis(a) !== wallAxis(b)) return false;
  const axis = wallAxis(a);
  const normal = axis === 'x' ? 2 : 0;
  const normalGap = Math.abs(a.center[normal] - b.center[normal]);
  // Two room sides can be separated by the architectural wall thickness.
  // Grouping those sides prevents a back-side duplicate from remaining visible.
  return normalGap <= 0.21 && wallIntervalsOverlap(a, b);
}

export function groupWallSegments(walls) {
  const groups = [];
  for (const wall of walls) {
    const group = groups.find(candidate => sameWallPlane(candidate[0], wall));
    if (group) group.push(wall);
    else groups.push([wall]);
  }
  const byId = new Map();
  groups.forEach((group, index) => {
    const id = `wall-group-${index}`;
    for (const wall of group) byId.set(wall.id, id);
  });
  return byId;
}

function segmentIntersectsBox(camera, target, wall) {
  const min = [wall.center[0] - wall.halfSize[0], wall.center[1] - (wall.size?.[1] ?? WALL_HEIGHT) / 2, wall.center[2] - wall.halfSize[1]];
  const max = [wall.center[0] + wall.halfSize[0], wall.center[1] + (wall.size?.[1] ?? WALL_HEIGHT) / 2, wall.center[2] + wall.halfSize[1]];
  let lower = 0;
  let upper = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = target[axis] - camera[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (camera[axis] < min[axis] - EPSILON || camera[axis] > max[axis] + EPSILON) return false;
      continue;
    }
    const first = (min[axis] - camera[axis]) / delta;
    const second = (max[axis] - camera[axis]) / delta;
    const entry = Math.min(first, second);
    const exit = Math.max(first, second);
    lower = Math.max(lower, entry);
    upper = Math.min(upper, exit);
    if (lower - upper > EPSILON) return false;
  }
  return upper >= -EPSILON && lower <= 1 + EPSILON;
}

function worldPoint(world, local) {
  const c = Math.cos(world?.yaw || 0), s = Math.sin(world?.yaw || 0);
  return [
    (world?.position?.[0] || 0) + c * local[0] + s * local[2],
    (world?.position?.[1] || 0) + local[1],
    (world?.position?.[2] || 0) - s * local[0] + c * local[2],
  ];
}

function regionTargets(region, world, derived) {
  const width = region.bounds.width, depth = region.bounds.depth;
  const x = Math.max(0.3, Math.min(width / 2 - 0.3, width * 0.4));
  const z = Math.max(0.3, Math.min(depth / 2 - 0.3, depth * 0.4));
  const targets = [
    [0, 0.85, 0],
    [-x, 0.75, -z], [x, 0.75, -z],
    [-x, 1.1, z], [x, 1.1, z],
  ].map(local => worldPoint(world, local));
  const targetY = (world?.position?.[1] || 0) + 0.9;
  for (const facility of derived.facilities || []) {
    if (facility.roomId === region.id && !['wall','portal','floor-surface'].includes(facility.resource?.mount) && facility.world?.position) {
      targets.push([facility.world.position[0], targetY, facility.world.position[2]]);
    }
  }
  for (const point of derived.usePoints || []) {
    if (point.roomId === region.id && point.world?.position) {
      targets.push([point.world.position[0], targetY, point.world.position[2]]);
    }
  }
  return targets;
}

export function wallViewTargets({ document, derived, floorId, view }) {
  const roomId = view?.mode === 'room' ? view.roomId : null;
  return document.nodes
    .filter(node => ['room', 'area'].includes(node.kind))
    .filter(node => derived.floorIds.get(node.id) === floorId)
    .filter(node => !roomId || node.id === roomId)
    .flatMap(node => regionTargets(node, derived.worlds.get(node.id), derived));
}

export function evaluateWallVisibility({ walls, document, derived, floorId, view, mode = 'full', cameraPosition, groups }) {
  const hiddenGroups = new Set();
  const targets = [];
  const hasCamera = finitePosition(cameraPosition);
  if (mode === 'cutaway' && hasCamera) {
    targets.push(...wallViewTargets({ document, derived, floorId, view }));
    for (const wall of walls) {
      if (targets.some(target => segmentIntersectsBox(cameraPosition, target, wall))) {
        hiddenGroups.add(groups?.get(wall.id) || wall.id);
      }
    }
  }
  return { hiddenGroups, targets, hasCamera, effectiveMode: hiddenGroups.size || (mode === 'cutaway' && hasCamera) ? mode : 'full' };
}

export function wallEdge(yaw) {
  const angle = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (Math.abs(angle) < 1e-6) return 'north';
  if (Math.abs(angle - Math.PI / 2) < 1e-6) return 'west';
  if (Math.abs(angle - Math.PI) < 1e-6) return 'south';
  return 'east';
}
