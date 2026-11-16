// Exact shape dependencies for resources that require body-surface identity.
// This registry stays intentionally narrow. Entries without a row keep the
// existing equipment loader behavior and do not gain an inferred dependency.
export const SHAPE_FIT_REGISTRY = Object.freeze({
  'm2-male-training-onepiece-v1': Object.freeze({
    assetSha256: 'e0cac5041a50bc07dde65c75414f98bab1501125939302eec0b9e1a5de826c7b',
    baseAvatarSha256: '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
    url: '/assets/m2-onepiece-v1/shape-fit.json',
    sha256: '581cbb17daa2008bbdcce172b55bb57f3d66d4489e3956d7023deffaca632cef',
  }),
});

export function shapeFitDescriptor(entry, avatarSha256) {
  const descriptor = SHAPE_FIT_REGISTRY[entry.id];
  if (!descriptor) return null;
  if (descriptor.assetSha256 !== entry.sha256 || descriptor.baseAvatarSha256 !== avatarSha256)
    throw Error(`Garment ${entry.id} shape dependency identity differs from the loaded body/resource`);
  return descriptor;
}









