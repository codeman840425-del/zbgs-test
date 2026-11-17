import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); } };
const rootPath = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = 'assets-source/company-window-source-v1/production-parameters.json';
const generatorPath = 'scripts/company-platform/build-window-opening.mjs';
const customOutput = process.argv.find(arg => arg.startsWith('--out-dir='));
const outputRoot = path.resolve(rootPath, customOutput?.slice(10) || 'prototype/public/company-assets/window-opening-v1');
const registerMode = process.argv.includes('--register') || !customOutput;
const checkMode = process.argv.includes('--check');
const source = JSON.parse(await fs.readFile(path.join(rootPath, sourcePath), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await fs.readFile(path.join(rootPath, sourcePath));
const generatorBytes = await fs.readFile(path.join(rootPath, generatorPath));
const sourceHash = hash(sourceBytes), generatorHash = hash(generatorBytes);
const sourceBase = path.join(rootPath, 'assets-source/company-window-source-v1/original/official-extracted/Models/GLB format');

function glbParts(bytes) {
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  return { json, binary: bytes.subarray(20 + jsonLength + 8) };
}
function readIndex(binary, accessor, view) {
  const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0), values = [];
  const width = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
  for (let i = 0; i < accessor.count; i += 1) values.push(accessor.componentType === 5121 ? binary.readUInt8(offset + i) : accessor.componentType === 5123 ? binary.readUInt16LE(offset + i * width) : binary.readUInt32LE(offset + i * width));
  return values;
}
function sourceFrameGeometry(bytes) {
  const { json, binary } = glbParts(bytes), node = (json.nodes || []).find(item => item.mesh !== undefined), mesh = json.meshes[node.mesh], primitive = mesh.primitives[0];
  const positionAccessor = json.accessors[primitive.attributes.POSITION], positionView = json.bufferViews[positionAccessor.bufferView], positionOffset = (positionView.byteOffset || 0) + (positionAccessor.byteOffset || 0), source = [];
  for (let i = 0; i < positionAccessor.count; i += 1) {
    const offset = positionOffset + i * 12; source.push([binary.readFloatLE(offset), binary.readFloatLE(offset + 4), binary.readFloatLE(offset + 8)]);
  }
  const sourceHalfZ = Math.max(...source.map(point => Math.abs(point[2]))), sourceMinX = Math.min(...source.map(point => point[0])), sourceMaxX = Math.max(...source.map(point => point[0])), sourceDepth = sourceMaxX - sourceMinX, positions = [];
  for (const [sourceX, sourceY, sourceZ] of source) positions.push(sourceZ * (0.8 / sourceHalfZ), (sourceY / 2.4 - 0.5) * 1.2, ((sourceX - sourceMinX) / sourceDepth) * 0.08);
  const indexAccessor = json.accessors[primitive.indices], indexView = json.bufferViews[indexAccessor.bufferView], rawIndices = readIndex(binary, indexAccessor, indexView), indices = [];
  for (let i = 0; i < rawIndices.length; i += 3) {
    const points = [source[rawIndices[i]], source[rawIndices[i + 1]], source[rawIndices[i + 2]]], center = points.reduce((sum, point) => sum.map((value, index) => value + point[index]), [0, 0, 0]).map(value => value / 3);
    if (Math.abs(center[2]) > sourceHalfZ * .95 || center[1] < .08 || center[1] > 2.32) indices.push(rawIndices[i], rawIndices[i + 1], rawIndices[i + 2]);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); return geometry;
}
function standard(color, roughness = .68, metalness = .04) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function glassMaterial(color, opacity = .34) { return new THREE.MeshStandardMaterial({ color, roughness: .18, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }); }
function box(root, name, size, position, material, role = 'frame') { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.name = name; mesh.position.fromArray(position); mesh.userData.windowRole = role; root.add(mesh); return mesh; }
function bar(group, name, size, position, material) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.name = name; mesh.position.fromArray(position); mesh.userData.windowRole = 'sash-frame'; group.add(mesh); return mesh; }
function addSashBars(group, style, material, accent, innerBarWidth, accentDepth, depth = .05, barZ = 0) {
  const width = .72, height = 1.04, barWidth = .06, prefix = group.name === 'fixedSash' ? 'fixed-' : '';
  bar(group, `${prefix}sash-left`, [barWidth, height, depth], [-width / 2 + barWidth / 2, 0, barZ], material);
  bar(group, `${prefix}sash-right`, [barWidth, height, depth], [width / 2 - barWidth / 2, 0, barZ], material);
  bar(group, `${prefix}sash-top`, [width, barWidth, depth], [0, height / 2 - barWidth / 2, barZ], material);
  bar(group, `${prefix}sash-bottom`, [width, barWidth, depth], [0, -height / 2 + barWidth / 2, barZ], material);
  if (innerBarWidth > 0) {
    if (style === 'grid' || style === 'wide') bar(group, `${prefix}sash-mid-vertical`, [innerBarWidth, height - barWidth * 2, Math.max(.02, depth - accentDepth)], [0, 0, barZ - accentDepth / 2], accent);
    if (style === 'grid') bar(group, `${prefix}sash-mid-horizontal`, [width - barWidth * 2, innerBarWidth, Math.max(.02, depth - accentDepth)], [0, 0, barZ - accentDepth / 2], accent);
    if (style === 'rounded') {
      const curve = new THREE.Mesh(new THREE.TorusGeometry(.22, innerBarWidth / 2, 8, 24, Math.PI), accent); curve.name = `${prefix}sash-rounded-accent`; curve.rotation.z = Math.PI / 2; curve.position.set(0, -.08, group.name === 'fixedSash' ? .03 : barZ - accentDepth / 2); curve.userData.windowRole = 'sash-frame'; group.add(curve);
    }
  }
}
function designObject(design, sourceBytes) {
  const root = new THREE.Group(); root.name = `window-${design.id}`; root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'opening centre', sourceDesign: design.sourceFile };
  const frame = standard(design.frameStyle === 'rounded' ? '#7a5a47' : design.frameStyle === 'wide' ? '#566b78' : '#4a5d62');
  const accent = standard(design.frameStyle === 'grid' ? '#b88e5a' : '#8d7061', .5, .12);
  const glass = glassMaterial(design.frameStyle === 'rounded' ? '#b5d3df' : '#9fc6d3');
  const sourceFrame = new THREE.Mesh(sourceFrameGeometry(sourceBytes), frame); sourceFrame.name = 'source-frame-detail'; sourceFrame.userData.windowRole = 'source-frame'; root.add(sourceFrame);
  const outer = .08, depth = .12;
  box(root, 'outer-left', [outer, 1.2, depth], [-.76, 0, .06], frame);
  box(root, 'outer-right', [outer, 1.2, depth], [.76, 0, .06], frame);
  box(root, 'outer-top', [1.6, outer, depth], [0, .56, .06], frame);
  box(root, 'outer-bottom', [1.6, outer, depth], [0, -.56, .06], frame);
  const fixedGlass = box(root, 'fixedGlass', [.64, .96, .003], [.36, 0, .025], glass, 'fixed-glass');
  fixedGlass.material = glassMaterial(glass.color, .34);
  const fixedSash = new THREE.Group(); fixedSash.name = 'fixedSash'; fixedSash.position.set(.36, 0, .025); fixedSash.userData.windowRole = 'fixed-sash'; root.add(fixedSash);
  addSashBars(fixedSash, design.frameStyle, frame, accent, design.innerBarWidth, design.accentDepth, .04, 0);
  const sash = new THREE.Group(); sash.name = 'sash'; sash.position.set(-.36, 0, .085); sash.userData.windowRole = 'sash'; root.add(sash);
  const movingGlass = new THREE.Mesh(new THREE.BoxGeometry(.64, .96, .003), glassMaterial(glass.color, .32)); movingGlass.name = 'movingGlass'; movingGlass.userData.windowRole = 'moving-glass'; sash.add(movingGlass);
  addSashBars(sash, design.frameStyle, frame, accent, design.innerBarWidth, design.accentDepth, .05, 0);
  root.updateMatrixWorld(true); return { root, windowParts: { sash: 'sash', fixedGlass: 'fixedGlass', movingGlass: 'movingGlass' } };
}
function dispose(root) { const materials = new Set(); root.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); }); materials.forEach(material => material.dispose()); }
function resourceFor(design, bytes, actual, sourceFileHash) {
  return { id: `window-opening-${design.id}`, displayName: design.label, version: 1, category: 'stateful', mount: 'wall-opening', mountRole: 'window-opening-and-glass', productionBranch: 'window-opening-and-glass', coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Opening centre', scale: 'Identity only' }, provenance: { license: 'CC0 1.0 Universal, Kenney Building Kit source frame geometry', sourceArchive: source.sourceArchive, sourceArchiveSha256: source.sourceArchiveSha256, sourceLicense: source.sourceLicense, sourceParameters: sourcePath, sourceParametersSha256: sourceHash, sourceDesign: design.id, sourceModel: `original/official-extracted/Models/GLB format/${design.sourceFile}`, sourceModelSha256: sourceFileHash, generator: generatorPath, generatorSha256: generatorHash, method: 'Source frame geometry extracted and axis-adapted into fixed bars, with project-authored sash and alpha-blended pane assembly.' }, windowSystem: { id: 'horizontal-window-v1', version: 1, apertureWidth: 1.44, apertureHeight: 1.04, sashTravel: .72, minimumSill: .6 }, mounting: { id: 'window-opening-mount-v1', width: 1.6, height: 1.2, depth: .12, origin: 'center' }, footprint: { center: [0, 0], halfSize: [.8, .06], blocking: false }, usePoints: [], stateDefaults: { openFraction: 0 }, stateSchema: { openFraction: { type: 'number', min: 0, max: 1 } }, stateSemantics: { openFraction: 'horizontal-window-opening-fraction' }, windowParts: { ...actual.windowParts }, asset: { format: 'glb', url: `/company-assets/window-opening-v1/${design.id}/v1/model.glb`, sha256: hash(bytes), bytes: bytes.length }, checks: actual };
}
const generated = [];
for (const design of source.designs) {
  const sourceBytes = await fs.readFile(path.join(sourceBase, design.sourceFile)), sourceFileHash = hash(sourceBytes), { root, windowParts } = designObject(design, sourceBytes);
  try {
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [], copyright: `Kenney CC0 source frame adapted for ${design.id}; project-authored window sash and alpha glass.` }));
    root.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(root), glass = root.getObjectByName('fixedGlass'), moving = root.getObjectByName('movingGlass'), sash = root.getObjectByName('sash');
    const actual = { envelope: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() }, meshCount: (() => { let count = 0; root.traverse(node => { if (node.isMesh) count += 1; }); return count; })(), triangles: (() => { let count = 0; root.traverse(node => { if (node.isMesh) count += node.geometry.index ? node.geometry.index.count / 3 : node.geometry.getAttribute('position').count / 3; }); return count; })(), windowParts, sashPosition: sash.position.toArray(), fixedGlassTransparent: Boolean(glass.material.transparent && glass.material.opacity > 0 && glass.material.opacity < 1), movingGlassTransparent: Boolean(moving.material.transparent && moving.material.opacity > 0 && moving.material.opacity < 1), fixedGlassParent: glass.parent?.name, movingGlassParent: moving.parent?.name };
    const resource = resourceFor(design, bytes, actual, sourceFileHash), directory = path.join(outputRoot, design.id, 'v1');
    if (checkMode) { const diskBytes = await fs.readFile(path.join(directory, 'model.glb')); const disk = JSON.parse(await fs.readFile(path.join(directory, 'resource.json'), 'utf8')); if (!diskBytes.equals(bytes)) throw new Error(`Stale ${design.id}/model.glb`); delete disk.checks; const expected = structuredClone(resource); delete expected.checks; if (JSON.stringify(disk) !== JSON.stringify(expected)) throw new Error(`Stale ${design.id}/resource.json`); }
    else { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'model.glb'), bytes); await fs.writeFile(path.join(directory, 'resource.json'), `${JSON.stringify(resource, null, 2)}\n`); }
    generated.push({ id: design.id, resourceId: resource.id, bytes: bytes.length, sha256: resource.asset.sha256, resourcePath: `prototype/public/company-assets/window-opening-v1/${design.id}/v1/resource.json`, modelPath: `prototype/public/company-assets/window-opening-v1/${design.id}/v1/model.glb` });
  } finally { dispose(root); }
}
const collection = { id: 'company-window-opening-v1', version: 1, category: 'stateful', productionBranch: 'window-opening-and-glass', resources: generated.map(item => ({ id: item.resourceId, version: 1, url: `/company-assets/window-opening-v1/${item.id}/v1/model.glb`, resourcePath: item.resourcePath, modelPath: item.modelPath, sha256: item.sha256 })), sourceParameters: sourcePath, sourceParametersSha256: sourceHash, generator: generatorPath, generatorSha256: generatorHash };
const collectionPath = path.join(outputRoot, 'collection.json');
if (checkMode) { const disk = JSON.parse(await fs.readFile(collectionPath, 'utf8')); if (JSON.stringify(disk) !== JSON.stringify(collection)) throw new Error('Stale window collection.json'); }
else { await fs.mkdir(outputRoot, { recursive: true }); await fs.writeFile(collectionPath, `${JSON.stringify(collection, null, 2)}\n`); }
await fs.mkdir(path.join(rootPath, 'prototype/src/company'), { recursive: true }); const index = { id: 'company-window-opening-v1', version: 1, resources: collection.resources, sourceParameters: sourcePath, sourceParametersSha256: sourceHash, generator: generatorPath, generatorSha256: generatorHash }; if (!checkMode && registerMode) await fs.writeFile(path.join(rootPath, 'prototype/src/company/window-resources.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ status: 'passed', outputRoot, generated }, null, 2));
