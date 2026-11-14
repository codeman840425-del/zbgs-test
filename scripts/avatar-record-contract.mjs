// QA-only durable-result contract. No production save integration or business identity.
export const SCHEMA = 'zbgs-qa-avatar-record-v1';
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function exact(actual, expected, code) { if (canonical(actual) !== canonical(expected)) throw new Error(code); }
function keys(value, names, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code); exact(Object.keys(value).sort(), names.slice().sort(), code); }
export function validateRecord(record, catalog, loadedBodyId) {
  keys(record, ['schemaVersion','identity','appearanceRevision','body','appearance','equipment','provenance'], 'record-fields');
  if (record.schemaVersion !== SCHEMA) throw new Error('schema-version');
  keys(record.identity, ['actorId'], 'identity-fields');
  if (!/^qa-actor:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.identity.actorId)) throw new Error('actor-id');
  if (!Number.isSafeInteger(record.appearanceRevision) || record.appearanceRevision < 1) throw new Error('appearance-revision');
  const body = catalog.bodies.find(x => x.baseId === record.body?.baseId);
  if (!body) throw new Error('unknown-body');
  if (body.baseId !== loadedBodyId) throw new Error('incompatible-loaded-body');
  exact(record.body, body.recordBody, 'body-resource-or-fit-version');
  exact(record.appearance, {mode:'baked-resource',parameters:{}}, 'appearance-not-supported-or-behavior-leak');
  exact(record.provenance, {catalogVersion:catalog.catalogVersion,manifestVersions:body.manifestVersions}, 'manifest-or-catalog-version');
  if (!Array.isArray(record.equipment)) throw new Error('equipment-array');
  const clothes = record.equipment.filter(x => !['mic','glasses'].includes(x.slot));
  const outfit = body.outfits.find(x => canonical(x.items) === canonical(clothes));
  if (!outfit) throw new Error('equipment-style-fit-hash-or-combination');
  for (const slot of ['mic','glasses']) {
    const matches = record.equipment.filter(x => x.slot === slot);
    if (matches.length !== 1 || typeof matches[0].enabled !== 'boolean') throw new Error('accessory-slot');
    exact(matches[0], {...catalog.accessories.find(x => x.record.slot === slot).record, enabled:matches[0].enabled}, 'accessory-id-hash');
  }
  if (record.equipment.length !== clothes.length + 2) throw new Error('equipment-fields');
  return {bodyType:body.bodyType, outfitIndex:outfit.index, accessories:Object.fromEntries(record.equipment.filter(x => ['mic','glasses'].includes(x.slot)).map(x => [x.slot,x.enabled]))};
}
export function makeRecord(catalog, baseId, actorId, outfitIndex, appearanceRevision, enabled={mic:true,glasses:true}) {
  const body=catalog.bodies.find(x=>x.baseId===baseId), outfit=body?.outfits.find(x=>x.index===outfitIndex);
  if(!outfit)throw Error('unknown-outfit');
  const record={schemaVersion:SCHEMA,identity:{actorId},appearanceRevision,body:structuredClone(body.recordBody),appearance:{mode:'baked-resource',parameters:{}},equipment:[...structuredClone(outfit.items),...catalog.accessories.map(x=>({...x.record,enabled:enabled[x.record.slot]}))],provenance:{catalogVersion:catalog.catalogVersion,manifestVersions:structuredClone(body.manifestVersions)}};
  validateRecord(record,catalog,baseId);return record;
}
