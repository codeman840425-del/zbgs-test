
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as before from './before/src/representative-batch.js';
import * as after from './after/src/representative-batch.js';
import * as oldProfiles from './before/src/foundation-profiles.js';
import * as profiles from './after/src/foundation-profiles.js';
import * as oldPalette from './before/src/facial-palette-contract.js';
import * as palette from './after/src/facial-palette-contract.js';
const id='male-long-lean-axial-head-v1';
assert.deepEqual(after.REPRESENTATIVE_PRESETS.filter(p=>p.id!==id),before.REPRESENTATIVE_PRESETS);
assert.deepEqual(after.REPRESENTATIVE_NO_HAIR,before.REPRESENTATIVE_NO_HAIR);
assert.deepEqual(after.REPRESENTATIVE_UNPUBLISHED,before.REPRESENTATIVE_UNPUBLISHED);
assert.deepEqual(after.REPRESENTATIVE_PALETTES.slice(0,2),before.REPRESENTATIVE_PALETTES);
for(const [key,profile] of Object.entries(oldProfiles.FOUNDATION_PROFILES)){
  assert.deepEqual(profiles.foundationProfile(key),oldProfiles.foundationProfile(key));
  assert.deepEqual(palette.facialPaletteContract(profile.sha256),oldPalette.facialPaletteContract(profile.sha256));
  assert.deepEqual(palette.compatiblePaletteVersions(profile.sha256),oldPalette.compatiblePaletteVersions(profile.sha256));
}
const candidate=profiles.foundationProfile(id);
assert.equal(candidate.sha256,'83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9');
assert.equal(candidate.label,'瘦长脸·仅头部候选');
assert.deepEqual(candidate.outfits.map(p=>p.index),[0,2]);
assert.deepEqual(Object.keys(candidate.ids).sort(),['pants','shoes','shorts','top']);
assert.equal(candidate.additionalEquipmentManifests,undefined);
assert.equal(candidate.sourceFloorY,0);
assert.equal(candidate.seatLayerThickness,.0036);
candidate.ids.top='changed';
assert.notEqual(profiles.foundationProfile(id).ids.top,'changed');
assert(!after.REPRESENTATIVE_NO_HAIR.some(p=>JSON.stringify(p).includes(id)));
const contract=palette.facialPaletteContract(candidate.sha256);
const doc=JSON.parse(readFileSync(new URL('./after/public'+contract.url,import.meta.url)));
assert.equal(doc.variants.length,1);
assert.equal(doc.variants[0].avatarSha256,candidate.sha256);
assert.deepEqual(palette.compatiblePaletteVersions(candidate.sha256),[contract.version]);
console.log(JSON.stringify({oldPresetCount:before.REPRESENTATIVE_PRESETS.length,newPresetCount:after.REPRESENTATIVE_PRESETS.length,oldProfilesPreserved:Object.keys(oldProfiles.FOUNDATION_PROFILES).length,newOutfits:candidate.outfits.map(p=>p.index),newPaletteSha256:contract.sha256}));
