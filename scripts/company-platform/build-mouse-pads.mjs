import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { unzipSync } from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';
import { inspectMousePadAsset } from './test-mouse-pad-assets.mjs';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-mouse-pad-v1';
const sourcePath = family + '/parameters.json';
const contractPath = family + '/contract.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-mouse-pads.mjs';
const inspectionPath = 'scripts/company-platform/test-mouse-pad-assets.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const positive = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const vec = xyz => new THREE.Vector3(...xyz);
const box = (size, position) => new THREE.BoxGeometry(...size).translate(...position);

function projectPath(relative) {
  assert(typeof relative === 'string' && !/[\\:]/.test(relative) &&
    relative.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected a project-relative source path');
  return path.join(root, relative);
}
const read = relative => fs.readFile(projectPath(relative));

async function loadSource(source) {
  const archive = await read(source.path);
  assert.equal(digest(archive), source.sha256, 'Original stock archive hash differs');
  const files = unzipSync(archive, { filter: item => [source.entry, source.licenseEntry].includes(item.name) });
  assert.equal(digest(files[source.licenseEntry]), source.licenseSha256, 'Original stock license hash differs');
  assert.equal(digest(files[source.entry]), source.modelSha256, 'Original stock GLB hash differs');
  const { scene } = await new GLTFLoader().parseAsync(buffer(files[source.entry]), '');
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse(mesh => { if (mesh.isMesh && mesh.material.name === source.primitive) meshes.push(mesh); });
  assert(meshes.length === 1 && meshes[0].material.isMeshStandardMaterial, 'Expected one matching CC0 mouse primitive');
  const [mesh] = meshes;
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  return { geometry: geometry.applyMatrix4(mesh.matrixWorld), material: mesh.material };
}

function outline(width, depth, radius, style, x = 0, z = 0) {
  const w = width / 2, d = depth / 2;
  assert(radius > 0 && radius < w && radius < d, 'Corner radius must fit its outline');
  const corners = [[w - radius, d - radius], [-w + radius, d - radius], [-w + radius, -d + radius], [w - radius, -d + radius]];
  const steps = style === 'chamfer' ? 1 : 5;
  return corners.flatMap(([a, b], index) => Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (index + i / steps) * Math.PI / 2;
    return new THREE.Vector2(x + a + radius * Math.cos(angle), z + b + radius * Math.sin(angle));
  }));
}

function padVolume(section, thickness, bottom = 0) {
  const shape = new THREE.Shape(section.map(point => new THREE.Vector2(point.x, -point.y)));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, bottom, 0);
}

function sewnEdge(section, height) {
  const path = new THREE.CurvePath();
  section.forEach((point, index) => {
    const to = section[(index + 1) % section.length];
    path.add(new THREE.LineCurve3(vec([point.x, height, point.y]), vec([to.x, height, to.y])));
  });
  return new THREE.TubeGeometry(path, 64, .00065, 4, true);
}

function padModel(design, add) {
  const { width, depth, radius, outline: style, thickness, stripe } = design.pad;
  assert(positive(width, .16, .28) && positive(depth, .17, .22) && positive(thickness, .003, .006) &&
    ['round', 'chamfer'].includes(style), 'Unsupported mouse pad dimensions or outline');
  const section = outline(width, depth, radius, style);
  add('pad-rubber-base', padVolume(section, thickness * .58), 'rubber', 'pad');
  add('pad-fabric-face', padVolume(section, thickness * .42, thickness * .58), 'pad', 'pad');
  const inset = .0034;
  add('pad-sewn-edge', sewnEdge(outline(width - inset * 2, depth - inset * 2, radius - inset, style), thickness + .0002), 'trim');
  if (stripe) add('pad-woven-inlay', box([stripe.width, .0008, stripe.depth], [stripe.x, thickness + .0001, 0]), 'trim');
}

function bufferGeometry(points, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function triangulate(points, positive, start, indices) {
  const faces = THREE.ShapeUtils.triangulateShape(points, []);
  for (const [a, b, c] of faces) {
    const order = (cross(points[a], points[b], points[c]) > 0) === positive ? [a, b, c] : [a, c, b];
    indices.push(...order.map(index => start + index));
  }
}

// Stations run from the plug end toward the palm. Each contains an independent
// cross-section with measurable ergonomic rise, width and lateral shift.
function loft(sections, bottom, crownPower) {
  assert(sections.length >= 3 && sections.every(([z, radius, centre, shoulder, crown], i) =>
    [z, radius, centre, shoulder, crown].every(Number.isFinite) && radius > 0 && shoulder > bottom && crown >= shoulder &&
    (i === 0 || z > sections[i - 1][0])), 'Mouse body stations must ascend along Z and have positive closed sections');
  const profile = [-1, -.94, -.78, -.55, -.28, 0, .28, .55, .78, .94, 1];
  const rings = sections.map(([z, radius, centre, shoulder, crown]) => [
    ...profile.map(u => [centre + radius * u, shoulder + (crown - shoulder) * (1 - u * u) ** (crownPower / 2), z]),
    [centre + radius, bottom, z], [centre - radius, bottom, z],
  ]);
  const count = rings[0].length, indices = [];
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < count; i++) {
      const a = ring * count + i, b = ring * count + (i + 1) % count;
      indices.push(a, b + count, b, a, a + count, b + count);
    }
  }
  for (const ring of [0, rings.length - 1])
    triangulate(rings[ring].map(([x, y]) => new THREE.Vector2(x, y)), ring > 0, ring * count, indices);
  return bufferGeometry(rings.flat(), indices);
}

function fitMouse(stock, fit, bottom) {
  const geometry = stock.geometry.clone().rotateY(THREE.MathUtils.degToRad(fit.yawDegrees));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox, size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  return geometry.translate(-centre.x, -box.min.y, -box.min.z)
    .scale(...fit.size.map((dimension, i) => dimension / [size.x, size.y, size.z][i])).translate(fit.centerX, bottom, fit.frontZ);
}

function surfaceTop(shells, x, z) {
  const ray = new THREE.Raycaster(vec([x, .12, z]), vec([0, -1, 0]));
  const hit = ray.intersectObjects(shells, false)[0];
  assert(hit, `Control at (${x}, ${z}) must attach to the actual mouse shell`);
  return hit.point.y;
}

function bodyPanel(shells, [x, z, width, depth], thickness, yaw = 0) {
  const angle = THREE.MathUtils.degToRad(yaw), cos = Math.cos(angle), sin = Math.sin(angle);
  const ring = outline(width, depth, Math.min(width, depth) * .19, 'round').map(v =>
    new THREE.Vector2(x + v.x * cos + v.y * sin, z + v.y * cos - v.x * sin));
  const surface = ring.map(v => surfaceTop(shells, v.x, v.y));
  const centre = surfaceTop(shells, x, z);
  const positions = [...ring.map((v, i) => [v.x, surface[i] - .001, v.y]), ...ring.map((v, i) => [v.x, surface[i] + thickness, v.y]),
    [x, centre - .001, z], [x, centre + thickness, z]];
  const count = ring.length, indices = [];
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(count * 2, i, next, count * 2 + 1, next + count, i + count);
    indices.push(i, next, next + count, i, next + count, i + count);
  }
  return bufferGeometry(positions, indices);
}

function attachCable(contract, add) {
  const { position: [x, y, z] } = contract.cablePorts[0];
  const { frame, backing } = contract.cablePortNodes.usb;
  const outerWidth = .014, innerWidth = .008, outerHeight = .008, innerHeight = .003, depth = .005;
  const side = (outerWidth - innerWidth) / 2, bar = (outerHeight - innerHeight) / 2;
  const dx = (outerWidth + innerWidth) / 4, dy = (outerHeight + innerHeight) / 4;
  add(frame[0], box([side, outerHeight, depth], [x - dx, y, z + depth / 2]), 'rubber', 'port');
  add(frame[1], box([side, outerHeight, depth], [x + dx, y, z + depth / 2]), 'rubber', 'port');
  add(frame[2], box([innerWidth, bar, depth], [x, y + dy, z + depth / 2]), 'rubber', 'port');
  add(frame[3], box([innerWidth, bar, depth], [x, y - dy, z + depth / 2]), 'rubber', 'port');
  add(backing, box([outerWidth + .001, outerHeight + .001, .004], [x, y, z + depth + .002]), 'rubber', 'port');
}

async function exportMouse(design, contract, stock) {
  const group = new THREE.Group();
  group.name = design.id;
  const finishes = new Map(Object.entries(design.finishes).map(([name, color]) => {
    assert(/^#[0-9a-f]{6}$/i.test(color), 'Finish colors must be hex RGB');
    const roughness = name === 'ball' ? .25 : name === 'trim' ? .63 : ['pad', 'rubber'].includes(name) ? .91 : .57;
    return [name, new THREE.MeshStandardMaterial({ name, color, roughness, metalness: name === 'ball' ? .20 : .04 })];
  }));
  if (stock) finishes.set('stock', stock.material.clone());
  const slots = { body: [], controls: [], pad: [], trim: [], port: [] };
  function add(name, geometry, finish, slot = finish) {
    assert(finishes.has(finish) && slots[slot], `Missing material or slot for ${name}`);
    const mesh = new THREE.Mesh(geometry, finishes.get(finish));
    mesh.name = name;
    group.add(mesh);
    slots[slot].push(name);
    return mesh;
  }
  try {
    padModel(design, add);
    const bottom = design.pad.thickness, shells = [];
    if (stock) {
      assert(design.body.sourceFit, 'A stock body needs explicit sizing and orientation');
      shells.push(add('mouse-body-stock', fitMouse(stock, design.body.sourceFit, bottom), 'stock', 'body'));
      const bridge = [[-.088, .018, 0, .015, .020], [-.075, .025, 0, .013, .018], [-.055, .019, 0, .011, .014]];
      shells.push(add('mouse-body-front-bridge', loft(bridge, bottom, 1.7), 'body'));
    } else {
      assert(positive(design.body.crownPower, .5, 3), 'Unsupported mouse crown parameter');
      shells.push(add('mouse-body-ergonomic', loft(design.body.sections, bottom, design.body.crownPower), 'body'));
    }
    group.updateMatrixWorld(true);
    assert(design.buttons?.length === 2, 'Expected separate left and right click controls');
    design.buttons.forEach((button, i) => add(i ? 'mouse-button-right' : 'mouse-button-left', bodyPanel(shells, button, .0023), 'buttons', 'controls'));
    const { at: [x, z], radius, width } = design.wheel;
    const wheelY = surfaceTop(shells, x, z) - radius * .43;
    add('mouse-wheel', new THREE.CylinderGeometry(radius, radius, width, 16).rotateZ(Math.PI / 2).translate(x, wheelY, z), 'rubber', 'controls');
    if (design.mark) {
      const { at: [x, z], size, yawDegrees } = design.mark;
      add('mouse-shell-mark', bodyPanel(shells, [x, z, ...size], .0007, yawDegrees), 'trim');
    }
    if (design.ball) {
      const { position, radius, socketRadius } = design.ball;
      add('mouse-trackball', new THREE.SphereGeometry(radius, 20, 12).translate(...position), 'ball', 'controls');
      add('mouse-trackball-socket', new THREE.TorusGeometry(socketRadius, .0011, 6, 22).rotateX(Math.PI / 2)
        .translate(position[0], position[1] - .006, position[2]), 'rubber', 'controls');
    }
    attachCable(contract, add);
    const copyright = stock ? 'Contains Kenney Furniture Kit 2.0 geometry (CC0-1.0); desktop adaptation authored for the project.' :
      'Project-authored mouse and pad geometry.';
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true, copyright }));
    return { bytes, slots };
  } finally {
    group.traverse(mesh => mesh.geometry?.dispose());
    for (const finish of finishes.values()) finish.dispose();
  }
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' },
  output: { type: 'string' }, parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-mouse-pads.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one production mode');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const input = args.parameters ?? sourcePath;
const [parameterBytes, contractBytes, branchBytes, generatorBytes, inspectionBytes] = await Promise.all(
  [input, contractPath, branchPath, generatorPath, inspectionPath].map(read),
);
const parameters = JSON.parse(parameterBytes), contract = JSON.parse(contractBytes);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(entry => entry.id === contract.productionBranch);
const limits = branch.fixedFunctionAndInstall;
assert.equal(contract.mount, limits.mount);
assert.equal(contract.parent, limits.parent);
assert.equal(contract.mounting.width, limits.dimensionsMeters.width);
assert.equal(contract.mounting.depth, limits.dimensionsMeters.depth);
assert.equal(limits.dimensionsMeters.height, .02);
assert.equal(limits.dimensionsMeters.verification, 'pending');
assert.deepEqual(contract.mounting, { origin: 'bottom', width: .28, height: .065, depth: .22, reserveDesktopArea: true });
assert(parameters.schema === 'company-mouse-pad-collection' && parameters.version === 1 &&
  Array.isArray(parameters.designs) && parameters.designs.length, 'Expected company-mouse-pad-collection version 1 with designs');
if (!args.parameters) assert.equal(parameters.designs.length, 4);
const pinned = { geometryValidation: { path: inspectionPath, sha256: digest(inspectionBytes) } };
const collection = { schemaVersion: 1, id: 'company-mouse-pad-v1', generator: generatorPath, generatorSha256: digest(generatorBytes),
  sourceParameters: input, sourceParametersSha256: digest(parameterBytes), contract: contractPath, contractSha256: digest(contractBytes), resources: [] };
const files = new Map(), reports = [], donors = new Map(), ids = new Set();
for (const design of parameters.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && Number.isSafeInteger(design.version) && design.version > 0 &&
    typeof design.displayName === 'string' && design.displayName.trim(), 'Expected portable ID, version and display name');
  const key = `${design.id}@${design.version}`;
  assert(!ids.has(key), `Duplicate mouse pad version ${key}`);
  ids.add(key);
  const source = design.source && parameters.sources?.[design.source];
  assert(!design.source || source, 'Unknown stock recipe entry');
  if (source && !donors.has(design.source)) donors.set(design.source, await loadSource(source));
  const stock = donors.get(design.source);
  const { bytes, slots } = await exportMouse(design, contract, stock);
  assert(bytes.equals((await exportMouse(design, contract, stock)).bytes), `Non-deterministic export ${key}`);
  const { schema, version, ...fixed } = contract;
  const destination = `/company-assets/mouse-pad-v1/${design.id}/v${design.version}`;
  const asset = { format: 'glb', url: destination + '/model.glb', sha256: digest(bytes), bytes: bytes.length };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...fixed, materialSlots: slots,
    provenance: { license: source ? 'CC0-1.0 source geometry with project-authored adaptation' : 'Project-authored geometry and materials',
      tools: [`Three.js ${THREE.REVISION} GLTFExporter`, 'GLTFLoader CPU ray readback'], sourceParameters: input,
      sourceParametersSha256: collection.sourceParametersSha256, functionalContractSource: contractPath,
      functionalContractSourceSha256: collection.contractSha256, environmentBranchSource: branchPath,
      environmentBranchSourceSha256: digest(branchBytes), environmentBranch: branch.id, generator: generatorPath,
      generatorSha256: collection.generatorSha256, dependencies: pinned,
      ...(source ? { sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceModelEntry: source.entry,
        sourceGlbSha256: source.modelSha256, sourcePrimitive: source.primitive, sourceAuthor: source.author, sourceUrl: source.url,
        sourceLicense: source.license, sourceLicenseEntry: source.licenseEntry, sourceLicenseSha256: source.licenseSha256 } : {}),
    },
    asset,
  };
  const geometry = await inspectMousePadAsset(bytes, resource, design);
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + destination + '/resource.json';
  files.set(modelPath, bytes);
  files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath,
    sha256: asset.sha256, geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  reports.push({ id: design.id, version: design.version, asset, geometry, repeatedExportByteIdentical: true });
}
if (!args.parameters) assert.equal(new Set(reports.map(item => item.geometry.bodySha256)).size, 4, 'Expect four different mouse bodies');
files.set(family + '/collection.json', json(collection));

if (args.output) {
  const output = path.resolve(args.output);
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', scope: 'CPU GLB solid geometry, full desk support and visual USB endpoint',
    sourceHeightMetres: limits.dimensionsMeters.height, sourceHeightVerification: limits.dimensionsMeters.verification,
    compatibleHeightEnvelopeMetres: contract.mounting.height, resources: reports }));
  for (const [relative, bytes] of files) {
    const file = path.join(output, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes, { flag: 'wx' });
  }
} else {
  const missing = [];
  for (const [relative, bytes] of files) {
    const existing = await read(relative).catch(error => {
      if (error.code === 'ENOENT' && args.write) return null;
      throw error;
    });
    if (existing === null) missing.push([relative, bytes]);
    else assert(existing.equals(bytes), `Existing ${relative} differs; retain the version and use --output for a new candidate`);
  }
  for (const [relative, bytes] of missing) {
    const file = projectPath(relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes, { flag: 'wx' });
  }
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
