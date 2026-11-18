import pins from './native-uniform-normal-pins.json' with {type:'json'};

// The caller verified the whole VRM. The producer checks every texel and the
// exclusive use of each image bufferView. Keep the loader's sampler, material,
// orientation and texture ownership; only the PNG handed to the decoder changes.
export function registerUniformNormals(loader, verifiedBodySha256) {
  const entries = pins.avatars[verifiedBodySha256];
  if (!entries) return;
  loader.register(parser => {
    const doc = parser.json;
    const images = new Map();
    for (const pin of entries) {
      if (doc.materials[pin.material]?.normalTexture?.index !== pin.texture ||
          doc.textures[pin.texture]?.source !== pin.image ||
          doc.images[pin.image]?.bufferView !== pin.bufferView ||
          doc.images[pin.image]?.mimeType !== 'image/png') continue;
      images.set(pin.bufferView, pin.png1x1Base64);
    }
    return {
      name:'NativeUniformNormal',
      loadBufferView(index) {
        if (!images.has(index)) return null;
        const png = Uint8Array.from(atob(images.get(index)), byte => byte.charCodeAt(0));
        return Promise.resolve(png.buffer);
      },
    };
  });
}
