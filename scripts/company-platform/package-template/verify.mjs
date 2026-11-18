import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [folder = '.', expectedDigest, ...extra] = process.argv.slice(2);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function verify() {
  if (extra.length || (expectedDigest !== undefined && !/^[0-9a-f]{64}$/i.test(expectedDigest))) {
    throw Error('Usage: node verify.mjs [PACKAGE_DIRECTORY] [EXPECTED_MANIFEST_SHA256]');
  }
  const root = await fs.realpath(folder);
  const manifestName = 'transfer-manifest.json';
  const manifestPath = path.join(root, manifestName);
  if (!(await fs.lstat(manifestPath)).isFile()) throw Error('Expected a regular transfer-manifest.json');
  const bytes = await fs.readFile(manifestPath);
  const manifestSha256 = digest(bytes);
  if (expectedDigest && manifestSha256 !== expectedDigest.toLowerCase()) throw Error('Transfer manifest digest differs');
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 'company-transfer' || manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw Error('Expected company-transfer version 1');
  }
  const pending = new Map();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..') ||
        file.path === manifestName || pending.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw Error('Invalid transfer manifest entry: ' + file.path);
    }
    pending.set(file.path, file);
  }
  let checkedFiles = 0, extraFiles = 0, changedFiles = 0;
  const examples = [];
  function note(issue, file) {
    if (examples.length < 12) examples.push({issue, file});
  }
  async function visit(prefix) {
    const entries = await fs.readdir(path.join(root, prefix), {withFileTypes:true});
    for (const entry of entries) {
      const name = prefix ? prefix + '/' + entry.name : entry.name;
      if (name === manifestName) continue;
      if (entry.isDirectory()) { await visit(name); continue; }
      const pin = pending.get(name);
      if (!pin) { extraFiles++; note('extra', name); continue; }
      pending.delete(name);
      if (entry.isFile()) {
        const content = await fs.readFile(path.join(root, name));
        if (content.length === pin.bytes && digest(content) === pin.sha256) { checkedFiles++; continue; }
      }
      changedFiles++;
      note('changed', name);
    }
  }
  await visit('');
  for (const name of pending.keys()) note('missing', name);
  const result = {ok:!extraFiles && !changedFiles && pending.size === 0, build:manifest.buildId, manifestSha256,
    declaredFiles:manifest.files.length, checkedFiles, extraFiles, changedFiles, missingFiles:pending.size};
  if (examples.length) result.examples = examples;
  return result;
}

try {
  const result = await verify();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ok:false, message:error.message}));
  process.exitCode = 1;
}
