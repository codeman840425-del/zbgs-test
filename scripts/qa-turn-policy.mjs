import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import outputs from './project-output.cjs';
import { createTurnPolicy, turnAngleDelta } from '../prototype/src/turn-policy.js';

// This archived check expects a fixed support-shoe orientation. The current
// pivot planner is exercised by qa-turn-transfer-clock.mjs and facility QA.
const root=await outputs.productionRoot();
const out=await outputs.projectOutput(path.join(root,'output','turn-policy','regression.json'),root);
const report = [];
function run(name, target, fps = 60, steer = null) {
  const planner = createTurnPolicy();
  planner.reset(0);
  if (name.startsWith('360')) planner.requestRotation(target);
  else planner.requestHeading(target);
  let previous = planner.sample(), maxStep = 0, maxPlantedYawChange = 0, retargeted = false;
  const frames = [];
  for (let frame = 0; frame < fps * 8; frame++) {
    const time = frame / fps;
    if (steer && !retargeted && time >= steer.at) {
      const before = planner.sample();
      steer.stop ? planner.stop() : planner.requestHeading(steer.yaw);
      const after = planner.sample();
      assert.equal(after.yaw, before.yaw, 'command must not snap root');
      assert.deepEqual(after.feet, before.feet, 'command must not snap airborne/planted shoes');
      retargeted = true;
    }
    const state = planner.update(1 / fps);
    assert.ok(state.feet.some((f) => f.contact), 'retain at least one support foot');
    for (let i = 0; i < 2; i++) {
      if (previous.feet[i].contact && state.feet[i].contact)
        maxPlantedYawChange = Math.max(maxPlantedYawChange, Math.abs(state.feet[i].yaw - previous.feet[i].yaw));
    }
    maxStep = Math.max(maxStep, Math.abs(state.yaw - previous.yaw));
    frames.push({ time: (frame + 1) / fps, ...state });
    previous = state;
    if (!state.active) break;
  }
  const last = frames.at(-1);
  assert.equal(last.active, false, 'must finish');
  assert.ok(frames[0].yaw !== 0, 'first update gives facing feedback');
  assert.ok(frames[0].feet.some((f) => f.lift > 0), 'first update begins visible step');
  assert.ok(maxPlantedYawChange < 1e-12, 'support orientation must remain locked');
  if (!steer) assert.ok(Math.abs(last.yaw - target) < 1e-7);
  if (steer && !steer.stop) assert.ok(Math.abs(turnAngleDelta(last.yaw, steer.yaw)) < 1e-7);
  if (!steer && Math.abs(target) === Math.PI) assert.ok(last.time >= 1 && last.time <= 1.5);
  if (steer?.stop) assert.ok(last.time - steer.at <= 0.51, 'stop lands and gathers within bounded time');
  report.push({ name, fps, seconds: last.time, finalYaw: last.yaw, maxFrameYaw: maxStep, maxPlantedYawChange, frames });
}
for (const fps of [30, 60, 120]) {
  run('180 left', Math.PI, fps); run('180 right', -Math.PI, fps); run('360 continuous', Math.PI * 2, fps);
  run('retarget midstep', Math.PI, fps, { at: 0.27, yaw: -Math.PI / 2 });
  run('stop midstep', Math.PI, fps, { at: 0.27, stop: true });
}
const p = createTurnPolicy(); p.reset(3.1); p.requestHeading(-3.1);
assert.ok(p.sample().remaining > 0 && p.sample().remaining < 0.1, 'wrap takes shortest arc');
p.update(1/60); const at = p.sample(); p.requestHeading(-3.1); assert.deepEqual(p.sample(), at, 'same destination is idempotent');
assert.throws(() => p.update(0.2), /substeps/);
assert.throws(() => p.requestHeading(NaN), /finite/);
const previousStepId = p.sample().stepId;
p.reset(p.sample().yaw); p.requestHeading(1); p.update(1/60);
assert.ok(p.sample().stepId > previousStepId, 'new sessions cannot reuse contact step ids');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ scope: 'Pure planner only; no mesh, foot IK, visual or new-body acceptance claimed', report }, null, 2));
console.table(report.map(({ frames, ...summary }) => summary));
