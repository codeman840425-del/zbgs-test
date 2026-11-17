import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateMirrorGeometry} from '../../prototype/src/company/mirror-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-floor-mirror-geometry-v1');
const collectionPath = path.resolve(process.argv[3] || 'prototype/public/company-assets/floor-mirror-v1/collection.json');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const checks = [], realAssets = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invoke = (scene, resource) => validateMirrorGeometry(scene, resource, (code, location, message, details) => {
  throw Object.assign(new Error(message), {code, path: location, details});
});
const ref = role => `mirror-${role}`;
function box(name, dimensions, center) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshBasicMaterial());
  mesh.name = name; mesh.position.set(...center); return mesh;
}
function triangle(name, vertices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = name; return mesh;
}
function independentGeometry(root, role) {
  const mesh = root.getObjectByName(ref(role));
  mesh.geometry = mesh.geometry.clone();
  return mesh;
}
function cutToTop(root, role) {
  const mesh = independentGeometry(root, role), positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getIndex(), total = indices?.count || positions.count;
  const read = offset => indices ? indices.getX(offset) : offset;
  let top = -Infinity;
  for (let vertex = 0; vertex < positions.count; vertex++) top = Math.max(top, positions.getY(vertex));
  const chosen = [];
  for (let offset = 0; offset < total; offset += 3) {
    const sources = [read(offset), read(offset + 1), read(offset + 2)];
    if (sources.every(source => Math.abs(positions.getY(source) - top) < 1e-6)) chosen.push(...sources);
  }
  mesh.geometry.setIndex(Array.from({length: 36}, (_, index) => chosen[index % chosen.length]));
}
function changeFaceIndices(root, transform) {
  const mesh = independentGeometry(root, 'surface'), indices = mesh.geometry.getIndex();
  const values = Array.from({length: indices?.count || mesh.geometry.getAttribute('position').count}, (_, index) => indices ? indices.getX(index) : index);
  mesh.geometry.setIndex(transform(values));
}
function appendFrameBox(root, dimensions, center, reversed = false) {
  const mesh = independentGeometry(root, 'frame');
  const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const extra = new THREE.BoxGeometry(...dimensions).translate(...center).toNonIndexed();
  const original = flat.getAttribute('position'), added = extra.getAttribute('position');
  const values = [...original.array];
  for (let offset = 0; offset < added.count; offset += 3) {
    for (const step of reversed ? [1, 0, 2] : [0, 1, 2])
      values.push(added.getX(offset + step), added.getY(offset + step), added.getZ(offset + step));
  }
  const combined = new THREE.BufferGeometry();
  combined.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  mesh.geometry = combined;
}
function pass(name, root, definition) {
  const observed = invoke(root, definition); assert.equal(observed.checked, true); assert.equal(observed.grounded, true);
  checks.push({name, passed: true, observed});
}
function reject(name, root, definition, expected) {
  let observed;
  try { invoke(root, definition); } catch (error) { observed = error; }
  assert(observed, `${name} unexpectedly passed`);
  assert.equal(observed.code, expected, `${name} expected ${expected}, got ${observed.code} / ${observed.message}`);
  checks.push({name, passed: true, observed: {code: observed.code, path: observed.path, details: observed.details}});
}
function resourceFromWall(resource) {
  return {...structuredClone(resource), id: `synthetic-floor-${resource.id}`, mount: 'floor-surface', mountRole: 'floor-mirror', productionBranch: 'floor-mirror',
    mounting: {origin: 'bottom', width: .8, height: 1.8, depth: .6}, footprint: {center: [0, 0], halfSize: [.4, .3], blocking: true},
    mirrorSurface: {schema: 'planar-mirror-v1', profile: 'single-512-v1', position: [0, .92, .026]},
    mirrorNodes: {face: ref('surface'), back: ref('back'), base: ref('base'), post: ref('post')},
    mirrorShape: {polygons: resource.mirrorShape.polygons.map(polygon => polygon.map(([x, y]) => [x, Math.fround(y + .92)]))}};
}
function sceneFromWall(scene) {
  const root = scene.clone(true);
  root.traverse(node => {
    if (!node.isMesh) return;
    node.geometry = node.geometry.clone();
    const positions = node.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) positions.setY(index, Math.fround(positions.getY(index) + .92));
  });
  root.add(box(ref('base'), [.24, .06, .38], [0, .03, 0]));
  root.add(box(ref('post'), [.08, .52, .04], [0, .32, -.005]));
  root.add(box('synthetic-platform', [.68, .04, .46], [0, .02, 0]));
  return root;
}
async function readResource(entry) {
  const resourcePath = path.resolve(entry.resourcePath), resource = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
  const assetPath = path.resolve('prototype/public', resource.asset.url.replace(/^\//, '')), bytes = await fs.readFile(assetPath);
  assert.equal(hash(bytes), resource.asset.sha256, `${resource.id} SHA mismatch`);
  assert.equal(bytes.length, resource.asset.bytes, `${resource.id} byte length mismatch`);
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return {resourcePath, assetPath, resource, scene: loaded.scene, sha256: hash(bytes)};
}

const mutations = [
  ...['surface', 'back', 'base', 'post'].flatMap(role => [
    {name: `missing ${role}`, code: 'mirror-mapping', change(root) { root.getObjectByName(ref(role)).removeFromParent(); }},
    {name: `duplicate ${role}`, code: 'mirror-mapping', change(root) { const mesh = root.getObjectByName(ref(role)); mesh.parent.add(mesh.clone()); }},
  ]),
  ...['base', 'post'].flatMap(role => [
    {name: `${role} top triangles repeated with original bounds`, code: `mirror-${role}-geometry`, change(root) { cutToTop(root, role); }},
    {name: `${role} missing triangle`, code: `mirror-${role}-geometry`, change(root) { const mesh = independentGeometry(root, role), index = mesh.geometry.getIndex(); mesh.geometry.setIndex(Array.from({length: (index?.count || mesh.geometry.getAttribute('position').count) - 3}, (_, offset) => index ? index.getX(offset + 3) : offset + 3)); }},
    {name: `${role} wrong actual width`, code: `mirror-${role}-geometry`, change(root) { root.getObjectByName(ref(role)).scale.x *= .9; }},
  ]),
  {name: 'floating base', code: 'mirror-floor-grounding', change(root) { root.getObjectByName(ref('base')).position.y += .005; }},
  {name: 'base below ground', code: 'mirror-envelope', change(root) { root.getObjectByName(ref('base')).position.y -= .005; }},
  {name: 'offset post misses its fixed center', code: 'mirror-post-geometry', change(root) { root.getObjectByName(ref('post')).position.x += .1; }},
  {name: 'post shortened away from base and back', code: 'mirror-post-geometry', change(root) { root.getObjectByName(ref('post')).scale.y *= .9; }},
  {name: 'open designated back while post remains a closed solid', code: 'mirror-back-geometry', change(root) { const mesh = independentGeometry(root, 'back'); mesh.geometry.setIndex([0, 1, 2]); }},
  {name: 'designated back shifted in depth', code: 'mirror-back-geometry', change(root) { root.getObjectByName(ref('back')).position.z += .002; }},
  {name: 'base mapped as back cannot substitute designated back', code: 'mirror-mapping', change(root, definition) { definition.mirrorNodes.back = ref('base'); }},
  {name: 'tiny closed cube cannot substitute entire back', code: 'mirror-back-geometry', change(root) { const old = root.getObjectByName(ref('back')); old.parent.add(box(ref('back'), [.04, .04, .012], [0, .57, .006])); old.removeFromParent(); }},
  {name: 'face not coplanar', code: 'mirror-face-geometry', change(root) { independentGeometry(root, 'surface').geometry.getAttribute('position').setZ(0, .027); }},
  {name: 'face missing triangle leaves a spatial hole', code: 'mirror-face-gap', change(root) { changeFaceIndices(root, indices => indices.slice(3)); }},
  {name: 'equal-area repeated triangle replaces a region', code: 'mirror-face-overlap', change(root) { changeFaceIndices(root, indices => [...indices.slice(0, 3), ...indices.slice(0, 3), ...indices.slice(6)]); }},
  {name: 'reversed actual face triangle', code: 'mirror-face-geometry', change(root) { changeFaceIndices(root, indices => [indices[1], indices[0], ...indices.slice(2)]); }},
  {name: 'nonfinite position', code: 'mirror-mesh-geometry', change(root) { independentGeometry(root, 'surface').geometry.getAttribute('position').setX(0, NaN); }},
  {name: 'face ancestor translated', code: 'mirror-parent-transform', change(root) { root.position.y = .001; }},
  {name: 'face local translated instead of baked', code: 'mirror-parent-transform', change(root) { root.getObjectByName(ref('surface')).position.y += .92; }},
  {name: 'two reflected ancestors compensate', code: 'mirror-transform', change(root) { root.scale.x = -1; root.getObjectByName(ref('surface')).parent.scale.x *= -1; }},
  {name: 'mesh exceeds floor depth', code: 'mirror-envelope', change(root) { root.add(box('over-depth', [.01, .01, .02], [0, .02, .3])); }},
  {name: 'mesh exceeds floor top', code: 'mirror-envelope', change(root) { root.add(box('over-height', [.01, .02, .01], [0, 1.8, 0])); }},
  {name: 'front solid blocks actual pane', code: 'mirror-surface-occluded', change(root) { root.add(box('front-blocker', [.06, .06, .01], [.1, .92, .035])); }},
  {name: 'vertical fin blocks actual pane from oblique view', code: 'mirror-surface-occluded', change(root) { root.add(triangle('front-fin', [[.1, .82, .027], [.1, 1.02, .027], [.1, 1.02, .04]])); }},
  {name: 'extra closed support floating apart', code: 'mirror-floor-support', change(root) { root.add(box('floating-support', [.02, .02, .02], [.35, .15, -.2])); }},
  {name: 'extra support only point contact with common base', code: 'mirror-floor-support', change(root) {
    const extras = [];
    root.traverse(node => { if (node.isMesh && !['mirror-surface', 'mirror-back', 'mirror-base', 'mirror-post', 'mirror-frame'].includes(node.name)) extras.push(node); });
    for (const extra of extras) extra.removeFromParent();
    root.add(box('point-contact', [.02, .02, .02], [.13, .07, .2]));
  }},
  {name: 'extra support open but bounds touching base', code: 'mirror-support-geometry', change(root) { const mesh = box('open-support', [.1, .04, .1], [0, .08, -.1]); mesh.geometry.setIndex([0, 1, 2]); root.add(mesh); }},
  {name: 'frame open while other supports remain closed', code: 'mirror-frame-geometry', change(root) { const mesh = independentGeometry(root, 'frame'); mesh.geometry.setIndex([0, 1, 2]); }},
  {name: 'frame merged with a closed floating cube behind stand', code: 'mirror-floor-support', change(root) { appendFrameBox(root, [.02, .02, .02], [.35, .15, -.2]); }},
  {name: 'frame merged with floating closed cube on back contact plane', code: 'mirror-floor-support', change(root) { appendFrameBox(root, [.01, .01, .01], [.385, .15, .017]); }},
  {name: 'frame merged with inward-wound closed floating shell', code: 'mirror-frame-geometry', change(root) { appendFrameBox(root, [.02, .02, .02], [.35, .15, -.2], true); }},
];
function mutationChecks(prefix, scene, resource) {
  for (const mutation of mutations) {
    const candidate = scene.clone(true), definition = structuredClone(resource);
    mutation.change(candidate, definition);
    reject(`${prefix} / ${mutation.name}`, candidate, definition, mutation.code);
  }
}

let failure, realAssetsPending = false;
try {
  const walls = JSON.parse(await fs.readFile('prototype/public/company-assets/mirror-v1/collection.json', 'utf8'));
  for (const entry of walls.resources) {
    const wall = await readResource(entry), definition = resourceFromWall(wall.resource), candidate = sceneFromWall(wall.scene);
    pass(`synthetic baked floor ${wall.resource.id}`, candidate, definition);
    const attached = candidate.clone(true); appendFrameBox(attached, [.006, .006, .006], [-.36, .92, .015]);
    pass(`synthetic ${wall.resource.id} / additional closed frame component actually touching back`, attached, definition);
    mutationChecks(`synthetic baked floor ${wall.resource.id}`, candidate, definition);
  }
  const sampleWall = await readResource(walls.resources[0]), definition = resourceFromWall(sampleWall.resource), faceContact = sceneFromWall(sampleWall.scene);
  faceContact.add(box('real-face-contact-support', [.1, .02, .1], [.2, .05, 0]));
  pass('new support attached through a real platform top face', faceContact, definition);
  const fakeRoot = new THREE.Scene(), backPolygon = [[.2, .55], [.36, .55], [-.36, 1.3]].map(point => point.map(Math.fround));
  const fakeResource = {...definition, id: 'aabb-only-contact', mirrorShape: {polygons: [backPolygon]}};
  const shape = new THREE.Shape(backPolygon.map(point => new THREE.Vector2(...point)));
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth: .012, bevelEnabled: false, steps: 1, curveSegments: 1}), new THREE.MeshBasicMaterial());
  back.name = ref('back'); fakeRoot.add(back);
  fakeRoot.add(triangle(ref('surface'), backPolygon.map(([x, y]) => [x, y, .026])));
  fakeRoot.add(box(ref('base'), [.24, .06, .38], [0, .03, 0]));
  fakeRoot.add(box(ref('post'), [.08, .52, .04], [0, .32, -.005]));
  fakeRoot.add(box(ref('frame'), [.02, .1, .028], [.3, .7, .026]));
  reject('convex back AABB overlaps post while actual prism misses post', fakeRoot, fakeResource, 'mirror-floor-support');
  const wrongPlane = structuredClone(definition); wrongPlane.mirrorSurface.position[1] = 0;
  reject('wall plane cannot masquerade as floor mirror', sceneFromWall(sampleWall.scene), wrongPlane, 'mirror-surface-contract');

  try { await fs.access(collectionPath); } catch (error) { if (error.code !== 'ENOENT') throw error; realAssetsPending = true; }
  if (!realAssetsPending) {
    const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
    assert.equal(collection.resources.length, 4, 'Floor mirror collection requires exactly four production models');
    for (const entry of collection.resources) {
      const model = await readResource(entry);
      pass(`production GLB ${model.resource.id}`, model.scene, model.resource);
      const attached = model.scene.clone(true); appendFrameBox(attached, [.006, .006, .006], [-.36, .92, .015]);
      pass(`production GLB ${model.resource.id} / additional closed frame component actually touching back`, attached, model.resource);
      mutationChecks(`production GLB ${model.resource.id}`, model.scene, model.resource);
      realAssets.push({id: model.resource.id, version: model.resource.version, resourcePath: model.resourcePath, assetPath: model.assetPath, sha256: model.sha256, status: 'passed-real-readback-and-mutations'});
    }
  }
} catch (error) { failure = {message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack}; }
const report = {
  status: failure ? 'failed' : realAssetsPending ? 'pending-real-assets' : 'passed', generatedAt: new Date().toISOString(),
  source: {geometrySha256: hash(await fs.readFile('prototype/src/company/mirror-geometry.js')), qaSha256: hash(await fs.readFile(new URL(import.meta.url))), contractSha256: hash(await fs.readFile('docs/COMPANY-FLOOR-MIRROR-CONTRACT-v1.txt'))},
  checks, realAssets, collectionPath, failure, realAssetsPending,
  limits: [
    'CPU actual triangle geometry and GLTFLoader readback. Browser reflection, appearance, document save/reopen and ordinary-computer performance require integration evidence.',
    'Original face tolerances remain 1e-6 metres, 1e-7 square metres aggregate area and 1e-12 clipping arithmetic. Wall regression is invoked separately with its own output under this evidence directory.',
    'Fixed base/post require exactly twelve actual triangles, closed positive volume and all six complete outward box faces at fixed dimensions/centers. Bounds are used for support contacts only after those real faces pass.',
    'The designated back is independently required. Closed base/post cannot substitute it. Actual convex XY prism caps are checked with the same overlap/hole coverage algorithm and z thickness 0 to .012, then every mirror contour must fit its real hull.',
    'Post/back contact uses actual XY polygon intersection and strict positive Z overlap. The synthetic convex-prism trap has intersecting AABBs and no real volume connection.',
    'Additional support profile is closed axis-aligned boxes, matching the four fixed source designs and existing mullions. Their real face/volume contact graph must reach common base/post/back. Arbitrary curved, tilted or nonconvex support inference is outside this fixed profile.',
    'Each edge-connected frame shell is independently required to be closed with positive signed volume and to contact the actual designated back on z=.012 with positive clipped area. One attached shell cannot conceal another disconnected shell. Normal/UV seams are welded with the existing position tolerance.',
    'Mesh closure/positive signed volume does not prove arbitrary mesh self-intersection freedom. This does not certify physical furniture stability.',
  ],
};
const json = JSON.stringify(report, null, 2) + '\n';
await fs.writeFile(path.join(runDirectory, 'report.json'), json);
await fs.writeFile(path.join(output, 'report.json'), json);
console.log(JSON.stringify({status: report.status, output, runDirectory, checks: checks.length, productionModels: realAssets.length, failure}, null, 2));
if (failure) process.exitCode = 1;
