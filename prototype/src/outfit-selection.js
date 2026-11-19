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
  const bottomEquipmentRole = selection.bottomEquipmentRole ?? bottomRole;
  if (!['pants', 'shorts', 'skirt', 'onePiece'].includes(bottomRole) || !roles.includes(bottomEquipmentRole))
    throw Error('Configured outfit must identify its actual lower-body garment');
  if (bottomEquipmentRole !== bottomRole &&
      (!['pants', 'shorts'].includes(bottomRole) || roles.includes(bottomRole)))
    throw Error('Only one fitted pants or shorts resource may replace the selected lower garment');
  return { selection, roles: [...roles], ids, bottomRole, bottomEquipmentRole };
}

// Check the declared resource against the catalog before any garment loads.
// Overlay slots remain independent of the garment used for contact.
export function verifyBottomEquipmentSlot(look, entries) {
  const lower = entries.filter(entry => entry.slot === 'bottom' || entry.slot === 'onePiece');
  const id = look.ids[look.roles.indexOf(look.bottomEquipmentRole)];
  const slot = look.bottomRole === 'onePiece' ? 'onePiece' : 'bottom';
  if (lower.length !== 1 || lower[0].id !== id || lower[0].slot !== slot)
    throw Error('Configured lower-body garment does not match the selected equipment slot');
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
