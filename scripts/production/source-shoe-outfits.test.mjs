import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import bases from '../../prototype/src/source-outfit-profiles.json' with {type:'json'};
import shoes from '../../prototype/src/source-shoe-outfits.json' with {type:'json'};
import {foundationProfile, FOUNDATION_PROFILES} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {validateCharacterRecord} from '../../prototype/src/character-record.js';
import {collectRecordResources} from '../runtime-package/record-resources.mjs';
import {digest, localFile, runtimePath} from '../runtime-package/files.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const assets = fileURLToPath(new URL('../../prototype/public/', import.meta.url));
const readJson = async relative => JSON.parse(await readFile(new URL('../../' + relative, import.meta.url)));

test('each registered shoe changes only the shoe of its source outfit and keeps the original group and label', async () => {
  for (const row of shoes) {
    const base = bases[row.bodyType], config = foundationProfile(row.bodyType);
    const flat = outfitSelection(config, row.sourceOutfitIndex), raised = outfitSelection(config, row.index);
    assert.equal(config.workbenchGroup, base.workbenchGroup);
    assert.equal(FOUNDATION_PROFILES[row.bodyType].workbenchLabel,
      base.workbenchGroup === 'male' ? '1K 身体 · 制服与厚底鞋候选' : '制服身体肤色 1K · 两套上衣');
    assert.deepEqual(config.bodyCoverage, base.bodyCoverage);
    assert.deepEqual(config.additionalBodyCoverage, base.additionalBodyCoverage);
    assert.deepEqual(flat.selection, base.extraOutfits.find(look => look.index === row.sourceOutfitIndex));
    assert.deepEqual(raised.roles, ['topFar','platformShoes','pants']);
    assert.deepEqual(raised.ids, [flat.ids[0], row.shoeId, flat.ids[2]]);
    assert.deepEqual(flat.ids, [base.ids.topFar, row.sourceShoeId, base.ids.pants]);
    const catalog = await readFile(await localFile(assets, runtimePath(row.manifest.url)));
    assert.equal(digest(catalog), row.manifest.sha256);
    const shoe = JSON.parse(catalog).items.find(item => item.id === row.shoeId);
    assert.equal(shoe.slot, 'shoes');
    assert.equal(shoe.compatibleAvatarSha256, config.sha256);
    const model = await readFile(await localFile(assets, runtimePath(shoe.url)));
    assert.equal(digest(model), shoe.sha256);
    assert.equal(model.length, shoe.bytes);
  }
});

test('both signed flat outfits and the previously issued male platform outfit still resolve their original resources', async () => {
  const records = [...await readJson('evidence/m2-uniform-lite-operator-v1/records.json'),
    ...await readJson('evidence/m2-sole-variant-v1/records.json')];
  assert.deepEqual(records.map(r => [r.revision,r.appearanceRecipe.equipment.index]), [[1,5],[1,1],[3,2]]);
  for (const record of records) {
    await validateCharacterRecord(record, {validationCallback:() => ({status:'pending'})});
    const result = await collectRecordResources({record, sourceRoot:project, add:async (url, reason, pin) => {
      const path = runtimePath(url, pin.parent);
      const bytes = await readFile(await localFile(assets, path));
      if (pin.sha256 !== undefined) assert.equal(digest(bytes), pin.sha256, reason);
      if (pin.bytes !== undefined) assert.equal(bytes.length, pin.bytes, reason);
      return {path,bytes,value:path.endsWith('.json') ? JSON.parse(bytes) : null};
    }});
    const saved = record.appearanceRecipe.equipment;
    assert.equal(result.outfitIndex, saved.index);
    const look = outfitSelection(foundationProfile(result.bodyType), saved.index);
    assert.deepEqual(result.equipmentIds, look.roles.map(role => saved.resources[role].id));
  }
});

test('a changed source body, catalog, flat shoe, source outfit or duplicate target index is refused', async () => {
  const row = shoes.find(x=>x.bodyType==='source-female-uniform-texture-v1');
  for (const [field, value, message] of [
    ['bodySha256','0'.repeat(64),/registered source body/],
    ['baseManifestSha256','0'.repeat(64),/registered source body/],
    ['sourceShoeId','unknown-shoe',/registered source body/],
    ['sourceOutfitIndex',99,/Missing source outfit/],
    ['sourceOutfitRole','other-look',/Missing source outfit/],
    ['sourceEquipmentRoles',['top','shoes','pants'],/Missing source outfit/],
    ['index',row.sourceOutfitIndex,/conflicting shoe outfit/],
  ]) {
    const previous = row[field];
    try {
      row[field] = value;
      await assert.rejects(import('../../prototype/src/foundation-profiles.js?shoe-test=' + field), message);
    } finally { row[field] = previous; }
  }
});
