// Resolve a final set before changing visibility. This validates composition,
// not garment fit: the loader still verifies bytes, skin and inverse binds.
const slots = new Set(["top", "bottom", "shoes", "onePiece", "outerwear", "bottoms-overlay"]);

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
  }
  return selected;
}

export function commitLoadedEquipmentSet(loaded, entries, ids, avatarSha256) {
  const selected = resolveEquipmentSet(entries, ids, avatarSha256);
  for (const entry of selected) {
    if (!loaded.has(entry.id)) throw Error(`Equipment not loaded: ${entry.id}`);
  }
  const visible = new Set(selected.map(entry => entry.id));
  for (const [id, item] of loaded) item.container.visible = visible.has(id);
  return selected.map(entry => ({ id: entry.id, sha256: entry.sha256, slot: entry.slot }));
}
