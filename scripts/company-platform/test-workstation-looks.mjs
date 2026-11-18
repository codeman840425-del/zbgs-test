import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type: 'json'};
import smallLayout from '../../prototype/src/company/examples/c1-two-stations.json' with {type: 'json'};
import mixedLayout from '../../prototype/src/company/examples/c2-mixed-company.json' with {type: 'json'};
import {appearanceCandidates, createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {CompanyError, deriveCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {encodeCompanySave, decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {prepareTemplateUpgrade} from '../../prototype/src/company/upgrade.js';
import {resolveWorkstationLook, workstationLookOperations, workstationLooks} from '../../prototype/src/company/workstation-looks.js';

const context = {catalog, templates};
const reference = id => ({id, version: 1});
const findStation = document => document.nodes.find(node => node.kind === 'workstation');
const findNode = (document, id) => document.nodes.find(node => node.id === id);
const membersOf = (document, stationId) => document.nodes.filter(node => node.stationId === stationId);
const field = (nodes, name) => Object.fromEntries(nodes.map(node => [node.partKey, node[name]]));
const operationsFor = (document, stationId, recipe, selectedCatalog = catalog) =>
  workstationLookOperations(document, stationId, recipe, selectedCatalog, templates);
const apply = (document, operations) => prepareCompanyChange(document, operations, context).document;
const rejects = (action, code, path) => assert.throws(action, error =>
  error instanceof CompanyError && error.code === code && (path === undefined || error.path === path));

function customize(document, useDistinctPartId) {
  const next = structuredClone(document);
  const station = findStation(next), members = membersOf(next, station.id);
  const desk = members.find(node => node.partKey === 'desk');
  const monitor = members.find(node => node.partKey === 'monitor');
  const light = members.find(node => node.partKey === 'fill-light');
  if (useDistinctPartId) {
    monitor.id = 'equipment/monitor-custom-id';
    monitor.appearance = {materials: {'screen-surface': {color: '#778899', roughness: .4}}};
  }
  const edits = [
    {type: 'move', id: monitor.id, transform: {position: [.08, .84, -.17], yaw: Math.PI / 2}},
    {type: 'set-state', id: monitor.id, state: {on: false}},
    {type: 'set-state', id: light.id, state: {intensity: 3.5, on: false}},
    // Same role and even the conventional ID must leave the extra monitor untouched.
    {type: 'add-facility', id: useDistinctPartId ? `${station.id}/monitor` : 'equipment/extra-monitor', parentId: desk.id,
      resource: reference('monitor-aurora'), transform: {position: [.55, .84, .27], yaw: 0}, state: {on: false}},
    {type: 'add-facility', id: 'equipment/extra-camera', parentId: desk.id,
      resource: reference('camera-orbit-eye'), transform: {position: [.65, .84, -.21], yaw: 0}, state: {recording: true}},
  ];
  return apply(next, edits);
}

assert.equal(workstationLooks.length, 4);
assert.deepEqual(appearanceCandidates(catalog, 'stream-station'), workstationLooks.map(({id, version, displayName}) => ({id, version, displayName})));
const geometriesByPart = new Map();
for (const [index, look] of workstationLooks.entries()) {
  assert.equal(look.id, `station-look-${index + 1}`);
  assert.deepEqual(resolveWorkstationLook(reference(look.id)), look);
  const sample = createAppearanceSample('stream-station', index, catalog, templates);
  assert.deepEqual(sample.resource, reference(look.id));
  assert.deepEqual(field(membersOf(sample.document, sample.target), 'resource'), Object.fromEntries(look.parts.map(part => [part.key, part.resource])));
  inspectCompanyPlacement(sample.document, catalog, templates);

  for (const part of look.parts) {
    const {asset} = catalog.resources.find(item => item.id === part.resource.id && item.version === part.resource.version);
    const bytes = await readFile(new URL(`../../prototype/public${asset.url}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const geometry = gltf.meshes.flatMap(mesh => mesh.primitives.map(primitive => {
      const {count, min, max} = gltf.accessors[primitive.attributes.POSITION];
      return {count, min, max};
    }));
    assert(geometry.length > 0);
    if (!geometriesByPart.has(part.key)) geometriesByPart.set(part.key, new Set());
    geometriesByPart.get(part.key).add(JSON.stringify(geometry));
  }
}
for (const [partKey, geometry] of geometriesByPart) assert.equal(geometry.size, 4, partKey);

const upgradedSmallLayout = prepareTemplateUpgrade(smallLayout, findStation(smallLayout).id, {id: 'stream-station', version: 2}, context).document;
for (const [layout, distinctPartId] of [[upgradedSmallLayout, false], [mixedLayout, true]]) {
  const document = customize(layout, distinctPartId);
  const stationId = findStation(document).id;
  const before = structuredClone(document);
  const beforeDerived = deriveCompany(document, catalog, templates);
  const beforeParts = membersOf(before, stationId);
  const originalMembers = new Map(beforeParts.map(node => [node.id, node]));
  const beforeSave = await encodeCompanySave(document, catalog, templates);
  inspectCompanyPlacement(document, catalog, templates);
  for (const look of workstationLooks) {
    const plan = operationsFor(document, stationId, look);
    const next = plan.length ? apply(document, plan) : document;
    assert.deepEqual(plan, look.parts.flatMap(part => {
      const member = beforeParts.find(node => node.partKey === part.key);
      return member.resource.id === part.resource.id && member.resource.version === part.resource.version ? [] :
        [{type: 'replace-resource', id: member.id, resource: part.resource}];
    }));
    assert.equal(next.revision, document.revision + Number(plan.length > 0));
    const nextParts = membersOf(next, stationId);
    assert.deepEqual(field(nextParts, 'resource'), Object.fromEntries(look.parts.map(part => [part.key, part.resource])));
    assert.deepEqual(field(nextParts, 'transform'), field(beforeParts, 'transform'));
    assert.deepEqual(field(nextParts, 'parentId'), field(beforeParts, 'parentId'));
    assert.deepEqual(field(nextParts, 'appearance'), field(beforeParts, 'appearance'));
    assert.deepEqual(next.nodes.filter(node => !originalMembers.has(node.id)), before.nodes.filter(node => !originalMembers.has(node.id)));
    const nextDerived = deriveCompany(next, catalog, templates);
    assert.deepEqual(nextDerived.worlds, beforeDerived.worlds);
    assert.deepEqual(nextDerived.facilities.map(item => item.state), beforeDerived.facilities.map(item => item.state));
    assert.deepEqual(operationsFor(next, stationId, look), []);
    inspectCompanyPlacement(next, catalog, templates);
    const stored = await encodeCompanySave(next, catalog, templates);
    assert.deepEqual(await decodeCompanySave(stored, catalog, templates), next);
  }
  assert.deepEqual(document, before);
  assert.equal(await encodeCompanySave(document, catalog, templates), beforeSave);
}

const stationId = findStation(smallLayout).id;
const unchanged = await encodeCompanySave(smallLayout, catalog, templates);
const [first] = workstationLooks;
rejects(() => resolveWorkstationLook({id: first.id, version: 2}), 'missing-workstation-look');
rejects(() => resolveWorkstationLook({id: first.id}), 'missing-workstation-look');
rejects(() => resolveWorkstationLook(reference('unknown-look')), 'missing-workstation-look');
const custom = {...first, version: 2, parts: first.parts.toReversed()};
assert.deepEqual(operationsFor(smallLayout, stationId, custom), operationsFor(smallLayout, stationId, first));
rejects(() => operationsFor(smallLayout, stationId, {...first, version: 0}), 'invalid-workstation-look');
rejects(() => operationsFor(smallLayout, stationId, {...first, templates: [{id: 'stream-station', version: 2}]}), 'incompatible-workstation-look');
rejects(() => operationsFor(smallLayout, 'missing-station', first), 'invalid-operation');
rejects(() => operationsFor(smallLayout, stationId, {...first, parts: first.parts.slice(1)}), 'invalid-workstation-look');
rejects(() => operationsFor(smallLayout, stationId, {...first, parts: [...first.parts.slice(1), first.parts[1]]}), 'invalid-workstation-look');
const partVariant = (key, overrides) => ({...first, parts: first.parts.map(part => part.key === key ? {...part, ...overrides} : part)});
rejects(() => operationsFor(smallLayout, stationId, partVariant('microphone', {parentKey: null})), 'incompatible-workstation-look');
rejects(() => operationsFor(smallLayout, stationId, partVariant('chair', {role: 'desk'})), 'incompatible-workstation-look');
rejects(() => operationsFor(smallLayout, stationId, partVariant('chair', {transform: {}})), 'invalid-workstation-look');
rejects(() => operationsFor(smallLayout, stationId, partVariant('fill-light', {resource: {...first.parts.at(-1).resource, version: 999}})),
  'missing-resource-version', `${stationId}/fill-light`);
rejects(() => operationsFor(smallLayout, stationId, partVariant('fill-light', {resource: reference('monitor-aurora')})), 'incompatible-replacement');
assert.equal(await encodeCompanySave(smallLayout, catalog, templates), unchanged);

const source = catalog.resources.find(item => item.id === first.parts[0].resource.id && item.version === first.parts[0].resource.version);
const reorderedCatalog = {...catalog, resources: [{...source, version: 2}, ...catalog.resources.toReversed()]};
assert.deepEqual(operationsFor(smallLayout, stationId, first, reorderedCatalog), operationsFor(smallLayout, stationId, first));
assert.deepEqual(createAppearanceSample('stream-station', 0, reorderedCatalog, templates), createAppearanceSample('stream-station', 0, catalog, templates));
const plan = operationsFor(smallLayout, stationId, first);
const chairPoint = deriveCompany(smallLayout, catalog, templates).usePoints.find(point => point.facilityId === `${stationId}/chair`);
rejects(() => prepareCompanyChange(smallLayout, plan, {...context, isUsePointBusy: id => id === chairPoint.id}), 'facility-busy');
assert.equal(await encodeCompanySave(smallLayout, catalog, templates), unchanged);

console.log('Four pinned workstation looks passed geometry, two existing layouts, state, save/restore and atomic rejection checks.');
