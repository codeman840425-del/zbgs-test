import nativeProductionAdmissions from './native-body-texture-coverage-admissions.json' with {type:'json'};
// Measured native two-state pixel contracts. A profile still pins its descriptor;
// adding a source requires its own source/pixel/equipment evidence and this data
// admission, never a new controller or an arbitrary image supplied at runtime.
const legacyAdmissions = [
  Object.freeze({
    avatarSha256:'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5',
    manifestSha256:'46a868ddc366a4f64de1154cbea3f70478b3f8406ceddb5a79d2b174ef373d5e',
    basePngSha256:'5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a',
    maskedPngSha256:'dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c',
    evidence:'assets-source/native-vroid-waist-body-texture-fit-v1/manifest.json',
  }),
  Object.freeze({
    avatarSha256:'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce',
    manifestSha256:'9fed8d43beef7149650d84dd6455bfae0a83029bb4a82899118ac93abd56d6a5',
    basePngSha256:'5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a',
    maskedPngSha256:'dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c',
    evidence:'assets-source/native-vroid-face-body-texture-fit-v1/manifest.json',
  }),
  Object.freeze({
    avatarSha256:'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',
    manifestSha256:'003e98086ed67b6fcd5c57e0b3b13e9c4a4beff412b3b74683e7cefc049c8fb2',
    basePngSha256:'5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a',
    maskedPngSha256:'dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c',
    evidence:'assets-source/native-vroid-body-texture-fit-v1/manifest.json',
  }),
  Object.freeze({
    avatarSha256:'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',
    manifestSha256:'c432a7cdd1f6f5e5af4bf07b79465b902f26c09b00f39254f206c2df24617143',
    optionalUncoveredEquipment:Object.freeze([Object.freeze({id:'native-7586-template-plain-crew-socks-v1',slot:'socks',
      sha256:'55026b9cb564f86b8f00fc0e1c6868d0e8aa7c44bdb58f4403cedf802ac2f7ab',covered:false,required:false})]),
    basePngSha256:'cfd1860d2d6c04e33b5636c029dac535a69e35eacf30f6f4d66729a4fc2e1368',
    maskedPngSha256:'15ab2ecee54e10bfdb84a38be10e41fa7c7658e9a9f77b8293c2fd27569d7136',
    evidence:'assets-source/native-vroid-male-body-texture-fit-v1/generated/manifest.json',
  }),
];

const seenBodies = new Set(legacyAdmissions.map(row => row.avatarSha256));
for (const row of nativeProductionAdmissions) {
  if (['avatarSha256','manifestSha256','basePngSha256','maskedPngSha256'].some(key => !/^[a-f0-9]{64}$/.test(row[key])) || seenBodies.has(row.avatarSha256)) throw Error('Invalid or conflicting native coverage admission');
  seenBodies.add(row.avatarSha256);
}
export const BODY_TEXTURE_COVERAGE_ADMISSIONS = Object.freeze([...legacyAdmissions, ...nativeProductionAdmissions.map(row => Object.freeze(row))]);
