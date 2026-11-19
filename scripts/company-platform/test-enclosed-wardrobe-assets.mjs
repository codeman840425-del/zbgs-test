import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Matrix3, Raycaster, Triangle, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-enclosed-wardrobe-v1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFile(path.join(root, relative));
const json = async relative => JSON.parse(await read(relative));
const tol = 1e-6;
const near = (actual, expected, tolerance = tol) => assert(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const vector = values => new Vector3(...values);
const point = position => position.toArray().map(n => Number(n.toFixed(8)));
const box = (min, max) => new Box3(vector(min), vector(max));
const dimensions = bounds => ({ min: point(bounds.min), max: point(bounds.max) });
const normal = hit => hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));

function gltfDocument(bytes) {
  assert(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 &&
    bytes.readUInt32LE(8) === bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a, 'Expected a GLB 2 binary model');
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  assert(jsonEnd + 8 <= bytes.length && bytes.readUInt32LE(jsonEnd + 4) === 0x004e4942 &&
    jsonEnd + 8 + bytes.readUInt32LE(jsonEnd) === bytes.length, 'Bad GLB chunk bounds');
  const gltf = JSON.parse(bytes.subarray(20, jsonEnd));
  assert(gltf.buffers.length === 1 && gltf.buffers[0].uri === undefined && !gltf.images?.length,
    'Wardrobe leaf donors require standalone, texture-free PBR GLBs');
  return gltf;
}

export async function loadWardrobeGlb(bytes) {
  gltfDocument(bytes);
  const { scene, animations } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.equal(animations.length, 0, 'GLB should leave rotations to independent authored state');
  scene.updateMatrixWorld(true);
  return scene;
}

function triangles(mesh, matrix = mesh.matrixWorld) {
  const positions = mesh.geometry.attributes.position, indices = mesh.geometry.index;
  assert(positions?.count && positions.itemSize === 3);
  const count = indices?.count ?? positions.count;
  const vertices = Array.from({ length: positions.count }, (_, i) => new Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix));
  const face = i => vertices[indices ? indices.getX(i) : i];
  return Array.from({ length: count / 3 }, (_, item) => {
    const i = item * 3;
    return new Triangle(face(i), face(i + 1), face(i + 2));
  });
}

function fixedChecks(scene, body, rail, movingMeshes, resource) {
  const ground = body.flatMap(mesh => triangles(mesh)).filter(({ a, b, c }) => [a, b, c].every(v => Math.abs(v.y) <= tol));
  const floor = [];
  for (const sign of [-1, 1]) {
    const contact = ground.filter(face => face.getMidpoint(new Vector3()).x * sign > .1 && face.getNormal(new Vector3()).y < -.99);
    const area = contact.reduce((total, face) => total + face.getArea(), 0);
    assert(area > .001, 'Cabinet needs positive-area ground contact on both sides');
    const mid = contact[0].getMidpoint(new Vector3());
    const hit = new Raycaster(vector([mid.x, -.05, mid.z]), vector([0, 1, 0])).intersectObject(scene, true)[0];
    assert(hit && normal(hit).y < -.99);
    near(hit.point.y, 0);
    floor.push({ point: point(hit.point), contactSquareMetres: area });
  }
  const { slots, radius, centerY } = resource.garmentRail;
  const supportingRail = new Box3().setFromObject(rail, true);
  assert(supportingRail.min.x <= -.470 && supportingRail.max.x >= .470, 'Rod ends need to enter real cabinet sides');
  assert(rail.parent === body[0].parent && movingMeshes.every(mesh => mesh !== rail), 'The rod must stay fixed');
  const physicalRail = triangles(rail).flatMap(({ a, b, c }) => [a, b, c]);
  assert(physicalRail.every(v => {
    const r = Math.hypot(v.y - centerY, v.z);
    return r < tol || Math.abs(r - radius) <= tol;
  }), 'The garment rail needs a real constant-radius cylinder along X');
  const mountSpaces = slots.map(slot => {
    const [x, y, z] = slot.position;
    const hit = new Raycaster(vector([x, y + .01, z]), vector([0, -1, 0])).intersectObject(rail, false)[0];
    assert(hit && normal(hit).y > .99, 'No actual rod at the hook point');
    near(hit.point.y, y);
    return { id: slot.id, point: slot.position, region: box([x - .07, y - .86, z - .216], [x + .07, y + .01, z + .216]) };
  });
  for (const mesh of [...body, ...movingMeshes]) for (const triangle of triangles(mesh))
    assert(mountSpaces.every(slot => !slot.region.intersectsTriangle(triangle)), 'Physical cabinet geometry occupies the garment space');
  return { floor, rail: { bounds: dimensions(supportingRail), slots: mountSpaces.map(slot => ({ id: slot.id, point: slot.point })) } };
}

function checkLeaf(scene, map, part, resource) {
  const { id } = part, prefix = 'wardrobe-' + id + '-';
  const pivot = map.get(resource.partNodes[id]), panel = map.get(resource.partPanels[id]);
  const handle = map.get(prefix + 'handle'), hinges = map.get(prefix + 'hinges'), glass = map.get(prefix + 'glass');
  assert(pivot?.isObject3D && !pivot.isMesh && panel?.isMesh && handle?.isMesh && hinges?.isMesh && pivot.children.includes(panel),
    `Expected a leaf subtree with unique real panel, pull and hinges: ${id}`);
  assert(pivot.children.every(child => child.isMesh && child.name.startsWith(prefix)));
  assert.deepEqual(point(pivot.position), part.pivot);
  assert.deepEqual(pivot.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(point(pivot.scale), [1, 1, 1]);
  const inverse = pivot.matrixWorld.clone().invert();
  const volume = box(part.bounds.min, part.bounds.max), actual = new Box3();
  const meshes = {}, signatures = [];
  let hingeEnds;
  for (const mesh of pivot.children) {
    const transform = inverse.clone().multiply(mesh.matrixWorld), faces = triangles(mesh, transform);
    assert(mesh.visible && mesh.material?.isMeshStandardMaterial && faces.some(face => face.getArea() > 1e-5), 'Door needs genuine solid-faced PBR parts');
    const vertices = faces.flatMap(({ a, b, c }) => [a, b, c]);
    const areaBounds = new Box3().setFromPoints(vertices);
    for (const component of ['x', 'y', 'z']) assert(areaBounds.min[component] >= volume.min[component] - tol &&
      areaBounds.max[component] <= volume.max[component] + tol, 'Real door part exceeds moving envelope at ' + mesh.name);
    actual.union(areaBounds);
    if (mesh === panel) {
      near(areaBounds.min.x, volume.min.x);
      near(areaBounds.max.x, volume.max.x);
      near(areaBounds.min.y, 0);
      near(areaBounds.max.y, 1.64);
    } else if (mesh === handle) {
      near(areaBounds.max.z, volume.max.z);
      assert(areaBounds.min.z <= .010 && areaBounds.max.y - areaBounds.min.y >= .025, 'Pull must project physically from the face');
    } else if (mesh === hinges) {
      assert(vertices.some(v => Math.hypot(v.x, v.z) < tol), 'Hinge cap should center on the actual Y axis');
      assert(vertices.every(v => Math.hypot(v.x, v.z) <= .0058 + tol), 'Hinge barrel does not match its axis');
      assert(vertices.every(v => Math.abs(v.y - .28) < .031 || Math.abs(v.y - 1.34) < .031));
      assert(areaBounds.min.y < .28 && areaBounds.max.y > 1.34, 'The leaf needs two separated hinges');
      hingeEnds = dimensions(areaBounds);
    }
    if (mesh !== glass) assert(!mesh.material.transparent && mesh.material.opacity === 1, 'Only glass should transmit room light');
    meshes[mesh.name] = faces.length;
    signatures.push(sha(vertices.map(v => point(v).join(',')).join(';')));
  }
  assert.equal(Boolean(glass), Boolean(resource.materialSlots.glass));
  let glazing;
  if (glass) {
    assert(glass.material.transparent && glass.material.opacity >= .15 && glass.material.opacity <= .8, 'Actual glazing needs BLEND opacity');
    const world = new Box3().setFromObject(glass, true), paneCenter = world.getCenter(new Vector3());
    const hit = new Raycaster(vector([paneCenter.x, paneCenter.y, .33]), vector([0, 0, -1]))
      .intersectObjects(pivot.children, false)[0];
    assert(hit?.object === glass, 'Visible glazing must transmit through a real aperture in the frame');
    glazing = { opacity: glass.material.opacity, pane: dimensions(world), ray: point(hit.point) };
  }
  // Local x has one sign per leaf, giving a non-negative opening contribution
  // to Z at every angle. The rear limit is therefore pivotZ + closed rear Z.
  const rearZ = part.pivot[2] + actual.min.z;
  assert(rearZ - .216 >= .03799 && rearZ > .249 + tol, 'Even partially open leaves must clear the cabinet and both garment envelopes');
  const pullClosed = new Box3().setFromObject(handle, true).getCenter(new Vector3());
  const expected = pullClosed.clone().sub(pivot.position).applyAxisAngle(vector([0, 1, 0]), part.rotationRange[1]).add(pivot.position);
  const opposite = map.get(resource.partNodes[id === 'left' ? 'right' : 'left']);
  const fixedBefore = new Box3().setFromObject(opposite, true);
  pivot.rotation.y = part.rotationRange[1];
  scene.updateMatrixWorld(true);
  const open = new Box3().setFromObject(handle, true).getCenter(new Vector3());
  assert(open.distanceTo(expected) <= tol && open.z > .55 && fixedBefore.equals(new Box3().setFromObject(opposite, true)),
    'Opening must move the complete leaf including the pull, while leaving the other door fixed');
  pivot.rotation.y = 0;
  scene.updateMatrixWorld(true);
  return { id, pivot: point(pivot.position), bounds: dimensions(actual), meshes, hingeEnds,
    openPull: point(open), garmentClearanceMetres: rearZ - .216, geometrySha256: sha(signatures.join('/')), ...(glazing ? { glazing } : {}) };
}

export async function inspectWardrobe(bytes, resource) {
  const scene = await loadWardrobeGlb(bytes), map = new Map();
  const gltf = gltfDocument(bytes);
  assert.equal(gltf.materials.filter(material => material.alphaMode === 'BLEND').length, resource.materialSlots.glass ? 1 : 0);
  scene.traverse(node => {
    assert(node.name && !map.has(node.name), 'GLB nodes must have unique physical bindings');
    map.set(node.name, node);
  });
  const body = ['wardrobe-body', 'wardrobe-lining', 'wardrobe-base', 'wardrobe-hinge-mounts'].map(name => map.get(name));
  const rail = map.get('garment-rail');
  assert(body.every(node => node?.isMesh) && rail?.isMesh);
  const moving = resource.movingParts.flatMap(part => map.get(resource.partNodes[part.id])?.children ?? []);
  const allMeshes = [...map.values()].filter(node => node.isMesh);
  assert.equal(allMeshes.length, body.length + moving.length + 1, 'All geometry must belong to the physical cabinet or one leaf');
  assert.deepEqual(Object.values(resource.materialSlots).flat().sort(), allMeshes.map(mesh => mesh.name).sort());
  const closed = new Box3().setFromObject(scene, true), { width, height, depth } = resource.mounting;
  near(closed.min.x, -width / 2);
  near(closed.max.x, width / 2);
  near(closed.min.y, 0);
  near(closed.max.y, height);
  near(closed.min.z, -depth / 2);
  assert(closed.max.z <= depth / 2 + tol && closed.max.z >= .285);
  const fixed = fixedChecks(scene, body, rail, moving, resource);
  const leaves = resource.movingParts.map(part => checkLeaf(scene, map, part, resource));
  const count = allMeshes.reduce((n, mesh) => n + triangles(mesh).length, 0);
  assert(count <= 1600 && allMeshes.length <= 16 && gltf.materials.length <= 9, 'Wardrobe exceeds its lightweight budget');
  return { triangles: count, meshes: allMeshes.length, materials: gltf.materials.length,
    geometrySha256: sha(leaves.map(part => part.geometrySha256).join('/')), bounds: dimensions(closed), leaves, ...fixed };
}

async function main([output, ...extra]) {
  assert(output && !output.startsWith('-') && !extra.length, 'Usage: node scripts/company-platform/test-enclosed-wardrobe-assets.mjs NEW_OUTPUT_DIRECTORY');
  const collection = await json(family + '/collection.json'), results = [];
  for (const entry of collection.resources) {
    const [bytes, resource] = await Promise.all([read(entry.modelPath), json(entry.resourcePath)]);
    assert.equal(sha(bytes), resource.asset.sha256);
    assert.equal(entry.sha256, resource.asset.sha256);
    assert(results.every(prior => compareFacilityFunction(prior.resource, resource).compatible));
    const geometry = await inspectWardrobe(bytes, resource);
    assert.equal(geometry.geometrySha256, entry.geometrySha256);
    await assert.rejects(inspectWardrobe(bytes, { ...resource, partPanels: { ...resource.partPanels, left: resource.partPanels.right } }), /leaf subtree/);
    results.push({ resource, geometry });
  }
  assert.equal(results.length, 4);
  assert.equal(new Set(results.map(item => item.geometry.geometrySha256)).size, 4);
  assert.equal(results.filter(item => item.geometry.leaves.every(leaf => leaf.glazing)).length, 1);
  const target = path.resolve(output);
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'report.json'), JSON.stringify({ status: 'passed', results }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', resources: results.length, runtimeLeaves: results.length * 2, report: path.join(target, 'report.json') }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
