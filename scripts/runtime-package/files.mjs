import {createHash, randomUUID} from 'node:crypto';
import {readFile, realpath, mkdir, writeFile, rename, rm, lstat} from 'node:fs/promises';
import path from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
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
  await mkdir(path.dirname(file), {recursive:true});
  try { await writeFile(file, bytes, {flag:'wx'}); }
  catch (error) { if (error.code === 'EEXIST') fail('output-conflict', `Output already exists: ${file}`); throw error; }
}

export async function copyDeclaredFiles({inventory, dist, out}) {
  const recordPackage=inventory?.schema==='character-record-package-inventory-v1';
  if ((!recordPackage&&inventory?.schema !== 'runtime-package-inventory-v1') || !Array.isArray(inventory.files) || !inventory.files.length)
    fail('unsupported-inventory', 'Expected a reviewed runtime or character-record inventory');
  const generatedPaths=recordPackage?['character-record.json']:['selected-appearance.recipe.json','material-selections.json'];
  const paths = new Set();
  for (const row of inventory.files) {
    if (typeof row.path !== 'string' || runtimePath('/' + row.path) !== row.path || paths.has(row.path) ||
        !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
      fail('invalid-inventory', `Invalid or duplicate file declaration ${row.path}`);
    paths.add(row.path);
    if (row.generated !== undefined && typeof row.generated !== 'string') fail('invalid-inventory', 'Generated files must be UTF-8 text');
    if (row.generated !== undefined && !generatedPaths.includes(row.path))
      fail('invalid-inventory', `Unsupported generated substitution ${row.path}`);
  }
  for (const required of ['index.html','build-info.json',...generatedPaths])
    if (!paths.has(required)) fail('invalid-inventory', `Missing required declaration ${required}`);
  if (paths.has('runtime-package.json')) fail('invalid-inventory', 'Package manifest path is reserved');
  const destination = path.resolve(out);
  if (await lstat(destination).catch(error => {if (error.code === 'ENOENT') return null; throw error;}))
    fail('output-conflict', `Output already exists: ${destination}`);
  await mkdir(path.dirname(destination), {recursive:true});
  const stage = destination + '.stage-' + randomUUID();
  await mkdir(stage);
  try {
    for (const row of inventory.files) {
      const bytes = row.generated === undefined ? await checkedBytes(dist, row) : Buffer.from(row.generated, 'utf8');
      if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) fail('modified-dependency', `Generated file identity differs: ${row.path}`);
      const target = path.join(stage, ...row.path.split('/'));
      await mkdir(path.dirname(target), {recursive:true});
      await writeFile(target, bytes, {flag:'wx'});
    }
    const build = JSON.parse(await readFile(path.join(stage, 'build-info.json'), 'utf8'));
    if (build.sourceDigest !== inventory.runtime.sourceDigest || build.shortId !== inventory.runtime.buildId)
      fail('build-identity-mismatch', 'Copied fixed build metadata differs');
    // Do not overwrite an existing successful package, including one created
    // concurrently while these bytes were being checked.
    if (await lstat(destination).catch(error => {if (error.code === 'ENOENT') return null; throw error;}))
      fail('output-conflict', `Output already exists: ${destination}`);
    await writeFile(path.join(stage, 'runtime-package.json'), jsonBytes(inventory), {flag:'wx'});
    await rename(stage, destination);
    return {schema:'runtime-package-export-result-v1', files:inventory.files.length + 1,
      manifestSha256:digest(jsonBytes(inventory)), runtime:inventory.runtime};
  } catch (error) {
    await rm(stage, {recursive:true, force:true});
    throw error;
  }
}
