import { validateCharacterRecord } from './character-record.js';

const pendingResources = () => ({ status: 'pending' });

// Records stay private. Every consume attempt receives a new copy, and snapshots
// contain only the stable binding and execution state.
export function createCharacterRecordBatch(records, {
  consume, maxConcurrency = 1, batchId = globalThis.crypto.randomUUID(),
} = {}) {
  if (!Array.isArray(records)) throw new TypeError('records must be an ordered array');
  if (typeof consume !== 'function') throw new TypeError('consume must be a function');
  if (typeof batchId !== 'string' || !batchId.length) throw new TypeError('batchId must be a non-empty string');
  if (![1, 2].includes(maxConcurrency)) throw new RangeError('maxConcurrency must be 1 or 2');

  const snapshotFailures = new Set();
  const copies = Array.from(records, (record, index) => {
    try {
      return structuredClone(record);
    } catch {
      snapshotFailures.add(index);
      return null;
    }
  });
  const ids = new Set();
  const duplicates = new Set();
  const items = copies.map((record, index) => {
    const id = record?.identity?.id;
    if (typeof id === 'string') {
      if (ids.has(id)) duplicates.add(id);
      ids.add(id);
    }
    return {
      index, identityId: typeof id === 'string' ? id : null,
      revision: Number.isSafeInteger(record?.revision) ? record.revision : null,
      recordSha256: typeof record?.integrity?.recordSha256 === 'string' ? record.integrity.recordSha256 : null,
      status: 'queued', attempt: 0, requestId: null, code: null, reason: null,
    };
  });

  const controller = new AbortController();
  const cleanupErrors = [];
  let phase = 'ready';
  let inFlight = null;
  const snapshot = () => structuredClone({ batchId, phase, items, cleanupErrors });

  function failItem(item, error) {
    Object.assign(item, {
      status: 'failed', code: String(error?.code ?? 'consume-failed'),
      reason: String(error?.message ?? error),
    });
  }

  async function applyRecord(item, context) {
    let result;
    try {
      result = await consume(structuredClone(copies[item.index]), context);
      if (!context.isCurrent()) return;
      if (result?.applied === true) {
        item.status = 'completed';
        return;
      }
      const cancelled = result?.cancelled === true;
      Object.assign(item, {
        status: cancelled ? 'cancelled' : 'failed',
        code: String(result?.code ?? (cancelled ? 'consume-cancelled' : 'consume-failed')),
        reason: String(result?.reason ?? (cancelled ? 'Consumption cancelled' : 'Expected an applied result')),
      });
    } catch (error) {
      if (context.isCurrent()) failItem(item, error);
    } finally {
      // On completion the consumer owns its actor. A rejected or late result
      // can hand temporary resources back for disposal before this slot is reused.
      if (item.status !== 'completed' && result?.release) {
        try {
          await result.release();
        } catch (error) {
          cleanupErrors.push({ requestId: context.requestId, reason: String(error?.message ?? error) });
        }
      }
    }
  }

  async function execute() {
    const active = new Set();
    for (const item of items) {
      if (item.status !== 'queued') continue;
      if (active.size === maxConcurrency) await Promise.race(active);
      if (controller.signal.aborted) break;
      item.status = 'running';
      item.attempt++;
      const requestId = batchId + '/' + item.index + '/' + item.attempt;
      item.requestId = requestId;
      const isCurrent = () => item.status === 'running' && item.requestId === requestId && !controller.signal.aborted;
      try {
        if (snapshotFailures.has(item.index)) {
          throw Object.assign(new Error('Could not snapshot character record'), { code: 'invalid-record' });
        }
        if (duplicates.has(item.identityId)) {
          throw Object.assign(new Error('Duplicate stable identity in batch: ' + item.identityId), { code: 'duplicate-identity' });
        }
        await validateCharacterRecord(copies[item.index], { validationCallback: pendingResources });
      } catch (error) {
        if (isCurrent()) failItem(item, error);
        continue;
      }
      if (!isCurrent()) break;
      // Validate and dispatch in input order, even when two consumers overlap.
      const task = applyRecord(item, { index: item.index, batchId, requestId, signal: controller.signal, isCurrent });
      active.add(task);
      task.then(() => active.delete(task));
    }
    await Promise.all(active);
    if (phase !== 'cancelled') phase = 'settled';
    return snapshot();
  }

  function run() {
    if (inFlight) return inFlight;
    if (phase !== 'ready') return Promise.resolve(snapshot());
    phase = 'running';
    inFlight = execute().finally(() => { inFlight = null; });
    return inFlight;
  }

  function retryFailed(...args) {
    if (args.length) throw new TypeError('retryFailed takes no replacement records');
    if (phase === 'cancelled') return run();
    if (phase !== 'settled' || inFlight) throw new Error('Wait for the batch to settle before retrying failures');
    for (const item of items) {
      if (item.status === 'failed') Object.assign(item, { status: 'queued', reason: null, code: null, requestId: null });
    }
    phase = 'ready';
    return run();
  }

  function cancel(reason = 'Batch cancelled') {
    if (phase === 'cancelled') return snapshot();
    phase = 'cancelled';
    const message = String(reason);
    for (const item of items) {
      if (item.status === 'queued' || item.status === 'running') {
        Object.assign(item, { status: 'cancelled', code: 'batch-cancelled', reason: message });
      }
    }
    controller.abort(message);
    return snapshot();
  }

  return { run, retryFailed, cancel, snapshot };
}
