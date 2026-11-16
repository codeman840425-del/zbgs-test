import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../node_modules/three/build/three.module.js';
import catalogBase from '../src/company/library-catalog.json' with {type:'json'};
import templates from '../src/company/templates.json' with {type:'json'};
import input from '../../scripts/company-platform/space-inputs/single-room.json' with {type:'json'};
import {createScaledCompany} from '../src/company/space.js';
import {createCompanyAuthoring} from '../src/company/authoring.js';
import {createCompanyAssetLibrary} from '../src/company/asset-library.js';

globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
if (!process.argv[2]) throw new Error('Pass a new evidence output directory');
const root = new URL('../../', import.meta.url);
const out = pathToFileURL(path.resolve(process.argv[2]) + path.sep);
await fs.mkdir(new URL('../', out), {recursive: true});
await fs.mkdir(out, {recursive: false});
const catalog = structuredClone(catalogBase);
for (const original of catalogBase.resources.filter(resource => resource.asset)) {
  const resourceUrl = new URL(`prototype/public${original.asset.url.replace(/model\.glb$/, 'resource.json')}`, root);
  try {
    const updated = JSON.parse(await fs.readFile(resourceUrl));
    const index = catalog.resources.findIndex(resource => resource.id === updated.id && resource.version === updated.version);
    if (index >= 0) catalog.resources[index] = updated;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const hashFile = async name => createHash('sha256').update(await fs.readFile(new URL(name, root))).digest('hex');
const beforeHashes = Object.fromEntries(await Promise.all(['prototype/src/company/render.js', 'prototype/src/company/asset-library.js', 'prototype/src/company/authoring.js'].map(async name => [name, await hashFile(name)])));
const resource = (id, version = 1) => catalog.resources.find(candidate => candidate.id === id && candidate.version === version);
const assetResources = catalog.resources.filter(candidate => candidate.asset);
const stationRoot = 'single-demo/floor-1/room-1/station-1';
const stationTwoRoot = 'single-demo/floor-1/room-1/station-2';
const targets = new Map([
  ['desk', `${stationRoot}/desk`], ['monitor', `${stationRoot}/monitor`], ['keyboard', `${stationRoot}/keyboard`],
  ['desk-microphone', `${stationRoot}/microphone`], ['chair', `${stationRoot}/chair`], ['fill-light', `${stationRoot}/fill-light`],
]);
const baseIds = new Map([['desk','desk'],['monitor','monitor'],['keyboard','keyboard'],['desk-microphone','desk-microphone'],['chair','chair'],['fill-light','fill-light']]);
const storage = () => { const values = new Map(); return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}; };
const document = createScaledCompany(input, catalog, templates);
const fetchImpl = async (url, {signal} = {}) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const bytes = await fs.readFile(new URL(`prototype/public${url}`, root));
  return {ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
};
const world = new THREE.Scene();
const library = createCompanyAssetLibrary({fetchImpl});
const authoring = await createCompanyAuthoring(world, document, {catalog, templates, storage: storage(), assetLibrary: library});
const checks = [];
async function check(name, run) {
  try { checks.push({name, passed: true, observed: await run()}); }
  catch (error) { checks.push({name, passed: false, error: error.stack}); }
}
function importedMesh(id, name) {
  const facility = authoring.scene.root.getObjectByName(id); assert(facility, `Missing facility root ${id}`);
  const mesh = facility.getObjectByName(name); assert(mesh?.isMesh, `Missing imported display mesh ${id}.${name}`); return mesh;
}
function colorHex(mesh) { return `#${mesh.material.color.getHexString()}`; }
function resourceAt(id) { const node = authoring.document.nodes.find(candidate => candidate.id === id); assert(node, `Missing node ${id}`); return resource(node.resource.id, node.resource.version); }
async function replace(target, candidate) {
  await authoring.apply([{type: 'replace-resource', id: target, resource: {id: candidate.id, version: candidate.version}}]);
  assert.equal(authoring.document.nodes.find(node => node.id === target).resource.id, candidate.id);
  assert(authoring.scene.root.getObjectByName(target));
}

await check('Every GLB candidate imports through the real asset library, replacement path, and save restore', async () => {
  const tested = [], skipped = [], failed = [];
  for (const candidate of assetResources) {
    const target = targets.get(candidate.mountRole);
    if (!target) { skipped.push({id: candidate.id, mountRole: candidate.mountRole, reason: 'No matching facility in the minimal two-station fixture'}); continue; }
    try { await replace(target, candidate); }
    catch (error) { failed.push({id: candidate.id, mountRole: candidate.mountRole, code: error.code, message: error.message}); continue; }
    const saved = await authoring.save(); assert(saved.bytes > 0);
    await authoring.restore();
    const restored = authoring.document.nodes.find(node => node.id === target).resource;
    assert.deepEqual(restored, {id: candidate.id, version: candidate.version});
    tested.push({id: candidate.id, mountRole: candidate.mountRole, assetBytes: candidate.asset.bytes, saveBytes: saved.bytes, resourceUrl: candidate.asset.url});
  }
  assert.equal(failed.length, 0, JSON.stringify(failed));
  return {tested, skipped, failed, loadedAssets: library.snapshot().loadedAssets};
});

await check('Four monitor variants apply independent on/off display mappings and survive save restore', async () => {
  const one = `${stationRoot}/monitor`, two = `${stationTwoRoot}/monitor`;
  const aurora = resource('monitor-aurora'), ribbon = resource('monitor-ribbon');
  const variants = ['monitor-aurora','monitor-ribbon','monitor-pillar','monitor-slate'].map(id => resource(id));
  const variantChecks = [];
  for (const candidate of variants) {
    await replace(one, candidate);
    await authoring.apply([{type: 'set-state', id: one, state: {on: false}}]);
    const off = importedMesh(one, 'screen-surface'); assert.equal(colorHex(off), candidate.display.screen.offColor); assert.equal(off.material.emissiveIntensity, 0);
    await authoring.apply([{type: 'set-state', id: one, state: {on: true}}]);
    const on = importedMesh(one, 'screen-surface'); assert.equal(colorHex(on), candidate.display.screen.onColor); assert.equal(on.material.emissiveIntensity, candidate.display.screen.onIntensity);
    const savedVariant = await authoring.save(); await authoring.restore();
    const restored = importedMesh(one, 'screen-surface'); assert.equal(colorHex(restored), candidate.display.screen.onColor); assert.equal(restored.material.emissiveIntensity, candidate.display.screen.onIntensity);
    variantChecks.push({id: candidate.id, saveBytes: savedVariant.bytes, offColor: candidate.display.screen.offColor, onColor: candidate.display.screen.onColor});
  }
  await replace(one, aurora); await replace(two, ribbon);
  await authoring.apply([{type: 'set-state', id: one, state: {on: false}}, {type: 'set-state', id: two, state: {on: true}}]);
  const firstOff = importedMesh(one, 'screen-surface'), secondOn = importedMesh(two, 'screen-surface');
  assert.equal(colorHex(firstOff), aurora.display.screen.offColor); assert.equal(firstOff.material.emissiveIntensity, 0);
  assert.equal(colorHex(secondOn), ribbon.display.screen.onColor); assert.equal(secondOn.material.emissiveIntensity, ribbon.display.screen.onIntensity);
  const saved = await authoring.save(); await authoring.restore();
  const restoredOff = importedMesh(one, 'screen-surface'), restoredOn = importedMesh(two, 'screen-surface');
  assert.equal(colorHex(restoredOff), aurora.display.screen.offColor); assert.equal(restoredOff.material.emissiveIntensity, 0);
  assert.equal(colorHex(restoredOn), ribbon.display.screen.onColor); assert.equal(restoredOn.material.emissiveIntensity, ribbon.display.screen.onIntensity);
  return {variantChecks, savedBytes: saved.bytes, instanceIndependent: true, off: {color: colorHex(restoredOff), emissiveIntensity: restoredOff.material.emissiveIntensity}, on: {color: colorHex(restoredOn), emissiveIntensity: restoredOn.material.emissiveIntensity}};
});

await check('Four fill light variants drive isolated diffuser materials and real SpotLight state', async () => {
  const one = `${stationRoot}/fill-light`, two = `${stationTwoRoot}/fill-light`;
  const orbit = resource('fill-light-orbit'), wing = resource('fill-light-wing');
  const variants = ['fill-light-orbit','fill-light-wing','fill-light-column','fill-light-panel'].map(id => resource(id));
  const variantChecks = [];
  for (const candidate of variants) {
    await replace(one, candidate);
    await authoring.apply([{type: 'set-state', id: one, state: {on: false, intensity: 3}}]);
    const off = importedMesh(one, 'diffuser-panel'); assert.equal(colorHex(off), candidate.display.screen.offColor); assert.equal(off.material.emissiveIntensity, 0);
    await authoring.apply([{type: 'set-state', id: one, state: {on: true, intensity: 2}}]);
    const on = importedMesh(one, 'diffuser-panel'); assert.equal(colorHex(on), candidate.display.screen.onColor); assert.equal(on.material.emissiveIntensity, candidate.display.screen.onIntensity);
    const anchor = new THREE.Vector3().fromArray(candidate.light.position); const facility = authoring.scene.root.getObjectByName(one); const worldAnchor = facility.localToWorld(anchor); assert(new THREE.Box3().setFromObject(on).expandByScalar(.006).containsPoint(worldAnchor), `${candidate.id} diffuser does not cover fixed light origin`);
    const savedVariant = await authoring.save(); await authoring.restore();
    const restored = importedMesh(one, 'diffuser-panel'); assert.equal(colorHex(restored), candidate.display.screen.onColor); assert.equal(restored.material.emissiveIntensity, candidate.display.screen.onIntensity);
    variantChecks.push({id: candidate.id, saveBytes: savedVariant.bytes, offColor: candidate.display.screen.offColor, onColor: candidate.display.screen.onColor});
  }
  await replace(one, orbit); await replace(two, wing);
  await authoring.apply([{type: 'set-state', id: one, state: {on: false, intensity: 3}}, {type: 'set-state', id: two, state: {on: true, intensity: 2}}]);
  const firstOff = importedMesh(one, 'diffuser-panel'), secondOn = importedMesh(two, 'diffuser-panel');
  assert.equal(colorHex(firstOff), orbit.display.screen.offColor); assert.equal(firstOff.material.emissiveIntensity, 0);
  assert.equal(colorHex(secondOn), wing.display.screen.onColor); assert.equal(secondOn.material.emissiveIntensity, wing.display.screen.onIntensity);
  const lights = authoring.scene.snapshot().lights; assert.equal(lights.find(light => light.id === one).intensity, 0); assert.equal(lights.find(light => light.id === two).intensity, 2);
  const saved = await authoring.save(); await authoring.restore();
  const restoredLights = authoring.scene.snapshot().lights; assert.equal(restoredLights.find(light => light.id === one).intensity, 0); assert.equal(restoredLights.find(light => light.id === two).intensity, 2);
  return {variantChecks, savedBytes: saved.bytes, instanceIndependent: true, lights: restoredLights.filter(light => [one, two].includes(light.id)).map(light => ({id: light.id, intensity: light.intensity, castsShadow: light.castsShadow}))};
});

await check('Base facility contracts remain available after the collection exercises', async () => {
  for (const [role, id] of targets) { const candidate = resourceAt(id); assert(candidate, `Missing resource for ${role}`); assert.equal(candidate.id, authoring.document.nodes.find(node => node.id === id).resource.id); }
  return {targetCount: targets.size, currentRevision: authoring.document.revision, currentView: authoring.scene.view};
});

const afterHashes = Object.fromEntries(await Promise.all(Object.keys(beforeHashes).map(async name => [name, await hashFile(name)])));
const report = {status: checks.every(check => check.passed) ? 'passed' : 'failed', generatedAt: new Date().toISOString(), configuration: {difficulty: 'complex', requestedModel: 'gpt-6.1-sol', requestedReasoningEffort: 'high', actualProviderConfiguration: 'not independently verified', hostHookInterception: 'not independently verified'}, beforeHashes, afterHashes, sourcesStable: JSON.stringify(beforeHashes) === JSON.stringify(afterHashes), checks, limits: ['CPU Three scene construction and GLTFLoader asset-library import only. No GPU/browser/character activity.', 'The minimal two-station fixture exercises desk, monitor, keyboard, desk-microphone, chair and fill-light mount roles. Sofa, plant and wall-art assets are recorded as skipped when no matching facility exists.', 'Wall, floor and portal installation constraints are not runtime-tested here because this fixture has no wall-mounted asset nodes.', 'During concurrent catalog integration, local resource.json sidecars are overlaid onto the imported catalog so the tested bytes and provenance are the exact generated files. Root must rebuild the catalog from those sidecars before release.']};
await fs.writeFile(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
authoring.dispose(); library.dispose();
console.log(JSON.stringify({status: report.status, checks: checks.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
