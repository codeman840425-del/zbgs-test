import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCharacterRecord, updateCharacterRecord } from './character-record.js';
import { createCharacterRecordBatch } from './character-record-batch.js';

async function fixture(path) {
  return JSON.parse(await readFile(new URL('../../evidence/' + path, import.meta.url), 'utf8'));
}
const [female, male, shorts] = await Promise.all([
  fixture('m2-character-runtime-fixed-v1/native-female-face-v1-record.json'),
  fixture('m2-character-runtime-fixed-v1/native-male-7586-v1-record.json'),
  fixture('m2-character-material-fixed-v1/character-record.json'),
]);
const validation = { validateResources: () => ({ status: 'pending' }) };
const secondFemale = await createCharacterRecord({
  ...female, identity: { ...female.identity, id: 'record-batch-second-female' }, now: female.createdAt,
}, validation);
const records = [female, male, secondFemale, shorts];
const statuses = snapshot => snapshot.items.map(item => item.status);

test('four ordered records retain their original identity, revision and SHA across a partial retry', async () => {
  const input = structuredClone(records);
  const expected = structuredClone(input);
  assert.deepEqual(input[0].appearanceRecipe, input[2].appearanceRecipe);
  assert.notEqual(input[0].identity.id, input[2].identity.id);
  assert.notEqual(input[1].appearanceRecipe.equipment.resources.top.id, input[3].appearanceRecipe.equipment.resources.top.id);
  const calls = [];
  const contexts = [];
  const batch = createCharacterRecordBatch(input, {
    batchId: 'four-records',
    async consume(copy, context) {
      assert.deepEqual(copy, expected[context.index]);
      assert.equal(context.isCurrent(), true);
      calls.push(context.index);
      contexts.push(context);
      copy.identity.name = 'consumer mutation';
      if (context.index === 1 && calls.length === 2) throw Object.assign(new Error('Resource unavailable'), { code: 'resource-missing' });
      return { applied: true, actor: { dispose() {} } };
    },
  });
  input[1].identity.name = 'caller mutation';
  input.reverse();
  assert.deepEqual(statuses(batch.snapshot()), Array(4).fill('queued'));
  const running = batch.run();
  assert.equal(batch.run(), running);
  const first = await running;
  assert.deepEqual(calls, [0, 1, 2, 3]);
  assert.deepEqual(statuses(first), ['completed', 'failed', 'completed', 'completed']);
  assert.equal(first.items[1].code, 'resource-missing');
  assert.equal(first.items[1].reason, 'Resource unavailable');
  for (const item of first.items) {
    assert.equal(item.identityId, expected[item.index].identity.id);
    assert.equal(item.revision, expected[item.index].revision);
    assert.equal(item.recordSha256, expected[item.index].integrity.recordSha256);
    assert.equal(item.requestId, 'four-records/' + item.index + '/1');
  }
  assert.ok(contexts.every(context => !context.isCurrent()));
  assert.deepEqual(await batch.run(), first);
  assert.throws(() => batch.retryFailed(input), /replacement records/);
  const retried = await batch.retryFailed();
  assert.deepEqual(calls, [0, 1, 2, 3, 1]);
  assert.deepEqual(statuses(retried), Array(4).fill('completed'));
  for (const index of [0, 2, 3]) assert.deepEqual(retried.items[index], first.items[index]);
  assert.equal(retried.items[1].recordSha256, first.items[1].recordSha256);
  assert.equal(retried.items[1].requestId, 'four-records/1/2');
  assert.deepEqual(JSON.parse(JSON.stringify(retried)), retried);
  retried.items[0].status = 'corrupted';
  assert.equal(batch.snapshot().items[0].status, 'completed');
  assert.deepEqual(await batch.retryFailed(), batch.snapshot());
  assert.deepEqual(calls, [0, 1, 2, 3, 1]);
});

test('all duplicate stable IDs and invalid envelopes fail locally, other items still run', async () => {
  const newer = await updateCharacterRecord(female, {}, { now: female.updatedAt }, validation);
  assert.notEqual(newer.integrity.recordSha256, female.integrity.recordSha256);
  const bad = structuredClone(male);
  bad.identity.name += ' altered after signing';
  const wrongVersion = { ...secondFemale, schema: 'unsupported' };
  const visited = [];
  const batch = createCharacterRecordBatch([female, bad, shorts, newer, wrongVersion], {
    consume(record) {
      visited.push(record.identity.id);
      return { applied: true };
    },
  });
  const result = await batch.run();
  assert.deepEqual(visited, [shorts.identity.id]);
  assert.deepEqual(result.items.map(item => item.code),
    ['duplicate-identity', 'record-hash-mismatch', null, 'duplicate-identity', 'schema-version']);
  const newBatch = createCharacterRecordBatch([newer], { consume: () => ({ applied: true }) });
  const fresh = await newBatch.run();
  assert.equal(fresh.items[0].revision, newer.revision);
  assert.equal(fresh.items[0].status, 'completed');
  assert.notEqual(fresh.batchId, result.batchId);
});

test('a record that cannot be cloned fails only its row and retry uses the same input snapshot', async () => {
  const invalid = structuredClone(male);
  invalid.provenance.callback = () => {};
  const calls = [];
  const batch = createCharacterRecordBatch([female, invalid, shorts], {
    consume(record) {
      calls.push(record.identity.id);
      return { applied: true };
    },
  });
  delete invalid.provenance.callback;
  const first = await batch.run();
  assert.deepEqual(statuses(first), ['completed', 'failed', 'completed']);
  assert.equal(first.items[1].code, 'invalid-record');
  assert.match(first.items[1].reason, /snapshot/i);
  const retry = await batch.retryFailed();
  assert.deepEqual(retry.items.map(item => item.attempt), [1, 2, 1]);
  assert.equal(retry.items[1].code, 'invalid-record');
  assert.deepEqual(calls, [female.identity.id, shorts.identity.id]);
});

test('cancel after consume fulfills releases only that request before the batch reports completion', async () => {
  const created = [], released = [];
  const batch = createCharacterRecordBatch([female, male, shorts], {
    consume(_, { index }) {
      const instance = { index };
      created.push(instance);
      const result = Promise.resolve({ applied: true, release() { released.push(instance); } });
      if (index === 1) {
        result.then(() => {
          assert.deepEqual(statuses(batch.snapshot()), ['completed', 'running', 'queued']);
          batch.cancel('owner replaced');
        });
      }
      return result;
    },
  });
  const result = await batch.run();
  assert.deepEqual(statuses(result), ['completed', 'cancelled', 'cancelled']);
  assert.equal(created.length, 2);
  assert.deepEqual(released, [created[1]]);
  await batch.retryFailed();
  assert.equal(released.length, 1);
});

test('cancellation synchronously revokes admission and drains the late candidate without touching replacement', async () => {
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const releasing = Promise.withResolvers();
  const released = Promise.withResolvers();
  let visible = 'previous';
  const calls = [];
  const old = createCharacterRecordBatch([female, male, shorts], {
    async consume(record, context) {
      calls.push(context.index);
      if (context.index === 0) return { applied: true };
      entered.resolve(context);
      await resume.promise;
      if (context.isCurrent()) visible = record.identity.id;
      return { applied: true, async release() { releasing.resolve(); await released.promise; } };
    },
  });
  const draining = old.run();
  const context = await entered.promise;
  assert.deepEqual(statuses(old.snapshot()), ['completed', 'running', 'queued']);
  const cancelled = old.cancel('slot replaced');
  assert.deepEqual(statuses(cancelled), ['completed', 'cancelled', 'cancelled']);
  assert.equal(context.signal.reason, 'slot replaced');
  assert.equal(context.isCurrent(), false);
  const replacement = createCharacterRecordBatch([secondFemale], {
    consume(record) { visible = record.identity.id; return { applied: true }; },
  });
  await replacement.run();
  resume.resolve();
  await releasing.promise;
  assert.equal(visible, secondFemale.identity.id);
  assert.deepEqual(old.cancel('again'), cancelled);
  assert.equal(old.retryFailed(), draining);
  let done = false;
  draining.then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false);
  released.resolve();
  assert.deepEqual(await draining, cancelled);
  assert.deepEqual(await old.retryFailed(), cancelled);
  assert.deepEqual(calls, [0, 1]);
});

test('validates concurrency and admits at most two consumers, in input order', async () => {
  const gates = records.map(() => Promise.withResolvers());
  const started = records.map(() => Promise.withResolvers());
  let active = 0;
  let peak = 0;
  const order = [];
  const consume = async (_, { index }) => {
    active++;
    peak = Math.max(peak, active);
    order.push(index);
    started[index].resolve();
    await gates[index].promise;
    active--;
    return { applied: true };
  };
  for (const value of [0, 3, 1.5]) {
    assert.throws(() => createCharacterRecordBatch(records, { maxConcurrency: value, consume }), /1 or 2/);
  }
  const batch = createCharacterRecordBatch(records, { consume, maxConcurrency: 2 });
  const work = batch.run();
  await started[1].promise;
  assert.deepEqual(statuses(batch.snapshot()), ['running', 'running', 'queued', 'queued']);
  assert.throws(() => batch.retryFailed(), /settle/);
  gates[1].resolve();
  await started[2].promise;
  gates[2].resolve();
  await started[3].promise;
  gates[3].resolve();
  gates[0].resolve();
  assert.deepEqual(statuses(await work), Array(4).fill('completed'));
  assert.deepEqual(order, [0, 1, 2, 3]);
  assert.equal(peak, 2);
});

test('nonapplied, cancelled, and cleanup failure receipts stay explicit', async () => {
  const batch = createCharacterRecordBatch(records, {
    consume(_, { index }) {
      if (index === 0) return { applied: false, cancelled: true, reason: 'slot superseded' };
      if (index === 1) return { applied: false, reason: 'fit rejected', release() { throw Error('cleanup rejected'); } };
      if (index === 2) return {};
      return { applied: true };
    },
  });
  const result = await batch.run();
  assert.deepEqual(statuses(result), ['cancelled', 'failed', 'failed', 'completed']);
  assert.deepEqual(result.cleanupErrors, [{ requestId: result.items[1].requestId, reason: 'cleanup rejected' }]);
  assert.equal(result.items[0].reason, 'slot superseded');
  assert.equal(result.items[1].reason, 'fit rejected');
  const retry = await batch.retryFailed();
  assert.deepEqual(retry.items.map(item => item.attempt), [1, 2, 2, 1]);
  const cancelled = batch.cancel('room closed');
  assert.equal(cancelled.phase, 'cancelled');
  assert.deepEqual(cancelled.items, retry.items);
  assert.deepEqual(await batch.retryFailed(), cancelled);
});
