import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {crc32,deflateSync} from 'node:zlib';
import {installNodeImageDecodeShim, preflightLibraryAssets} from './preflight-library-assets.mjs';
import {validateResourceProvenance} from './validate-resource-provenance.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const resourcePath = path.join(root, 'prototype/public/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/resource.json');
const catalogPath = path.join(root, 'prototype/src/company/library-catalog.json');
const original = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogBefore = digest(await fs.readFile(catalogPath));
const outcomes = [];

async function expectCode(label, resource, code, testRoot = root, verify = () => {}) {
  await assert.rejects(() => preflightLibraryAssets({root:testRoot, resources: [resource]}), error => {
    assert.equal(error.code, code, `${label}: unexpected error ${error.code}`);
    verify(error);
    outcomes.push({label, code: error.code});
    return true;
  }, label);
}

await preflightLibraryAssets({root, resources: [original]});
outcomes.push({label: 'valid-concept-texture', code: 'passed'});

const catalog = JSON.parse(await fs.readFile(catalogPath,'utf8'));
const screens = catalog.resources.filter(resource => resource.asset && resource.display?.screen);
const monitor = screens.find(resource => resource.id === 'monitor-aurora');
assert(monitor);
await preflightLibraryAssets({root,resources:screens});
outcomes.push({label:'registered-screen-bindings',code:'passed',count:screens.length});
const screenWith = patch => ({...monitor,display:{...monitor.display,screen:{...monitor.display.screen,...patch}}});
await expectCode('missing-screen-node',screenWith({nodes:['missing-imported-screen']}),'missing-display-mesh');
await expectCode('duplicate-screen-target',screenWith({nodes:[...monitor.display.screen.nodes,...monitor.display.screen.nodes]}),'invalid-display-mapping');
await expectCode('out-of-range-screen-emission',screenWith({onIntensity:20}),'invalid-display-mapping');

await expectCode('digest-mismatch', {
  ...structuredClone(original),
  asset: {...original.asset, sha256: '0'.repeat(64)},
}, 'asset-digest-mismatch');

await expectCode('mount-envelope', {
  ...structuredClone(original),
  mounting: {...original.mounting, width: 0.01},
}, 'asset-mount-envelope-mismatch');

await assert.rejects(() => validateResourceProvenance({
  root,
  resource: {...structuredClone(original), provenance: {...original.provenance, generatorSha256: '0'.repeat(64)}},
  label: 'concept-acoustic-panel@1',
}), error => {
  assert.match(error.message, /^provenance-hash-mismatch: concept-acoustic-panel@1\.generatorSha256$/);
  outcomes.push({label: 'provenance-hash-mismatch', code: 'provenance-hash-mismatch'});
  return true;
});

const [requested, ...extra] = process.argv.slice(2);
const output = path.resolve(root, 'output');
const temporaryParent = requested ? path.resolve(root, requested) : output;
const relativeParent = path.relative(output, temporaryParent);
assert(!extra.length && relativeParent !== '..' && !relativeParent.startsWith('..' + path.sep) && !path.isAbsolute(relativeParent),
  'Optional fixture parent must be inside project output');
await fs.mkdir(temporaryParent, {recursive:true});
const fixtureRoot = await fs.mkdtemp(path.join(temporaryParent, 'asset-preflight-'));
const fixtureDir = path.join(fixtureRoot, 'prototype/public/company-assets');
await fs.mkdir(fixtureDir, {recursive:true});
const goodBytes = await fs.readFile(path.join(root, 'prototype/public', new URL(original.asset.url, 'http://company.local').pathname));
const badBytes = Buffer.from(goodBytes);
badBytes[20] = 0;

async function fixture(name, bytes) {
  await fs.writeFile(path.join(fixtureDir, name + '.glb'), bytes, {flag:'wx'});
  return {...original, id: 'preflight-fixture-' + name, asset: {...original.asset, url:'/company-assets/' + name + '.glb',
    bytes:bytes.length, sha256:digest(bytes)}};
}

function imageSections(bytes) {
  const end = 20 + bytes.readUInt32LE(12);
  return {gltf:JSON.parse(bytes.subarray(20,end)), binary:bytes.subarray(end + 8)};
}

function imageBuffer(bytes) {
  const {gltf,binary} = imageSections(bytes), view = gltf.bufferViews[gltf.images[0].bufferView];
  return binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
}

function withImage(originalBytes, image, type, unused = false) {
  const {gltf,binary} = imageSections(originalBytes);
  const view = gltf.bufferViews.push({buffer:0, byteOffset:binary.length, byteLength:image.length}) - 1;
  gltf.images[unused ? gltf.images.length : 0] = {bufferView:view, mimeType:type};
  const bin = Buffer.concat([binary,image,Buffer.alloc((4 - image.length % 4) % 4)]);
  gltf.buffers[0].byteLength = bin.length;
  const text = Buffer.from(JSON.stringify(gltf)), pad = Buffer.alloc((4 - text.length % 4) % 4, 0x20);
  const header = Buffer.alloc(20), next = Buffer.alloc(8);
  [0x46546c67,2,28 + text.length + pad.length + bin.length,text.length + pad.length,0x4e4f534a]
    .forEach((v,i) => header.writeUInt32LE(v,i * 4));
  next.writeUInt32LE(bin.length,0);
  next.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,text,pad,next,bin]);
}

function corruptPng(bytes) {
  const copy = Buffer.from(bytes);
  for (let offset = 8; offset + 12 <= copy.length; offset += 12 + copy.readUInt32BE(offset)) {
    if (copy.toString('ascii',offset+4,offset+8) !== 'IDAT') continue;
    const end = offset + 8 + copy.readUInt32BE(offset);
    // Keep the chunk checksum valid. Decode must reach the now invalid zlib stream.
    copy[offset + 8] = 0;
    copy.writeUInt32BE(crc32(copy.subarray(offset + 4,end)),end);
    return copy;
  }
  throw Error('Fixture needs a PNG IDAT chunk');
}

function truncateScan(jpeg) {
  let offset = 2;
  while (offset < jpeg.length && jpeg.readUInt16BE(offset) !== 0xffda) offset += 2 + jpeg.readUInt16BE(offset + 2);
  assert.equal(jpeg.readUInt16BE(offset), 0xffda);
  const startOfScan = offset + 2 + jpeg.readUInt16BE(offset + 2);
  // Retain the start/end markers and the scan table, but truncate the scan itself.
  return Buffer.concat([jpeg.subarray(0, startOfScan + 7), Buffer.from([0xff,0xd9])]);
}

function interlacedPng() {
  const chunk = (name, data) => {
    const result = Buffer.alloc(12 + data.length);
    result.writeUInt32BE(data.length);
    result.write(name,4,'ascii');
    data.copy(result,8);
    result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(3,0); header.writeUInt32BE(3,4);
  header[8] = 8; header[9] = 6; header[12] = 1;
  // Nonempty Adam7 scanline widths in a 3×3 RGBA image.
  const rows = Buffer.concat([1,1,2,1,1,3].map(w => Buffer.alloc(1 + w * 4)));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}

async function checkLoadedImage(label, resource, size) {
  await preflightLibraryAssets({root:fixtureRoot, resources:[resource], validate: library => {
    const {root:scene} = library.instantiate(resource), sizes = [];
    scene.traverse(node => {
      const image = node.material?.map?.image;
      if (image) sizes.push([image.width, image.height]);
      node.geometry?.dispose();
      if (node.material?.isMaterial) {node.material.map?.dispose();node.material.dispose();}
    });
    assert(sizes.length && sizes.every(value => value[0] === size[0] && value[1] === size[1]));
  }});
  outcomes.push({label, code:'passed', size});
}

try {
  await expectCode('invalid-glb-json',await fixture('invalid-json',badBytes),'invalid-glb-json',fixtureRoot);
  const jpeg = createRequire(new URL('../../prototype/package.json',import.meta.url))('jpeg-js');
  const png = imageBuffer(goodBytes), normalPng = await fixture('normal-png',withImage(goodBytes,png,'image/png'));
  assert(png.length % 4 === 0 && png.at(-1) === 0, 'Expected real legacy GLB alignment padding');
  await checkLoadedImage('decoded-png',normalPng,[png.readUInt32BE(16),png.readUInt32BE(20)]);
  await checkLoadedImage('decoded-adam7-png',await fixture('adam7-png',withImage(goodBytes,interlacedPng(),'image/png')),[3,3]);
  let smallJpeg;
  for (const width of [2048,512]) {
    const {data} = jpeg.encode({width,height:width,data:Buffer.alloc(width * width * 4,128)},80);
    const r = await fixture('jpeg-' + width,withImage(goodBytes,data,'image/jpeg'));
    await checkLoadedImage('decoded-jpeg-' + width,r,[width,width]);
    if (width === 512) smallJpeg = data;
  }
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(4097,16);
  oversized.writeUInt32BE(crc32(oversized.subarray(12,29)),29);
  for (const [name,bytes,type,pattern,unused] of [
    ['broken-jpeg-scan',truncateScan(smallJpeg),'image/jpeg',/marker|scan|invalid/i],
    ['wrong-png-zlib',corruptPng(png),'image/png',/header|inflate/i],
    ['unused-png',corruptPng(png),'image/png',/header|inflate/i,true],
    ['mismatched-mime',smallJpeg,'image/png',/signature|IHDR/],
    ['png-nonzero-tail',Buffer.concat([png.subarray(0,-1),Buffer.from([1])]),'image/png',/end of stream/],
    ['png-dimension-limit',oversized,'image/png',/4096 pixels/],
  ]) {
    const r = await fixture(name,withImage(goodBytes,bytes,type,unused));
    await expectCode(name,r,'asset-texture-load-failed',fixtureRoot,error => {
      assert.equal(error.path,`resources.${r.id}.asset.images[${unused ? 1 : 0}]`);
      assert.match(error.message,pattern);
    });
  }
  await checkLoadedImage('good-png-recovery',normalPng,[png.readUInt32BE(16),png.readUInt32BE(20)]);
  installNodeImageDecodeShim();
  await assert.rejects(globalThis.createImageBitmap(new Blob([corruptPng(png)],{type:'image/png'})),/header|inflate/i);
  await assert.rejects(globalThis.createImageBitmap(new Blob([truncateScan(smallJpeg)],{type:'image/jpeg'})),/marker|scan|invalid/i);
  outcomes.push({label:'room-shim-rejects-damaged-data',code:'passed'});
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
  gif.writeUInt16LE(2,6);
  gif.writeUInt16LE(3,8);
  const gifDimensions = await globalThis.createImageBitmap(new Blob([gif],{type:'image/gif'}));
  assert.deepEqual([gifDimensions.width,gifDimensions.height],[2,3]);
  outcomes.push({label:'legacy-gif-dimensions',code:'passed',size:[2,3]});
} finally {
  assert(path.dirname(fixtureRoot) === temporaryParent && path.basename(fixtureRoot).startsWith('asset-preflight-'));
  await fs.rm(fixtureRoot, {recursive:true, force:true});
}

const catalogAfter = digest(await fs.readFile(catalogPath));
assert.equal(catalogAfter, catalogBefore, 'preflight tests must not rewrite the registered catalog');
console.log(JSON.stringify({status: 'passed', groups: outcomes.length, outcomes}));
