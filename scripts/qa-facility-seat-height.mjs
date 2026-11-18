// Geometry-only regression using the actual VRM, shoes, sitting clips and motion controller.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import path from 'node:path';

registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes: {type: 'json'}} : context);
}});
const {loadGeometryAvatar, THREE} = await import('./headless-avatar-node.mjs');
const {createMotion} = await import('../prototype/src/motion.js');
const root = path.resolve(import.meta.dirname, '..');
const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const bodyType = 'source-male-ab9a-release-v1';
// Seat mesh world maximum Y minus facility floor-frame Y, measured on the two shipped chairs.
const high = 0.4750000001490116;
const low = 0.47000000014901167;
const dt = 1 / 120;
const vector = new THREE.Vector3();

function visibleShoes(avatar) {
  const shoes = [];
  avatar.root.traverseVisible(mesh => {
    if (mesh.isSkinnedMesh && [mesh.material].flat().some(m => /Shoes/i.test(m.name))) shoes.push(mesh);
  });
  assert.equal(shoes.length, 1);
  const [mesh] = shoes;
  const {skinIndex, skinWeight} = mesh.geometry.attributes;
  const bySide = {left: [], right: []};
  for (const vertex of new Set(mesh.geometry.index.array)) {
    const sides = new Set();
    for (let j = 0; j < 4; j++) {
      if (skinWeight.getComponent(vertex, j) <= 0) continue;
      const bone = mesh.skeleton.bones[skinIndex.getComponent(vertex, j)];
      const match = /^J_Bip_([LR])_(LowerLeg|Foot|ToeBase)$/.exec(bone.name);
      assert.ok(match, 'Unexpected shoe influence ' + bone.name);
      sides.add(match[1] === 'L' ? 'left' : 'right');
    }
    assert.equal(sides.size, 1, 'Expected a single leg influencing the shoe vertex');
    bySide[[...sides][0]].push(vertex);
  }
  assert.ok(bySide.left.length && bySide.right.length);
  return {mesh, bySide};
}

function measure(avatar, motion, shoes) {
  const m = motion.getMetrics();
  assert.equal(m.action, 'sit');
  assert.equal(m.sitProgress, 1);
  avatar.root.updateWorldMatrix(true, true);
  shoes.mesh.skeleton.update();
  const soles = {};
  for (const [side, vertices] of Object.entries(shoes.bySide)) {
    let lowest;
    for (const vertex of vertices) {
      shoes.mesh.getVertexPosition(vertex, vector).applyMatrix4(shoes.mesh.matrixWorld);
      if (!lowest || vector.y < lowest.worldM[1]) lowest = {vertex, worldM: vector.toArray()};
    }
    soles[side] = {drawnVertices: vertices.length, lowest};
  }
  const hip = avatar.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(vector).toArray();
  return {heightM: m.seatHeight, actionTime: m.actionTime, sitProgress: m.sitProgress, rawHipWorldM: hip, soles};
}

async function seated(override) {
  const {avatar, motions} = await loadGeometryAvatar(bodyType);
  let motion;
  try {
    avatar.setDebugBody(false);
    motion = createMotion(avatar.vrm, avatar.root, motions, avatar.profile.motion);
    const calibrated = motion.getSeatHeight();
    const shoes = visibleShoes(avatar);
    if (override !== undefined) motion.setFacilitySeatHeight(override);
    for (let tick = 0; tick < 360; tick++) {
      motion.update(dt, {action: 'sit', moving: false, speed: 0, speaking: false});
      avatar.update(dt, {action: 'sit'});
    }
    const settled = measure(avatar, motion, shoes);
    const invalid = [undefined, NaN, Infinity, -Infinity, 0, -0.01, '0.47', true];
    for (const value of invalid) {
      assert.throws(() => motion.setFacilitySeatHeight(value), /invalid-facility-seat-height/);
      assert.equal(motion.getSeatHeight(), settled.heightM);
    }
    motion.setFacilitySeatHeight(null);
    assert.equal(motion.getSeatHeight(), calibrated);
    motion.refreshPose();
    avatar.update(0, {action: 'sit'});
    const restored = measure(avatar, motion, shoes);
    return {settled, restored, calibrationM: calibrated, assetSha256: avatar.getAssetProfile().sha256,
            sitEnterSeconds: motions.clips.sitEnter.duration};
  } finally {
    try { motion?.dispose(); } finally { avatar.dispose(); }
  }
}

const standard = await seated();
const raised = await seated(high);
const lowered = await seated(low);
assert.equal(standard.settled.heightM, standard.calibrationM);
assert.equal(raised.settled.heightM, high);
assert.equal(lowered.settled.heightM, low);
const delta = (a, b) => a.map((x, i) => x - b[i]);
const hipDelta = delta(raised.settled.rawHipWorldM, lowered.settled.rawHipWorldM);
assert.ok(Math.abs(hipDelta[1] - (high-low)) < 1e-6);
assert.ok(Math.hypot(hipDelta[0], hipDelta[2]) < 1e-6);
const soleDelta = {};
for (const side of ['left', 'right']) {
  const a = raised.settled.soles[side].lowest, b = lowered.settled.soles[side].lowest;
  soleDelta[side] = {heightM: a.worldM[1] - b.worldM[1], highVertex: a.vertex, lowVertex: b.vertex};
  assert.ok(Math.abs(soleDelta[side].heightM) < 0.001, 'Shoe height changed by more than one millimetre');
}
for (const pose of [raised, lowered]) {
  assert.equal(pose.settled.actionTime, standard.settled.actionTime);
  assert.equal(pose.restored.actionTime, standard.restored.actionTime);
  assert.ok(Math.hypot(...delta(pose.restored.rawHipWorldM, standard.restored.rawHipWorldM)) < 1e-6);
  for (const side of ['left', 'right']) {
    assert.ok(Math.hypot(...delta(pose.restored.soles[side].lowest.worldM,
                                  standard.restored.soles[side].lowest.worldM)) < 1e-6);
  }
}

const inputs = Object.fromEntries([
  'prototype/public/assets/source-outfit-release-v1/body.vrm',
  'prototype/public/assets/raw-male-equipment-v1/raw-male-ab9a-flat-shoes-v1.glb',
  'prototype/public/assets/motion/UAL1_Standard.glb',
  'prototype/src/motion.js', 'scripts/headless-avatar-node.mjs',
].map(file => [file, digest(file)]));
assert.equal(inputs['prototype/public/assets/source-outfit-release-v1/body.vrm'], standard.assetSha256);
assert.equal(standard.assetSha256, 'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4');
assert.equal(inputs['prototype/public/assets/raw-male-equipment-v1/raw-male-ab9a-flat-shoes-v1.glb'],
             '9c69190ffd2efc29f8e9b4d04cccef631b78c1fa744689fa57af1f416e70e756');
console.log(JSON.stringify({
  schema: 'character-seat-height-geometry-v1', replay: 'node scripts/qa-facility-seat-height.mjs', inputs,
  bodyType, outfitIndex: 0, floorYM: 0, simulationFrames: 360, dt,
  sourceHeights: {adapter: 't9', receipt: 'formal-round/seat-character/receipts.json',
                  receiptSha256: '0a2d18232f530cdb1e74101c1a30bdeb845f9a1e01eae3f11d20ec861230d532',
                  units: 'metres above facility floor'},
  standard, raised, lowered, raisedMinusLowered: {rawHipWorldM: hipDelta, soles: soleDelta},
  invalidOverridesRejected: ['undefined', 'NaN', '+Infinity', '-Infinity', '0', '-0.01', '"0.47"', 'true'],
  scope: 'CPU pose and drawn shoe geometry at two measured heights. Room contact geometry, navigation, leases and rendered fit require the facility host.',
}, null, 2));
