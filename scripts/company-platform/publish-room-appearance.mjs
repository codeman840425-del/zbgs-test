import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual, promisify} from 'node:util';
import {buildLibrary, planPath, replaceIndex, withCatalogWriteLock} from './build-library.mjs';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

const root = path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const catalogPath = 'prototype/src/company/library-catalog.json';
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code,message) => {throw Object.assign(Error(message),{code});};
const parse = bytes => JSON.parse(bytes.toString('utf8'));
const run = promisify(execFile);

async function regularFile(relative) {
  const absolute = path.join(root,relative);
  if (await fs.realpath(absolute) !== absolute || !(await fs.lstat(absolute)).isFile())
    fail('appearance-linked-path',relative);
  return fs.readFile(absolute);
}
function productionSource(name) {
  if (typeof name !== 'string' || !/^assets-source\/company-[^/]+\//.test(name) ||
      /[\\:\0]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..'))
    fail('invalid-appearance-source','Expected a project-relative file in assets-source/company-*: '+name);
}
async function ensureDirectory(relative,owned,exclusive=false) {
  let current = root;
  const target = path.join(root,relative);
  for (const name of relative.split('/')) {
    current = path.join(current,name);
    try {await fs.mkdir(current); owned.push(current);}
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if ((exclusive && current === target) || await fs.realpath(current) !== current || !(await fs.lstat(current)).isDirectory())
        fail('appearance-output-conflict',current);
    }
  }
}
async function writeNew(relative,bytes,owned) {
  const file = path.join(root,relative);
  const handle = await fs.open(file,'wx');
  owned.push(file);
  try {await handle.writeFile(bytes); await handle.sync();} finally {await handle.close();}
}

async function publish(recipePath,check) {
  productionSource(recipePath);
  if (!recipePath.endsWith('.json')) fail('invalid-appearance-recipe',recipePath);
  const [originalPlan,originalCatalog,inputBytes] = await Promise.all([planPath,catalogPath,recipePath].map(regularFile));
  const plan = parse(originalPlan), previous = parse(originalCatalog), input = parse(inputBytes);
  const family = {'company-desk-lamp-collection':'desk-lamp','company-screen-partition-collection':'screen-partition'}[input.schema];
  if (typeof family !== 'string' || input.version !== 1 || !Array.isArray(input.designs) || !input.designs.length)
    fail('invalid-appearance-recipe','Expected a version 1 desk-lamp or screen-partition recipe with designs');
  const base = 'assets-source/company-'+family+'-v1';
  const collectionPath = base+'/collection.json';
  if (plan.output !== catalogPath || !Array.isArray(plan.resources) ||
      plan.collections.filter(file => file === collectionPath).length !== 1)
    fail('invalid-appearance-plan',collectionPath);
  const defaults = parse(await regularFile(collectionPath));
  const reference = previous.resources.find(r => r.id === defaults.resources[0].id && r.version === defaults.resources[0].version);
  assert.equal(reference?.productionBranch,family,'Missing registered functional reference');
  const generator = 'scripts/company-platform/build-'+family+'-collection.mjs';
  const pinnedTools = [{path:generator,sha256:reference.provenance.generatorSha256},
    ...Object.values(reference.provenance.dependencies || {})];
  for (const tool of pinnedTools) {
    if (hash(await regularFile(tool.path)) !== tool.sha256) fail('appearance-tool-pin-mismatch',tool.path);
  }
  for (const design of input.designs) {
    if (!/^[a-z][a-z0-9-]{0,70}$/.test(design.id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id) ||
        !Number.isSafeInteger(design.version) || design.version < 1)
      fail('invalid-appearance-identity',String(design.id));
    if (previous.resources.some(r => r.id.toLowerCase() === design.id && r.productionBranch !== family))
      fail('appearance-id-conflict',design.id+' already belongs to a different family');
    if (design.source) {
      const source = family === 'desk-lamp' ? input.archive : input.sources?.[design.source];
      productionSource(source?.path);
      await regularFile(source.path);
    }
  }
  // The original producers pin their parameter path. A byte snapshot beside
  // the author's draft lets later edits to that same draft preserve old saves.
  const digest = hash(inputBytes);
  const pinned = recipePath === base+'/parameters.json' ? recipePath : path.posix.join(path.posix.dirname(recipePath),'recipe-'+digest+'.json');
  const output = path.join(root,'output');
  await ensureDirectory('output',[]);
  const staging = await fs.mkdtemp(path.join(output,'room-appearance-'));
  const staged = path.join(staging,'candidate');
  const ownedFiles = [], ownedDirs = [];
  let committed = false, keepLock = false, stagedRemoved = false;
  async function removeStage() {
    assert.equal(path.dirname(staging),output); assert(path.basename(staging).startsWith('room-appearance-'));
    await fs.rm(staging,{recursive:true,force:true});
    stagedRemoved = true;
  }
  try {
    try {
      if (!(await regularFile(pinned)).equals(inputBytes)) fail('appearance-source-pin-conflict',pinned);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (check) fail('appearance-unregistered',recipePath);
      await writeNew(pinned,inputBytes,ownedFiles);
    }
    try {await run(process.execPath,[generator,'--output',staged,'--parameters',pinned],{cwd:root,maxBuffer:8*1024*1024});}
    catch (error) {fail('appearance-generation-failed',error.stderr?.trim() || error.message);}
    const generated = parse(await fs.readFile(path.join(staged,collectionPath)));
    assert.equal(generated.sourceParameters,pinned);
    assert.equal(generated.sourceParametersSha256,digest);
    assert.deepEqual(generated.resources.map(r=>[r.id,r.version]),input.designs.map(d=>[d.id,d.version]));
    const items = [], additions = new Set();
    for (const entry of generated.resources) {
      const key = entry.id+'@'+entry.version;
      const dir = 'prototype/public/company-assets/'+family+'-v1/'+entry.id+'/v'+entry.version;
      assert.equal(entry.resourcePath,dir+'/resource.json'); assert.equal(entry.modelPath,dir+'/model.glb');
      const [sidecar,model] = await Promise.all([entry.resourcePath,entry.modelPath].map(file=>fs.readFile(path.join(staged,file))));
      const resource = parse(sidecar);
      assert.equal(resource.id,entry.id); assert.equal(resource.version,entry.version);
      assert.equal(resource.provenance.sourceParameters,pinned); assert.equal(resource.provenance.sourceParametersSha256,digest);
      assert.deepEqual(resource.provenance.dependencies,reference.provenance.dependencies);
      assert.equal(resource.productionBranch,family); assert(compareFacilityFunction(reference,resource).compatible,'Function or mounting differs from '+reference.id);
      assert.equal(resource.asset.url,entry.modelPath.slice('prototype/public'.length));
      assert.equal(resource.asset.sha256,hash(model)); assert.equal(resource.asset.bytes,model.length);
      const existing = previous.resources.find(r=>r.id===entry.id && r.version===entry.version);
      const registered = plan.resources.includes(entry.resourcePath) || defaults.resources.some(r=>r.resourcePath===entry.resourcePath);
      if (existing || registered) {
        if (!registered || !isDeepStrictEqual(existing,resource) || !(await regularFile(entry.resourcePath)).equals(sidecar) ||
            !(await regularFile(entry.modelPath)).equals(model)) fail('appearance-version-conflict',key);
      } else {
        if (check) fail('appearance-unregistered',key);
        await ensureDirectory(dir,ownedDirs,true);
        await writeNew(entry.modelPath,model,ownedFiles);
        await writeNew(entry.resourcePath,sidecar,ownedFiles);
        plan.resources.push(entry.resourcePath); additions.add(key);
      }
      items.push({id:entry.id,version:entry.version,resourcePath:entry.resourcePath,sha256:entry.sha256,geometrySha256:entry.geometrySha256});
    }
    const next = await buildLibrary(plan);
    const old = {...next,resources:next.resources.filter(r=>!additions.has(r.id+'@'+r.version))};
    if (!isDeepStrictEqual(old,previous) || next.resources.length !== previous.resources.length+additions.size)
      fail('appearance-unrelated-catalog-change','Reconcile existing catalog inputs before publication');
    if (!(await regularFile(planPath)).equals(originalPlan) || !(await regularFile(catalogPath)).equals(originalCatalog) ||
        !(await regularFile(recipePath)).equals(inputBytes) || !(await regularFile(pinned)).equals(inputBytes))
      fail('appearance-input-changed','Publication inputs changed');
    await removeStage();
    if (additions.size) {
      await replaceIndex(path.join(root,planPath),json(plan));
      try {await replaceIndex(path.join(root,catalogPath),json(next));}
      catch (error) {
        try {await replaceIndex(path.join(root,planPath),originalPlan);}
        catch (rollback) {
          keepLock = true;
          throw Object.assign(Error('Catalog publication and plan restoration failed: '+rollback.message,{cause:error}),{keepCatalogLock:true});
        }
        throw error;
      }
    }
    committed = true;
    return {status:additions.size?'published':'unchanged',family,sourceParameters:pinned,sourceParametersSha256:digest,items};
  } finally {
    if (!committed && !keepLock) try {
      for (const file of ownedFiles.reverse()) await fs.unlink(file);
      for (const dir of ownedDirs.reverse()) await fs.rmdir(dir);
    } catch (error) {throw Object.assign(error,{keepCatalogLock:true});}
    if (!stagedRemoved) await removeStage();
  }
}

const [mode,recipe,...extra] = process.argv.slice(2);
try {
  if (!['--publish','--check'].includes(mode) || !recipe || extra.length)
    fail('appearance-usage','node scripts/company-platform/publish-room-appearance.mjs --publish|--check assets-source/company-.../recipe.json');
  console.log(JSON.stringify(await withCatalogWriteLock(()=>publish(recipe,mode==='--check')),null,2));
} catch (error) {console.error(JSON.stringify({code:error.code??'appearance-publication-failed',message:error.message})); process.exitCode=1;}
