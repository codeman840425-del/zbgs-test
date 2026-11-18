import * as THREE from 'three';
import {collectEquipmentTextures} from './equipment-material-loader.js';
import pins from './native-body-normal-source-pins.json' with {type:'json'};

// The loader has already verified each entire VRM. These pins identify the same
// embedded PNG in independent documents, not their similarly named materials.
const renderers = new WeakMap();

export function shareBodyNormalSource(renderer, gltf, avatarSha256) {
  const pin = pins.avatars[avatarSha256];
  if (!pin || !renderer?.isWebGLRenderer || THREE.Cache.enabled || !gltf.parser?.textureLoader?.isImageBitmapLoader) return;
  const {json, associations} = gltf.parser;
  if (json.materials[pin.material]?.normalTexture?.index !== pin.texture ||
      json.textures[pin.texture]?.source !== pin.image || json.images[pin.image]?.mimeType !== 'image/png' ||
      !Number.isInteger(json.images[pin.image].bufferView)) return;

  const materials = new Set();
  gltf.scene.traverse(object => {
    if (object.isMesh) for (const material of [object.material].flat()) materials.add(material);
  });
  const targets = new Set([...materials].filter(material => associations.get(material)?.materials === pin.material)
    .map(material => material.normalMap));
  if (targets.size !== 1) return;
  const [texture] = targets;
  if (!texture?.isTexture || associations.get(texture)?.textures !== pin.texture ||
      texture.image?.width !== 2048 || texture.image?.height !== 2048 || typeof texture.image.close !== 'function' ||
      texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType || texture.internalFormat !== null ||
      texture.colorSpace !== THREE.NoColorSpace || texture.flipY || texture.premultiplyAlpha || texture.generateMipmaps ||
      texture.minFilter !== THREE.LinearFilter || texture.magFilter !== THREE.LinearFilter ||
      texture.wrapS !== THREE.RepeatWrapping || texture.wrapT !== THREE.RepeatWrapping || texture.wrapR ||
      texture.anisotropy !== 1 || texture.unpackAlignment !== 4 || !texture.mipmapsAutoUpdate || texture.mipmaps.length) return;

  // Different wrappers pointing at this original bitmap would retain ownership
  // after substitution. Leave unfamiliar loader output alone in that case.
  const textures = new Set();
  for (const material of materials) collectEquipmentTextures(material, textures);
  if ([...textures].some(other => other !== texture && other.image === texture.image)) return;

  let pool = renderers.get(renderer);
  if (!pool) renderers.set(renderer, pool = new Map());
  let entry = pool.get(pin.pngSha256);
  if (!entry) {
    entry = {source:texture.source, users:0};
    pool.set(pin.pngSha256, entry);
  } else {
    // This texture hasn't rendered yet. Its own GLTFLoader version is already
    // marked for upload. Bumping needsUpdate here would dirty the shared source.
    const redundant = texture.image;
    if (redundant !== entry.source.data) redundant.close();
    texture.source = entry.source;
  }
  entry.users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.users === 0) {
      pool.delete(pin.pngSha256);
      entry.source.data.close();
    }
  };
}
