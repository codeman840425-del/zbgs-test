import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {validateClockGeometry} from '../../prototype/src/company/clock-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-supported-clock-geometry-v1');
await fs.mkdir(output, {recursive: true});
const analog = {id: 'supported-analog', mount: 'support-surface', clockDisplay: {kind: 'analog', format: '12h', seconds: true, frame: [0, .175, -.04]}, clockNodes: {frame: 'clock-display-frame', base: 'clock-base', hour: 'clock-hour-pivot', minute: 'clock-minute-pivot', second: 'clock-second-pivot'}};
const digital = {id: 'supported-digital', mount: 'support-surface', clockDisplay: {kind: 'digital', format: '24h', seconds: true, frame: [0, .09, -.03]}, clockNodes: {frame: 'clock-display-frame', base: 'clock-base', digits: Array.from({length: 6}, (_, digit) => Array.from({length: 7}, (_, segment) => `digit-${digit}-${segment}`)), colons: ['colon-0', 'colon-1', 'colon-2', 'colon-3']}};
const centers = [-.195, -.13, -.0325, .0325, .13, .195];

function analogScene({wrongFrame = false, noBody = false, basePlane = false, outsidePointer = false, degenerateContact = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3); const wrapper = new THREE.Group(); scene.add(wrapper);
  const frame = new THREE.Group(); frame.name = 'clock-display-frame'; frame.position.set(0, wrongFrame ? .2 : .175, -.04); wrapper.add(frame);
  if (!noBody) { const body = new THREE.Mesh(new THREE.BoxGeometry(.3, .35, .06), new THREE.MeshBasicMaterial()); body.name = 'clock-body'; frame.add(body); }
  if (degenerateContact) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -.175, 0, 0, -.175, 0, 0, -.175, 0], 3)); const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = 'degenerate-contact'; frame.add(mesh); }
  const lengths = [.085, .12, .14], names = ['clock-hour-pivot', 'clock-minute-pivot', 'clock-second-pivot'];
  for (let index = 0; index < 3; index++) { const pivot = new THREE.Group(); pivot.name = names[index]; pivot.position.z = [.045, .055, .065][index]; frame.add(pivot); const pointer = new THREE.Mesh(new THREE.BoxGeometry(.008, lengths[index], .006), new THREE.MeshBasicMaterial()); pointer.name = `${names[index]}-pointer`; pointer.position.set(0, lengths[index] / 2, 0); if (outsidePointer && index === 0) pivot.remove(pointer), wrapper.add(pointer); else pivot.add(pointer); }
  const base = new THREE.Mesh(basePlane ? new THREE.PlaneGeometry(.22, .08) : new THREE.BoxGeometry(.22, .01, .08), new THREE.MeshBasicMaterial()); base.name = 'clock-base'; base.position.y = .005; wrapper.add(base);
  scene.updateMatrixWorld(true); return scene;
}

function digitalScene({wrongFrame = false, noBody = false, outsideSegment = false, basePlane = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3); const wrapper = new THREE.Group(); scene.add(wrapper);
  const frame = new THREE.Group(); frame.name = 'clock-display-frame'; frame.position.set(0, wrongFrame ? .12 : .09, -.03); wrapper.add(frame);
  if (!noBody) { const body = new THREE.Mesh(new THREE.BoxGeometry(.5, .18, .02), new THREE.MeshBasicMaterial()); body.name = 'clock-body'; frame.add(body); }
  for (let digit = 0; digit < 6; digit++) for (let segment = 0; segment < 7; segment++) { const horizontal = [0, 3, 6].includes(segment), geometry = new THREE.BoxGeometry(horizontal ? .035 : .007, horizontal ? .007 : .035, .006), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = `digit-${digit}-${segment}`; const x = horizontal ? centers[digit] : centers[digit] + ([1, 2].includes(segment) ? .021 : -.021), y = horizontal ? (segment === 0 ? .045 : segment === 3 ? -.045 : 0) : ([1, 5].includes(segment) ? .0225 : -.0225); mesh.position.set(x, y, .02); (outsideSegment && digit === 0 && segment === 0 ? wrapper : frame).add(mesh); }
  for (let index = 0; index < 4; index++) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(.007, .007, .006), new THREE.MeshBasicMaterial()); mesh.name = `colon-${index}`; mesh.position.set(index < 2 ? -.08125 : .08125, index % 2 ? -.02 : .02, .02); frame.add(mesh); }
  const base = new THREE.Mesh(basePlane ? new THREE.PlaneGeometry(.38, .06) : new THREE.BoxGeometry(.38, .01, .06), new THREE.MeshBasicMaterial()); base.name = 'clock-base'; base.position.y = .005; wrapper.add(base);
  scene.updateMatrixWorld(true); return scene;
}

const checks = [];
const invoke = (scene, resource) => validateClockGeometry(scene, resource, (code, failurePath, message, details) => { const error = new Error(message); error.code = code; error.path = failurePath; error.details = details; throw error; });
function pass(name, observed) { checks.push({name, passed: true, observed}); }
function expectFailure(name, scene, resource, code) { let captured; try { invoke(scene, resource); } catch (error) { captured = error; } assert(captured, `${name} unexpectedly passed`); assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`); checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, message: captured.message}}); }

pass('supported analog frame and solid base pass', invoke(analogScene(), analog));
pass('supported digital frame and solid base pass', invoke(digitalScene(), digital));
expectFailure('analog frame translation mismatch is rejected', analogScene({wrongFrame: true}), analog, 'clock-frame-transform');
expectFailure('analog missing body connection is rejected', analogScene({noBody: true}), analog, 'clock-base-connection');
expectFailure('analog thin base is rejected', analogScene({basePlane: true}), analog, 'clock-base-geometry');
expectFailure('analog display outside frame is rejected', analogScene({outsidePointer: true}), analog, 'clock-pointer-geometry');
expectFailure('degenerate contact triangle is rejected', analogScene({noBody: true, degenerateContact: true}), analog, 'clock-base-connection');
expectFailure('digital frame translation mismatch is rejected', digitalScene({wrongFrame: true}), digital, 'clock-frame-transform');
expectFailure('digital missing body connection is rejected', digitalScene({noBody: true}), digital, 'clock-base-connection');
expectFailure('digital thin base is rejected', digitalScene({basePlane: true}), digital, 'clock-base-geometry');
expectFailure('digital segment outside frame is rejected', digitalScene({outsideSegment: true}), digital, 'clock-frame-parent');

const realRoot = path.resolve('prototype/public/company-assets/supported-clock-v1');
const realResults = [];
try {
  const entries = (await fs.readdir(realRoot, {withFileTypes: true})).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const id of entries) {
    const resourcePath = path.join(realRoot, id, 'v1', 'resource.json'), modelPath = path.join(realRoot, id, 'v1', 'model.glb');
    const resource = JSON.parse(await fs.readFile(resourcePath, 'utf8')), bytes = await fs.readFile(modelPath);
    const {GLTFLoader} = await import('../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    realResults.push({id, result: invoke(gltf.scene, resource)});
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const report = {status: checks.every(check => check.passed) ? 'passed' : 'failed', generatedAt: new Date().toISOString(), configuration: {difficulty: 'complex', requestedModel: 'gpt-6.1-sol', requestedReasoningEffort: 'high', actualProviderConfiguration: 'not independently verified', hostHookInterception: 'not independently verified'}, api: 'validateClockGeometry(scene, resource, fail, path) support-surface branch', checks, realAssets: realResults, limits: ['CPU-only synthetic Three scenes and optional GLTFLoader readback. No browser, GPU, clock runtime or support placement transaction.', 'Wall clock validation remains in the prior clock geometry report. This package checks support frame transforms, solid bases and frame-to-base mesh contact.', 'Support-surface attachment fit and support-geometry ground/contact checks remain owned by the existing support validators.']};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, realAssets: realResults.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
