import {REPRESENTATIVE_PALETTES} from './representative-batch.js';
export const FACIAL_PALETTE_MANIFEST_URL='/assets/appearance-color-v3/runtime-manifest.json';
export const FACIAL_PALETTE_MANIFEST_SHA256='2eff13c1d3837c4f8f76b7d97007b219059c212c1031d77e27a2f824715af321';
export const FACIAL_PALETTE_VERSION='appearance-color-v3:'+FACIAL_PALETTE_MANIFEST_SHA256;
export const LEGACY_FACIAL_PALETTE_VERSION='appearance-color-v1:4c3b817065283d2256990ddeeb17ef0772ced1c1e299cff5e9d0ce1a3c23042c';

// A new body uses an explicit package; old recipe versions retain their meaning.
export function facialPaletteContract(bodySha256){
  const batchPalette=REPRESENTATIVE_PALETTES.find(p=>p.bodySha256s.includes(bodySha256));
  if(batchPalette)return batchPalette;
  return {url:FACIAL_PALETTE_MANIFEST_URL,sha256:FACIAL_PALETTE_MANIFEST_SHA256,version:FACIAL_PALETTE_VERSION};
}
export function compatiblePaletteVersions(bodySha256){
  const contract=facialPaletteContract(bodySha256);
  return contract.version===FACIAL_PALETTE_VERSION?[FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION]:[contract.version];
}
