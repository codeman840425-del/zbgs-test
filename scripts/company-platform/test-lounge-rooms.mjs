import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import batchRecipe from './batch-inputs/lounge-rooms.json' with { type: 'json' };
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { runCompanyBatch } from './batch.mjs';
import { deriveCompany, prepareCompanyChange } from '../../prototype/src/company/document.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';
import { decodeCompanySave, encodeCompanySave } from '../../prototype/src/company/persistence.js';

const [out, ...options] = process.argv.slice(2);
if (!out || options.length > 1 || options.some(option => option !== '--preflight-round')) {
  throw new Error('Usage: node test-lounge-rooms.mjs OUT [--preflight-round]');
}
const preflight = options.includes('--preflight-round');
const round = { id: 'side-table-round', version: 1 };
const carved = { id: 'side-table-carved-round', version: 1 };
const tableRef = preflight ? round : carved;
const oldRef = preflight ? { id: 'side-table-nested', version: 1 } : round;
const moves = { 'studio-lounge': [1.83, 0, -1.24], 'rental-lounge': [-0.58, 0, 1.48] };
const change = (document, operation) => prepareCompanyChange(document, [operation], { catalog, templates }).document;
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

function examineRoom(document, roomId) {
  const derived = deriveCompany(document, catalog, templates);
  const room = derived.nodes.get(roomId);
  assert.equal(room?.purpose, 'rest');
  const parts = Object.fromEntries(['sofa', 'rug', 'cup-table', 'book-table', 'cup', 'book'].map(key => [
    key, derived.nodes.get(roomId + '/' + key),
  ]));
  for (const key of ['sofa', 'rug', 'cup-table', 'book-table']) assert.equal(parts[key]?.parentId, roomId);
  for (const key of ['cup', 'book']) {
    const member = parts[key];
    assert.equal(member?.parentId, parts[key + '-table'].id);
    assert.deepEqual(member.attachment, { surfaceId: 'top' });
    assert.equal(derived.roomIds.get(member.id), roomId);
  }
  return { room, parts, worlds: derived.worlds };
}

function assertPosition(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (const [axis, value] of expected.entries()) {
    assert(Math.abs(actual[axis] - value) < 1e-8, JSON.stringify({ actual, expected }));
  }
}

const batch = structuredClone(batchRecipe);
if (preflight) {
  for (const item of batch.items) {
    const table = item.operations.find(operation => operation.resource?.id === carved.id);
    table.resource = round;
  }
}
const result = await runCompanyBatch(batch, { outputDirectory: out });
assert(result.ok, JSON.stringify(result));
const repeated = await runCompanyBatch(batch, { outputDirectory: out });
assert(repeated.ok && repeated.results.every(item => item.status === 'idempotent'), JSON.stringify(repeated));
const evidence = [];
for (const item of batch.items) {
  const directory = path.join(out, item.key);
  const layout = await readJson(path.join(directory, 'layout.json'));
  const save = await fs.readFile(path.join(directory, 'save.json'), 'utf8');
  assert.deepEqual(await decodeCompanySave(save, catalog, templates), layout);
  const roomId = item.input.id + '/ground/lounge';
  const initial = examineRoom(layout, roomId);
  assert.deepEqual(initial.parts.sofa.resource, { id: 'lounge-sofa', version: 1 });
  assert.deepEqual(initial.parts.rug.resource, { id: 'rug-border', version: 1 });
  assert.deepEqual(initial.parts['cup-table'].resource, tableRef);
  assert.deepEqual(initial.parts['book-table'].resource, round);
  assert.deepEqual(initial.parts.cup.resource, { id: 'side-table-life-cup', version: 1 });
  assert.deepEqual(initial.parts.book.resource, { id: 'side-table-life-pen-notebook', version: 1 });
  const tableId = initial.parts['cup-table'].id;
  const move = moves[item.key];
  const moved = change(layout, { type: 'move', id: tableId, transform: { position: move, yaw: 0 } });
  inspectCompanyPlacement(moved, catalog, templates);
  const rotated = change(moved, { type: 'move', id: tableId, transform: { position: move, yaw: Math.PI / 2 } });
  inspectCompanyPlacement(rotated, catalog, templates);
  const replaced = change(rotated, { type: 'replace-resource', id: tableId, resource: oldRef });
  const restoredLook = change(replaced, { type: 'replace-resource', id: tableId, resource: tableRef });
  const final = examineRoom(restoredLook, roomId);
  for (const key of ['sofa', 'rug', 'cup', 'book', 'book-table']) assert.deepEqual(final.parts[key], initial.parts[key]);
  assert.deepEqual(final.parts['cup-table'], { ...initial.parts['cup-table'], transform: { position: move, yaw: Math.PI / 2 } });
  const local = initial.parts.cup.transform.position;
  const tableWorld = final.worlds.get(tableId).position;
  const cupWorld = final.worlds.get(initial.parts.cup.id).position;
  assertPosition(cupWorld, [tableWorld[0] + local[2], tableWorld[1] + local[1], tableWorld[2] - local[0]]);
  assert.deepEqual(final.worlds.get(initial.parts.book.id), initial.worlds.get(initial.parts.book.id));
  const untouched = JSON.stringify(restoredLook);
  assert.throws(() => change(restoredLook, {
    type: 'move', id: tableId, transform: { position: [99, 0, move[2]], yaw: Math.PI / 2 },
  }), { code: 'invalid-floor-fit' });
  assert.equal(JSON.stringify(restoredLook), untouched);
  assert.deepEqual(await decodeCompanySave(await encodeCompanySave(restoredLook, catalog, templates), catalog, templates), restoredLook);
  evidence.push({ key: item.key, roomId, bounds: initial.room.bounds, tableId, cupWorld, oldRef, tableRef });
}
assert.notDeepEqual(evidence[0].bounds, evidence[1].bounds);
console.log(JSON.stringify({ status: 'passed', preflight, idempotent: true, results: evidence }, null, 2));
