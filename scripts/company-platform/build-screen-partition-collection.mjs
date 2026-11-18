import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { unzipSync } from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';
import { digest, inspectPartitionGeometry, parsePartitionGlb } from './test-screen-partition-geometry.mjs';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-screen-partition-v1';
const defaultParameters = family + '/parameters.json';
const contractPath = family + '/contract.json';
const environmentPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-screen-partition-collection.mjs';
const geometryPath = 'scripts/company-platform/test-screen-partition-geometry.mjs';
const publicDir = 'company-assets/screen-partition-v1';
const json = content => Buffer.from(JSON.stringify(content, null, 2) + '\n');
const box = (size, at) => new THREE.BoxGeometry(...size).translate(...at);
const rod = (radius, height, at) => new THREE.CylinderGeometry(radius, radius, height, 12).translate(...at);
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

function projectPath(relative) {
  assert(typeof relative === 'string' && relative.split('/').every(part => part && part !== '.' && part !== '..') &&
    !/[\\:]/.test(relative), `Expected portable project-relative path: ${relative}`);
  return path.join(root, relative);
}

function join(parts) {
  const combined = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  assert(combined, 'Expected compatible primitive layouts');
  return combined;
}

function frame(width, height, footTop, stile, depth, topRail, bottomRail) {
  const uprightHeight = height - topRail - footTop - bottomRail;
  return join([
    box([width, topRail, depth], [0, height - topRail / 2, 0]),
    ...[-1, 1].map(side => box([stile, uprightHeight, depth],
      [side * (width / 2 - stile / 2), footTop + bottomRail + uprightHeight / 2, 0])),
    ...(bottomRail ? [box([width, bottomRail, depth], [0, footTop + bottomRail / 2, 0])] : []),
  ]);
}

function floorShoes(width, depth, footWidth, footHeight, middle) {
  return join([
    ...[-1, 1].map(side => box([footWidth, footHeight, depth], [side * (width - footWidth) / 2, footHeight / 2, 0])),
    ...(middle ? [box([footWidth, footHeight, depth], [0, footHeight / 2, 0])] : []),
  ]);
}

async function readStock(input) {
  const archive = await fs.readFile(projectPath(input.path));
  assert.equal(digest(archive), input.sha256, 'Stock archive has changed');
  const entries = unzipSync(archive, { filter: entry => [input.entry, input.licenseEntry].includes(entry.name) });
  assert.equal(digest(entries[input.entry]), input.modelSha256, 'Stock mesh entry has changed');
  assert.equal(digest(entries[input.licenseEntry]), input.licenseSha256, 'Stock license has changed');
  const { scene } = await parsePartitionGlb(Buffer.from(entries[input.entry]));
  const meshes = [];
  scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  assert(meshes.length === 1 && meshes[0].material.isMeshStandardMaterial, 'Expected the original single PBR donor pane');
  const [mesh] = meshes;
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(...bounds.getCenter(new THREE.Vector3()).negate());
  return { geometry, size, material: mesh.material };
}

function buildTimber({ contact, mounting, p, add, stock }) {
  const { width, height, depth } = mounting;
  const { leafGap, frameWidth, frameDepth, footWidth, footHeight, insetHeight, insetDepth,
    louvreCount, louvreHeight, louvreDepth, louvrePitchDegrees, hingeHeights } = p;
  assert(stock && inRange(leafGap, .008, .026) && Number.isInteger(louvreCount) && inRange(louvreCount, 6, 16));
  assert(Array.isArray(hingeHeights) && inRange(hingeHeights.length, 2, 4) && hingeHeights.every(y => inRange(y, .2, 1.9)));
  assert(inRange(insetHeight, .60, .93) && inRange(insetDepth, .016, .032));
  add(contact, floorShoes(width, depth, footWidth, footHeight, true), 'hardware');
  const step = width / 3;
  const pivotY = footHeight - .002;
  const insetBottom = pivotY + frameWidth - .003;
  const crossbarHeight = .038;
  const crossbarY = insetBottom + insetHeight + crossbarHeight / 2 - .001;
  const donorScaleY = insetHeight / stock.size.y;
  const donorScaleZ = insetDepth / stock.size.z;
  for (let i = 0; i < 3; i++) {
    const left = -width / 2 + i * step + (i > 0 ? leafGap / 2 : 0);
    const right = -width / 2 + (i + 1) * step - (i < 2 ? leafGap / 2 : 0);
    const x = (left + right) / 2, leafWidth = right - left;
    add(`timber-leaf-frame-${i + 1}`, join([
      frame(leafWidth, height, pivotY, frameWidth, frameDepth, frameWidth, frameWidth).translate(x, 0, 0),
      box([leafWidth - 2 * frameWidth + .002, crossbarHeight, frameDepth], [x, crossbarY, 0]),
    ]), 'frame', 'finish');
    const insideWidth = leafWidth - 2 * frameWidth + .003;
    const donor = [-1, 1].map(side => stock.geometry.clone().scale(insideWidth / stock.size.x, donorScaleY, donorScaleZ)
      .rotateY(side < 0 ? Math.PI : 0).translate(x, insetBottom + insetHeight / 2, side * insetDepth * .45));
    add(`timber-leaf-inset-${i + 1}`, join(donor), 'inset', 'infill');
    const low = crossbarY + .060, high = height - frameWidth - .060;
    assert((high - low) / (louvreCount - 1) > louvreHeight, 'Count or height would close off the individual timber louvres');
    const blades = Array.from({ length: louvreCount }, (_, j) =>
      new THREE.BoxGeometry(insideWidth, louvreHeight, louvreDepth).rotateX(THREE.MathUtils.degToRad(louvrePitchDegrees))
        .translate(x, low + (high - low) * j / (louvreCount - 1), 0));
    add(`timber-leaf-louvres-${i + 1}`, join(blades), 'louvres', 'infill');
  }
  for (const [seam, x] of [-step / 2, step / 2].entries()) {
    for (const [index, y] of hingeHeights.entries()) {
      const z = frameDepth / 2 + .002;
      add(`timber-hinge-${seam + 1}-${index + 1}`, join([
        rod(.009, .089, [x, y, z]),
        ...[-1, 1].map(side => box([.039, .056, .008], [x + side * .023, y, z])),
      ]), 'hardware');
    }
  }
}

function clothGeometry(width, low, high, p) {
  const columns = 36, rows = 8, stride = columns + 1;
  const layerCount = stride * (rows + 1), points = [], indices = [];
  for (const side of [1, -1]) for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const u = column / columns, v = row / rows;
    const edgeTension = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    const wave = p.waveAmplitude * edgeTension * Math.sin(2 * Math.PI * p.waveCount * u + v * .4);
    points.push((u - .5) * width, low + v * (high - low), wave + side * p.clothThickness / 2);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * stride + column, b = a + 1, c = a + stride, d = c + 1, n = layerCount;
    indices.push(a, b, d, a, d, c, a + n, d + n, b + n, a + n, c + n, d + n);
  }
  const outline = [
    ...Array.from({ length: columns }, (_, i) => i),
    ...Array.from({ length: rows }, (_, i) => i * stride + columns),
    ...Array.from({ length: columns }, (_, i) => rows * stride + columns - i),
    ...Array.from({ length: rows }, (_, i) => (rows - i) * stride),
  ];
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length], n = layerCount;
    indices.push(a, a + n, b + n, a, b + n, b);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCloth({ contact, mounting, p, add }) {
  const { width, height, depth } = mounting;
  assert(inRange(p.waveCount, 2, 8) && inRange(p.waveAmplitude, .006, .016) && inRange(p.clothThickness, .002, .008));
  add(contact, floorShoes(width, depth, p.footWidth, p.footHeight, false), 'frame');
  add('fabric-frame', frame(width, height, p.footHeight - .002, p.stileWidth, p.frameDepth, p.topRailHeight, 0), 'frame', 'finish');
  const clear = width - 2 * p.stileWidth + .005;
  const high = height - p.topRailHeight + .003;
  add('fabric-body', clothGeometry(clear, p.clothBottom, high, p), 'cloth', 'infill');
  add('fabric-seams', join([
    box([clear, p.seamWidth, .013], [0, p.clothBottom + p.seamWidth / 2, 0]),
    ...[-1, 1].map(side => box([p.seamWidth, high - p.clothBottom, .013],
      [side * (clear - p.seamWidth) / 2, (high + p.clothBottom) / 2, 0])),
  ]), 'seam');
}

function buildAcoustic({ contact, mounting, p, add }) {
  const { width, height, depth } = mounting;
  assert(Number.isInteger(p.rows) && Number.isInteger(p.columns) && inRange(p.rows, 2, 5) && inRange(p.columns, 2, 4));
  assert(inRange(p.rowOffset, .04, .14) && inRange(p.tileGap, .009, .035) && inRange(p.tileThickness, .01, .02));
  const top = .042;
  add(contact, box([width, p.railHeight, depth], [0, p.railHeight / 2, 0]), 'frame');
  add('acoustic-frame', frame(width, height, p.railHeight - .002, p.frameWidth, p.frameDepth, top, 0), 'frame', 'finish');
  const clear = width - 2 * p.frameWidth;
  const yMin = p.railHeight - .002, yMax = height - top + .002;
  add('acoustic-backing', box([clear + .004, yMax - yMin, p.backDepth], [0, (yMax + yMin) / 2, 0]), 'back');
  const pitch = (yMax - yMin - p.tileGap) / p.rows;
  const tileDepthCenter = p.backDepth / 2 + p.tileThickness / 2 - .001;
  for (let row = 0; row < p.rows; row++) {
    const offset = (row % 2 ? -1 : 1) * p.rowOffset;
    const ends = [-clear / 2, ...Array.from({ length: p.columns - 1 }, (_, j) => -clear / 2 + clear * (j + 1) / p.columns + offset), clear / 2];
    for (let col = 0; col < p.columns; col++) {
      const [a, b] = ends.slice(col, col + 2);
      const y = yMin + p.tileGap / 2 + (row + .5) * pitch;
      const tile = join([-1, 1].map(side =>
        box([b - a - p.tileGap, pitch - p.tileGap, p.tileThickness], [(a + b) / 2, y, side * tileDepthCenter])));
      add(`acoustic-tile-${row + 1}-${col + 1}`, tile, (row + col) % 2 ? 'dark-tile' : 'light-tile', 'infill');
    }
  }
}

function glazingGaskets(centreX, yLow, yHigh, width, p) {
  const thickness = p.glassThickness + .008, w = p.gasketWidth;
  return [
    ...[yLow + w / 2, yHigh - w / 2].map(y => box([width, w, thickness], [centreX, y, 0])),
    ...[-1, 1].map(side => box([w, yHigh - yLow - w * 2, thickness], [centreX + side * (width - w) / 2, (yHigh + yLow) / 2, 0])),
  ];
}

function buildGlass({ contact, mounting, p, add }) {
  const { width, height, depth } = mounting;
  assert(inRange(p.glassThickness, .008, .02));
  add(contact, box([width, p.railHeight, depth], [0, p.railHeight / 2, 0]), 'frame');
  const yLow = p.railHeight - .002, yHigh = height - p.topRailHeight;
  const glassHeight = yHigh - yLow;
  add('glass-frame', join([
    frame(width, height, yLow, p.stileWidth, p.frameDepth, p.topRailHeight, 0),
    box([p.mullionWidth, glassHeight, p.frameDepth], [0, (yHigh + yLow) / 2, 0]),
  ]), 'frame', 'finish');
  const bayWidth = width / 2 - p.stileWidth - p.mullionWidth / 2;
  const center = p.mullionWidth / 2 + bayWidth / 2;
  const gaskets = [];
  for (const [index, x] of [-center, center].entries()) {
    gaskets.push(...glazingGaskets(x, yLow, yHigh, bayWidth + .002, p));
    add(`glass-pane-${index + 1}`, box([bayWidth, glassHeight, p.glassThickness], [x, (yHigh + yLow) / 2, 0]), 'glass', 'infill');
  }
  add('glass-gaskets', join(gaskets), 'gasket');
}

const constructions = {
  'timber-leaves': { build: buildTimber, contact: 'timber-feet' },
  'stretched-cloth': { build: buildCloth, contact: 'fabric-feet' },
  'acoustic-tiles': { build: buildAcoustic, contact: 'acoustic-ground-rail' },
  'framed-glazing': { build: buildGlass, contact: 'glass-ground-rail' },
};

async function exportModel(design, mounting, stock) {
  const construction = constructions[design.construction];
  assert(construction && design.parts && Object.values(design.parts).every(value => Array.isArray(value) ||
    (Number.isFinite(value) && value > 0)), 'Expected defined construction and positive part dimensions');
  const group = new THREE.Group();
  group.name = design.id;
  const materialSlots = { finish: [], infill: [] };
  const finishes = new Map(Object.entries(design.finishes).map(([name, opts]) => {
    const transparent = (opts.opacity ?? 1) < 1;
    const mat = new THREE.MeshStandardMaterial({ ...opts, transparent, depthWrite: !transparent });
    mat.name = name;
    return [name, mat];
  }));
  if (stock) finishes.set('inset', stock.material.clone());
  function add(name, geometry, finish, slot) {
    const material = finishes.get(finish);
    assert(material, `Unknown material ${finish}`);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    if (slot) materialSlots[slot].push(name);
  }
  try {
    construction.build({ mounting, p: design.parts, add, stock, contact: construction.contact });
    const copyright = stock ? 'Contains Kenney Furniture Kit 2.0 geometry, CC0-1.0; screen adaptation authored for this project.' :
      'Project-authored screen partition geometry.';
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true, copyright }));
    return { bytes, materialSlots };
  } finally {
    for (const mesh of group.children) mesh.geometry.dispose();
    for (const material of finishes.values()) material.dispose();
  }
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' },
  output: { type: 'string' }, parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-screen-partition-collection.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one of --check, --write or --output NEW_DIRECTORY');
assert(!args.parameters || args.output, 'Alternate parameters require a fresh --output directory');
const parametersPath = args.parameters ?? defaultParameters;
const [parametersBytes, contractBytes, environmentBytes, generatorBytes, geometryBytes] = await Promise.all(
  [parametersPath, contractPath, environmentPath, generatorPath, geometryPath].map(relative => fs.readFile(projectPath(relative))),
);
const parameters = JSON.parse(parametersBytes), contract = JSON.parse(contractBytes);
const branch = JSON.parse(environmentBytes).groups.flatMap(group => group.branches).find(item => item.id === contract.productionBranch);
const { dimensionsMeters: { width, height, depth }, mount, parent } = branch.fixedFunctionAndInstall;
assert.deepEqual(contract.mounting, { origin: 'bottom', width, height, depth });
assert.deepEqual(contract.footprint, { center: [0, 0], halfSize: [width / 2, depth / 2], blocking: true });
assert.equal(contract.mount, mount);
assert.equal(contract.parent, parent);
assert.equal(branch.fixedFunctionAndInstall.state, 'static-or-folding');
assert(parameters.schema === 'company-screen-partition-collection' && parameters.version === 1 && parameters.designs?.length > 0,
  'Expected company-screen-partition-collection version 1');
if (!args.parameters) assert.equal(parameters.designs.length, 4);
const collection = {
  schemaVersion: 1, id: 'company-screen-partition-v1', generator: generatorPath, generatorSha256: digest(generatorBytes),
  sourceParameters: parametersPath, sourceParametersSha256: digest(parametersBytes), contract: contractPath, contractSha256: digest(contractBytes),
  geometryValidation: geometryPath, geometryValidationSha256: digest(geometryBytes), resources: [],
};
const files = new Map(), reports = [], sourceModels = new Map(), identities = new Set();
for (const design of parameters.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && Number.isSafeInteger(design.version) && design.version > 0 &&
    typeof design.displayName === 'string' && design.displayName.trim(), 'Design requires portable ID, positive version and display name');
  const identity = `${design.id}@${design.version}`;
  assert(!identities.has(identity), `Duplicate screen partition version ${identity}`);
  identities.add(identity);
  const source = design.source && parameters.sources[design.source];
  assert(!design.source || source, 'Unknown stock asset reference');
  if (source && !sourceModels.has(design.source)) sourceModels.set(design.source, await readStock(source));
  const stock = sourceModels.get(design.source);
  const first = await exportModel(design, contract.mounting, stock);
  assert.deepEqual(first.bytes, (await exportModel(design, contract.mounting, stock)).bytes, `Non-deterministic export ${identity}`);
  const geometry = await inspectPartitionGeometry(first.bytes, contract.mounting, design.construction);
  const destination = `${publicDir}/${design.id}/v${design.version}`;
  const asset = { format: 'glb', url: '/' + destination + '/model.glb', sha256: digest(first.bytes), bytes: first.bytes.length };
  const { schema, version, ...resourceContract } = contract;
  const resource = {
    id: design.id, version: design.version, displayName: design.displayName, ...resourceContract, materialSlots: first.materialSlots,
    provenance: {
      license: source ? 'CC0-1.0 source geometry with project-authored adaptation' : 'Project-authored solid geometry and materials',
      sourceDesign: design.construction, tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback'],
      sourceParameters: parametersPath, sourceParametersSha256: collection.sourceParametersSha256,
      functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      environmentBranchSource: environmentPath, environmentBranchSourceSha256: digest(environmentBytes), environmentBranch: branch.id,
      generator: generatorPath, generatorSha256: collection.generatorSha256,
      dependencies: { geometryValidation: { path: geometryPath, sha256: collection.geometryValidationSha256 } },
      ...(source ? {
        sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceModelEntry: source.entry,
        sourceGlbSha256: source.modelSha256, sourceAuthor: source.author, sourceUrl: source.url, sourceLicense: source.license,
        sourceLicenseEntry: source.licenseEntry, sourceLicenseSha256: source.licenseSha256,
      } : {}),
    }, asset,
  };
  const modelPath = 'prototype/public/' + destination + '/model.glb';
  const resourcePath = 'prototype/public/' + destination + '/resource.json';
  files.set(modelPath, first.bytes);
  files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath, construction: design.construction,
    sha256: asset.sha256, triangles: geometry.triangles, geometrySha256: geometry.geometrySha256 });
  reports.push({ id: design.id, version: design.version, asset, geometry, repeatedExportByteIdentical: true });
}
assert.equal(new Set(reports.map(report => report.geometry.geometrySha256)).size, reports.length, 'Partition geometry must differ');
files.set(family + '/collection.json', json(collection));

if (args.output) {
  const out = path.resolve(args.output);
  await fs.mkdir(out);
  files.set('report.json', json({ status: 'passed', scope: 'CPU GLB readback including floor contact, shapes and materials', resources: reports }));
  for (const [relative, bytes] of files) {
    const target = path.join(out, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
  }
} else {
  const missing = [];
  for (const [relative, candidate] of files) {
    const existing = await fs.readFile(projectPath(relative)).catch(error => {
      if (error.code === 'ENOENT' && args.write) return null;
      throw error;
    });
    if (existing === null) missing.push([relative, candidate]);
    else assert(existing.equals(candidate), `Existing ${relative} differs. Keep the existing version and use --output first.`);
  }
  for (const [relative, bytes] of missing) {
    const target = projectPath(relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
  }
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
