import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { deriveCompany, prepareCompanyChange } from '../../prototype/src/company/document.js';
import { decodeCompanySave, encodeCompanySave } from '../../prototype/src/company/persistence.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';
import { describeCompanyUsePoint } from '../../prototype/src/company/use-point-data.js';
import { inspectSeatContacts } from './check-seat-contacts.mjs';

const [outArg, ...extra] = process.argv.slice(2);
if (!outArg || outArg.startsWith('-') || extra.length) {
  throw new Error('Usage: node build-vanity-seat-contact-rooms.mjs NEW_OUTPUT_DIRECTORY');
}
const out = path.resolve(outArg);
const root = new URL('../../', import.meta.url);
const old = { id: 'vanity-chair-side-entry', version: 1 };
const upgrade = { id: old.id, version: 2 };
const fixtures = [
  { key: 'vanity-display', source: 'prototype/src/company/examples/c1-vanity-display.json', seats: ['vanity/primary/seat'] },
  { key: 'vanity-alternate', source: 'prototype/src/company/examples/c1-vanity-alternate.json', seats: ['vanity/primary/seat', 'vanity/secondary/seat'] },
];
const options = { catalog, templates };
const isRef = (ref, target) => ref?.id === target.id && ref.version === target.version;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const node = (doc, id) => doc.nodes.find(item => item.id === id);
const stableContact = ({ revision, resource, ...contact }) => contact;
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sourceResource = catalog.resources.find(resource => isRef(resource, old));
const targetResource = catalog.resources.find(resource => isRef(resource, upgrade));
assert(sourceResource && targetResource, 'Build the registered vanity side-entry @2 catalog first');
assert.deepEqual(compareFacilityFunction(sourceResource, targetResource), { compatible: true, differences: [] });
assert.equal(targetResource.provenance.functionalAdapter.source.id, 'chair-ladder');

async function generate(fixture) {
  const bytes = await fs.readFile(new URL(fixture.source, root));
  const original = JSON.parse(bytes);
  const before = deriveCompany(original, catalog, templates);
  const oldSeats = before.facilities.filter(item => isRef(item.node.resource, old)).map(item => item.id);
  assert.deepEqual(oldSeats.sort(), fixture.seats.slice().sort());
  const operations = fixture.seats.map(id => ({ type: 'replace-resource', id, resource: upgrade }));
  const expected = structuredClone(original);
  let current = original;
  for (const operation of operations) {
    current = prepareCompanyChange(current, [operation], options).document;
    expected.revision++;
    node(expected, operation.id).resource = upgrade;
  }
  assert.deepEqual(current, expected);
  const after = deriveCompany(current, catalog, templates);
  assert.deepEqual(after.vanityClearances, before.vanityClearances);
  assert.deepEqual(inspectCompanyPlacement(current, catalog, templates), inspectCompanyPlacement(original, catalog, templates));
  for (const id of fixture.seats) {
    const usePoint = id + '#seat';
    assert.deepEqual(stableContact(describeCompanyUsePoint(current, after, usePoint)),
      stableContact(describeCompanyUsePoint(original, before, usePoint)));
  }
  const rays = await inspectSeatContacts(current, options);
  assert.deepEqual(rays.map(point => point.instanceId).sort(), fixture.seats.slice().sort());
  for (const point of rays) {
    assert.equal(point.status, 'passed');
    assert.equal(point.samples.length, 5);
    assert(point.samples.every(sample => Math.abs(sample.actualHeight - .470) < 1e-6));
  }
  const initial = await encodeCompanySave(original, catalog, templates);
  const saved = await encodeCompanySave(current, catalog, templates);
  assert.deepEqual(await decodeCompanySave(saved, catalog, templates), current);
  const folder = path.join(out, fixture.key);
  await fs.mkdir(folder);
  await writeJson(path.join(folder, 'layout.json'), current);
  await writeJson(path.join(folder, 'replace.operations.json'), operations);
  await fs.writeFile(path.join(folder, 'original.save.json'), initial, { flag: 'wx' });
  await fs.writeFile(path.join(folder, 'save.json'), saved, { flag: 'wx' });
  const result = { key: fixture.key, source: fixture.source, sourceSha256: hash(bytes), instances: fixture.seats,
    oldSaveSha256: hash(initial), saveSha256: hash(saved), pairs: after.vanityClearances, rays };
  await writeJson(path.join(folder, 'report.json'), result);
  return result;
}

await fs.mkdir(out);
const rooms = [];
for (const fixture of fixtures) rooms.push(await generate(fixture));
await writeJson(path.join(out, 'report.json'), { status: 'passed', adapter: targetResource.provenance.functionalAdapter, rooms });
console.log(JSON.stringify({ status: 'passed', output: out, rooms: rooms.map(({ key, instances }) => ({ key, instances })) }));
