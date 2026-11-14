// A task completing is not equivalent to leaving a seat. Occupied leases only
// become available after the controller confirms physical exit or owner removal.
const copy = value => structuredClone(value);
export function createSeatLeases() {
  const bySeat = new Map(), byOwner = new Map(), byToken = new Map(), byRequest = new Map(), history = [];
  let serial = 0;
  const active = token => { const lease = byToken.get(token); return lease && lease.state !== 'released' ? lease : null; };
  const record = (type, lease) => history.push({ type, lease: copy(lease) });
  function release(lease, reason) {
    if (!lease || lease.state === 'released') return false;
    lease.state = 'released'; lease.releaseReason = reason;
    if (bySeat.get(lease.seatId) === lease.token) bySeat.delete(lease.seatId);
    if (byOwner.get(lease.ownerId) === lease.token) byOwner.delete(lease.ownerId);
    record('released', lease); return true;
  }
  return {
    reserve({ seatId, ownerId, requestId } = {}) {
      if ([seatId, ownerId, requestId].some(x => typeof x !== 'string' || !x)) throw new TypeError('seatId, ownerId and requestId must be nonempty strings');
      const key = JSON.stringify([ownerId, requestId]), old = byRequest.get(key);
      if (old) {
        const lease = byToken.get(old.token);
        return { accepted: old.accepted && old.seatId === seatId && lease?.state !== 'released', duplicate: true,
          reason: old.seatId !== seatId ? 'request-id-conflict' : !old.accepted ? old.reason : lease?.state === 'released' ? 'request-already-released' : null, lease: lease ? copy(lease) : null };
      }
      const occupied = bySeat.get(seatId);
      const existingOwner = byOwner.get(ownerId);
      if (occupied || existingOwner) {
        const reason = existingOwner ? 'owner-already-has-seat' : 'seat-unavailable';
        byRequest.set(key, { accepted: false, seatId, reason });
        return { accepted: false, duplicate: false, reason, lease: null };
      }
      const lease = { token: `seat-lease:${++serial}`, seatId, ownerId, requestId, state: 'reserved', releaseRequested: false, releaseReason: null };
      bySeat.set(seatId, lease.token); byOwner.set(ownerId, lease.token); byToken.set(lease.token, lease); byRequest.set(key, { accepted: true, seatId, token: lease.token }); record('reserved', lease);
      return { accepted: true, duplicate: false, reason: null, lease: copy(lease) };
    },
    occupy(token) { const lease = active(token); if (!lease || !['reserved', 'occupied'].includes(lease.state)) return false; if (lease.state === 'reserved') { lease.state = 'occupied'; record('occupied', lease); } return true; },
    requestRelease(token, reason = 'cancelled') {
      const lease = active(token); if (!lease) return false;
      if (lease.state === 'reserved') return release(lease, reason);
      if (!lease.releaseRequested) { lease.releaseRequested = true; lease.releaseReason = reason; record('release-requested', lease); }
      return true;
    },
    beginExit(token) { const lease = active(token); if (!lease || !['occupied', 'exiting'].includes(lease.state)) return false; if (lease.state === 'occupied') { lease.state = 'exiting'; record('exiting', lease); } return true; },
    releaseAfterExit(token) { const lease = active(token); return lease?.state === 'exiting' ? release(lease, lease.releaseReason ?? 'physically-exited') : false; },
    // Invoke only after removing the owner's entity/collider from the scene.
    disposeOwner(ownerId) { let count = 0; for (const lease of byToken.values()) if (lease.ownerId === ownerId && release(lease, 'owner-destroyed')) count++; return count; },
    get: token => { const lease = byToken.get(token); return lease ? copy(lease) : null; },
    forSeat: seatId => { const lease = byToken.get(bySeat.get(seatId)); return lease ? copy(lease) : null; },
    history: () => copy(history),
  };
}
