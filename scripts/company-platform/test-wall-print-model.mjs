import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {crc32, deflateSync} from 'node:zlib';
import {Box3, Raycaster, SRGBColorSpace, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {buildWallPrintModel} from './wall-print-model.mjs';

const {PNG} = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const names = ['wall-print-frame', 'wall-print-mat', 'wall-print-image'];

function chunk(type, data = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(12 + data.length);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4);
  data.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, 8 + data.length)), 8 + data.length);
  return bytes;
}

function header(width, height, {depth = 8, colorType = 6, interlace = 0} = {}) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width);
  data.writeUInt32BE(height, 4);
  data[8] = depth;
  data[9] = colorType;
  data[12] = interlace;
  return chunk('IHDR', data);
}

function makeLandscape() {
  const png = new PNG({width: 7, height: 3});
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const pixel = [40 + 30 * x, 30 + 90 * y, 200 - 40 * y, (x + y) % 2 ? 100 : 255];
    png.data.set(pixel, (y * png.width + x) * 4);
  }
  return PNG.sync.write(png);
}

function makePortrait() {
  // A 1×5 Adam7 indexed image has one row in pass 1, one in pass 3,
  // one in pass 5 and two in pass 7. Palette indexes are high-bit first.
  const imageRows = Buffer.from([0, 0, 0, 128, 0, 0, 0, 128, 0, 0]);
  return Buffer.concat([
    signature, header(1, 5, {depth: 1, colorType: 3, interlace: 1}),
    chunk('PLTE', Buffer.from([255, 0, 0, 0, 0, 255])), chunk('tRNS', Buffer.from([255, 80])),
    chunk('IDAT', deflateSync(imageRows)), chunk('IEND'),
  ]);
}

function glbData(bytes) {
  assert.equal(bytes.readUInt32LE(), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonSize = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const binaryHeader = 20 + jsonSize;
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  assert.equal(binaryHeader + 8 + bytes.readUInt32LE(binaryHeader), bytes.length);
  return {json: JSON.parse(bytes.subarray(20, binaryHeader).toString()), binary: bytes.subarray(binaryHeader + 8)};
}

const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6, `${actual} differs from ${expected}`);
const rays = (origin, object) => new Raycaster(new Vector3(...origin), new Vector3(0, 0, -1)).intersectObject(object, false);

// GLTFLoader uses the normal embedded-image path. Node supplies the image decode here.
globalThis.self ??= globalThis;
globalThis.createImageBitmap = async blob => PNG.sync.read(Buffer.from(await blob.arrayBuffer()), {checkCRC: true});

for (const [png, width, height] of [[makeLandscape(), 7, 3], [makePortrait(), 1, 5]]) {
  const before = Buffer.from(png);
  const {bytes, widthPixels, heightPixels} = buildWallPrintModel(png);
  assert.deepEqual([widthPixels, heightPixels], [width, height]);
  assert.deepEqual(buildWallPrintModel(new Uint8Array(png)).bytes, bytes);
  assert.deepEqual(png, before);
  const {json, binary} = glbData(bytes);
  assert.deepEqual(json.nodes.map(node => node.name), names);
  const [embedded] = json.images;
  assert.equal(embedded.mimeType, 'image/png');
  const imageView = json.bufferViews[embedded.bufferView];
  assert.equal(imageView.byteLength, png.length);
  assert.deepEqual(binary.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength), png);
  assert(json.bufferViews.every(view => view.byteOffset % 4 === 0 && view.byteOffset + view.byteLength <= binary.length));

  const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const [frame, mat, print] = names.map(name => scene.getObjectByName(name));
  const limits = new Box3().setFromObject(scene, true);
  close(limits.min.x, -.4); close(limits.max.x, .4);
  close(limits.min.y, -.4); close(limits.max.y, .4);
  close(limits.min.z, 0);
  assert(limits.max.z > .04 && limits.max.z <= .12);
  assert.equal(rays([0, 0, 1], frame).length, 0);
  for (const xy of [[0, .38], [.38, 0], [0, -.38], [-.38, 0]]) assert(rays([...xy, 1], frame).length > 0);
  assert(rays([0, 0, 1], mat).length > 0);
  assert(rays([0, 0, 1], print).length > 0);

  const printBox = new Box3().setFromObject(print, true), dimensions = printBox.getSize(new Vector3());
  close(dimensions.x / dimensions.y, width / height);
  close(Math.max(dimensions.x, dimensions.y), .648);
  close(printBox.min.x, -printBox.max.x); close(printBox.min.y, -printBox.max.y);
  assert(printBox.min.z > new Box3().setFromObject(mat, true).max.z && printBox.max.z < limits.max.z);
  assert.deepEqual([...print.geometry.attributes.uv.array], [0, 1, 1, 1, 1, 0, 0, 0]);
  for (let i = 0; i < print.geometry.attributes.normal.count; i++) assert.equal(print.geometry.attributes.normal.getZ(i), 1);
  assert.equal(print.material.map.flipY, false);
  assert.equal(print.material.map.colorSpace, SRGBColorSpace);
  assert.deepEqual(print.material.map.image.data, PNG.sync.read(before).data);
  assert.equal(print.material.transparent, true);
  for (const object of [frame, mat]) {
    assert.equal(object.material.transparent, false);
    assert.equal(object.material.opacity, 1);
  }
}

const malformed = (headerChunk, idat) => Buffer.concat([signature, headerChunk, chunk('IDAT', idat), chunk('IEND')]);
const valid = makeLandscape();
const crcDamage = Buffer.from(valid);
crcDamage[crcDamage.length - 1] ^= 1;
const corrupt = [
  [Buffer.from('file.png'), /signature/],
  [valid.subarray(0, -1), /chunk/],
  [Buffer.concat([valid, Buffer.from([0])]), /IEND/],
  [crcDamage, /CRC/],
  [malformed(header(4097, 1), deflateSync(Buffer.alloc(5))), /4096/],
  [malformed(header(1, 1, {depth: 4}), deflateSync(Buffer.alloc(5))), /bit depth/],
  [malformed(header(1, 1), Buffer.from('broken zlib')), /zlib/],
  [malformed(header(1, 1, {interlace: 1}), deflateSync(Buffer.alloc(100))), /zlib/],
  [malformed(header(1, 1), Buffer.concat([deflateSync(Buffer.alloc(5)), Buffer.from([1])])), /compressed or decoded size/],
  [malformed(header(1, 1), deflateSync(Buffer.from([5, 0, 0, 0, 0]))), /failed to decode/],
];
for (const [png, message] of corrupt) assert.throws(() => buildWallPrintModel(png), error => error.code === 'invalid-wall-print-png' && message.test(error.message));

console.log('Wall print: deterministic landscape and interlaced portrait, actual Three.js geometry/UV/color and alpha, original embedded bytes, and malformed PNG rejection passed.');
