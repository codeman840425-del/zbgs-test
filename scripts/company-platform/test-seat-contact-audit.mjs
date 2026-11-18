import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import registeredCatalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { createCompany } from '../../prototype/src/company/document.js';
import { encodeCompanySave } from '../../prototype/src/company/persistence.js';
import { inspectSeatContacts } from './check-seat-contacts.mjs';

const [out, ...extra] = process.argv.slice(2);
if (!out || extra.length || out.startsWith('-')) throw new Error('Usage: node scripts/company-platform/test-seat-contact-audit.mjs NEW_OUTPUT_DIRECTORY');
const directory = path.resolve(out);
await fs.mkdir(directory);
const cli = fileURLToPath(new URL('./check-seat-contacts.mjs', import.meta.url));
const write = async (name, value) => {
  const filename = path.join(directory, name);
  await fs.writeFile(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  return filename;
};
const run = (code, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, code, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const coordinates = (actual, expected) => expected.forEach((number, index) => near(actual[index], number));
const def = id => registeredCatalog.resources.find(resource => resource.id === id && resource.version === 1);

const catalog = structuredClone(registeredCatalog);
const desk = catalog.resources.find(resource => resource.id === 'desk' && resource.version === 1);
desk.usePoints = [{ id: 'standing', position: [0, 0, 0], yaw: 0, capacity: 1 }];
const narrow = structuredClone(def('chair'));
narrow.id = 'test-seat-narrow';
const seat = narrow.node.children.find(child => child.id === 'chair-seat');
seat.geometry.parameters[0] = .03;
seat.geometry.parameters[2] = .03;
seat.position[1] = .47 - seat.geometry.parameters[1] / 2;
catalog.resources.push(narrow);
const catalogPath = await write('catalog.json', catalog);

const company = createCompany({ id: 'seat-audit-fixture', width: 14, depth: 10 }, catalog);
company.scale = 'building';
const [firstFloor, firstRoom] = company.nodes;
const quarterTurn = Math.PI / 2;
firstFloor.transform = { position: [2, 0, -3], yaw: quarterTurn };
firstRoom.transform = { position: [1, 0, -1], yaw: quarterTurn };
const secondFloor = { ...structuredClone(firstFloor), id: company.id + '/floor-2', transform: { position: [-4, 0, 6], yaw: -quarterTurn } };
const secondRoom = { ...structuredClone(firstRoom), id: company.id + '/room-2', parentId: secondFloor.id,
  purpose: 'rest', transform: { position: [1, 0, 2], yaw: quarterTurn } };
company.nodes.push(secondFloor, secondRoom);
const asset = (id, parent, position, yaw = 0) => ({ id, kind: 'facility', parentId: parent.id, transform: { position, yaw },
  resource: { id, version: 1 }, state: {} });
company.nodes.push(
  asset('chair-cantilever', firstRoom, [2.5, 0, 1], quarterTurn),
  asset('chair-pedestal', firstRoom, [0, 0, 1], quarterTurn),
  asset('chair-ladder', firstRoom, [-2.5, 0, 1]),
  asset('chair-crossbeam', firstRoom, [-2.5, 0, -2.5]),
  asset('desk', firstRoom, [0, 0, -2.4]),
  asset('sofa-modular', secondRoom, [0, 0, -1.5], quarterTurn),
  asset('sofa-arch', secondRoom, [0, 0, 1.7]),
);
const layout = await write('rotated-building.layout.json', company);
const save = await write('rotated-building.save.json', JSON.parse(await encodeCompanySave(company, catalog, templates)));
const measured = run(0, layout, save, '--catalog', catalogPath, '--strict', '--report', path.join(directory, 'rotated-building.audit.json'));
assert.equal(measured.summary.passedPoints, 16);
assert.deepEqual(measured.inputs[0].points, measured.inputs[1].points);
const positive = measured.inputs[0].points;
assert.deepEqual(await inspectSeatContacts(company, { catalog, templates }), positive);
assert(positive.every(point => point.samples.length === 5 && point.samples.every(sample => !sample.code)));
assert(!positive.some(point => point.resource.id === 'desk'));
const rotated = positive.find(point => point.instanceId === 'chair-cantilever');
coordinates(rotated.samples[0].hit, [-1.5, .47, -5]);
coordinates(rotated.samples[1].hit, [-1.5, .47, -5.02]);
const hidden = positive.find(point => point.instanceId === 'sofa-modular' && point.pointId === 'left');
assert.equal(hidden.floorId, secondFloor.id);
coordinates(hidden.samples[0].hit, [-5.96, .47, 5.98]);
coordinates(hidden.samples[1].hit, [-5.96, .47, 6]);

// A side-entry seat is valid only with its actual paired vanity table in the room.
const vanity = fileURLToPath(new URL('../../prototype/src/company/examples/c1-vanity-display.json', import.meta.url));
const pair = run(1, vanity).inputs[0].points.find(point => point.resource.id === 'vanity-chair-side-entry');
assert.deepEqual(pair.failures, ['seat-height-mismatch']);
near(pair.actualHeight, .475);

const bad = createCompany({ id: 'seat-failures', width: 10, depth: 7 }, catalog);
const [, room] = bad.nodes;
bad.nodes.push(asset('chair', room, [-2, 0, 0]), asset('test-seat-narrow', room, [0, 0, 0]), asset('chair-ladder', room, [2, 0, 0]));
const badLayout = await write('bad-seats.layout.json', bad);
const invalid = run(1, badLayout, '--catalog', catalogPath, '--report', path.join(directory, 'bad-seats.audit.json')).inputs[0];
assert.equal(invalid.points.length, 3);
const [legacy, tiny, good] = invalid.points;
assert.equal(legacy.geometry, 'procedural');
assert.equal(legacy.expectedHeight, .47);
near(legacy.actualHeight, .475);
assert(legacy.samples.every(sample => sample.code === 'seat-height-mismatch'));
near(tiny.actualHeight, .47);
assert.deepEqual(tiny.failures, ['seat-contact-miss']);
assert(tiny.samples.slice(1).every(sample => sample.code === 'seat-contact-miss'));
assert.equal(good.status, 'passed');

const missingAsset = run(1, badLayout, '--catalog', catalogPath, '--public-dir', path.join(directory, 'absent-public')).inputs[0];
const missing = missingAsset.points.find(point => point.instanceId === 'chair-ladder');
assert.equal(missing.diagnostic.code, 'missing-seat-asset');
assert.match(missing.diagnostic.path, /chair-ladder.*model\.glb$/);
assert.equal(missingAsset.points[0].actualHeight, legacy.actualHeight);
const noResource = structuredClone(bad);
noResource.nodes.at(-1).resource.version = 999;
const missingRef = run(1, await write('missing-resource.layout.json', noResource), '--catalog', catalogPath).inputs[0].diagnostic;
assert.equal(missingRef.code, 'missing-resource-version');
assert.equal(missingRef.instanceId, 'chair-ladder');
assert.deepEqual(missingRef.resource, { id: 'chair-ladder', version: 999 });
const report = { status: 'passed', registeredSeatPoints: positive.length, floors: 2, layoutAndSaveMatch: true,
  negativeCases: ['legacy-high-seat', 'centre-only-support', 'missing-glb', 'missing-resource'], ignoredNonseatUsePoint: true };
const evidence = await write('report.json', report);
console.log(JSON.stringify({ ...report, report: evidence }));
