// A configured look can contain several independent garments. Existing v6
// looks retain their exact role order and resource identity.
export function outfitSelection(config, value) {
  const selection = config.outfits.find(item => item.index === Number(value));
  if (!selection) throw Error(`This body has no matching outfit fit: ${value}`);
  const roles = selection.equipmentRoles ?? ['top', 'shoes', selection.role];
  if (!Array.isArray(roles) || !roles.length || new Set(roles).size !== roles.length)
    throw Error('Invalid configured outfit equipment roles');
  const ids = roles.map(role => {
    if (typeof role !== 'string' || !Object.hasOwn(config.ids, role))
      throw Error(`Unknown configured equipment role: ${role}`);
    return config.ids[role];
  });
  if (new Set(ids).size !== ids.length) throw Error('Duplicate configured outfit equipment');
  const bottomRole = selection.bottomRole ?? selection.role;
  // The lower-body contact role names an actual selected garment. A one-piece
  // is one skinned resource occupying both top and bottom in the set resolver.
  if (!['pants', 'shorts', 'skirt', 'onePiece'].includes(bottomRole) || !roles.includes(bottomRole))
    throw Error('Configured outfit must identify its actual lower-body garment');
  return { selection, roles: [...roles], ids, bottomRole };
}

// The game packager reads this from the fixed runtime's source, which is
// included in its build digest. Runtimes without the policy still load look 0.
export const RECORD_COLD_OUTFIT_POLICY = 'selected-outfit-v1';

export function recordedOutfitIndex(config, equipment) {
  const selection = config.outfits.find(look => look.index === equipment?.index);
  if (!selection || selection.role !== equipment.role || equipment.manifestUrl !== config.manifestUrl)
    throw Error('Recorded outfit does not match a registered body outfit and equipment catalog');
  return selection.index;
}
