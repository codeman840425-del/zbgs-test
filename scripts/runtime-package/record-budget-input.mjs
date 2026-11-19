import {execFileSync} from 'node:child_process';
import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest, fail, localFile, runtimePath} from './files.mjs';
import {collectRecordResources} from './record-resources.mjs';
import {createGameRecordInventory} from './game-record-inventory.mjs';
import {readGameRuntimeReview} from './game-runtime-review.mjs';

async function shapeInputs(directories, records, project, commit) {
  if (directories.length > 4) fail('invalid-record-input','Expected at most four shape packs');
  const dist = path.join(project,'dist');
  const build = JSON.parse(await readFile(await localFile(dist,'build-info.json')));
  const {reviewed} = await readGameRuntimeReview(build.sourceDigest,true);
  if (reviewed.sourceCommit !== commit) fail('inexact-source','Checkout differs from the approved ordinary runtime');
  const packs = new Map();
  for (const [ordinal,directory] of directories.entries()) {
    const root = await realpath(directory);
    const raw = await readFile(await localFile(root,'index.json'));
    const {bodyType} = JSON.parse(raw);
    if (!records.some(r=>r.appearanceRecipe.base.bodyType===bodyType) || packs.has(bodyType))
      fail('invalid-record-input','Unused or duplicate shape pack: '+bodyType);
    packs.set(bodyType,{root,ordinal,indexSha256:digest(raw),bodyType});
  }
  return {dist,reviewed,packs};
}

async function shapeRecord(record, sourceRoot, approved, pack) {
  // Per-actor inventories retain this actor's own equipment IDs and reasons
  // when a second actor uses the same garment bytes on a different skeleton.
  const inventory = await createGameRecordInventory({dist:approved.dist,sourceRoot,reviewed:approved.reviewed,
    records:[record],shapePacks:[pack.root]});
  const [look] = inventory.records;
  const prefix = 'character-data/'+pack.bodyType+'/';
  const index = inventory.files.find(row=>row.path===prefix+'index.json');
  if (index?.sha256!==pack.indexSha256) fail('modified-dependency','Verified shape index changed');
  const files = inventory.files.filter(row=>!Object.hasOwn(approved.reviewed.files,row.path) &&
    !row.path.startsWith('records/')).map(row=>{
    const name = row.path.startsWith(prefix)?row.path.slice(prefix.length):row.path;
    // Declaration provenance can also point to an equipment.json. Only the
    // physical payload at the matching published path is an asset byte source.
    const fromPack = row.provenance.some(ref=>ref.indexSha256===pack.indexSha256 && ref.packPath===name);
    return fromPack?{...row,shapePackFile:{ordinal:pack.ordinal,path:name}}:row;
  });
  return {...look,hairColor:record.appearanceRecipe.appearance.hairColor,
    earSelection:record.appearanceRecipe.accessories?.ears?.selection??'none',files};
}

async function collect(source, input, directories) {
  const sourceRoot = await realpath(source);
  const git = (...args) => execFileSync('git', args, {cwd:sourceRoot, encoding:'utf8', maxBuffer:4 * 1024 * 1024});
  if (path.relative(sourceRoot, await realpath(git('rev-parse', '--show-toplevel').trim())))
    fail('inexact-source', 'Source root must be the repository checkout root');
  function verifySource() {
    if (git('status', '--porcelain=v1', '--untracked-files=all', '--', 'prototype').trim())
      fail('inexact-source', 'The selected checkout has modified source or public assets under prototype');
    return git('rev-parse', 'HEAD').trim();
  }
  const commit = verifySource();
  const versions = new Set(git('ls-files', '-z', '--', 'prototype').split('\0'));
  const project = path.join(sourceRoot, 'prototype');
  const publicRoot = path.join(project, 'public');
  const load = async file => import(pathToFileURL(await localFile(project, 'src/' + file)).href);
  const [envelope, runtime] = await Promise.all([load('character-record.js'), load('character-runtime-record.js')]);
  const inputBytes = await readFile(input);
  const value = JSON.parse(new TextDecoder().decode(inputBytes));
  const records = Array.isArray(value) ? value : [value];
  if (records.length < 1 || records.length > 4)
    fail('invalid-record-input', 'Expected one complete record or an array of one to four records');
  const identities = new Set();
  for (const candidate of records) {
    const record = runtime.parseRuntimeCharacterRecord(JSON.stringify(candidate));
    await envelope.validateCharacterRecord(record, {validationCallback:() => ({status:'pending'})});
    if (identities.has(record.identity.id)) fail('duplicate-identity', 'Duplicate stable record identity: ' + record.identity.id);
    identities.add(record.identity.id);
    const derived = runtime.deriveCharacterResourceIdentities(record.appearanceRecipe, record.liveAccessories, record.equipmentMaterials, record.nativeHairCenter);
    if (envelope.canonicalJson(derived) !== envelope.canonicalJson(record.resourceIdentities))
      fail('record-identity-mismatch', 'Resource identities differ from the saved look: ' + record.identity.id);
  }
  const result = [];
  const approved = directories.length?await shapeInputs(directories,records,project,commit):null;
  for (const record of records) {
    const pack = approved?.packs.get(record.appearanceRecipe.base.bodyType);
    if (pack) {
      result.push(await shapeRecord(record,sourceRoot,approved,pack));
      continue;
    }
    const files = new Map();
    const add = async (url, reason, {parent, sha256, bytes:size, provenance = []} = {}) => {
      const relative = runtimePath(url, parent);
      if (!versions.has('prototype/public/' + relative))
        fail('untracked-dependency', 'Dependency is absent from the exact checkout: ' + relative);
      const bytes = await readFile(await localFile(publicRoot, relative));
      const hash = digest(bytes);
      if ((sha256 !== undefined && sha256 !== hash) || (size !== undefined && size !== bytes.length))
        fail('modified-dependency', 'Dependency identity differs: ' + relative);
      const row = files.get(relative) ?? {path:relative, sha256:hash, bytes:bytes.length, reasons:[], provenance:[]};
      if (row.sha256 !== hash || row.bytes !== bytes.length)
        fail('modified-dependency', 'Dependency changed during collection: ' + relative);
      if (!row.reasons.includes(reason)) row.reasons.push(reason);
      for (const reference of provenance) {
        if (!row.provenance.some(existing => envelope.canonicalJson(reference) === envelope.canonicalJson(existing)))
          row.provenance.push(reference);
      }
      files.set(relative, row);
      return {path:relative, bytes, value:relative.endsWith('.json') ? JSON.parse(bytes) : null};
    };
    const look = await collectRecordResources({record, sourceRoot, add});
    result.push({id:record.identity.id, revision:record.revision, recordSha256:record.integrity.recordSha256,
      hairColor:record.appearanceRecipe.appearance.hairColor,
      earSelection:record.appearanceRecipe.accessories?.ears?.selection ?? 'none',
      ...look, files:[...files.values()].sort((a,b) => a.path.localeCompare(b.path,'en'))});
  }
  if (verifySource() !== commit) fail('inexact-source', 'Source commit changed during dependency collection');
  return {sourceCommit:commit, inputSha256:digest(inputBytes), records:result,...(approved?{
    shapePacks:[...approved.packs.values()].map(({ordinal,bodyType,indexSha256})=>({ordinal,bodyType,indexSha256})),
    reviewedRuntime:approved.reviewed.sourceDigest,
  }:{})};
}

const [source, input, ...directories] = process.argv.slice(2);
try {
  if (!source || !input) fail('invalid-record-input', 'Expected source checkout root and JSON record input');
  console.log(JSON.stringify(await collect(source, input, directories)));
} catch (error) {
  console.error(JSON.stringify({code:error.code ?? 'record-collection-failed', error:error.message}));
  process.exitCode = 2;
}
