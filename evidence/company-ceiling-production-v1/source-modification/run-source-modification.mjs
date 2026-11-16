import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { texture, glb } from '../../../scripts/company-platform/build-ceiling-finishes.mjs';

const evidenceRoot = new URL('./', import.meta.url);
const sourceRoot = new URL('../../../assets-source/company-ceiling-finishes-v1/', import.meta.url);
const outputRoot = new URL('../../../prototype/public/company-assets/ceiling-finishes-v1/', import.meta.url);
const ids = ['ceiling-panel-grid', 'ceiling-perforated', 'ceiling-woven', 'ceiling-linear'];
const parameterKeys = {
  'ceiling-panel-grid': 'panelPx',
  'ceiling-perforated': 'holePx',
  'ceiling-woven': 'weavePx',
  'ceiling-linear': 'linePx'
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function writeBytes(url, bytes) {
  await fs.mkdir(new URL('./', url), { recursive: true });
  await fs.writeFile(url, bytes);
}

export async function run() {
  const records = [];
  for (const id of ids) {
    const key = parameterKeys[id];
    const sourceUrl = new URL(`${id}.json`, sourceRoot);
    const originalBytes = await fs.readFile(sourceUrl);
    const original = JSON.parse(originalBytes);
    const modified = structuredClone(original);
    const from = modified.params[key];
    const to = from === 64 ? 128 : 64;
    modified.params[key] = to;
    const directory = new URL(`${id}/`, evidenceRoot);
    const modifiedSourceBytes = Buffer.from(`${JSON.stringify(modified, null, 2)}\n`);
    await writeBytes(new URL('original.json', directory), originalBytes);
    await writeBytes(new URL('modified.json', directory), modifiedSourceBytes);

    // Read the modified JSON back from disk before generating both output passes.
    const modifiedReadBytes = await fs.readFile(new URL('modified.json', directory));
    const modifiedRead = JSON.parse(modifiedReadBytes);
    const modifiedImage = texture(modifiedRead);
    const modifiedModel = glb(modifiedRead, modifiedImage);
    const repeatImage = texture(modifiedRead);
    const repeatModel = glb(modifiedRead, repeatImage);
    await writeBytes(new URL('modified-texture.png', directory), modifiedImage);
    await writeBytes(new URL('modified-model.glb', directory), modifiedModel);
    await writeBytes(new URL('repeat-texture.png', directory), repeatImage);
    await writeBytes(new URL('repeat-model.glb', directory), repeatModel);

    const formalImage = await fs.readFile(new URL(`${id}/v1/texture.png`, outputRoot));
    const formalModel = await fs.readFile(new URL(`${id}/v1/model.glb`, outputRoot));
    const formalSourceAfterBytes = await fs.readFile(sourceUrl);
    records.push({
      id,
      sourceParameters: `assets-source/company-ceiling-finishes-v1/${id}.json`,
      parameter: key,
      from,
      to,
      originalSourceSha256: hash(originalBytes),
      formalSourceAfterSha256: hash(formalSourceAfterBytes),
      formalSourceBytesSame: formalSourceAfterBytes.equals(originalBytes),
      modifiedSourceSha256: hash(modifiedReadBytes),
      modifiedTextureSha256: hash(modifiedImage),
      modifiedModelSha256: hash(modifiedModel),
      repeatTextureSha256: hash(repeatImage),
      repeatModelSha256: hash(repeatModel),
      modifiedTextureBytes: modifiedImage.length,
      modifiedModelBytes: modifiedModel.length,
      sourceWasReadBack: modifiedReadBytes.equals(modifiedSourceBytes),
      textureChangedFromFormal: !modifiedImage.equals(formalImage),
      modelChangedFromFormal: !modifiedModel.equals(formalModel),
      deterministicTextureRepeat: modifiedImage.equals(repeatImage),
      deterministicModelRepeat: modifiedModel.equals(repeatModel),
      files: [`${id}/original.json`, `${id}/modified.json`, `${id}/modified-texture.png`, `${id}/modified-model.glb`, `${id}/repeat-texture.png`, `${id}/repeat-model.glb`]
    });
  }
  const report = {
    status: records.every(record => record.sourceWasReadBack && record.formalSourceBytesSame && record.textureChangedFromFormal && record.modelChangedFromFormal && record.deterministicTextureRepeat && record.deterministicModelRepeat) ? 'passed' : 'failed',
    purpose: 'Actual source JSON modification, read-back export, and deterministic repeat for all four ceiling designs.',
    formalSourcesUntouched: true,
    records
  };
  await fs.writeFile(new URL('source-modification-report.json', evidenceRoot), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('run-source-modification.mjs')) {
  console.log(JSON.stringify(await run()));
}
