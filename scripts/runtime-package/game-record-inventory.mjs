import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkedBytes, copyDeclaredFiles, digest, fail, jsonBytes, localFile, runtimePath} from './files.mjs';
import {collectRecordResources} from './record-resources.mjs';

const ENTRY = 'record-consumer.html';
const BUILD = 'build-info.json';
const SAMPLE_DIRECTORY = 'assets/record-consumer-v1/';
const MANIFEST = SAMPLE_DIRECTORY + 'manifest.json';
const PACKAGE_SCHEMA = 'game-character-record-package-v1';
const REVIEWED_SCHEMA = 'reviewed-game-character-runtime-v1';
const RECORD_COUNT = 4;
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
  const sourceHash = createHash('sha256');
  const publicFiles = new Map();
  for (const relative of build.inputs) {
    if (typeof relative !== 'string') fail('unsupported-build', 'Invalid build source input');
    const bytes = await readFile(await localFile(project, portablePath(relative)));
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

export async function createGameRecordInventory({dist, sourceRoot, reviewed}) {
  validateReviewed(reviewed);
  const project = path.resolve(sourceRoot, 'prototype');
  const {build, buildBytes, publicFiles} = await verifyBuild(dist, project, reviewed);
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
    if (!pin && !isPublic) fail('unsupported-dependency', 'File lacks reviewed source/build provenance: ' + relative);
    const content = relative === BUILD ? buildBytes : await readFile(await localFile(dist, relative));
    const hash = digest(content);
    if ((pin && (hash !== pin.sha256 || content.length !== pin.bytes)) ||
        (isPublic && hash !== publicFiles.get(relative)) ||
        (sha256 !== undefined && hash !== sha256) || (size !== undefined && content.length !== size))
      fail('modified-dependency', 'Dependency identity differs: ' + relative);
    let row = files.get(relative);
    if (!row) {
      const folded = relative.toLowerCase();
      if (identities.has(folded)) fail('unsafe-path', 'Case-colliding package path: ' + relative);
      identities.add(folded);
      const origin = isPublic ? {sourcePath:'prototype/public/' + relative}
        : {buildId:build.shortId, bundlePath:relative, buildManifest:BUILD};
      row = {path:relative, sha256:hash, bytes:content.length, reasons:[],
        provenance:[{sourceCommit:reviewed.sourceCommit, ...origin}]};
      files.set(relative, row);
    } else if (row.sha256 !== hash || row.bytes !== content.length) {
      fail('modified-dependency', 'Dependency changed during collection: ' + relative);
    }
    if (!row.reasons.includes(reason)) row.reasons.push(reason);
    for (const ref of provenance)
      if (!row.provenance.some(old => envelope.canonicalJson(old) === envelope.canonicalJson(ref))) row.provenance.push(ref);
    return {path:relative, bytes:content, value:relative.endsWith('.json') ? JSON.parse(content) : null};
  }

  await add('/' + BUILD, 'Fixed source identity');
  const html = await add('/' + ENTRY, 'Independent game record entry');
  const scanned = new Set([BUILD, ENTRY]);
  async function scanBundle(reference, parent) {
    if (parent.endsWith('.js') && !reference.startsWith('./') && !reference.startsWith('/'))
      fail('unsupported-dependency', 'Expected a local compiled module reference: ' + reference);
    const target = portablePath(runtimePath(reference.startsWith('./') ? reference.slice(2) : reference, parent));
    if ((!BUNDLE_PATH.test(target) && target !== 'favicon.svg') || !Object.hasOwn(reviewed.files, target))
      fail('unsupported-dependency', 'Missing independently reviewed bundle pin: ' + target);
    if (scanned.has(target)) return;
    scanned.add(target);
    const {bytes} = await add('/' + target, 'Compiled dependency of ' + parent);
    if (target.endsWith('.js')) {
      for (const imported of moduleReferences(bytes.toString('utf8'), parseAst)) await scanBundle(imported, target);
    }
  }
  for (const reference of htmlReferences(html.bytes.toString('utf8'))) await scanBundle(reference, ENTRY);
  if (![...scanned].some(file => file.endsWith('.js')) ||
      Object.keys(reviewed.files).some(file => !scanned.has(file)))
    fail('unsupported-build', 'Reviewed compiled file pins must match the game entry dependency graph');

  const {value:manifest} = await add('/' + MANIFEST, 'Ordered source character record manifest');
  if (manifest?.schema !== 'record-consumer-samples-v1' || manifest.entries?.length !== RECORD_COUNT ||
      !Array.isArray(manifest.entries))
    fail('invalid-record-manifest', 'Expected the four ordered game records');
  const records = [];
  const recordFiles = new Set([MANIFEST]);
  const recordIds = new Set();
  for (const entry of manifest.entries) {
    const relative = portablePath(runtimePath(entry?.url));
    if (entry.url !== '/' + relative || !RECORD_PATH.test(relative) || recordFiles.has(relative) ||
        !publicFiles.has(relative) || !SHA256.test(entry.recordSha256) || typeof entry.label !== 'string' || !entry.label)
      fail('invalid-record-manifest', 'Invalid source record declaration: ' + relative);
    recordFiles.add(relative);
    const item = await add(entry.url, 'Fixed source character record');
    const record = runtime.parseRuntimeCharacterRecord(item.bytes.toString('utf8'));
    await envelope.validateCharacterRecord(record, {validationCallback:() => ({status:'pending'})});
    if (record.identity.id !== entry.id || record.integrity.recordSha256 !== entry.recordSha256 || recordIds.has(entry.id))
      fail('record-identity-mismatch', 'Record manifest identity differs: ' + relative);
    recordIds.add(entry.id);
    const derived = runtime.deriveCharacterResourceIdentities(record.appearanceRecipe, record.liveAccessories, record.equipmentMaterials);
    if (envelope.canonicalJson(derived) !== envelope.canonicalJson(record.resourceIdentities))
      fail('record-identity-mismatch', 'Record resources differ from the saved look: ' + relative);
    const selected = await collectRecordResources({record, sourceRoot, add});
    records.push({id:entry.id, label:entry.label, file:relative, revision:record.revision,
      recordSha256:entry.recordSha256, ...selected});
  }

  return {
    schema:PACKAGE_SCHEMA,
    runtime:{sourceCommit:reviewed.sourceCommit, sourceDigest:reviewed.sourceDigest, buildId:build.shortId,
      entry:ENTRY, entryUrl:'/' + ENTRY},
    recordManifest:MANIFEST,
    records,
    limitations:[
      'Collection covers the selected records, their eager startup resources and compatible motions.',
      'Runtime byte verification is scoped to these records. Visual acceptance and ordinary-PC performance are separate checks.',
      'Assets retain source provenance and existing license boundaries.',
    ],
    files:[...files.values()].map(row => ({...row, reasons:row.reasons.sort()})).sort((a, b) => a.path.localeCompare(b.path, 'en')),
  };
}

export async function exportGameRecordInventory({inventory, dist, sourceRoot, reviewed, out}) {
  const expected = await createGameRecordInventory({dist, sourceRoot, reviewed});
  if (digest(jsonBytes(expected)) !== digest(jsonBytes(inventory)))
    fail('inventory-mismatch', 'Inventory differs from the reviewed game record dependency closure');
  return copyDeclaredFiles({inventory:expected, dist, out});
}
