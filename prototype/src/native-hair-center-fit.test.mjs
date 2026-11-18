import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DataTexture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { canonicalJson } from './character-record.js';
import { createNativeHairCenterFitPlugin, supportsNativeHairCenterFit } from './native-hair-center-fit.js';
import fit from './native-hair-center-fit.json' with { type: 'json' };
import catalog from './native-production-catalog.json' with { type: 'json' };

const extensionName = 'VRMC_springBone';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const readRuntimeBody = body => readFile(new URL(`../public/assets/${body.bodyType}/body.vrm`, import.meta.url));
const testedBones = fit.springPrefixes.flatMap(([, nodes]) => nodes).sort((a, b) => a - b);

async function loadBody(bytes, body = undefined) {
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: 'CPUTextureFixture',
    loadTexture: async () => new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  }));
  loader.register(parser => new VRMLoaderPlugin(parser));
  if (body) loader.register(parser => createNativeHairCenterFitPlugin(parser, body));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

function renderedHairInfluences(vrm) {
  const springBones = new Set(Array.from(vrm.springBoneManager.joints, joint => joint.bone));
  const influences = new Set();
  const head = vrm.humanoid.getRawBoneNode('head');
  vrm.scene.traverseVisible(mesh => {
    if (!mesh.isSkinnedMesh || !/HAIR/i.test(mesh.material.name)) return;
    const { index, attributes, drawRange } = mesh.geometry;
    const count = index ? index.count : attributes.position.count;
    const end = Math.min(count, drawRange.start + drawRange.count);
    const vertices = new Set();
    for (let i = drawRange.start; i < end; i++) vertices.add(index ? index.getX(i) : i);
    for (const vertex of vertices) {
      for (let influence = 0; influence < 4; influence++) {
        if (attributes.skinWeight.getComponent(vertex, influence) <= 0) continue;
        const boneIndex = attributes.skinIndex.getComponent(vertex, influence);
        for (let node = mesh.skeleton.bones[boneIndex]; node && node !== head; node = node.parent) {
          if (springBones.has(node)) influences.add(node);
        }
      }
    }
  });
  return influences;
}

function jointsContract(manager, nodes) {
  return Array.from(manager.joints, joint => ({
    bone: nodes.indexOf(joint.bone),
    child: nodes.indexOf(joint.child),
    center: nodes.indexOf(joint.center),
    settings: joint.settings,
    colliderGroups: joint.colliderGroups.map(group => ({
      name: group.name,
      colliders: group.colliders.map(collider => ({
        node: nodes.indexOf(collider.parent),
        shape: collider.shape,
      })),
    })),
  }));
}

for (const body of fit.bodies) {
  test(`${body.bodyType} changes only the 36 rendered-hair joint centers before import`, async () => {
    const sourcePath = body.bodyType.replace(/^native-/, '').replace(/-v1$/, '');
    const source = await readFile(new URL(
      `../../assets-source/native-parameter-batch-v2/${sourcePath}/candidate.vrm`, import.meta.url,
    ));
    const entry = catalog.entries.find(candidate => candidate.bodyType === body.bodyType);
    assert.equal(hash(source), entry.sourceExportSha256);
    const sourceSpringBone = readJson(source).extensions[extensionName];
    assert.equal(hash(canonicalJson(sourceSpringBone)), fit.sourceSpringBoneSha256);

    const bytes = await readRuntimeBody(body);
    assert.equal(hash(bytes), body.bodySha256);
    assert.equal(body.bodySha256, entry.profile.sha256);
    assert.deepEqual(readJson(bytes).extensions[extensionName], sourceSpringBone);
    const [original, candidate] = await Promise.all([loadBody(bytes), loadBody(bytes, body)]);
    const originalVrm = original.userData.vrm;
    const candidateVrm = candidate.userData.vrm;
    const originalNodes = await original.parser.getDependencies('node');
    const candidateNodes = await candidate.parser.getDependencies('node');
    const originalJoints = jointsContract(originalVrm.springBoneManager, originalNodes);
    const candidateJoints = jointsContract(candidateVrm.springBoneManager, candidateNodes);
    const influences = [...renderedHairInfluences(originalVrm)]
      .map(node => originalNodes.indexOf(node)).sort((a, b) => a - b);
    assert.equal(influences.length, 36);
    assert.deepEqual(influences, testedBones);
    const originalHairJoints = sourceSpringBone.springs.filter(spring => spring.name === 'Hair')
      .flatMap(spring => spring.joints.slice(0, -1).map(joint => joint.node));
    assert.equal(originalHairJoints.length, 51);
    assert.equal(originalHairJoints.filter(node => !influences.includes(node)).length, 15);
    assert.equal(originalJoints.length, 75);
    assert.equal(new Set(originalJoints.map(joint => joint.bone)).size, 75);
    assert.deepEqual(candidateJoints, originalJoints.map(joint => (
      influences.includes(joint.bone) ? { ...joint, center: fit.centerNode } : joint
    )));
    assert.equal(candidateNodes[fit.centerNode], candidateVrm.humanoid.getRawBoneNode('upperChest'));
    assert.deepEqual(candidate.parser.json.extensions[extensionName].colliders, sourceSpringBone.colliders);
    assert.deepEqual(candidate.parser.json.extensions[extensionName].colliderGroups, sourceSpringBone.colliderGroups);
    assert.deepEqual(original.parser.json.extensions[extensionName], sourceSpringBone);

    // Compare initialized motion with the earlier per-joint diagnostic.
    const originalManager = originalVrm.springBoneManager;
    const candidateManager = candidateVrm.springBoneManager;
    const centers = Array.from(originalManager.joints, joint => [
      joint, influences.includes(originalNodes.indexOf(joint.bone)) ? originalNodes[fit.centerNode] : joint.center,
    ]);
    for (const [joint] of centers) joint.center = null;
    for (const [joint, center] of centers) joint.center = center;
    originalManager.reset();
    candidateManager.reset();
    const fittedJoints = [...candidateManager.joints];
    const pairs = Array.from(originalManager.joints, (joint, index) => [joint, fittedJoints[index]]);
    for (let step = 1; step <= 24; step++) {
      for (const vrm of [originalVrm, candidateVrm]) {
        vrm.scene.position.x = Math.sin(step / 10) * 0.25;
        vrm.humanoid.getRawBoneNode('upperChest').rotation.y = Math.sin(step / 8) * 0.28;
        vrm.humanoid.getRawBoneNode('head').rotation.x = Math.sin(step / 5) * 0.22;
        vrm.scene.updateMatrixWorld(true);
        vrm.springBoneManager.update(1 / 30);
      }
      for (const [originalJoint, candidateJoint] of pairs) {
        const expected = originalJoint.bone.quaternion.toArray();
        const actual = candidateJoint.bone.quaternion.toArray();
        assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-10));
      }
    }
  });
}

test('body identity requires an exact registered pair', async () => {
  const [first, second] = fit.bodies;
  assert.ok(supportsNativeHairCenterFit(first.bodyType, first.bodySha256));
  assert.ok(supportsNativeHairCenterFit(second.bodyType, second.bodySha256));
  assert.equal(supportsNativeHairCenterFit(first.bodyType, second.bodySha256), false);
  const bytes = await readRuntimeBody(first);
  await assert.rejects(loadBody(bytes, { ...first, bodySha256: second.bodySha256 }), /body identity mismatch/);
});

test('canonical source identity accepts field order and keeps input resources intact', async () => {
  const [body] = fit.bodies;
  const json = readJson(await readRuntimeBody(body));
  const originalExtensions = json.extensions;
  const original = originalExtensions[extensionName];
  originalExtensions[extensionName] = Object.fromEntries(Object.entries(original).reverse());
  const source = originalExtensions[extensionName];
  const snapshot = structuredClone(source);
  await createNativeHairCenterFitPlugin({ json }, body).beforeRoot();
  assert.notEqual(json.extensions, originalExtensions);
  assert.equal(originalExtensions[extensionName], source);
  assert.deepEqual(source, snapshot);
  assert.equal(json.extensions[extensionName].springs[0], source.springs[0]);
  assert.equal(json.extensions[extensionName].colliders, source.colliders);
  assert.equal(json.extensions.VRMC_vrm, originalExtensions.VRMC_vrm);
});

test('invalid or already fitted source configuration fails without partial changes', async () => {
  const [body] = fit.bodies;
  const bytes = await readRuntimeBody(body);
  for (const [change, pattern] of [
    [json => { json.extensions[extensionName].springs[12].joints.reverse(); }, /source spring configuration mismatch/],
    [json => { json.extensions[extensionName].colliders.pop(); }, /source spring configuration mismatch/],
    [json => { json.extensions.VRMC_vrm.humanoid.humanBones.upperChest.node = 3; }, /humanoid center mismatch/],
    [json => { json.extensionsUsed = []; }, /requires VRMC_springBone/],
  ]) {
    const json = readJson(bytes);
    change(json);
    const snapshot = structuredClone(json);
    await assert.rejects(createNativeHairCenterFitPlugin({ json }, body).beforeRoot(), pattern);
    assert.deepEqual(json, snapshot);
  }
  const json = readJson(bytes);
  const plugin = createNativeHairCenterFitPlugin({ json }, body);
  await plugin.beforeRoot();
  const fitted = json.extensions;
  await assert.rejects(plugin.beforeRoot(), /source spring configuration mismatch/);
  assert.equal(json.extensions, fitted);
});
