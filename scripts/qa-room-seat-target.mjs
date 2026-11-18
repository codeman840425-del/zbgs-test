// Real room request and lease methods with a CPU-only action/pose fixture.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {createBehaviorTasks} from '../prototype/src/behavior-tasks.js';
import {createSeatLeases} from '../prototype/src/seat-lease.js';
import {createTurnPolicy} from '../prototype/src/turn-policy.js';

const chairId = 'room-chair-1';
const unknownId = 'company:unregistered-sofa:left';
const checks = [];

function fixture(source, tasksFactory = createBehaviorTasks) {
  const begin = source.indexOf('class CharacterScene extends Phaser.Scene {');
  const end = source.indexOf('\nfunction average(', begin);
  assert.ok(begin >= 0 && end > begin, 'Cannot find the room controller');
  const seatLeases = createSeatLeases(), chair = {parent: true};
  const Scene = new Function('Phaser', 'createBehaviorTasks', 'createTurnPolicy', 'document', 'performance',
    'seatLeases', 'chair', 'turnLegacy', source.slice(begin, end) + '\nreturn CharacterScene;')(
    {Scene: class {}}, tasksFactory, createTurnPolicy, {hidden:false}, performance, seatLeases, chair, false);
  const actor = {root:new THREE.Group(), livePresentation:{getState:() => ({greeting:null}), setAction(){}}};
  const metrics = {gait:0, stopTime:1, sitProgress:0};
  const controller = new Scene({avatar:actor, motion:{}, actorId:'room-test', position:[0,0,0]});
  controller.go = (x, z) => {controller.target = [x,z]; return true;};
  controller.action = name => {
    controller.setMode(name);
    if (name === 'sit') metrics.sitProgress = 1;
    return true;
  };
  const tick = () => controller.updateBehavior(1 / 120, metrics);
  const finishWalk = () => {actor.root.position.set(1,0,1); controller.target = null; tick();};
  const request = (requestId, kind, payload, queue) => controller.requestBehavior({requestId, kind, payload, queue});
  return {chair, request, tasks:controller.behaviorTasks, lease:() => seatLeases.forSeat(chairId), tick, finishWalk};
}

const args = process.argv.slice(2);
if (args[0] === '--reproduce-before') {
  assert.equal(args.length, 2, 'Use --reproduce-before COMMIT');
  assert.match(args[1], /^[0-9a-f]{7,40}$/);
  const gitEnv = {...process.env};
  const git = (...command) => execFileSync('git', command, {
    cwd:new URL('../', import.meta.url), env:gitEnv, encoding:'utf8',
  });
  for (const name of git('rev-parse', '--local-env-vars').trim().split(/\s+/)) delete gitEnv[name];
  const source = git('show', `${args[1]}:prototype/src/main.js`);
  const taskCode = git('show', `${args[1]}:prototype/src/behavior-tasks.js`);
  const before = await import('data:text/javascript;base64,' + Buffer.from(taskCode).toString('base64'));
  const room = fixture(source, before.createBehaviorTasks);
  room.request('walk', 'walk', {x:1,z:1});
  const reply = room.request('wrong-target', 'sit', {usePointId:unknownId});
  room.tick();
  assert.equal(reply.admission, 'accepted');
  assert.equal(room.tasks.get('walk').state, 'cancelled');
  assert.equal(room.tasks.get('wrong-target').state, 'completed');
  assert.equal(room.lease()?.seatId, chairId);
  console.log(JSON.stringify({commit:args[1], requested:unknownId, actualSeat:room.lease()?.seatId,
    admission:reply.admission, state:room.tasks.get('wrong-target').state, priorWalk:room.tasks.get('walk').state}));
} else {
  assert.equal(args.length, 0, 'Use --reproduce-before COMMIT or no arguments');
  const source=await readFile(new URL('../prototype/src/main.js', import.meta.url), 'utf8');
  function check(name, test) { test(fixture(source)); checks.push(name); }

  check('unknown target preserves active and queued requests and obtains no lease', room => {
    room.request('walk', 'walk', {x:1,z:1});
    room.request('queued-seat', 'sit', {usePointId:chairId}, true);
    const reply = room.request('wrong-target', 'sit', {usePointId:unknownId});
    assert.equal(reply.admission, 'rejected');
    assert.equal(reply.reason, 'unknown-seat-use-point');
    assert.equal(reply.task.state, null);
    assert.equal(room.request('wrong-queue', 'sit', {usePointId:unknownId}, true).reason, 'unknown-seat-use-point');
    assert.equal(room.tasks.active().requestId, 'walk');
    assert.deepEqual(room.tasks.pending().map(task => task.requestId), ['queued-seat']);
    assert.equal(room.lease(), null);
  });

  check('rejected ID replays its result and different payload stays a conflict', room => {
    const first = room.request('one', 'sit', {usePointId:unknownId});
    const duplicate = room.request('one', 'sit', {usePointId:unknownId});
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.reason, first.reason);
    assert.deepEqual(duplicate.task, first.task);
    const conflict = room.request('one', 'sit', {usePointId:chairId});
    assert.equal(conflict.reason, 'request-id-conflict');
    assert.equal(conflict.duplicate, true);
    assert.equal(room.tasks.history().length, 1);
    assert.equal(room.lease(), null);
    assert.equal(room.request('empty', 'sit', {usePointId:null}).reason, 'unknown-seat-use-point');
  });

  check('unmounted exact target is rejected before superseding a walk', room => {
    room.request('walk', 'walk', {x:1,z:1});
    room.chair.parent = null;
    const rejected = room.request('detached', 'sit', {usePointId:chairId});
    assert.equal(rejected.admission, 'rejected');
    assert.equal(rejected.reason, 'seat-target-invalidated');
    assert.equal(room.tasks.active().requestId, 'walk');
    assert.equal(room.lease(), null);
    room.chair.parent = true;
    assert.equal(room.request('detached', 'sit', {usePointId:chairId}).reason, 'seat-target-invalidated');
  });

  check('pending exact target invalidated before execution fails without reserving', room => {
    room.request('walk', 'walk', {x:1,z:1});
    assert.equal(room.request('queued-seat', 'sit', {usePointId:chairId}, true).admission, 'queued');
    room.chair.parent = null;
    room.finishWalk();
    assert.equal(room.tasks.get('walk').state, 'completed');
    assert.equal(room.tasks.get('queued-seat').state, 'failed');
    assert.equal(room.tasks.get('queued-seat').reason, 'seat-target-invalidated');
    assert.equal(room.lease(), null);
  });

  for (const [label, payload] of [['legacy', undefined], ['exact room target', {usePointId:chairId}]]) {
    check(`${label} reaches and retains the demo chair`, room => {
      const started = room.request('valid', 'sit', payload);
      assert.equal(started.admission, 'accepted');
      const original = room.lease();
      assert.equal(original.seatId, chairId);
      assert.equal(room.request('valid', 'sit', {usePointId:unknownId}).reason, 'request-id-conflict');
      assert.equal(room.request('wrong-target', 'sit', {usePointId:unknownId}).admission, 'rejected');
      assert.deepEqual(room.lease(), original);
      room.tick();
      assert.equal(room.tasks.get('valid').state, 'completed');
      assert.equal(room.lease().state, 'occupied');
    });
  }
  console.log(JSON.stringify({passed:checks.length, checks, scope:'Actual room request, completion and lease methods. CPU pose fixture.'}));
}
