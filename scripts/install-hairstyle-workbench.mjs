// Install the frozen editable-source hairstyle; never regenerate it implicitly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { HAIRSTYLES } from '../prototype/src/hairstyle-catalog.js';
import { FOUNDATION_PROFILES } from '../prototype/src/foundation-profiles.js';
const sha = b => createHash('sha256').update(b).digest('hex');
const verify = process.argv.includes('--verify');
assert(process.argv.slice(2).every(a => a === '--verify'), 'Usage: node scripts/install-hairstyle-workbench.mjs [--verify]');
const copies = [], receipts = [];
for (const entry of HAIRSTYLES) {
assert(entry.manifestUrl.startsWith('/assets/') && !entry.manifestUrl.includes('..'));
const directory = path.posix.dirname(entry.manifestUrl).slice('/assets/'.length);
const source = path.join(root, 'assets-source', directory);
const destination = path.join(root, 'prototype/public/assets', directory);
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema, 'character-hairstyle-v1');
assert.equal(manifest.id, entry.id);
assert.equal(path.posix.dirname(manifest.url), path.posix.dirname(entry.manifestUrl));
assert.deepEqual(manifest.compatibleBodies, entry.compatibleBodies);
assert.equal(manifest.headLocal, true);
assert.equal(manifest.mount, 'head');
for (const hash of manifest.compatibleBodies) {
  const profile = Object.values(FOUNDATION_PROFILES).find(p => p.sha256 === hash);
  assert(profile, 'Body admission has no profile');
  assert.equal(sha(fs.readFileSync(path.join(root, 'prototype/public', profile.url.slice(1)))), hash);
}
const assetName = path.posix.basename(manifest.url);
const asset = fs.readFileSync(path.join(source, assetName));
assert.equal(sha(asset), manifest.sha256, 'Source hairstyle integrity mismatch');
assert.equal(asset.toString('ascii', 0, 4), 'glTF');
for (const [name, bytes] of [['manifest.json', manifestBytes], [assetName, asset]]) {
  const target = path.join(destination, name);
  if (fs.existsSync(target)) assert(fs.readFileSync(target).equals(bytes), `Existing ${target} differs; review asset version before replacing`);
  copies.push({target,bytes});
}
receipts.push({id:manifest.id,sha256:manifest.sha256,compatibleBodies:manifest.compatibleBodies});
}
for (const {target,bytes} of copies) {
  if (!verify) { fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target, bytes); }
  assert(fs.readFileSync(target).equals(bytes), `Installed ${target} differs from frozen source`);
}
console.log(JSON.stringify({verified:true,copied:!verify,hairstyles:receipts}));
