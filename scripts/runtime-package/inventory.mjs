import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest, fail, jsonBytes, localFile, runtimePath, copyDeclaredFiles} from './files.mjs';

export const ADAPTER = 'foundation-selected-801-v1';
export const SOURCE_COMMIT = '58bc10748cc9fa618f8ecf58b54abbb7de12ffb8';
export const SOURCE_DIGEST = '801c7a9c90260da47b0fc771caf3f282f67f8962d77fb6a15a07db3aca1fc0dc';
const hashPattern = /^[a-f0-9]{64}$/;
const BUILD_FILES = {
  'index.html':'2642d4fbc073f0bd9990f17b4386cbfadd98c3b8b2e98e8bc269506b9c5b3220',
  'build-info.json':'855f8d984f871b19b36e789000fae57944aa2a73119239c45439190fa78a0734',
  'favicon.svg':'7975190264ff2f4d9ed1f1be18970d8e3047dba42b09be35b77c818a36ddb523',
  'assets/main-BFFMAEMp.css':'de966e84b80b9cc1e098c711e537384d8508dca29023b351ad001cf5698ee6d7',
  'assets/main-BmrbTvxS.js':'571e4a8fe4844ed7295a5d770aaa60003daf7bebdfa5e7c2b386d5c08fc5f5c9',
  'assets/motion-source-CahYELwU.js':'b8a673fe7b3e5b32d008122cd9dfa8950896b7adb18a6ce6a1cadebf4f11b9bb',
};
const sourceRef = file => ({sourceCommit:SOURCE_COMMIT, sourcePath:file});
function keysOnly(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('unsupported-input', `Expected object ${label}`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('unsupported-input', `Unknown ${label}.${key}`);
}

async function sourceModules(root) {
  const load = file => import(pathToFileURL(path.join(root, 'prototype/src', file)).href);
  const [profiles, selection, geometry, hair, palette, appearance, facialPalette, recipe] = await Promise.all([
    load('foundation-profiles.js'), load('outfit-selection.js'), load('facial-geometry-selection.js'),
    load('hair-fit-contract.js'), load('facial-palette-contract.js'), load('character-appearance.js'),
    load('facial-palette.js'), load('appearance-recipe.js'),
  ]);
  return {profiles, selection, geometry, hair, palette, appearance, facialPalette, recipe};
}

export async function createInventory({input, dist, sourceRoot}) {
  const buildBytes = await readFile(await localFile(dist, 'build-info.json'));
  const build = JSON.parse(buildBytes);
  if (build.sourceDigest !== SOURCE_DIGEST || build.shortId !== SOURCE_DIGEST.slice(0, 12) || !Array.isArray(build.inputs))
    fail('unsupported-build', `Adapter ${ADAPTER} requires the reviewed fixed 801 build`);
  // Reproduce the existing build-id algorithm. The adapter then reads the
  // exact source/config/public bytes that produced the supplied fixed bundle.
  const sourceHash = createHash('sha256');
  for (const file of build.inputs) {
    const bytes = await readFile(await localFile(path.join(sourceRoot, 'prototype'), file));
    sourceHash.update(file).update('\0').update(bytes).update('\0');
  }
  if (sourceHash.digest('hex') !== SOURCE_DIGEST) fail('source-identity-mismatch', 'Source inputs do not match the fixed runtime build');
  const m = await sourceModules(sourceRoot);
  keysOnly(input, ['schema','bodyType','outfitIndex','appearance','geometry','materialSelections'], 'input');
  if (input.schema !== 'runtime-selected-look-v1' || !['male','female'].includes(input.bodyType) || !Number.isSafeInteger(input.outfitIndex))
    fail('unsupported-input', 'This adapter requires an original male/female body and an explicit outfitIndex');
  if (input.outfitIndex !== (input.bodyType === 'male' ? 4 : 0))
    fail('unsupported-input', 'This adapter is reviewed for male outer-shorts (4) and female default (0) inputs');
  const config = m.profiles.foundationProfile(input.bodyType);
  const selected = m.selection.outfitSelection(config, input.outfitIndex);
  const startup = m.selection.outfitSelection(config, 0);
  const files = new Map();
  const add = async (url, reason, {sha256, bytes, parent, provenance = []} = {}) => {
    const relative = runtimePath(url, parent);
    const content = await readFile(await localFile(dist, relative));
    const sha = digest(content);
    if (Object.hasOwn(BUILD_FILES, relative) && sha !== BUILD_FILES[relative]) fail('modified-dependency', `Fixed bundle identity differs: ${relative}`);
    if (sha256 !== undefined && (!hashPattern.test(sha256) || sha !== sha256)) fail('modified-dependency', `Pinned SHA differs: ${relative}`);
    if (bytes !== undefined && content.length !== bytes) fail('modified-dependency', `Pinned size differs: ${relative}`);
    let row = files.get(relative);
    if (!row) {
      const isPublic = build.inputs.includes('public/' + relative);
      if (isPublic) {
        const original = await readFile(await localFile(path.join(sourceRoot, 'prototype/public'), relative));
        if (digest(original) !== sha) fail('modified-dependency', `Fixed dist differs from its source input: ${relative}`);
      } else if (!Object.hasOwn(BUILD_FILES, relative)) fail('unsupported-dependency', `Unknown build file ${relative}`);
      row = {path:relative, sha256:sha, bytes:content.length, reasons:[], provenance:[
        sourceRef(isPublic ? 'prototype/public/' + relative : 'prototype/index.html'), ...provenance,
      ]};
      files.set(relative, row);
    }
    if (!row.reasons.includes(reason)) row.reasons.push(reason);
    for (const ref of provenance) if (!row.provenance.some(old => JSON.stringify(old) === JSON.stringify(ref))) row.provenance.push(ref);
    if (/\.(glb|vrm)$/.test(relative) && !row.embedded) {
      if (content.readUInt32LE(0) !== 0x46546c67 || content.readUInt32LE(4) !== 2 || content.readUInt32LE(8) !== content.length || content.readUInt32LE(16) !== 0x4e4f534a)
        fail('unsupported-model', `Expected GLB2 container ${relative}`);
      const document = JSON.parse(content.subarray(20, 20 + content.readUInt32LE(12)).toString('utf8'));
      row.embedded = {buffers:0, images:0};
      for (const [kind, entries] of [['buffers',document.buffers || []],['images',document.images || []]]) {
        for (const entry of entries) {
          if (!entry.uri || entry.uri.startsWith('data:')) row.embedded[kind]++;
          else await add(entry.uri, `${relative} external ${kind}`, {parent:relative, provenance:row.provenance});
        }
      }
    }
    return {path:relative, bytes:content, value:relative.endsWith('.json') ? JSON.parse(content.toString('utf8')) : null};
  };
  const pin = (descriptor, reason, extra = {}) => {
    if (!descriptor?.url || !hashPattern.test(descriptor.sha256 || '')) fail('unsupported-dependency', `Missing local dependency identity for ${reason}`);
    return add(descriptor.url, reason, {...descriptor, ...extra});
  };
  await add('/build-info.json', 'fixed runtime build identity');
  const html = await add('/index.html', 'existing room entry and controller DOM');
  const bundles = [...html.bytes.toString('utf8').matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  const scanned = new Set();
  async function bundle(url, parent = 'index.html') {
    const relative = runtimePath(url.startsWith('./') ? url.slice(2) : url, parent);
    if (scanned.has(relative)) return;
    scanned.add(relative);
    const item = await add('/' + relative, 'fixed Vite room bundle dependency');
    if (relative.endsWith('.js')) {
      for (const match of item.bytes.toString('utf8').matchAll(/["']((?:\.\/|\/?assets\/)[A-Za-z0-9_./-]+\.(?:js|css))["']/g))
        await bundle(match[1], relative);
    }
  }
  for (const url of bundles) await bundle(url);

  const manifest = (await add(config.manifestUrl, 'selected body equipment metadata', {provenance:[sourceRef('prototype/src/foundation-profiles.js')]})).value;
  if (manifest.schema !== 'zbgs-equipment-v1' || !Array.isArray(manifest.items)) fail('unsupported-dependency', 'Unsupported equipment manifest');
  const byId = new Map(manifest.items.map(entry => [entry.id, entry]));
  if (byId.size !== manifest.items.length) fail('unsupported-dependency', 'Duplicate equipment IDs');
  const selectedIds = new Set([...startup.ids, ...selected.ids]);
  const provenanceForEntry = entry => [{...sourceRef(config.manifestUrl.replace(/^\//, 'prototype/public/')), equipmentId:entry.id,
    ...(entry.sourceLicense ? {sourceLicense:entry.sourceLicense} : {}), ...(entry.sourceSpec ? {sourceSpec:entry.sourceSpec} : {})}];
  for (const id of selectedIds) {
    const entry = byId.get(id);
    if (!entry || entry.compatibleAvatarSha256 !== config.sha256) fail('unsupported-dependency', `Unregistered equipment ${id}`);
    await add(entry.url, startup.ids.includes(id) ? 'outfit 0 startup equipment' : 'selected outfit equipment',
      {parent:runtimePath(config.manifestUrl), sha256:entry.sha256, bytes:entry.bytes, provenance:provenanceForEntry(entry)});
    if (entry.fitResource) fail('unsupported-dependency', `External shape fit ${id} requires an additional reviewed adapter`);
  }
  const bodyLicense = byId.get(config.ids.top)?.sourceLicense;
  await add(config.url, 'exact original foundation body with embedded textures, original hair and raw skeleton',
    {sha256:config.sha256, provenance:[{...sourceRef('prototype/src/foundation-profiles.js'), source:config.source, sourceLicense:bodyLicense}]});
  for (const key of ['forearmCollision','handSurfaceContact','bodyCoverage'])
    if (config[key]) await pin(config[key], 'foundation startup ' + key);
  if (config.garmentCoverage && selectedIds.has(config.ids.outer)) await pin(config.garmentCoverage, 'selected outer/inner garment coverage');

  const appearance = {hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original', ...input.appearance};
  if (Object.hasOwn(input,'appearance')) keysOnly(input.appearance, ['hairStyle','hairColor','skinTone','eyeColor','lipColor'], 'appearance');
  keysOnly(appearance, ['hairStyle','hairColor','skinTone','eyeColor','lipColor'], 'appearance');
  for (const [key, values] of [['hairColor',m.appearance.HAIR_COLORS],['skinTone',m.appearance.SKIN_TONES],['eyeColor',m.facialPalette.EYE_COLORS],['lipColor',m.facialPalette.LIP_COLORS]])
    if (!Object.hasOwn(values, appearance[key])) fail('unsupported-input', `Unsupported appearance.${key}`);
  if (Object.values(appearance).some(value => value !== 'original'))
    fail('unsupported-input', 'This bounded package exports original appearance defaults only');
  const hair = m.hair.validateHairSelection(config.sha256, appearance.hairStyle);
  const geometry = {mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none', ...input.geometry};
  if (Object.hasOwn(input,'geometry')) keysOnly(input.geometry, ['mouthWidth','recipeSha256','browSample','browRecipeSha256','noseSample','noseRecipeSha256','eyeSample','eyeRecipeSha256'], 'geometry');
  keysOnly(geometry, ['mouthWidth','recipeSha256','browSample','browRecipeSha256','noseSample','noseRecipeSha256','eyeSample','eyeRecipeSha256'], 'geometry');
  const resolution = m.geometry.resolveFacialGeometrySelection(config.sha256, geometry);
  if (geometry.mouthWidth !== 0 || ['browSample','noseSample','eyeSample'].some(key => geometry[key] !== 'none'))
    fail('unsupported-input', 'This bounded package exports original geometry defaults only');
  const geometryIdentity = {};
  for (const [domain, key] of [['mouth','recipeSha256'],['brow','browRecipeSha256'],['nose','noseRecipeSha256'],['eye','eyeRecipeSha256']]) {
    const resource = resolution.resources[domain];
    geometryIdentity[key] = resource?.recipeSha256 ?? null;
  }
  const recipe = {schema:m.recipe.SCHEMA, rulesVersion:m.recipe.RULES, paletteVersion:m.palette.FACIAL_PALETTE_VERSION,
    base:{bodyType:input.bodyType,sha256:config.sha256}, appearance,
    hairAssetSha256:hair?.assetSha256 ?? null, hairFit:m.hair.hairFitIdentity(hair),
    geometry:{...geometry, ...geometryIdentity}, equipment:{index:input.outfitIndex, role:selected.selection.role,
      manifestUrl:config.manifestUrl, resources:Object.fromEntries(selected.roles.map(role => [role,byId.get(config.ids[role])]))}};
  m.recipe.validateAppearanceRecipe({actor:{profile:{bodyType:input.bodyType,sha256:config.sha256}, config,
    appearance:{getState:()=>({availableStyles:[appearance.hairStyle]})}, getEquipmentRecipe:()=>recipe.equipment.resources}}, recipe);

  if (input.materialSelections !== undefined && !Array.isArray(input.materialSelections)) fail('unsupported-input', 'materialSelections must be an array');
  const materialSelections = input.materialSelections || [];
  const materialIds = new Set();
  for (const choice of materialSelections) {
    keysOnly(choice, ['equipmentId','recipeId'], 'materialSelection');
    if (materialIds.has(choice.equipmentId) || !selected.ids.includes(choice.equipmentId)) fail('unsupported-input', 'Material selection requires one selected equipment identity');
    materialIds.add(choice.equipmentId);
    const entry = byId.get(choice.equipmentId), ref = entry.materialRecipes?.find(row => row.id === choice.recipeId);
    if (!ref) fail('unsupported-input', `Unregistered material recipe ${choice.recipeId}`);
    const value = (await add(ref.url, 'explicit separate equipment material selection', {...ref, parent:runtimePath(config.manifestUrl)})).value;
    if (value.schema !== 'zbgs-garment-material-recipe-v1' || value.fit?.equipmentId !== entry.id || value.fit.garmentSha256 !== entry.sha256 || value.fit.avatarSha256 !== config.sha256 || value.fit.fitId !== entry.fitId)
      fail('unsupported-dependency', 'Material recipe identity differs');
    // The reviewed v1 shader uses the original GLB alpha/color map. It has no
    // auxiliary texture URL. New texture-bearing schemas need a new adapter.
    if (Object.keys(value).some(key => /texture|url/i.test(key))) fail('unsupported-dependency', 'Unreviewed material texture dependency');
  }

  await add('/assets/motion/UAL1_Standard.glb', 'shared retargeted idle/walk/talk/sit/action source');
  const jog = (await add('/assets/motion/m1c/jog-ordinary-derived-v1.profile.json', 'eager shared jog profile')).value;
  await add('/assets/motion/m1c/jog-ordinary-derived-v1.glb', 'eager shared real jog source', {sha256:jog.sha256});
  const dances = (await add('/assets/motion/m1c/dance-imports.json', 'eager shared dance catalog')).value;
  if (dances.schema !== 'm1.motion-import-list.1') fail('unsupported-dependency', 'Unknown dance schema');
  const actions = ['idle','walk','jog','talk','sitTalk','sitEnter','sitExit','sitIdle','turn','greeting'];
  for (const entry of dances.entries) {
    const variant = entry.format === 'normalized-vrm-motion.1' ? entry.variants?.find(row => row.avatarSha256 === config.sha256) : entry;
    if (!variant) continue;
    if (entry.format && entry.format !== 'normalized-vrm-motion.1') fail('unsupported-dependency', 'Unknown motion format');
    await add('/assets/motion/m1c/' + variant.file, 'motion-source eager catalog entry ' + entry.id,
      {sha256:variant.sha256, bytes:variant.bytes, provenance:[{...sourceRef('prototype/public/assets/motion/m1c/dance-imports.json'),
        motionId:entry.id, licenseBoundary:entry.licenseBoundary || dances.license, origin:entry.origin}]});
    actions.push(entry.id);
  }
  const greeting = (await add('/assets/motion/m1c/greeting/gesture-import.json', 'declared greeting source provenance')).value;
  await add('/assets/motion/m1c/greeting/' + greeting.file, 'declared greeting action', {sha256:greeting.sha256,bytes:greeting.bytes});

  function generated(relative, value, reason) {
    const bytes = jsonBytes(value);
    files.set(relative, {path:relative,sha256:digest(bytes),bytes:bytes.length,reasons:[reason],
      provenance:[{adapter:ADAPTER,inputSha256:digest(jsonBytes(input))}],generated:bytes.toString('utf8')});
  }
  generated('selected-appearance.recipe.json', recipe, 'native v6 selected appearance, without material selection extension');
  generated('material-selections.json', {schema:'runtime-material-selections-v1',selections:materialSelections}, 'separate existing equipment material recipe domain');
  const catalog = config.outfits.map(look => ({index:look.index,role:look.role,
    status:m.selection.outfitSelection(config,look.index).ids.every(id => selectedIds.has(id)) ? 'exported' : 'metadata-only-not-exported'}));
  return {schema:'runtime-package-inventory-v1', adapter:ADAPTER, input:structuredClone(input), inputSha256:digest(jsonBytes(input)),
    runtime:{sourceCommit:SOURCE_COMMIT,sourceDigest:SOURCE_DIGEST,buildId:build.shortId,entry:'index.html',entryUrl:`/?body=${input.bodyType}&workbench=appearance`},
    unsupportedNavigation:[
      {href:'/foundation.html',reason:'Historical separate preview page is outside the exported room entry.'},
      {href:'http://127.0.0.1:4174/baseline/packs/present_motion_v1_1111_MT/',reason:'Historical navigation link in unchanged fixed HTML. The exported assets, records and controller do not depend on this author-machine service.'},
    ],
    selected:{bodyType:input.bodyType,outfitIndex:input.outfitIndex,appearanceRecipe:'selected-appearance.recipe.json',materialSelections:'material-selections.json'},
    capabilities:{bodyTypes:[input.bodyType],outfits:catalog,appearance:{selected:appearance,geometry:recipe.geometry,
      catalogPolicy:'Only this selected appearance and original defaults are exported. Other catalog options are metadata and require another inventory.'},actions,
      accessories:'not exported; must remain off',entryPolicy:'Use the declared body query and a fresh origin/context without saved drafts. Unlisted body and legacy/foundation preview entries are unsupported.'},
    limitations:['Existing room HTML/DOM and shared controller are retained. This is a selected runtime transfer subpackage, not a DOM-independent game API.',
      'Original equipment/dance manifests retain nonselected metadata. Exported capability status is authoritative for this package; unexported selections fail in the existing loader.',
      'Exact input and resource bytes are checked. Runtime topology/binding, visual quality, normal-speed actions, network closure and target-device performance need runtime acceptance.',
      'Source license records and frozen motion licenseBoundary are retained as provenance, without granting additional redistribution rights.'],
    files:[...files.values()].map(row => ({...row,reasons:row.reasons.sort()})).sort((a,b) => a.path.localeCompare(b.path,'en'))};
}

export async function exportInventory({inventory, dist, sourceRoot, out}) {
  const expected = await createInventory({input:inventory.input,dist,sourceRoot});
  if (digest(jsonBytes(inventory)) !== digest(jsonBytes(expected)))
    fail('inventory-mismatch', 'Inventory differs from its declared input and the reviewed source/runtime dependency closure');
  return copyDeclaredFiles({inventory,dist,out});
}
