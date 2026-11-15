// Install the frozen editable-source hairstyle; never regenerate it implicitly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets-source/m2-hairstyle-v1');
const destination = path.join(root, 'prototype/public/assets/m2-hairstyle-v1');
const sha = b => createHash('sha256').update(b).digest('hex');
const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema, 'character-hairstyle-v1');
assert.equal(manifest.id, 'female-bob-v1');
assert.equal(manifest.url, '/assets/m2-hairstyle-v1/female-bob.glb');
assert.equal(manifest.headLocal, true);
assert.equal(manifest.mount, 'head');
const body = fs.readFileSync(path.join(root, 'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
assert(manifest.compatibleBodies.includes(sha(body)), 'Body admission does not match');
const asset = fs.readFileSync(path.join(source, 'female-bob.glb'));
assert.equal(sha(asset), manifest.sha256, 'Source hairstyle integrity mismatch');
assert.equal(asset.toString('ascii', 0, 4), 'glTF');
const verify = process.argv.includes('--verify');
assert(process.argv.slice(2).every(a => a === '--verify'), 'Usage: node scripts/install-hairstyle-workbench.mjs [--verify]');
fs.mkdirSync(destination, { recursive: true });
for (const [name, bytes] of [['manifest.json', manifestBytes], ['female-bob.glb', asset]]) {
  const target = path.join(destination, name);
  if (!verify) fs.writeFileSync(target, bytes);
  assert(fs.readFileSync(target).equals(bytes), `Installed ${name} differs from frozen source`);
}
console.log(JSON.stringify({ verified: true, copied: !verify, id: manifest.id, sha256: manifest.sha256, compatibleBodies: manifest.compatibleBodies }));
