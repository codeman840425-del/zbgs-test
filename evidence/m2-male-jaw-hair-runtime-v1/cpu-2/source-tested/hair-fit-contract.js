import { HAIRSTYLES } from './hairstyle-catalog.js';

export function hairEntry(body, style) {
  const entries = HAIRSTYLES.filter(e => e.id === style && e.compatibleBodies.includes(body));
  if (entries.length !== 1) throw Error('该发型尚未适配当前人物');
  return entries[0];
}
export function hairFitIdentity(entry) {
  if (!entry) return null;
  return entry.legacyImplicitFit
    ? {kind:'legacy-head-local-v1',manifestSha256:entry.manifestSha256}
    : {kind:'explicit-fit-v1',id:entry.fit.id,version:entry.fit.version,sha256:entry.fit.sha256};
}
export function sameHairFit(actual, expected) {
  if (actual === null || expected === null) return actual === expected;
  if (!actual || !expected || typeof expected !== 'object' || Array.isArray(expected)) return false;
  const keys = Object.keys(actual);
  return Object.keys(expected).length === keys.length && keys.every(k => Object.hasOwn(expected,k) && actual[k] === expected[k]);
}
// Omitted expectations are normal UI selection; explicit null is a strict identity.
export function validateHairSelection(body, style, options = {}) {
  const entry = ['original','none'].includes(style) ? null : hairEntry(body,style);
  if (options.legacy && entry && !entry.legacyImplicitFit) throw Error('旧版配方未记录此人物的发型适配版本');
  const identity = hairFitIdentity(entry);
  if (Object.hasOwn(options,'expectedHairFit') && !sameHairFit(identity,options.expectedHairFit)) throw Error('发型适配版本不一致，当前外观未改变');
  if (Object.hasOwn(options,'expectedHairAssetSha256') && options.expectedHairAssetSha256 !== (entry?.assetSha256 ?? null)) throw Error('发型素材版本不一致，当前外观未改变');
  return entry;
}
export function validateHairFitData(fit, entry, body, manifest) {
  const a = fit?.attachment;
  const vector = (x,n) => Array.isArray(x) && x.length === n && x.every(Number.isFinite);
  if (fit?.schema !== 'character-hair-fit-v1' || fit.id !== entry.fit.id || fit.version !== entry.fit.version ||
      fit.styleId !== entry.id || fit.targetBodySha256 !== body || fit.sourceBodySha256 !== entry.sourceBodySha256 ||
      fit.assetSha256 !== entry.assetSha256 || fit.sourceMaterial !== entry.sourceMaterial || fit.sourceMaterial !== manifest.sourceMaterial ||
      fit.physics !== 'rigid' || a?.bone !== 'head' || a.space !== 'raw-head-bind-local' ||
      !vector(a.position,3) || !vector(a.quaternion,4) || !vector(a.scale,3) || a.scale.some(x=>x<=0) ||
      Math.abs(Math.hypot(...a.quaternion)-1)>1e-6 || fit.hideOriginal?.hideWholeBody !== false ||
      !Array.isArray(fit.hideOriginal?.materialNames) || fit.hideOriginal.materialNames.length !== 1 ||
      fit.hideOriginal.materialNames[0] !== entry.sourceMaterial) throw Error('发型适配数据与当前人物不一致');
  return a;
}
