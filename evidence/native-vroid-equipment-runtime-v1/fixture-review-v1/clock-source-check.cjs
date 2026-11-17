const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const folder = path.join(root, 'evidence/native-vroid-equipment-runtime-v1/room-compare-v4');
const source = fs.readFileSync(path.join(folder, 'capture.cjs'), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(folder, 'request.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const text = source.slice(source.indexOf('function createFrameClock()'), source.indexOf('async function startServer()')).trim();
const createFrameClock = vm.runInNewContext('(' + text + ')');
assert.equal(hash(createFrameClock.toString()), spec.clockSourceSha256);
// The first actual RAF timestamp may precede the performance.now sampled while
// scheduling it. The new clock must use RAF's own epoch in exactly that case.
const initializedAt = 2000;
const clock = createFrameClock();
const first = clock.advance(1999);
const next = clock.advance(2015);
assert.ok(first.timestamp < initializedAt);
assert.equal(first.appliedDeltaSeconds, 0);
assert.equal(next.rawDeltaSeconds, .016);
assert.equal(next.appliedSeconds, .016);
const checks = [];
for (const [file, expected] of [['capture.cjs', spec.captureScriptSha256],
  ['overlay-source.js', spec.overlaySourceSha256], ['overlay.mjs', spec.bundleSha256],
  ['cpu-preflight.json', spec.cpuPreflightSha256]]) {
  assert.equal(hash(fs.readFileSync(path.join(folder, file))), expected);
  checks.push(file);
}
const fixed = path.join(root, 'experiments/native-mtoon-fixed-v1');
for (const [file, expected] of Object.entries(spec.runtimeSourcePins)) {
  assert.equal(hash(fs.readFileSync(path.join(fixed, file))), expected, file);
}
for (const identity of spec.inputs) {
  assert.equal(hash(fs.readFileSync(path.join(root, identity.path))), identity.sha256);
}
const result = { schema: 'native-equipment-clock-source-independent-check-v1',
  status: 'passed-cpu-only', firstRafPredatesSchedulingSample: true,
  initialDeltaSeconds: first.appliedDeltaSeconds, followingDeltaSeconds: next.appliedDeltaSeconds,
  clockSourceSha256: hash(createFrameClock.toString()), pinnedFixtureFiles: checks,
  runtimeSourcePinsChecked: Object.keys(spec.runtimeSourcePins).length, resourcePinsChecked: spec.inputs.length,
  limits: 'No browser, CSS layout measurement, GPU, video or native garment execution in this check' };
fs.writeFileSync(path.join(__dirname, 'clock-source-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(result);
