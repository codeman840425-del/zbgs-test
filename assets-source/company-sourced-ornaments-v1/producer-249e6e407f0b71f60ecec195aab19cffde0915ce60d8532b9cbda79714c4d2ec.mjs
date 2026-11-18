import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {validatePng} from '../../scripts/company-platform/wall-print-model.mjs';
import {Box3, Matrix4, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import {unzipSync} from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {installNodeImageDecodeShim} from '../../scripts/company-platform/preflight-library-assets.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const requirePrototype = createRequire(new URL('../../prototype/package.json', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const maxArchiveBytes = 64 * 1024 * 1024;
const maxEntryBytes = 32 * 1024 * 1024;
const maxImageBytes = 8 * 1024 * 1024;
const maxInlineImageBytes = 16 * 1024 * 1024;
const maxImageDimension = 4096;
const OUTPUT_MOUNTING = Object.freeze({origin: 'bottom', width: .16, height: .20, depth: .12});
const AXES = {X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1]};
const companyCoordinates = {units: 'metres', up: '+Y', forward: '+Z'};
const boundsTolerance = 1e-6;
const contactTolerance = 1e-5;

function fail(code, message) {
  throw Object.assign(new Error(message), {code});
}

function hasFields(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

const pin = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const label = value => typeof value === 'string' && Boolean(value.trim());
const sourceEntry = value => label(value) && !/[\\:\x00-\x1f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');

function validateRecipe(recipe) {
  if (!hasFields(recipe, ['schema', 'version', 'resource', 'source', 'fit']) || recipe.schema !== 'company-tabletop-ornament-recipe' || recipe.version !== 1)
    fail('invalid-ornament-recipe', 'Expected company-tabletop-ornament-recipe version 1');
  const {source, resource, fit} = recipe;
  if (!hasFields(resource, ['id', 'version', 'displayName']) || typeof resource.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(resource.id) ||
      !Number.isSafeInteger(resource.version) || resource.version < 1 || !label(resource.displayName))
    fail('invalid-ornament-recipe', 'Resource needs a portable ID, positive version and display name');
  if (!hasFields(source, ['path', 'sha256', 'author', 'license', 'url', 'coordinates'], ['archiveEntry', 'modelSha256', 'licenseEntry', 'licenseSha256']) ||
      !sourceEntry(source.path) || !pin(source.sha256) || !label(source.author) || !label(source.license) ||
      typeof source.url !== 'string' || !/^https?:\/\/\S+$/.test(source.url))
    fail('invalid-ornament-source', 'Source requires a project-relative file, SHA-256, author, license and source URL');
  if (source.archiveEntry !== undefined) {
    if (!source.path.toLowerCase().endsWith('.zip') || !sourceEntry(source.archiveEntry) || !source.archiveEntry.toLowerCase().endsWith('.glb') || !pin(source.modelSha256))
      fail('invalid-ornament-source', 'A ZIP source needs the exact GLB entry and its own SHA-256');
    if ((source.licenseEntry !== undefined || source.licenseSha256 !== undefined) && (!sourceEntry(source.licenseEntry) || !pin(source.licenseSha256) || source.licenseEntry === source.archiveEntry))
      fail('invalid-ornament-source', 'An archived license entry needs its own path and SHA-256');
  } else if (!source.path.toLowerCase().endsWith('.glb') || ['modelSha256', 'licenseEntry', 'licenseSha256'].some(field => Object.hasOwn(source, field))) {
    fail('invalid-ornament-source', 'A direct source must be a GLB with a file SHA-256 and license metadata');
  }
  const coordinates = source.coordinates;
  if (!hasFields(coordinates, ['metresPerUnit', 'up', 'forward']) || !Number.isFinite(coordinates.metresPerUnit) || coordinates.metresPerUnit <= 0 ||
      ![coordinates.up, coordinates.forward].every(axis => typeof axis === 'string' && /^[+-][XYZ]$/.test(axis)) || coordinates.up[1] === coordinates.forward[1])
    fail('invalid-ornament-coordinates', 'Source needs a positive metres-per-unit value and perpendicular signed up/forward axes');
  if (!hasFields(fit, ['fill', 'yawQuarterTurns']) || !Number.isFinite(fit.fill) || fit.fill <= 0 || fit.fill > 1 ||
      !Number.isInteger(fit.yawQuarterTurns) || fit.yawQuarterTurns < 0 || fit.yawQuarterTurns > 3)
    fail('invalid-ornament-fit', 'Fit needs a fill fraction in (0, 1] and a yaw quarter turn from 0 to 3');
}

async function sourceBytes(source) {
  const filename = path.join(project, source.path);
  const root = await fs.realpath(project), resolved = await fs.realpath(filename);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    fail('invalid-ornament-source', 'Source must stay within the project');
  const file = await fs.stat(resolved);
  if (!file.isFile() || file.size > (source.archiveEntry ? maxArchiveBytes : maxEntryBytes))
    fail('invalid-ornament-source', 'Source exceeds the offline adapter size limit or is not a regular file');
  const bytes = await fs.readFile(resolved);
  if (digest(bytes) !== source.sha256) fail('ornament-source-digest-mismatch', `Source digest differs: ${source.path}`);
  if (!source.archiveEntry) return bytes;
  const names = new Set([source.archiveEntry, ...(source.licenseEntry ? [source.licenseEntry] : [])]);
  const seen = new Set();
  const entries = unzipSync(bytes, {filter: item => {
    if (!names.has(item.name)) return false;
    if (seen.has(item.name) || item.originalSize > maxEntryBytes)
      fail('invalid-ornament-source', `Duplicate or oversized archive entry: ${item.name}`);
    seen.add(item.name);
    return true;
  }});
  const extracted = name => {
    if (!Object.hasOwn(entries, name)) fail('missing-ornament-source-entry', `Missing archive entry: ${name}`);
    return Buffer.from(entries[name]);
  };
  const model = extracted(source.archiveEntry);
  if (digest(model) !== source.modelSha256) fail('ornament-source-digest-mismatch', `GLB entry digest differs: ${source.archiveEntry}`);
  if (source.licenseEntry && digest(extracted(source.licenseEntry)) !== source.licenseSha256)
    fail('ornament-source-digest-mismatch', `License entry digest differs: ${source.licenseEntry}`);
  return model;
}

function inspectSourceGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a)
    fail('invalid-ornament-glb', 'Expected a complete GLB 2 with its JSON chunk first');
  const jsonLength = bytes.readUInt32LE(12), end = 20 + jsonLength;
  if (jsonLength % 4 || end > bytes.length) fail('invalid-ornament-glb', 'Invalid GLB JSON chunk bounds');
  const json = JSON.parse(bytes.toString('utf8', 20, end));
  if (!json.asset || json.asset.version !== '2.0' || !Array.isArray(json.nodes) || !Array.isArray(json.scenes) ||
      !Array.isArray(json.scenes[json.scene ?? 0]?.nodes) || !json.scenes[json.scene ?? 0].nodes.length)
    fail('invalid-ornament-glb', 'GLB must expose a nonempty default scene');
  if (json.animations?.length || json.skins?.length || json.nodes.some(node => node.skin !== undefined || node.weights || node.extensions?.EXT_mesh_gpu_instancing) ||
      json.meshes?.some(mesh => mesh.weights || mesh.primitives.some(primitive => primitive.targets)))
    fail('unsupported-ornament-geometry', 'Only ordinary static meshes without skins, morph targets or GPU instancing are supported');
  return {json, preservedChunks: bytes.subarray(end)};
}

function normalizeDirections({metresPerUnit, up, forward}, yawQuarterTurns) {
  const axis = field => new Vector3(...AXES[field[1]]).multiplyScalar(field[0] === '-' ? -1 : 1);
  const y = axis(up), z = axis(forward), x = y.clone().cross(z);
  const coordinates = new Matrix4().makeBasis(x, y, z).transpose();
  return new Matrix4().makeRotationY(yawQuarterTurns * Math.PI / 2).multiply(coordinates).scale(new Vector3().setScalar(metresPerUnit));
}

function checkImageSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > maxImageDimension || height > maxImageDimension)
    fail('ornament-data-image-limit', `Inline image dimensions must each be within 1–${maxImageDimension} pixels`);
}

function decodeInlinePng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR')
    fail('invalid-ornament-data-image', 'Inline PNG is missing its signature or IHDR');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  checkImageSize(width, height);
  validatePng(bytes);
  return {width, height};
}

function decodeInlineJpeg(bytes) {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9)
    fail('invalid-ornament-data-image', 'Inline JPEG is missing its SOI or EOI marker');
  const {width, height} = requirePrototype('jpeg-js').decode(bytes, {
    tolerantDecoding: false, useTArray: true, formatAsRGBA: false, maxResolutionInMP: 16.78, maxMemoryUsageInMB: 128,
  });
  checkImageSize(width, height);
  return {width, height};
}

function parseInlineImage(uri) {
  const match = /^data:(image\/(?:png|jpeg));base64,/i.exec(uri);
  if (!match) fail('invalid-ornament-data-image', 'Inline image must be a base64 PNG or JPEG data URI');
  const mimeType = match[1].toLowerCase(), payload = uri.slice(match[0].length);
  if (payload.length > 4 * Math.ceil(maxImageBytes / 3)) fail('ornament-data-image-limit', 'Inline image exceeds 8 MiB');
  const unpadded = payload.replace(/={1,2}$/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || unpadded.length % 4 === 1 ||
      (payload.length !== unpadded.length && payload.length % 4 !== 0))
    fail('invalid-ornament-data-image', 'Inline image has invalid base64');
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length > maxImageBytes) fail('ornament-data-image-limit', 'Inline image exceeds 8 MiB');
  if (bytes.toString('base64').replace(/=+$/, '') !== unpadded)
    fail('invalid-ornament-data-image', 'Inline image has invalid base64 trailing bits');
  return {mimeType, bytes};
}

function embedSourceImages(source) {
  const {json, preservedChunks} = source;
  const inlineImages = (json.images || []).map((image, index) => {
    if (image.uri === undefined) return null;
    if (typeof image.uri !== 'string' || !/^data:/i.test(image.uri))
      fail('external-asset-uri', `External image URI is forbidden at images[${index}]`);
    if (image.bufferView !== undefined) fail('invalid-ornament-data-image', `images[${index}] must choose one embedding method`);
    return {image, index, ...parseInlineImage(image.uri)};
  }).filter(Boolean);
  if (!inlineImages.length) return [];
  if (inlineImages.reduce((sum, image) => sum + image.bytes.length, 0) > maxInlineImageBytes)
    fail('ornament-data-image-limit', 'Inline images exceed the combined 16 MiB limit');
  const oldLength = preservedChunks.length >= 8 ? preservedChunks.readUInt32LE() : 0;
  if (!oldLength || oldLength % 4 || 8 + oldLength > preservedChunks.length || preservedChunks.readUInt32LE(4) !== 0x004e4942 ||
      json.buffers?.length !== 1 || json.buffers[0].uri !== undefined || !Number.isInteger(json.buffers[0].byteLength) ||
      oldLength - json.buffers[0].byteLength < 0 || oldLength - json.buffers[0].byteLength > 3 || !Array.isArray(json.bufferViews))
    fail('invalid-ornament-glb', 'Embedding data images requires one valid original BIN buffer');

  let byteOffset = oldLength;
  const parts = [preservedChunks.subarray(8, 8 + oldLength)];
  const converted = inlineImages.map(({image, index, mimeType, bytes}) => {
    if (image.mimeType !== undefined && (typeof image.mimeType !== 'string' || image.mimeType.toLowerCase() !== mimeType))
      fail('invalid-ornament-data-image', `MIME type disagrees with the data URI at images[${index}]`);
    let dimensions;
    try {dimensions = mimeType === 'image/png' ? decodeInlinePng(bytes) : decodeInlineJpeg(bytes);}
    catch (cause) {
      fail(cause.code === 'ornament-data-image-limit' || /(?:maxResolutionInMP|maxMemoryUsageInMB)/.test(cause.message) ?
        'ornament-data-image-limit' : 'invalid-ornament-data-image', `images[${index}]: ${cause.message}`);
    }
    const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
    image.bufferView = json.bufferViews.push({buffer: 0, byteOffset, byteLength: bytes.length}) - 1;
    image.mimeType = mimeType;
    delete image.uri;
    parts.push(bytes, padding);
    byteOffset += bytes.length + padding.length;
    return {index, mimeType, bytes: bytes.length, sha256: digest(bytes), ...dimensions};
  });
  json.buffers[0].byteLength = byteOffset;
  const header = Buffer.alloc(8);
  header.writeUInt32LE(byteOffset);
  header.writeUInt32LE(0x004e4942, 4);
  source.preservedChunks = Buffer.concat([header, ...parts, preservedChunks.subarray(8 + oldLength)]);
  return converted;
}

function packGlb(source) {
  const {json, preservedChunks} = source;
  const body = Buffer.from(JSON.stringify(json));
  const padding = Buffer.alloc((4 - body.length % 4) % 4, 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + body.length + padding.length + preservedChunks.length, 8);
  header.writeUInt32LE(body.length + padding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, body, padding, preservedChunks]);
}

function glbWithRootTransform(source, matrix) {
  const {json} = source, scene = json.scenes[json.scene ?? 0];
  scene.nodes = [json.nodes.push({matrix: matrix.toArray(), children: scene.nodes}) - 1];
  return packGlb(source);
}

async function loadedScene(bytes, resource, read) {
  installNodeImageDecodeShim();
  const library = createCompanyAssetLibrary({fetchImpl: async () => ({ok: true,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)})});
  const entry = {...resource, coordinates: companyCoordinates, asset: {format: 'glb', url: '/company-assets/in-memory-tabletop-ornament.glb', bytes: bytes.length, sha256: digest(bytes)}};
  const owned = new Set();
  try {
    await library.preload([entry]);
    const {root} = library.instantiate(entry);
    root.traverse(node => {
      if (node.geometry) owned.add(node.geometry);
      for (const material of node.material ? [node.material].flat() : []) {
        owned.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) owned.add(value);
      }
    });
    return read(root);
  } finally {
    for (const item of owned) item.dispose();
    library.dispose();
  }
}

function measure(scene, axes = new Matrix4(), checkContact = false) {
  scene.updateMatrixWorld(true);
  const meshes = [], materials = new Set();
  scene.traverseVisible(node => {
    if (node.isLine || node.isPoints || node.isInstancedMesh)
      fail('unsupported-ornament-geometry', 'Only actual static triangle meshes are supported');
    if (!node.isMesh) return;
    const position = node.geometry.getAttribute('position'), index = node.geometry.getIndex();
    const count = index?.count ?? position.count;
    if (count < 3 || count % 3) fail('invalid-ornament-mesh', 'Expected a complete set of triangles');
    meshes.push({position, index, count, matrix: new Matrix4().multiplyMatrices(axes, node.matrixWorld)});
    for (const material of [node.material].flat()) materials.add(material);
  });
  const bounds = new Box3();
  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  function forTriangles(operation) {
    for (const mesh of meshes) for (let offset = 0; offset < mesh.count; offset += 3) {
      for (let i = 0; i < 3; i++) {
        const index = mesh.index?.getX(offset + i) ?? offset + i;
        if (index < 0 || index >= mesh.position.count) fail('invalid-ornament-mesh', 'Triangle index is outside the position accessor');
        vertices[i].fromBufferAttribute(mesh.position, index).applyMatrix4(mesh.matrix);
      }
      operation(...vertices);
    }
  }
  forTriangles((a, b, c) => bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c));
  const size = bounds.getSize(new Vector3()).toArray();
  if (!meshes.length || size.some(value => !Number.isFinite(value) || value <= 0))
    fail('invalid-ornament-mesh', 'Source needs finite solid geometry with a three-dimensional envelope');
  let bottomContactAreaSquareMetres = 0, bottomContactTriangles = 0;
  if (checkContact) forTriangles((a, b, c) => {
    if (Math.max(Math.abs(a.y), Math.abs(b.y), Math.abs(c.y)) > contactTolerance) return;
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    if (area <= 1e-10) return;
    bottomContactAreaSquareMetres += area;
    bottomContactTriangles++;
  });
  return {bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, size, meshCount: meshes.length,
    triangleCount: meshes.reduce((sum, mesh) => sum + mesh.count / 3, 0), materialCount: materials.size,
    ...(checkContact ? {bottomContactAreaSquareMetres, bottomContactTriangles} : {})};
}

/** Adapt one pinned GLB using a rigid rotation, uniform scale and bottom-centre translation. */
export async function buildTabletopOrnament(recipePath) {
  const recipeBytes = await fs.readFile(recipePath);
  const recipe = JSON.parse(recipeBytes);
  validateRecipe(recipe);
  const original = await sourceBytes(recipe.source);
  const source = inspectSourceGlb(original);
  const convertedDataImages = embedSourceImages(source);
  const axes = normalizeDirections(recipe.source.coordinates, recipe.fit.yawQuarterTurns);
  const before = await loadedScene(convertedDataImages.length ? packGlb(source) : original, recipe.resource, scene => measure(scene, axes));
  const maximum = [OUTPUT_MOUNTING.width, OUTPUT_MOUNTING.height, OUTPUT_MOUNTING.depth];
  const fitScale = recipe.fit.fill * Math.min(...before.size.map((size, i) => maximum[i] / size));
  const {min, max} = before.bounds;
  const origin = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2].map(value => value * fitScale);
  const transform = axes.clone().scale(new Vector3().setScalar(fitScale)).setPosition(new Vector3(...origin));
  if (!transform.elements.every(Number.isFinite)) fail('invalid-ornament-fit', 'Uniform scale or transformed origin is not finite');
  const bytes = glbWithRootTransform(source, transform);
  const after = await loadedScene(bytes, {...recipe.resource, mount: 'support-surface', mountRole: 'tabletop-ornament', mounting: OUTPUT_MOUNTING,
    footprint: {center: [0, 0], halfSize: [.08, .06], blocking: false}}, scene => measure(scene, undefined, true));
  if (after.triangleCount !== before.triangleCount || after.meshCount !== before.meshCount || after.materialCount !== before.materialCount)
    fail('ornament-source-changed', 'Adaptation changed the mesh, triangle or material count');
  if (after.size.some((size, i) => size > maximum[i] + boundsTolerance) || Math.abs(after.bounds.min[1]) > boundsTolerance ||
      [0, 2].some(axis => Math.abs(after.bounds.min[axis] + after.bounds.max[axis]) > boundsTolerance))
    fail('invalid-ornament-fit', 'Actual triangles do not satisfy the bottom-centred tabletop ornament envelope');
  if (after.bottomContactAreaSquareMetres < 1e-8)
    fail('ornament-no-floor-contact', 'Actual triangles provide no positive-area horizontal contact at the installation plane');
  const report = {recipeSha256: digest(recipeBytes), sourceFileSha256: recipe.source.sha256, sourceGlbSha256: digest(original),
    sha256: digest(bytes), bytes: bytes.length, mounting: OUTPUT_MOUNTING, sourceBounds: before.bounds, sourceSize: before.size,
    uniformScale: fitScale * recipe.source.coordinates.metresPerUnit, translation: origin, ...after,
    embeddedImages: source.json.images?.length ?? 0, preservedBinaryChunks: convertedDataImages.length === 0,
    ...(convertedDataImages.length ? {convertedDataImages, originalBinBytesPreserved: true} : {})};
  return {bytes, recipe, report};
}

async function existing(output, bytes) {
  try {
    const stat = await fs.lstat(output);
    if (stat.isFile() && !stat.isSymbolicLink() && bytes.equals(await fs.readFile(output))) return 'unchanged';
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  fail('ornament-output-conflict', `Existing output differs at ${output}. Use --output with a new path.`);
}

async function publish(output, bytes) {
  const current = await existing(output, bytes);
  if (current) return current;
  const directory = path.dirname(output);
  await fs.mkdir(directory, {recursive: true});
  const temporary = path.join(directory, `.tabletop-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, 'wx');
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {await handle.close();}
    try {await fs.link(temporary, output);}
    catch (error) {
      if (error.code === 'EEXIST') {
        const concurrent = await existing(output, bytes);
        if (concurrent) return concurrent;
      }
      throw error;
    }
    return 'created';
  } finally {await fs.rm(temporary, {force: true});}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const {values} = parseArgs({options: {recipe: {type: 'string'}, output: {type: 'string'}, check: {type: 'boolean'}}});
    if (!values.recipe || !values.output) fail('ornament-usage', 'Use --recipe RECIPE_JSON --output GLB [--check]');
    const {bytes, recipe, report} = await buildTabletopOrnament(values.recipe);
    const output = path.resolve(values.output);
    const publication = values.check ? await existing(output, bytes) : await publish(output, bytes);
    if (!publication) fail('ornament-output-missing', `No produced asset at ${output}`);
    console.log(JSON.stringify({status: 'passed', publication: values.check ? 'checked' : publication, output, resource: recipe.resource, ...report}, null, 2));
  } catch (error) {
    console.error(JSON.stringify({status: 'failed', code: error.code || 'ornament-production-failed', message: error.message}));
    process.exitCode = 1;
  }
}
