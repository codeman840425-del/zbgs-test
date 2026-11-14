// Pure request lifecycle. The room controller performs motion; this module owns
// identities, queue order and outcomes. No wall clock, DOM, Phaser or Three.
const TERMINAL = new Set(['completed', 'cancelled', 'failed']);
const copy = value => structuredClone(value);
function fingerprint(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('Task payload must be finite, acyclic JSON data');
  seen.add(value);
  const text = Array.isArray(value) ? '[' + value.map(x => fingerprint(x, seen)).join(',') + ']'
    : Object.getPrototypeOf(value) === Object.prototype ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + fingerprint(value[k], seen)).join(',') + '}'
      : null;
  seen.delete(value);
  if (text === null) throw new TypeError('Task payload must be plain JSON data');
  return text;
}
export function createBehaviorTasks({ ownerId = 'actor', onEvent } = {}) {
  const tasks = new Map(), queue = [], events = [], listenerErrors = [];
  let simulationTime = 0, serial = 0, activeId = null, disposed = false;
  function emit(type, task) {
    const event = { type, ownerId, time: simulationTime, task: copy(task) };
    events.push(event);
    try { onEvent?.(copy(event)); } catch (error) { listenerErrors.push(String(error)); }
  }
  function snapshot(task) { return task ? copy(task) : null; }
  function finish(id, state, reason = null, result = null) {
    const task = tasks.get(id);
    if (!task || task.admission === 'rejected' || TERMINAL.has(task.state)) return false;
    // Commit before callbacks so repeated/reentrant completion emits once.
    task.state = state; task.endedAt = simulationTime; task.reason = reason;
    task.result = copy(result);
    if (activeId === id) activeId = null;
    const index = queue.indexOf(id); if (index >= 0) queue.splice(index, 1);
    emit(state, task); return true;
  }
  function start(task) {
    activeId = task.requestId; task.state = 'running'; task.startedAt = simulationTime;
    emit('running', task);
  }
  return {
    request({ requestId, kind, payload = null, timeoutSeconds = 30, queue: allowQueue = true } = {}) {
      if (typeof kind !== 'string' || !kind) throw new TypeError('Task kind must be a nonempty string');
      if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new RangeError('timeoutSeconds must be positive finite simulation seconds');
      const payloadKey = fingerprint(payload);
      let id = requestId;
      if (id == null) do { id = `${ownerId}:${++serial}`; } while (tasks.has(id));
      if (typeof id !== 'string' || !id) throw new TypeError('requestId must be a nonempty string');
      const old = tasks.get(id);
      if (old) {
        const conflict = old.kind !== kind || fingerprint(old.payload) !== payloadKey;
        return { admission: conflict ? 'rejected' : old.admission, duplicate: true, reason: conflict ? 'request-id-conflict' : old.reason, task: snapshot(old) };
      }
      const busy = activeId !== null || queue.length > 0;
      const admission = disposed || (busy && !allowQueue) ? 'rejected' : busy ? 'queued' : 'accepted';
      const task = { requestId: id, ownerId, kind, payload: copy(payload), admission,
        state: admission === 'rejected' ? null : 'pending', requestedAt: simulationTime,
        startedAt: null, endedAt: admission === 'rejected' ? simulationTime : null,
        deadline: simulationTime + timeoutSeconds, reason: disposed ? 'disposed' : admission === 'rejected' ? 'busy' : null, result: null };
      tasks.set(id, task);
      // Reserve active identity before notifying admission to prevent a listener
      // submitting a second simultaneously accepted task.
      if (admission === 'accepted') activeId = id;
      if (admission === 'queued') queue.push(id);
      emit(admission, task);
      if (admission === 'accepted' && !TERMINAL.has(task.state)) start(task);
      return { admission, duplicate: false, reason: task.reason, task: snapshot(task) };
    },
    startNext() {
      if (disposed || activeId !== null) return null;
      while (queue.length) {
        const task = tasks.get(queue.shift());
        if (task.state !== 'pending') continue;
        if (simulationTime >= task.deadline) { finish(task.requestId, 'failed', 'timeout'); continue; }
        start(task); return snapshot(task);
      }
      return null;
    },
    tick(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be nonnegative finite simulation seconds');
      if (disposed) return;
      simulationTime += dt;
      // Deadline includes time waiting in the queue, not wall-clock/browser time.
      for (const task of [...tasks.values()])
        if (task.admission !== 'rejected' && !TERMINAL.has(task.state) && simulationTime >= task.deadline)
          finish(task.requestId, 'failed', 'timeout');
    },
    complete: (id, result = null) => tasks.get(id)?.state === 'running' && finish(id, 'completed', null, result),
    cancel: (id, reason = 'cancelled') => finish(id, 'cancelled', reason),
    fail: (id, reason = 'failed') => finish(id, 'failed', reason),
    get: id => snapshot(tasks.get(id)),
    active: () => snapshot(tasks.get(activeId)),
    pending: () => queue.map(id => snapshot(tasks.get(id))),
    history: () => copy(events),
    diagnostics: () => ({ simulationTime, disposed, listenerErrors: [...listenerErrors] }),
    dispose(reason = 'owner-destroyed') {
      if (disposed) return;
      disposed = true;
      for (const task of [...tasks.values()]) finish(task.requestId, 'cancelled', reason);
    },
  };
}
