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
  if(['scripts/company-platform/build-vocal-height.mjs','scripts/company-platform/build-readable-score.mjs'].includes(p.generator))
    return verifyVocalAdjustmentSources(root,resource,recipe);
  const contract=JSON.parse(await readProductionFile(root,p.functionalContractSource));
  const design=recipe.designs?.find(d=>d.id===resource.id && d.version===resource.version);
  const spec=contract.designs?.[design?.kind], pins=p.dependencies??{};
  const mismatch = at => {throw Object.assign(Error('singing-source-mismatch: '+at),{code:'singing-source-mismatch',path:at});};
  if(!spec || spec.resource.mountRole!==resource.mountRole || !isDeepStrictEqual(pins.fittedMaster,spec.neutral) ||
    !isDeepStrictEqual(pins.originalGlb,spec.original) || !isDeepStrictEqual(pins.editableSource,spec.editable) ||
    spec.editable.path!==p.sourceArtifactPath || spec.editable.sha256!==p.sourceArtifactSha256) mismatch(resource.id);
  const family=path.posix.dirname(p.functionalContractSource)+'/';
  const editablePins = new Map(Object.entries(pins));
  if (p.generator === 'scripts/company-platform/build-vocal-fit.mjs') {
    const donorDir = 'prototype/public/company-assets/vocal-mic-looks-v1/floor-vocal-mic-disc/v1/';
    const paths = {donorSidecar:donorDir+'resource.json',donorModel:donorDir+'model.glb',
      donorParameters:'assets-source/company-vocal-mic-looks-v1/parameters.json',
      donorGenerator:'scripts/company-platform/build-vocal-mic-looks.mjs'};
    if (design.kind !== 'vocal' || !isDeepStrictEqual(resource.microphone?.pickupFit,
        {boomPitchDegrees:design.boomPitchDegrees,forwardMetres:design.forwardMetres})) mismatch(resource.id);
    for (const [key,file] of Object.entries(paths)) {
      const actual = path.resolve(root,file);
      if (pins[key]?.path !== file || await fs.realpath(actual) !== actual ||
          !(await fs.lstat(actual)).isFile() || digest(await fs.readFile(actual)) !== pins[key].sha256) mismatch(file);
      editablePins.delete(key);
    }
    const donor = JSON.parse(await fs.readFile(path.join(root,paths.donorSidecar)));
    if (pins.donorModel.sha256 !== donor.asset.sha256 || pins.donorGenerator.sha256 !== donor.provenance.generatorSha256 ||
        pins.donorParameters.sha256 !== donor.provenance.sourceParametersSha256 ||
        !isDeepStrictEqual(Object.fromEntries(editablePins),donor.provenance.dependencies)) mismatch(resource.id);
  }
  for(const name of ['sourceRecord','license','sourceConverter','editableReader','topologyReader','textureFilter']) {
    if(!Object.hasOwn(pins,name)) mismatch(name);
  }
  for(const pin of editablePins.values()) {
    if(!pin?.path?.startsWith(family) || digest(await readProductionFile(root,pin.path))!==pin.sha256) mismatch(pin?.path??resource.id);
  }
  return new Map(Object.entries(pins));
}

async function verifyVocalAdjustmentSources(root,resource,recipe) {
  const p=resource.provenance, height=p.generator.endsWith('/build-vocal-height.mjs');
  const folder='prototype/public/company-assets/'+(height?'vocal-fit-v1/floor-vocal-mic-disc-fit-lower':'singing-stage-v1/floor-score-stand-tripod')+'/v1/';
  const prefix=height?'heightSource':'donor';
  const fail=key=>{throw Object.assign(Error('singing-source-mismatch: '+key),{code:'singing-source-mismatch',path:key});};
  const pins=p.dependencies;
  async function pinned(key,expected) {
    const pin=pins?.[key];
    if(pin?.path!==expected) fail(key);
    const file=path.resolve(root,expected);
    if(await fs.realpath(file)!==file || !(await fs.lstat(file)).isFile()) fail(expected);
    const bytes=await fs.readFile(file);
    if(digest(bytes)!==pin.sha256) fail(expected);
    return bytes;
  }
  const donor=JSON.parse(await pinned(prefix+'Sidecar',folder+'resource.json'));
  await pinned(prefix+'Model',folder+'model.glb');
  const donorRecipe=JSON.parse(await pinned(prefix+'Parameters',donor.provenance.sourceParameters));
  await pinned(prefix+'Generator',donor.provenance.generator);
  const expected={...donor.provenance.dependencies};
  for(const k of ['Sidecar','Model','Parameters','Generator']) expected[prefix+k]=pins[prefix+k];
  const design=recipe.designs?.find(d=>d.id===resource.id&&d.version===resource.version);
  if(!design) fail(resource.id);
  if(height){
    const record=JSON.parse(await pinned('heightSourceRecord','assets-source/company-vocal-height-v1/source-record.json'));
    if(record.highResource?.glbSha256!==donor.asset.sha256||record.highResource.sidecarSha256!==pins.heightSourceSidecar.sha256) fail(resource.id);
    expected.heightSourceRecord=pins.heightSourceRecord;
    let mouthY=record.measurement.medianFemaleLipYMetres, offset=record.measurement.targetAboveLipMetres;
    if(Object.hasOwn(design,'observation')){
      const obs=design.observation, source=obs?.source;
      if(!/^assets-source\/company-[a-z0-9-]+\/(?:[\w-]+\/)*[\w-]+\.json$/.test(source?.path)||
          !/^[a-f0-9]{64}$/.test(source.sha256)||!isDeepStrictEqual(source,pins.heightObservation)) fail('heightObservation');
      const data=JSON.parse(await pinned('heightObservation',source.path));
      if(data.schema!=='company-vocal-height-observations'||data.version!==1||!Array.isArray(data.frames)) fail(source.path);
      const frames=data.frames.filter(frame=>frame.id===obs.frameId);
      if(frames.length!==1||!Array.isArray(frames[0].mouthM)||frames[0].mouthM.length!==3||
          !frames[0].mouthM.every(Number.isFinite)) fail('heightObservation.frameId');
      mouthY=frames[0].mouthM[1]; offset=obs.targetAboveLipMetres;
      expected.heightObservation=source;
    }
    if(!Number.isFinite(offset)||Math.abs(offset)>.04||!Number.isFinite(design.mastDropMetres)||
        Math.abs(design.mastDropMetres-(record.measurement.originalGrilleYMetres-mouthY-offset))>1e-9) fail(resource.id);
  }
  if(!isDeepStrictEqual(expected,pins)||donor.mountRole!==resource.mountRole||
      donor.asset.sha256!==pins[prefix+'Model'].sha256||donor.provenance.sourceParametersSha256!==pins[prefix+'Parameters'].sha256||
      donor.provenance.generatorSha256!==pins[prefix+'Generator'].sha256||
      (height&&!isDeepStrictEqual(resource.microphone?.pickupFit,{...donor.microphone.pickupFit,mastDropMetres:design.mastDropMetres}))) fail(resource.id);
  await verifySingingSources(root,donor,donorRecipe);
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

export async function verifyFloorAirSources(root,resource,recipe) {
  const p=resource.provenance, family='assets-source/company-floor-air-v1/';
  const mismatch = at => {throw Object.assign(Error('floor-air-source-mismatch: '+at),{code:'floor-air-source-mismatch',path:at});};
  const design=recipe.designs?.find(item=>item.id===resource.id && item.version===resource.version);
  if (!design || !['tower','purifier','circulator','pedestal'].includes(design.mechanism) ||
      p.sourceManifestPath!==family+'sources.json') mismatch(resource.id);
  const bytes=await readProductionFile(root,p.sourceManifestPath);
  if (p.sourceManifestSha256!==digest(bytes)) mismatch(p.sourceManifestPath);
  const upstream=JSON.parse(bytes).upstream;
  const pins=new Map([['sources',{path:p.sourceManifestPath,sha256:p.sourceManifestSha256}]]);
  // The producer always reads the upstream member as an input. Only exposed rotors actually contain its geometry.
  for (const [name,file,sha] of [['blade',upstream.path,upstream.sha256],['license',upstream.licensePath,upstream.licenseSha256]]) {
    if (!file?.startsWith(family+'original/') || digest(await readProductionFile(root,file))!==sha) mismatch(file);
    pins.set(name,{path:file,sha256:sha});
  }
  const reused=design.mechanism==='pedestal' || design.mechanism==='circulator';
  if (reused!==Boolean(resource.visualRotor) || (reused
    ? p.sourceArtifactPath!==upstream.path || p.sourceArtifactSha256!==upstream.sha256 ||
      p.sourceLicensePath!==upstream.licensePath || p.sourceLicenseSha256!==upstream.licenseSha256 ||
      p.sourceLicense!==upstream.license || p.sourceAuthor!==upstream.author
    : p.sourceArtifactPath!==undefined || p.sourceLicensePath!==undefined)) mismatch(resource.id);
  return pins;
}

export async function verifyWashbasinSources(root,resource,recipe) {
  const base='assets-source/company-public-washbasin-v1/', p=resource.provenance;
  const mismatch=at=>{throw Object.assign(Error('washbasin-source-mismatch: '+at),{code:'washbasin-source-mismatch',path:at});};
  const design=recipe.designs?.find(d=>d.id===resource.id&&d.version===resource.version);
  if(recipe.schema!=='company-public-washbasins'||recipe.version!==1||!['frame-round','cabinet-square','pier-round','shelf-square'].includes(design?.kind)||design.kind!==p.sourceDesign||
      p.functionalContractSource!==base+'contract.json') mismatch(resource.id);
  const {resource:contract}=JSON.parse(await readProductionFile(root,p.functionalContractSource));
  for(const [field,value] of Object.entries(contract)) if(!isDeepStrictEqual(resource[field],value)) mismatch(resource.id+'.'+field);
  const sourceRecord=base+'original/sources.json', recordBytes=await readProductionFile(root,sourceRecord);
  const record=JSON.parse(recordBytes);
  const original=record.originalModels[design.kind.endsWith('-round')?'bathroomSink':'bathroomSinkSquare'];
  const expected={sourceRecord:{path:sourceRecord,sha256:digest(recordBytes)},
    license:{path:base+'original/License.txt',sha256:record.licenseSha256},
    originalModel:{path:original.path,sha256:original.sha256}};
  if(!isDeepStrictEqual(expected,p.dependencies)||p.sourceArtifactPath!==original.path||p.sourceArtifactSha256!==original.sha256||
      p.sourceAuthor!==record.author||p.sourceLicense!==record.license||p.sourceUrl!==record.page) mismatch(resource.id);
  for(const pin of [expected.originalModel,expected.license]) {
    if(digest(await readProductionFile(root,pin.path))!==pin.sha256) mismatch(pin.path);
  }
  return new Map(Object.entries(expected));
}

export async function verifyWashroomDispenserSources(root,resource,recipe) {
  const base='assets-source/company-washroom-dispenser-v1/', p=resource.provenance;
  const mismatch=at=>{throw Object.assign(Error('dispenser-source-mismatch: '+at),{code:'dispenser-source-mismatch',path:at});};
  const design=recipe.designs?.find(item=>item.id===resource.id && item.version===resource.version);
  if(recipe.schema!=='company-washroom-dispensers'||recipe.version!==1||!design||design.kind!==p.sourceDesign||
      p.functionalContractSource!==base+'contract.json') mismatch(resource.id);
  const {resource:contract}=JSON.parse(await readProductionFile(root,p.functionalContractSource));
  for(const [field,value] of Object.entries(contract)) if(!isDeepStrictEqual(resource[field],value)) mismatch(resource.id+'.'+field);
  const sourceRecord=base+'original/sources.json', bytes=await readProductionFile(root,sourceRecord);
  const {pump,authored}=JSON.parse(bytes);
  const pins={sourceRecord:{path:sourceRecord,sha256:digest(bytes)}};
  if(design.kind==='pump') {
    if(pump.path!==base+'original/hand-wash-bottle.glb'||pump.licensePath!==base+'original/CC0-1.0.txt'||
        p.sourceArtifactPath!==pump.path||p.sourceArtifactSha256!==pump.sha256||p.sourceAuthor!==pump.author||
        p.sourceUrl!==pump.page||p.sourceLicense!==pump.license) mismatch(resource.id);
    pins.originalModel={path:pump.path,sha256:pump.sha256};
    pins.license={path:pump.licensePath,sha256:pump.licenseSha256};
    for(const pin of [pins.originalModel,pins.license]) {
      if(digest(await readProductionFile(root,pin.path))!==pin.sha256) mismatch(pin.path);
    }
  } else if(!authored.kinds.includes(design.kind)||p.sourceAuthor!==authored.author||p.sourceLicense!==authored.license||
      p.sourceArtifactPath||p.sourceArtifactSha256||p.sourceUrl) mismatch(resource.id);
  if(!isDeepStrictEqual(pins,p.dependencies)) mismatch(resource.id+'.dependencies');
  return new Map(Object.entries(pins));
}

export async function verifyCleaningLoadSources(root, resource, recipe) {
  const base = 'assets-source/company-cleaning-loads-v1/';
  const generator = 'scripts/company-platform/build-cleaning-loads.mjs';
  const p = resource.provenance;
  const mismatch = at => { throw Object.assign(Error('cleaning-load-source-mismatch: ' + at), {code:'cleaning-load-source-mismatch',path:at}); };
  const design = recipe.designs?.find(d => d.id === resource.id && d.version === resource.version);
  if (recipe.schema !== 'company-cleaning-loads' || recipe.version !== 1 || !design || design.kind !== p.sourceDesign ||
      p.generator !== generator || p.functionalContractSource !== base+'contract.json' ||
      resource.productionBranch !== 'storage-cleaning-shelf' || resource.mountRole !== 'storage-cleaning-shelf') mismatch(resource.id);
  const generatorPath = path.resolve(root, generator);
  if (await fs.realpath(generatorPath) !== generatorPath) mismatch(generator);
  const generatorHash = digest(await fs.readFile(generatorPath));
  const contractBytes = await readProductionFile(root, p.functionalContractSource);
  const contract = JSON.parse(contractBytes);
  if (contract.schema !== 'cleaning-load-installation' || contract.version !== 1 || contract.environmentBranch !== resource.productionBranch ||
      generatorHash !== p.generatorSha256 || digest(contractBytes) !== p.functionalContractSourceSha256) mismatch(resource.id);
  for (const [field,value] of Object.entries(contract.resource)) if (!isDeepStrictEqual(resource[field],value)) mismatch(resource.id+'.'+field);
  const sourceRecord = base+'original/sources.json', recordBytes = await readProductionFile(root, sourceRecord);
  const record = JSON.parse(recordBytes);
  const carton = new Map([['open-carton','cardboardBoxOpen'],['sealed-carton','cardboardBoxClosed']]).get(design.kind);
  const source = carton ? record : record.projectAuthored;
  const licensePath = base+'original/'+(carton ? 'Kenney-License.txt' : 'PROJECT-SOURCE.txt');
  if (source.licensePath !== licensePath || digest(await readProductionFile(root, licensePath)) !== source.licenseSha256) mismatch(licensePath);
  const pins = {generator:{path:generator,sha256:generatorHash},contract:{path:p.functionalContractSource,sha256:digest(contractBytes)},
    sourceRecord:{path:sourceRecord,sha256:digest(recordBytes)},license:{path:licensePath,sha256:source.licenseSha256}};
  if (carton) {
    const original = record.originalModels[carton], originalPath = base+'original/'+carton+'.glb';
    if (record.author !== 'Kenney' || record.license !== 'CC0-1.0' || record.page !== 'https://kenney.nl/assets/furniture-kit' ||
        original?.path !== originalPath || original.member !== 'Models/GLTF format/'+carton+'.glb' ||
        p.source !== record.page || p.license !== record.license || p.sourceArtifactPath !== originalPath ||
        p.sourceArtifactSha256 !== original.sha256) mismatch(resource.id);
    const originalBytes = await readProductionFile(root, originalPath);
    if (digest(originalBytes) !== original.sha256 || originalBytes.length !== original.bytes) mismatch(originalPath);
    pins.originalModel = {path:originalPath,sha256:original.sha256};
  } else if (!['caddy','linen-tray'].includes(design.kind) || !source.kinds.includes(design.kind) ||
      p.license !== 'Project-authored' || p.source !== licensePath || p.sourceArtifactPath || p.sourceArtifactSha256) mismatch(resource.id);
  if (!isDeepStrictEqual(pins,p.dependencies)) mismatch(resource.id+'.dependencies');
  return new Map(Object.entries(pins));
}

export async function verifyWallAbsorberSources(root, resource, recipe) {
  const family = 'assets-source/company-wall-absorber-v1/';
  const generator = 'scripts/company-platform/build-wall-absorber.mjs';
  const p = resource.provenance;
  const mismatch = name => { throw Object.assign(Error('wall-absorber-source-mismatch: '+name), {code:'wall-absorber-source-mismatch',path:name}); };
  const design = recipe.designs?.find(d => d.id === resource.id && d.version === resource.version);
  if (recipe.schema !== 'company-wall-absorber-collection' || recipe.version !== 1 || !design ||
      resource.mountRole !== 'wall-absorber-panel' || p.generator !== generator ||
      p.functionalContractSource !== family+'contract.json') mismatch(resource.id);
  const file = path.resolve(root,generator);
  if (await fs.realpath(file) !== file) mismatch(generator);
  const pins = {generator:{path:generator,sha256:digest(await fs.readFile(file))}};
  const fixed = {contract:family+'contract.json',sourceRecord:family+'original/sources.json',license:family+'original/PROJECT-SOURCE.txt'};
  for (const [key,name] of Object.entries(fixed)) pins[key] = {path:name,sha256:digest(await readProductionFile(root,name))};
  const sourceRecord = JSON.parse(await readProductionFile(root,fixed.sourceRecord));
  if (sourceRecord.schema !== 'company-wall-absorber-sources' || sourceRecord.licensePath !== fixed.license ||
      !sourceRecord.author || p.sourceDesign !== design.kind || resource.displayName !== design.displayName)
    mismatch(resource.id+'.design');
  const {resource:contract} = JSON.parse(await readProductionFile(root,fixed.contract));
  for (const [key,value] of Object.entries(contract))
    if (!isDeepStrictEqual(resource[key],value)) mismatch(resource.id+'.'+key);
  if (design.source) {
    const source = design.source;
    if (typeof source.path !== 'string' || !source.path.toLowerCase().endsWith('.glb') ||
        !source.author?.trim() || !source.license?.trim() || source.author !== p.sourceAuthor || source.license !== p.sourceLicense ||
        p.sourceArtifactPath !== source.path || p.sourceArtifactSha256 !== source.sha256) mismatch(resource.id);
    const originals = {originalModel:{path:source.path,sha256:source.sha256},originalLicense:source.licenseFile};
    if (design.kind === 'timber' && ['path','sha256','author','license','licenseFile'].some(key=>
      !isDeepStrictEqual(source[key],sourceRecord.woodDonor?.[key]))) mismatch(source.path);
    if (source.editable) originals.editableSource = source.editable;
    for (const [key,pin] of Object.entries(originals)) {
      if (!pin || digest(await readProductionFile(root,pin.path)) !== pin.sha256) mismatch(key);
      pins[key] = {path:pin.path,sha256:pin.sha256};
    }
    if (design.kind === 'dcc' && resource.asset.sha256 !== source.sha256) mismatch(source.path);
  } else if (['dcc','timber'].includes(design.kind) || p.sourceArtifactPath || p.sourceArtifactSha256 ||
             p.sourceAuthor !== sourceRecord.author || p.sourceLicense !== 'Project-authored') mismatch(resource.id);
  if (!isDeepStrictEqual(p.dependencies,pins) || p.generatorSha256 !== pins.generator.sha256 ||
      p.functionalContractSourceSha256 !== pins.contract.sha256) mismatch(resource.id+'.provenance');
  return new Map(Object.entries(pins));
}

export async function verifyMovableAbsorberSources(root, resource, recipe) {
  const family = 'assets-source/company-movable-absorber-v1/';
  const originals = family+'original/';
  const paths = {
    generator:'scripts/company-platform/build-movable-absorber.mjs', contract:family+'contract.json',
    sourceRecord:originals+'sources.json', license:originals+'PROJECT-SOURCE.txt',
    panelDonor:originals+'screen-partition-acoustic.glb', footDonor:originals+'floor-whiteboard.glb',
    casterDonor:originals+'platform-utility-cart.glb', casterLicense:originals+'CC0-source-declaration.txt'
  };
  const mismatch = key => {throw Object.assign(Error('movable-absorber-source-mismatch: '+key), {code:'movable-absorber-source-mismatch',path:key});};
  const p = resource.provenance;
  const design = recipe.designs?.find(d => d.id===resource.id && d.version===resource.version);
  if (recipe.schema!=='company-movable-absorber-collection' || recipe.version!==1 || !design ||
      !['folding','casters','double-sided','curved'].includes(design.kind) || p.sourceDesign!==design.kind ||
      resource.displayName!==design.displayName || p.generator!==paths.generator || p.functionalContractSource!==paths.contract ||
      !isDeepStrictEqual(resource.acoustic,{purpose:'movable-absorber-screen',construction:design.kind,configuration:'fixed-deployed'}))
    mismatch(resource.id);
  const generatorFile = path.resolve(root,paths.generator);
  if (await fs.realpath(generatorFile)!==generatorFile) mismatch(paths.generator);
  const pins = {};
  let record, contract;
  for (const [key,name] of Object.entries(paths)) {
    const bytes = key==='generator' ? await fs.readFile(generatorFile) : await readProductionFile(root,name);
    pins[key]={path:name,sha256:digest(bytes)};
    if (key==='sourceRecord') record=JSON.parse(bytes);
    if (key==='contract') contract=JSON.parse(bytes).resource;
  }
  if (record.licensePath!==paths.license || !record.author || p.sourceAuthor!==record.author ||
      record.panelDonor?.originalId!=='screen-partition-acoustic' || record.panelDonor.version!==1 ||
      record.footDonor?.originalId!=='information-board-floor-whiteboard' || record.footDonor.version!==1 ||
      record.casterDonor?.author!=='Innerscene Corp' || record.casterDonor.license!=='CC0-1.0') mismatch(paths.sourceRecord);
  for (const key of ['panelDonor','footDonor','casterDonor','casterLicense'])
    if (record[key]?.path!==paths[key] || record[key]?.sha256!==pins[key].sha256) mismatch(paths[key]);
  for (const [key,value] of Object.entries(contract))
    if (!isDeepStrictEqual(resource[key],value)) mismatch(resource.id+'.'+key);
  const license = design.kind==='casters' ? 'Project-authored and Innerscene CC0-1.0 caster components' : 'Project-authored';
  if (!isDeepStrictEqual(p.dependencies,pins) || p.generatorSha256!==pins.generator.sha256 ||
      p.functionalContractSourceSha256!==pins.contract.sha256 || p.sourceLicense!==license || p.license!==license)
    mismatch(resource.id+'.provenance');
  return new Map(Object.entries(pins));
}

export async function verifyWayfindingSources(root,resource,recipe) {
  const family='assets-source/company-wayfinding-v1/', common='assets-source/company-information-v1/';
  const scripts='scripts/company-platform/', p=resource.provenance;
  const mismatch=at=>{throw Object.assign(Error('wayfinding-source-mismatch: '+at),{code:'wayfinding-source-mismatch',path:at});};
  const design=recipe.designs?.find(item=>item.id===resource.id && item.version===resource.version);
  if (recipe.schema!=='company-wayfinding-signs' || recipe.version!==1 || design?.kind!=='wayfinding' ||
      !['arrivals','training','lift','stairs'].includes(design.purpose) || design.purpose!==resource.wayfindingMeaning ||
      p.sourceDesign!==design.purpose || resource.mountRole!=='information-content' ||
      resource.mount!=='information-surface' || resource.productionBranch!=='public-wayfinding-content') mismatch(resource.id);
  const paths={generator:scripts+'build-wayfinding.mjs', renderer:family+'render.py', artwork:family+'artwork.json',
    sourceRecord:family+'original/sources.json',license:family+'original/PROJECT-SOURCE.txt',
    meshGenerator:scripts+'build-information.mjs',contract:'docs/COMPANY-INFORMATION-DISPLAY-CONTRACT-v1.txt',
    commonParameters:common+'parameters.json',commonHelper:common+'generate-content.py',requirements:common+'requirements.txt',
    font:common+'NotoSansSC-VF.ttf',fontLicense:common+'OFL.txt'};
  const pins=p.dependencies;
  if (!isDeepStrictEqual(Object.keys(paths).sort(),Object.keys(pins??{}).sort()) ||
      p.generator!==paths.generator || p.functionalContractSource!==paths.contract) mismatch(resource.id);
  let record;
  for (const [key,relative] of Object.entries(paths)) {
    const pin=pins[key], file=path.resolve(root,relative);
    if (pin?.path!==relative || await fs.realpath(file)!==file || !(await fs.lstat(file)).isFile()) mismatch(relative);
    const bytes=await fs.readFile(file);
    if (digest(bytes)!==pin.sha256) mismatch(relative);
    if (key==='sourceRecord') record=JSON.parse(bytes);
  }
  const pngPath='prototype/public/company-assets/wayfinding-v1/'+resource.id+'/v'+resource.version+'/texture.png';
  if (p.sourceImage!==pngPath || p.contentPngSha256!==p.sourceImageSha256 || p.sourceAuthor!==design.author ||
      p.title!==design.title || p.subtitle!==design.subtitle || p.artworkAuthor!==(design.iconPaths?design.author:record.author))
    mismatch(resource.id+'.provenance');
  if (record?.schema!=='company-wayfinding-art-source' || record.version!==1 || record.license!=='Project-authored' ||
      !record.author || record.licensePath!==paths.license || record.artwork!==paths.artwork ||
      record.meshSource!==paths.meshGenerator || record.font!==paths.font || record.fontLicense!==paths.fontLicense ||
      p.generatorSha256!==pins.generator.sha256 || p.functionalContractSourceSha256!==pins.contract.sha256) mismatch(resource.id);
  return new Map(Object.entries(pins));
}

export async function verifyPrintedSignSources(root,resource,recipe) {
  const p=resource.provenance, source='assets-source/company-information-v1/';
  const pins=new Map();
  for(const [field,shaField,expected] of [
    ['fontFile','fontSha256',source+'NotoSansSC-VF.ttf'],['fontLicenseFile','fontLicenseSha256',source+'OFL.txt'],
    ['requirements','requirementsSha256',source+'requirements.txt'],
    ['contentHelper','contentHelperSha256','assets-source/company-washroom-sign-v1/draw.py'],
    ['meshGenerator','meshGeneratorSha256','scripts/company-platform/build-information.mjs']]){
    const file=path.resolve(root,expected);
    if(p[field]!==expected||await fs.realpath(file)!==file||digest(await fs.readFile(file))!==p[shaField]||
        (field==='fontFile'&&(recipe.font!==expected||recipe.fontSha256!==p[shaField])))
      throw Object.assign(Error('printed-sign-source-mismatch: '+expected),{code:'printed-sign-source-mismatch',path:expected});
    pins.set(field,{path:expected,sha256:p[shaField]});
  }
  return pins;
}

export async function verifyEquipmentCartSources(root, resource, recipe) {
  const base='assets-source/company-equipment-cart-v1/', p=resource.provenance;
  const mismatch=at=>{throw Object.assign(Error('equipment-cart-source-mismatch: '+at),{code:'equipment-cart-source-mismatch',path:at});};
  const design=recipe.designs?.find(d=>d.id===resource.id && d.version===resource.version);
  if (recipe.schema!=='company-equipment-carts' || recipe.version!==1 || !design || design.kind!==p.sourceDesign ||
      p.functionalContractSource!==base+'contract.json') mismatch(resource.id);
  const {resource:contract}=JSON.parse(await readProductionFile(root,p.functionalContractSource));
  for (const [field,value] of Object.entries(contract)) if (!isDeepStrictEqual(resource[field],value)) mismatch(resource.id+'.'+field);
  const original=base+'original/', paths={sourceRecord:original+'sources.json',license:original+'CC0-source-declaration.txt',originalModel:original+'platform-utility-cart.glb'};
  if (!isDeepStrictEqual(Object.keys(p.dependencies??{}).sort(),Object.keys(paths).sort())) mismatch(resource.id);
  const inputs={};
  for (const [key,file] of Object.entries(paths)) {
    const pin=p.dependencies[key];
    if (pin?.path!==file) mismatch(file);
    inputs[key]=await readProductionFile(root,file);
    if (digest(inputs[key])!==pin.sha256) mismatch(file);
  }
  const record=JSON.parse(inputs.sourceRecord);
  if (record.path!==paths.originalModel || record.bytes!==inputs.originalModel.length || record.sha256!==p.sourceArtifactSha256 ||
      p.sourceArtifactPath!==record.path || record.sha256!==p.dependencies.originalModel.sha256 ||
      p.sourceLicense!==record.license || p.sourceAuthor!==record.author || p.sourceUrl!==record.page ||
      !record.embeddedCopyright || !inputs.license.toString('utf8').includes(record.embeddedCopyright)) mismatch(record.path);
  return new Map(Object.entries(p.dependencies));
}

export async function verifyWallHvacSources(root, resource, recipe) {
  const base = 'assets-source/company-wall-hvac-v1/';
  const p = resource.provenance;
  function mismatch(at) {
    throw Object.assign(Error('wall-hvac-source-mismatch: ' + at), {code:'wall-hvac-source-mismatch', path:at});
  }
  const design = recipe.designs?.find(d => d.id === resource.id && d.version === resource.version);
  if (recipe.schema !== 'company-wall-hvac-collection' || !['curve','twin-intake','ribbed','stepped'].includes(design?.kind))
    mismatch(resource.id);
  const paths = {
    adapter:'scripts/company-platform/adapt-indoor-ac.mjs', adapterRecipe:base+'indoor-adapter.json',
    sourceReceipt:base+'original/source.json', environmentBranch:'assets-source/company-environment-specs-v1/branches.json',
  };
  const pins = new Map(), inputs = {};
  if (!isDeepStrictEqual(Object.keys(p.dependencies || {}).sort(), Object.keys(paths).sort())) mismatch(resource.id);
  for (const [name, file] of Object.entries(paths)) {
    const pin = p.dependencies[name];
    if (pin?.path !== file) mismatch(file);
    if (name === 'adapter') {
      const script = path.resolve(root,file);
      if (await fs.realpath(script) !== script || !(await fs.lstat(script)).isFile()) mismatch(file);
      inputs[name] = await fs.readFile(script);
    } else inputs[name] = await readProductionFile(root, file);
    if (digest(inputs[name]) !== pin.sha256) mismatch(file);
    pins.set(name,pin);
  }
  const receipt = JSON.parse(inputs.sourceReceipt), adapter = JSON.parse(inputs.adapterRecipe);
  const original = base+'original/ductless-wall-mounted-indoor-unit.glb';
  if (p.sourceManifestPath !== paths.sourceReceipt || p.sourceManifestSha256 !== pins.get('sourceReceipt').sha256 ||
      p.sourceArtifactPath !== original || p.sourceArtifactSha256 !== receipt.sha256 ||
      p.sourceLicense !== receipt.license.spdx || p.sourceAuthor !== receipt.author || p.sourceUrl !== receipt.page ||
      base+'original/'+receipt.originalFile !== original || base+adapter.source !== original || adapter.sourceSha256 !== receipt.sha256)
    mismatch(original);
  const bytes = await readProductionFile(root, original);
  if (bytes.length !== receipt.bytes || digest(bytes) !== receipt.sha256) mismatch(original);
  pins.set('original',{path:original,sha256:receipt.sha256});
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
    if(field==='sourceParameters' && resource.productionBranch==='showcase-product')
      await verifyShowcaseProvenance(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && ['scripts/company-platform/build-singing-stage.mjs','scripts/company-platform/build-vocal-mic-looks.mjs','scripts/company-platform/build-vocal-fit.mjs',
        'scripts/company-platform/build-vocal-height.mjs','scripts/company-platform/build-readable-score.mjs'].includes(provenance.generator))
      await verifySingingSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='tea-rest')
      await verifyTeaSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='fan-and-air-purifier')
      await verifyFloorAirSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='hvac')
      await verifyWallHvacSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='cart-and-equipment-storage')
      await verifyEquipmentCartSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && (resource.productionBranch==='storage-cleaning-shelf' || resource.mountRole==='storage-cleaning-shelf'))
      await verifyCleaningLoadSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.mountRole==='public-washbasin')
      await verifyWashbasinSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.mountRole==='washroom-dispenser')
      await verifyWashroomDispenserSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && (resource.productionBranch==='wall-absorber-panel' || resource.mountRole==='wall-absorber-panel'))
      await verifyWallAbsorberSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && (resource.productionBranch==='movable-absorber-screen' || resource.mountRole==='movable-absorber-screen' ||
        resource.acoustic?.purpose==='movable-absorber-screen' || provenance.generator==='scripts/company-platform/build-movable-absorber.mjs'))
      await verifyMovableAbsorberSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && (resource.productionBranch==='public-wayfinding-content' || Object.hasOwn(resource,'wayfindingMeaning')))
      await verifyWayfindingSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && provenance.generator==='scripts/company-platform/build-washroom-sign.mjs')
      await verifyPrintedSignSources(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && resource.productionBranch==='plant-desktop-installation')
      await verifyPlantEditableProvenance(root,resource,JSON.parse(bytes));
    if(field==='sourceParameters' && ['garment-rack-wardrobe','hanging-garment','enclosed-wardrobe'].includes(resource.productionBranch))
      await verifyGarmentEditableProvenance(root,resource,JSON.parse(bytes));
  }
}
