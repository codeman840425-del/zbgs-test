// Actual installed Three/sphere/capsule APIs, with a CPU-only observer fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const flag = process.argv.indexOf('--modules-root');
const modules = flag < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[flag+1]);
const THREE = await import(pathToFileURL(path.join(modules, 'three/build/three.module.js')).href);
const {VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere, VRMSpringBoneColliderShapeCapsule} = await import(pathToFileURL(path.join(modules, '@pixiv/three-vrm/lib/three-vrm.module.js')).href);
const require = createRequire(import.meta.url);
const {installCaptureInPage, finishCaptureInPage} = require('./capture-existing.cjs');
const fitBytes = await fs.readFile(path.join(root, 'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/fit.json'));
const fit = JSON.parse(fitBytes);
const script = await fs.readFile(path.join(here, 'capture-existing.cjs'), 'utf8');
assert(script.includes(createHash('sha256').update(fitBytes).digest('hex')));
const scene = new THREE.Group(), head = new THREE.Bone(), chest = new THREE.Bone();
head.position.y = 1.38; chest.position.y = 1.15; scene.add(head, chest);
const bones = Array.from({length: 7}, (_, i) => { const bone = new THREE.Bone(); bone.name = 'Pony'+i; bone.position.set(0, -.065, .02); return bone; });
head.add(bones[0]); for (let i = 1; i < bones.length; i++) bones[i-1].add(bones[i]);
const humanoid = {getRawBoneNode: name => name === 'head' ? head : chest}, body = [];
for (const c of fit.dynamics.colliders) {
  const options = {offset: new THREE.Vector3().fromArray(c.offset), radius: c.radius};
  if (c.tail) options.tail = new THREE.Vector3().fromArray(c.tail);
  const collider = new VRMSpringBoneCollider(c.shape === 'sphere' ? new VRMSpringBoneColliderShapeSphere(options) : new VRMSpringBoneColliderShapeCapsule(options));
  humanoid.getRawBoneNode(c.bone).add(collider); body.push(collider);
}
const boxes = ['chairSeat', 'chairBack'].map(name => ({name, mesh: new THREE.Group(), localBox: new THREE.Box3(new THREE.Vector3(-.2, -.2, -.02), new THREE.Vector3(.2, .2, .02))}));
const room = [];
for (const box of boxes) for (let i = 0; i < 6; i++) {
  const shape = {type: 'room-oriented-box', offset: new THREE.Vector3(), bone: bones[i], lastOutcome: 'clear',
    calculateCollision(_matrix, _point, _radius, target) { assert.equal(this, shape); target.set(0, 1, 0); return -.01; }};
  const collider = new VRMSpringBoneCollider(shape); box.mesh.add(collider); room.push(collider);
}
scene.updateMatrixWorld(true); for (const collider of body) collider.updateWorldMatrix(true, false);
let mode = 'idle', throwOriginal = false;
const expected = [], actual = [];
const appearance = {
  getState: () => ({hairDynamics: {localRotations: bones.slice(0, 6).map(b => b.quaternion.toArray()), worldTails: bones.slice(1).map(b => b.getWorldPosition(new THREE.Vector3()).toArray())}}),
  updateDynamics(dt, enabled) {
    assert.equal(this, appearance); assert.equal(dt, .0061); assert.equal(enabled, true);
    if (throwOriginal) throw Error('injected original update failure');
    for (let i = 0; i < 6; i++) for (const collider of [...body, room[i], room[i+6]]) {
      const point = new THREE.Vector3().setFromMatrixPosition(collider.colliderMatrix).add(new THREE.Vector3(.01, .02, .03)), target = new THREE.Vector3();
      const result = collider.shape.calculateCollision(collider.colliderMatrix, point, fit.dynamics.joints[i].hitRadius, target);
      actual.push({result, point: point.toArray(), target: target.toArray()});
    }
    return 17;
  },
};
const originalUpdate = appearance.updateDynamics;
const actor = {appearance, vrm: {scene, humanoid}};
globalThis.window = {__debug: {avatar: () => actor, snapshot: () => ({mode, motion: {sitProgress: .2}}), chairColliders: () => boxes}};
originalUpdate.call(appearance, .0061, true); expected.push(...actual.splice(0));
const before = [...body, ...room].map(c => ({shape: c.shape, fn: c.shape.calculateCollision, own: Object.getOwnPropertyDescriptor(c.shape, 'calculateCollision')}));
assert.deepEqual(installCaptureInPage({fit, stopAfterMs: 1000}), {bodyShapes: 3, roomShapes: 12});
mode = 'sit'; assert.equal(appearance.updateDynamics(.0061, true), 17);
const recorded = finishCaptureInPage();
assert.deepEqual(actual.splice(0), expected); assert.equal(recorded.frames.length, 1);
assert.equal(recorded.frames[0].queries.length, 30); assert.equal(recorded.observationErrors.length, 0);
assert.equal(recorded.frames[0].queries.filter(q => q.category === 'body' && q.signedDistance < 0).length, 18);
assert(recorded.wrappersRestored); assert.equal(appearance.updateDynamics, originalUpdate);
for (const item of before) { assert.equal(item.shape.calculateCollision, item.fn); assert.deepEqual(Object.getOwnPropertyDescriptor(item.shape, 'calculateCollision'), item.own); }
assert.equal(window.__hairSeatFeasibilityCapture, undefined);
mode = 'idle'; installCaptureInPage({fit}); mode = 'sit'; throwOriginal = true;
assert.throws(() => appearance.updateDynamics(.0061, true), /injected original update failure/);
const failed = finishCaptureInPage(); assert(failed.wrappersRestored); assert.equal(failed.observationErrors.length, 1); assert.equal(appearance.updateDynamics, originalUpdate);
mode = 'idle'; const duplicate = new VRMSpringBoneCollider(body[0].shape); head.add(duplicate);
assert.throws(() => installCaptureInPage({fit}), /ambiguous/); head.remove(duplicate);
assert.equal(appearance.updateDynamics, originalUpdate); assert.equal(window.__hairSeatFeasibilityCapture, undefined);
const report = {passed: true, ThreeRevision: THREE.REVISION, CPUOnly: true, startsBrowser: false,
  observedOfficialSphereCapsuleCalls: 18, observedRoomFixtureCalls: 12, originalReturnsThisAndTargetsPreserved: true,
  exactFunctionAndOwnPropertyDescriptorsRestored: true, originalUpdateExceptionPreservedAndRestored: true, ambiguousShapeRejectedBeforeInstall: true,
  limit: 'Only the observer is validated. The real page attach/trigger/wait path awaits root execution.', actualCapturePerformed: false};
await fs.writeFile(path.join(here, 'qa-capture.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
