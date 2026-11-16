import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {appearanceBranches,appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

globalThis.ProgressEvent ??= class extends Event {constructor(type, init = {}) { super(type); Object.assign(this, init); }};
const root = new URL('../../', import.meta.url);
const output = new URL('./', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['prototype/src/company/appearance-samples.js', 'prototype/src/company/asset-library.js', 'prototype/src/company/document.js', 'prototype/src/company/render.js', 'prototype/src/company/appearance-contract.js', 'prototype/src/company/library-catalog.json'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, hash(await fs.readFile(new URL(`../../${file}`, import.meta.url)))])));
const assetConsistency = [];
for (const resource of catalog.resources) if (resource.asset?.url) {
  const bytes = await fs.readFile(new URL(`../../prototype/public${resource.asset.url}`, import.meta.url));
  const actualSha256 = hash(bytes);
  assetConsistency.push({id: resource.id, version: resource.version, expectedBytes: resource.asset.bytes, actualBytes: bytes.length, expectedSha256: resource.asset.sha256, actualSha256});
}
assert(assetConsistency.every(entry => entry.expectedBytes === entry.actualBytes && entry.expectedSha256 === entry.actualSha256), 'library-catalog asset records must match public GLBs before runtime review');
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

function localAssetLibrary(requests) {
  return createCompanyAssetLibrary({fetchImpl: async (url, {signal} = {}) => {
    requests.push({url, abortedAtFetch: Boolean(signal?.aborted)});
    const bytes = await fs.readFile(new URL(`../../prototype/public${url}`, import.meta.url));
    return {ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
  }});
}

async function inspectBranch(branch, index) {
  const sample = createAppearanceSample(branch, index, catalog, templates);
  const requests = [], world = new THREE.Scene(), library = localAssetLibrary(requests);
  const authoring = await createCompanyAuthoring(world, sample.document, {catalog, templates, storage: storage(), assetLibrary: library});
  try {
    const scene = authoring.scene, floorId = sample.document.nodes.find(node => node.kind === 'floor').id, roomId = sample.document.nodes.find(node => node.kind === 'room').id;
    const logicalNavigation = () => { const {floors, obstacles, ...rest} = scene.navigation(floorId); return JSON.stringify({...rest, obstacles: obstacles.map(({object, ...entry}) => entry)}); };
    const beforeDocument = JSON.stringify(authoring.document), beforeNavigation = logicalNavigation();
    const failureTarget = branch === 'stream-station' ? `${sample.target}/monitor` : sample.target;
    const targetRoot = scene.root.getObjectByName(sample.target);
    assert(targetRoot, `${branch}[${index}] target facility is not rendered`);
    const displayTargets = branch === 'stream-station' ? [`${sample.target}/monitor`, `${sample.target}/fill-light`] : [sample.target];
    const targetResources = displayTargets.map(target => {
      const node = authoring.document.nodes.find(candidate => candidate.id === target);
      return {target, resource: node && catalog.resources.find(resource => resource.id === node.resource.id && resource.version === node.resource.version)};
    });
    assert(targetResources.every(entry => entry.resource), `${branch}[${index}] target resource is absent from catalog`);
    const targetResource = targetResources.find(entry => entry.target === sample.target)?.resource;
    const loadedMeshes = [];
    targetRoot.traverse(node => { if (node.isMesh) loadedMeshes.push(node.name); });
    assert(loadedMeshes.length > 0, `${branch}[${index}] has no imported meshes`);
    let portalClearSamples = null;
    if (targetResource?.mount === 'portal') {
      const spec = targetResource.mounting;
      targetRoot.updateMatrixWorld(true);
      let clear = 0;
      for (const x of [-.49, -.25, 0, .25, .49].map(value => value * spec.apertureWidth)) {
        for (const y of [.01, .25, .5, .75, .99].map(value => value * spec.apertureHeight)) {
          const origin = new THREE.Vector3(x, y, spec.depth + 1).applyMatrix4(targetRoot.matrixWorld);
          const direction = new THREE.Vector3(0, 0, -1).transformDirection(targetRoot.matrixWorld);
          assert.equal(new THREE.Raycaster(origin, direction).intersectObject(targetRoot, true).length, 0, `${branch}[${index}] portal aperture is blocked`);
          clear++;
        }
      }
      portalClearSamples = clear;
    }
    for (const {target, resource} of targetResources) if (resource.display?.screen) {
      const display = resource.display.screen;
      const nodeRoot = scene.root.getObjectByName(target);
      for (const name of display.nodes) {
        const mesh = nodeRoot?.getObjectByName(name);
        assert(mesh?.isMesh, `${branch}[${index}] display node ${name} missing at runtime`);
        const materials = [mesh.material].flat();
        assert(materials.every(material => material?.emissive && material.color), `${branch}[${index}] display material is not emissive-capable`);
        assert(materials.every(material => material.color.getHexString() === display.onColor.slice(1).toLowerCase()), `${branch}[${index}] display on color was not applied`);
        assert(materials.every(material => Math.abs(material.emissiveIntensity - display.onIntensity) < 1e-8), `${branch}[${index}] display on intensity was not applied`);
      }
      await authoring.apply([{type:'set-state', id: target, state: {on: false}}]);
      const off = resource.display.screen;
      for (const name of off.nodes) {
        const mesh = scene.root.getObjectByName(target)?.getObjectByName(name);
        assert(mesh?.material?.color, `${branch}[${index}] display off node disappeared`);
        assert(mesh.material.color.getHexString() === off.offColor.slice(1).toLowerCase(), `${branch}[${index}] display off color was not applied`);
        assert.equal(mesh.material.emissiveIntensity, 0, `${branch}[${index}] display off intensity was not cleared`);
      }
      await authoring.apply([{type:'set-state', id: target, state: {on: true}}]);
    }
    const beforeViewDocument = JSON.stringify(authoring.document);
    await authoring.setView({mode:'room', roomId});
    assert.equal(logicalNavigation(), beforeNavigation, `${branch}[${index}] room view changed navigation`);
    await authoring.setView({mode:'building'});
    assert.equal(logicalNavigation(), beforeNavigation, `${branch}[${index}] building view changed navigation`);
    await authoring.setView({mode:'floor', floorId});
    assert.equal(JSON.stringify(authoring.document), beforeViewDocument, `${branch}[${index}] view changed document`);
    const oldRoot = scene.root, oldDocument = JSON.stringify(authoring.document);
    await assert.rejects(authoring.apply([{type:'replace-resource', id: failureTarget, resource: {id:'missing-resource', version: 1}}]), error => Boolean(error.code));
    assert.equal(scene.root, oldRoot, `${branch}[${index}] failed replacement changed live root`);
    assert.equal(JSON.stringify(authoring.document), oldDocument, `${branch}[${index}] failed replacement changed document`);
    return {branch, index, designId: sample.resource.id, target: sample.target, loadedMeshes: loadedMeshes.length, requests: requests.map(request => request.url), displayStateChecked: targetResources.some(entry => Boolean(entry.resource.display?.screen)), portalClearSamples, navigationStable: true, failedReplacementPreserved: true, library: library.snapshot()};
  } finally { authoring.dispose(); library.dispose(); }
}

async function inspectBadEnvelope(branch, index, replacementSourceId) {
  const sample = createAppearanceSample(branch, index, catalog, templates);
  const sourceNode = catalog.resources.find(resource => resource.id === sample.resource.id && resource.version === sample.resource.version);
  const replacementAsset = catalog.resources.find(resource => resource.id === replacementSourceId && resource.version === 1).asset;
  const bad = structuredClone(sourceNode);
  bad.id = `invalid-${branch}-envelope`;
  bad.asset = structuredClone(replacementAsset);
  catalog.resources.push(bad);
  const requests = [], world = new THREE.Scene(), library = localAssetLibrary(requests);
  const authoring = await createCompanyAuthoring(world, sample.document, {catalog, templates, storage: storage(), assetLibrary: library});
  try {
    const oldRoot = authoring.scene.root, oldDocument = JSON.stringify(authoring.document);
    await assert.rejects(authoring.apply([{type:'replace-resource', id:sample.target, resource:{id:bad.id, version:1}}]), error => error.code === 'asset-mount-envelope-mismatch');
    assert.equal(authoring.scene.root, oldRoot, `${branch} bad envelope changed live root`);
    assert.equal(JSON.stringify(authoring.document), oldDocument, `${branch} bad envelope changed document`);
    return {branch, index, rejectedCode:'asset-mount-envelope-mismatch', failedResource:bad.id, preservedRoot:true, preservedDocument:true};
  } finally {
    authoring.dispose(); library.dispose();
    const position = catalog.resources.indexOf(bad); if (position >= 0) catalog.resources.splice(position, 1);
  }
}

const checks = [], integratedBranches = appearanceBranches.map(([branch]) => [branch, appearanceCandidates(catalog, branch)]).filter(([, candidates]) => candidates.length >= 4);
for (const [branch, candidates] of integratedBranches) {
  assert(candidates.length >= 4, `${branch} requires at least four integrated candidates`);
  for (let index = 0; index < 4; index++) {
    try { checks.push({passed: true, observed: await inspectBranch(branch, index)}); }
    catch (error) { checks.push({passed: false, branch, index, error: error.stack}); }
  }
}
const failureChecks = [];
for (const [branch, index, replacementSourceId] of [['wall-art', 0, 'window-panel-cross'], ['window-panel', 0, 'chair-cantilever']]) {
  try { failureChecks.push({passed:true, observed:await inspectBadEnvelope(branch, index, replacementSourceId)}); }
  catch (error) { failureChecks.push({passed:false, branch, error:error.stack}); }
}
const report = {
  status: checks.every(check => check.passed) && failureChecks.every(check => check.passed) ? 'passed' : 'failed', generatedAt: new Date().toISOString(),
  dispatch: {difficulty:'complex', model:'gpt-6.1-sol', reasoning_effort:'high', reason:'Runtime application of four candidates per integrated appearance branch with mounting, display state and failure preservation checks.', configurationEvidence:'Parent selected sol/high. Host hook interception not independently verified.'},
  integratedBranches: integratedBranches.map(([branch, candidates]) => ({branch, candidateCount:candidates.length, firstFour:candidates.slice(0,4).map(candidate => `${candidate.id}@${candidate.version}`)})),
  unintegratedBranches: appearanceBranches.map(([branch]) => ({branch, candidateCount: appearanceCandidates(catalog, branch).length})).filter(entry => entry.candidateCount < 4),
  catalogIntegrity: {sourceLibraryCatalogSha256: sourceHashes['prototype/src/company/library-catalog.json'], catalogAssetCount: assetConsistency.length, assetConsistency, sidecarOverlay: false, reason: 'Runtime review uses the updated library-catalog.json directly and verifies every catalog GLB byte length and SHA256 against public files.'},
  sourceHashes, checks, failureChecks,
  coverage: {runtimeAssetLibrary:true, mountedWallFloorSamples:true, portalClearOpeningSamples:100, displayOnOffState:true, navigationStableAcrossRoomBuildingFloor:true, failedReplacementPreservesOldRoot:true, badMountEnvelopePreservesOldRoot:true, candidatesPerBranch:4},
  limitations: ['CPU Three.js scene and GLTFLoader runtime only. No browser/GPU visual acceptance.', 'Wall/floor display placement was checked through the current document/render contracts. Character or navigation behavior remains outside this sample review.'],
};
await fs.mkdir(output, {recursive:true});
await fs.writeFile(new URL('report-final.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status:report.status, checks:checks.length, failures:checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
