import {createHash, randomUUID} from 'node:crypto';
import {readFile, realpath, mkdir, writeFile, rename, rm, lstat, open, link, unlink} from 'node:fs/promises';
import path from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
export const GAME_RECORD_INPUT_MANIFEST = 'records/manifest.json';
const GAME_RECORD_INPUT_PATH = /^records\/[a-z0-9][a-z0-9._-]{1,95}\.json$/;
export function fail(code, message) { throw Object.assign(new Error(message), {code}); }

// Runtime paths are URL paths relative to the HTTP origin. Author/provenance
// links are metadata and never passed to this resolver.
export function runtimePath(value, parent = 'index.html') {
  if (typeof value !== 'string' || !value || /[\\%?#\u0000-\u0020:]/.test(value) || value.startsWith('//'))
    fail('unsafe-path', `Unsupported runtime URL ${value}`);
  const parts = value.split('/');
  if (parts.includes('..') || parts.includes('.')) fail('unsafe-path', `Path traversal is unsupported: ${value}`);
  const relative = value.startsWith('/') ? value.slice(1) : path.posix.join(path.posix.dirname(parent), value);
  if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) fail('unsafe-path', `Invalid runtime path ${value}`);
  return relative;
}

// Equipment manifests use both adjacent GLBs and shared sibling directories.
// Return the path used as the key in the packaged game's file inventory.
export function equipmentRuntimePath(value, manifestPath) {
  const parent = runtimePath(manifestPath);
  if (typeof value === 'string' && /^\.\.\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.glb$/.test(value)) {
    return runtimePath('/' + path.posix.join(path.posix.dirname(parent), value));
  }
  return runtimePath(value, parent);
}

export async function localFile(root, relative) {
  if (runtimePath('/' + relative) !== relative) fail('unsafe-path', `Noncanonical runtime path ${relative}`);
  const base = await realpath(root);
  const candidate = await realpath(path.join(base, ...relative.split('/'))).catch(error => {
    if (error.code === 'ENOENT') fail('missing-dependency', `Missing dependency ${relative}`);
    throw error;
  });
  const inside = path.relative(base, candidate);
  if (inside.startsWith('..') || path.isAbsolute(inside)) fail('unsafe-path', `Dependency escapes its root: ${relative}`);
  if (!(await lstat(candidate)).isFile()) fail('missing-dependency', `Dependency is not a regular file: ${relative}`);
  return candidate;
}

export async function checkedBytes(root, row) {
  const bytes = await readFile(await localFile(root, row.path));
  if (bytes.length !== row.bytes || digest(bytes) !== row.sha256)
    fail('modified-dependency', `Dependency identity differs: ${row.path}`);
  return bytes;
}

export async function writeFresh(file, bytes) {
  const directory = path.dirname(file);
  await mkdir(directory, {recursive:true});
  const temporary = path.join(directory, '.inventory-' + randomUUID() + '.tmp');
  const handle = await open(temporary, 'wx');
  try {
    try { await handle.writeFile(bytes); }
    finally { await handle.close(); }
    // The final name becomes visible only when all bytes have been written.
    // A hard link creates that name atomically and refuses an existing output.
    try { await link(temporary, file); }
    catch (error) { if (error.code === 'EEXIST') fail('output-conflict', `Output already exists: ${file}`); throw error; }
  } finally {
    await unlink(temporary);
  }
}

export async function copyDeclaredFiles({inventory, dist, out, approvedGameRecords = new Map(), shapePacks = []}) {
  const recordPackage=inventory?.schema==='character-record-package-inventory-v1';
  const gameRecordPackage=inventory?.schema==='game-character-record-package-v1';
  if ((!recordPackage&&!gameRecordPackage&&inventory?.schema !== 'runtime-package-inventory-v1') || !Array.isArray(inventory.files) || !inventory.files.length)
    fail('unsupported-inventory', 'Expected a reviewed runtime or character-record inventory');
  const gameRecordInput = gameRecordPackage && inventory.recordManifest === GAME_RECORD_INPUT_MANIFEST;
  if (!Array.isArray(shapePacks) || (shapePacks.length && !gameRecordInput))
    fail('invalid-inventory', 'Shape packs require an external game record inventory');
  const generatedPaths = gameRecordInput ? [...approvedGameRecords.keys()]
    : gameRecordPackage ? [] : recordPackage ? ['character-record.json'] : ['selected-appearance.recipe.json','material-selections.json'];
  if (gameRecordInput && (!approvedGameRecords.has(GAME_RECORD_INPUT_MANIFEST) ||
      generatedPaths.length < 2 || generatedPaths.length > 5 || generatedPaths.some(file => !GAME_RECORD_INPUT_PATH.test(file))))
    fail('invalid-inventory', 'Expected validated game record sidecars');
  const required = gameRecordInput ? ['record-consumer.html', 'build-info.json', ...generatedPaths]
    : gameRecordPackage ? ['record-consumer.html', 'build-info.json', 'assets/record-consumer-v1/manifest.json']
    : ['index.html','build-info.json',...generatedPaths];
  const paths = new Set();
  for (const row of inventory.files) {
    if (typeof row.path !== 'string' || runtimePath('/' + row.path) !== row.path || paths.has(row.path) ||
        !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
      fail('invalid-inventory', `Invalid or duplicate file declaration ${row.path}`);
    paths.add(row.path);
    if (row.generated !== undefined && typeof row.generated !== 'string') fail('invalid-inventory', 'Generated files must be UTF-8 text');
    if (row.generated !== undefined && !generatedPaths.includes(row.path))
      fail('invalid-inventory', `Unsupported generated substitution ${row.path}`);
    if (gameRecordInput && row.path.startsWith('records/') &&
        (!approvedGameRecords.has(row.path) || row.generated !== approvedGameRecords.get(row.path)))
      fail('invalid-inventory', `Unreviewed game record sidecar ${row.path}`);
  }
  for (const relative of required)
    if (!paths.has(relative)) fail('invalid-inventory', `Missing required declaration ${relative}`);
  if (gameRecordPackage && paths.has('index.html')) fail('invalid-inventory', 'Room HTML cannot be exported in the game record package');
  if (paths.has('runtime-package.json')) fail('invalid-inventory', 'Package manifest path is reserved');
  const descriptors = gameRecordInput ? JSON.parse(approvedGameRecords.get(GAME_RECORD_INPUT_MANIFEST)).ruleBodyDataPacks : undefined;
  let overlay;
  if (shapePacks.length) {
    const {default:shapeData} = await import('./shape-overlay.cjs');
    overlay = await shapeData.verifiedShapeOverlay(shapePacks);
    if (JSON.stringify(descriptors) !== JSON.stringify(overlay.descriptors))
      fail('invalid-inventory', 'Rule body pointers differ from the verified game record manifest');
    for (const relative of overlay.origins.keys()) {
      if (!paths.has(relative)) fail('invalid-inventory', 'Missing rule body pack file: ' + relative);
    }
    await shapeData.assertOverlayDist(overlay.files, dist);
  } else if (descriptors !== undefined) {
    fail('invalid-inventory', 'Rule body pointers require verified shape packs');
  }
  const destination = path.resolve(out);
  if (await lstat(destination).catch(error => {if (error.code === 'ENOENT') return null; throw error;}))
    fail('output-conflict', `Output already exists: ${destination}`);
  await mkdir(path.dirname(destination), {recursive:true});
  const stage = destination + '.stage-' + randomUUID();
  await mkdir(stage);
  try {
    for (const row of inventory.files) {
      let bytes;
      if (row.generated !== undefined) bytes = Buffer.from(row.generated, 'utf8');
      else if (overlay?.origins.has(row.path) &&
               !row.provenance.some(ref => ref.sourceCommit === inventory.runtime.sourceCommit &&
                 ref.sourcePath === 'prototype/public/' + row.path)) bytes = overlay.files.get(row.path);
      else bytes = await checkedBytes(dist, row);
      if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) fail('modified-dependency', `Generated file identity differs: ${row.path}`);
      const target = path.join(stage, ...row.path.split('/'));
      await mkdir(path.dirname(target), {recursive:true});
      await writeFile(target, bytes, {flag:'wx'});
    }
    const build = JSON.parse(await readFile(path.join(stage, 'build-info.json'), 'utf8'));
    if (build.sourceDigest !== inventory.runtime.sourceDigest || build.shortId !== inventory.runtime.buildId)
      fail('build-identity-mismatch', 'Copied fixed build metadata differs');
    await writeFile(path.join(stage, 'runtime-package.json'), jsonBytes(inventory), {flag:'wx'});
    await publishStagedDirectory(stage, destination);
    return {schema:'runtime-package-export-result-v1', files:inventory.files.length + 1,
      manifestSha256:digest(jsonBytes(inventory)), runtime:inventory.runtime};
  } catch (error) {
    await rm(stage, {recursive:true, force:true});
    throw error;
  }
}

export async function publishStagedDirectory(stage, destination) {
  for (let attempt = 0; ; attempt++) {
    if (await lstat(destination).catch(error => {if (error.code === 'ENOENT') return null; throw error;}))
      fail('output-conflict', `Output already exists: ${destination}`);
    try {
      await rename(stage, destination);
      return;
    } catch (error) {
      // Windows can hold a completed stage briefly. Retry only its final rename.
      if (process.platform !== 'win32' || attempt >= 4 || !['EPERM','EBUSY','EACCES'].includes(error.code))
        throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}
