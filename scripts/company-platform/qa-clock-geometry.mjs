import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateClockGeometry} from '../../prototype/src/company/clock-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-clock-geometry-v1');
await fs.mkdir(output, {recursive: true});
globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
const analogResource = (overrides = {}) => ({id: 'analog-clock', clockDisplay: {kind: 'analog', format: '12h', seconds: true}, clockNodes: {hour: 'clock-hour-pivot', minute: 'clock-minute-pivot', second: 'clock-second-pivot'}, ...overrides});
const centers = [-.195, -.13, -.0325, .0325, .13, .195];
const digitalResource = (overrides = {}) => ({id: 'digital-clock', clockDisplay: {kind: 'digital', format: '24h', seconds: true}, clockNodes: {digits: Array.from({length: 6}, (_, digit) => Array.from({length: 7}, (_, segment) => `digit-${digit}-${segment}`)), colons: ['colon-0', 'colon-1', 'colon-2', 'colon-3']}, ...overrides});

function analogScene({parentPosition = [0, 0, 0], horizontal = false, missing = null, duplicate = false, occluder = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3); const wrapper = new THREE.Group(); wrapper.position.set(...parentPosition); scene.add(wrapper);
  const lengths = [.085, .12, .14], names = ['clock-hour-pivot', 'clock-minute-pivot', 'clock-second-pivot'];
  for (let index = 0; index < 3; index++) {
    const pivot = new THREE.Group(); pivot.name = names[index]; pivot.position.z = [.045, .055, .065][index]; wrapper.add(pivot);
    if (missing !== index) { const geometry = horizontal && index === 0 ? new THREE.BoxGeometry(lengths[index], .008, .006) : new THREE.BoxGeometry(.008, lengths[index], .006); const pointer = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); pointer.name = `${names[index]}-pointer`; pointer.position.set(horizontal && index === 0 ? lengths[index] / 2 : 0, horizontal && index === 0 ? 0 : lengths[index] / 2, 0); pivot.add(pointer); }
    if (duplicate && index === 0) { const extra = new THREE.Group(); extra.name = names[index]; wrapper.add(extra); }
  }
  if (occluder) { const blocker = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .02), new THREE.MeshBasicMaterial()); blocker.name = 'front-frame'; blocker.position.z = .1; wrapper.add(blocker); }
  scene.updateMatrixWorld(true); return scene;
}

function digitalScene({wrongSegment = false, wrongSide = false, duplicate = false, occluder = false, nanSegment = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3); const wrapper = new THREE.Group(); scene.add(wrapper);
  const segmentKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let digit = 0; digit < 6; digit++) for (let segment = 0; segment < 7; segment++) {
    const horizontal = [0, 3, 6].includes(segment), length = .035, thickness = .007;
    const geometry = new THREE.BoxGeometry(horizontal ? length : thickness, horizontal ? thickness : length, .006);
    if (nanSegment && digit === 0 && segment === 0) geometry.getAttribute('position').setX(0, NaN);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = `digit-${digit}-${segment}`;
    const y = horizontal ? (segment === 0 ? .045 : segment === 3 ? -.045 : 0) : ([1, 5].includes(segment) ? .0225 : -.0225);
    const side = horizontal ? 0 : ([1, 2].includes(segment) ? .021 : -.021);
    mesh.position.set(wrongSegment && digit === 0 && segment === 0 ? centers[digit] + .1 : centers[digit] + (wrongSide && digit === 0 && segment === 1 ? -side : side), y, .02); wrapper.add(mesh);
  }
  for (let index = 0; index < 4; index++) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(.007, .007, .006), new THREE.MeshBasicMaterial()); mesh.name = `colon-${index}`; mesh.position.set(index < 2 ? -.08125 : .08125, index % 2 ? -.02 : .02, .02); wrapper.add(mesh); }
  if (duplicate) wrapper.children[1].name = 'digit-0-0';
  if (occluder) { const blocker = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, .02), new THREE.MeshBasicMaterial()); blocker.name = 'digital-frame'; blocker.position.z = .1; wrapper.add(blocker); }
  scene.updateMatrixWorld(true); return scene;
}

const checks = [];
const invoke = (scene, resource) => validateClockGeometry(scene, resource, (code, failurePath, message, details) => { const error = new Error(message); error.code = code; error.path = failurePath; error.details = details; throw error; });
function pass(name, observed) { checks.push({name, passed: true, observed}); }
function expectFailure(name, scene, resource, code) { let captured; try { invoke(scene, resource); } catch (error) { captured = error; } assert(captured, `${name} unexpectedly passed`); assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`); checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, message: captured.message}}); }

const analog = invoke(analogScene(), analogResource()); assert.equal(analog.checked, true); pass('analog pivots and +Y pointers pass', analog);
const digital = invoke(digitalScene(), digitalResource()); assert.equal(digital.checked, true); pass('digital six-by-seven segments and colons pass', digital);
const ignored = invoke(analogScene(), {id: 'other', clockDisplay: {kind: 'other'}}); assert.equal(ignored.checked, false); pass('non-clock resource is ignored', ignored);
expectFailure('missing analog pointer geometry is rejected', analogScene({missing: 1}), analogResource(), 'clock-pointer-geometry');
expectFailure('duplicate analog pivot is rejected', analogScene({duplicate: true}), analogResource(), 'clock-pivot-node');
expectFailure('nonidentity analog parent is rejected', analogScene({parentPosition: [.01, 0, 0]}), analogResource(), 'clock-parent-transform');
expectFailure('horizontal analog pointer is rejected', analogScene({horizontal: true}), analogResource(), 'clock-pointer-geometry');
expectFailure('front frame occluding analog pointer is rejected', analogScene({occluder: true}), analogResource(), 'clock-display-occluded');
expectFailure('duplicate digital segment node is rejected', digitalScene({duplicate: true}), digitalResource(), 'clock-display-node');
expectFailure('misplaced digital segment is rejected', digitalScene({wrongSegment: true}), digitalResource(), 'clock-display-geometry');
expectFailure('left-right digital segment mapping is rejected', digitalScene({wrongSide: true}), digitalResource(), 'clock-display-geometry');
expectFailure('front frame occluding digital display is rejected', digitalScene({occluder: true}), digitalResource(), 'clock-display-occluded');
expectFailure('nonfinite digital geometry is rejected', digitalScene({nanSegment: true}), digitalResource(), 'clock-display-geometry');

const realRoot = path.resolve('prototype/public/company-assets/clock-v1');
const realAssets = ['analog-round', 'analog-square', 'analog-octagon', 'analog-spoke', 'digital-flat', 'digital-layered', 'digital-side-bracket', 'digital-recessed'];
const loader = new GLTFLoader();
const realResults = [];
for (const id of realAssets) {
  const resourcePath = path.join(realRoot, id, 'v1', 'resource.json'), modelPath = path.join(realRoot, id, 'v1', 'model.glb');
  try {
    const resource = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
    const bytes = await fs.readFile(modelPath);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const observed = invoke(gltf.scene, resource);
    assert.equal(observed.checked, true);
    realResults.push({id, kind: resource.clockDisplay.kind, checked: true, result: observed});
  } catch (error) {
    realResults.push({id, checked: false, code: error.code, message: error.message});
    throw error;
  }
}
pass('eight authored clock GLBs pass the real loader and geometry validator', realResults);

const report = {status: checks.every(check => check.passed) ? 'passed' : 'failed', generatedAt: new Date().toISOString(), configuration: {difficulty: 'complex', requestedModel: 'gpt-6.1-sol', requestedReasoningEffort: 'high', actualProviderConfiguration: 'not independently verified', hostHookInterception: 'not independently verified'}, api: 'validateClockGeometry(scene, resource, fail, path)', checks, realAssets: realResults, limits: ['CPU-only Three synthetic scenes and GLTFLoader readback. No browser, GPU, state runtime or host clock.', 'The validator checks static analog pointer and digital segment geometry, mapping identity and conservative front occlusion.', 'It does not prove host time input, display brightness/state transitions, persistence or visual acceptance.']};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
