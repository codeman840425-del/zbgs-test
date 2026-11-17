import { createCompany, identityTransform, prepareCompanyChange } from './document.js';
import { inspectCompanyConnections } from './space.js';
import { inspectCompanyPlacement } from './placement.js';
import { COMPANY_SPACE_V2, MAX_CONFIGURED_FLOORS } from './scale-profile.js';

// The v2 scale grammar keeps the old rectangular authoring primitives. A room
// is either one 18 m² A (4.5 x 4) or two A (6 x 6). Public areas are separate
// regions so an unconfigured workstation never removes a room from a floor.
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const PURPOSES = new Set(['streaming', 'work', 'rest', 'training']);
const REQUIRED_ROOMS = { 'small-home': 1, 'single-room': 1, 'rental-home': 3, 'leased-floor': 16, building: 16 };
const PUBLIC_ROLES = ['corridor', 'lobby', 'lift-access', 'stair-access', 'restroom-access'];
const epsilon = 1e-7;

const fail = (code, path, message, details = {}) => {
  const error = new Error(`${code} at ${path}: ${message}`);
  error.name = 'CompanyScaleV2Error'; error.code = code; error.path = path; error.details = details;
  throw error;
};
const checkId = (value, path) => {
  if (typeof value !== 'string' || !ID.test(value)) fail('invalid-id', path, 'Use a stable nonempty ASCII identifier');
};
const knownFields=(value,fields,path)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))fail('invalid-space-input',path,'Unknown field or invalid object; use the documented input grammar');
};
const text = (value, path) => {
  if (value !== undefined && typeof value !== 'string') fail('invalid-space-input', path, 'Name must be text');
};
const transform = (position, yaw = 0) => ({ position, yaw });
const ref = resource => ({ id: resource.id, version: resource.version });

function region(document, floor, { id, kind = 'room', name, purpose, publicRole, width, depth, position, entry }) {
  checkId(id, `${floor.id}.region.id`); text(name, `${floor.id}.${id}.name`);
  const node = { id: `${floor.id}/${id}`, kind, parentId: floor.id,
    name: name ?? id, bounds: { width, depth }, transform: transform(position) };
  if (kind === 'room') node.purpose = purpose;
  if (publicRole) node.publicRole = publicRole;
  if (entry) node.entry = { position: entry };
  document.nodes.push(node);
  return node;
}

function connect(floor, id, from, to, width = 1.4) {
  floor.connections.push({ id: `${floor.id}/${id}`, from: { ...from, width }, to: { ...to, width } });
}

function addPublicAreas(document, floor) {
  const corridorSegments = Array.from({ length: 3 }, (_, index) => region(document, floor, {
    id: `corridor-${index + 1}`, kind: 'area', publicRole: 'corridor', name: `中央通道${index + 1}`,
    width: 16, depth: 3, position: [-16 + index * 16, 0, 0], entry: [0, 0, 0],
  }));
  const areas = {
    corridor: corridorSegments[0], corridors: corridorSegments,
    lobby: region(document, floor, { id: 'lobby', kind: 'area', publicRole: 'lobby', name: '公共入口厅', width: 6, depth: 3, position: [-27, 0, 0], entry: [-2.4, 0, -0.9] }),
    lift: region(document, floor, { id: 'lift-access', kind: 'area', publicRole: 'lift-access', name: '电梯预留', width: 6, depth: 3, position: [-27, 0, -3], entry: [-2.4, 0, -0.9] }),
    stair: region(document, floor, { id: 'stair-access', kind: 'area', publicRole: 'stair-access', name: '楼梯预留', width: 6, depth: 3, position: [-27, 0, 3], entry: [-2.4, 0, 0.9] }),
    restroom: region(document, floor, { id: 'restroom-access', kind: 'area', publicRole: 'restroom-access', name: '卫生服务预留', width: 6, depth: 3, position: [-27, 0, 6], entry: [-2.4, 0, 0.9] }),
  };
  connect(floor, 'portal-corridor-lobby', { regionId: areas.corridor.id, edge: 'west', offset: 0 }, { regionId: areas.lobby.id, edge: 'east', offset: 0 });
  connect(floor, 'portal-corridor-1-2', { regionId: areas.corridors[0].id, edge: 'east', offset: 0 }, { regionId: areas.corridors[1].id, edge: 'west', offset: 0 });
  connect(floor, 'portal-corridor-2-3', { regionId: areas.corridors[1].id, edge: 'east', offset: 0 }, { regionId: areas.corridors[2].id, edge: 'west', offset: 0 });
  connect(floor, 'portal-lobby-lift', { regionId: areas.lobby.id, edge: 'north', offset: 0 }, { regionId: areas.lift.id, edge: 'south', offset: 0 });
  connect(floor, 'portal-lobby-stair', { regionId: areas.lobby.id, edge: 'south', offset: 0 }, { regionId: areas.stair.id, edge: 'north', offset: 0 });
  connect(floor, 'portal-stair-restroom', { regionId: areas.stair.id, edge: 'south', offset: 0 }, { regionId: areas.restroom.id, edge: 'north', offset: 0 });
  return areas;
}

function addFullFloorRooms(document, floor, roomInputs, scale) {
  const twoA = ['single-room', 'leased-floor', 'building'].includes(scale);
  const width = twoA ? 6 : 4.5, depth = twoA ? 6 : 4;
  const result = [];
  if (['leased-floor', 'building'].includes(scale)) {
    const corridors = document.nodes.filter(node => node.parentId === floor.id && node.publicRole === 'corridor');
    if (corridors.length !== 3) fail('missing-corridor', floor.id, 'Two-A floors require three connected 16m central corridor segments');
    const roomCount = REQUIRED_ROOMS[scale];
    const normalized = roomInputs.slice(0, roomCount);
    for (let index = normalized.length; index < roomCount; index++) normalized.push({ id: `room-${index + 1}` });
    for (let index = 0; index < roomCount; index++) {
      const input = normalized[index], row = index < 8 ? -1 : 1, column = index % 8;
      const x = -21 + column * 6, z = row < 0 ? -4.5 : 4.5;
      result.push(region(document, floor, {
        id: input.id, name: input.name ?? `经营房${index + 1}`, purpose: input.purpose ?? defaultPurpose(index),
        width, depth, position: [x, 0, z], entry: input.entry,
      }));
      const room = result[result.length - 1];
      const corridor = corridors[x < -8 ? 0 : x < 8 ? 1 : 2];
      connect(floor, `portal-${input.id}`, { regionId: room.id, edge: row < 0 ? 'south' : 'north', offset: 0 },
        { regionId: corridor.id, edge: row < 0 ? 'north' : 'south', offset: x - corridor.transform.position[0] });
    }
  } else {
    const count = REQUIRED_ROOMS[scale], normalized = roomInputs.slice(0, count);
    for (let index = normalized.length; index < count; index++) normalized.push({ id: `room-${index + 1}` });
    if (scale === 'rental-home') {
      const positions = [[-4.5, 0, 0], [4.5, 0, 0], [0, 0, 4]];
      for (let index = 0; index < count; index++) {
        const input = normalized[index], room = region(document, floor, {
          id: input.id, name: input.name ?? `民房${index + 1}`, purpose: input.purpose ?? defaultPurpose(index),
          width, depth, position: positions[index], entry: input.entry ?? (index === 0 ? [-1.8, 0, 1.5] : index === 1 ? [1.8, 0, 1.5] : [1.7, 0, 1.4]),
        });
        result.push(room);
      }
      const living = region(document, floor, { id: 'living', kind: 'area', publicRole: 'living', name: '公共客厅', width: 4.5, depth: 4, position: [0, 0, 0], entry: [-1.6, 0, 1.5] });
      connect(floor, 'portal-stream-living', { regionId: result[0].id, edge: 'east', offset: 0 }, { regionId: living.id, edge: 'west', offset: 0 });
      connect(floor, 'portal-work-living', { regionId: result[1].id, edge: 'west', offset: 0 }, { regionId: living.id, edge: 'east', offset: 0 });
      connect(floor, 'portal-rest-living', { regionId: result[2].id, edge: 'north', offset: 0 }, { regionId: living.id, edge: 'south', offset: 0 });
    } else {
      result.push(region(document, floor, { id: normalized[0].id, name: normalized[0].name ?? '直播与休息单间',
        purpose: normalized[0].purpose ?? 'streaming', width, depth, position: [0, 0, 0], entry: normalized[0].entry ?? (scale === 'small-home' ? [-1.7, 0, 1.5] : [2.5, 0, 2.5]) }));
    }
  }
  return result;
}

function defaultPurpose(index) { return ['streaming', 'work', 'rest', 'training'][index % 4]; }

function stationOperations(room, roomInput, scale) {
  let stations = roomInput.stations ?? (scale === 'single-room' && roomInput.purpose === 'streaming' ? 2 : 0);
  if (Array.isArray(stations)) {
    if (stations.length > 2 || (stations.length && roomInput.purpose !== 'streaming'))
      fail('room-capacity', `${room.id}.stations`, 'Only streaming rooms may install up to two workstations');
    return stations.map((entry, index) => {
      if (!entry || typeof entry !== 'object') fail('invalid-station', `${room.id}.stations[${index}]`, 'Station entries must be objects');
      knownFields(entry,['id','template','transform'],`${room.id}.stations[${index}]`);
      if(entry.template!==undefined)knownFields(entry.template,['id','version'],`${room.id}.stations[${index}].template`);
      checkId(entry.id, `${room.id}.stations[${index}].id`);
      return { type: 'add-workstation', id: `${room.id}/${entry.id}`, parentId: room.id,
        template: entry.template ?? { id: 'stream-station', version: 1 }, transform: entry.transform ?? transform([index ? 1.3 : -1.3, 0, -0.5]) };
    });
  }
  if (!Number.isInteger(stations) || stations < 0 || stations > 2) fail('room-capacity', `${room.id}.stations`, 'Streaming workstations must be an integer from 0 to 2');
  if (stations && roomInput.purpose !== 'streaming') fail('room-capacity', room.id, 'Only streaming rooms may install workstations');
  return Array.from({ length: stations }, (_, index) => ({ type: 'add-workstation', id: `${room.id}/station-${index + 1}`,
    parentId: room.id, template: { id: 'stream-station', version: 1 }, transform: transform([stations === 1 ? -0.75 : (index ? 1.3 : -1.3), 0, -0.5]) }));
}

function furnitureOperations(room, roomInput, scale) {
  const operations = [];
  if (roomInput.sofaVersion !== undefined) {
    if (![1, 2].includes(roomInput.sofaVersion)) fail('invalid-room-content', `${room.id}.sofaVersion`, 'sofaVersion must be 1 or 2');
    operations.push({ type: 'add-facility', id: `${room.id}/sofa`, parentId: room.id,
        resource: { id: 'lounge-sofa', version: roomInput.sofaVersion },
        transform: transform(scale === 'small-home' ? [1, 0, 0.35] : [0, 0, 0.55]) });
  }
  if (roomInput.furniture === 'desk-chair') {
    if (!['work', 'training'].includes(roomInput.purpose)) fail('invalid-room-content', room.id, 'desk-chair furniture requires work or training purpose');
    operations.push({ type: 'add-facility', id: `${room.id}/desk`, parentId: room.id, resource: { id: 'desk', version: 1 }, transform: transform([0, 0, -0.8]) });
    operations.push({ type: 'add-facility', id: `${room.id}/chair`, parentId: room.id, resource: { id: 'chair', version: 1 }, transform: transform([0, 0, 0.65], Math.PI) });
  }
  if (Array.isArray(roomInput.furniture)) for (const [index, item] of roomInput.furniture.entries()) {
    if (!item || typeof item !== 'object' || !item.id || !item.resource) fail('invalid-furniture', `${room.id}.furniture[${index}]`, 'Furniture needs id and resource');
    knownFields(item,['id','resource','transform'],`${room.id}.furniture[${index}]`);
    knownFields(item.resource,['id','version'],`${room.id}.furniture[${index}].resource`);
    checkId(item.id, `${room.id}.furniture[${index}].id`);
    if (!item.resource.id || !Number.isInteger(item.resource.version)) fail('invalid-furniture', `${room.id}.furniture[${index}].resource`, 'Resource needs id and integer version');
    operations.push({ type: 'add-facility', id: `${room.id}/${item.id}`, parentId: room.id, resource: ref(item.resource), transform: item.transform ?? transform([0, 0, 0]) });
  }
  return operations;
}

function publicFurnitureOperations(area, catalog) {
  const sofa = catalog.resources.find(resource => resource.id === 'lounge-sofa' && resource.version === 1);
  const plant = catalog.resources.find(resource => resource.id === 'plant' && resource.version === 1);
  if (!sofa || !plant) fail('missing-public-furniture', area.id, 'The configured catalog must include lounge-sofa@1 and plant@1');
  const compact = area.bounds.width <= 4.5;
  return [
    { type: 'add-facility', id: `${area.id}/sofa`, parentId: area.id, resource: ref(sofa), transform: transform([0, 0, compact ? -0.45 : 0]) },
    { type: 'add-facility', id: `${area.id}/plant`, parentId: area.id, resource: ref(plant), transform: transform(compact ? [1.55, 0, -1] : [-2, 0, 0]) },
  ];
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid-space-input', 'input', 'Expected a scale-v2 input object');
  knownFields(input,['id','name','scale','spaceProfile','floors'],'input');
  for (const field of ['id', 'scale', 'floors']) if (!Object.hasOwn(input, field)) fail('invalid-space-input', `input.${field}`, 'Required field is missing');
  checkId(input.id, 'input.id'); text(input.name, 'input.name');
  if (input.spaceProfile !== undefined &&
      (!input.spaceProfile || Array.isArray(input.spaceProfile) || Object.keys(input.spaceProfile).sort().join(',') !== 'id,version' ||
       input.spaceProfile.id !== COMPANY_SPACE_V2.id || input.spaceProfile.version !== COMPANY_SPACE_V2.version))
    fail('unsupported-space-profile', 'input.spaceProfile', 'Expected pinned company-space-v2 version 1');
  if (!Object.hasOwn(REQUIRED_ROOMS, input.scale)) fail('unsupported-scale', 'input.scale', String(input.scale));
  if (!Array.isArray(input.floors) || !input.floors.length) fail('space-floor-capacity', 'input.floors', 'At least one floor is required');
  const floorLimit = input.scale === 'building' ? MAX_CONFIGURED_FLOORS : 1;
  if (input.floors.length > floorLimit) fail('space-floor-capacity', 'input.floors', `This scale permits at most ${floorLimit} configured floor(s)`);
  const ids = new Set();
  for (const [index, floor] of input.floors.entries()) {
    if (!floor || typeof floor !== 'object' || Array.isArray(floor)) fail('invalid-space-input', `input.floors[${index}]`, 'Floor must be an object');
    knownFields(floor,['id','name','rooms'],`input.floors[${index}]`);
    checkId(floor.id, `input.floors[${index}].id`); text(floor.name, `input.floors[${index}].name`);
    if (ids.has(floor.id)) fail('duplicate-id', `input.floors[${index}].id`, 'Floor IDs must be globally unique'); ids.add(floor.id);
    if (floor.rooms !== undefined && !Array.isArray(floor.rooms)) fail('invalid-space-input', `input.floors[${index}].rooms`, 'Rooms must be an array when provided');
    if ((floor.rooms ?? []).length > REQUIRED_ROOMS[input.scale]) fail('floor-room-capacity', `input.floors[${index}].rooms`, `At most ${REQUIRED_ROOMS[input.scale]} configured rooms are accepted`);
    const roomIds=new Set();
    for (const [roomIndex, room] of (floor.rooms ?? []).entries()) {
      if (!room || typeof room !== 'object' || Array.isArray(room)) fail('invalid-space-input', `input.floors[${index}].rooms[${roomIndex}]`, 'Room must be an object');
      knownFields(room,['id','name','purpose','stations','furniture','sofaVersion','entry'],`input.floors[${index}].rooms[${roomIndex}]`);
      if(room.entry!==undefined&&(!Array.isArray(room.entry)||room.entry.length!==3||!room.entry.every(Number.isFinite)))fail('invalid-space-input',room.id,'Entry must be a finite xyz position');
      if(room.furniture!==undefined&&room.furniture!=='desk-chair'&&!Array.isArray(room.furniture))fail('invalid-furniture',room.id,'Use desk-chair or an explicit furniture array');
      if(room.stations===null)fail('invalid-station',room.id,'Station count or array cannot be null');
      checkId(room.id, `input.floors[${index}].rooms[${roomIndex}].id`);
      if (roomIds.has(room.id)) fail('duplicate-id', `input.floors[${index}].rooms[${roomIndex}].id`, 'Room IDs must be unique within their floor'); roomIds.add(room.id);
      if (room.purpose !== undefined && !PURPOSES.has(room.purpose)) fail('invalid-room-purpose', room.id, String(room.purpose));
    }
  }
}

export function createCompanyScaleV2(input, catalog, templates) {
  validateInput(input);
  const document = createCompany({ id: input.id, name: input.name ?? input.id }, catalog);
  document.spaceProfile = { ...COMPANY_SPACE_V2 };
  document.scale = input.scale;
  document.nodes = [];
  const operations = [];
  for (const [floorIndex, floorInput] of input.floors.entries()) {
    const floor = { id: `${document.id}/${floorInput.id}`, kind: 'floor', parentId: document.id,
      name: floorInput.name ?? floorInput.id, transform: identityTransform(), connections: [] };
    document.nodes.push(floor);
    const areas = ['leased-floor', 'building'].includes(input.scale) ? addPublicAreas(document, floor) : null;
    const rooms = addFullFloorRooms(document, floor, floorInput.rooms ?? [], input.scale);
    for (const [index, room] of rooms.entries()) {
      const roomInput = (floorInput.rooms ?? [])[index] ?? {};
      operations.push(...stationOperations(room, { ...roomInput, purpose: room.purpose }, input.scale));
      operations.push(...furnitureOperations(room, { ...roomInput, purpose: room.purpose }, input.scale));
    }
    if (input.scale === 'rental-home') {
      const living = document.nodes.find(node => node.id === `${floor.id}/living`);
      operations.push(...publicFurnitureOperations(living, catalog));
    }
    if (areas) operations.push(...publicFurnitureOperations(areas.lobby, catalog));
    if (floorIndex > 0 && input.scale !== 'building') fail('space-floor-capacity', `input.floors[${floorIndex}]`, 'This scale supports one floor');
  }
  const result = prepareCompanyChange(document, operations, { catalog, templates }).document;
  inspectCompanyConnections(result, catalog, templates);
  inspectCompanyPlacement(result, catalog, templates);
  return result;
}

export const scaleV2Constants = Object.freeze({ COMPANY_SPACE_V2, REQUIRED_ROOMS, PUBLIC_ROLES, epsilon });
