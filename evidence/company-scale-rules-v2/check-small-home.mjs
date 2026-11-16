import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates.json' with {type: 'json'};
import smallHome from '../../prototype/src/company/examples/c2-small-home.json' with {type: 'json'};
import {deriveCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {encodeCompanySave, decodeCompanySave} from '../../prototype/src/company/persistence.js';

const root = new URL('../../', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const inputPaths = ['prototype/src/company/document.js', 'prototype/src/company/space.js', 'prototype/src/company/library-catalog.json',
  'prototype/src/company/templates.json', 'prototype/src/company/examples/c2-small-home.json', 'prototype/src/company/placement.js',
  'prototype/src/company/persistence.js', 'evidence/company-space-v1/maximum.layout.json',
  'evidence/company-appearance-contract-v1/report.json', 'evidence/company-scale-rules-v2/check-small-home.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(inputPaths.map(async path => [path, sha(await fs.readFile(new URL(path, root)))])));
const inputHashes = await hashes();
const checks = [];
const check = async (name, run) => {await run(); checks.push({name, passed: true});};
await check('only small-home admission changes the previously verified appearance document; original space factory bytes are restored', async () => {
  const appearance = JSON.parse(await fs.readFile(new URL(inputPaths[8], root), 'utf8'));
  const documentSource = await fs.readFile(new URL(inputPaths[0], root), 'utf8');
  const priorDocument = documentSource.replace(/  'small-home': \{ floors: 1, rooms: 1, stations: 2 \},\r?\n/, '');
  assert.equal(sha(priorDocument), appearance.inputHashes[inputPaths[0]]);
  const historical = JSON.parse(await fs.readFile(new URL('evidence/company-space-v1/report.json', root), 'utf8'));
  assert.equal(inputHashes[inputPaths[1]], historical.inputs.find(i => i.path === inputPaths[1]).sha256);
});
await check('actual 6 by 5.25 metre small-home has one business room and one initial station', async () => {
  const before = JSON.stringify(smallHome), derived = deriveCompany(smallHome, catalog, templates);
  assert.deepEqual(derived.capacity, {maximum: {floors: 1, rooms: 1, stations: 2}, installedStations: 1, businessRooms: 1, floors: 1});
  const room = smallHome.nodes.find(n => n.kind === 'room');
  assert.equal(room.bounds.width * room.bounds.depth, 31.5);
  inspectCompanyConnections(smallHome, catalog, templates);
  inspectCompanyPlacement(smallHome, catalog, templates);
  assert.deepEqual(await decodeCompanySave(await encodeCompanySave(smallHome, catalog, templates), catalog, templates), smallHome);
  assert.equal(JSON.stringify(smallHome), before);
});
await check('second business room rejects atomically without changing the actual small-home input', async () => {
  const before = JSON.stringify(smallHome);
  assert.throws(() => prepareCompanyChange(smallHome, [{type: 'add-room', id: 'extra-room', parentId: smallHome.nodes.find(n => n.kind === 'floor').id,
    purpose: 'work', bounds: {width: 3, depth: 3}, transform: {position: [10, 0, 0], yaw: 0}}], {catalog, templates}), e => e.code === 'scale-capacity');
  assert.equal(JSON.stringify(smallHome), before);
});
await check('historical five-floor fifty-room one-hundred-station layout remains unchanged and accepted', async () => {
  const text = await fs.readFile(new URL(inputPaths[7], root), 'utf8'), old = JSON.parse(text);
  const derived = deriveCompany(old, catalog, templates);
  assert.equal(derived.capacity.floors, 5);
  assert.equal(derived.capacity.businessRooms, 50);
  assert.equal(derived.capacity.installedStations, 100);
  assert.deepEqual(derived.capacity.maximum, {floors: 5, rooms: 50, stations: 100});
  inspectCompanyConnections(old, catalog, templates);
  assert.equal(await fs.readFile(new URL(inputPaths[7], root), 'utf8'), text);
});
assert.deepEqual(await hashes(), inputHashes);
const report = {status: 'small-home-admission-passed', generatedAt: new Date().toISOString(), inputHashes, inputHashesUnchangedAtEnd: true, checks,
  scope: 'Small-home document admission only. Existing floor factory bytes and prior limits are retained.',
  deferred: ['16-room hotel floor', 'configurable building floor count', 'additional public spaces', 'boss room and upper floor ideas'],
  limits: ['No GPU/browser or character-use work. Portal graph and static placement only.', 'The existing factory continues to consume its original technical input scales. Small-home is consumed from its explicit new layout JSON.', 'The inherited two-station room ceiling is an upper bound, not a claim that any two-station fitout has passed.']};
await fs.writeFile(new URL('report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, checks: checks.length}));
