import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Matrix3, Raycaster, Triangle, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { validateSupportGeometry } from '../../prototype/src/company/support-geometry.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-showcase-product-v1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async filename => JSON.parse(await fs.readFile(path.join(root, filename)));
const unit = 1e-6;
const vector = values => new Vector3(...values);
const round = value => Number(value.toFixed(8));
const point = p => p.toArray().map(round);

export function parseShowcaseGlb(bytes) {
  assert(bytes.length >= 28 && bytes.length <= 14 * 1024 * 1024 && bytes.readUInt32LE(0) === 0x46546c67 &&
    bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a, 'Expected a bounded GLB 2 model');
  const byteLength = bytes.readUInt32LE(12), end = 20 + byteLength;
  assert(byteLength % 4 === 0 && end + 8 <= bytes.length && bytes.readUInt32LE(end + 4) === 0x004e4942 &&
    end + 8 + bytes.readUInt32LE(end) === bytes.length, 'Expected one JSON chunk and one BIN chunk');
  const gltf = JSON.parse(bytes.subarray(20, end)), bin = bytes.subarray(end + 8);
  assert(gltf.asset?.version === '2.0' && gltf.buffers?.length === 1 && !Object.hasOwn(gltf.buffers[0], 'uri') &&
    Number.isSafeInteger(gltf.buffers[0].byteLength) && bin.length >= gltf.buffers[0].byteLength &&
    bin.length - gltf.buffers[0].byteLength <= 3 && bin.length % 4 === 0 && Array.isArray(gltf.bufferViews) &&
    gltf.scenes?.[gltf.scene ?? 0]?.nodes?.length && gltf.nodes?.length && gltf.meshes?.length, 'Expected a usable standalone static scene');
  assert(!gltf.animations?.length && !gltf.skins?.length && !gltf.extensionsRequired?.length &&
    !gltf.nodes.some(node => node.skin !== undefined || node.weights || node.extensions?.EXT_mesh_gpu_instancing) &&
    gltf.meshes.every(mesh => !mesh.weights && mesh.primitives.every(primitive => !primitive.targets && [4, undefined].includes(primitive.mode))),
  'Only static ordinary indexed or non-indexed triangles are supported');
  return { gltf, bin };
}

export function pngView(gltf, bin, image) {
  const view = gltf.bufferViews[image.bufferView], offset = view?.byteOffset ?? 0;
  assert(!Object.hasOwn(image, 'uri') && image.mimeType === 'image/png' && view?.buffer === 0 && Number.isSafeInteger(offset) &&
    offset >= 0 && Number.isSafeInteger(view.byteLength) && view.byteLength > 0 && offset + view.byteLength <= bin.length,
  'Expected a valid embedded PNG buffer view');
  return bin.subarray(offset, offset + view.byteLength);
}

export async function loadShowcaseGlb(bytes) {
  const { gltf, bin } = parseShowcaseGlb(bytes);
  for (const image of gltf.images ?? []) pngView(gltf, bin, image);
  installNodeImageDecodeShim();
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  return scene;
}

function surfaceGeometry(scene, bounds, resource) {
  validateSupportGeometry(scene, resource, (code, location, message) => { throw Object.assign(Error(`${location} ${message}`), { code }); });
  const fixed = resource.mounting, size = bounds.getSize(new Vector3());
  assert(Math.abs(bounds.min.y) <= unit && Math.abs(bounds.max.x + bounds.min.x) <= unit && Math.abs(bounds.max.z + bounds.min.z) <= unit,
    'Product needs to sit at bottom-centre');
  assert(size.x <= fixed.width + unit && size.y <= fixed.height + unit && size.z <= fixed.depth + unit, 'Product is too large for its support envelope');
  const contact = [], meshRecords = [], geometries = [], tri = new Triangle();
  let count = 0;
  scene.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    assert(mesh.material?.isMeshStandardMaterial && position?.count >= 3);
    if (mesh.material.map) assert(mesh.geometry.attributes.uv?.count === position.count && mesh.material.map.colorSpace === 'srgb');
    const read = offset => new Vector3().fromBufferAttribute(position, index ? index.getX(offset) : offset).applyMatrix4(mesh.matrixWorld);
    const triangleCount = (index?.count ?? position.count) / 3;
    assert(Number.isSafeInteger(triangleCount));
    for (let i = 0; i < triangleCount; i++) {
      tri.set(...[0, 1, 2].map(j => read(3 * i + j)));
      geometries.push([tri.a, tri.b, tri.c].map(p => point(p).join(',')).join('|'));
      if (![tri.a, tri.b, tri.c].every(p => Math.abs(p.y) <= unit) || tri.getNormal(new Vector3()).y > -.99) continue;
      if (tri.getArea() > 1e-8) contact.push({ area: tri.getArea(), midpoint: tri.getMidpoint(new Vector3()) });
    }
    meshRecords.push({ name: mesh.name, triangles: triangleCount, material: mesh.material.name, colorMap: Boolean(mesh.material.map) });
    count += triangleCount;
  });
  assert(count && count <= 3000 && meshRecords.length <= 16);
  const area = contact.reduce((total, face) => total + face.area, 0);
  assert(area > 1e-5, 'Actual underside needs positive-area supported triangles');
  const largest = contact.reduce((a, b) => a.area > b.area ? a : b);
  const hit = new Raycaster(vector([largest.midpoint.x, -.03, largest.midpoint.z]), vector([0, 1, 0])).intersectObject(scene, true)[0];
  assert(hit && Math.abs(hit.point.y) <= unit && hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld)).y < -.99,
    'An upward ray must hit the actual contact surface first');
  const viewer = new Raycaster(vector([0, .52 * size.y, bounds.max.z + .1]), vector([0, 0, -1])).intersectObject(scene, true)[0];
  assert(viewer, 'A facing ray needs to reach the product presentation from +Z');
  return { bounds: { min: point(bounds.min), max: point(bounds.max), dimensions: point(size) },
    ground: { areaSquareMetres: round(area), triangles: contact.length, ray: point(hit.point) },
    frontRay: { point: point(viewer.point), node: viewer.object.name, uv: viewer.uv?.toArray().map(round) }, triangles: count,
    meshes: meshRecords, geometrySha256: digest(geometries.sort().join('\n')) };
}

export async function inspectShowcaseProduct(bytes, resource, originalBytes) {
  const { gltf, bin } = parseShowcaseGlb(bytes), original = originalBytes && parseShowcaseGlb(originalBytes);
  if (original) {
    for (const prop of ['accessors', 'meshes', 'materials', 'textures', 'samplers']) assert.deepEqual(gltf[prop], original.gltf[prop], prop + ' changed');
    assert.deepEqual(gltf.nodes.slice(0, original.gltf.nodes.length), original.gltf.nodes);
    assert.deepEqual(gltf.bufferViews.slice(0, original.gltf.bufferViews.length), original.gltf.bufferViews);
    assert(bin.subarray(0, original.bin.length).equals(original.bin), 'GLB source geometry and UV-bearing BIN bytes changed');
  }
  const textures = (gltf.images ?? []).map((img, index) => {
    const png = pngView(gltf, bin, img);
    assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && png.length >= 33);
    return { index, sha256: digest(png), bytes: png.length, dimensions: [png.readUInt32BE(16), png.readUInt32BE(20)], binding: 'image/png bufferView' };
  });
  const external = Object.entries(resource.provenance.dependencies).filter(([key]) => key.startsWith('sourceTexture-'));
  for (const [key, pin] of external) assert.equal(textures[Number(key.slice('sourceTexture-'.length))]?.sha256, pin.sha256);
  const scene = await loadShowcaseGlb(bytes);
  return { ...surfaceGeometry(scene, new Box3().setFromObject(scene, true), resource), textures };
}

async function main([output, ...extra]) {
  assert(output && !output.startsWith('-') && !extra.length, 'Usage: node scripts/company-platform/test-showcase-product-assets.mjs NEW_DIRECTORY');
  const collection = await json(family + '/collection.json'), cases = [];
  for (const item of collection.resources) {
    const resource = await json(item.resourcePath), bytes = await fs.readFile(path.join(root, item.modelPath));
    assert.equal(digest(bytes), resource.asset.sha256);
    const source = await fs.readFile(path.join(root, resource.provenance.sourceArtifactPath));
    assert.equal(digest(source), resource.provenance.sourceArtifactSha256);
    if (cases.length) assert(compareFacilityFunction(cases[0].resource, resource).compatible);
    const report = await inspectShowcaseProduct(bytes, resource, source);
    assert.equal(report.geometrySha256, item.geometrySha256);
    assert(report.textures.length && report.meshes.every(mesh => mesh.colorMap));
    cases.push({ resource, report });
  }
  assert.equal(cases.length, 4);
  assert.equal(new Set(cases.map(item => item.report.geometrySha256)).size, 4);
  const bag = cases.find(item => item.resource.id === 'showcase-product-bag').report;
  assert(bag.bounds.dimensions[0] > bag.bounds.dimensions[2] * 1.8, 'Wide face of the bag must point towards +Z');
  const target = path.resolve(output);
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'report.json'), JSON.stringify({ status: 'passed', cases }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', variants: cases.length, report: path.join(target, 'report.json') }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
