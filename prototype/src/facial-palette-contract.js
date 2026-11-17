import {REPRESENTATIVE_PALETTES} from './representative-batch.js';
import {nativePaletteContract} from './native-palette-catalog.js';
export const FACIAL_PALETTE_MANIFEST_URL='/assets/appearance-color-v3/runtime-manifest.json';
export const FACIAL_PALETTE_MANIFEST_SHA256='2eff13c1d3837c4f8f76b7d97007b219059c212c1031d77e27a2f824715af321';
export const FACIAL_PALETTE_VERSION='appearance-color-v3:'+FACIAL_PALETTE_MANIFEST_SHA256;
export const LEGACY_FACIAL_PALETTE_VERSION='appearance-color-v1:4c3b817065283d2256990ddeeb17ef0772ced1c1e299cff5e9d0ce1a3c23042c';

// A new body uses an explicit package; old recipe versions retain their meaning.
export function facialPaletteContract(bodySha256){
  const native=nativePaletteContract(bodySha256);
  if(native)return native.eyebrow?{...native,version:native.version+'|'+native.eyebrow.version}:native;
  const batchPalette=REPRESENTATIVE_PALETTES.find(p=>p.bodySha256s.includes(bodySha256));
  if(batchPalette)return batchPalette;
  return {url:FACIAL_PALETTE_MANIFEST_URL,sha256:FACIAL_PALETTE_MANIFEST_SHA256,version:FACIAL_PALETTE_VERSION};
}
export function compatiblePaletteVersions(bodySha256){
  const native=nativePaletteContract(bodySha256);
  if(native)return[...new Set([facialPaletteContract(bodySha256).version,native.version,FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION])];
  const contract=facialPaletteContract(bodySha256);
  return contract.version===FACIAL_PALETTE_VERSION?[FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION]:[contract.version];
}

export function assertPaletteRecipeVersion(bodySha256,version,appearance) {
  const native=nativePaletteContract(bodySha256);
  if(!native)return;
  const error=message=>{const e=new Error(message);e.field='paletteVersion';e.code='incompatible-version';throw e;};
  if(!compatiblePaletteVersions(bodySha256).includes(version))error('配色资源版本不兼容');
  if(version===facialPaletteContract(bodySha256).version)return;
  if((appearance?.eyebrowColor??'original')!=='original')error('旧配色资源不包含独立眉色');
  if(version===native.version)return;
  if(['hairColor','skinTone','eyeColor','lipColor'].some(field=>appearance?.[field]!=='original'))
    error('旧原生配方仅记录原色；新增虹膜配色需要匹配的原生资源版本');
}
