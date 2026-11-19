import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function verify() {
  const args = process.argv.slice(2);
  const viewerFlag = args.indexOf('--viewer');
  let rebuiltViewer;
  if (viewerFlag >= 0) {
    const options = args.splice(viewerFlag);
    if (options.length !== 2 || !options[1] || options[1].startsWith('--')) throw Error('Expected --viewer REBUILT_DIRECTORY');
    rebuiltViewer = options[1];
  }
  const [folder = '.', expectedDigest] = args;
  if (args.length > 2 || (expectedDigest !== undefined && !/^[0-9a-f]{64}$/i.test(expectedDigest))) {
    throw Error('Usage: node verify.mjs [PACKAGE_DIRECTORY] [EXPECTED_MANIFEST_SHA256] [--viewer REBUILT_DIRECTORY]');
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
  let directory = root;
  let pins = pending;
  if (rebuiltViewer) {
    directory = await fs.realpath(rebuiltViewer);
    const sealedViewer = await fs.realpath(path.join(root, 'viewer')).catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (sealedViewer && path.relative(directory, sealedViewer) === '') throw Error('Select the separate rebuilt output directory');
    pins = new Map();
    for (const [name, pin] of pending) {
      if (name.startsWith('viewer/')) pins.set(name.slice('viewer/'.length), pin);
    }
    if (!pins.has('company.html') || !pins.has('company-build-info.json')) throw Error('Manifest lacks the fixed viewer entry or build identity');
  }
  const declaredFiles = pins.size;
  let checkedFiles = 0, extraFiles = 0, changedFiles = 0;
  const examples = [];
  function note(issue, file) {
    if (examples.length < 12) examples.push({issue, file});
  }
  async function visit(prefix) {
    const entries = await fs.readdir(path.join(directory, prefix), {withFileTypes:true});
    for (const entry of entries) {
      const name = prefix ? prefix + '/' + entry.name : entry.name;
      if (!rebuiltViewer && name === manifestName) continue;
      if (entry.isDirectory()) { await visit(name); continue; }
      const pin = pins.get(name);
      if (!pin) { extraFiles++; note('extra', name); continue; }
      pins.delete(name);
      if (entry.isFile()) {
        const content = await fs.readFile(path.join(directory, name));
        if (content.length === pin.bytes && digest(content) === pin.sha256) { checkedFiles++; continue; }
      }
      changedFiles++;
      note('changed', name);
    }
  }
  await visit('');
  for (const name of pins.keys()) note('missing', name);
  const result = {ok:!extraFiles && !changedFiles && pins.size === 0, build:manifest.buildId, manifestSha256,
    declaredFiles, checkedFiles, extraFiles, changedFiles, missingFiles:pins.size};
  if (rebuiltViewer) result.scope = 'rebuilt-viewer';
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
