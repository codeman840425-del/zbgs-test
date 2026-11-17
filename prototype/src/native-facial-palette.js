import {createNativePalettePart} from './native-palette-part.js';
import {assertAppearanceColorSelection} from './appearance-color-policy.js';
import {validateSurfaceSelection} from './surface-layer-compositor.js';

export function createNativeFacialPalette(options) {
  const part=createNativePalettePart({...options,field:'eyeColor',validateInput(input,color) {
    assertAppearanceColorSelection(options.avatarSha256,{eyeColor:color,lipColor:input.reset?'original':input.lipColor??'original'});
    if(validateSurfaceSelection(input.reset?[]:input.surfaceLayers??[]).length)throw Error('当前基模没有皮肤层适配');
  }});
  return {...part,getState() {
    const s=part.getState();
    return {eyeColor:s.color,lipColor:'original',surfaceLayers:[],surfaceManifestSha256:null,surfaceTextureCount:0,
      facialPaletteLoading:s.loading,facialPaletteError:s.error,facialTextureCount:s.textureCount,
      facialMaskIdentity:null,nativePaletteVersion:s.version,cleanupErrors:s.cleanupErrors};
  }};
}
