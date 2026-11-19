import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { probePrint } from './probe-print.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.resolve(process.env.RECEIVER_EVIDENCE_DIR ?? scriptDirectory);
const art = path.resolve(process.env.RECEIVER_ART_DIR ?? path.join(scriptDirectory, '../receiver-art'));
const toolDir = 'scripts/company-platform/';
const publisher = toolDir + 'publish-room-appearance.mjs';
const packager = toolDir + 'package-company.mjs';
const sourceFolder = 'assets-source/company-receiver-printed-carton';
const sourceRecipe = sourceFolder + '/recipe.json';
const product = { id: 'showcase-product-printed-carton', version: 1 };
const artFiles = ['make_carton.py', 'carton.glb', 'carton-label.png', 'License.txt', 'recipe.json', 'README.md'];
const replacementPlan = [{ type: 'replace-resource', id: 'showcase-rental/ground/live/featured', resource: product }];
const blockerPlan = [{ type: 'add-facility', id: 'showcase-rental/ground/live/receiver-obstruction',
  parentId: 'showcase-rental/ground/live', resource: { id: 'background-grid-panel', version: 1 },
  transform: { position: [-.15, 0, .70], yaw: 0 } }];
const batchFiles = ['input.json', 'layout.json', 'save.json', 'report.json'];
const motherKeys = ['showcase-rental', 'showcase-studio'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const newline = value => JSON.stringify(value, null, 2) + '\n';
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function read(root, name) { return fs.readFile(path.join(root, name)); }
async function digest(root, name) { return hash(await read(root, name)); }
async function write(root, name, value) { return fs.writeFile(path.join(root, name), newline(value), { flag: 'wx' }); }
async function missing(filename) { await assert.rejects(fs.lstat(filename), { code: 'ENOENT' }); }
async function execute(tool, args, cwd) { return promisify(execFile)(tool, args, { cwd, maxBuffer: 12 * 1024 * 1024, windowsHide: true }); }
async function node(cwd, tool, ...args) { return execute(process.execPath, [tool, ...args], cwd); }
async function jsonCall(cwd, tool, ...args) { return decode((await node(cwd, tool, ...args)).stdout); }
async function receipts(name, values) {
  await fs.mkdir(evidence, { recursive: true });
  return write(evidence, name + '.json', values);
}
async function expectFailure(cwd, command, args, accept) {
  let result;
  await assert.rejects(node(cwd, command, ...args), error => {
    result = { code: error.code, stderr: error.stderr?.trim() };
    return error.code !== 0 && accept(result.stderr ?? '');
  });
  return result;
}

async function installOffline(proto) {
  const bin = path.dirname(process.execPath), cli = await Promise.any([
    path.resolve(bin, 'node_modules/npm/bin/npm-cli.js'), path.resolve(bin, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(bin, '../share/nodejs/npm/bin/npm-cli.js'),
  ].map(async candidate => { await fs.access(candidate); return candidate; })).catch(() => null);
  const args = ['ci', '--offline', '--no-audit', '--no-fund'];
  if (cli) await node(proto, cli, ...args);
  else {
    assert.notEqual(process.platform, 'win32', 'Locate npm-cli.js within the Node installation on Windows');
    await execute('npm', args, proto);
  }
}

async function verify(packageRoot, expected) {
  return jsonCall(packageRoot, 'verify.mjs', '.', ...(expected ? [expected] : []));
}

async function roomScopes(packageRoot, manifest) {
  const candidates = ['data', ...manifest.files.flatMap(({ path: name }) => {
    const match = /^data\/rooms\/([^/]+)\/layout\.json$/u.exec(name);
    return match ? ['data/rooms/' + match[1]] : [];
  })];
  const grouped = new Map(motherKeys.map(key => [key, []]));
  for (const prefix of candidates) {
    const layout = decode(await read(packageRoot, prefix + '/layout.json'));
    if (grouped.has(layout.id)) grouped.get(layout.id).push(prefix);
  }
  assert([...grouped.values()].every(rows => rows.length));
  return grouped;
}

async function rebuildViewer(source, expected) {
  const proto = path.join(source, 'prototype');
  const current = (await node(proto, 'scripts/build-company-id.mjs')).stdout.trim();
  assert.match(current, /^[a-f0-9]{12}$/u);
  if (expected) assert.equal(current, expected);
  await node(proto, 'node_modules/vite/bin/vite.js', 'build', '--config', 'vite.company.config.js');
  return { id: current, dist: path.join(proto, 'dist-company') };
}

async function inventory(folder, rel = '') {
  const rows = [];
  for (const entry of await fs.readdir(path.join(folder, rel), { withFileTypes: true })) {
    const name = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) rows.push(...await inventory(folder, name));
    else {
      assert(entry.isFile(), `${name} must be an ordinary file`);
      rows.push(name);
    }
  }
  return rows.sort();
}

async function compareViewer(packageRoot, dist) {
  const expected = path.join(packageRoot, 'viewer');
  const names = await inventory(expected);
  assert.deepEqual(await inventory(dist), names);
  for (const name of names) assert.equal(await digest(expected, name), await digest(dist, name), name);
  return names.length;
}

async function prepareMother(fixed, trial, manifestSha256) {
  const seed = await verify(fixed, manifestSha256);
  await fs.mkdir(trial);
  const working = path.join(trial, 'mother');
  await fs.cp(fixed, working, { recursive: true, force: false, errorOnExist: true });
  assert.deepEqual(await verify(working, seed.manifestSha256), seed);
  const source = path.join(working, 'source');
  await installOffline(path.join(source, 'prototype'));
  await node(source, toolDir + 'build-library.mjs', '--check');
  await node(source, toolDir + 'build-showcase-products.mjs', '--check');
  const runtime = await rebuildViewer(source, seed.build);
  const viewerFiles = await compareViewer(fixed, runtime.dist);
  const rebuilt = path.join(trial, 'mother-rooms');
  const batch = await jsonCall(source, toolDir + 'batch.mjs', toolDir + 'batch-inputs/product-showcase-rooms.json', rebuilt);
  assert(batch.ok && batch.results.length === 2);
  const manifest = decode(await read(fixed, 'transfer-manifest.json'));
  const scopes = await roomScopes(fixed, manifest);
  const roomPins = {};
  for (const [key, prefixes] of scopes) {
    const prefix = prefixes.find(name => name.endsWith('/' + key)) ?? prefixes[0];
    const hashes = {};
    for (const name of batchFiles) {
      const baseline = await digest(fixed, prefix + '/batch-result/' + name);
      const derived = await digest(rebuilt, key + '/' + name);
      assert.equal(derived, baseline, key + '/' + name);
      hashes[name] = baseline;
    }
    await jsonCall(working, 'edit.mjs', 'validate', path.join(working, prefix, 'save.json'));
    roomPins[key] = { prefix, hashes };
  }
  const record = { status: 'passed', originalPackage: fixed, trial, seed, viewerFiles, roomPins, offlineNpm: true };
  await write(trial, 'mother-receipt.json', record);
  await receipts('mother-receipt', record);
}

async function verifyEdit(before, after) {
  const original = decode(before).document, changed = decode(after).document;
  assert.equal(changed.revision, original.revision + 1);
  const expected = structuredClone(original);
  expected.revision++;
  const subject = expected.nodes.find(node => node.id === replacementPlan[0].id);
  assert(subject && subject.attachment?.surfaceId === 'top');
  const oldReference = subject.resource;
  subject.resource = product;
  assert.deepEqual(changed, expected);
  return { companyId: changed.id, instance: subject.id, before: oldReference, after: product, attachment: subject.attachment,
    position: subject.transform.position, revisions: [original.revision, changed.revision] };
}

async function packageArguments(source, trial, build, target) {
  const edited = path.join(trial, 'edited-rental', 'save.json');
  const studio = path.join(trial, 'mother-rooms', 'showcase-studio');
  return [packager, path.join(source, 'prototype', 'dist-company'), build, edited, target,
    '--source', source, '--room', 'showcase-rental', edited, '--room', 'showcase-studio', studio];
}

async function derive(trial) {
  const record = decode(await read(trial, 'mother-receipt.json'));
  const working = path.join(trial, 'mother'), source = path.join(working, 'source');
  const authorship = path.join(source, sourceFolder);
  await fs.mkdir(authorship);
  for (const name of artFiles) await fs.copyFile(path.join(art, name), path.join(authorship, name));
  const baseIndex = decode(await read(source, 'prototype/src/company/library-catalog.json'));
  const publication = await jsonCall(source, publisher, '--publish', sourceRecipe);
  assert.equal(publication.status, 'published');
  assert.equal((await jsonCall(source, publisher, '--check', sourceRecipe)).status, 'unchanged');
  const newIndex = decode(await read(source, 'prototype/src/company/library-catalog.json'));
  assert.equal(newIndex.resources.length, baseIndex.resources.length + 1);
  assert.deepEqual({ ...newIndex, resources: newIndex.resources.filter(row => row.id !== product.id) }, baseIndex);
  const sidecar = publication.items[0].resourcePath, resource = decode(await read(source, sidecar));
  const model = 'prototype/public' + resource.asset.url;
  const artwork = await probePrint(source, model, sidecar);
  const from = path.join(working, record.roomPins['showcase-rental'].prefix, 'save.json');
  const edited = path.join(trial, 'edited-rental');
  await write(trial, 'replace.json', replacementPlan);
  await jsonCall(working, 'edit.mjs', 'apply', from, path.join(trial, 'replace.json'), edited);
  await jsonCall(working, 'edit.mjs', 'validate', path.join(edited, 'save.json'));
  const replacement = await verifyEdit(await fs.readFile(from), await read(edited, 'save.json'));
  const runtime = await rebuildViewer(source);
  assert.notEqual(runtime.id, record.seed.build);
  const derivative = path.join(trial, 'printed-carton');
  const packageArgs = await packageArguments(source, trial, runtime.id, derivative);
  await jsonCall(source, ...packageArgs);
  const derivativeVerified = await verify(derivative);
  const derivativeManifest = await read(derivative, 'transfer-manifest.json');
  const oldStudio = path.join(working, record.roomPins['showcase-studio'].prefix);
  for (const name of ['layout.json', 'save.json']) assert((await read(oldStudio, name)).equals(await read(derivative, 'data/rooms/showcase-studio/' + name)), name);
  const guarded = [ 'prototype/src/company/library-catalog.json', toolDir + 'library-inputs.json', sidecar, model, publication.sourceParameters ];
  const before = await Promise.all(guarded.map(file => digest(source, file)));
  const failedSources = [];
  for (const [kind, file] of Object.entries({ artwork: sourceFolder + '/make_carton.py', texture: sourceFolder + '/carton-label.png' })) {
    const pin = await read(source, file);
    const rejectOutput = path.join(trial, 'rejected-package-' + kind);
    try {
      await fs.appendFile(path.join(source, file), Buffer.from('receiver-tamper'));
      const failure = await expectFailure(source, publisher, ['--publish', sourceRecipe], text => text.includes('appearance-source-pin-mismatch') && text.includes(file));
      const libraryFailure = await expectFailure(source, toolDir + 'build-library.mjs', ['--check'], text => text.includes('appearance-source-pin-mismatch') && text.includes(file));
      const packageFailure = await expectFailure(source, packager, (await packageArguments(source, trial, runtime.id, rejectOutput)).slice(1),
        text => text.includes('appearance-source-pin-mismatch') && text.includes(file));
      await missing(rejectOutput);
      assert.deepEqual(await Promise.all(guarded.map(name => digest(source, name))), before);
      assert(derivativeManifest.equals(await read(derivative, 'transfer-manifest.json')));
      failedSources.push({ kind, path: file, publisher: failure, library: libraryFailure, package: packageFailure });
    } finally { await fs.writeFile(path.join(source, file), pin); }
  }
  assert.equal((await jsonCall(source, publisher, '--check', sourceRecipe)).status, 'unchanged');
  await node(source, toolDir + 'build-library.mjs', '--check');
  await write(trial, 'block.json', blockerPlan);
  const blockedOut = path.join(trial, 'blocked-rental');
  const blockedFrom = path.join(derivative, 'data/rooms/showcase-rental/save.json'), original = await fs.readFile(blockedFrom);
  // The working mother already has locked dependencies and the new resolved catalog.
  const editFailure = await expectFailure(working, 'edit.mjs', ['apply', blockedFrom, path.join(trial, 'block.json'), blockedOut],
    text => text.includes('showcase-occluded') && text.includes(blockerPlan[0].id));
  await missing(blockedOut);
  assert(original.equals(await fs.readFile(blockedFrom)));
  assert.deepEqual(await verify(derivative, derivativeVerified.manifestSha256), derivativeVerified);
  const receipt = { status: 'passed', derivative, derivativeVerified, publication, replacement, artwork,
    independentOtherRoom: 'showcase-studio', retainedOtherRoomDigests: record.roomPins['showcase-studio'].hashes,
    failedSources, editFailure };
  await write(trial, 'derivative-receipt.json', receipt);
  await receipts('derivative-receipt', receipt);
}

async function rebuildDerivative(trial, attempt) {
  const prepared = decode(await read(trial, 'mother-receipt.json'));
  const result = decode(await read(trial, 'derivative-receipt.json'));
  const suffix = attempt ? '-' + attempt : '';
  const clean = path.join(trial, 'rebuild-derived' + suffix);
  await fs.cp(result.derivative, clean, { recursive: true, force: false, errorOnExist: true });
  await verify(clean, result.derivativeVerified.manifestSha256);
  const source = path.join(clean, 'source');
  await installOffline(path.join(source, 'prototype'));
  const authored = path.join(trial, 'recreated-art' + suffix);
  await execute(process.env.RECEIVER_PYTHON ?? 'python', [path.join(source, sourceFolder, 'make_carton.py'), authored], source);
  for (const file of ['carton.glb', 'carton-label.png', 'License.txt', 'recipe.json'])
    assert((await read(authored, file)).equals(await read(source, sourceFolder + '/' + file)), file);
  assert.equal((await jsonCall(source, publisher, '--check', sourceRecipe)).status, 'unchanged');
  await node(source, toolDir + 'build-library.mjs', '--check');
  const runtime = await rebuildViewer(source, result.derivativeVerified.build);
  const viewerFiles = await compareViewer(result.derivative, runtime.dist);
  const neutral = path.join(trial, 'mother', prepared.roomPins['showcase-rental'].prefix, 'save.json');
  const rerun = path.join(trial, 'rebuilt-rental' + suffix);
  await jsonCall(clean, 'edit.mjs', 'apply', neutral, path.join(trial, 'replace.json'), rerun);
  const expectedEdit = path.join(trial, 'edited-rental');
  for (const file of ['save.json', 'layout.json']) assert((await read(rerun, file)).equals(await read(expectedEdit, file)), file);
  const packagedLayout = await read(clean, 'data/rooms/showcase-rental/layout.json');
  assert((await read(rerun, 'layout.json')).equals(packagedLayout));
  const canonicalSave = newline(canonical(decode(await read(rerun, 'save.json'))));
  const packagedSave = await read(clean, 'data/rooms/showcase-rental/save.json');
  assert(Buffer.from(canonicalSave).equals(packagedSave));
  for (const file of batchFiles) assert.equal(await digest(clean, 'data/rooms/showcase-studio/batch-result/' + file),
    prepared.roomPins['showcase-studio'].hashes[file]);
  for (const key of motherKeys) await jsonCall(clean, 'edit.mjs', 'validate', path.join(clean, 'data/rooms', key, 'save.json'));
  assert.deepEqual(await verify(prepared.originalPackage, prepared.seed.manifestSha256), prepared.seed);
  assert.deepEqual(await verify(result.derivative, result.derivativeVerified.manifestSha256), result.derivativeVerified);
  const receipt = { status: 'passed', original: prepared.seed, originalViewerFiles: prepared.viewerFiles, originalRooms: prepared.roomPins,
    derived: result.derivativeVerified, viewerFiles, sameArtworkOutputs: 4, sameDerivedEdits: 2, retainedStudioBatchFiles: batchFiles,
    packagedSaveCanonicalSha256: hash(packagedSave), plainEditedSaveSha256: await digest(rerun, 'save.json'), validatedRooms: motherKeys, offlineNpm: true,
    product: result.artwork, badEdits: result.editFailure, badSources: result.failedSources, change: result.replacement };
  await receipts('report', receipt);
}

const [mode, input, work, expected, ...extra] = process.argv.slice(2);
if (mode === 'mother' && input && work && /^[a-f0-9]{64}$/u.test(expected ?? '') && !extra.length)
  await prepareMother(path.resolve(input), path.resolve(work), expected);
else if (mode === 'derive' && input && !work) await derive(path.resolve(input));
else if (mode === 'rebuild' && input && !expected && (work === undefined || /^[a-z0-9-]{1,24}$/u.test(work)))
  await rebuildDerivative(path.resolve(input), work);
else throw Error('Usage: node receive.mjs mother FIXED_PACKAGE FRESH_TRIAL_DIR EXPECTED_MANIFEST_SHA256 | derive TRIAL_DIR | rebuild TRIAL_DIR [ATTEMPT_NAME]');
console.log(JSON.stringify({ status: 'passed', mode }));
