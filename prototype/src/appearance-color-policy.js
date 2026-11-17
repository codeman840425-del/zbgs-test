// Exact native sources currently have original-color evidence only. Existing
// source families retain their prior color presets and resource preparation.
const originalOnly = Object.freeze({hairColor:false,skinTone:false,eyeColor:false,lipColor:false});
const sourcePolicies = Object.freeze({
  '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef':originalOnly,
  '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81':originalOnly,
});
const labels = {hairColor:'发色',skinTone:'肤色',eyeColor:'瞳色',lipColor:'唇色'};

export function appearanceColorSupport(avatarSha256) {
  return {hairColor:true,skinTone:true,eyeColor:true,lipColor:true,...sourcePolicies[avatarSha256]};
}

export function assertAppearanceColorSelection(avatarSha256, selection) {
  const support = appearanceColorSupport(avatarSha256);
  for (const field of Object.keys(labels)) {
    if (selection[field] == null || selection[field] === 'original' || support[field]) continue;
    const error = new Error(`当前基模的${labels[field]}尚未适配，仅支持原色；当前外观未改变`);
    error.field = `appearance.${field}`;
    error.code = 'unsupported-resource';
    throw error;
  }
}
