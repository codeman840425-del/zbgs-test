// Install already frozen target data only. No FBX, video, retargeting or fitting.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseNormalizedMotion } from '../prototype/src/normalized-motion.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(path.join(root, p));
const writeJSON = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
const verify = process.argv.includes('--verify');
if (process.argv.slice(2).some(x => x !== '--verify')) throw Error('Usage: node scripts/install-frozen-dance-workbench.mjs [--verify]');
const base = 'evidence/rokoko-arm-contact-v1/adaptation-v1';
const relativeDir = 'frozen-rokoko-30s-v1';
const destination = path.join(root, 'prototype/public/assets/motion/m1c', relativeDir);
const manifestPath = path.join(destination, '..', 'dance-imports.json');
const originalId = 'rokoko-5359146-30s-v1';
const comparisonId = 'rokoko-5359146-30s-arm-local-v1';
const records = [
  ['female', 'original', 'source-female.motion.json.gz', 'rokoko-5359146-female-v1.motion.json', '6d2f7a2e8b51238e4892c99424dbb52cbc566903413731be11f53e29dcc73d5f'],
  ['male', 'original', 'source-male.motion.json.gz', 'rokoko-5359146-male-v1.motion.json', '1510d4470965b6ce651c08a7bfb830abbdf34794f06175d50b9a822b34a371bf'],
  ['female', 'comparison', 'rokoko-5359146-female-arm-local-v1.motion.json', 'rokoko-5359146-female-arm-local-v1.motion.json', '3677cb727b6025bec6be25f03824ca60da20e39c73fed0484890ee4ff7996e2e'],
  ['male', 'comparison', 'rokoko-5359146-male-arm-local-v1.motion.json', 'rokoko-5359146-male-arm-local-v1.motion.json', '5fe55028a0c48e76ec6a506475656f9486512c86c1fdd4b1bea0226300c50702'],
].map(([body, role, source, file, expected]) => {
  const sourcePath = `${base}/${source}`, packed = read(sourcePath);
  const bytes = source.endsWith('.gz') ? zlib.gunzipSync(packed) : packed;
  assert.equal(sha(bytes), expected, `Frozen bytes changed: ${source}`);
  const data = JSON.parse(bytes);
  assert.equal(data.avatarSha256, body === 'female'
    ? '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
    : '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff');
  assert.equal(data.clip.duration, 30);
  return { body, role, sourcePath, sourceContainerSha256: sha(packed), file, bytes, data, sha256: expected };
});
const frozenEntry = JSON.parse(read(`${base}/dance-import-entry.json`));
const licenseBoundary = 'Existing frozen project target export; Pexels reference is not CC0. No raw video/FBX redistribution. This installation makes no new commercial, provider API, or bulk-motion license claim.';
const entries = ['original', 'comparison'].map(role => ({
  ...frozenEntry,
  id: role === 'original' ? originalId : comparisonId,
  label: role === 'original' ? '30 秒舞蹈 · 已认可原版' : '30 秒舞蹈 · 唯一优化封存对照',
  origin: role === 'original'
    ? 'Frozen original Rokoko/Pexels 5359146 target export; user accepted this recorded example as a usable video-to-motion result, with arm-contact limitations.'
    : frozenEntry.origin,
  licenseBoundary,
  workbenchRole: role === 'original' ? 'default-30s' : 'frozen-comparison',
  variants: records.filter(r => r.role === role).map(r => ({
    avatarSha256: r.data.avatarSha256, file: `${relativeDir}/${r.file}`, sha256: r.sha256, bytes: r.bytes.length,
  })),
}));
const before = fs.readFileSync(manifestPath), manifest = JSON.parse(before);
assert.equal(manifest.schema, 'm1.motion-import-list.1');
assert.equal(new Set(manifest.entries.map(e => e.id)).size, manifest.entries.length);
const preserved = manifest.entries.filter(e => ![originalId, comparisonId].includes(e.id));
for (const entry of entries) {
  const old = manifest.entries.find(e => e.id === entry.id);
  if (old) assert.deepEqual(old, entry, 'Refuse to overwrite a different installed entry');
}
const next = { ...manifest, workbenchDefaultDanceId: originalId,
  licenseScope: 'Legacy top-level CC0 license applies only to the original UAL entries. New normalized entries carry their own licenseBoundary.',
  entries: [...preserved, ...entries] };

// Exercise the actual loader, including exact identity rejection and distinct
// AnimationMixer clip identities. This is schema/identity QA, not visual QA.
const clips = records.map(r => {
  const entry = entries.find(e => e.variants.some(v => v.sha256 === r.sha256));
  const vrm = { humanoid: { getNormalizedBoneNode: semantic => ({ name: `fixture_${semantic}` }) } };
  assert.throws(() => parseNormalizedMotion(r.data, vrm, '0'.repeat(64), entry), /identity mismatch/);
  const clip = parseNormalizedMotion(r.data, vrm, r.data.avatarSha256, entry);
  assert.equal(clip.duration, 30);
  return clip;
});
assert.equal(new Set(clips.map(c => c.uuid)).size, 4);
for (const variantSha of ['3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011', '10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5'])
  for (const entry of entries) assert.equal(entry.variants.find(v => v.avatarSha256 === variantSha), undefined);

// Validate all inputs/destinations before any write. Existing target bytes may
// never be silently replaced, including by a future re-export.
for (const r of records) {
  const dest = path.join(destination, r.file);
  if (fs.existsSync(dest)) assert.equal(sha(fs.readFileSync(dest)), r.sha256);
  else if (verify) throw Error(`Missing installed file: ${dest}`);
}
if (verify) assert.deepEqual(manifest, next);
else {
  fs.mkdirSync(destination, { recursive: true });
  for (const r of records) if (!fs.existsSync(path.join(destination, r.file))) fs.writeFileSync(path.join(destination, r.file), r.bytes);
  writeJSON(manifestPath, next);
}
const outputs = records.map(r => {
  const bytes = fs.readFileSync(path.join(destination, r.file));
  assert.ok(bytes.equals(r.bytes));
  return { body: r.body, role: r.role, source: r.sourcePath, sourceContainerSha256: r.sourceContainerSha256,
    installed: `prototype/public/assets/motion/m1c/${relativeDir}/${r.file}`, bytes: bytes.length,
    sha256: sha(bytes), sourceTargetSha256: r.sha256, byteIdentical: true,
    tracksSha256: sha(JSON.stringify(r.data.clip.tracks)), tracks: r.data.clip.tracks.length,
    duration: r.data.clip.duration, avatarSha256: r.data.avatarSha256 };
});
const receipt = { schema: 'frozen-dance-install-receipt.1', installerSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  scope: 'Copy/unpack committed frozen target bytes only; no source FBX/video, retargeting, optimization, runtime edit or new visual acceptance.',
  manifestBeforeSha256: sha(before), manifestAfterSha256: sha(fs.readFileSync(manifestPath)),
  preservedEntryIds: preserved.map(e => e.id), preservedEntriesSha256: sha(JSON.stringify(preserved)),
  defaultWorkbenchEntry: originalId, comparisonEntry: comparisonId, outputs,
  checks: { actualNormalizedLoaderFourClips: true, distinctClipUUIDs: true, wrongBodyRejected: true, derivedBodiesAbsent: true },
  licenseBoundary, fees: 'Reuses frozen files with no service call or new purchase; no assertion about future licensing or commercial clearance.' };
if (!verify && !fs.existsSync(path.join(destination, 'install-receipt.json'))) writeJSON(path.join(destination, 'install-receipt.json'), receipt);
if (verify) {
  const saved = JSON.parse(fs.readFileSync(path.join(destination, 'install-receipt.json')));
  assert.deepEqual(saved.outputs, outputs);
  assert.equal(saved.installerSha256, receipt.installerSha256);
  assert.equal(saved.manifestAfterSha256, receipt.manifestAfterSha256);
}
console.log(JSON.stringify({ verified: verify, installed: outputs.length, defaultWorkbenchEntry: originalId,
  manifestSha256: receipt.manifestAfterSha256, checks: receipt.checks }, null, 2));
