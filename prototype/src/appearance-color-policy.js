import {isNativeProductionBody} from './native-production-catalog.js';
import sourceOutfits from './source-outfit-profiles.json' with {type:'json'};
import {nativePaletteContract} from './native-palette-catalog.js';
import {nativeSkinToneContract} from './native-skin-tone-contract.js';
import {nativeLipColorContract} from './native-lip-color-contract.js';
import {fittedHeadAppearance} from './fitted-head-appearance.js';
// Native sources expose only their separately registered baked colors. Existing
// source families retain their prior color presets and resource preparation.
const originalOnly = Object.freeze({hairColor:false,skinTone:false,eyeColor:false,lipColor:false});
const sourcePolicies = Object.freeze({
  ...Object.fromEntries(Object.values(sourceOutfits).map(profile => [profile.sha256, originalOnly])),
  'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5':originalOnly,
  'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce':originalOnly,
  '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef':originalOnly,
  '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81':originalOnly,
});
const labels = {hairColor:'发色',skinTone:'肤色',eyeColor:'瞳色',lipColor:'唇色',eyebrowColor:'眉色'};

function registeredColors(avatarSha256) {
  const fitted=fittedHeadAppearance(avatarSha256);
  if(fitted)return fitted.colors;
  const skin = nativeSkinToneContract(avatarSha256), lip = nativeLipColorContract(avatarSha256);
  return {...nativePaletteContract(avatarSha256)?.colors,
    ...(skin ? {skinTone:skin.colors} : {}), ...(lip ? {lipColor:lip.colors} : {})};
}

export function appearanceColorSupport(avatarSha256) {
  const policy=fittedHeadAppearance(avatarSha256)?originalOnly:sourcePolicies[avatarSha256];
  const support={hairColor:true,skinTone:true,eyeColor:true,lipColor:true,...(policy ?? (isNativeProductionBody(avatarSha256) ? originalOnly : {}))};
  for(const [field,values] of Object.entries(registeredColors(avatarSha256)))
    support[field]=Object.keys(values).some(value=>value!=='original');
  return support;
}

export function appearanceColorPresets(avatarSha256,field,presets) {
  const native=registeredColors(avatarSha256)[field];
  if(native)return {...native};
  return appearanceColorSupport(avatarSha256)[field]?{...presets}:{original:null};
}

export function assertAppearanceColorSelection(avatarSha256, selection) {
  const support = appearanceColorSupport(avatarSha256);
  const nativeColors=registeredColors(avatarSha256);
  for (const field of Object.keys(labels)) {
    if (selection[field] == null || selection[field] === 'original') continue;
    const registered=nativeColors[field];
    if(registered?Object.hasOwn(registered,selection[field]):support[field])continue;
    const reason=registered?'仅支持已登记的配色':'仅支持原色';
    const error = new Error(`当前基模的${labels[field]}尚未适配，${reason}；当前外观未改变`);
    error.field = `appearance.${field}`;
    error.code = 'unsupported-resource';
    throw error;
  }
}
