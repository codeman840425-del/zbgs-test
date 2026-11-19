import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import projectPaths from '../project-output.cjs';
import {copyDeclaredFiles, digest, jsonBytes, localFile, runtimePath} from './files.mjs';
import {collectRecordResources} from './record-resources.mjs';
import {createGameRecordInventory, exportGameRecordInventory} from './game-record-inventory.mjs';
import {createCharacterRecord} from '../../prototype/src/character-record.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const producer = await projectPaths.productionRoot();
const experiments = await projectPaths.projectOutput(path.join(producer, 'experiments'), producer);
await mkdir(experiments, {recursive:true});
const temp = await mkdtemp(path.join(experiments, 'game-record-test-'));
const sourceRoot = path.join(temp, 'source');
const project = path.join(sourceRoot, 'prototype');
const dist = path.join(temp, 'dist');
const manifestPath = 'assets/record-consumer-v1/manifest.json';
const entry = 'record-consumer.html';
const bundle = 'assets/game-record.js';
const shared = 'assets/shared-runtime.js';
const lazy = 'assets/lazy-runtime.js';
const build = 'build-info.json';
const matrix = '../assets-source/variant-matrix-v1/representative-matrix.json';
const batchRequest = '../assets-source/variant-matrix-v1/representative-batch-request.json';
const sourceInputs = new Set([entry, 'package.json', 'package-lock.json', matrix, batchRequest]);
const runtimeFiles = [entry, bundle, shared, lazy, build];
const readJson = async file => JSON.parse(await readFile(file));
const inputManifest = 'records/manifest.json';
let reviewed, orderedRecords, sampleRecords, uniformPair;

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const item of await readdir(path.join(directory, prefix), {withFileTypes:true})) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isDirectory()) files.push(...await listFiles(directory, relative));
    else files.push(relative);
  }
  return files.sort();
}

async function reviewFixture(included = sourceInputs) {
  const hash = createHash('sha256');
  const inputs = [...included].sort();
  for (const file of inputs) hash.update(file).update('\0').update(await readFile(path.join(project, file))).update('\0');
  const sourceDigest = hash.digest('hex');
  await writeFile(path.join(dist, build), jsonBytes({shortId:sourceDigest.slice(0, 12), sourceDigest, inputs}));
  const rows = await Promise.all(runtimeFiles.map(async file => {
    const bytes = await readFile(path.join(dist, file));
    return [file, {sha256:digest(bytes), bytes:bytes.length}];
  }));
  return {schema:'reviewed-game-character-runtime-v1', sourceCommit:'a'.repeat(40), sourceDigest, files:Object.fromEntries(rows)};
}

before(async () => {
  await mkdir(project, {recursive:true});
  await symlink(path.join(root, 'prototype/node_modules'), path.join(project, 'node_modules'), 'junction');
  await cp(path.join(root, 'prototype/src'), path.join(project, 'src'), {recursive:true});
  // Model an engine with only the template parent registered. The two real
  // signed test subjects must enter through data publication in this checkout.
  const profileFile = path.join(project, 'src/source-outfit-profiles.json');
  const profiles = await readJson(profileFile);
  for (const record of await readJson(path.join(root, 'evidence/m2-first-rule-delivery-v1/game/signed.json')))
    delete profiles[record.appearanceRecipe.base.bodyType];
  await writeFile(profileFile, jsonBytes(profiles));
  for (const file of await listFiles(project, 'src')) sourceInputs.add(file);
  for (const file of ['package.json', 'package-lock.json', entry])
    await copyFile(path.join(root, 'prototype', file), path.join(project, file));
  await mkdir(path.dirname(path.join(project, matrix)), {recursive:true});
  for (const file of [matrix, batchRequest])
    await copyFile(path.join(root, 'prototype', file), path.join(project, file));
  // Synthetic compiled modules test the real collector without a new Vite build.
  await mkdir(path.join(dist, 'assets'), {recursive:true});
  await writeFile(path.join(dist, entry), '<link rel="modulepreload" href="/assets/shared-runtime.js"><script type="module" src="/assets/game-record.js"></script>');
  await writeFile(path.join(dist, bundle), 'import "./shared-runtime.js"; export const load = () => import("./lazy-runtime.js");');
  await writeFile(path.join(dist, shared), 'export const shared = 1;');
  await writeFile(path.join(dist, lazy), 'export const loaded = true;');
  await writeFile(path.join(dist, 'index.html'), '<title>Unrelated workbench</title>');
  const publicRoot = path.join(root, 'prototype/public');
  orderedRecords = (await readJson(path.join(publicRoot, manifestPath))).entries;
  sampleRecords = await Promise.all(orderedRecords.map(row => readJson(path.join(publicRoot, runtimePath(row.url)))));
  uniformPair = await readJson(path.join(root, 'evidence/m2-uniform-lite-operator-v1/records.json'));
  const assetPaths = new Set([manifestPath, ...orderedRecords.map(row => runtimePath(row.url))]);
  for (const record of [...sampleRecords, ...uniformPair]) {
    await collectRecordResources({
      record, sourceRoot:root,
      add:async (url, _reason, {parent}) => {
        const asset = runtimePath(url, parent);
        assetPaths.add(asset);
        const bytes = await readFile(await localFile(publicRoot, asset));
        return {path:asset, bytes, value:asset.endsWith('.json') ? JSON.parse(bytes) : null};
      },
    });
  }
  for (const file of sourceInputs) {
    if (!file.startsWith('src/') || !file.endsWith('.js')) continue;
    const code = await readFile(path.join(project, file), 'utf8');
    for (const [, asset] of code.matchAll(/from ['"]\.\.\/public\/(assets\/[^'"]+)['"]/g)) {
      const destination = path.join(project, 'public', asset);
      sourceInputs.add('public/' + asset);
      await mkdir(path.dirname(destination), {recursive:true});
      await copyFile(path.join(publicRoot, asset), destination);
    }
  }
  for (const relative of assetPaths) {
    sourceInputs.add('public/' + relative);
    for (const destination of [path.join(project, 'public', relative), path.join(dist, relative)]) {
      await mkdir(path.dirname(destination), {recursive:true});
      await copyFile(path.join(publicRoot, relative), destination);
    }
  }
  reviewed = await reviewFixture();
});

after(async () => rm(temp, {recursive:true, force:true}));

const options = () => ({dist, sourceRoot, reviewed});
const rejectsCode = (work, code) => assert.rejects(work, {code});

test('two signed external bodies use verified data packs in a frozen engine without their profiles', async () => {
  const records = await readJson(path.join(root, 'evidence/m2-first-rule-delivery-v1/game/signed.json'));
  const output = await projectPaths.projectOutput(path.join(producer, 'output'), producer);
  await mkdir(output, {recursive:true});
  const data = await mkdtemp(path.join(output, 'shape-export-test-'));
  const profiles = await import(pathToFileURL(path.join(project, 'src/foundation-profiles.js')).href);
  const ids = records.map(record => record.appearanceRecipe.base.bodyType);
  const shapePacks = [];
  try {
    for (const [i, name] of ['candidate', 'control'].entries()) {
      const folder = path.join(data, name);
      execFileSync('python', ['-B', path.join(root, 'scripts/production/shape_data_pack.py'), 'build',
        '--recipe', path.join(root, 'assets-source/rule-body-recipe-v1', name + '.json'),
        '--candidate', path.join(root, 'prototype/public/assets', ids[i], 'body.vrm'), '--out', folder],
      {cwd:root, windowsHide:true, env:{...process.env,TEMP:data,TMP:data}});
      shapePacks.push(folder);
    }
    const opts = {...options(), records, shapePacks};
    const absent = () => ids.forEach(id => assert.throws(() => profiles.foundationProfile(id)));
    absent();
    await rejectsCode(() => createGameRecordInventory({...opts, records:undefined}), 'invalid-record-input');
    await rejectsCode(() => createGameRecordInventory({...opts, records:records.slice(0, 1)}), 'invalid-record-input');
    const altered = structuredClone(records);
    altered[0].integrity.recordSha256 = '0'.repeat(64);
    await rejectsCode(() => createGameRecordInventory({...opts, records:altered}), 'record-hash-mismatch');
    absent();
    const inventory = await createGameRecordInventory(opts);
    absent();
    const manifest = JSON.parse(inventory.files.find(row => row.path === inputManifest).generated);
    assert.deepEqual(manifest.ruleBodyDataPacks.map(row => row.bodyType).sort(), [...ids].sort());
    assert.equal(inventory.files.filter(row => row.path.startsWith('character-data/')).length, 8);
    assert(!inventory.files.some(row => row.path === 'records/rule-body-data.json'));
    const model = inventory.files.find(row => row.path === 'assets/' + ids[0] + '/body.vrm');
    assert(model.provenance.some(p => p.indexSha256 === manifest.ruleBodyDataPacks.find(p => p.bodyType === ids[0]).sha256));
    assert(model.provenance.some(p => p.packPath === 'profile.json' && p.sourceLicense));
    for (const row of inventory.files)
      assert(!row.provenance.some(ref => ids.some(id => ref.sourcePath?.includes('prototype/public/assets/' + id + '/'))));
    assert(!sourceInputs.has('public/' + model.path));
    const out = path.join(temp, 'shape-game');
    const fit = path.join(shapePacks[0], 'fit.json');
    const original = await readFile(fit);
    await writeFile(fit, Buffer.concat([original, Buffer.from(' ')]));
    await assert.rejects(() => exportGameRecordInventory({...opts, out, inventory}));
    await assert.rejects(lstat(out), {code:'ENOENT'});
    await writeFile(fit, original);
    await exportGameRecordInventory({...opts, out, inventory});
    absent();
    for (const row of inventory.files) assert.equal(digest(await readFile(path.join(out, row.path))), row.sha256);
    for (const [i, rec] of records.entries())
      assert.equal(await readFile(path.join(out, inventory.records[i].file), 'utf8'), JSON.stringify(rec));
    assert(!existsSync(path.join(dist, model.path)));
  } finally {
    await rm(data, {recursive:true, force:true});
  }
});

test('standing vocal exports only the selected body anchors and keeps both original signatures on retry', async () => {
  const {foundationProfile} = await import(pathToFileURL(path.join(project, 'src/foundation-profiles.js')));
  const profiles = uniformPair.map(record => foundationProfile(record.appearanceRecipe.base.bodyType));
  const paths = profiles.map(profile => runtimePath(profile.lipAnchor.url));
  const selected = {...options(), records:uniformPair};
  const inventory = await createGameRecordInventory(selected);
  const catalog = await readJson(path.join(project, 'src/performer-lip-anchors.json'));
  const registered = new Set(Object.values(catalog).map(ref => runtimePath(ref.url)));
  const anchors = rows => rows.filter(row => registered.has(row.path));
  assert.deepEqual(anchors(inventory.files).map(row => row.path).sort(), [...paths].sort());
  const single = await createGameRecordInventory({...selected, records:[uniformPair[1]]});
  assert.deepEqual(anchors(single.files).map(row => row.path), [paths[1]]);
  for (const {lipAnchor} of profiles) {
    const row = inventory.files.find(file => file.path === runtimePath(lipAnchor.url));
    assert.equal(row.sha256, lipAnchor.sha256);
    assert.equal(row.bytes, lipAnchor.bytes);
  }

  const destination = path.join(temp, 'standing-vocal');
  const run = () => exportGameRecordInventory({...selected, inventory, out:destination});
  const missing = path.join(dist, paths[0]), original = await readFile(missing);
  try {
    await rm(missing);
    await rejectsCode(run, 'missing-dependency');
    await assert.rejects(lstat(destination), {code:'ENOENT'});
    await writeFile(missing, await readFile(path.join(dist, paths[1])));
    await rejectsCode(run, 'modified-dependency');
    await assert.rejects(lstat(destination), {code:'ENOENT'});
    assert(!(await readdir(temp)).some(name => name.startsWith('standing-vocal.stage-')));
  } finally {
    await writeFile(missing, original);
  }
  await run();
  for (const [i, record] of uniformPair.entries()) {
    assert.equal(inventory.records[i].recordSha256, record.integrity.recordSha256);
    assert.equal(await readFile(path.join(destination, inventory.records[i].file), 'utf8'), JSON.stringify(record));
    assert.equal(digest(await readFile(path.join(destination, paths[i]))), profiles[i].lipAnchor.sha256);
  }
});

test('the build producer changes identity for an edited imported batch request and restores it byte for byte', async () => {
  const isolated = path.join(temp, 'build-id', 'prototype');
  const script = 'scripts/build-id.mjs';
  const imported = ['src/appearance-workbench.js', 'src/character-production-query.js'];
  for (const file of [script, ...imported, batchRequest, matrix, entry, 'public/favicon.svg', 'public/native-production.html',
    'index.html', 'foundation.html', 'vite.config.js', 'package.json', 'package-lock.json']) {
    const destination = path.join(isolated, file);
    await mkdir(path.dirname(destination), {recursive:true});
    await copyFile(path.join(root, 'prototype', file), destination);
  }
  await mkdir(path.join(isolated, 'public/assets'), {recursive:true});
  const run = () => execFileSync(process.execPath, [script], {cwd:isolated, stdio:'pipe', windowsHide:true,
    env:{...process.env, TMP:temp, TEMP:temp, TMPDIR:temp, NODE_DISABLE_COMPILE_CACHE:'1'}});
  const output = path.join(isolated, 'public/build-info.json');
  const input = path.join(isolated, batchRequest);
  const original = await readFile(input);
  run();
  const before = await readFile(output);
  const baseline = JSON.parse(before);
  for (const external of [batchRequest, matrix]) assert(baseline.inputs.includes(external));
  const request = JSON.parse(original);
  request.batchId += '-edited';
  await writeFile(input, jsonBytes(request));
  run();
  const changed = await readJson(output);
  assert.deepEqual(changed.inputs, baseline.inputs);
  assert.notEqual(changed.sourceDigest, baseline.sourceDigest);
  assert.notEqual(changed.shortId, baseline.shortId);
  await rm(input);
  assert.throws(run, /ENOENT.*representative-batch-request\.json/);
  await writeFile(input, original);
  run();
  assert.deepEqual(await readFile(output), before);
});

test('new reviews must identify both matrix inputs and verify their bytes', async () => {
  const canonical = await readFile(path.join(dist, build));
  try {
    for (const omitted of [batchRequest, matrix]) {
      const newReview = await reviewFixture([...sourceInputs].filter(file => file !== omitted));
      await rejectsCode(() => createGameRecordInventory({...options(), reviewed:newReview}), 'unsupported-build');
    }
    const alias = batchRequest.replace('../assets-source/', '../assets-source/../assets-source/');
    const newReview = await reviewFixture([...sourceInputs, alias]);
    await rejectsCode(() => createGameRecordInventory({...options(), reviewed:newReview}), 'unsafe-path');
  } finally {
    await writeFile(path.join(dist, build), canonical);
  }
  const input = path.join(project, batchRequest);
  const original = await readFile(input);
  try {
    const request = JSON.parse(original);
    request.items.reverse();
    await writeFile(input, jsonBytes(request));
    await rejectsCode(() => createGameRecordInventory(options()), 'source-identity-mismatch');
  } finally {
    await writeFile(input, original);
  }
});

const historical = path.join(root, 'experiments/worktrees/texshare-df610092');
const historicalDist = path.join(historical, 'prototype/dist');
const repeatedDist = path.join(historical + '-repeat', 'prototype/dist');
test('exported operator reproduces the registered df610092 review and its signed pair without Git', {
  skip: [historicalDist, repeatedDist].every(dir => existsSync(path.join(dir, build))) ? false : 'requires both fixed df610092 builds',
}, async () => {
  const operator = path.join(temp, 'operator');
  await mkdir(operator);
  const archive = path.join(temp, 'operator.tar');
  const modules = ['game-record-inventory.mjs', 'record-resources.mjs', 'files.mjs',
    'ear-style-sources.json', 'hair-region-sources.json'];
  execFileSync('tar', ['-cf', archive, '-C', path.join(root, 'scripts/runtime-package'), ...modules], {windowsHide:true});
  execFileSync('tar', ['-xf', archive, '-C', operator], {windowsHide:true});
  const portable = await import(pathToFileURL(path.join(operator, modules[0])).href);
  const issued = await readJson(path.join(root, 'scripts/runtime-package/game-record-shared-hair-reviewed.json'));
  const records = await readJson(path.join(root, 'evidence/m2-uniform-skin-v1/signed-pair.json'));
  const out = path.join(temp, 'reproduced-game');
  const {PATH, GIT_DIR} = process.env;
  try {
    process.env.PATH = operator;
    process.env.GIT_DIR = path.join(operator, 'absent');
    const repeated = await portable.compareGameRuntimeBuilds({dist:historicalDist, rebuilt:repeatedDist,
      sourceRoot:historical + '-repeat', sourceCommit:issued.sourceCommit});
    assert.deepEqual(repeated, issued);
    const opts = {dist:historicalDist, sourceRoot:historical, records, reviewed:issued};
    const altered = structuredClone(issued);
    altered.files[entry].bytes++;
    await rejectsCode(() => portable.createGameRecordInventory({...opts, reviewed:altered}), 'unsupported-build');
    const inventory = await portable.createGameRecordInventory(opts);
    await portable.exportGameRecordInventory({...opts, inventory, out});
    assert.equal(digest(await readFile(path.join(out, 'runtime-package.json'))),
      'eed961f77ee1d5695bfe23fd36018b97d270262342266524f8bf192b4d35ec28');
  } finally {
    process.env.PATH = PATH;
    if (GIT_DIR === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = GIT_DIR;
  }
});

test('exports all record bytes and their dependency union reproducibly', async () => {
  const inventory = await createGameRecordInventory(options());
  assert.deepEqual(inventory.records.map(({id, recordSha256}) => ({id, recordSha256})),
    orderedRecords.map(({id, recordSha256}) => ({id, recordSha256})));
  assert.equal(inventory.runtime.entryUrl, '/' + entry);
  assert.equal(inventory.records[0].avatarSha256, inventory.records[2].avatarSha256);
  assert.notEqual(inventory.records[0].id, inventory.records[2].id);
  assert.equal(inventory.records[3].bodyType, 'male');
  assert(inventory.records[3].equipmentIds.some(id => id.includes('shorts')));
  assert.equal(inventory.files.filter(row => row.path.endsWith('.vrm')).length, 3);
  assert(inventory.files.some(row => row.provenance.some(ref => ref.sourceLicense)));
  assert(inventory.files.some(row => row.path === lazy));
  assert(!inventory.files.some(row => row.path === 'index.html' || 'generated' in row));
  const destinations = ['first-package', 'second-package'].map(name => path.join(temp, name));
  const exports = [];
  for (const out of destinations) {
    exports.push(await exportGameRecordInventory({...options(), inventory, out}));
    assert.deepEqual(await listFiles(out), ['runtime-package.json', ...inventory.files.map(row => row.path)].sort());
    for (const row of inventory.files) assert.equal(digest(await readFile(path.join(out, row.path))), row.sha256);
    assert.deepEqual(await readJson(path.join(out, 'runtime-package.json')), inventory);
  }
  assert.deepEqual(exports[0], exports[1]);
  await rejectsCode(() => exportGameRecordInventory({...options(), inventory, out:destinations[0]}), 'output-conflict');
});

test('rejects changed build metadata and source before running source modules', async () => {
  const bytes = await readFile(path.join(dist, build));
  try {
    await writeFile(path.join(dist, build), jsonBytes({inputs:['not-a-source-file.js']}));
    await rejectsCode(() => createGameRecordInventory({...options(), sourceRoot:path.join(temp, 'absent')}), 'modified-dependency');
  } finally {
    await writeFile(path.join(dist, build), bytes);
  }
  const source = path.join(project, 'src/character-record.js');
  const code = await readFile(source);
  try {
    await writeFile(source, 'throw Error("unverified import");');
    await rejectsCode(() => createGameRecordInventory(options()), 'source-identity-mismatch');
  } finally {
    await writeFile(source, code);
  }
});

test('rejects external imports, missing transitive bundle pins and substituted record bytes', async () => {
  const missingPin = structuredClone(reviewed);
  delete missingPin.files[lazy];
  await rejectsCode(() => createGameRecordInventory({...options(), reviewed:missingPin}), 'unsupported-dependency');
  const code = await readFile(path.join(dist, bundle));
  try {
    const external = Buffer.from('import "https://example.invalid/script.js";');
    await writeFile(path.join(dist, bundle), external);
    await rejectsCode(() => createGameRecordInventory(options()), 'modified-dependency');
    const pin = {sha256:digest(external), bytes:external.length};
    const reviewedExternal = {...reviewed, files:{...reviewed.files, [bundle]:pin}};
    await rejectsCode(() => createGameRecordInventory({...options(), reviewed:reviewedExternal}), 'unsupported-dependency');
  } finally {
    await writeFile(path.join(dist, bundle), code);
  }
  const recordFile = path.join(dist, runtimePath(orderedRecords[0].url));
  const bytes = await readFile(recordFile);
  try {
    await writeFile(recordFile, await readFile(path.join(dist, runtimePath(orderedRecords[2].url))));
    await rejectsCode(() => createGameRecordInventory(options()), 'modified-dependency');
  } finally {
    await writeFile(recordFile, bytes);
  }
});

test('validates the source manifest identity even when build/source bytes agree', async () => {
  const canonical = await readFile(path.join(dist, manifestPath));
  const canonicalBuild = await readFile(path.join(dist, build));
  const sourceManifest = path.join(project, 'public', manifestPath);
  try {
    const changed = JSON.parse(canonical);
    changed.entries[0].id = changed.entries[2].id;
    for (const file of [sourceManifest, path.join(dist, manifestPath)]) await writeFile(file, jsonBytes(changed));
    const falseIdentity = await reviewFixture();
    await rejectsCode(() => createGameRecordInventory({...options(), reviewed:falseIdentity}), 'record-identity-mismatch');
    changed.entries[0].url = '/assets/record-consumer-v1/../escape.json';
    for (const file of [sourceManifest, path.join(dist, manifestPath)]) await writeFile(file, jsonBytes(changed));
    const traversal = await reviewFixture();
    await rejectsCode(() => createGameRecordInventory({...options(), reviewed:traversal}), 'unsafe-path');
  } finally {
    for (const file of [sourceManifest, path.join(dist, manifestPath)]) await writeFile(file, canonical);
    await writeFile(path.join(dist, build), canonicalBuild);
  }
});

test('regenerates inventory, refuses generated substitutions and catches deleted work', async () => {
  const inventory = await createGameRecordInventory(options());
  const out = path.join(temp, 'rejected-export');
  const deleted = structuredClone(inventory);
  const index = deleted.files.findIndex(row => row.path.endsWith('.vrm'));
  const [body] = deleted.files.splice(index, 1);
  await rejectsCode(() => exportGameRecordInventory({...options(), inventory:deleted, out}), 'inventory-mismatch');
  const generated = structuredClone(inventory);
  generated.files.find(row => row.path === bundle).generated = 'replacement';
  await rejectsCode(() => copyDeclaredFiles({inventory:generated, dist, out}), 'invalid-inventory');
  const bodyDestination = path.join(dist, body.path);
  try {
    await rm(bodyDestination);
    await rejectsCode(() => exportGameRecordInventory({...options(), inventory, out}), 'missing-dependency');
    await rejectsCode(() => lstat(out), 'ENOENT');
  } finally {
    await copyFile(path.join(project, 'public', body.path), bodyDestination);
  }
});

test('exports one to four records in supplied order under generated sidecar paths', async () => {
  const records = [sampleRecords[2], sampleRecords[0]];
  const selected = {...options(), records};
  const inventory = await createGameRecordInventory(selected);
  assert.equal(inventory.runtime.entryUrl, entry + '?records=/' + inputManifest);
  assert.equal(inventory.recordManifest, inputManifest);
  assert(!inventory.files.some(row => row.path.startsWith('assets/record-consumer-v1/')));
  assert.deepEqual(inventory.records.map(record => record.id), records.map(record => record.identity.id));
  const out = path.join(temp, 'external-record-package');
  await exportGameRecordInventory({...selected, inventory, out});
  assert.deepEqual(await listFiles(out), ['runtime-package.json', ...inventory.files.map(row => row.path)].sort());
  const expectedEntries = [];
  for (const record of records) {
    const relative = 'records/' + record.identity.id + '.json';
    const bytes = await readFile(path.join(out, relative));
    assert.equal(bytes.toString('utf8'), JSON.stringify(record));
    assert(bytes.length <= 512 * 1024);
    expectedEntries.push({id:record.identity.id, url:'/' + relative, recordSha256:record.integrity.recordSha256});
  }
  assert.deepEqual(await readJson(path.join(out, inputManifest)), {
    schema:'character-record-input-v1', entries:expectedEntries,
  });
  assert.equal((await createGameRecordInventory({...options(), records:records.slice(0, 1)})).records.length, 1);
  assert.equal((await createGameRecordInventory({...options(), records:sampleRecords})).records.length, 4);
});

test('validates external record envelope, resource identities and stable ID uniqueness', async () => {
  for (const records of [null, [], [...sampleRecords, sampleRecords[0]]])
    await rejectsCode(() => createGameRecordInventory({...options(), records}), 'invalid-record-input');
  const record = sampleRecords[1];
  await rejectsCode(() => createGameRecordInventory({...options(), records:[record, record]}), 'duplicate-identity');
  const modified = structuredClone(record);
  modified.identity.name += 'changed';
  await rejectsCode(() => createGameRecordInventory({...options(), records:[modified]}), 'record-hash-mismatch');
  modified.identity.id = '../escape';
  await rejectsCode(() => createGameRecordInventory({...options(), records:[modified]}), 'invalid-identity-id');
  modified.identity = record.identity;
  modified.appearanceRecipe.description = 'x'.repeat(512 * 1024);
  await rejectsCode(() => createGameRecordInventory({...options(), records:[modified]}), 'record-too-large');
  const buildRecord = patch => createCharacterRecord({...record, ...patch}, {validateResources:() => ({status:'pending'})});
  const forged = await buildRecord({resourceIdentities:[]});
  await rejectsCode(() => createGameRecordInventory({...options(), records:[forged]}), 'record-identity-mismatch');
  const reserved = await buildRecord({identity:{...record.identity, id:'manifest'}});
  await rejectsCode(() => createGameRecordInventory({...options(), records:[reserved]}), 'invalid-record-input');
});

test('restages only validated sidecars from the original external record input', async () => {
  const selected = {...options(), records:sampleRecords.slice(0, 1)};
  const inventory = await createGameRecordInventory(selected);
  const out = path.join(temp, 'rejected-external-export');
  await rejectsCode(() => exportGameRecordInventory({...options(), inventory, out}), 'inventory-mismatch');
  await rejectsCode(() => copyDeclaredFiles({inventory, dist, out}), 'invalid-inventory');
  const originalGenerated = new Map(inventory.files.filter(row => row.generated !== undefined)
    .map(row => [row.path, row.generated]));
  const altered = structuredClone(inventory);
  const row = altered.files.find(dependency => dependency.path === inputManifest);
  row.generated = '{"schema":"replaced"}';
  row.bytes = Buffer.byteLength(row.generated);
  row.sha256 = digest(row.generated);
  await rejectsCode(() => exportGameRecordInventory({...selected, inventory:altered, out}), 'inventory-mismatch');
  await rejectsCode(() => copyDeclaredFiles({inventory:altered, dist, out, approvedGameRecords:originalGenerated}), 'invalid-inventory');
  const substituted = structuredClone(inventory);
  substituted.files.find(dependency => dependency.path === bundle).generated = 'replacement';
  await rejectsCode(() => copyDeclaredFiles({inventory:substituted, dist, out, approvedGameRecords:originalGenerated}), 'invalid-inventory');
  const body = inventory.files.find(dependency => dependency.path.endsWith('.vrm'));
  const target = path.join(dist, body.path);
  try {
    await rm(target);
    await rejectsCode(() => exportGameRecordInventory({...selected, inventory, out}), 'missing-dependency');
    await rejectsCode(() => lstat(out), 'ENOENT');
  } finally {
    await copyFile(path.join(project, 'public', body.path), target);
  }
});
