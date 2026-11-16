import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-support-geometry-v1');
await fs.mkdir(output, {recursive: true});

const surface = {id: 'middle', center: [0, 0], topY: .45, halfSize: [.42, .13], clearanceHeight: .65};
const resource = nodeName => ({mount: 'support-surface', supportSurfaces: [structuredClone(surface)], supportNodes: {middle: nodeName}});

function boardScene({topY = .45, topGeometry = null, obstacle = null, adjacent = false, sameMeshPillar = false, ground = true} = {}) {
  const scene = new THREE.Scene();
  scene.position.set(2, 0, -3);
  const parent = new THREE.Group();
  parent.position.set(.21, 0, .17);
  scene.add(parent);
  const board = new THREE.Mesh(topGeometry || new THREE.BoxGeometry(.92, .035, .31), new THREE.MeshBasicMaterial());
  board.name = 'middle-board';
  board.position.set(topGeometry ? 0 : -.21, topGeometry ? 0 : topY - .0175, topGeometry ? 0 : -.17);
  if (sameMeshPillar) {
    const boardGeometry = board.geometry.toNonIndexed();
    const pillarGeometry = new THREE.BoxGeometry(.08, .3, .08).toNonIndexed();
    const boardPosition = boardGeometry.getAttribute('position');
    const pillarPosition = pillarGeometry.getAttribute('position');
    const values = new Float32Array((boardPosition.count + pillarPosition.count) * 3);
    for (let index = 0; index < boardPosition.count; index++) {
      values[index * 3] = boardPosition.getX(index);
      values[index * 3 + 1] = boardPosition.getY(index);
      values[index * 3 + 2] = boardPosition.getZ(index);
    }
    const localPillarY = topY + .16 - (topY - .0175);
    for (let index = 0; index < pillarPosition.count; index++) {
      const offset = (boardPosition.count + index) * 3;
      values[offset] = pillarPosition.getX(index) - .21;
      values[offset + 1] = pillarPosition.getY(index) + localPillarY;
      values[offset + 2] = pillarPosition.getZ(index) - .17;
    }
    const combined = new THREE.BufferGeometry();
    combined.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    board.geometry = combined;
    boardGeometry.dispose(); pillarGeometry.dispose();
  }
  parent.add(board);
  if (ground) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(.2, .1, .2), new THREE.MeshBasicMaterial());
    base.name = 'base'; base.position.y = .05; scene.add(base);
  }
  if (obstacle) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth), new THREE.MeshBasicMaterial());
    mesh.name = 'intruder'; mesh.position.set(obstacle.x, obstacle.y, obstacle.z); scene.add(mesh);
  }
  if (adjacent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, .3, .1), new THREE.MeshBasicMaterial());
    mesh.name = 'adjacent-post'; mesh.position.set(.47, .25, 0); scene.add(mesh);
  }
  scene.updateMatrixWorld(true);
  return scene;
}

function downwardTopGeometry() {
  const geometry = new THREE.BufferGeometry();
  const x = .42, z = .13, y = .45;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, y, -z, x, y, -z, -x, y, z,
    -x, y, z, x, y, -z, x, y, z,
  ], 3));
  // Both triangles use the opposite winding from an upward top.
  return geometry;
}

function singleTriangleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.42, .45, -.13, -.42, .45, .13, .42, .45, -.13,
  ], 3));
  return geometry;
}

function sharedEdgeGeometry() {
  const geometry = new THREE.BufferGeometry();
  const x = .42, z = .13, y = .45;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, y, -z, -x, y, z, x, y, z,
    -x, y, -z, -x, y, z, x, y, -z,
  ], 3));
  return geometry;
}

const checks = [];
function pass(name, observed) { checks.push({name, passed: true, observed}); }
function expectFailure(name, scene, candidate, code) {
  let captured;
  try {
    validateSupportGeometry(scene, candidate, (actualCode, failurePath, message, details) => {
      const error = new Error(message); error.code = actualCode; error.path = failurePath; error.details = details; throw error;
    });
  } catch (error) { captured = error; }
  assert(captured, `${name} unexpectedly passed`);
  assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`);
  checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, message: captured.message}});
}

const valid = boardScene({adjacent: true});
const validResult = validateSupportGeometry(valid, resource('middle-board'), (code, failurePath, message) => {
  const error = new Error(message); error.code = code; error.path = failurePath; throw error;
});
assert.equal(validResult.checked, true);
assert.equal(validResult.surfaces[0].triangles, 2);
assert(Math.abs(validResult.bottomY) <= .001);
pass('nested parent transforms preserve resource-local support coordinates and adjacent geometry is safe', validResult);

expectFailure('missing support node is rejected', boardScene(), resource('not-present'), 'missing-support-node');
expectFailure('wrong top height is rejected from actual triangles', boardScene({topY: .45}), {...resource('middle-board'), supportSurfaces: [{...surface, topY: .46}]}, 'invalid-support-topology');
expectFailure('hole or incomplete rectangle is rejected', boardScene({topGeometry: singleTriangleGeometry()}), resource('middle-board'), 'invalid-support-topology');
expectFailure('triangles sharing a rectangle edge are rejected', boardScene({topGeometry: sharedEdgeGeometry()}), resource('middle-board'), 'invalid-support-topology');
expectFailure('inward-facing support triangles are rejected', boardScene({topGeometry: downwardTopGeometry()}), resource('middle-board'), 'inward-support-top');
expectFailure('another post entering the clear prism is rejected', boardScene({obstacle: {width: .08, height: .3, depth: .08, x: 0, y: .6, z: 0}}), resource('middle-board'), 'support-clearance-occupied');
expectFailure('same support mesh cannot hide a clearance violating protrusion', boardScene({sameMeshPillar: true}), resource('middle-board'), 'support-clearance-occupied');
expectFailure('resource without y=0 contact is rejected', boardScene({ground: false}), resource('middle-board'), 'support-mount-ground-contact');
expectFailure('support-mounted prop without surfaces still requires y=0 contact', boardScene({ground: false}), {mount: 'support-surface'}, 'support-mount-ground-contact');
expectFailure('floor-standing support resource requires y=0 contact', boardScene({ground: false}), {...resource('middle-board'), mount: undefined, footprint: {blocking: true}}, 'support-mount-ground-contact');

const report = {
  status: checks.every(check => check.passed) ? 'passed' : 'failed',
  generatedAt: new Date().toISOString(),
  configuration: {
    difficulty: 'complex',
    requestedModel: 'gpt-6.1-sol',
    requestedReasoningEffort: 'high',
    actualProviderConfiguration: 'not independently verified',
    hostHookInterception: 'not independently verified',
  },
  api: 'validateSupportGeometry(scene, resource, fail)',
  checks,
  limits: [
    'CPU-only Three synthetic scenes. No browser, GPU, physics engine or GLB decode was used.',
    'The contract verifies rectangular boards represented by two upward triangles and conservative mesh AABB clearance.',
    'This is not a general collision, concave support or stacked-physics proof.',
  ],
};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
