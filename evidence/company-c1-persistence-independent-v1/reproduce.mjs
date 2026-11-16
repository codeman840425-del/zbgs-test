import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createCompanySaveStore, encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {deriveCompany} from '../../prototype/src/company/document.js';

const root = new URL('../../', import.meta.url);
const inputs = [
  'prototype/src/company/persistence.js',
  'prototype/src/company/document.js',
  'prototype/src/company/facility-catalog.json',
  'prototype/src/company/templates.json',
  'prototype/src/company/examples/c1-two-stations.json',
  'scripts/company-platform/qa-persistence.mjs',
];
const inputHashes = {};
for (const path of inputs) {
  inputHashes[path] = createHash('sha256').update(await fs.readFile(new URL(path, root))).digest('hex');
}
const read = async path => JSON.parse(await fs.readFile(new URL(path, root), 'utf8'));
const catalog = await read(inputs[2]);
const templates = await read(inputs[3]);
const source = await read(inputs[4]);
const checks = [];
const findings = [];
function adapter() {
  const values = new Map();
  const writes = [];
  return {
    writes,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      values.set(key, value);
      const doc = JSON.parse(value).document;
      writes.push({id: doc.id, revision: doc.revision, name: doc.name});
    },
  };
}
const makeStore = storage => createCompanySaveStore({storage, catalog, templates});
async function check(name, run) {
  const previousFindings = findings.length;
  try {
    const observed = await run();
    checks.push({name, status: findings.length > previousFindings ? 'defect-reproduced' : 'passed', observed});
  }
  catch (error) { checks.push({name, status: 'failed', error: error.stack}); }
}
// Delay the first real SHA-256 completion only. All hash bytes are still produced
// by the native WebCrypto implementation. This forces a valid async ordering.
async function holdFirstDigest(run) {
  const original = globalThis.crypto;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const replacement = {subtle: {digest(...args) {
    const hash = original.subtle.digest(...args);
    if (++calls === 1) return Promise.all([hash, gate]).then(([value]) => value);
    return hash;
  }}};
  Object.defineProperty(globalThis, 'crypto', {value: replacement, configurable: true});
  try { return await run(release); }
  finally { release(); Object.defineProperty(globalThis, 'crypto', {value: original, configurable: true}); }
}

await check('two-station graph, nested parents, independent device states and world transforms round-trip', async () => {
  const document = structuredClone(source);
  document.nodes.find(n => n.id === 'station-1/fill-light').state = {on: false, intensity: 2};
  document.nodes.find(n => n.id === 'station-2/fill-light').state = {on: true, intensity: 9};
  const before = deriveCompany(document, catalog, templates);
  const storage = adapter();
  await makeStore(storage).save(document);
  const restored = await makeStore(storage).load(document.id);
  const after = deriveCompany(restored, catalog, templates);
  assert.deepEqual(restored, document);
  assert.deepEqual([...after.worlds], [...before.worlds]);
  assert.deepEqual(after.usePoints.map(p => p.id), ['station-1/chair#seat', 'station-2/chair#seat']);
  const pins = JSON.parse(makeStore(storage).export(document.id)).dependencies;
  assert.equal(pins.resources.length, 6);
  assert.equal(pins.templates.length, 1);
  return {nodeCount: restored.nodes.length, pins, writes: storage.writes};
});

await check('same-version changed resource/template and invalid inputs preserve previous bytes', async () => {
  const storage = adapter();
  const store = makeStore(storage);
  await store.save(source);
  const valid = store.export(source.id);
  const observed = [];
  for (const kind of ['resource', 'template', 'missing-parent', 'invalid-state', 'bad-json']) {
    const changedCatalog = structuredClone(catalog);
    const changedTemplates = structuredClone(templates);
    const envelope = JSON.parse(valid);
    if (kind === 'resource') changedCatalog.resources.find(r => r.id === 'desk').node.children[0].material.color = '#ffffff';
    if (kind === 'template') changedTemplates.templates[0].parts[0].transform.position[2] -= .1;
    if (kind === 'missing-parent') envelope.document.nodes[0].parentId = 'missing';
    if (kind === 'invalid-state') envelope.document.nodes.find(n => n.id === 'station-1/fill-light').state = {intensity: 101};
    const reader = createCompanySaveStore({storage, catalog: changedCatalog, templates: changedTemplates});
    let failure;
    try { await reader.import(kind === 'bad-json' ? '{' : JSON.stringify(envelope)); }
    catch (error) { failure = error.code; }
    assert.ok(failure);
    assert.equal(store.export(source.id), valid);
    observed.push({kind, failure});
  }
  assert.equal(storage.writes.length, 1);
  return observed;
});

await check('revision guard rejects an old delayed save after a newer save', async () => {
  const storage = adapter();
  const store = makeStore(storage);
  const newer = {...structuredClone(source), revision: source.revision + 1, name: 'newer-save'};
  let revision = source.revision;
  return holdFirstDigest(async release => {
    const olderSave = store.save(source, {isCurrent: expected => expected === revision}).then(() => 'accepted', e => e.code);
    revision = newer.revision;
    await store.save(newer, {isCurrent: expected => expected === revision});
    release();
    const result = await olderSave;
    assert.equal(result, 'revision-conflict');
    assert.equal((await store.load(source.id)).revision, newer.revision);
    return {result, writes: storage.writes};
  });
});

await check('controlled delayed import versus a later guarded save', async () => {
  const storage = adapter();
  const store = makeStore(storage);
  const oldText = await encodeCompanySave(source, catalog, templates);
  const newer = {...structuredClone(source), revision: source.revision + 1, name: 'later-save-must-survive'};
  return holdFirstDigest(async release => {
    const olderImport = store.import(oldText, {expectedCompanyId: source.id});
    await store.save(newer, {isCurrent: expected => expected === newer.revision});
    assert.equal((await store.load(source.id)).revision, newer.revision);
    release();
    await olderImport;
    const final = await store.load(source.id);
    if (final.revision !== newer.revision) findings.push({
      id: 'P1-delayed-import-overwrites-later-save', kind: 'actual-reproduction',
      expectedRevision: newer.revision, finalRevision: final.revision, writes: storage.writes,
      detail: 'An earlier import completes dependency hashing after the later guarded save and replaces its valid newer bytes. import has no commit guard or operation generation.',
    });
    return {expectedRevision: newer.revision, finalRevision: final.revision, writes: storage.writes};
  });
});

await check('controlled delayed save versus a later import at the same revision', async () => {
  const storage = adapter();
  const store = makeStore(storage);
  const imported = {...structuredClone(source), name: 'later-import-must-survive'};
  const importText = await encodeCompanySave(imported, catalog, templates);
  return holdFirstDigest(async release => {
    const olderSave = store.save(source, {isCurrent: expected => expected === imported.revision});
    await store.import(importText, {expectedCompanyId: source.id});
    assert.equal((await store.load(source.id)).name, imported.name);
    release();
    await olderSave;
    const final = await store.load(source.id);
    if (final.name !== imported.name) findings.push({
      id: 'P1-revision-only-guard-misses-import', kind: 'actual-reproduction',
      revision: final.revision, expectedName: imported.name, finalName: final.name, writes: storage.writes,
      detail: 'Both valid documents carry revision 1. A revision-only isCurrent callback remains true and the earlier save overwrites a later completed import.',
    });
    return {revision: final.revision, expectedName: imported.name, finalName: final.name, writes: storage.writes};
  });
});

await check('unsupported inherited scale names cannot replace valid bytes', async () => {
  const storage = adapter();
  const store = makeStore(storage);
  await store.save(source);
  const observations = [];
  for (const scale of ['toString', 'constructor']) {
    const envelope = JSON.parse(store.export(source.id));
    envelope.document.scale = scale;
    let errorCode = null;
    try { await store.import(JSON.stringify(envelope)); }
    catch (error) { errorCode = error.code; }
    const restored = await store.load(source.id);
    observations.push({inputScale: scale, errorCode, storedScale: restored.scale});
  }
  if (observations.some(o => o.errorCode === null)) findings.push({
    id: 'P2-inherited-capacity-keys-accepted', kind: 'actual-reproduction', observations,
    detail: 'capacities[document.scale] accepts Object prototype properties. The unsupported tier imports successfully and replaces the original bytes; its maximum capacity is a Function instead of a tier descriptor.',
  });
  return observations;
});

const endingHashes = {};
for (const path of inputs) endingHashes[path] = createHash('sha256').update(await fs.readFile(new URL(path, root))).digest('hex');
assert.deepEqual(endingHashes, inputHashes, 'Reviewed inputs changed while reproductions ran');
const report = {
  status: findings.length ? 'changes-required' : checks.every(c => c.status === 'passed') ? 'cpu-passed' : 'audit-error',
  generatedAt: new Date().toISOString(), runtime: process.version,
  requestedDispatch: {difficulty: 'complex', model: 'gpt-6.1-sol', reasoningEffort: 'high'},
  verifiedRuntimeModelAndEffort: false, verifiedHostHookInterception: false,
  method: 'Real company modules with independent synchronous in-memory storage adapters. Native WebCrypto digest output is delayed in the two explicit concurrency scenarios.',
  inputHashes, inputHashesUnchangedAtEnd: true, checks, findings,
  limits: [
    'No browser or GPU was started. Browser close/reopen and actor runtime restore remain unverified.',
    'Only the CPU QA called persistence in prototype at initial search. Browser reachability of races depends on final caller serialization and guards.',
    'Storage exception atomicity relies on the adapter. localStorage browser behavior was not exercised.',
    'No actor task, lease or occupancy API was called. Occupancy reconstruction belongs to the shared actor runtime.',
  ],
};
await fs.writeFile(new URL('report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, checks: checks.map(c => ({name: c.name, status: c.status})), findings: findings.map(f => f.id), output: fileURLToPath(new URL('report.json', import.meta.url))}, null, 2));
