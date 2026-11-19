// Follow the locked three-vrm deepDispose resource surface, once per owning
// VRM scene. Texture wrappers are distinct from potentially leased sources.
export function disposeAvatarScene(scene) {
  const geometries = new Set();
  const skeletons = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse(({geometry,skeleton,material}) => {
    if (geometry) geometries.add(geometry);
    if (skeleton) skeletons.add(skeleton);
    for (const item of Array.isArray(material) ? material : [material])
      if (item) materials.add(item);
  });

  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    if (material.isShaderMaterial && material.uniforms)
      for (const {value} of Object.values(material.uniforms)) if (value?.isTexture) textures.add(value);
  }

  for (const geometry of geometries) geometry.dispose();
  const boneTextures = new Set();
  for (const skeleton of skeletons) {
    for (const key of ['boneTexture','previousBoneTexture']) {
      const texture = skeleton[key];
      if (!texture) continue;
      textures.delete(texture);
      // Three's Skeleton.dispose owns these wrappers and clears its fields.
      // A second field or skeleton may alias a wrapper already released.
      if (boneTextures.has(texture)) skeleton[key] = null;
      else boneTextures.add(texture);
    }
    skeleton.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}
