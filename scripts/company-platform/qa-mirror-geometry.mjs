import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateMirrorGeometry} from '../../prototype/src/company/mirror-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-mirror-geometry-v1');
const collectionPath = path.resolve(process.argv[3] || 'prototype/public/company-assets/mirror-v1/collection.json');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [], realAssets = [];
const rectangle = (left = -.3, right = .3, bottom = -.7, top = .7) => [[left, bottom], [right, bottom], [right, top], [left, top]];
const resource = (polygons = [rectangle()]) => ({
  id: 'mirror-geometry-fixture', mountRole: 'mirror',
  mirrorSurface: {schema: 'planar-mirror-v1', profile: 'single-512-v1', position: [0, 0, .026]},
  mirrorNodes: {face: 'mirror-surface'}, mirrorShape: {polygons},
});
const invoke = (root, definition) => validateMirrorGeometry(root, definition, (code, failurePath, message, details) => {
  throw Object.assign(new Error(message), {code, path: failurePath, details});
});
function mesh(name, points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  const result = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  result.name = name;
  return result;
}
function face(polygons) {
  const points = [];
  for (const polygon of polygons) for (let index = 1; index < polygon.length - 1; index++)
    for (const point of [polygon[0], polygon[index], polygon[index + 1]]) points.push([...point, .026]);
  return mesh('mirror-surface', points);
}
function box(name, dimensions, position) {
  const result = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshBasicMaterial());
  result.name = name;
  result.position.set(...position);
  return result;
}
function scene(definition = resource()) {
  const result = new THREE.Scene(), wrapper = new THREE.Group();
  result.add(wrapper);
  wrapper.add(face(definition.mirrorShape.polygons));
  wrapper.add(box('mirror-back', [.64, 1.44, .02], [0, 0, .01]));
  wrapper.add(box('frame-left', [.04, 1.48, .04], [-.34, 0, .02]));
  wrapper.add(box('frame-right', [.04, 1.48, .04], [.34, 0, .02]));
  wrapper.add(box('frame-bottom', [.64, .04, .04], [0, -.74, .02]));
  wrapper.add(box('frame-top', [.64, .04, .04], [0, .74, .02]));
  return result;
}
function positionAttribute(root) {
  const node = root.getObjectByName('mirror-surface');
  node.geometry = node.geometry.clone();
  return node.geometry.getAttribute('position');
}
function replaceFace(root, points) {
  const old = root.getObjectByName('mirror-surface');
  old.parent.add(mesh('mirror-surface', points));
  old.removeFromParent();
}
function pass(name, root, definition = resource()) {
  const result = invoke(root, definition);
  assert.equal(result.checked, true);
  checks.push({name, passed: true, observed: result});
}
function reject(name, root, definition, expected) {
  let failure;
  try { invoke(root, definition); } catch (error) { failure = error; }
  assert(failure, `${name} unexpectedly passed`);
  assert.equal(failure.code, expected, `${name} expected ${expected}, got ${failure.code} / ${failure.message}`);
  checks.push({name, passed: true, observed: {code: failure.code, path: failure.path, details: failure.details}});
}

const mutations = [
  {name: 'missing face', code: 'mirror-mapping', change(root) { root.getObjectByName('mirror-surface').removeFromParent(); }},
  {name: 'duplicate named face', code: 'mirror-mapping', change(root) { const node = root.getObjectByName('mirror-surface'); node.parent.add(node.clone()); }},
  {name: 'face is a group', code: 'mirror-mapping', change(root) { const old = root.getObjectByName('mirror-surface'), group = new THREE.Group(); group.name = old.name; old.parent.add(group); old.removeFromParent(); }},
  {name: 'NaN face vertex', code: 'mirror-mesh-geometry', change(root) { positionAttribute(root).setX(0, NaN); }},
  {name: 'noncoplanar face', code: 'mirror-face-geometry', change(root) { positionAttribute(root).setZ(0, .027); }},
  {name: 'reversed triangle', code: 'mirror-face-geometry', change(root) { const p = positionAttribute(root), a = [p.getX(0), p.getY(0), p.getZ(0)]; p.setXYZ(0, p.getX(1), p.getY(1), p.getZ(1)); p.setXYZ(1, ...a); }},
  {name: 'degenerate triangle', code: 'mirror-mesh-geometry', change(root) { const p = positionAttribute(root); p.setXYZ(0, p.getX(1), p.getY(1), p.getZ(1)); }},
  {name: 'missing triangle leaves spatial hole', code: 'mirror-face-gap', change(root) { const node = root.getObjectByName('mirror-surface'); node.geometry = node.geometry.clone(); const total = node.geometry.index?.count || node.geometry.getAttribute('position').count; node.geometry.setIndex(Array.from({length: total - 3}, (_, index) => node.geometry.index ? node.geometry.index.getX(index + 3) : index + 3)); }},
  {name: 'repeat triangle replaces equal area and leaves hole', code: 'mirror-face-overlap', change(root) { const node = root.getObjectByName('mirror-surface'); node.geometry = node.geometry.clone(); const total = node.geometry.index?.count || node.geometry.getAttribute('position').count; node.geometry.setIndex(Array.from({length: total}, (_, index) => { const source = index >= 3 && index < 6 ? index - 3 : index; return node.geometry.index ? node.geometry.index.getX(source) : source; })); }},
  {name: 'face index outside vertex buffer', code: 'mirror-mesh-geometry', change(root) { const node = root.getObjectByName('mirror-surface'); node.geometry = node.geometry.clone(); node.geometry.setIndex([0, 1, 999999]); }},
  {name: 'hidden face ancestor', code: 'mirror-face-geometry', change(root) { root.getObjectByName('mirror-surface').parent.visible = false; }},
  {name: 'face local translation', code: 'mirror-parent-transform', change(root) { root.getObjectByName('mirror-surface').position.x = .001; }},
  {name: 'ancestor translated with compensated children', code: 'mirror-parent-transform', change(root) { const parent = root.getObjectByName('mirror-surface').parent; parent.position.x = .01; for (const child of parent.children) child.position.x -= .01; }},
  {name: 'resource root rotation', code: 'mirror-parent-transform', change(root) { root.rotation.y = Math.PI / 2; }},
  {name: 'double ancestor reversals cancel in world', code: 'mirror-transform', change(root) { const parent = root.getObjectByName('mirror-surface').parent; parent.scale.x = -1; root.scale.x = -1; }},
  {name: 'singular ancestor transform', code: 'mirror-transform', change(root) { root.scale.z = 0; }},
  {name: 'nonfinite ancestor transform', code: 'mirror-transform', change(root) { root.position.x = Infinity; }},
  {name: 'projective local matrix', code: 'mirror-transform', change(root) { const node = root.getObjectByName('mirror-surface'); node.matrixAutoUpdate = false; node.matrix.elements[3] = .01; }},
  {name: 'partial draw range', code: 'mirror-mesh-geometry', change(root) { const node = root.getObjectByName('mirror-surface'); node.geometry = node.geometry.clone(); node.geometry.setDrawRange(0, 3); }},
  {name: 'nonfinite UV attribute', code: 'mirror-mesh-geometry', change(root) { const node = root.getObjectByName('mirror-surface'); node.geometry = node.geometry.clone(); const uv = new THREE.Float32BufferAttribute(new Float32Array(node.geometry.getAttribute('position').count * 2), 2); uv.setX(0, NaN); node.geometry.setAttribute('uv', uv); }},
  {name: 'frame exceeds installation envelope', code: 'mirror-envelope', change(root) { root.add(box('outside', [.02, .02, .02], [.4, 0, .02])); }},
  {name: 'frame reaches mirror center', code: 'mirror-surface-occluded', change(root) { root.add(box('blocker', [.2, .2, .01], [0, 0, .035])); }},
  {name: 'slope crosses mirror plane with no interior front vertices', code: 'mirror-surface-occluded', change(root) { root.add(mesh('sloped-blocker', [[-.38, -.85, .01], [.38, -.85, .035], [0, .85, .035]])); }},
  {name: 'enclosing front triangle without mirror interior vertices', code: 'mirror-surface-occluded', change(root) { root.add(mesh('enclosing-blocker', [[-.39, -.89, .035], [.39, -.89, .035], [0, .89, .035]])); }},
  {name: 'coplanar front triangle', code: 'mirror-surface-occluded', change(root) { root.add(mesh('coplanar-blocker', [[-.1, -.1, .026], [.1, -.1, .026], [0, .1, .026]])); }},
  {name: 'vertical fin with zero projected area in mirror interior', code: 'mirror-surface-occluded', change(root) { root.add(mesh('vertical-blocker', [[.1, -.2, .027], [.1, .2, .027], [.1, .2, .04]])); }},
  {name: 'open back with thickness cannot substitute solid', code: 'mirror-back-geometry', change(root) { const back = root.getObjectByName('mirror-back'); back.geometry = back.geometry.index ? back.geometry.toNonIndexed() : back.geometry.clone(); back.geometry.setIndex([0, 1, 2]); }},
  {name: 'zero-thickness back', code: 'mirror-mesh-geometry', change(root) { root.getObjectByName('mirror-back').scale.z = 1e-12; }},
];

let failure, realAssetsPending = false;
try {
  assert.deepEqual(validateMirrorGeometry(null, {mountRole: 'other'}, () => assert.fail()), {checked: false});
  checks.push({name: 'unrelated resources skip without scene or side effects', passed: true});
  assert.throws(() => validateMirrorGeometry(scene(), resource()), TypeError);
  checks.push({name: 'missing failure callback rejects', passed: true});
  pass('valid rectangle with real solid back and frame', scene());
  const circle = resource([Array.from({length: 96}, (_, index) => [.28 * Math.cos(index * Math.PI / 48), .28 * Math.sin(index * Math.PI / 48)])]);
  pass('96-sided circle contour', scene(circle), circle);
  const grid = resource([rectangle(-.3, -.02, -.7, -.02), rectangle(.02, .3, -.7, -.02), rectangle(-.3, -.02, .02, .7), rectangle(.02, .3, .02, .7)]);
  pass('separated polygons with one actual face mesh', scene(grid), grid);
  const gapFin = scene(grid);
  gapFin.add(mesh('fin-inside-declared-grid-gap', [[0, -.2, .027], [0, .2, .027], [0, .2, .04]]));
  pass('front fin in declared pane gap remains allowed', gapFin, grid);
  const interior = scene(); interior.add(box('behind-interior', [.1, .1, .003], [0, 0, .022]));
  pass('geometry strictly behind face remains allowed', interior);
  for (const mutation of mutations) {
    const root = scene(); mutation.change(root); reject(`synthetic / ${mutation.name}`, root, resource(), mutation.code);
  }
  const shapeCases = [
    {name: 'clockwise polygon', polygons: [rectangle().reverse()], code: 'mirror-shape'},
    {name: 'concave polygon', polygons: [[[-.3, -.7], [.3, -.7], [0, 0], [.3, .7], [-.3, .7]]], code: 'mirror-shape'},
    {name: 'self intersecting star', polygons: [[[-.3, -.7], [.3, .7], [-.3, .7], [.3, -.7]]], code: 'mirror-shape'},
    {name: 'duplicate contour point', polygons: [[...rectangle(), rectangle()[0]]], code: 'mirror-shape'},
    {name: 'nonfinite contour', polygons: [[[NaN, -.7], [.3, -.7], [.3, .7]]], code: 'mirror-shape'},
    {name: 'overlapping contours', polygons: [rectangle(), rectangle(-.1, .1, -.1, .1)], code: 'mirror-shape-overlap'},
    {name: 'out of envelope contour', polygons: [rectangle(-.41, .3)], code: 'mirror-shape'},
  ];
  for (const test of shapeCases) reject(test.name, scene(), resource(test.polygons), test.code);
  const acrossGap = scene(grid);
  replaceFace(acrossGap, [[-.3, -.7, .026], [.3, -.7, .026], [.3, .7, .026], [-.3, -.7, .026], [.3, .7, .026], [-.3, .7, .026]]);
  reject('triangle bridge across separated declared panes', acrossGap, grid, 'mirror-face-outside');
  const faceOutside = scene(); positionAttribute(faceOutside).setX(0, -.31);
  reject('face corner extends outside declared contour', faceOutside, resource(), 'mirror-face-outside');
  const centralHole = scene();
  const corners = rectangle(), outer = corners, inner = rectangle(-.02, .02, -.02, .02), ring = [];
  for (let index = 0; index < 4; index++) {
    const next = (index + 1) % 4;
    for (const point of [outer[index], outer[next], inner[next], outer[index], inner[next], inner[index]]) ring.push([...point, .026]);
  }
  replaceFace(centralHole, ring);
  reject('interior hole despite matching outer bounds', centralHole, resource(), 'mirror-face-gap');
  const tinyDuplicates = scene(), duplicatePoints = [];
  const original = positionAttribute(tinyDuplicates);
  for (let index = 0; index < original.count; index++) duplicatePoints.push([original.getX(index), original.getY(index), original.getZ(index)]);
  for (let index = 0; index < 16; index++) duplicatePoints.push([0, 0, .026], [.0002, 0, .026], [0, .0002, .026]);
  replaceFace(tinyDuplicates, duplicatePoints);
  reject('many individually sub-tolerance duplicate triangles accumulate', tinyDuplicates, resource(), 'mirror-face-overlap');
  const tinyBlockers = scene();
  for (let index = 0; index < 16; index++) {
    const y = index * .001;
    tinyBlockers.add(mesh(`tiny-blocker-${index}`, [[0, y, .035], [.0002, y, .035], [0, y + .0002, .035]]));
  }
  reject('many individually sub-tolerance blockers accumulate', tinyBlockers, resource(), 'mirror-surface-occluded');
  reject('non-mesh scene', null, resource(), 'invalid-mirror-scene');
  const wrongPlane = resource(); wrongPlane.mirrorSurface.position[2] = .027;
  reject('wrong fixed reflection plane', scene(), wrongPlane, 'mirror-surface-contract');

  try { await fs.access(collectionPath); } catch (error) { if (error.code !== 'ENOENT') throw error; realAssetsPending = true; }
  if (!realAssetsPending) {
    const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
    assert.equal(collection.resources.length, 4, 'Mirror collection must contain four production models');
    for (const entry of collection.resources) {
      const definitionPath = path.resolve(entry.resourcePath), definition = JSON.parse(await fs.readFile(definitionPath, 'utf8'));
      const assetPath = path.resolve('prototype/public', definition.asset.url.replace(/^\//, ''));
      const bytes = await fs.readFile(assetPath);
      assert.equal(hash(bytes), definition.asset.sha256, `${definition.id} SHA256 mismatch`);
      assert.equal(bytes.length, definition.asset.bytes, `${definition.id} byte length mismatch`);
      const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      pass(`production GLB / ${definition.id}`, loaded.scene, definition);
      for (const mutation of mutations) {
        const candidate = loaded.scene.clone(true);
        mutation.change(candidate);
        reject(`production GLB ${definition.id} / ${mutation.name}`, candidate, definition, mutation.code);
      }
      realAssets.push({id: definition.id, version: definition.version, resourcePath: definitionPath, assetPath, sha256: hash(bytes), status: 'passed-readback-and-geometry-mutations'});
    }
  }
} catch (error) {
  failure = {message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack};
}
const report = {
  status: failure ? 'failed' : realAssetsPending ? 'pending-real-assets' : 'passed', generatedAt: new Date().toISOString(),
  source: {geometrySha256: hash(await fs.readFile('prototype/src/company/mirror-geometry.js')), qaSha256: hash(await fs.readFile(new URL(import.meta.url))), contractSha256: hash(await fs.readFile('docs/COMPANY-MIRROR-CONTRACT-v1.txt'))},
  collectionPath, checks, realAssets, failure,
  realAssetsPending: realAssetsPending ? 'Production collection not present. Four real GLBs remain unverified.' : false,
  limits: [
    'CPU Three.js mesh validation and actual GLTFLoader readback. This does not verify GPU reflection, appearance, save/reopen or ordinary-computer performance.',
    'Face verification combines convex clipping, pairwise triangle intersections, actual uncovered polygon fragments, and triangle containment in the declared contour union. Equal area or matching bounds alone cannot pass.',
    'Position tolerance is 1e-6 metres, aggregate area tolerance 1e-7 square metres per validation category, clipping arithmetic tolerance 1e-12. Features below these tolerances are not resolved. Many sub-tolerance overlapping/outside/occluding triangles are accumulated before accepting.',
    'Static geometry only. Face plus resource ancestors must be identity. Orientation reversals are rejected at every local transform, including compensated double reversals.',
    'Backing validation requires a closed oriented positive-volume mesh strictly behind the mirror, welded by 1e-6 metre coordinate cells. This verifies mesh closure and positive volume, without proving arbitrary mesh self-intersection freedom.',
    'At most 64 polygons, 512 vertices per polygon, 2048 total contour vertices, 2048 face triangles and 8192 triangles per body mesh. The bounded profile limits CPU work on imported data.',
    'Occlusion is evaluated by clipping actual frame/back triangles against z>=.026 minus position tolerance and each convex mirror contour. Boundary-only contact is allowed. Material transparency is not an exemption.',
  ],
};
const json = JSON.stringify(report, null, 2) + '\n';
await fs.writeFile(path.join(runDirectory, 'report.json'), json);
await fs.writeFile(path.join(output, 'report.json'), json);
console.log(JSON.stringify({status: report.status, output, runDirectory, checks: checks.length, productionModels: realAssets.length, failure}, null, 2));
if (failure) process.exitCode = 1;
