// Resolve a final set before changing visibility. This validates composition,
// not garment fit: the loader still verifies bytes, skin and inverse binds.
const slots = new Set(["top", "bottom", "shoes", "onePiece", "outerwear", "bottoms-overlay", "socks"]);

function socksPairing(entry) {
  const pairing = entry.pairedWith;
  if (!pairing || typeof pairing !== 'object' || Array.isArray(pairing) ||
      Object.keys(pairing).length !== 2 || !Object.hasOwn(pairing, 'shoes') || !Object.hasOwn(pairing, 'lower'))
    throw Error(`Socks ${entry.id} require pairedWith shoes and lower lists`);
  for (const role of ['shoes', 'lower']) {
    const pairs = pairing[role];
    if (!Array.isArray(pairs) || role === 'shoes' && !pairs.length)
      throw Error(`Invalid socks ${role} pairing list: ${entry.id}`);
    const ids = new Set();
    for (const pair of pairs) {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair) ||
          Object.keys(pair).length !== 2 || !Object.hasOwn(pair, 'id') || !Object.hasOwn(pair, 'sha256') ||
          typeof pair.id !== 'string' || !pair.id || typeof pair.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pair.sha256))
        throw Error(`Invalid socks ${role} pair: ${entry.id}`);
      if (ids.has(pair.id)) throw Error(`Duplicate socks ${role} pair: ${entry.id} / ${pair.id}`);
      ids.add(pair.id);
    }
  }
  return pairing;
}

export function resolveEquipmentSet(entries, ids, avatarSha256) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
    throw Error("Equipment set must contain unique IDs");
  const catalog = new Map(entries.map(entry => [entry.id, entry]));
  if (catalog.size !== entries.length) throw Error("Duplicate equipment IDs");
  const occupied = new Map();
  const selected = ids.map(id => {
    const entry = catalog.get(id);
    if (!entry) throw Error(`Unknown equipment ${id}`);
    if (!avatarSha256 || entry.compatibleAvatarSha256 !== avatarSha256)
      throw Error(`Equipment ${id} requires its exact body identity`);
    if (!slots.has(entry.slot)) throw Error(`Unsupported equipment slot ${entry.slot}`);
    const claims = entry.slot === "onePiece" ? ["top", "bottom"] : [entry.slot];
    for (const slot of claims) {
      if (occupied.has(slot)) throw Error(`Equipment conflict in ${slot}: ${occupied.get(slot)} / ${id}`);
      occupied.set(slot, id);
    }
    return entry;
  });
  const outer = selected.find(entry => entry.slot === "outerwear");
  if (outer) {
    // A declared exact inner pairing is required; sharing a skeleton is not
    // evidence that two surfaces can be layered without interference.
    for (const inner of selected.filter(entry => ["top", "onePiece"].includes(entry.slot))) {
      if (!Array.isArray(outer.layerWith) || !outer.layerWith.includes(inner.id))
        throw Error(`Unvalidated equipment layering: ${outer.id} / ${inner.id}`);
    }
    if (outer.allowedBottoms !== undefined) {
      if (!Array.isArray(outer.allowedBottoms)) throw Error(`Invalid lower-layer fit list: ${outer.id}`);
      for (const lower of selected.filter(entry => ['bottom', 'bottoms-overlay', 'onePiece'].includes(entry.slot))) {
        if (!outer.allowedBottoms.includes(lower.id))
          throw Error(`Unvalidated lower-layer fit: ${outer.id} / ${lower.id}`);
      }
    }
  }
  const socks = selected.find(entry => entry.slot === 'socks');
  if (socks) {
    const pairing = socksPairing(socks);
    const shoes = selected.find(entry => entry.slot === 'shoes');
    if (!shoes) throw Error(`Socks ${socks.id} require paired shoes`);
    for (const item of selected.filter(entry => ['shoes', 'bottom', 'bottoms-overlay', 'onePiece'].includes(entry.slot))) {
      const pairs = item.slot === 'shoes' ? pairing.shoes : pairing.lower;
      if (!pairs.some(pair => pair.id === item.id && pair.sha256 === item.sha256))
        throw Error(`Unvalidated socks pairing: ${socks.id} / ${item.id}`);
    }
  }
  return selected;
}

export function prepareLoadedEquipmentSet(loaded, entries, ids, avatarSha256) {
  const selected = resolveEquipmentSet(entries, ids, avatarSha256);
  for (const entry of selected) {
    if (!loaded.has(entry.id)) throw Error(`Equipment not loaded: ${entry.id}`);
  }
  const visible = new Set(selected.map(entry => entry.id));
  const result=selected.map(entry => ({ id: entry.id, sha256: entry.sha256, slot: entry.slot }));
  return()=>{
    for (const [id, item] of loaded) item.container.visible = visible.has(id);
    return result;
  };
}
export function commitLoadedEquipmentSet(loaded, entries, ids, avatarSha256) {
  return prepareLoadedEquipmentSet(loaded,entries,ids,avatarSha256)();
}
