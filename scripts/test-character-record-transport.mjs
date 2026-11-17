import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createCharacterRecord, updateCharacterRecord } from '../prototype/src/character-record.js';
import { parseRuntimeCharacterRecord } from '../prototype/src/character-runtime-record.js';

const cli = fileURLToPath(new URL('./character-record-transport.mjs', import.meta.url));
const samples = fileURLToPath(new URL('../prototype/public/assets/record-consumer-v1/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(samples, 'manifest.json'), 'utf8'));
const execute = promisify(execFile);

async function command(commandName, root, ...options) {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, commandName, '--root', root, ...options], { windowsHide: true });
    assert.equal(stderr, '');
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    return result;
  } catch (error) {
    if (typeof error.stderr !== 'string' || !error.stderr.trim()) throw error;
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    const result = JSON.parse(error.stderr);
    assert.equal(result.ok, false);
    return result;
  }
}

async function workspace(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'm2-record-transport-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, root: path.join(directory, 'store') };
}

test('four D03 runtime envelopes survive import, read and export; repeated import is idempotent', async t => {
  const { directory, root } = await workspace(t);
  const exported = [];
  for (const entry of manifest.entries) {
    const input = path.join(samples, path.basename(entry.url));
    const original = parseRuntimeCharacterRecord(await readFile(input, 'utf8'));
    const receipt = await command('import', root, '--input', input);
    assert.equal(receipt.changed, true);
    assert.equal(receipt.id, entry.id);
    assert.equal(receipt.recordSha256, entry.recordSha256);
    assert.equal(receipt.resourceValidation, 'pending');
    assert.equal((await command('import', root, '--input', input)).changed, false);
    const stored = await command('read', root, '--id', entry.id);
    assert.deepEqual(stored.record, original);
    const out = path.join(directory, 'exports', entry.id + '.json');
    const result = await command('export', root, '--id', entry.id, '--out', out);
    assert.equal(result.resourceValidation, 'pending');
    const restored = parseRuntimeCharacterRecord(await readFile(out, 'utf8'));
    assert.deepEqual(restored, original);
    exported.push(restored);
  }
  assert.equal(exported.length, 4);
  assert.equal(exported[0].appearanceRecipe.base.sha256, exported[2].appearanceRecipe.base.sha256);
  assert.notEqual(exported[0].identity.id, exported[2].identity.id);
  assert.equal(exported[1].identity.gender, 'male');
  assert.notEqual(exported[0].liveAccessories.selections.mic.enabled, exported[3].liveAccessories.selections.mic.enabled);
});

test('a sealed immediate successor requires CAS; concurrent alternatives do not overwrite its winner', async t => {
  const { directory, root } = await workspace(t);
  const input = path.join(samples, 'native-female.json');
  const first = await command('import', root, '--input', input);
  const old = parseRuntimeCharacterRecord(await readFile(input, 'utf8'));
  const validation = { validateResources: () => ({ status: 'pending' }) };
  const renamed = await createCharacterRecord({
    ...old, identity: { ...old.identity, name: 'changed identity' }, now: old.createdAt,
  }, validation);
  const differentIdentity = await updateCharacterRecord(renamed, {}, { now: old.updatedAt }, validation);
  const renamedFile = path.join(directory, 'renamed.json');
  await writeFile(renamedFile, JSON.stringify(differentIdentity));
  assert.equal((await command('import', root, '--input', renamedFile, '--expected-revision', '1')).code, 'identity-mismatch');
  const candidates = [];
  for (const tag of ['one', 'two']) {
    const next = await updateCharacterRecord(old, { provenance: { ...old.provenance, producer: tag } },
      { now: old.updatedAt }, validation);
    const filename = path.join(directory, tag + '.json');
    await writeFile(filename, JSON.stringify(next));
    candidates.push({ next, filename });
  }
  assert.equal((await command('import', root, '--input', candidates[0].filename)).code, 'revision-conflict');
  assert.equal((await command('import', root, '--input', candidates[0].filename, '--expected-revision', '2')).code, 'revision-conflict');
  assert.equal((await command('read', root, '--id', first.id)).recordSha256, first.recordSha256);
  const outcomes = await Promise.all(candidates.map(({ filename }) =>
    command('import', root, '--input', filename, '--expected-revision', '1')));
  assert.deepEqual(outcomes.map(result => result.ok).sort(), [false, true]);
  const winner = candidates[outcomes.findIndex(result => result.ok)];
  assert.equal(outcomes.find(result => !result.ok).code, 'revision-conflict');
  const current = await command('read', root, '--id', first.id);
  assert.deepEqual(current.record, winner.next);
  assert.equal(current.revision, 2);
  assert.equal((await command('import', root, '--input', winner.filename, '--expected-revision', '1')).changed, false);
  assert.equal((await command('import', root, '--input', input)).code, 'revision-conflict');
});

test('invalid sources preserve an empty store and existing output, and a misfiled signed record is rejected', async t => {
  const { directory, root } = await workspace(t);
  await mkdir(root);
  const id = manifest.entries[0].id;
  const input = path.join(samples, 'native-female.json');
  const original = parseRuntimeCharacterRecord(await readFile(input, 'utf8'));
  const damaged = path.join(directory, 'damaged.json');
  const checks = [
    ['{', 'invalid-json'],
    [Buffer.from([0xff]), 'invalid-json'],
    [' '.repeat(512 * 1024 + 1), 'record-too-large'],
    [JSON.stringify({ ...original, schema: 'unsupported' }), 'schema-version'],
    [JSON.stringify({ ...original, identity: { ...original.identity, name: 'tampered' } }), 'record-hash-mismatch'],
  ];
  for (const [bytes, code] of checks) {
    await writeFile(damaged, bytes);
    assert.equal((await command('import', root, '--input', damaged)).code, code);
  }
  assert.deepEqual(await readdir(root), []);
  const out = path.join(directory, 'exports', 'existing.json');
  assert.equal((await command('export', root, '--id', id, '--out', out)).code, 'record-not-found');
  assert.equal((await command('import', root, '--input', input)).changed, true);
  const writes = await Promise.all([0, 1].map(() => command('export', root, '--id', id, '--out', out)));
  assert.equal(writes.filter(result => result.ok).length, 1);
  assert.equal(writes.find(result => !result.ok).code, 'output-conflict');
  await writeFile(out, 'prior output');
  assert.equal((await command('export', root, '--id', id, '--out', out)).code, 'output-conflict');
  assert.equal(await readFile(out, 'utf8'), 'prior output');
  assert.equal((await command('export', root, '--id', id, '--out', path.join(root, 'other.json'))).code, 'store-output-conflict');
  await writeFile(path.join(root, 'other.json'), JSON.stringify(original));
  assert.equal((await command('read', root, '--id', 'other')).code, 'identity-mismatch');
  assert.equal((await command('export', root, '--id', 'other', '--out', out)).code, 'identity-mismatch');
  assert.equal(await readFile(out, 'utf8'), 'prior output');
});
