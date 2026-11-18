import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {canonicalJson, createCharacterRecord, updateCharacterRecord, validateCharacterRecord} from './character-record.js';
import {deriveCharacterResourceIdentities} from './character-runtime-record.js';
import {createNativeHairCenterPin} from './native-hair-center-record.js';
import {putCharacterRecord,updateStoredCharacterRecord} from '../../scripts/character-record-store.mjs';

const fixtures = [
  ['contour-roundness-a','7cb5c311bb864bad0c6b650814b579e979e42bdc9f6e6e49d8684259d3a0e51f'],
  ['contour-cheek-b','7bc8df84319852842da1a1559155413709862aadf22c9fe37116f90ae529bc96'],
];
const pending = () => ({status:'pending'});
const load = async name => JSON.parse(await readFile(new URL('../../evidence/m2-native-batch-runtime-final-v1/records/' + name + '.json',import.meta.url)));
const resources = (record,pin) => deriveCharacterResourceIdentities(record.appearanceRecipe,record.liveAccessories,record.equipmentMaterials,pin);
const update = (record,patch) => updateCharacterRecord(record,patch,{expectedRevision:record.revision,now:record.updatedAt},{validateResources:pending});

test('both delivered records recreate byte-for-byte, opt in by revision, and return to original dynamics',async () => {
  for (const [name,digest] of fixtures) {
    const old = await load(name);
    const before = JSON.stringify(old);
    const rebuilt = await createCharacterRecord({...old,now:old.createdAt},{validateResources:pending});
    assert.equal(JSON.stringify(rebuilt),before);
    assert.equal(rebuilt.integrity.recordSha256,digest);
    const base = old.appearanceRecipe.base;
    const pin = createNativeHairCenterPin(base.bodyType,base.sha256);
    const fitted = await update(old,{nativeHairCenter:pin,resourceIdentities:resources(old,pin)});
    assert.equal(fitted.integrity.recipeSha256,old.integrity.recipeSha256);
    assert.notEqual(fitted.integrity.recordSha256,old.integrity.recordSha256);
    assert.deepEqual(fitted.identity,old.identity);
    assert.equal(fitted.revision,old.revision+1);
    assert.deepEqual(fitted.nativeHairCenter,pin);
    assert.equal(fitted.resourceIdentities.length,old.resourceIdentities.length+3);
    const retained = await update(fitted,{});
    assert.deepEqual(retained.nativeHairCenter,pin);
    const cleared = await update(retained,{nativeHairCenter:undefined,resourceIdentities:resources(old)});
    assert.equal(Object.hasOwn(cleared,'nativeHairCenter'),false);
    assert.deepEqual(cleared.resourceIdentities,old.resourceIdentities);
    assert.equal(JSON.stringify(old),before);
  }
});

test('re-signed stale, incomplete or wrong-body pins and missing dependencies reject without changing prior revision',async () => {
  const old = await load(fixtures[0][0]);
  const base = old.appearanceRecipe.base;
  const pin = createNativeHairCenterPin(base.bodyType,base.sha256);
  const fitted = await update(old,{nativeHairCenter:pin,resourceIdentities:resources(old,pin)});
  const before = canonicalJson(fitted);
  const other = (await load(fixtures[1][0])).appearanceRecipe.base;
  for (const invalid of [
    {...pin,id:pin.id+'-unknown'}, {...pin,fitSha256:'0'.repeat(64)},
    {...pin,sourceSpringBoneSha256:'0'.repeat(64)}, {...pin,extra:true},
    {...pin,bodySha256:other.sha256}, createNativeHairCenterPin(other.bodyType,other.sha256),
  ]) {
    await assert.rejects(update(fitted,{nativeHairCenter:invalid,resourceIdentities:resources(old,invalid)}),/Native hair center fit/);
  }
  await assert.rejects(update(fitted,{nativeHairCenter:undefined}),/fit pin/);
  await assert.rejects(update(fitted,{nativeHairCenter:null}),/fit pin/);
  await assert.rejects(update(fitted,{resourceIdentities:old.resourceIdentities}),/resource identities/);
  const bad = structuredClone(fitted);
  bad.nativeHairCenter.id += '-tampered';
  await assert.rejects(validateCharacterRecord(bad,{validationCallback:pending}),/record hash/);
  assert.equal(canonicalJson(fitted),before);
});

test('persistent CAS keeps the pinned on-disk record byte-for-byte after a missing dependency or stale fit edit', async t => {
  const dir = await mkdtemp(path.join(tmpdir(),'native-hair-record-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const old = await load(fixtures[0][0]);
  const base = old.appearanceRecipe.base;
  const pin = createNativeHairCenterPin(base.bodyType,base.sha256);
  await putCharacterRecord(dir,old,{validateResources:pending});
  const fitted = await update(old,{nativeHairCenter:pin,resourceIdentities:resources(old,pin)});
  const {file} = await putCharacterRecord(dir,fitted,{expectedRevision:old.revision,validateResources:pending});
  const persisted = await readFile(file);
  for(const patch of [{nativeHairCenter:{...pin,id:'stale'}},{resourceIdentities:old.resourceIdentities}]) {
    await assert.rejects(updateStoredCharacterRecord(dir,old.identity.id,patch,{
      expectedRevision:fitted.revision, validateResources:pending, now:fitted.updatedAt,
    }),/Native hair center/);
    assert.deepEqual(await readFile(file),persisted);
  }
});
