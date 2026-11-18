import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {collectRecordResources} from './record-resources.mjs';
import {digest, localFile, runtimePath} from './files.mjs';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {facialPaletteContract} from '../../prototype/src/facial-palette-contract.js';
import {facialSampleResource} from '../../prototype/src/facial-geometry-selection.js';
import {validateHairSelection, hairFitIdentity} from '../../prototype/src/hair-fit-contract.js';
import {accessorySelection} from '../../prototype/src/accessory-recipe.js';
import {SURFACE_LAYER_PACKAGE} from '../../prototype/src/surface-layer-catalog.js';
import {createCharacterRecord} from '../../prototype/src/character-record.js';
import {deriveCharacterResourceIdentities} from '../../prototype/src/character-runtime-record.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const release = JSON.parse(await readFile(path.join(root, 'delivery/appearance-workbench.json'), 'utf8'));
const dist = path.resolve(root, process.argv[2] ?? release.directory);
const publicRoot = path.join(root, 'prototype/public');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const publicJson = url => json('prototype/public' + url);
const nativeRecord = body => json('evidence/m2-character-runtime-fixed-v1/' + body + '-record.json');
const disabled = {enabled:false, identity:null};
const propsOff = {schema:'live-accessory-record-v1', selections:{mic:disabled, glasses:disabled}, microphonePresentation:null};
const neutralGeometry = {
  mouthWidth:0, recipeSha256:null, browSample:'none', browRecipeSha256:null,
  noseSample:'none', noseRecipeSha256:null, eyeSample:'none', eyeRecipeSha256:null,
};

async function collect(record, {tamper, omit, sourceRoot = root} = {}) {
  const files = new Map();
  const add = async (url, reason, {sha256, bytes:size, parent, provenance}) => {
    const relative = runtimePath(url, parent);
    if (relative === omit) throw Error('Missing test dependency ' + relative);
    const bytes = await readFile(await localFile(dist, relative));
    if (relative === tamper) bytes[0] ^= 1;
    const original = await readFile(await localFile(publicRoot, relative));
    const hash = digest(bytes);
    assert.equal(hash, digest(original), relative);
    if (sha256 !== undefined) assert.equal(hash, sha256, relative);
    if (size !== undefined) assert.equal(bytes.length, size, relative);
    files.set('/' + relative, {reason, provenance});
    return {path:relative, bytes, value:relative.endsWith('.json') ? JSON.parse(bytes) : null};
  };
  const result = await collectRecordResources({record, sourceRoot, add});
  return {result, files};
}

function contains(files, urls) {
  for (const url of urls) assert(files.has(url), 'Missing collected dependency ' + url);
}

async function template(bodyType, outfitIndex, changes = {}) {
  const config = foundationProfile(bodyType);
  const exact = (await publicJson(config.manifestUrl)).items;
  for (const descriptor of config.additionalEquipmentManifests ?? [])
    exact.push(...(await publicJson(descriptor.url)).items);
  const outfit = outfitSelection(config, outfitIndex);
  const resources = Object.fromEntries(outfit.roles.map((role, index) => [
    role, exact.find(entry => entry.id === outfit.ids[index]),
  ]));
  return {
    schema:'workbench-appearance-recipe-v6', rulesVersion:'workbench-appearance-rules-v6',
    paletteVersion:facialPaletteContract(config.sha256).version, base:{bodyType, sha256:config.sha256},
    appearance:{hairStyle:'original', hairColor:'original', skinTone:'original', eyeColor:'original', lipColor:'original'},
    hairAssetSha256:null, hairFit:null, geometry:{...neutralGeometry},
    equipment:{index:outfitIndex, role:outfit.selection.role, manifestUrl:config.manifestUrl, resources},
    ...changes,
  };
}

async function recordFor(appearanceRecipe, equipmentMaterials, liveAccessories = propsOff) {
  return createCharacterRecord({
    identity:{id:'resource-audit-test', name:'Static dependency test', gender:'test'},
    appearanceRecipe, liveAccessories, equipmentMaterials, provenance:{producer:'CPU fixture', sourceRefs:[]},
    resourceIdentities:deriveCharacterResourceIdentities(appearanceRecipe, liveAccessories, equipmentMaterials),
    now:'2026-11-17T00:00:00.000Z',
  }, {validateResources:() => ({status:'pending'})});
}

test('fixed native female face and male records collect eager masks, exact dance and both live fits', async () => {
  for (const bodyType of ['native-female-face-v1', 'native-male-7586-v1']) {
    const record = await nativeRecord(bodyType);
    const {files, result} = await collect(record);
    const config = foundationProfile(bodyType);
    const face = bodyType === 'native-female-face-v1';
    assert.equal(result.bodyType, bodyType);
    assert(files.size >= 21);
    assert(result.actions.includes('native-rokoko-5359146-30s-v2'));
    assert(result.unsupportedActions.includes('rokoko-5359146-30s-v1'));
    contains(files, [
      config.url, config.manifestUrl, config.bodyTextureCoverage.url,
      config.bodyTextureCoverage.url.replace('manifest.json', 'native-tops-body.png'),
      '/assets/m1c/accessories.json', '/assets/m1c/grips/manifest.json',
      '/assets/m1c/studio-microphone-v1.glb', '/assets/m1c/studio-glasses-v1.glb',
      '/assets/native-glasses-fit-v1/' + bodyType + '.json',
      face ? '/assets/native-live-accessory-fit-v1/female-face-cc0843.json' : '/assets/native-live-accessory-fit-v3/male-7586.json',
    ]);
    assert(!files.has('/assets/appearance-color-v3/runtime-manifest.json'));
    assert(!files.has('/assets/native-iris-palette-v1/manifest.json'));
    assert.equal(files.get(config.url).provenance[0].sourceLicense.sourceVRMMeta.allowRedistribution, false);
  }
});

test('native male replacement hair, iris and eyebrow each bring their selected files', async () => {
  const old = await nativeRecord('native-male-7586-v1');
  const recipe = old.appearanceRecipe;
  recipe.appearance.hairStyle = 'native-male-hairset001-v1';
  recipe.appearance.eyeColor = 'green';
  recipe.appearance.eyebrowColor = 'brown';
  const entry = validateHairSelection(recipe.base.sha256, recipe.appearance.hairStyle);
  recipe.hairAssetSha256 = entry.assetSha256;
  recipe.hairFit = hairFitIdentity(entry);
  const {files} = await collect(await recordFor(recipe, undefined, old.liveAccessories));
  contains(files, [
    '/assets/native-hairset001-v1/manifest.json', '/assets/native-hairset001-v1/fit.json', '/assets/native-hairset001-v1/hair.glb',
    '/assets/native-iris-palette-v1/manifest.json', '/assets/native-iris-palette-v1/source-iris.png', '/assets/native-iris-palette-v1/iris-green.png',
    '/assets/native-eyebrow-palette-v1/manifest.json', '/assets/native-eyebrow-palette-v1/source-brow.png', '/assets/native-eyebrow-palette-v1/brow-brown.png',
  ]);
});

test('native 7586 adds the independent sock model only to the selected shorts-socks record', async () => {
  const body = 'native-male-7586-v1';
  const original = await nativeRecord(body);
  const recipe = structuredClone(original.appearanceRecipe);
  recipe.equipment = (await template(body,1)).equipment;
  const sock = recipe.equipment.resources.socks;
  const worn = await collect(await recordFor(recipe,undefined,original.liveAccessories));
  const plain = await collect(original);
  const config = foundationProfile(body);
  assert.equal(worn.result.outfitIndex,1);
  contains(worn.files,[config.bodyTextureCoverage.url,config.manifestUrl,config.additionalEquipmentManifests[0].url,sock.url]);
  contains(plain.files,[config.bodyTextureCoverage.url,config.manifestUrl,config.additionalEquipmentManifests[0].url]);
  assert(!plain.files.has(sock.url));
});

test('old male outfit 4 requires explicit material selection and ships only its selected layered look', async () => {
  const historical = await json('scripts/runtime-package/fixtures/male-outer-shorts.json');
  const recipe = await template(historical.bodyType, historical.outfitIndex);
  const {equipmentId, recipeId} = historical.materialSelections[0];
  const shorts = recipe.equipment.resources.shorts;
  const ref = shorts.materialRecipes.find(row => row.id === recipeId);
  const material = await publicJson(ref.url);
  const selection = {
    schema:'zbgs-equipment-material-selection-v1', recipeId, recipeVersion:material.version, recipeSha256:ref.sha256,
    ...material.fit, implementationId:material.implementation.id, implementationSha256:material.implementation.sha256,
  };
  const materials = {
    schema:'garment-material-record-v1',
    selections:Object.values(recipe.equipment.resources).map(entry => ({
      equipmentId:entry.id, garmentSha256:entry.sha256, selection:entry.id === equipmentId ? selection : null,
    })),
  };
  const trousers = '/assets/m1b/m1b-uniform-pants.glb';
  const {files, result} = await collect(await recordFor(recipe, materials), {omit:trousers.slice(1)});
  assert.equal(result.outfitIndex, 4);
  contains(files, [
    '/assets/m1b/m1b-uniform-shorts-v1.glb',
    '/assets/m2-outer-panels-v2/author-export.glb', '/assets/m2-garment-coverage-v1/coverage-mask.json', ref.url,
  ]);
  assert(!files.has(trousers));
  assert(!files.has('/assets/m1c/accessories.json'));
  await assert.rejects(collect(await recordFor(recipe)), /旧角色记录未保存服装材质/);
});

test('brow-only geometry and one surface layer include the hidden base dependencies', async () => {
  const recipe = await template('female', 4, {
    schema:'workbench-appearance-recipe-v7', rulesVersion:'workbench-appearance-rules-v7',
    surface:{manifestSha256:SURFACE_LAYER_PACKAGE.sha256, layers:[{id:'freckles', opacity:0.7}]},
  });
  recipe.geometry.browSample = 'height3-spacing3-v2';
  recipe.geometry.browRecipeSha256 = facialSampleResource(recipe.base.sha256, 'brow', recipe.geometry.browSample).recipeSha256;
  const {files} = await collect(await recordFor(recipe));
  const config = foundationProfile('female');
  const palette = await publicJson(facialPaletteContract(config.sha256).url);
  const {iris, lips} = palette.variants.find(row => row.avatarSha256 === config.sha256).parts;
  const surface = await publicJson(SURFACE_LAYER_PACKAGE.url);
  const overlays = surface.variants.find(row => row.avatarSha256 === config.sha256).layers;
  contains(files, [
    '/assets/face-parameters-v1/recipe-manifest.json', '/assets/face-brow-visible-v2/recipe-manifest.json',
    iris.maskUrl, iris.neutralMapUrl, lips.maskUrl,
    ...overlays.map(row => '/assets/m2-surface-layer-v1/' + row.url),
    config.additionalEquipmentManifests[0].url, config.additionalBodyCoverage[0].descriptor.url,
    recipe.equipment.resources.fitTop.layerFitResource.url,
  ]);
  assert(!files.has('/assets/m2-surface-layer-v1/female-protected.png'));
  assert(!files.has('/assets/mouth-visible-v2/recipe-manifest.json'));
});

test('hat and paired ears include shared models and the exact hat hair fit', async () => {
  const recipe = await template('female', 0, {
    schema:'workbench-appearance-recipe-v8', rulesVersion:'workbench-appearance-rules-v8',
  });
  const hair = validateHairSelection(recipe.base.sha256, 'female-ponytail-v1');
  recipe.appearance.hairStyle = hair.id;
  recipe.hairFit = hairFitIdentity(hair);
  recipe.hairAssetSha256 = hair.assetSha256;
  recipe.accessories = {
    ears:accessorySelection(recipe.base.sha256, 'ears', 'pair'),
    hat:accessorySelection(recipe.base.sha256, 'hat', 'single'),
  };
  const {files} = await collect(await recordFor(recipe));
  contains(files, [
    '/assets/m2-paired-ear-accessory-v1/manifest.json', '/assets/m2-paired-ear-accessory-v1/female-fit.json',
    '/assets/m2-paired-ear-accessory-v1/stud.glb', '/assets/m2-hat-hair-v1/manifest.json',
    '/assets/m2-hat-hair-v1/fit.json', '/assets/m2-hat-hair-v1/baseball-cap.glb', hair.manifestUrl, hair.fit.url,
  ]);
});

test('new sourceRoot ships the native alternate top alone and a fixed legacy sourceRoot requires both tops', async t => {
  const config = foundationProfile('native-female-843ac-v1');
  const recipe = await template('native-female-843ac-v1', 3);
  const record = await recordFor(recipe);
  const primary = await publicJson(config.manifestUrl);
  const top = primary.items.find(entry => entry.id === config.ids.top);
  assert(top.url.startsWith('../'));
  const defaultModel = new URL(top.url, 'https://local.invalid' + config.manifestUrl).pathname;
  const selectedFiles = [config.manifestUrl, config.additionalEquipmentManifests[0].url, recipe.equipment.resources.alternateTop.url];
  const {files} = await collect(record, {omit:defaultModel.slice(1)});
  contains(files, selectedFiles);
  assert(!files.has(defaultModel));

  const experimentRoot = path.resolve(root, 'experiments');
  const legacyRoot = await mkdtemp(path.join(experimentRoot, 'record-resources-legacy-'));
  assert.equal(path.dirname(legacyRoot), experimentRoot);
  t.after(() => rm(legacyRoot, {recursive:true, force:true}));
  const historical = '797516d2187abcc519edb850399f636b5d022cb4';
  const archive = execFileSync('git', ['archive', historical, 'prototype/src', 'prototype/package.json'], {
    cwd:root, maxBuffer:16 * 1024 * 1024,
  });
  execFileSync('tar', ['-xf', '-', '-C', legacyRoot], {input:archive});
  await symlink(publicRoot, path.join(legacyRoot, 'prototype/public'), 'junction');
  await symlink(path.join(root, 'prototype/node_modules'), path.join(legacyRoot, 'prototype/node_modules'), 'junction');
  const legacy = await collect(record, {sourceRoot:legacyRoot});
  contains(legacy.files, [...selectedFiles, defaultModel]);
  await assert.rejects(collect(record, {sourceRoot:legacyRoot, omit:defaultModel.slice(1)}), /Missing test dependency/);
});

test('rejects mismatched record metadata, missing dependency and changed bytes', async () => {
  const record = await nativeRecord('native-female-face-v1');
  const forged = structuredClone(record);
  forged.appearanceRecipe.equipment.resources.top.fitId += '-unknown';
  await assert.rejects(collect(forged), /Record appearance admission/);
  forged.appearanceRecipe = structuredClone(record.appearanceRecipe);
  forged.liveAccessories.selections.mic.identity.fit.sha256 = '0'.repeat(64);
  await assert.rejects(collect(forged), /道具资源或身体适配版本不匹配/);
  await assert.rejects(collect(record, {omit:'assets/native-face-factory-v2/native-tops-body.png'}), /Missing test dependency/);
  await assert.rejects(collect(record, {tamper:'assets/native-glasses-fit-v1/native-female-face-v1.json'}), /native-female-face-v1.json/);
});
