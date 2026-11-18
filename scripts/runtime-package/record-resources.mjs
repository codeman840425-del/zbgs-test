import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fail, runtimePath} from './files.mjs';

const SHA = /^[a-f0-9]{64}$/;
const POSITIVE_BYTES = value => Number.isSafeInteger(value) && value > 0;
const MOTION = '/assets/motion/m1c/';
const GRIPS = '/assets/m1c/grips/manifest.json';
const PROPS = '/assets/m1c/accessories.json';
const GREETING = MOTION + 'greeting/greeting-wave-left-v1.glb';
const MODEL_EXTENSIONS = new Set([
  'VRM', 'VRMC_vrm', 'VRMC_materials_mtoon', 'VRMC_springBone', 'VRMC_node_constraint',
  'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization', 'KHR_materials_emissive_strength',
]);

function requireDependency(ok, message) {
  if (!ok) fail('unsupported-dependency', message);
}

async function loadContracts(sourceRoot, recipe) {
  const load = (file, options) => import(pathToFileURL(path.resolve(sourceRoot, 'prototype/src', file)).href, options);
  return Object.assign({}, ...await Promise.all([
    'foundation-profiles.js', 'outfit-selection.js', 'equipment-set.js', 'garment-layer-fit.js',
    'shape-fit-registry.js', 'body-texture-coverage-admissions.js', 'appearance-candidates.js',
    'character-record.js', 'garment-material-record.js',
    'hairstyle-catalog.js', 'hair-fit-contract.js', 'no-hair-bodies.js',
    'facial-geometry-profiles.js', 'facial-geometry-selection.js', 'facial-palette-contract.js',
    'native-palette-catalog.js', 'surface-layer-catalog.js', 'hat-accessory-contract.js',
    ...(recipe?.skinToneManifestSha256 ? ['native-skin-tone-contract.js'] : []),
    ...(recipe?.lipColorManifestSha256 ? ['native-lip-color-contract.js'] : []),
    'live-accessory-record.js', 'glasses-temple-fit.js', 'normalized-motion.js',
  ].map(file => load(file))), {glasses: (await load('glasses-temple-fit-manifest.json', {with:{type:'json'}})).default});
}

const sourceLocation = sourcePath => ({sourcePath});

// three-vrm 3.5.5 maps these VRM0 names to the VRM1 normalized rig.
const legacyThumbNames = {
  leftThumbProximal:'leftThumbMetacarpal', leftThumbIntermediate:'leftThumbProximal',
  rightThumbProximal:'rightThumbMetacarpal', rightThumbIntermediate:'rightThumbProximal',
};

function readGlb(bytes, url) {
  requireDependency(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67 &&
    bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length &&
    bytes.readUInt32LE(16) === 0x4e4f534a && bytes.readUInt32LE(12) <= bytes.length - 20,
    'Invalid GLB2 container: ' + url);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  for (const extension of new Set([...(doc.extensionsUsed ?? []), ...(doc.extensionsRequired ?? [])]))
    requireDependency(MODEL_EXTENSIONS.has(extension), 'Unreviewed GLB runtime extension: ' + extension + ' in ' + url);
  return doc;
}

function resourceReaders(add) {
  async function read(url, reason, {sha256, bytes, parent, provenance = []} = {}) {
    const relative = runtimePath(url, parent);
    requireDependency(relative.startsWith('assets/'), 'Resource is outside the runtime asset tree: ' + relative);
    return add(url, reason, {
      ...(sha256 === undefined ? {} : {sha256}),
      ...(bytes === undefined ? {} : {bytes}),
      ...(parent === undefined ? {} : {parent}),
      provenance,
    });
  }
  function pin(descriptor, reason, options = {}) {
    requireDependency(typeof descriptor?.url === 'string' && SHA.test(descriptor.sha256 ?? ''),
      'Missing resource identity for ' + reason);
    return read(descriptor.url, reason, {...descriptor, ...options});
  }
  async function model(url, reason, options = {}) {
    const item = await read(url, reason, options);
    const doc = readGlb(item.bytes, item.path);
    for (const entry of [...(doc.buffers ?? []), ...(doc.images ?? [])]) {
      if (!entry.uri || entry.uri.startsWith('data:')) continue;
      // A GLTFLoader given bytes sometimes uses a fixed parse directory.
      // Pass a file within it so the shared resolver uses that exact directory.
      const parent = options.parseDirectory ? options.parseDirectory.slice(1) + '_model.glb' : item.path;
      await read(entry.uri, 'External glTF resource of ' + item.path, {parent, provenance:options.provenance});
    }
    return doc;
  }
  return {read, pin, model};
}

async function equipmentCatalog(io, config) {
  const primary = await io.read(config.manifestUrl, 'Body equipment catalog', {sha256:config.manifestSha256});
  const items = [];
  const manifests = new Map();
  function merge({value:data, path:manifest}, extension = false) {
    requireDependency(data?.schema === 'zbgs-equipment-v1' && Array.isArray(data.items), 'Unknown equipment catalog');
    for (const entry of data.items) {
      requireDependency(!extension || (entry.compatibleAvatarSha256 === config.sha256 && entry.url?.startsWith('/assets/')),
        'Invalid additive equipment catalog entry: ' + entry.id);
      items.push(entry);
      manifests.set(entry.id, manifest);
    }
  }
  merge(primary);
  for (const descriptor of config.additionalEquipmentManifests ?? [])
    merge(await io.pin(descriptor, 'Additive body equipment catalog'), true);
  const byId = new Map(items.map(entry => [entry.id, entry]));
  requireDependency(byId.size === items.length, 'Duplicate equipment IDs');
  return {items, byId, manifests, parent:primary.path};
}

async function addEquipment(io, contracts, config, catalog, entry, reason) {
  const provenance = [{
    sourcePath:'prototype/public/' + catalog.manifests.get(entry.id),
    equipmentId:entry.id,
    ...(entry.sourceLicense ? {sourceLicense:entry.sourceLicense} : {}),
    ...(entry.sourceSpec ? {sourceSpec:entry.sourceSpec} : {}),
  }];
  const options = {parent:catalog.parent, provenance};
  const layer = contracts.layerFitRequirement(entry);
  if (layer) {
    const fit = await io.pin(layer, 'Layer fit for ' + entry.id, options);
    contracts.validateLayerFit(entry, fit.value, config.sha256, catalog.items);
  }
  const shape = contracts.shapeFitDescriptor(entry, config.sha256);
  requireDependency(Boolean(entry.fitResource) === Boolean(shape), 'Unreviewed shape fit: ' + entry.id);
  if (shape) {
    const {value:fit} = await io.pin(entry.fitResource, 'Equipment fit for ' + entry.id, options);
    requireDependency(fit?.schema === 'm2-onepiece-fit-v1' && fit.id === entry.fitId &&
      fit.styleId === entry.styleId && fit.targetBodySha256 === config.sha256 && fit.assetSha256 === entry.sha256 &&
      fit.slot === entry.slot, 'Equipment fit identity differs: ' + entry.id);
    const {value:surface} = await io.pin(shape, 'Body surface fit for ' + entry.id, options);
    requireDependency(surface?.schema === 'm2-shape-fit-v1' && surface.dependency === 'body-surface' &&
      surface.baseAvatarSha256 === config.sha256 && surface.garmentId === entry.id && surface.garmentSha256 === entry.sha256,
      'Equipment body surface identity differs: ' + entry.id);
  }
  requireDependency(SHA.test(entry.sha256 ?? '') && POSITIVE_BYTES(entry.bytes), 'Invalid equipment pin: ' + entry.id);
  // Some fixed native catalog entries point to a sibling directory. Resolve
  // the authored relative URL before submitting the canonical package path.
  let url = entry.url;
  if (typeof url === 'string' && /^\.\.\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.glb$/.test(url)) {
    url = '/' + path.posix.join(path.posix.dirname(catalog.parent), url);
  }
  await io.model(url, reason, {...options, sha256:entry.sha256, bytes:entry.bytes});
}

async function addCoverage(io, contracts, config, catalog, entries) {
  const bindings = [
    ...(config.bodyCoverage ? [{role:'top', descriptor:config.bodyCoverage}] : []),
    ...(config.additionalBodyCoverage ?? []),
  ];
  for (const {role, descriptor} of bindings) {
    const entry = catalog.byId.get(config.ids[role]);
    const {value:fit} = await io.pin(descriptor, 'Startup body coverage for ' + role);
    const legacy = fit?.schema === 'zbgs-outfit-body-coverage-candidate.1';
    requireDependency(entry?.compatibleAvatarSha256 === config.sha256 && fit?.avatarSha256 === config.sha256 &&
      (legacy || fit?.schema === 'zbgs-equipment-body-coverage.1') &&
      (legacy ? fit.topId : fit.itemId) === entry.id && (legacy ? fit.topSha256 : fit.itemSha256) === entry.sha256,
      'Body coverage binding differs: ' + role);
  }
  if (config.garmentCoverage && entries.some(entry => entry.id === config.ids.outer)) {
    const {value:mask} = await io.pin(config.garmentCoverage, 'Layered garment coverage');
    requireDependency(mask?.schema === 'zbgs-garment-coverage-mask-v1' &&
      mask.binding?.bodySha256 === config.sha256 &&
      mask.innerTopId === config.ids.top && mask.innerTopSha256 === catalog.byId.get(config.ids.top)?.sha256 &&
      mask.outerId === config.ids.outer && mask.outerAssetSha256 === catalog.byId.get(config.ids.outer)?.sha256,
      'Layered coverage binding differs');
  }
  if (!config.bodyTextureCoverage) return;
  const {value:mask, path:parent} = await io.pin(config.bodyTextureCoverage, 'Startup native body texture coverage manifest');
  const admission = contracts.BODY_TEXTURE_COVERAGE_ADMISSIONS.find(row =>
    row.avatarSha256 === config.sha256 && row.manifestSha256 === config.bodyTextureCoverage.sha256);
  requireDependency(admission && mask?.schema === 'native-body-texture-coverage-v1' &&
    mask.avatarSha256 === config.sha256 && mask.basePngSha256 === admission.basePngSha256 &&
    mask.covered?.sha256 === admission.maskedPngSha256, 'Native coverage identity differs');
  for (const id of Object.values(config.ids)) {
    const rule = mask.equipment.find(row => row.id === id) ?? admission.optionalUncoveredEquipment?.find(row => row.id === id);
    const entry = catalog.byId.get(id);
    requireDependency(rule && entry && rule.sha256 === entry.sha256 && rule.slot === entry.slot,
      'Native coverage equipment identity differs: ' + id);
  }
  await io.pin(mask.covered, 'Startup native body coverage PNG', {
    parent, provenance:[{sourcePath:'prototype/public/' + parent, source:mask.source ?? mask.sourceMaskLineage}],
  });
}

async function addMotions(io, contracts, avatarSha256, body) {
  const cc0 = [sourceLocation('prototype/licenses/quaternius-CC0.txt')];
  await io.model('/assets/motion/UAL1_Standard.glb', 'Startup shared motion library', {provenance:cc0});
  const {value:jog} = await io.read(MOTION + 'jog-ordinary-derived-v1.profile.json', 'Startup jog profile', {provenance:cc0});
  requireDependency(SHA.test(jog?.sha256 ?? ''), 'Missing jog model identity');
  await io.model(MOTION + 'jog-ordinary-derived-v1.glb', 'Startup jog model', {sha256:jog.sha256, provenance:cc0});
  const {value:catalog} = await io.read(MOTION + 'dance-imports.json', 'Startup dance catalog');
  requireDependency(catalog?.schema === 'm1.motion-import-list.1' && Array.isArray(catalog.entries) &&
    new Set(catalog.entries.map(entry => entry.id)).size === catalog.entries.length, 'Unknown or duplicate dance catalog');
  const actions = ['idle', 'walk', 'jog', 'talk', 'sitTalk', 'sitEnter', 'sitExit', 'sitIdle', 'turn', 'greeting'];
  const unsupportedActions = [];
  for (const entry of catalog.entries) {
    const provenance = [{
      sourcePath:'prototype/public' + MOTION + 'dance-imports.json',
      motionId:entry.id, origin:entry.origin, licenseBoundary:entry.licenseBoundary ?? catalog.license,
    }];
    requireDependency(entry.rootPolicy === 'local-displacement', 'Unknown dance root policy: ' + entry.id);
    if (entry.format === 'normalized-vrm-motion.1') {
      const variants = entry.variants?.filter(row => row.avatarSha256 === avatarSha256) ?? [];
      requireDependency(variants.length <= 1, 'Duplicate exact motion variant: ' + entry.id);
      if (!variants.length) {
        unsupportedActions.push(entry.id);
        continue;
      }
      const variant = variants[0];
      requireDependency(POSITIVE_BYTES(variant.bytes), 'Invalid normalized motion byte count: ' + entry.id);
      const {value} = await io.pin({...variant, url:MOTION + variant.file}, 'Startup exact target dance ' + entry.id, {provenance});
      const bones = body.extensions?.VRMC_vrm?.humanoid?.humanBones;
      const legacyBones = body.extensions?.VRM?.humanoid?.humanBones;
      const names = bones ? Object.keys(bones) : legacyBones?.map(({bone}) => legacyThumbNames[bone] ?? bone);
      requireDependency(Array.isArray(names), 'Missing body humanoid for normalized motions');
      const supportedBones = new Set(names);
      contracts.parseNormalizedMotion(value, {humanoid:{
        getNormalizedBoneNode: name => supportedBones.has(name) ? {name} : undefined,
      }}, avatarSha256, {...entry, ...variant});
    } else {
      requireDependency(entry.format === undefined && SHA.test(entry.sha256 ?? ''), 'Unknown dance format: ' + entry.id);
      await io.model(MOTION + entry.file, 'Startup dance ' + entry.id,
        {sha256:entry.sha256, bytes:entry.bytes, provenance, parseDirectory:MOTION});
    }
    actions.push(entry.id);
  }
  // greeting-layer.js loads this code-pinned GLB on demand.
  await io.model(GREETING, 'On-demand greeting', {
    sha256:'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06', bytes:1566668,
    provenance:[...cc0, sourceLocation('prototype/public' + MOTION + 'greeting/gesture-import.json')],
  });
  return {actions, unsupportedActions};
}

async function addHair(io, contracts, avatarSha256, recipe) {
  const entry = contracts.validateHairSelection(avatarSha256, recipe.appearance.hairStyle);
  if (!entry) return null;
  const {path:parent, value:manifest} = await io.pin({
    url:entry.manifestUrl, sha256:entry.manifestSha256,
  }, 'Selected hairstyle manifest');
  const native = manifest?.schema === 'character-hairstyle-v2';
  requireDependency((native || manifest?.schema === 'character-hairstyle-v1' && manifest.mount === 'head' &&
    manifest.headLocal === true && ['rigid', 'vrm-spring'].includes(manifest.physics) && manifest.sourceMaterial === entry.sourceMaterial) &&
    manifest.id === entry.id && manifest.sha256 === entry.assetSha256 && manifest.compatibleBodies?.includes(avatarSha256),
    'Hair manifest identity differs');
  if (entry.fit) {
    requireDependency(manifest.fit && Object.keys(entry.fit).every(key => manifest.fit[key] === entry.fit[key]),
      'Hair manifest fit reference differs');
    const {value:fit} = await io.pin(entry.fit, 'Selected hairstyle body fit', {parent});
    contracts.validateHairFitData(fit, entry, avatarSha256, manifest);
  } else {
    requireDependency(!native && entry.legacyImplicitFit && manifest.physics === 'rigid' && !manifest.fit,
      'Missing hairstyle fit');
  }
  await io.model(manifest.url, 'Selected hairstyle model', {
    sha256:entry.assetSha256, bytes:manifest.bytes, provenance:[{
      sourcePath:'prototype/public/' + parent, sourceBodySha256:entry.sourceBodySha256,
      ...(manifest.sourceLicense ? {sourceLicense:manifest.sourceLicense} : {}),
    }],
  });
  return manifest;
}

async function addGeometry(io, contracts, avatarSha256, geometry) {
  const values = {
    ...geometry,
    browSample:geometry.browSample ?? 'none',
    noseSample:geometry.noseSample ?? 'none',
    eyeSample:geometry.eyeSample ?? 'none',
  };
  const {resources} = contracts.resolveFacialGeometrySelection(avatarSha256, values);
  if (!Object.values(resources).some(Boolean)) return;
  const base = contracts.FACIAL_GEOMETRY_PROFILES[avatarSha256].mouth;
  const sources = [['base mouth', base], ...Object.entries(resources).filter(([, ref]) => ref && ref.baseURL !== base.baseURL)];
  for (const [name, ref] of sources) {
    const {value:catalog, path:parent} = await io.read(ref.baseURL + 'recipe-manifest.json', 'Facial geometry catalog: ' + name);
    const domain = ['base mouth', 'mouth'].includes(name) ? 'geometry' : name;
    requireDependency(catalog?.schema === 'character-face-' + domain + '-recipes-v1' && Array.isArray(catalog.recipes),
      'Unknown facial geometry catalog: ' + name);
    const matches = catalog.recipes.filter(row => row.baseAvatarSha256 === avatarSha256);
    const entry = matches[0];
    requireDependency(matches.length === 1 && /^[a-zA-Z0-9_.-]+\.json$/.test(entry.file) && entry.sha256 === ref.recipeSha256,
      'Facial geometry pin differs: ' + name);
    const {value:recipe} = await io.pin({...entry, url:entry.file}, 'Facial geometry recipe: ' + name, {parent});
    requireDependency(recipe?.baseAvatarSha256 === avatarSha256 && recipe.id === entry.id, 'Facial geometry recipe identity differs');
  }
}

async function addNativePalettes(io, native, avatarSha256, appearance) {
  for (const [field, contract] of [['eyeColor', native], ['eyebrowColor', native.eyebrow]]) {
    const color = appearance[field] ?? 'original';
    if (color === 'original') continue;
    const {value:manifest, path:parent} = await io.pin(contract, 'Selected native palette catalog: ' + field);
    const part = manifest?.schema === 'native-facial-palette-v1' && field === 'eyeColor' ? manifest.iris : manifest?.parts?.[field];
    requireDependency(['native-facial-palette-v1', 'native-facial-palette-v2'].includes(manifest?.schema) &&
      manifest.avatarSha256 === avatarSha256 && manifest.sourceManifestSha256 === contract.sourceManifestSha256 &&
      part?.colors?.[color]?.color === native.colors[field]?.[color], 'Native palette identity differs: ' + field);
    const provenance = [{sourcePath:'prototype/public/' + parent, sourceManifestSha256:contract.sourceManifestSha256}];
    await io.pin(part.source, 'Selected native palette source PNG: ' + field, {parent, provenance});
    await io.pin(part.colors[color], 'Selected native palette color PNG: ' + field, {parent, provenance});
  }
}

async function addPalettes(io, contracts, avatarSha256, recipe) {
  const appearance = recipe.appearance;
  const native = contracts.nativePaletteContract(avatarSha256);
  const surface = recipe.surface?.layers?.length;
  let skinManifest;
  if (recipe.skinToneManifestSha256) {
    const skin = contracts.nativeSkinToneContract(avatarSha256);
    requireDependency(skin?.sha256 === recipe.skinToneManifestSha256, 'Native skin tone pin differs');
    const {value:manifest, path:parent} = await io.pin(skin, 'Selected native skin tone manifest');
    const {face, eyeline, body} = contracts.validateNativeSkinToneManifest(manifest, skin, appearance.skinTone);
    skinManifest = manifest;
    const provenance = [{sourcePath:'prototype/public/' + parent, coverageManifestSha256:skin.coverage.manifestSha256}];
    if (!recipe.lipColorManifestSha256) await io.pin(face.authored, 'Selected native skin tone PNG: face', {parent, provenance});
    await io.pin(eyeline.authored, 'Selected native skin tone PNG: eyeline', {parent, provenance});
    await io.pin(body.authored, 'Selected native skin tone PNG: body', {parent, provenance});
    await io.pin(body.coveredAuthored, 'Selected native skin tone PNG: covered body', {parent, provenance});
  }
  if (recipe.lipColorManifestSha256) {
    const lip = contracts.nativeLipColorContract(avatarSha256)?.variants[appearance.lipColor];
    requireDependency(lip?.sha256 === recipe.lipColorManifestSha256, 'Native lip color pin differs');
    const {value:manifest, path:parent} = await io.pin(lip, 'Selected native lip color manifest');
    const {selected} = contracts.validateNativeLipColorManifest(manifest, lip, appearance.skinTone, appearance.lipColor, skinManifest);
    await io.pin(selected.authored, 'Selected native lip color PNG: ' + appearance.skinTone, {
      parent, provenance:[{sourcePath:'prototype/public/' + parent, sourceFaceSha256:selected.sourceSha256}],
    });
  }
  if (native) {
    requireDependency(!surface, 'Native palette has no surface compositor');
    await addNativePalettes(io, native, avatarSha256, appearance);
    return;
  }
  if (appearance.eyeColor === 'original' && appearance.lipColor === 'original' && !surface) return;
  const {value:manifest} = await io.pin(contracts.facialPaletteContract(avatarSha256), 'Selected facial palette manifest');
  const variant = manifest?.variants?.find(row => row.avatarSha256 === avatarSha256);
  requireDependency(manifest?.schema === 'character-facial-palette-v1' && variant?.parts?.lips &&
    variant.parts.iris?.colorOperation === 'neutral-iris-multiply-v3', 'Facial palette body or version differs');
  for (const name of ['iris', 'lips']) {
    const part = variant.parts[name];
    await io.pin({url:part.maskUrl, sha256:part.maskSha256}, 'Facial palette mask: ' + name);
  }
  const iris = variant.parts.iris;
  await io.pin({url:iris.neutralMapUrl, sha256:iris.neutralMapSha256}, 'Facial palette iris neutral map');
  if (!surface) return;
  const {path:parent, value:catalog} = await io.pin(contracts.SURFACE_LAYER_PACKAGE, 'Selected surface layer catalog');
  const variants = catalog?.variants?.filter(row => row.avatarSha256 === avatarSha256);
  requireDependency(catalog?.schema === 'character-surface-layer-v1' && variants?.length === 1 && Array.isArray(variants[0].layers),
    'Surface layer body or version differs');
  for (const layer of variants[0].layers) {
    await io.pin(layer, 'Surface overlay prepared for selected body: ' + layer.id, {
      parent, provenance:[{sourcePath:'prototype/public/' + parent, license:catalog.license}],
    });
  }
}

async function addHeadAttachments(io, contracts, avatarSha256, recipe, hairManifest) {
  for (const kind of ['ears', 'hat']) {
    const selection = recipe.accessories?.[kind];
    if (!selection?.resource) continue;
    const {manifestUrl:url, manifestSha256:sha256, assetSha256, fitSha256, fitId} = selection.resource;
    const {path:parent, value:manifest} = await io.pin({url, sha256}, 'Selected ' + kind + ' manifest');
    const provenance = [sourceLocation(kind === 'ears' ?
      'assets-source/m2-paired-ear-accessory-v1/LICENSE.md' : 'assets-source/m2-hat-hair-v1/README.md')];
    let asset;
    if (kind === 'hat') {
      const normalized = contracts.validateHatManifest(manifest, new URL(url, 'https://local.invalid/'));
      const {value:fit} = await io.pin({...normalized.fit, url:normalized.fit.file}, 'Selected hat body fit', {parent});
      contracts.validateHatFit(fit, normalized, avatarSha256, {name:'head'});
      const hairEntry = contracts.validateHatHairCatalog(fit, avatarSha256);
      contracts.validateHatHairManifest(hairManifest, fit, hairEntry, avatarSha256);
      asset = normalized.asset;
      requireDependency(normalized.fit.id === fitId && normalized.fit.sha256 === fitSha256, 'Hat fit pin differs');
    } else {
      const fits = manifest?.fits?.filter(row => row.baseAvatarSha256 === avatarSha256);
      const fitRef = fits?.[0];
      requireDependency(manifest?.schema === 'zbgs-paired-rigid-accessory-style-v1' &&
        fits?.length === 1 && fitRef.fitId === fitId && fitRef.sha256 === fitSha256, 'Ear fit pin differs');
      const {value:fit} = await io.pin({...fitRef, url:fitRef.file}, 'Selected ear body fit', {parent});
      requireDependency(fit?.schema === 'zbgs-paired-rigid-accessory-fit-v1' && fit.fitId === fitId &&
        fit.baseAvatarSha256 === avatarSha256 && fit.assetSha256 === assetSha256 && fit.styleId === manifest.styleId &&
        fit.pairId === manifest.pairId, 'Ear fit identity differs');
      asset = manifest.asset;
    }
    requireDependency(asset?.sha256 === assetSha256 && POSITIVE_BYTES(asset.bytes), 'Head attachment asset pin differs');
    const doc = await io.model(asset.file, 'Selected ' + kind + ' model', {parent, sha256:assetSha256, bytes:asset.bytes, provenance});
    if (kind === 'hat') contracts.validateHatSourceDocument(doc);
  }
}

async function addLiveAccessories(io, contracts, avatarSha256, live) {
  if (!live.selections.mic.enabled && !live.selections.glasses.enabled) return;
  const {value:catalog} = await io.read(PROPS, 'Live accessory catalog');
  requireDependency(catalog?.schema === 'zbgs-accessory-candidate-v1' && Array.isArray(catalog.items), 'Unknown live accessory catalog');
  for (const [kind, id] of [['mic', 'studio-microphone-v1'], ['glasses', 'studio-glasses-v1']]) {
    const {enabled, identity} = live.selections[kind];
    if (!enabled) continue;
    const entry = catalog.items.find(row => row.id === id);
    requireDependency(entry?.sha256 === identity.accessorySHA256 && POSITIVE_BYTES(entry.bytes), 'Live prop pin differs: ' + id);
    const provenance = [{
      sourcePath:'prototype/public' + PROPS, license:catalog.license, sourceBlend:entry.sourceBlend,
    }];
    await io.model(entry.url, 'Selected live prop: ' + id, {sha256:entry.sha256, bytes:entry.bytes, provenance});
    if (kind === 'mic') {
      const {value:grips} = await io.read(GRIPS, 'Microphone grip catalog');
      const grip = grips?.items?.find(row => row.compatibleAvatarSha256 === avatarSha256);
      requireDependency(grips?.schema === 'zbgs-grip-profile-manifest-v1' && grip?.sha256 === identity.fit.sha256 &&
        POSITIVE_BYTES(grip.bytes), 'Microphone grip pin differs');
      const {value:fit} = await io.pin(grip, 'Selected microphone body grip', {provenance});
      requireDependency(fit?.schema === 'zbgs-grip-profile-v1' && fit.compatibleAvatarSha256 === avatarSha256 &&
        fit.accessoryId === id && fit.compatibleAccessorySha256 === entry.sha256 &&
        fit.id === identity.fit.id && fit.fitVersion === identity.fit.fitVersion, 'Microphone grip identity differs');
    } else {
      const reference = contracts.glasses.profiles.find(row => row.bodySHA256 === avatarSha256);
      requireDependency(reference?.sha256 === identity.fit.sha256 && POSITIVE_BYTES(reference.bytes), 'Glasses fit pin differs');
      const {value:fit} = await io.pin(reference, 'Selected glasses temple fit', {provenance});
      requireDependency(contracts.validateTempleProfile(fit, avatarSha256, entry.sha256) && fit.id === identity.fit.id &&
        contracts.canonicalJson(fit.controls.map(control => control.mesh)) === contracts.canonicalJson(identity.fit.changedMeshes),
        'Glasses temple fit identity differs');
    }
  }
}

async function addMaterials(io, catalog, materials) {
  for (const row of materials.selections) {
    const selection = row.selection;
    if (!selection) continue;
    const entry = catalog.byId.get(row.equipmentId);
    const ref = entry.materialRecipes.find(candidate => candidate.id === selection.recipeId);
    const {value:material} = await io.pin(ref, 'Selected garment material: ' + row.equipmentId, {
      parent:catalog.parent, provenance:[{
        sourcePath:'prototype/public/' + catalog.manifests.get(entry.id), equipmentId:entry.id, sourceLicense:entry.sourceLicense,
      }],
    });
    const fit = material?.fit;
    requireDependency(material?.schema === 'zbgs-garment-material-recipe-v1' && material.id === selection.recipeId &&
      material.version === selection.recipeVersion && fit?.equipmentId === selection.equipmentId &&
      fit.garmentSha256 === selection.garmentSha256 && fit.avatarSha256 === selection.avatarSha256 &&
      fit.fitId === selection.fitId && fit.styleId === selection.styleId &&
      material.implementation?.id === selection.implementationId && material.implementation?.sha256 === selection.implementationSha256 &&
      selection.implementationId === 'cloth-normal-v4-review1' &&
      selection.implementationSha256 === '4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565' &&
      String(material.implementation.threeRevision) === '187' && !Object.keys(material).some(key => /texture|url/i.test(key)),
      'Garment material implementation or pin differs');
  }
}

export async function collectRecordResources({record, sourceRoot, add}) {
  const recipe = record?.appearanceRecipe;
  const contracts = await loadContracts(sourceRoot, recipe);
  const io = resourceReaders(add);
  const {bodyType, sha256:avatarSha256} = recipe?.base ?? {};
  requireDependency(typeof bodyType === 'string' && Object.hasOwn(contracts.FOUNDATION_PROFILES, bodyType), 'Unknown record body');
  const config = contracts.foundationProfile(bodyType);
  requireDependency(avatarSha256 === config.sha256, 'Record body SHA differs from its profile');
  const coldOutfitPolicy = contracts.RECORD_COLD_OUTFIT_POLICY;
  requireDependency(coldOutfitPolicy === undefined || coldOutfitPolicy === 'selected-outfit-v1', 'Unknown record cold outfit policy');
  const selectedIndex = coldOutfitPolicy === 'selected-outfit-v1'
    ? contracts.recordedOutfitIndex(config, recipe.equipment)
    : recipe.equipment?.index;
  const catalog = await equipmentCatalog(io, config);
  const equipment = index => {
    const look = contracts.outfitSelection(config, index);
    const entries = contracts.resolveEquipmentSet(catalog.items, look.ids, avatarSha256);
    return {look, entries};
  };
  const actor = {
    config,
    profile:{bodyType, sha256:avatarSha256},
    appearance:{getState:() => ({availableStyles:[
      'original',
      ...(contracts.NO_HAIR_BODIES.some(row => row.sha256 === avatarSha256) ? ['none'] : []),
      ...contracts.HAIRSTYLES.filter(row => row.compatibleBodies.includes(avatarSha256)).map(row => row.id),
    ]})},
    getEquipmentRecipe(index) {
      const {look, entries} = equipment(index);
      return Object.fromEntries(look.roles.map((role, slot) => [role, entries[slot]]));
    },
  };
  const admission = contracts.admitAppearanceCandidate({actor}, recipe);
  requireDependency(admission.accepted, 'Record appearance admission: ' + JSON.stringify(admission.issues));
  contracts.validateLiveAccessories(actor, record.liveAccessories);
  const {record:materials} = contracts.resolveGarmentMaterials(actor, recipe, record.equipmentMaterials);

  // Reviewed runtimes built before this policy still cold-load outfit 0.
  const startup = coldOutfitPolicy === undefined ? equipment(0).entries : [];
  const {entries:selected} = equipment(selectedIndex);
  if (coldOutfitPolicy !== undefined && config.garmentCoverage && selected.some(entry => entry.id === config.ids.outer))
    requireDependency(selected.some(entry => entry.id === config.ids.top), 'Garment coverage requires the registered inner top in the selected outfit');
  const body = await io.model(config.url, 'Exact foundation body', {
    sha256:avatarSha256, parseDirectory:'/assets/foundation/',
    provenance:[{
      sourcePath:'prototype/src/foundation-profiles.js', source:config.source,
      ...(catalog.byId.get(config.ids.top)?.sourceLicense ? {sourceLicense:catalog.byId.get(config.ids.top).sourceLicense} : {}),
    }],
  });
  if (recipe.appearance.hairStyle === 'none') {
    const hairSurfaces = body.meshes.flatMap(mesh => mesh.primitives.map(row => body.materials?.[row.material]?.name ?? ''));
    requireDependency(hairSurfaces.some(name => /_HAIR/.test(name)), 'Body lacks registered hair surfaces');
  }
  for (const key of ['forearmCollision', 'handSurfaceContact'])
    if (config[key]) await io.pin(config[key], 'Startup body profile: ' + key);
  for (const entry of startup) await addEquipment(io, contracts, config, catalog, entry, 'Startup outfit: ' + entry.id);
  for (const entry of selected) {
    if (!startup.includes(entry)) await addEquipment(io, contracts, config, catalog, entry, 'Selected outfit: ' + entry.id);
  }
  await addCoverage(io, contracts, config, catalog, [...startup, ...selected]);
  const motion = await addMotions(io, contracts, avatarSha256, body);
  const hairManifest = await addHair(io, contracts, avatarSha256, recipe);
  await addGeometry(io, contracts, avatarSha256, recipe.geometry);
  await addPalettes(io, contracts, avatarSha256, recipe);
  await addHeadAttachments(io, contracts, avatarSha256, recipe, hairManifest);
  await addLiveAccessories(io, contracts, avatarSha256, record.liveAccessories);
  await addMaterials(io, catalog, materials);
  return {bodyType, avatarSha256, outfitIndex:selectedIndex, equipmentIds:selected.map(entry => entry.id), ...motion};
}
