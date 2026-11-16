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
  // One-piece contact surfaces need their own actual asset validation before
  // entering this room facade; the low-level equipment resolver supports them.
  if (!['pants', 'shorts', 'skirt'].includes(bottomRole) || !roles.includes(bottomRole))
    throw Error('Configured outfit must identify its actual lower-body garment');
  return { selection, roles: [...roles], ids, bottomRole };
}
