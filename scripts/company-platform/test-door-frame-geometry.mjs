import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.ProgressEvent ??= class extends Event {
  constructor(type, init = {}) {
    super(type);
    Object.assign(this, init);
  }
};

const pinnedHashes = {
  'door-frame-plain': 'dcc326142b75a72eb77b4934a4fbe1cbf6b5212ac06ddb0efdd79e5db9c99d4b',
  'door-frame-inset': 'cc3d9ffd9988e39790b626d562ed40fe5be23e3442878113a5d333324a743424',
  'door-frame-stepped': '9762d8876ade1be29c811dad41d17c2112cf1dee4f8471851ee917fdb1e88248',
  'door-frame-crown': 'c248c9c428ea00306eae7bd4a9ac7a9d3e3b61f60dcb836a0159c29a232e01d6',
};
const mounting = { width: 1.7, height: 2.4, depth: .1, origin: 'bottom', apertureWidth: 1.4, apertureHeight: 2.2 };
const structuralParts = {
  'left-jamb': { min: [-.85, 0, 0], max: [-.7, 2.2, .1], probes: [[-.775, .02], [-.775, 1.1], [-.775, 2.18]] },
  'right-jamb': { min: [.7, 0, 0], max: [.85, 2.2, .1], probes: [[.775, .02], [.775, 1.1], [.775, 2.18]] },
  header: { min: [-.85, 2.2, 0], max: [.85, 2.4, .1], probes: [[-.67, 2.3], [0, 2.3], [.67, 2.3]] },
};
const apertureMargin = .01;
const apertureHalfWidth = mounting.apertureWidth / 2 - apertureMargin;
const apertureTop = mounting.apertureHeight - apertureMargin;
const clearVolume = new THREE.Box3(
  new THREE.Vector3(-apertureHalfWidth, apertureMargin, -1),
  new THREE.Vector3(apertureHalfWidth, apertureTop, 1),
);
const raycaster = new THREE.Raycaster();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const boundsOf = object => {
  const { min, max } = new THREE.Box3().setFromObject(object, true);
  return { min: min.toArray(), max: max.toArray() };
};

function assertBounds(actual, expected) {
  for (const limit of ['min', 'max']) {
    for (const [axis, value] of actual[limit].entries()) {
      assert(Math.abs(value - expected[limit][axis]) <= 1e-6, `${limit}[${axis}] measured ${value}, expected ${expected[limit][axis]}`);
    }
  }
}

function rayHits(meshes, x, y, direction) {
  raycaster.set(new THREE.Vector3(x, y, -direction), new THREE.Vector3(0, 0, direction));
  return raycaster.intersectObjects(meshes, false);
}

function probeOpening(meshes) {
  const triangle = new THREE.Triangle();
  let triangles = 0;
  const intrusions = new Set();
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.index;
    const vertexCount = indices?.count ?? positions.count;
    for (let start = 0; start < vertexCount; start += 3) {
      for (const [offset, vertex] of [triangle.a, triangle.b, triangle.c].entries()) {
        const index = indices ? indices.getX(start + offset) : start + offset;
        vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      }
      if (clearVolume.intersectsTriangle(triangle)) intrusions.add(mesh.name);
      triangles++;
    }
  }

  let rays = 0;
  const hitRays = [];
  for (let xSample = 0; xSample <= 14; xSample++) {
    const x = -apertureHalfWidth + 2 * apertureHalfWidth * xSample / 14;
    for (let ySample = 0; ySample <= 22; ySample++) {
      const y = apertureMargin + (apertureTop - apertureMargin) * ySample / 22;
      for (const direction of [-1, 1]) {
        const hits = rayHits(meshes, x, y, direction);
        if (hits.length) hitRays.push({ x, y, direction, mesh: hits[0].object.name });
        rays++;
      }
    }
  }
  return { triangles, intersectingMeshes: [...intrusions], rays, blockedRayCount: hitRays.length, blockedRayExamples: hitRays.slice(0, 5) };
}

const catalogPath = new URL('../../prototype/src/company/library-catalog.json', import.meta.url);
const { resources } = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const results = [];
const loader = new GLTFLoader();
for (const [id, expectedSha256] of Object.entries(pinnedHashes)) {
  const result = { id, version: 1, expectedSha256, status: 'failed' };
  results.push(result);
  try {
    const registered = resources.filter(resource => resource.id === id && resource.version === 1);
    assert.equal(registered.length, 1, 'Expected exactly one version-1 catalogue registration');
    const [resource] = registered;
    const expectedUrl = `/company-assets/architecture-collection/${id}/v1/model.glb`;
    assert.equal(resource.mount, 'portal');
    assert.deepEqual(resource.mounting, mounting);
    assert.equal(resource.asset.format, 'glb');
    assert.equal(resource.asset.url, expectedUrl);
    const bytes = await fs.readFile(new URL(`../../prototype/public${resource.asset.url}`, import.meta.url));
    result.actualSha256 = hash(bytes);
    result.bytes = bytes.length;
    assert.equal(resource.asset.sha256, expectedSha256, 'Catalogue hash must match the pinned version-1 asset');
    assert.equal(result.actualSha256, resource.asset.sha256, 'GLB bytes must match the catalogue hash');
    assert.equal(result.bytes, resource.asset.bytes, 'GLB length must match the catalogue');

    const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse(object => { if (object.isMesh) meshes.push(object); });
    assert(meshes.length > 0, 'Expected triangle meshes in the loaded GLB');
    result.meshCount = meshes.length;
    result.envelope = boundsOf(scene);
    assertBounds(result.envelope, { min: [-.85, 0, 0], max: [.85, 2.4, .1] });

    result.aperture = probeOpening(meshes);
    assert.deepEqual(result.aperture.intersectingMeshes, [], 'Frame triangles intersect the clear opening volume');
    assert.equal(result.aperture.blockedRayCount, 0, 'A ray across the clear opening struck frame geometry');

    result.parts = {};
    for (const [name, part] of Object.entries(structuralParts)) {
      const matching = meshes.filter(mesh => mesh.name === name);
      assert.equal(matching.length, 1, `Expected one mesh named ${name}`);
      const bounds = boundsOf(matching[0]);
      assertBounds(bounds, part);
      let hits = 0;
      for (const [x, y] of part.probes) {
        for (const direction of [-1, 1]) {
          assert(rayHits(matching, x, y, direction).length > 0, `Missing ${name} geometry at ${x}, ${y}, direction ${direction}`);
          hits++;
        }
      }
      result.parts[name] = { bounds, probeHits: hits };
    }
    result.status = 'passed';
  } catch (error) {
    result.error = error.message;
  }
}

const output = process.argv[2];
const report = {
  status: results.every(result => result.status === 'passed') ? 'passed' : 'failed',
  scope: 'CPU geometry verification of the four registered version-1 GLBs in asset-local coordinates',
  mounting,
  apertureProbeMarginMetres: apertureMargin,
  boundsToleranceMetres: 1e-6,
  testSha256: hash(await fs.readFile(new URL(import.meta.url))),
  results,
};
if (output) {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
for (const result of results) console.log(`${result.id}@${result.version} ${result.status}${result.error ? `: ${result.error}` : ''}`);
if (report.status !== 'passed') process.exitCode = 1;
