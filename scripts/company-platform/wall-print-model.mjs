import {crc32, inflateSync} from 'node:zlib';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

function findPrototype() {
  for (let root = dirname(fileURLToPath(import.meta.url)); ; root = dirname(root)) {
    const prototype = join(root, 'prototype');
    if (existsSync(join(prototype, 'package.json')) && existsSync(join(prototype, 'node_modules'))) return prototype;
    if (root === dirname(root)) throw new Error('Install the project prototype dependencies before generating a wall print');
  }
}

// The same source can run here and from a pinned copy in an asset version directory.
const prototype = findPrototype();
const {PNG} = createRequire(join(prototype, 'package.json'))('pngjs');
const importThree = source => import(pathToFileURL(join(prototype, 'node_modules', 'three', source)));
const [{BoxGeometry, BufferGeometry, Float32BufferAttribute}, {mergeGeometries}] = await Promise.all([
  importThree('build/three.module.js'),
  importThree('examples/jsm/utils/BufferGeometryUtils.js'),
]);

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxDimension = 4096;
const maxPngBytes = 16 * 1024 * 1024;
const depthsByColor = new Map([[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]]);
const channelsByColor = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);

function invalidPng(message) {
  throw Object.assign(new Error(message), {code: 'invalid-wall-print-png'});
}

function checkInflateBoundary(compressed, {width, height, colorType, bitDepth, interlace}) {
  const rowBytes = Math.ceil(width * channelsByColor.get(colorType) * bitDepth / 8);
  // Each interlace pass can add a partial packed byte and a filter byte per image row.
  // This bounds pngjs's uncapped interlaced inflate. pngjs validates the specific pass layout.
  const maxOutputLength = height * (rowBytes + (interlace ? 14 : 1));
  let inflated;
  try {
    inflated = inflateSync(compressed, {maxOutputLength, info: true});
  } catch {
    invalidPng('PNG IDAT is not a complete zlib stream within the declared scanline size');
  }
  if (inflated.engine.bytesWritten !== compressed.length || (!interlace && inflated.buffer.length !== maxOutputLength))
    invalidPng('PNG IDAT compressed or decoded size does not match the declared image');
}

function validatePng(png) {
  if (png.length < signature.length || !png.subarray(0, signature.length).equals(signature))
    invalidPng('Expected a PNG signature');
  if (png.length > maxPngBytes) invalidPng('PNG exceeds the 16 MiB encoded image limit');

  let header, paletteEntries = 0, transparency = false, hasImageData = false, dataEnded = false, imageDataLength = 0;
  const imageData = Buffer.allocUnsafe(png.length);
  for (let offset = signature.length; offset < png.length;) {
    if (png.length - offset < 12) invalidPng('PNG ends inside a chunk header');
    const length = png.readUInt32BE(offset);
    const dataOffset = offset + 8, end = dataOffset + length;
    if (end + 4 > png.length) invalidPng('PNG chunk extends past the end of the file');
    const type = png.toString('latin1', offset + 4, dataOffset);
    if (!/^[a-zA-Z]{2}[A-Z][a-zA-Z]$/.test(type)) invalidPng('PNG has an invalid chunk type');
    if (crc32(png.subarray(offset + 4, end)) !== png.readUInt32BE(end)) invalidPng(`PNG ${type} CRC does not match`);
    const data = png.subarray(dataOffset, end);
    offset = end + 4;
    if (!header && type !== 'IHDR') invalidPng('PNG must start with IHDR');
    if (hasImageData && type !== 'IDAT') dataEnded = true;

    switch (type) {
      case 'IHDR': {
        if (header || length !== 13) invalidPng('PNG must have one 13-byte IHDR');
        const width = data.readUInt32BE(0), height = data.readUInt32BE(4);
        const bitDepth = data[8], colorType = data[9], interlace = data[12];
        if (width < 1 || height < 1 || width > maxDimension || height > maxDimension)
          invalidPng(`PNG width and height must each be within 1–${maxDimension} pixels`);
        if (!depthsByColor.get(colorType)?.includes(bitDepth) || data[10] !== 0 || data[11] !== 0 || interlace > 1)
          invalidPng('PNG IHDR has an invalid color type, bit depth, compression, filter or interlace method');
        header = {width, height, bitDepth, colorType, interlace};
        break;
      }
      case 'PLTE': {
        if (paletteEntries || transparency || hasImageData || [0, 4].includes(header.colorType) ||
            length < 3 || length > 768 || length % 3 !== 0 || (header.colorType === 3 && length / 3 > 1 << header.bitDepth))
          invalidPng('PNG has an invalid PLTE palette or chunk order');
        paletteEntries = length / 3;
        break;
      }
      case 'tRNS': {
        const {colorType, bitDepth} = header;
        const keyed = (colorType === 0 && length === 2) || (colorType === 2 && length === 6);
        const indexed = colorType === 3 && length > 0 && length <= paletteEntries;
        if (transparency || hasImageData || (!keyed && !indexed)) invalidPng('PNG has an invalid tRNS transparency chunk');
        if (keyed) for (let i = 0; i < length; i += 2)
          if (data.readUInt16BE(i) >= 1 << bitDepth) invalidPng('PNG tRNS key exceeds the image bit depth');
        transparency = true;
        break;
      }
      case 'IDAT':
        if (dataEnded || (header.colorType === 3 && !paletteEntries))
          invalidPng('PNG IDAT chunks must be consecutive and follow any required palette');
        hasImageData = true;
        data.copy(imageData, imageDataLength);
        imageDataLength += data.length;
        break;
      case 'IEND':
        if (length || !imageDataLength || offset !== png.length) invalidPng('PNG must end at an empty IEND following IDAT');
        checkInflateBoundary(imageData.subarray(0, imageDataLength), header);
        try {
          PNG.sync.read(png, {checkCRC: true});
        } catch (error) {
          invalidPng(`PNG image data failed to decode: ${error.message}`);
        }
        return header;
      default:
        if (/^[A-Z]/.test(type)) invalidPng(`PNG has an unsupported critical chunk ${type}`);
    }
  }
  invalidPng('PNG is missing IEND');
}

function printGeometries(aspect) {
  const frameHalf = .4, openingHalf = .364, rail = frameHalf - openingHalf;
  const depth = .062, matDepth = .039, imageFront = .040;
  const rails = [
    new BoxGeometry(.8, rail, depth).translate(0, frameHalf - rail / 2, depth / 2),
    new BoxGeometry(.8, rail, depth).translate(0, -frameHalf + rail / 2, depth / 2),
    new BoxGeometry(rail, openingHalf * 2, depth).translate(-frameHalf + rail / 2, 0, depth / 2),
    new BoxGeometry(rail, openingHalf * 2, depth).translate(frameHalf - rail / 2, 0, depth / 2),
  ];
  const frame = mergeGeometries(rails);
  const mat = new BoxGeometry(openingHalf * 2, openingHalf * 2, matDepth).translate(0, 0, matDepth / 2);
  const image = new BufferGeometry();
  const x = .324 * Math.min(1, aspect), y = .324 * Math.min(1, 1 / aspect);
  image.setAttribute('position', new Float32BufferAttribute([-x, -y, imageFront, x, -y, imageFront, x, y, imageFront, -x, y, imageFront], 3));
  image.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  // glTF coordinates use the image's top row at v=0. U increases toward the viewer's right.
  image.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  image.setIndex([0, 1, 2, 0, 2, 3]);
  return [frame, mat, image];
}

function pad4(bytes, padByte = 0) {
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, padByte)]);
}

function glbChunk(type, bytes) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(bytes.length);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, bytes]);
}

function encodeGlb(geometries, png) {
  const names = ['wall-print-frame', 'wall-print-mat', 'wall-print-image'];
  const parts = [], bufferViews = [], accessors = [];
  let byteOffset = 0;
  function addBytes(bytes, target) {
    const view = {buffer: 0, byteOffset, byteLength: bytes.length};
    if (target !== undefined) view.target = target;
    const padded = pad4(bytes);
    byteOffset += padded.length;
    parts.push(padded);
    return bufferViews.push(view) - 1;
  }
  function accessor(attribute, {type, componentType, target, min, max}) {
    const raw = attribute.array;
    const bufferView = addBytes(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), target);
    const entry = {bufferView, componentType, count: attribute.count, type};
    if (min !== undefined) Object.assign(entry, {min, max});
    return accessors.push(entry) - 1;
  }
  const meshes = geometries.map((geometry, i) => {
    geometry.computeBoundingBox();
    const attributes = {
      POSITION: accessor(geometry.getAttribute('position'), {type: 'VEC3', componentType: 5126, target: 34962,
        min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray()}),
      NORMAL: accessor(geometry.getAttribute('normal'), {type: 'VEC3', componentType: 5126, target: 34962}),
    };
    if (i === 2) attributes.TEXCOORD_0 = accessor(geometry.getAttribute('uv'), {type: 'VEC2', componentType: 5126, target: 34962});
    const indices = accessor(geometry.index, {type: 'SCALAR', componentType: 5123, target: 34963});
    return {name: names[i], primitives: [{attributes, indices, material: i}]};
  });
  const imageView = addBytes(png);
  const binary = Buffer.concat(parts);
  const json = {
    asset: {version: '2.0', generator: 'company-wall-print-v1'},
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{nodes: [0, 1, 2]}],
    nodes: names.map((name, mesh) => ({name, mesh})),
    meshes,
    buffers: [{byteLength: binary.length}],
    bufferViews, accessors,
    images: [{bufferView: imageView, mimeType: 'image/png'}],
    samplers: [{wrapS: 33071, wrapT: 33071, magFilter: 9729, minFilter: 9987}],
    textures: [{sampler: 0, source: 0}],
    materials: [
      {name: names[0], pbrMetallicRoughness: {baseColorFactor: [.075, .044, .03, 1], metallicFactor: 0, roughnessFactor: .7}},
      {name: names[1], pbrMetallicRoughness: {baseColorFactor: [.88, .85, .78, 1], metallicFactor: 0, roughnessFactor: .94}},
      {name: names[2], alphaMode: 'BLEND', extensions: {KHR_materials_unlit: {}}, pbrMetallicRoughness: {baseColorTexture: {index: 0}}},
    ],
  };
  const jsonChunk = glbChunk(0x4e4f534a, pad4(Buffer.from(JSON.stringify(json)), 0x20));
  const binChunk = glbChunk(0x004e4942, binary);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + jsonChunk.length + binChunk.length, 8);
  return Buffer.concat([header, jsonChunk, binChunk]);
}

/** Produce a centred, back-to-wall GLB and embed the validated source bytes unchanged. */
export function buildWallPrintModel(pngBytes) {
  if (!(pngBytes instanceof Uint8Array)) invalidPng('Expected PNG bytes as a Buffer or Uint8Array');
  const png = Buffer.from(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  const {width, height} = validatePng(png);
  return {bytes: encodeGlb(printGeometries(width / height), png), widthPixels: width, heightPixels: height};
}
