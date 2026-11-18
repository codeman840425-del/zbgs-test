import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import baseTemplates from '../../prototype/src/company/templates.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type: 'json'};
import baseline from '../../prototype/src/company/examples/c1-two-stations.json' with {type: 'json'};
import {createCompany, prepareCompanyChange, deriveCompany, CompanyError} from '../../prototype/src/company/document.js';
import {prepareTemplateUpgrade} from '../../prototype/src/company/upgrade.js';
import {encodeCompanySave, decodeCompanySave} from '../../prototype/src/company/persistence.js';

const root = new URL('../../', import.meta.url);
const inputPaths = ['prototype/src/company/upgrade.js', 'prototype/src/company/templates.json', 'prototype/src/company/templates-extended.json', 'prototype/src/company/library-catalog.json', 'prototype/src/company/document.js', 'prototype/src/company/placement.js', 'prototype/src/company/persistence.js', 'prototype/src/company/examples/c1-two-stations.json', 'scripts/company-platform/qa-upgrade.mjs'];
const hashInputs = async () => Object.fromEntries(await Promise.all(inputPaths.map(async path => [path, createHash('sha256').update(await fs.readFile(new URL(path, root))).digest('hex')])));
const inputHashes = await hashInputs();
const sha = value => createHash('sha256').update(value).digest('hex');
const context = {catalog, templates}, target = {id: 'stream-station', version: 2};
const part = (document, key, station = 'station-1') => document.nodes.find(n => n.stationId === station && n.partKey === key);
const changes = (document, operations, ctx = context) => prepareCompanyChange(document, operations, ctx).document;
const checks = [];
let portableResult;
async function check(name, run) {
  try { checks.push({name, status: 'passed', observed: await run()}); }
  catch (error) { checks.push({name, status: 'failed', error: error.stack}); }
}
function upgrade(document, ref = target, ctx = context, stationId = 'station-1') {
  const original = JSON.stringify({document, catalog: ctx.catalog, templates: ctx.templates});
  try { return prepareTemplateUpgrade(document, stationId, ref, ctx); }
  finally { assert.equal(JSON.stringify({document, catalog: ctx.catalog, templates: ctx.templates}), original, 'Upgrade mutated an input'); }
}
function rejected(document, ref, ctx, pathSuffix, cause) {
  let failure;
  assert.throws(() => upgrade(document, ref, ctx), error => {
    assert(error instanceof CompanyError);
    assert.equal(error.code, 'template-upgrade-conflict');
    assert(error.path.endsWith(pathSuffix), error.path);
    if (cause) assert.equal(error.details.cause?.code, cause);
    failure = {code: error.code, path: error.path, message: error.message, details: error.details};
    return true;
  });
  return failure;
}
function alteredTarget(modify, useCatalog = catalog) {
  const collection = structuredClone(templates);
  const candidate = structuredClone(collection.templates.find(t => t.id === target.id && t.version === target.version));
  candidate.version = 99;
  modify(candidate);
  collection.templates.push(candidate);
  return {ref: {id: candidate.id, version: candidate.version}, ctx: {catalog: useCatalog, templates: collection}};
}
function solo() {
  return changes(createCompany({width: 12, depth: 12}, catalog), [{type: 'add-workstation', id: 'solo', parentId: 'company-demo/room-1',
    template: {id: 'stream-station', version: 1}, transform: {position: [-2, 0, 0], yaw: 0}}]);
}

await check('new exact template version preserves every existing entry and old save defaults', async () => {
  assert.deepEqual(templates.templates.slice(0, baseTemplates.templates.length), baseTemplates.templates);
  const versions = templates.templates.filter(item => item.id === target.id && item.version === target.version);
  assert.equal(versions.length, 1);
  const raw = await fs.readFile(new URL(inputPaths[1], root), 'utf8');
  const extendedRaw = await fs.readFile(new URL(inputPaths[2], root), 'utf8');
  const closing = raw.match(/\r?\n  \]\r?\n\}\s*$/);
  assert(extendedRaw.startsWith(raw.slice(0, closing.index)));
  const comparison = structuredClone(versions[0]);
  comparison.version = 1;
  comparison.parts.find(p => p.key === 'desk').transform.position[2] = -.9;
  assert.deepEqual(comparison, baseTemplates.templates.find(t => t.id === target.id && t.version === 1));
  const oldSave = await encodeCompanySave(baseline, catalog, baseTemplates);
  assert.deepEqual(await decodeCompanySave(oldSave, catalog, templates), baseline);
  assert.equal(part(baseline, 'desk').transform.position[2], -.9);
  assert.equal(baseline.nodes.find(n => n.id === 'station-1').template.version, 1);
  return {oldSaveSha256: sha(oldSave), oldEntryBytePrefixRetained: true, targetDefaultDeskZ: -1.05};
});

await check('explicit default migration updates only one station and round-trips the new pinned save', async () => {
  const result = upgrade(baseline);
  assert.equal(result.document.revision, baseline.revision + 1);
  assert.equal(part(result.document, 'desk').transform.position[2], -1.05);
  assert.equal(part(result.document, 'desk', 'station-2').transform.position[2], -.9);
  for (const node of baseline.nodes.filter(n => n.stationId === 'station-1')) assert.equal(part(result.document, node.partKey).id, node.id);
  assert.equal(result.retainedOverrides.length, 0);
  const save = await encodeCompanySave(result.document, catalog, templates);
  assert.deepEqual(await decodeCompanySave(save, catalog, templates), result.document);
  portableResult = result.document;
  return {saveSha256: sha(save), changes: result.changes};
});

await check('opaque facility IDs and compatible transform, explicit state and real material-slot overrides survive', async () => {
  let edited = structuredClone(baseline);
  const oldId = part(edited, 'desk').id;
  part(edited, 'desk').id = 'opaque-desk-identity-42';
  for (const node of edited.nodes) if (node.parentId === oldId) node.parentId = 'opaque-desk-identity-42';
  edited = changes(edited, [
    {type: 'move', id: 'opaque-desk-identity-42', transform: {position: [.05, 0, -.97], yaw: 0}},
    {type: 'set-state', id: part(edited, 'monitor').id, state: {on: false}},
    {type: 'set-state', id: part(edited, 'fill-light').id, state: {on: true, intensity: 2}},
    {type: 'set-appearance', id: part(edited, 'chair').id, appearance: {materials: {'chair-seat': {color: '#764b94', roughness: .65}}}},
  ]);
  const result = upgrade(edited);
  for (const key of ['desk', 'monitor', 'keyboard', 'microphone', 'chair', 'fill-light']) {
    assert.equal(part(result.document, key).id, part(edited, key).id);
    assert.deepEqual(part(result.document, key).state, part(edited, key).state);
    assert.deepEqual(part(result.document, key).appearance, part(edited, key).appearance);
  }
  assert.deepEqual(part(result.document, 'desk').transform, part(edited, 'desk').transform);
  assert.equal(part(result.document, 'monitor').parentId, 'opaque-desk-identity-42');
  assert(result.retainedOverrides.some(o => o.instanceId === 'opaque-desk-identity-42' && o.field === 'transform'));
  assert(result.retainedOverrides.some(o => o.field === 'state.on' && o.value === true));
  const save = await encodeCompanySave(result.document, catalog, templates);
  assert.deepEqual(await decodeCompanySave(save, catalog, templates), result.document);
  return {retainedOverrides: result.retainedOverrides, declaredChairSlot: catalog.resources.find(r => r.id === 'chair').materialSlots['chair-seat']};
});

await check('real sofa asset resource override and fabric appearance remain compatible across a template migration', () => {
  const collection = structuredClone(templates);
  const source = structuredClone(baseTemplates.templates[0]);
  source.id = 'station-with-sofa';
  source.parts.push({key: 'sofa', parentKey: null, requiredRole: 'sofa', resource: {id: 'lounge-sofa', version: 1}, transform: {position: [3.5, 0, 0], yaw: 0}});
  const destination = structuredClone(source);
  destination.version = 2;
  destination.parts.find(p => p.key === 'desk').transform.position[2] = -1.05;
  collection.templates.push(source, destination);
  const ctx = {catalog, templates: collection};
  let document = changes(createCompany({width: 14, depth: 12}, catalog), [{type: 'add-workstation', id: 'station-1', parentId: 'company-demo/room-1', template: {id: source.id, version: 1}, transform: {position: [-2, 0, 0], yaw: 0}}], ctx);
  document = changes(document, [
    {type: 'replace-resource', id: part(document, 'sofa').id, resource: {id: 'timber-sofa', version: 1}},
    {type: 'set-appearance', id: part(document, 'sofa').id, appearance: {materials: {fabric: {color: '#456789', roughness: .8}}}},
  ], ctx);
  const result = upgrade(document, {id: source.id, version: 2}, ctx);
  assert.deepEqual(part(result.document, 'sofa').resource, {id: 'timber-sofa', version: 1});
  assert.deepEqual(part(result.document, 'sofa').appearance, part(document, 'sofa').appearance);
  assert(result.retainedOverrides.some(o => o.partKey === 'sofa' && o.field === 'resource'));
  return {resource: part(result.document, 'sofa').resource, fabricSlotNodes: catalog.resources.find(r => r.id === 'timber-sofa' && r.version === 1).materialSlots.fabric};
});

await check('removed default parts can be deleted while local transforms, state, appearance and custom children refuse deletion', () => {
  const removeLight = alteredTarget(t => {t.parts = t.parts.filter(p => p.key !== 'fill-light');});
  const clean = upgrade(baseline, removeLight.ref, removeLight.ctx);
  assert.equal(part(clean.document, 'fill-light'), undefined);
  const state = changes(baseline, [{type: 'set-state', id: part(baseline, 'fill-light').id, state: {on: true}}]);
  const observations = [rejected(state, removeLight.ref, removeLight.ctx, '.fill-light.state.on')];
  const moved = changes(baseline, [{type: 'move', id: part(baseline, 'fill-light').id, transform: {position: [-.8, 0, -.15], yaw: 0}}]);
  observations.push(rejected(moved, removeLight.ref, removeLight.ctx, '.fill-light.transform'));
  const removeChair = alteredTarget(t => {t.parts = t.parts.filter(p => p.key !== 'chair');});
  const colored = changes(baseline, [{type: 'set-appearance', id: part(baseline, 'chair').id, appearance: {materials: {'chair-seat': {color: '#345678'}}}}]);
  observations.push(rejected(colored, removeChair.ref, removeChair.ctx, '.chair.appearance'));
  const child = changes(baseline, [{type: 'add-facility', id: 'custom-child', parentId: part(baseline, 'desk').id, resource: {id: 'monitor', version: 1}, transform: {position: [.6, .84, -.2], yaw: 0}}]);
  const removeDesk = alteredTarget(t => {t.parts = t.parts.filter(p => !['desk', 'monitor', 'keyboard', 'microphone'].includes(p.key));});
  observations.push(rejected(child, removeDesk.ref, removeDesk.ctx, '.desk.children'));
  return observations;
});

await check('new defaults can reattach to a new part with collision-free ID while relative overrides refuse changed parent frames', () => {
  const altered = alteredTarget(t => {
    t.parts.push({key: 'side-desk', parentKey: null, requiredRole: 'desk', resource: {id: 'desk', version: 1}, transform: {position: [3, 0, -.9], yaw: 0}});
    t.parts.find(p => p.key === 'monitor').parentKey = 'side-desk';
  });
  const source = changes(solo(), [{type: 'add-facility', id: 'solo/side-desk', parentId: 'company-demo/room-1', resource: {id: 'plant', version: 1}, transform: {position: [-4, 0, 3], yaw: 0}}]);
  const result = upgrade(source, altered.ref, altered.ctx, 'solo');
  assert.equal(part(result.document, 'side-desk', 'solo').id, 'solo/side-desk-1');
  assert.equal(part(result.document, 'monitor', 'solo').parentId, 'solo/side-desk-1');
  assert.equal(new Set(result.document.nodes.map(n => n.id)).size, result.document.nodes.length);
  const moved = changes(baseline, [{type: 'move', id: part(baseline, 'monitor').id, transform: {position: [.1, .84, -.25], yaw: 0}}]);
  const failure = rejected(moved, altered.ref, altered.ctx, '.monitor.transform');
  return {addedId: 'solo/side-desk-1', retainedMonitorId: part(result.document, 'monitor', 'solo').id, failure};
});

await check('role, full use-point contract, changed actual surface and unsupported appearance fail with part and field reasons', () => {
  const observations = [];
  const role = alteredTarget(t => {t.parts.find(p => p.key === 'chair').requiredRole = 'sofa';});
  observations.push(rejected(baseline, role.ref, role.ctx, '.chair.resource.mountRole'));
  const alteredCatalog = structuredClone(catalog);
  const changedChair = structuredClone(alteredCatalog.resources.find(r => r.id === 'chair'));
  changedChair.version = 2;
  changedChair.usePoints[0].capacity = 2;
  alteredCatalog.resources.push(changedChair);
  const points = alteredTarget(t => {t.parts.find(p => p.key === 'chair').resource.version = 2;}, alteredCatalog);
  observations.push(rejected(baseline, points.ref, points.ctx, '.chair.resource.usePoints[0].capacity'));
  const deskCatalog = structuredClone(catalog);
  const changedDesk = structuredClone(deskCatalog.resources.find(r => r.id === 'desk'));
  changedDesk.version = 2;
  changedDesk.surface.topY = 1.05;
  deskCatalog.resources.push(changedDesk);
  const surface = alteredTarget(t => {t.parts.find(p => p.key === 'desk').resource.version = 2;}, deskCatalog);
  observations.push(rejected(baseline, surface.ref, surface.ctx, '.desk.resource.surface.topY'));
  const slotCatalog = structuredClone(catalog);
  const noSlots = structuredClone(slotCatalog.resources.find(r => r.id === 'chair'));
  noSlots.version = 2;
  delete noSlots.materialSlots;
  slotCatalog.resources.push(noSlots);
  const slots = alteredTarget(t => {t.parts.find(p => p.key === 'chair').resource.version = 2;}, slotCatalog);
  const colored = changes(baseline, [{type: 'set-appearance', id: part(baseline, 'chair').id, appearance: {materials: {'chair-seat': {color: '#123456'}}}}]);
  observations.push(rejected(colored, slots.ref, slots.ctx, '.chair.appearance', 'unsupported-appearance'));
  const stateCatalog = structuredClone(catalog);
  const noOnState = structuredClone(stateCatalog.resources.find(r => r.id === 'monitor'));
  noOnState.version = 2;
  noOnState.stateDefaults = {};
  stateCatalog.resources.push(noOnState);
  const stateTarget = alteredTarget(t => {t.parts.find(p => p.key === 'monitor').resource.version = 2;}, stateCatalog);
  const poweredOff = changes(baseline, [{type: 'set-state', id: part(baseline, 'monitor').id, state: {on: false}}]);
  observations.push(rejected(poweredOff, stateTarget.ref, stateTarget.ctx, '.monitor.resource.state.fields.on'));
  return observations;
});

await check('busy points, exact version references and failed placement cannot return a partial candidate', () => {
  const observed = [];
  for (const ref of [{id: target.id}, {id: target.id, version: 900}]) assert.throws(() => upgrade(baseline, ref), e => e.code === 'missing-template-version');
  assert.throws(() => upgrade(baseline, target, {...context, isUsePointBusy: id => id === 'station-1/chair#seat'}), e => e.code === 'facility-busy');
  const outside = alteredTarget(t => {t.parts.find(p => p.key === 'desk').transform.position[2] = -3.3;});
  observed.push(rejected(baseline, outside.ref, outside.ctx, '.desk.transform', 'outside-room'));
  const unreachable = alteredTarget(t => {t.parts.find(p => p.key === 'chair').transform.position[2] = -2.8;});
  observed.push(rejected(baseline, unreachable.ref, unreachable.ctx, '.chair.seat.approach', 'outside-use-space'));
  return observed;
});

const inputHashesUnchangedAtEnd = JSON.stringify(await hashInputs()) === JSON.stringify(inputHashes);
const status = inputHashesUnchangedAtEnd && checks.every(c => c.status === 'passed') ? 'cpu-explicit-upgrade-passed' : 'failed';
const output = process.argv[2] ? pathToFileURL(path.resolve(process.argv[2]) + path.sep) :
  new URL('../../evidence/company-upgrade-v1/', import.meta.url);
await fs.mkdir(output, {recursive: true});
await fs.writeFile(new URL('report.json', output), JSON.stringify({status, generatedAt: new Date().toISOString(), inputHashes, inputHashesUnchangedAtEnd, checks,
  requestedDispatch: {difficulty: 'complex', model: 'gpt-6.1-sol', reasoningEffort: 'high'}, verifiedRuntimeModelAndEffort: false, verifiedHostHookInterception: false,
  limits: ['CPU authoring migration and conservative static placement only. No browser, GPU, actor task or occupancy state.', 'The production template variant changes the default desk Z only. Incompatible targets and sofa template tests are in-memory QA combinations using the actual library catalog.', 'Material slot declarations are real library-catalog declarations. Actual material rendering and character contact are C3 work.']}, null, 2) + '\n');
if (portableResult) await fs.writeFile(new URL('upgraded-layout.json', output), JSON.stringify(portableResult, null, 2) + '\n');
console.log(JSON.stringify({status, checks: checks.map(({name, status}) => ({name, status}))}, null, 2));
if (status !== 'cpu-explicit-upgrade-passed') process.exitCode = 1;
