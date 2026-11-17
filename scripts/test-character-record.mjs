import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { canonicalJson, createCharacterRecord, sha256Hex, updateCharacterRecord, validateCharacterRecord } from '../prototype/src/character-record.js';
import { createStoredCharacterRecord, updateStoredCharacterRecord, readCharacterRecord, validateStoredCharacterRecord, listCharacterRecords } from './character-record-store.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'character-record-v1-'));
const recipe = { schema: 'workbench-appearance-recipe-v9', rulesVersion: 'workbench-appearance-rules-v9', base: { bodyType: 'native-male-7586-v1', sha256: '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81' }, appearance: { hairStyle: 'original', hairColor: 'original', skinTone: 'original', eyeColor: 'original', lipColor: 'original', eyebrowColor: 'original' }, equipment: { index: 0, role: 'shorts', manifestUrl: 'equipment.json', resources: [] } };
const provenance = { producer: 'test-producer', sourceRefs: [{ path: 'fixture/avatar.vrm', sha256: 'a'.repeat(64) }] };
const pass = async () => ({ status: 'passed', checked: true });
const pending = async () => ({ status: 'pending', reason: 'test' });
const worker = path.resolve('scripts/character-record-concurrency-worker.mjs');
const runWorker = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [worker, ...args], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
});
const created = await createCharacterRecord({ identity: { id: 'native-male-record-a', name: 'Male A', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pass });
assert.equal(created.revision, 1);
assert.equal((await validateCharacterRecord(created, { validationCallback: pass })).valid, true);
const createdSame = await createCharacterRecord({ identity: { id: 'native-male-record-b', name: 'Male B', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending });
assert.notEqual(created.identity.id, createdSame.identity.id);
assert.notEqual(created.integrity.recordSha256, createdSame.integrity.recordSha256);
await assert.rejects(() => createCharacterRecord({ identity: { id: 'bad id', name: 'Bad', gender: 'male' }, appearanceRecipe: recipe, provenance }, { validateResources: pass }), /stable id/);
for (const id of ['record:ads', 'con', 'con.json', 'record.', 'record ']) {
  await assert.rejects(() => createCharacterRecord({ identity: { id, name: 'Bad', gender: 'male' }, appearanceRecipe: recipe, provenance }, { validateResources: pass }), /stable id/);
}
await assert.rejects(() => validateCharacterRecord(created, {}), /callback/);
for (const resourceIdentities of [
  [{ id: '', sha256: 'a'.repeat(64) }],
  [{ id: 'same', sha256: 'a'.repeat(64) }, { id: 'same', sha256: 'b'.repeat(64) }],
  [{ id: 'extra', sha256: 'a'.repeat(64), extra: true }],
]) {
  await assert.rejects(() => createCharacterRecord({ identity: { id: 'resource-invalid-a', name: 'Invalid resource', gender: 'male' }, appearanceRecipe: recipe, provenance, resourceIdentities }, { validateResources: pass }), /resource identit|duplicate-resource-identity/);
}
const oversized = structuredClone(created);
oversized.appearanceRecipe = { ...oversized.appearanceRecipe, oversized: 'x'.repeat(600_000) };
oversized.integrity.recipeSha256 = await sha256Hex(canonicalJson(oversized.appearanceRecipe));
const oversizedPayload = structuredClone(oversized); delete oversizedPayload.integrity.recordSha256;
oversized.integrity.recordSha256 = await sha256Hex(canonicalJson(oversizedPayload));
await assert.rejects(() => validateCharacterRecord(oversized, { validationCallback: pass }), /512 KiB/);
const updated = await updateCharacterRecord(created, { appearanceRecipe: { ...recipe, appearance: { ...recipe.appearance, eyeColor: 'green' } } }, { expectedRevision: 1, now: '2026-11-17T00:01:00.000Z' }, { validateResources: pass });
assert.equal(updated.identity.id, created.identity.id); assert.equal(updated.revision, 2);
await assert.rejects(() => updateCharacterRecord(created, {}, { expectedRevision: 2 }, { validateResources: pass }), /revision/);
const stored = await createStoredCharacterRecord(root, { identity: created.identity, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending });
await fs.writeFile(path.join(root, 'unsafe:ads.json'), '{}');
assert.deepEqual(await listCharacterRecords(root), [created.identity.id]);
const statBefore = (await fs.stat(stored.file)).mtimeMs;
const repeat = await createStoredCharacterRecord(root, { identity: created.identity, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending });
assert.equal(repeat.changed, false); assert.equal((await fs.stat(stored.file)).mtimeMs, statBefore);
await assert.rejects(() => createStoredCharacterRecord(root, { identity: created.identity, appearanceRecipe: { ...recipe, revisionMarker: true }, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending }), /different record/);
const storedUpdated = await updateStoredCharacterRecord(root, created.identity.id, { appearanceRecipe: { ...recipe, appearance: { ...recipe.appearance, eyeColor: 'green' } } }, { expectedRevision: 1, validateResources: pending, now: '2026-11-17T00:01:00.000Z' });
assert.equal(storedUpdated.record.identity.id, created.identity.id); assert.equal(storedUpdated.record.revision, 2);
await assert.rejects(() => updateStoredCharacterRecord(root, created.identity.id, {}, { expectedRevision: 1, validateResources: pending }), /revision/);
const badPath = path.join(root, 'native-male-record-a.json'), goodBytes = await fs.readFile(badPath); await fs.writeFile(badPath, '{bad'); await assert.rejects(() => readCharacterRecord(root, created.identity.id), /JSON/); await fs.writeFile(badPath, goodBytes);
const validStored = await validateStoredCharacterRecord(root, created.identity.id, { validateResources: pending }); assert.equal(validStored.validation.resourceValidation, 'pending');
const concurrentCreateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'character-record-concurrent-create-'));
const createChildren = await Promise.all([
  runWorker(['create', concurrentCreateRoot, 'concurrent-create-a', '150']),
  runWorker(['create', concurrentCreateRoot, 'concurrent-create-a', '150']),
]);
assert.equal(createChildren.filter(x => x.code === 0).length, 2);
const createResults = createChildren.map(x => JSON.parse(x.stdout));
assert.deepEqual(createResults.map(x => x.changed).sort(), [false, true]);
assert.deepEqual(await fs.readdir(concurrentCreateRoot), ['concurrent-create-a.json']);

const concurrentUpdateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'character-record-concurrent-update-'));
await createStoredCharacterRecord(concurrentUpdateRoot, { identity: { id: 'concurrent-update-a', name: 'Concurrent', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending });
const updateChildren = await Promise.all([
  runWorker(['update', concurrentUpdateRoot, 'concurrent-update-a', '200', 'green']),
  runWorker(['update', concurrentUpdateRoot, 'concurrent-update-a', '200', 'blue']),
]);
assert.equal(updateChildren.filter(x => x.code === 0).length, 1);
assert.equal(updateChildren.filter(x => x.code !== 0).length, 1);
assert.match(updateChildren.find(x => x.code !== 0).stderr, /revision-conflict/);
assert.equal((await readCharacterRecord(concurrentUpdateRoot, 'concurrent-update-a')).revision, 2);
assert.deepEqual((await fs.readdir(concurrentUpdateRoot)).sort(), ['concurrent-update-a.json']);

const independentRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'character-record-independent-'));
const independentStart = Date.now();
const independentChildren = await Promise.all([
  runWorker(['create', independentRoot, 'independent-a', '300']),
  runWorker(['create', independentRoot, 'independent-b', '300']),
]);
const independentElapsedMs = Date.now() - independentStart;
assert.equal(independentChildren.filter(x => x.code === 0).length, 2);
assert(independentElapsedMs < 1200, `different record locks serialized: ${independentElapsedMs}ms`);
assert.deepEqual((await fs.readdir(independentRoot)).sort(), ['independent-a.json', 'independent-b.json']);

const staleLockRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'character-record-stale-lock-'));
const staleLock = path.join(staleLockRoot, 'stale-lock-a.json.lock');
await fs.writeFile(staleLock, JSON.stringify({ pid: 1, host: 'stale', createdAt: '2000-01-01T00:00:00.000Z' }));
const staleTime = new Date(Date.now() - 180_000);
await fs.utimes(staleLock, staleTime, staleTime);
await assert.rejects(() => createStoredCharacterRecord(staleLockRoot, { identity: { id: 'stale-lock-a', name: 'Stale', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending, lockWaitMs: 100 }), error => error.code === 'store-busy');
assert.equal((await fs.stat(staleLock)).mtimeMs < Date.now() - 120_000, true);
await fs.rm(staleLock);
const recovered = await createStoredCharacterRecord(staleLockRoot, { identity: { id: 'stale-lock-a', name: 'Stale', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending, lockWaitMs: 100 });
assert.equal(recovered.changed, true);
assert.deepEqual((await fs.readdir(staleLockRoot)).sort(), ['stale-lock-a.json']);

const failureCleanupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'character-record-failure-cleanup-'));
await createStoredCharacterRecord(failureCleanupRoot, { identity: { id: 'failure-cleanup-a', name: 'Failure', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending });
await assert.rejects(() => updateStoredCharacterRecord(failureCleanupRoot, 'failure-cleanup-a', { unexpectedRootField: true }, { expectedRevision: 1, validateResources: pending }), /Unknown record field/);
assert.deepEqual((await fs.readdir(failureCleanupRoot)).sort(), ['failure-cleanup-a.json']);

await assert.rejects(() => createStoredCharacterRecord(staleLockRoot, { identity: { id: 'invalid-wait-a', name: 'Invalid', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources: pending, lockWaitMs: 0 }), error => error.code === 'invalid-lock-wait');

const output = { schema: 'character-record-concurrency-fail-closed-test-v1', status: 'passed', independentElapsedMs, children: { create: createChildren, update: updateChildren, independent: independentChildren }, cases: ['create and validate callback', 'same base supports two stable ids', 'Windows ADS/device/trailing-character ids rejected', 'unsafe filenames omitted from list', 'callback required', 'update preserves identity and increments revision', 'CAS conflict rejected', 'repeat create preserves mtime', 'different duplicate rejected', 'atomic update and corrupted JSON rejection', 'CLI-style pending validation explicit', 'two child processes create one id without overwrite', 'two child processes update one revision with one CAS winner', 'different record locks do not interlock', 'old mtime lock fails closed with store-busy', 'lockWaitMs validation', 'failed update releases lock and preserves old record', 'resource identity empty/duplicate/extra fields rejected', 'direct oversized record validation rejected'] };
const sourceOutput = { schema: 'character-record-source-test-v1', status: 'passed', cases: ['create and validate callback', 'same base supports two stable ids', 'bad id rejected', 'callback required', 'update preserves identity and increments revision', 'CAS conflict rejected', 'repeat create preserves mtime', 'different duplicate rejected', 'atomic update and corrupted JSON rejection', 'CLI-style pending validation explicit'] };
await fs.mkdir('evidence/m2-character-record-source-v1', { recursive: true }); await fs.writeFile('evidence/m2-character-record-source-v1/test-result.json', JSON.stringify(sourceOutput, null, 2) + '\n'); console.log(JSON.stringify(output));
await fs.mkdir('evidence/m2-character-record-concurrency-fail-closed-v1', { recursive: true }); await fs.writeFile('evidence/m2-character-record-concurrency-fail-closed-v1/receipt.json', JSON.stringify(output, null, 2) + '\n');
await fs.mkdir('evidence/m2-character-record-validation-v1', { recursive: true }); await fs.writeFile('evidence/m2-character-record-validation-v1/receipt.json', JSON.stringify({ schema: 'character-record-validation-test-v1', status: 'passed', cases: ['validateCharacterRecord enforces 512 KiB after caller supplies a valid recomputed integrity hash', 'resourceIdentities rejects empty ids', 'resourceIdentities rejects duplicate ids', 'resourceIdentities rejects extra fields', 'resource callback remains explicit and pending is structural only'] }, null, 2) + '\n');
