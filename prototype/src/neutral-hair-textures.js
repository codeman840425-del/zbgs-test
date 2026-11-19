import {TextureSource} from 'three';

// Private Texture wrappers retain UV transforms, sampler settings and disposal.
// Three's renderer owns the GPU allocation for a (Source, sampler) pair.
const sourcesByRenderer = new WeakMap();

function embeddedImageKey(texture, parser, bodySha256) {
  const json = parser?.json;
  const index = parser?.associations.get(texture)?.textures;
  const definition = json?.textures?.[index];
  const image = json?.images?.[definition?.source];
  const view = json?.bufferViews?.[image?.bufferView];
  if (!parser?.textureLoader?.isImageBitmapLoader || definition?.extensions ||
      !Number.isInteger(index) || !Number.isInteger(image?.bufferView) || image.mimeType !== 'image/png' ||
      image.uri !== undefined || view?.buffer !== 0 || json.buffers?.[0]?.uri !== undefined ||
      typeof ImageBitmap === 'undefined' || !(texture.image instanceof ImageBitmap)) return null;
  return [bodySha256, image.bufferView, texture.image.width, texture.image.height].join('/');
}

function makeSource(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', {willReadFrequently:true});
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return new TextureSource(canvas);
}

// The parser retains the entire VRM binary and its dependency cache. Inspect
// the verified authoring maps once; an actor only needs their small identities.
export function neutralHairImageKeys(originals, parser, verifiedBodySha256) {
  const keys = new WeakMap();
  if (!parser?.associations || !/^[a-f\d]{64}$/.test(verifiedBodySha256)) return keys;
  for (const {map, shadeMap} of originals) {
    for (const texture of [map, shadeMap]) {
      if (!texture || keys.has(texture)) continue;
      const key = embeddedImageKey(texture, parser, verifiedBodySha256);
      if (key) keys.set(texture, {key, image:texture.image});
    }
  }
  return keys;
}

export function createNeutralHairTextures(renderer, keys) {
  const wrappers = new Map(), leases = new Set();
  let pool;
  if (renderer?.isWebGLRenderer) {
    pool = sourcesByRenderer.get(renderer);
    if (!pool) sourcesByRenderer.set(renderer, pool = new Map());
  }
  return {
    get size() { return wrappers.size; },
    get(texture) {
      if (!texture) return null;
      if (wrappers.has(texture)) return wrappers.get(texture);
      const input = keys.get(texture);
      const key = pool && input && texture.image === input.image && input.key;
      const existing = key && pool.get(key);
      const source = existing ? existing.source : makeSource(texture.image);
      const result = texture.clone();
      // A fresh clone already requests its first upload. Reusing these
      // immutable pixels must not mark a source in another actor dirty.
      result.source = source;
      if (key && !leases.has(key)) {
        if (existing) existing.actors++;
        else pool.set(key, {source, actors:1});
        leases.add(key);
      }
      wrappers.set(texture, result);
      return result;
    },
    dispose() {
      for (const texture of wrappers.values()) texture.dispose();
      wrappers.clear();
      for (const key of leases) {
        if (--pool.get(key).actors === 0) pool.delete(key);
      }
      leases.clear();
    },
  };
}
