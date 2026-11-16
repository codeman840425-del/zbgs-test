import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/facility-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates.json' with {type: 'json'};
import {createCompany, prepareCompanyChange, deriveCompany, serializeCompany, restoreCompany} from '../../prototype/src/company/document.js';

const root = new URL('../../', import.meta.url);
const inputPaths = ['prototype/src/company/document.js', 'prototype/src/company/facility-catalog.json', 'prototype/src/company/templates.json', 'scripts/company-platform/qa-authoring-operations.mjs'];
const hashInputs = async () => Object.fromEntries(await Promise.all(inputPaths.map(async path => [path, createHash('sha256').update(await fs.readFile(new URL(path, root))).digest('hex')])));
const inputHashes = await hashInputs();
const fixtureCatalog = structuredClone(catalog);
fixtureCatalog.resources.find(r => r.id === 'desk').materialSlots = {top: ['desktop']};
fixtureCatalog.resources.find(r => r.id === 'chair').materialSlots = {fabric: ['chair-seat', 'chair-back']};
delete fixtureCatalog.resources.find(r => r.id === 'keyboard').materialSlots;
const context = {catalog: fixtureCatalog, templates};
const change = (document, operations, guards = {}) => prepareCompanyChange(document, operations, {...context, ...guards});
const derive = document => deriveCompany(document, fixtureCatalog, templates);
const serialize = document => serializeCompany(document, fixtureCatalog, templates);
const checks = [];
function check(name, run) { checks.push({name, status: 'passed', observed: run()}); }
function closeWorld(actual, expected) {
  for (let axis = 0; axis < 3; axis++) assert(Math.abs(actual.position[axis] - expected.position[axis]) < 1e-8);
  assert(Math.abs(actual.yaw - expected.yaw) < 1e-8);
}
function sameFacilities(before, after) {
  for (const source of before.facilities) {
    const target = after.facilities.find(f => f.id === source.id);
    assert.ok(target, source.id);
    assert.deepEqual(target.node.resource, source.node.resource);
    assert.deepEqual(target.node.state, source.node.state);
    assert.deepEqual(target.node.appearance, source.node.appearance);
    closeWorld(target.world, source.world);
  }
}
function reject(document, operations, code, guards) {
  const before = serialize(document);
  assert.throws(() => change(document, operations, guards), error => error.code === code);
  assert.equal(serialize(document), before);
}
const floorId = 'company-demo/floor-1', roomId = 'company-demo/room-1';
const base = createCompany({width: 20, depth: 20}, fixtureCatalog);
base.nodes.find(n => n.id === roomId).transform = {position: [2, 0, 1], yaw: Math.PI / 2};
const original = change(base, [
  {type: 'add-workstation', id: 'station', parentId: roomId, template: {id: 'stream-station', version: 1}, transform: {position: [-4, 0, -1], yaw: Math.PI / 2}},
  {type: 'set-state', id: 'station/monitor', state: {on: false}},
  {type: 'set-state', id: 'station/fill-light', state: {on: false, intensity: 2}},
  {type: 'set-appearance', id: 'station/desk', appearance: {materials: {top: {color: '#aabbcc', roughness: .25}}}},
]).document;
const originalBytes = serialize(original), originalDerived = derive(original);
const unpacked = change(original, [{type: 'unpack-workstation', id: 'station'}]).document;
const groupOperation = {type: 'group-facilities', id: 'furniture', parentId: roomId,
  memberIds: ['station/desk', 'station/chair', 'station/fill-light'], transform: {position: [1.5, 0, -.5], yaw: -Math.PI / 2}};
const grouped = change(unpacked, [groupOperation]).document;

check('unpack workstation preserves stable facilities, nested devices and world transforms under rotated parents', () => {
  const derived = derive(unpacked);
  assert(!derived.nodes.has('station'));
  assert.equal(derived.nodes.get('station/desk').parentId, roomId);
  for (const id of ['monitor', 'keyboard', 'microphone']) assert.equal(derived.nodes.get(`station/${id}`).parentId, 'station/desk');
  for (const facility of derived.facilities) {
    assert.equal(facility.node.stationId, undefined);
    assert.equal(facility.node.partKey, undefined);
  }
  sameFacilities(originalDerived, derived);
  assert.equal(derived.capacity.installedStations, 0);
  assert.equal(serialize(original), originalBytes);
  return {preservedFacilityIds: derived.facilities.map(f => f.id), usePoints: derived.usePoints.map(p => p.id)};
});

check('group and unpack preserve worlds, resource refs, local appearance and device dependencies', () => {
  sameFacilities(derive(unpacked), derive(grouped));
  const restored = change(grouped, [{type: 'unpack-group', id: 'furniture'}]);
  sameFacilities(derive(grouped), restored.derived);
  assert(!restored.derived.nodes.has('furniture'));
  assert.equal(restored.derived.nodes.get('station/monitor').parentId, 'station/desk');
  assert.equal(restored.derived.capacity.installedStations, 0);
  assert.deepEqual(restoreCompany(serialize(grouped), fixtureCatalog, templates), grouped);
  return {groupKind: derive(grouped).nodes.get('furniture').kind, installedStations: restored.derived.capacity.installedStations};
});

check('copy group preserves independent device/state/material overrides and avoids preexisting descendant IDs', () => {
  const collision = change(grouped, [{type: 'add-facility', id: 'furniture-copy/extra-1', parentId: roomId, resource: {id: 'plant', version: 1}, transform: {position: [8, 0, 8], yaw: 0}}]).document;
  const sourceBytes = serialize(collision);
  const copied = change(collision, [{type: 'copy-group', id: 'furniture', newId: 'furniture-copy', transform: {position: [8, 0, -.5], yaw: -Math.PI / 2}}]);
  const sourceIds = new Set(derive(collision).facilities.map(f => f.id));
  const clones = copied.derived.facilities.filter(f => !sourceIds.has(f.id));
  assert.equal(clones.length, 6);
  assert.equal(new Set(copied.document.nodes.map(n => n.id)).size, copied.document.nodes.length);
  const cloneDesk = clones.find(f => f.resource.id === 'desk');
  for (const source of derive(grouped).facilities) {
    const clone = clones.find(f => f.resource.id === source.resource.id);
    assert.deepEqual(clone.node.state, source.node.state);
    assert.deepEqual(clone.node.appearance, source.node.appearance);
    closeWorld(clone.world, {position: source.world.position.map((v, axis) => v + (axis === 2 ? -6.5 : 0)), yaw: source.world.yaw});
    if (['monitor', 'keyboard', 'desk-microphone'].includes(clone.resource.id)) assert.equal(clone.node.parentId, cloneDesk.id);
  }
  const changed = change(copied.document, [{type: 'set-state', id: clones.find(f => f.resource.id === 'monitor').id, state: {on: true}}]);
  assert.equal(changed.derived.nodes.get('station/monitor').state.on, false);
  assert.equal(serialize(collision), sourceBytes);
  reject(collision, [{type: 'copy-group', id: 'furniture', newId: 'furniture-copy/extra-1'}], 'duplicate-instance');
  return {newFacilityIds: clones.map(f => f.id), cloneDeskId: cloneDesk.id};
});

check('nested groups can be copied and unpacked while preserving all existing component worlds', () => {
  const nested = change(grouped, [{type: 'group-facilities', id: 'outer', parentId: roomId, memberIds: ['furniture'], transform: {position: [2, 0, 2], yaw: Math.PI / 2}}]);
  sameFacilities(derive(grouped), nested.derived);
  reject(nested.document, [{type: 'group-facilities', id: 'cycle', parentId: 'furniture', memberIds: ['outer']}], 'parent-cycle');
  reject(nested.document, [{type: 'group-facilities', id: 'double', parentId: roomId, memberIds: ['outer', 'station/desk']}], 'invalid-group-selection');
  const copied = change(nested.document, [{type: 'copy-group', id: 'outer', newId: 'outer-copy', transform: {position: [2, 0, 8.5], yaw: Math.PI / 2}}]);
  assert.equal(copied.document.nodes.filter(n => n.kind === 'assembly').length, 4);
  const unpack = change(nested.document, [{type: 'unpack-group', id: 'outer'}]);
  sameFacilities(nested.derived, unpack.derived);
  assert.equal(unpack.derived.nodes.get('furniture').parentId, roomId);
  return {assembliesAfterCopy: 4};
});

check('template theft, cross-room/floor grouping and group self-cycles reject atomically', () => {
  reject(original, [{...groupOperation, memberIds: ['station/desk']}], 'required-template-part');
  reject(original, [{...groupOperation, memberIds: ['station']}], 'invalid-group-member');
  reject(unpacked, [{...groupOperation, parentId: 'furniture'}], 'parent-cycle');
  const roomy = {...structuredClone(unpacked), scale: 'building'};
  roomy.nodes.push({id: 'other-floor', kind: 'floor', parentId: roomy.id, transform: {position: [0, 0, 0], yaw: 0}});
  const addedRoom = change(roomy, [{type: 'add-room', id: 'other-room', parentId: floorId, purpose: 'rest', bounds: {width: 6, depth: 7}, transform: {position: [30, 0, 0], yaw: 0}}]).document;
  reject(addedRoom, [{...groupOperation, parentId: 'other-room'}], 'cross-room-group');
  reject(addedRoom, [{...groupOperation, parentId: 'other-floor'}], 'cross-floor-group');
  reject(original, [{type: 'set-state', id: 'station/monitor', state: {on: true}}, {...groupOperation, memberIds: ['station/desk']}], 'required-template-part');
  return {inputUnchanged: serialize(original) === originalBytes};
});

check('busy original use points reject unpack, regroup, group movement, room edits and material edits', () => {
  const busy = {isUsePointBusy: id => id === 'station/chair#seat'};
  reject(original, [{type: 'unpack-workstation', id: 'station'}], 'facility-busy', busy);
  reject(unpacked, [groupOperation], 'facility-busy', busy);
  reject(grouped, [{type: 'unpack-group', id: 'furniture'}], 'facility-busy', busy);
  reject(grouped, [{type: 'move', id: 'furniture', transform: {position: [2, 0, -.5], yaw: -Math.PI / 2}}], 'facility-busy', busy);
  reject(grouped, [{type: 'set-room', id: roomId, bounds: {width: 19, depth: 19}}], 'facility-busy', busy);
  reject(original, [{type: 'set-appearance', id: 'station/chair', appearance: {materials: {fabric: {color: '#ffffff'}}}}], 'facility-busy', busy);
  return {busyPoint: 'station/chair#seat'};
});

check('room and public area operations enforce rectangular 3..20m range and distinct capacity semantics', () => {
  const initial = createCompany({}, fixtureCatalog);
  const publicArea = change(initial, [{type: 'add-area', id: 'public', parentId: floorId, name: '公共区', bounds: {shape: 'rectangle', width: 3, depth: 20}, transform: {position: [15, 0, 0], yaw: 0}}]);
  assert.equal(publicArea.derived.capacity.businessRooms, 1);
  const renamed = change(publicArea.document, [{type: 'set-room', id: 'public', name: '公共休息区', bounds: {width: 4, depth: 6}}]);
  assert.equal(renamed.derived.nodes.get('public').name, '公共休息区');
  reject(initial, [{type: 'add-room', id: 'extra', parentId: floorId, bounds: {width: 3, depth: 3}}], 'scale-capacity');
  const rental = {...structuredClone(initial), scale: 'rental-home'};
  const rooms = change(rental, [
    {type: 'add-room', id: 'work-room', parentId: floorId, purpose: 'work', bounds: {width: 3, depth: 3}, transform: {position: [20, 0, 0], yaw: 0}},
    {type: 'add-room', id: 'rest-room', parentId: floorId, purpose: 'rest', bounds: {width: 5, depth: 6}, transform: {position: [-20, 0, 0], yaw: Math.PI / 2}},
    {type: 'add-area', id: 'public', parentId: floorId, bounds: {width: 4, depth: 6}},
    {type: 'set-room', id: 'work-room', name: '训练室', purpose: 'training'},
  ]);
  assert.equal(rooms.derived.capacity.businessRooms, 3);
  reject(rooms.document, [{type: 'add-room', id: 'fourth', parentId: floorId, bounds: {width: 4, depth: 4}}], 'scale-capacity');
  for (const bounds of [{width: 2, depth: 7}, {width: 21, depth: 7}, {shape: 'circle', width: 9, depth: 7}])
    reject(initial, [{type: 'set-room', id: roomId, bounds}], 'invalid-bounds');
  reject(initial, [{type: 'set-room', id: roomId, transform: {position: [0, 0, 0], yaw: 0}}], 'invalid-room-change');
  reject(original, [{type: 'set-room', id: roomId, purpose: 'rest'}], 'room-capacity');
  const reused = change(original, [{type: 'unpack-workstation', id: 'station'}, {type: 'set-room', id: roomId, purpose: 'rest'}]);
  assert.equal(reused.derived.capacity.installedStations, 0);
  assert.equal(reused.derived.nodes.get(roomId).purpose, 'rest');
  return {rentalBusinessRooms: rooms.derived.capacity.businessRooms, publicAreas: rooms.document.nodes.filter(n => n.kind === 'area').length, dimensionsMetres: [3, 20], characterReachability: 'unverified'};
});

check('appearance replacements use declared slots and reject unsupported fields, colors and values', () => {
  const replaced = change(original, [{type: 'set-appearance', id: 'station/desk', appearance: {materials: {top: {color: '#112233'}}}}]);
  assert.deepEqual(replaced.derived.nodes.get('station/desk').appearance, {materials: {top: {color: '#112233'}}});
  const cleared = change(replaced.document, [{type: 'set-appearance', id: 'station/desk', appearance: {}}]);
  assert(!Object.hasOwn(cleared.derived.nodes.get('station/desk'), 'appearance'));
  for (const appearance of [
    {materials: {top: {color: 'red'}}}, {materials: {top: {roughness: 1.01}}},
    {materials: {top: {roughness: NaN}}}, {materials: {top: {shader: 'custom'}}}, {materials: {}, opacity: .5},
  ]) reject(original, [{type: 'set-appearance', id: 'station/desk', appearance}], 'invalid-appearance');
  reject(original, [{type: 'set-appearance', id: 'station/desk', appearance: {materials: {unknown: {color: '#ffffff'}}}}], 'unknown-material-slot');
  reject(original, [{type: 'set-appearance', id: 'station/keyboard', appearance: {materials: {top: {color: '#ffffff'}}}}], 'unsupported-appearance');
  reject(original, [{type: 'set-appearance', id: 'station/desk'}], 'invalid-appearance');
  return {slotDeclarationFixture: {desk: {top: ['desktop']}, chair: {fabric: ['chair-seat', 'chair-back']}}, rendererSlotResolution: 'owned by root, not exercised'};
});

assert.equal(serialize(original), originalBytes);
assert.deepEqual(await hashInputs(), inputHashes);
const out = new URL('../../evidence/company-authoring-operations-v1/', import.meta.url);
await fs.mkdir(out, {recursive: true});
await fs.writeFile(new URL('report.json', out), JSON.stringify({status: 'cpu-authoring-passed', generatedAt: new Date().toISOString(), inputHashes, checks,
  limits: ['CPU document operations only. No browser, GPU, navigation or character-use validation.', 'Appearance uses declared slot fixtures against existing resources. Root owns real render slot and material resolution.', 'The additional floor is only a cross-floor rejection fixture. No C2 connection algorithm is implemented.']}, null, 2) + '\n');
// The portable graph example uses the on-disk catalog, whose procedural material
// slots may differ from the two explicit declarations used by this CPU fixture.
const example = structuredClone(grouped);
for (const node of example.nodes) delete node.appearance;
await fs.writeFile(new URL('grouped-example.json', out), serializeCompany(example, catalog, templates));
console.log(`${checks.length} authoring-operation checks passed`);
