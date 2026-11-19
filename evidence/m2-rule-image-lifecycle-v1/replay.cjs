// Recheck the two captures and their actual ordinary packages. Read-only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {verifyRelease} = require('../../scripts/qa-record-image-lifecycle.cjs');
const root = path.resolve(__dirname,'../..');
const read = file => fs.readFileSync(file);
const json = file => JSON.parse(read(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const result = mode => json(path.join(__dirname,mode,'report.json'));

function resources(folder, report) {
  const game = path.join(root,'output',folder,'game');
  const manifest = read(path.join(game,'runtime-package.json'));
  assert.equal(sha(manifest),report.manifestSha);
  const inventory = JSON.parse(manifest);
  assert.deepEqual(inventory.runtime,report.runtime);
  const data = {};
  for (const file of inventory.files) {
    const bytes = read(path.join(game,file.path));
    assert.equal(bytes.length,file.bytes);
    assert.equal(sha(bytes),file.sha256);
    if (!file.path.endsWith('.js') && !file.path.endsWith('.html') && file.path !== 'build-info.json')
      data[file.path] = file.sha256;
  }
  return data;
}
const before = result('before'), after = result('after'), denial = result('before-release-check');
assert.deepEqual(before.inputs,after.inputs);
assert.deepEqual(before.inputs,denial.inputs);
assert.equal(before.manifestSha,denial.manifestSha);
assert.equal(before.status,'measured-development-only');
assert.equal(after.status,'measured-development-only');
assert.match(denial.failure,/Wrong image release set at remove-first/);
const beforeInputs = resources('m2-rule-formal-build-v1',before);
assert.deepEqual(resources('m2-rule-image-release-build-v1',after),beforeInputs);
assert.equal(before.runs.length,2);
assert.equal(after.runs.length,2);
for (const run of before.runs)
  assert.throws(() => verifyRelease(run.trace,run.phases),/Wrong image release set at remove-first/);
for (const run of after.runs) {
  assert.deepEqual(verifyRelease(run.trace,run.phases),run.release);
  assert.equal(run.uploadChecks.length,2);
  for (const report of run.uploadChecks) {
    assert.equal(report.status,'verified');
    assert.equal(report.reupload.count,1);
    assert.equal(report.framebuffer.fingerprints.before,report.framebuffer.fingerprints.afterUpload);
    assert.equal(report.framebuffer.fingerprints.before,report.framebuffer.fingerprints.restored);
    assert(report.framebuffer.actorContribution.changedPixels>0);
  }
}
const cold = result('game-cold');
assert.equal(cold.status,'functional-pass');
assert(cold.sessions.length===2 && cold.sessions.every(s => s.build === after.runtime.sourceDigest));
console.log(JSON.stringify({before:before.runtime.buildId,after:after.runtime.buildId,
  unchangedDataFiles:Object.keys(beforeInputs).length,actors:after.inputs.map(a => a.id),
  releaseChecks:after.runs.map(r => r.release),coldGameProcesses:cold.sessions.length}));
