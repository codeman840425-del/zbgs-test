import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual,promisify} from 'node:util';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

const root = fileURLToPath(new URL('../../',import.meta.url));
const sourceRoot = 'assets-source/company-wall-prints-v1';
const collectionPath = `${sourceRoot}/collection.json`;
const runtimeRoot = 'prototype/public/company-assets/wall-prints-v1';
const toolsRoot = 'scripts/company-platform';
const planPath = `${toolsRoot}/library-inputs.json`;
const generatorName = 'wall-print-model.mjs';
const exec = promisify(execFile);
const portableName = /^(?!con(?:\.|$)|prn(?:\.|$)|aux(?:\.|$)|nul(?:\.|$)|com[1-9](?:\.|$)|lpt[1-9](?:\.|$))[^/\\:*?"<>|\x00-\x1f]+(?<![. ])$/i;
const idPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2) + '\n');
const fail = (code,location,message) => {throw Object.assign(new Error(message),{code,path:location});};

async function existing(file) {
  try {return await fs.lstat(file);}
  catch (error) {if (error.code === 'ENOENT') return null; throw error;}
}

async function normalFile(file) {
  const info = await existing(file);
  if (!info?.isFile() || info.isSymbolicLink()) fail('invalid-wall-print-file',file,'Expected an ordinary file');
  return fs.readFile(file);
}

function parseJson(bytes, location) {
  try {return JSON.parse(bytes.toString('utf8'));}
  catch (error) {fail('invalid-wall-print-json',location,error.message);}
}

async function readRecipe(file) {
  const recipeBytes = await normalFile(file);
  const recipe = parseJson(recipeBytes,file);
  const required = ['id','version','displayName','image','license'];
  if (!recipe || Array.isArray(recipe) || Object.keys(recipe).length !== required.length || !required.every(key => Object.hasOwn(recipe,key)))
    fail('invalid-wall-print-recipe',file,'Expected id, version, displayName, image and license');
  if (typeof recipe.id !== 'string' || !idPattern.test(recipe.id) || !portableName.test(recipe.id) ||
    !Number.isSafeInteger(recipe.version) || recipe.version < 1 ||
    ![recipe.displayName,recipe.license].every(value => typeof value === 'string' && value.trim().length > 0))
    fail('invalid-wall-print-recipe',file,'Use a portable lowercase ID, positive integer version, display name and license');
  if (typeof recipe.image !== 'string' || !portableName.test(recipe.image) || path.extname(recipe.image).toLowerCase() !== '.png')
    fail('invalid-wall-print-image-path',file,'Image must be an ordinary PNG filename in the recipe directory');
  const sourceImage = path.join(path.dirname(file),recipe.image);
  return {recipe,recipeBytes,pngBytes:await normalFile(sourceImage)};
}

// Only create known paths below this workspace. Existing links or junctions
// must not redirect writes or the later cleanup of newly owned directories.
async function ensureDirectories(relative, owned) {
  let current = root;
  for (const piece of relative.split('/')) {
    current = path.join(current,piece);
    const present = await existing(current);
    if (present) {
      if (!present.isDirectory() || present.isSymbolicLink())
        fail('invalid-wall-print-directory',current,'Expected an ordinary workspace directory');
    } else {
      await fs.mkdir(current);
      owned.push(current);
    }
  }
}

async function writeNew(file, bytes, ownedFiles) {
  const handle = await fs.open(file,'wx');
  ownedFiles?.push(file);
  try {await handle.writeFile(bytes); await handle.sync();}
  finally {await handle.close();}
}

async function replaceIndex(file, bytes) {
  const directory = await fs.mkdtemp(path.join(path.dirname(file),'.wall-print-index-'));
  const candidate = path.join(directory,'next.json');
  try {
    await writeNew(candidate,bytes);
    await fs.rename(candidate,file);
  } finally {
    await fs.rm(candidate,{force:true});
    await fs.rmdir(directory);
  }
}

async function removeStage(stage) {
  const resolved = await fs.realpath(stage);
  if (path.relative(root,resolved).includes(path.sep) || !path.basename(resolved).startsWith('.wall-print-build-') || path.dirname(resolved) !== path.resolve(root))
    fail('unsafe-wall-print-cleanup',stage,'Refuse cleanup outside the private catalog staging directory');
  await fs.rm(resolved,{recursive:true,force:true});
}

async function buildCatalog(plan, collectionBytes) {
  const stage = await fs.mkdtemp(path.join(root,'.wall-print-build-'));
  try {
    // The normal catalog builder reads live source/asset bytes. Its output and
    // the proposed registry stay inside staging until full validation succeeds.
    for (const name of ['prototype','assets-source','docs']) {
      const source = path.join(root,name);
      if (await existing(source)) await fs.symlink(source,path.join(stage,name),process.platform === 'win32' ? 'junction' : 'dir');
    }
    const stageTools = path.join(stage,toolsRoot);
    await fs.mkdir(stageTools,{recursive:true});
    for (const name of ['build-library.mjs','preflight-library-assets.mjs','validate-resource-provenance.mjs'])
      await fs.copyFile(path.join(root,toolsRoot,name),path.join(stageTools,name));
    for (const entry of await fs.readdir(path.join(root,toolsRoot),{withFileTypes:true})) {
      if (['build-library.mjs','preflight-library-assets.mjs','validate-resource-provenance.mjs','library-inputs.json'].includes(entry.name)) continue;
      const from = path.join(root,toolsRoot,entry.name), to = path.join(stageTools,entry.name);
      if (entry.isFile()) await fs.link(from,to);
      else if (entry.isDirectory()) await fs.symlink(from,to,process.platform === 'win32' ? 'junction' : 'dir');
    }
    const stagePlan = {...plan,collections:plan.collections.map(name => name === collectionPath ? 'candidate-collection.json' : name),output:'candidate-catalog.json'};
    await writeNew(path.join(stage,'candidate-collection.json'),collectionBytes);
    await writeNew(path.join(stage,planPath),jsonBytes(stagePlan));
    try {await exec(process.execPath,[path.join(stageTools,'build-library.mjs')],{cwd:stage});}
    catch (error) {fail('wall-print-catalog-build-failed',plan.output,(error.stderr || error.message).trim());}
    return await normalFile(path.join(stage,stagePlan.output));
  } finally {await removeStage(stage);}
}

function publishedPaths(recipe) {
  const version = `${recipe.id}/v${recipe.version}`;
  const sourceDirectory = `${sourceRoot}/${version}`;
  const runtimeDirectory = `${runtimeRoot}/${version}`;
  return {sourceDirectory,runtimeDirectory,
    sourcePath:`${sourceDirectory}/recipe.json`,sourceImage:`${sourceDirectory}/${recipe.image}`,generator:`${sourceDirectory}/${generatorName}`,
    resourcePath:`${runtimeDirectory}/resource.json`,modelPath:`${runtimeDirectory}/model.glb`,assetUrl:`/company-assets/wall-prints-v1/${version}/model.glb`};
}

async function exportModel(generator, pngBytes) {
  const {buildWallPrintModel} = await import(pathToFileURL(path.join(root,generator)).href);
  const model = await buildWallPrintModel(pngBytes);
  if (!(model.bytes instanceof Uint8Array) || ![model.widthPixels,model.heightPixels].every(n => Number.isSafeInteger(n) && n > 0))
    fail('invalid-wall-print-generator',generator,'Expected GLB bytes and positive integer pixel dimensions');
  return model;
}

async function compareRegistered(entry,paths,input,catalog) {
  for (const location of [paths.sourceDirectory,paths.runtimeDirectory]) {
    const directory = path.join(root,location);
    if ((await fs.realpath(directory)) !== path.resolve(directory))
      fail('invalid-wall-print-directory',location,'The registered version must use its ordinary workspace path');
  }
  const resource = parseJson(await normalFile(path.join(root,paths.resourcePath)),paths.resourcePath);
  const {provenance} = resource;
  if (provenance?.sourceParametersSha256 !== hash(input.recipeBytes) || provenance?.sourceImageSha256 !== hash(input.pngBytes))
    fail('wall-print-version-conflict',paths.resourcePath,'This ID and version are already pinned to different recipe or PNG bytes');
  for (const [location,expected] of [[paths.sourcePath,provenance.sourceParametersSha256],[paths.sourceImage,provenance.sourceImageSha256],
    [paths.generator,provenance.generatorSha256],[paths.modelPath,entry.sha256]]) {
    if (hash(await normalFile(path.join(root,location))) !== expected)
      fail('wall-print-pin-mismatch',location,'Registered files differ from their pinned bytes');
  }
  const registered = catalog.resources.find(item => item.id === input.recipe.id && item.version === input.recipe.version);
  if (!isDeepStrictEqual(registered,resource) || !resource.asset || entry.sha256 !== resource.asset.sha256 ||
    entry.resourcePath !== paths.resourcePath || entry.modelPath !== paths.modelPath ||
    entry.sourcePath !== paths.sourcePath || entry.sourceImage !== paths.sourceImage || entry.bytes !== resource.asset.bytes ||
    entry.sourceImageSha256 !== provenance.sourceImageSha256 || provenance.sourceParameters !== paths.sourcePath ||
    provenance.sourceImage !== paths.sourceImage || provenance.generator !== paths.generator || resource.asset.url !== paths.assetUrl)
    fail('wall-print-index-mismatch',paths.resourcePath,'The collection, sidecar and catalog must agree');
  const reproduced = await exportModel(paths.generator,input.pngBytes);
  if (hash(reproduced.bytes) !== resource.asset.sha256)
    fail('wall-print-rebuild-mismatch',paths.modelPath,'The stored generator and source PNG reproduce different GLB bytes');
  return {ok:true,status:'unchanged',id:resource.id,version:resource.version,resourcePath:paths.resourcePath,sha256:resource.asset.sha256};
}

export async function importWallPrint(recipeFile) {
  const input = await readRecipe(path.resolve(recipeFile));
  const {recipe,recipeBytes,pngBytes} = input;
  const paths = publishedPaths(recipe);
  const lockFile = path.join(root,sourceRoot,'.wall-print-ingress.lock');
  const sourceDirectory = path.join(root,sourceRoot);
  if ((await fs.realpath(sourceDirectory)) !== path.resolve(sourceDirectory))
    fail('invalid-wall-print-directory',sourceDirectory,'The collection must use its ordinary workspace path');
  let lock;
  try {lock = await fs.open(lockFile,'wx');}
  catch (error) {
    if (error.code === 'EEXIST') fail('wall-print-import-busy',collectionPath,'Another active or interrupted wall print import holds the collection lock');
    throw error;
  }
  const ownedDirectories = [], ownedFiles = [];
  let committed = false;
  try {
    const sourceIndex = path.join(root,collectionPath);
    const oldCollection = await normalFile(sourceIndex);
    const collection = parseJson(oldCollection,collectionPath);
    const originalPlan = await normalFile(path.join(root,planPath));
    const plan = parseJson(originalPlan,planPath);
    if (!Array.isArray(collection?.resources) || plan.output !== 'prototype/src/company/library-catalog.json' ||
      plan.collections?.filter(name => name === collectionPath).length !== 1)
      fail('invalid-wall-print-registration',collectionPath,'Expected one wall print collection in the standard catalog plan');
    const catalogFile = path.join(root,plan.output);
    const oldCatalog = await normalFile(catalogFile);
    const catalog = parseJson(oldCatalog,plan.output);
    const priorVersions = collection.resources.filter(entry => entry.id === recipe.id);
    const existingVersion = priorVersions.find(entry => entry.version === recipe.version);
    if (existingVersion) return await compareRegistered(existingVersion,paths,input,catalog);
    if (catalog.resources.some(resource => resource.id.toLowerCase() === recipe.id &&
      !priorVersions.some(entry => entry.version === resource.version && resource.asset?.url.startsWith('/company-assets/wall-prints-v1/'))))
      fail('wall-print-id-conflict',recipe.id,'This ID belongs to another registered resource family');
    for (const relative of [paths.sourceDirectory,paths.runtimeDirectory]) {
      if (await existing(path.join(root,relative))) fail('wall-print-version-conflict',relative,'This version directory already exists');
      await ensureDirectories(relative,ownedDirectories);
    }
    const writeOwned = (relative,bytes) => writeNew(path.join(root,relative),bytes,ownedFiles);
    const generatorBytes = await normalFile(path.join(root,toolsRoot,generatorName));
    await writeOwned(paths.sourcePath,recipeBytes);
    await writeOwned(paths.sourceImage,pngBytes);
    await writeOwned(paths.generator,generatorBytes);
    const model = await exportModel(paths.generator,pngBytes);
    const reference = catalog.resources.find(item => item.id === 'wall-art-triptych' && item.version === 1);
    if (reference?.mount !== 'wall' || reference.mountRole !== 'wall-art')
      fail('wall-print-reference-missing','wall-art-triptych@1','Expected the registered wall-art functional resource');
    const sourceImageSha256 = hash(pngBytes), sha256 = hash(model.bytes);
    const resource = {...structuredClone(reference),id:recipe.id,version:recipe.version,displayName:recipe.displayName,designId:recipe.id,
      asset:{format:'glb',url:paths.assetUrl,bytes:model.bytes.byteLength,sha256},
      materialSlots:{finish:['wall-print-frame','wall-print-mat']},
      provenance:{license:recipe.license,sourceParameters:paths.sourcePath,sourceParametersSha256:hash(recipeBytes),
        sourceImage:paths.sourceImage,sourceImageSha256,sourceImageDimensions:{width:model.widthPixels,height:model.heightPixels},
        generator:paths.generator,generatorSha256:hash(generatorBytes),reference:'wall-art-triptych@1',classification:'image-import'}};
    if (!compareFacilityFunction(reference,resource).compatible)
      fail('wall-print-incompatible-resource',paths.resourcePath,'The new appearance must preserve the fixed wall-art function');
    await writeOwned(paths.modelPath,model.bytes);
    await writeOwned(paths.resourcePath,jsonBytes(resource));
    collection.resources.push({id:recipe.id,version:recipe.version,resourcePath:paths.resourcePath,modelPath:paths.modelPath,
      sourcePath:paths.sourcePath,sourceImage:paths.sourceImage,sourceImageSha256,sha256,bytes:model.bytes.byteLength});
    const nextCollection = jsonBytes(collection);
    const nextCatalog = await buildCatalog(plan,nextCollection);
    const {resources,...rebuiltHeader} = parseJson(nextCatalog,plan.output);
    const {resources:oldResources,...catalogHeader} = catalog;
    const additions = resources.filter(item => item.id === recipe.id && item.version === recipe.version);
    const retained = resources.filter(item => item.id !== recipe.id || item.version !== recipe.version);
    if (!isDeepStrictEqual(additions,[resource]) || !isDeepStrictEqual(retained,oldResources) || !isDeepStrictEqual(rebuiltHeader,catalogHeader))
      fail('wall-print-catalog-unrelated-change',plan.output,'Catalog build must preserve every existing resource and add exactly this appearance');
    if (!(await normalFile(sourceIndex)).equals(oldCollection) || !(await normalFile(catalogFile)).equals(oldCatalog) ||
      !(await normalFile(path.join(root,planPath))).equals(originalPlan))
      fail('wall-print-registration-changed',collectionPath,'The existing registry or catalog changed during the build');
    await replaceIndex(sourceIndex,nextCollection);
    try {await replaceIndex(catalogFile,nextCatalog);}
    catch (error) {await replaceIndex(sourceIndex,oldCollection); throw error;}
    committed = true;
    return {ok:true,status:'registered',id:recipe.id,version:recipe.version,resourcePath:paths.resourcePath,sha256};
  } finally {
    try {
      if (!committed) {
        for (const file of ownedFiles.reverse()) await fs.rm(file,{force:true});
        for (const directory of ownedDirectories.reverse()) await fs.rmdir(directory);
      }
    } finally {await lock.close(); await fs.rm(lockFile,{force:true});}
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const run = async () => {
    if (args.length !== 1) fail('wall-print-usage','arguments','Usage: node scripts/company-platform/import-wall-print.mjs RECIPE.json');
    console.log(JSON.stringify(await importWallPrint(args[0]),null,2));
  };
  run().catch(error => {
    console.error(JSON.stringify({ok:false,code:error.code || 'wall-print-import-failed',path:error.path,message:error.message},null,2));
    process.exitCode = 1;
  });
}
