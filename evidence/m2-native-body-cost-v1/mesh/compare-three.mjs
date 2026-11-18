// Offline geometry test. Let GLTFLoader create the real meshes and skins, omitting image loading.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from '../../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMUtils } from '../../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';

const evidence = new URL('./', import.meta.url);
const root = new URL('../../../', evidence);
const mode = process.argv[2];
assert.ok(['partition', 'prefix'].includes(mode), 'specify partition or prefix');
const prefix = mode === 'prefix' ? 'prefix-' : '';
const analysis = JSON.parse(await readFile(new URL(prefix + 'analysis.json', evidence)));
const pkg = async (name) => JSON.parse(await readFile(new URL('prototype/node_modules/' + name + '/package.json', root)));

async function load(url, sha256) {
  const file = await readFile(url);
  assert.equal(createHash('sha256').update(file).digest('hex'), sha256);
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'GeometryOnly', loadTexture: () => Promise.resolve(null) }));
  return loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
}

function equalAttribute(a, b, label) {
  assert.equal(a.normalized, b.normalized);
  assert.equal(a.itemSize, b.itemSize);
  assert.equal(a.array.constructor, b.array.constructor);
  assert.equal(a.count, b.count);
  const bytes = (attr) => Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength);
  assert.ok(bytes(a).equals(bytes(b)), label);
}

const canonical = await load(new URL(analysis.sourcePath, root), analysis.assetBudgetChecks.source.sha256);
const derived = await load(new URL(analysis.derivedFile, evidence), analysis.assetBudgetChecks.derived.sha256);
const lookup = (asset) => {
  const byPrimitive = new Map();
  asset.scene.traverse(obj => {
    if (!obj.isSkinnedMesh) return;
    const identity = asset.parser.associations.get(obj);
    byPrimitive.set(identity.meshes + '/' + identity.primitives, obj);
  });
  return byPrimitive;
};
const originals = lookup(canonical), outputs = lookup(derived);
assert.equal(originals.size, analysis.primitives.length);
assert.equal(outputs.size, originals.size);
const results = [];
const skinWeightDifferences = [];
const changedRestBounds = [];
function restSphere(object) {
  object.computeBoundingSphere();
  return { center: object.boundingSphere.center.toArray(), radius: object.boundingSphere.radius };
}
for (const row of analysis.primitives) {
  const key = row.mesh + '/' + row.primitive;
  const object = originals.get(key), result = outputs.get(key);
  const passThrough = row.derivedPositionCount === row.sourcePositionCount;
  const before = object.geometry.attributes.position.count;
  if (!passThrough) changedRestBounds.push({ key, source: restSphere(object), derived: restSphere(result) });
  if (!passThrough) VRMUtils.removeUnnecessaryVertices(object);
  const a = object.geometry, b = result.geometry;
  equalAttribute(a.index, b.index, key + '/index');
  assert.deepEqual(Object.keys(a.attributes).sort(), Object.keys(b.attributes).sort());
  for (const name of Object.keys(a.attributes)) {
    if (name === 'skinWeight' && mode === 'partition' && !passThrough) {
      const va = a.attributes[name].array, vb = b.attributes[name].array;
      assert.equal(va.length, vb.length);
      let maxAbsoluteDelta = 0, componentDifferences = 0;
      for (let k = 0; k < va.length; k++) {
        if (va[k] !== vb[k]) {
          componentDifferences++;
          maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(va[k] - vb[k]));
        }
      }
      if (componentDifferences) skinWeightDifferences.push({ key, componentDifferences, maxAbsoluteDelta });
      // Reproduce the four additional normalization passes from the five source meshes.
      for (let k = 1; k < 5; k++) result.normalizeSkinWeights();
    }
    equalAttribute(a.attributes[name], b.attributes[name], key + '/' + name);
  }
  assert.deepEqual(Object.keys(a.morphAttributes).sort(), Object.keys(b.morphAttributes).sort());
  for (const [name, attrs] of Object.entries(a.morphAttributes)) {
    assert.equal(attrs.length, b.morphAttributes[name].length);
    attrs.forEach((attr, i) => equalAttribute(attr, b.morphAttributes[name][i], key + '/' + name + '/' + i));
  }
  assert.deepEqual(object.skeleton.bones.map(bone => bone.name), result.skeleton.bones.map(bone => bone.name));
  assert.deepEqual(object.skeleton.boneInverses.map(m => m.elements), result.skeleton.boneInverses.map(m => m.elements));
  results.push({ mesh: row.mesh, primitive: row.primitive, compared: passThrough ? 'canonical' : 'upstream-compacted',
    sourceCount: before, resultCount: b.attributes.position.count, triangles: b.index.count / 3 });
}
const report = {
  three: (await pkg('three')).version, threeVrm: (await pkg('@pixiv/three-vrm')).version,
  sourceSha256: analysis.assetBudgetChecks.source.sha256, derivedSha256: analysis.assetBudgetChecks.derived.sha256,
  checks: 'Index, vertex and morph array bytes, ordered joint names and inverse binds. Any as-loaded weight exceptions are listed; for the partition diagnosis, four extra normalization passes reproduced the source weights exactly.',
  scope: 'CPU GLTFLoader with image dependencies omitted, compacted source compared using upstream utility on changed primitives.',
  exactAsLoaded: skinWeightDifferences.length === 0, skinWeightDifferences, changedRestBounds, results,
};
await writeFile(new URL(prefix + 'three-comparison.json', evidence), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ primitives: results.length, upstreamComparisons: results.filter(r => r.compared === 'upstream-compacted').length }));
