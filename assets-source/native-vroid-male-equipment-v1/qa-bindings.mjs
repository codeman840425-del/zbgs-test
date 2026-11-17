// Targeted malformed male binding fixtures, without renderer or actor mutation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { verifyEquipmentBindings } from '../../scripts/verify-catalog-bindings.mjs';
const root = new URL('../../', import.meta.url), pkg = new URL('generated/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('equipment.json', pkg)));
const target = await fs.readFile(new URL('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm', root));
const results = [];
for (const entry of manifest.items) {
  const bytes = await fs.readFile(new URL(entry.url, pkg));
  const bad = structuredClone(entry); bad.bindings[0].targetRawBone = 'NONEXISTENT_MALE_BONE';
  assert.throws(() => verifyEquipmentBindings(bytes, target, bad), /inverse bind mismatch/);
  const duplicate = structuredClone(entry); duplicate.bindings.push(structuredClone(duplicate.bindings[0]));
  assert.throws(() => verifyEquipmentBindings(bytes, target, duplicate), /Duplicate source binding/);
  results.push({ id: entry.id, nonexistentTargetBoneRejected: true, duplicateSourceBoneRejected: true });
}
await fs.writeFile(new URL('evidence/native-vroid-male-equipment-v1/binding-negatives.json', root),
  JSON.stringify({ schema: 'male-binding-targeted-negatives-v1', actualVerifierUsed: true, results }, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify(results));
