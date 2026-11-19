// Produce authored shapes, issue the selected records through D02, and export their game package.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs, promisify} from 'node:util';
import {productionRoot, projectOutput} from '../project-output.cjs';
import {BATCH_CREATE_SCHEMA, productionBrowserConfig} from '../character-production-cli.cjs';
import {checkedBytes, digest, fail, jsonBytes, publishStagedDirectory} from '../runtime-package/files.mjs';
import {readGameRuntimeReview} from '../runtime-package/game-runtime-review.mjs';
import {isSafeCharacterRecordId, validateCharacterRecord} from '../../prototype/src/character-record.js';

const run = promisify(execFile);
const scripts = fileURLToPath(new URL('../', import.meta.url));
const readJson = async name => JSON.parse(await readFile(name, 'utf8'));
const descends = (base, target) => {
  const relative = path.relative(base, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

export async function withFreshDelivery(output, reserved, work) {
  const root = await productionRoot();
  const requested = path.resolve(root, output), out = await projectOutput(requested, root);
  const outputRoot = path.join(root, 'output');
  if (path.relative(out, requested) || !path.relative(outputRoot, out) || !descends(outputRoot, out) ||
      reserved.some(dir => descends(dir, out)))
    fail('outside-delivery-output', 'Choose a new directory below the production output, outside input packages');
  if (await lstat(out).catch(error => { if (error.code !== 'ENOENT') throw error; }))
    fail('output-conflict', 'Output already exists: ' + out);
  await mkdir(path.dirname(out), {recursive:true});
  const scratch = await mkdtemp(await projectOutput(path.join(path.dirname(out), '.shape-delivery-'), root));
  try {
    const product = path.join(scratch, 'result');
    await mkdir(product);
    const result = await work(scratch, product);
    await publishStagedDirectory(product, out);
    return {...result, output:out};
  } finally {
    if (await projectOutput(scratch, root) !== scratch) throw Error('Delivery staging directory was redirected');
    await rm(scratch, {recursive:true, force:true, maxRetries:3});
  }
}

function childEnvironment(scratch) {
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (['TMP','TEMP','TMPDIR','NODE_V8_COVERAGE','NODE_COMPILE_CACHE','PYTHONPYCACHEPREFIX',
         'GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR'].includes(key.toUpperCase())) delete env[key];
  }
  return Object.assign(env, {TEMP:scratch,TMP:scratch,TMPDIR:scratch, XDG_CACHE_HOME:scratch,
    CUDA_CACHE_PATH:scratch,__GL_SHADER_DISK_CACHE_PATH:scratch, PYTHONDONTWRITEBYTECODE:'1',
    NODE_DISABLE_COMPILE_CACHE:'1',GIT_OPTIONAL_LOCKS:'0'});
}

const singleFlags = ['recipe','id','name','gender'];
function checkId(id) {
  if (!isSafeCharacterRecordId(id) || ['manifest','rule-body-data'].includes(id))
    fail('invalid-identity-id', 'Invalid record ID');
}

export async function readInputs(options) {
  if (!Object.hasOwn(options,'batch')) {
    const {id,name,gender,recipe}=options;
    checkId(id);
    return {items:[{recipe,identity:{id,name,gender}}]};
  }
  const mixed = [...singleFlags,'companion','companion-pack'].filter(key=>Object.hasOwn(options,key));
  if (mixed.length) fail('batch-option-conflict','--batch cannot be combined with '+mixed.map(k=>'--'+k).join(', '));
  const file = path.resolve(options.batch), raw = await readFile(file), batch = JSON.parse(raw);
  const exact = (value,keys) => value && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
  if (!exact(batch,['schema','items']) || batch.schema!=='shape-record-delivery-batch-v1' ||
      !Array.isArray(batch.items) || batch.items.length<2 || batch.items.length>4)
    fail('invalid-shape-batch','Expected shape-record-delivery-batch-v1 with 2–4 items');
  const ids=new Set();
  const items=batch.items.map((item,index)=>{
    if (!exact(item,['recipe','identity']) || typeof item.recipe!=='string' || !item.recipe.trim() ||
        !exact(item.identity,['id','name','gender']))
      fail('invalid-shape-batch','Expected recipe and identity at item '+(index+1));
    const {id,name,gender}=item.identity;
    checkId(id);
    if (ids.has(id)) fail('duplicate-identity','Duplicate batch identity: '+id);
    if (typeof name!=='string' || !name.length || name.length>160 ||
        typeof gender!=='string' || !gender.length || gender.length>40)
      fail('invalid-shape-batch','Invalid name or gender at item '+(index+1));
    ids.add(id);
    return {recipe:path.resolve(path.dirname(file),item.recipe),identity:item.identity};
  });
  return {items,batchFileSha256:digest(raw)};
}

function childOptions(scratch) {
  return {cwd:scratch,env:childEnvironment(scratch),windowsHide:true,maxBuffer:4*1024*1024};
}

async function invoke(command,args,scratch) {
  const {stdout}=await run(command,args,childOptions(scratch));
  return JSON.parse(stdout);
}

export async function produceItems(inputs,batch,scratch,out) {
  const items=[],packs=new Map();
  if(batch)await mkdir(path.join(out,'shape-packs'));
  for(const [i,{recipe,identity}] of inputs.entries()) {
    let step='read-recipe';
    try {
      const ordinal=String(i+1);
      const folder=path.join(scratch,'model-'+ordinal), input=path.join(scratch,'recipe-'+ordinal+'.json');
      const bytes=await readFile(recipe);
      await writeFile(input,bytes,{flag:'wx'});
      step='produce-body';
      const made=await invoke('python',['-B',path.join(scripts,'production/rule_body_producer.py'),
        '--recipe',input,'--out',folder],scratch);
      const stage=path.join(batch?scratch:out,batch?'pack-'+ordinal:'shape-pack');
      step='build-shape-pack';
      const shape=await invoke('python',['-B',path.join(scripts,'production/shape_data_pack.py'),'build',
        '--recipe',input,'--candidate',path.join(folder,'body.vrm'),'--out',stage],scratch);
      assert.match(shape.indexSha256,/^[a-f0-9]{64}$/);
      assert.equal(shape.bodyType,'rule-body-'+made.bodySha256.slice(0,20));
      step='check-pack-identity';
      const item={identity,shape,recipeFileSha256:digest(bytes),bodySha256:made.bodySha256,recipeSha256:made.recipeSha256};
      const dest=batch?'shape-packs/'+shape.indexSha256:'shape-pack';
      const prior=packs.get(shape.bodyType);
      if(prior && prior!==dest)fail('ambiguous-shape','Different pack indices resolve to the same body type');
      if(batch){
        const [indexBytes,profileBytes]=await Promise.all(['index.json','profile.json'].map(file=>readFile(path.join(stage,file))));
        assert.equal(digest(indexBytes),shape.indexSha256);
        item.profileSha256=digest(profileBytes);
        assert.equal(JSON.parse(indexBytes).profile.sha256,item.profileSha256);
        const profile=JSON.parse(profileBytes);
        assert.equal(profile.id,shape.bodyType);assert.equal(profile.sha256,made.bodySha256);
        step='stage-pack-and-receipt';
        if(!prior)await publishStagedDirectory(stage,path.join(out,dest));
        const prefix='items/'+ordinal;
        const producer=await readFile(path.join(folder,'receipt.json'));
        Object.assign(item,{recipePath:prefix+'/recipe.json',producerPath:prefix+'/producer.json',producerSha256:digest(producer)});
        await mkdir(path.join(out,prefix),{recursive:true});
        await writeFile(path.join(out,item.recipePath),bytes,{flag:'wx'});
        await writeFile(path.join(out,item.producerPath),producer,{flag:'wx'});
      }
      packs.set(shape.bodyType,dest);
      items.push({...item,shapePackPath:dest});
    } catch(error) {
      if(!batch)throw error;
      fail('batch-item-failed','items['+i+'] ('+identity.id+'), '+step+': '+(error.stderr?.trim() || error.message));
    }
  }
  return {items,packArgs:[...packs.values()].flatMap(p=>['--shape-pack',path.join(out,p)])};
}

export async function deliver(options) {
  const inputs=await readInputs(options), batch=inputs.batchFileSha256!==undefined;
  if (options['companion-pack'] && !options.companion) fail('invalid-companion', '--companion-pack requires --companion');
  const browser = await productionBrowserConfig(options['browser-config']);
  const [dist, source] = await Promise.all([options.dist, options['source-root']].map(p => realpath(p)));
  const companionPack = options['companion-pack'] && await realpath(options['companion-pack']);
  const companion = options.companion && await readJson(options.companion);
  if (options.companion) {
    await validateCharacterRecord(companion, {validationCallback:() => ({status:'pending'})});
    if (companion.identity.id === inputs.items[0].identity.id) fail('duplicate-identity', 'Companion and new actor require different IDs');
  }
  const sourceBoundary = path.relative(await productionRoot(), source) ? source : path.join(source, 'prototype');
  return withFreshDelivery(options.out, [dist, sourceBoundary, ...(companionPack ? [companionPack] : [])],
    async (scratch, out) => {
      const {sourceDigest, shortId} = await readJson(path.join(dist, 'build-info.json'));
      const {reviewed} = await readGameRuntimeReview(sourceDigest, true);
      const head = await run('git', ['-C', source, 'rev-parse', 'HEAD'], childOptions(scratch));
      if (head.stdout.trim() !== reviewed.sourceCommit) fail('source-identity-mismatch', 'Checkout does not match the reviewed runtime');
      for (const [relative, row] of Object.entries(reviewed.files)) await checkedBytes(dist, {...row, path:relative});
      const {items,packArgs}=await produceItems(inputs.items,batch,scratch,out);
      const request=path.join(scratch,'create.json'), records=path.join(out,'records.json');
      const signedFile=batch?records:path.join(out,'character.json');
      const jobs=items.map(({identity,shape})=>({schema:'character-production-request-v1',operation:'create',bodyType:shape.bodyType,identity}));
      await writeFile(request,jsonBytes(batch?{schema:BATCH_CREATE_SCHEMA,requests:jobs}:jobs[0]),{flag:'wx'});
      const issued = await invoke(process.execPath, [path.join(scripts,'character-production-cli.cjs'),
        '--dist', dist, '--request', request, '--out', signedFile,...packArgs,
        ...(browser ? ['--browser-config', browser.file] : [])],scratch).catch(error=>{
          if(!batch)throw error;
          fail('batch-issue-failed','D02 batch-create: '+(error.stderr?.trim() || error.message));
        });
      if (browser) assert.deepEqual(issued.browserConfig, browser.receipt, 'D02 used a different browser configuration');
      assert.equal(issued.build, shortId);
      const signed=await readJson(signedFile), all=batch?signed:[signed];
      assert.equal(all.length,items.length);
      for(const [i,record] of all.entries()){
        const context='Issued items['+i+'] ('+items[i].identity.id+')';
        assert.deepEqual(record.identity,items[i].identity,context+' identity');
        assert.deepEqual(record.appearanceRecipe.base,{bodyType:items[i].shape.bodyType,sha256:items[i].bodySha256},context+' profile');
        if(batch)assert.equal(record.revision,1,context+' revision');
      }
      if(batch){
        assert.equal(issued.ok,true);
        assert.equal(issued.operation,'batch-create');
        assert.deepEqual(issued.items,all.map(r=>({id:r.identity.id,revision:r.revision,hash:r.integrity.recordSha256})));
      }
      else{
        assert.equal(issued.recordSha256,signed.integrity.recordSha256);
        await writeFile(records,jsonBytes(companion?[signed,companion]:[signed]),{flag:'wx'});
      }
      const inventory = path.join(out,'inventory.json');
      const gameCli = path.join(scripts, 'runtime-package/game-record-cli.mjs');
      const common = ['--dist',dist,'--source-root',source,'--records',records,...packArgs];
      if (companionPack) common.push('--shape-pack', companionPack);
      const listed = await invoke(process.execPath, [gameCli, 'inventory', ...common, '--out',inventory],scratch);
      const exported = await invoke(process.execPath, [gameCli, 'export', ...common,
        '--inventory',inventory,'--out',path.join(out,'game')],scratch);
      assert.equal(listed.inventorySha256, exported.manifestSha256);
      assert.equal(exported.runtime.sourceCommit, reviewed.sourceCommit);
      const detail=batch?{schema:'shape-record-batch-technical-delivery-v1',batchFileSha256:inputs.batchFileSha256,
        issuance:{operation:issued.operation,build:issued.build,recordsPath:'records.json',
          recordsFileSha256:digest(await readFile(records)),items:issued.items},
        items:items.map(({shape,...item},i)=>({...item,bodyType:shape.bodyType,indexSha256:shape.indexSha256,
          revision:all[i].revision,recordSha256:all[i].integrity.recordSha256}))}:
        {schema:'shape-record-technical-delivery-v1',identity:signed.identity,shapePack:items[0].shape,
         recipeFileSha256:items[0].recipeFileSha256,revision:signed.revision,recordSha256:issued.recordSha256,
         companionRecordSha256:companion?.integrity.recordSha256 ?? null};
      const receipt = {...detail,status:'technical-package-exported',
        wholeOutfitAdmission:'not-evaluated', ordinaryPCPerformance:'unmeasured',
        runtime:exported.runtime,
        ...(browser ? {browserConfig:issued.browserConfig} : {}),
        packageManifestSha256:exported.manifestSha256, gameFileCount:exported.files};
      await writeFile(path.join(out,'receipt.json'), jsonBytes(receipt), {flag:'wx'});
      return receipt;
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const required = ['dist','source-root','out'];
    const options = Object.fromEntries([...required,...singleFlags,'companion','companion-pack'].map(key => [key,{type:'string'}]));
    options.batch={type:'string',multiple:true};
    options['browser-config'] = {type:'string',multiple:true};
    const {values} = parseArgs({options});
    if(values.batch){
      if(values.batch.length!==1||!values.batch[0])throw Error('Expected one --batch FILE');
      values.batch=values.batch[0];
    }
    for (const key of values.batch? required : [...required,...singleFlags]) if (!values[key]) throw Error('Required --' + key);
    console.log(JSON.stringify(await deliver(values)));
  } catch (error) {
    console.error(JSON.stringify({ok:false, code:error.code ?? 'delivery-failed', reason:error.stderr?.trim() || error.message}));
    process.exitCode = 1;
  }
}
