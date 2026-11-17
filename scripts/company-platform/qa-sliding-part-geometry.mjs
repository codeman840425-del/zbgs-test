import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {validateSlidingPartGeometry} from '../../prototype/src/company/sliding-part-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-sliding-part-geometry-v1');
await fs.mkdir(output, {recursive: true});
const part = {id: 'drawer', stateField: 'openFraction', kind: 'slide', axis: 'z', pivot: [0, 0, 0], translationRange: [0, .32], bounds: {min: [-.42, .78, -.205], max: [.42, 1.12, .275]}};
const resource = (overrides = {}) => ({movingParts: [structuredClone(part)], partNodes: {drawer: 'cabinet-drawer-slide'}, partPanels: {drawer: 'drawer-front'}, partTrays: {drawer: {bottom: 'drawer-bottom', left: 'drawer-left', right: 'drawer-right', back: 'drawer-back'}}, ...overrides});

function edgeFrontGeometry() {
  const geometry = new THREE.BufferGeometry(), x0 = -.42, x1 = .42, y0 = .78, y1 = 1.12;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    x0, y0, .2625, x1, y1, .2625, x0, y1, .2625,
    x0, y0, .2625, x1, y0, .2625, x0, y1, .2625,
    x0, y0, .2275, x1, y1, .2275, x0, y1, .2275,
    x0, y0, .2275, x1, y0, .2275, x1, y1, .2275,
  ], 3));
  return geometry;
}

function partialLeftWallGeometry() {
  const geometry = new THREE.BufferGeometry(), xInner = -.355, xOuter = -.38, y0 = .805, yMid = .93, y1 = 1.055, z0 = -.19, z1 = .2275;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    xInner, y0, z0, xInner, yMid, z0, xInner, yMid, z1,
    xInner, y0, z0, xInner, yMid, z1, xInner, y0, z1,
    xOuter, y0, z0, xOuter, y1, z0, xOuter, y1, z1,
    xOuter, y0, z0, xOuter, y1, z1, xOuter, y0, z1,
    xOuter, y0, z0, xInner, y0, z0, xInner, y0, z1,
    xOuter, y0, z0, xInner, y0, z1, xOuter, y0, z1,
    xOuter, y1, z0, xInner, y1, z1, xInner, y1, z0,
    xOuter, y1, z0, xOuter, y1, z1, xInner, y1, z1,
    xOuter, y0, z0, xOuter, y1, z0, xInner, y1, z0,
    xOuter, y0, z0, xInner, y1, z0, xInner, y0, z0,
    xOuter, y0, z1, xInner, y1, z1, xOuter, y1, z1,
    xOuter, y0, z1, xInner, y0, z1, xInner, y1, z1,
  ], 3));
  return geometry;
}

function slidingScene({wrapperPosition = [0, 0, 0], groupPosition = [0, 0, 0], duplicateGroup = false,
  panelGeometry = null, panelPosition = [0, .95, .245], wallGeometry = null, missing = null, detachedWall = false,
  solidTray = false, staticFiller = false, handleOutside = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3);
  const wrapper = new THREE.Group(); wrapper.position.set(...wrapperPosition); scene.add(wrapper);
  const top = new THREE.Mesh(new THREE.BoxGeometry(.9, .035, .45), new THREE.MeshBasicMaterial()); top.name = 'cabinet-top'; top.position.set(0, 1.1825, 0); wrapper.add(top);
  const sideLeft = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.12, .45), new THREE.MeshBasicMaterial()); sideLeft.name = 'cabinet-side-left'; sideLeft.position.set(-.42, .61, 0); wrapper.add(sideLeft);
  const sideRight = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.12, .45), new THREE.MeshBasicMaterial()); sideRight.name = 'cabinet-side-right'; sideRight.position.set(.42, .61, 0); wrapper.add(sideRight);
  const back = new THREE.Mesh(new THREE.BoxGeometry(.84, 1.08, .035), new THREE.MeshBasicMaterial()); back.name = 'cabinet-inner-back'; back.position.set(0, .61, -.2075); wrapper.add(back);
  const identity = new THREE.Group(); identity.name = 'gltf-identity-wrapper'; wrapper.add(identity);
  const group = new THREE.Group(); group.name = 'cabinet-drawer-slide'; group.position.set(...groupPosition); identity.add(group);
  const panel = new THREE.Mesh(panelGeometry || new THREE.BoxGeometry(.84, .34, .035), new THREE.MeshBasicMaterial()); panel.name = 'drawer-front'; panel.position.set(...panelPosition); if (missing !== 'panel') group.add(panel);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(.76, .025, .4175), new THREE.MeshBasicMaterial()); bottom.name = 'drawer-bottom'; bottom.position.set(0, .7925, .01875); if (missing !== 'bottom') group.add(bottom);
  const left = new THREE.Mesh(wallGeometry || new THREE.BoxGeometry(.025, .25, .4175), new THREE.MeshBasicMaterial()); left.name = 'drawer-left'; left.position.set(...(wallGeometry ? [0, 0, 0] : [-.3675, .93, detachedWall ? .03 : .01875])); if (missing !== 'left') group.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(.025, .25, .4175), new THREE.MeshBasicMaterial()); right.name = 'drawer-right'; right.position.set(.3675, .93, .01875); if (missing !== 'right') group.add(right);
  const drawerBack = new THREE.Mesh(new THREE.BoxGeometry(.71, .25, .025), new THREE.MeshBasicMaterial()); drawerBack.name = 'drawer-back'; drawerBack.position.set(0, .93, -.1775); if (missing !== 'back') group.add(drawerBack);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, .04), new THREE.MeshBasicMaterial()); handle.name = 'drawer-handle'; handle.position.set(handleOutside ? .42 : .3, .95, .25); group.add(handle);
  if (solidTray) { const filler = new THREE.Mesh(new THREE.BoxGeometry(.5, .18, .3), new THREE.MeshBasicMaterial()); filler.name = 'drawer-solid-filler'; filler.position.set(0, .9, 0); group.add(filler); }
  if (staticFiller) { const filler = new THREE.Mesh(new THREE.BoxGeometry(.75, .2, .35), new THREE.MeshBasicMaterial()); filler.name = 'cabinet-solid-filler'; filler.position.set(0, .93, 0); wrapper.add(filler); }
  if (duplicateGroup) { const duplicate = new THREE.Group(); duplicate.name = 'cabinet-drawer-slide'; wrapper.add(duplicate); }
  scene.updateMatrixWorld(true);
  return scene;
}

const checks = [];
const invoke = (scene, candidate) => validateSlidingPartGeometry(scene, candidate, (code, failurePath, message, details) => { const error = new Error(message); error.code = code; error.path = failurePath; error.details = details; throw error; });
function pass(name, observed) { checks.push({name, passed: true, observed}); }
function expectFailure(name, scene, candidate, code) {
  let captured; try { invoke(scene, candidate); } catch (error) { captured = error; }
  assert(captured, `${name} unexpectedly passed`); assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`);
  checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, message: captured.message}});
}

const valid = invoke(slidingScene(), resource()); assert.equal(valid.checked, true); pass('valid tray with nested identity wrapper and transformed scene root', valid);
const ignored = invoke(slidingScene(), {movingParts: [{kind: 'hinge'}]}); assert.equal(ignored.checked, false); pass('resource without a slide part is ignored', ignored);
expectFailure('missing sliding group is rejected', slidingScene(), resource({partNodes: {drawer: 'missing-group'}}), 'missing-sliding-part-node');
expectFailure('duplicate sliding groups are rejected', slidingScene({duplicateGroup: true}), resource(), 'missing-sliding-part-node');
expectFailure('missing bottom mesh is rejected', slidingScene({missing: 'bottom'}), resource(), 'missing-sliding-part-mesh');
expectFailure('nonidentity wrapper is rejected', slidingScene({wrapperPosition: [.01, 0, 0]}), resource(), 'sliding-part-parent-transform');
expectFailure('wrong closed group pose is rejected', slidingScene({groupPosition: [0, 0, .01]}), resource(), 'invalid-sliding-part-pivot');
expectFailure('front panel outside its envelope is rejected', slidingScene({panelPosition: [0, .95, .3]}), resource(), 'sliding-part-bounds');
expectFailure('shared-edge front rectangle is rejected', slidingScene({panelGeometry: edgeFrontGeometry(), panelPosition: [0, 0, 0]}), resource(), 'sliding-part-surface');
expectFailure('solid tray filler intruding into the cavity is rejected', slidingScene({solidTray: true}), resource(), 'sliding-part-cavity-occupied');
expectFailure('detached tray wall is rejected', slidingScene({detachedWall: true}), resource(), 'sliding-part-wall-geometry');
expectFailure('false frame tray wall is rejected', slidingScene({wallGeometry: partialLeftWallGeometry()}), resource(), 'sliding-part-surface');
expectFailure('static solid cabinet filler is rejected', slidingScene({staticFiller: true}), resource(), 'sliding-static-cavity-occupied');
expectFailure('active handle beyond declared bounds is rejected', slidingScene({handleOutside: true}), resource(), 'sliding-part-bounds');
expectFailure('thin front plane is rejected', slidingScene({panelGeometry: new THREE.PlaneGeometry(.84, .34), panelPosition: [0, .95, .2625]}), resource(), 'sliding-part-thickness');

const report = {status: checks.every(check => check.passed) ? 'passed' : 'failed', generatedAt: new Date().toISOString(), configuration: {difficulty: 'complex', requestedModel: 'gpt-6.1-sol', requestedReasoningEffort: 'high', actualProviderConfiguration: 'not independently verified', hostHookInterception: 'not independently verified'}, api: 'validateSlidingPartGeometry(scene, resource, fail)', checks, limits: ['CPU-only synthetic Three scenes. No browser, GPU, GLB decode, state transaction or animation clock.', 'The bounded contract validates one rectangular sliding tray with five mapped components and conservative cavity checks.', 'This does not prove runtime translation, swept blocking, persistence or visual acceptance.']};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
