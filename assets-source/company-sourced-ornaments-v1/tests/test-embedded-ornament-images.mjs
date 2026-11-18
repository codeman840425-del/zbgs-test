import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crc32} from 'node:zlib';
import {buildTabletopOrnament} from '../../../scripts/company-platform/adapt-tabletop-ornament.mjs';
import {createCompanyAssetLibrary} from '../../../prototype/src/company/asset-library.js';
import {SRGBColorSpace} from '../../../prototype/node_modules/three/build/three.module.js';

const root = new URL('../../../', import.meta.url);
const originalRoot = new URL('assets-source/company-side-table-life-items-v1/original/', root);
const requirePrototype = createRequire(new URL('prototype/package.json', root));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function readGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12), bin = 20 + length;
  assert.equal(bytes.readUInt32LE(bin + 4), 0x004e4942);
  return {json: JSON.parse(bytes.toString('utf8', 20, bin)), binary: bytes.subarray(bin + 8, bin + 8 + bytes.readUInt32LE(bin))};
}

function makeGlb(json, binary) {
  const body = Buffer.from(JSON.stringify(json));
  const padding = Buffer.alloc((4 - body.length % 4) % 4, 0x20);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + body.length + padding.length + binHeader.length + binary.length, 8);
  header.writeUInt32LE(body.length + padding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, body, padding, binHeader, binary]);
}

const cup = await fs.readFile(new URL('cup.glb', originalRoot));
const png = await fs.readFile(new URL('Textures/colormap.png', originalRoot));
const jpeg = requirePrototype('jpeg-js').encode(requirePrototype('pngjs').PNG.sync.read(png), 85).data;
const original = readGlb(cup);
const temporary = await fs.mkdtemp(fileURLToPath(new URL('./.embedded-cup-', import.meta.url)));
const files = [];

async function fixture(name, model) {
  const filename = path.join(temporary, `${name}.glb`), recipePath = path.join(temporary, `${name}.json`);
  files.push(filename, recipePath);
  await fs.writeFile(filename, model);
  await fs.writeFile(recipePath, JSON.stringify({
    schema: 'company-tabletop-ornament-recipe', version: 1,
    resource: {id: 'test-tabletop-inline-image', version: 1, displayName: 'Embedded-image regression fixture'},
    source: {path: path.relative(fileURLToPath(root), filename).split(path.sep).join('/'), sha256: hash(model),
      author: 'Kenney', license: 'CC0-1.0', url: 'https://kenney.nl/assets/food-kit',
      coordinates: {metresPerUnit: 1, up: '+Y', forward: '+Z'}},
    fit: {fill: .98, yawQuarterTurns: 0},
  }));
  return recipePath;
}

function inlineCup(mimeType, image) {
  const json = structuredClone(original.json);
  json.images[0].uri = `data:${mimeType};base64,${image.toString('base64')}`;
  return makeGlb(json, original.binary);
}

async function readMaterial(bytes, report) {
  const library = createCompanyAssetLibrary({fetchImpl: async () => ({ok: true,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)})});
  const resource = {id: 'test-cup-readback', version: 1, coordinates: {units: 'metres', up: '+Y', forward: '+Z'},
    mount: 'support-surface', mounting: report.mounting,
    asset: {format: 'glb', url: '/company-assets/test-cup-readback.glb', bytes: bytes.length, sha256: hash(bytes)}};
  const owned = new Set();
  try {
    await library.preload([resource]);
    const {root: scene} = library.instantiate(resource);
    let meshes = 0;
    scene.traverse(node => {
      if (!node.isMesh) return;
      meshes++;
      owned.add(node.geometry);
      owned.add(node.material);
      for (const field of Object.values(node.material)) if (field?.isTexture) owned.add(field);
      assert(node.geometry.attributes.uv);
      assert(node.material.map?.isTexture);
      assert.equal(node.material.map.colorSpace, SRGBColorSpace);
    });
    assert.equal(meshes, 1);
  } finally {
    for (const value of owned) value.dispose();
    library.dispose();
  }
}

try {
  for (const [mimeType, image] of [['image/png', png], ['image/jpeg', jpeg]]) {
    const label = mimeType.split('/')[1], source = inlineCup(mimeType, image);
    const recipePath = await fixture(label, source);
    const {bytes, report} = await buildTabletopOrnament(recipePath);
    assert.deepEqual((await buildTabletopOrnament(recipePath)).bytes, bytes);
    const output = readGlb(bytes), input = readGlb(source);
    assert.deepEqual(output.binary.subarray(0, input.binary.length), input.binary);
    const outputImage = output.json.images[0], view = output.json.bufferViews[outputImage.bufferView];
    assert.equal(outputImage.mimeType, mimeType);
    assert(!Object.hasOwn(outputImage, 'uri'));
    assert.equal(view.byteOffset % 4, 0);
    assert.equal(view.byteLength, image.length);
    assert.deepEqual(output.binary.subarray(view.byteOffset, view.byteOffset + view.byteLength), image);
    assert.deepEqual(output.json.bufferViews.slice(0, -1), input.json.bufferViews);
    for (const field of ['accessors', 'meshes', 'materials', 'textures', 'samplers']) assert.deepEqual(output.json[field], input.json[field]);
    assert.equal(report.convertedDataImages[0].sha256, hash(image));
    assert.equal(report.triangleCount, 112);
    await readMaterial(bytes, report);
    console.log(`${mimeType} ${hash(image)} preserved with source color map and UV`);
  }

  const wrongBase64 = structuredClone(original.json);
  wrongBase64.images[0].uri = 'data:image/png;base64,A!B=';
  const oversizedPng = Buffer.from(png);
  oversizedPng.writeUInt32BE(4097, 16);
  oversizedPng.writeUInt32BE(crc32(oversizedPng.subarray(12, 29)), 29);
  const negatives = [
    ['external', cup, 'external-asset-uri'],
    ['bad-base64', makeGlb(wrongBase64, original.binary), 'invalid-ornament-data-image'],
    ['truncated-png', inlineCup('image/png', png.subarray(0, -1)), 'invalid-ornament-data-image'],
    ['truncated-jpeg', inlineCup('image/jpeg', jpeg.subarray(0, -1)), 'invalid-ornament-data-image'],
    ['wrong-mime', inlineCup('image/jpeg', png), 'invalid-ornament-data-image'],
    ['oversize-encoded', inlineCup('image/png', Buffer.alloc(8 * 1024 * 1024 + 1)), 'ornament-data-image-limit'],
    ['oversize-dimension', inlineCup('image/png', oversizedPng), 'ornament-data-image-limit'],
  ];
  for (const [name, input, code] of negatives) {
    const recipe = await fixture(name, input);
    await assert.rejects(buildTabletopOrnament(recipe), error => error.code === code, name);
  }

  for (const [name, expected] of [
    ['books', '9b9ac25a1f140eb6938763c001b479a9c347aa95e0c4581313ca2d1dffad7b87'],
    ['plant', '2d1d9454d1bf899d07d39d94ba949151d998a45ddb11529b2009066ef13240a0'],
  ]) {
    const {bytes} = await buildTabletopOrnament(new URL(`../tabletop-${name}-kenney-v1.json`, import.meta.url));
    assert.equal(hash(bytes), expected);
  }
  console.log('Original untextured assets are byte-identical; seven invalid image cases rejected.');
} finally {
  for (const file of files) await fs.rm(file, {force: true});
  await fs.rmdir(temporary);
}
