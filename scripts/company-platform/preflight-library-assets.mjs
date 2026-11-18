import fs from 'node:fs/promises';
import path from 'node:path';

let libraryModulePromise;

function installNodeImageDecodeShim() {
  globalThis.self ??= globalThis;
  if (globalThis.createImageBitmap) return;
  globalThis.createImageBitmap = async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    let width = 1;
    let height = 1;
    if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    } else if (bytes.length >= 10 && bytes.toString('ascii', 0, 6) === 'GIF89a' ||
               bytes.toString('ascii', 0, 6) === 'GIF87a') {
      width = bytes.readUInt16LE(6);
      height = bytes.readUInt16LE(8);
    }
    return {width, height, close() {}};
  };
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
export async function preflightLibraryAssets({root, resources}) {
  if (!Array.isArray(resources)) throw new Error('asset-preflight-list: resources must be an array');
  const createCompanyAssetLibrary = await getLibrary();
  const library = createCompanyAssetLibrary({
    fetchImpl: async url => {
      const bytes = await fs.readFile(localAssetPath(root, url));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
  });
  try {
    await library.preload(resources);
  } finally {
    library.dispose();
  }
  return {resources: resources.length};
}
