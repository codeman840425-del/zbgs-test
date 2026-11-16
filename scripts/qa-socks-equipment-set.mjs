import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEquipmentSet, prepareLoadedEquipmentSet, commitLoadedEquipmentSet } from '../prototype/src/equipment-set.js';
import { FOUNDATION_PROFILES, foundationProfile } from '../prototype/src/foundation-profiles.js';
import { outfitSelection } from '../prototype/src/outfit-selection.js';

const checks = [], inputs = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function check(name, operation) {
  operation(); checks.push({ name, passed: true });
}
const publicRoot = new URL('../prototype/public/', import.meta.url);
async function catalogFor(bodyType) {
  const profile = foundationProfile(bodyType);
  const path = new URL('.' + profile.manifestUrl, publicRoot);
  const bytes = await readFile(path);
  inputs.push({ bodyType, manifestUrl: profile.manifestUrl, manifestSha256: sha(bytes), bodySha256: profile.sha256 });
  return { profile, entries: JSON.parse(bytes).items };
}
const catalogs = new Map();
for (const bodyType of Object.keys(FOUNDATION_PROFILES)) {
  const catalog = await catalogFor(bodyType); catalogs.set(bodyType, catalog);
  for (const outfit of catalog.profile.outfits) {
    check(`existing ${bodyType} outfit ${outfit.index} preserves selected IDs and order`, () => {
      const selected = outfitSelection(catalog.profile, outfit.index);
      assert.deepEqual(resolveEquipmentSet(catalog.entries, selected.ids, catalog.profile.sha256).map(entry => entry.id), selected.ids);
    });
  }
}

const male = catalogs.get('male'), female = catalogs.get('female');
const pair = entry => ({ id: entry.id, sha256: entry.sha256 });
function withSocks(catalog) {
  const { profile } = catalog, entries = structuredClone(catalog.entries);
  const shoes = entries.find(entry => entry.id === profile.ids.shoes);
  const lower = ['pants', 'shorts'].filter(role => profile.ids[role]).map(role => entries.find(entry => entry.id === profile.ids[role]));
  const socks = { id: 'qa-socks', slot: 'socks', sha256: 'a'.repeat(64), compatibleAvatarSha256: profile.sha256,
    pairedWith: { shoes: [pair(shoes)], lower: lower.map(pair) } };
  entries.push(socks);
  return { profile, entries, socks, shoes, lower };
}
function rejected(fixture, ids, pattern, body = fixture.profile.sha256) {
  const loaded = new Map(fixture.entries.map((entry, index) => [entry.id, { container: { visible: index % 2 === 0 } }]));
  const before = [...loaded].map(([id, value]) => [id, value.container.visible]);
  const entriesBefore = structuredClone(fixture.entries);
  assert.throws(() => commitLoadedEquipmentSet(loaded, fixture.entries, ids, body), pattern);
  assert.deepEqual([...loaded].map(([id, value]) => [id, value.container.visible]), before);
  assert.deepEqual(fixture.entries, entriesBefore);
}
const idsFor = (fixture, lowerRole = 'pants') => [fixture.profile.ids.top, fixture.shoes.id, fixture.profile.ids[lowerRole], fixture.socks.id];

for (const catalog of [female, male]) {
  for (const role of ['pants', 'shorts'].filter(role => catalog.profile.ids[role])) {
    check(`${catalog.profile.id} ${role} plus socks resolves actual shoes/lower IDs and hashes`, () => {
      const f = withSocks(catalog), ids = idsFor(f, role);
      assert.deepEqual(resolveEquipmentSet(f.entries, ids, f.profile.sha256).map(entry => entry.id), ids);
    });
  }
}
check('empty final set commits none and never requires an unselected socks rule', () => {
  const f = withSocks(male); delete f.socks.pairedWith;
  const loaded = new Map(f.entries.map(entry => [entry.id, { container: { visible: true } }]));
  assert.deepEqual(resolveEquipmentSet(f.entries, [], f.profile.sha256), []);
  assert.deepEqual(commitLoadedEquipmentSet(loaded, f.entries, [], f.profile.sha256), []);
  assert.ok([...loaded.values()].every(value => value.container.visible === false));
});
check('old outfit does not inspect unselected malformed socks metadata', () => {
  const f = withSocks(male); f.socks.pairedWith = null;
  const ids = outfitSelection(f.profile, 0).ids;
  assert.deepEqual(resolveEquipmentSet(f.entries, ids, f.profile.sha256).map(entry => entry.id), ids);
});
check('socks require selected paired shoes even when a valid pair is declared', () => {
  const f = withSocks(male); rejected(f, [f.socks.id], /require paired shoes/);
});
check('socks allow no selected lower with an explicit empty lower list', () => {
  const f = withSocks(male); f.socks.pairedWith.lower = [];
  assert.deepEqual(resolveEquipmentSet(f.entries, [f.shoes.id, f.socks.id], f.profile.sha256).map(entry => entry.id), [f.shoes.id, f.socks.id]);
  rejected(f, idsFor(f), /Unvalidated socks pairing/);
});
check('shoe ID mismatch rejects before visibility changes', () => {
  const f = withSocks(male); f.socks.pairedWith.shoes[0].id = 'other-shoes'; rejected(f, idsFor(f), /Unvalidated socks pairing/);
});
check('shoe hash mismatch rejects before visibility changes', () => {
  const f = withSocks(male); f.shoes.sha256 = 'b'.repeat(64); rejected(f, idsFor(f), /Unvalidated socks pairing/);
});
check('selected lower ID mismatch rejects before visibility changes', () => {
  const f = withSocks(female); f.socks.pairedWith.lower[0].id = 'other-lower'; rejected(f, idsFor(f), /Unvalidated socks pairing/);
});
check('selected lower hash mismatch rejects before visibility changes', () => {
  const f = withSocks(male); f.lower[0].sha256 = 'b'.repeat(64); rejected(f, idsFor(f), /Unvalidated socks pairing/);
});
check('every selected bottom and bottoms-overlay requires its own pair', () => {
  const f = withSocks(male);
  const overlay = { id: 'qa-lower-overlay', slot: 'bottoms-overlay', sha256: 'c'.repeat(64), compatibleAvatarSha256: f.profile.sha256 };
  f.entries.push(overlay); const ids = [...idsFor(f), overlay.id];
  rejected(f, ids, /Unvalidated socks pairing/); f.socks.pairedWith.lower.push(pair(overlay));
  assert.equal(resolveEquipmentSet(f.entries, ids, f.profile.sha256).length, ids.length);
});
check('selected onePiece requires an exact pair and still claims top/bottom', () => {
  const f = withSocks(male), onePiece = f.entries.find(entry => entry.id === f.profile.ids.onePiece);
  const ids = [f.shoes.id, onePiece.id, f.socks.id];
  rejected(f, ids, /Unvalidated socks pairing/); f.socks.pairedWith.lower.push(pair(onePiece));
  assert.deepEqual(resolveEquipmentSet(f.entries, ids, f.profile.sha256).map(entry => entry.id), ids);
  rejected(f, [...ids, f.profile.ids.top], /conflict in top/);
});
check('wrong body rejects and keeps current visibility', () => {
  const f = withSocks(male); rejected(f, idsFor(f), /exact body identity/, female.profile.sha256);
});
check('duplicate socks ID rejects and keeps current visibility', () => {
  const f = withSocks(male); rejected(f, [...idsFor(f), f.socks.id], /unique IDs/);
});
check('two different socks entries conflict in their slot', () => {
  const f = withSocks(male), other = structuredClone(f.socks); other.id = 'qa-other-socks'; f.entries.push(other);
  rejected(f, [...idsFor(f), other.id], /conflict in socks/);
});
const malformed = [
  ['missing rules', undefined], ['null rules', null], ['array rules', []],
  ['missing lower', { shoes: [] }], ['missing shoes', { lower: [] }],
  ['extra rule key', { shoes: [], lower: [], extra: [] }],
  ['empty shoes', { shoes: [], lower: [] }], ['non-array lower', { shoes: [{ id: 'shoe', sha256: 'a'.repeat(64) }], lower: {} }],
];
for (const [name, rule] of malformed) check(`malformed socks ${name} rejects atomically`, () => {
  const f = withSocks(male); f.socks.pairedWith = rule; rejected(f, idsFor(f), /Socks|socks/);
});
for (const badPair of [null, [], { id: '' }, { id: 'shoe', sha256: 'bad' },
  { id: 'shoe', sha256: ['a'.repeat(64)] }, { id: 'shoe', sha256: 'A'.repeat(64) },
  { id: 'shoe', sha256: 'a'.repeat(64), extra: true }]) {
  check(`malformed exact shoe pair ${JSON.stringify(badPair)} rejects atomically`, () => {
    const f = withSocks(male); f.socks.pairedWith.shoes = [badPair]; rejected(f, idsFor(f), /Invalid socks shoes pair/);
  });
}
for (const role of ['shoes', 'lower']) {
  check(`duplicate ${role} pair ID rejects even with another hash`, () => {
    const f = withSocks(male), declared = f.socks.pairedWith[role][0];
    f.socks.pairedWith[role].push({ ...declared, sha256: 'b'.repeat(64) });
    rejected(f, idsFor(f), /Duplicate socks/);
  });
}
check('outerwear layering and allowedBottoms continue to apply with socks', () => {
  const f = withSocks(male), ids = [...idsFor(f), f.profile.ids.outer];
  assert.deepEqual(resolveEquipmentSet(f.entries, ids, f.profile.sha256).map(entry => entry.id), ids);
  const outer = f.entries.find(entry => entry.id === f.profile.ids.outer);
  outer.layerWith = []; rejected(f, ids, /Unvalidated equipment layering/);
  outer.layerWith = [f.profile.ids.top]; outer.allowedBottoms = [];
  rejected(f, ids, /Unvalidated lower-layer fit/);
});
check('prepare does not change visibility and commit exposes the complete set once', () => {
  const f = withSocks(male), ids = idsFor(f);
  const loaded = new Map(f.entries.map(entry => [entry.id, { container: { visible: entry.id === f.shoes.id } }]));
  const before = [...loaded].map(([id, value]) => [id, value.container.visible]);
  const commit = prepareLoadedEquipmentSet(loaded, f.entries, ids, f.profile.sha256);
  assert.deepEqual([...loaded].map(([id, value]) => [id, value.container.visible]), before);
  assert.deepEqual(commit(), ids.map(id => {
    const entry = f.entries.find(value => value.id === id); return { id, sha256: entry.sha256, slot: entry.slot };
  }));
  assert.deepEqual([...loaded].filter(([, value]) => value.container.visible).map(([id]) => id).sort(), ids.toSorted());
});
check('missing loaded socks refuses the complete commit without changing old visibility', () => {
  const f = withSocks(male), ids = idsFor(f);
  const loaded = new Map(f.entries.filter(entry => entry.id !== f.socks.id).map(entry => [entry.id, { container: { visible: true } }]));
  const before = [...loaded].map(([id, value]) => [id, value.container.visible]);
  assert.throws(() => prepareLoadedEquipmentSet(loaded, f.entries, ids, f.profile.sha256), /Equipment not loaded: qa-socks/);
  assert.deepEqual([...loaded].map(([id, value]) => [id, value.container.visible]), before);
});

const authoredSocksEntries = [];
if (process.argv[3]) {
  for (const bodyType of ['female', 'male']) {
    const entryPath = path.join(process.argv[3], 'assets-source/m2-socks-layer-v1/generated', bodyType + '-entry.json');
    const bytes = await readFile(entryPath), entry = JSON.parse(bytes), catalog = catalogs.get(bodyType);
    authoredSocksEntries.push({ bodyType, entryPath, entryJsonSha256: sha(bytes), assetId: entry.id, assetSha256: entry.sha256 });
    for (const role of ['pants', 'shorts'].filter(role => catalog.profile.ids[role])) {
      check(`authored ${bodyType} socks metadata accepts actual ${role} and shoes`, () => {
        const ids = [catalog.profile.ids.top, catalog.profile.ids.shoes, catalog.profile.ids[role], entry.id];
        assert.equal(entry.slot, 'socks');
        assert.deepEqual(resolveEquipmentSet([...catalog.entries, entry], ids, catalog.profile.sha256).map(value => value.id), ids);
      });
    }
  }
}

const resolver = await readFile(new URL('../prototype/src/equipment-set.js', import.meta.url));
const report = { schema: 'm2-socks-equipment-set-cpu-v1', passed: checks.length, resolverSha256: sha(resolver), inputs, authoredSocksEntries, checks,
  pairingContract: { requiredForSelectedSocks: true, shoesRequiredInFinalSet: true, lowerListMayBeEmpty: true,
    pairShape: ['id', 'sha256'], pairIdentity: 'Unique ID in each list, exact lowercase64-hex SHA', lowerSlots: ['bottom', 'bottoms-overlay', 'onePiece'] },
  scope: 'Existing profile/manifests are real. Synthetic socks/overlay contract cases and any explicitly supplied authored socks entries check composition metadata. No socks GLB, skin fit, browser, motion or visual acceptance is claimed.' };
const output = process.argv[2] || fileURLToPath(new URL('../evidence/m2-socks-slot-cpu-v1/', import.meta.url));
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'contract.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, resolverSha256: report.resolverSha256, scope: report.scope }, null, 2));
