import {deriveExteriorEntrances,floorPortalSides} from './exterior-entrance-data.js';
import {validateWindowResource,deriveWindowOpenings} from './window-data.js';
import {deriveCableConnections} from './cable-data.js';
import {companyScaleProfile,validateScaleProfile} from './scale-profile.js';
// Company authoring data. Actor tasks and seat leases remain in the character platform.
import {validateCeilingAttachments} from './ceiling-acoustic-data.js';
import {compareFacilityFunction} from './appearance-contract.js';
import {validateSupportResource, validateSupportAttachments,effectiveSupportTransform} from './support-data.js';
import {MAKEUP_STORAGE_PROFILE,validateMakeupStorageAttachments} from './makeup-storage-data.js';
import {validateMakeupDrawerAttachments} from './makeup-drawer-data.js';
import {validateMovingResource, validateFacilityState, movingFootprint} from './moving-parts.js';
import {validateClockResource} from './clock-display.js';
import {validateInformationResource,validateInformationAttachments} from './information-display.js';
import {validateMirrorResource} from './mirror-data.js';
import {validateMakeupMirrorAttachments} from './makeup-mirror-data.js';
import {validateVanityResource,validateVanityPlacement} from './vanity-data.js';
import {validateWindowCoverResource,validateWindowCoverAttachments,WINDOW_COVER_SYSTEM} from './window-cover-data.js';
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
  'small-home': { floors: 1, rooms: 1, stations: 2 },
  'single-room': { floors: 1, rooms: 1, stations: 2 },
  'rental-home': { floors: 1, rooms: 3, stations: 6 },
  'leased-floor': { floors: 1, rooms: 10, stations: 20 },
  'building': { floors: 5, rooms: 50, stations: 100 },
};
const parents = {
  floor: ['company'], room: ['floor'], area: ['floor'], workstation: ['room'],
  assembly: ['room', 'area', 'floor', 'assembly'],
  facility: ['room', 'area', 'floor', 'workstation', 'assembly', 'facility'],
};
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
function relativeTransform(parent, world) {
  return { position: localPoint(parent, world.position), yaw: world.yaw - parent.yaw };
}
function validateAppearance(appearance, resource, path) {
  if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance) ||
      Object.keys(appearance).some(field => field !== 'materials'))
    fail('invalid-appearance', path, 'Only a materials map is supported');
  const slots = resource.materialSlots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots) || !Object.keys(slots).length)
    fail('unsupported-appearance', path, 'This resource declares no editable material slots');
  const materials = appearance.materials;
  if (!materials || typeof materials !== 'object' || Array.isArray(materials))
    fail('invalid-appearance', path, 'Expected materials keyed by declared slot ID');
  for (const [slot, values] of Object.entries(materials)) {
    if (!Object.hasOwn(slots, slot)) fail('unknown-material-slot', `${path}.materials.${slot}`, 'Choose a declared resource material slot');
    if (!values || typeof values !== 'object' || Array.isArray(values) ||
        Object.keys(values).some(field => !['color', 'roughness'].includes(field)) ||
        (Object.hasOwn(values, 'color') && (typeof values.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(values.color))) ||
        (Object.hasOwn(values, 'roughness') && (!Number.isFinite(values.roughness) || values.roughness < 0 || values.roughness > 1)))
      fail('invalid-appearance', `${path}.materials.${slot}`, 'Supported fields are #RRGGBB color and finite roughness from 0 to 1');
  }
}

const surfaceKeys = new Set(['floor', 'ceiling', 'north', 'south', 'west', 'east']);
function validateSurfaceResource(resource, path, surface) {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource))
    fail('invalid-surface-resource', path, 'Expected a catalog surface-finish resource');
  if (resource.kind !== 'surface-finish' || resource.mountRole !== 'surface-finish')
    fail('invalid-surface-resource', path, 'Resource must declare kind and mountRole surface-finish');
  if (!resource.coordinates || resource.coordinates.units !== 'metres' || resource.coordinates.up !== '+Y' || resource.coordinates.forward !== '+Z')
    fail('invalid-surface-resource', `${path}.coordinates`, 'Surface resources use metres with +Y up and +Z forward');
  if (!resource.asset || resource.asset.format !== 'glb' || typeof resource.asset.url !== 'string' || typeof resource.asset.sha256 !== 'string')
    fail('invalid-surface-resource', `${path}.asset`, 'Surface resources require a static GLB asset with a content hash');
  const finish = resource.finish;
  if (!finish || typeof finish !== 'object' || Array.isArray(finish) ||
      Object.keys(finish).some(field => !['allowedSurfaces', 'materialNode', 'tileMeters'].includes(field)) ||
      !Array.isArray(finish.allowedSurfaces) ||
      (finish.allowedSurfaces.length !== 1 || !['floor', 'wall', 'ceiling'].includes(finish.allowedSurfaces[0])) ||
      finish.materialNode !== 'finish-surface' || !Array.isArray(finish.tileMeters))
    fail('invalid-surface-resource', path, 'Surface resource finish contract is invalid');
  const defaultTile = finish.tileMeters;
  if (defaultTile.length !== 2 || !defaultTile.every(Number.isFinite) || defaultTile.some(n => n < 0.1 || n > 4))
    fail('invalid-surface-resource', `${path}.finish.tileMeters`, 'Default tileMeters must contain two finite values from 0.1 to 4 metres');
  const expectedSurface = surface === 'ceiling' ? 'ceiling' : surface === 'floor' ? 'floor' : 'wall';
  if (!finish.allowedSurfaces.includes(expectedSurface))
    fail('incompatible-surface-finish', path, `Resource is not allowed on ${expectedSurface}`);
  if (!resource.materialSlots || typeof resource.materialSlots !== 'object' || Array.isArray(resource.materialSlots) ||
      Object.keys(resource.materialSlots).some(slot => slot !== 'finish') ||
      !Array.isArray(resource.materialSlots.finish) ||
      resource.materialSlots.finish.length !== 1 || resource.materialSlots.finish[0] !== 'finish-surface')
    fail('invalid-surface-resource', `${path}.materialSlots`, 'Surface resource must expose the finish-surface material slot');
  if (!resource.stateDefaults || typeof resource.stateDefaults !== 'object' || Array.isArray(resource.stateDefaults) ||
      Object.keys(resource.stateDefaults).length)
    fail('invalid-surface-resource', `${path}.stateDefaults`, 'Surface resources cannot declare state');
  if (resource.footprint?.blocking || (Array.isArray(resource.usePoints) && resource.usePoints.length))
    fail('invalid-surface-resource', path, 'Surface resources cannot declare blocking or interactive behaviour');
  return defaultTile;
}
function validateSurfaceFinish(finish, resources, path, surface) {
  if (!finish || typeof finish !== 'object' || Array.isArray(finish))
    fail('invalid-surface-finish', path, 'Expected a resource reference with optional tileMeters and quarterTurns');
  const fields = Object.keys(finish);
  if (fields.some(field => !['resource', 'tileMeters', 'quarterTurns'].includes(field)))
    fail('invalid-surface-finish', path, 'Unknown surface finish field');
  const resourceRef = finish.resource;
  if (!resourceRef || typeof resourceRef !== 'object' || Array.isArray(resourceRef) ||
      Object.keys(resourceRef).some(field => !['id', 'version'].includes(field)) ||
      typeof resourceRef.id !== 'string' || !Number.isInteger(resourceRef.version) || resourceRef.version < 1)
    fail('invalid-surface-finish', `${path}.resource`, 'Expected a resource ID and version');
  checkId(resourceRef.id, `${path}.resource.id`);
  const resource = resources.get(key(resourceRef));
  if (!resource) fail('missing-resource-version', `${path}.resource`, key(resourceRef));
  const defaultTile = validateSurfaceResource(resource, `${path}.resource`, surface);
  const tileMeters = finish.tileMeters === undefined ? defaultTile : finish.tileMeters;
  if (!Array.isArray(tileMeters) || tileMeters.length !== 2 || !tileMeters.every(Number.isFinite) ||
      tileMeters.some(n => n < 0.1 || n > 4))
    fail('invalid-surface-scale', `${path}.tileMeters`, 'tileMeters must contain two finite values from 0.1 to 4 metres');
  const quarterTurns = finish.quarterTurns === undefined ? 0 : finish.quarterTurns;
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3)
    fail('invalid-surface-rotation', `${path}.quarterTurns`, 'quarterTurns must be an integer from 0 to 3');
  return { resource, tileMeters: [...tileMeters], quarterTurns };
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
  const capacity = companyScaleProfile(document,fail)?.capacity || (Object.hasOwn(capacities, document.scale) && capacities[document.scale]);
  if (!capacity) fail('unsupported-scale', 'document.scale', String(document.scale));
  if (document.catalog?.id !== catalog.id || document.catalog?.version !== catalog.version)
    fail('catalog-version-mismatch', 'document.catalog', 'Load the pinned resource catalog');
  if (!Array.isArray(document.nodes)) fail('invalid-nodes', 'document.nodes', 'Expected an array');
  const { resources, combinations } = catalogMaps(catalog, templates);
  for (const resource of resources.values()) { validateSupportResource(resource, fail); validateMovingResource(resource, fail); validateClockResource(resource, fail); validateInformationResource(resource, fail); validateMirrorResource(resource, fail); validateVanityResource(resource, fail); validateWindowResource(resource,fail); validateWindowCoverResource(resource,fail); }
  const nodes = new Map(), worlds = new Map(), localTransforms = new Map(), floorIds = new Map(), roomIds = new Map();
  for (const node of document.nodes) {
    checkId(node.id, 'nodes.id');
    if (nodes.has(node.id) || node.id === document.id) fail('duplicate-instance', node.id, 'Instance identity must be globally unique');
    if (!Object.hasOwn(parents,node.kind)) fail('unsupported-kind', node.id, String(node.kind));
    if (node.finishes !== undefined && !['room', 'area'].includes(node.kind))
      fail('invalid-surface-owner', `${node.id}.finishes`, 'Only a room or area may own surface finishes');
    if (node.exteriorEntrances !== undefined && node.kind !== 'floor')
      fail('invalid-exterior-entrance-owner', `${node.id}.exteriorEntrances`, 'Only a floor may own exterior entrance records');
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
    const local=effectiveSupportTransform(node,parent,resources.get(key(parent.resource)));
    localTransforms.set(node.id,local);
    const world = composeTransform(p, local); worlds.set(node.id, world);
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
    if (!b || (b.shape !== undefined && b.shape !== 'rectangle') ||
        !Number.isFinite(b.width) || !Number.isFinite(b.depth) || b.width < 3 || b.depth < 3 || b.width > 20 || b.depth > 20)
      fail('invalid-bounds', room.id, 'Only rectangular width/depth from 3 to 20 metres are supported; this static range does not verify character reachability');
    if (room.kind === 'room') {
      if (!['streaming', 'work', 'rest', 'training'].includes(room.purpose)) fail('invalid-room-purpose', room.id, String(room.purpose));
      const installed = stations.filter(n => n.parentId === room.id).length;
      if (installed > 2 || (room.purpose !== 'streaming' && installed)) fail('room-capacity', room.id, 'At most two streaming stations in a streaming room');
    }
  }
  const exteriorEntrances=deriveExteriorEntrances({document,nodes,worlds,floorIds},fail);
  const surfaceFinishes = [];
  for (const region of document.nodes.filter(n => ['room', 'area'].includes(n.kind))) {
    if (region.finishes === undefined) continue;
    if (!region.finishes || typeof region.finishes !== 'object' || Array.isArray(region.finishes))
      fail('invalid-surface-finishes', `${region.id}.finishes`, 'Expected an object keyed by floor or wall direction');
    for (const surface of Object.keys(region.finishes)) {
      if (!surfaceKeys.has(surface)) fail('invalid-surface-key', `${region.id}.finishes.${surface}`, 'Use floor, ceiling, north, south, west or east');
      const checked = validateSurfaceFinish(region.finishes[surface], resources, `${region.id}.finishes.${surface}`, surface);
      surfaceFinishes.push({ id: `${region.id}#finish:${surface}`, regionId: region.id,
        floorId: floorIds.get(region.id), surface, resource: checked.resource,
        tileMeters: checked.tileMeters, quarterTurns: checked.quarterTurns });
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
  const facilities = [], usePoints = [], obstacles = [], portalMounts=new Set();
  for (const node of document.nodes.filter(n => n.kind === 'facility')) {
    const resource = resources.get(key(node.resource));
    if (!resource) fail('missing-resource-version', node.id, key(node.resource));
    if (resource.kind === 'surface-finish' || resource.mountRole === 'surface-finish')
      fail('surface-finish-as-facility', node.id, 'Surface finish resources are selected on a room or area surface');
    if (node.appearance !== undefined) validateAppearance(node.appearance, resource, `${node.id}.appearance`);
    if (node.stationId && !stations.some(n => n.id === node.stationId)) fail('missing-station', node.id, node.stationId);
    const world = worlds.get(node.id), state = { ...resource.stateDefaults, ...node.state };
    if (resource.footprint?.blocking && !['desk-surface','wall'].includes(resource.mount) &&
        Math.abs(world.position[1] - worlds.get(floorIds.get(node.id)).position[1]) > 1e-8)
      fail('unsupported-height', node.id, 'This ground facility must stay on its floor; use a declared mounting adapter for elevated placement');
    if (resource.mount === 'desk-surface') {
      const parent = nodes.get(node.parentId), surface = resources.get(key(parent?.resource))?.surface;
      if (!surface) fail('missing-mount-surface', node.id, 'This device requires a parent desk surface');
      if (Math.abs(node.transform.position[1] - surface.topY) > .01 ||
          Math.abs(node.transform.position[0]) > surface.halfSize[0] || Math.abs(node.transform.position[2]) > surface.halfSize[1])
        fail('invalid-surface-fit', node.id, 'Device mount origin must be on the declared parent surface');
    }
    if(resource.mount==='window-cover'){
      if(node.parentId===undefined||!node.attachment||node.attachment.windowId!==node.parentId)
        fail('invalid-window-cover-attachment',node.id,'Window cover must declare attachment.windowId equal to its parent window');
    }
    if (['wall','wall-opening','portal','portal-door','floor-surface'].includes(resource.mount)) {
      const region=nodes.get(node.parentId),spec=resource.mounting;
      if(!['room','area'].includes(region?.kind)||!spec||
        ![spec.width,spec.height,spec.depth].every(v=>Number.isFinite(v)&&v>0))
        fail('missing-mount-region',node.id,'Architectural display needs a room/area parent and finite mounting envelope');
      const [x,y,z]=node.transform.position,angle=((node.transform.yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
      const edge=Math.abs(angle)<1e-6?'north':Math.abs(angle-Math.PI/2)<1e-6?'west':Math.abs(angle-Math.PI)<1e-6?'south':'east';
      const horizontal=['north','south'].includes(edge),span=horizontal?region.bounds.width:region.bounds.depth;
      const along=horizontal?x:z,normal=horizontal?z:x;
      if(resource.mount==='floor-surface') {
        const swapped=Math.abs(Math.sin(angle))>.5,halfX=(swapped?spec.depth:spec.width)/2,halfZ=(swapped?spec.width:spec.depth)/2;
        if(Math.abs(y)>.001||Math.abs(x)+halfX>region.bounds.width/2-.1+.001||Math.abs(z)+halfZ>region.bounds.depth/2-.1+.001)
          fail('invalid-floor-fit',node.id,'Floor covering must be grounded and fit inside the existing walls');
      } else if(resource.mount==='portal-door') {
        const floor=nodes.get(floorIds.get(node.id)), portals=floorPortalSides(floor).filter(p=>p.regionId===region.id&&p.edge===edge&&p.height!==undefined);
        const portal=portals.find(p=>Math.abs(p.offset-along)<.001&&Math.abs(p.width-spec.apertureWidth)<.001&&Math.abs(p.height-spec.apertureHeight)<.001);
        const plane=(['north','west'].includes(edge)?-1:1)*((horizontal?region.bounds.depth:region.bounds.width)/2-.1);
        if(Math.abs(y)>.001||Math.abs(normal-plane)>.001||!portal)fail('invalid-portal-door-fit',node.id,'Door leaf must match an explicit exterior entrance and its clear size');
        const duplicate=facilities.some(entry=>entry.resource.mount==='portal-door'&&entry.roomId===region.id&&
          Math.abs(entry.node.transform.position[0]-x)<.001&&Math.abs(entry.node.transform.position[2]-z)<.001&&
          Math.abs(entry.node.transform.yaw-node.transform.yaw)<.001);
        if(duplicate)fail('duplicate-portal-door',node.id,'One door leaf may be installed per exterior entrance');
      } else {
        const plane=(['north','west'].includes(edge)?-1:1)*((horizontal?region.bounds.depth:region.bounds.width)/2-.1);
        const low=spec.origin==='center'?y-spec.height/2:y;
        if(Math.abs(normal-plane)>.001||Math.abs(along)+spec.width/2>span/2-.001||low<-.001||low+spec.height>2.8+.001)
          fail('invalid-wall-fit',node.id,'Display back plane, height and width must fit its wall interior face');
        const floor=nodes.get(floorIds.get(node.id)),portals=floorPortalSides(floor).filter(p=>p.regionId===region.id&&p.edge===edge);
        if(resource.mount==='portal') {
          const portal=portals.find(p=>Math.abs(p.offset-along)<.001&&Math.abs(p.width-spec.apertureWidth)<.001&&(p.height===undefined||Math.abs(p.height-spec.apertureHeight)<.001));
          if(Math.abs(y)>.001||!portal)fail('invalid-portal-fit',node.id,'Door frame must match an existing portal position and clear size');
          if(portals.some(p=>p!==portal&&Math.abs(p.offset-along)<(p.width+spec.width)/2-.001))
            fail('portal-frame-overlap',node.id,'The frame must not intrude into another doorway');
          if(resource.mountRole==='door-frame'){
            const binding=`${region.id}:${edge}:${portal.offset}`;
            if(portal.height!==undefined&&portalMounts.has(binding))fail('duplicate-door-frame',node.id,'One frame per side of a real doorway');
            portalMounts.add(binding);
          }
        } else if(portals.some(p=>Math.abs(p.offset-along)<(p.width+spec.width)/2-.001))
          fail('wall-display-over-portal',node.id,'Wall display cannot cover a real portal');
      }
    }
    validateFacilityState(resource, node.state || {}, fail, `${node.id}.state`);
    const entry = { id: node.id, node, resource, world, state, floorId: floorIds.get(node.id), roomId: roomIds.get(node.id) };
    if (!entry.floorId) fail('missing-floor', node.id, 'Facility must belong to one floor');
    facilities.push(entry);
    const fp = movingFootprint(resource, state);
    if (fp?.blocking) {
      const corners = [-1, 1].flatMap(x => [-1, 1].map(z => pointInTransform(world, [fp.center[0] + x * fp.halfSize[0], 0, fp.center[1] + z * fp.halfSize[1]])));
      const min = [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[2]))];
      const max = [Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[2]))];
      obstacles.push({ id: node.id, floorId: entry.floorId, min, max, corners, world, resource, footprint: fp });
      const room = nodes.get(entry.roomId);
      if (room && resource.mount!=='portal-door') for (const corner of corners) {
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
  validateScaleProfile(document,{floors,rooms,stations,floorIds,roomIds},fail);
  const windowOpenings=deriveWindowOpenings({nodes,worlds,floorIds,facilities},fail);
  validateWindowCoverAttachments(nodes,facilities,fail);
  const cableConnections=deriveCableConnections({nodes,facilities},fail);
  validateCeilingAttachments({nodes,facilities},fail);
  validateSupportAttachments(nodes, resources, fail);
  validateMakeupMirrorAttachments(nodes, resources, fail);
  validateMakeupStorageAttachments(nodes,resources,fail);
  validateMakeupDrawerAttachments(nodes,resources,fail);
  validateInformationAttachments(nodes, resources, fail);
  const vanityClearances=validateVanityPlacement({nodes,worlds,floorIds,roomIds,facilities,obstacles},fail);
  return { nodes, worlds, localTransforms, floorIds, roomIds, facilities, usePoints, obstacles, surfaceFinishes,
    vanityClearances,cableConnections,windowOpenings,exteriorEntrances,
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
function copySubtree(document, node, op, related) {
  checkId(op.newId, 'operation.newId');
  const allocated = new Set([document.id, ...document.nodes.map(n => n.id)]);
  if (allocated.has(op.newId)) fail('duplicate-instance', op.newId, 'Copy destination already exists');
  const sources = document.nodes.filter(n => related.has(n.id));
  const remap = new Map([[node.id, op.newId]]);
  allocated.add(op.newId);
  let serial = 0;
  for (const source of sources.filter(n => n.id !== node.id)) {
    let target = source.stationId === node.id && source.partKey ? `${op.newId}/${source.partKey}` : null;
    if (!target || allocated.has(target)) {
      do { target = `${op.newId}/extra-${++serial}`; } while (allocated.has(target));
    }
    allocated.add(target); remap.set(source.id, target);
  }
  for (const source of sources) {
    const clone = copy(source);
    clone.id = remap.get(source.id);
    clone.parentId = remap.get(source.parentId) || source.parentId;
    if (clone.stationId) clone.stationId = remap.get(clone.stationId) || clone.stationId;
    if(clone.cableLink)for(const endpoint of Object.values(clone.cableLink)){
      if(!remap.has(endpoint.deviceId))fail('partial-cable-copy',source.id,'Copy the common desk including both devices and cable');
      endpoint.deviceId=remap.get(endpoint.deviceId);
    }
    if (source.id === node.id) {
      if (op.type==='copy-facility'&&op.parentId!==undefined) clone.parentId=op.parentId;
      clone.transform = copy(op.transform || source.transform);
      clone.name = op.name || op.newId;
    }
    document.nodes.push(clone);
  }
}
function unpack(document, node, derived) {
  const parentWorld = derived.worlds.get(node.parentId);
  const related = descendants(document.nodes, node.id);
  for (const member of document.nodes) {
    if (member.parentId === node.id) {
      member.parentId = node.parentId;
      member.transform = relativeTransform(parentWorld, derived.worlds.get(member.id));
    }
    if (node.kind === 'workstation' && related.has(member.id)) {
      delete member.stationId;
      delete member.partKey;
    }
  }
  document.nodes = document.nodes.filter(n => n.id !== node.id);
}
function groupFacilities(document, op, derived, affected) {
  checkId(op.id, 'operation.id');
  if (op.id === document.id || derived.nodes.has(op.id)) fail('duplicate-instance', op.id, 'Group identity already exists');
  if (op.parentId === op.id) fail('parent-cycle', op.id, 'A group cannot parent itself');
  const parent = derived.nodes.get(op.parentId);
  if (!parent) fail('missing-parent', op.id, String(op.parentId));
  if (!parents.assembly.includes(parent.kind)) fail('invalid-parent', op.id, 'Groups belong to a floor, room, area or another group');
  if (!Array.isArray(op.memberIds) || !op.memberIds.length || new Set(op.memberIds).size !== op.memberIds.length)
    fail('invalid-group-selection', op.id, 'Select distinct component roots');
  const members = op.memberIds.map(id => {
    const member = derived.nodes.get(id);
    if (!member) fail('missing-instance', op.id, String(id));
    if (!['facility', 'assembly'].includes(member.kind)) fail('invalid-group-member', id, 'Only facilities and authoring groups can be grouped');
    const related = descendants(document.nodes, id);
    if (op.memberIds.some(other => other !== id && related.has(other)))
      fail('invalid-group-selection', id, 'A selection cannot include both an ancestor and its descendant');
    if (related.has(parent.id)) fail('parent-cycle', id, 'The group parent cannot be inside a selected component');
    if (document.nodes.some(n => related.has(n.id) && n.stationId))
      fail('required-template-part', id, 'Unpack the workstation before regrouping its template members');
    if (derived.floorIds.get(id) !== derived.floorIds.get(parent.id)) fail('cross-floor-group', id, 'Group members must remain on their current floor');
    if (derived.roomIds.get(id) !== derived.roomIds.get(parent.id)) fail('cross-room-group', id, 'Group members must remain in their current room or public area');
    for (const descendant of related) affected.add(descendant);
    return member;
  });
  const group = { id: op.id, kind: 'assembly', parentId: parent.id, name: op.name || op.id, transform: copy(op.transform || identityTransform()) };
  transform(group.transform, `${group.id}.transform`);
  const world = composeTransform(derived.worlds.get(parent.id), group.transform);
  for (const member of members) {
    member.parentId = group.id;
    member.transform = relativeTransform(world, derived.worlds.get(member.id));
  }
  document.nodes.push(group);
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
    if (op.type === 'add-room' || op.type === 'add-area') {
      const node = { id: op.id, kind: op.type === 'add-room' ? 'room' : 'area', parentId: op.parentId,
        name: op.name ?? op.id, bounds: copy(op.bounds), transform: copy(op.transform || identityTransform()) };
      if (node.kind === 'room') node.purpose = op.purpose ?? 'streaming';
      next.nodes.push(node); continue;
    }
    if (op.type === 'add-facility') {
      const node = { id: op.id, kind: 'facility', parentId: op.parentId, resource: copy(op.resource), transform: copy(op.transform || identityTransform()), state: copy(op.state || {}) };
      if (op.appearance !== undefined) node.appearance = copy(op.appearance);
      if (op.attachment !== undefined) node.attachment = copy(op.attachment);
      if (op.cableLink !== undefined) node.cableLink = copy(op.cableLink);
      next.nodes.push(node); continue;
    }
    if (op.type === 'group-facilities') { groupFacilities(next, op, deriveCompany(next, catalog, templates), affected); continue; }
    const node = next.nodes.find(n => n.id === op.id);
    if (!node) fail('missing-instance', op.id, 'Operation target does not exist');
    if (op.type === 'set-surface-finish') {
      if (!['room', 'area'].includes(node.kind)) fail('invalid-operation', node.id, 'Surface finishes belong to a room or area');
      if (!surfaceKeys.has(op.surface)) fail('invalid-surface-key', `${node.id}.finishes`, 'Use floor, ceiling, north, south, west or east');
      if (!Object.hasOwn(op, 'finish')) fail('invalid-surface-finish', `${node.id}.finishes.${op.surface}`, 'Provide a finish value or null to clear it');
      if (op.finish === null) {
        if (node.finishes) {
          delete node.finishes[op.surface];
          if (!Object.keys(node.finishes).length) delete node.finishes;
        }
      } else {
        if (!node.finishes) node.finishes = {};
        node.finishes[op.surface] = copy(op.finish);
      }
      continue;
    }
    if (op.type === 'set-state') {
      if (node.kind !== 'facility') fail('invalid-operation', node.id, 'State belongs to a facility');
      if(resources.get(key(node.resource))?.movingParts)for(const id of descendants(next.nodes,node.id))affected.add(id);
      validateFacilityState(resources.get(key(node.resource)),op.state,fail,`${node.id}.state`);
      node.state = { ...node.state, ...copy(op.state) }; continue;
    }
    const related = descendants(next.nodes, node.id);
    if (!['copy-workstation', 'copy-group','copy-facility'].includes(op.type)) for (const id of related) affected.add(id);
    if (op.type === 'move') node.transform = copy(op.transform);
    else if(op.type==='set-exterior-entrances'){
      if(node.kind!=='floor'||!Array.isArray(op.entrances))fail('invalid-exterior-entrances',op.id,'Exterior entrances belong to an existing floor');
      node.exteriorEntrances=copy(op.entrances);
    }
    else if(op.type==='attach-window-cover'){
      if(node.kind!=='facility'||resources.get(key(node.resource))?.mount!=='window-cover')fail('invalid-window-cover-attachment',node.id,'Only a window-cover facility can be rebound to a window');
      const target=next.nodes.find(candidate=>candidate.id===op.windowId),targetResource=target&&resources.get(key(target.resource));
      if(!target||target.kind!=='facility'||!targetResource?.windowSystem)fail('invalid-window-cover-attachment',op.windowId,'Target must be a real window facility');
      node.parentId=op.windowId;node.attachment={windowId:op.windowId};node.transform={position:[0,0,.13],yaw:0};
    }
    else if (op.type === 'attach-surface') {
      if (node.kind !== 'facility' || resources.get(key(node.resource))?.mount !== 'support-surface')
        fail('invalid-support-attachment', node.id, 'Only support-surface props can be reattached');
      node.parentId = op.parentId;
      node.attachment = {surfaceId: op.surfaceId};
      node.transform = copy(op.transform);
    }
    else if (op.type === 'set-room') {
      if (!['room', 'area'].includes(node.kind)) fail('invalid-operation', node.id, 'Room fields belong to a room or public area');
      const fields = Object.keys(op).filter(field => !['type', 'id'].includes(field));
      if (!fields.length || fields.some(field => !['name', 'purpose', 'bounds'].includes(field)) ||
          (node.kind === 'area' && fields.includes('purpose')))
        fail('invalid-room-change', node.id, 'Only name, room purpose and rectangular bounds can be edited here');
      for (const field of fields) node[field] = copy(op[field]);
    } else if (op.type === 'set-appearance') {
      if (node.kind !== 'facility') fail('invalid-operation', node.id, 'Material appearance belongs to a facility');
      if (op.appearance === undefined) fail('invalid-appearance', node.id, 'Provide an appearance replacement or {} to clear it');
      if (op.appearance && typeof op.appearance === 'object' && !Array.isArray(op.appearance) && !Object.keys(op.appearance).length)
        delete node.appearance;
      else node.appearance = copy(op.appearance);
    } else if (op.type === 'unpack-workstation' || op.type === 'unpack-group') {
      const expectedKind = op.type === 'unpack-workstation' ? 'workstation' : 'assembly';
      if (node.kind !== expectedKind) fail('invalid-operation', node.id, `Unpack expects ${expectedKind}`);
      unpack(next, node, deriveCompany(next, catalog, templates));
    } else if (op.type === 'remove') {
      if (node.stationId) fail('required-template-part', node.id, 'Replace a required part or remove the whole workstation');
      next.nodes = next.nodes.filter(n => !related.has(n.id));
    } else if (op.type === 'replace-resource') {
      if (node.kind !== 'facility') fail('invalid-operation', node.id, 'Only facilities reference resources');
      const replacement = resources.get(key(op.resource));
      if (!replacement) fail('missing-resource-version', node.id, key(op.resource));
      const original = resources.get(key(node.resource));
      const compatibility = compareFacilityFunction(original, replacement);
      if (!compatibility.compatible)
        fail('incompatible-replacement', `${node.id}.resource.${compatibility.differences[0].field}`,
          'Appearance replacement must preserve every functional field', {differences: compatibility.differences});
      node.state = { ...copy(original.stateDefaults), ...node.state };
      node.resource = copy(op.resource);
    } else if (op.type === 'copy-workstation' || op.type === 'copy-group'||op.type==='copy-facility') {
      const expectedKind = op.type === 'copy-workstation' ? 'workstation' : op.type==='copy-facility'?'facility':'assembly';
      if (node.kind !== expectedKind) fail('invalid-operation', node.id, `Copy expects ${expectedKind}`);
      copySubtree(next, node, op, related);
    } else fail('unknown-operation', 'operations', String(op.type));
  }
  for (const point of before.usePoints) if (affected.has(point.facilityId) && isUsePointBusy(point.id))
    fail('facility-busy', point.facilityId, 'Reserved, occupied or exiting use point prevents this change', { usePointId: point.id });
  next.revision++; const derived = deriveCompany(next, catalog, templates);
  // Legacy interior duplicate frames remain loadable/removable, but edits cannot create new overlapping pairs.
  const framePairs=facilities=>{
    const frames=facilities.filter(f=>f.resource.mountRole==='door-frame'),pairs=new Set();
    for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
      const a=frames[i].node,b=frames[j].node;
      if(a.parentId===b.parentId&&Math.abs(Math.sin((a.transform.yaw-b.transform.yaw)/2))<1e-6&&a.transform.position.every((v,k)=>Math.abs(v-b.transform.position[k])<.001))pairs.add(JSON.stringify([a.id,b.id].sort()));
    }
    return pairs;
  };
  const oldFramePairs=framePairs(before.facilities);
  for(const pair of framePairs(derived.facilities))if(!oldFramePairs.has(pair))fail('duplicate-door-frame',JSON.parse(pair)[0],'One frame per side of a real doorway');
  for(const current of derived.facilities.filter(f=>f.resource.movingParts&&f.resource.movingProfile!==MAKEUP_STORAGE_PROFILE)) {
    const previous=before.facilities.find(f=>f.id===current.id);
    if(!previous?.resource.movingParts||current.resource.movingParts.every(p=>previous.state[p.stateField]===current.state[p.stateField]))continue;
    const fp=movingFootprint(current.resource,previous.state,current.state);
    const corners=[-1,1].flatMap(x=>[-1,1].map(z=>pointInTransform(current.world,[fp.center[0]+x*fp.halfSize[0],0,fp.center[1]+z*fp.halfSize[1]])));
    const min=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[2]))],max=[Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[2]))];
    for(const other of derived.obstacles)if(other.id!==current.id&&other.floorId===current.floorId&&min.every((n,i)=>n<other.max[i]-1e-8&&max[i]>other.min[i]+1e-8))
      fail('blocked-moving-part',current.id,`Movement sweep overlaps ${other.id}`,{otherId:other.id});
    const room=derived.nodes.get(current.roomId);
    if(room&&current.resource.mount!=='portal-door')for(const corner of corners){const p=localPoint(derived.worlds.get(room.id),corner);if(Math.abs(p[0])>room.bounds.width/2-.1+1e-8||Math.abs(p[2])>room.bounds.depth/2-.1+1e-8)
      fail('blocked-moving-part',current.id,'Movement sweep reaches the room wall');}
  }
  return { document: next, derived, previousRevision: document.revision };
}

export function serializeCompany(document, catalog, templates) {
  deriveCompany(document, catalog, templates); return JSON.stringify(document, null, 2) + '\n';
}
export function restoreCompany(text, catalog, templates) {
  let document; try { document = JSON.parse(text); } catch (error) { fail('invalid-json', 'document', error.message); }
  deriveCompany(document, catalog, templates); return document;
}
