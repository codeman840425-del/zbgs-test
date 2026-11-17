import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates.json' with { type: 'json' };
import { WINDOW_SYSTEM, WINDOW_MOUNT, deriveWindowOpenings } from '../../prototype/src/company/window-data.js';
import { createCompany, deriveCompany, prepareCompanyChange } from '../../prototype/src/company/document.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { describeArchitecture } from '../../prototype/src/company/architecture.js';

const root = new URL('../../', import.meta.url);
const evidenceRoot = new URL('evidence/company-window-contract-cpu-v1/', root);
const EPSILON = 1e-7;

function check(name, fn) {
  try { fn(); return { name, status: 'passed' }; }
  catch (error) { return { name, status: 'failed', code: error.code, path: error.path, message: error.message }; }
}
function expectCode(code, fn) { assert.throws(fn, error => error?.code === code, `Expected ${code}`); }
function windowResource(id) {
  return {
    id, version: 1, category: 'stateful', mount: 'wall-opening', mountRole: 'window-opening-and-glass',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z' },
    windowSystem: structuredClone(WINDOW_SYSTEM), mounting: structuredClone(WINDOW_MOUNT),
    stateDefaults: { openFraction: 0 }, stateSchema: { openFraction: { type: 'number', min: 0, max: 1 } },
    stateSemantics: { openFraction: 'horizontal-window-opening-fraction' },
    windowParts: { fixedGlass: `${id}-fixed-glass`, movingGlass: `${id}-moving-glass`, sash: `${id}-sash` },
  };
}
const testCatalog = structuredClone(catalog);
testCatalog.id = 'company-window-contract-cpu';
testCatalog.resources.push(windowResource('synthetic-window-a'), windowResource('synthetic-window-b'), windowResource('synthetic-window-c'), windowResource('synthetic-window-d'));

function floor(id, transform = { position: [0, 0, 0], yaw: 0 }) {
  return { id, kind: 'floor', parentId: 'window-contract-company', name: id, transform, connections: [] };
}
function room(id, parentId, position = [0, 0, 0], width = 6, depth = 5) {
  return { id, kind: 'room', parentId, name: id, purpose: 'streaming', bounds: { width, depth }, transform: { position, yaw: 0 } };
}
function windowNode(id, parentId, position, yaw, resource = 'synthetic-window-a', openFraction = .5) {
  return { id, kind: 'facility', parentId, resource: { id: resource, version: 1 }, transform: { position, yaw }, state: { openFraction } };
}
function compose(parent, local) {
  const [x, y, z] = local.position, [px, py, pz] = parent.position, c = Math.cos(parent.yaw), s = Math.sin(parent.yaw);
  return { position: [px + c * x + s * z, py + y, pz - s * x + c * z], yaw: parent.yaw + local.yaw };
}
function syntheticWindowState(document, extras = []) {
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  const worlds = new Map(), floorIds = new Map();
  function resolve(node) {
    if (worlds.has(node.id)) return worlds.get(node.id);
    const parent = node.parentId === document.id ? { position: [0, 0, 0], yaw: 0 } : resolve(nodes.get(node.parentId));
    const world = compose(parent, node.transform); worlds.set(node.id, world);
    floorIds.set(node.id, node.kind === 'floor' ? node.id : floorIds.get(node.parentId));
    return world;
  }
  for (const node of nodes.values()) resolve(node);
  const facilities = [...document.nodes, ...extras].filter(node => node.kind === 'facility').map(node => {
    const resource = testCatalog.resources.find(item => item.id === node.resource.id && item.version === node.resource.version) || node.resource;
    return { id: node.id, node, resource, world: worlds.get(node.id), state: { ...(resource.stateDefaults || {}), ...(node.state || {}) }, floorId: floorIds.get(node.id) };
  });
  const fail = (code, path, message, details) => { const error = new Error(message); error.code = code; error.path = path; error.details = details; throw error; };
  return { nodes, worlds, floorIds, facilities, derive: () => deriveWindowOpenings({ nodes, worlds, floorIds, facilities }, fail) };
}
const windowData = document => syntheticWindowState(document).derive();
function makeDocument({ fourDirections = true, rotated = false, shared = false, includeWindow = true } = {}) {
  const company = createCompany({ id: 'window-contract-company', name: 'window contract CPU' }, testCatalog);
  company.scale = 'building'; company.nodes = [];
  const floorId = `${company.id}/floor-1`, roomId = `${floorId}/room-a`;
  company.nodes.push(floor(floorId, rotated ? { position: [0, 0, 0], yaw: Math.PI / 2 } : undefined));
  company.nodes.push(room(roomId, floorId, [0, 0, 0]));
  if (shared) company.nodes.push(room(`${floorId}/room-b`, floorId, [6, 0, 0]));
  if (includeWindow) {
    const placements = [
      [`${roomId}/window-north`, [-1.2, 1.5, -2.4], 0],
      [`${roomId}/window-west`, [-2.9, 1.5, 0], Math.PI / 2],
      [`${roomId}/window-south`, [1.2, 1.5, 2.4], Math.PI],
      [`${roomId}/window-east`, [2.9, 1.5, 1], Math.PI * 1.5],
    ];
    for (const [id, position, yaw] of placements.slice(fourDirections ? 0 : 1, fourDirections ? 4 : 2))
      company.nodes.push(windowNode(id, roomId, position, yaw));
  }
  return company;
}

const results = [];
results.push(check('derive four cardinal window sides', () => {
  const document = makeDocument();
  const derived = deriveCompany(document, testCatalog, templates);
  const opening = [...derived.windowOpenings.values()].find(value => value.id.endsWith('window-north'));
  assert(opening);
  assert.equal(opening.regions.length, 1);
  assert.deepEqual(new Set([...derived.windowOpenings.values()].flatMap(value => value.regions.map(side => side.edge))), new Set(['north', 'south', 'west', 'east']));
  assert([...derived.windowOpenings.values()].every(value => value.groundPassable === false));
}));

results.push(check('derive shared wall creates two sides', () => {
  const document = makeDocument({ fourDirections: false, shared: true });
  const roomA = `${document.id}/floor-1/room-a`;
  document.nodes.push(windowNode(`${roomA}/shared-window`, roomA, [2.9, 1.5, 0], Math.PI * 1.5));
  const derived = deriveCompany(document, testCatalog, templates);
  const opening = derived.windowOpenings.get(`${roomA}/shared-window`);
  assert.equal(opening.regions.length, 2);
  assert.deepEqual(new Set(opening.regions.map(side => side.regionId)), new Set([roomA, `${document.id}/floor-1/room-b`]));
  assert.deepEqual(new Set(opening.regions.map(side => side.edge)), new Set(['east', 'west']));
}));

results.push(check('derive rotated floor remains valid', () => {
  const derived = deriveCompany(makeDocument({ fourDirections: true, rotated: true }), testCatalog, templates);
  assert.equal(derived.windowOpenings.size, 4);
  assert([...derived.windowOpenings.values()].every(value => value.regions.length === 1));
}));

results.push(check('reject invalid orientation and sill', () => {
  const orientation = makeDocument({ fourDirections: false });
  orientation.nodes.find(node => node.kind === 'facility').transform.yaw = .2;
  expectCode('invalid-window-orientation', () => windowData(orientation));
  const sill = makeDocument({ fourDirections: false });
  sill.nodes.find(node => node.kind === 'facility').transform.position[1] = .4;
  expectCode('invalid-window-sill', () => windowData(sill));
}));

results.push(check('reject seam and portal conflicts', () => {
  const seam = makeDocument({ fourDirections: false });
  seam.nodes.find(node => node.kind === 'facility').transform.position[2] = 2;
  expectCode('window-crosses-region-seam', () => windowData(seam));
  const portal = makeDocument({ fourDirections: false });
  const floorNode = portal.nodes.find(node => node.kind === 'floor');
  const roomId = `${portal.id}/floor-1/room-a`;
  floorNode.connections = [{ id: `${floorNode.id}/door`, from: { regionId: roomId, edge: 'west', offset: 0, width: 1.2 }, to: { regionId: roomId, edge: 'east', offset: 0, width: 1.2 } }];
  expectCode('window-over-portal', () => windowData(portal));
}));

results.push(check('wall display over window is rejected', () => {
  const document = makeDocument({ fourDirections: false });
  const wallResource = testCatalog.resources.find(resource => resource.mount === 'wall' && resource.mounting);
  assert(wallResource, 'Pinned catalog must include a wall display resource for this synthetic contract check');
  const roomId = `${document.id}/floor-1/room-a`;
  document.nodes.push({ id: `${roomId}/wall-display`, kind: 'facility', parentId: roomId,
    resource: { id: wallResource.id, version: wallResource.version }, transform: { position: [-2.9, 1.5, 0], yaw: Math.PI / 2 } });
  expectCode('wall-display-over-window', () => windowData(document));
}));

results.push(check('replace preserves window identity state and transform', () => {
  const document = makeDocument({ fourDirections: false });
  const target = document.nodes.find(node => node.kind === 'facility');
  target.state.openFraction = .75;
  const before = structuredClone(target);
  const changed = prepareCompanyChange(document, [{ type: 'replace-resource', id: target.id, resource: { id: 'synthetic-window-b', version: 1 } }], { catalog: testCatalog, templates }).document;
  const after = changed.nodes.find(node => node.id === target.id);
  assert.equal(after.id, before.id); assert.deepEqual(after.state, before.state); assert.deepEqual(after.transform, before.transform);
  assert.deepEqual(after.resource, { id: 'synthetic-window-b', version: 1 });
}));

results.push(check('appearance function rejects windowSystem change', () => {
  const source = windowResource('source-window');
  const changed = windowResource('changed-window');
  changed.windowSystem = { ...changed.windowSystem, sashTravel: .5 };
  const comparison = compareFacilityFunction(source, changed);
  assert.equal(comparison.compatible, false);
  assert(comparison.differences.some(difference => difference.field.includes('windowSystem')));
}));

results.push(check('remove restores physical walls while navigation walls remain', () => {
  const document = makeDocument({ fourDirections: false });
  const before = describeArchitecture(document, testCatalog, templates);
  const target = document.nodes.find(node => node.kind === 'facility');
  const removed = prepareCompanyChange(document, [{ type: 'remove', id: target.id }], { catalog: testCatalog, templates }).document;
  const after = describeArchitecture(removed, testCatalog, templates);
  assert(before.walls.length > after.walls.length, `physical wall count did not shrink after remove: ${before.walls.length} -> ${after.walls.length}`);
  assert.deepEqual(after.navigationWalls, before.navigationWalls);
  assert.deepEqual(after.visibilityWalls, before.visibilityWalls);
  assert.deepEqual(deriveCompany(removed, testCatalog, templates).windowOpenings, new Map());
}));

results.push(check('architecture wall slice area is conserved per side', () => {
  const document = makeDocument();
  const derived = deriveCompany(document, testCatalog, templates);
  const architecture = describeArchitecture(document, testCatalog, templates);
  for (const wall of architecture.navigationWalls) {
    const openingArea = [...derived.windowOpenings.values()].flatMap(value => value.regions)
      .filter(side => side.regionId === wall.regionId && side.edge === wall.edge)
      .filter(side => Math.abs(side.offset - wall.position[['north', 'south'].includes(wall.edge) ? 0 : 2]) < (wall.size[['north', 'south'].includes(wall.edge) ? 0 : 2] + side.width) / 2 - EPSILON)
      .reduce((sum, side) => sum + side.width * side.height, 0);
    const span = ['north', 'south'].includes(wall.edge) ? wall.size[0] : wall.size[2];
    const totalPhysical = architecture.walls.filter(piece => piece.sourceWallId === wall.id || piece.id === wall.id)
      .reduce((sum, piece) => sum + (['north', 'south'].includes(piece.edge) ? piece.size[0] : piece.size[2]) * piece.size[1], 0);
    assert(Math.abs(totalPhysical - (span * wall.size[1] - openingArea)) < 1e-6);
  }
}));

const failed = results.filter(result => result.status === 'failed');
const report = {
  status: failed.length ? 'failed' : 'passed',
  scope: 'Synthetic CPU window data contract and architecture integration checks',
  checks: results,
  syntheticContract: true,
  limitations: [
    'The four window resources are synthetic contract-only entries with no GLB asset or visual readback. This report does not claim real window material production.',
    'Navigation preserves the original wall graph. Physical wall slicing is checked through describeArchitecture and does not establish actor navigation around windows.',
  ],
  commands: ['node scripts/company-platform/test-window-contract.mjs'],
};
await fs.mkdir(evidenceRoot, { recursive: true });
await fs.writeFile(new URL('report.json', evidenceRoot), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, passed: results.length - failed.length, failed: failed.length }));
if (failed.length) process.exitCode = 1;

