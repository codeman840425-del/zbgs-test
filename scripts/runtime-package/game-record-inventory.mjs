import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAME_RECORD_INPUT_MANIFEST, checkedBytes, copyDeclaredFiles, digest, fail, jsonBytes, localFile, runtimePath} from './files.mjs';
import {collectRecordResources} from './record-resources.mjs';

const ENTRY = 'record-consumer.html';
const BUILD = 'build-info.json';
const SAMPLE_DIRECTORY = 'assets/record-consumer-v1/';
const MANIFEST = SAMPLE_DIRECTORY + 'manifest.json';
const PACKAGE_SCHEMA = 'game-character-record-package-v1';
const REVIEWED_SCHEMA = 'reviewed-game-character-runtime-v1';
const RECORD_COUNT = 4;
const MATRIX_INPUTS = [
  '../assets-source/variant-matrix-v1/representative-matrix.json',
  '../assets-source/variant-matrix-v1/representative-batch-request.json',
];
// Frozen review fingerprints from game-runtime-reviews.json at 6bc49a77.
// These issued builds retain their original input lists. Do not add new reviews.
const LEGACY_REVIEWS = new Set([
  '0755f0b4597c95ac29140f7b2f8537839a3cd50089a26ebd9825856cabe189f7',
  '0a10229ebdf14dcaa92cd2ede309eb6fc52a44e8ea893af6e81d247d4461dfef',
  '13a3e921d9b6fc5b25baf699da5f2c35e3d0dd54c1216fa478ecea04ef53f3be',
  '1734f576a68d4d1812f3c23565c39a0d5e4c86ebea03dced0f4a5a5f872d2c68',
  '1a52bde7668941838584ea902b809adff0173d6223e5d7fbf706f6f6239fd635',
  '469d142ee2a6b717ebfca269b87d895dad8cba5e07e52f7d940def9f2d10bbe8',
  '475ca05288b8c20c80e582cf0803382139f8babf45d4833995a95a8e5ace9ce8',
  '4ca512bdf8a8a265f9b0cb887bba9072571d64ac3924eff1549227a2ba80b724',
  '76196e5bf541cde39b206f9511ca66b0ae685995f46f91b5cdd46a1fd0f59af7',
  '85b3c3cff981dadaba5abf444bdbfbfd828d64835347370565f1766e89413d08',
  '9ce8d8585dc04f7f2b750c6dbf98e08af17967743859cdecf3cdc5edabbc421c',
  'a16fe397cc19216137b685acf08e6581b81ef4324a751769f9d6065c34b23d2b',
  'a672c25eaf1e1ad860e893a816f048b3fd59d7e7fd7ca3b003d3cf17c3548ab6',
  'b0666c239bbaed4bbefa75bced9497986c9297eb41c321263607089afc9e878d',
  'bba0f132d388f4add921e47491d8459047ed4255b0a5899b69dfb1b157a7e346',
  'c408cc7644d8dc581e6875b5af44061d1dcc26d5f7d422f8b91d9be9ebd4e8d8',
  'c52d20af83b7db1edfc025721ce3b37603951bb830e6d7df31ef28ae6a706977',
  'd7cc3f910c5ffb7d2df863cecdaeaf26f9893962037cb0a01913e4c8ac8bf464',
  'e7928d768105b053d32c6cf1104a80786b37a70325797da67bdc75a36a659117',
  'f12b177cd1ee141fa69531322412e18c0300455ea7570c05eb875b2d7bbd92c3',
  'fd74f79931204d273b31a8b3d353edbc02a7e1ee5499ef6cefaa02151e9bdcf3',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const BUNDLE_PATH = /^assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/;
const RECORD_PATH = /^assets\/record-consumer-v1\/[a-z0-9-]+\.json$/;
const UNSAFE_COMPONENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function portablePath(relative) {
  if (runtimePath('/' + relative) !== relative ||
      relative.split('/').some(part => !part || part.endsWith('.') || UNSAFE_COMPONENT.test(part)) ||
      /[<>"|*]/.test(relative))
    fail('unsafe-path', 'Nonportable path: ' + relative);
  return relative;
}

function validateReviewed(reviewed) {
  if (reviewed?.schema !== REVIEWED_SCHEMA || !/^[a-f0-9]{40}$/.test(reviewed.sourceCommit) ||
      !SHA256.test(reviewed.sourceDigest) || !reviewed.files || Array.isArray(reviewed.files) ||
      !Object.hasOwn(reviewed.files, ENTRY) || !Object.hasOwn(reviewed.files, BUILD))
    fail('unsupported-build', 'Expected independent reviewed game runtime metadata');
  for (const [relative, row] of Object.entries(reviewed.files)) {
    portablePath(relative);
    if ((relative !== ENTRY && relative !== BUILD && relative !== 'favicon.svg' && !BUNDLE_PATH.test(relative)) ||
        !SHA256.test(row?.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes <= 0)
      fail('unsupported-build', 'Invalid reviewed compiled file pin: ' + relative);
  }
}

async function verifyBuild(dist, project, reviewed) {
  const buildBytes = await checkedBytes(dist, {...reviewed.files[BUILD], path:BUILD});
  const build = JSON.parse(buildBytes);
  if (build.sourceDigest !== reviewed.sourceDigest || build.shortId !== reviewed.sourceDigest.slice(0, 12) ||
      !Array.isArray(build.inputs) || new Set(build.inputs).size !== build.inputs.length)
    fail('unsupported-build', 'Build metadata does not identify the reviewed source inputs');
  const required = [ENTRY, 'package.json', 'package-lock.json', 'src/character-record.js',
    'src/character-runtime-record.js', 'src/record-consumer-demo.js', 'public/' + MANIFEST];
  if (required.some(file => !build.inputs.includes(file)))
    fail('unsupported-build', 'Required game runtime source inputs are absent');
  if (MATRIX_INPUTS.some(file => !build.inputs.includes(file))) {
    const pins = Object.keys(reviewed.files).sort().map(name =>
      [name, reviewed.files[name].bytes, reviewed.files[name].sha256]);
    const identity = digest(JSON.stringify([reviewed.schema, reviewed.sourceCommit, reviewed.sourceDigest, pins]));
    if (!LEGACY_REVIEWS.has(identity))
      fail('unsupported-build', 'New game runtime must pin the variant matrix and batch request');
  }
  const sourceHash = createHash('sha256');
  const publicFiles = new Map();
  for (const relative of build.inputs) {
    if (typeof relative !== 'string') fail('unsupported-build', 'Invalid build source input');
    const inputFile = MATRIX_INPUTS.includes(relative)
      ? await localFile(path.dirname(project), relative.slice(3))
      : await localFile(project, portablePath(relative));
    const bytes = await readFile(inputFile);
    sourceHash.update(relative).update('\0').update(bytes).update('\0');
    if (relative.startsWith('public/')) publicFiles.set(relative.slice(7), digest(bytes));
  }
  if (sourceHash.digest('hex') !== reviewed.sourceDigest)
    fail('source-identity-mismatch', 'Source inputs differ from the reviewed runtime');
  return {build, buildBytes, publicFiles};
}

function htmlReferences(html) {
  return Array.from(html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi), match => match[1]);
}

function moduleReferences(code, parseAst) {
  const references = [];
  const nodes = [parseAst(code)];
  while (nodes.length) {
    const node = nodes.pop();
    if (node.source && ['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
      if (typeof node.source.value !== 'string')
        fail('unsupported-dependency', 'Compiled module import requires a literal URL');
      references.push(node.source.value);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const entry of child) if (entry?.type) nodes.push(entry);
      } else if (child?.type) nodes.push(child);
    }
  }
  return references;
}

async function scanGameBundles(html, parseAst, load) {
  const scanned = new Set([BUILD, ENTRY]);
  async function scan(reference, parent) {
    if (parent.endsWith('.js') && !reference.startsWith('./') && !reference.startsWith('/'))
      fail('unsupported-dependency', 'Expected a local compiled module reference: ' + reference);
    const target = portablePath(runtimePath(reference.startsWith('./') ? reference.slice(2) : reference, parent));
    if (!BUNDLE_PATH.test(target) && target !== 'favicon.svg')
      fail('unsupported-dependency', 'Invalid game bundle path: ' + target);
    if (scanned.has(target)) return;
    scanned.add(target);
    const bytes = await load(target,parent);
    if (target.endsWith('.js')) {
      for (const imported of moduleReferences(bytes.toString('utf8'), parseAst)) await scan(imported,target);
    }
  }
  for (const reference of htmlReferences(html.toString('utf8'))) await scan(reference,ENTRY);
  return scanned;
}

// For a game-runtime release, compare the reachable bundle bytes against a
// separate build from a clean checkout before proposing a new repository pin.
export async function compareGameRuntimeBuilds({dist, rebuilt, sourceRoot, sourceCommit}) {
  const project = path.resolve(sourceRoot,'prototype');
  const {parseAst} = createRequire(path.join(project,'package.json'))('rollup/parseAst');
  const files = {};
  async function compare(relative) {
    const [published, repeated] = await Promise.all([dist,rebuilt].map(async root =>
      readFile(await localFile(root,relative))));
    if (!published.equals(repeated)) fail('rebuild-mismatch','Rebuilt file differs: '+relative);
    files[relative]={sha256:digest(published),bytes:published.length};
    return published;
  }
  const build = JSON.parse(await compare(BUILD));
  const html = await compare(ENTRY);
  await scanGameBundles(html,parseAst,compare);
  const reviewed = {schema:REVIEWED_SCHEMA,sourceCommit,sourceDigest:build.sourceDigest,files};
  validateReviewed(reviewed);
  await verifyBuild(rebuilt,project,reviewed);
  return reviewed;
}

export async function createGameRecordInventory({dist, sourceRoot, reviewed, records:externalRecords, shapePacks=[]}) {
  const external = externalRecords !== undefined;
  if (!Array.isArray(shapePacks) || (shapePacks.length && !external))
    fail('invalid-record-input', 'Shape packs require explicit signed records');
  if (external && (!Array.isArray(externalRecords) || externalRecords.length < 1 || externalRecords.length > RECORD_COUNT))
    fail('invalid-record-input', 'Expected an ordered array of one to four complete character records');
  const externalTexts = external ? Array.from(externalRecords, record => JSON.stringify(record)) : null;
  validateReviewed(reviewed);
  const project = path.resolve(sourceRoot, 'prototype');
  const fixed = await verifyBuild(dist, project, reviewed);
  const inputs = {dist, sourceRoot, project, reviewed, external, externalTexts, ...fixed};
  if (!shapePacks.length) return collectGameInventory(inputs);

  if (['src/foundation-profiles.js', 'src/rule-body-data.js', 'src/character-record-input.js']
      .some(name => !fixed.build.inputs.includes(name)))
    fail('unsupported-build', 'The reviewed runtime lacks rule body publication inputs');
  const {default:shapeData} = await import('./shape-overlay.cjs');
  const overlay = await shapeData.verifiedShapeOverlay(shapePacks);
  const selectedBodies = new Set(externalTexts.map(text => typeof text === 'string'
    ? JSON.parse(text)?.appearanceRecipe?.base?.bodyType : undefined));
  if (overlay.descriptors.some(row => !selectedBodies.has(row.bodyType)))
    fail('invalid-record-input', 'A supplied shape pack is not selected by any record');
  await shapeData.assertOverlayDist(overlay.files, dist);
  const profiles = await import(pathToFileURL(await localFile(project, 'src/foundation-profiles.js')).href);
  if (typeof profiles.initializeRuleBodyData !== 'function')
    fail('unsupported-build', 'The reviewed runtime cannot initialize rule body data');
  const active = await profiles.initializeRuleBodyData(overlay.descriptors, {
    readBytes:async url => {
      const bytes = overlay.files.get(portablePath(runtimePath(url)));
      if (!bytes) fail('unsupported-dependency', 'Unverified rule body dependency: ' + url);
      return bytes;
    },
  });
  try {
    return await collectGameInventory({...inputs, overlay});
  } finally {
    active.dispose();
  }
}

async function collectGameInventory({dist, sourceRoot, project, reviewed, external, externalTexts,
  build, buildBytes, publicFiles, overlay}) {
  const sourceModule = async file => import(pathToFileURL(await localFile(project, 'src/' + file)).href);
  const [envelope, runtime] = await Promise.all([
    sourceModule('character-record.js'), sourceModule('character-runtime-record.js'),
  ]);
  const {parseAst} = createRequire(path.join(project, 'package.json'))('rollup/parseAst');
  const files = new Map();
  const identities = new Set();

  async function add(url, reason, {sha256, bytes:size, parent, provenance = []} = {}) {
    const relative = portablePath(runtimePath(url, parent));
    const isPublic = publicFiles.has(relative);
    const pin = Object.hasOwn(reviewed.files, relative) ? reviewed.files[relative] : null;
    const shapeOrigins = overlay?.origins.get(relative);
    if (!pin && !isPublic && !shapeOrigins) fail('unsupported-dependency', 'File lacks reviewed source/build provenance: ' + relative);
    const content = relative === BUILD ? buildBytes : shapeOrigins && !isPublic && !pin
      ? overlay.files.get(relative) : await readFile(await localFile(dist, relative));
    const hash = digest(content);
    if ((pin && (hash !== pin.sha256 || content.length !== pin.bytes)) ||
        (isPublic && hash !== publicFiles.get(relative)) || (shapeOrigins && !content.equals(overlay.files.get(relative))) ||
        (sha256 !== undefined && hash !== sha256) || (size !== undefined && content.length !== size))
      fail('modified-dependency', 'Dependency identity differs: ' + relative);
    let row = files.get(relative);
    if (!row) {
      const folded = relative.toLowerCase();
      if (identities.has(folded)) fail('unsafe-path', 'Case-colliding package path: ' + relative);
      identities.add(folded);
      const origins = [];
      if (isPublic) origins.push({sourceCommit:reviewed.sourceCommit, sourcePath:'prototype/public/' + relative});
      else if (pin) origins.push({sourceCommit:reviewed.sourceCommit, buildId:build.shortId, bundlePath:relative, buildManifest:BUILD});
      if (shapeOrigins) origins.push(...shapeOrigins);
      row = {path:relative, sha256:hash, bytes:content.length, reasons:[], provenance:origins};
      files.set(relative, row);
    } else if (row.sha256 !== hash || row.bytes !== content.length) {
      fail('modified-dependency', 'Dependency changed during collection: ' + relative);
    }
    if (!row.reasons.includes(reason)) row.reasons.push(reason);
    for (const ref of provenance) {
      // Record collectors identify where they obtained the outfit declaration.
      // In a data pack the same declarations live in the external profile/catalog.
      const {sourcePath, ...details} = ref;
      let declarations;
      if (sourcePath?.startsWith('prototype/public/'))
        declarations = overlay?.origins.get(sourcePath.slice('prototype/public/'.length));
      if (shapeOrigins && relative.endsWith('/body.vrm') && sourcePath === 'prototype/src/foundation-profiles.js')
        declarations = shapeOrigins.map(({indexSha256}) => ({indexSha256, packPath:'profile.json'}));
      const refs = declarations ? declarations.map(pin => ({...pin, ...details})) : [ref];
      for (const origin of refs) {
        if (!row.provenance.some(old => envelope.canonicalJson(old) === envelope.canonicalJson(origin)))
          row.provenance.push(origin);
      }
    }
    return {path:relative, bytes:content, value:relative.endsWith('.json') ? JSON.parse(content) : null};
  }

  await add('/' + BUILD, 'Fixed source identity');
  const html = await add('/' + ENTRY, 'Independent game record entry');
  const scanned = await scanGameBundles(html.bytes, parseAst, async (target,parent) => {
    if (!Object.hasOwn(reviewed.files, target))
      fail('unsupported-dependency', 'Missing independently reviewed bundle pin: ' + target);
    const {bytes} = await add('/' + target, 'Compiled dependency of ' + parent);
    return bytes;
  });
  if (![...scanned].some(file => file.endsWith('.js')) ||
      Object.keys(reviewed.files).some(file => !scanned.has(file)))
    fail('unsupported-build', 'Reviewed compiled file pins must match the game entry dependency graph');

  async function readSourceRecords() {
    const {value:manifest} = await add('/' + MANIFEST, 'Ordered source character record manifest');
    if (manifest?.schema !== 'record-consumer-samples-v1' || !Array.isArray(manifest.entries) ||
        manifest.entries.length !== RECORD_COUNT)
      fail('invalid-record-manifest', 'Expected the four ordered game records');
    const paths = new Set([MANIFEST]);
    const inputs = [];
    for (const entry of manifest.entries) {
      const relative = portablePath(runtimePath(entry?.url));
      if (entry.url !== '/' + relative || !RECORD_PATH.test(relative) || paths.has(relative) ||
          !publicFiles.has(relative) || !SHA256.test(entry.recordSha256) || typeof entry.label !== 'string' || !entry.label)
        fail('invalid-record-manifest', 'Invalid source record declaration: ' + relative);
      paths.add(relative);
      const item = await add(entry.url, 'Fixed source character record');
      inputs.push({entry, relative, text:item.bytes.toString('utf8')});
    }
    return inputs;
  }

  function addGenerated(relative, text, reason, provenance) {
    if (files.has(relative) || publicFiles.has(relative) || overlay?.files.has(relative))
      fail('invalid-record-input', 'Generated record path conflicts with a source file: ' + relative);
    const bytes = Buffer.from(text, 'utf8');
    files.set(relative, {path:relative, sha256:digest(bytes), bytes:bytes.length, generated:text,
      reasons:[reason], provenance});
  }

  const inputs = external ? externalTexts.map(text => ({text})) : await readSourceRecords();
  const records = [];
  const recordIds = new Set();
  for (const input of inputs) {
    const {text} = input;
    if (typeof text !== 'string') fail('invalid-record-input', 'Expected a complete JSON character record');
    if (external && Buffer.byteLength(text, 'utf8') > envelope.CHARACTER_RECORD_MAX_BYTES)
      fail('record-too-large', 'Compact character record exceeds 512 KiB');
    const record = runtime.parseRuntimeCharacterRecord(text);
    await envelope.validateCharacterRecord(record, {validationCallback:() => ({status:'pending'})});
    const {id, name} = record.identity;
    const {recordSha256} = record.integrity;
    const relative = external ? portablePath('records/' + id + '.json') : input.relative;
    if (external && relative === GAME_RECORD_INPUT_MANIFEST)
      fail('invalid-record-input', 'Character ID conflicts with the record manifest filename: ' + id);
    if (external && recordIds.has(id)) fail('duplicate-identity', 'Duplicate stable character ID: ' + id);
    const entry = external ? {id, label:name, recordSha256} : input.entry;
    if (id !== entry.id || recordSha256 !== entry.recordSha256 || recordIds.has(id))
      fail('record-identity-mismatch', 'Record manifest identity differs: ' + relative);
    recordIds.add(id);
    const derived = runtime.deriveCharacterResourceIdentities(record.appearanceRecipe, record.liveAccessories, record.equipmentMaterials, record.nativeHairCenter);
    if (envelope.canonicalJson(derived) !== envelope.canonicalJson(record.resourceIdentities))
      fail('record-identity-mismatch', 'Record resources differ from the saved look: ' + relative);
    const selected = await collectRecordResources({record, sourceRoot, add});
    if (external) addGenerated(relative, text, 'Validated input character record',
      [{recordId:id, revision:record.revision, recordSha256}]);
    records.push({id, label:entry.label, file:relative, revision:record.revision, recordSha256, ...selected});
  }

  const recordManifest = external ? GAME_RECORD_INPUT_MANIFEST : MANIFEST;
  if (external) {
    const selection = {schema:'character-record-input-v1',
      entries:records.map(({id, file, recordSha256}) => ({id, url:'/' + file, recordSha256}))};
    if (overlay) {
      selection.ruleBodyDataPacks = overlay.descriptors;
      for (const relative of overlay.origins.keys()) {
        if (relative.startsWith('character-data/')) await add('/' + relative, 'Verified rule body publication metadata');
        else if (!files.has(relative)) fail('unsupported-dependency', 'Unselected shape pack asset: ' + relative);
      }
    }
    addGenerated(recordManifest, JSON.stringify(selection), 'Ordered manifest for validated input character records',
      records.map(({id, recordSha256}) => ({recordId:id, recordSha256})));
  }
  return {
    schema:PACKAGE_SCHEMA,
    runtime:{sourceCommit:reviewed.sourceCommit, sourceDigest:reviewed.sourceDigest, buildId:build.shortId,
      entry:ENTRY, entryUrl:external ? ENTRY + '?records=/' + recordManifest : '/' + ENTRY},
    recordManifest,
    records,
    limitations:[
      'Collection covers the selected records, their eager startup resources and compatible motions.',
      'Runtime byte verification is scoped to these records. Visual acceptance and ordinary-PC performance are separate checks.',
      'Assets retain source provenance and existing license boundaries.',
    ],
    files:[...files.values()].map(row => ({...row, reasons:row.reasons.sort()})).sort((a, b) => a.path.localeCompare(b.path, 'en')),
  };
}

export async function exportGameRecordInventory({inventory, dist, sourceRoot, reviewed, records, shapePacks=[], out}) {
  const expected = await createGameRecordInventory({dist, sourceRoot, reviewed, records, shapePacks});
  if (digest(jsonBytes(expected)) !== digest(jsonBytes(inventory)))
    fail('inventory-mismatch', 'Inventory differs from the reviewed game record dependency closure');
  const approvedGameRecords = new Map(expected.files.filter(row => row.generated !== undefined)
    .map(row => [row.path, row.generated]));
  return copyDeclaredFiles({inventory:expected, dist, out, approvedGameRecords, shapePacks});
}
