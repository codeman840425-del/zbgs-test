import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateInformationGeometry} from '../../prototype/src/company/information-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-floor-information-geometry-v1');
const collectionPath = path.resolve(process.argv[3] || 'prototype/public/company-assets/floor-information-v1/collection.json');
await fs.mkdir(output, {recursive: true});
const resource = {
  id: 'information-board-floor-test', mountRole: 'information-board-floor',
  informationSurface: {schema: 'information-face-v1', width: .88, height: .56, position: [0, 1.3, .031]},
  informationNodes: {back: 'information-back', base: 'information-base', post: 'information-post'},
};
const checks = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invoke = (scene, definition) => validateInformationGeometry(scene, definition, (code, failurePath, message, details) => {
  const error = new Error(message); Object.assign(error, {code, path: failurePath, details}); throw error;
});
function box(name, dimensions, center) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshBasicMaterial());
  mesh.name = name; mesh.position.set(...center); return mesh;
}
function scene() {
  const root = new THREE.Scene(), wrapper = new THREE.Group();
  root.position.set(2, .4, -3); root.rotation.y = Math.PI / 2;
  root.add(wrapper);
  wrapper.add(box('information-back', [.9, .58, .02], [0, 1.3, .01]));
  wrapper.add(box('information-base', [.24, .06, .38], [0, .03, 0]));
  wrapper.add(box('information-post', [.08, 1, .04], [0, .56, -.005]));
  wrapper.add(box('frame-left', [.04, .65, .04], [-.47, 1.3, .04]));
  wrapper.add(box('frame-right', [.04, .65, .04], [.47, 1.3, .04]));
  return root;
}
function cloneGeometry(mesh) {
  mesh.geometry = mesh.geometry.toNonIndexed(); return mesh.geometry.getAttribute('position');
}
function topOnly(mesh) {
  // Keep every original bounding corner, but reference only the two top triangles.
  const positions = cloneGeometry(mesh), indices = [];
  let maxY = -Infinity;
  for (let index = 0; index < positions.count; index++) maxY = Math.max(maxY, positions.getY(index));
  for (let index = 0; index < positions.count; index += 3) {
    if ([0, 1, 2].every(step => Math.abs(positions.getY(index + step) - maxY) < 1e-6)) indices.push(index, index + 1, index + 2);
  }
  assert.equal(indices.length, 6);
  mesh.geometry.setIndex(Array.from({length: 6}, () => indices).flat());
}
function triangle(root, name, points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = name; root.add(mesh);
}
const mutations = [
  ...['base', 'post', 'back'].flatMap(role => [
    {name: `missing ${role}`, code: 'information-mapping', change(root) { root.getObjectByName(`information-${role}`).removeFromParent(); }},
    {name: `duplicate ${role}`, code: 'information-mapping', change(root) { const mesh = root.getObjectByName(`information-${role}`); mesh.parent.add(mesh.clone()); }},
    {name: `top-only ${role} with unchanged bounds`, code: `information-${role}-geometry`, change(root) { topOnly(root.getObjectByName(`information-${role}`)); }},
    {name: `incomplete ${role} corner`, code: `information-${role}-geometry`, change(root) { const position = cloneGeometry(root.getObjectByName(`information-${role}`)); position.setY(0, position.getY(0) - .005); }},
    {name: `degenerate ${role} triangle`, code: `information-${role}-geometry`, change(root) { const position = cloneGeometry(root.getObjectByName(`information-${role}`)); position.setXYZ(0, position.getX(1), position.getY(1), position.getZ(1)); }},
    {name: `repeated ${role} face triangle`, code: `information-${role}-geometry`, change(root) { const position = cloneGeometry(root.getObjectByName(`information-${role}`)); for (let i = 0; i < 3; i++) position.setXYZ(i + 3, position.getX(i), position.getY(i), position.getZ(i)); }},
    {name: `reversed ${role} face`, code: `information-${role}-geometry`, change(root) { const position = cloneGeometry(root.getObjectByName(`information-${role}`)); const a = [position.getX(0), position.getY(0), position.getZ(0)]; position.setXYZ(0, position.getX(1), position.getY(1), position.getZ(1)); position.setXYZ(1, ...a); }},
  ]),
  {name: 'base mapping to a group', code: 'information-base-geometry', change(root) { const mesh = root.getObjectByName('information-base'), parent = mesh.parent; mesh.removeFromParent(); const group = new THREE.Group(); group.name = mesh.name; parent.add(group); }},
  {name: 'nonfinite base vertex', code: 'information-base-geometry', change(root) { cloneGeometry(root.getObjectByName('information-base')).setX(0, NaN); }},
  {name: 'out of range post index', code: 'information-post-geometry', change(root) { const mesh = root.getObjectByName('information-post'); mesh.geometry = mesh.geometry.clone(); mesh.geometry.index.setX(0, mesh.geometry.getAttribute('position').count); }},
  {name: 'floating base', code: 'information-floor-grounding', change(root) { root.getObjectByName('information-base').position.y += .02; }},
  {name: 'base below ground', code: 'information-floor-grounding', change(root) { root.getObjectByName('information-base').position.y -= .02; }},
  {name: 'disconnected post bottom', code: 'information-floor-support', change(root) { root.getObjectByName('information-post').position.y += .01; }},
  {name: 'post misses base in X', code: 'information-floor-support', change(root) { root.getObjectByName('information-post').position.x += .3; }},
  {name: 'post misses back in Z', code: 'information-floor-support', change(root) { root.getObjectByName('information-post').position.z -= .05; }},
  {name: 'disconnected back above post', code: 'information-floor-support', change(root) { root.getObjectByName('information-back').position.y += .08; }},
  {name: 'offset base with remaining contact', code: 'information-base-geometry', change(root) { root.getObjectByName('information-base').position.x += .01; }},
  {name: 'undersized post', code: 'information-post-geometry', change(root) { root.getObjectByName('information-post').scale.x = .75; }},
  {name: 'front rectangle blocker', code: 'information-surface-occluded', change(root) { root.add(box('front-blocker', [.2, .2, .02], [0, 1.3, .04])); }},
  {name: 'tilted triangle entering raised rectangle', code: 'information-surface-occluded', change(root) { triangle(root, 'tilted-blocker', [-.1, 1.2, .02, .1, 1.2, .05, .1, 1.4, .05]); }},
  {name: 'large triangle enclosing rectangle without interior vertices', code: 'information-surface-occluded', change(root) { triangle(root, 'enclosing-blocker', [-2, -1, .04, 2, -1, .04, 0, 5, .04]); }},
];
function expectFailure(name, root, definition, code) {
  let captured;
  try { invoke(root, definition); } catch (error) { captured = error; }
  assert(captured, `${name} unexpectedly passed`);
  assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`);
  checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, details: captured.details}});
}
function pass(name, root, definition) {
  const observed = invoke(root, definition); assert.equal(observed.checked, true);
  checks.push({name, passed: true, observed});
}
function mutationChecks(prefix, makeScene, definition) {
  for (const mutation of mutations) {
    const root = makeScene(); mutation.change(root);
    expectFailure(`${prefix} / ${mutation.name}`, root, definition, mutation.code);
  }
}
pass('transformed scene with grounded complete solids', scene(), resource);
const nested = scene(), wrapper = nested.children[0];
wrapper.position.set(.015, .02, -.01);
for (const child of wrapper.children) child.position.sub(wrapper.position);
pass('nested mesh transforms are evaluated in asset local coordinates', nested, resource);
const behind = scene(); behind.add(box('behind-rectangle', [.2, .2, .01], [0, 1.3, -.04]));
pass('geometry behind content plane remains allowed', behind, resource);
const low = scene(); low.add(box('low-support', [.2, .2, .02], [0, .4, .04]));
pass('front support below raised rectangle remains allowed', low, resource);
mutationChecks('synthetic actual triangles', scene, resource);
expectFailure('wall-height slot is rejected for floor board', scene(), {...resource, informationSurface: {...resource.informationSurface, position: [0, 0, .031]}}, 'information-surface-contract');

const realAssets = [];
let realAssetsPending = false;
try { await fs.access(collectionPath); } catch (error) { if (error.code !== 'ENOENT') throw error; realAssetsPending = true; }
if (!realAssetsPending) {
  const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
  assert.equal(collection.resources.length, 4, 'Floor collection must contain exactly four production models');
  for (const entry of collection.resources) {
    const definitionPath = path.resolve(entry.resourcePath), definition = JSON.parse(await fs.readFile(definitionPath, 'utf8'));
    assert.equal(definition.mountRole, 'information-board-floor');
    const assetPath = path.resolve('prototype/public', definition.asset.url.replace(/^\//, ''));
    const bytes = await fs.readFile(assetPath);
    assert.equal(hash(bytes), definition.asset.sha256, `${definition.id} SHA256 mismatch`);
    assert.equal(bytes.length, definition.asset.bytes, `${definition.id} byte size mismatch`);
    const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    pass(`production GLB ${definition.id}`, loaded.scene, definition);
    mutationChecks(`production GLB ${definition.id}`, () => loaded.scene.clone(true), definition);
    realAssets.push({id: definition.id, version: definition.version, resourcePath: definitionPath, assetPath, sha256: hash(bytes), result: 'passed-readback-and-geometry-mutations'});
  }
}
const report = {
  status: realAssetsPending ? 'pending-real-assets' : 'passed', generatedAt: new Date().toISOString(),
  source: {geometrySha256: hash(await fs.readFile('prototype/src/company/information-geometry.js')), qaSha256: hash(await fs.readFile(new URL(import.meta.url))), contractSha256: hash(await fs.readFile('docs/COMPANY-FLOOR-INFORMATION-CONTRACT-v1.txt'))},
  collectionPath, checks, realAssets,
  realAssetsPending: realAssetsPending ? 'Production collection not present. Four production GLBs have not been tested.' : false,
  limits: [
    'CPU Three.js triangle checks and GLTF readback only. Browser/GPU rendering, full asset-library envelope/footprint checks, placement and saved-instance recovery are owned by integration checks.',
    'Grounding/support use solid bounds only after each named mesh passes twelve actual finite nondegenerate triangles, all six outward faces, exact four corners and shared diagonal per face.',
    'The contract validates fixed axis-aligned production support geometry. It does not claim furniture stability or arbitrary support-shape inference.',
    'Wall/content regression is a separate invocation of the unchanged qa-information-geometry.mjs with an output path under this evidence directory.',
  ],
};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, productionModels: realAssets.length}, null, 2));
