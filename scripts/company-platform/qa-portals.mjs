import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import library from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates.json' with { type: 'json' };
import baseline from '../../prototype/src/company/examples/c1-two-stations.json' with { type: 'json' };
import studio from '../../prototype/src/company/examples/c1-studio.json' with { type: 'json' };
import { createCompany, deriveCompany, CompanyError } from '../../prototype/src/company/document.js';
import { createScaledCompany, inspectCompanyConnections } from '../../prototype/src/company/space.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';

const catalog = structuredClone(library), checks = [], examples = [];
function check(name, run) {
  const observed = run();
  checks.push({ name, passed: true, observed });
}
function reject(name, document, code, extra = () => {}) {
  check(name, () => {
    // The structural graph deliberately passes these physical-clearance cases.
    inspectCompanyConnections(document, catalog, templates);
    assert.throws(() => inspectCompanyPlacement(document, catalog, templates), error => {
      assert(error instanceof CompanyError);
      assert.equal(error.code, code, error.message);
      extra(error);
      return true;
    });
    return { expectedCode: code };
  });
}
for (const [name, document] of [['C1 two-stations', baseline], ['C1 studio', studio]]) {
  check(`${name} single-room compatibility`, () => {
    const result = inspectCompanyPlacement(document, catalog, templates);
    assert.equal(result.checkedPortals.length, 0);
    return { points: result.checkedPoints.length };
  });
}
const documents = new Map();
for (const name of ['rental-home', 'building-two-floors', 'building', 'maximum']) {
  const input = JSON.parse(await fs.readFile(new URL(`./space-inputs/${name}.json`, import.meta.url), 'utf8'));
  const document = createScaledCompany(input, catalog, templates);
  documents.set(name, document);
  check(`${name} every portal side and installed use-point joins its room grid`, () => {
    const before = JSON.stringify(document);
    const result = inspectCompanyPlacement(document, catalog, templates);
    const structural = inspectCompanyConnections(document, catalog, templates);
    const portalCount = structural.floors.reduce((total, floor) => total + floor.connections.length, 0);
    assert.equal(result.checkedPortals.length, portalCount * 2);
    assert.equal(result.checkedPoints.length, deriveCompany(document, catalog, templates).usePoints.length);
    assert.equal(JSON.stringify(document), before);
    assert(result.checkedPortals.every(portal => portal.connected));
    assert.equal(new Set(result.checkedPoints.map(point => point.id)).size, result.checkedPoints.length);
    examples.push({ name, floors: structural.floors.length, regions: result.rooms.length,
      businessRooms: structural.floors.reduce((total, floor) => total + floor.businessRooms, 0),
      portalConnections: portalCount, checkedPortalSides: result.checkedPortals.length,
      checkedUsePoints: result.checkedPoints.length, rules: result.rules });
    return examples.at(-1);
  });
}
check('Two-floor input retains parallel and quarter-turn facility layouts under separate floor IDs', () => {
  const document = documents.get('building-two-floors');
  const stations = document.nodes.filter(node => node.kind === 'workstation' && node.id.endsWith('station-2'));
  assert.equal(stations.length, 2);
  assert.equal(stations[0].transform.yaw, 0);
  assert.equal(stations[1].transform.yaw, Math.PI / 2);
  const result = inspectCompanyPlacement(document, catalog, templates);
  assert.equal(new Set(result.checkedPortals.map(portal => portal.floorId)).size, 2);
  return { stationYaws: stations.map(station => station.transform.yaw) };
});

function pair(width = 1.4) {
  const document = createCompany({ width: 6, depth: 6 }, catalog);
  document.scale = 'rental-home';
  const floor = document.nodes[0], left = document.nodes[1];
  left.purpose = 'rest';
  left.transform.position = [-3, 0, 0];
  const right = structuredClone(left);
  right.id = 'company-demo/room-2'; right.transform.position = [3, 0, 0];
  document.nodes.push(right);
  floor.connections = [{ id: 'pair-portal',
    from: { regionId: left.id, edge: 'east', offset: 0, width },
    to: { regionId: right.id, edge: 'west', offset: 0, width } }];
  return document;
}
function obstacle(document, id, regionId, position, halfSize) {
  catalog.resources.push({ id, version: 1, category: 'decor', mountRole: id,
    footprint: { center: [0, 0], halfSize, blocking: true }, usePoints: [], stateDefaults: {} });
  document.nodes.push({ id, kind: 'facility', parentId: regionId, resource: { id, version: 1 },
    transform: { position, yaw: 0 }, state: {} });
}
check('Exactly 0.60m portal admits the 0.50m envelope plus 0.10m total width margin', () => {
  const result = inspectCompanyPlacement(pair(0.6), catalog, templates);
  assert.equal(result.checkedPortals.length, 2);
  return { width: result.checkedPortals[0].width, margin: result.rules.portalTotalWidthMargin };
});
reject('0.59m portal rejects insufficient declared effective width', pair(0.59), 'narrow-portal');
const blockedFrom = pair();
obstacle(blockedFrom, 'from-side-block', 'company-demo/room-1', [2.82, 0, 0], [0.005, 0.03]);
reject('Thin furnishing on first side blocks the boundary crossing envelope', blockedFrom, 'blocked-portal');
const marginBlocked = pair();
obstacle(marginBlocked, 'portal-margin-block', 'company-demo/room-1', [2.82, 0, 0.28], [0.005, 0.005]);
reject('Portal physical clearance also retains the extra 0.05m margin on each side', marginBlocked, 'blocked-portal');
const blockedTo = pair();
obstacle(blockedTo, 'opposite-side-block', 'company-demo/room-2', [-2.82, 0, 0], [0.005, 0.03]);
reject('First side checks furnishing across the shared boundary on the opposite side', blockedTo, 'blocked-portal', error => {
  assert.equal(error.details.side, 'from');
  assert.equal(error.details.obstacleId, 'opposite-side-block');
});
const disconnected = pair();
disconnected.nodes[1].entry = { position: [-2, 0, 2] };
obstacle(disconnected, 'middle-thin-divider', 'company-demo/room-1', [0.03, 0, 0], [0.005, 3]);
reject('Clear portal endpoints still reject an intermediate thin divider sealing the room grid', disconnected, 'disconnected-portal');

const corridorSplit = structuredClone(documents.get('rental-home'));
const middleArea = corridorSplit.nodes.filter(node => node.kind === 'area')[1];
obstacle(corridorSplit, 'corridor-middle-divider', middleArea.id, [0.03, 0, 0], [0.005, 1.5]);
reject('Multiple portals of one corridor must join the same grid component', corridorSplit, 'disconnected-portal');

check('Quarter-turn floor transforms preserve portal interior and shared-boundary geometry', () => {
  const document = structuredClone(documents.get('building-two-floors'));
  const floor = document.nodes.find(node => node.kind === 'floor');
  floor.transform = { position: [12, 0, -8], yaw: Math.PI / 2 };
  const result = inspectCompanyPlacement(document, catalog, templates);
  const actual = result.checkedPortals.find(portal => portal.floorId === floor.id);
  const region = document.nodes.find(node => node.id === actual.regionId);
  const parent = new THREE.Group(), child = new THREE.Group();
  parent.position.fromArray(floor.transform.position); parent.rotation.y = floor.transform.yaw;
  child.position.fromArray(region.transform.position); child.rotation.y = region.transform.yaw;
  parent.add(child); parent.updateMatrixWorld(true);
  const expected = child.localToWorld(new THREE.Vector3(...actual.interior.local));
  assert(expected.distanceTo(new THREE.Vector3(...actual.interior.world)) < 1e-8);
  return { floorId: floor.id, portalSides: result.checkedPortals.length, witness: actual };
});
const rotatedBlocked = structuredClone(blockedTo);
rotatedBlocked.nodes[0].transform = { position: [12, 0, -8], yaw: Math.PI / 2 };
reject('Opposite-side blocker is still detected after rotating and translating its floor', rotatedBlocked, 'blocked-portal');
check('Missing multi-region connections fail the reused structural graph gate', () => {
  const document = pair();
  document.nodes[0].connections = [];
  assert.throws(() => inspectCompanyPlacement(document, catalog, templates), error => error.code === 'disconnected-regions');
});
check('Maximum input proves five separate viewing floors and fifty business rooms', () => {
  const derived = deriveCompany(documents.get('maximum'), catalog, templates);
  assert.equal(derived.capacity.floors, 5);
  assert.equal(derived.capacity.businessRooms, 50);
  assert.equal(derived.capacity.installedStations, 100);
  return derived.capacity;
});
const output = new URL('../../evidence/company-portals-v1/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const report = { status: 'passed', command: 'node scripts/company-platform/qa-portals.mjs',
  dispatch: { difficulty: 'standard', model: 'gpt-6.1-sol', reasoning_effort: 'medium',
    reason: 'Bounded extension of conservative placement grid to resolved portals and shared-edge obstacles.',
    configurationEvidence: 'Parent-confirmed existing configuration. Host hook interception unverified.' },
  sourceSha256: createHash('sha256').update(await fs.readFile(new URL('../../prototype/src/company/placement.js', import.meta.url))).digest('hex'),
  checks, examples,
  boundaries: { radius: 0.25, gridSpacing: 0.2, portalMinimumWidth: 0.6, totalPortalWidthMargin: 0.1,
    portalSegmentExpansion: 0.3, portalInteriorInset: 0.35, portalChecks: 'Both interior-to-center segments, all same-floor facility obstacles, one common grid per room/area' },
  limitations: ['Static conservative passage only. No real character use, navigation, animation or body-fit acceptance.',
    'Floors are separate viewing layers. Stairs, lifts, vertical travel, animated doors and crowd capacities are unverified.',
    'Square envelope expansion and four-neighbour 0.20m sampling may reject narrow or diagonal feasible routes.'] };
await fs.writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', checks: checks.length, examples }));
