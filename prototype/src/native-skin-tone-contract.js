import skinRegistry from '../public/assets/native-skin-tone-package-v1/registry.json' with {type:'json'};
import {BODY_TEXTURE_COVERAGE_ADMISSIONS} from './body-texture-coverage-admissions.js';

export const NATIVE_SKIN_TONE_SCHEMA = 'workbench-appearance-recipe-v10';
export const NATIVE_SKIN_TONE_RULES = 'workbench-appearance-rules-v10';
const PACKAGE = 'native-skin-tone-package-v1';
const SHA = /^[a-f0-9]{64}$/;
const check = (ok, message) => { if (!ok) throw Error(`原生肤色：${message}`); };
const contracts = new Map(), bodyTypes = new Set();

check(skinRegistry.schema === 'native-skin-tone-registry-v1' && Array.isArray(skinRegistry.entries), '登记格式不匹配');
for (const row of skinRegistry.entries) {
  const {bodyType, bodySha256, manifestSha256, coverageManifestSha256, colors} = row;
  const coverage = BODY_TEXTURE_COVERAGE_ADMISSIONS.find(entry => entry.avatarSha256 === bodySha256);
  check(/^native-[a-z0-9-]+$/.test(bodyType) && !bodyTypes.has(bodyType) && !contracts.has(bodySha256) &&
    SHA.test(manifestSha256) && coverage && coverage.manifestSha256 === coverageManifestSha256 &&
    Object.keys(colors ?? {}).length === 1 && /^#[a-f0-9]{6}$/i.test(colors['native-warm-v1'] ?? ''), '登记身份或色样不匹配');
  bodyTypes.add(bodyType);
  contracts.set(bodySha256, Object.freeze({
    bodySha256, url:`/assets/${PACKAGE}/${bodyType}/manifest.json`, sha256:manifestSha256,
    coverage, colors:Object.freeze({original:null, ...colors}),
  }));
}

export function nativeSkinToneContract(bodySha256) {
  return contracts.get(bodySha256) ?? null;
}

export function validateNativeSkinToneManifest(manifest, contract, toneId) {
  check(manifest?.schema === PACKAGE && manifest.version === 1 &&
    manifest.avatarSha256 === contract.bodySha256 && manifest.toneId === toneId &&
    toneId !== 'original' && Object.hasOwn(contract.colors, toneId) &&
    manifest.coverageManifestSha256 === contract.coverage.manifestSha256, '清单、目标或遮罩身份不匹配');
  const {face, eyeline, body} = manifest;
  for (const [part, region] of [[face, 'Face_00_SKIN'], [eyeline, 'FaceEyeline_00_FACE'], [body, 'Body_00_SKIN']]) {
    const materialName = new RegExp(`^[A-Za-z0-9_]+_${region}(?: \\(Instance\\))?$`);
    check(materialName.test(part?.materialName ?? '') &&
      SHA.test(part.sourceSha256 ?? '') && Number.isInteger(part.width) && part.width > 0 &&
      Number.isInteger(part.height) && part.height > 0, '材质或来源身份不匹配');
  }
  check(face.alphaMode === 'MASK' && face.alphaCutoff === 0.5 &&
    body.alphaMode === 'MASK' && body.alphaCutoff === 0.5 &&
    eyeline.alphaMode === 'BLEND' && eyeline.alphaCutoff === null, '材质透明度模式不匹配');
  check(body.sourceSha256 === contract.coverage.basePngSha256 &&
    body.coveredSourceSha256 === contract.coverage.maskedPngSha256, '身体贴图未与原始遮罩配对');
  const directory = contract.url.slice(0, -'manifest.json'.length);
  for (const asset of [face.authored, eyeline.authored, body.authored, body.coveredAuthored]) {
    const url = asset?.url;
    check(typeof url === 'string', '贴图资源缺少路径');
    const filename = url.startsWith(directory) ? url.slice(directory.length) : url;
    check(/^[a-zA-Z0-9_-]+\.png$/.test(filename) &&
      SHA.test(asset.sha256 ?? ''), '贴图资源身份不匹配');
  }
  return manifest;
}
