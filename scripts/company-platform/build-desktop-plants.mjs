import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { desktopGlbChunks, inspectDesktopPlant, loadDesktopGlb, indexedPart, textureForPlantMesh } from './test-desktop-plant-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-desktop-plants-v1';
const inputPath = family + '/parameters.json', contractPath = family + '/contract.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-desktop-plants.mjs';
const geometryPath = 'scripts/company-platform/test-desktop-plant-assets.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const between = (value, lo, hi) => Number.isFinite(value) && lo <= value && value <= hi;
const integers = (value, lo, hi) => Number.isInteger(value) && between(value, lo, hi);
const tuple = (value, lo, hi) => Array.isArray(value) && value.length === 3 && value.every(n => between(n, lo, hi));
const hex = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const vector = position => new THREE.Vector3(...position);

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); })
      .catch(error => this.onerror?.(error));
  }
};

function projectPath(location) {
  assert(typeof location === 'string' && !/[\\:\0]/.test(location) &&
    location.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected portable project-relative source path');
  return path.join(root, location);
}
const read = location => fs.readFile(projectPath(location));

function merge(parts) {
  const compatible = parts.map(part => part.index ? part.toNonIndexed() : part);
  const model = mergeGeometries(compatible);
  for (const geometry of new Set([...compatible, ...parts])) geometry.dispose();
  assert(model, 'Plant parts have incompatible mesh attributes');
  return model;
}

// Shape the explicit 3D spine. Ribs follow the tube without laying strips over it.
function sweep(points, radius, shape, lengthSegments, sides) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, lengthSegments, radius, sides);
  const vertex = geometry.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments, centre = curve.getPointAt(t);
    for (let j = 0; j <= sides; j++) {
      const index = i * (sides + 1) + j;
      p.fromBufferAttribute(vertex, index).sub(centre).multiplyScalar(shape(t, j / sides)).add(centre);
      vertex.setXYZ(index, p.x, p.y, p.z);
    }
  }
  geometry.computeVertexNormals();
  return { curve, geometry };
}

function bentStem(points, radius, segments = 12) {
  return sweep(points, radius, t => 1 - .54 * t, segments, 10).geometry;
}

function plantBasis(soilY, scale) {
  assert(between(scale, .72, 1.15), 'Expected a bounded botanical scale');
  return point => {
    assert(tuple(point, -.20, .44), 'Invalid botanical control point');
    return vector(point).multiplyScalar(scale).add(new THREE.Vector3(0, soilY - .008, 0));
  };
}

function bonsai(shape, soilY, add) {
  const basis = plantBasis(soilY, shape.scale);
  assert(shape.trunk.length >= 4 && shape.trunk.length <= 8 && shape.branches.length >= 4 && shape.branches.length <= 8);
  const trunk = shape.trunk.map(basis), wood = [bentStem(trunk, .023 * shape.scale, 26)], crowns = [], newGrowth = [];
  for (const [index, branch] of shape.branches.entries()) {
    const { from, bend, tip, spread } = branch;
    assert(integers(from, 0, trunk.length - 1) && tuple(spread, .023, .145));
    const end = basis(tip), dimensions = vector(spread).multiplyScalar(shape.scale);
    wood.push(bentStem([trunk[from], basis(bend), end], .011 * shape.scale));
    for (const [n, [x, z, size]] of [[-.23, .02, .64], [.12, .04, .86], [.29, -.12, .46], [-.02, -.24, .60]].entries()) {
      const foliage = new THREE.IcosahedronGeometry(1, 2).scale(dimensions.x * size / 2, dimensions.y * (1 + .06 * n) / 2,
        dimensions.z * size / 2).translate(end.x + x * dimensions.x, end.y + .009 * shape.scale, end.z + z * dimensions.z);
      (n === index % 4 ? newGrowth : crowns).push(foliage);
    }
  }
  add('desktop-plant-stems', merge(wood), 'stems');
  add('desktop-plant-foliage', merge(crowns), 'foliage');
  add('desktop-plant-accent', merge(newGrowth), 'accent');
}

function cactus(shape, soilY, add) {
  const basis = plantBasis(soilY, shape.scale);
  assert(integers(shape.ribs, 7, 15) && shape.columns.length >= 3 && shape.columns.length <= 6);
  const blades = [], branches = [], buds = [];
  for (const [i, column] of shape.columns.entries()) {
    assert(column.path.length >= 3 && column.path.length <= 7 && between(column.radius, .014, .044));
    const radius = shape.scale * column.radius, radial = shape.ribs * 4;
    const { geometry } = sweep(column.path.map(basis), radius, (t, angle) => {
      const taper = t < .87 ? 1 - .17 * t : Math.sqrt(Math.max(.00002, 1 - ((t - .87) / .13) ** 2)) * .85;
      return taper * (1 + .13 * Math.cos(angle * 2 * Math.PI * shape.ribs));
    }, 24, radial);
    if (i) branches.push(geometry); else blades.push(geometry);
    const p = new THREE.Vector3();
    for (const row of [9, 13, 17, 21]) for (const step of [0, 1, 2]) {
      const j = (step * 4 + 12) % radial;
      p.fromBufferAttribute(geometry.attributes.position, row * (radial + 1) + j);
      buds.push(new THREE.IcosahedronGeometry(.00165 * shape.scale, 0).translate(p.x, p.y, p.z));
    }
  }
  add('desktop-plant-foliage', merge(blades), 'foliage');
  add('desktop-plant-stems', merge(branches), 'stems');
  add('desktop-plant-accent', merge(buds), 'accent');
}

function blade(base, tip, width, height, thickness, longitudinalSegments = 12) {
  const geometry = new THREE.SphereGeometry(1, 10, longitudinalSegments);
  const vertices = geometry.attributes.position, lateral = new THREE.Vector3(base.z - tip.z, 0, tip.x - base.x).normalize();
  const middle = t => base.clone().lerp(tip, t).add(new THREE.Vector3(0, Math.sin(Math.PI * t) * height, 0));
  for (let i = 0; i < vertices.count; i++) {
    const t = (vertices.getY(i) + 1) / 2, point = middle(t);
    point.addScaledVector(lateral, vertices.getX(i) * width * (.68 + .32 * (1 - t)) / 2);
    point.y += vertices.getZ(i) * thickness / 2;
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return { geometry, middle };
}

function broadleaf(shape, soilY, add) {
  const basis = plantBasis(soilY, shape.scale);
  assert(shape.leaves.length >= 5 && shape.leaves.length <= 12);
  const greens = [], petioles = [], newGrowth = [];
  for (const [i, leaf] of shape.leaves.entries()) {
    assert(between(leaf.width, .045, .10) && between(leaf.arch, .012, .056));
    const base = basis(leaf.base), tip = basis(leaf.tip);
    const { geometry, middle } = blade(base, tip, leaf.width * shape.scale, leaf.arch * shape.scale, .0048 * shape.scale);
    const root = new THREE.Vector3(.013 * Math.sin(i * 2), soilY - .008, .008 * Math.cos(i * 2));
    const vein = [0, .21, .46, .72].map(t => {
      const p = middle(t); p.y += .002 * shape.scale; return p;
    });
    petioles.push(bentStem([root, root.clone().lerp(base, .5).add(new THREE.Vector3(.004, .007, -.006)), ...vein],
      .004 * shape.scale, 14));
    (i > 3 && i % 2 ? newGrowth : greens).push(geometry);
  }
  add('desktop-plant-stems', merge(petioles), 'stems');
  add('desktop-plant-foliage', merge(greens), 'foliage');
  add('desktop-plant-accent', merge(newGrowth), 'accent');
}

function succulent(shape, soilY, add) {
  const basis = plantBasis(soilY, shape.scale);
  assert(shape.rings.length >= 2 && shape.rings.length <= 4);
  const blueGreen = [], freshGrowth = [];
  for (const [i, ring] of shape.rings.entries()) {
    assert(integers(ring.count, 4, 14) && between(ring.length, .021, .136) && between(ring.rise, .014, .115) &&
      between(ring.width, .014, .056) && between(ring.arch, .002, .04) && between(ring.start, 0, .034) &&
      between(ring.phase, 0, 1));
    for (let j = 0; j < ring.count; j++) {
      const turn = 2 * Math.PI * (j / ring.count + ring.phase), reach = ring.length * (1 + .065 * Math.cos(turn * 3));
      const base = basis([.014 * Math.cos(turn), ring.start, .014 * Math.sin(turn)]);
      const tip = basis([reach * Math.cos(turn), ring.rise, reach * Math.sin(turn)]);
      const item = blade(base, tip, ring.width * shape.scale, ring.arch * shape.scale, ring.width * .38 * shape.scale, 8);
      (i === 0 ? blueGreen : freshGrowth).push(item.geometry);
    }
  }
  const core = new THREE.SphereGeometry(.025 * shape.scale, 12, 8).scale(1, .65, 1).translate(0, soilY + .006, 0);
  add('desktop-plant-stems', core, 'stems');
  add('desktop-plant-foliage', merge(blueGreen), 'foliage');
  add('desktop-plant-accent', merge(freshGrowth), 'accent');
}

const forms = { 'tiered-bonsai': bonsai, 'ribbed-cactus': cactus, 'broadleaf-fan': broadleaf, 'succulent-rosette': succulent };

function paintedPlant(design, parts, anchor, add) {
  assert(Object.hasOwn(forms, design.form), 'Unknown editable plant form');
  assert(tuple(design.potScale, .30, 3), 'Pot needs three bounded fit values');
  const place = shape => shape.translate(...anchor).scale(...design.potScale);
  const pot = place(parts.pot.clone());
  pot.computeBoundingBox();
  add('desktop-plant-pot', pot, 'pot');
  let soilY;
  if (parts.soil) {
    const earthenInsert = place(parts.soil.clone());
    earthenInsert.computeBoundingBox();
    soilY = earthenInsert.boundingBox.max.y;
    add('desktop-plant-soil', earthenInsert, 'soil');
  } else {
    const { min, max } = pot.boundingBox;
    soilY = max.y - .004;
    const bed = new THREE.CylinderGeometry(1, 1, .009, 32).scale((max.x - min.x) * .394, 1, (max.z - min.z) * .394)
      .translate(0, soilY - .0045, 0);
    add('desktop-plant-soil', bed, 'soil');
  }
  forms[design.form](design.shape, soilY, add);
}

function stockPlant(design, parts, anchor, add, source) {
  assert(parts.foliage && between(design.fit?.height, .085, .54) && integers(design.fit.yawQuarterTurns, 0, 3),
    'Direct source plant needs a real canopy and a valid upright fit');
  const limits = new THREE.Box3();
  for (const mesh of Object.values(parts)) {
    mesh.computeBoundingBox();
    limits.union(mesh.boundingBox);
  }
  const scale = design.fit.height / (limits.max.y - limits.min.y);
  for (const [role, geometry] of Object.entries(parts)) {
    const meshName = 'desktop-plant-' + role;
    add(meshName, geometry.clone().translate(...anchor).rotateY(design.fit.yawQuarterTurns * Math.PI / 2)
      .scale(scale, scale, scale), role, source[role].material);
  }
}

const pad = (bytes, value = 0) => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, value)]);
function keepStockBaseColors(model, textures) {
  if (!textures.size) return model;
  const { gltf, binary } = desktopGlbChunks(model);
  const chunks = [binary], views = new Map();
  let offset = binary.length;
  gltf.images = []; gltf.textures = []; gltf.samplers = [];
  for (const [name, image] of textures) {
    let source = views.get(image.sha256);
    if (source === undefined) {
      const bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: image.bytes.length }) - 1;
      source = gltf.images.push({ bufferView, mimeType: 'image/png' }) - 1;
      views.set(image.sha256, source);
      const imageChunk = pad(image.bytes);
      chunks.push(imageChunk); offset += imageChunk.length;
    }
    const sampler = image.sampler ? gltf.samplers.push(image.sampler) - 1 : undefined;
    const index = gltf.textures.push({ source, sampler }) - 1;
    const target = gltf.nodes.find(node => node.name === name);
    const primitive = gltf.meshes[target.mesh].primitives[0];
    assert(primitive.attributes.TEXCOORD_0 !== undefined);
    gltf.materials[primitive.material].pbrMetallicRoughness.baseColorTexture = { index };
  }
  if (!gltf.samplers.length) delete gltf.samplers;
  gltf.buffers[0].byteLength = offset;
  const parts = [pad(Buffer.from(JSON.stringify(gltf)), 32), Buffer.concat(chunks)];
  const header = Buffer.alloc(12);
  [0x46546c67, 2, 28 + parts[0].length + parts[1].length].forEach((value, i) => header.writeUInt32LE(value, i * 4));
  return Buffer.concat([header, ...parts.flatMap((bytes, index) => {
    const descriptor = Buffer.alloc(8);
    descriptor.writeUInt32LE(bytes.length, 0);
    descriptor.writeUInt32LE(index ? 0x004e4942 : 0x4e4f534a, 4);
    return [descriptor, bytes];
  })]);
}

async function generate(design, source, donor) {
  const group = new THREE.Group();
  group.name = design.id;
  const stock = design.form === 'stock-plant', parts = {}, materials = {}, slots = {}, textures = new Map();
  const chosenNodes = new Set();
  for (const role of (stock ? ['pot', 'soil', 'foliage'] : ['pot', 'soil'])) {
    const name = source[role + 'Node'];
    if (name !== undefined) {
      const mesh = donor.getObjectByName(name);
      assert(!chosenNodes.has(mesh), 'A source mesh must map to only one plant component');
      parts[role] = indexedPart(mesh, name);
      chosenNodes.add(mesh);
      const texture = textureForPlantMesh(donor, mesh);
      assert(stock || !texture, 'Use stock-plant to preserve textures from a source component');
      if (texture) textures.set('desktop-plant-' + role, texture);
    }
  }
  assert(parts.pot, 'Expected a real pot from the approved original asset');
  parts.pot.computeBoundingBox();
  const centre = parts.pot.boundingBox.getCenter(new THREE.Vector3()), anchor = [-centre.x, -parts.pot.boundingBox.min.y, -centre.z];
  function add(name, geometry, role, previous) {
    const finish = previous ? previous.clone() : new THREE.MeshStandardMaterial({ color: design.finish[role],
      roughness: role === 'pot' ? .65 : .92, metalness: 0 });
    finish.map = null;
    finish.name = previous ? previous.name : 'desktop-plant-' + role;
    const mesh = new THREE.Mesh(geometry, finish);
    mesh.name = name;
    materials[role] = finish;
    group.add(mesh);
    slots[role] = [name];
  }
  try {
    if (stock) {
      donor.traverse(mesh => {
        assert(!mesh.isMesh || chosenNodes.has(mesh), 'All meshes in a stock plant need a declared component role');
      });
      const bindings = Object.fromEntries(Object.keys(parts).map(role => [role, donor.getObjectByName(source[role + 'Node'])]));
      stockPlant(design, parts, anchor, add, bindings);
    } else {
      assert(['pot', 'soil', 'stems', 'foliage', 'accent'].every(slot => hex(design.finish?.[slot])), 'Expected actual ceramic and foliage colors');
      paintedPlant(design, parts, anchor, add);
    }
    const raw = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true,
      copyright: `${source.author} (${source.license}) and project-authored desktop plant adaptation.` }));
    return { slots, bytes: keepStockBaseColors(raw, textures), textures };
  } finally {
    group.traverse(node => node.geometry?.dispose());
    for (const material of Object.values(materials)) material.dispose();
    for (const geometry of Object.values(parts)) geometry.dispose();
  }
}

async function sourceModel(source) {
  assert(typeof source?.author === 'string' && source.author.trim() && source.author.length <= 160 && !/[\r\n]/.test(source.author) &&
    ['CC0-1.0', 'Project-authorized-original'].includes(source.license), 'Expected a declared licensed donor with its author');
  assert(source.url === undefined || /^https:\/\//.test(source.url));
  if (source.entry !== undefined || source.archiveSha256 !== undefined)
    assert(typeof source.entry === 'string' && source.entry.trim() && /^[a-f0-9]{64}$/.test(source.archiveSha256));
  const [bytes, license] = await Promise.all([source.path, source.licensePath].map(read));
  assert.equal(hash(bytes), source.sha256, 'Source artifact differs');
  assert.equal(hash(license), source.licenseSha256, 'Source license differs');
  assert(license.toString('utf8').trim(), 'The declared source must include written authorization');
  return loadDesktopGlb(bytes);
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
  parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-desktop-plants.mjs --check | --write | --output NEW_DIRECTORY [--parameters REPO_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use a single production mode');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const input = args.parameters ?? inputPath;
const [parameterBytes, contractBytes, generatorBytes, geometryBytes, branchBytes] = await Promise.all(
  [input, contractPath, generatorPath, geometryPath, branchPath].map(read)
);
const recipe = JSON.parse(parameterBytes), { schema, version, stockImport, ...contract } = JSON.parse(contractBytes);
assert.equal(schema, 'company-desktop-plants-contract');
assert.equal(version, 1);
assert.equal(stockImport.baseColorImage, 'image/png');
assert.equal(stockImport.uvSet, 0);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(entry => entry.id === contract.productionBranch);
assert.equal(branch?.fixedFunctionAndInstall.state, 'static');
assert.equal(recipe.schema, 'company-desktop-plants-collection');
assert(recipe.version === 1 && Array.isArray(recipe.designs) && recipe.designs.length);
if (!args.parameters) assert.equal(recipe.designs.length, 4);
const collection = { schemaVersion: 1, id: 'company-desktop-plants-v1', generator: generatorPath, generatorSha256: hash(generatorBytes),
  contract: contractPath, contractSha256: hash(contractBytes), sourceParameters: input, sourceParametersSha256: hash(parameterBytes), resources: [] };
const files = new Map(), cached = new Map(), reports = [], seen = new Set();
for (const design of recipe.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id) &&
    Number.isSafeInteger(design.version) && design.version > 0 && typeof design.displayName === 'string' && design.displayName.trim(),
  'Expected valid plant identity');
  const key = design.id + '@' + design.version;
  assert(!seen.has(key), 'Duplicate plant ' + key); seen.add(key);
  const source = recipe.sources[design.source];
  if (!cached.has(design.source)) cached.set(design.source, await sourceModel(source));
  const donor = cached.get(design.source);
  const { bytes, slots, textures } = await generate(design, source, donor);
  assert(bytes.equals((await generate(design, source, donor)).bytes), 'Re-export changed bytes for ' + key);
  const directory = '/company-assets/desktop-plants-v1/' + design.id + '/v' + design.version;
  const asset = { format: 'glb', url: directory + '/model.glb', sha256: hash(bytes), bytes: bytes.length };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...contract, materialSlots: slots, asset,
    provenance: { license: source.license + ' original component with project-authored desktop adaptation.', sourceDesign: design.form,
      sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256, generator: generatorPath,
      generatorSha256: collection.generatorSha256, functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      environmentBranchSource: branchPath, environmentBranchSourceSha256: hash(branchBytes), environmentBranch: branch.id,
      sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceAuthor: source.author, sourceLicense: source.license,
      sourceUrl: source.url, sourceArchiveSha256: source.archiveSha256, sourceEntry: source.entry,
      sourceComponents: [source.potNode, source.soilNode, design.form === 'stock-plant' ? source.foliageNode : undefined].filter(Boolean),
      ...(textures.size ? { baseColorImages: Object.fromEntries([...textures].map(([node, image]) =>
        [node, { sha256: image.sha256, dimensions: image.size, uvSet: 0 }])) } : {}),
      dependencies: { geometryValidation: { path: geometryPath, sha256: hash(geometryBytes) },
        license: { path: source.licensePath, sha256: source.licenseSha256 } },
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback'],
    },
  };
  const geometry = await inspectDesktopPlant(bytes, resource, design, donor, source);
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + directory + '/resource.json';
  files.set(modelPath, bytes); files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath, sha256: asset.sha256,
    geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  reports.push({ id: design.id, version: design.version, geometry, asset, repeatedExportByteIdentical: true });
}
for (const field of ['geometrySha256', 'foliageSha256'])
  assert.equal(new Set(reports.map(item => item.geometry[field])).size, reports.length, 'Plant geometries must genuinely differ');
files.set(family + '/collection.json', json(collection));
const output = args.output && path.resolve(args.output);
if (output) {
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', scope: 'Actual plant GLB, tabletop contact, original geometry, living silhouette', resources: reports }));
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
