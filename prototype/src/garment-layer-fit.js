// An authored layer fit binds a particular top to a particular lower garment.
// It is a loading/selection contract, not a collision or visual acceptance test.
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function layerFitRequirement(entry) {
  const descriptor = entry.layerFitResource;
  if (descriptor === undefined) return null;
  if (entry.slot !== 'top' || descriptor.schema !== 'vest-layer-fit-v1' ||
      typeof descriptor.url !== 'string' || !descriptor.url.startsWith('/assets/') ||
      !hash(descriptor.sha256) || !entry.fitId ||
      typeof descriptor.bottom?.id !== 'string' || !descriptor.bottom.id ||
      !hash(descriptor.bottom.sha256) || !Number.isSafeInteger(descriptor.bottom.bytes) || descriptor.bottom.bytes <= 0)
    throw Error(`Invalid garment layer fit: ${entry.id}`);
  return descriptor;
}
export function assertLayerFitSet(selected) {
  for (const entry of selected) {
    const descriptor = layerFitRequirement(entry);
    if (!descriptor) continue;
    const lower = selected.find(item => item.id === descriptor.bottom.id);
    if (!lower || lower.slot !== 'bottom' || lower.sha256 !== descriptor.bottom.sha256 || lower.bytes !== descriptor.bottom.bytes)
      throw Error(`Unvalidated garment layer pairing: ${entry.id} / ${descriptor.bottom.id}`);
  }
}
export function validateLayerFit(entry, fit, avatarSha256, catalog) {
  const descriptor = layerFitRequirement(entry);
  if (!descriptor) throw Error(`Missing garment layer fit: ${entry.id}`);
  if (fit.schema !== descriptor.schema || fit.version !== 1 || fit.id !== entry.fitId ||
      fit.body?.sha256 !== avatarSha256 || entry.compatibleAvatarSha256 !== avatarSha256 ||
      fit.top?.id !== entry.id || fit.top.sha256 !== entry.sha256 || fit.top.bytes !== entry.bytes || fit.top.url !== entry.url ||
      fit.bottom?.id !== descriptor.bottom.id || fit.bottom.sha256 !== descriptor.bottom.sha256 || fit.bottom.bytes !== descriptor.bottom.bytes)
    throw Error(`Garment ${entry.id} layer fit identity is incompatible`);
  const bottom = catalog.find(item => item.id === descriptor.bottom.id);
  if (!bottom || bottom.compatibleAvatarSha256 !== avatarSha256)
    throw Error(`Garment ${entry.id} layer fit bottom is missing or incompatible`);
  assertLayerFitSet([entry, bottom]);
  return true;
}
