import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import originalCatalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates.json' with { type: 'json' };
import baseline from '../../prototype/src/company/examples/c1-two-stations.json' with { type: 'json' };
import studio from '../../prototype/src/company/examples/c1-studio.json' with { type: 'json' };
import { createCompany, deriveCompany, CompanyError } from '../../prototype/src/company/document.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';

const catalog = structuredClone(originalCatalog);
const chair = catalog.resources.find(resource => resource.id === 'chair' && resource.version === 1);
const fields = { capacity: 1, position: [0, 0, 0], approach: [0, 0, 0.6], exit: [0, 0, 0.65], clearance: { width: 0.7, depth: 0.65 } };
const fixturePatches = [];
for (const [field, value] of Object.entries(fields)) {
  if (chair.usePoints[0][field] === undefined) {
    chair.usePoints[0][field] = value;
    fixturePatches.push(`Local QA clone chair@1.${field}`);
  }
}
const checks = [], accepted = [];
function pass(name, fn) { fn(); checks.push({ name, passed: true }); }
function rejected(name, document, code, useCatalog = catalog) {
  pass(name, () => {
    assert.throws(() => inspectCompanyPlacement(document, useCatalog, templates), error => {
      assert(error instanceof CompanyError);
      assert.equal(error.code, code, error.message);
      return true;
    });
  });
}
for (const [name, document] of [['two-stations', baseline], ['studio', studio]]) {
  pass(`${name} declared use spaces pass without mutating input or occupancy state`, () => {
    const before = JSON.stringify(document), beforeCatalog = JSON.stringify(catalog);
    const result = inspectCompanyPlacement(document, catalog, templates);
    assert.equal(JSON.stringify(document), before);
    assert.equal(JSON.stringify(catalog), beforeCatalog);
    assert.equal(result.checkedPoints.length, name === 'studio' ? 4 : 2);
    assert.equal(new Set(result.checkedPoints.map(point => point.id)).size, result.checkedPoints.length);
    assert(result.rooms[0].entrySource.includes('not a real door'));
    accepted.push({ name, result });
  });
}
function singleChair() {
  const document = createCompany({}, catalog);
  document.nodes.push({ id: 'test-chair', kind: 'facility', parentId: 'company-demo/room-1',
    resource: { id: 'chair', version: 1 }, transform: { position: [0, 0, 0], yaw: 0 }, state: {} });
  return document;
}
function blocker(id, halfSize) {
  const resource = { id, version: 1, category: 'decor', footprint: { center: [0, 0], halfSize, blocking: true }, usePoints: [], stateDefaults: {} };
  catalog.resources.push(resource);
  return resource;
}
function addBlock(document, id, resource, position) {
  document.nodes.push({ id, kind: 'facility', parentId: 'company-demo/room-1', resource: { id: resource.id, version: 1 },
    transform: { position, yaw: 0 }, state: {} });
}
const tiny = blocker('qa-tiny-block', [0.05, 0.05]);
const blocked = singleChair();
addBlock(blocked, 'approach-block', tiny, [0, 0, 0.7]);
deriveCompany(blocked, catalog, templates);
rejected('Nonoverlapping furniture may still block the declared approach envelope', blocked, 'blocked-use-space');

const vertical = blocker('qa-ring-vertical', [0.1, 1.1]);
const horizontal = blocker('qa-ring-horizontal', [1.1, 0.1]);
const enclosed = singleChair();
addBlock(enclosed, 'ring-left', vertical, [-1.2, 0, 0]);
addBlock(enclosed, 'ring-right', vertical, [1.2, 0, 0]);
addBlock(enclosed, 'ring-front', horizontal, [0, 0, 1.2]);
addBlock(enclosed, 'ring-rear', horizontal, [0, 0, -1.2]);
deriveCompany(enclosed, catalog, templates);
rejected('Four surrounding barriers reject an isolated free approach', enclosed, 'disconnected-use-space');

const thin = blocker('qa-thin-wall', [0.005, 3.5]);
const split = singleChair();
split.nodes.find(node => node.id === 'test-chair').transform.position[0] = -1;
addBlock(split, 'thin-divider', thin, [0.03, 0, 0]);
rejected('Continuous edge checks cannot step through a thin divider between grid columns', split, 'disconnected-use-space');

pass('Rotated floor, room and facility use parent-world coordinates', () => {
  const document = singleChair();
  document.nodes[0].transform = { position: [5, 0, 3], yaw: Math.PI / 2 };
  document.nodes[1].transform = { position: [2, 0, -1], yaw: Math.PI / 2 };
  document.nodes[1].entry = { position: [3, 0, 2] };
  document.nodes[2].transform = { position: [1, 0, 0], yaw: Math.PI / 2 };
  const result = inspectCompanyPlacement(document, catalog, templates);
  const floor = new THREE.Group(), room = new THREE.Group(), facility = new THREE.Group();
  floor.add(room); room.add(facility);
  [floor, room, facility].forEach((object, index) => {
    object.position.fromArray(document.nodes[index].transform.position);
    object.rotation.y = document.nodes[index].transform.yaw;
  });
  floor.updateMatrixWorld(true);
  const expected = facility.localToWorld(new THREE.Vector3(...fields.approach));
  assert(expected.distanceTo(new THREE.Vector3(...result.checkedPoints[0].approach.world)) < 1e-8);
  assert.equal(result.rooms[0].entrySource, 'declared room-local test entry');
  accepted.push({ name: 'rotated-floor-room-facility', result });
});
pass('Rotated-room blocker follows the same parent transform as the approach', () => {
  const document = structuredClone(blocked);
  document.nodes[1].transform = { position: [3, 0, -2], yaw: Math.PI / 2 };
  assert.throws(() => inspectCompanyPlacement(document, catalog, templates), error => error.code === 'blocked-use-space');
});
const missing = structuredClone(catalog);
delete missing.resources.find(resource => resource.id === 'chair').usePoints[0].approach;
rejected('Missing approach refuses admission with missing-use-space', singleChair(), 'missing-use-space', missing);
const capacity = structuredClone(catalog);
capacity.resources.find(resource => resource.id === 'chair').usePoints[0].capacity = 2;
rejected('Unsupported point capacity refuses static single-person admission', singleChair(), 'missing-use-space', capacity);
const missingSofa = structuredClone(catalog);
delete missingSofa.resources.find(resource => resource.id === 'lounge-sofa').usePoints[0].position;
rejected('Multiple-seat assets require explicit positions', studio, 'missing-use-space', missingSofa);
pass('Only legacy single chair position may default to the ground origin', () => {
  const legacy = structuredClone(catalog);
  delete legacy.resources.find(resource => resource.id === 'chair').usePoints[0].position;
  const result = inspectCompanyPlacement(singleChair(), legacy, templates);
  assert(result.warnings.some(message => message.includes('legacy single-chair')));
});
for (const [name, position] of [['nonfinite', [NaN, 0, 1]], ['outside', [10, 0, 0]], ['elevated', [0, 1, 0]]]) {
  const document = singleChair();
  document.nodes[1].entry = { position };
  rejected(`${name} room-local entry is rejected`, document, 'invalid-entry');
}
const ownBlocked = structuredClone(catalog);
ownBlocked.resources.find(resource => resource.id === 'chair').usePoints[0].approach = [0, 0, 0];
rejected('Approach cannot intersect its own chair footprint', singleChair(), 'blocked-use-space', ownBlocked);
const outside = structuredClone(catalog);
outside.resources.find(resource => resource.id === 'chair').usePoints[0].exit = [0, 0, 3.4];
rejected('Exit person envelope cannot cross a room edge', singleChair(), 'outside-use-space', outside);
const overlapping = singleChair();
addBlock(overlapping, 'overlap', tiny, [0, 0, 0]);
rejected('Existing derive rejects actual furniture overlap first', overlapping, 'overlapping-facilities');
const report = { status: 'passed', dispatch: { difficulty: 'standard', model: 'gpt-6.1-sol', reasoning_effort: 'medium',
  reason: 'Finite rectangular quarter-turn static placement and explicit geometric counterexamples.',
  configurationEvidence: 'Parent-confirmed existing configuration. Host hook interception unverified.' },
  command: 'node scripts/company-platform/qa-placement.mjs', fixturePatches, checks, accepted,
  limitations: ['Static C1 authoring envelope and conservative grid only. C3 actual character usage and navigation remain unverified.',
    'Default internal test origins are not doors. C2 doorway and cross-room routing rules are outside this module.'] };
report.sourceSha256 = createHash('sha256').update(await fs.readFile(new URL('../../prototype/src/company/placement.js', import.meta.url))).digest('hex');
const output = new URL('../../evidence/company-placement-v1/', import.meta.url);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', checks: checks.length, fixturePatches }));
