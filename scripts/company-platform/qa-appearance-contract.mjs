import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import library from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type: 'json'};
import studio from '../../prototype/src/company/examples/c1-studio.json' with {type: 'json'};
import baseline from '../../prototype/src/company/examples/c1-two-stations.json' with {type: 'json'};
import {describeFacilityFunction, compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {deriveCompany, prepareCompanyChange, CompanyError} from '../../prototype/src/company/document.js';
import {prepareTemplateUpgrade} from '../../prototype/src/company/upgrade.js';
import {encodeCompanySave, decodeCompanySave, createCompanySaveStore} from '../../prototype/src/company/persistence.js';

const root = new URL('../../', import.meta.url);
const inputs = ['prototype/src/company/appearance-contract.js', 'prototype/src/company/document.js', 'prototype/src/company/upgrade.js',
  'prototype/src/company/library-catalog.json', 'prototype/src/company/templates-extended.json', 'prototype/src/company/persistence.js',
  'prototype/src/company/examples/c1-studio.json', 'prototype/public/company-assets/lounge-sofa/v1/resource.json',
  'prototype/public/company-assets/timber-sofa/v1/resource.json', 'prototype/public/company-assets/lounge-sofa/v1/model.glb',
  'prototype/public/company-assets/timber-sofa/v1/model.glb', 'docs/COMPANY-APPEARANCE-PRODUCTION-STANDARD.md', 'scripts/company-platform/qa-appearance-contract.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(inputs.map(async path => [path, hash(await fs.readFile(new URL(path, root)))])));
const inputHashes = await hashes();
const timber = JSON.parse(await fs.readFile(new URL(inputs[8], root), 'utf8'));
const catalog = structuredClone(library);
if (!catalog.resources.some(r => r.id === timber.id && r.version === timber.version)) catalog.resources.push(timber);
const resource = (id, version = 1) => catalog.resources.find(r => r.id === id && r.version === version);
const context = {catalog, templates};
const checks = [];
async function check(name, run) {
  try { checks.push({name, status: 'passed', observed: await run()}); }
  catch (error) { checks.push({name, status: 'failed', error: error.stack}); }
}
function change(document, operations, ctx = context) {
  const before = JSON.stringify({document, catalog: ctx.catalog, templates: ctx.templates});
  try { return prepareCompanyChange(document, operations, ctx); }
  finally { assert.equal(JSON.stringify({document, catalog: ctx.catalog, templates: ctx.templates}), before); }
}
function variant(id, mutate) {
  const copy = structuredClone(resource(id));
  copy.id = `qa-${id}-variant`;
  mutate(copy);
  const selected = structuredClone(catalog);
  selected.resources.push(copy);
  return {definition: copy, ctx: {catalog: selected, templates}, ref: {id: copy.id, version: copy.version}};
}
function rejectReplacement(document, id, ref, ctx, expectedField) {
  let failure;
  assert.throws(() => change(document, [{type: 'replace-resource', id, resource: ref}], ctx), error => {
    assert(error instanceof CompanyError);
    assert.equal(error.code, 'incompatible-replacement');
    assert(error.details.differences.some(diff => diff.field === expectedField), error.message);
    failure = {code: error.code, path: error.path, differences: error.details.differences};
    return true;
  });
  return failure;
}
async function geometry(path) {
  const bytes = await fs.readFile(new URL(path, root));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const positions = (json.meshes || []).flatMap(mesh => mesh.primitives.map(p => json.accessors[p.attributes.POSITION].count));
  return {sha256: hash(bytes), meshes: json.meshes.length, positionCounts: positions, vertices: positions.reduce((a, b) => a + b, 0)};
}

await check('real timber geometry differs while its complete fixed sofa function matches', async () => {
  const original = resource('lounge-sofa');
  assert.deepEqual(compareFacilityFunction(original, timber), {compatible: true, differences: []});
  const oldGeometry = await geometry(inputs[9]), newGeometry = await geometry(inputs[10]);
  assert.equal(oldGeometry.sha256, original.asset.sha256);
  assert.equal(newGeometry.sha256, timber.asset.sha256);
  assert.notDeepEqual(oldGeometry.positionCounts, newGeometry.positionCounts);
  const result = change(studio, [{type: 'replace-resource', id: 'lounge/sofa', resource: {id: timber.id, version: timber.version}}]);
  const previous = deriveCompany(studio, catalog, templates), next = result.derived;
  assert.deepEqual(next.worlds.get('lounge/sofa'), previous.worlds.get('lounge/sofa'));
  assert.deepEqual(next.usePoints.map(p => ({id: p.id, world: p.world})), previous.usePoints.map(p => ({id: p.id, world: p.world})));
  for (const field of ['id', 'parentId', 'transform', 'state']) assert.deepEqual(next.nodes.get('lounge/sofa')[field], previous.nodes.get('lounge/sofa')[field]);
  return {oldGeometry, newGeometry, function: describeFacilityFunction(original)};
});

await check('legacy sofa2 still loads while new sofa1-to-sofa2 replacement rejects its changed blocking footprint', async () => {
  const values = new Map(), store = createCompanySaveStore({...context, storage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}});
  await store.save(studio);
  const saved = store.export(studio.id);
  const failure = rejectReplacement(studio, 'lounge/sofa', {id: 'lounge-sofa', version: 2}, context, 'footprint.halfSize[0]');
  assert.equal(store.export(studio.id), saved);
  const oldLayout = structuredClone(studio);
  oldLayout.nodes.find(n => n.id === 'lounge/sofa').resource.version = 2;
  const oldSave = await encodeCompanySave(oldLayout, catalog, templates);
  assert.deepEqual(await decodeCompanySave(oldSave, catalog, templates), oldLayout);
  assert.equal(await encodeCompanySave(studio, catalog, templates), saved);
  return {failure, previousSaveSha256: hash(saved), legacy2SaveSha256: hash(oldSave)};
});

await check('every actual seat function coordinate, capacity, orientation, approach, exit and clearance participates', () => {
  const observations = [];
  for (const [expected, mutate] of [
    ['usePoints[0].id', r => {r.usePoints[0].id = 'different-seat';}],
    ['usePoints[0].position[0]', r => {r.usePoints[0].position[0] += .01;}],
    ['usePoints[0].capacity', r => {r.usePoints[0].capacity = 2;}],
    ['usePoints[0].yaw', r => {r.usePoints[0].yaw = Math.PI / 2;}],
    ['usePoints[0].seatHeight', r => {r.usePoints[0].seatHeight += .01;}],
    ['usePoints[0].approach[2]', r => {r.usePoints[0].approach[2] += .01;}],
    ['usePoints[0].exit[2]', r => {r.usePoints[0].exit[2] += .01;}],
    ['usePoints[0].clearance.width', r => {r.usePoints[0].clearance.width += .01;}],
  ]) {
    const changed = variant('chair', mutate);
    observations.push(rejectReplacement(baseline, 'station-1/chair', changed.ref, changed.ctx, expected));
  }
  return observations;
});

await check('mount, actual surface, blocking footprint and state schema changes are rejected', () => {
  const observations = [];
  for (const [id, node, field, mutate] of [
    ['monitor', 'station-1/monitor', 'mount', r => {r.mount = 'wall';}],
    ['desk', 'station-1/desk', 'surface.topY', r => {r.surface.topY += .01;}],
    ['desk', 'station-1/desk', 'footprint.center[0]', r => {r.footprint.center[0] += .01;}],
    ['monitor', 'station-1/monitor', 'state.fields.on', r => {r.stateDefaults.on = 'on';}],
  ]) {
    const changed = variant(id, mutate);
    observations.push(rejectReplacement(baseline, node, changed.ref, changed.ctx, field));
  }
  return observations;
});

await check('display mesh mappings and descriptive limits can vary, numeric function limits and live point identity remain fixed', () => {
  const before = JSON.stringify(resource('chair'));
  const skin = structuredClone(resource('chair'));
  skin.usePoints[0].seatNodeId = 'adapted-seat';
  skin.usePoints[0].backNodeId = 'adapted-back';
  skin.usePoints[0].limits = ['A revised descriptive note'];
  skin.light = {kind: 'point', position: [1, 2, 3]};
  assert.equal(compareFacilityFunction(resource('chair'), skin).compatible, true);
  skin.usePoints[0].limits = {maximumWeight: 120};
  assert.equal(compareFacilityFunction(resource('chair'), skin).compatible, false);
  const busy = {...context, isUsePointBusy: id => id === 'lounge/sofa#left'};
  assert.throws(() => change(studio, [{type: 'replace-resource', id: 'lounge/sofa', resource: {id: timber.id, version: timber.version}}], busy), e => e.code === 'facility-busy');
  assert.equal(JSON.stringify(resource('chair')), before);
  const detached = describeFacilityFunction(resource('chair'));
  detached.usePoints[0].position[0] = 500;
  assert.equal(resource('chair').usePoints[0].position[0], 0);
  return {meshMapCheck: 'pure metadata comparison only; actual surfaces are an import check', numericLimitsRejected: true, busyRejected: true};
});

await check('appearance replacement keeps original effective booleans and intensity instead of adopting replacement defaults', () => {
  const changed = variant('fill-light', r => {
    r.stateDefaults = {on: false, intensity: 9};
    r.light.position = [1, 2, 3];
    r.light.color = '#ffccaa';
  });
  assert.equal(compareFacilityFunction(resource('fill-light'), changed.definition).compatible, true);
  const implicit = change(baseline, [{type: 'replace-resource', id: 'station-1/fill-light', resource: changed.ref}], changed.ctx);
  assert.deepEqual(implicit.derived.facilities.find(f => f.id === 'station-1/fill-light').state, {on: true, intensity: 5});
  const explicit = change(baseline, [{type: 'set-state', id: 'station-1/fill-light', state: {on: false, intensity: 3}}]).document;
  const replaced = change(explicit, [{type: 'replace-resource', id: 'station-1/fill-light', resource: changed.ref}], changed.ctx);
  assert.deepEqual(replaced.derived.facilities.find(f => f.id === 'station-1/fill-light').state, {on: false, intensity: 3});
  return {implicitState: implicit.derived.nodes.get('station-1/fill-light').state, explicitState: replaced.derived.nodes.get('station-1/fill-light').state};
});

await check('a decorative resource without blocking or use function can change its visual identity', () => {
  const decoration = structuredClone(resource('plant'));
  decoration.id = 'qa-decoration';
  delete decoration.footprint;
  const alternative = structuredClone(decoration);
  alternative.id = 'qa-other-decoration';
  alternative.mountRole = 'visual-statue';
  alternative.node.children[0].material.color = '#234567';
  assert.equal(compareFacilityFunction(decoration, alternative).compatible, true);
  const selected = structuredClone(catalog);
  selected.resources.push(decoration, alternative);
  const ctx = {catalog: selected, templates};
  const source = change(baseline, [{type: 'add-facility', id: 'visual-only', parentId: 'company-demo/room-1', resource: {id: decoration.id, version: 1}, transform: {position: [0, 0, 0], yaw: 0}}], ctx).document;
  const replaced = change(source, [{type: 'replace-resource', id: 'visual-only', resource: {id: alternative.id, version: 1}}], ctx);
  assert.equal(replaced.derived.nodes.get('visual-only').resource.id, alternative.id);
  return {scope: 'in-memory static decor metadata with existing procedural geometry', original: decoration.id, replacement: alternative.id};
});

await check('explicit upgrades use the fixed function contract and refuse target defaults that would reset old state', () => {
  const baselineBefore = JSON.stringify(baseline);
  const regular = prepareTemplateUpgrade(baseline, 'station-1', {id: 'stream-station', version: 2}, context);
  const before = deriveCompany(baseline, catalog, templates), after = deriveCompany(regular.document, catalog, templates);
  assert.deepEqual(after.facilities.map(f => ({id: f.id, state: f.state})), before.facilities.map(f => ({id: f.id, state: f.state})));
  const changed = variant('monitor', r => {r.stateDefaults.on = false;});
  const collection = structuredClone(templates);
  const destination = structuredClone(collection.templates.find(t => t.id === 'stream-station' && t.version === 2));
  destination.version = 100;
  destination.parts.find(p => p.key === 'monitor').resource = changed.ref;
  collection.templates.push(destination);
  const ctx = {...changed.ctx, templates: collection}, ref = {id: destination.id, version: destination.version};
  const failures = [];
  assert.throws(() => prepareTemplateUpgrade(baseline, 'station-1', ref, ctx), e => {
    assert.equal(e.code, 'template-upgrade-conflict');
    assert.equal(e.path, 'station-1.parts.monitor.state.on');
    failures.push({code: e.code, path: e.path}); return true;
  });
  const captured = change(baseline, [{type: 'set-state', id: 'station-1/monitor', state: {on: true}}]).document;
  const migrated = prepareTemplateUpgrade(captured, 'station-1', ref, ctx);
  assert.equal(deriveCompany(migrated.document, ctx.catalog, ctx.templates).facilities.find(f => f.id === 'station-1/monitor').state.on, true);
  const partStateTarget = structuredClone(destination);
  partStateTarget.version = 101;
  partStateTarget.parts.find(p => p.key === 'monitor').resource = {id: 'monitor', version: 1};
  partStateTarget.parts.find(p => p.key === 'monitor').state = {on: false};
  collection.templates.push(partStateTarget);
  assert.throws(() => prepareTemplateUpgrade(baseline, 'station-1', {id: destination.id, version: 101}, ctx), e => e.path === 'station-1.parts.monitor.state.on');
  assert.equal(JSON.stringify(baseline), baselineBefore);
  return {failures, capturedStateSurvives: true, targetPartStateResetRejected: true};
});

const inputHashesUnchangedAtEnd = JSON.stringify(await hashes()) === JSON.stringify(inputHashes);
const status = inputHashesUnchangedAtEnd && checks.every(c => c.status === 'passed') ? 'cpu-fixed-function-appearance-passed' : 'failed';
const output = new URL('../../evidence/company-appearance-contract-v1/', import.meta.url);
await fs.mkdir(output, {recursive: true});
await fs.writeFile(new URL('report.json', output), JSON.stringify({status, generatedAt: new Date().toISOString(), inputHashes, inputHashesUnchangedAtEnd, checks,
  profiles: Object.fromEntries(['chair', 'lounge-sofa', 'desk'].map(id => [`${id}@1`, describeFacilityFunction(resource(id))])),
  requestedDispatch: {difficulty: 'complex', model: 'gpt-6.1-sol', reasoningEffort: 'high'}, verifiedRuntimeModelAndEffort: false, verifiedHostHookInterception: false,
  limits: ['CPU comparison, GLB geometry counts and document transactions only. No new GPU/browser/contact verification.', 'Real timber source import/contact evidence belongs to its production package; this check consumes its fixed resource and GLB bytes.', 'Existing sofa2 layouts retain their old meaning. The former sofa1-to-sofa2 replacement result is historical evidence under the earlier contract.']}, null, 2) + '\n');
console.log(JSON.stringify({status, checks: checks.map(({name, status}) => ({name, status}))}, null, 2));
if (status !== 'cpu-fixed-function-appearance-passed') process.exitCode = 1;
