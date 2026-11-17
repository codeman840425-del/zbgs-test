import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateSideTableLifeItemsGeometry} from '../../prototype/src/company/side-table-life-items-geometry.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';
const output = path.resolve('evidence/company-side-table-life-items-geometry-v1');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const checks = [], realAssets = [], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, location, message, details) => {throw Object.assign(new Error(message), {code, path: location, details});};
const invoke = (scene, resource) => validateSideTableLifeItemsGeometry(scene, resource, fail);
function independent(root, name) {
  const mesh = root.getObjectByName(name); assert(mesh?.isMesh);
  mesh.geometry = mesh.geometry.clone(); return mesh;
}
function solid(name, min, max, material) {
  const geometry = new THREE.BoxGeometry(...max.map((value, axis) => value - min[axis]));
  geometry.translate(...max.map((value, axis) => (value + min[axis]) / 2));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name; return mesh;
}
function removeFaces(mesh, predicate) {
  const geometry = mesh.geometry, positions = geometry.attributes.position;
  const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({length: positions.count}, (_, i) => i);
  const kept = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const face = indices.slice(offset, offset + 3);
    if (!predicate(face.map(index => new THREE.Vector3().fromBufferAttribute(positions, index)), offset / 3)) kept.push(...face);
  }
  assert(kept.length < indices.length, 'The actual mutation must remove at least one face'); geometry.setIndex(kept);
}
function components(mesh) {
  const geometry = mesh.geometry, position = geometry.attributes.position;
  const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({length: position.count}, (_, i) => i);
  const key = index => [position.getX(index), position.getY(index), position.getZ(index)].map(value => Math.round(value * 1e6)).join('/');
  const faces = [];
  for (let offset = 0; offset < indices.length; offset += 3) faces.push(indices.slice(offset, offset + 3));
  const seen = new Set(), result = [];
  for (let start = 0; start < faces.length; start++) {
    if (seen.has(start)) continue;
    const queue = [start], keys = new Set(faces[start].map(key)); seen.add(start);
    for (let cursor = 0; cursor < queue.length; cursor++) for (let next = 0; next < faces.length; next++) {
      if (seen.has(next) || !faces[next].some(index => keys.has(key(index)))) continue;
      seen.add(next); queue.push(next); for (const index of faces[next]) keys.add(key(index));
    }
    result.push([...new Set(queue.flatMap(face => faces[face]))]);
  }
  return result;
}
async function mutate(name, fixture, change, codes) {
  const root = fixture.scene.clone(true), resource = structuredClone(fixture.resource); change(root, resource);
  let error; try {invoke(root, resource);} catch (caught) {error = caught;}
  const mutations = [];
  root.traverse(node => {
    if (!node.isMesh) return;
    const original = fixture.scene.getObjectByName(node.name);
    if (original?.geometry === node.geometry && original?.material === node.material) return;
    mutations.push({name: node.name, positions: Array.from(node.geometry.attributes.position.array), indices: node.geometry.index ? Array.from(node.geometry.index.array) : null,
      uv: node.geometry.attributes.uv ? Array.from(node.geometry.attributes.uv.array) : null, mapPresent: Boolean(node.material.map), transparent: node.material.transparent});
  });
  const artifact = `mutation-${checks.length}.json`;
  const removedNodes = [];
  fixture.scene.traverse(node => {if (node.isMesh && !root.getObjectByName(node.name)) removedNodes.push(node.name);});
  await fs.writeFile(path.join(runDirectory, artifact), JSON.stringify({name, baseline: fixture.modelPath, baselineSha256: sha(fixture.bytes), mutations, removedNodes, error: error && {code: error.code, path: error.path, message: error.message, details: error.details}}, null, 2) + '\n');
  assert(error, `${name} unexpectedly passed`);
  assert(codes.includes(error.code), `${name} expected ${codes.join('/')}, got ${error.code}: ${error.message}`);
  checks.push({name, passed: true, artifact, rejection: {code: error.code, path: error.path, message: error.message, details: error.details}});
}
async function load(design, modelOverride, resourceOverride) {
  const directory = process.argv[2] || 'prototype/public/company-assets/side-table-life-items-v1';
  const publicPath = directory.startsWith('prototype/public');
  const modelPath = modelOverride || `${directory}/${design}${publicPath ? '/v1/model' : ''}.glb`;
  const resourcePath = resourceOverride || (publicPath ? `${directory}/${design}/v1/resource.json` : `${directory}/${design}-resource.json`);
  const bytes = await fs.readFile(modelPath), resource = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
  assert.equal(sha(bytes), resource.asset.sha256); assert.equal(bytes.length, resource.asset.bytes);
  const loader = new GLTFLoader();
  loader.register(() => ({name: 'INDEPENDENT_CPU_GEOMETRY_TEXTURE_PLACEHOLDER', loadTexture() {
    const texture = new THREE.Texture({width: 512, height: 512, geometryOnlyPlaceholder: true}); texture.flipY = false; return Promise.resolve(texture);
  }}));
  const {scene} = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return {scene, resource, bytes, modelPath};
}
const glbJson = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
async function sourceImageAndUV(fixture, sourceName, nodeName) {
  const json = glbJson(fixture.bytes), binaryOffset = 28 + fixture.bytes.readUInt32LE(12);
  assert.equal(json.images.length, 1);
  const image = json.images[0], view = json.bufferViews[image.bufferView];
  assert.equal(image.uri, undefined); assert.equal(image.mimeType, 'image/png');
  const png = fixture.bytes.subarray(binaryOffset + (view.byteOffset || 0), binaryOffset + (view.byteOffset || 0) + view.byteLength);
  assert.equal(sha(png), '75baf74d9483a0fc56ac21ceba346fbe16fc24a2a1bf0524c53e6bbe802e1153');
  assert.equal(png.readUInt32BE(16), 512); assert.equal(png.readUInt32BE(20), 512);
  assert.deepEqual(json.samplers[0], {magFilter: 9728, minFilter: 9984});
  const original = await fs.readFile(`assets-source/company-side-table-life-items-v1/original/${sourceName}.glb`), originalJson = glbJson(original);
  const accessor = originalJson.accessors[originalJson.meshes[0].primitives[0].attributes.TEXCOORD_0], uvView = originalJson.bufferViews[accessor.bufferView];
  assert.equal(accessor.type, 'VEC2'); assert.equal(accessor.componentType, 5126);
  const start = 28 + original.readUInt32LE(12) + (uvView.byteOffset || 0) + (accessor.byteOffset || 0), expected = [];
  for (let i = 0; i < accessor.count; i++) for (let j = 0; j < 2; j++) expected.push(original.readFloatLE(start + i * (uvView.byteStride || 8) + j * 4));
  assert.deepEqual(Array.from(fixture.scene.getObjectByName(nodeName).geometry.attributes.uv.array), expected);
  checks.push({name: `${fixture.resource.provenance.sourceDesign} exact source PNG, sampler and original UV retained`, passed: true, originalSourceSha256: sha(original), pngSha256: sha(png), nativeDecodeChecked: false});
}
let failure;
try {
  const designs = process.argv[3]?.split(',') || ['cup', 'bottle', 'tissue', 'pen-notebook'];
  const fixtures = new Map();
  for (const design of designs) {
    const fixture = await load(design), actual = invoke(fixture.scene, fixture.resource);
    validateSupportGeometry(fixture.scene, fixture.resource, fail);
    realAssets.push({design, modelPath: fixture.modelPath, sha256: sha(fixture.bytes), actual});
    fixtures.set(design, fixture);
    checks.push({name: `${design} actual GLB finite geometry and generic support`, passed: true});
    if (design === 'cup') await sourceImageAndUV(fixture, 'cup', 'life-cup-source');
    if (design === 'bottle') await sourceImageAndUV(fixture, 'soda-bottle', 'life-bottle-source');
    if (design === 'pen-notebook') await sourceImageAndUV(fixture, 'cup', 'life-pen-holder');
  }
  assert.deepEqual(invoke(null, {mountRole: 'side-table'}), {checked: false});
  checks.push({name: 'Pinned side-table geometry keeps its original path', passed: true});
  const first = fixtures.values().next().value, alternate = structuredClone(first.resource);
  alternate.id = 'independent-life-item'; alternate.version = 2; assert(invoke(first.scene, alternate).checked);
  checks.push({name: 'Same function accepts a new stable ID and version 2', passed: true});
  const cup = fixtures.get('cup'), tissue = fixtures.get('tissue'), bottle = fixtures.get('bottle'), combination = fixtures.get('pen-notebook');
  if (cup) {
    await mutate('Cup inner floor lifted to block the real cavity', cup, root => {
      const p = independent(root, 'life-cup-source').geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - .0165) < 1e-6) p.setY(i, .10);
    }, ['life-items-cup-floor']);
    await mutate('Deleted actual outer bottom leaves a visible leak', cup, root => removeFaces(independent(root, 'life-cup-source'), points => points.every(point => Math.abs(point.y) < 1e-6)), ['life-items-cup-shell']);
    await mutate('Actual source handle loses buried end contact', cup, root => {
      const mesh = independent(root, 'life-cup-source'), p = mesh.geometry.attributes.position;
      const handle = components(mesh).sort((a, b) => a.length - b.length)[0];
      for (const index of handle) if (p.getZ(index) > -.04) p.setZ(index, p.getZ(index) - .012);
    }, ['life-items-handle-contact', 'life-items-cup-shell']);
    await mutate('A closed added plug cannot fill the mouth', cup, root => root.add(solid('mouth-plug', [-.025, .09, -.012], [.025, .10, .038], root.getObjectByName('life-cup-source').material)), ['life-items-extra-node']);
    await mutate('Food source cannot drop its actual UV mapping', cup, root => independent(root, 'life-cup-source').geometry.deleteAttribute('uv'), ['life-items-source-texture']);
    await mutate('Food gradient cannot collapse to one UV swatch', cup, root => independent(root, 'life-cup-source').geometry.attributes.uv.array.fill(.5), ['life-items-source-uv']);
    await mutate('Food source requires its textured material', cup, root => {const mesh = independent(root, 'life-cup-source'); mesh.material = mesh.material.clone(); mesh.material.map = null;}, ['life-items-source-texture']);
    await mutate('Transparent cup cannot substitute for opaque Food source', cup, root => {const mesh = independent(root, 'life-cup-source'); mesh.material = mesh.material.clone(); mesh.material.transparent = true;}, ['life-items-material']);
  }
  if (bottle) {
    await mutate('Bottle cover lower rim lifted off the actual collar', bottle, root => {
      const mesh = independent(root, 'life-bottle-source'), p = mesh.geometry.attributes.position;
      const cover = components(mesh).sort((a, b) => Math.max(...b.map(i => p.getY(i))) - Math.max(...a.map(i => p.getY(i))))[0];
      const min = Math.min(...cover.map(i => p.getY(i)));
      for (const index of cover) if (Math.abs(p.getY(index) - min) < 1e-6) p.setY(index, min + .003);
    }, ['life-items-bottle-cover']);
    await mutate('Actual bottle bottom cannot be removed', bottle, root => removeFaces(independent(root, 'life-bottle-source'), points => points.every(point => Math.abs(point.y) < 1e-6)), ['life-items-bottle-neck']);
  }
  if (tissue) {
    await mutate('Painted solid lid cannot substitute for a real tissue slot', tissue, root => {
      const mesh = independent(root, 'life-tissue-lid'); mesh.geometry = solid('replacement', [-.08, .072, -.05], [.08, .075, .05], mesh.material).geometry;
    }, ['life-items-recipe-coverage']);
    await mutate('Static thin paper cannot float above the inner floor', tissue, root => independent(root, 'life-tissue-paper').geometry.translate(0, .002, 0), ['life-items-paper-height', 'life-items-recipe-surface']);
    await mutate('A thick slab cannot substitute for folded thin paper', tissue, root => independent(root, 'life-tissue-paper').geometry.scale(1, 1, 2), ['life-items-recipe-surface', 'life-items-recipe-coverage']);
    await mutate('Actual tissue wall cannot disappear', tissue, root => root.getObjectByName('life-tissue-side-left').removeFromParent(), ['life-items-node']);
    await mutate('Actual tissue base cannot be a suspended foil', tissue, root => independent(root, 'life-tissue-base').geometry.translate(0, .001, 0), ['life-items-part-bounds']);
    await mutate('Repeated visible tissue lid triangles are rejected', tissue, root => {
      const mesh = independent(root, 'life-tissue-lid'), geometry = mesh.geometry;
      const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({length: geometry.attributes.position.count}, (_, i) => i);
      geometry.setIndex([...indices, ...indices.slice(0, 3)]);
    }, ['life-items-winding']);
    const before = tissue.scene.clone(true), mesh = independent(before, 'life-tissue-paper'), p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - .135) < 1e-6) p.setY(i, .125);
    assert(invoke(before, tissue.resource).checked); checks.push({name: 'Real finite paper recipe accepts the .125 second-input endpoint', passed: true});
  }
  if (combination) {
    await mutate('The combination must include its real notebook', combination, root => root.getObjectByName('life-notebook-pages').removeFromParent(), ['life-items-node']);
    await mutate('Pen cannot float above the real cup floor', combination, root => independent(root, 'life-pen-1').geometry.translate(0, .002, 0), ['life-items-recipe-surface', 'life-items-recipe-coverage']);
    await mutate('Pen cannot be translated through the actual holder wall', combination, root => independent(root, 'life-pen-1').geometry.translate(.03, 0, 0), ['life-items-recipe-surface', 'life-items-recipe-coverage']);
    await mutate('Holder cannot lose its actual inner wall', combination, root => removeFaces(independent(root, 'life-pen-holder'), points => {
      const normal = new THREE.Triangle(...points).getNormal(new THREE.Vector3()), center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 3);
      return Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) > .02 && normal.dot(new THREE.Vector3(center.x - .055, 0, center.z)) < -.005;
    }), ['life-items-cup-shell', 'life-items-handle-contact']);
  }
  if (!process.argv[2]) {
    const before = await load('tissue', 'evidence/company-side-table-life-items-production-v1/before-tissue.glb', 'evidence/company-side-table-life-items-production-v1/before-tissue-resource.json');
    const actual = invoke(before.scene, before.resource);
    assert(Math.abs(actual.paperTopY - .125) < 1e-6); assert.notEqual(sha(before.bytes), sha(tissue.bytes));
    checks.push({name: 'Actual prior .125 paper GLB passes the same finite geometry gate', passed: true, sha256: sha(before.bytes), actual});
  }
} catch (error) {failure = {message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack};}
const sourceHashes = {};
for (const file of ['prototype/src/company/side-table-life-items-geometry.js', 'prototype/src/company/asset-library.js', 'scripts/company-platform/test-side-table-life-items-geometry.mjs']) sourceHashes[file] = sha(await fs.readFile(file));
const report = {status: failure ? 'failed' : 'passed', checks, realAssets, failure, sourceHashes, limits: ['CPU GLTFLoader uses texture placeholders only. Native PNG decoding, browser transaction/lifecycle and GPU appearance are separate checks.', 'Finite recipe geometry only, no general rigid-body or strength analysis. Source attributes/PNG byte identity is verified independently by the producer.']};
await fs.writeFile(path.join(runDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(output, 'latest.json'), JSON.stringify({status: report.status, report: path.relative(process.cwd(), path.join(runDirectory, 'report.json')).replaceAll('\\', '/')}, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, checks: checks.length, assets: realAssets.length, failure, report: path.join(runDirectory, 'report.json')}, null, 2));
if (failure) process.exitCode = 1;
