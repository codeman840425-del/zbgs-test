const edges = {
  north: { axis: 0, normal: [0, 0, -1] },
  south: { axis: 0, normal: [0, 0, 1] },
  west: { axis: 2, normal: [-1, 0, 0] },
  east: { axis: 2, normal: [1, 0, 0] },
};
const entranceFields = ['id', 'regionId', 'edge', 'offset', 'width', 'height'];
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const horizontalAxes = [0, 2];
const epsilon = 1e-7;
const cornerReturn = .1;
const interiorInset = .35;
const outwardClearance = .15;

const isRegion = node => node?.kind === 'room' || node?.kind === 'area';
const sideKey = ({ regionId, edge }) => `${regionId}:${edge}`;
const inRange = (number, min, max) => Number.isFinite(number) && number >= min && number <= max;
const shift = (point, direction, distance) => point.map((value, axis) => value + direction[axis] * distance);

export function floorPortalSides(floor) {
  return [...(floor.connections || []).flatMap(connection => [connection.from, connection.to]), ...(floor.exteriorEntrances || [])];
}

function pointInWorld({ position: [px, py, pz], yaw }, [x, y, z]) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return [px + cos * x + sin * z, py + y, pz - sin * x + cos * z];
}

function planBounds(points) {
  return horizontalAxes.map(axis => {
    const coordinates = points.map(point => point[axis]);
    return { min: Math.min(...coordinates), max: Math.max(...coordinates) };
  });
}

function regionPlanBounds(region, world) {
  const { width, depth } = region.bounds;
  const corners = [-1, 1].flatMap(x => [-1, 1].map(z => pointInWorld(world, [x * width / 2, 0, z * depth / 2])));
  return planBounds(corners);
}

function entranceGeometry(entrance, bounds, frame, side) {
  const { offset, width } = entrance;
  const { axis, normal } = side;
  const center = [normal[0] * bounds.width / 2, 0, normal[2] * bounds.depth / 2];
  center[axis] = offset;
  const start = [...center], end = [...center];
  start[axis] -= width / 2;
  end[axis] += width / 2;
  const interior = shift(center, normal, -interiorInset);

  return {
    local: { start, end, center, interior },
    world: {
      start: pointInWorld(frame, start),
      end: pointInWorld(frame, end),
      center: pointInWorld(frame, center),
      interior: pointInWorld(frame, interior),
      normal: pointInWorld({ position: [0, 0, 0], yaw: frame.yaw }, normal),
    },
  };
}

function occupiedPortalSides(floor, floorIds) {
  const sides = new Map();
  if (!Array.isArray(floor.connections)) return sides;
  for (const connection of floor.connections) {
    for (const side of [connection?.from, connection?.to]) {
      if (!side || floorIds.get(side.regionId) !== floor.id || !Object.hasOwn(edges, side.edge) ||
        !Number.isFinite(side.offset) || !Number.isFinite(side.width) || side.width <= 0) continue;
      const key = sideKey(side);
      const intervals = sides.get(key) ?? [];
      intervals.push({ offset: side.offset, width: side.width });
      sides.set(key, intervals);
    }
  }
  return sides;
}

/** Derive single-sided apertures after document region bounds and quarter-turn transforms are validated. */
export function deriveExteriorEntrances({ document, nodes, worlds, floorIds }, fail) {
  const result = new Map();
  const floors = [...nodes.values()].filter(node => node.kind === 'floor');
  for (const floor of floors) {
    if (floor.exteriorEntrances !== undefined && !Array.isArray(floor.exteriorEntrances)) {
      fail('invalid-exterior-entrances', `${floor.id}.exteriorEntrances`, 'Exterior entrances must be an array');
    }
  }
  const entranceFloors = floors.filter(floor => floor.exteriorEntrances?.length);
  if (!entranceFloors.length) return result;

  const identities = new Set([document.id, ...nodes.keys()]);
  for (const floor of floors) {
    if (!Array.isArray(floor.connections)) continue;
    for (const connection of floor.connections) identities.add(connection?.id);
  }
  const regions = [...nodes.values()].filter(isRegion);

  for (const floor of entranceFloors) {
    const occupied = occupiedPortalSides(floor, floorIds);
    const regionPlans = regions.filter(region => floorIds.get(region.id) === floor.id)
      .map(region => ({ id: region.id, bounds: regionPlanBounds(region, worlds.get(region.id)) }));
    for (const [index, entrance] of floor.exteriorEntrances.entries()) {
      const path = `${floor.id}.exteriorEntrances[${index}]`;
      if (!entrance || typeof entrance !== 'object' || Array.isArray(entrance) ||
        Object.keys(entrance).some(field => !entranceFields.includes(field)) ||
        entranceFields.some(field => !Object.hasOwn(entrance, field))) {
        fail('invalid-exterior-entrance', path, 'Expected id, regionId, edge, offset, width and height');
      }
      const { id, regionId, edge, offset, width, height } = entrance;
      if (typeof id !== 'string' || !idPattern.test(id)) {
        fail('invalid-exterior-entrance', `${path}.id`, 'Use a stable nonempty ASCII identifier');
      }
      if (identities.has(id)) {
        fail('duplicate-exterior-entrance-id', `${path}.id`, 'Exterior entrance IDs must be globally unique');
      }
      if (typeof edge !== 'string' || !Object.hasOwn(edges, edge) || !Number.isFinite(offset) ||
        !inRange(width, .8, 2.4) || !inRange(height, 2, 2.6)) {
        fail('invalid-exterior-entrance', path, 'Use a cardinal edge, finite offset, width of .8 to 2.4 m and height of 2 to 2.6 m');
      }
      const region = nodes.get(regionId);
      if (!isRegion(region) || floorIds.get(regionId) !== floor.id) {
        fail('invalid-exterior-entrance-region', `${path}.regionId`, 'The referenced room or public area must belong to this floor');
      }
      const side = edges[edge];
      const span = side.axis === 0 ? region.bounds.width : region.bounds.depth;
      if (Math.abs(offset) + width / 2 + cornerReturn > span / 2 + epsilon) {
        fail('outside-exterior-entrance-edge', path, 'The complete opening needs .1 m of wall at both corners');
      }
      const key = sideKey(entrance);
      const intervals = occupied.get(key) ?? [];
      if (intervals.some(other => Math.abs(other.offset - offset) < (other.width + width) / 2 - epsilon)) {
        fail('overlapping-exterior-entrance', path, 'The opening overlaps another portal on this wall');
      }

      const geometry = entranceGeometry(entrance, region.bounds, worlds.get(regionId), side);
      const { start, end, normal } = geometry.world;
      // Quarter-turn rectangles are axis-aligned in world XZ. The clearance includes the boundary and both endpoints.
      const clearance = planBounds([start, end, shift(start, normal, outwardClearance), shift(end, normal, outwardClearance)]);
      const blocker = regionPlans.find(other => other.id !== regionId && clearance.every(({ min, max }, axis) =>
        min <= other.bounds[axis].max + epsilon && max >= other.bounds[axis].min - epsilon));
      if (blocker) {
        fail('blocked-exterior-entrance', path, `The opening or its .15 m outward clearance touches region ${blocker.id}`, { otherId: blocker.id });
      }

      identities.add(id);
      intervals.push({ offset, width });
      occupied.set(key, intervals);
      result.set(id, { ...entrance, floorId: floor.id, ...geometry });
    }
  }
  return result;
}
