const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const run = require('node:util').promisify(execFile);

const project = path.resolve(__dirname, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = 'rule-body-[a-f0-9]{20}';
const bodyPattern = new RegExp('^' + idPattern + '$');
const metadataPath = new RegExp('^character-data/' + idPattern + '/(?:index|fit|profile|recipe)\\.json$');
const bodyAssetPath = new RegExp('^assets/' + idPattern + '/(?:body\\.vrm|equipment\\.json)$');
const catalogPath = 'records/rule-body-data.json';
const sharedGarments = new Set([
  'assets/garment-basecolor-release-v1/male/raw-male-uniform-top-1k-v1.glb',
  'assets/raw-male-equipment-v1/raw-male-ab9a-uniform-pants-v1.glb',
  'assets/raw-male-equipment-v1/raw-male-ab9a-flat-shoes-v1.glb',
]);

function isShapeDataPath(relative) {
  return relative === catalogPath || sharedGarments.has(relative) ||
    metadataPath.test(relative) || bodyAssetPath.test(relative);
}

async function verifiedShapeOverlay(directories) {
  if (!Array.isArray(directories) || directories.length > 4)
    throw Error('Expected at most four shape pack directories');
  const {localFile, checkedBytes} = await import('./files.mjs');
  const descriptors = [], files = new Map(), origins = new Map(), bodies = new Set();
  for (const directory of directories) {
    const root = await fs.realpath(directory);
    const indexBytes = await fs.readFile(await localFile(root, 'index.json'));
    const indexSha256 = sha256(indexBytes);
    const verified = await run('python', ['-B', path.join(project, 'scripts/production/shape_data_pack.py'),
      'verify', '--pack', root, '--index-sha256', indexSha256], {cwd:project,windowsHide:true});
    const receipt = JSON.parse(verified.stdout);
    const index = JSON.parse(indexBytes);
    const {bodyType} = index;
    if (!bodyPattern.test(bodyType) || receipt.indexSha256 !== indexSha256 ||
        receipt.bodyType !== bodyType || index.schema !== 'shape-data-pack-v1' ||
        receipt.fileCount !== 9 || index.files.length !== 8 || bodies.has(bodyType))
      throw Error('Unexpected or duplicate verified shape pack: ' + bodyType);
    bodies.add(bodyType);
    const prefix = 'character-data/' + bodyType + '/';
    const expected = new Set([...sharedGarments, 'assets/' + bodyType + '/body.vrm',
      'assets/' + bodyType + '/equipment.json', 'fit.json', 'profile.json', 'recipe.json']);
    function accept(packPath, bytes) {
      const relative = packPath.startsWith('assets/') ? packPath : prefix + packPath;
      if (!isShapeDataPath(relative) || (files.has(relative) && !files.get(relative).equals(bytes)))
        throw Error('Conflicting shape data: ' + relative);
      if (!files.has(relative)) files.set(relative, bytes);
      if (!origins.has(relative)) origins.set(relative, []);
      origins.get(relative).push({indexSha256, packPath});
    }
    accept('index.json', indexBytes);
    for (const row of index.files) {
      if (!expected.delete(row.path)) throw Error('Unexpected shape pack payload ' + row.path);
      accept(row.path, await checkedBytes(root, row));
    }
    descriptors.push({bodyType, url:'/' + prefix + 'index.json', sha256:indexSha256, bytes:indexBytes.length});
  }
  descriptors.sort((a,b) => a.bodyType.localeCompare(b.bodyType,'en'));
  for (const refs of origins.values()) refs.sort((a,b) => a.indexSha256.localeCompare(b.indexSha256,'en'));
  if (descriptors.length) files.set(catalogPath, Buffer.from(JSON.stringify({
    schema:'published-rule-body-packs-v1', ruleBodyDataPacks:descriptors,
  })));
  return {files, descriptors, origins};
}

// A read-only overlay can share identical resources with a frozen build.
// Check each existing path component, including case aliases on Windows.
async function assertOverlayDist(files, dist) {
  const root = await fs.realpath(dist);
  for (const [relative, bytes] of files) {
    if (!isShapeDataPath(relative) || !Buffer.isBuffer(bytes))
      throw Error('Unexpected shape overlay path or contents: ' + relative);
    let cursor = root;
    const parts = relative.split('/');
    for (const [i, part] of parts.entries()) {
      const names = await fs.readdir(cursor);
      const aliases = names.filter(name => name.toLowerCase() === part.toLowerCase());
      if (!aliases.length) break;
      if (aliases.length !== 1 || aliases[0] !== part) throw Error('Case conflict: ' + relative);
      cursor = path.join(cursor, part);
      const info = await fs.lstat(cursor);
      if (info.isSymbolicLink()) throw Error('Linked path conflicts with shape overlay: ' + relative);
      if (i + 1 < parts.length) {
        if (!info.isDirectory()) throw Error('Directory conflict: ' + relative);
      } else if (!info.isFile() || info.size !== bytes.length || !(await fs.readFile(cursor)).equals(bytes)) {
        throw Error('Frozen file conflicts with shape overlay: ' + relative);
      }
    }
  }
}

module.exports = {verifiedShapeOverlay, assertOverlayDist, isShapeDataPath};
