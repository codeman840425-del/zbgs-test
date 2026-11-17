import * as THREE from 'three';
import {createNativePalettePart} from './native-palette-part.js';
import {assertAppearanceColorSelection} from './appearance-color-policy.js';

export function createNativeEyebrowPalette(options) {
  const part=createNativePalettePart({...options,field:'eyebrowColor',expectedSide:THREE.DoubleSide,validateInput(input,color) {
    assertAppearanceColorSelection(options.avatarSha256,{eyebrowColor:color});
  }});
  return {...part,getState() {
    const s=part.getState();
    return {eyebrowColor:s.color,nativeEyebrowLoading:s.loading,nativeEyebrowError:s.error,
      nativeEyebrowTextureCount:s.textureCount,cleanupErrors:s.cleanupErrors};
  }};
}
