import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

import {editableSources,editableValidator,verifyPlantEditableProvenance} from './plant-editable-source.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifyGarmentEditableProvenance(root, resource, recipe) {
  const pins = await editableSources(root, recipe);
  const design = recipe.designs?.find(d => d.id === resource.id && d.version === resource.version);
  const expected = pins.get(design?.source), dependencies = resource.provenance.dependencies;
  const validator = dependencies?.editableSourceValidator;
  function mismatch() {
    const code = 'garment-editable-provenance-mismatch';
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
    if(field==='sourceParameters' && resource.productionBranch==='plant-desktop-installation')
      await verifyPlantEditableProvenance(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && ['garment-rack-wardrobe','hanging-garment'].includes(resource.productionBranch))
      await verifyGarmentEditableProvenance(root,resource,JSON.parse(bytes));
  }
}
