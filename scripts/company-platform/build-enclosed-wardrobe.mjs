import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { inspectWardrobe, loadWardrobeGlb } from './test-enclosed-wardrobe-assets.mjs';
import { editableSources, editableValidator } from './plant-editable-source.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-enclosed-wardrobe-v1';
const defaultInput = family + '/parameters.json';
const contractPath = family + '/contract.json';
const generatorPath = 'scripts/company-platform/build-enclosed-wardrobe.mjs';
const geometryPath = 'scripts/company-platform/test-enclosed-wardrobe-assets.mjs';
const environmentPath = 'assets-source/company-environment-specs-v1/branches.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const hingeHeights = [.28, 1.34];

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); })
      .catch(error => this.onerror?.(error));
  }
};

function projectPath(relative) {
  assert(typeof relative === 'string' && !/[\\:\x00-\x1f<>|"?*]/u.test(relative) &&
    relative.split('/').every(part => part && !/[. ]$/u.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)),
  'Expected a portable project-relative path');
  return path.resolve(root, relative);
}

async function read(relative) {
  const file = projectPath(relative);
  assert(await fs.realpath(file) === file && (await fs.lstat(file)).isFile(), 'Expected a local regular file at ' + relative);
  return fs.readFile(file);
}

function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function merged(geometries) {
  const nonIndexed = geometries.map(g => g.index ? g.toNonIndexed() : g);
  const geometry = mergeGeometries(nonIndexed);
  for (const old of new Set([...geometries, ...nonIndexed])) old.dispose();
  return geometry;
}

function cabinetBody(body, mount, rail, parts, hardwareColor, add) {
  assert(['color', 'inside', 'feet', 'rail'].every(slot => hex(body?.[slot])) && ['plinth', 'posts'].includes(body.base));
  const { width, height, depth } = mount, half = width / 2;
  const back = -depth / 2, front = .249, beam = .030;
  const shelfY = .080, sideBottom = body.base === 'plinth' ? .050 : 0;
  add('wardrobe-body', merged([
    ...[-1, 1].map(sign => box(beam, height - sideBottom, front - back, sign * (half - beam / 2),
      (height + sideBottom) / 2, (front + back) / 2)),
    box(width - 2 * beam, .035, front - back, 0, height - .0175, (front + back) / 2),
    box(width - 2 * beam, .036, front - back, 0, shelfY - .018, (front + back) / 2),
  ]), 'body', { color: body.color });
  add('wardrobe-lining', box(width - 2 * beam, height - shelfY - .035, .024, 0,
    (shelfY + height - .035) / 2, back + .012), 'lining', { color: body.inside });
  const rests = body.base === 'plinth' ? [box(.972, .052, .497, 0, .026, -.026)] :
    [-1, 1].flatMap(sign => [-.203, .155].map(z => box(.048, .070, .058, sign * .464, .035, z)));
  add('wardrobe-base', merged(rests), 'base', { color: body.feet });
  const hingeMounts = parts.flatMap(({pivot: [x, y, z]}) => hingeHeights.flatMap(level => [
    box(.027, .077, .007, x + Math.sign(x) * .014, y + level, z - .011),
    ...[-.034, .034].map(end => box(.025, .008, .015, x + Math.sign(x) * .009, y + level + end, z - .004)),
  ]));
  add('wardrobe-hinge-mounts', merged(hingeMounts), 'hinges', { color: hardwareColor, metalness: .67, roughness: .43 });
  add('garment-rail', new THREE.CylinderGeometry(rail.radius, rail.radius, width - .050, 96)
    .rotateZ(Math.PI / 2).translate(0, rail.centerY, 0), 'rail', { color: body.rail, metalness: .56, roughness: .43 });
}

async function readDoorSource(source) {
  assert(source && ['CC0-1.0', 'Project-authorized-original'].includes(source.license) && typeof source.author === 'string' &&
    source.author.trim() && source.author.length <= 160 && !/[\r\n]/.test(source.author));
  assert([source.path, source.licensePath].every(name => typeof name === 'string' && /^assets-source\/company-[^/]+\//u.test(name)),
    'GLB and license must be project asset sources');
  assert(source.url === undefined || /^https:\/\//.test(source.url));
  if (source.entry !== undefined || source.archiveSha256 !== undefined)
    assert(typeof source.entry === 'string' && source.entry.trim() && sha(source.archiveSha256), 'Invalid archive identity');
  const [bytes, license] = await Promise.all([source.path, source.licensePath].map(read));
  assert.equal(hash(bytes), source.sha256, 'Source door GLB differs from its pin');
  assert.equal(hash(license), source.licenseSha256, 'Source permission differs from its pin');
  assert(license.toString('utf8').trim() && typeof source.nodes?.left === 'string' &&
    (typeof source.nodes.right === 'string') !== (source.nodes.mirrorRight === true),
  'Expected written license and native right door or explicit mirroring');
  return loadWardrobeGlb(bytes);
}

function namedMaterials(scene, source, side) {
  const mirror = side === 'right' && source.nodes.mirrorRight === true;
  const name = source.nodes[mirror ? 'left' : side], candidates = [];
  scene.traverse(node => { if (node.name === name) candidates.push(node); });
  assert.equal(candidates.length, 1, 'Source pivot must resolve uniquely to ' + name);
  const node = candidates[0], inverse = node.matrixWorld.clone().invert(), parts = new Map();
  node.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.material?.name && mesh.material.isMeshStandardMaterial && !mesh.material.map && !parts.has(mesh.material.name),
      'Use uniquely named PBR source primitives without external textures');
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    parts.set(mesh.material.name, { geometry, material: mesh.material });
  });
  assert(parts.size, 'No leaves below source pivot ' + name);
  return { parts, mirror };
}

function geometryOnFront(geometry) {
  const keep = new THREE.BufferGeometry(), positions = geometry.attributes.position;
  const front = [];
  for (let i = 0; i < positions.count; i += 3)
    if ([i, i + 1, i + 2].every(j => positions.getZ(j) > 0)) front.push(i, i + 1, i + 2);
  assert(front.length > 0 && front.length < positions.count, 'Source hardware must have front and rear triangles');
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const components = Array.from({ length: attr.itemSize }, (_, component) => component);
    keep.setAttribute(name, new THREE.Float32BufferAttribute(front.flatMap(i => components.map(c => attr.getComponent(i, c))), attr.itemSize));
  }
  return keep;
}

function bounds(geometry) {
  return new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
}

function fit(geometry, source, target, flipX = false) {
  const scale = target.getSize(new THREE.Vector3()).divide(source.getSize(new THREE.Vector3()));
  assert(scale.toArray().every(value => Number.isFinite(value) && value > 0), 'Source leaf/donor has no supported 3D extent');
  geometry.translate(...source.min.clone().negate()).scale(...scale).translate(...target.min);
  if (!flipX) return geometry;
  geometry.scale(-1, 1, 1);
  // Reflection flips triangle winding even though the normal matrix is correct.
  for (const attr of Object.values(geometry.attributes)) for (let i = 0; i < attr.count; i += 3)
    for (let c = 0; c < attr.itemSize; c++) {
      const tail = attr.getComponent(i + 2, c);
      attr.setComponent(i + 2, c, attr.getComponent(i + 1, c));
      attr.setComponent(i + 1, c, tail);
    }
  return geometry;
}

const ranges = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

function doorMeshes(design, source, scene, part, add) {
  const { id, bounds: limit } = part, { parts, mirror } = namedMaterials(scene, source, id);
  const sign = id === 'left' ? 1 : -1;
  const min = limit.min[0], max = limit.max[0], panelY = limit.max[1], panelFront = .010;
  const prefix = 'wardrobe-' + id + '-';
  assert(Array.isArray(design.panels) && design.panels.filter(p => p.role === 'panel').length === 1 &&
    new Set(design.panels.map(p => p.role)).size === design.panels.length &&
    new Set(design.panels.map(p => p.sourceMaterial)).size === design.panels.length);
  const panelBounds = new THREE.Box3();
  for (const p of design.panels) {
    assert(['panel', 'inset', 'insert', 'glass'].includes(p.role) && hex(p.color) && parts.has(p.sourceMaterial) &&
      (p.metalness === undefined || inRange(p.metalness, 0, 1)) &&
      (p.recess === undefined || inRange(p.recess, 0, .004)), 'Unknown or invalid source panel material');
    const { geometry, material } = parts.get(p.sourceMaterial);
    assert(p.role === 'glass' ? (material.transparent && inRange(material.opacity, .15, .8)) : !material.transparent,
      'The source glazing needs actual translucent material; the other door surfaces are opaque');
    panelBounds.union(bounds(geometry));
  }
  const panelTarget = ranges(mirror ? [0, 0, limit.min[2]] : [min, 0, limit.min[2]],
    mirror ? [-min, panelY, panelFront] : [max, panelY, panelFront]);
  const contributors = {};
  for (const p of design.panels) {
    const { geometry, material } = parts.get(p.sourceMaterial);
    contributors[p.role] = { material: p.sourceMaterial, triangles: geometry.attributes.position.count / 3 };
    const fitted = fit(geometry.clone(), panelBounds, panelTarget, mirror).translate(0, 0, -(p.recess ?? 0));
    add(prefix + p.role, fitted, p.role, { color: p.color,
      metalness: p.metalness ?? .04,
      roughness: p.role === 'glass' ? .31 : .66, ...(p.role === 'glass' ? { transparent: true, opacity: material.opacity, depthWrite: false } : {}) });
  }
  const handle = design.handle;
  assert(hex(handle.color) && inRange(handle.width, .018, .092) && inRange(handle.height, .026, .23) &&
    inRange(handle.distance, .30, .403) && inRange(handle.centerY, .63, 1.03), 'Handle fit is outside the portable physical parameters');
  if (handle.kind === 'source') {
    const donor = parts.get(handle.sourceMaterial);
    assert(donor && !donor.material.transparent, 'The selected handle must be physical source geometry');
    const geometry = handle.frontOnly ? geometryOnFront(donor.geometry) : donor.geometry.clone();
    const x = handle.distance * (mirror ? 1 : sign), y = handle.centerY;
    contributors.handle = { material: handle.sourceMaterial, triangles: geometry.attributes.position.count / 3 };
    add(prefix + 'handle', fit(geometry, bounds(geometry), ranges([x - handle.width / 2, y - handle.height / 2, panelFront - .001],
      [x + handle.width / 2, y + handle.height / 2, limit.max[2]]), mirror), 'handle',
    { color: handle.color, metalness: .65, roughness: .36 });
  } else {
    assert.equal(handle.kind, 'knob', 'Expected original pull or a solid manufactured knob');
    const x = sign * handle.distance, y = handle.centerY;
    const knob = new THREE.SphereGeometry(1, 12, 8).scale(handle.width / 2, handle.height / 2, .0065).translate(x, y, .0205);
    const pin = new THREE.CylinderGeometry(.007, .007, .010, 12).rotateX(Math.PI / 2).translate(x, y, .011);
    add(prefix + 'handle', merged([pin, knob]), 'handle', { color: handle.color, metalness: .62, roughness: .38 });
  }
  const hinges = hingeHeights.map(y => new THREE.CylinderGeometry(.0058, .0058, .059, 12, 1, false,
    id === 'left' ? 0 : Math.PI, Math.PI).translate(0, y, 0));
  add(prefix + 'hinges', merged(hinges), 'hinges', { color: handle.color, metalness: .67, roughness: .43 });
  for (const { geometry } of parts.values()) geometry.dispose();
  return { sourceNode: source.nodes[mirror ? 'left' : id], mirrored: mirror, contributors };
}

async function generate(design, source, scene, contract) {
  const group = new THREE.Group(), materials = new Map(), slots = {}, donor = {};
  group.name = design.id;
  function add(parent, name, geometry, slot, finish) {
    if (!materials.has(slot)) materials.set(slot, new THREE.MeshStandardMaterial({ name: slot, roughness: .73, ...finish }));
    const mesh = new THREE.Mesh(geometry, materials.get(slot));
    mesh.name = name;
    parent.add(mesh);
    (slots[slot] ??= []).push(name);
  }
  try {
    cabinetBody(design.body, contract.mounting, contract.garmentRail, contract.movingParts, design.handle.color, (...args) => add(group,...args));
    for (const part of contract.movingParts) {
      const pivot = new THREE.Group();
      pivot.name = contract.partNodes[part.id];
      pivot.position.fromArray(part.pivot);
      group.add(pivot);
      donor[part.id] = doorMeshes(design, source, scene, part, (...args) => add(pivot,...args));
    }
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true,
      copyright: source.author + ' (' + source.license + '); project-authored hinged wardrobe adaptation.' }));
    return { bytes, slots, donor };
  } finally {
    group.traverse(node => node.geometry?.dispose());
    for (const material of materials.values()) material.dispose();
  }
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
  parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-enclosed-wardrobe.mjs --check | --write | --output NEW_DIRECTORY [--parameters REPO_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one export mode');
assert(!args.parameters || args.output, 'Alternate parameters need isolated output');
const input = args.parameters ?? defaultInput;
const [inputBytes, contractBytes, generatorBytes, geometryBytes, environmentBytes, validatorBytes] = await Promise.all(
  [input, contractPath, generatorPath, geometryPath, environmentPath, editableValidator].map(read));
const recipe = JSON.parse(inputBytes), { resource: contract, schema, version } = JSON.parse(contractBytes);
assert.equal(schema, 'company-enclosed-wardrobe-contract');
assert.equal(version, 1);
const branch = JSON.parse(environmentBytes).groups.flatMap(group => group.branches).find(branch => branch.id === 'garment-rack-wardrobe');
assert.equal(branch?.fixedFunctionAndInstall.mount, contract.mount);
assert(recipe.schema === 'company-enclosed-wardrobe-collection' && recipe.version === 1 && Array.isArray(recipe.designs) && recipe.designs.length);
if (!args.parameters) assert.equal(recipe.designs.length, 4);
async function validateEditableSources() {
  try { return await editableSources(root, recipe); }
  catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'wardrobe-generation-failed', message: error.message }));
    process.exit(1);
  }
}
const editablePins = await validateEditableSources();
const collection = { schemaVersion: 1, id: 'company-enclosed-wardrobe-v1', sourceParameters: input, sourceParametersSha256: hash(inputBytes),
  contract: contractPath, contractSha256: hash(contractBytes), generator: generatorPath, generatorSha256: hash(generatorBytes), resources: [] };
const files = new Map(), seen = new Set(), sourceMeshes = new Map(), reports = [];
for (const design of recipe.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id) &&
    Number.isSafeInteger(design.version) && design.version > 0 && typeof design.displayName === 'string' && design.displayName.trim());
  const key = design.id + '@' + design.version;
  assert(!seen.has(key), 'Duplicate wardrobe identity ' + key);
  seen.add(key);
  assert(Object.hasOwn(recipe.sources, design.source), 'Declare the actual door donor');
  const source = recipe.sources[design.source];
  const editable = editablePins.get(design.source);
  if (!sourceMeshes.has(design.source)) sourceMeshes.set(design.source, await readDoorSource(source));
  const scene = sourceMeshes.get(design.source);
  const { bytes, slots, donor } = await generate(design, source, scene, contract);
  assert(bytes.equals((await generate(design, source, scene, contract)).bytes), 'Different bytes on repeated export of ' + key);
  const directory = '/company-assets/enclosed-wardrobe-v1/' + design.id + '/v' + design.version;
  const asset = { format: 'glb', url: directory + '/model.glb', bytes: bytes.length, sha256: hash(bytes) };
  const style = slots.glass ? 'glazed-frame' : slots.insert ? 'recessed-insert' : slots.inset ? 'framed-inset' : 'solid-panel';
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...contract, materialSlots: slots, asset,
    provenance: { license: source.license + ' source with project-authored wardrobe adaptation.', sourceDesign: style,
      sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256, generator: generatorPath,
      generatorSha256: collection.generatorSha256, functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      environmentBranchSource: environmentPath, environmentBranchSourceSha256: hash(environmentBytes), environmentBranch: branch.id,
      sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceAuthor: source.author, sourceLicense: source.license,
      sourceArchiveSha256: source.archiveSha256, sourceEntry: source.entry, sourceUrl: source.url,
      dependencies: { geometryValidation: { path: geometryPath, sha256: hash(geometryBytes) },
        editableSourceValidator: { path: editableValidator, sha256: hash(validatorBytes) },
        license: { path: source.licensePath, sha256: source.licenseSha256 }, ...(editable ? { editableSource: editable } : {}) },
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback'] },
  };
  const geometry = await inspectWardrobe(bytes, resource);
  for (const { id, meshes } of geometry.leaves) for (const [role, piece] of Object.entries(donor[id].contributors))
    assert.equal(meshes['wardrobe-' + id + '-' + role], piece.triangles, 'Donor triangles changed after fit');
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + directory + '/resource.json';
  files.set(modelPath, bytes);
  files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, modelPath, resourcePath, sha256: asset.sha256,
    geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  reports.push({ id: design.id, version: design.version, asset, donor, geometry, repeatedExportByteIdentical: true });
}
if (!args.parameters) assert.equal(new Set(reports.map(report => report.geometry.geometrySha256)).size, 4);
await validateEditableSources();
files.set(family + '/collection.json', json(collection));
const output = args.output && path.resolve(args.output);
if (output) {
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', resources: reports }));
}
const additions = [];
for (const [relative, bytes] of files) {
  const target = output ? path.join(output, relative) : projectPath(relative);
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
