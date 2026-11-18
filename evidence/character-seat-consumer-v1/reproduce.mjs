import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';

const reportCommit = 'cfca0dd13af69418dc063d6715c43523184195f9';
const root = fileURLToPath(new URL('../../', import.meta.url));
const readFixed = file => execFileSync('git', ['show', `${reportCommit}:${file}`], {
  cwd: root, encoding: 'utf8',
}).replaceAll('\r\n', '\n');
const files = ['main', 'record-consumer-demo', 'character-record-consumer', 'seat-lease', 'behavior-tasks', 'turn-policy'];
const sources = new Map(files.map(name => [name, readFixed(`prototype/src/${name}.js`)]));
const load = name => import(`data:text/javascript;base64,${Buffer.from(sources.get(name)).toString('base64')}`);
const [{createBehaviorTasks}, {createSeatLeases}, {createTurnPolicy}] = await Promise.all([
  load('behavior-tasks'), load('seat-lease'), load('turn-policy'),
]);

const formal = sources.get('character-record-consumer');
const getAppearanceController = new Function(formal.slice(
  formal.indexOf('function createRecordAppearanceController'), formal.indexOf('/** Prepare'),
) + '\nreturn createRecordAppearanceController;')();
const formalController = getAppearanceController({});
assert.equal(typeof formalController.requestBehavior, 'undefined');
const formalHost = sources.get('record-consumer-demo');
assert.match(formalHost, /prepareRecordedCharacter\(record,\{scene,renderer,isCurrent:current,signal:context\.signal,/);
assert.doesNotMatch(formalHost, /\bcreateController\b/);
assert.match(formalHost, /actor\.update\(dt,\{action:'idle'/);

// Mirrors the renderer-free seam in scripts/qa-seat-path-endpoint.mjs. The
// calibrated rig metrics come from its existing fixture.
const fixture = JSON.parse(readFixed('evidence/m2-seat-path-endpoint-v1/failure-input.json'));
const main = sources.get('main');
const defaultChair = new Function(main.match(/const defaultChair = [^;]*;/)[0] + '\nreturn defaultChair;')();
const chair = new THREE.Group();
const world = new THREE.Group();
world.add(chair);
chair.position.set(defaultChair.x, 0, defaultChair.z);
chair.rotation.y = defaultChair.yaw;
chair.updateMatrixWorld(true);
const chairDimensions = main.match(/let chairSeat = cube\(([\d.]+), ([\d.]+), ([\d.]+),/).slice(1).map(Number);
const geometry = new THREE.BoxGeometry(...chairDimensions);
geometry.computeBoundingBox();
const localBox = geometry.boundingBox.clone();
geometry.dispose();
const slice = (start, end) => main.slice(main.indexOf(start), main.indexOf(end));
const obstacles = new Function('defaultChair', slice('const obstacles = [', '// Cloth uses oriented boxes') + '\nreturn obstacles;')(defaultChair);
const makeRoom = new Function(
  'THREE', 'chair', 'chairBounds', 'obstacles', 'clamp', 'Phaser', 'document', 'initialPosition', 'turnLegacy',
  'createSeatLeases', 'createBehaviorTasks', 'createTurnPolicy',
  [
    'const seatLeases = createSeatLeases();',
    slice('function blocked(', 'const names ='),
    slice('function seatTargets(', 'function setChairTransform('),
    slice('class CharacterScene extends', 'function average('),
    'return {CharacterScene, seatLeases, seatTargets};',
  ].join('\n'),
);
const room = makeRoom(THREE, chair, [{localBox}], obstacles, (value, min, max) => Math.min(max, Math.max(min, value)),
  {Scene: class {}}, {hidden: false}, fixture.position, false, createSeatLeases, createBehaviorTasks, createTurnPolicy);
function actor(actorId, position) {
  const root = new THREE.Group();
  root.position.fromArray(position);
  const avatar = {root, livePresentation: {canPerform: () => ({allowed:true}), getState: () => ({greeting:null}), setAction() {}}};
  const motion = {getMetrics: () => ({seatBack: fixture.seatBack}), getSeatApproach: () => fixture.seatApproach};
  return new room.CharacterScene({actorId, avatar, motion, position});
}

const facility = 'screen-partition-studio/ground/live/sofa';
const left = `${facility}#left`;
const right = `${facility}#right`;
const demo = 'room-chair-1';
const request = (requestId, usePointId) => ({requestId, kind: 'sit', payload: {usePointId}});
const firstRequest = request('formal-left', left);
const secondRequest = request('formal-right', right);
const actorA = actor('fixture-a', fixture.position);
const actorB = actor('fixture-b', [0, 0, 2]);
const first = actorA.requestBehavior(firstRequest);
assert.equal(first.task.state, 'running');
assert.equal(room.seatLeases.forSeat(demo)?.state, 'reserved');
assert.equal(room.seatLeases.forSeat(left), null);
const actualApproach = room.seatTargets(actorA.rig).approach;
assert.deepEqual(actorA.path.at(-1), [actualApproach[0], actualApproach[2]]);

// Advance only the assertions' state boundary. This does not model movement,
// collision response, or a VRM's physical seat contact.
actorA.actor.root.position.fromArray(actualApproach);
actorA.clearPath();
actorA.setMode('sit');
actorA.updateBehavior(0, {sitProgress: 1});
assert.equal(actorA.behaviorTasks.get(firstRequest.requestId).state, 'completed');
const second = actorB.requestBehavior(secondRequest);
assert.equal(second.task.state, 'failed');
assert.equal(second.task.reason, 'seat-unavailable');
const snapshot = leases => Object.fromEntries([left, right, demo].map(id => [id, leases.forSeat(id)?.state ?? null]));
const actual = snapshot(room.seatLeases);
assert.deepEqual(actual, {[left]: null, [right]: null, [demo]: 'occupied'});

// Check the post-fix lease expectations against the existing coordinator.
// This fixture supplies the missing resolution by explicitly using payload.usePointId.
// No host, provider implementation, or physical pose validation is asserted here.
const leases = createSeatLeases();
const reserve = (ownerId, {requestId, payload: {usePointId}}) => leases.reserve({ownerId, requestId, seatId: usePointId});
const leftLease = reserve('fixture-a', firstRequest).lease;
assert.equal(leases.occupy(leftLease.token), true);
assert.equal(reserve('fixture-b', secondRequest).accepted, true);
assert.equal(reserve('fixture-c', request('contend-left', left)).reason, 'seat-unavailable');
const after = snapshot(leases);
const assertTarget = actual => assert.deepEqual(actual, {[left]: 'occupied', [right]: 'reserved', [demo]: null});
assert.throws(() => assertTarget(actual), {name: 'AssertionError'});
assertTarget(after);
assert.equal(leases.requestRelease(leftLease.token, 'actor-stands'), true);
assert.equal(leases.releaseAfterExit(leftLease.token), false);
assert.equal(leases.beginExit(leftLease.token), true);
assert.equal(leases.forSeat(left)?.state, 'exiting');
assert.equal(leases.releaseAfterExit(leftLease.token), true);
assert.deepEqual(snapshot(leases), {[left]: null, [right]: 'reserved', [demo]: null});

console.log(JSON.stringify({
  formalSourceCommit: reportCommit,
  formalAppearanceControllerRequestBehavior: typeof formalController.requestBehavior,
  observedCharacterScene: {actualApproach, first: 'completed', second: second.task.reason, leases: actual},
  contractFixtureOnly: {leases: after, afterConfirmedExit: snapshot(leases)},
}, null, 2));
