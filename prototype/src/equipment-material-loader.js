import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm';

// Standalone garments carry their own VRMC_materials_mtoon extension. Loading
// a whole avatar's VRM plugin does not register it on this separate loader.
export function createEquipmentLoader() {
  const loader = new GLTFLoader();
  loader.register(parser => new MToonMaterialLoaderPlugin(parser));
  return loader;
}

// The loader assigns textures and alphaTest after MToon's constructor. Prepare
// its uniforms before a paused actor can show the new resource's first frame.
export function initializeEquipmentMaterials(meshes) {
  const materials = new Set();
  for (const mesh of meshes) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      if (material?.isMToonMaterial) materials.add(material);
  }
  for (const material of materials) material.update(0);
}

// These materials are not owned by the avatar's VRM.update(). Outline and
// surface meshes may share a material; advance each visible instance once.
export function updateEquipmentMaterials(items, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid equipment delta seconds');
  const updated = new Set();
  for (const item of items) {
    if (!item.container.visible) continue;
    for (const mesh of item.meshes) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!material?.isMToonMaterial || updated.has(material)) continue;
        material.update(deltaSeconds);
        updated.add(material);
      }
    }
  }
}

export function collectEquipmentTextures(material, textures) {
  const collect = value => {
    if (value?.isTexture) textures.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
  };
  Object.values(material).forEach(collect);
  // MToon exposes map/shadeMultiplyTexture/etc. via prototype accessors;
  // their texture ownership is in uniforms rather than own properties.
  for (const uniform of Object.values(material.uniforms || {})) collect(uniform?.value);
}
