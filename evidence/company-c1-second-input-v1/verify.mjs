import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/facility-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates.json' with { type: 'json' };
import { createCompanyScene } from '../../prototype/src/company/render.js';
import { deriveCompany, restoreCompany, prepareCompanyChange } from '../../prototype/src/company/document.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const input = path.join(root, 'prototype/src/company/examples/c1-two-stations.json');
const operations = path.join(root, 'prototype/src/company/examples/c1-two-stations-alternate.ops.json');
const output = path.join(root, 'prototype/src/company/examples/c1-two-stations-alternate.json');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'company-c1-second-'));
const generated = path.join(temp, 'alternate.json');
const cli = path.join(root, 'scripts/company-platform/company.mjs');
const near = (actual, expected) => assert(new THREE.Vector3(...actual).distanceTo(new THREE.Vector3(...expected)) < 1e-8,
  `Position differs ${JSON.stringify({ actual, expected })}`);
const checks = [];
const check = (name, fn) => { fn(); checks.push({ name, passed: true }); };
let before;
let after;
let rotated;
try {
  const cliResult = JSON.parse(execFileSync(process.execPath, [cli, 'apply', input, operations, generated], { cwd: root, encoding: 'utf8' }));
  assert(cliResult.ok);
  const bytes = await fs.readFile(generated, 'utf8');
  try {
    assert.equal(await fs.readFile(output, 'utf8'), bytes, 'Checked-in second input differs from fresh CLI apply');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(output, bytes, { flag: 'wx' });
  }
  const original = restoreCompany(await fs.readFile(input, 'utf8'), catalog, templates);
  const alternate = restoreCompany(bytes, catalog, templates);
  const derived = deriveCompany(alternate, catalog, templates);
  before = createCompanyScene(new THREE.Scene(), original);
  after = createCompanyScene(new THREE.Scene(), alternate);
  const ops = JSON.parse(await fs.readFile(operations, 'utf8'));
  const rotatedDocument = prepareCompanyChange(original, ops.slice(0, 1), { catalog, templates }).document;
  rotated = createCompanyScene(new THREE.Scene(), rotatedDocument);
  const object = (scene, id) => {
    const value = scene.root.getObjectByName(id);
    assert(value, `Missing actual provider object ${id}`);
    return value;
  };
  const world = (scene, id) => object(scene, id).getWorldPosition(new THREE.Vector3()).toArray();
  check('Real CLI apply produces the second deterministic two-station input', () => {
    assert.equal(alternate.revision, original.revision + 1);
    assert.equal(derived.capacity.installedStations, 2);
    assert.equal(derived.usePoints.length, 2);
    assert.equal(derived.obstacles.length, 6);
    assert.equal(alternate.nodes.find(node => node.id === 'station-2').transform.yaw, Math.PI / 2);
  });
  const equipment = ['monitor', 'keyboard', 'microphone'];
  const positions = equipment.map(key => ({
    id: `station-2/${key}`, before: world(before, `station-2/${key}`),
    stationOnly: world(rotated, `station-2/${key}`), after: world(after, `station-2/${key}`),
  }));
  check('All desk devices retain desk-local transforms through station rotation and desk translation', () => {
    for (const key of equipment) {
      const id = `station-2/${key}`;
      const localBefore = object(before, 'station-2/desk').worldToLocal(new THREE.Vector3(...world(before, id)));
      const localAfter = object(after, 'station-2/desk').worldToLocal(new THREE.Vector3(...world(after, id)));
      near(localAfter.toArray(), localBefore.toArray());
      const node = alternate.nodes.find(candidate => candidate.id === id);
      near(localAfter.toArray(), node.transform.position);
      assert(new THREE.Vector3(...world(before, id)).distanceTo(new THREE.Vector3(...world(after, id))) > 0.1);
      const actual = object(after, id).getWorldPosition(new THREE.Vector3());
      near(actual.toArray(), derived.worlds.get(id).position);
      const deskDelta = new THREE.Vector3(...world(after, id)).sub(new THREE.Vector3(...world(rotated, id)));
      near(deskDelta.toArray(), [-0.2, 0, 0]);
    }
    near(world(after, 'station-2/desk'), [0.5, 0, 0.2]);
    near(world(after, 'station-2/monitor'), [0.25, 0.84, 0.2]);
    near(world(after, 'station-2/chair'), [2.15, 0, 0.2]);
    near(world(after, 'station-2/chair'), world(rotated, 'station-2/chair'));
  });
  check('First station transforms and independent screen/light states survive', () => {
    for (const node of original.nodes.filter(node => node.id === 'station-1' || node.stationId === 'station-1')) {
      assert.deepEqual(alternate.nodes.find(candidate => candidate.id === node.id), node);
      near(world(after, node.id), world(before, node.id));
    }
    const screen = station => object(after, `${station}/monitor`).getObjectByName('monitor-screen').material;
    assert.equal(screen('station-1').emissiveIntensity, 0.35);
    assert.equal(screen('station-2').emissiveIntensity, 0);
    assert.notEqual(screen('station-1'), screen('station-2'));
    const lights = after.snapshot().lights;
    assert.equal(lights.find(light => light.id === 'station-1/fill-light').intensity, 5);
    assert.equal(lights.find(light => light.id === 'station-2/fill-light').intensity, 2.5);
  });
  check('Use-points and navigation obstacles resolve the same actual transformed furniture', () => {
    for (const point of derived.usePoints) {
      const resolved = after.resolveUsePoint(point.id);
      assert.equal(resolved.chair, object(after, point.facilityId));
      assert(resolved.chairSeat.isMesh && resolved.chairBack.isMesh);
      near(resolved.chair.getWorldPosition(new THREE.Vector3()).toArray(), point.world.position);
      const obstacle = after.navigation().obstacles.find(value => value.instanceId === point.facilityId);
      assert.equal(obstacle.object, resolved.chair);
    }
    for (const footprint of derived.obstacles) {
      const navigation = after.navigation().obstacles.find(value => value.instanceId === footprint.id);
      assert.equal(navigation.object, object(after, footprint.id));
      const resource = derived.facilities.find(value => value.id === footprint.id).resource;
      const corners = [-1, 1].flatMap(x => [-1, 1].map(z => navigation.object.localToWorld(new THREE.Vector3(
        resource.footprint.center[0] + x * resource.footprint.halfSize[0], 0,
        resource.footprint.center[1] + z * resource.footprint.halfSize[1],
      )).toArray()));
      corners.forEach((corner, index) => near(corner, footprint.corners[index]));
      assert(Math.abs(navigation.x - (footprint.min[0] + footprint.max[0]) / 2) < 1e-8);
      assert(Math.abs(navigation.z - (footprint.min[1] + footprint.max[1]) / 2) < 1e-8);
    }
  });
  const report = {
    status: 'passed', scope: 'Actual CLI apply and Three provider CPU validation',
    dispatch: { difficulty: 'standard', model: 'gpt-6.1-sol', reasoning_effort: 'medium',
      reason: 'Second input production and coordinate verification through existing data interfaces.',
      configurationEvidence: 'Parent-confirmed existing configuration. Hook interception not independently verified.' },
    cliResult: { ...cliResult, output: 'temporary alternate.json, byte-compared to published example' },
    inputSha256: createHash('sha256').update(await fs.readFile(input)).digest('hex'),
    outputSha256: createHash('sha256').update(bytes).digest('hex'),
    checks, equipmentPositions: positions,
    usePoints: after.snapshot().points, obstacles: after.snapshot().navigation,
    limitations: [
      'CPU provider evidence only. No browser, GPU, character navigation, seat contact, reach or microphone use acceptance.',
      'Footprint validation covers the declared resource footprints. Actor clearance still requires runtime acceptance.',
    ],
  };
  await fs.writeFile(new URL('report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: checks.length, outputSha256: report.outputSha256 }));
} finally {
  before?.dispose();
  after?.dispose();
  rotated?.dispose();
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert(path.basename(temp).startsWith('company-c1-second-'));
  await fs.rm(temp, { recursive: true });
}
