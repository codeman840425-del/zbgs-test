import {Cache, ImageBitmapLoader} from 'three';

// Attach to a fresh GLTFLoader for one document. Only the stock decoder of a
// parser-created bufferView URL can give this document exclusive ownership.
export function registerEmbeddedBitmapOwner(loader) {
  const images = new Set();
  let disposed = false;
  loader.register(parser => {
    const decoder = parser.textureLoader;
    const loadImageSource = parser.loadImageSource;
    if (decoder && typeof loadImageSource === 'function' &&
        Object.getPrototypeOf(decoder) === ImageBitmapLoader.prototype &&
        decoder.load === ImageBitmapLoader.prototype.load &&
        loadImageSource === Object.getPrototypeOf(parser).loadImageSource) {
      const privateDecoder = {
        isImageBitmapLoader:true,
        load(url, onLoad, onProgress, onError) {
          if (Cache.enabled || !url.startsWith('blob:') || decoder.load !== ImageBitmapLoader.prototype.load)
            return decoder.load(url, onLoad, onProgress, onError);
          return decoder.load(url, image => {
            if (!Cache.enabled && typeof image.close === 'function') {
              if (disposed) image.close();
              else images.add(image);
            }
            onLoad(image);
          }, onProgress, onError);
        },
      };
      parser.loadImageSource = function(index, selectedLoader) {
        const source = this.json.images[index];
        const embedded = source?.uri === undefined && Number.isInteger(source?.bufferView);
        return loadImageSource.call(this, index, embedded && selectedLoader === decoder ? privateDecoder : selectedLoader);
      };
    }
    return {name:'PrivateEmbeddedBitmapOwner'};
  });
  return {
    transfer(image) { return images.delete(image); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const image of images) image.close();
      images.clear();
    },
  };
}
