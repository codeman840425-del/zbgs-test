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
import { inspectWallAmbientAsset, loadWallGlb, selectAmbientEmitter } from './test-wall-ambient-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-wall-ambient-v1';
const parametersPath = family + '/parameters.json';
const contractPath = family + '/contract.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const producerPath = 'scripts/company-platform/build-wall-ambient.mjs';
const checksPath = 'scripts/company-platform/test-wall-ambient-assets.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const finite = (value, lo, hi) => Number.isFinite(value) && value >= lo && value <= hi;
const color = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const box = (w, h, d, r, x, y, z) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * .35)).translate(x, y, z);

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

function rasterizeEditableOutline(input) {
  assert(input.schema === 'company-wall-ambient-outline' && input.version === 1);
  const { width, height, vertices } = input;
  assert(Number.isInteger(width) && Number.isInteger(height) && finite(width, 24, 256) && finite(height, 24, 256));
  assert(Array.isArray(vertices) && vertices.length >= 6 && vertices.length <= 64 &&
    vertices.every(point => point.length === 2 && finite(point[0], 1, width - 1) && finite(point[1], 1, height - 1)),
  'Expected a closed editable contour in raster coordinates');
  const image = new PNG({ width, height }), samples = 4;
  function contains(x, y) {
    let inside = false;
    for (const [i, [ax, ay]] of vertices.entries()) {
      const [bx, by] = vertices.at(i - 1);
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let coverage = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++)
      coverage += Number(contains(x + (sx + .5) / samples, y + (sy + .5) / samples));
    image.data[(y * width + x) * 4 + 3] = Math.round(255 * coverage / samples ** 2);
  }
  return PNG.sync.write(image);
}

function merge(parts) {
  const solid = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  const joined = mergeGeometries(solid);
  for (const geometry of new Set([...solid, ...parts])) geometry.dispose();
  assert(joined, 'Expected compatible light fixture mesh attributes');
  return joined;
}

// Read the actual four-connected alpha regions. Keeping the pixels as
// geometry input also preserves the relationship between source and any edit.
function glyphComponents(png) {
  const { width, height, data } = png;
  assert(width >= 24 && width <= 256 && height >= 24 && height <= 256);
  const solids = new Set();
  for (let i = 0; i < width * height; i++) if (data[i * 4 + 3] >= 128) solids.add(i);
  const components = [];
  while (solids.size) {
    const first = solids.values().next().value, pixels = [first];
    solids.delete(first);
    const bounds = [width, height, 0, 0];
    for (let i = 0; i < pixels.length; i++) {
      const id = pixels[i], x = id % width, y = Math.floor(id / width);
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x + 1); bounds[3] = Math.max(bounds[3], y + 1);
      const adjacent = [id - width, id + width, ...(x > 0 ? [id - 1] : []), ...(x < width - 1 ? [id + 1] : [])];
      for (const candidate of adjacent) if (solids.delete(candidate)) pixels.push(candidate);
    }
    assert(pixels.length >= 6, 'Isolated alpha speck cannot define part of a physical fixture');
    components.push({ pixels, bounds });
  }
  return { width, components };
}

function borders(component, width) {
  const pixels = new Set(component.pixels), edges = new Map();
  const line = (u, v, a, b) => {
    const start = u + (width + 1) * v, end = a + (width + 1) * b;
    const next = edges.get(start) ?? [];
    next.push(end);
    edges.set(start, next);
  };
  for (const id of pixels) {
    const x = id % width, y = Math.floor(id / width);
    if (!pixels.has(id - width)) line(x, y, x + 1, y);
    if (x === width - 1 || !pixels.has(id + 1)) line(x + 1, y, x + 1, y + 1);
    if (!pixels.has(id + width)) line(x + 1, y + 1, x, y + 1);
    if (!x || !pixels.has(id - 1)) line(x, y + 1, x, y);
  }
  const loops = [];
  while (edges.size) {
    const first = edges.keys().next().value, points = [];
    let at = first;
    do {
      points.push(new THREE.Vector2(at % (width + 1), Math.floor(at / (width + 1))));
      const next = edges.get(at);
      assert(next?.length === 1, 'Source outline has an ambiguous or open corner');
      edges.delete(at); at = next[0];
    } while (at !== first);
    if (points.length > 6) loops.push(points);
  }
  assert(loops.length === 1, 'Expected one contour per alpha region');
  return loops[0];
}

function simplifyOpen(points, tolerance) {
  const start = points[0], end = points.at(-1), line = end.clone().sub(start), square = line.lengthSq();
  let far = tolerance ** 2, farIndex;
  for (let i = 1; i < points.length - 1; i++) {
    const t = THREE.MathUtils.clamp(points[i].clone().sub(start).dot(line) / square, 0, 1);
    const distance = points[i].distanceToSquared(start.clone().addScaledVector(line, t));
    if (distance > far) { far = distance; farIndex = i; }
  }
  if (!farIndex) return [start, end];
  return [...simplifyOpen(points.slice(0, farIndex + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(farIndex), tolerance)];
}

function outline(png, height, tolerance) {
  const { components, width } = glyphComponents(png);
  const minX = Math.min(...components.map(part => part.bounds[0]));
  const minY = Math.min(...components.map(part => part.bounds[1]));
  const maxX = Math.max(...components.map(part => part.bounds[2]));
  const maxY = Math.max(...components.map(part => part.bounds[3]));
  const scale = height / (maxY - minY), midX = (maxX + minX) / 2, midY = (maxY + minY) / 2;
  return components.map(component => {
    const points = borders(component, width), start = points[0];
    let split = 1;
    for (let i = 2; i < points.length; i++) {
      if (points[i].distanceToSquared(start) > points[split].distanceToSquared(start)) split = i;
    }
    return [...simplifyOpen(points.slice(0, split + 1), tolerance).slice(0, -1),
      ...simplifyOpen([...points.slice(split), start], tolerance).slice(0, -1)]
      .map(point => new THREE.Vector2((point.x - midX) * scale, (midY - point.y) * scale));
  });
}

function stripModel(png, shape, add) {
  const { width, pitch, barHeight } = shape;
  assert(finite(width, .32, .56) && finite(pitch, .045, .112) && finite(barHeight, .017, .037));
  const source = glyphComponents(png).components;
  assert(source.length === 3, 'The band source must contain three independent bars');
  source.sort((a, b) => a.bounds[0] - b.bounds[0]);
  const lengths = source.map(part => part.bounds[3] - part.bounds[1]), longest = Math.max(...lengths);
  assert(new Set(lengths).size === 3);
  const cases = [], faces = [];
  for (const [i, length] of lengths.entries()) {
    const w = width * length / longest, x = (w - width) / 2, y = pitch * (1 - i);
    cases.push(box(w, barHeight, .033, .007, x, y, .0165));
    faces.push(box(w - .012, barHeight - .006, .009, .002, x, y, .0355));
  }
  add('strip-channels', merge(cases), 'housing');
  add('strip-mount-tabs', merge([-1, 1].map(side => box(.031, .045, .017, .003, -width / 2 + .03, side * pitch, .0085))), 'hardware');
  add('ambient-diffuser', merge(faces), 'diffuser');
}

function roundedLoop(profile, corner, z) {
  const knots = profile.map(point => new THREE.Vector3(point.x, point.y, z));
  const round = knots.map((point, i) => {
    const last = knots.at(i - 1), next = knots[(i + 1) % knots.length];
    const cut = Math.min(corner, point.distanceTo(last) * .35, point.distanceTo(next) * .35);
    return { point, before: point.clone().add(last.clone().sub(point).normalize().multiplyScalar(cut)),
      after: point.clone().add(next.clone().sub(point).normalize().multiplyScalar(cut)) };
  });
  const path = new THREE.CurvePath();
  for (const [i, current] of round.entries()) {
    path.add(new THREE.LineCurve3(round.at(i - 1).after, current.before));
    path.add(new THREE.QuadraticBezierCurve3(current.before, current.point, current.after));
  }
  return path;
}

function tubeModel(png, shape, add) {
  const { height, radius, corner, mountAt, borderTolerance } = shape;
  assert(finite(height, .20, .319) && finite(radius, .005, .009) && finite(corner, .007, .021) &&
    finite(borderTolerance, .6, 2) && mountAt?.length === 2 && mountAt.every(at => finite(at, 0, 1)));
  const parts = outline(png, height, borderTolerance);
  assert(parts.length === 1 && parts[0].length >= 10, 'An outlined neon shape needs a continuous physical profile');
  const rail = roundedLoop(parts[0], corner, .0398 - radius);
  const sockets = mountAt.map(at => {
    const p = rail.getPointAt(at);
    return box(.031, .031, .029, .005, p.x, p.y, .0145);
  });
  add('tube-supports', merge(sockets), 'hardware');
  add('tube-feed-housing', box(.045, .018, .017, .004,
    rail.getPointAt(mountAt[0]).x, rail.getPointAt(mountAt[0]).y - .016, .0085), 'housing');
  add('ambient-diffuser', new THREE.TubeGeometry(rail, 144, radius, 10, true), 'diffuser');
}

function badgeModel(png, shape, add) {
  const { symbolHeight, plateWidth, plateHeight, borderTolerance } = shape;
  assert(finite(symbolHeight, .13, .225) && finite(plateWidth, .27, .50) &&
    finite(plateHeight, symbolHeight + .04, .33) && finite(borderTolerance, .65, 1.65));
  const profiles = outline(png, symbolHeight, borderTolerance);
  assert(profiles.length === 2, 'An open ring and independent centre stroke must be retained');
  assert(profiles.flat().every(point => Math.abs(point.x) < plateWidth * .39));
  const base = new THREE.CylinderGeometry(1, 1, .030, 48).rotateX(Math.PI / 2)
    .scale(plateWidth / 2, plateHeight / 2, 1).translate(0, 0, .015);
  add('studio-plaque', base, 'housing');
  add('studio-hardware', merge([-1, 1].map(side => new THREE.CylinderGeometry(.0075, .0075, .006, 16)
    .rotateX(Math.PI / 2).translate(side * plateWidth * .37, 0, .031))), 'hardware');
  const symbol = profiles.map(profile => new THREE.ExtrudeGeometry(new THREE.Shape(profile), {
    depth: .009, bevelThickness: .001, bevelSize: .001, bevelSegments: 2,
  }).translate(0, 0, .0295));
  add('ambient-diffuser', merge(symbol), 'diffuser');
}

async function stockModel(source, bytes, shape, add) {
  assert(finite(shape.scaleXY, .05, 10) && finite(shape.scaleZ, .05, 10), 'Expected positive, bounded fit scales for the wall fixture');
  const scene = await loadWallGlb(bytes);
  const parts = [source.mountNode, source.diffuserNode].map(name => {
    const donor = scene.getObjectByName(name);
    assert(donor?.isMesh);
    return donor.geometry.index ? donor.geometry.toNonIndexed().applyMatrix4(donor.matrixWorld) :
      donor.geometry.clone().applyMatrix4(donor.matrixWorld);
  });
  parts[1].computeBoundingBox();
  const middle = parts[1].boundingBox.getCenter(new THREE.Vector3());
  for (const mesh of parts) mesh.translate(-middle.x, -middle.y, 0).scale(shape.scaleXY, shape.scaleXY, shape.scaleZ);
  add('stock-wall-plate', parts[0], 'hardware');
  add('ambient-diffuser', parts[1], 'diffuser');
}

const forms = { 'linear-bars': stripModel, 'outline-tube': tubeModel, 'studio-plaque': badgeModel };
async function generate(design, source, bytes, contract) {
  const group = new THREE.Group();
  group.name = design.id;
  const material = {
    housing: new THREE.MeshStandardMaterial({ name: 'ambient-housing', color: design.finish.housing, metalness: .25, roughness: .61 }),
    hardware: new THREE.MeshStandardMaterial({ name: 'ambient-hardware', color: design.finish.hardware, metalness: .35, roughness: .61 }),
    diffuser: new THREE.MeshStandardMaterial({ name: 'ambient-diffuser', color: contract.light.color, emissive: contract.light.color,
      emissiveIntensity: contract.display.diffuser.onIntensity * contract.stateDefaults.intensity / contract.stateSchema.intensity.max,
      metalness: 0, roughness: .58 }),
  };
  const slots = {};
  function add(name, geometry, slot) {
    assert(!group.getObjectByName(name));
    const mesh = new THREE.Mesh(geometry, material[slot]);
    mesh.name = name;
    group.add(mesh);
    (slots[slot] ??= []).push(name);
  }
  try {
    if (design.form === 'stock-sconce') {
      assert.equal(source.kind, 'glb');
      await stockModel(source, bytes, design.shape, add);
    } else {
      assert.equal(source.kind, 'png');
      assert(typeof forms[design.form] === 'function', 'Unknown shape family');
      forms[design.form](PNG.sync.read(bytes, { checkCRC: true }), design.shape, add);
    }
    const copyright = `Adapted from ${source.author} ${source.license} sources with project-authored light mounting and materials.`;
    return { bytes: Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true, copyright })), slots };
  } finally {
    group.traverse(mesh => mesh.geometry?.dispose());
    for (const finish of Object.values(material)) finish.dispose();
  }
}

async function readSource(source) {
  assert(typeof source?.author === 'string' && source.author.trim() && source.author.length <= 160 && !/[\r\n]/.test(source.author) &&
    ['CC0-1.0', 'Project-authorized-original'].includes(source.license), 'Expected an explicit author and supported source permission');
  assert(source.url === undefined || /^https:\/\//.test(source.url), 'Expected HTTPS provenance when a source URL is provided');
  if (source.entry !== undefined || source.archiveSha256 !== undefined)
    assert(typeof source.entry === 'string' && source.entry.trim() && /^[a-f0-9]{64}$/.test(source.archiveSha256), 'Expected the archive entry and its bundle hash');
  const [sourceBytes, licenseBytes] = await Promise.all([source.path, source.licensePath].map(read));
  assert.equal(hash(sourceBytes), source.sha256, 'Source artifact differs');
  assert.equal(hash(licenseBytes), source.licenseSha256, 'Source license differs');
  const permission = source.license === 'CC0-1.0' ? /\bCC0\b/ : /\bProject-authorized-original\b/;
  assert(permission.test(licenseBytes.toString()), 'The declared permission must be present in the license file');
  if (source.editable) {
    const editable = await read(source.editable.path);
    assert.equal(source.kind, 'png', 'An editable raster source requires a PNG fixture input');
    assert.equal(hash(editable), source.editable.sha256, 'Editable contour differs');
    assert(rasterizeEditableOutline(JSON.parse(editable)).equals(sourceBytes), 'Editable contour does not reproduce its supplied source PNG');
  }
  return sourceBytes;
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
  parameters: { type: 'string' }, rasterize: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-wall-ambient.mjs --check | --write | --output NEW_DIRECTORY [--parameters REPO_RELATIVE_JSON]');
  console.log('node scripts/company-platform/build-wall-ambient.mjs --rasterize REPO_RELATIVE_CONTOUR_JSON --output NEW_PNG_FILE');
  process.exit(0);
}
if (args.rasterize) {
  assert(args.output?.endsWith('.png') && !args.check && !args.write && !args.parameters, 'Rasterization requires a separate new PNG output path');
  const pixels = rasterizeEditableOutline(JSON.parse(await read(args.rasterize)));
  await fs.writeFile(path.resolve(args.output), pixels, { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', sha256: hash(pixels), bytes: pixels.length }));
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use a single production mode');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const input = args.parameters ?? parametersPath;
const [parameterBytes, contractBytes, producerBytes, checksBytes, branchBytes] = await Promise.all(
  [input, contractPath, producerPath, checksPath, branchPath].map(read)
);
const recipe = JSON.parse(parameterBytes), { schema, version, ...contract } = JSON.parse(contractBytes);
assert.equal(schema, 'company-wall-ambient-contract');
assert.equal(version, 1);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(entry => entry.id === contract.productionBranch);
assert.equal(branch?.fixedFunctionAndInstall.mount, contract.mount);
assert.equal(branch.fixedFunctionAndInstall.state, 'on-color-intensity');
assert.equal(recipe.schema, 'company-wall-ambient-collection');
assert(recipe.version === 1 && Array.isArray(recipe.designs) && recipe.designs.length);
if (!args.parameters) assert.equal(recipe.designs.length, 4);
const collection = { schemaVersion: 1, id: 'company-wall-ambient-v1', generator: producerPath, generatorSha256: hash(producerBytes),
  contract: contractPath, contractSha256: hash(contractBytes), sourceParameters: input, sourceParametersSha256: hash(parameterBytes), resources: [] };
const files = new Map(), seen = new Set(), reports = [];
for (const design of recipe.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id) &&
    Number.isSafeInteger(design.version) && design.version > 0 && typeof design.displayName === 'string' && design.displayName.trim() &&
    ['housing', 'hardware'].every(slot => color(design.finish?.[slot])), 'Expected portable identity and fixture finish');
  const key = design.id + '@' + design.version;
  assert(!seen.has(key), 'Duplicate design ' + key); seen.add(key);
  const source = recipe.sources[design.source], donor = await readSource(source);
  const { bytes, slots } = await generate(design, source, donor, contract);
  assert(bytes.equals((await generate(design, source, donor, contract)).bytes), 'Re-export changed bytes for ' + key);
  const spot = await selectAmbientEmitter(bytes);
  const directory = '/company-assets/wall-ambient-v1/' + design.id + '/v' + design.version;
  const asset = { format: 'glb', url: directory + '/model.glb', sha256: hash(bytes), bytes: bytes.length };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...contract, materialSlots: slots,
    light: { ...contract.light, position: spot.position, target: spot.target }, asset,
    provenance: { license: source.license + ' source with project-authored fixture adaptation and finishes.', sourceDesign: design.form,
      sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256, generator: producerPath,
      generatorSha256: collection.generatorSha256, functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      environmentBranchSource: branchPath, environmentBranchSourceSha256: hash(branchBytes), environmentBranch: branch.id,
      sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceAuthor: source.author, sourceUrl: source.url,
      sourceLicense: source.license, sourceArchiveSha256: source.archiveSha256, sourceEntry: source.entry,
      dependencies: { geometryValidation: { path: checksPath, sha256: hash(checksBytes) },
        license: { path: source.licensePath, sha256: source.licenseSha256 },
        ...(source.editable ? { editableContour: source.editable } : {}) },
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback', 'pngjs 7.0.0'],
    },
  };
  const geometry = await inspectWallAmbientAsset(bytes, resource, design);
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + directory + '/resource.json';
  files.set(modelPath, bytes); files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath, sha256: asset.sha256,
    geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  reports.push({ id: design.id, version: design.version, geometry, asset, repeatedExportByteIdentical: true });
}
assert.equal(new Set(reports.map(item => item.geometry.geometrySha256)).size, reports.length, 'Expected genuinely distinct fixture geometry');
files.set(family + '/collection.json', json(collection));
const output = args.output && path.resolve(args.output);
if (output) {
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', scope: 'Actual wall back contact, mesh and optical origin from GLB', resources: reports }));
}
const additions = [];
for (const [relative, bytes] of files) {
  const target = output ? path.join(output, relative) : projectPath(relative);
  const current = await fs.readFile(target).catch(error => {
    if (error.code === 'ENOENT' && !args.check) return null;
    throw error;
  });
  if (current === null) additions.push([target, bytes]);
  else assert(current.equals(bytes), `Existing ${relative} differs; use a new version and output directory`);
}
for (const [target, bytes] of additions) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: 'wx' });
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
