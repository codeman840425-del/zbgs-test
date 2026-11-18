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

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceDirectory = 'assets-source/company-desk-lamp-v1';
const defaultParameters = sourceDirectory + '/parameters.json';
const contractPath = sourceDirectory + '/contract.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-desk-lamp-collection.mjs';
const publicPath = 'company-assets/desk-lamp-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const xyz = values => new THREE.Vector3(...values);
const radians = THREE.MathUtils.degToRad;
const round = array => array.map(value => Number(value.toFixed(9)));
const tolerance = 1e-6;

function projectPath(relative) {
  assert(typeof relative === 'string' && relative.split('/').every(segment => segment && segment !== '.' && segment !== '..') &&
    !/[\\:]/.test(relative), `Expected a project-relative source path: ${relative}`);
  return path.join(root, relative);
}

async function parseGlb(bytes) {
  assert(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 &&
    bytes.readUInt32LE(8) === bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a, 'Expected a complete GLB 2');
  const model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert(!model.images?.length && model.buffers.every(buffer => buffer.uri === undefined), 'Expected an offline solid-material GLB');
  const result = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  result.scene.updateMatrixWorld(true);
  return result.scene;
}

async function stockModels(archive, designs) {
  const requested = designs.filter(design => design.source).map(design => design.source);
  if (!requested.length) return new Map();
  const bytes = await fs.readFile(projectPath(archive.path));
  assert.equal(sha256(bytes), archive.sha256, 'Source archive has changed');
  const selected = new Set([...requested.map(source => source.entry), archive.licenseEntry]);
  const entries = unzipSync(bytes, { filter: entry => selected.has(entry.name) });
  assert(entries[archive.licenseEntry], 'Missing archive license');
  assert.equal(sha256(entries[archive.licenseEntry]), archive.licenseSha256, 'Source license has changed');
  const result = new Map();
  for (const reference of requested) {
    assert(entries[reference.entry], `Missing source ${reference.entry}`);
    assert.equal(sha256(entries[reference.entry]), reference.sha256, `Source digest differs: ${reference.entry}`);
    if (!result.has(reference.entry)) {
      const scene = await parseGlb(Buffer.from(entries[reference.entry]));
      const meshes = new Map();
      scene.traverse(node => {
        if (!node.isMesh) return;
        assert(node.material.isMeshStandardMaterial && !meshes.has(node.material.name), 'Expected one source primitive per material');
        meshes.set(node.material.name, node);
      });
      result.set(reference.entry, meshes);
    }
  }
  return result;
}

function meshGeometry(part, stock) {
  const size = part.dimensions;
  switch (part.shape) {
    case 'box': return new THREE.BoxGeometry(...size);
    case 'cylinder': return new THREE.CylinderGeometry(...size);
    case 'disc': return new THREE.CircleGeometry(...size);
    case 'plane': return new THREE.PlaneGeometry(...size);
    case 'rod': return new THREE.CylinderGeometry(size[0], size[0], xyz(part.from).distanceTo(xyz(part.to)), size[1]);
    case 'tube': {
      const curve = new THREE.CurvePath();
      for (const controls of part.curves) curve.add(new THREE.CubicBezierCurve3(...controls.map(xyz)));
      const [radius, segments, crossSection] = size;
      return new THREE.TubeGeometry(curve, segments, radius, crossSection, false);
    }
    case 'source': {
      const primitive = stock?.get(part.sourceMaterial);
      assert(primitive, `Missing source primitive ${part.sourceMaterial}`);
      // Kenney primitives share vertices. Retain each material's own indexed triangles.
      const geometry = primitive.geometry.index ? primitive.geometry.toNonIndexed() : primitive.geometry.clone();
      const [x, y, z] = part.sourceOrigin;
      return geometry.applyMatrix4(primitive.matrixWorld).translate(-x, -y, -z).scale(...part.scale);
    }
    default: throw new Error(`Unsupported lamp shape: ${part.shape}`);
  }
}

function createModel(design, stock, contract) {
  const rootModel = new THREE.Group();
  rootModel.name = design.id;
  const head = new THREE.Group();
  head.name = contract.light.aim.pivot;
  head.position.fromArray(design.head.position);
  head.rotation.x = radians(design.head.pitchDegrees);
  rootModel.add(head);
  const finishes = new Map(Object.entries(design.materials).map(([slot, values]) => [slot, new THREE.MeshStandardMaterial(values)]));
  finishes.set('diffuser', new THREE.MeshStandardMaterial({ color: contract.display.diffuser.offColor, roughness: .71 }));
  const slots = {};
  const names = new Set([design.id, head.name]);
  function add(part, parent) {
    const slot = part.finish ?? 'body';
    assert(!names.has(part.name), `Duplicate lamp part ${part.name}`);
    names.add(part.name);
    const sourceMaterial = part.shape === 'source' ? stock?.get(part.sourceMaterial)?.material : null;
    if (sourceMaterial && !finishes.has(slot)) finishes.set(slot, sourceMaterial.clone());
    const material = finishes.get(slot);
    assert(material, `Unknown lamp finish ${slot}`);
    material.name = `desk-lamp-${slot}`;
    const mesh = new THREE.Mesh(meshGeometry(part, stock), material);
    mesh.name = part.name;
    mesh.position.fromArray(part.at ?? [0, 0, 0]);
    if (part.rotateDegrees) mesh.rotation.set(...part.rotateDegrees.map(radians));
    if (part.shape === 'rod') {
      const start = xyz(part.from), end = xyz(part.to);
      mesh.position.addVectors(start, end).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    }
    parent.add(mesh);
    (slots[slot] ??= []).push(mesh.name);
  }
  for (const part of design.stand) add(part, rootModel);
  for (const part of design.head.parts) add(part, head);
  add({ ...design.head.diffuser, name: contract.light.aim.emitter, finish: 'diffuser' }, head);
  return { scene: rootModel, slots };
}

async function exportModel(design, stock, contract) {
  const { scene, slots } = createModel(design, stock, contract);
  const materials = new Set();
  try {
    const copyright = design.source ? 'Contains Kenney Furniture Kit 2.0 geometry, CC0-1.0; lighting adaptation authored for this project.' :
      'Project-authored desk-lamp geometry.';
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, copyright }));
    return { bytes, slots };
  } finally {
    scene.traverse(node => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      materials.add(node.material);
    });
    for (const material of materials) material.dispose();
  }
}

function inspectTriangles(scene) {
  const triangles = [];
  const materials = new Set();
  const names = [];
  const floorContact = new Map();
  scene.traverse(node => {
    if (!node.isMesh) return;
    names.push(node.name);
    materials.add(node.material);
    const points = node.geometry.getAttribute('position');
    const index = node.geometry.getIndex();
    assert(points?.count > 0, `No actual vertices in ${node.name}`);
    for (let offset = 0; offset < (index?.count ?? points.count); offset += 3) {
      const vertices = [0, 1, 2].map(delta => {
        const vertexIndex = index?.getX(offset + delta) ?? offset + delta;
        return new THREE.Vector3().fromBufferAttribute(points, vertexIndex).applyMatrix4(node.matrixWorld);
      });
      assert(vertices.every(vertex => vertex.toArray().every(Number.isFinite)), `Non-finite vertex in ${node.name}`);
      const key = vertices.map(vertex => round(vertex.toArray()).join(',')).sort().join(':');
      triangles.push(key);
      if (!vertices.every(vertex => Math.abs(vertex.y) <= tolerance)) continue;
      const [a, b, c] = vertices;
      const area = Math.abs(b.sub(a).cross(c.sub(a)).y) / 2;
      if (area > 1e-10) floorContact.set(key, area);
    }
  });
  const contactArea = [...floorContact.values()].reduce((sum, area) => sum + area, 0);
  assert(triangles.length > 0 && triangles.length <= 2500 && names.length <= 32 && materials.size <= 4, 'Lamp mesh exceeds geometry budget');
  assert(contactArea > 1e-5, 'Lamp must have positive-area desktop contact');
  return { meshCount: names.length, materialCount: materials.size, nodeNames: names, triangles: triangles.length,
    geometrySha256: sha256(triangles.sort().join('\n')), desktopContactAreaSquareMetres: contactArea };
}

function inspectAim(scene, contract) {
  const { mounting, light: { aim, distance } } = contract;
  const pivot = scene.getObjectByName(aim.pivot), emitter = scene.getObjectByName(aim.emitter);
  assert(pivot && emitter?.isMesh && emitter.parent === pivot && emitter.material.isMeshStandardMaterial,
    'A PBR diffuser must be attached directly to the rotating head');
  const neutral = pivot.quaternion.clone();
  const dir = xyz(aim.direction);
  const axis = xyz(aim.axis);
  const range = contract.stateSchema[aim.stateField];
  emitter.geometry.computeBoundingBox();
  const panel = emitter.geometry.boundingBox;
  assert(panel.containsPoint(new THREE.Vector3()) && panel.max.z === 0 && panel.min.z === 0 &&
    panel.max.x > panel.min.x && panel.max.y > panel.min.y, 'Diffuser must have a centred physical output plane');
  const center = new THREE.Raycaster(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  center.ray.origin.applyMatrix4(emitter.matrixWorld);
  center.ray.direction.transformDirection(emitter.matrixWorld);
  assert(center.intersectObject(emitter, false).length > 0, 'Diffuser must expose its front-facing surface');
  const probes = [];
  for (const angle of [0, ...Array.from({ length: 17 }, (_, index) => range.min + (range.max - range.min) * index / 16).filter(value => value !== 0)]) {
    pivot.quaternion.copy(neutral).multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene, true);
    assert(bounds.min.y >= -tolerance && bounds.max.y <= mounting.height + tolerance &&
      bounds.min.x >= -mounting.width / 2 - tolerance && bounds.max.x <= mounting.width / 2 + tolerance &&
      bounds.min.z >= -mounting.depth / 2 - tolerance && bounds.max.z <= mounting.depth / 2 + tolerance,
      `Lamp at angle ${angle} exceeds its installation envelope: ${JSON.stringify({ min: bounds.min.toArray(), max: bounds.max.toArray() })}`);
    const position = emitter.localToWorld(dir.clone().multiplyScalar(aim.offset));
    const direction = dir.clone().transformDirection(emitter.matrixWorld);
    assert(direction.y < 0, 'Lamp axis must point toward the desktop');
    const deskDistance = -position.y / direction.y;
    assert(deskDistance > 0 && deskDistance < distance, 'Lamp axis must reach the desktop within the spot distance');
    const beam = new THREE.Raycaster(position, direction, 0, deskDistance);
    const hit = beam.intersectObject(scene, true)[0];
    assert(!hit, `${scene.children[0]?.name} ${hit?.object.name} occludes its own beam at angle ${angle}`);
    const target = position.clone().add(direction);
    const deskHit = position.clone().addScaledVector(direction, deskDistance);
    probes.push({ angle, position: round(position.toArray()), target: round(target.toArray()), direction: round(direction.toArray()),
      deskHit: round(deskHit.toArray()), bounds: { min: round(bounds.min.toArray()), max: round(bounds.max.toArray()) } });
  }
  return probes;
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' },
  output: { type: 'string' }, parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-desk-lamp-collection.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one of --check, --write or --output NEW_DIRECTORY');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const parametersPath = args.parameters ?? defaultParameters;
const [parameterBytes, contractBytes, branchBytes, generatorBytes] = await Promise.all(
  [parametersPath, contractPath, branchPath, generatorPath].map(relative => fs.readFile(projectPath(relative))),
);
const parameters = JSON.parse(parameterBytes), contract = JSON.parse(contractBytes);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(item => item.id === contract.productionBranch);
const { dimensionsMeters, mount, parent } = branch.fixedFunctionAndInstall;
assert.deepEqual(contract.mounting, { origin: 'bottom', width: dimensionsMeters.width, height: dimensionsMeters.height, depth: dimensionsMeters.depth });
assert.equal(contract.mount, mount);
assert.equal(contract.parent, parent);
assert.equal(branch.fixedFunctionAndInstall.state, 'on-intensity-angle');
assert(parameters.schema === 'company-desk-lamp-collection' && parameters.version === 1 && parameters.designs?.length > 0,
  'Expected company-desk-lamp-collection version 1');
if (!args.parameters) assert.equal(parameters.designs.length, 4);
const stock = await stockModels(parameters.archive, parameters.designs);
const collection = { schemaVersion: 1, id: 'company-desk-lamp-v1', generator: generatorPath, generatorSha256: sha256(generatorBytes),
  sourceParameters: parametersPath, sourceParametersSha256: sha256(parameterBytes),
  contract: contractPath, contractSha256: sha256(contractBytes), resources: [] };
const files = new Map();
const reports = [];
const seen = new Set();
for (const design of parameters.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && Number.isInteger(design.version) && design.version > 0 && design.displayName,
    'Design requires a portable ID, positive version and display name');
  const label = `${design.id}@${design.version}`;
  assert(!seen.has(label), `Duplicate desk lamp version ${label}`);
  seen.add(label);
  const source = stock.get(design.source?.entry);
  const first = await exportModel(design, source, contract);
  assert.deepEqual(first.bytes, (await exportModel(design, source, contract)).bytes, `Non-deterministic export ${label}`);
  const scene = await parseGlb(first.bytes);
  const geometry = inspectTriangles(scene);
  const probes = inspectAim(scene, contract);
  const [neutral] = probes;
  const destination = `${publicPath}/${design.id}/v${design.version}`;
  const { schema, version, ...resourceContract } = contract;
  const provenance = {
    license: design.source ? 'CC0-1.0 source geometry with project-authored adaptation' : 'Project-authored geometry',
    tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback'],
    sourceParameters: parametersPath, sourceParametersSha256: collection.sourceParametersSha256,
    functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
    environmentBranchSource: branchPath, environmentBranchSourceSha256: sha256(branchBytes), environmentBranch: branch.id,
    generator: generatorPath, generatorSha256: collection.generatorSha256,
    ...(design.source ? { sourceArtifactPath: parameters.archive.path, sourceArtifactSha256: parameters.archive.sha256,
      sourceModelEntry: design.source.entry, sourceGlbSha256: design.source.sha256, sourceAuthor: parameters.archive.author,
      sourceUrl: parameters.archive.url, sourceLicense: parameters.archive.license, sourceLicenseEntry: parameters.archive.licenseEntry,
      sourceLicenseSha256: parameters.archive.licenseSha256 } : {}),
  };
  const asset = { format: 'glb', url: '/' + destination + '/model.glb', sha256: sha256(first.bytes), bytes: first.bytes.length };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...resourceContract,
    light: { ...contract.light, position: neutral.position, target: neutral.target },
    materialSlots: first.slots, provenance, asset };
  // Diffuser colour comes from the light state rather than a finish override.
  delete resource.materialSlots.diffuser;
  const modelPath = 'prototype/public/' + destination + '/model.glb';
  const resourcePath = 'prototype/public/' + destination + '/resource.json';
  files.set(modelPath, first.bytes);
  files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath,
    sha256: asset.sha256, triangles: geometry.triangles, geometrySha256: geometry.geometrySha256 });
  reports.push({ id: design.id, version: design.version, asset, geometry, aim: probes, repeatedExportByteIdentical: true });
}
assert.equal(new Set(reports.map(report => report.geometry.geometrySha256)).size, reports.length, 'Lamp geometry must differ between appearances');
files.set(sourceDirectory + '/collection.json', json(collection));
if (args.output) {
  const out = path.resolve(args.output);
  await fs.mkdir(out);
  files.set('report.json', json({ status: 'passed', scope: 'CPU GLB readback and rays; no browser framebuffer or lighting transport', resources: reports }));
  for (const [relative, bytes] of files) {
    const file = path.join(out, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes, { flag: 'wx' });
  }
} else {
  const missing = [];
  for (const [relative, candidate] of files) {
    const existing = await fs.readFile(projectPath(relative)).catch(error => {
      if (error.code === 'ENOENT' && args.write) return null;
      throw error;
    });
    if (existing === null) missing.push([relative, candidate]);
    else assert(existing.equals(candidate), `Existing ${relative} differs. Keep the published version and use --output for a candidate.`);
  }
  for (const [relative, candidate] of missing) {
    const file = projectPath(relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, candidate, { flag: 'wx' });
  }
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
