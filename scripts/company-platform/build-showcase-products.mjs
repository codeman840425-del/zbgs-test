import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Box3, Matrix4, REVISION, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { editableSources, editableValidator, readProductionFile } from './plant-editable-source.mjs';
import { inspectShowcaseProduct, loadShowcaseGlb, parseShowcaseGlb, pngView } from './test-showcase-product-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-showcase-product-v1';
const defaultInput = family + '/parameters.json';
const contractPath = family + '/contract.json';
const script = 'scripts/company-platform/build-showcase-products.mjs';
const geometryScript = 'scripts/company-platform/test-showcase-product-assets.mjs';
const environmentPath = 'assets-source/company-environment-specs-v1/branches.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = data => Buffer.from(JSON.stringify(data, null, 2) + '\n');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const project = name => path.join(root, name);
const read = name => fs.readFile(project(name));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };

async function readPin(pin) {
  if (!sha(pin?.sha256)) fail('invalid-appearance-source', String(pin?.path));
  const bytes = await readProductionFile(root, pin.path);
  if (hash(bytes) !== pin.sha256) fail('appearance-source-pin-mismatch', pin.path);
  return bytes;
}

function writeGlb(gltf, binary) {
  const body = Buffer.from(JSON.stringify(gltf)), padding = Buffer.alloc((4 - body.length % 4) % 4, 0x20);
  const jsonHeader = Buffer.alloc(20), binaryHeader = Buffer.alloc(8);
  [0x46546c67, 2, 28 + body.length + padding.length + binary.length, body.length + padding.length, 0x4e4f534a]
    .forEach((word, i) => jsonHeader.writeUInt32LE(word, i * 4));
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([jsonHeader, body, padding, binaryHeader, binary]);
}

function validatePng(bytes) {
  assert(bytes.length >= 33 && bytes.length <= 3 * 1024 * 1024 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR' &&
    [bytes.readUInt32BE(16), bytes.readUInt32BE(20)].every(value => value >= 1 && value <= 2048),
  'Expected an actual PNG within 2048px and 3MiB');
  PNG.sync.read(bytes, { checkCRC: true });
}

function safeImageUri(uri) {
  return typeof uri === 'string' && /^(?:[A-Za-z0-9_ -]+\/)*[A-Za-z0-9_. -]+\.png$/u.test(uri) &&
    !uri.split('/').some(piece => !piece || /[. ]$/u.test(piece));
}

async function embedImages(gltf, bin, pins) {
  let byteOffset = bin.length;
  const pieces = [bin], dependencies = {}, used = new Set();
  for (const [index, image] of (gltf.images ?? []).entries()) {
    if (!Object.hasOwn(image, 'uri')) {
      validatePng(pngView(gltf, bin, image));
      continue;
    }
    const { uri } = image;
    if (!safeImageUri(uri) || !Object.hasOwn(pins, uri) || image.bufferView !== undefined ||
        (image.mimeType !== undefined && image.mimeType !== 'image/png'))
      fail('invalid-appearance-source', `Image has no explicit safe local PNG pin: ${uri}`);
    const pin = pins[uri], png = await readPin(pin);
    validatePng(png);
    used.add(uri);
    const pad = Buffer.alloc((4 - png.length % 4) % 4);
    image.bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: png.length }) - 1;
    image.mimeType = 'image/png';
    delete image.uri;
    pieces.push(png, pad);
    byteOffset += png.length + pad.length;
    dependencies[`sourceTexture-${index}`] = { path: pin.path, sha256: pin.sha256 };
  }
  assert.equal(used.size, Object.keys(pins).length, 'Recipe contains unused texture pins');
  gltf.buffers[0].byteLength = byteOffset;
  return { binary: Buffer.concat(pieces), dependencies };
}

async function exportProduct(design, source) {
  assert(Number.isFinite(design.metresPerUnit) && design.metresPerUnit >= .01 && design.metresPerUnit <= 20 &&
    [-2, -1, 0, 1, 2].includes(design.yawQuarterTurns), 'Use positive uniform metre scale and a quarter-turn yaw');
  assert(source && typeof source.author === 'string' && source.author.trim() && !/[\r\n]/.test(source.author) &&
    source.author.length <= 160 && ['CC0-1.0', 'Project-authorized-original'].includes(source.license));
  if (source.entry !== undefined || source.archiveSha256 !== undefined)
    assert(typeof source.entry === 'string' && source.entry.trim() && sha(source.archiveSha256));
  assert(source.url === undefined || /^https:\/\//u.test(source.url));
  assert(source.textures === undefined || object(source.textures));
  const [original, license] = await Promise.all([readPin(source), readPin({ path: source.licensePath, sha256: source.licenseSha256 })]);
  assert(license.toString('utf8').trim(), 'Source must include actual permission text');
  const { gltf, bin } = parseShowcaseGlb(original);
  const { binary, dependencies } = await embedImages(gltf, bin, source.textures ?? {});
  const scene = await loadShowcaseGlb(writeGlb(gltf, binary));
  const originalBounds = new Box3().setFromObject(scene, true), productNodes = [];
  scene.traverseVisible(mesh => { if (mesh.isMesh) productNodes.push(mesh.name); });
  assert(productNodes.length && productNodes.every(Boolean) && new Set(productNodes).size === productNodes.length,
    'Source needs unique visible physical mesh names');
  const pose = new Matrix4().makeRotationY(design.yawQuarterTurns * Math.PI / 2).scale(new Vector3().setScalar(design.metresPerUnit));
  scene.applyMatrix4(pose);
  scene.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(scene, true), centre = fitted.getCenter(new Vector3());
  const matrix = new Matrix4().makeTranslation(-centre.x, -fitted.min.y, -centre.z).multiply(pose);
  const targetScene = gltf.scenes[gltf.scene ?? 0];
  assert(!gltf.nodes.some(node => node.name === 'showcase-product-pose'), 'Source uses the reserved output pose node name');
  targetScene.nodes = [gltf.nodes.push({ name: 'showcase-product-pose', matrix: matrix.toArray(), children: targetScene.nodes }) - 1];
  return { bytes: writeGlb(gltf, binary), original, productNodes, dependencies,
    originalBounds: { min: originalBounds.min.toArray(), max: originalBounds.max.toArray(), dimensions: originalBounds.getSize(new Vector3()).toArray() },
    pose: { metresPerUnit: design.metresPerUnit, yawQuarterTurns: design.yawQuarterTurns, matrix: matrix.toArray() } };
}

async function main() {
  const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
    parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
  if (args.help) {
    console.log('node scripts/company-platform/build-showcase-products.mjs --check | --write | --output NEW_DIRECTORY [--parameters REPO_RELATIVE_JSON]');
    return;
  }
  assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one export mode');
  assert(!args.parameters || args.output, 'Alternate parameters need isolated output');
  const input = args.parameters ?? defaultInput;
  // Scratch recipes may reside beneath output. All referenced production files
  // still pass the stricter asset-folder and no-link rule in readPin.
  assert(typeof input === 'string' && /^(?:assets-source\/company-|output\/)/u.test(input) && !/[\\:\x00-\x1f<>|"?*]/u.test(input) &&
    input.split('/').every(part => part && !/[. ]$/u.test(part)), 'Expected a portable company recipe path');
  const inputFile = project(input);
  assert(await fs.realpath(inputFile) === inputFile && (await fs.lstat(inputFile)).isFile());
  const [inputBytes, contractBytes, generatorBytes, geometryBytes, environmentBytes, validatorBytes] = await Promise.all(
    [input, contractPath, script, geometryScript, environmentPath, editableValidator].map(read));
  const recipe = JSON.parse(inputBytes), contract = JSON.parse(contractBytes);
  assert(recipe.schema === 'company-showcase-product-collection' && recipe.version === 1 && object(recipe.sources) &&
    Array.isArray(recipe.designs) && recipe.designs.length);
  assert(contract.schema === 'company-showcase-product-contract' && contract.version === 1);
  const branch = JSON.parse(environmentBytes).groups.flatMap(group => group.branches).find(item => item.id === 'theme-live-kit');
  assert.equal(branch?.fixedFunctionAndInstall.mount, 'room-composition');
  if (!args.parameters) assert.equal(recipe.designs.length, 4);
  const editable = await editableSources(root, recipe);
  const collection = { schemaVersion: 1, id: 'company-showcase-product-v1', sourceParameters: input, sourceParametersSha256: hash(inputBytes),
    contract: contractPath, contractSha256: hash(contractBytes), generator: script, generatorSha256: hash(generatorBytes), resources: [] };
  const files = new Map(), reports = [], seen = new Set();
  for (const design of recipe.designs) {
    assert(/^[a-z][a-z0-9-]{0,70}$/u.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(design.id) &&
      Number.isSafeInteger(design.version) && design.version > 0 && typeof design.displayName === 'string' && design.displayName.trim());
    const key = design.id + '@' + design.version;
    assert(!seen.has(key) && Object.hasOwn(recipe.sources, design.source), 'Expected a unique identity and declared product source');
    seen.add(key);
    const source = recipe.sources[design.source], originalEdit = editable.get(design.source);
    const { bytes, original, productNodes, dependencies, originalBounds, pose } = await exportProduct(design, source);
    assert(bytes.equals((await exportProduct(design, source)).bytes), 'Repeated product export changed bytes');
    const url = '/company-assets/showcase-product-v1/' + design.id + '/v' + design.version;
    const asset = { format: 'glb', url: url + '/model.glb', bytes: bytes.length, sha256: hash(bytes) };
    const resource = { id: design.id, version: design.version, displayName: design.displayName, ...contract.resource,
      materialSlots: { product: productNodes }, asset,
      provenance: { license: source.license + ' source with upright presentation fit.', sourceDesign: 'stock-product',
        sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256, generator: script,
        generatorSha256: collection.generatorSha256, functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
        environmentBranch: branch.id, environmentBranchSource: environmentPath, environmentBranchSourceSha256: hash(environmentBytes),
        sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceAuthor: source.author, sourceLicense: source.license,
        sourceArchiveSha256: source.archiveSha256, sourceEntry: source.entry, sourceUrl: source.url,
        dependencies: { geometryValidation: { path: geometryScript, sha256: hash(geometryBytes) },
          editableSourceValidator: { path: editableValidator, sha256: hash(validatorBytes) },
          license: { path: source.licensePath, sha256: source.licenseSha256 }, ...dependencies,
          ...(originalEdit ? { editableSource: originalEdit } : {}) }, tools: [`Three.js ${REVISION}`, 'GLTFLoader', 'pngjs'] } };
    const geometry = await inspectShowcaseProduct(bytes, resource, original);
    const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + url + '/resource.json';
    files.set(modelPath, bytes);
    files.set(resourcePath, json(resource));
    collection.resources.push({ id: design.id, version: design.version, modelPath, resourcePath,
      sha256: asset.sha256, geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
    reports.push({ id: design.id, version: design.version, asset, originalBounds, pose, geometry, repeatByteIdentical: true });
  }
  assert.equal(new Set(reports.map(row => row.geometry.geometrySha256)).size, reports.length, 'Every presented study needs distinct geometry');
  await editableSources(root, recipe);
  files.set(family + '/collection.json', json(collection));
  const output = args.output && path.resolve(args.output);
  if (output) {
    await fs.mkdir(output);
    files.set('report.json', json({ status: 'passed', resources: reports }));
  }
  const additions = [];
  for (const [relative, bytes] of files) {
    const target = output ? path.join(output, relative) : project(relative);
    const current = await fs.readFile(target).catch(error => {
      if (error.code === 'ENOENT' && !args.check) return null;
      throw error;
    });
    if (current === null) additions.push([target, bytes]);
    else assert(current.equals(bytes), `Existing ${relative} differs; choose a new identity or isolated output`);
  }
  for (const [target, bytes] of additions) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
  }
  console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
}

try { await main(); }
catch (error) {
  console.error(JSON.stringify({ code: error.code ?? 'showcase-product-generation-failed', message: error.message }));
  process.exitCode = 1;
}
