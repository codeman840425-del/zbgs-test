import { CompanyError, deriveCompany, pointInTransform } from './document.js';
import { inspectCompanyConnections } from './space.js';
import {movingFootprint} from './moving-parts.js';

export function inspectCompanyMotionSweep(previous, candidate, catalog, templates) {
  const before=deriveCompany(previous,catalog,templates),after=deriveCompany(candidate,catalog,templates);
  const swept=new Map();
  for(const f of after.facilities.filter(f=>f.resource.movingParts)) {
    const old=before.facilities.find(p=>p.id===f.id);
    if(!old?.resource.movingParts||f.resource.movingParts.every(p=>old.state[p.stateField]===f.state[p.stateField]))continue;
    // Each scene instance can be at a different pose. A private validation-only
    // resource copy prevents one instance's sweep from changing another one.
    swept.set(f.id,movingFootprint(f.resource,old.state,f.state));
  }
  if(!swept.size)return null;
  const document=structuredClone(candidate),validationCatalog=structuredClone(catalog);
  for(const [id,footprint]of swept) {
    const node=document.nodes.find(n=>n.id===id),source=validationCatalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    const resource=structuredClone(source);resource.id=`motion-sweep:${id}`;while(validationCatalog.resources.some(r=>r.id===resource.id&&r.version===resource.version))resource.id+=':validation';resource.footprint=footprint;
    delete resource.movingParts;delete resource.partNodes;delete resource.partPanels;delete resource.partTrays;
    validationCatalog.resources.push(resource);node.resource={id:resource.id,version:resource.version};
    // Moving furniture is standalone in this first motion contract.
    if(node.stationId)throw new CompanyError('unsupported-moving-template',id,'Moving template parts require a separately verified template contract');
  }
  return inspectCompanyPlacement(document,validationCatalog,templates);
}

const RADIUS = 0.25;
const GRID = 0.2;
const PORTAL_MARGIN = 0.1;
const PORTAL_WIDTH = RADIUS * 2 + PORTAL_MARGIN;
const EPSILON = 1e-8;
const fail = (code, path, message, details) => { throw new CompanyError(code, path, message, details); };
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

function roomLocal(world, point) {
  const x = point[0] - world.position[0], z = point[2] - world.position[2];
  return [Math.cos(world.yaw) * x - Math.sin(world.yaw) * z,
    point[1] - world.position[1], Math.sin(world.yaw) * x + Math.cos(world.yaw) * z];
}

function inside(point, bounds, padding) {
  return Math.abs(point[0]) <= bounds.width / 2 - padding + EPSILON &&
    Math.abs(point[2]) <= bounds.depth / 2 - padding + EPSILON;
}

// Segment/slab intersection includes touching. A square radius expansion safely
// contains the requested circular envelope, at the cost of conservative corners.
function intersects(a, b, obstacle, padding = RADIUS) {
  let first = 0, last = 1;
  for (const [axis, coordinate] of [[0, 0], [1, 2]]) {
    const min = obstacle.min[axis] - padding;
    const max = obstacle.max[axis] + padding;
    const delta = b[coordinate] - a[coordinate];
    if (Math.abs(delta) < EPSILON) {
      if (a[coordinate] < min - EPSILON || a[coordinate] > max + EPSILON) return false;
    } else {
      const enter = (min - a[coordinate]) / delta;
      const leave = (max - a[coordinate]) / delta;
      first = Math.max(first, Math.min(enter, leave));
      last = Math.min(last, Math.max(enter, leave));
      if (first > last + EPSILON) return false;
    }
  }
  return true;
}

function gridFor(bounds, obstacles, start) {
  const columns = Math.floor((bounds.width - RADIUS * 2) / GRID + EPSILON) + 1;
  const rows = Math.floor((bounds.depth - RADIUS * 2) / GRID + EPSILON) + 1;
  const points = Array.from({ length: columns * rows }, (_, index) => [
    -bounds.width / 2 + RADIUS + (index % columns) * GRID, 0,
    -bounds.depth / 2 + RADIUS + Math.floor(index / columns) * GRID,
  ]);
  const free = points.map(point => !obstacles.some(obstacle => intersects(point, point, obstacle)));
  const clear = (a, b) => !obstacles.some(obstacle => intersects(a, b, obstacle));
  const connects = (point, index) => free[index] &&
    Math.hypot(point[0] - points[index][0], point[2] - points[index][2]) <= GRID * 2 + EPSILON && clear(point, points[index]);
  const reached = new Set();
  const queue = [];
  for (let index = 0; index < points.length; index++) {
    if (connects(start, index)) { reached.add(index); queue.push(index); }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor], x = index % columns, z = Math.floor(index / columns);
    const neighbours = [];
    if (x > 0) neighbours.push(index - 1);
    if (x + 1 < columns) neighbours.push(index + 1);
    if (z > 0) neighbours.push(index - columns);
    if (z + 1 < rows) neighbours.push(index + columns);
    for (const next of neighbours) {
      if (free[next] && !reached.has(next) && clear(points[index], points[next])) {
        reached.add(next); queue.push(next);
      }
    }
  }
  return { columns, rows, reachableCells: reached.size,
    connected: point => [...reached].some(index => connects(point, index)) };
}

/** Static C1/C2 authoring admission only. Does not create occupancy or actor state. */
export function inspectCompanyPlacement(document, catalog, templates) {
  const derived = deriveCompany(document, catalog, templates);
  const warnings = [
    'C1/C2 static authoring reserve only. Radius 0.25m has no verified C3 character fit.',
    '0.20m four-neighbour grid and square obstacle expansion are conservative. Narrow or diagonal feasible paths may be rejected.',
    'Every grid edge, endpoint connector and portal crossing segment is checked continuously against expanded footprints.',
    'Region boundaries are closed except for declared portals. Same-floor portal and grid connectivity is static conservative admission only.',
    'Contact meshes, actual door hardware, stairs/lifts, vertical travel and real character navigation remain unverified.',
  ];
  const rooms = [], checkedPoints = [];
  const roomNodes = document.nodes.filter(node => ['room', 'area'].includes(node.kind));
  const regions=roomNodes.map(room=>{
    const corners=[-1,1].flatMap(x=>[-1,1].map(z=>pointInTransform(derived.worlds.get(room.id),[x*room.bounds.width/2,0,z*room.bounds.depth/2])));
    return {id:room.id,floorId:derived.floorIds.get(room.id),min:[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[2]))],max:[Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[2]))]};
  });
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
    const a=regions[i],b=regions[j];
    if(a.floorId===b.floorId&&a.min[0]<b.max[0]-EPSILON&&a.max[0]>b.min[0]+EPSILON&&a.min[1]<b.max[1]-EPSILON&&a.max[1]>b.min[1]+EPSILON)
      fail('overlapping-spaces',a.id,'Room and public-area interiors must not overlap',{otherId:b.id});
  }
  const connections = inspectCompanyConnections(document, catalog, templates);
  const portalSides = new Map(roomNodes.map(room => [room.id, []]));
  for (const floor of connections.floors) {
    for (const connection of floor.connections) {
      for (const side of ['from', 'to']) {
        const portal = connection[side];
        if (portal.width < PORTAL_WIDTH - EPSILON)
          fail('narrow-portal', connection.id, 'Static 0.50m envelope requires 0.10m additional total width margin',
            { minimumWidth: PORTAL_WIDTH, actualWidth: portal.width });
        portalSides.get(portal.regionId).push({ connectionId: connection.id, side, portal });
      }
    }
  }
  const checkedPortals = [];
  for (const point of derived.usePoints) {
    if (!point.roomId) fail('missing-use-room', point.id, 'Use-space inspection requires a room or area ancestor');
  }
  for (const room of roomNodes) {
    const world = derived.worlds.get(room.id);
    const explicitEntry = room.entry !== undefined;
    const entry = explicitEntry ? room.entry?.position : [room.bounds.width / 2 - 0.6, 0, room.bounds.depth / 2 - 0.6];
    if (!vector(entry) || Math.abs(entry[1]) > EPSILON || !inside(entry, room.bounds, 0))
      fail('invalid-entry', `${room.id}.entry`, 'Expected finite room-local ground position[3] inside rectangular bounds');
    if (!inside(entry, room.bounds, RADIUS))
      fail('blocked-entry', `${room.id}.entry`, 'Entry envelope intersects the room boundary');
    const obstacles = derived.obstacles.filter(obstacle => obstacle.floorId === derived.floorIds.get(room.id)).map(obstacle => {
      const corners = obstacle.corners.map(corner => roomLocal(world, corner));
      return { id: obstacle.id,
        min: [Math.min(...corners.map(corner => corner[0])), Math.min(...corners.map(corner => corner[2]))],
        max: [Math.max(...corners.map(corner => corner[0])), Math.max(...corners.map(corner => corner[2]))] };
    });
    if (obstacles.some(obstacle => intersects(entry, entry, obstacle)))
      fail('blocked-entry', `${room.id}.entry`, 'Entry envelope intersects a blocking footprint');
    const grid = gridFor(room.bounds, obstacles, entry);
    if (!grid.reachableCells) fail('disconnected-entry', `${room.id}.entry`, 'Entry cannot connect to the conservative static grid');
    const entrySource = explicitEntry ? 'declared room-local test entry' : 'default internal test origin, not a real door';
    rooms.push({ id: room.id, entry: [...entry], entryWorld: pointInTransform(world, entry), entrySource,
      grid: { columns: grid.columns, rows: grid.rows, reachableCells: grid.reachableCells } });
    for (const { connectionId, side, portal } of portalSides.get(room.id)) {
      const { interior, center } = portal.local;
      if (!inside(interior, room.bounds, RADIUS))
        fail('outside-portal-interior', connectionId, 'Portal interior envelope extends beyond its region bounds');
      // Include all obstacles on this floor, also those authored on the opposite
      // side of the shared edge. Only the wall opening exempts the room boundary.
      const blocker = obstacles.find(obstacle => intersects(interior, center, obstacle, RADIUS + PORTAL_MARGIN / 2));
      if (blocker) fail('blocked-portal', connectionId, 'Portal interior-to-boundary segment lacks the static envelope and width margin',
        { regionId: room.id, side, obstacleId: blocker.id });
      if (!grid.connected(interior))
        fail('disconnected-portal', connectionId, 'Portal interior cannot join the room test-origin grid', { regionId: room.id, side });
      checkedPortals.push({ connectionId, side, regionId: room.id, floorId: derived.floorIds.get(room.id),
        width: portal.width, interior: { local: [...interior], world: [...portal.world.interior] },
        center: { local: [...center], world: [...portal.world.center] }, connected: true });
    }
    for (const point of derived.usePoints.filter(candidate => candidate.roomId === room.id)) {
      const facility = derived.facilities.find(candidate => candidate.id === point.facilityId);
      let position = point.position;
      if (position === undefined && facility.resource.id === 'chair' && facility.resource.version === 1 &&
          facility.resource.usePoints.length === 1) {
        position = [0, 0, 0];
        warnings.push(`${point.id} uses the legacy single-chair ground-origin position fallback.`);
      }
      if (!vector(position) || !vector(point.approach) || !vector(point.exit) || point.capacity !== 1)
        fail('missing-use-space', point.id, 'Requires finite position, approach, exit vectors and explicit capacity:1');
      const positions = {};
      for (const [field, value] of [['position', position], ['approach', point.approach], ['exit', point.exit]]) {
        const global = pointInTransform(facility.world, value);
        const local = roomLocal(world, global);
        if (Math.abs(local[1]) > EPSILON)
          fail('unsupported-use-height', `${point.id}.${field}`, 'C1 use-space points must project onto this room ground plane');
        if (!inside(local, room.bounds, RADIUS))
          fail('outside-use-space', `${point.id}.${field}`, 'Static envelope extends beyond its room boundary');
        const relevant = field === 'position' ? obstacles.filter(obstacle => obstacle.id !== facility.id) : obstacles;
        const blocker = relevant.find(obstacle => intersects(local, local, obstacle));
        if (blocker) fail('blocked-use-space', `${point.id}.${field}`, 'Static envelope intersects a blocking footprint', { obstacleId: blocker.id });
        if (field !== 'position' && !grid.connected(local))
          fail('disconnected-use-space', `${point.id}.${field}`, 'No conservative static grid route from this room test origin');
        positions[field] = { local, world: global };
      }
      checkedPoints.push({ id: point.id, facilityId: facility.id, roomId: room.id, capacity: 1, ...positions,
        approachConnected: true, exitConnected: true });
    }
  }
  return { rules: { scope: 'C1/C2 static conservative placement and same-floor portal connectivity', envelopeRadius: RADIUS, gridSpacing: GRID,
    gridNeighbours: 4, obstacleExpansion: 'conservative square', endpointConnectorMaximum: GRID * 2,
    roomRangeMetres: [3, 20], supportedYaw: 'quarter turns', occupancyState: 'not produced',
    portalMinimumWidth: PORTAL_WIDTH, portalTotalWidthMargin: PORTAL_MARGIN,
    portalCrossingEnvelopeRadius: RADIUS + PORTAL_MARGIN / 2, portalInteriorInset: connections.interiorInset },
  rooms, checkedPoints, checkedPortals, warnings };
}
