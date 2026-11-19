import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {glb, fixture, sha} from '../../../scripts/face-visible-fixture.mjs';
import {createFacialGeometry} from '../../../prototype/src/facial-geometry.js';
import {queryFacialGeometry, resolveFacialGeometrySelection} from '../../../prototype/src/facial-geometry-selection.js';
import {foundationProfile} from '../../../prototype/src/foundation-profiles.js';
import projectPaths from '../../../scripts/project-output.cjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const source = 'prototype/public';
const prior = 'evidence/m2-character-presets-a-v1/room-36';
const baseSha256 = '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
const inputPins = {};
const mode = process.argv[2];
assert.ok(process.argv.length <= 3 && [undefined, '--write', '--verify'].includes(mode), 'Use --write or --verify');

async function read(relative) {
  const bytes = await fs.readFile(path.join(root, relative));
  inputPins[relative] = {sha256: sha(bytes), bytes: bytes.length};
  return bytes;
}

async function json(relative) {
  return JSON.parse((await read(relative)).toString('utf8').replace(/^\uFEFF/, ''));
}

async function pinnedModel(relative, expected) {
  const model = glb(path.join(root, relative));
  assert.equal(model.sha, expected, relative);
  assert.equal(sha(await read(relative)), expected, relative);
  return model;
}

function rawBinds(model) {
  const result = new Map();
  for (const skin of model.doc.skins) {
    const {array, size} = model.acc(skin.inverseBindMatrices);
    assert.equal(size, 16);
    assert.equal(array.length, skin.joints.length * size);
    for (const [i, node] of skin.joints.entries()) {
      const name = model.doc.nodes[node].name;
      const matrix = Array.from(array.subarray(i * size, (i + 1) * size));
      if (result.has(name)) assert.deepEqual(result.get(name), matrix);
      result.set(name, matrix);
    }
  }
  return result;
}

function geometryFromPrimitive(model, primitive) {
  const g = new THREE.BufferGeometry();
  for (const [name, accessor] of Object.entries(primitive.attributes)) {
    const {array, size} = model.acc(accessor);
    g.setAttribute(name.toLowerCase(), new THREE.BufferAttribute(array, size));
  }
  g.setIndex(new THREE.BufferAttribute(model.acc(primitive.indices).array, 1));
  return g;
}

function geometryHashes(geometry) {
  return {
    index: sha(geometry.index.array),
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => [name, sha(value.array)])),
  };
}

function addBodyMeshes(target, model) {
  const body = model.doc.meshes.find(mesh => mesh.name === 'Body.baked');
  assert.ok(body);
  return body.primitives.map(primitive => {
    const material = new THREE.MeshBasicMaterial();
    material.name = model.doc.materials[primitive.material].name;
    const mesh = new THREE.SkinnedMesh(geometryFromPrimitive(model, primitive), material);
    target.vrm.scene.add(mesh);
    return mesh;
  });
}

function compareIndexedPositions(a, b) {
  assert.deepEqual(a.index.array, b.index.array);
  const x = a.attributes.position.array;
  const y = b.attributes.position.array;
  const moved = new Set();
  let max = 0;
  for (const row of new Set(a.index.array)) {
    const i = row * 3;
    const delta = Math.hypot(x[i] - y[i], x[i + 1] - y[i + 1], x[i + 2] - y[i + 2]);
    if (delta > 0) moved.add(row);
    max = Math.max(max, delta);
  }
  return {changedIndexedPositionRows: moved.size, maxPositionDeltaM: max};
}

const profile = foundationProfile('male');
assert.equal(profile.sha256, baseSha256);
const model = await pinnedModel(source + profile.url, baseSha256);
const skeleton = rawBinds(model);
const geometryOptions = queryFacialGeometry(baseSha256);
const historical = await json(`${prior}/report.json`);
const inputs = [];
for (const id of ['male-a', 'male-b']) {
  const recipePath = `${prior}/recipes/${id}.v5.json`;
  const recipe = await json(recipePath);
  assert.equal(recipe.schema, 'workbench-appearance-recipe-v5');
  assert.deepEqual(recipe.base, {bodyType: 'male', sha256: baseSha256});
  const recorded = historical.cases.find(row => row.id === id);
  assert.equal(inputPins[recipePath].sha256, recorded.recipeSha256);
  assert.deepEqual(recipe, recorded.record);
  assert.equal(recorded.cleanContextRoundtrip, true);
  const snapshot = await json(`${prior}/${id}-original-room.json`);
  const {baseAvatarSha256, ...settledGeometry} = snapshot.geometry.geometryIdentity;
  assert.equal(baseAvatarSha256, baseSha256);
  assert.deepEqual(settledGeometry, recipe.geometry);
  resolveFacialGeometrySelection(baseSha256, recipe.geometry, {requireIdentities: true});
  inputs.push({id, recipePath, recipe, snapshot});
}
const [{recipe: recipeA, snapshot: roomA}, {recipe: recipeB, snapshot: roomB}] = inputs;
const withoutGeometry = ({geometry, ...shared}) => shared;
assert.deepEqual(withoutGeometry(recipeA), withoutGeometry(recipeB));
assert.notDeepEqual(recipeA.geometry, recipeB.geometry);
for (const key of ['sim', 'bones', 'lights', 'camera', 'appearance', 'weights']) {
  assert.deepEqual(roomA[key], roomB[key], `Historical room control differs: ${key}`);
}
assert.equal(roomA.bones.length, skeleton.size);

const {index, role, manifestUrl, resources} = recipeA.equipment;
assert.ok(profile.outfits.some(outfit => outfit.index === index && outfit.role === role));
assert.equal(profile.manifestUrl, manifestUrl);
const outfitManifest = await json(source + manifestUrl);
const outfit = {};
for (const [slot, item] of Object.entries(resources)) {
  assert.equal(item.compatibleAvatarSha256, baseSha256);
  assert.equal(profile.ids[slot], item.id);
  assert.deepEqual(item, outfitManifest.items.find(row => row.id === item.id));
  const asset = path.posix.join(path.posix.dirname(source + manifestUrl), item.url);
  const garment = await pinnedModel(asset, item.sha256);
  assert.equal(inputPins[asset].bytes, item.bytes);
  const garmentBinds = rawBinds(garment);
  assert.equal(garmentBinds.size, item.bindings.length);
  let maxInverseBindDelta = 0;
  for (const {sourceBone, targetRawBone, inverseBindMatrix} of item.bindings) {
    assert.ok(garmentBinds.has(sourceBone) && skeleton.has(targetRawBone));
    assert.deepEqual(garmentBinds.get(sourceBone), inverseBindMatrix);
    const target = skeleton.get(targetRawBone);
    const max = Math.max(...target.map((v, i) => Math.abs(v - inverseBindMatrix[i])));
    maxInverseBindDelta = Math.max(maxInverseBindDelta, max);
  }
  assert.ok(maxInverseBindDelta < 2e-6);
  outfit[slot] = {id: item.id, path: asset, sha256: item.sha256, rawBindings: garmentBinds.size, maxInverseBindDelta};
}

// Both detached fixtures decode the actual pinned VRM. Only file I/O is replaced.
globalThis.fetch = async (url) => {
  assert.match(String(url), /^\/assets\/(?:[\w-]+\/)+[\w-]+(?:\.[\w-]+)*\.json$/);
  return new Response(await read(source + url));
};
const [a, b] = await Promise.all(inputs.map(async (entry) => {
  const target = fixture(model);
  const body = addBodyMeshes(target, model);
  const before = body.map(mesh => ({geometry: mesh.geometry, hashes: geometryHashes(mesh.geometry)}));
  const geometry = createFacialGeometry({vrm: target.vrm, avatarSha256: model.sha});
  const {mouthWidth, browSample, noseSample, eyeSample} = entry.recipe.geometry;
  const values = {mouthWidth, browSample, noseSample, eyeSample};
  const applied = await geometry.set(values);
  assert.equal(applied.applied, true, applied.reason);
  const after = geometry.getState();
  for (const [key, value] of Object.entries(entry.recipe.geometry)) assert.equal(after[key], value, key);
  for (const [i, mesh] of body.entries()) {
    assert.equal(mesh.geometry, before[i].geometry);
    assert.deepEqual(geometryHashes(mesh.geometry), before[i].hashes);
  }
  return {target, body, geometry, entry, values};
}));

const facePrimitives = a.target.meshes.filter((_, i) => i % 2 === 0).map((mesh, i) => {
  const other = b.target.meshes[i * 2];
  for (const name of ['skinIndex', 'skinWeight', 'uv']) {
    assert.equal(sha(mesh.geometry.attributes[name].array), sha(other.geometry.attributes[name].array));
  }
  return {material: mesh.material.name, ...compareIndexedPositions(mesh.geometry, other.geometry)};
});
assert.ok(facePrimitives.some(row => row.changedIndexedPositionRows > 0));
const bodyPrimitives = a.body.map((mesh, i) => {
  const other = b.body[i];
  const hashes = geometryHashes(mesh.geometry);
  assert.deepEqual(hashes, geometryHashes(other.geometry));
  return {material: mesh.material.name, positionRows: mesh.geometry.attributes.position.count, ...hashes};
});
a.geometry.dispose();
b.geometry.dispose();

const result = {
  schema: 'same-male-body-face-preset-proof-v1',
  base: {bodyType: 'male', sha256: baseSha256, path: source + profile.url, rawJoints: skeleton.size},
  historicalRoom: {
    source: historical.spec.source, build: historical.spec.build, exactMatchingBoneMatrices: roomA.bones.length,
    exactMatchingControls: ['simulation tick', 'camera', 'lights', 'appearance', 'expression weights'],
    bothRecipesRestoredInCleanBrowserContext: true,
  },
  production: {
    geometryOptions,
    outfit: {index, role, manifestUrl, resources: outfit},
    presets: [a, b].map(({entry, values}) => ({
      id: entry.id, originalRecipe: entry.recipePath, recordedGeometry: entry.recipe.geometry,
      d02Edits: [{domain: 'appearance', values: entry.recipe.appearance}, {domain: 'geometry', values}],
    })),
  },
  cpuFixture: {bodyPrimitives, facePrimitives, maxFacePositionDeltaM: Math.max(...facePrimitives.map(row => row.maxPositionDeltaM))},
  scope: 'Exact pinned source, detached CPU facial geometry and historical same-pose room evidence. New garment fit, new D02 signing, and new ordinary game motion are separate verification.',
  inputPins: Object.fromEntries(Object.entries(inputPins).sort(([left], [right]) => left.localeCompare(right))),
};
const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
if (mode === undefined) {
  process.stdout.write(bytes);
} else {
  const expected = path.join(here, 'body-proof.json');
  const output = await projectPaths.projectOutput(expected, await projectPaths.productionRoot());
  assert.equal(output, expected, 'Evidence path was redirected');
  if (mode === '--write') {
    try {
      await fs.writeFile(output, bytes, {flag: 'wx'});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  assert.deepEqual(await fs.readFile(output), bytes);
  console.log(`Verified ${output}`);
}
