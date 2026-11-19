import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const tools = 'scripts/company-platform/';
const family = 'assets-source/company-singing-stage-v1/';
const recipeRoot = 'assets-source/company-receiver-singing-v1';
const catalogFile = 'prototype/src/company/library-catalog.json';
const libraryPlan = tools + 'library-inputs.json';
const studio = 'singing-studio', rental = 'singing-rental';
const scope = key => 'data/rooms/' + key;
const batchFiles = ['input.json', 'layout.json', 'save.json', 'report.json'];
const sources = [
  {role: 'mic', baseline: 'floor-vocal-mic-boom', file: 'parameters-mic.json', joint: 'microphone-stand_boom'},
  {role: 'score', baseline: 'floor-score-stand-tripod', file: 'parameters-score.json', joint: 'music-stand_desk'},
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = (dir, name) => fs.readFile(path.join(dir, name));
const parse = bytes => JSON.parse(bytes.toString('utf8'));
const write = (name, value) => fs.writeFile(name, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const near = (measured, expected, tolerance) => assert(Math.abs(measured - expected) <= tolerance, measured + ' vs ' + expected);
const file = async name => { try { return (await fs.lstat(name)).isFile(); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

function node(cwd, script, ...args) {
  return run(process.execPath, [script, ...args], {cwd, maxBuffer: 12 * 1024 * 1024, windowsHide: true});
}
const json = async (...args) => parse((await node(...args)).stdout);
async function record(trial, name, ...args) {
  try {
    const {stdout, stderr} = await node(...args);
    await write(path.join(trial, name + '.json'), {cwd: args[0], argv: args.slice(1), exitCode: 0, stdout, stderr});
    return stdout;
  } catch (error) {
    await write(path.join(trial, name + '-failed.json'), {
      cwd: args[0], argv: args.slice(1), exitCode: error.code, stdout: error.stdout, stderr: error.stderr, message: error.message,
    });
    throw error;
  }
}
async function inventory(root, rel = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, rel), {withFileTypes: true})) {
    const name = rel + entry.name;
    if (entry.isDirectory()) files.push(...await inventory(root, name + '/'));
    else { assert(entry.isFile(), name); files.push(name); }
  }
  return files.sort();
}
async function compareViewer(a, b) {
  const names = await inventory(a);
  assert.deepEqual(await inventory(b), names);
  for (const name of names) assert((await read(a, name)).equals(await read(b, name)), name);
  return names.length;
}
async function compareRoom(mother, derived, key) {
  const prefix = scope(key);
  const files = ['layout.json', 'save.json', ...batchFiles.map(name => 'batch-result/' + name)];
  return Object.fromEntries(await Promise.all(files.map(async name => {
    const before = await read(mother, prefix + '/' + name);
    const after = await read(derived, prefix + '/' + name);
    assert(before.equals(after), key + '/' + name);
    return [name, hash(after)];
  })));
}
async function build(trial, source, name) {
  const cwd = path.join(source, 'prototype');
  const id = (await record(trial, name + '-id', cwd, 'scripts/build-company-id.mjs')).trim();
  assert.match(id, /^[0-9a-f]{12}$/u);
  await record(trial, name + '-vite', cwd, 'node_modules/vite/bin/vite.js', 'build', '--config', 'vite.company.config.js');
  return {id, dist: path.join(cwd, 'dist-company')};
}
async function install(trial, source) {
  const bin = path.dirname(process.execPath);
  const candidates = ['node_modules/npm/bin/npm-cli.js', '../lib/node_modules/npm/bin/npm-cli.js', '../share/nodejs/npm/bin/npm-cli.js'];
  const cli = await Promise.any(candidates.map(async name => {
    const at = path.resolve(bin, name);
    assert(await file(at));
    return at;
  })).catch(() => null);
  const args = ['ci', '--no-audit', '--no-fund', '--prefer-online', '--offline=false', '--cache', path.join(trial, 'npm-cache')];
  const cwd = path.join(source, 'prototype');
  const lock = await read(cwd, 'package-lock.json');
  if (cli) await record(trial, 'npm-ci', cwd, cli, ...args);
  else {
    assert(process.platform !== 'win32', 'Run with a Node installation that includes npm-cli.js');
    const {stdout, stderr} = await run('npm', args, {cwd, maxBuffer: 12 * 1024 * 1024});
    await write(path.join(trial, 'npm-ci.json'), {cwd, args, exitCode: 0, stdout, stderr});
  }
  assert(lock.equals(await read(cwd, 'package-lock.json')));
  return hash(lock);
}
function glb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const end = 20 + bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(end + 4), 0x004e4942);
  assert.equal(bytes.readUInt32LE(end) + end + 8, bytes.length);
  return {gltf: parse(bytes.subarray(20, end)), bin: bytes.subarray(end + 8)};
}
async function modelChange(mother, derivative, design, baseline, reference, joint) {
  const beforeBytes = await read(mother, 'viewer' + baseline.asset.url);
  const afterBytes = await read(derivative, 'viewer' + reference.asset.url);
  assert(afterBytes.equals(await read(derivative, 'source/prototype/public' + reference.asset.url)));
  assert.equal(hash(beforeBytes), baseline.asset.sha256);
  assert.equal(hash(afterBytes), reference.asset.sha256);
  assert.notEqual(reference.asset.sha256, baseline.asset.sha256);
  const before = glb(beforeBytes);
  const after = glb(afterBytes);
  assert(before.bin.equals(after.bin), 'The pose-only designs retain every mesh buffer and embedded image byte');
  assert.equal(after.gltf.images.length, 6);
  assert(after.gltf.images.every(image => image.mimeType === 'image/jpeg'));
  const original = before.gltf.nodes.find(node => node.name === joint);
  const derived = after.gltf.nodes.find(node => node.name === joint);
  assert(original && derived);
  const expected = structuredClone(before.gltf);
  expected.nodes[expected.scenes[expected.scene].nodes[0]].name = design.id;
  const expectedJoint = expected.nodes.find(node => node.name === joint);
  let pose;
  if (design.kind === 'vocal') {
    const angle = q => 2 * Math.atan2(q[0], q[3]) * 180 / Math.PI;
    pose = {beforeDegrees: angle(original.rotation), afterDegrees: angle(derived.rotation)};
    near(pose.beforeDegrees, -8, 1e-8);
    near(pose.afterDegrees, design.boomPitchDegrees, 1e-8);
    expectedJoint.rotation = derived.rotation;
  } else {
    pose = {heightBefore: original.translation[1], heightAfter: derived.translation[1]};
    near(pose.heightAfter - pose.heightBefore, design.scoreLiftMetres - .08, 1e-8);
    expectedJoint.translation[1] = derived.translation[1];
  }
  assert.deepEqual(after.gltf, expected);
  return {joint, pose, beforeSha256: baseline.asset.sha256, afterSha256: reference.asset.sha256,
    embeddedImagesRetained: 6, retainedBinarySha256: hash(after.bin)};
}
async function cold(trial, name, source, fixed, key) {
  const result = parse(await record(trial, name, trial, path.join(here, 'cold-read.mjs'), source, fixed, scope(key)));
  assert.equal(result.room, key);
  assert.equal(result.rooms.length, 1);
  assert(result.rooms[0].ok);
  return result.rooms[0];
}

async function receive(mother, trial, expected, resumeBaseline) {
  const seed = await json(mother, 'verify.mjs', '.', expected);
  assert(seed.ok);
  const working = path.join(trial, 'working');
  const source = path.join(working, 'source');
  const starter = path.join(trial, 'baseline-batch');
  let lockSha256, baseline;
  if (resumeBaseline) {
    assert(await file(path.join(trial, 'baseline-studio-cold-failed.json')));
    assert(!(await file(path.join(trial, 'baseline-receipt.json'))));
    for (const name of ['npm-ci', 'baseline-library', 'baseline-models', 'baseline-viewer-vite', 'baseline-batch'])
      assert.equal(parse(await read(trial, name + '.json')).exitCode, 0);
    assert((await read(mother, 'source/prototype/package-lock.json')).equals(await read(source, 'prototype/package-lock.json')));
    lockSha256 = hash(await read(source, 'prototype/package-lock.json'));
    baseline = {id: parse(await read(trial, 'baseline-viewer-id.json')).stdout.trim(), dist: path.join(source, 'prototype', 'dist-company')};
  } else {
    await fs.mkdir(trial, {recursive: false});
    await fs.cp(mother, working, {recursive: true, force: false, errorOnExist: true});
    assert.deepEqual(await json(working, 'verify.mjs', '.', expected), seed);
    lockSha256 = await install(trial, source);
    await record(trial, 'baseline-library', source, tools + 'build-library.mjs', '--check');
    await record(trial, 'baseline-models', source, tools + 'build-singing-stage.mjs', '--check');
    baseline = await build(trial, source, 'baseline-viewer');
    await record(trial, 'baseline-batch', source, tools + 'batch.mjs', tools + 'batch-inputs/singing-rooms.json', starter);
  }
  assert.equal(baseline.id, seed.build);
  const rebuiltViewerFiles = await compareViewer(path.join(mother, 'viewer'), baseline.dist);
  for (const key of [studio, rental]) for (const name of batchFiles) {
    assert((await read(starter, key + '/' + name)).equals(await read(mother, scope(key) + '/batch-result/' + name)), key + '/' + name);
  }
  const baselineStudio = await cold(trial, 'baseline-studio-cold', source, mother, studio);
  const baselineRental = await cold(trial, 'baseline-rental-cold', source, mother, rental);
  await write(path.join(trial, 'baseline-receipt.json'), {seed, lockSha256, rebuiltViewerFiles, baselineStudio, baselineRental});

  const oldCatalog = parse(await read(source, catalogFile));
  const oldPlan = parse(await read(source, libraryPlan));
  const originalCollection = await read(source, family + 'collection.json');
  await fs.mkdir(path.join(source, recipeRoot));
  const admitted = [];
  for (const entry of sources) {
    const recipe = recipeRoot + '/' + entry.file;
    await fs.copyFile(path.join(here, entry.file), path.join(source, recipe));
    const published = parse(await record(trial, 'publish-' + entry.role, source, tools + 'publish-room-appearance.mjs', '--publish', recipe));
    assert.equal(published.status, 'published');
    const checked = parse(await record(trial, 'check-' + entry.role, source, tools + 'publish-room-appearance.mjs', '--check', recipe));
    assert.deepEqual(checked, {...published, status: 'unchanged'});
    assert.equal(published.items.length, 1);
    const recipeBytes = await read(source, recipe);
    assert((await read(source, published.sourceParameters)).equals(recipeBytes));
    assert.equal(published.sourceParametersSha256, hash(recipeBytes));
    const [design] = parse(recipeBytes).designs;
    const [item] = published.items;
    assert.deepEqual({id: item.id, version: item.version}, {id: design.id, version: design.version});
    const reference = parse(await read(source, item.resourcePath));
    const baseline = oldCatalog.resources.find(r => r.id === entry.baseline && r.version === 1);
    assert.equal(reference.asset.sha256, item.sha256);
    assert.equal(reference.productionBranch, baseline.productionBranch);
    assert.equal(reference.mountRole, baseline.mountRole);
    assert.deepEqual(reference.provenance.dependencies, baseline.provenance.dependencies);
    for (const pin of Object.values(reference.provenance.dependencies)) assert.equal(hash(await read(source, pin.path)), pin.sha256);
    admitted.push({...entry, design, published, reference, baseline});
  }
  const newPlan = parse(await read(source, libraryPlan));
  assert.deepEqual(newPlan, {...oldPlan, resources: [...oldPlan.resources, ...admitted.map(a => a.published.items[0].resourcePath)]});
  assert(originalCollection.equals(await read(source, family + 'collection.json')));
  const newCatalog = parse(await read(source, catalogFile));
  const added = newCatalog.resources.filter(r => admitted.some(a => a.design.id === r.id));
  assert.equal(added.length, admitted.length);
  for (const entry of admitted) assert.deepEqual(added.find(r => r.id === entry.design.id), entry.reference);
  assert.deepEqual({...newCatalog, resources: newCatalog.resources.filter(r => !added.includes(r))}, oldCatalog);
  await record(trial, 'derived-library', source, tools + 'build-library.mjs', '--check');

  const original = parse(await read(mother, scope(studio) + '/save.json')).document;
  const recipe = parse(await read(mother, scope(studio) + '/batch-result/input.json'));
  assert.deepEqual(original.singingRooms, recipe.singingRooms);
  const roles = recipe.singingRooms[0].roles;
  const replacements = admitted.map(a => ({
    type: 'replace-resource', id: roles[a.role], resource: {id: a.design.id, version: a.design.version},
  }));
  await write(path.join(trial, 'replace.json'), replacements);
  const edited = path.join(trial, 'editor-result');
  await record(trial, 'editor-apply', working, 'edit.mjs', 'apply', path.join(mother, scope(studio), 'save.json'), path.join(trial, 'replace.json'), edited);
  await record(trial, 'editor-validate', working, 'edit.mjs', 'validate', path.join(edited, 'save.json'));
  const expectedDocument = structuredClone(original);
  for (const [index, op] of replacements.entries()) {
    const installed = expectedDocument.nodes.find(node => node.id === op.id);
    const input = recipe.operations.find(item => item.type === 'add-facility' && item.id === op.id);
    assert(installed && input);
    assert.deepEqual(installed.resource, {id: admitted[index].baseline.id, version: 1});
    assert.deepEqual(input.resource, installed.resource);
    installed.resource = op.resource;
    input.resource = op.resource;
  }
  assert.deepEqual(parse(await read(edited, 'save.json')).document, {...expectedDocument, revision: original.revision + 1});
  const recipePath = tools + 'batch-inputs/singing-receiver-rooms.json';
  await write(path.join(source, recipePath), {schema: 'company-batch', version: 1, items: [recipe]});
  const produced = path.join(trial, 'derived-batch');
  await record(trial, 'derived-batch', source, tools + 'batch.mjs', recipePath, produced, '--only', studio);
  assert.deepEqual(parse(await read(produced, studio + '/save.json')).document, expectedDocument);
  await record(trial, 'batch-validate', working, 'edit.mjs', 'validate', path.join(produced, studio, 'save.json'));
  const runtime = await build(trial, source, 'derived-viewer');
  assert.notEqual(runtime.id, seed.build);
  const derivative = path.join(trial, 'derived');
  await record(trial, 'package', source, tools + 'package-company.mjs', runtime.dist, runtime.id, path.join(produced, studio), derivative,
    '--source', source, '--room', studio, path.join(produced, studio), '--room', rental, path.join(mother, scope(rental), 'batch-result'));
  const derivativeVerified = await json(derivative, 'verify.mjs', '.');
  assert(derivativeVerified.ok);
  assert.equal(derivativeVerified.build, runtime.id);
  const rentalFiles = await compareRoom(mother, derivative, rental);
  assert.deepEqual(parse(await read(derivative, scope(studio) + '/save.json')).document, expectedDocument);
  await record(trial, 'sealed-studio-validate', working, 'edit.mjs', 'validate', path.join(derivative, scope(studio), 'save.json'));
  await record(trial, 'sealed-rental-validate', working, 'edit.mjs', 'validate', path.join(derivative, scope(rental), 'save.json'));
  const sealedStudio = await cold(trial, 'sealed-studio-cold', source, derivative, studio);
  const sealedRental = await cold(trial, 'sealed-rental-cold', source, derivative, rental);
  assert.deepEqual(sealedRental, baselineRental);
  assert.deepEqual(sealedStudio.standing, baselineStudio.standing);
  assert.deepEqual(sealedStudio.camera, baselineStudio.camera);
  const dot = sealedStudio.microphone.axis.reduce((sum, n, i) => sum + n * baselineStudio.microphone.axis[i], 0);
  const micAngleDelta = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
  near(micAngleDelta, 2, .002);
  const pageDeltas = sealedStudio.score.map(({point}, i) => point[1] - baselineStudio.score[i].point[1]);
  for (const delta of pageDeltas) near(delta, -.045, .0001);
  const modelEvidence = {};
  for (const {role, design, baseline, reference, joint, published} of admitted) {
    const recipe = published.sourceParameters;
    assert.equal(hash(await read(derivative, 'source/' + recipe)), published.sourceParametersSha256);
    assert.deepEqual(parse(await read(derivative, 'source/' + published.items[0].resourcePath)), reference);
    for (const pin of Object.values(reference.provenance.dependencies)) assert.equal(hash(await read(derivative, 'source/' + pin.path)), pin.sha256);
    modelEvidence[role] = await modelChange(mother, derivative, design, baseline, reference, joint);
  }
  assert.deepEqual(await json(mother, 'verify.mjs', '.', expected), seed);
  const result = {ok: true, mother, trial, seed, lockSha256, rebuiltViewerFiles, derivative, derivativeVerified, replacements,
    modelEvidence, microphoneAxisChangedDegrees: micAngleDelta, scorePageHeightChangesMetres: pageDeltas,
    officialColdChecks: {studio: sealedStudio, rental: sealedRental}, byteIdenticalRentalFiles: rentalFiles};
  await write(path.join(trial, 'report.json'), result);
  console.log(JSON.stringify({ok: result.ok, derivative, derivativeVerified, rebuiltViewerFiles, micAngleDelta, pageDeltas}));
}

const [fixed, output, expected, resume, ...extra] = process.argv.slice(2);
assert(fixed && output && /^[0-9a-f]{64}$/u.test(expected ?? '') && (!resume || resume === '--resume-baseline') && !extra.length,
  'Usage: node receive.mjs FIXED_PACKAGE NEW_TRIAL_DIRECTORY EXPECTED_MANIFEST_SHA256 [--resume-baseline]');
await receive(await fs.realpath(fixed), path.resolve(output), expected, resume === '--resume-baseline');
