// Company authoring data. Actor tasks and seat leases remain in the character platform.
export class CompanyError extends Error {
  constructor(code, path, message, details = {}) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'CompanyError'; this.code = code; this.path = path; this.details = details;
  }
}
const fail = (code, path, message, details) => { throw new CompanyError(code, path, message, details); };
const copy = value => structuredClone(value);
const key = ref => `${ref?.id}@${ref?.version}`;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const capacities = {
  'single-room': { floors: 1, rooms: 1, stations: 2 },
  'rental-home': { floors: 1, rooms: 3, stations: 6 },
  'leased-floor': { floors: 1, rooms: 10, stations: 20 },
  'building': { floors: 5, rooms: 50, stations: 100 },
};
const parents = { floor: ['company'], room: ['floor'], area: ['floor'], workstation: ['room'], facility: ['room', 'area', 'floor', 'workstation', 'facility'] };
export const identityTransform = () => ({ position: [0, 0, 0], yaw: 0 });

function checkId(id, path) {
  if (typeof id !== 'string' || !ID.test(id)) fail('invalid-id', path, 'Use a stable nonempty ASCII identifier');
}
function transform(t, path, grounded = false) {
  if (!t || Object.keys(t).some(k => !['position', 'yaw'].includes(k)) ||
      !Array.isArray(t.position) || t.position.length !== 3 || !t.position.every(Number.isFinite) || !Number.isFinite(t.yaw))
    fail('invalid-transform', path, 'Expected finite position[3] and yaw; scaling and pitch/roll are not supported');
  if (t.position.some(n => Math.abs(n) > 1000)) fail('invalid-transform', path, 'Position exceeds the document coordinate limit');
  if (Math.abs(t.yaw / (Math.PI / 2) - Math.round(t.yaw / (Math.PI / 2))) > 1e-8)
    fail('unsupported-rotation', path, 'This schema supports quarter-turn yaw only');
  if (grounded && Math.abs(t.position[1]) > 1e-8) fail('unsupported-height', path, 'Structural and workstation origins must be on their floor');
}
export function composeTransform(parent, local) {
  const [x, y, z] = local.position, [px, py, pz] = parent.position;
  const c = Math.cos(parent.yaw), s = Math.sin(parent.yaw);
  return { position: [px + c * x + s * z, py + y, pz - s * x + c * z], yaw: parent.yaw + local.yaw };
}
export function pointInTransform(world, position) {
  return composeTransform(world, { position, yaw: 0 }).position;
}
function localPoint(world, point) {
  const x = point[0] - world.position[0], z = point[2] - world.position[2];
  return [Math.cos(world.yaw) * x - Math.sin(world.yaw) * z, point[1] - world.position[1], Math.sin(world.yaw) * x + Math.cos(world.yaw) * z];
}
export function catalogMaps(catalog, templates) {
  const resources = new Map(), combinations = new Map();
  for (const [list, map, path] of [[catalog?.resources, resources, 'catalog.resources'], [templates?.templates, combinations, 'templates.templates']]) {
    if (!Array.isArray(list)) fail('invalid-catalog', path, 'Expected an array');
    for (const r of list) {
      checkId(r.id, path); if (!Number.isInteger(r.version) || r.version < 1) fail('invalid-version', path, r.id);
      if (map.has(key(r))) fail('duplicate-resource', path, key(r)); map.set(key(r), r);
    }
  }
  return { resources, combinations };
}

export function deriveCompany(document, catalog, templates) {
  if (document?.schema !== 'company-layout' || document.version !== 1) fail('unsupported-schema', 'document', 'Expected company-layout version 1');
  checkId(document.id, 'document.id');
  if (!Number.isSafeInteger(document.revision) || document.revision < 0) fail('invalid-revision', 'document.revision', 'Expected nonnegative safe integer');
  const capacity = capacities[document.scale];
  if (!capacity) fail('unsupported-scale', 'document.scale', String(document.scale));
  if (document.catalog?.id !== catalog.id || document.catalog?.version !== catalog.version)
    fail('catalog-version-mismatch', 'document.catalog', 'Load the pinned resource catalog');
  if (!Array.isArray(document.nodes)) fail('invalid-nodes', 'document.nodes', 'Expected an array');
  const { resources, combinations } = catalogMaps(catalog, templates);
  const nodes = new Map(), worlds = new Map(), floorIds = new Map(), roomIds = new Map();
  for (const node of document.nodes) {
    checkId(node.id, 'nodes.id');
    if (nodes.has(node.id) || node.id === document.id) fail('duplicate-instance', node.id, 'Instance identity must be globally unique');
    if (!parents[node.kind]) fail('unsupported-kind', node.id, String(node.kind));
    transform(node.transform, `${node.id}.transform`, ['floor', 'room', 'area', 'workstation'].includes(node.kind));
    if (node.name !== undefined && typeof node.name !== 'string') fail('invalid-name', node.id, 'Name must be text');
    nodes.set(node.id, node);
  }
  const visiting = new Set();
  function resolve(node) {
    if (worlds.has(node.id)) return worlds.get(node.id);
    if (visiting.has(node.id)) fail('parent-cycle', node.id, 'Parent graph contains a cycle');
    visiting.add(node.id);
    const parent = node.parentId === document.id ? { kind: 'company' } : nodes.get(node.parentId);
    if (!parent) fail('missing-parent', node.id, String(node.parentId));
    if (!parents[node.kind].includes(parent.kind)) fail('invalid-parent', node.id, `${node.kind} cannot belong to ${parent.kind}`);
    const p = parent.kind === 'company' ? identityTransform() : resolve(parent);
    const world = composeTransform(p, node.transform); worlds.set(node.id, world);
    floorIds.set(node.id, node.kind === 'floor' ? node.id : floorIds.get(parent.id));
    roomIds.set(node.id, ['room', 'area'].includes(node.kind) ? node.id : roomIds.get(parent.id));
    visiting.delete(node.id); return world;
  }
  for (const node of nodes.values()) resolve(node);
  const floors = document.nodes.filter(n => n.kind === 'floor'), rooms = document.nodes.filter(n => n.kind === 'room');
  const stations = document.nodes.filter(n => n.kind === 'workstation');
  if (!floors.length || !rooms.length || floors.length > capacity.floors || rooms.length > capacity.rooms || stations.length > capacity.stations)
    fail('scale-capacity', 'document.scale', 'Floor, business-room or station count exceeds selected tier', { floors: floors.length, rooms: rooms.length, stations: stations.length, capacity });
  for (const room of document.nodes.filter(n => ['room', 'area'].includes(n.kind))) {
    const b = room.bounds;
    if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.depth) || b.width < 1 || b.depth < 1 || b.width > 100 || b.depth > 100)
      fail('invalid-bounds', room.id, 'Expected finite rectangular width/depth between 1 and 100 metres; runtime support is checked separately');
    if (room.kind === 'room') {
      if (!['streaming', 'work', 'rest', 'training'].includes(room.purpose)) fail('invalid-room-purpose', room.id, String(room.purpose));
      const installed = stations.filter(n => n.parentId === room.id).length;
      if (installed > 2 || (room.purpose !== 'streaming' && installed)) fail('room-capacity', room.id, 'At most two streaming stations in a streaming room');
    }
  }
  for (const station of stations) {
    const template = combinations.get(key(station.template));
    if (!template) fail('missing-template-version', station.id, key(station.template));
    const members = document.nodes.filter(n => n.stationId === station.id), byPart = new Map();
    for (const member of members) {
      if (byPart.has(member.partKey)) fail('duplicate-template-part', member.id, member.partKey);
      byPart.set(member.partKey, member);
    }
    for (const part of template.parts) {
      const member = byPart.get(part.key);
      if (!member) fail('missing-template-part', station.id, part.key);
      const expectedParent = part.parentKey ? byPart.get(part.parentKey)?.id : station.id;
      if (member.parentId !== expectedParent) fail('invalid-part-attachment', member.id, `Expected parent ${expectedParent}`);
      const actual = resources.get(key(member.resource)), reference = resources.get(key(part.resource));
      if (!actual || !reference) fail('missing-resource-version', member.id, key(member.resource));
      const role = part.requiredRole || reference.mountRole || reference.id;
      if ((actual.mountRole || actual.id) !== role ||
          JSON.stringify((actual.usePoints || []).map(p => [p.id, p.seatHeight])) !== JSON.stringify((reference.usePoints || []).map(p => [p.id, p.seatHeight])))
        fail('incompatible-template-part', member.id, `Template slot requires ${role} and its declared use-point contract`);
    }
    if (members.length !== template.parts.length) fail('unknown-template-part', station.id, 'Every template part must have exactly one instance');
  }
  const facilities = [], usePoints = [], obstacles = [];
  for (const node of document.nodes.filter(n => n.kind === 'facility')) {
    const resource = resources.get(key(node.resource));
    if (!resource) fail('missing-resource-version', node.id, key(node.resource));
    if (node.stationId && !stations.some(n => n.id === node.stationId)) fail('missing-station', node.id, node.stationId);
    const world = worlds.get(node.id), state = { ...resource.stateDefaults, ...node.state };
    if (resource.mount === 'desk-surface') {
      const parent = nodes.get(node.parentId), surface = resources.get(key(parent?.resource))?.surface;
      if (!surface) fail('missing-mount-surface', node.id, 'This device requires a parent desk surface');
      if (Math.abs(node.transform.position[1] - surface.topY) > .01 ||
          Math.abs(node.transform.position[0]) > surface.halfSize[0] || Math.abs(node.transform.position[2]) > surface.halfSize[1])
        fail('invalid-surface-fit', node.id, 'Device mount origin must be on the declared parent surface');
    }
    for (const [field, value] of Object.entries(node.state || {})) {
      const expected = resource.stateDefaults?.[field];
      if (expected === undefined || typeof value !== typeof expected ||
          (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > 100)))
        fail('invalid-device-state', `${node.id}.state.${field}`, 'State must match declared resource fields and supported numeric bounds');
    }
    const entry = { id: node.id, node, resource, world, state, floorId: floorIds.get(node.id), roomId: roomIds.get(node.id) };
    if (!entry.floorId) fail('missing-floor', node.id, 'Facility must belong to one floor');
    facilities.push(entry);
    const fp = resource.footprint;
    if (fp?.blocking) {
      const corners = [-1, 1].flatMap(x => [-1, 1].map(z => pointInTransform(world, [fp.center[0] + x * fp.halfSize[0], 0, fp.center[1] + z * fp.halfSize[1]])));
      const min = [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[2]))];
      const max = [Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[2]))];
      obstacles.push({ id: node.id, floorId: entry.floorId, min, max, corners, world, footprint: fp });
      const room = nodes.get(entry.roomId);
      if (room) for (const corner of corners) {
        const local = localPoint(worlds.get(room.id), corner);
        if (Math.abs(local[0]) > room.bounds.width / 2 + 1e-8 || Math.abs(local[2]) > room.bounds.depth / 2 + 1e-8)
          fail('outside-room', node.id, `Footprint lies outside ${room.id}`);
      }
    }
    for (const point of resource.usePoints || []) {
      checkId(point.id, `${node.id}.usePoints`);
      const id = `${node.id}#${point.id}`;
      if (usePoints.some(p => p.id === id)) fail('duplicate-use-point', node.id, point.id);
      usePoints.push({ ...point, id, facilityId: node.id, floorId: entry.floorId, roomId: entry.roomId, world });
    }
  }
  for (let i = 0; i < obstacles.length; i++) for (let j = i + 1; j < obstacles.length; j++) {
    const a = obstacles[i], b = obstacles[j];
    if (a.floorId === b.floorId && a.min[0] < b.max[0] - 1e-8 && a.max[0] > b.min[0] + 1e-8 && a.min[1] < b.max[1] - 1e-8 && a.max[1] > b.min[1] + 1e-8)
      fail('overlapping-facilities', a.id, `Blocking footprint overlaps ${b.id}`, { otherId: b.id });
  }
  return { nodes, worlds, floorIds, roomIds, facilities, usePoints, obstacles,
    capacity: { maximum: capacity, installedStations: stations.length, businessRooms: rooms.length, floors: floors.length } };
}

export function createCompany({ id = 'company-demo', name = '双工位公司', width = 9, depth = 7 } = {}, catalog) {
  checkId(id, 'company.id');
  return { schema: 'company-layout', version: 1, id, name, revision: 0, scale: 'single-room', catalog: { id: catalog.id, version: catalog.version }, nodes: [
    { id: `${id}/floor-1`, kind: 'floor', parentId: id, name: '一层', transform: identityTransform() },
    { id: `${id}/room-1`, kind: 'room', parentId: `${id}/floor-1`, name: '直播间', purpose: 'streaming', bounds: { width, depth }, transform: identityTransform() },
  ] };
}
function descendants(nodes, id) {
  const found = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const n of nodes) if (found.has(n.parentId) && !found.has(n.id)) { found.add(n.id); changed = true; } }
  return found;
}
function expandStation(document, op, combinations) {
  const template = combinations.get(key(op.template));
  if (!template) fail('missing-template-version', op.id, key(op.template));
  const station = { id: op.id, kind: 'workstation', parentId: op.parentId, name: op.name || op.id, transform: copy(op.transform || identityTransform()), template: copy(op.template) };
  document.nodes.push(station);
  for (const part of template.parts) document.nodes.push({ id: `${op.id}/${part.key}`, kind: 'facility', stationId: op.id, partKey: part.key,
    parentId: part.parentKey ? `${op.id}/${part.parentKey}` : op.id, resource: copy(part.resource), transform: copy(part.transform), state: copy(part.state || {}) });
}

// Transaction prepares a complete independent candidate. Caller commits only after
// resource loading and character-platform reachability checks also succeed.
export function prepareCompanyChange(document, operations, { catalog, templates, expectedRevision = document.revision, isUsePointBusy = () => false } = {}) {
  if (expectedRevision !== document.revision) fail('revision-conflict', 'document.revision', 'Layout changed since the request was prepared');
  const before = deriveCompany(document, catalog, templates), next = copy(document);
  if (!Array.isArray(operations) || !operations.length) fail('empty-change', 'operations', 'At least one operation is required');
  const { resources, combinations } = catalogMaps(catalog, templates), affected = new Set();
  for (const op of operations) {
    if (op.type === 'add-workstation') { expandStation(next, op, combinations); continue; }
    if (op.type === 'add-facility') { next.nodes.push({ id: op.id, kind: 'facility', parentId: op.parentId, resource: copy(op.resource), transform: copy(op.transform || identityTransform()), state: copy(op.state || {}) }); continue; }
    const node = next.nodes.find(n => n.id === op.id);
    if (!node) fail('missing-instance', op.id, 'Operation target does not exist');
    if (op.type === 'set-state') {
      if (node.kind !== 'facility') fail('invalid-operation', node.id, 'State belongs to a facility');
      node.state = { ...node.state, ...copy(op.state) }; continue;
    }
    const related = descendants(next.nodes, node.id);
    if (op.type !== 'copy-workstation') for (const id of related) affected.add(id);
    if (op.type === 'move') node.transform = copy(op.transform);
    else if (op.type === 'remove') {
      if (node.stationId) fail('required-template-part', node.id, 'Replace a required part or remove the whole workstation');
      next.nodes = next.nodes.filter(n => !related.has(n.id));
    } else if (op.type === 'replace-resource') {
      if (node.kind !== 'facility') fail('invalid-operation', node.id, 'Only facilities reference resources');
      const replacement = resources.get(key(op.resource));
      if (!replacement) fail('missing-resource-version', node.id, key(op.resource));
      const original = resources.get(key(node.resource));
      if ((original.mountRole || original.id) !== (replacement.mountRole || replacement.id) ||
          original.category !== replacement.category || JSON.stringify((original.usePoints || []).map(p => [p.id,p.seatHeight])) !== JSON.stringify((replacement.usePoints || []).map(p => [p.id,p.seatHeight])))
        fail('incompatible-replacement', node.id, 'Replacement changes the facility usage contract');
      node.resource = copy(op.resource); node.state = { ...copy(replacement.stateDefaults), ...node.state };
    } else if (op.type === 'copy-workstation') {
      if (node.kind !== 'workstation') fail('invalid-operation', node.id, 'Copy expects a workstation');
      checkId(op.newId, 'operation.newId');
      if (next.nodes.some(n => n.id === op.newId)) fail('duplicate-instance', op.newId, 'Copy destination already exists');
      const remap = new Map([[node.id, op.newId]]), allocated = new Set(next.nodes.map(n => n.id)); allocated.add(op.newId);
      let serial = 0;
      for (const source of next.nodes.filter(n => related.has(n.id) && n.id !== node.id)) {
        let target = source.stationId === node.id && source.partKey ? `${op.newId}/${source.partKey}` : null;
        if (!target || allocated.has(target)) { do { target = `${op.newId}/extra-${++serial}`; } while (allocated.has(target)); }
        allocated.add(target); remap.set(source.id, target);
      }
      for (const source of next.nodes.filter(n => related.has(n.id))) {
        const clone = copy(source); clone.id = remap.get(source.id); clone.parentId = remap.get(source.parentId) || source.parentId;
        if (clone.stationId) clone.stationId = op.newId;
        if (source.id === node.id) { clone.transform = copy(op.transform || source.transform); clone.name = op.name || op.newId; }
        next.nodes.push(clone);
      }
    } else fail('unknown-operation', 'operations', String(op.type));
  }
  for (const point of before.usePoints) if (affected.has(point.facilityId) && isUsePointBusy(point.id))
    fail('facility-busy', point.facilityId, 'Reserved, occupied or exiting use point prevents this change', { usePointId: point.id });
  next.revision++; const derived = deriveCompany(next, catalog, templates);
  return { document: next, derived, previousRevision: document.revision };
}

export function serializeCompany(document, catalog, templates) {
  deriveCompany(document, catalog, templates); return JSON.stringify(document, null, 2) + '\n';
}
export function restoreCompany(text, catalog, templates) {
  let document; try { document = JSON.parse(text); } catch (error) { fail('invalid-json', 'document', error.message); }
  deriveCompany(document, catalog, templates); return document;
}
