import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

import {editableSources,editableValidator,readProductionFile,verifyPlantEditableProvenance} from './plant-editable-source.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyGarmentEditableProvenance(root,resource,recipe) {
  return verifyEditableSource(root,resource,recipe,'garment-editable-provenance-mismatch');
}

async function verifyEditableSource(root,resource,recipe,code) {
  const pins = await editableSources(root, recipe);
  const design = recipe.designs?.find(d => d.id === resource.id && d.version === resource.version);
  const expected = pins.get(design?.source), dependencies = resource.provenance.dependencies;
  const validator = dependencies?.editableSourceValidator;
  function mismatch() {
    throw Object.assign(Error(code + ': ' + resource.id + '@' + resource.version), {code});
  }
  if (!design || !isDeepStrictEqual(dependencies?.editableSource, expected)) mismatch();
  // Older fixed resources without any editable input predate the validator pin.
  if (expected || validator) {
    const bytes = await fs.readFile(path.resolve(root, editableValidator));
    if (!isDeepStrictEqual(validator, {path:editableValidator, sha256:digest(bytes)})) mismatch();
  }
  return pins;
}

// Match the original glTF image indices to the exact PNGs that a receiver must retain.
export async function showcaseTexturePins(root, source) {
  const original = await readProductionFile(root,source.path);
  if (digest(original) !== source.sha256)
    throw Object.assign(Error('appearance-source-pin-mismatch: '+source.path),{code:'appearance-source-pin-mismatch'});
  const gltf = JSON.parse(original.subarray(20,20+original.readUInt32LE(12)).toString('utf8'));
  const pins = {};
  for (const [index,image] of (gltf.images ?? []).entries()) {
    if (image.uri === undefined) continue;
    const pin = source.textures?.[image.uri];
    if (!pin || digest(await readProductionFile(root,pin.path)) !== pin.sha256)
      throw Object.assign(Error('appearance-source-pin-mismatch: '+(pin?.path ?? image.uri)),{code:'appearance-source-pin-mismatch'});
    pins['sourceTexture-'+index] = {path:pin.path,sha256:pin.sha256};
  }
  return pins;
}

export async function verifyShowcaseProvenance(root,resource,recipe) {
  const editable = await verifyEditableSource(root,resource,recipe,'showcase-editable-provenance-mismatch');
  const design = recipe.designs.find(item=>item.id===resource.id && item.version===resource.version);
  const source = recipe.sources[design.source];
  const provenance = resource.provenance;
  const textures = await showcaseTexturePins(root,source);
  const registered = Object.fromEntries(Object.entries(provenance.dependencies).filter(([key])=>key.startsWith('sourceTexture-')));
  if (source.path !== provenance.sourceArtifactPath || source.sha256 !== provenance.sourceArtifactSha256 ||
      !isDeepStrictEqual(textures,registered))
    throw Object.assign(Error('showcase-original-provenance-mismatch: '+resource.id),{code:'showcase-original-provenance-mismatch'});
  return new Map([...editable,...Object.entries(textures)]);
}

export async function validateResourceProvenance({root, resource, label = resource?.id || '?'}) {
  if (!resource?.asset) return;
  const provenance = resource.provenance || {};
  if (!provenance.license || !provenance.sourceParameters || !provenance.sourceParametersSha256 ||
      !provenance.generator || !provenance.generatorSha256)
    throw new Error(`missing-resource-provenance: ${label}`);
  for (const [field, hashField] of [['sourceParameters', 'sourceParametersSha256'], ['generator', 'generatorSha256'],
    ['functionalContractSource', 'functionalContractSourceSha256'], ['environmentBranchSource', 'environmentBranchSourceSha256'],
    ['sourceImage', 'sourceImageSha256'], ['sourceArtifactPath', 'sourceArtifactSha256']]) {
    if (!provenance[field]) {
      if (['functionalContractSource','environmentBranchSource','sourceImage','sourceArtifactPath'].includes(field) && !provenance[hashField]) continue;
      throw new Error(`missing-resource-provenance: ${label}.${field}`);
    }
    const file = path.resolve(root, provenance[field]);
    const bytes = await fs.readFile(file).catch(() => null);
    if (!bytes) throw new Error(`missing-resource-provenance-file: ${label}.${field}`);
    if (provenance[hashField] !== digest(bytes)) throw new Error(`provenance-hash-mismatch: ${label}.${hashField}`);
    if(field==='sourceParameters' && resource.productionBranch==='showcase-product')
      await verifyShowcaseProvenance(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='plant-desktop-installation')
      await verifyPlantEditableProvenance(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && ['garment-rack-wardrobe','hanging-garment','enclosed-wardrobe'].includes(resource.productionBranch))
      await verifyGarmentEditableProvenance(root,resource,JSON.parse(bytes));
  }
}
