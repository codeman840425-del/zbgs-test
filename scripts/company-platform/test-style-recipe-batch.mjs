import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import catalog from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type: 'json'};
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createAuthoringRunDirectory,runCompanyBatch} from './batch.mjs';
import {checkManagedOutput} from './package-company.mjs';

const readFixture = async filename => JSON.parse(await fs.readFile(new URL(filename, import.meta.url), 'utf8'));
const [compact, studio, warm, cool] = await Promise.all([
  readFixture('./space-v2-inputs/small-home.json'),
  readFixture('./space-v2-inputs/studio.json'),
  readFixture('./style-recipes/warm-live.json'),
  readFixture('./style-recipes/cool-work.json'),
]);
const configuredOutput = process.argv[2];
const outputDirectory = configuredOutput ? path.resolve(configuredOutput) : await createAuthoringRunDirectory('style-batch');
if (configuredOutput) {
  await checkManagedOutput(outputDirectory,undefined,{allowDelivery:false});
  await fs.mkdir(outputDirectory);
}

const batch = {schema: 'company-batch', version: 1, items: []};
for (const [layoutKey, input] of [['compact', compact], ['studio', studio]]) {
  for (const [styleKey, styleRecipe] of [['warm', warm], ['cool', cool]]) {
    const key = `${layoutKey}-${styleKey}`;
    batch.items.push({key, input: {...input, id: `style-batch-${key}`}, styleRecipe: structuredClone(styleRecipe)});
  }
}
batch.items.push({key: 'plain', input: {...compact, id: 'style-batch-plain'}});

const [compacted] = batch.items;
const roomId = `${compacted.input.id}/ground/live`;
const editedMonitor = `${roomId}/station-1/monitor`;
const localFloor = {resource: {id: 'floor-terrazzo', version: 1}};
compacted.operations = [
  {type: 'set-surface-finish', id: roomId, surface: 'floor', finish: localFloor},
  {type: 'replace-resource', id: editedMonitor, resource: {id: 'monitor-pillar', version: 1}},
  {type: 'set-state', id: editedMonitor, state: {on: false}},
];

const read = (key, name) => fs.readFile(path.join(outputDirectory, key, name), 'utf8');
const publish = (input, only) => runCompanyBatch(input, {outputDirectory, only});
const sha256 = input => createHash('sha256').update(input).digest('hex');
const outputFiles = ['input.json', 'layout.json', 'save.json', 'report.json'];
const snapshot = async keys => Object.fromEntries(await Promise.all(keys.map(async key =>
  [key, await Promise.all(outputFiles.map(async name => sha256(await read(key, name))))])));

const partialInput = structuredClone(batch);
const retryKey = 'studio-cool';
partialInput.items.find(item => item.key === retryKey).styleRecipe.facilities.default.monitor.version = 99;
const inputBefore = JSON.stringify(partialInput);
const first = await publish(partialInput);
assert.equal(JSON.stringify(partialInput), inputBefore);
assert.equal(first.ok, false);
assert.deepEqual(first.results.map(item => item.status), ['created', 'created', 'created', 'failed', 'created'], JSON.stringify(first.results));
assert.equal(first.results.find(item => item.key === retryKey).code, 'invalid-style-recipe');
await assert.rejects(fs.access(path.join(outputDirectory, retryKey)), {code: 'ENOENT'});

const existingKeys = first.results.filter(item => item.status === 'created').map(item => item.key);
const originalFiles = await snapshot(existingKeys);
const retry = await publish(batch, retryKey);
assert.deepEqual(retry.results.map(item => [item.key, item.status]), [[retryKey, 'created']]);
assert.deepEqual(await snapshot(existingKeys), originalFiles);
const repeated = await publish(batch);
assert.deepEqual(repeated.results.map(item => item.status), Array(batch.items.length).fill('idempotent'));

const layouts = new Map();
for (const item of batch.items) {
  const [layout, report, savedInput] = await Promise.all(['layout.json', 'report.json', 'input.json'].map(async name => JSON.parse(await read(item.key, name))));
  assert.equal(layout.id, item.input.id);
  assert.deepEqual(await decodeCompanySave(await read(item.key, 'save.json'), catalog, templates), layout);
  assert.equal(report.files['input.json'].sha256, sha256(await read(item.key, 'input.json')));
  layouts.set(item.key, layout);
  if (!item.styleRecipe) {
    assert(!Object.hasOwn(report, 'styleRecipe'));
    assert(!Object.hasOwn(report.sourceHashes, 'scripts/company-platform/apply-style-recipe.mjs'));
    continue;
  }
  const {id, version, name} = item.styleRecipe;
  assert.deepEqual(savedInput.styleRecipe, item.styleRecipe);
  assert.deepEqual({id: report.styleRecipe.id, version: report.styleRecipe.version, name: report.styleRecipe.name}, {id, version, name});
  assert.equal(report.styleRecipe.sha256, sha256(JSON.stringify(savedInput.styleRecipe, null, 2) + '\n'));
  assert(report.styleRecipe.operations > 0);
  for (const source of ['scripts/company-platform/apply-style-recipe.mjs', 'prototype/src/company/appearance-samples.js']) {
    assert.equal(report.sourceHashes[source], sha256(await fs.readFile(new URL(`../../${source}`, import.meta.url))));
  }
}

const mainRoom = key => layouts.get(key).nodes.find(node => node.kind === 'room');
const reference = (key, partKey) => layouts.get(key).nodes.find(node => node.partKey === partKey).resource.id;
assert.deepEqual(mainRoom('compact-warm').finishes.floor, localFloor);
assert.equal(mainRoom('compact-warm').finishes.north.resource.id, 'wall-fine-stripes');
assert.equal(mainRoom('studio-warm').finishes.floor.resource.id, 'floor-offset-plank');
assert.equal(mainRoom('compact-cool').finishes.floor.resource.id, 'floor-checker-tile');
assert.equal(mainRoom('studio-cool').finishes.floor.resource.id, 'floor-checker-tile');
assert.equal(reference('compact-warm', 'monitor'), 'monitor-pillar');
assert.equal(reference('studio-warm', 'monitor'), 'monitor-aurora');
assert.equal(reference('compact-cool', 'monitor'), 'monitor-slate');
assert.equal(reference('studio-cool', 'monitor'), 'monitor-slate');
assert.equal(reference('compact-warm', 'chair'), 'chair-cantilever');
assert.equal(reference('plain', 'monitor'), 'monitor');
assert.equal(mainRoom('plain').finishes, undefined);
assert.equal(layouts.get('compact-warm').nodes.find(node => node.id === editedMonitor).state.on, false);
assert.notDeepEqual(mainRoom('compact-warm').bounds, mainRoom('studio-warm').bounds);

const changedRecipe = structuredClone(batch);
changedRecipe.items[0].styleRecipe = {...changedRecipe.items[0].styleRecipe, name: '另一配方说明'};
const changed = await publish(changedRecipe, compacted.key);
assert.equal(changed.results[0].code, 'output-conflict');
assert.deepEqual(await snapshot(existingKeys), originalFiles);
assert.deepEqual((await fs.readdir(outputDirectory)).sort(), batch.items.map(item => item.key).sort());

console.log(JSON.stringify({status: 'passed', outputDirectory, styledItems: 4, unstyledItems: 1, retryKey, preservedOnConflict: true}, null, 2));
