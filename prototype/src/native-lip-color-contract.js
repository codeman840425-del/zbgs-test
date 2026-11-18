import registry from '../public/assets/native-facecontour-lip-package-v1/registry.json' with {type:'json'};
import {nativeSkinToneContract} from './native-skin-tone-contract.js';

export const NATIVE_LIP_COLOR_SCHEMA = 'workbench-appearance-recipe-v11';
export const NATIVE_LIP_COLOR_RULES = 'workbench-appearance-rules-v11';
const PACKAGE = 'native-facecontour-lip-package-v1';
const SHA = /^[a-f0-9]{64}$/;
const check = (ok, message) => { if (!ok) throw Error(`原生唇妆：${message}`); };
const contracts = new Map();

check(registry.schema === 'native-facecontour-lip-registry-v1' && Array.isArray(registry.entries), '登记格式不匹配');
for (const {bodyType, bodySha256, skinManifestSha256, manifestSha256, lipId, color, manifestUrl, label} of registry.entries) {
  const skin = nativeSkinToneContract(bodySha256);
  const directory = `/assets/${PACKAGE}/${bodyType}/`;
  const url = manifestUrl ?? directory + 'manifest.json';
  const body = contracts.get(bodySha256) ?? {colors:{original:null}, variants:Object.create(null)};
  check(/^native-[a-z0-9-]+$/.test(bodyType) && skin?.url === `/assets/native-skin-tone-package-v1/${bodyType}/manifest.json` &&
    SHA.test(manifestSha256) && skin.sha256 === skinManifestSha256 &&
    /^native-[a-z0-9-]+$/.test(lipId) && !Object.hasOwn(body.variants, lipId) && /^#[a-f0-9]{6}$/.test(color) &&
    (url === directory + 'manifest.json' || url === directory + lipId + '/manifest.json') &&
    !Object.values(body.variants).some(style => style.url === url) &&
    (label === undefined || typeof label === 'string' && label.trim() === label && label.length > 0 && label.length <= 40),
    '登记身份、肤色依赖或色样不匹配');
  body.colors[lipId] = color;
  body.variants[lipId] = Object.freeze({url, sha256:manifestSha256, bodySha256, skinManifestSha256,
    tones:Object.freeze(Object.keys(skin.colors)), lipId, color, label:label ?? '原生唇妆'});
  contracts.set(bodySha256,body);
}
for (const body of contracts.values()) {
  Object.freeze(body.colors); Object.freeze(body.variants); Object.freeze(body);
}

export function nativeLipColorContract(bodySha256) {
  return contracts.get(bodySha256) ?? null;
}

export function validateNativeLipColorManifest(manifest, contract, toneId, lipId, skinManifest) {
  check(manifest?.schema === PACKAGE && manifest.version === 1 && manifest.avatarSha256 === contract.bodySha256 &&
    manifest.skinManifestSha256 === contract.skinManifestSha256 && manifest.lipId === lipId && lipId === contract.lipId &&
    manifest.color === contract.color, '清单或目标身份不匹配');
  const {face, tones} = manifest;
  check(/^[A-Za-z0-9_]+_Face_00_SKIN(?: \(Instance\))?$/.test(face?.materialName ?? '') &&
    face.width === 1024 && face.height === 1024 && face.alphaMode === 'MASK' && face.alphaCutoff === 0.5,
    '脸部材质或透明度模式不匹配');
  check(Object.keys(tones ?? {}).length === contract.tones.length &&
    contract.tones.every(tone => Object.hasOwn(tones, tone)) && Object.hasOwn(tones, toneId), '缺少已登记的肤色贴图');
  for (const {sourceSha256, authored} of Object.values(tones)) {
    check(SHA.test(sourceSha256 ?? '') && SHA.test(authored?.sha256 ?? '') &&
      authored.url === `/assets/${PACKAGE}/images/${authored.sha256}.png`, '贴图资源身份不匹配');
  }
  if (toneId !== 'original') {
    check(skinManifest?.face.authored.sha256 === tones[toneId].sourceSha256 &&
      skinManifest.face.sourceSha256 === tones.original.sourceSha256 &&
      ['materialName', 'width', 'height', 'alphaMode', 'alphaCutoff'].every(field => skinManifest.face[field] === face[field]),
      '唇妆没有配对当前肤色贴图');
  }
  return {face, selected:tones[toneId]};
}
