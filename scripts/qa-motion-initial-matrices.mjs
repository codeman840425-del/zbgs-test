// No browser/framework. Exercise the production createMotion constructor with
// real Three SkinnedMesh + semantic humanoid test double, before any rendering.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { createMotion } from '../prototype/src/motion.js';

function fixture(position, yaw = 0) {
  const root = new THREE.Group(), scene = new THREE.Group(), bones = {};
  root.add(scene);
  function bone(name, parent, xyz) {
    const b = new THREE.Bone(); b.name = name; b.position.fromArray(xyz);
    parent.add(b); bones[name] = b; return b;
  }
  const hips = bone('hips', scene, [0, 1, 0]);
  const spine = bone('spine', hips, [0, .15, 0]);
  const chest = bone('chest', spine, [0, .15, 0]);
  const upperChest = bone('upperChest', chest, [0, .08, 0]);
  const neck = bone('neck', upperChest, [0, .1, 0]);
  bone('head', neck, [0, .1, 0]);
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const upper = bone(side + 'UpperLeg', hips, [sign * .06, -.05, 0]);
    const lower = bone(side + 'LowerLeg', upper, [0, -.4, 0]);
    const foot = bone(side + 'Foot', lower, [0, -.4, 0]);
    bone(side + 'Toes', foot, [0, -.04, .12]);
    const shoulder = bone(side + 'Shoulder', upperChest, [sign * .08, 0, 0]);
    const arm = bone(side + 'UpperArm', shoulder, [sign * .1, 0, 0]);
    const elbow = bone(side + 'LowerArm', arm, [sign * .22, 0, 0]);
    bone(side + 'Hand', elbow, [sign * .18, 0, 0]);
  }
  root.updateMatrixWorld(true);
  const positions = [], indices = [], weights = [], joints = [];
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    joints.push(bones[side + 'Foot']);
    const joint = joints.length - 1;
    for (const x of [-.025, .025]) for (const y of [.02, .07]) for (const z of [-.05, .15]) {
      positions.push(sign * .06 + x, y, z);
      indices.push(joint, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const material = new THREE.MeshBasicMaterial(); material.name = 'Regression_Shoes';
  const mesh = new THREE.SkinnedMesh(geometry, material);
  scene.add(mesh); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(joints));
  // Match the integration hazard: move an already-bound avatar, then call
  // createMotion immediately. There is no renderer to refresh bind matrices.
  root.position.fromArray(position); root.rotation.y = yaw;
  const vrm = { scene, humanoid: {
    getNormalizedBoneNode: name => bones[name],
    getRawBoneNode: name => bones[name],
  }};
  const motions = { clips: {
    idle: new THREE.AnimationClip('fixtureIdle', 1, []),
    walk: new THREE.AnimationClip('fixtureWalk', 1, []),
  }, walkDistance: 1 };
  return { vrm, root, motions, mesh };
}

function measure(factory, position, yaw) {
  const f = fixture(position, yaw);
  try {
    const m = factory(f.vrm, f.root, f.motions);
    const metrics = m.getMetrics();
    const calibration = m.getFootLockCalibration();
    for (const foot of metrics.feet)
      assert.match(foot.landmarkMethod, /weighted Shoes patch/, 'Must exercise actual skin calibration, not fallback');
    return { position, yaw, sourceGroundLift: metrics.sourceGroundLift,
      selected: calibration.map(x => x.selection.selectedVertexCount),
      patches: calibration.map(x => Object.fromEntries(Object.entries(x.selection.patches).map(([kind, refs]) => [kind, refs.map(r => r.vertex)]))),
    };
  } finally { f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.mesh.skeleton.dispose(); }
}

const cases = [[[0, 0, 0], 0], [[-.5, 0, 1.05], 0], [[2, .75, -1.1], 0], [[-1.2, .3, 2.4], Math.PI / 3]];
const results = cases.map(([p, yaw]) => measure(createMotion, p, yaw));
const reference = results[0];
assert.ok(Math.abs(reference.sourceGroundLift + .02) < 1e-7, 'Known sole plane must calibrate to -2 cm');
assert.deepEqual(reference.selected, [8, 8]);
for (const result of results.slice(1)) {
  assert.ok(Math.abs(result.sourceGroundLift - reference.sourceGroundLift) < 1e-7, 'Root placement changed local sole height');
  assert.deepEqual(result.patches, reference.patches, 'Root placement changed local heel/toe patches');
  assert.deepEqual(result.selected, reference.selected);
}

// Sensitivity control: use the same real factory text but revert ONLY its
// constructor matrix refresh in an in-memory module. Product files stay intact.
const sourceUrl = new URL('../prototype/src/motion.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const prefix = source.slice(0, source.indexOf('const rest ='));
assert.ok(prefix.includes('root.updateMatrixWorld(true)'), 'Production constructor must refresh actual skin bind matrices');
const importable = source.replace('from "./segment-triangle-projection.js"', `from ${JSON.stringify(new URL('../prototype/src/segment-triangle-projection.js', import.meta.url).href)}`);
const staleSource = importable.replace('root.updateMatrixWorld(true)', 'root.updateWorldMatrix(true, true)')
  .replace('from "three"', `from ${JSON.stringify(new URL('../prototype/node_modules/three/build/three.module.js', import.meta.url).href)}`);
const stale = await import('data:text/javascript;base64,' + Buffer.from(staleSource).toString('base64'));
let negativeControlFailed = false;
try {
  const old = measure(stale.createMotion, [2, .75, -1.1], 0);
  negativeControlFailed = Math.abs(old.sourceGroundLift - reference.sourceGroundLift) > 1e-7 || JSON.stringify(old.patches) !== JSON.stringify(reference.patches);
} catch { negativeControlFailed = true; }
assert.equal(negativeControlFailed, true, 'Regression must reject the old constructor behavior');
console.log(JSON.stringify({ passed: true, realProductionFactory: true,
  sourceSHA256: createHash('sha256').update(source).digest('hex'), results, negativeControlFailed,
  limits: 'Synthetic humanoid adapter shares raw/normalized nodes; real Three skinning and real production constructor. This checks placement-invariant calibration, not VRM retargeting, browser rendering, gait or garment contact.' }, null, 2));
