import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { RoundedBoxGeometry } from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';
import { inspectPhoneAsset } from './test-phone-static-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-phone-static-v1';
const defaultParameters = family + '/parameters.json';
const contractPath = family + '/contract.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-phone-static.mjs';
const inspectionPath = 'scripts/company-platform/test-phone-static-assets.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const float = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const positiveTriplet = size => Array.isArray(size) && size.length === 3 && size.every(value => float(value, .001, .2));
const colorToken = color => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
const stockArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

function projectPath(relative) {
  assert(typeof relative === 'string' && !/[\\:]/.test(relative) &&
    relative.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected a project-relative source path');
  return path.join(root, relative);
}
const read = relative => fs.readFile(projectPath(relative));

async function readSource(source) {
  const [bytes, license, manifest] = await Promise.all([source.path, source.licensePath, source.manifestPath].map(read));
  assert.equal(hash(bytes), source.sha256, 'Source model hash differs');
  assert.equal(hash(license), source.licenseSha256, 'Source license hash differs');
  assert.equal(hash(manifest), source.manifestSha256, 'Source manifest hash differs');
  assert.equal(JSON.parse(manifest).extras.license, 'CC0-1.0');
  const header = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert(header.buffers.every(buffer => buffer.uri === undefined) && header.images.every(image => image.uri === undefined));
  installNodeImageDecodeShim();
  const { scene } = await new GLTFLoader().parseAsync(stockArrayBuffer(bytes), '');
  scene.updateMatrixWorld(true);
  return [source.bodyNode, source.screenNode].map(name => {
    const mesh = scene.getObjectByName(name);
    assert(mesh?.isMesh, 'Original geometry is missing ' + name);
    const geometry = mesh.geometry.getIndex() ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    return geometry.applyMatrix4(mesh.matrixWorld);
  });
}

function rounded(w, h, d, corner) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(corner, w * .455, h * .455, d * .455));
}

function panel(width, height, radius) {
  const x = width / 2, y = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y); shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius); shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y); shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius); shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return new THREE.ExtrudeGeometry(shape, { depth: .0012, bevelEnabled: false, curveSegments: 4 });
}

function screenUV(geometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox, points = geometry.getAttribute('position'), uv = [];
  for (let i = 0; i < points.count; i++) {
    uv.push((points.getX(i) - min.x) / (max.x - min.x), (max.y - points.getY(i)) / (max.y - min.y));
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

function mountGeometry(part) {
  if (part.kind === 'box') {
    assert(positiveTriplet(part.size) && part.at.length === 3 && part.at.every(Number.isFinite), 'Mount part requires finite box dimensions');
    return rounded(...part.size, .004).translate(...part.at);
  }
  assert(part.kind === 'wedge' && float(part.width, .012, .16) && part.profile.length >= 3 &&
    part.profile.every(point => point.length === 2 && point.every(Number.isFinite)), 'Mount wedge needs a real section and positive width');
  const shape = new THREE.Shape(part.profile.map(point => new THREE.Vector2(...point)));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: part.width, bevelEnabled: false })
    .rotateY(-Math.PI / 2).translate(part.width / 2, 0, 0);
}

function stockModel(donor, body, add) {
  assert(float(body.bottom, .002, .033) && float(body.scale, .85, 1.08) && body.pitchDegrees === 90, 'Stock model fit differs from its approved axes');
  const geometry = donor.map(shape => shape.clone().rotateX(THREE.MathUtils.degToRad(body.pitchDegrees))
    .scale(body.scale, body.scale, body.scale));
  geometry[0].computeBoundingBox();
  const bounds = geometry[0].boundingBox, centre = bounds.getCenter(new THREE.Vector3());
  const translation = [-centre.x, body.bottom - bounds.min.y, -centre.z];
  for (const shape of geometry) shape.translate(...translation);
  add('phone-body-stock', geometry[0], 'body');
  add('phone-screen', screenUV(geometry[1]), 'screen');
}

function authoredModel({ body, orientation }, add) {
  assert(positiveTriplet(body.size) && float(body.bottom, .002, .036), 'Expected finite body size and mounting offset');
  const [width, height, depth] = body.size;
  const middle = body.bottom + height / 2, front = depth / 2;
  assert(float(body.corner, .003, .013) && float(body.bezelX, .003, .016) && float(body.bezelY, .003, .016));
  add('phone-body-authored', rounded(...body.size, body.corner).translate(0, middle, 0), 'body');
  const displayWidth = width - 2 * body.bezelX, displayHeight = height - 2 * body.bezelY;
  add('phone-screen', screenUV(panel(displayWidth, displayHeight, Math.min(.004, body.corner))), 'screen',
    [0, middle, front - .0003]);
  const side = orientation === 'landscape';
  // Port, earpiece and lenses are small solids outside the active addressable screen.
  add('phone-speaker', rounded(side ? .0018 : .017, side ? .014 : .0015, .0012, .0006)
    .translate(side ? width / 2 - body.bezelX / 2 : 0, side ? middle : middle + height / 2 - body.bezelY / 2, front), 'detail');
  add('phone-camera-island', rounded(side ? .025 : .021, .025, .0034, .002)
    .translate(-width / 2 + .019, middle + height / 2 - .019, -front), 'detail');
  for (const [i, offset] of [-.0048, .0048].entries()) {
    add('phone-lens-' + (i + 1), new THREE.CylinderGeometry(.004, .004, .0014, 12).rotateX(Math.PI / 2)
      .translate(-width / 2 + .019, middle + height / 2 - .019 + offset, -front - .002), 'grip');
  }
  add('phone-side-key', rounded(side ? .031 : .002, side ? .002 : .024, .005, .0008)
    .translate(side ? -.017 : width / 2, side ? middle + height / 2 : middle + .029, -.001), 'detail');
}

// A small brand-free monitor illustration. It shows a framed scene and audio
// levels and is driven by the same material as the actual screen surface.
function makeScreen(orientation) {
  const landscape = orientation === 'landscape';
  const width = landscape ? 160 : 80, height = landscape ? 80 : 160;
  const png = new PNG({ width, height });
  const clear = [13, 25, 33], card = [30, 50, 60], mint = [128, 203, 169], red = [220, 96, 83], sand = [223, 179, 121];
  const rectangle = (x0, y0, x1, y1, color) => {
    for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++)
      for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
        const index = 4 * (y * width + x);
        png.data[index] = color[0]; png.data[index + 1] = color[1];
        png.data[index + 2] = color[2]; png.data[index + 3] = 255;
      }
  };
  rectangle(0, 0, 1, 1, clear);
  rectangle(.08, .07, .11, .096, red);
  rectangle(.14, .074, .43, .092, [145, 184, 184]);
  rectangle(.77, .075, .9, .092, mint);
  rectangle(.07, .15, .93, .67, card);
  rectangle(.085, .17, .915, .63, [79, 105, 115]);
  rectangle(.085, .47, .915, .63, [74, 79, 78]);
  rectangle(.58, .21, .85, .47, [113, 163, 155]);
  rectangle(.604, .235, .824, .445, [126, 171, 167]);
  rectangle(.24, .45, .64, .508, sand);
  rectangle(.32, .31, .57, .466, [27, 46, 53]);
  rectangle(.337, .328, .553, .434, mint);
  rectangle(.297, .51, .325, .591, [58, 61, 54]);
  rectangle(.556, .51, .586, .591, [58, 61, 54]);
  for (const [i, fraction] of [.42, .67, .54, .83, .69, .36, .50, .31, .58, .73, .57].entries()) {
    const x = .09 + .073 * i;
    rectangle(x, .85 - .12 * fraction, x + .041, .85, i === 3 ? sand : mint);
  }
  rectangle(.09, .908, .29, .926, [135, 169, 175]);
  rectangle(.64, .904, .89, .932, [63, 135, 134]);
  return PNG.sync.write(png);
}

const pad = (part, value = 0) => Buffer.concat([part, Buffer.alloc((4 - part.length % 4) % 4, value)]);
function embedScreen(model, png) {
  const jsonEnd = 20 + model.readUInt32LE(12);
  const gltf = JSON.parse(model.subarray(20, jsonEnd));
  const binary = model.subarray(jsonEnd + 8);
  const material = gltf.materials.find(value => value.name === 'phone-screen-material');
  assert(material && !gltf.images);
  const view = gltf.bufferViews.push({ buffer: 0, byteOffset: binary.length, byteLength: png.length }) - 1;
  gltf.images = [{ name: 'monitor-static', bufferView: view, mimeType: 'image/png' }];
  gltf.samplers = [{ wrapS: 33071, wrapT: 33071, magFilter: 9729, minFilter: 9987 }];
  gltf.textures = [{ sampler: 0, source: 0 }];
  material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
  material.emissiveTexture = { index: 0 };
  gltf.buffers[0].byteLength = binary.length + png.length;
  const chunks = [pad(Buffer.from(JSON.stringify(gltf)), 32), Buffer.concat([binary, pad(png)])];
  const header = Buffer.alloc(12);
  [0x46546c67, 2, 28 + chunks[0].length + chunks[1].length].forEach((value, index) => header.writeUInt32LE(value, index * 4));
  return Buffer.concat([header, ...chunks.flatMap((bytes, i) => {
    const descriptor = Buffer.alloc(8);
    descriptor.writeUInt32LE(bytes.length, 0); descriptor.writeUInt32LE(i ? 0x004e4942 : 0x4e4f534a, 4);
    return [descriptor, bytes];
  })]);
}

async function buildModel(design, display, donor) {
  assert(['portrait', 'landscape'].includes(design.orientation) && Array.isArray(design.support) && design.support.length);
  assert(['body', 'detail', 'support', 'grip'].every(slot => colorToken(design.finishes[slot])));
  const group = new THREE.Group();
  group.name = design.id;
  const slots = { body: [], screen: [], support: [] };
  const finishes = new Map(Object.entries(design.finishes).map(([name, color]) => [name,
    new THREE.MeshStandardMaterial({ name, color, metalness: name === 'body' ? .22 : .07, roughness: name === 'grip' ? .82 : .58 })]));
  const screen = display.screen;
  finishes.set('screen', new THREE.MeshStandardMaterial({ name: 'phone-screen-material', color: screen.onColor, roughness: .50,
    emissive: screen.emissive, emissiveIntensity: screen.onIntensity, metalness: .02 }));
  function add(name, geometry, finish, position = [0, 0, 0], slot = finish === 'screen' ? 'screen' : 'body') {
    assert(finishes.has(finish) && slots[slot] && !group.getObjectByName(name));
    const mesh = new THREE.Mesh(geometry, finishes.get(finish));
    mesh.name = name; mesh.position.fromArray(position);
    group.add(mesh); slots[slot].push(name);
  }
  try {
    if (donor) stockModel(donor, design.body, add);
    else authoredModel(design, add);
    for (const part of design.support) {
      assert(/^phone-[a-z0-9-]+$/.test(part.name));
      add(part.name, mountGeometry(part), part.finish, undefined, 'support');
    }
    const copyright = donor ? 'Body and display glass from Grab3D smartphone (CC0-1.0); adapted for this project.' : 'Project-authored desk phone.';
    const geometry = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true, copyright }));
    return { bytes: embedScreen(geometry, makeScreen(design.orientation)), slots };
  } finally {
    group.traverse(object => object.geometry?.dispose());
    for (const item of finishes.values()) item.dispose();
  }
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' },
  output: { type: 'string' }, parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-phone-static.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one production mode');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const input = args.parameters ?? defaultParameters;
const [parameterBytes, contractBytes, branchBytes, generatorBytes, inspectionBytes] = await Promise.all(
  [input, contractPath, branchPath, generatorPath, inspectionPath].map(read),
);
const parameters = JSON.parse(parameterBytes), contract = JSON.parse(contractBytes);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(entry => entry.id === contract.productionBranch);
const branchLimits = branch.fixedFunctionAndInstall;
assert.equal(contract.mount, branchLimits.mount);
assert.equal(contract.parent, branchLimits.parent);
assert.equal(branchLimits.state, 'on-off-display');
assert.deepEqual(branchLimits.dimensionsMeters, { width: .09, height: .18, depth: .03, verification: 'pending' });
assert.deepEqual(contract.mounting, { origin: 'bottom', width: .18, height: .19, depth: .11, reserveDesktopArea: true });
assert(parameters.schema === 'company-phone-static-collection' && parameters.version === 1 && parameters.designs?.length,
  'Expected company-phone-static-collection version 1 with designs');
if (!args.parameters) assert.equal(parameters.designs.length, 4);
const dependencies = { geometryValidation: { path: inspectionPath, sha256: hash(inspectionBytes) } };
const collection = { schemaVersion: 1, id: 'company-phone-static-v1', generator: generatorPath, generatorSha256: hash(generatorBytes),
  sourceParameters: input, sourceParametersSha256: hash(parameterBytes), contract: contractPath,
  contractSha256: hash(contractBytes), resources: [] };
const files = new Map(), reports = [], seen = new Set(), donors = new Map();
for (const design of parameters.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && Number.isSafeInteger(design.version) && design.version > 0 &&
    typeof design.displayName === 'string' && design.displayName.trim(), 'Expected portable ID/version and display name');
  const key = `${design.id}@${design.version}`;
  assert(!seen.has(key), 'Duplicate phone resource ' + key); seen.add(key);
  const source = design.source && parameters.sources?.[design.source];
  assert(!design.source || source, 'Unknown upstream phone source');
  if (source && !donors.has(design.source)) donors.set(design.source, await readSource(source));
  const donor = donors.get(design.source);
  const { bytes, slots } = await buildModel(design, contract.display, donor);
  assert(bytes.equals((await buildModel(design, contract.display, donor)).bytes), 'Non-deterministic phone model ' + key);
  const { schema, version, ...fixed } = contract;
  const destination = `/company-assets/phone-static-v1/${design.id}/v${design.version}`;
  const asset = { format: 'glb', url: destination + '/model.glb', sha256: hash(bytes), bytes: bytes.length };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...fixed, materialSlots: slots,
    provenance: {
      license: source ? 'CC0-1.0 source mesh with project-authored materials, display and support' : 'Project-authored model and screen content',
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback', 'pngjs 7.0.0'],
      sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256, generator: generatorPath,
      generatorSha256: collection.generatorSha256, functionalContractSource: contractPath,
      functionalContractSourceSha256: collection.contractSha256, environmentBranchSource: branchPath,
      environmentBranchSourceSha256: hash(branchBytes), environmentBranch: branch.id, dependencies,
      ...(source ? { sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceUrl: source.url,
        sourceAuthor: source.author, sourceLicense: source.license, sourceLicensePath: source.licensePath, sourceLicenseSha256: source.licenseSha256,
        sourceManifestPath: source.manifestPath, sourceManifestSha256: source.manifestSha256, sourceNodes: [source.bodyNode, source.screenNode] } : {}),
    },
    asset,
  };
  const geometry = await inspectPhoneAsset(bytes, resource, design);
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + destination + '/resource.json';
  files.set(modelPath, bytes); files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath, sha256: asset.sha256,
    geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  reports.push({ id: design.id, version: design.version, asset, geometry, repeatedExportByteIdentical: true });
}
assert.equal(new Set(reports.map(item => item.geometry.geometrySha256)).size, reports.length, 'Phone designs must differ in geometry');
files.set(family + '/collection.json', json(collection));
const output = args.output && path.resolve(args.output);
if (output) {
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', scope: 'CPU GLB meshes, actual screen and ground rays', branchLimits: branchLimits.dimensionsMeters,
    mounting: contract.mounting, resources: reports }));
}
const missing = [];
for (const [relative, bytes] of files) {
  const file = output ? path.join(output, relative) : projectPath(relative);
  const existing = await fs.readFile(file).catch(error => {
    if (error.code === 'ENOENT' && !args.check) return null;
    throw error;
  });
  if (existing === null) missing.push([file, bytes]);
  else assert(existing.equals(bytes), `Existing ${relative} differs; retain the version and try --output with a new recipe`);
}
for (const [file, bytes] of missing) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes, { flag: 'wx' });
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
