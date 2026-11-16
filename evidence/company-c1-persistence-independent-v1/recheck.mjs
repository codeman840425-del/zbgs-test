import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCompanySaveStore, encodeCompanySave} from '../../prototype/src/company/persistence.js';

const root = new URL('../../', import.meta.url);
const paths = ['prototype/src/company/persistence.js', 'prototype/src/company/document.js', 'prototype/src/company/facility-catalog.json', 'prototype/src/company/templates.json', 'prototype/src/company/examples/c1-two-stations.json'];
const hashInputs = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await fs.readFile(new URL(path, root))).digest('hex')])));
const inputHashes = await hashInputs();
const read = async path => JSON.parse(await fs.readFile(new URL(path, root), 'utf8'));
const catalog = await read(paths[2]);
const templates = await read(paths[3]);
const source = await read(paths[4]);
const checks = [];
function adapter() {
  const values = new Map(), writes = [];
  return {writes, getItem: key => values.get(key) ?? null, setItem(key, value) {
    values.set(key, value);
    const document = JSON.parse(value).document;
    writes.push({id: document.id, revision: document.revision, name: document.name});
  }};
}
const makeStore = storage => createCompanySaveStore({storage, catalog, templates});
async function check(name, run) {
  try { checks.push({name, status: 'passed', observed: await run()}); }
  catch (error) { checks.push({name, status: 'failed', error: error.stack}); }
}
async function holdFirstDigest(run) {
  const original = globalThis.crypto;
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', {configurable: true, value: {subtle: {digest(...args) {
    const hash = original.subtle.digest(...args);
    return ++calls === 1 ? Promise.all([hash, gate]).then(([value]) => value) : hash;
  }}}});
  try { return await run(release); }
  finally { release(); Object.defineProperty(globalThis, 'crypto', {value: original, configurable: true}); }
}

await check('normal save, import, same-revision replacement and independent reopened read', async () => {
  const storage = adapter(), store = makeStore(storage);
  await store.save(source);
  const replacement = structuredClone(source);
  replacement.name = 'valid-same-revision-import';
  replacement.nodes.find(n => n.id === 'station-1/fill-light').state = {on: false, intensity: 2};
  const text = await encodeCompanySave(replacement, catalog, templates);
  assert.deepEqual(await store.import(text, {expectedCompanyId: source.id}), replacement);
  assert.equal(store.export(source.id), text);
  assert.deepEqual(await makeStore(storage).load(source.id), replacement);
  assert.equal(storage.writes.length, 2);
  return storage.writes;
});

await check('latest same-company intent wins all save/import pairs across two store instances', async () => {
  const observations = [];
  for (const [olderType, newerType] of [['import', 'save'], ['save', 'import'], ['save', 'save'], ['import', 'import']]) {
    const storage = adapter(), first = makeStore(storage), second = makeStore(storage);
    const newer = {...structuredClone(source), name: `later-${newerType}`};
    const oldText = await encodeCompanySave(source, catalog, templates);
    const newerText = await encodeCompanySave(newer, catalog, templates);
    await holdFirstDigest(async release => {
      const pending = olderType === 'save' ? first.save(source, {isCurrent: revision => revision === newer.revision}) : first.import(oldText);
      const olderResult = pending.then(() => 'accepted', error => error.code);
      if (newerType === 'save') await second.save(newer, {isCurrent: revision => revision === newer.revision});
      else await second.import(newerText, {expectedCompanyId: source.id});
      release();
      const result = await olderResult;
      assert.equal(result, 'revision-conflict');
      assert.deepEqual(await first.load(source.id), newer);
      assert.equal(storage.writes.length, 1);
      observations.push({olderType, newerType, sameRevision: newer.revision, olderResult: result, writes: storage.writes});
    });
  }
  return observations;
});

await check('later operation for a different company does not supersede pending save', async () => {
  const storage = adapter(), store = makeStore(storage);
  const other = structuredClone(source), oldId = other.id;
  other.id = 'company-independent';
  const remap = value => value === oldId ? other.id : typeof value === 'string' && value.startsWith(oldId + '/') ? other.id + value.slice(oldId.length) : value;
  for (const node of other.nodes) {
    node.id = remap(node.id);
    node.parentId = remap(node.parentId);
  }
  return holdFirstDigest(async release => {
    const pending = store.save(source);
    await store.save(other);
    release();
    await pending;
    assert.deepEqual(await store.load(source.id), source);
    assert.deepEqual(await store.load(other.id), other);
    assert.equal(storage.writes.length, 2);
    return storage.writes;
  });
});

await check('inherited scale and kind names are rejected without storage mutation', async () => {
  const storage = adapter(), store = makeStore(storage);
  await store.save(source);
  const text = store.export(source.id), observations = [];
  for (const field of ['scale', 'kind']) for (const value of ['toString', 'constructor', '__proto__']) {
    const envelope = JSON.parse(text);
    if (field === 'scale') envelope.document.scale = value;
    else envelope.document.nodes[0].kind = value;
    let code;
    try { await store.import(JSON.stringify(envelope)); }
    catch (error) { code = error.code; }
    assert.equal(code, field === 'scale' ? 'unsupported-scale' : 'unsupported-kind');
    assert.equal(store.export(source.id), text);
    observations.push({field, value, code});
  }
  assert.equal(storage.writes.length, 1);
  return observations;
});

await check('identity failure, malformed JSON and changed dependency preserve previous bytes', async () => {
  const storage = adapter(), store = makeStore(storage);
  await store.save(source);
  const text = store.export(source.id), observed = [];
  const changedCatalog = structuredClone(catalog);
  changedCatalog.resources.find(r => r.id === 'desk').node.children[0].material.color = '#123456';
  for (const [name, operation, expected] of [
    ['identity', () => store.import(text, {expectedCompanyId: 'another-company'}), 'save-identity-mismatch'],
    ['json', () => store.import('{'), 'invalid-save-json'],
    ['content', () => createCompanySaveStore({storage, catalog: changedCatalog, templates}).import(text), 'dependency-content-mismatch'],
  ]) {
    let code;
    try { await operation(); } catch (error) { code = error.code; }
    assert.equal(code, expected);
    assert.equal(store.export(source.id), text);
    observed.push({name, code});
  }
  assert.equal(storage.writes.length, 1);
  return observed;
});

const inputHashesUnchangedAtEnd = JSON.stringify(await hashInputs()) === JSON.stringify(inputHashes);
const report = {
  status: inputHashesUnchangedAtEnd && checks.every(c => c.status === 'passed') ? 'targeted-cpu-recheck-passed' : 'changes-required',
  generatedAt: new Date().toISOString(), runtime: process.version, inputHashes, inputHashesUnchangedAtEnd, checks,
  previousFailureReport: 'initial-failure-report.json',
  requestedDispatch: {difficulty: 'complex', model: 'gpt-6.1-sol', reasoningEffort: 'high'},
  verifiedRuntimeModelAndEffort: false, verifiedHostHookInterception: false,
  limits: ['CPU only. Browser close/reopen and actual caller sequencing remain unverified.', 'Shared adapter object and module instance were tested. Cross-tab simultaneous authoring is outside the declared implementation scope.', 'Native SHA256 results were deterministically delayed in concurrency checks.'],
};
await fs.writeFile(new URL('recheck-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
