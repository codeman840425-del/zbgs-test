// CPU-only native VRM1 readback of the fitted normalized finger rotations.
// No renderer, browser, source mutation, controller, or public registration.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';

const root = new URL('../../', import.meta.url);
const abs = p => fileURLToPath(new URL(p, root));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const bodies = {
  female: 'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm',
  male: 'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'
};
const variants = {
  male: { source: bodies.male, grip: 'male', reference: 'male' }
};

function strippedGlb(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) delete primitive.material;
  delete json.materials;
  delete json.images;
  delete json.textures;
  for (const ext of ['VRMC_materials_mtoon', 'VRMC_materials_hdr_emissiveMultiplier']) {
    if (json.extensions) delete json.extensions[ext];
  }
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const bin = bytes.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + bin.length, 8);
  header.writeUInt32LE(padded.length, 12); header.write('JSON', 16);
  return Buffer.concat([header, padded, bin]);
}

async function loadBody(sourcePath) {
  const source = await fs.readFile(abs(sourcePath));
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const cooked = strippedGlb(source);
  const parsed = await loader.parseAsync(cooked.buffer.slice(cooked.byteOffset, cooked.byteOffset + cooked.length), '');
  const vrm = parsed.userData.vrm;
  vrm.scene.updateMatrixWorld(true);
  const bodyMesh = vrm.scene.getObjectsByProperty('isSkinnedMesh', true)
    .find(mesh => mesh.name.startsWith('Body_'));
  if (!bodyMesh) throw new Error(`${body}: Body_SKIN SkinnedMesh not found after loader parse`);
  return { source, vrm, bodyMesh };
}

function worldPoint(mesh, index) {
  const local = new T.Vector3();
  mesh.getVertexPosition(index, local);
  return local.applyMatrix4(mesh.matrixWorld);
}

async function one(body, variant) {
  const { source, vrm, bodyMesh } = await loadBody(variant.source);
  const grip = JSON.parse(await fs.readFile(abs(`assets-source/native-live-accessory-fit-v2/${variant.grip}-grip.json`), 'utf8'));
  const reference = JSON.parse(await fs.readFile(abs(`assets-source/native-live-accessory-fit-v2/${variant.reference}-skin-reference.json`), 'utf8'));
  const rawHand = vrm.humanoid.getRawBoneNode('rightHand');
  const rawRestInverse = rawHand.matrixWorld.clone().invert();
  const before = reference.vertexIds.map(index => worldPoint(bodyMesh, index).applyMatrix4(rawRestInverse));
  const expected = reference.rawHandLocalPoints.map(p => new T.Vector3().fromArray(p));
  const restErrors = before.map((p, i) => p.distanceTo(expected[i]));
  const normalized = [];
  for (const [name, q] of Object.entries(grip.normalizedFingerRotations)) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    if (!node) throw new Error(`${body}: normalized bone missing ${name}`);
    node.quaternion.fromArray(q);
    normalized.push(name);
  }
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  const points = reference.vertexIds.map(index => worldPoint(bodyMesh, index).applyMatrix4(rawRestInverse));
  const errors = points.map((p, i) => p.distanceTo(expected[i]));
  const maxErrorIndex = errors.reduce((best, value, index) => value > errors[best] ? index : best, 0);
  const result = {
    body, sourcePath: variant.source, gripSourceBody: variant.grip, sourceSha256: hash(source), loaderBodyMaterial: bodyMesh.material?.name,
    vertexCount: reference.vertexIds.length, normalizedBonesApplied: normalized,
    prePoseReferenceDifferenceMetres: Math.max(...restErrors),
    maxErrorVertexId: reference.vertexIds[maxErrorIndex],
    maxRawHandLocalErrorMetres: Math.max(...errors), meanRawHandLocalErrorMetres: errors.reduce((a, b) => a + b, 0) / errors.length,
    tipErrorsMetres: {}, handLocalDistanceToFitCentroidMetres: points.reduce((sum, p, i) => sum + p.distanceTo(expected[i]), 0),
    passed: Math.max(...errors) <= 2e-5,
    limits: ['CPU GLTFLoader/VRMLoaderPlugin readback with materials stripped in memory.', 'No renderer, runtime controller, microphone mesh, or visual grip validation.']
  };
  for (const group of ['Index', 'Middle', 'Ring', 'Little', 'Thumb']) {
    const ids = reference.vertexFamilies.map((name, i) => name === group ? i : -1).filter(i => i >= 0);
    result.tipErrorsMetres[group] = ids.length ? Math.max(...ids.map(i => errors[i])) : null;
  }
  return result;
}

const result = { schema: 'native-live-accessory-vrm-readback-v2', cases: [] };
for (const [body, variant] of Object.entries(variants)) result.cases.push(await one(body, variant));
result.passed = result.cases.every(row => row.passed);
result.sourcePins = {
  script: hash(await fs.readFile(fileURLToPath(import.meta.url))),
  threeRevision: T.REVISION,
  bodySources: Object.fromEntries(result.cases.map(row => [row.body, row.sourceSha256]))
};
await fs.writeFile(abs('assets-source/native-live-accessory-fit-v2/vrm-readback.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
