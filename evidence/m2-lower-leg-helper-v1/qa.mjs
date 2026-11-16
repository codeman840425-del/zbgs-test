// Actual helper, loaders, equipment and retarget CPU regression. No rendering.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadGeometryAvatar, THREE } from '../../scripts/headless-avatar-node.mjs';
import { loadRetargetedMotions } from '../../prototype/src/motion-source.js';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const baseline = process.argv.includes('--baseline');
const helperSha256 = createHash('sha256').update(await fs.readFile(path.join(root, 'scripts/headless-avatar-node.mjs'))).digest('hex');
if (baseline) {
  // Existing external callers often supply location. Exercise the old helper
  // beyond that shim so its actual renderer prerequisite failure is retained.
  globalThis.location = { href: 'http://geometry.local/', search: '' };
  let failure = null;
  try { const result = await loadGeometryAvatar('male'); result.avatar.dispose(); }
  catch (error) { failure = String(error); }
  assert(failure?.includes('domElement'), 'Expected the original missing renderer prerequisite');
  await fs.writeFile(path.join(directory, 'baseline.json'), JSON.stringify({ helperSha256, actualFailure: failure,
    retargetReached: false, scope: 'The original helper fails before reaching its omitted floor/identity arguments. Their ratio effect was independently measured in m2-lower-leg-origin-review-v1.' }, null, 2)+'\n');
  console.log(JSON.stringify({ baselineFailurePreserved: true, failure }));
} else {
  const cases = [
    { body: 'male', sha256: '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff', offset: 0, ratio: 1.099875624630069 },
    { body: 'm2-male-lower-leg-v1', sha256: '968a9d997683cd99de4eea8f77965184eea6d7bc639a6ae062085928325189d8', offset: .01944977603852749, ratio: 1.1210927911518558 },
  ];
  const rows = [];
  for (const item of cases) {
    const { avatar, motions, scene } = await loadGeometryAvatar(item.body);
    try {
      const actual = avatar.getAssetProfile();
      assert.equal(actual.sha256, item.sha256);
      assert.equal(avatar.vrm.scene.position.y, item.offset);
      assert.equal(avatar.root.parent, scene);
      assert(Math.abs(motions.ratio-item.ratio) < 1e-12);
      const expected = await loadRetargetedMotions(avatar.vrm, { avatarSha256: actual.sha256, targetFloorY: avatar.root.getWorldPosition(new THREE.Vector3()).y });
      assert.equal(motions.ratio, expected.ratio);
      assert.deepEqual(motions.unavailableDances, expected.unavailableDances);
      assert.deepEqual(motions.dances, expected.dances);
      for (const key of Object.keys(expected.clips)) {
        const a = motions.clips[key], b = expected.clips[key];
        assert.equal(a.tracks.length, b.tracks.length);
        a.tracks.forEach((track, i) => { assert.equal(track.name, b.tracks[i].name); assert.deepEqual(track.values, b.tracks[i].values); });
      }
      for (let i = 0; i < 100; i++) { avatar.vrm.update(0); avatar.root.updateMatrixWorld(true); }
      const raw = avatar.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(new THREE.Vector3());
      const normalized = avatar.vrm.humanoid.getNormalizedBoneNode('hips').getWorldPosition(new THREE.Vector3());
      assert(raw.distanceTo(normalized) < 1e-7);
      assert.equal(avatar.vrm.scene.position.y, item.offset);
      let minimumY = Infinity;
      avatar.vrm.scene.traverse(mesh => {
        if (!mesh.isSkinnedMesh || !mesh.parent?.userData.equipmentId?.endsWith('-shoes')) return;
        for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) minimumY = Math.min(minimumY, mesh.localToWorld(mesh.getVertexPosition(i, new THREE.Vector3())).y);
      });
      assert(Math.abs(minimumY) < .0006);
      rows.push({ body: item.body, sha256: actual.sha256, modelOffsetY: avatar.vrm.scene.position.y, ratio: motions.ratio,
        shoeMinimumY: minimumY, normalizedRawHipDistanceM: raw.distanceTo(normalized),
        exactExplicitMainSemanticsMatched: true, availableDanceIds: motions.dances.map(d => d.id), unavailableDances: motions.unavailableDances });
    } finally { avatar.dispose(); }
  }
  const report = { passed: true, helperSha256, threeRevision: THREE.REVISION, rows, legacyOneArgumentAPI: true,
    textureDecodeFixture: '1x1 placeholders. Actual model/equipment/motion bytes and loaders run.', GPUUsed: false, browserStarted: false, runtimeVisualAccepted: false };
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report, null, 2));
}
