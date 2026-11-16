// Read-only actual runtime CPU probe. Texture decoding is replaced by 1x1 fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { THREE } = await import('../../scripts/headless-avatar-node.mjs');
const { loadFoundationAvatar } = await import('../../prototype/src/foundation-avatar.js');
const { loadRetargetedMotions } = await import('../../prototype/src/motion-source.js');
const { createMotion } = await import('../../prototype/src/motion.js');
globalThis.location = { search: '', href: 'http://geometry.local/' };
const renderer = { domElement: { addEventListener() {}, removeEventListener() {} }, shadowMap: {}, compileAsync() { throw Error('GPU compilation forbidden in CPU review'); } };
const world = new THREE.Scene();
const rows = [];
const reviewedCommit = 'a40403857df58e2b2cff345bd6d2da34b6711111';

function points(actor) {
  const hips = {};
  for (const [kind, get] of [['raw', 'getRawBoneNode'], ['normalized', 'getNormalizedBoneNode']]) hips[kind] = actor.vrm.humanoid[get]('hips').getWorldPosition(new THREE.Vector3()).toArray();
  const shoes = [];
  actor.vrm.scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !mesh.parent?.userData.equipmentId?.endsWith('-shoes')) return;
    const attr = mesh.geometry.getAttribute('position');
    const vertices = Array.from({ length: attr.count }, (_, i) => mesh.localToWorld(mesh.getVertexPosition(i, new THREE.Vector3())));
    shoes.push({ id: mesh.parent.userData.equipmentId, minimumY: Math.min(...vertices.map(v => v.y)), vertices });
  });
  return { hips, shoes };
}

function maxDifference(a, b) {
  let error = 0;
  for (let i = 0; i < a.length; i++) error = Math.max(error, Math.abs(a[i]-b[i]));
  return error;
}

async function make(bodyType, position, yaw) {
  const actor = await loadFoundationAvatar({ scene: world, renderer, bodyType, attachToScene: false });
  actor.root.position.fromArray(position); actor.root.rotation.y = yaw;
  actor.root.updateMatrixWorld(true);
  const initial = points(actor);
  for (let i = 0; i < 100; i++) { actor.vrm.update(0); actor.root.updateMatrixWorld(true); }
  const after = points(actor);
  assert(maxDifference(initial.hips.raw, after.hips.raw) < 1e-7);
  assert(maxDifference(after.hips.raw, after.hips.normalized) < 1e-7);
  assert(Math.abs(after.shoes[0].minimumY-position[1]) < .0006);
  const floorY = actor.root.getWorldPosition(new THREE.Vector3()).y;
  const motions = await loadRetargetedMotions(actor.vrm, { avatarSha256: actor.profile.sha256, targetFloorY: floorY });
  return { actor, motions, row: { bodyType, position, yaw, floorY, modelOffsetY: actor.vrm.scene.position.y,
    floorAlignment: actor.profile.floorAlignment, hipsAfter100Updates: after.hips, shoeMinimumY: after.shoes[0].minimumY, ratio: motions.ratio } };
}

const original = await make('male', [0, 0, 0], 0);
const derivedA = await make('m2-male-lower-leg-v1', [1.2, 0, 1.15], .7);
const derivedB = await make('m2-male-lower-leg-v1', [-2, 1.7, .4], -1.1);
rows.push(original.row, derivedA.row, derivedB.row);
assert.equal(original.row.modelOffsetY, 0);
assert.equal(derivedA.row.modelOffsetY, .01944977603852749);
assert(Math.abs(derivedA.row.ratio-derivedB.row.ratio) < 1e-12, 'Retarget ratio depends on actor world floor');
let trackMaxDifference = 0;
for (const [key, clip] of Object.entries(derivedA.motions.clips)) {
  const other = derivedB.motions.clips[key];
  assert.equal(clip.tracks.length, other.tracks.length);
  clip.tracks.forEach((track, i) => { assert.equal(track.name, other.tracks[i].name); trackMaxDifference = Math.max(trackMaxDifference, maxDifference(track.values, other.tracks[i].values)); });
}
assert(trackMaxDifference < 1e-7, 'Actor world translation/yaw leaked into local retarget tracks');
const fallback = await loadRetargetedMotions(derivedA.actor.vrm, { avatarSha256: derivedA.actor.profile.sha256 });
const fallbackObservation = { explicitGroundRatio: derivedA.motions.ratio, omittedGroundRatio: fallback.ratio,
  originalRatio: original.motions.ratio, reason: 'Omitting targetFloorY falls back to shifted model origin, preserving the original hip/model height ratio.' };
assert(Math.abs(fallback.ratio-original.motions.ratio) < 1e-12);
const correctedOffset = derivedA.actor.vrm.scene.position.y;
derivedA.actor.vrm.scene.position.y = 0;
derivedA.actor.root.updateMatrixWorld(true);
const unplacedShoeMinimumY = points(derivedA.actor).shoes[0].minimumY;
derivedA.actor.vrm.scene.position.y = correctedOffset;
derivedA.actor.root.updateMatrixWorld(true);
assert(Math.abs(unplacedShoeMinimumY+.01944977603852749) < 1e-7);
const stablePeer = points(derivedB.actor);
const replacement = await make('m2-male-lower-leg-v1', [...original.actor.root.position.toArray()], 0);
original.actor.dispose();
assert(maxDifference(points(derivedB.actor).hips.raw, stablePeer.hips.raw) < 1e-12);
assert.equal(replacement.row.modelOffsetY, derivedA.row.modelOffsetY);
const motionUpdateSamples = [];
for (const data of [derivedA, derivedB]) {
  const actor = data.actor, motion = createMotion(actor.vrm, actor.root, data.motions, actor.profile.motion);
  const beforeMotionOffset = actor.vrm.scene.position.y;
  motion.setAction('idle'); motion.update(0, { speed: 0, moving: false, distanceDelta: 0, action: 'idle', turning: false });
  actor.update(0); actor.root.updateMatrixWorld(true);
  assert.equal(actor.vrm.scene.position.y, beforeMotionOffset);
  motionUpdateSamples.push({ actorGroundY: data.row.floorY, shoeMinimumY: points(actor).shoes.map(s => s.minimumY) });
  motion.dispose();
}
assert(Math.abs(motionUpdateSamples[0].shoeMinimumY[0]-(motionUpdateSamples[1].shoeMinimumY[0]-1.7)) < 1e-7);
for (const row of [derivedA, derivedB, replacement]) row.actor.dispose();
const files = ['prototype/src/foundation-avatar.js', 'prototype/src/foundation-profiles.js', 'prototype/src/motion-source.js', 'prototype/src/main.js', 'prototype/src/equipment.js',
  'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js'];
const identities = [];
for (const file of files) {
  const bytes = await fs.readFile(path.join(rootDir, file));
  if (!file.includes('node_modules/')) assert(bytes.equals(execFileSync('git', ['show', reviewedCommit+':'+file], { cwd: rootDir })), 'Reviewed runtime differs from fixed commit '+file);
  identities.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const threeVrmVersion = JSON.parse(await fs.readFile(path.join(rootDir, 'prototype/node_modules/@pixiv/three-vrm/package.json'), 'utf8')).version;
const report = { reviewedCommit, threeRevision: THREE.REVISION, threeVrmVersion, passed: true, CPUOnly: true, browserStarted: false, GPUUsed: false,
  textureFixture: 'Actual loaders and runtime modules with 1x1 texture decode fixture. No visual/texture validation.', rows,
  trackMaxDifferenceAcrossActorPositions: trackMaxDifference, fallbackObservation, unplacedShoeMinimumY, replacementOffsetY: replacement.row.modelOffsetY,
  normalizedRawNoCumulativeOffsetAfter100Updates: true, secondaryUnaffectedByOtherActorDisposal: true, modelOffsetPreservedThroughCreateMotion: true,
  motionUpdateSamples, identities, runtimeVisualAccepted: false };
await fs.writeFile(path.join(rootDir, 'evidence/m2-lower-leg-origin-review-v1/result.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
