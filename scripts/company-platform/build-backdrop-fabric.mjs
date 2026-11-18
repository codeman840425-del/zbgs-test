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
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { inspectBackdropFabric } from './test-backdrop-fabric-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-backdrop-fabric-v1';
const defaultParameters = family + '/parameters.json';
const contractPath = family + '/contract.json';
const environmentPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-backdrop-fabric.mjs';
const inspectionPath = 'scripts/company-platform/test-backdrop-fabric-assets.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isInteger(value) && between(value, min, max);
const token = color => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
const roundBox = (size, radius) => new RoundedBoxGeometry(...size, 2, Math.min(radius, Math.min(...size) * .35));
const plainBox = (size, x, y, z) => new THREE.BoxGeometry(...size).translate(x, y, z);
const tau = Math.PI * 2;
const sheetZ = .024;

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

function projectPath(relative) {
  assert(typeof relative === 'string' && !/[\\:\0]/.test(relative) &&
    relative.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected a project-relative source path');
  return path.join(root, relative);
}
const read = relative => fs.readFile(projectPath(relative));
function merge(parts) {
  const solid = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  const joined = mergeGeometries(solid);
  for (const geometry of new Set([...solid, ...parts])) geometry.dispose();
  assert(joined);
  return joined;
}

function validateDesign(design) {
  const { sheet, feet, cassette, rail, mast, finish, print } = design;
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id)
    && Number.isSafeInteger(design.version) && design.version > 0 &&
    typeof design.displayName === 'string' && design.displayName.trim(), 'Expected a portable backdrop identity and display name');
  assert(between(sheet.width, 1.8, 2.033) && integer(sheet.folds, 2, 13) && between(sheet.foldDepth, .001, .040) &&
    between(sheet.hemDepth, .0005, .024) && between(sheet.waveShift, 0, .5) &&
    between(sheet.weave, .01, .2), 'Expected supported fabric width, pleat and weaving parameters');
  assert(sheet.opacity === undefined || between(sheet.opacity, .28, .72), 'Sheer opacity must preserve actual transmission');
  assert(['cloth', 'case', 'rail', 'pole', 'foot', 'fittings'].every(key => token(finish[key])), 'Expected six finishing colors');
  assert(['bar', 'wing', 'flared', 'oval'].includes(feet.shape) && between(feet.span, .64, .90) &&
    between(feet.width, .044, .12) && between(feet.depth, .23, .30) && between(feet.height, .015, .034), 'Expected two usable floor feet');
  assert(['rounded', 'round', 'bevel'].includes(cassette.shape) && between(cassette.width, sheet.width + .020, 2.1) &&
    between(cassette.height, .047, .091) && between(cassette.depth, .096, .139), 'Expected a cassette that spans the sheet');
  assert(['rounded', 'round', 'bevel'].includes(rail.shape) && between(rail.height, .024, .074) &&
    between(rail.depth, .037, .064), 'Expected a lift rail with a physical fabric bite');
  assert(['square', 'round'].includes(mast.shape) && between(mast.back, .046, .080) &&
    between(mast.size, .022, .046) && integer(mast.sections, 2, 4), 'Expected an independently collapsible mast');
  if (print) {
    assert(['field', 'hill', 'arch', 'archInset', 'sun', 'branch'].every(key => token(print[key])) &&
      between(print.archCentre, .33, .56) && between(print.archWidth, .32, .58) && print.sunPosition?.length === 2 &&
      between(print.sunPosition[0], .56, .82) && between(print.sunPosition[1], .17, .40), 'Invalid artwork palette or diagram');
  }
}

function shapedBar(shape, width, height, depth, x, y, z) {
  if (shape === 'round') {
    return new THREE.CylinderGeometry(1, 1, width, 24)
      .rotateZ(Math.PI / 2).scale(1, height / 2, depth / 2).translate(x, y, z);
  }
  if (shape === 'bevel') {
    const w = width / 2, h = height / 2, c = Math.min(.022, height * .22);
    const outline = new THREE.Shape([
      [-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c],
      [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c],
    ].map(([a, b]) => new THREE.Vector2(a, b)));
    return new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false }).translate(x, y, z - depth / 2);
  }
  return roundBox([width, height, depth], .018).translate(x, y, z);
}

function floorFoot(feet, x) {
  const { shape, width, depth, height } = feet;
  if (shape === 'bar') return roundBox([width, height, depth], .009).translate(x, height / 2, 0);
  const plans = {
    wing: [[-.49, -.5], [.31, -.5], [.49, -.36], [.23, -.13], [.22, .18], [.43, .48],
      [-.18, .50], [-.39, .31], [-.34, .01], [-.50, -.22]],
    flared: [[-.50, -.5], [.50, -.5], [.50, -.37], [.26, -.16], [.26, .15], [.43, .34],
      [.43, .50], [-.43, .50], [-.43, .34], [-.26, .15], [-.26, -.16], [-.50, -.37]],
    oval: Array.from({ length: 24 }, (_, i) => [.5 * Math.cos(tau * i / 24), .5 * Math.sin(tau * i / 24)]),
  };
  const outline = new THREE.Shape(plans[shape].map(([u, v]) => new THREE.Vector2(u * width, -v * depth)));
  return new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(x, 0, 0);
}

function sheetGeometry(sheet, lower, upper) {
  const columns = 72, rows = 36, vertices = [], uv = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, ends = Math.sin(Math.PI * v);
    for (let col = 0; col <= columns; col++) {
      const u = col / columns, edge = Math.max(0, 1 - Math.min(u, 1 - u) / .045);
      const pleat = Math.sin(tau * (sheet.folds * u + sheet.waveShift * v)) * sheet.foldDepth;
      const hem = sheet.hemDepth * Math.sin(Math.PI * edge * .75);
      const width = sheet.width - .0024 * ends;
      vertices.push((u - .5) * width, lower + v * (upper - lower), sheetZ + ends * (pleat + hem));
      uv.push(u, 1 - v);
      if (row < rows && col < columns) {
        const i = row * (columns + 1) + col, next = i + columns + 1;
        indices.push(i, i + 1, next + 1, i, next + 1, next);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function artwork(print) {
  const palette = Object.fromEntries(['field', 'hill', 'arch', 'archInset', 'sun', 'branch'].map(key =>
    [key, [1, 3, 5].map(start => parseInt(print[key].slice(start, start + 2), 16))]));
  function arch(x, y, width, shoulder, radius) {
    const u = (x - print.archCentre) / (width / 2);
    return Math.abs(u) < 1 && y < .98 && (y >= shoulder || u ** 2 + ((y - shoulder) / radius) ** 2 <= 1);
  }
  return (x, y) => {
    let color = palette.field;
    if (Math.hypot(x - print.sunPosition[0], .9 * (y - print.sunPosition[1])) < .085) color = palette.sun;
    if (y > .71 + .062 * Math.cos(tau * (x - .12)) + .032 * Math.sin(tau * 2 * x)) color = palette.hill;
    if (arch(x, y, print.archWidth, .475, .28)) color = palette.arch;
    if (arch(x, y, print.archWidth - .095, .49, .221)) color = palette.archInset;
    if (arch(x, y, print.archWidth - .171, .52, .169)) color = palette.hill;
    const stalkX = .755 + .40 * (y - .60) ** 2;
    if (y > .55 && y < .94 && Math.abs(x - stalkX) < .0052) color = palette.branch;
    for (let row = 0; row < 6; row++) {
      const side = row % 2 ? 1 : -1, leafY = .566 + row * .053;
      const leafX = .766 + .40 * (leafY - .60) ** 2 + side * .031;
      const py = y - leafY, px = x - leafX;
      if (((px - side * py * .65) / .051) ** 2 + (py / .016) ** 2 < 1) color = palette.branch;
    }
    return color;
  };
}

function clothPng(design, weave) {
  const { sheet, finish, print } = design;
  const out = new PNG({ width: 288, height: 256 });
  const plain = [1, 3, 5].map(start => parseInt(finish.cloth.slice(start, start + 2), 16));
  const colorAt = print ? artwork(print) : () => plain;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const field = 4 * (y * out.width + x);
    const tile = 4 * ((y * 4 % weave.height) * weave.width + x * 4 % weave.width);
    const fiber = (weave.data[tile] + weave.data[tile + 1] * 2 + weave.data[tile + 2]) / (4 * 255);
    const edge = Math.min(x, out.width - 1 - x) < 3;
    const shade = 1 - sheet.weave * (1 - fiber) - (edge ? sheet.weave * .94 : 0);
    const rgb = colorAt(x / out.width, y / out.height);
    for (let i = 0; i < 3; i++) out.data[field + i] = Math.round(rgb[i] * shade);
    out.data[field + 3] = sheet.opacity === undefined ? 255 : Math.round(edge ? 233 : 44 + 172 * fiber);
  }
  return PNG.sync.write(out);
}

const pad = (bytes, value = 0) => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, value)]);
function withPng(model, png) {
  const jsonEnd = 20 + model.readUInt32LE(12), gltf = JSON.parse(model.subarray(20, jsonEnd));
  const binary = model.subarray(jsonEnd + 8);
  const material = gltf.materials.find(value => value.name === 'fabric-cloth');
  assert(material && !gltf.images);
  const view = gltf.bufferViews.push({ buffer: 0, byteOffset: binary.length, byteLength: png.length }) - 1;
  gltf.images = [{ name: 'fabric-face', bufferView: view, mimeType: 'image/png' }];
  gltf.samplers = [{ wrapS: 33071, wrapT: 33071, magFilter: 9729, minFilter: 9987 }];
  gltf.textures = [{ sampler: 0, source: 0 }];
  material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
  gltf.buffers[0].byteLength = binary.length + png.length;
  const chunks = [pad(Buffer.from(JSON.stringify(gltf)), 32), Buffer.concat([binary, pad(png)])];
  const header = Buffer.alloc(12);
  [0x46546c67, 2, 28 + chunks[0].length + chunks[1].length].forEach((value, index) => header.writeUInt32LE(value, index * 4));
  return Buffer.concat([header, ...chunks.flatMap((bytes, index) => {
    const descriptor = Buffer.alloc(8);
    descriptor.writeUInt32LE(bytes.length, 0);
    descriptor.writeUInt32LE(index ? 0x004e4942 : 0x4e4f534a, 4);
    return [descriptor, bytes];
  })]);
}

async function encode(design, motion, png) {
  const { sheet, cassette, feet, rail, mast, finish } = design;
  const group = new THREE.Group();
  group.name = design.id;
  const materials = Object.fromEntries(Object.entries(finish).map(([slot, color]) => [slot,
    new THREE.MeshStandardMaterial({ name: 'fabric-' + slot, color, metalness: slot === 'pole' ? .4 : .08,
      roughness: slot === 'foot' ? .83 : .53 })]));
  materials.cloth.setValues({ color: '#ffffff', metalness: 0, roughness: .96, side: THREE.DoubleSide,
    opacity: sheet.opacity ?? 1, transparent: sheet.opacity !== undefined });
  const slots = {};
  function add(name, geometry, slot) {
    const mesh = new THREE.Mesh(geometry, materials[slot]);
    mesh.name = name;
    group.add(mesh);
    (slots[slot] ??= []).push(name);
  }
  const lower = motion.slotY, upper = lower + motion.travel;
  try {
    for (const [side, x] of [['left', -feet.span], ['right', feet.span]]) {
      add('foot-' + side, floorFoot(feet, x), 'foot');
      const riser = .061 - feet.height;
      add('riser-' + side, roundBox([feet.width * .84, riser + .002, .063], .006).translate(x, .061 - riser / 2, -.008), 'fittings');
    }
    const width = cassette.width, lipWidth = sheet.width + .009;
    add('roller-case', shapedBar(cassette.shape, width - .023, cassette.height, cassette.depth, 0, .103 - cassette.height / 2, -.006), 'case');
    add('roller-endcaps', merge([-1, 1].map(side =>
      shapedBar(cassette.shape, .018, cassette.height * .92, cassette.depth * .92, side * (width / 2 - .009),
        .103 - cassette.height / 2, -.006))), 'fittings');
    add('roller-mouth', merge([-.016, .015].map(offset =>
      roundBox([lipWidth, .011, .010], .002).translate(0, lower - .002, sheetZ + offset))), 'fittings');
    add('roller-drum', shapedBar('round', lipWidth - .004, .021, .023, 0, lower - .010, sheetZ), 'pole');
    add('mast-socket', plainBox([mast.size * 1.32, .064, mast.size * 1.60], 0, lower - .028, -mast.back), 'fittings');
    add('fabric-sheet', sheetGeometry(sheet, lower, upper), 'cloth');
    add('lift-rail', merge([
      shapedBar(rail.shape, sheet.width + .033, rail.height, rail.depth, 0, upper, sheetZ),
      roundBox([Math.max(.072, mast.size * 2), .025, mast.back + sheetZ + .010], .005)
        .translate(0, upper - .005, (sheetZ - mast.back) / 2),
    ]), 'rail');
    const height = upper - lower, parts = [];
    for (let i = 0; i < mast.sections; i++) {
      const low = lower + (i / mast.sections) * height;
      const high = Math.min(upper, lower + ((i + 1) / mast.sections) * height + .016);
      const size = mast.size * (1 - .48 * i / (mast.sections - 1));
      const length = high - low, y = (low + high) / 2;
      parts.push(mast.shape === 'round' ? new THREE.CylinderGeometry(size / 2, size / 2, length, 16).translate(0, y, -mast.back) :
        plainBox([size, length, size], 0, y, -mast.back));
      if (i !== mast.sections - 1) parts.push(roundBox([size * 1.16, .022, size * 1.16], .003)
        .translate(0, high - .012, -mast.back));
    }
    add('lift-mast', merge(parts), 'pole');
    const raw = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true,
      copyright: 'Project-authored roll-up backdrop; the cloth uses the project woven-surface texture.' }));
    return { bytes: withPng(raw, png), slots };
  } finally {
    group.traverse(node => node.geometry?.dispose());
    for (const material of Object.values(materials)) material.dispose();
  }
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' },
  parameters: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-backdrop-fabric.mjs --check | --write | --output NEW_DIRECTORY [--parameters REPO_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use one production mode');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const input = args.parameters ?? defaultParameters;
const [parameterBytes, contractBytes, environmentBytes, generatorBytes, inspectionBytes] = await Promise.all(
  [input, contractPath, environmentPath, generatorPath, inspectionPath].map(read)
);
const parameters = JSON.parse(parameterBytes);
const { schema: contractSchema, version: contractVersion, weaveSource, ...contract } = JSON.parse(contractBytes);
assert.equal(contractSchema, 'company-backdrop-fabric-contract');
assert.equal(contractVersion, 1);
const branch = JSON.parse(environmentBytes).groups.flatMap(group => group.branches).find(entry => entry.id === contract.productionBranch);
assert.equal(branch?.fixedFunctionAndInstall.state, 'rolled-deployed');
assert.equal(parameters.schema, 'company-backdrop-fabric-collection');
assert(parameters.version === 1 && Array.isArray(parameters.designs) && parameters.designs.length);
if (!args.parameters) assert.equal(parameters.designs.length, 4);
const weaveBytes = await read(weaveSource.path);
assert.equal(hash(weaveBytes), weaveSource.sha256, 'Project weave source bytes differ');
const weave = PNG.sync.read(weaveBytes, { checkCRC: true });
assert.deepEqual([weave.width, weave.height], [512, 512]);
const dependencies = { geometryValidation: { path: inspectionPath, sha256: hash(inspectionBytes) },
  weaveSource: { path: weaveSource.path, sha256: weaveSource.sha256 } };
const collection = { schemaVersion: 1, id: 'company-backdrop-fabric-v1', generator: generatorPath, generatorSha256: hash(generatorBytes),
  contract: contractPath, contractSha256: hash(contractBytes), sourceParameters: input, sourceParametersSha256: hash(parameterBytes), resources: [] };
const files = new Map(), reports = [], seen = new Set();
for (const design of parameters.designs) {
  validateDesign(design);
  const identity = design.id + '@' + design.version;
  assert(!seen.has(identity), 'Duplicate backdrop resource ' + identity);
  seen.add(identity);
  const png = clothPng(design, weave);
  const { bytes, slots } = await encode(design, contract.backdropRoll, png);
  assert(bytes.equals((await encode(design, contract.backdropRoll, clothPng(design, weave))).bytes), 'Non-deterministic backdrop ' + identity);
  const directory = '/company-assets/backdrop-fabric-v1/' + design.id + '/v' + design.version;
  const asset = { format: 'glb', url: directory + '/model.glb', sha256: hash(bytes), bytes: bytes.length };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...contract, materialSlots: slots,
    provenance: { license: 'Project-authored cloth, artwork and installation geometry; reuses the project-authored fiber pattern.',
      environmentBranchSource: environmentPath, environmentBranchSourceSha256: hash(environmentBytes), environmentBranch: branch.id,
      sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256,
      functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      generator: generatorPath, generatorSha256: collection.generatorSha256, dependencies,
      texture: { original: weaveSource, embeddedSha256: hash(png), embeddedBytes: png.length },
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback', 'pngjs 7.0.0'],
    },
    asset,
  };
  const geometry = await inspectBackdropFabric(bytes, resource, design);
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + directory + '/resource.json';
  files.set(modelPath, bytes); files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath, sha256: asset.sha256,
    geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  reports.push({ id: design.id, version: design.version, geometry, asset, repeatedExportByteIdentical: true });
}
for (const field of ['geometrySha256', 'sheetSha256', 'footSha256', 'railSha256'])
  assert.equal(new Set(reports.map(item => item.geometry[field])).size, reports.length, 'Backdrop designs share ' + field);
files.set(family + '/collection.json', json(collection));
const output = args.output && path.resolve(args.output);
if (output) {
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', scope: 'CPU meshes, rays, embedded cloth, roll clearances', resources: reports }));
}
const additions = [];
for (const [relative, bytes] of files) {
  const target = output ? path.join(output, relative) : projectPath(relative);
  const existing = await fs.readFile(target).catch(error => {
    if (error.code === 'ENOENT' && !args.check) return null;
    throw error;
  });
  if (existing === null) additions.push([target, bytes]);
  else assert(existing.equals(bytes), `Existing ${relative} differs; use a new version and output directory`);
}
for (const [target, bytes] of additions) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: 'wx' });
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
