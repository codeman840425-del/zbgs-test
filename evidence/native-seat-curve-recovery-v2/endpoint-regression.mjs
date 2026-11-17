// Actual main.js functions and CharacterScene lifecycle, without Phaser/GPU boot.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createBehaviorTasks} from '../../prototype/src/behavior-tasks.js';
import {createSeatLeases} from '../../prototype/src/seat-lease.js';
import {createTurnPolicy} from '../../prototype/src/turn-policy.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'evidence/m2-seat-path-endpoint-v1');
const flag = process.argv.indexOf('--modules-root');
const modules = flag < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[flag+1]);
const THREE = await import(pathToFileURL(path.join(modules, 'three/build/three.module.js')).href);
const fixture = JSON.parse(await fs.readFile(path.join(out, 'failure-input.json'), 'utf8'));
const baseline = execFileSync('git', ['show', fixture.baselineCommit+':prototype/src/main.js'], {cwd: root}).toString();
assert.equal(execFileSync('git', ['rev-parse', fixture.sourceCommit+':prototype/src/main.js'], {cwd: root}).toString(),
  execFileSync('git', ['rev-parse', fixture.baselineCommit+':prototype/src/main.js'], {cwd: root}).toString());
const source = await fs.readFile(path.join(root, 'prototype/src/main.js'), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
function environment(text, transform = fixture.chair) {
  const chair = new THREE.Group(), world = new THREE.Group(); world.add(chair);
  chair.position.fromArray(transform.position); chair.rotation.y = transform.yaw; chair.updateMatrixWorld(true);
  const dimensions = text.match(/let chairSeat = cube\(([\d.]+), ([\d.]+), ([\d.]+),/).slice(1).map(Number);
  const geometry = new THREE.BoxGeometry(...dimensions); geometry.computeBoundingBox();
  const box = geometry.boundingBox.clone(); geometry.dispose();
  const declarations = text.slice(text.indexOf('const obstacles = ['), text.indexOf('// Cloth uses oriented boxes'));
  const obstacles = new Function('defaultChair', declarations+'\nreturn obstacles;')({x: chair.position.x, z: chair.position.z});
  const broad = box.clone().applyMatrix4(chair.matrixWorld);
  Object.assign(obstacles.find(o => o.name === 'chair'), {x: chair.position.x, z: chair.position.z,
    hw: (broad.max.x-broad.min.x)/2+.1, hd: (broad.max.z-broad.min.z)/2+.1});
  const nav = text.slice(text.indexOf('function blocked('), text.indexOf('const names ='));
  const targets = text.slice(text.indexOf('function seatTargets('), text.indexOf('function setChairTransform('));
  const controller = text.slice(text.indexOf('class CharacterScene extends'), text.indexOf('function average('));
  const factory = new Function('THREE', 'chair', 'chairBounds', 'obstacles', 'clamp', 'Phaser', 'createBehaviorTasks',
    'createSeatLeases', 'createTurnPolicy', 'initialPosition', 'document', 'performance', 'turnLegacy', 'avatar', 'motion',
    'const seatLeases=createSeatLeases();\n'+nav+'\n'+targets+'\n'+controller+'\nreturn {pathTo,blocked,lineClear,CharacterScene,seatLeases,seatTargets};');
  const api = factory(THREE, chair, [{localBox: box}], obstacles, (v,a,b) => Math.min(b,Math.max(a,v)), {Scene: class {}},
    createBehaviorTasks, createSeatLeases, createTurnPolicy, fixture.position, {hidden: false}, performance, false, null, null);
  function actor(start) {
    const rootNode = new THREE.Group(); rootNode.position.set(start[0], 0, start[1]);
    const metrics = {danceMix: 0, seatBack: fixture.seatBack};
    const instance = {actorId: 'cpu-seat-owner', avatar: {root: rootNode, livePresentation: {canPerform: () => ({allowed:true}), getState: () => ({greeting:null}), setAction() {}}},
      motion: {getMetrics: () => metrics, getSeatApproach: () => fixture.seatApproach}};
    return {scene: new api.CharacterScene(instance), metrics};
  }
  return {...api, chair, obstacles, actor};
}
const checks = [];
function check(name, run) { const evidence = run(); checks.push({name, passed:true, ...evidence}); }
function verifyPath(api, start, goal) {
  const result = api.pathTo(start, ...goal); assert(result.length);
  assert.deepEqual(result.at(-1), goal);
  let from = start;
  for (const point of result) { assert(!api.blocked(...point)); assert(api.lineClear(from, point), JSON.stringify({from, point})); from = point; }
  return result;
}
const start = [fixture.position[0], fixture.position[2]], goal = [fixture.chair.approach[0], fixture.chair.approach[2]];
const old = environment(baseline), next = environment(source);
check('actual failure reproduces rounded blocked goal and lost false', () => {
  const rounded = goal.map(v => Math.round(v/.2)*.2);
  assert(!old.blocked(...goal)); assert(old.blocked(...rounded)); assert(!old.lineClear(start, goal)); assert.deepEqual(old.pathTo(start, ...goal), []);
  const {scene} = old.actor(start), request = scene.requestBehavior({requestId:'old-sit',kind:'sit'});
  assert.equal(request.task.state, 'running'); assert.equal(scene.mode, 'idle'); assert.equal(scene.target, null);
  assert.equal(old.seatLeases.forSeat('room-chair-1').state, 'reserved');
  return {roundedGoal: rounded, actualGoal: goal, oldTask: request.task.state, oldLease:'reserved'};
});
check('exact failing start reaches actual approach with all segments clear', () => ({path: verifyPath(next, start, goal)}));
check('clear actual start with blocked rounded start connects safely', () => {
  const rounded = goal.map(v => Math.round(v/.2)*.2); assert(next.blocked(...rounded));
  assert.deepEqual(old.pathTo(goal, ...start), []);
  return {path: verifyPath(next, goal, start)};
});
check('clear quantized start across a thin wall cannot inject an unsafe first segment', () => {
  const before = environment(baseline), after = environment(source), wall = {name:'thin-wall',x:.06,z:0,hw:.01,hd:.3};
  before.obstacles.splice(0, before.obstacles.length, wall); after.obstacles.splice(0, after.obstacles.length, wall);
  const a = [.08,0], b = [-.8,0], bad = before.pathTo(a,...b);
  assert(bad.length && !before.lineClear(a,bad[0]));
  return {oldUnsafeFirst: bad[0], path: verifyPath(after,a,b)};
});
check('moved rotated chair uses the same checked target connection', () => {
  const api = environment(source, {position:[2,0,.57332736697],yaw:Math.PI/3});
  const {scene} = api.actor(start), target = api.seatTargets(scene.rig).approach;
  return {path: verifyPath(api, start, [target[0],target[2]])};
});
check('direct routes remain exact and actual blocked start/goal reject', () => {
  assert.deepEqual(next.pathTo([-1,2],1,2), [[1,2]]);
  assert.deepEqual(next.pathTo(start,fixture.chair.position[0],fixture.chair.position[2]), []);
  assert.deepEqual(next.pathTo([fixture.chair.position[0],fixture.chair.position[2]],...start), []);
});
check('normal sit request enters walk then completes while seat remains occupied', () => {
  const api = environment(source), {scene} = api.actor(start), request = scene.requestBehavior({requestId:'new-sit',kind:'sit'});
  assert.equal(request.task.state,'running'); assert.equal(scene.mode,'walk'); assert.equal(scene.afterWalk,'sit');
  assert(scene.target); scene.actor.root.position.fromArray(fixture.chair.approach); scene.clearPath(); scene.setMode('sit');
  scene.updateBehavior(0,{sitProgress:1}); assert.equal(scene.behaviorTasks.get('new-sit').state,'completed');
  assert.equal(api.seatLeases.forSeat('room-chair-1').state,'occupied');
});
check('genuinely unreachable sit fails immediately, releases lease and permits a new request', () => {
  const api = environment(source); api.obstacles.push({name:'divider',x:0,z:0,hw:.05,hd:3.2});
  const {scene} = api.actor(start), request = scene.requestBehavior({requestId:'blocked-sit',kind:'sit'});
  assert.equal(request.task.state,'failed'); assert.equal(request.task.reason,'seat-path-unreachable');
  assert.equal(scene.behaviorTasks.active(),null); assert.equal(api.seatLeases.forSeat('room-chair-1'),null); assert.equal(scene.seatToken,null);
  assert.equal(scene.requestBehavior({requestId:'blocked-sit',kind:'sit'}).task.state,'failed');
  api.obstacles.pop(); assert.equal(scene.requestBehavior({requestId:'retry-sit',kind:'sit'}).task.state,'running');
});
check('direct and deferred sit path failures both release reservations', () => {
  for (const deferred of [false,true]) {
    const api = environment(source); api.obstacles.push({name:'divider',x:0,z:0,hw:.05,hd:3.2});
    const {scene,metrics} = api.actor(start);
    if (deferred) {
      metrics.danceMix=1; assert.equal(scene.requestBehavior({requestId:'deferred-sit',kind:'sit'}).task.state,'running');
      const pending = scene.pending; assert.equal(pending.after,'sit'); metrics.danceMix=0;
      assert.equal(scene.go(pending.x,pending.z,pending.after),false);
      assert.equal(scene.behaviorTasks.get('deferred-sit').reason,'seat-path-unreachable');
    } else assert.equal(scene.action('sit'),false);
    assert.equal(api.seatLeases.forSeat('room-chair-1'),null); assert.equal(scene.seatToken,null);
  }
});
check('another owner seat reservation stays intact on rejection', () => {
  const api = environment(source), reserved = api.seatLeases.reserve({seatId:'room-chair-1',ownerId:'other',requestId:'other-sit'});
  const {scene} = api.actor(start), request=scene.requestBehavior({requestId:'denied',kind:'sit'});
  assert.equal(request.task.reason,'seat-unavailable'); assert.equal(api.seatLeases.forSeat('room-chair-1').token,reserved.lease.token);
});
const report = {passed:true, baselineCommit:fixture.baselineCommit, sourceCommitOfFailure:fixture.sourceCommit,
  baselineMainSha256:hash(baseline), testedMainSha256:hash(source), failureInputSha256:hash(await fs.readFile(path.join(out,'failure-input.json'))),
  checks, CPUOnly:true, actualBrowserRun:false, limit:'Actual functions/class lifecycle with real Three geometry and pure task/lease modules. Physical gait and sitting remain root browser verification.'};
await fs.writeFile(path.join(root,'evidence/native-seat-curve-recovery-v2/endpoint-regression.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
