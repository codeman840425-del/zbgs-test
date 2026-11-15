// Exercise real AnimationMixer action lookup, not only clip metadata.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {parseNormalizedMotion} from '../prototype/src/normalized-motion.js';

const output = process.argv[2];
if (output && fs.existsSync(output)) throw Error('Refuse to overwrite evidence');
const avatar = '1'.repeat(64);
const results = [];
for (const exportedUuid of [undefined, '11111111-2222-4333-8444-555555555555']) {
  const root = new THREE.Group(), hips = new THREE.Bone();
  hips.name = 'normalized_hips'; root.add(hips);
  const vrm = {humanoid:{getNormalizedBoneNode:name=>name==='hips'?hips:null}};
  const source = values => ({schema:'normalized-vrm-motion.1',
    coordinateSpace:'three-vrm-3.5.5-normalized-local-absolute', avatarSha256:avatar,
    sourceClipSha256:'2'.repeat(64), normalizedRigSha256:'3'.repeat(64), footwearSha256:'4'.repeat(64),
    clip:{name:'SharedExportName',duration:1,...(exportedUuid?{uuid:exportedUuid}:{}),
      tracks:[{name:'hips.position',type:'vector',times:[0,1],values}]}});
  const a = source([0,0,0, 1,0,0]), b = source([0,0,0, 0,0,2]);
  const originals = JSON.stringify([a,b]);
  const entry = {clip:'SharedExportName', duration:1};
  const ca = parseNormalizedMotion(a,vrm,avatar,entry), cb = parseNormalizedMotion(b,vrm,avatar,entry);
  const mixer = new THREE.AnimationMixer(root), aa = mixer.clipAction(ca), ab = mixer.clipAction(cb);
  aa.play(); mixer.update(.5); const first = hips.position.toArray();
  mixer.stopAllAction(); ab.reset().play(); mixer.update(.5); const second = hips.position.toArray();
  mixer.stopAllAction(); aa.reset().play(); mixer.update(.5); const restored = hips.position.toArray();
  const row = {sourceUuid:exportedUuid?'duplicated':'absent', actionsDistinct:aa!==ab,
    first,second,restored,inputUnchanged:JSON.stringify([a,b])===originals,passed:false};
  try {
    assert.notEqual(aa,ab,'Independent imports must not reuse the same mixer action');
    assert.deepEqual(first,[.5,0,0]); assert.deepEqual(second,[0,0,1]); assert.deepEqual(restored,first);
    assert(row.inputUnchanged); row.passed=true;
  } catch (error) {row.error=String(error);}
  mixer.stopAllAction(); mixer.uncacheRoot(root); results.push(row);
}
const report = {threeVersion:THREE.REVISION, results, passed:results.every(x=>x.passed),
  scope:'Two separate clips with identical display names and absent/duplicated export UUIDs must play their own track data and restore independently. No animation shape change.'};
if (output) fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (!report.passed) process.exitCode=1;
