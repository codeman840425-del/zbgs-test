// Produce one authored shape, issue it through D02, and export its ordinary game package.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs, promisify} from 'node:util';
import {productionRoot, projectOutput} from '../project-output.cjs';
import {productionBrowserConfig} from '../character-production-cli.cjs';
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

export async function deliver(options) {
  const {id, name, gender} = options;
  if (!isSafeCharacterRecordId(id) || ['manifest','rule-body-data'].includes(id)) fail('invalid-identity-id', 'Invalid record ID');
  if (options['companion-pack'] && !options.companion) fail('invalid-companion', '--companion-pack requires --companion');
  const browser = await productionBrowserConfig(options['browser-config']);
  const [dist, source, recipe] = await Promise.all([options.dist, options['source-root'], options.recipe].map(p => realpath(p)));
  const companionPack = options['companion-pack'] && await realpath(options['companion-pack']);
  const companion = options.companion && await readJson(options.companion);
  if (options.companion) {
    await validateCharacterRecord(companion, {validationCallback:() => ({status:'pending'})});
    if (companion.identity.id === id) fail('duplicate-identity', 'Companion and new actor require different IDs');
  }
  const sourceBoundary = path.relative(await productionRoot(), source) ? source : path.join(source, 'prototype');
  return withFreshDelivery(options.out, [dist, sourceBoundary, ...(companionPack ? [companionPack] : [])],
    async (scratch, out) => {
      const execution = {cwd:scratch, env:childEnvironment(scratch), windowsHide:true, maxBuffer:4*1024*1024};
      async function invoke(command, args) {
        const {stdout} = await run(command, args, execution);
        return JSON.parse(stdout);
      }
      const {sourceDigest, shortId} = await readJson(path.join(dist, 'build-info.json'));
      const {reviewed} = await readGameRuntimeReview(sourceDigest, true);
      const head = await run('git', ['-C', source, 'rev-parse', 'HEAD'], execution);
      if (head.stdout.trim() !== reviewed.sourceCommit) fail('source-identity-mismatch', 'Checkout does not match the reviewed runtime');
      for (const [relative, row] of Object.entries(reviewed.files)) await checkedBytes(dist, {...row, path:relative});
      const input = path.join(scratch, 'recipe.json');
      await writeFile(input, await readFile(recipe), {flag:'wx'});
      const model = path.join(scratch, 'model'), dataPack = path.join(out, 'shape-pack');
      await invoke('python', ['-B', path.join(scripts,'production/rule_body_producer.py'),
        '--recipe', input, '--out', model]);
      const shape = await invoke('python', ['-B', path.join(scripts,'production/shape_data_pack.py'), 'build',
        '--recipe', input, '--candidate', path.join(model,'body.vrm'), '--out', dataPack]);
      const request = path.join(scratch, 'create.json'), character = path.join(out, 'character.json');
      const identity = {id, name, gender};
      await writeFile(request, jsonBytes({schema:'character-production-request-v1', operation:'create',
        bodyType:shape.bodyType, identity}), {flag:'wx'});
      const issued = await invoke(process.execPath, [path.join(scripts,'character-production-cli.cjs'),
        '--dist', dist, '--request', request, '--out', character, '--shape-pack', dataPack,
        ...(browser ? ['--browser-config', browser.file] : [])]);
      if (browser) assert.deepEqual(issued.browserConfig, browser.receipt, 'D02 used a different browser configuration');
      const record = await readJson(character);
      assert.deepEqual(record.identity, identity);
      assert.equal(record.appearanceRecipe.base.bodyType, shape.bodyType);
      assert.equal(issued.recordSha256, record.integrity.recordSha256);
      assert.equal(issued.build, shortId);
      const records = path.join(out, 'records.json'), inventory = path.join(out, 'inventory.json');
      await writeFile(records, jsonBytes(companion ? [record, companion] : [record]), {flag:'wx'});
      const gameCli = path.join(scripts, 'runtime-package/game-record-cli.mjs');
      const common = ['--dist',dist,'--source-root',source,'--records',records,'--shape-pack',dataPack];
      if (companionPack) common.push('--shape-pack', companionPack);
      const listed = await invoke(process.execPath, [gameCli, 'inventory', ...common, '--out',inventory]);
      const exported = await invoke(process.execPath, [gameCli, 'export', ...common,
        '--inventory',inventory,'--out',path.join(out,'game')]);
      assert.equal(listed.inventorySha256, exported.manifestSha256);
      assert.equal(exported.runtime.sourceCommit, reviewed.sourceCommit);
      const receipt = {schema:'shape-record-technical-delivery-v1', status:'technical-package-exported',
        wholeOutfitAdmission:'not-evaluated', ordinaryPCPerformance:'unmeasured',
        runtime:exported.runtime, shapePack:shape, recipeFileSha256:digest(await readFile(input)),
        identity, revision:record.revision, recordSha256:issued.recordSha256,
        ...(browser ? {browserConfig:issued.browserConfig} : {}),
        companionRecordSha256:companion?.integrity.recordSha256 ?? null,
        packageManifestSha256:exported.manifestSha256, gameFileCount:exported.files};
      await writeFile(path.join(out,'receipt.json'), jsonBytes(receipt), {flag:'wx'});
      return receipt;
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const required = ['recipe','id','name','gender','dist','source-root','out'];
    const options = Object.fromEntries([...required,'companion','companion-pack'].map(key => [key,{type:'string'}]));
    options['browser-config'] = {type:'string',multiple:true};
    const {values} = parseArgs({options});
    for (const key of required) if (!values[key]) throw Error('Required --' + key);
    console.log(JSON.stringify(await deliver(values)));
  } catch (error) {
    console.error(JSON.stringify({ok:false, code:error.code ?? 'delivery-failed', reason:error.stderr?.trim() || error.message}));
    process.exitCode = 1;
  }
}
