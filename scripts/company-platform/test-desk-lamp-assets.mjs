import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Box3, MathUtils, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { unzipSync } from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import collection from '../../assets-source/company-desk-lamp-v1/collection.json' with { type: 'json' };
import recipe from '../../assets-source/company-desk-lamp-v1/parameters.json' with { type: 'json' };

const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length || output.startsWith('-')) {
  throw new Error('Usage: node scripts/company-platform/test-desk-lamp-assets.mjs NEW_OUTPUT_DIRECTORY');
}
const outputDirectory = path.resolve(output);
await fs.mkdir(outputDirectory);

const root = new URL('../../', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFile(new URL(name, root));
async function model(bytes) {
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  scene.updateMatrixWorld(true);
  return scene;
}

function meshSize(mesh) {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getSize(new Vector3());
}

const sourceEntries = new Set(recipe.designs.filter(design => design.source).map(design => design.source.entry));
const archive = await read(recipe.archive.path);
assert.equal(sha256(archive), recipe.archive.sha256);
const originalModels = unzipSync(archive, { filter: entry => sourceEntries.has(entry.name) || entry.name === recipe.archive.licenseEntry });
assert.equal(sha256(originalModels[recipe.archive.licenseEntry]), recipe.archive.licenseSha256);

function compareSourcePrimitive(source, produced, plan) {
  const before = source.geometry.getAttribute('position');
  const after = produced.geometry.getAttribute('position');
  const beforeIndex = source.geometry.getIndex();
  const afterIndex = produced.geometry.getIndex();
  const count = beforeIndex?.count ?? before.count;
  assert.equal(count, afterIndex?.count ?? after.count);
  const scale = new Vector3(...plan.scale);
  const origin = new Vector3(...plan.sourceOrigin);
  const original = new Vector3(), actual = new Vector3();
  let largestError = 0;
  for (let i = 0; i < count; i++) {
    original.fromBufferAttribute(before, beforeIndex?.getX(i) ?? i).applyMatrix4(source.matrixWorld).sub(origin).multiply(scale);
    actual.fromBufferAttribute(after, afterIndex?.getX(i) ?? i);
    largestError = Math.max(largestError, original.distanceTo(actual));
  }
  assert(largestError < 1e-7, `Adapted ${plan.name} changed source triangles after undoing the expected coordinate change`);
  assert.equal(source.material.roughness, produced.material.roughness);
  assert.equal(source.material.metalness, produced.material.metalness);
  for (const channel of ['r', 'g', 'b']) assert(Math.abs(source.material.color[channel] - produced.material.color[channel]) < 1e-7);
  const beforeUV = source.geometry.getAttribute('uv'), afterUV = produced.geometry.getAttribute('uv');
  assert.equal(Boolean(beforeUV), Boolean(afterUV));
  if (beforeUV) {
    for (let i = 0; i < count; i++) {
      const a = beforeIndex?.getX(i) ?? i, b = afterIndex?.getX(i) ?? i;
      assert.equal(beforeUV.getX(a), afterUV.getX(b));
      assert.equal(beforeUV.getY(a), afterUV.getY(b));
    }
  }
  return { mesh: plan.name, sourceMaterial: plan.sourceMaterial, triangles: count / 3, largestError, sourcePBR: true, uvPreserved: Boolean(beforeUV) };
}

const samples = [];
const resources = collection.resources.map(record => {
  const resource = catalog.resources.find(candidate => candidate.id === record.id && candidate.version === record.version);
  assert(resource, `Missing catalog registration ${record.id}@${record.version}`);
  return resource;
});
for (const record of collection.resources) {
  const { id, version, modelPath, resourcePath } = record;
  const design = recipe.designs.find(candidate => candidate.id === id && candidate.version === version);
  const resource = resources.find(candidate => candidate.id === id && candidate.version === version);
  assert.deepEqual(JSON.parse(await read(resourcePath)), resource);
  assert(compareFacilityFunction(resources[0], resource).compatible);
  const [width, height, depth] = ['width', 'height', 'depth'].map(axis => resource.mounting[axis]);
  const bytes = await read(modelPath);
  assert.equal(sha256(bytes), resource.asset.sha256);
  const scene = await model(bytes);
  const bounds = new Box3().setFromObject(scene, true);
  assert(bounds.min.x >= -width / 2 && bounds.max.x <= width / 2 &&
    bounds.min.y >= -1e-7 && bounds.max.y <= height &&
    bounds.min.z >= -depth / 2 && bounds.max.z <= depth);
  const diffuser = scene.getObjectByName(resource.light.aim.emitter);
  const shell = scene.getObjectByName('lamp-head-shell');
  const sample = { id, version, sha256: resource.asset.sha256, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    diffuserSize: meshSize(diffuser).toArray(), shellSize: meshSize(shell).toArray() };
  if (design.source) {
    const sourceBytes = originalModels[design.source.entry];
    assert.equal(sha256(sourceBytes), resource.provenance.sourceGlbSha256);
    const sourceScene = await model(sourceBytes);
    sample.source = design.source.entry;
    sample.retainedSourceMeshes = [...design.stand, ...design.head.parts].filter(part => part.shape === 'source').map(part => {
      let primitive;
      sourceScene.traverse(node => { if (node.isMesh && node.material.name === part.sourceMaterial) primitive = node; });
      assert(primitive);
      const made = scene.getObjectByName(part.name);
      assert(made?.isMesh);
      assert(made.position.distanceTo(new Vector3(...(part.at ?? [0, 0, 0]))) < 1e-7);
      const angles = (part.rotateDegrees ?? [0, 0, 0]).map(MathUtils.degToRad);
      assert(angles.every((angle, index) => Math.abs(made.rotation.toArray()[index] - angle) < 1e-7));
      return compareSourcePrimitive(primitive, made, part);
    });
    assert.equal(sample.retainedSourceMeshes.length, 2, 'Expected original base/post and original shade');
  }
  if (id === 'desk-lamp-gooseneck') {
    const neck = scene.getObjectByName('lamp-gooseneck');
    const size = meshSize(neck);
    assert(size.y > .35 && size.z > .14 && size.x < .025, 'Expected a distinct narrow bent tube');
    sample.neckSize = size.toArray();
  }
  samples.push(sample);
}
assert.equal(samples.length, 4);
const [, bar, shade, column] = samples;
assert(bar.diffuserSize[0] / bar.diffuserSize[1] > 7);
assert(shade.shellSize[0] > .12 && shade.shellSize[0] / shade.shellSize[1] > .8);
assert(column.shellSize[1] > .19 && column.shellSize[0] / column.shellSize[1] < .42);
const reportPath = path.join(outputDirectory, 'report.json');
await fs.writeFile(reportPath, JSON.stringify({ status: 'passed', contract: 'desk-lamp', assets: samples }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'passed', resources: samples.length, report: reportPath }));
