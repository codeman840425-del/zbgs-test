
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import batch from './batch-inputs/dance-training-rooms.json' with { type: 'json' };

const [packageArg, workArg, outArg, legacyArg, ...extra] = process.argv.slice(2);
if (!packageArg || !workArg || !outArg || extra.length) {
  throw Error('Usage: node test-portable-training-handoff.mjs SEALED_PACKAGE WORKING_COPY NEW_OUT [LEGACY_CLI_PROOF]\n' +
    'The working copy must have the package-locked dependencies installed under source/prototype.');
}

const sealed = path.resolve(packageArg), work = path.resolve(workArg), out = path.resolve(outArg);
const legacy = legacyArg && path.resolve(legacyArg);
const stage = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString('utf8'));
const readJson = async file => json(await fs.readFile(file));
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const saveFor = (root, key) => path.join(root, 'data', 'rooms', key, 'save.json');
const sourceDeps = root => path.join(root, 'source', 'prototype', 'node_modules');
const packageTool = root => path.join(root, 'source', 'scripts', 'company-platform', 'package-company.mjs');
const report = { status: 'running', source: sealed, operations: [], rooms: [], sealedReceivers: [] };
const injectedDependencies = [];
let manifest, madeOutput;

const specimens = {
  'rental-training-room': {
    alias: 'portable-rental',
    replacement: 'background-brand-panel',
    move: [.55, 0, 1.67],
    next: [.40, 0, 1.72],
    entry: [-1.8, 0, 0],
    yaw: Math.PI,
    entryYaw: Math.PI / 2,
    bonsaiSha256: 'ae31a7de760b19a91128037733c1cf1f7e6306530cbe0bc6fe2110a42212d777',
  },
  'upper-floor-training-room': {
    alias: 'portable-upper',
    replacement: 'background-grid-panel',
    move: [.45, 0, -2.58],
    next: [-.31, 0, -2.71],
    entry: [0, 0, 2.2],
    yaw: 0,
    entryYaw: 0,
    bonsaiSha256: '39ee89aa52e94b5e6f53ae05741408eb268356226413d6652860af71e4837f8e',
  },
};

function sameNode(doc, id) {
  const node = doc.nodes.find(candidate => candidate.id === id);
  assert(node, 'Missing document node ' + id);
  return node;
}

async function invoke(label, cwd, entry, args, failure) {
  const job = { label, entry, args, exit: null };
  report.operations.push(job);
  let stdout, stderr;
  try {
    ({ stdout, stderr } = await stage(process.execPath, [entry, ...args], { cwd, timeout: 120000, windowsHide: true }));
    job.exit = 0;
  } catch (error) {
    ({ stdout, stderr } = error);
    job.exit = error.code;
    job.signal = error.signal;
  }
  if (failure) {
    assert.equal(job.exit, 1, label + ': ' + (stderr || stdout));
    const response = JSON.parse(stderr);
    job.response = response;
    assert.equal(response.ok, false);
    assert.equal(response.code, failure.code, label + ': ' + response.message);
    if (failure.path) assert.equal(response.path, failure.path);
    if (failure.message) assert(response.message.includes(failure.message), response.message);
  } else {
    assert.equal(job.exit, 0, label + ': ' + (stderr || stdout));
    assert.equal(stderr.trim(), '');
    job.response = JSON.parse(stdout);
    assert(job.response.ok, label);
  }
  return job.response;
}

const edit = (root, label, args, failure) => invoke(label, root, 'edit.mjs', args, failure);

async function snapshot(files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await fs.readFile(file))])));
}

async function expectReject({ root, label, args, output, files = [], failure }) {
  const prior = await snapshot(files);
  const parent = output && path.dirname(output);
  const before = parent && (await fs.readdir(parent)).sort();
  const response = await edit(root, label, args, failure);
  if (parent) {
    await assert.rejects(fs.stat(output), { code: 'ENOENT' }, label + ' left a result directory');
    assert.deepEqual((await fs.readdir(parent)).sort(), before, label + ' left staging files');
  }
  assert.deepEqual(await snapshot(files), prior, label + ' modified an input file');
  return response;
}

async function verify(root, label) {
  const bytes = await fs.readFile(path.join(root, 'transfer-manifest.json'));
  const result = await invoke(label, root, 'verify.mjs', [root, sha(bytes)]);
  assert.equal(result.manifestSha256, sha(bytes));
  assert.equal(result.build, manifest.buildId);
  assert.equal(result.extraFiles, 0);
  assert.equal(result.changedFiles, 0);
  assert.equal(result.missingFiles, 0);
  return sha(bytes);
}

async function prepareReceiver(root) {
  const lock = await readJson(path.join(root, 'source', 'prototype', 'package-lock.json'));
  const expected = lock.packages['node_modules/three'].version;
  const installed = await readJson(path.join(sourceDeps(work), 'three', 'package.json'));
  assert.equal(installed.version, expected);
  const directory = sourceDeps(root);
  await fs.mkdir(directory);
  injectedDependencies.push({ root, directory });
  await fs.cp(path.join(sourceDeps(work), 'three'), path.join(directory, 'three'), { recursive: true, force: false });
}

async function seal(label, receiver, destination, rules = [], failure) {
  const packageEntry = packageTool(receiver);
  const defaultSave = path.join(receiver, 'data', 'save.json');
  const args = [path.join(receiver, 'viewer'), manifest.buildId, defaultSave, destination, '--source', path.join(receiver, 'source'),
    ...rules.flatMap(({ key, filename }) => ['--room', key, filename])];
  const response = await invoke(label, receiver, packageEntry, args, failure);
  if (failure) {
    await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  } else {
    assert.deepEqual(response.rooms, rules.map(room => room.key));
    report.sealedReceivers.push({ path: destination, manifestSha256: await verify(destination, label + ': verify sealed bytes') });
  }
  return response;
}

function bindingOf(document, room, clearance) {
  const binding = document.trainingBinding;
  assert.equal(binding?.schema, 'company-training-binding');
  assert.equal(binding.version, 1);
  assert.equal(binding.companyId, document.id);
  assert.equal(binding.roomId, room);
  assert.deepEqual(binding.trainingClearance, clearance);
  const source = binding.source;
  assert(['batch-input', 'training-edit'].includes(source?.kind));
  assert.match(source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(source.sha256, sha(Buffer.from(source.text, 'utf8')));
  const declaration = JSON.parse(source.text);
  assert.equal(declaration.companyId ?? declaration.input?.id ?? declaration.id, document.id);
  assert.deepEqual(declaration.trainingClearance ?? null, clearance);
  return binding;
}

async function accepted({ root, label, input, operations, target, item, flags = [] }) {
  const old = await readJson(input);
  const oldBytes = sha(await fs.readFile(input));
  const result = await edit(root, label, ['apply', input, operations, target, ...flags]);
  const savePath = path.join(target, 'save.json');
  const saved = await readJson(savePath);
  assert.equal(saved.schema, 'company-save');
  assert.equal(saved.document.id, old.document.id);
  assert.equal(saved.document.revision, old.document.revision + 1);
  assert.equal(result.revision, saved.document.revision);
  assert.deepEqual(saved.document, await readJson(path.join(target, 'layout.json')));
  if (item) {
    const binding = bindingOf(saved.document, item.trainingClearance.roomId, item.trainingClearance);
    if (old.document.trainingBinding) assert.deepEqual(binding, old.document.trainingBinding, 'Existing provenance identity changed');
  } else {
    assert.equal(saved.document.trainingBinding, undefined);
  }
  assert.equal(sha(await fs.readFile(input)), oldBytes);
  return { savePath, save: saved, sha256: sha(await fs.readFile(savePath)) };
}

async function detach(input, directory, filename, change) {
  await fs.mkdir(directory);
  const output = path.join(directory, filename);
  if (change) {
    const raw = await readJson(input);
    change(raw.document);
    await writeJson(output, raw);
  } else {
    await fs.copyFile(input, output);
    assert.equal(sha(await fs.readFile(output)), sha(await fs.readFile(input)));
  }
  assert.deepEqual(await fs.readdir(directory), [filename], 'A portable input must be one detached file');
  return output;
}

async function operations(item, directory) {
  const guard = item.trainingClearance;
  const sample = specimens[item.key];
  const id = guard.roomId + '/background';
  const names = ['bonsai', 'door', 'initial', 'next', 'continue'];
  const paths = Object.fromEntries(names.map(name => [name, path.join(directory, name + '.json')]));
  const bonsaiId = guard.roomId + '/test-bonsai';
  const move = (position, yaw) => ({ type: 'move', id, transform: { position, yaw } });
  const plants = [{
    type: 'add-facility',
    id: bonsaiId,
    parentId: guard.roomId,
    resource: { id: 'plant-bonsai', version: 1 },
    transform: { position: [.25, 0, -1.02], yaw: 0 },
  }];
  await Promise.all([
    writeJson(paths.bonsai, plants),
    writeJson(paths.door, [move(sample.entry, sample.entryYaw)]),
    writeJson(paths.initial, [
      { type: 'replace-resource', id, resource: { id: sample.replacement, version: 1 } },
      move(sample.move, sample.yaw),
    ]),
    writeJson(paths.next, [move(sample.next, sample.yaw)]),
    writeJson(paths.continue, [{ type: 'set-state', id, state: { visible: false } }]),
  ]);
  const bonsaiSha256 = sha(await fs.readFile(paths.bonsai));
  assert.equal(bonsaiSha256, sample.bonsaiSha256, 'Replay the originally reported operation exactly');
  const replay = { bonsaiSha256, reviewerReference: sample.bonsaiSha256, sameReviewBytes: bonsaiSha256 === sample.bonsaiSha256,
    id: bonsaiId, resource: plants[0].resource, transform: plants[0].transform };
  return { id, bonsaiId, paths, replay };
}

async function breaches(root, source, topic, folder, item, action) {
  for (const [region, name, culprit] of [
    ['activity', 'bonsai', action.bonsaiId], ['entry', 'door', action.id],
  ]) {
    const output = path.join(folder, 'rejected-' + topic + '-' + region);
    await expectReject({ root, label: item.key + '/' + topic + '/' + region,
      args: ['apply', source, action.paths[name], output], output, files: [source, action.paths[name]],
      failure: { code: 'training-clearance-obstructed', path: culprit,
        message: 'Clearance intrusion in ' + region + ' of ' + item.trainingClearance.roomId } });
  }
}

async function originFaults({ original, ordinary, folder, item, action, first }) {
  const stripped = await detach(original, path.join(folder, 'stripped'), 'historical-layout.json', doc => {
    delete doc.trainingBinding;
    // Keep a genuinely edited legacy revision so matching the company name is insufficient.
    doc.revision++;
  });
  const oldFiles = [original, stripped];
  const initialBytes = await snapshot(oldFiles);
  const room = item.trainingClearance.roomId;
  await expectReject({ root: ordinary, label: item.key + '/old orphan without source',
    args: ['validate', stripped], files: oldFiles, failure: { code: 'training-origin-required' } });
  const noSource = path.join(folder, 'orphan-edit');
  await expectReject({ root: work, label: item.key + '/old orphan does not infer source by company identity',
    args: ['apply', stripped, action.paths.bonsai, noSource], output: noSource, files: oldFiles,
    failure: { code: 'training-origin-required' } });
  await seal(item.key + '/cannot re-seal an orphan', work, path.join(folder, 'orphan-package'),
    [{ key: 'orphan', filename: stripped }], { code: 'training-origin-required' });
  assert.deepEqual(await snapshot(oldFiles), initialBytes);
  const other = Object.keys(specimens).find(key => key !== item.key);
  await expectReject({ root: work, label: item.key + '/mismatched original alias',
    args: ['validate', stripped, '--room', other], files: oldFiles, failure: { code: 'training-room-origin-mismatch' } });
  let migrationInput = stripped, migrationOps = action.paths.initial;
  if (legacy) {
    const previous = path.join(legacy, item.key, 'first-edit', 'save.json');
    const receipt = await readJson(path.join(legacy, 'report.json'));
    assert.equal(receipt.status, 'passed');
    const established = receipt.namedRooms.find(room => room.key === item.key).edited[0];
    assert.equal(sha(await fs.readFile(previous)), established.sha256);
    assert.equal((await readJson(previous)).document.trainingBinding, undefined);
    migrationInput = await detach(previous, path.join(folder, 'old-real-edit'), 'archived-alone.json');
    migrationOps = action.paths.next;
    await expectReject({ root: ordinary, label: item.key + '/historical edited save without source',
      args: ['validate', migrationInput], files: [previous, migrationInput], failure: { code: 'training-origin-required' } });
  }
  const newLegacy = await accepted({ root: work, label: item.key + '/explicit source restores old file',
    input: migrationInput, operations: migrationOps, target: path.join(folder, 'recovered-legacy'), item,
    flags: ['--room', item.key] });
  const recovered = await detach(newLegacy.savePath, path.join(folder, 'legacy-detached'), 'edited-and-renamed.json');
  await breaches(ordinary, recovered, 'legacy-migrated', folder, item, action);
  const bad = [
    ['source-pin', record => { record.source.sha256 = '0'.repeat(64); }],
    ['company', record => { record.companyId = 'mismatched-company'; }],
    ['room', record => { record.roomId = room.replace(/[^/]+$/, 'wrong-room'); }],
    ['rule', record => { record.trainingClearance.activity.maxX -= .5; }],
  ];
  for (const [label, damage] of bad) {
    const defective = await detach(first, path.join(folder, 'bad-' + label), 'portable.json', doc => damage(doc.trainingBinding));
    const output = path.join(folder, 'rejected-malformed-' + label);
    await expectReject({ root: ordinary, label: item.key + '/wrong ' + label,
      args: ['apply', defective, action.paths.bonsai, output], output, files: [first, defective],
      failure: { code: 'invalid-training-binding' } });
  }
  const conflict = await detach(first, path.join(folder, 'wrong-rule-with-valid-hash'), 'portable.json', doc => {
    const binding = doc.trainingBinding, declared = JSON.parse(binding.source.text);
    binding.trainingClearance.activity.maxX -= .5;
    declared.trainingClearance = binding.trainingClearance;
    binding.source.text = JSON.stringify(declared);
    binding.source.sha256 = sha(Buffer.from(binding.source.text));
  });
  await expectReject({ root: work, label: item.key + '/internally consistent but wrong rule conflicts with selected source',
    args: ['validate', conflict, '--room', item.key], files: [first, conflict],
    failure: { code: 'training-edit-mismatch' } });
  return { strippedOriginal: stripped, recovered: newLegacy.sha256, input: migrationInput };
}

async function ordinaryDefault(receiver, directory) {
  const source = path.join(receiver, 'data', 'save.json');
  const initial = await readJson(source);
  assert(!initial.document.nodes.some(node => node.purpose === 'training'));
  assert.equal(initial.document.trainingBinding, undefined);
  const room = initial.document.nodes.find(node => node.kind === 'room');
  const ops = path.join(directory, 'ordinary-rename.json');
  const name = '普通房间便携回归';
  await writeJson(ops, [{ type: 'set-room', id: room.id, name }]);
  const saved = await accepted({ root: receiver, label: 'ordinary current default still edits normally',
    input: source, operations: ops, target: path.join(directory, 'ordinary-edit') });
  initial.document.revision++;
  sameNode(initial.document, room.id).name = name;
  assert.deepEqual(saved.save.document, initial.document);
  const detached = await detach(saved.savePath, path.join(directory, 'ordinary-detached'), 'renamed-ordinary.json');
  await edit(receiver, 'ordinary detached input still validates', ['validate', detached]);
  return { id: initial.document.id, revision: initial.document.revision, sha256: saved.sha256 };
}

async function ordinaryClassroom(receiver) {
  const request = path.join(out, 'classroom-input.json');
  const built = path.join(out, 'classroom-batch');
  const id = 'portable-qa-classroom';
  await writeJson(request, { schema: 'company-batch', version: 1, items: [{ key: 'ordinary-classroom', input: {
    id, name: '普通课堂移交', scale: 'small-home', spaceProfile: { id: 'company-space-v2', version: 1 },
    floors: [{ id: 'ground', name: '一层', rooms: [{ id: 'classroom', name: '课堂', purpose: 'training' }] }],
  }, operations: [] }] });
  const batchEntry = path.join(work, 'source', 'scripts', 'company-platform', 'batch.mjs');
  const { stdout } = await stage(process.execPath, [batchEntry, request, built], { cwd: work, timeout: 120000 });
  report.operations.push({ label: 'ordinary classroom through the public batch tool', entry: batchEntry,
    args: [request, built], exit: 0, response: stdout.trim() });
  const savePath = path.join(built, 'ordinary-classroom', 'save.json');
  const save = await readJson(savePath);
  assert.equal(save.document.id, id);
  assert(save.document.nodes.some(node => node.purpose === 'training'));
  const binding = bindingOf(save.document, null, null);
  const detached = await detach(savePath, path.join(out, 'classroom-alone'), 'renamed-classroom.json');
  await edit(receiver, 'authored ordinary classroom does not inherit a dance clearance', ['validate', detached]);
  return { path: detached, sha256: sha(await fs.readFile(detached)), binding };
}

async function secondTrainingRoom(receiver, item, action, source, folder) {
  const { document } = await readJson(source);
  const other = document.nodes.find(node => node.kind === 'room' && node.purpose === 'work') ??
    document.nodes.find(node => node.kind === 'room' && node.purpose === 'rest');
  assert(other && other.id !== item.trainingClearance.roomId);
  const operations = path.join(folder, 'second-training-purpose.json');
  await writeJson(operations, [{ type: 'set-room', id: other.id, purpose: 'training' }]);
  const acceptedResult = await accepted({ root: receiver, label: item.key + '/second training room leaves the rule scoped',
    input: source, operations, target: path.join(folder, 'extra-training-room'), item });
  assert.equal(sameNode(acceptedResult.save.document, other.id).purpose, 'training');
  await breaches(receiver, acceptedResult.savePath, 'different-classroom', folder, item, action);
  return { additionalRoom: other.id, ruleRoom: item.trainingClearance.roomId, sha256: acceptedResult.sha256 };
}

async function run() {
  assert.notEqual(sealed, work, 'Keep the sealed input and working copy separate');
  await fs.mkdir(out);
  madeOutput = true;
  const mainManifest = path.join(sealed, 'transfer-manifest.json');
  const workingManifest = path.join(work, 'transfer-manifest.json');
  manifest = await readJson(mainManifest);
  assert.equal(manifest.schema, 'company-transfer');
  assert((await fs.readFile(mainManifest)).equals(await fs.readFile(workingManifest)));
  report.buildId = manifest.buildId;
  report.originalManifestSha256 = await verify(sealed, 'verify original sealed delivery');
  const needed = ['edit.mjs', 'source/scripts/company-platform/package-company.mjs', 'data/save.json',
    ...Object.keys(specimens).map(key => 'data/rooms/' + key + '/save.json')];
  const immutable = [...needed.flatMap(file => [path.join(sealed, file), path.join(work, file)]), mainManifest, workingManifest];
  const baseline = await snapshot(immutable);
  for (const file of needed) {
    const pin = manifest.files.find(entry => entry.path === file);
    assert.equal(baseline[path.join(sealed, file)], pin.sha256);
    assert.equal(baseline[path.join(work, file)], pin.sha256);
  }
  const ordinary = path.join(out, 'ordinary-receiver');
  await seal('prepare a receiver with no training aliases', work, ordinary);
  await prepareReceiver(ordinary);
  report.ordinary = await ordinaryDefault(ordinary, out);
  report.ordinaryClassroom = await ordinaryClassroom(ordinary);
  const queue = [];
  for (const item of batch.items) {
    if (!specimens[item.key]) continue;
    const folder = path.join(out, item.key);
    await fs.mkdir(folder);
    const action = await operations(item, folder);
    const original = saveFor(work, item.key);
    const first = await accepted({ root: work, label: item.key + '/first legitimate edit', input: original,
      operations: action.paths.initial, target: path.join(folder, 'generation-1'), item });
    const fixture = sameNode(first.save.document, action.id);
    assert.equal(fixture.resource.id, specimens[item.key].replacement);
    assert.deepEqual(fixture.transform.position, specimens[item.key].move);
    const filename = await detach(first.savePath, path.join(folder, 'alone-before-reseal'), 'new-name-' + item.key + '.json');
    await breaches(ordinary, filename, 'standalone-before-reseal', folder, item, action);
    const migration = await originFaults({ original, ordinary, folder, item, action, first: filename });
    queue.push({ item, action, folder, first, filename, migration });
  }
  assert.equal(queue.length, 2);
  const derivative = path.join(out, 'renamed-reseal');
  await seal('re-seal both renamed single-file saves using the independent receiver', ordinary, derivative,
    [...queue.map(row => ({ key: specimens[row.item.key].alias, filename: row.filename })),
      { key: 'ordinary-classroom', filename: report.ordinaryClassroom.path }]);
  await prepareReceiver(derivative);
  const classroomPacked = saveFor(derivative, 'ordinary-classroom');
  await edit(derivative, 're-sealed ordinary classroom still validates', ['validate', classroomPacked]);
  assert.deepEqual((await readJson(classroomPacked)).document.trainingBinding, report.ordinaryClassroom.binding);
  for (const { item, folder, action, first, migration } of queue) {
    const alias = specimens[item.key].alias;
    const roomFile = saveFor(derivative, alias);
    const sealedRoom = await readJson(roomFile);
    assert.deepEqual(sealedRoom.document, first.save.document, 'Re-sealing changed the standalone saved document');
    await breaches(derivative, roomFile, 're-sealed', folder, item, action);
    const second = await accepted({ root: derivative, label: item.key + '/second legitimate edit', input: roomFile,
      operations: action.paths.next, target: path.join(folder, 'generation-2'), item });
    assert.deepEqual(sameNode(second.save.document, action.id).transform.position, specimens[item.key].next);
    const detached = await detach(second.savePath, path.join(folder, 'alone-generation-2'), 'only-file-edited-again.json');
    const third = await accepted({ root: ordinary, label: item.key + '/third legitimate edit from a detached save',
      input: detached, operations: action.paths.continue, target: path.join(folder, 'generation-3'), item });
    assert.equal(sameNode(third.save.document, action.id).state.visible, false);
    const last = await detach(third.savePath, path.join(folder, 'alone-generation-3'), 'edited-three-times.json');
    await breaches(ordinary, last, 'standalone-generation-3', folder, item, action);
    const roomScope = await secondTrainingRoom(ordinary, item, action, last, folder);
    report.rooms.push({ key: item.key, alias, roomScope, bonsai: action.replay, migration, binding: first.save.document.trainingBinding,
      generations: [first, second, third].map(({ save, sha256 }) => ({ revision: save.document.revision, sha256 })) });
  }
  assert.deepEqual(await snapshot(immutable), baseline, 'A supplied source package or working input was modified');
  report.status = 'passed';
}

try {
  await run();
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (report.status === 'passed') {
      for (const { root, directory } of injectedDependencies) {
        assert.equal(await fs.realpath(directory), sourceDeps(root));
        assert.equal(path.dirname(root), out);
        await fs.rm(directory, { recursive: true });
        await verify(root, 'post-test sealed package verification');
      }
    }
  } catch (error) {
    report.status = 'failed';
    report.error = { message: error.message, stack: error.stack };
    console.error(error);
    process.exitCode = 1;
  }
  if (madeOutput) await writeJson(path.join(out, 'report.json'), report);
}
