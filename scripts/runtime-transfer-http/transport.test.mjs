import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
import {productionRoot, projectOutput} from '../project-output.cjs';
import {sha} from './transport.mjs';

const source = fileURLToPath(new URL('../../',import.meta.url));
const run = promisify(execFile);

async function fixture(t) {
  const checkout=await productionRoot();
  const output=await projectOutput(path.join(checkout,'output'),checkout);
  await fs.mkdir(output,{recursive:true});
  const area=await fs.mkdtemp(path.join(output,'http-transfer-test-'));
  const project=path.join(area,'project');
  const outside=path.join(area,'outside');
  const junction=path.join(project,'alias');
  t.after(async ()=>{
    assert.equal(path.relative(area,await fs.realpath(area)),'');
    assert.equal(path.dirname(area),output);
    await fs.unlink(junction).catch(error=>{if(error.code!=='ENOENT') throw error;});
    await fs.rm(area,{recursive:true});
  });
  // Exercise the real guard against a relocated standalone project. Both sides
  // of the test boundary stay under the live project's output directory.
  for (const relative of ['scripts/project-output.cjs','scripts/runtime-package/files.mjs',
    'scripts/runtime-transfer-http/transport.mjs','scripts/runtime-transfer-http/qa-browser.cjs']) {
    const target=path.join(project,relative);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(path.join(source,relative),target);
  }
  const {prepare}=await import(pathToFileURL(path.join(project,'scripts/runtime-transfer-http/transport.mjs')).href);
  await fs.mkdir(outside);
  const input=path.join(project,'package');
  await fs.mkdir(input);
  const bytes=Buffer.from('fixed runtime data '.repeat(150));
  const manifest={schema:'runtime-package-inventory-v1',runtime:{buildId:'fixture'},
    files:[{path:'sample.js',bytes:bytes.length,sha256:sha(bytes)}]};
  const manifestFile=path.join(input,'runtime-package.json');
  await fs.writeFile(manifestFile,JSON.stringify(manifest));
  await fs.writeFile(path.join(input,'sample.js'),bytes);
  return {prepare,project,outside,junction,input,bytes,manifest,manifestFile};
}

test('drive root, parent traversal and a directory junction are refused before any stage',async t=>{
  const {prepare,project,outside,junction,input}=await fixture(t);
  await fs.symlink(outside,junction,process.platform==='win32'?'junction':'dir');
  // The absent source ensures the old implementation would also do no real
  // disk writes to the drive root. A path error proves the output check ran first.
  await assert.rejects(prepare(path.join(project,'missing-input'),path.parse(project).root),{code:'outside-project'});
  await assert.rejects(prepare(input,path.join(outside,'absolute')),{code:'outside-project'});
  await assert.rejects(prepare(input,`${project}${path.sep}..${path.sep}outside${path.sep}traversal`),{code:'outside-project'});
  await assert.rejects(prepare(input,path.join(junction,'through-link')),{code:'outside-project'});
  assert.deepEqual(await fs.readdir(outside),[]);
  assert.deepEqual((await fs.readdir(project)).sort(),['alias','package','scripts']);
});

test('failed project stage keeps its receipt and retries at the original name',async t=>{
  const {prepare,project,input,bytes,manifest,manifestFile}=await fixture(t);
  const target=path.join(project,'new','encoded');
  const mismatched={...manifest,files:[{...manifest.files[0],sha256:'0'.repeat(64)}]};
  await fs.writeFile(manifestFile,JSON.stringify(mismatched));
  await assert.rejects(prepare(input,target),{code:'modified-dependency'});
  const [stage]=await fs.readdir(path.dirname(target));
  assert.match(stage,/^encoded\.stage-/);
  const failure=JSON.parse(await fs.readFile(path.join(path.dirname(target),stage,'FAILED.json')));
  assert.equal(failure.status,'failed');
  assert.match(failure.reason,/Dependency identity differs/);

  await fs.writeFile(manifestFile,JSON.stringify(manifest));
  const result=await prepare(input,target);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target,'http-coding.json'))),result);
  const row=result.files.find(entry=>entry.path==='sample.js');
  for (const [coding,decode] of [['gzip',gunzipSync],['br',brotliDecompressSync]]) {
    assert.equal(row.encodings[coding].retained,true);
    assert.deepEqual(decode(await fs.readFile(path.join(target,row.encodings[coding].path))),bytes);
  }
  assert.deepEqual((await fs.readdir(path.dirname(target))).sort(),['encoded',stage]);
  await assert.rejects(prepare(input,target),/Output already exists/);
});

test('a stage owned by another invocation receives no failure receipt',async t=>{
  const {prepare,project,input}=await fixture(t);
  const target=path.join(project,'result');
  const mkdir=fs.mkdir;
  let occupied;
  t.mock.method(fs,'mkdir',async (output,options)=>{
    if (output.startsWith(target+'.stage-')) {
      occupied=output;
      await mkdir(occupied);
    }
    return mkdir(output,options);
  });
  await assert.rejects(prepare(input,target),{code:'EEXIST'});
  assert.ok(occupied);
  assert.deepEqual(await fs.readdir(occupied),[]);
});

test('a failed stage redirected through a junction receives no external receipt',async t=>{
  const {prepare,project,outside,input}=await fixture(t);
  const target=path.join(project,'result');
  const writeFile=fs.writeFile;
  let redirected;
  t.mock.method(fs,'writeFile',async (file,...args)=>{
    if (path.basename(file)==='http-coding.json') {
      const stage=path.dirname(file);
      await fs.rename(stage,stage+'.saved');
      await fs.symlink(outside,stage,process.platform==='win32'?'junction':'dir');
      redirected=stage;
      throw Error('Injected report failure');
    }
    return writeFile(file,...args);
  });
  try {
    await assert.rejects(prepare(input,target),/Injected report failure/);
    assert.ok(redirected);
    assert.deepEqual(await fs.readdir(outside),[]);
  } finally {
    if (redirected) await fs.unlink(redirected);
  }
});

test('browser CLI rejects outside paths before evidence and reaches package reads for a valid output',async t=>{
  const {project,outside,junction,input}=await fixture(t);
  await fs.symlink(outside,junction,process.platform==='win32'?'junction':'dir');
  const script=path.join(project,'scripts/runtime-transfer-http/qa-browser.cjs');
  const cli=out=>run(process.execPath,[script,input,path.join(project,'coded'),'male',out],{cwd:outside});
  for (const out of [path.parse(project).root,path.join(outside,'evidence'),
    `${project}${path.sep}..${path.sep}outside${path.sep}traversal`,path.join(junction,'evidence')]) {
    await assert.rejects(cli(out), error=>error.code===1&&/outside-project/.test(error.stderr));
  }
  assert.deepEqual(await fs.readdir(outside),[]);
  assert.deepEqual((await fs.readdir(project)).sort(),['alias','package','scripts']);

  await fs.writeFile(path.join(input,'selected-appearance.recipe.json'),'{}');
  const out=path.join(project,'evidence');
  await assert.rejects(cli(out), error=>error.code===1&&/ENOENT.*material-selections\.json/.test(error.stderr));
  assert.deepEqual((await fs.readdir(out)).sort(),['executed-script.cjs','executed-transport.mjs']);
  assert.deepEqual(await fs.readFile(path.join(out,'executed-script.cjs')),await fs.readFile(script));
});

test('summary CLI refuses a redirected fixed output before reading reports',async t=>{
  const {project,outside}=await fixture(t);
  await run('git',['init','--quiet',project]);
  for (const relative of ['scripts/runtime-transfer-http/summarize.py','scripts/production/production_paths.py']) {
    const file=path.join(project,relative);
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.copyFile(path.join(source,relative),file);
  }
  const evidence=path.join(project,'evidence');
  await fs.mkdir(evidence);
  const linked=path.join(evidence,'m2-http-transport-801-v1');
  await fs.symlink(outside,linked,process.platform==='win32'?'junction':'dir');
  try {
    await assert.rejects(run('python',['-B',path.join(project,'scripts/runtime-transfer-http/summarize.py')],{cwd:outside}),
      error=>error.code===1&&/Output must be inside the production tool main checkout/.test(error.stderr));
    assert.deepEqual(await fs.readdir(outside),[]);
  } finally {
    await fs.unlink(linked);
  }
});
