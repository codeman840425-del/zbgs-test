import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-baseboard-v1';
const defaultParameters = family + '/parameters.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generator = 'scripts/company-platform/build-baseboards.mjs';
const assetDirectory = '/company-assets/baseboard-v1';
const meshName = 'finish-surface';
const sampleLength = 1;
const epsilon = 1e-12;
const patterns = new Set(['paint', 'mineral', 'wood-grain', 'stone-vein']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isInteger(value) && within(value, min, max);
const cross = ([ax, ay], [bx, by], [cx, cy]) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const signedArea = points => points.reduce((sum, [x, y], i) => {
  const [u, v] = points[(i + 1) % points.length];
  return sum + x * v - y * u;
}, 0) / 2;

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

function fail(code, location, message) {
  throw Object.assign(new Error(`${location}: ${message}`), { code, path: location });
}

function projectPath(relative) {
  if (typeof relative !== 'string' || /[\\:]/.test(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..'))
    fail('invalid-production-path', relative, 'Expected a project-relative path');
  return path.join(root, relative);
}
const read = relative => fs.readFile(projectPath(relative));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

const onSegment = (a, b, point) => Math.abs(cross(a, b, point)) <= epsilon &&
  point.every((value, axis) => value >= Math.min(a[axis], b[axis]) - epsilon && value <= Math.max(a[axis], b[axis]) + epsilon);
function intersects(a, b, c, d) {
  const sign = value => Math.abs(value) <= epsilon ? 0 : Math.sign(value);
  const [abC, abD, cdA, cdB] = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)].map(sign);
  return abC * abD < 0 && cdA * cdB < 0 || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function validateProfile(profile, { depth, height }, location) {
  const invalid = message => fail('invalid-baseboard-profile', location, message);
  if (!Array.isArray(profile) || profile.length < 3 ||
      !profile.every(point => Array.isArray(point) && point.length === 2 &&
        within(point[0], 0, depth) && within(point[1], 0, height)))
    invalid(`Expected at least three points within depth 0..${depth} and height 0..${height} metres`);
  if (new Set(profile.map(point => point.join(','))).size !== profile.length)
    invalid('Vertices must be unique, including the first and last');
  const edges = profile.map((point, index) => [point, profile[(index + 1) % profile.length]]);
  for (const axis of [0, 1]) {
    const limit = [depth, height][axis];
    if (!profile.some(point => point[axis] === limit) || !edges.some(([a, b]) => a[axis] === 0 && b[axis] === 0))
      invalid('Must attain the fixed height and depth and provide nonzero wall and floor edges');
  }
  for (const [i, [a, b]] of edges.entries()) {
    const c = profile[(i + 2) % profile.length];
    if (Math.abs(cross(a, b, c)) <= epsilon && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0)
      invalid('Adjacent edges cannot backtrack');
    for (let j = i + 2; j < edges.length - (i === 0 ? 1 : 0); j++) {
      if (intersects(a, b, ...edges[j])) invalid(`Nonadjacent edges ${i} and ${j} cross or touch`);
    }
  }
  if (Math.abs(signedArea(profile)) < epsilon) invalid('Cross-section must have positive area');
}

function validateDesign(design, dimensions) {
  const { id, version, displayName, tileMeters, profile, material } = design ?? {};
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,70}$/.test(id) || !Number.isSafeInteger(version) || version < 1 ||
      typeof displayName !== 'string' || !displayName.trim())
    fail('invalid-baseboard-design', id ?? 'designs', 'Expected portable ID, positive integer version and displayName');
  if (!Array.isArray(tileMeters) || tileMeters.length !== 2 || !tileMeters.every(value => within(value, .1, 4)))
    fail('invalid-baseboard-tile', id, 'tileMeters uses two values from 0.1 to 4 metres');
  if (!patterns.has(material?.pattern) || ![material.base, material.accent].every(color => /^#[0-9a-f]{6}$/i.test(color)) ||
      !within(material.roughness, 0, 1) || !within(material.contrast, 0, 1) || !integer(material.seed, 0, 65535))
    fail('invalid-baseboard-material', id, 'Expected a defined pattern, two hex colors, contrast/roughness in 0..1 and an integer seed');
  validateProfile(profile, dimensions, id + '.profile');
}

function channelValues(color) {
  return [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16));
}

// The frequencies wrap at a whole tile. Wood grain follows the long axis.
function textureTone(pattern, u, v, seed) {
  const wave = (x, y, phase = 0) => Math.sin(2 * Math.PI * (x * u + y * v) + phase + seed * .73);
  const grain = wave(23, 13, .6) * wave(9, -19, .2);
  switch (pattern) {
    case 'paint': return .24 + .11 * grain + .10 * wave(7, 11);
    case 'mineral': return .22 + .14 * wave(11, 17) * wave(14, -6) + .13 * grain + .05 * wave(3, 4);
    case 'wood-grain': return .16 + .46 * ((1 + wave(0, 19, .8 * wave(2, 3) + .3 * wave(1, -5))) / 2) ** 3 +
      .16 * ((1 + wave(0, 8, 1.3 * wave(1, -2))) / 2) ** 5 + .10 * grain;
    case 'stone-vein': return .14 + .59 * ((1 + wave(2, 3, .8 * wave(1, 1) + .35 * wave(-4, 6))) / 2) ** 12 +
      .13 * wave(-7, 9) ** 2 + .09 * grain;
    default: throw new Error('Unsupported texture pattern');
  }
}

function makeTexture(material) {
  const width = 256, height = 128;
  const image = new PNG({ width, height });
  const base = channelValues(material.base), accent = channelValues(material.accent);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tone = textureTone(material.pattern, x / width, y / height, material.seed);
    const t = THREE.MathUtils.clamp(tone * material.contrast, 0, 1), start = (y * width + x) * 4;
    for (let i = 0; i < 3; i++) image.data[start + i] = Math.round(base[i] + (accent[i] - base[i]) * t);
    image.data[start + 3] = 255;
  }
  return PNG.sync.write(image);
}

function extrudedProfile(rawProfile, tile) {
  const profile = signedArea(rawProfile) > 0 ? rawProfile : [...rawProfile].reverse();
  const halfLength = sampleLength / 2;
  const positions = [], uvs = [], indices = [];
  const vertex = (x, [depth, height], u, v) => {
    positions.push(x, height, depth);
    uvs.push(u, v);
  };
  let distance = 0;
  for (const [index, a] of profile.entries()) {
    const b = profile[(index + 1) % profile.length];
    const next = distance + Math.hypot(a[0] - b[0], a[1] - b[1]);
    const start = positions.length / 3;
    vertex(-halfLength, a, 0, distance / tile[1]);
    vertex(halfLength, a, sampleLength / tile[0], distance / tile[1]);
    vertex(halfLength, b, sampleLength / tile[0], next / tile[1]);
    vertex(-halfLength, b, 0, next / tile[1]);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    distance = next;
  }
  const triangles = THREE.ShapeUtils.triangulateShape(profile.map(point => new THREE.Vector2(...point)), []);
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (const [depth, height] of profile) vertex(side * halfLength, [depth, height], depth / tile[0], height / tile[1]);
    for (const [a, b, c] of triangles) {
      const order = Math.sign(cross(profile[a], profile[b], profile[c])) === -side ? [a, b, c] : [a, c, b];
      indices.push(...order.map(index => start + index));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function pad(bytes, byte = 0) {
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, byte)]);
}

// Three exports the geometry and PBR material. Append the exact PNG using the
// same embedded bufferView contract as other company finishes.
function embedTexture(model, image) {
  const jsonEnd = 20 + model.readUInt32LE(12);
  const document = JSON.parse(model.subarray(20, jsonEnd));
  const bin = model.subarray(jsonEnd + 8);
  if (document.buffers.length !== 1 || document.materials.length !== 1 || document.images)
    fail('invalid-baseboard-gltf', meshName, 'Expected one geometry buffer and one untextured material from Three');
  const imageView = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: image.length });
  document.images = [{ name: 'baseboard-albedo', bufferView: imageView, mimeType: 'image/png' }];
  document.samplers = [{ wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987 }];
  document.textures = [{ sampler: 0, source: 0 }];
  document.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  document.buffers[0].byteLength = bin.length + image.length;
  const json = pad(Buffer.from(JSON.stringify(document)), 0x20);
  const binary = Buffer.concat([bin, pad(image)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  const chunk = (tag, bytes) => {
    const prefix = Buffer.alloc(8);
    prefix.writeUInt32LE(bytes.length, 0);
    prefix.writeUInt32LE(tag, 4);
    return Buffer.concat([prefix, bytes]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, binary)]);
}

async function makeModel(design, image) {
  const geometry = extrudedProfile(design.profile, design.tileMeters);
  const material = new THREE.MeshStandardMaterial({ name: meshName, roughness: design.material.roughness, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = meshName;
  try {
    const untextured = Buffer.from(await new GLTFExporter().parseAsync(mesh, { binary: true }));
    return embedTexture(untextured, image);
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

async function writeFiles(files, { check, output }) {
  if (output) await fs.mkdir(output);
  const missing = [];
  for (const [relative, bytes] of files) {
    const file = output ? path.join(output, relative) : projectPath(relative);
    const existing = await fs.readFile(file).catch(error => {
      if (error.code === 'ENOENT' && !check) return null;
      throw error;
    });
    if (existing === null) missing.push([file, bytes]);
    else if (!existing.equals(bytes)) fail('baseboard-version-conflict', file, 'Bytes differ from this version; use an independent output directory');
  }
  for (const [file, bytes] of missing) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes, { flag: 'wx' });
  }
}

async function main(argv) {
  const { values: args } = parseArgs({ args: argv, options: {
    check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
    parameters: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (args.help) {
    console.log('node scripts/company-platform/build-baseboards.mjs --check | --write | --output NEW_DIR [--parameters PROJECT_RELATIVE_JSON]');
    return;
  }
  if ([args.check, args.write, Boolean(args.output)].filter(Boolean).length !== 1 || args.parameters && !args.output)
    fail('invalid-production-arguments', 'arguments', 'Use exactly one mode; alternate parameters require --output');
  const parametersPath = args.parameters ?? defaultParameters;
  const [parametersBytes, environment, source] = await Promise.all([parametersPath, branchPath, generator].map(read));
  const parameters = JSON.parse(parametersBytes);
  const branch = JSON.parse(environment).groups.flatMap(group => group.branches).find(item => item.id === 'baseboard-and-edge');
  const dimensions = branch.fixedFunctionAndInstall.dimensionsMeters;
  if (dimensions.depth !== .02 || dimensions.height !== .12 || dimensions.width !== 'room-perimeter')
    fail('baseboard-branch-changed', branchPath, 'This collection must use the fixed 20mm by 120mm baseboard specification');
  if (parameters.schema !== 'company-baseboard-collection' || parameters.version !== 1 || !Array.isArray(parameters.designs) ||
      !parameters.designs.length || (!args.parameters && parameters.designs.length !== 4))
    fail('invalid-baseboard-parameters', parametersPath, 'Expected company-baseboard-collection version 1 with a nonempty designs list');
  const collection = { id: 'company-baseboard-v1', schemaVersion: 1, generator, generatorSha256: hash(source),
    sourceParameters: parametersPath, sourceParametersSha256: hash(parametersBytes), resources: [] };
  const files = new Map();
  const identities = new Set(), profiles = new Set();
  for (const design of parameters.designs) {
    validateDesign(design, dimensions);
    const { id, version, profile, tileMeters } = design, identity = `${id}@${version}`;
    if (identities.has(identity)) fail('duplicate-baseboard-identity', identity, 'Resource version must be unique in a recipe');
    identities.add(identity);
    profiles.add(JSON.stringify(profile));
    const image = makeTexture(design.material), bytes = await makeModel(design, image);
    if (!bytes.equals(await makeModel(design, makeTexture(design.material))))
      fail('non-deterministic-baseboard-export', identity, 'Re-export produced different bytes');
    const destination = `${assetDirectory}/${id}/v${version}`;
    const relative = 'prototype/public' + destination;
    const asset = { format: 'glb', url: destination + '/model.glb', sha256: hash(bytes), bytes: bytes.length };
    const resource = { id, version, kind: 'surface-finish', mountRole: 'surface-finish', displayName: design.displayName,
      coordinates: { units: 'metres', up: '+Y', forward: '+Z' }, materialSlots: { finish: [meshName] }, stateDefaults: {},
      finish: { allowedSurfaces: ['baseboard'], materialNode: meshName, tileMeters, profile },
      provenance: { license: 'Project-authored procedural material and solid profile geometry.',
        sourceParameters: parametersPath, sourceParametersSha256: collection.sourceParametersSha256,
        environmentBranchSource: branchPath, environmentBranchSourceSha256: hash(environment), environmentBranch: branch.id,
        generator, generatorSha256: collection.generatorSha256, sourceDesign: design.material.pattern,
        tools: [`Three.js ${THREE.REVISION} GLTFExporter`, 'pngjs 7.0.0'] },
      asset };
    const modelPath = relative + '/model.glb', resourcePath = relative + '/resource.json', texturePath = relative + '/texture.png';
    files.set(modelPath, bytes);
    files.set(resourcePath, jsonBytes(resource));
    files.set(texturePath, image);
    collection.resources.push({ id, version, modelPath, resourcePath, texturePath, sha256: asset.sha256, textureSha256: hash(image),
      crossSectionAreaSquareMetres: Math.abs(signedArea(profile)), repeatedExportByteIdentical: true });
  }
  if (!args.parameters && profiles.size !== 4) fail('duplicate-baseboard-profile', parametersPath, 'Default assets must have four distinct profiles');
  files.set(family + '/collection.json', jsonBytes(collection));
  await writeFiles(files, { check: args.check, output: args.output && path.resolve(args.output) });
  console.log(JSON.stringify({ status: 'passed', mode: args.check ? 'check' : args.output ? 'preview' : 'write', resources: collection.resources }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ status: 'failed', code: error.code || 'baseboard-build-failed', path: error.path, message: error.message }));
  process.exitCode = 1;
});
