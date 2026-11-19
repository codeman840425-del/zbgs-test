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

export async function verifySingingSources(root,resource,recipe) {
  const p=resource.provenance;
  const contract=JSON.parse(await readProductionFile(root,p.functionalContractSource));
  const design=recipe.designs?.find(d=>d.id===resource.id && d.version===resource.version);
  const spec=contract.designs?.[design?.kind], pins=p.dependencies??{};
  const mismatch = at => {throw Object.assign(Error('singing-source-mismatch: '+at),{code:'singing-source-mismatch',path:at});};
  if(!spec || spec.resource.mountRole!==resource.mountRole || !isDeepStrictEqual(pins.fittedMaster,spec.neutral) ||
    !isDeepStrictEqual(pins.originalGlb,spec.original) || !isDeepStrictEqual(pins.editableSource,spec.editable) ||
    spec.editable.path!==p.sourceArtifactPath || spec.editable.sha256!==p.sourceArtifactSha256) mismatch(resource.id);
  const family=path.posix.dirname(p.functionalContractSource)+'/';
  for(const name of ['sourceRecord','license','sourceConverter','editableReader','topologyReader','textureFilter']) {
    if(!Object.hasOwn(pins,name)) mismatch(name);
  }
  for(const pin of Object.values(pins)) {
    if(!pin?.path?.startsWith(family) || digest(await readProductionFile(root,pin.path))!==pin.sha256) mismatch(pin?.path??resource.id);
  }
  return new Map(Object.entries(pins));
}

export async function verifyTeaSources(root,resource,recipe) {
  const p=resource.provenance, pins=p.dependencies??{};
  const recordPath='assets-source/company-tea-station-v1/original/sources.json';
  const geometryPath='prototype/src/company/support-geometry.js';
  const roles={counter:'tea-counter',machine:'tea-machine',cup:'tea-cup'};
  const mismatch = at => {throw Object.assign(Error('tea-source-mismatch: '+at),{code:'tea-source-mismatch',path:at});};
  const design=recipe.designs?.find(item=>item.id===resource.id && item.version===resource.version);
  const original=recipe.sources?.[design?.source];
  if(!original || roles[design.kind]!==resource.mountRole || original.path!==p.sourceArtifactPath ||
      original.sha256!==p.sourceArtifactSha256 || original.author!==p.sourceAuthor || original.license!==p.sourceLicense) mismatch(resource.id);
  const recordBytes=await readProductionFile(root,recordPath);
  const record=JSON.parse(recordBytes);
  const pin=({path,sha256})=>({path,sha256});
  const geometry=await fs.readFile(path.join(root,geometryPath));
  const expected={
    sourceRecord:{path:recordPath,sha256:digest(recordBytes)}, sourceArchive:pin(record.archive),
    geometryValidation:{path:geometryPath,sha256:digest(geometry)},
    license:{path:original.licensePath,sha256:original.licenseSha256},
  };
  for(const [key,source] of Object.entries(record.sources)) expected['original-'+key]=pin(source);
  if(!isDeepStrictEqual(pins,expected)) mismatch(resource.id);
  for(const [key,entry] of Object.entries(expected)) {
    if(key==='geometryValidation' || key==='sourceRecord') continue;
    if(digest(await readProductionFile(root,entry.path))!==entry.sha256) mismatch(entry.path);
  }
  return new Map(Object.entries(expected));
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
    if(field==='sourceParameters' && provenance.generator==='scripts/company-platform/build-singing-stage.mjs')
      await verifySingingSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='tea-rest')
      await verifyTeaSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='plant-desktop-installation')
      await verifyPlantEditableProvenance(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && ['garment-rack-wardrobe','hanging-garment','enclosed-wardrobe'].includes(resource.productionBranch))
      await verifyGarmentEditableProvenance(root,resource,JSON.parse(bytes));
  }
}
