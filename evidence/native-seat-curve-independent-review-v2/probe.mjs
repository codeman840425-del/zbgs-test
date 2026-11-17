import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createBehaviorTasks} from '../../prototype/src/behavior-tasks.js';
import {createSeatLeases} from '../../prototype/src/seat-lease.js';
import {createTurnPolicy} from '../../prototype/src/turn-policy.js';

const out = new URL('./', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const source = await fs.readFile('prototype/src/main.js', 'utf8');
const authorQA = await fs.readFile('scripts/qa-native-seat-curve-recovery.mjs', 'utf8');
const original = JSON.parse(await fs.readFile('evidence/native-factory-room-58f0-v1/report.json', 'utf8'));
const stopped = original.states.find(x => x.name === 'stopped').snapshot;
const fixture = {
  position: stopped.position, yaw: stopped.facing,
  internalSpeed: original.states.find(x => x.name === 'afterWalk').snapshot.speed - 2.5 * stopped.modeTime,
  seatBack: stopped.motion.seatBack, seatApproach: stopped.motion.seatApproach, chair: stopped.chair,
};
// Reuse only the author's environment shell. Its result writer is never run.
// The actual main.js navigation, class, task, turn and lease implementations execute.
const environmentCode = authorQA.slice(authorQA.indexOf('function environment('), authorQA.indexOf('\nfunction run('));
assert(environmentCode.includes('function actor(start)'));
const environment = new Function('THREE', 'createBehaviorTasks', 'createSeatLeases', 'createTurnPolicy', 'fixture',
  environmentCode + '\nreturn environment;')(THREE, createBehaviorTasks, createSeatLeases, createTurnPolicy, fixture);

function run(text, kind, seconds) {
  const api = environment(text);
  const desk = api.obstacles.find(o => o.name === 'desk');
  const leftFace = desk.x - desk.hw;
  const start = [leftFace - 0.000001, -1.6];
  const goal = [leftFace - 0.05, -0.6];
  const {scene} = api.actor(start);
  scene.yaw = 0.1;
  scene.speed = 0.835;
  scene.turnPolicy.reset(scene.yaw);
  assert.equal(api.blocked(...start), false);
  assert.equal(api.blocked(...goal), false);
  assert.equal(api.lineClear(start, goal), true);
  let recoveries = 0;
  const events = [];
  if (scene.recoverBlockedPath) {
    const recover = scene.recoverBlockedPath.bind(scene);
    scene.recoverBlockedPath = () => {
      recoveries++;
      if (events.length < 6) events.push({t:scene.simulationTime, position:scene.actor.root.position.toArray(),
        yaw:scene.yaw, speed:scene.speed, target:scene.target, afterWalk:scene.afterWalk});
      recover();
    };
  }
  if (kind === 'direct') assert.equal(scene.go(...goal), true);
  else scene.requestBehavior({requestId:'shallow-wall-walk', kind:'walk', payload:{x:goal[0],z:goal[1]}});
  const samples = [];
  let unsafeSegments = 0, pivotSeen = false;
  const previousPosition = scene.actor.root.position.clone();
  for (let tick = 0; tick < seconds * 120; tick++) {
    scene.simulate(1 / 120);
    const p = scene.actor.root.position;
    if (api.blocked(p.x,p.z) || !api.lineClear([previousPosition.x,previousPosition.z],[p.x,p.z])) unsafeSegments++;
    previousPosition.copy(p);
    pivotSeen ||= scene.turnPolicy.sample().kind === 'pivot';
    if (tick === 0 || (tick+1) % 120 === 0) samples.push({t:scene.simulationTime,
      position:scene.actor.root.position.toArray(), yaw:scene.yaw, speed:scene.speed,
      mode:scene.mode, pathTurn:scene.pathTurn, target:scene.target,
      task:scene.behaviorTasks.get('shallow-wall-walk')});
  }
  const result = {start,goal,desk,recoveries,events,samples,unsafeSegments,pivotSeen, final:{mode:scene.mode, target:scene.target,
    position:scene.actor.root.position.toArray(),yaw:scene.yaw, task:scene.behaviorTasks.get('shallow-wall-walk')}};
  if (kind === 'cancel') {
    scene.requestBehavior({requestId:'cancel-to-idle',kind:'idle'});
    for (let i=0; i<120; i++) scene.simulate(1/120);
    result.afterCancel = {target:scene.target,mode:scene.mode,task:scene.behaviorTasks.get('shallow-wall-walk')};
  }
  return result;
}

assert.equal(sha(source), 'cd075d9a683cf1828782f7b6aea0e1bcf6adb4c79d5f6a9e57cabe063e08e7c3');
const checks = [];
const direct = run(source, 'direct', 10);
const task = run(source, 'task', 10);
for (const row of [direct, task]) {
  assert.equal(row.recoveries, 1);
  assert.equal(row.final.mode, 'idle');
  assert.equal(row.final.target, null);
  assert.equal(row.unsafeSegments, 0);
  assert.equal(row.pivotSeen, true);
  assert(Math.hypot(row.final.position[0]-row.goal[0], row.final.position[2]-row.goal[1]) < .018);
}
assert.equal(task.final.task.state, 'completed');
checks.push({name:'unchanged shallow-wall counterexample reaches destination, direct and task',passed:true});
const oldSource = await fs.readFile('evidence/native-seat-curve-independent-review-v1/main.snapshot.js', 'utf8');
const prior = run(oldSource, 'direct', 10);
assert.equal(prior.recoveries, 1200);
assert.equal(prior.final.mode, 'walk');
checks.push({name:'preserved v1 snapshot still reproduces 1200 stationary recoveries',passed:true});

const alignment = '(Math.abs(angle) > .27 || (this.pathTurn === "recover" && dist > .10 && Math.abs(angle) > .06))';
assert(source.includes(alignment));
const brokenAlignment = source.replace(alignment, 'Math.abs(angle) > .27');
const bounded = run(brokenAlignment, 'task', 2);
assert.equal(bounded.recoveries, 2);
assert.equal(bounded.final.mode, 'idle');
assert.equal(bounded.final.task.state, 'failed');
assert.equal(bounded.final.task.reason, 'path-recovery-no-progress');
checks.push({name:'test-only removal of recovered pivot proves real collision loop is bounded',passed:true});

const progressRows = [];
for (const progressM of [0, .00049, .00051, .01]) {
  const api = environment(source), {scene} = api.actor([-1, 1]);
  scene.go(-1, 2);
  scene.recoverBlockedPath();
  scene.actor.root.position.z += progressM;
  scene.recoverBlockedPath();
  const expectedStalled = progressM < .0005;
  assert.equal(scene.mode, expectedStalled ? 'idle' : 'walk');
  assert.equal(Boolean(scene.target), !expectedStalled);
  progressRows.push({progressM,mode:scene.mode,target:scene.target,recovery:scene.blockedPathRecovery});
}
checks.push({name:'same-goal guard retains progress above .5mm and terminates sub-tolerance net motion',passed:true});

const api = environment(source);
const {scene} = api.actor([fixture.position[0],fixture.position[2]]);
scene.requestBehavior({requestId:'forced-stalled-sit',kind:'sit'});
assert(api.seatLeases.forSeat('room-chair-1'));
scene.recoverBlockedPath();
scene.recoverBlockedPath();
const failedSit = scene.behaviorTasks.get('forced-stalled-sit');
assert.equal(failedSit.state,'failed');
assert.equal(failedSit.reason,'path-recovery-no-progress');
assert.equal(api.seatLeases.forSeat('room-chair-1'), null);
assert.equal(scene.afterWalk,null);
assert.equal(scene.target,null);
assert.equal(scene.blockedPathRecovery,null);
scene.requestBehavior({requestId:'fresh-sit',kind:'sit'});
for (let i=0; i<20*120; i++) scene.simulate(1/120);
const freshSit=scene.behaviorTasks.get('fresh-sit');
assert.equal(freshSit.state,'completed');
assert.equal(scene.mode,'sit');
assert.equal(api.seatLeases.forSeat('room-chair-1').state,'occupied');
checks.push({name:'directly exercised no-progress sit fails/releases and fresh real route completes',passed:true});

function openTrace(text) {
  const api = environment(text), {scene} = api.actor([-2,2]);
  scene.yaw=0;scene.speed=.85;scene.turnPolicy.reset(0);
  scene.go(1.5,2.2);
  const trace=[];
  for (let i=0;i<960;i++) {
    scene.simulate(1/120);
    trace.push([scene.actor.root.position.x,scene.actor.root.position.z,scene.yaw,scene.speed]);
  }
  return trace;
}
const openBefore=openTrace(oldSource),openAfter=openTrace(source);
assert.deepEqual(openAfter,openBefore);
checks.push({name:'open-space 960 substeps unchanged from independent v1 snapshot',passed:true,traceSha256:sha(JSON.stringify(openAfter))});

const inputs={};
for(const path of ['prototype/src/main.js','scripts/qa-native-seat-curve-recovery.mjs',
  'scripts/qa-native-seat-curve-recovery-v2.mjs','prototype/src/behavior-tasks.js',
  'prototype/src/seat-lease.js','prototype/src/turn-policy.js',
  'evidence/native-seat-curve-recovery-v2/result.json']) {
  const bytes=await fs.readFile(path);inputs[path]={sha256:sha(bytes),bytes:bytes.length};
}
await fs.writeFile(new URL('main.snapshot.js',out),source);
const report={schema:'native-seat-curve-independent-review-v2',status:'no-new-blocker-in-bounded-cpu-retest',
  inputs,checks,direct,task,prior,bounded,progressRows,failedSit,freshSit,
  limitation:'Real controller/task/turn/lease, minimal author motion fixture. Recovery-progress branch tested by explicit recovery calls; no physical collision inferred for those branch tests. No GPU, foot, skin or visual acceptance.'};
await fs.writeFile(new URL('result.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({testedSHA:sha(source),checks,direct:direct.final,task:task.final},null,2));

