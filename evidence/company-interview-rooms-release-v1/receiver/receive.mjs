import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const [seedSpec, trialSpec, expectedManifest, evidenceSpec, ...extra] = process.argv.slice(2);
assert(seedSpec && trialSpec && /^[a-f0-9]{64}$/u.test(expectedManifest ?? '') && evidenceSpec && !extra.length,
  'Usage: node receive.mjs FIXED_PACKAGE NEW_TRIAL EXPECTED_MANIFEST_SHA256 NEW_EVIDENCE_DIR');
const seed = await fs.realpath(seedSpec), trial = path.resolve(trialSpec), evidence = path.resolve(evidenceSpec);
const toolRoot = 'scripts/company-platform/';
const batchScript = toolRoot + 'batch.mjs';
const packScript = toolRoot + 'package-company.mjs';
const batchInput = toolRoot + 'batch-inputs/interview-rooms.json';
const studio = 'interview-studio', hotel = 'interview-hotel';
const hotelRegion = hotel + '/guest-floor/interview-suite';
const foreignRegion = hotel + '/guest-floor/suite-03';
const batchFiles = ['input.json', 'layout.json', 'save.json', 'report.json'];
const sixRoomFiles = ['layout.json', 'save.json', ...batchFiles.map(name => 'batch-result/' + name)];
const desired = [
  { type: 'replace-resource', id: hotelRegion + '/host-chair', resource: { id: 'chair-ladder', version: 1 } },
  { type: 'replace-resource', id: hotelRegion + '/cup', resource: { id: 'side-table-life-pen-notebook', version: 1 } },
];
const blocker = { type: 'add-facility', id: hotelRegion + '/receiver-lens-blocker', parentId: hotelRegion,
  resource: { id: 'background-grid-panel', version: 1 }, transform: { position: [.02, 0, -.9], yaw: 0 } };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const content = (folder, file) => fs.readFile(path.join(folder, file));
const parse = bytes => JSON.parse(bytes.toString('utf8'));
const object = async (folder, file) => parse(await content(folder, file));
const write = (folder, file, value) => fs.writeFile(path.join(folder, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const missing = async filename => assert.rejects(fs.lstat(filename), { code: 'ENOENT' });
const runFile = promisify(execFile);

function within(parent, nested) {
  const relative = path.relative(parent, nested);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

for (const destination of [trial, evidence]) assert(!within(seed, destination) && !within(destination, seed), 'Keep seed and both output roots disjoint');
assert(!within(trial, evidence) && !within(evidence, trial), 'Evidence and trial must use separate roots');
await missing(trial);
await fs.mkdir(evidence);

async function command(label, cwd, executable, args, expected = 0) {
  let result;
  try { result = { ...await runFile(executable, args, { cwd, windowsHide: true, maxBuffer: 12 * 1024 * 1024 }), code: 0 }; }
  catch (error) { result = { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message }; }
  await fs.writeFile(path.join(evidence, label + '.stdout.txt'), result.stdout, { flag: 'wx' });
  await fs.writeFile(path.join(evidence, label + '.stderr.txt'), result.stderr, { flag: 'wx' });
  assert.equal(result.code, expected, label + ' failed; see its stdout and stderr in ' + evidence);
  return result;
}

const node = (label, cwd, script, args = [], expected) => command(label, cwd, process.execPath, [script, ...args], expected);
const nodeJson = async (label, cwd, script, args = [], expected) => {
  const result = await node(label, cwd, script, args, expected);
  return parse(result.stdout.trim() || result.stderr.trim());
};
const verify = (label, folder, expected) => nodeJson(label, folder, 'verify.mjs', ['.', ...(expected ? [expected] : [])]);

async function install(cwd, cache) {
  await missing(path.join(cwd, 'node_modules'));
  await fs.mkdir(cache);
  const initialCacheEntries = await fs.readdir(cache);
  assert.deepEqual(initialCacheEntries, []);
  await write(evidence, 'npm-cache-before.json', { cache, initialCacheEntries });
  const originalLock = await content(cwd, 'package-lock.json'), lock = parse(originalLock);
  const bin = path.dirname(process.execPath), choices = [
    path.resolve(bin, 'node_modules/npm/bin/npm-cli.js'), path.resolve(bin, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(bin, '../share/nodejs/npm/bin/npm-cli.js'),
  ];
  const npmScript = await Promise.any(choices.map(async file => { await fs.access(file); return file; })).catch(() => null);
  const args = ['ci', '--cache', cache, '--offline=false', '--prefer-online', '--no-audit', '--no-fund', '--loglevel=http'];
  assert(npmScript || process.platform !== 'win32', 'Expected npm-cli.js in the Windows Node installation');
  const installation = npmScript ? await node('npm-ci-online', cwd, npmScript, args) : await command('npm-ci-online', cwd, 'npm', args);
  const pkgs = ['three', '@pixiv/three-vrm', 'pngjs', 'jpeg-js', 'vite'];
  const packages = [];
  const fetched = (installation.stdout + '\n' + installation.stderr).split(/\r?\n/u).filter(line =>
    /\bGET 200\b.*\.tgz\b.*\bcache miss\b/u.test(line));
  for (const name of pkgs) {
    const record = lock.packages['node_modules/' + name];
    assert(record?.resolved && record.integrity && record.version);
    const installed = await object(path.join(cwd, 'node_modules', name), 'package.json');
    assert.equal(installed.version, record.version);
    const tarball = path.posix.basename(new URL(record.resolved).pathname);
    const request = fetched.find(line => {
      const url = line.match(/\bGET 200 (\S+)/u)?.[1];
      return url && path.posix.basename(new URL(url).pathname) === tarball;
    });
    assert(request, 'Expected a fresh HTTP download for ' + name);
    const [algorithm, encoded] = record.integrity.split('-', 2);
    assert.equal(algorithm, 'sha512');
    const digestHex = Buffer.from(encoded, 'base64').toString('hex');
    const tar = await content(cache, path.join('_cacache', 'content-v2', algorithm,
      digestHex.slice(0, 2), digestHex.slice(2, 4), digestHex.slice(4)));
    assert.equal(createHash(algorithm).update(tar).digest('base64'), encoded, 'Fetched tarball differs from the lock ' + name);
    packages.push({ name, version: record.version, integrity: record.integrity, resolved: record.resolved, request,
      verifiedTarBytes: tar.length });
  }
  assert(originalLock.equals(await content(cwd, 'package-lock.json')));
  assert((await fs.readdir(cache)).includes('_cacache'));
  return { cache, initialCacheEntries, lockSha256: sha(originalLock), httpTarballCacheMisses: fetched.length, packages };
}

async function listFiles(folder, prefix = '') {
  const files = [];
  for (const ent of await fs.readdir(path.join(folder, prefix), { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + ent.name : ent.name;
    if (ent.isDirectory()) files.push(...await listFiles(folder, name));
    else { assert(ent.isFile(), name); files.push(name); }
  }
  return files.sort();
}

async function equalFiles(left, right, names) {
  const pins = {};
  for (const name of names) {
    const expected = await content(left, name);
    assert((await content(right, name)).equals(expected), 'Different file ' + name);
    pins[name] = sha(expected);
  }
  return pins;
}

async function scopes(bundle, manifest) {
  const names = ['data', ...manifest.files.map(item => item.path).filter(name => /^data\/rooms\/[^/]+\/layout\.json$/u.test(name))
    .map(name => name.slice(0, -'/layout.json'.length))];
  const byRoom = new Map([[studio, []], [hotel, []]]);
  for (const scope of names) {
    const layout = await object(bundle, scope + '/layout.json');
    assert(byRoom.has(layout.id), 'Unexpected packaged room: ' + layout.id);
    byRoom.get(layout.id).push(scope);
  }
  for (const [id, received] of byRoom) assert(received.length > 0, 'Expected a packaged room for ' + id);
  return byRoom;
}

function roomScope(rooms, key) {
  const candidates = rooms.get(key);
  return candidates.find(name => name === 'data/rooms/' + key) ?? candidates[0];
}

const base = await verify('seed-before', seed, expectedManifest);
const seedManifest = await object(seed, 'transfer-manifest.json');
await fs.mkdir(trial);
const working = path.join(trial, 'mother');
await fs.cp(seed, working, { recursive: true, errorOnExist: true, force: false });
assert.deepEqual(await verify('copy-before', working, expectedManifest), base);
const source = path.join(working, 'source'), proto = path.join(source, 'prototype');
const installReceipt = await install(proto, path.join(trial, 'npm-cache'));
await write(evidence, 'install.json', installReceipt);
const buildId = (await node('build-id', proto, 'scripts/build-company-id.mjs')).stdout.trim();
assert.equal(buildId, base.build);
await node('vite-rebuild', proto, 'node_modules/vite/bin/vite.js', ['build', '--config', 'vite.company.config.js']);
const dist = path.join(proto, 'dist-company'), seedViewer = path.join(seed, 'viewer');
const viewer = await listFiles(seedViewer);
assert.deepEqual(await listFiles(dist), viewer);
const viewerHashes = await equalFiles(seedViewer, dist, viewer);
await write(evidence, 'viewer-hashes.json', viewerHashes);

const originalScopes = await scopes(seed, seedManifest), originalBatch = await object(source, batchInput);
const baselineDir = path.join(trial, 'baseline-rooms');
const batch = (label, input, out, only, expected) => nodeJson(label, source, batchScript,
  [input, out, ...(only ? ['--only', only] : [])], expected);
const cleanBatch = await batch('batch-baseline', batchInput, baselineDir);
assert(cleanBatch.ok && cleanBatch.results.length === 2 && cleanBatch.results.every(r => r.status === 'created'));
const rebuiltOriginal = {};
for (const key of [studio, hotel]) {
  const scope = roomScope(originalScopes, key);
  rebuiltOriginal[key] = await equalFiles(path.join(seed, scope, 'batch-result'), path.join(baselineDir, key), batchFiles);
  await nodeJson('validate-original-' + key, working, 'edit.mjs', ['validate', path.join(working, scope, 'save.json')]);
}

const hotelPath = path.join(working, roomScope(originalScopes, hotel), 'save.json'), editFolder = path.join(trial, 'edited-hotel');
const ops = path.join(trial, 'hotel-changes.json');
await write(trial, 'hotel-changes.json', desired);
await nodeJson('edit-hotel', working, 'edit.mjs', ['apply', hotelPath, ops, editFolder]);
await nodeJson('validate-edited-hotel', working, 'edit.mjs', ['validate', path.join(editFolder, 'save.json')]);
const initial = parse(await fs.readFile(hotelPath)).document, after = (await object(editFolder, 'save.json')).document;
const expected = structuredClone(initial);
expected.revision++;
const modifications = desired.map(operation => {
  const subject = expected.nodes.find(node => node.id === operation.id), previous = subject.resource;
  assert.notDeepEqual(previous, operation.resource);
  subject.resource = operation.resource;
  return { id: operation.id, from: previous, to: operation.resource };
});
assert.deepEqual(after, expected);
const regionIds = new Map(after.nodes.filter(n => ['room', 'area'].includes(n.kind)).map(n => [n.id, n.kind]));
assert.equal([...regionIds.entries()].filter(([id, kind]) => id !== hotelRegion && kind === 'room').length, 15);
const edited = path.join(editFolder, 'save.json');
const studioOriginal = path.join(baselineDir, studio);
const namedPackSources = hotelInput => [[studio, studioOriginal], [hotel, hotelInput]].flatMap(([key, data]) =>
  originalScopes.get(key).includes('data/rooms/' + key) ? ['--room', key, data] : []);
const derivePack = (label, target, hotelInput, expected) => nodeJson(label, source, packScript,
  [dist, buildId, seedManifest.savedCompany.id === studio ? studioOriginal : hotelInput, target, '--source', source,
    ...namedPackSources(hotelInput)], expected);
const derivative = path.join(trial, 'hotel-edited');
const packaged = await derivePack('package-derivative', derivative, edited);
assert(packaged.ok);
const sealed = await verify('derivative-before', derivative);
assert.equal(sealed.build, buildId);
const derivedManifest = await object(derivative, 'transfer-manifest.json');
const newScopes = await scopes(derivative, derivedManifest), keptStudio = {};
for (const originalScope of originalScopes.get(studio)) {
  assert(newScopes.get(studio).includes(originalScope));
  keptStudio[originalScope] = await equalFiles(path.join(seed, originalScope), path.join(derivative, originalScope), sixRoomFiles);
}
assert.deepEqual((await object(derivative, roomScope(newScopes, hotel) + '/save.json')).document, after);
assert.deepEqual(await listFiles(path.join(derivative, 'viewer')), viewer);
await equalFiles(seedViewer, path.join(derivative, 'viewer'), viewer);

function swapMics(rule) { [rule.roles.hostMic, rule.roles.guestMic] = [rule.roles.guestMic, rule.roles.hostMic]; }
const caseItem = fixture => fixture.items.find(item => item.key === hotel);
const borrowed = structuredClone(originalBatch), borrowedItem = caseItem(borrowed), foreignChair = foreignRegion + '/receiver-borrowed-chair';
borrowedItem.operations.push({ type: 'add-facility', id: foreignChair, parentId: foreignRegion,
  resource: { id: 'chair-ladder', version: 1 }, transform: { position: [0, 0, 0], yaw: 0 } });
borrowedItem.interviewRooms[0].roles.guestChair = foreignChair;
const swapped = structuredClone(originalBatch);
swapMics(caseItem(swapped).interviewRooms[0]);
const batchNegatives = [];
for (const [label, fixture, code, location] of [
  ['foreign-chair', borrowed, 'interview-wrong-member', foreignChair],
  ['wrong-mic-seat', swapped, 'interview-mic-position', caseItem(swapped).interviewRooms[0].roles.hostMic],
]) {
  await write(trial, label + '.json', fixture);
  const result = await batch('batch-reject-' + label, path.join(trial, label + '.json'), baselineDir, undefined, 1);
  const rejected = result.results.find(row => row.key === hotel);
  assert(!result.ok && result.results.find(row => row.key === studio)?.status === 'idempotent');
  assert.equal(rejected.code, code);
  assert.equal(rejected.path, location);
  for (const key of [studio, hotel]) assert.deepEqual(await equalFiles(path.join(seed, roomScope(originalScopes, key), 'batch-result'), path.join(baselineDir, key), batchFiles), rebuiltOriginal[key]);
  batchNegatives.push({ label, ...rejected });
}

const retryDir = path.join(trial, 'single-room-retry');
assert.equal((await batch('retry-seed-studio', batchInput, retryDir, studio)).results[0].status, 'created');
const failedFirst = await batch('retry-first-hotel-reject', path.join(trial, 'wrong-mic-seat.json'), retryDir, hotel, 1);
assert.equal(failedFirst.results[0].code, 'interview-mic-position');
await missing(path.join(retryDir, hotel));
const corrected = structuredClone(originalBatch);
caseItem(corrected).operations.push(...desired);
await write(trial, 'corrected-batch.json', corrected);
const retry = await batch('retry-only-hotel', path.join(trial, 'corrected-batch.json'), retryDir, hotel);
assert(retry.ok && retry.results.length === 1 && retry.results[0].status === 'created');
assert.deepEqual((await object(path.join(retryDir, hotel), 'save.json')).document.nodes, after.nodes);
assert.deepEqual(await equalFiles(path.join(seed, roomScope(originalScopes, studio), 'batch-result'), path.join(retryDir, studio), batchFiles), rebuiltOriginal[studio]);

const blockerOps = path.join(trial, 'block-lens.json');
await write(trial, 'block-lens.json', [blocker]);
const oldEditHash = sha(await fs.readFile(edited));
const blockedEditFolder = path.join(trial, 'should-not-edit');
const badEdit = await nodeJson('edit-reject-blocker', working, 'edit.mjs', ['apply', edited, blockerOps, blockedEditFolder], 1);
assert.equal(badEdit.code, 'interview-occluded');
assert.equal(badEdit.path, blocker.id);
await missing(blockedEditFolder);
assert.equal(sha(await fs.readFile(edited)), oldEditHash);

const blockedLayout = structuredClone(after);
const { type: unused, ...fixtureNode } = blocker;
blockedLayout.nodes.push({ kind: 'facility', ...fixtureNode, state: {} });
const switchedLayout = structuredClone(after);
swapMics(switchedLayout.interviewRooms[0]);
const rejectedPackages = [];
for (const [label, layout, code, location] of [
  ['blocker', blockedLayout, 'interview-occluded', blocker.id],
  ['speaker', switchedLayout, 'interview-mic-position', switchedLayout.interviewRooms[0].roles.hostMic],
]) {
  const roomInput = 'bad-pack-' + label + '.json', target = path.join(trial, 'should-not-package-' + label);
  await write(trial, roomInput, layout);
  const badPackage = await derivePack('package-reject-' + label, target, path.join(trial, roomInput), 1);
  assert.equal(badPackage.code, code);
  assert.equal(badPackage.path, location);
  await missing(target);
  rejectedPackages.push(badPackage);
}

assert.deepEqual(await verify('seed-after', seed, base.manifestSha256), base);
assert.deepEqual(await verify('derivative-after', derivative, sealed.manifestSha256), sealed);
assert.equal(sha(await fs.readFile(edited)), oldEditHash);
const receipt = { status: 'passed', fixedCandidate: seed, trial, mother: base, derivative, derivativeManifest: sealed, buildId,
  install: installReceipt, viewerFilesByteIdentical: viewer.length, rebuiltOriginal, studioSixFilesKept: keptStudio,
  editedHotel: { modifications, revision: [initial.revision, after.revision], preservedOtherRoomCount: 15,
    publicRegions: [...regionIds.values()].filter(kind => kind === 'area').length, untouchedAllOtherNodesAndMetadata: true },
  batchNegatives, retry: { rejectedFirst: failedFirst.results[0], corrected: retry.results[0] }, badEdit, rejectedPackages,
  originalsUnchangedAfterFailure: true };
const report = path.join(evidence, 'report.json');
await write(evidence, 'report.json', receipt);
console.log(JSON.stringify({ status: 'passed', buildId, derivative, manifest: sealed.manifestSha256, report }));
