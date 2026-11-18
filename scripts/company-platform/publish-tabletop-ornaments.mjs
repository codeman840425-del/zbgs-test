import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {buildTabletopOrnament} from './adapt-tabletop-ornament.mjs';
import {buildLibrary,planPath,replaceIndex,withCatalogWriteLock} from './build-library.mjs';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

const root = path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const family = 'assets-source/company-sourced-ornaments-v1';
const collectionPath = family + '/collection.json';
const catalogPath = 'prototype/src/company/library-catalog.json';
const generator = 'scripts/company-platform/adapt-tabletop-ornament.mjs';
const contract = 'docs/COMPANY-SUPPORT-SURFACE-CONTRACT-v1.txt';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const parse = bytes => JSON.parse(bytes.toString('utf8'));
const fail = (code,message) => {throw Object.assign(Error(message),{code});};
const relative = absolute => path.relative(root,absolute).split(path.sep).join('/');
async function read(name) {
  const file = path.resolve(root,name);
  if (await fs.realpath(file) !== file || !(await fs.lstat(file)).isFile())
    fail('invalid-ornament-file',name);
  return fs.readFile(file);
}

async function candidate(file, base, shared, catalog, collection) {
  const name = relative(path.resolve(file));
  if (!name.startsWith(family+'/') || !/^[a-zA-Z0-9_./-]+\.json$/.test(name))
    fail('invalid-ornament-recipe','Place the editable recipe inside '+family);
  const recipeBytes = await read(name), input = parse(recipeBytes);
  const sourcePath = input.source?.path;
  if (typeof sourcePath !== 'string' || !/^assets-source\/company-[a-z0-9-]+\//.test(sourcePath) ||
      sourcePath.split('/').some(piece=>!piece || piece==='.' || piece==='..') || sourcePath.includes('\\'))
    fail('invalid-ornament-source','Expected a project-relative production source inside assets-source/company-*');
  const actualSource = path.join(root,sourcePath);
  if (await fs.realpath(actualSource)!==actualSource || !(await fs.lstat(actualSource)).isFile())
    fail('invalid-ornament-source',sourcePath);
  const {id,version,displayName} = input.resource ?? {};
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(id??'') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id) ||
      !Number.isSafeInteger(version) || version < 1 || typeof displayName !== 'string' || !displayName.trim())
    fail('invalid-ornament-identity',name);
  const familyEntries=catalog.resources.filter(r=>r.id.toLowerCase()===id);
  if(familyEntries.some(r=>!collection.resources.includes(relative(path.join(root,'prototype/public',path.dirname(r.asset?.url??''),'resource.json')))))
    fail('ornament-id-conflict',id);
  const existing=familyEntries.find(r=>r.version===version);
  let build=buildTabletopOrnament;
  if(existing) {
    const pin=existing.provenance.generatorSha256;
    const saved=family+'/producer-'+pin+'.mjs';
    if(!/^[a-f0-9]{64}$/.test(pin) || existing.provenance.generator!==saved || hash(await read(saved))!==pin)
      fail('ornament-generator-mismatch',id);
    shared={...shared,generator:saved,generatorSha256:pin};
    build=(await import(pathToFileURL(path.join(root,saved)).href)).buildTabletopOrnament;
  }
  const built = await build(path.join(root,name));
  if (!isDeepStrictEqual(built.recipe,input) || built.report.recipeSha256!==hash(recipeBytes) ||
      built.report.sourceFileSha256!==input.source.sha256) fail('ornament-input-changed',name);
  const url = `/company-assets/sourced-ornaments-v1/${id}/v${version}`, directory = 'prototype/public'+url;
  const model = Buffer.from(built.bytes);
  const resource = {...structuredClone(base),id,version,displayName,
    asset:{format:'glb',url:url+'/model.glb',bytes:model.length,sha256:hash(model)},
    provenance:{...shared,sourceParameters:name,sourceParametersSha256:hash(recipeBytes),sourceArtifactPath:sourcePath,
      sourceArtifactSha256:input.source.sha256,sourceModelEntry:input.source.archiveEntry??null,
      sourceGlbSha256:built.report.sourceGlbSha256,license:input.source.license,author:input.source.author,
      sourceUrl:input.source.url,reference:'tabletop-ornament-vase@1'}};
  if (!compareFacilityFunction(base,resource).compatible) fail('ornament-function-mismatch',id);
  return {key:id+'@'+version,resource,directory,path:directory+'/resource.json',model};
}

async function exclusiveDirectory(relativePath, owned) {
  let current=root;
  for (const piece of relativePath.split('/')) {
    current=path.join(current,piece);
    try {await fs.mkdir(current);owned.push(current);}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      if(current===path.join(root,relativePath) || (await fs.realpath(current))!==current || !(await fs.lstat(current)).isDirectory())
        fail('ornament-output-conflict',relative(current));
    }
  }
}

async function publish(files,check) {
  const [registryBytes,catalogBytes,planBytes,genBytes,contractBytes]=await Promise.all(
    [collectionPath,catalogPath,planPath,generator,contract].map(read));
  const collection=parse(registryBytes), previous=parse(catalogBytes), plan=parse(planBytes);
  if (plan.output!==catalogPath || plan.collections.filter(p=>p===collectionPath).length!==1 ||
      collection.schema!=='company-sourced-ornaments-v1' || !Array.isArray(collection.resources))
    fail('invalid-ornament-collection',collectionPath);
  const template=previous.resources.find(r=>r.id==='tabletop-ornament-vase' && r.version===1);
  if (template?.mountRole!=='tabletop-ornament' || template.mount!=='support-surface') fail('missing-ornament-template',catalogPath);
  const generatorSha256=hash(genBytes);
  const shared={generator:family+'/producer-'+generatorSha256+'.mjs',generatorSha256,functionalContractSource:contract,functionalContractSourceSha256:hash(contractBytes)};
  const items=[], additions=[], keys=new Set();
  for (const file of files) {
    const item=await candidate(file,template,shared,previous,collection);
    if(keys.has(item.key))fail('duplicate-ornament-input',item.key);
    keys.add(item.key);items.push(item);
    const familyEntries=previous.resources.filter(r=>r.id.toLowerCase()===item.resource.id);
    const exists=familyEntries.find(r=>r.version===item.resource.version);
    if(exists || collection.resources.includes(item.path)) {
      if (!collection.resources.includes(item.path) || !isDeepStrictEqual(exists,item.resource) ||
          !(await read(item.path)).equals(json(item.resource)) || !(await read(item.directory+'/model.glb')).equals(item.model))
        fail('ornament-version-conflict',item.key+' differs from its registered version');
    } else {
      if(check)fail('ornament-unregistered',item.key);
      additions.push(item);
    }
  }
  const ownedDirectories=[],ownedFiles=[];
  let keepFiles=false;
  try {
    if(additions.length) {
      const snapshot=path.join(root,shared.generator);
      try {
        const previous=await read(shared.generator);
        if(!previous.equals(genBytes))fail('ornament-generator-mismatch',shared.generator);
      }catch(error){
        if(error.code!=='ENOENT')throw error;
        const handle=await fs.open(snapshot,'wx');
        ownedFiles.push(snapshot);
        try {await handle.writeFile(genBytes);await handle.sync();} finally {await handle.close();}
      }
    }
    for (const item of additions) {
      await exclusiveDirectory(item.directory,ownedDirectories);
      for (const [name,bytes] of [['model.glb',item.model],['resource.json',json(item.resource)]]) {
        const file=path.join(root,item.directory,name),handle=await fs.open(file,'wx');
        ownedFiles.push(file);
        try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
      }
      collection.resources.push(item.path);
    }
    const next=await buildLibrary(plan,new Map([[collectionPath,collection]]));
    const newKeys=new Set(additions.map(i=>i.key));
    const existing={...next,resources:next.resources.filter(r=>!newKeys.has(r.id+'@'+r.version))};
    if(!isDeepStrictEqual(existing,previous) || next.resources.length!==previous.resources.length+newKeys.size)
      fail('ornament-unrelated-catalog-change','Reconcile other catalog edits before publication');
    if (!(await read(collectionPath)).equals(registryBytes) || !(await read(catalogPath)).equals(catalogBytes) || !(await read(planPath)).equals(planBytes))
      fail('ornament-index-changed','An index changed during admission');
    if(additions.length) {
      await replaceIndex(path.join(root,collectionPath),json(collection));
      try {await replaceIndex(path.join(root,catalogPath),json(next));}
      catch(error) {
        try {await replaceIndex(path.join(root,collectionPath),registryBytes);}
        catch(rollback) {
          keepFiles=true;
          throw Object.assign(Error('Registry recovery required: '+rollback.message,{cause:error}),{keepCatalogLock:true});
        }
        throw error;
      }
    }
    keepFiles=true;
    return {status:additions.length?'published':'unchanged',items:items.map(i=>({key:i.key,path:i.path,sha256:i.resource.asset.sha256}))};
  } finally {
    if(!keepFiles)try {
      for(const file of ownedFiles.reverse())await fs.unlink(file);
      for(const dir of ownedDirectories.reverse())await fs.rmdir(dir);
    } catch(error) {throw Object.assign(error,{keepCatalogLock:true});}
  }
}

const [mode,...files]=process.argv.slice(2);
try {
  if(!['--publish','--check'].includes(mode)||!files.length)throw Error('Usage: publish-tabletop-ornaments.mjs --publish|--check RECIPE.json [...]');
  console.log(JSON.stringify(await withCatalogWriteLock(()=>publish(files,mode==='--check')),null,2));
}catch(error){console.error(JSON.stringify({code:error.code??'ornament-publication-failed',message:error.message}));process.exitCode=1;}
