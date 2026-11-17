import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateCablePortGeometry} from '../../prototype/src/company/cable-port-geometry.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({target: this}); })
      .catch(error => this.onerror?.(error));
  }
};

const root = new URL('../../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = 'assets-source/company-cable-devices-v1/parameters.json';
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const generatorPath = 'scripts/company-platform/build-cable-devices.mjs';
const generatorSha256 = hash(await fs.readFile(new URL(generatorPath, root)));
const catalog = JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json', root)));
const resources = new Map(catalog.resources.map(resource => [`${resource.id}@${resource.version}`, resource]));
const checkMode = process.argv.includes('--check');
const only = process.argv.find(value => value.startsWith('--only='))?.slice('--only='.length);

const fail = (code, path, message, details = {}) => {
  const error = new Error(`${code} at ${path}: ${message}`);
  error.code = code; error.path = path; error.details = details; throw error;
};

function release(object) {
  const geometries = new Set(), materials = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean)) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function sourceMesh(scene, name, path) {
  const mesh = scene.getObjectByName(name);
  if (!mesh?.isMesh) fail('source-mesh', path, `Expected source mesh ${name}`);
  return mesh;
}

function cloneMaterial(mesh) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!material?.isMeshStandardMaterial) fail('source-material', mesh.name, 'Port adapter requires an opaque MeshStandardMaterial source');
  const clone = material.clone(); clone.transparent = false; clone.opacity = 1; clone.map = null; clone.needsUpdate = true; return clone;
}

function frameMesh(parent, name, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material.clone());
  mesh.name = name; mesh.position.fromArray(position); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData = {cablePortRole: 'frame', cablePortId: 'usb'}; parent.add(mesh); return mesh;
}

function addPortFrame(scene, design) {
  const port = design.port;
  const backing = sourceMesh(scene, port.backing, `${design.id}.port.backing`);
  const baseMaterial = cloneMaterial(backing);
  const [x, y, z] = port.position;
  const outerWidth = port.frame.outerWidth, outerHeight = port.frame.outerHeight;
  const openingWidth = port.opening.width, openingHeight = port.opening.height;
  const depth = port.frame.depth, barHeight = port.frame.barHeight;
  const sideWidth = (outerWidth - openingWidth) / 2;
  const sideOffset = (outerWidth + openingWidth) / 4;
  const verticalOffset = (outerHeight + openingHeight) / 4;
  const zCentre = z - (port.direction[2] > 0 ? depth / 2 : -depth / 2);
  const sign = port.direction[2] > 0 ? 1 : -1;
  const frame = [
    frameMesh(scene, `${design.id}-cable-port-usb-left`, [sideWidth, outerHeight, depth], [x - sideOffset, y, zCentre], baseMaterial),
    frameMesh(scene, `${design.id}-cable-port-usb-right`, [sideWidth, outerHeight, depth], [x + sideOffset, y, zCentre], baseMaterial),
    frameMesh(scene, `${design.id}-cable-port-usb-top`, [openingWidth, barHeight, depth], [x, y + verticalOffset, zCentre], baseMaterial),
    frameMesh(scene, `${design.id}-cable-port-usb-bottom`, [openingWidth, barHeight, depth], [x, y - verticalOffset, zCentre], baseMaterial),
  ];
  // Keep the declared face on the outward side. The frame spans from the
  // original body plane to that face, so the opening remains a real cavity.
  frame.forEach(mesh => { mesh.userData.cablePortOutwardSign = sign; });
  baseMaterial.dispose();
  return frame;
}

function buildResource(design, original, originalBytes, parameterHash) {
  const resource = structuredClone(original);
  delete resource.asset; delete resource.provenance;
  resource.id = design.id; resource.version = 1;
  resource.displayName = design.id.startsWith('monitor') ? '带连接口屏幕' : '带连接口键盘';
  resource.cablePorts = [{id: design.port.id, connector: design.port.connector, position: [...design.port.position], direction: [...design.port.direction]}];
  const prefix = `${design.id}-cable-port-usb`;
  resource.cablePortNodes = {usb: {frame: [`${prefix}-left`, `${prefix}-right`, `${prefix}-top`, `${prefix}-bottom`], backing: design.port.backing}};
  resource.provenance = {
    license: 'Project-authored adapter geometry using the existing project-authored device GLB. No external art assets.',
    sourceParameters: sourcePath,
    sourceParametersSha256: parameterHash,
    generator: generatorPath,
    generatorSha256,
    tools: [`Three.js ${THREE.REVISION}`, 'GLTFLoader source readback', 'GLTFExporter', 'CPU cable-port ray checks'],
    originalResource: design.originalResource,
    originalCatalogResourceSha256: hash(Buffer.from(JSON.stringify(original))),
    originalAssetSha256: original.asset.sha256,
    originalAssetBytes: originalBytes.length,
    originalAssetPath: design.originalAssetPath,
    originalGenerator: design.originalGenerator,
    originalEditableSource: design.originalEditableSource,
    adaptationRecipe: 'Four independent opaque frame bars are seated from the original body surface to a 6mm outward face. The original body remains the cavity bottom. No electronics or communication simulation.',
  };
  return resource;
}

async function exportGlb(scene) {
  try { return Buffer.from(await new GLTFExporter().parseAsync(scene, {binary: true, animations: [], copyright: 'Project-authored cable-port adapter. Visual connector only.'})); }
  finally { release(scene); }
}

async function loadSource(design) {
  const original = resources.get(design.originalResource);
  if (!original) fail('source-resource', design.originalResource, 'Original catalog resource is missing');
  const originalBytes = await fs.readFile(new URL(design.originalAssetPath, root));
  assert.equal(hash(originalBytes), original.asset.sha256, `${design.originalResource} source asset hash differs from catalog`);
  const loaded = await new GLTFLoader().parseAsync(toArrayBuffer(originalBytes), '');
  loaded.scene.updateMatrixWorld(true);
  return {original, originalBytes, scene: loaded.scene};
}

async function buildCandidate(design, parameterHash) {
  const {original, originalBytes, scene} = await loadSource(design);
  const model = scene.getObjectByName(design.originalResource.split('@')[0]);
  if (!model) fail('source-root', design.id, 'Original design root is missing from the source GLB');
  addPortFrame(model, design);
  scene.updateMatrixWorld(true);
  const resource = buildResource(design, original, originalBytes, parameterHash);
  const bytes = await exportGlb(scene);
  resource.asset = {format:'glb',url:`/company-assets/cable-devices-v1/${design.id}/v1/model.glb`,sha256:hash(bytes),bytes:bytes.length};
  const repeatSource = await loadSource(design);
  const repeatModel = repeatSource.scene.getObjectByName(design.originalResource.split('@')[0]);
  addPortFrame(repeatModel, design); repeatSource.scene.updateMatrixWorld(true);
  const repeat = await exportGlb(repeatSource.scene);
  assert(bytes.equals(repeat), `${design.id} export is not deterministic`);
  const readback = await new GLTFLoader().parseAsync(toArrayBuffer(bytes));
  readback.scene.updateMatrixWorld(true);
  const portCheck = validateCablePortGeometry(readback.scene, resource, fail, `${design.id}.resource`);
  const bounds = new THREE.Box3().setFromObject(readback.scene);
  let triangles = 0, meshes = 0;
  readback.scene.traverse(node => {
    if (!node.isMesh) return;
    meshes++; const position = node.geometry?.getAttribute?.('position'); if (!position?.count) fail('cable-port-geometry', `${design.id}.${node.name}`, 'Mesh has no position data');
    triangles += node.geometry.index ? node.geometry.index.count / 3 : position.count / 3;
    for (let i = 0; i < position.count; i++) for (const value of [position.getX(i), position.getY(i), position.getZ(i)]) if (!Number.isFinite(value)) fail('cable-port-geometry', `${design.id}.${node.name}`, 'Mesh contains a non-finite position');
  });
  assert(bounds.min.y >= -1e-6, `${design.id} must retain its original support plane`);
  const failureSamples = [];
  const expectFailure = async (sample, mutate) => {
    const isolated = await new GLTFLoader().parseAsync(toArrayBuffer(bytes));
    isolated.scene.updateMatrixWorld(true); mutate(isolated.scene);
    let error = null;
    try { validateCablePortGeometry(isolated.scene, resource, fail, `${design.id}.failure.${sample.id}`); }
    catch (candidate) { error = candidate; }
    assert(error, `${design.id} failure sample ${sample.id} was accepted`);
    assert.equal(error.code, sample.expectedCode, `${design.id} failure sample ${sample.id} emitted an unexpected error`);
    failureSamples.push({id: sample.id, expectedCode: sample.expectedCode, actualCode: error.code, passed: true});
    release(isolated.scene);
  };
  await expectFailure({id: 'missing-frame-edge', expectedCode: 'cable-port-mesh'}, scene => {
    const name = resource.cablePortNodes.usb.frame[0]; scene.getObjectByName(name)?.removeFromParent();
  });
  await expectFailure({id: 'floating-frame', expectedCode: 'cable-port-frame-contact'}, scene => {
    for (const name of resource.cablePortNodes.usb.frame) scene.getObjectByName(name).position.z += design.port.direction[2] * .01;
    scene.updateMatrixWorld(true);
  });
  await expectFailure({id: 'sealed-opening', expectedCode: 'cable-port-blocked'}, scene => {
    const backing = scene.getObjectByName(resource.cablePortNodes.usb.backing);
    const material = (Array.isArray(backing.material) ? backing.material[0] : backing.material).clone();
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(design.port.opening.width, design.port.opening.height, .002), material);
    blocker.name = `${design.id}-sealed-opening`; blocker.position.fromArray(design.port.position); blocker.position.z -= design.port.direction[2] * .004;
    scene.add(blocker); scene.updateMatrixWorld(true);
  });
  const record = {
    id: design.id, version: 1, originalResource: design.originalResource,
    assetSha256: hash(bytes), bytes: bytes.length, meshes, triangles,
    bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()},
    port: {id: design.port.id, position: design.port.position, direction: design.port.direction, backing: design.port.backing},
    portCheck, failureSamples, repeatedExportByteIdentical: true,
    sourceAssetSha256: hash(originalBytes),
    cpuOnly: true,
  };
  release(readback.scene);
  return {design, resource, bytes, record};
}

async function emit(url, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (checkMode) {
    assert((await fs.readFile(url)).equals(bytes), `Output differs ${url.pathname}`);
  } else {
    await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes);
  }
}

const designs = source.sourceAssets.filter(design => !only || design.id === only);
if (only) assert.equal(designs.length, 1, `Unknown --only=${only}`);
const parameterHash = hash(sourceBytes);
const results = [];
for (const design of designs) results.push(await buildCandidate(design, parameterHash));
const records = results.map(result => result.record);
const resourcesOutput = results.map(({resource, design}) => ({
  id: resource.id, version: resource.version,
  resourcePath: `prototype/public/company-assets/cable-devices-v1/${design.id}/v1/resource.json`,
  modelPath: `prototype/public/company-assets/cable-devices-v1/${design.id}/v1/model.glb`,
  sourcePath, evidencePath: `evidence/company-cable-devices-v1/${design.id}/report.json`,
  sha256: records.find(record => record.id === design.id).assetSha256,
}));
const collection = {schemaVersion: 1, id: source.id, generator: generatorPath, generatorSha256, sourceParameters: sourcePath, sourceParametersSha256: parameterHash, resources: resourcesOutput, verification: {cpuOnly: true, gltfLoaderReadback: true, repeatedExportByteIdentical: true, cablePortGeometry: 'real-mesh-frame-and-backing-ray-check'}, limitations: source.limitations};
await emit(new URL('assets-source/company-cable-devices-v1/collection.json', root), JSON.stringify(collection, null, 2) + '\n');
await emit(new URL('evidence/company-cable-devices-v1/collection.json', root), JSON.stringify(collection, null, 2) + '\n');
for (const result of results) {
  const {design, resource, bytes, record} = result;
  const folder = new URL(`prototype/public/company-assets/cable-devices-v1/${design.id}/v1/`, root);
  const evidenceFolder = new URL(`evidence/company-cable-devices-v1/${design.id}/`, root);
  await emit(new URL('model.glb', folder), bytes);
  await emit(new URL('resource.json', folder), JSON.stringify(resource, null, 2) + '\n');
  const report = {status: 'source-adaptation-readback-passed', designId: design.id, originalResource: design.originalResource, source: {assetPath: design.originalAssetPath, assetSha256: record.sourceAssetSha256, editableSource: design.originalEditableSource, generator: design.originalGenerator}, adaptation: {port: design.port, resource: resource.cablePorts, cablePortNodes: resource.cablePortNodes}, asset: record, limitations: source.limitations};
  await emit(new URL('report.json', evidenceFolder), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({status: 'passed', mode: checkMode ? 'check' : 'build', resources: records}));
