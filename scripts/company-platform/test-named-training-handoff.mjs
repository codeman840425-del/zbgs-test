import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import batch from './batch-inputs/dance-training-rooms.json' with { type: 'json' };

const run = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const exists = file => fs.lstat(file).then(() => true, error => {
  if (error.code !== 'ENOENT') throw error;
  return false;
});
const namedPath = (key, file) => 'data/rooms/' + key + '/' + file;
const defaultSave = 'data/save.json';

const samples = {
  'rental-training-room': {
    entry: { position: [-1.8, 0, 0], yaw: Math.PI / 2 },
    replacement: { id: 'background-brand-panel', version: 1 },
    safe: { position: [.55, 0, 1.67], yaw: Math.PI },
    followup: { position: [.40, 0, 1.72], yaw: Math.PI },
  },
  'upper-floor-training-room': {
    entry: { position: [0, 0, 2.2], yaw: 0 },
    replacement: { id: 'background-grid-panel', version: 1 },
    safe: { position: [.45, 0, -2.58], yaw: 0 },
    followup: { position: [-.31, 0, -2.71], yaw: 0 },
  },
};

function fixtureFor(item) {
  const { key, input, trainingClearance } = item;
  const id = trainingClearance.roomId + '/background';
  const initial = item.operations.find(operation => operation.type === 'add-facility' && operation.id === id);
  const { entry, replacement, safe, followup } = samples[key];
  const move = transform => ({ type: 'move', id, transform });
  assert.equal(initial.parentId, trainingClearance.roomId);
  return {
    key, companyId: input.id, trainingClearance, id, initial,
    operations: {
      activity: [move({ position: [0, 0, 0], yaw: 0 })],
      entry: [move(entry)],
      valid: [{ type: 'replace-resource', id, resource: replacement }, move(safe)],
      followup: [move(followup)],
    },
  };
}

function fixtures() {
  const items = batch.items.filter(item => Object.hasOwn(samples, item.key)).map(fixtureFor);
  assert.deepEqual(items.map(item => item.key).sort(), Object.keys(samples).sort());
  assert.equal(new Set(items.map(item => item.companyId)).size, 2);
  return items;
}

async function writeFixtures(target, items) {
  for (const item of items) {
    const directory = path.join(target, item.key);
    await fs.mkdir(directory);
    for (const [name, operations] of Object.entries(item.operations))
      await writeJson(path.join(directory, name + '.json'), operations);
  }
  await writeJson(path.join(target, 'expected.json'), items.map(item => ({
    key: item.key, companyId: item.companyId, facility: item.id, trainingClearance: item.trainingClearance,
    initialResource: item.initial.resource, initialTransform: item.initial.transform,
    outcomes: { activity: 'training-clearance-obstructed', entry: 'training-clearance-obstructed',
      valid: 'training-room-edit@1', followup: 'training-room-edit@1' },
  })));
}

async function snapshot(root, files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await fs.readFile(path.resolve(root, file)))])));
}

function nodeIn(document, id) {
  const node = document.nodes.find(candidate => candidate.id === id);
  assert(node, 'Missing packaged facility or region ' + id);
  return node;
}

function cliFor(root) {
  return (...args) => run(process.execPath, ['edit.mjs', ...args], { cwd: root, timeout: 30_000 });
}

async function ok(edit, id, revision, ...args) {
  const { stdout, stderr } = await edit(...args);
  assert.equal(stderr.trim(), '', 'Unexpected edit.mjs stderr from ' + args.join(' '));
  const response = JSON.parse(stdout);
  assert.equal(response.ok, true);
  assert.equal(response.id, id);
  assert.equal(response.revision, revision);
  return response;
}

async function rejectMove({ edit, item, input, ops, target, region, unchanged }) {
  const parent = path.dirname(target), before = (await fs.readdir(parent)).sort();
  let response;
  await assert.rejects(edit('apply', input, ops, target), error => {
    assert.equal(error.code, 1, error.stdout + error.stderr);
    response = JSON.parse(error.stderr);
    assert.equal(response.ok, false);
    assert.equal(response.code, 'training-clearance-obstructed');
    assert.equal(response.path, item.id);
    assert(response.message.includes('Clearance intrusion in ' + region + ' of ' + item.trainingClearance.roomId),
      'Wrong clearance region: ' + response.message);
    return true;
  });
  assert.equal(await exists(target), false, 'Rejected edit created an output directory');
  assert.deepEqual((await fs.readdir(parent)).sort(), before, 'Rejected edit left staging files');
  await unchanged();
  return response;
}

async function verifySave(directory, before, expectedChanges, item) {
  const savePath = path.join(directory, 'save.json');
  const names = await fs.readdir(directory);
  assert.deepEqual(names.sort(), ['layout.json', 'save.json', ...(item ? ['training-edit.json'] : [])]);
  const bytes = await fs.readFile(savePath), save = JSON.parse(bytes);
  assert.equal(save.schema, 'company-save');
  assert.equal(save.version, 1);
  assert.deepEqual(save.document, await readJson(path.join(directory, 'layout.json')));
  const expected = structuredClone(before.document);
  expected.revision++;
  Object.assign(nodeIn(expected, expectedChanges.id), expectedChanges.fields);
  assert.deepEqual(save.document, expected, 'Only the documented edit and revision should change');
  const sha256 = hash(bytes);
  if (item) {
    const receipt = await readJson(path.join(directory, 'training-edit.json'));
    assert.equal(receipt.schema, 'training-room-edit@1');
    assert.equal(receipt.companyId, item.companyId);
    assert.equal(receipt.saveSha256, sha256);
    assert.deepEqual(receipt.trainingClearance, item.trainingClearance);
  }
  return { savePath, save, sha256 };
}

async function testRoom({ item, fixtureDirectory, directory, root, edit, unchanged }) {
  const savePath = namedPath(item.key, 'save.json'), save = await readJson(path.join(root, savePath));
  assert.equal(save.document.id, item.companyId);
  const background = nodeIn(save.document, item.id);
  assert.deepEqual(background.resource, item.initial.resource);
  assert.deepEqual(background.transform, item.initial.transform);
  assert.equal(background.parentId, item.trainingClearance.roomId);
  assert.deepEqual(background.state, { visible: true });
  assert.deepEqual(save.document, await readJson(path.join(root, namedPath(item.key, 'layout.json'))));
  await fs.mkdir(directory);
  const ops = name => path.join(fixtureDirectory, item.key, name + '.json');
  const initial = await ok(edit, item.companyId, save.document.revision, 'validate', savePath);
  const floor = nodeIn(save.document, item.trainingClearance.roomId).parentId;
  assert(initial.floors.includes(floor));
  const failures = [];
  for (const region of ['activity', 'entry']) {
    const response = await rejectMove({ edit, item, input: savePath, ops: ops(region), region, unchanged,
      target: path.join(directory, 'rejected-' + region) });
    failures.push({ step: 'initial', region, code: response.code, path: response.path });
  }

  const changedDirectory = path.join(directory, 'first-edit');
  const [swap, move] = item.operations.valid;
  await ok(edit, item.companyId, save.document.revision + 1, 'apply', savePath, ops('valid'), changedDirectory);
  const changed = await verifySave(changedDirectory, save, { id: item.id, fields: {
    resource: swap.resource, transform: move.transform, state: background.state,
  } }, item);
  await ok(edit, item.companyId, changed.save.document.revision, 'validate', changed.savePath);

  const editedFiles = ['layout.json', 'save.json', 'training-edit.json'];
  const editedHashes = await snapshot(changedDirectory, editedFiles);
  for (const region of ['activity', 'entry']) {
    const response = await rejectMove({ edit, item, input: changed.savePath, ops: ops(region), region,
      target: path.join(directory, 'rejected-after-edit-' + region), unchanged: async () => {
        await unchanged();
        assert.deepEqual(await snapshot(changedDirectory, editedFiles), editedHashes, 'Prior edit changed after rejection');
      } });
    failures.push({ step: 'after-edit', region, code: response.code, path: response.path });
  }

  const afterDirectory = path.join(directory, 'second-edit');
  await ok(edit, item.companyId, changed.save.document.revision + 1, 'apply', changed.savePath, ops('followup'), afterDirectory);
  const after = await verifySave(afterDirectory, changed.save, { id: item.id, fields: {
    transform: item.operations.followup[0].transform,
  } }, item);
  await ok(edit, item.companyId, after.save.document.revision, 'validate', after.savePath);
  assert.deepEqual(await snapshot(changedDirectory, editedFiles), editedHashes, 'Follow-up edit changed its source');
  await unchanged();
  return { key: item.key, companyId: item.companyId, floor, initialRevision: save.document.revision, failures,
    edited: [{ revision: changed.save.document.revision, sha256: changed.sha256 }, { revision: after.save.document.revision, sha256: after.sha256 }] };
}

async function testDefault(root, edit, directory, items) {
  const save = await readJson(path.join(root, defaultSave));
  assert(items.every(item => item.companyId !== save.document.id), 'The default fixture must be a separate ordinary company');
  const ordinary = save.document.nodes.find(node => node.kind === 'room');
  assert(ordinary);
  const name = '普通公司交接回归', operations = path.join(directory, 'default-rename.json');
  assert.notEqual(ordinary.name, name);
  await writeJson(operations, [{ type: 'set-room', id: ordinary.id, name }]);
  await ok(edit, save.document.id, save.document.revision, 'validate', defaultSave);
  const target = path.join(directory, 'default-edit');
  await ok(edit, save.document.id, save.document.revision + 1, 'apply', defaultSave, operations, target);
  const result = await verifySave(target, save, { id: ordinary.id, fields: { name } });
  await ok(edit, save.document.id, result.save.document.revision, 'validate', result.savePath);
  return { companyId: save.document.id, changedRoom: ordinary.id, revision: result.save.document.revision, sha256: result.sha256 };
}

const [packageArg, outputArg, ...extra] = process.argv.slice(2);
if (!packageArg || !outputArg || extra.length)
  throw Error('Usage: node scripts/company-platform/test-named-training-handoff.mjs PACKAGE_ROOT NEW_TEST_OUTPUT | --fixtures NEW_FIXTURE_DIRECTORY');
const items = fixtures(), target = path.resolve(outputArg);
if (packageArg === '--fixtures') {
  await fs.mkdir(target);
  await writeFixtures(target, items);
  console.log(JSON.stringify({ status: 'fixtures-ready', directory: target }));
} else {
  const root = path.resolve(packageArg), edit = cliFor(root);
  const manifestPath = 'transfer-manifest.json', manifest = await readJson(path.join(root, manifestPath));
  await fs.access(path.join(root, 'edit.mjs'));
  await fs.access(path.join(root, 'source/prototype/node_modules/three/package.json'));
  assert.equal(manifest.schema, 'company-transfer');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.savedCompany.trainingClearance, undefined, 'The default room must be unguarded by the training contract');
  const pinned = ['data/layout.json', defaultSave, ...items.flatMap(item => [
    namedPath(item.key, 'layout.json'), namedPath(item.key, 'save.json'),
    ...['input.json', 'layout.json', 'report.json', 'save.json'].map(file => namedPath(item.key, 'batch-result/' + file)),
  ])];
  const baseline = await snapshot(root, [...pinned, manifestPath]);
  for (const name of pinned)
    assert.equal(manifest.files.find(file => file.path === name)?.sha256, baseline[name], 'Packaged file differs from manifest: ' + name);
  const unchanged = async () => assert.deepEqual(await snapshot(root, [...pinned, manifestPath]), baseline,
    'Original default or named room data changed');
  await fs.mkdir(target);
  const fixtureDirectory = path.join(target, 'fixtures');
  await fs.mkdir(fixtureDirectory);
  await writeFixtures(fixtureDirectory, items);
  const defaultRoom = await testDefault(root, edit, target, items);
  const namedRooms = [];
  for (const item of items) {
    namedRooms.push(await testRoom({ item, fixtureDirectory, directory: path.join(target, item.key), root, edit, unchanged }));
  }
  await unchanged();
  const report = path.join(target, 'report.json');
  await writeJson(report, { status: 'passed', packageRoot: root, buildId: manifest.buildId, defaultRoom, namedRooms,
    sourceFilesPreserved: baseline });
  console.log(JSON.stringify({ status: 'passed', report, namedRooms: namedRooms.map(item => item.key) }));
}
