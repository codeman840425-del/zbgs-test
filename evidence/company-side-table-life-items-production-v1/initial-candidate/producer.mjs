import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

export const ROOT = new URL('../../', import.meta.url);
export const SOURCE_PATH = 'assets-source/company-side-table-life-items-v1/parameters.json';
export const GENERATOR_PATH = 'scripts/company-platform/build-side-table-life-items.mjs';
export const CONTRACT_PATH = 'docs/COMPANY-SIDE-TABLE-LIFE-ITEMS-CONTRACT-v1.txt';
export const DATA_PATH = 'prototype/src/company/side-table-life-items-data.js';
export const VERIFIER_PATH = 'prototype/src/company/side-table-life-items-geometry.js';
export const IDS = ['cup', 'bottle', 'tissue', 'pen-notebook'];
const OUTPUT_PATH = 'prototype/public/company-assets/side-table-life-items-v1';
const EVIDENCE_PATH = 'evidence/company-side-table-life-items-production-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const glbJson = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));

// CPU source/geometry inspection only. Native decode and bitmap ownership are
// checked in the real browser. Original image bytes and UVs are verified below.
async function parseGeometry(bytes) {
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: 'COMPANY_CPU_GEOMETRY_TEXTURE_PLACEHOLDER',
    loadTexture() {
      const texture = new THREE.Texture({width: 512, height: 512, geometryOnlyPlaceholder: true});
      texture.flipY = false;
      return Promise.resolve(texture);
    }
  }));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

async function readPin(pin) {
  assert(typeof pin?.path === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'Missing dependency pin');
  const bytes = await fs.readFile(new URL(pin.path, ROOT));
  assert.equal(sha256(bytes), pin.sha256, `Pinned dependency differs: ${pin.path}`);
  return bytes;
}

function validateSource(source) {
  assert.equal(source.id, 'company-side-table-life-items-v1');
  assert.equal(source.version, 1);
  assert.deepEqual(source.designs.map(design => design.id), IDS);
  assert.deepEqual(source.common.mounting, {origin: 'bottom', width: .18, height: .25, depth: .18});
  assert.deepEqual(source.common.footprint, {blocking: false});
  assert(source.tissue.paperTopY >= .125 && source.tissue.paperTopY <= .135);
  assert.equal(source.tissue.paperThickness, .0002);
  assert.equal(source.tissue.paperWidth, .052);
  assert.deepEqual(source.penNotebook.penLengths, [.12, .13, .14]);
  assert.equal(source.originalPackage.license, 'CC0');
  assert(source.common.promptStandard.length > 300);
}

function dispose(root) {
  const materials = new Set(), textures = new Set();
  root.traverse(node => {
    node.geometry?.dispose();
    for (const material of node.material ? [node.material].flat() : []) {
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

function fromTriangles(triangles, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2).map(value => Math.abs(value) < 1e-10 ? 0 : Math.fround(value)), 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors.flat(2), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function horizontalFace(triangle, sign) {
  const normal = new THREE.Triangle(...triangle.map(point => new THREE.Vector3(...point))).getNormal(new THREE.Vector3());
  return normal.y * sign < 0 ? [...triangle].reverse() : triangle;
}

function boxGeometry(min, max) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) for (let axis = 0; axis < 3; axis++)
    positions.setComponent(index, axis, Math.fround(positions.getComponent(index, axis) < 0 ? min[axis] : max[axis]));
  return geometry;
}

function lidGeometry() {
  const outer = [[-.08, -.05], [.08, -.05], [.08, .05], [-.08, .05]];
  const inner = [[-.028, -.005], [.028, -.005], [.028, .005], [-.028, .005]];
  const points = [...outer, ...inner], triangles = [];
  const caps = THREE.ShapeUtils.triangulateShape(outer.map(point => new THREE.Vector2(...point)), [inner.map(point => new THREE.Vector2(...point))]);
  for (const y of [.072, .075]) for (const indices of caps)
    triangles.push(horizontalFace(indices.map(index => [points[index][0], y, points[index][1]]), y === .075 ? 1 : -1));
  for (const [polygon, inward] of [[outer, false], [inner, true]]) for (let index = 0; index < 4; index++) {
    const p = polygon[index], q = polygon[(index + 1) % 4];
    const a = [p[0], .072, p[1]], b = [q[0], .072, q[1]], c = [q[0], .075, q[1]], d = [p[0], .075, p[1]];
    const sides = [[a, b, c], [a, c, d]];
    triangles.push(...(inward ? sides : sides.map(triangle => [...triangle].reverse())));
  }
  return fromTriangles(triangles);
}

function paperGeometry(source) {
  const {paperWidth, paperThickness, paperTopY, paperPathZ, paperPathYFixed} = source.tissue;
  const path = [...paperPathYFixed, paperTopY].map((y, index) => [paperPathZ[index], y]);
  const left = path.map(([z, y]) => new THREE.Vector2(-z - paperThickness / 2, y));
  const right = [...path].reverse().map(([z, y]) => new THREE.Vector2(-z + paperThickness / 2, y));
  const shape = new THREE.Shape([...left, ...right]);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: paperWidth, bevelEnabled: false, steps: 1, curveSegments: 1});
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  geometry.translate(-paperWidth / 2, 0, 0);
  return geometry;
}

function penGeometry(source, index) {
  const recipe = source.penNotebook, bottom = recipe.penBottomY, length = recipe.penLengths[index];
  const heights = [bottom, bottom + .004, bottom + length - .005, bottom + length];
  const radii = [.0007, recipe.penRadius, recipe.penRadius, .0020];
  const cx = recipe.holderCenter[0] + recipe.penOffsets[index][0], cz = recipe.penOffsets[index][1];
  const ring = (level, segment) => [cx + radii[level] * Math.cos(segment * Math.PI / 4), heights[level], cz + radii[level] * Math.sin(segment * Math.PI / 4)];
  const triangles = [], colors = [];
  const add = (triangle, dark) => {triangles.push(triangle); colors.push(triangle.map(() => dark ? [.025, .025, .025] : [.82, .82, .78]));};
  for (let segment = 0; segment < 8; segment++) {
    const next = (segment + 1) % 8;
    for (let level = 0; level < 3; level++) {
      const a = ring(level, segment), b = ring(level, next), c = ring(level + 1, next), d = ring(level + 1, segment);
      add([c, b, a], level !== 1); add([d, c, a], level !== 1);
    }
    add(horizontalFace([[cx, bottom, cz], ring(0, segment), ring(0, next)], -1), true);
    add(horizontalFace([[cx, bottom + length, cz], ring(3, segment), ring(3, next)], 1), true);
  }
  return fromTriangles(triangles, colors);
}

export async function createSideTableLifeItem(design, source, originalBytes) {
  const root = new THREE.Group(); root.name = `side-table-life-${design.id}`;
  root.userData = {units: 'metres', up: '+Y', forward: '+Z', origin: 'Bottom centre', sourceVersion: 1};
  const add = (name, geometry, material) => {const mesh = new THREE.Mesh(geometry, material); mesh.name = name; root.add(mesh);};
  try {
    if (design.source) {
      assert(originalBytes, 'Pinned original GLB is required');
      const json = glbJson(originalBytes), original = (await parseGeometry(originalBytes)).scene;
      original.updateMatrixWorld(true);
      try {
        const meshes = []; original.traverse(node => {if (node.isMesh) meshes.push(node);});
        assert.equal(meshes.length, 1, 'Food source must remain one original mesh');
        const mesh = meshes[0], geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);
        let scale, translation, name;
        if (design.id === 'cup') {
          scale = source.cup.scale; translation = [-source.cup.recenterXZ[0] * scale[0], 0, -source.cup.recenterXZ[1] * scale[2]]; name = 'life-cup-source';
        } else if (design.id === 'bottle') {
          scale = [source.bottle.scale, source.bottle.scale, source.bottle.scale]; translation = [0, 0, 0]; name = 'life-bottle-source';
        } else {
          scale = source.penNotebook.holderScale; translation = source.penNotebook.holderCenter; name = 'life-pen-holder';
        }
        const matrix = new THREE.Matrix4().makeTranslation(...translation).multiply(new THREE.Matrix4().makeScale(...scale));
        geometry.applyMatrix4(matrix);
        const material = mesh.material.clone();
        material.userData.originalDefinition = structuredClone(json.materials[0]);
        add(name, geometry, material);
        root.userData.originalSource = {model: design.source, node: json.nodes[0].name, scale, translation, triangles: mesh.geometry.index.count / 3};
      } finally {dispose(original);}
    }
    if (design.id === 'tissue') {
      const body = new THREE.MeshStandardMaterial({color: '#bf9b75', roughness: .8});
      const paper = new THREE.MeshStandardMaterial({color: '#f5f2e9', roughness: .95, side: THREE.DoubleSide});
      add('life-tissue-base', boxGeometry([-.08, 0, -.05], [.08, .003, .05]), body);
      add('life-tissue-side-left', boxGeometry([-.08, .003, -.05], [-.077, .072, .05]), body);
      add('life-tissue-side-right', boxGeometry([.077, .003, -.05], [.08, .072, .05]), body);
      add('life-tissue-side-back', boxGeometry([-.077, .003, -.05], [.077, .072, -.047]), body);
      add('life-tissue-side-front', boxGeometry([-.077, .003, .047], [.077, .072, .05]), body);
      add('life-tissue-lid', lidGeometry(), body);
      add('life-tissue-paper', paperGeometry(source), paper);
    }
    if (design.id === 'pen-notebook') {
      const cover = new THREE.MeshStandardMaterial({color: '#92574f', roughness: .8});
      const pages = new THREE.MeshStandardMaterial({color: '#eee9dc', roughness: .95});
      const pens = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: .7, vertexColors: true});
      add('life-notebook-cover-bottom', boxGeometry([-.086, 0, -.074], [.019, .0015, .074]), cover);
      add('life-notebook-pages', boxGeometry([-.0845, .0015, -.0725], [.0175, .0105, .0725]), pages);
      add('life-notebook-cover-top', boxGeometry([-.086, .0105, -.074], [.019, .012, .074]), cover);
      add('life-notebook-spine', boxGeometry([-.086, .0015, -.074], [-.0845, .0105, .074]), cover);
      for (let index = 0; index < 3; index++) add(`life-pen-${index + 1}`, penGeometry(source, index), pens);
    }
    root.updateMatrixWorld(true);
    return root;
  } catch (error) {dispose(root); throw error;}
}

// Same aligned BIN/image-bufferView layout as the existing company information
// and ceiling producers, extended locally to this finite collection's meshes.
export function packLifeItem(root, pngBytes) {
  const chunks = [], bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [], materialIndices = new Map();
  let binaryLength = 0, hasTexture = false;
  const addBytes = (bytes, target) => {
    const index = bufferViews.length;
    bufferViews.push({buffer: 0, byteOffset: binaryLength, byteLength: bytes.length, ...(target ? {target} : {})});
    const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
    chunks.push(bytes, padding); binaryLength += bytes.length + padding.length;
    return index;
  };
  const materialIndex = material => {
    if (!materialIndices.has(material)) {
      const index = materials.length; materialIndices.set(material, index);
      if (material.userData.originalDefinition) {
        materials.push(structuredClone(material.userData.originalDefinition)); hasTexture = true;
      } else materials.push({name: `life-material-${index}`, pbrMetallicRoughness: {baseColorFactor: [...material.color.toArray(), material.opacity], metallicFactor: material.metalness, roughnessFactor: material.roughness}, doubleSided: material.side === THREE.DoubleSide});
    }
    return materialIndices.get(material);
  };
  const attributeIndex = (attribute, semantic, geometry) => {
    const view = addBytes(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength), semantic === 'INDICES' ? 34963 : 34962);
    const componentType = attribute.array instanceof Uint32Array ? 5125 : attribute.array instanceof Uint16Array ? 5123 : 5126;
    const accessor = {bufferView: view, componentType, count: attribute.count, type: ['SCALAR', 'SCALAR', 'VEC2', 'VEC3', 'VEC4'][attribute.itemSize]};
    if (semantic === 'POSITION') {
      geometry.computeBoundingBox(); accessor.min = geometry.boundingBox.min.toArray(); accessor.max = geometry.boundingBox.max.toArray();
    }
    accessors.push(accessor); return accessors.length - 1;
  };
  for (const mesh of root.children) {
    assert(mesh.isMesh && !Array.isArray(mesh.material), 'Collection parts use one material per actual mesh');
    const geometry = mesh.geometry, attributes = {};
    for (const [name, semantic] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['tangent', 'TANGENT'], ['uv', 'TEXCOORD_0'], ['color', 'COLOR_0']])
      if (geometry.attributes[name]) attributes[semantic] = attributeIndex(geometry.attributes[name], semantic, geometry);
    const primitive = {attributes, material: materialIndex(mesh.material)};
    if (geometry.index) primitive.indices = attributeIndex(geometry.index, 'INDICES', geometry);
    meshes.push({name: mesh.name, primitives: [primitive]}); nodes.push({name: mesh.name, mesh: meshes.length - 1});
  }
  const json = {asset: {version: '2.0', generator: 'company-side-table-life-items-v1'}, scene: 0, scenes: [{name: root.name, nodes: nodes.map((_, index) => index), extras: root.userData}], nodes, meshes, materials, bufferViews, accessors};
  if (hasTexture) {
    assert(pngBytes?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Original PNG bytes required');
    json.images = [{name: 'colormap', bufferView: addBytes(pngBytes), mimeType: 'image/png'}];
    json.textures = [{name: 'colormap', sampler: 0, source: 0}];
    json.samplers = [{magFilter: 9728, minFilter: 9984}];
    json.extensionsUsed = ['KHR_texture_transform'];
  }
  const binary = Buffer.concat(chunks); json.buffers = [{byteLength: binary.length}];
  const rawJson = Buffer.from(JSON.stringify(json)), paddedJson = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + binary.length, 8);
  const chunk = (type, bytes) => {const header = Buffer.alloc(8); header.writeUInt32LE(bytes.length, 0); header.writeUInt32LE(type, 4); return Buffer.concat([header, bytes]);};
  return Buffer.concat([header, chunk(0x4e4f534a, paddedJson), chunk(0x004e4942, binary)]);
}

export async function exportSideTableLifeItem(design, source, originalBytes, pngBytes) {
  const root = await createSideTableLifeItem(design, source, originalBytes);
  try {return packLifeItem(root, pngBytes);}
  finally {dispose(root);}
}

function failGeometry(code, location, message, details) {
  throw Object.assign(new Error(`${code} at ${location}: ${message}`), {code, path: location, details});
}

export function resourceFor(design, source, bytes, provenance) {
  const files = design.source ? ['glb', 'obj', 'mtl'].map(extension => source.dependencyPins[`original-${design.source}.${extension}`]) : [];
  return {id: `side-table-life-${design.id}`, version: 1, displayName: design.label, category: 'decor', mountRole: 'side-table-life-items', productionBranch: 'side-table-life-items', mount: 'support-surface',
    mounting: source.common.mounting, coordinates: source.common.coordinates, footprint: source.common.footprint, usePoints: [], stateDefaults: {},
    provenance: {...provenance, sourceDesign: design.id, license: source.license, prompt: `${source.common.promptStandard} Design: ${design.prompt}`, externalSource: design.source ? {...source.originalPackage, model: design.source, files, texture: source.dependencyPins['original-Textures/colormap.png']} : null,
      limitations: ['Static source adaptation and original supplements. No hand, fluid, opening or paper extraction state.', 'CPU uses a texture placeholder solely for geometry parsing. Native image decoding, UV/appearance, image ownership, transactions and closed-process restoration need real-browser evidence.']},
    asset: {format: 'glb', url: `/company-assets/side-table-life-items-v1/${design.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length}};
}

export async function readback(bytes, design, source, resource, originalBytes, pngBytes) {
  const {validateSideTableLifeItemsResource} = await import(new URL(DATA_PATH, ROOT));
  const {validateSideTableLifeItemsGeometry} = await import(new URL(VERIFIER_PATH, ROOT));
  validateSideTableLifeItemsResource(resource, failGeometry);
  const scene = (await parseGeometry(bytes)).scene, expected = await createSideTableLifeItem(design, source, originalBytes);
  try {
    const support = validateSupportGeometry(scene, resource, failGeometry), geometry = validateSideTableLifeItemsGeometry(scene, resource, failGeometry);
    assert(geometry.checked);
    const materials = new Set(), digest = createHash('sha256'); let triangleCount = 0, meshCount = 0;
    scene.traverse(node => {
      assert(node.position.lengthSq() === 0 && node.quaternion.angleTo(new THREE.Quaternion()) < 1e-8 && node.scale.equals(new THREE.Vector3(1, 1, 1)), 'All node transforms must be baked');
      if (!node.isMesh) return;
      const original = expected.getObjectByName(node.name); assert(original?.isMesh, `Unknown actual mesh ${node.name}`);
      for (const name of ['position', 'normal', 'uv', 'tangent', 'color']) assert.deepEqual(node.geometry.attributes[name]?.array, original.geometry.attributes[name]?.array, `Actual source attribute differs ${node.name}/${name}`);
      assert.deepEqual(node.geometry.index?.array, original.geometry.index?.array, 'Actual source topology differs');
      meshCount++; triangleCount += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; materials.add(node.material);
      digest.update(node.name); digest.update(Buffer.from(node.geometry.attributes.position.array.buffer));
    });
    assert(meshCount === expected.children.length && triangleCount <= 2500 && meshCount <= 32 && materials.size <= 4);
    const json = glbJson(bytes), jsonLength = bytes.readUInt32LE(12), binaryOffset = 28 + jsonLength;
    assert((json.buffers ?? []).every(buffer => !buffer.uri) && !json.animations?.length);
    const imageEvidence = [];
    for (const image of json.images ?? []) {
      assert(image.uri === undefined && image.mimeType === 'image/png');
      const view = json.bufferViews[image.bufferView], actualPng = bytes.subarray(binaryOffset + view.byteOffset, binaryOffset + view.byteOffset + view.byteLength);
      assert(actualPng.equals(pngBytes), 'Original PNG bytes changed');
      imageEvidence.push({sha256: sha256(actualPng), bytes: actualPng.length, dimensions: [actualPng.readUInt32BE(16), actualPng.readUInt32BE(20)]});
    }
    assert.equal(imageEvidence.length, design.source ? 1 : 0);
    const bounds = new THREE.Box3().setFromObject(scene);
    return {geometry, support, bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, triangleCount, meshCount, materialCount: materials.size, imageEvidence, sourceAttributesAndTopologyMatch: true, identityAllNodes: true, geometrySha256: digest.digest('hex'), cpuTexturePlaceholder: true, nativeTextureDecodeChecked: false, externalUris: 0};
  } finally {dispose(scene); dispose(expected);}
}

export async function buildCollection({source, sourceBytes, ids = IDS} = {}) {
  sourceBytes ??= source ? jsonBytes(source) : await fs.readFile(new URL(SOURCE_PATH, ROOT)); source ??= JSON.parse(sourceBytes);
  assert.deepEqual(JSON.parse(sourceBytes), source); validateSource(source);
  const dependencies = new Map();
  for (const pin of Object.values(source.dependencyPins)) dependencies.set(pin.path, await readPin(pin));
  assert.equal(source.dependencyPins.functionalContract.path, CONTRACT_PATH);
  assert.equal(source.dependencyPins.dataVerifier.path, DATA_PATH);
  assert.equal(source.dependencyPins.geometryVerifier.path, VERIFIER_PATH);
  const generatorBytes = await fs.readFile(new URL(GENERATOR_PATH, ROOT));
  const provenance = {sourceParameters: SOURCE_PATH, sourceParametersSha256: sha256(sourceBytes), generator: GENERATOR_PATH, generatorSha256: sha256(generatorBytes), functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: source.dependencyPins.functionalContract.sha256, dependencies: source.dependencyPins};
  const pngBytes = dependencies.get('assets-source/company-side-table-life-items-v1/original/Textures/colormap.png');
  assert(ids.length && ids.every(id => IDS.includes(id)) && new Set(ids).size === ids.length);
  const items = [];
  for (const design of source.designs.filter(design => ids.includes(design.id))) {
    const originalBytes = design.source ? dependencies.get(`assets-source/company-side-table-life-items-v1/original/${design.source}.glb`) : undefined;
    const bytes = await exportSideTableLifeItem(design, source, originalBytes, pngBytes);
    assert(bytes.equals(await exportSideTableLifeItem(design, source, originalBytes, pngBytes)), 'Repeated export differs');
    const resource = resourceFor(design, source, bytes, provenance);
    items.push({design, bytes, resource, actual: await readback(bytes, design, source, resource, originalBytes, pngBytes)});
  }
  const collection = {id: source.id, version: 1, category: 'decor', provenance, resources: items.map(({resource}) => ({id: resource.id, url: resource.asset.url, resourcePath: `prototype/public${resource.asset.url.replace(/model\.glb$/, 'resource.json')}`, sha256: resource.asset.sha256}))};
  const files = new Map([[`${OUTPUT_PATH}/collection.json`, jsonBytes(collection)]]);
  for (const item of items) {files.set(`${OUTPUT_PATH}/${item.design.id}/v1/model.glb`, item.bytes); files.set(`${OUTPUT_PATH}/${item.design.id}/v1/resource.json`, jsonBytes(item.resource));}
  return {source, provenance, items, collection, files};
}

async function main() {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const result = await buildCollection(), beforeSource = structuredClone(result.source);
  beforeSource.tissue.paperTopY = beforeSource.sourceModification.before;
  const beforeBytes = jsonBytes(beforeSource), before = await buildCollection({source: beforeSource, sourceBytes: beforeBytes});
  for (let index = 0; index < 4; index++) {
    if (IDS[index] === 'tissue') assert.notEqual(before.items[index].actual.geometrySha256, result.items[index].actual.geometrySha256);
    else assert(before.items[index].bytes.equals(result.items[index].bytes), 'Other three model bytes changed');
  }
  const report = {status: 'passed', scope: 'CPU deterministic original-source/PNG/UV adaptation and actual geometry readback of four static life items', provenance: result.provenance,
    commands: ['node scripts/company-platform/build-side-table-life-items.mjs', 'node scripts/company-platform/build-side-table-life-items.mjs --check'],
    items: result.items.map(item => ({id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length, repeatedExportByteIdentical: true, actual: item.actual})),
    sourceModificationEvidence: {parameter: 'tissue.paperTopY', before: beforeSource.tissue.paperTopY, after: result.source.tissue.paperTopY, beforeParameters: `${EVIDENCE_PATH}/before-parameters.json`, beforeParametersSha256: sha256(beforeBytes), beforeOutput: `${EVIDENCE_PATH}/before-tissue.glb`, beforeSha256: before.items[2].resource.asset.sha256, afterSha256: result.items[2].resource.asset.sha256, otherThreeModelsByteIdentical: true, beforeActual: before.items[2].actual, afterActual: result.items[2].actual},
    limitations: ['Texture placeholder used for CPU geometry only. Native decode, UV/appearance, resource ownership, game loading and closed-process restoration need separate browser evidence.', 'No hand, fluid, cap opening, paper extraction, ordinary-device or C3 claims.']};
  if (process.argv.includes('--check')) {
    for (const [file, bytes] of result.files) assert((await fs.readFile(new URL(file, ROOT))).equals(bytes), `Output differs ${file}`);
  } else {
    const evidence = new Map([[`${EVIDENCE_PATH}/report.json`, jsonBytes(report)], [`${EVIDENCE_PATH}/before-parameters.json`, beforeBytes], [`${EVIDENCE_PATH}/before-tissue.glb`, before.items[2].bytes], [`${EVIDENCE_PATH}/before-tissue-resource.json`, jsonBytes(before.items[2].resource)]]);
    for (const [file, bytes] of [...result.files, ...evidence]) {const url = new URL(file, ROOT); await fs.mkdir(new URL('./', url), {recursive: true}); await fs.writeFile(url, bytes);}
  }
  console.log(JSON.stringify({status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'build', resources: result.items.map(item => ({id: item.resource.id, sha256: item.resource.asset.sha256, bytes: item.bytes.length}))}));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(async error => {
  if (!process.argv.includes('--check')) {const directory = new URL(`${EVIDENCE_PATH}/failures/`, ROOT); await fs.mkdir(directory, {recursive: true}); const bytes = jsonBytes({status: 'failed', message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack}); await fs.writeFile(new URL(`${sha256(bytes).slice(0, 16)}.json`, directory), bytes);}
  console.error(error.stack || error); process.exitCode = 1;
});
