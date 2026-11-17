// ImageBitmap data is independent from Three's GPU texture ownership. Keep
// one shared owner count for every decoded image, including texture clones.
const imageOwners = new WeakMap();
const trackedTextures = new WeakSet();
const disposedTextures = new WeakSet();
const textureImages = new WeakMap();

function closableImage(image) {
  return image !== null && (typeof image === 'object' || typeof image === 'function') &&
    typeof image.close === 'function';
}

function retainImage(image) {
  if (!closableImage(image)) return;
  imageOwners.set(image, (imageOwners.get(image) || 0) + 1);
}

function releaseImage(image) {
  if (!closableImage(image)) return;
  const count = imageOwners.get(image);
  if (count === undefined) return;
  if (count > 1) {
    imageOwners.set(image, count - 1);
    return;
  }
  imageOwners.delete(image);
  image.close();
}

export function trackTexture(texture) {
  if (!texture?.isTexture || trackedTextures.has(texture)) return texture;
  const image = texture.image;
  trackedTextures.add(texture);
  textureImages.set(texture, image);
  retainImage(image);
  texture.addEventListener('dispose', () => {
    if (disposedTextures.has(texture)) return;
    disposedTextures.add(texture);
    releaseImage(textureImages.get(texture));
  });
  return texture;
}

export function trackTextures(textures) {
  for (const texture of textures || []) trackTexture(texture);
}
