import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {inflateSync} from 'node:zlib';

const requirePrototype = createRequire(new URL('../../prototype/package.json', import.meta.url));
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
const pngEndChunk = Buffer.from('0000000049454e44ae426082','hex');
const jpegEndMarker = Buffer.from([0xff,0xd9]);
const maxEdge = 4096;
const cachedDimensions = new Map();
const supportedImageTypes = new Set(['image/png','image/jpeg','image/jpg']);
let libraryModulePromise;

function checkDimensions(width, height) {
  if (![width,height].every(n => Number.isInteger(n) && n >= 1 && n <= maxEdge))
    throw Error(`Expected image sides between 1 and ${maxEdge} pixels; got ${width} × ${height}`);
}

function beforeAlignmentPadding(bytes, endMarker) {
  // Some historical glTF writers included the BIN alignment zeros in the
  // image bufferView length. Accept only that padding after the true end.
  if (bytes.length % 4) return bytes;
  for (let end = bytes.length - 1; end >= bytes.length - 3 && bytes[end] === 0; end--) {
    if (end >= endMarker.length && bytes.subarray(end - endMarker.length,end).equals(endMarker)) return bytes.subarray(0,end);
  }
  return bytes;
}

const pngChannels = {0:1,2:3,3:1,4:2,6:4};
const adam7 = [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];

function verifyPngPayload(bytes, width, height) {
  const depth = bytes[24], channels = pngChannels[bytes[25]], interlacing = bytes[28];
  if (![1,2,4,8,16].includes(depth) || !channels || ![0,1].includes(interlacing)) throw Error('Unsupported PNG IHDR layout');
  const passes = interlacing ? adam7 : [[0,0,1,1]];
  const expected = passes.reduce((total,[x,y,dx,dy]) => {
    if (x >= width || y >= height) return total;
    const columns = Math.ceil((width - x) / dx), rows = Math.ceil((height - y) / dy);
    return total + rows * (1 + Math.ceil(columns * channels * depth / 8));
  },0);
  const data = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset), name = bytes.toString('ascii',offset+4,offset+8), end = offset + 12 + length;
    if (end > bytes.length) throw Error('Truncated PNG chunk');
    if (name === 'IDAT') data.push(bytes.subarray(offset+8,end-4));
    if (name === 'IEND') break;
    offset = end;
  }
  // pngjs is still responsible for CRCs, filters and pixel conversion. Its
  // sync inflater can return pixels on damaged data, so check the whole deflate
  // stream with Node first, bounded by the exact filtered scanline size.
  const compressed = Buffer.concat(data);
  const {buffer,engine} = inflateSync(compressed,{maxOutputLength:expected,info:true});
  if (buffer.length !== expected || engine.bytesWritten !== compressed.length) throw Error('PNG IDAT stream length differs from IHDR');
}

function verifiedDimensions(bytes, type) {
  const key = type + ':' + createHash('sha256').update(bytes).digest('hex');
  const cached = cachedDimensions.get(key);
  if (cached) {
    cachedDimensions.delete(key);
    cachedDimensions.set(key, cached);
    return cached;
  }
  let decoded;
  if (type === 'image/png') {
    bytes = beforeAlignmentPadding(bytes, pngEndChunk);
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(pngSignature) || bytes.readUInt32BE(8) !== 13 ||
        bytes.toString('ascii',12,16) !== 'IHDR') throw Error('Invalid PNG signature or IHDR');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    checkDimensions(width,height);
    verifyPngPayload(bytes,width,height);
    const {PNG} = requirePrototype('pngjs');
    decoded = PNG.sync.read(bytes, {checkCRC:true});
  } else {
    bytes = beforeAlignmentPadding(bytes, jpegEndMarker);
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9)
      throw Error('Invalid JPEG SOI or EOI marker');
    decoded = requirePrototype('jpeg-js').decode(bytes, {tolerantDecoding:false, useTArray:true, formatAsRGBA:false,
      maxResolutionInMP:maxEdge ** 2 / 1e6, maxMemoryUsageInMB:128});
  }
  const {width,height,data} = decoded;
  checkDimensions(width,height);
  if (data.length !== width * height * (type === 'image/png' ? 4 : 3)) throw Error('Image has incomplete decoded pixels');
  const size = {width,height};
  // Reuse only measured dimensions of identical compressed bytes. Raster buffers
  // are discarded after decode and failures are never cached.
  cachedDimensions.set(key, size);
  if (cachedDimensions.size > 128) cachedDimensions.delete(cachedDimensions.keys().next().value);
  return size;
}

export function installNodeImageDecodeShim() {
  globalThis.self ??= globalThis;
  if (globalThis.createImageBitmap) return;
  globalThis.createImageBitmap = async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const declared = blob.type;
    const sniffed = !declared && (bytes.subarray(0,8).equals(pngSignature) ? 'image/png' :
      bytes.length >= 2 && bytes.readUInt16BE(0) === 0xffd8 ? 'image/jpeg' : null);
    const type = sniffed || declared;
    if (supportedImageTypes.has(type)) return {...verifiedDimensions(bytes, type), close() {}};
    let width = 1;
    let height = 1;
    if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    } else if (bytes.length >= 10 && ['GIF89a','GIF87a'].includes(bytes.toString('ascii',0,6))) {
      width = bytes.readUInt16LE(6);
      height = bytes.readUInt16LE(8);
    }
    return {width, height, close() {}};
  };
}

function embeddedImageDeclarations(bytes) {
  // Leave malformed containers and external URIs to the regular GLB gate.
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) return;
  const size = bytes.readUInt32LE(12), end = 20 + size;
  if (size % 4 || end + 8 > bytes.length || bytes.readUInt32LE(end + 4) !== 0x004e4942 ||
      end + 8 + bytes.readUInt32LE(end) !== bytes.length) return;
  let gltf;
  try { gltf = JSON.parse(bytes.toString('utf8',20,end)); }
  catch { return; }
  if (gltf?.asset?.version !== '2.0' || !Array.isArray(gltf.images) || gltf.buffers?.length !== 1 ||
      gltf.buffers[0]?.uri !== undefined || gltf.images.some(image => image?.uri !== undefined || !Number.isInteger(image?.bufferView))) return;
  const images = gltf.images.flatMap((image,index) => supportedImageTypes.has(image.mimeType) ? [{image,index}] : []);
  if (images.length) return {images, views:gltf.bufferViews, bin:bytes.subarray(end + 8)};
}

async function verifyEmbeddedImages(bytes, identities) {
  const declarations = embeddedImageDeclarations(bytes);
  if (!declarations || !identities?.some(resource => resource.asset.bytes === bytes.length)) return;
  const digest = createHash('sha256').update(bytes).digest('hex');
  const resource = identities.find(resource => resource.asset.sha256?.toLowerCase() === digest && resource.asset.bytes === bytes.length);
  if (!resource) return; // The normal loader must report the original identity failure.
  const {images,views,bin} = declarations;
  for (const {image,index} of images) {
    try {
      const view = views?.[image.bufferView], start = view?.byteOffset ?? 0, length = view?.byteLength;
      if (view?.buffer !== 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 1 ||
          start + length > bin.length) throw Error('Image bufferView is outside the embedded BIN');
      verifiedDimensions(bin.subarray(start,start+length), image.mimeType);
    } catch (cause) {
      const {CompanyError} = await import('../../prototype/src/company/document.js');
      throw new CompanyError('asset-texture-load-failed', `resources.${resource.id}.asset.images[${index}]`,
        `${image.mimeType} could not be decoded: ${cause.message}`);
    }
  }
}

async function getLibrary() {
  installNodeImageDecodeShim();
  libraryModulePromise ??= import('../../prototype/src/company/asset-library.js');
  return (await libraryModulePromise).createCompanyAssetLibrary;
}

function localAssetPath(root, url) {
  if (typeof url !== 'string' || !url.startsWith('/company-assets/'))
    throw new Error(`asset-preflight-url: expected local /company-assets URL, received ${url}`);
  const publicRoot = path.resolve(root, 'prototype/public');
  const target = path.resolve(publicRoot, `.${url}`);
  if (!target.startsWith(`${publicRoot}${path.sep}`))
    throw new Error(`asset-preflight-path: URL escapes prototype/public: ${url}`);
  return target;
}

/**
 * Reuses the same asset-library contract as the browser runtime while the
 * catalog is being built. This prevents a bad GLB or mount declaration from
 * entering the registered catalog and only then failing in a preview.
 */
export async function preflightLibraryAssets({root, resources, validate}) {
  if (!Array.isArray(resources)) throw new Error('asset-preflight-list: resources must be an array');
  const createCompanyAssetLibrary = await getLibrary();
  const identities = new Map();
  for (const resource of resources) if (resource?.asset?.url) {
    const group = identities.get(resource.asset.url) ?? [];
    group.push(resource);
    identities.set(resource.asset.url, group);
  }
  const library = createCompanyAssetLibrary({
    fetchImpl: async url => {
      const bytes = await fs.readFile(localAssetPath(root, url));
      await verifyEmbeddedImages(bytes, identities.get(url));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
  });
  try {
    await library.preload(resources);
    if (validate) await validate(library);
  } finally {
    library.dispose();
  }
  return {resources: resources.length};
}

/** Use the game's installation geometry for offline room acceptance, including hidden floors. */
export async function preflightDesktopAreas(root, derived) {
  if (!derived.facilities.some(f => f.resource.mounting?.reserveDesktopArea === true ||
      f.resource.garmentRail || f.resource.mount === 'garment-rail')) return;
  const {installationGeometryFacilities} = await import('../../prototype/src/company/desktop-placement.js');
  const {validateCeilingDocumentAssets} = await import('../../prototype/src/company/render.js');
  const entries = installationGeometryFacilities(derived);
  await preflightLibraryAssets({root, resources:entries.map(f=>f.resource),
    validate:library => validateCeilingDocumentAssets(derived,library,entries)});
}
