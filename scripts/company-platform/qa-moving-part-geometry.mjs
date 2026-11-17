import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {validateMovingPartGeometry} from '../../prototype/src/company/moving-part-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-moving-part-geometry-v1');
await fs.mkdir(output, {recursive: true});

const part = {
  id: 'door', stateField: 'openFraction', kind: 'hinge', axis: 'y', pivot: [-.42, 0, .245],
  rotationRange: [0, -Math.PI / 2], bounds: {min: [0, .1, -.02], max: [.84, 1.12, .03]},
};
const resource = (overrides = {}) => ({
  movingParts: [structuredClone(part)], partNodes: {door: 'cabinet-door-pivot'}, partPanels: {door: 'cabinet-door-leaf'}, ...overrides,
});

function sharedEdgeFrontGeometry() {
  const geometry = new THREE.BufferGeometry();
  const x0 = 0, x1 = .84, y0 = .1, y1 = 1.12, z = .015;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    x0, y0, z, x1, y1, z, x0, y1, z,
    x0, y0, z, x1, y0, z, x0, y1, z,
    x0, y0, -.015, x1, y1, -.015, x0, y1, -.015,
    x0, y0, -.015, x1, y0, -.015, x1, y1, -.015,
  ], 3));
  return geometry;
}

function cabinetScene({panelGeometry = null, panelPosition = [0.42, .61, -.0025], duplicatePivot = false,
  duplicatePanel = false, pivotPosition = part.pivot, parentPosition = [0, 0, 0], outsideMesh = false, handleOutside = false,
  sameMeshTop = false, ground = true} = {}) {
  const scene = new THREE.Scene();
  scene.position.set(2, 0, -3);
  const wrapper = new THREE.Group();
  scene.add(wrapper);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.1, .45), new THREE.MeshBasicMaterial());
  body.name = 'cabinet-body'; body.position.set(0, .55, 0); wrapper.add(body);
  const identity = new THREE.Group();
  identity.name = 'gltf-identity-wrapper'; identity.position.set(...parentPosition); wrapper.add(identity);
  const pivot = new THREE.Group();
  pivot.name = 'cabinet-door-pivot'; pivot.position.set(...pivotPosition); identity.add(pivot);
  const panel = new THREE.Mesh(panelGeometry || new THREE.BoxGeometry(.84, 1.02, .035), new THREE.MeshBasicMaterial());
  panel.name = 'cabinet-door-leaf'; panel.position.set(...panelPosition);
  if (outsideMesh) {
    panel.position.set(...part.pivot);
    wrapper.add(panel);
  } else pivot.add(panel);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .04), new THREE.MeshBasicMaterial());
  handle.name = 'cabinet-door-handle'; handle.position.set(handleOutside ? .9 : .7, .6, .01); pivot.add(handle);
  if (sameMeshTop) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(.2, .08, .2), new THREE.MeshBasicMaterial());
    top.name = 'cabinet-top-in-pivot'; top.position.set(.4, 1.2, 0); pivot.add(top);
  }
  if (duplicatePivot) {
    const duplicate = new THREE.Group(); duplicate.name = 'cabinet-door-pivot'; wrapper.add(duplicate);
  }
  if (duplicatePanel) {
    const duplicate = new THREE.Mesh(new THREE.BoxGeometry(.84, 1.02, .035), new THREE.MeshBasicMaterial());
    duplicate.name = 'cabinet-door-leaf'; duplicate.position.set(.42, .61, -.0025); wrapper.add(duplicate);
  }
  if (ground) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial());
    foot.name = 'cabinet-foot'; foot.position.set(0, .05, 0); wrapper.add(foot);
  }
  scene.updateMatrixWorld(true);
  return scene;
}

const checks = [];
const invoke = (scene, candidate) => validateMovingPartGeometry(scene, candidate, (code, failurePath, message, details) => {
  const error = new Error(message); error.code = code; error.path = failurePath; error.details = details; throw error;
});
function pass(name, observed) { checks.push({name, passed: true, observed}); }
function expectFailure(name, scene, candidate, code) {
  let captured;
  try { invoke(scene, candidate); }
  catch (error) { captured = error; }
  assert(captured, `${name} unexpectedly passed`);
  assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`);
  checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, message: captured.message}});
}

const validResult = invoke(cabinetScene(), resource());
assert.equal(validResult.checked, true);
assert.equal(validResult.parts[0].panelGeometry.frontTriangles, 2);
pass('valid hinged panel with nested identity wrapper and transformed scene root', validResult);

expectFailure('missing pivot is rejected', cabinetScene(), resource({partNodes: {door: 'missing-pivot'}}), 'missing-moving-part-node');
expectFailure('duplicate pivot names are rejected', cabinetScene({duplicatePivot: true}), resource(), 'missing-moving-part-node');
expectFailure('missing panel is rejected', cabinetScene(), resource({partPanels: {door: 'missing-panel'}}), 'missing-moving-part-panel');
expectFailure('duplicate panel names are rejected', cabinetScene({duplicatePanel: true}), resource(), 'missing-moving-part-panel');
expectFailure('wrong pivot position is rejected', cabinetScene({pivotPosition: [-.41, 0, .245]}), resource(), 'invalid-moving-part-pivot');
expectFailure('nonidentity parent wrapper is rejected', cabinetScene({parentPosition: [.01, 0, 0]}), resource(), 'moving-part-parent-transform');
expectFailure('panel outside pivot subtree is rejected', cabinetScene({outsideMesh: true}), resource(), 'moving-part-panel-parent');
expectFailure('moving subtree envelope overrun is rejected', cabinetScene({handleOutside: true}), resource(), 'moving-part-bounds');
expectFailure('shared rectangle edge is rejected', cabinetScene({panelGeometry: sharedEdgeFrontGeometry(), panelPosition: [0, 0, 0]}), resource(), 'moving-part-panel-front');
expectFailure('thin plane panel is rejected', cabinetScene({panelGeometry: new THREE.PlaneGeometry(.84, 1.02), panelPosition: [.42, .61, .015]}), resource(), 'moving-part-panel-thickness');
expectFailure('static top geometry mixed into pivot is rejected', cabinetScene({sameMeshTop: true}), resource(), 'moving-part-bounds');
expectFailure('unsupported kind or axis is rejected', cabinetScene(), resource({movingParts: [{...part, kind: 'slide', axis: 'x'}]}), 'unsupported-moving-part');
const noOp = (() => {
  const observed = invoke(cabinetScene(), {});
  assert.equal(observed.checked, false);
  return observed;
})();
checks.pop();
pass('resource without movingParts is ignored', noOp);

const report = {
  status: checks.every(check => check.passed) ? 'passed' : 'failed',
  generatedAt: new Date().toISOString(),
  configuration: {difficulty: 'complex', requestedModel: 'gpt-6.1-sol', requestedReasoningEffort: 'high', actualProviderConfiguration: 'not independently verified', hostHookInterception: 'not independently verified'},
  api: 'validateMovingPartGeometry(scene, resource, fail)',
  checks,
  limits: [
    'CPU-only Three synthetic scenes. No browser, GPU, GLB decode, state transaction or animation clock was used.',
    'Geometry validation is limited to one static hinge part with a rectangular +Z front and conservative pivot-local bounds.',
    'This does not prove runtime opening animation, blocking sweeps, persistence or visual acceptance.',
  ],
};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
