// Source-authored discrete endpoints. These pins do not admit interpolated ranges.
export const VISIBLE_FACE_SOURCES = Object.freeze({
  mouth: {directory:'mouth-visible-v2',manifestSha256:'22b881bee408255304dbd2930a7f579c3e6c95e407e5200ec9612bf267c18767',
    values:[-.12,0,.12],recipes:{female:'f07085042a32ef942e121c3ffa48776ccd26c553ad15fefe1abc2b4d149f92d7',male:'1b3e019f92c799bc2486b4608584e347aa5c8fe1bfda8170a2d3e54e16f0009c'}},
  brow: {directory:'face-brow-visible-v2',manifestSha256:'75d67779ba6e3e3da24c0c4c3f0d253a5a0f8c5e608ba00cc2e879e36b3ad2c0',
    sampleId:'height3-spacing3-v2',endpoint:.003,recipes:{female:'a9458955a95e5c49a813be05123e704a4fb29fbca281a8b65aaac7ce3b62cc37',male:'8bf834f87892fdda07c856ed4c5223cae74fa731be6b73d9c3f1c2ef4924241f'}},
  nose: {directory:'face-nose-visible-v2',manifestSha256:'de19df3b3b5ee5327a4e29509716f3b1a05ba1d739b0fb21bd0b3b1ad83731ee',
    sampleId:'tip-forward2-v2',endpoint:.002,recipes:{female:'f6df54e4cefa8c185346e9b6d01477998fd7065b2759a9a21bf743bc01d14850',male:'7dae82cac4553844ae5b1a0f871feeb77f33b580aa72d1724cac51cfd00cf07a'}},
  eye: {directory:'face-eye-visible-v2',manifestSha256:'41186b90de6a875227771068a47943656b50585bc951fac346aa9d2f8f2d9c54',
    sampleId:'aperture-width105-v2',endpoint:1.05,recipes:{female:'5ddc174eb166c2aeec34a7e6a29c62d9518bd244e5edf00e3784e80e93dad778',male:'d31841fc9bab96e1284a2ccb275c20aa5c100d9c1737e00867a4bcb63dd177f0'}},
});
export const LEGACY_FACE_SAMPLES=Object.freeze({brow:'height1-spacing1-v1',nose:'tip-forward05-v1',eye:'aperture-width101-v1'});
export function mouthValueSupported(capability,value){
  if(!Number.isFinite(value))return false;
  if(value===0)return true;
  if(!capability.available)return false;
  if(capability.mouthEndpointValues?.includes(value))return true;
  if(Array.isArray(capability.mouthSupportedValues))return capability.mouthSupportedValues.includes(value);
  const range=capability.mouthRange;
  return Array.isArray(range)&&value>=range[0]&&value<=range[1];
}
export function faceSampleSupported(capability,domain,value){
  if(value==='none')return true;
  if(!capability[domain+'Available'])return false;
  return (capability[domain+'Samples']||[LEGACY_FACE_SAMPLES[domain]]).includes(value);
}
