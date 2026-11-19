import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FOUNDATION_PROFILES, foundationProfile } from './foundation-profiles.js';
import { outfitSelection, verifyBottomEquipmentSlot } from './outfit-selection.js';

test('all existing looks resolve their contact role to the actual selected lower slot', async () => {
  for (const bodyType of Object.keys(FOUNDATION_PROFILES)) {
    const profile = foundationProfile(bodyType);
    const entries = new Map();
    const urls = [profile.manifestUrl, ...(profile.additionalEquipmentManifests ?? []).map(item => item.url)];
    for (const url of urls) {
      const manifest = JSON.parse(await readFile(new URL('../public' + url, import.meta.url), 'utf8'));
      for (const item of manifest.items) entries.set(item.id, item);
    }
    for (const outfit of profile.outfits) {
      const look = outfitSelection(profile, outfit.index);
      verifyBottomEquipmentSlot(look, look.ids.map(id => entries.get(id)));
      assert.equal(look.bottomEquipmentRole, outfit.bottomEquipmentRole ?? look.bottomRole);
    }
  }
});

test('paired trousers retain pants behavior and require the exact lower-slot resource', () => {
  const outfit = {index: 3, role: 'boot-fit', bottomRole: 'pants', bottomEquipmentRole: 'paired',
    equipmentRoles: ['shirt', 'boot', 'paired']};
  const profile = {ids: {shirt: 'top', boot: 'shoe', paired: 'fit', pants: 'regular'}, outfits: [outfit]};
  const look = outfitSelection(profile, 3);
  const entries = [{id: 'top', slot: 'top'}, {id: 'shoe', slot: 'shoes'}, {id: 'fit', slot: 'bottom'}];
  verifyBottomEquipmentSlot(look, entries);
  assert.equal(look.bottomRole, 'pants');
  assert.deepEqual(look.ids, ['top', 'shoe', 'fit']);
  assert.throws(() => verifyBottomEquipmentSlot(look, [...entries, {id: 'regular', slot: 'bottom'}]), /slot/);
  assert.throws(() => verifyBottomEquipmentSlot(look, entries.map(e => e.id === 'fit' ? {...e, slot: 'top'} : e)), /slot/);
  for (const change of [{bottomRole: 'skirt'}, {equipmentRoles: ['shirt', 'boot', 'pants']},
    {equipmentRoles: ['shirt', 'boot', 'paired', 'pants']}]) {
    assert.throws(() => outfitSelection({...profile, outfits: [{...outfit, ...change}]}, 3));
  }
});
