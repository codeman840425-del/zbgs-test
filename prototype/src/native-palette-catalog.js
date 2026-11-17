const sha256='909f1c8699d2dd0338854090dc4f534273e33a78d1c00c3f470eb2ff826d8b7a';
const maleIris=Object.freeze({
  bodySha256:'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',
  url:'/assets/native-iris-palette-v1/manifest.json',sha256,
  version:'native-iris-palette-v1:'+sha256,
  sourceManifestSha256:'714c0448c4aa4bade52a13c68115ea384b652c5710f44e4345cb48900465b9b8',
  colors:Object.freeze({eyeColor:Object.freeze({original:null,green:'#4f7a4a'}),eyebrowColor:Object.freeze({original:null,brown:'#3a241e'})}),
  eyebrow:Object.freeze({url:'/assets/native-eyebrow-palette-v1/manifest.json',sha256:'acd3ec4703cac152890dda313f9b535d3efc5da3770fb4be28a4338e418e223a',version:'native-eyebrow-palette-v1:acd3ec4703cac152890dda313f9b535d3efc5da3770fb4be28a4338e418e223a',sourceManifestSha256:'62905d3336598164f31c6d3ed29443e9cf713562f47d08205e95145f26d8ae88'}),
});

export function nativePaletteContract(bodySha256) {
  return bodySha256===maleIris.bodySha256?maleIris:null;
}
