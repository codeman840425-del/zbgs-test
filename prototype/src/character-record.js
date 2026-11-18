/**
 * Versioned character records. This module owns JSON identity and hashes only.
 * Resource validation is always supplied explicitly by the caller.
 */
export const CHARACTER_RECORD_SCHEMA = 'character-record-v1';
export const CHARACTER_RECORD_VERSION = 1;
export const CHARACTER_RECORD_MAX_BYTES = 512 * 1024;
export const CHARACTER_RECORD_ID_RE = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const WINDOWS_DEVICE_ID_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const SHA_RE = /^[a-f0-9]{64}$/;
const ALLOWED_ROOT = ['schema', 'identity', 'revision', 'createdAt', 'updatedAt', 'appearanceRecipe', 'provenance', 'integrity', 'resourceIdentities', 'liveAccessories', 'equipmentMaterials', 'nativeHairCenter'];

function fail(code, message, field = undefined) {
  const error = new Error(message);
  error.code = code;
  if (field) error.field = field;
  throw error;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sorted(value));
}

function utf8(value) {
  return new TextEncoder().encode(value);
}

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? utf8(value) : value;
  if (!(bytes instanceof Uint8Array)) fail('hash-input', 'Hash input must be a string or Uint8Array');
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject?.subtle) fail('crypto-unavailable', 'WebCrypto subtle.digest is required');
  const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function checkString(value, field, max) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail('invalid-field', `${field} must be a non-empty string`, field);
}

function checkTimestamp(value, field) {
  checkString(value, field, 80);
  if (Number.isNaN(Date.parse(value))) fail('invalid-field', `${field} must be an ISO timestamp`, field);
}

export function isSafeCharacterRecordId(value) {
  return typeof value === 'string' && CHARACTER_RECORD_ID_RE.test(value)
    && !WINDOWS_DEVICE_ID_RE.test(value) && !/[. ]$/.test(value);
}

function checkIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) fail('invalid-identity', 'identity must be an object', 'identity');
  const keys = Object.keys(identity).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['gender', 'id', 'name'])) fail('invalid-identity-fields', 'identity must contain only id, name and gender', 'identity');
  if (!isSafeCharacterRecordId(identity.id)) fail('invalid-identity-id', 'identity.id is not a safe stable id', 'identity.id');
  checkString(identity.name, 'identity.name', 160);
  checkString(identity.gender, 'identity.gender', 40);
}

function checkSources(provenance) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) fail('invalid-provenance', 'provenance must be an object', 'provenance');
  checkString(provenance.producer, 'provenance.producer', 200);
  if (!Array.isArray(provenance.sourceRefs) || provenance.sourceRefs.length > 128) fail('invalid-source-refs', 'provenance.sourceRefs must be an array of at most 128 entries', 'provenance.sourceRefs');
  for (const [index, ref] of provenance.sourceRefs.entries()) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref) || Object.keys(ref).sort().join(',') !== 'path,sha256') fail('invalid-source-ref', 'sourceRefs entries require path and sha256', `provenance.sourceRefs.${index}`);
    checkString(ref.path, `provenance.sourceRefs.${index}.path`, 512);
    if (!SHA_RE.test(ref.sha256)) fail('invalid-source-sha', 'sourceRef sha256 must be lowercase SHA-256', `provenance.sourceRefs.${index}.sha256`);
  }
}

function checkResourceIdentities(value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 256) fail('invalid-resource-identities', 'resourceIdentities must be an array', 'resourceIdentities');
  const ids = new Set();
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== 'id,sha256' || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 240 || !SHA_RE.test(item.sha256)) fail('invalid-resource-identity', 'resource identities require unique id and sha256 fields', `resourceIdentities.${index}`);
    if (ids.has(item.id)) fail('duplicate-resource-identity', 'resource identity ids must be unique', `resourceIdentities.${index}.id`);
    ids.add(item.id);
  }
}

function hashPayload(record) {
  const copy = structuredClone(record);
  delete copy.integrity.recordSha256;
  return canonicalJson(copy);
}

async function checkLimits(record) {
  const text = canonicalJson(record);
  if (utf8(text).byteLength > CHARACTER_RECORD_MAX_BYTES) fail('record-too-large', 'character record exceeds 512 KiB');
  return text;
}

export async function validateCharacterRecord(record, { validationCallback } = {}) {
  if (!validationCallback || typeof validationCallback !== 'function') fail('validation-callback-required', 'An explicit resource validation callback is required');
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('invalid-record', 'record must be an object');
  const unknown = Object.keys(record).filter(key => !ALLOWED_ROOT.includes(key));
  if (unknown.length) fail('unknown-field', `Unknown record field: ${unknown[0]}`, unknown[0]);
  if (record.schema !== CHARACTER_RECORD_SCHEMA) fail('schema-version', 'Unsupported character record schema', 'schema');
  if (!Number.isSafeInteger(record.revision) || record.revision < 1) fail('invalid-revision', 'revision must be a positive safe integer', 'revision');
  checkIdentity(record.identity);
  checkTimestamp(record.createdAt, 'createdAt');
  checkTimestamp(record.updatedAt, 'updatedAt');
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) fail('invalid-timestamp-order', 'updatedAt cannot precede createdAt');
  if (!record.appearanceRecipe || typeof record.appearanceRecipe !== 'object' || Array.isArray(record.appearanceRecipe)) fail('invalid-recipe', 'appearanceRecipe must preserve the complete recipe object', 'appearanceRecipe');
  checkSources(record.provenance);
  checkResourceIdentities(record.resourceIdentities);
  await checkLimits(record);
  if (!record.integrity || record.integrity.version !== CHARACTER_RECORD_VERSION || !SHA_RE.test(record.integrity.recipeSha256) || !SHA_RE.test(record.integrity.recordSha256)) fail('invalid-integrity', 'integrity version or hashes are invalid', 'integrity');
  const recipeSha256 = await sha256Hex(canonicalJson(record.appearanceRecipe));
  if (recipeSha256 !== record.integrity.recipeSha256) fail('recipe-hash-mismatch', 'appearanceRecipe hash does not match', 'integrity.recipeSha256');
  const recordSha256 = await sha256Hex(hashPayload(record));
  if (recordSha256 !== record.integrity.recordSha256) fail('record-hash-mismatch', 'record hash does not match', 'integrity.recordSha256');
  const hairResources = record.resourceIdentities?.filter(item => item.id.startsWith('nativeHairCenter/')) ?? [];
  if (Object.hasOwn(record, 'nativeHairCenter') || hairResources.length) {
    const {validateNativeHairCenterPin, nativeHairCenterResourceIdentities} = await import('./native-hair-center-record.js');
    await validateNativeHairCenterPin(record.nativeHairCenter, record.appearanceRecipe.base);
    const expected = nativeHairCenterResourceIdentities(record.nativeHairCenter);
    if (canonicalJson(hairResources) !== canonicalJson(expected)) fail('invalid-resource-identity', 'Native hair center resource identities do not match the fit pin', 'resourceIdentities');
  }
  const validation = await validationCallback(structuredClone(record));
  if (!validation || !['passed', 'pending'].includes(validation.status)) fail('resource-validation-failed', 'Resource validation callback did not return passed or pending');
  return { valid: true, resourceValidation: validation.status, recordSha256, recipeSha256 };
}

export async function createCharacterRecord({ identity, appearanceRecipe, provenance, resourceIdentities, liveAccessories, equipmentMaterials, nativeHairCenter, now = new Date().toISOString(), idFactory = () => globalThis.crypto?.randomUUID?.() ?? fail('crypto-unavailable', 'WebCrypto randomUUID is required') }, { validateResources } = {}) {
  const id = identity?.id ?? idFactory();
  const record = { schema: CHARACTER_RECORD_SCHEMA, identity: { ...identity, id }, revision: 1, createdAt: now, updatedAt: now, appearanceRecipe: structuredClone(appearanceRecipe), provenance: structuredClone(provenance), integrity: { version: CHARACTER_RECORD_VERSION, recipeSha256: await sha256Hex(canonicalJson(appearanceRecipe)), recordSha256: '' }, ...(resourceIdentities === undefined ? {} : { resourceIdentities: structuredClone(resourceIdentities) }), ...(liveAccessories === undefined ? {} : {liveAccessories: structuredClone(liveAccessories)}), ...(equipmentMaterials === undefined ? {} : {equipmentMaterials: structuredClone(equipmentMaterials)}) };
  if (nativeHairCenter !== undefined) record.nativeHairCenter = structuredClone(nativeHairCenter);
  record.integrity.recordSha256 = await sha256Hex(hashPayload(record));
  await checkLimits(record);
  await validateCharacterRecord(record, { validationCallback: validateResources });
  return record;
}

export async function updateCharacterRecord(previous, patch, { expectedRevision = previous?.revision, now = new Date().toISOString() } = {}, { validateResources } = {}) {
  await validateCharacterRecord(previous, { validationCallback: validateResources });
  if (previous.revision !== expectedRevision) fail('revision-conflict', 'record revision does not match expectedRevision');
  const next = { ...structuredClone(previous), ...structuredClone(patch), identity: structuredClone(previous.identity), revision: previous.revision + 1, createdAt: previous.createdAt, updatedAt: now };
  if (Object.hasOwn(patch, 'nativeHairCenter') && patch.nativeHairCenter === undefined) delete next.nativeHairCenter;
  const recipe = patch.appearanceRecipe ?? previous.appearanceRecipe;
  next.appearanceRecipe = structuredClone(recipe);
  next.integrity = { version: CHARACTER_RECORD_VERSION, recipeSha256: await sha256Hex(canonicalJson(next.appearanceRecipe)), recordSha256: '' };
  next.integrity.recordSha256 = await sha256Hex(hashPayload(next));
  await checkLimits(next);
  await validateCharacterRecord(next, { validationCallback: validateResources });
  return next;
}
