import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); }
};

const rootPath = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = 'assets-source/company-cable-route-v1/parameters.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-cable-route.mjs';
const parseArg = name => { const value = process.argv.find(item => item.startsWith(`--${name}=`)); return value ? value.slice(name.length + 3) : undefined; };
const outputRoot = path.resolve(rootPath, parseArg('out-dir') || 'prototype/public/company-assets/cable-route-v1');
const checkMode = process.argv.includes('--check');
const source = JSON.parse(await fs.readFile(path.resolve(rootPath, sourcePath), 'utf8'));
const branch = JSON.parse(await fs.readFile(path.resolve(rootPath, branchPath), 'utf8'));
const branchSpec = branch.groups.flatMap(group => group.branches).find(item => item.id === 'cable-route');
if (!branchSpec) throw new Error('cable-route branch missing from environment specs');
const sourceHash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = color => new THREE.Color(color);

function material(color, roughness = 0.62, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color: hex(color), roughness, metalness, transparent: false, opacity: 1 });
}
function addBox(rootObject, name, size, materialValue, position, role = 'route') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materialValue);
  mesh.name = name; mesh.position.fromArray(position); mesh.userData.cableRole = role; rootObject.add(mesh); return mesh;
}
function addTube(rootObject, name, points, radius, materialValue) {
  const centers = points.map(point => new THREE.Vector3(...point));
  const radial = 8, positions = [], indices = [];
  for (let index = 0; index < centers.length; index += 1) {
    const tangent = (centers[Math.min(index + 1, centers.length - 1)] ?? centers[index]).clone().sub(centers[Math.max(index - 1, 0)] ?? centers[index]).normalize();
    const reference = Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const n1 = tangent.clone().cross(reference).normalize(), n2 = tangent.clone().cross(n1).normalize();
    for (let side = 0; side < radial; side += 1) {
      const angle = side / radial * Math.PI * 2;
      positions.push(centers[index].x + radius * (n1.x * Math.cos(angle) + n2.x * Math.sin(angle)), centers[index].y + radius * (n1.y * Math.cos(angle) + n2.y * Math.sin(angle)), centers[index].z + radius * (n1.z * Math.cos(angle) + n2.z * Math.sin(angle)));
    }
  }
  for (let index = 0; index < centers.length - 1; index += 1) for (let side = 0; side < radial; side += 1) {
    const next = (side + 1) % radial, a = index * radial + side, b = index * radial + next, c = (index + 1) * radial + next, d = (index + 1) * radial + side;
    indices.push(a, b, d, b, c, d);
  }
  const startCenter = positions.length / 3; positions.push(...centers[0].toArray());
  const endCenter = positions.length / 3; positions.push(...centers.at(-1).toArray());
  for (let side = 0; side < radial; side += 1) { const next = (side + 1) % radial; indices.push(startCenter, next, side); const end = (centers.length - 1) * radial; indices.push(endCenter, end + side, end + next); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materialValue);
  mesh.name = name; mesh.userData.cableRole = 'route'; mesh.userData.capped = true; rootObject.add(mesh); return mesh;
}
function addBetween(rootObject, name, from, to, thickness, materialValue) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a), length = delta.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, thickness), materialValue);
  mesh.name = name; mesh.userData.cableRole = 'route'; mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.normalize()); rootObject.add(mesh); return mesh;
}
function endpointNodes(rootObject, materials) {
  addBox(rootObject, 'endpoint-A', [0.038, 0.006, 0.016], materials.endpoint, [-0.684, 0, 0], 'endpoint');
  addBox(rootObject, 'endpoint-B', [0.038, 0.006, 0.016], materials.endpoint, [0.684, 0, 0], 'endpoint');
  addBox(rootObject, 'plug-A-head', [0.018, 0.01, 0.018], materials.accent, [-0.674, 0, 0], 'route');
  addBox(rootObject, 'plug-B-head', [0.018, 0.01, 0.018], materials.accent, [0.674, 0, 0], 'route');
}

function makeCable(design, sourceOverride = {}) {
  const params = { ...design.parameters, ...sourceOverride };
  const rootObject = new THREE.Group();
  rootObject.name = `cable-route-${design.id}`;
  rootObject.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: 'Endpoint A', designId: design.id, sourceVersion: source.version };
  const materials = { body: material(['#43566a', '#6a4a3d', '#4d695a', '#6d5d79'][source.designs.indexOf(design)]), accent: material('#c7a96b', 0.5, 0.25), endpoint: material('#242b35', 0.56, 0.18) };
  endpointNodes(rootObject, materials);
  if (design.id === 'single-sleeve') {
    const radius = Number(params.width ?? params.radius * 2 ?? 0.012) / 2;
    addTube(rootObject, 'single-sleeve-link-A', [[-0.665, 0, 0], [-0.659, 0, 0]], radius, materials.body);
    addTube(rootObject, 'single-sleeve-route', [[-0.659, 0, 0], [-0.52, 0, 0], [-0.28, 0.005, 0.002], [0, params.arcHeight ?? 0.009, params.arcDepth ?? 0.003], [0.28, 0.005, -0.002], [0.52, 0, 0], [0.659, 0, 0]], radius, materials.body);
    addTube(rootObject, 'single-sleeve-link-B', [[0.659, 0, 0], [0.665, 0, 0]], radius, materials.body);
  } else if (design.id === 'dual-sleeve') {
    const sep = params.separation ?? 0.008, radius = params.radius ?? 0.004;
    addBox(rootObject, 'dual-comb-A', [0.008, 0.008, sep * 2 + radius * 2], materials.accent, [-0.661, 0, 0]);
    addBox(rootObject, 'dual-comb-B', [0.008, 0.008, sep * 2 + radius * 2], materials.accent, [0.661, 0, 0]);
    for (const [index, z] of [[0, -sep / 2], [1, sep / 2]]) {
      const sign = index === 0 ? 1 : -1;
      addTube(rootObject, `dual-sleeve-${index ? 'upper' : 'lower'}`, [[-0.665, 0, z], [-0.5, 0, z], [-0.25, 0.004, z + sign * 0.002], [0, params.arcHeight ?? 0.008, z - sign * (params.arcDepth ?? 0.004)], [0.25, 0.004, z + sign * 0.002], [0.5, 0, z], [0.665, 0, z]], radius, materials.body);
    }
  } else if (design.id === 'braided-loop') {
    const segmentCount = Math.max(4, Number(params.segments ?? 8));
    const strand = invert => Array.from({ length: segmentCount + 1 }, (_, index) => {
      const t = index / segmentCount, x = -0.665 + 1.33 * t, wave = Math.sin(t * Math.PI * segmentCount) * 0.002;
      const straight = index <= 1 || index >= segmentCount - 1;
      const z = straight ? 0 : (index % 2 ? params.loopDepth : -params.loopDepth) * (invert ? -1 : 1);
      return [straight ? (index === 0 ? -0.662 : index === segmentCount ? 0.662 : x) : x, straight ? 0 : params.loopHeight + wave, z];
    });
    addTube(rootObject, 'braided-link-A', [[-0.665, 0, 0], [-0.662, 0, 0]], params.segmentRadius, materials.body);
    addTube(rootObject, 'braided-strand-A', strand(false), params.segmentRadius, materials.body);
    addTube(rootObject, 'braided-strand-B', strand(true), params.segmentRadius, materials.accent);
    addTube(rootObject, 'braided-link-B', [[0.662, 0, 0], [0.665, 0, 0]], params.segmentRadius, materials.body);
  } else if (design.id === 'flat-ribbon') {
    addBox(rootObject, 'flat-ribbon-main', [1.33, params.ribbonHeight ?? 0.006, params.ribbonDepth ?? 0.012], materials.body, [0, 0.002, 0]);
    addBox(rootObject, 'flat-ribbon-stripe-front', [1.30, 0.002, params.stripeWidth ?? 0.002], materials.accent, [0, 0.006, 0.003]);
    addBox(rootObject, 'flat-ribbon-stripe-back', [1.30, 0.002, params.stripeWidth ?? 0.002], materials.accent, [0, 0.006, -0.003]);
    addBetween(rootObject, 'flat-ribbon-bow-A', [-0.6625, 0, 0], [-0.40, params.bowHeight ?? 0.008, 0], 0.005, materials.body);
    addBetween(rootObject, 'flat-ribbon-bow-B', [-0.40, params.bowHeight ?? 0.008, 0], [0, 0, 0], 0.005, materials.body);
    addBetween(rootObject, 'flat-ribbon-bow-C', [0, 0, 0], [0.40, params.bowHeight ?? 0.008, 0], 0.005, materials.body);
    addBetween(rootObject, 'flat-ribbon-bow-D', [0.40, params.bowHeight ?? 0.008, 0], [0.6625, 0, 0], 0.005, materials.body);
  } else throw new Error(`Unknown cable design ${design.id}`);
  bakeIdentity(rootObject);
  rootObject.updateMatrixWorld(true);
  return { rootObject, materials };
}

function dispose(object) { const materials = new Set(); object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); }); materials.forEach(value => value.dispose()); }
function routeNodesFor(designId) {
  if (designId === 'single-sleeve') return ['single-sleeve-link-A', 'single-sleeve-route', 'single-sleeve-link-B'];
  if (designId === 'dual-sleeve') return ['dual-comb-A', 'dual-comb-B', 'dual-sleeve-lower', 'dual-sleeve-upper'];
  if (designId === 'braided-loop') return ['braided-link-A', 'braided-strand-A', 'braided-strand-B', 'braided-link-B'];
  return ['flat-ribbon-main', 'flat-ribbon-stripe-front', 'flat-ribbon-stripe-back', ...Array.from({ length: 4 }, (_, index) => `flat-ribbon-bow-${String.fromCharCode(65 + index)}`)];
}
function bakeIdentity(rootObject) {
  rootObject.traverse(node => {
    if (!node.isMesh) return;
    node.updateMatrix();
    node.geometry.applyMatrix4(node.matrix);
    node.position.set(0, 0, 0); node.rotation.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1); node.updateMatrix();
  });
}
function resourceFor(design, bytes, actual, hashes) {
  return {
    id: `cable-route-${design.id}`, displayName: design.label, version: 1, category: 'decor', mount: 'parent-device-endpoints', mountRole: 'cable-route',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Endpoint A', scale: 'Identity only' },
    productionBranch: 'cable-route',
    provenance: { license: design.license, prompt: `${source.promptStandard} Design direction: ${design.prompt}`, tools: [`Three.js ${THREE.REVISION}`, 'BoxGeometry', 'Capped polyline tube', 'GLTFExporter', 'GLTFLoader readback'], sourceParameters: sourcePath, sourceParametersSha256: hashes.sourceHash, sourceDesign: design.id, functionalContractSource: branchPath, functionalContractBranch: 'cable-route', functionalContractSourceSha256: hashes.branchHash, generator: generatorPath, generatorSha256: hashes.generatorHash, method: design.style },
    geometry: { profile: 'company-cable-route-v1', envelope: structuredClone(source.contract.envelope), endpointA: structuredClone(source.contract.endpointA), endpointB: structuredClone(source.contract.endpointB), thickness: source.contract.thickness, fixedSegmentBounds: { A: [-0.703, -0.665], B: [0.665, 0.703] }, endpointNodes: { A: 'endpoint-A', B: 'endpoint-B' }, routeNodes: ['endpoint-A', 'endpoint-B', 'plug-A-head', 'plug-B-head', ...routeNodesFor(design.id)], maxMeshes: source.contract.maxMeshes, maxTriangles: source.contract.maxTriangles, maxMaterials: source.contract.maxMaterials, sourceEnvelope: { y: [-0.006, 0.014], z: [-0.014, 0.014] } },
    asset: { format: 'glb', url: `/company-assets/cable-route-v1/${design.id}/v1/model.glb`, sha256: sourceHash(bytes), bytes: bytes.length },
    footprint: { center: [0, 0], halfSize: [0.703, 0.015], blocking: false },
    usePoints: [], stateDefaults: { connected: true },
    stateSchema: { connected: { type: 'boolean' } },
    cableConnection: { profile: 'desk-collinear-v1', connector: 'usb-c-visual-v1', spanRange: [0.14, 0.7], unplugDistance: 0.025 },
    stateSemantics: { connected: 'both-device-ports-connected-or-B-unplugged' },
    checks: { physics: 'static-restricted-line-only' }
  };
}

const modifiedWidth = parseArg('single-width');
const hashes = { sourceHash: sourceHash(await fs.readFile(path.resolve(rootPath, sourcePath))), branchHash: sourceHash(await fs.readFile(path.resolve(rootPath, branchPath))), generatorHash: sourceHash(await fs.readFile(path.resolve(rootPath, generatorPath))) };
const generated = [];
for (const design of source.designs) {
  const override = design.id === 'single-sleeve' && modifiedWidth ? { width: Number(modifiedWidth) } : {};
  if (override.width !== undefined && (!Number.isFinite(override.width) || override.width <= 0 || override.width > 0.02)) throw new Error('--single-width must be a positive value no larger than 0.02m');
  const { rootObject } = makeCable(design, override);
  try {
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(rootObject, { binary: true, animations: [], copyright: `Project-authored cable route ${design.id}; no external art assets.` }));
    const resource = resourceFor(design, bytes, { generated: true }, hashes);
    const directory = path.join(outputRoot, design.id, 'v1'); await fs.mkdir(directory, { recursive: true });
    if (checkMode) {
      const diskBytes = await fs.readFile(path.join(directory, 'model.glb'));
      const diskResource = JSON.parse(await fs.readFile(path.join(directory, 'resource.json'), 'utf8'));
      assertEqualBytes(diskBytes, bytes, `${design.id}/model.glb`);
      const comparable = value => { const clone = structuredClone(value); delete clone.checks; return clone; };
      if (JSON.stringify(comparable(diskResource)) !== JSON.stringify(comparable(resource))) throw new Error(`Stale ${design.id}/resource.json`);
    } else {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'model.glb'), bytes); await fs.writeFile(path.join(directory, 'resource.json'), `${JSON.stringify(resource, null, 2)}\n`);
    }
    generated.push({ id: design.id, bytes: bytes.length, sha256: resource.asset.sha256, widthOverride: override.width ?? null });
  } finally { dispose(rootObject); }
}
const collection = { id: 'company-cable-route-v1', version: 1, branchId: 'cable-route', contract: source.contract, resourceIds: generated.map(item => `cable-route-${item.id}`), resources: generated.map(item => ({ id: `cable-route-${item.id}`, version: 1, url: `/company-assets/cable-route-v1/${item.id}/v1/model.glb`, resourcePath: `prototype/public/company-assets/cable-route-v1/${item.id}/v1/resource.json`, modelPath: `prototype/public/company-assets/cable-route-v1/${item.id}/v1/model.glb`, sha256: item.sha256 })), assets: generated, sourceParameters: sourcePath, sourceParametersSha256: hashes.sourceHash, generator: generatorPath, generatorSha256: hashes.generatorHash };
if (checkMode) {
  const diskCollection = JSON.parse(await fs.readFile(path.join(outputRoot, 'collection.json'), 'utf8'));
  if (JSON.stringify(diskCollection) !== JSON.stringify(collection)) throw new Error('Stale cable-route collection.json');
} else {
  await fs.mkdir(outputRoot, { recursive: true }); await fs.writeFile(path.join(outputRoot, 'collection.json'), `${JSON.stringify(collection, null, 2)}\n`);
}
console.log(JSON.stringify({ status: 'passed', outputRoot, generated }, null, 2));

function assertEqualBytes(actual, expected, label) {
  if (actual.length !== expected.length || !actual.equals(expected)) throw new Error(`Stale ${label}`);
}
