import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Raycaster, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { unzipSync } from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';

const root = new URL('../../', import.meta.url);
const tolerance = 1e-6;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const round = number => Number(number.toFixed(8));
const sortedNames = map => Object.keys(map).sort();
const read = file => fs.readFile(new URL(file, root));
function near(actual, expected, label) {
  assert(Math.abs(actual - expected) < tolerance, `${label}: ${actual} differs from ${expected}`);
}

export async function parsePartitionGlb(bytes) {
  assert(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 &&
    bytes.readUInt32LE(8) === bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a, 'Expected a complete GLB 2');
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert(!json.images?.length && json.buffers.every(buffer => buffer.uri === undefined),
    'Partition GLB must contain its buffers and solid materials locally');
  const result = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  result.scene.updateMatrixWorld(true);
  return { ...result, json };
}

function solidMaterial(mesh) {
  return mesh?.isMesh && mesh.material.isMeshStandardMaterial && !mesh.material.transparent && mesh.material.opacity === 1;
}

function inspectTriangles(scene) {
  const signatures = [], contact = new Map(), meshes = new Map(), materials = new Set();
  let triangles = 0;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(!meshes.has(mesh.name) && mesh.name, 'Model needs unique named meshes');
    assert(mesh.material.isMeshStandardMaterial, `${mesh.name} requires a standard material`);
    meshes.set(mesh.name, mesh);
    materials.add(mesh.material);
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.getIndex();
    assert(positions?.count > 0);
    const count = indices?.count ?? positions.count;
    assert.equal(count % 3, 0);
    let contactArea = 0;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(delta => new Vector3().fromBufferAttribute(positions, indices?.getX(i + delta) ?? i + delta).applyMatrix4(mesh.matrixWorld));
      assert(vertices.every(point => point.toArray().every(Number.isFinite)), `Non-finite vertex in ${mesh.name}`);
      signatures.push(vertices.map(point => point.toArray().map(round).join(':')).sort().join('|'));
      const [a, b, c] = vertices;
      if (vertices.every(point => Math.abs(point.y) < tolerance)) {
        const y = b.clone().sub(a).cross(c.clone().sub(a)).y;
        if (y < -1e-10) contactArea += -y / 2;
      }
    }
    if (contactArea) {
      assert(solidMaterial(mesh), 'The actual floor contact must come from opaque solids');
      contact.set(mesh.name, contactArea);
    }
    triangles += count / 3;
  });
  assert(meshes.size <= 32 && triangles > 0 && triangles <= 2500 && materials.size <= 4, 'Partition mesh budget exceeded');
  const contactArea = [...contact.values()].reduce((sum, area) => sum + area, 0);
  assert(contactArea > .005 && contactArea <= .144 + tolerance, 'Expected positive horizontal floor contact inside the narrow floor envelope');
  return { meshes, meshCount: meshes.size, triangles, materialCount: materials.size, geometrySha256: digest(signatures.sort().join('\n')),
    floorContactByMesh: Object.fromEntries(contact), floorContactAreaSquareMetres: round(contactArea) };
}

function inspectGlass(scene, meshes, json) {
  const panes = [...meshes.values()].filter(mesh => mesh.name.startsWith('glass-pane-'));
  assert.equal(panes.length, 2);
  assert.equal(json.materials.filter(material => material.alphaMode === 'BLEND').length, 1);
  assert(solidMaterial(meshes.get('glass-frame')) && solidMaterial(meshes.get('glass-ground-rail')));
  const actualPanes = panes.map(mesh => {
    assert(mesh.material.transparent && mesh.material.opacity >= .12 && mesh.material.opacity <= .38 &&
      !mesh.material.depthWrite, 'Expected transparent standard glazing with a clear view through');
    const bounds = new Box3().setFromObject(mesh, true);
    const size = bounds.getSize(new Vector3());
    assert(size.x > .7 && size.y > 1.7 && size.z >= .008 && size.z <= .02, 'Glass pane must have two separate faces and physical edge thickness');
    const centre = bounds.getCenter(new Vector3());
    const hitDepths = [-1, 1].map(side => {
      const ray = new Raycaster(new Vector3(centre.x, centre.y, side), new Vector3(0, 0, -side));
      const hits = ray.intersectObject(scene, true);
      assert(hits.length && hits.every(hit => hit.object === mesh), 'Clear pane centre must have no opaque backing');
      return hits[0].point.z;
    });
    near(hitDepths[1] - hitDepths[0], size.z, 'Glazing front/back separation');
    return { name: mesh.name, dimensions: size.toArray().map(round), opacity: mesh.material.opacity, hitDepths: hitDepths.map(round) };
  });
  for (const mesh of meshes.values()) if (!panes.includes(mesh)) assert(solidMaterial(mesh), `Non-glass part ${mesh.name} must remain opaque`);
  return actualPanes;
}

export async function inspectPartitionGeometry(bytes, mounting, construction) {
  const { scene, animations, json } = await parsePartitionGlb(bytes);
  assert.equal(animations.length, 0, 'Fixed expanded models must not have animations');
  const bounds = new Box3().setFromObject(scene, true);
  const [actualMin, actualMax] = [bounds.min.toArray(), bounds.max.toArray()];
  const expectedMin = [-mounting.width / 2, 0, -mounting.depth / 2];
  const expectedMax = [mounting.width / 2, mounting.height, mounting.depth / 2];
  expectedMin.forEach((value, axis) => near(actualMin[axis], value, `Envelope min axis ${axis}`));
  expectedMax.forEach((value, axis) => near(actualMax[axis], value, `Envelope max axis ${axis}`));
  const { meshes, ...triangles } = inspectTriangles(scene);
  const grounded = sortedNames(triangles.floorContactByMesh);
  const expectedAnchor = {
    'timber-leaves': 'timber-feet', 'stretched-cloth': 'fabric-feet',
    'acoustic-tiles': 'acoustic-ground-rail', 'framed-glazing': 'glass-ground-rail',
  }[construction];
  assert.deepEqual(grounded, [expectedAnchor], 'The prescribed narrow floor fixtures must provide the contact area');
  const designEvidence = {};
  if (construction === 'framed-glazing') {
    designEvidence.panes = inspectGlass(scene, meshes, json);
  } else {
    for (const mesh of meshes.values()) assert(solidMaterial(mesh), `Unexpected transparency in ${mesh.name}`);
    const counts = prefix => [...meshes.keys()].filter(name => name.startsWith(prefix)).length;
    if (construction === 'timber-leaves') {
      assert.equal(counts('timber-leaf-frame-'), 3);
      assert.equal(counts('timber-leaf-inset-'), 3);
      assert(counts('timber-hinge-') >= 4);
      designEvidence.leaves = 3;
      designEvidence.hinges = counts('timber-hinge-');
    }
    if (construction === 'stretched-cloth') {
      const fabric = meshes.get('fabric-body');
      assert(fabric?.isMesh && meshes.has('fabric-seams'));
      const size = new Box3().setFromObject(fabric, true).getSize(new Vector3());
      assert(size.x > 1.5 && size.y > 1.55 && size.z > .01 && size.z < .044, 'Expected a lightly wavy, thin cloth spanning the frame');
      designEvidence.clothDimensions = size.toArray().map(round);
    }
    if (construction === 'acoustic-tiles') {
      assert(counts('acoustic-tile-') >= 6 && meshes.has('acoustic-backing'));
      designEvidence.tiles = counts('acoustic-tile-');
    }
  }
  return { ...triangles, envelope: { min: actualMin.map(round), max: actualMax.map(round) }, ...designEvidence };
}

async function verifyTimberInserts(bytes, resource, collection, record) {
  const parameters = JSON.parse(await read(collection.sourceParameters));
  const design = parameters.designs.find(item => item.id === record.id && item.version === record.version);
  const source = parameters.sources[design.source];
  const archive = await read(source.path);
  assert.equal(digest(archive), resource.provenance.sourceArtifactSha256);
  const stock = unzipSync(archive, { filter: entry => [source.entry, source.licenseEntry].includes(entry.name) });
  assert.equal(digest(stock[source.entry]), resource.provenance.sourceGlbSha256);
  assert.equal(digest(stock[source.licenseEntry]), resource.provenance.sourceLicenseSha256);
  const { scene: donor } = await parsePartitionGlb(Buffer.from(stock[source.entry]));
  const { scene } = await parsePartitionGlb(bytes);
  let original;
  donor.traverse(mesh => { if (mesh.isMesh) original = mesh; });
  const sourcePoints = original.geometry.getAttribute('position');
  const sourceIndices = original.geometry.getIndex();
  const sourceCount = sourceIndices?.count ?? sourcePoints.count;
  const sourceBounds = new Box3().setFromObject(original, true);
  const sourceSize = sourceBounds.getSize(new Vector3()), sourceCenter = sourceBounds.getCenter(new Vector3());
  let largestError = 0;
  const { mounting: { width } } = resource;
  const { parts: { insetHeight, insetDepth, leafGap, frameWidth, footHeight } } = design;
  const pivotY = footHeight - .002;
  for (let i = 0; i < 3; i++) {
    const mesh = scene.getObjectByName(`timber-leaf-inset-${i + 1}`);
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    assert.equal(index?.count ?? pos.count, sourceCount * 2);
    const left = -width / 2 + i * width / 3 + (i > 0 ? leafGap / 2 : 0);
    const right = -width / 2 + (i + 1) * width / 3 - (i < 2 ? leafGap / 2 : 0);
    const scale = new Vector3((right - left - 2 * frameWidth + .003) / sourceSize.x, insetHeight / sourceSize.y, insetDepth / sourceSize.z);
    for (const [copy, side] of [-1, 1].entries()) {
      const centre = new Vector3((right + left) / 2, pivotY + frameWidth - .003 + insetHeight / 2, side * insetDepth * .45);
      const uv = original.geometry.getAttribute('uv'), copiedUV = mesh.geometry.getAttribute('uv');
      assert.equal(Boolean(uv), Boolean(copiedUV));
      for (let j = 0; j < sourceCount; j++) {
        const a = sourceIndices?.getX(j) ?? j, b = index?.getX(j + copy * sourceCount) ?? j + copy * sourceCount;
        const expected = new Vector3().fromBufferAttribute(sourcePoints, a).applyMatrix4(original.matrixWorld).sub(sourceCenter).multiply(scale);
        expected.x *= side;
        expected.z *= side;
        const actual = new Vector3().fromBufferAttribute(pos, b).applyMatrix4(mesh.matrixWorld);
        largestError = Math.max(largestError, expected.add(centre).distanceTo(actual));
        if (uv) assert.equal(uv.getX(a) === copiedUV.getX(b) && uv.getY(a) === copiedUV.getY(b), true);
      }
    }
    assert.equal(mesh.material.roughness, original.material.roughness);
    assert.equal(mesh.material.metalness, original.material.metalness);
    for (const channel of ['r', 'g', 'b']) near(mesh.material.color[channel], original.material.color[channel], 'Donor material colour');
  }
  assert(largestError < tolerance, 'Adapted timber inset differs from the transformed native donor triangles');
  return { sourceEntry: source.entry, trianglesPerFace: sourceCount / 3, copies: 6, largestError };
}

async function main([out, ...extra]) {
  if (!out || extra.length || out.startsWith('-')) throw new Error('Usage: node scripts/company-platform/test-screen-partition-geometry.mjs NEW_OUTPUT_DIRECTORY');
  const directory = path.resolve(out);
  await fs.mkdir(directory);
  const catalog = JSON.parse(await read('prototype/src/company/library-catalog.json'));
  const collection = JSON.parse(await read('assets-source/company-screen-partition-v1/collection.json'));
  const resources = [];
  for (const record of collection.resources) {
    const resource = catalog.resources.find(item => item.id === record.id && item.version === record.version);
    assert(resource);
    const asset = await read(record.modelPath);
    assert.equal(digest(asset), resource.asset.sha256);
    assert.deepEqual(resource, JSON.parse(await read(record.resourcePath)));
    assert(resource.footprint.blocking && !resource.movingParts && !Object.keys(resource.stateDefaults).length);
    if (resources.length) assert(compareFacilityFunction(resources[0].resource, resource).compatible);
    const result = { resource, ...await inspectPartitionGeometry(asset, resource.mounting, record.construction) };
    if (record.construction === 'timber-leaves') result.nativeTimber = await verifyTimberInserts(asset, resource, collection, record);
    resources.push(result);
  }
  assert.equal(resources.length, 4);
  assert.equal(new Set(resources.map(item => item.geometrySha256)).size, 4);
  const report = { status: 'passed', limits: ['CPU GLB geometry and material readback', 'Browser visibility and real fixed mounting strength are checked separately'], resources };
  const file = path.join(directory, 'report.json');
  await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, resources: resources.length, report: file }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
