import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceImagePath = 'assets-source/company-concept-acoustic-panel-v1/concept-hex-panel.png';
const modelPath = 'prototype/public/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/model.glb';
const resourcePath = 'prototype/public/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/resource.json';
const catalogPath = 'prototype/src/company/library-catalog.json';
const generatorPath = 'scripts/company-platform/build-concept-acoustic-panel.mjs';
const imageHash = value => createHash('sha256').update(value).digest('hex');
const align = value => Buffer.concat([value, Buffer.alloc((4 - value.length % 4) % 4)]);

function makeGlb(png) {
  const positions = new Float32Array([-.44, -.28, 0, .44, -.28, 0, .44, .28, 0, -.44, .28, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const chunks = [], add = value => { const bytes = align(Buffer.from(value.buffer, value.byteOffset, value.byteLength)); const offset = chunks.reduce((sum, part) => sum + part.length, 0); chunks.push(bytes); return [offset, bytes.length]; };
  const positionView = add(positions), normalView = add(normals), uvView = add(uv), indexView = add(indices), imageView = add(png);
  const binary = Buffer.concat(chunks);
  const json = { asset: { version: '2.0', generator: 'company-concept-acoustic-panel-v1' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'concept-acoustic-panel-face', mesh: 0 }], meshes: [{ name: 'concept-acoustic-panel-face', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }], buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteOffset: positionView[0], byteLength: positionView[1] }, { buffer: 0, byteOffset: normalView[0], byteLength: normalView[1] }, { buffer: 0, byteOffset: uvView[0], byteLength: uvView[1] }, { buffer: 0, byteOffset: indexView[0], byteLength: indexView[1], target: 34963 }, { buffer: 0, byteOffset: imageView[0], byteLength: imageView[1] }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-.44, -.28, 0], max: [.44, .28, 0] }, { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' }, { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' }], images: [{ bufferView: 4, mimeType: 'image/png' }], textures: [{ sampler: 0, source: 0 }], samplers: [{ wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729 }], materials: [{ name: 'concept-acoustic-panel-fabric', alphaMode: 'BLEND', doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: .92 } }] };
  const jsonSource = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.concat([jsonSource, Buffer.alloc((4 - jsonSource.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binary.length, 8);
  const chunk = (type, value) => { const h = Buffer.alloc(8); h.writeUInt32LE(value.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, value]); };
  return Buffer.concat([header, chunk(0x4e4f534a, jsonBytes), chunk(0x004e4942, binary)]);
}

function readGlbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

const sourceImage = await fs.readFile(path.join(root, sourceImagePath));
const expectedImageHash = imageHash(sourceImage);
const bytes = makeGlb(sourceImage);
const gltfJson = readGlbJson(bytes);
assert.equal(gltfJson.images[0].mimeType, 'image/png');
assert.equal(gltfJson.materials[0].alphaMode, 'BLEND');
assert.equal(gltfJson.accessors[0].min[0], -.44);
assert.equal(gltfJson.accessors[0].max[0], .44);
const bounds = { min: new THREE.Vector3(-.44, -.28, 0), max: new THREE.Vector3(.44, .28, 0) };
const resource = { id: 'concept-acoustic-panel', displayName: '概念图生成·六边形吸音墙面', version: 1, category: 'decor', mountRole: 'wall-art', productionBranch: 'concept-wall-panel', mount: 'wall', mounting: { origin: 'center', width: .88, height: .56, depth: .001 }, coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Wall contact centre; image plane front +Z', scale: 'Identity only' }, footprint: { center: [0, 0], halfSize: [.44, .28], blocking: false }, usePoints: [], stateDefaults: {}, materialSlots: { finish: ['concept-acoustic-panel-fabric'] }, provenance: { license: 'Project-authored generated image from a user-provided concept reference; retain project record and do not redistribute the reference image.', sourceImage: sourceImagePath, sourceImageSha256: expectedImageHash, generator: generatorPath, method: 'Concept reference isolate -> transparent PNG -> embedded GLB wall display plane', inputContract: 'wall-art@1', generatedBy: 'imagegen' }, asset: { format: 'glb', url: '/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/model.glb', sha256: imageHash(bytes), bytes: bytes.length } };
const catalog = JSON.parse(await fs.readFile(path.join(root, catalogPath), 'utf8'));
const existing = catalog.resources.findIndex(item => item.id === resource.id && item.version === resource.version);
if (existing >= 0) catalog.resources[existing] = resource; else catalog.resources.push(resource);
const checkMode = process.argv.includes('--check');
const files = new Map([[modelPath, bytes], [resourcePath, Buffer.from(JSON.stringify(resource, null, 2) + '\n')], [catalogPath, Buffer.from(JSON.stringify(catalog, null, 2) + '\n')]]);
for (const [file, value] of files) { const target = path.join(root, file); if (checkMode) assert((await fs.readFile(target)).equals(value), `Output differs ${file}`); else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value); } }
await fs.mkdir(path.join(root, 'evidence/company-concept-acoustic-panel-v1'), { recursive: true });
const report = { status: 'passed', sourceImage: sourceImagePath, sourceImageSha256: expectedImageHash, resource: resource.asset, envelope: { min: bounds.min.toArray(), max: bounds.max.toArray() }, gltfJsonReadback: true, transparentMaterial: true, limitations: ['This is a wall display plane with an embedded generated PNG, not a volumetric acoustic simulation.', 'Visual human acceptance and ordinary-PC performance require separate checks.'] };
if (!checkMode) await fs.writeFile(path.join(root, 'evidence/company-concept-acoustic-panel-v1/report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, mode: checkMode ? 'check' : 'build', resource: resource.id, bytes: bytes.length, imageSha256: expectedImageHash }));
