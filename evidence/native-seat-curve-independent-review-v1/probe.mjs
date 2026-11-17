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
  for (let tick = 0; tick < seconds * 120; tick++) {
    scene.simulate(1 / 120);
    if (tick === 0 || (tick+1) % 120 === 0) samples.push({t:scene.simulationTime,
      position:scene.actor.root.position.toArray(), yaw:scene.yaw, speed:scene.speed,
      mode:scene.mode, pathTurn:scene.pathTurn, target:scene.target,
      task:scene.behaviorTasks.get('shallow-wall-walk')});
  }
  const result = {start,goal,desk,recoveries,events,samples, final:{mode:scene.mode, target:scene.target,
    position:scene.actor.root.position.toArray(),yaw:scene.yaw, task:scene.behaviorTasks.get('shallow-wall-walk')}};
  if (kind === 'cancel') {
    scene.requestBehavior({requestId:'cancel-to-idle',kind:'idle'});
    for (let i=0; i<120; i++) scene.simulate(1/120);
    result.afterCancel = {target:scene.target,mode:scene.mode,task:scene.behaviorTasks.get('shallow-wall-walk')};
  }
  return result;
}

const direct = run(source, 'direct', 10);
const task = run(source, 'task', 61);
const cancel = run(source, 'cancel', 2);
assert(direct.recoveries > 1000);
assert.deepEqual(direct.final.position, direct.events[0].position);
assert.equal(direct.final.mode, 'walk');
assert(direct.final.target);
assert.equal(task.final.task.state, 'failed');
assert.equal(task.final.task.reason, 'timeout');
assert.equal(cancel.afterCancel.task.state, 'cancelled');
assert.equal(cancel.afterCancel.target, null);
const baseline = execFileSync('git',['show','a462e8ff:prototype/src/main.js']).toString();
const before = run(baseline, 'direct', 10);
assert.equal(before.final.mode, 'idle');
assert.equal(before.final.target, null);
const inputs = {};
for (const path of ['prototype/src/main.js','scripts/qa-native-seat-curve-recovery.mjs',
  'prototype/src/behavior-tasks.js','prototype/src/seat-lease.js','prototype/src/turn-policy.js',
  'evidence/native-seat-curve-recovery-v1/result.json']) {
  const bytes = await fs.readFile(path);
  inputs[path] = {sha256:sha(bytes),bytes:bytes.length};
}
await fs.writeFile(new URL('main.snapshot.js',out), source);
await fs.writeFile(new URL('author-qa.snapshot.mjs',out), authorQA);
const report = {schema:'native-seat-curve-independent-review-v1',status:'reproduced-navigation-livelock',
  inputs,baselineSHA:sha(baseline),direct,task,cancel,before,
  limitation:'Real main.js controller/navigation/tasks execute, but motion pose is author CPU fixture. No GPU, skin, foot or visual claim.'};
await fs.writeFile(new URL('result.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({testedSHA:sha(source),recoveries:direct.recoveries,direct:direct.final,
  timeout:task.final.task,cancel:cancel.afterCancel,before:before.final},null,2));
