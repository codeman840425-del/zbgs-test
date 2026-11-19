import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkManagedOutput } from './package-company.mjs';

const source = fileURLToPath(new URL('package-company.mjs', import.meta.url));
const output = fileURLToPath(new URL('../../output/', import.meta.url));
await fs.mkdir(output, { recursive: true });
const scratch = await fs.mkdtemp(path.join(await fs.realpath(output), 'package-location-'));

async function producer(checkout) {
  const dir = path.join(checkout, 'scripts', 'company-platform');
  await fs.mkdir(dir, { recursive: true });
  const copy = path.join(dir, 'package-company.mjs');
  await fs.copyFile(source, copy);
  await fs.mkdir(path.join(dir, 'package-template'), { recursive: true });
  for (const name of ['training-room.mjs', 'vocal-origin.mjs']) {
    const template = path.join('package-template', name);
    await fs.copyFile(path.join(path.dirname(source), template), path.join(dir, template));
  }
  return (await import(pathToFileURL(copy).href)).packageCompany;
}

try {
  // All copies under local output inherit the real workspace's folder policy.
  const checkout = fileURLToPath(new URL('../../', import.meta.url));
  const parent = path.dirname(path.resolve(checkout));
  const project = path.basename(parent) === 'worktrees' && path.basename(path.dirname(parent)) === 'company-workspace'
    ? path.resolve(parent, '../..') : path.resolve(checkout);
  const main = (await import('./package-company.mjs')).packageCompany;
  const fixed = await producer(path.join(scratch, 'studio', 'company-workspace', 'worktrees', 'release-check'));
  const received = await producer(path.join(scratch, 'received', 'source'));
  const missing = path.join(scratch, 'missing-input');
  const run = (pack, outputDirectory) => pack({
    buildId: '0123456789ab', distDirectory: missing, inputPath: missing, sourceRoot: missing, outputDirectory,
  });
  const outside = path.resolve(project, '..', 'gamemake-company-filing-check', path.basename(scratch), 'bundle');
  const scriptDir = path.dirname(source);
  const driveRoot = path.parse(project).root;
  const batchInput = path.join(scriptDir,'batch-inputs','sofa-rooms.json');
  const recipe = path.join(scriptDir,'style-recipes','warm-live.json');
  const example = path.join(checkout,'prototype','src','company','examples','c2-small-home.json');
  function cli(script,args) {
    const result = spawnSync(process.execPath,[path.join(scriptDir,script),...args],{
      cwd:driveRoot,encoding:'utf8',windowsHide:true,
    });
    if (result.error) throw result.error;
    return result;
  }
  const applyOps = path.join(scratch,'rename-room.json');
  const room = JSON.parse(await fs.readFile(example,'utf8')).nodes.find(node=>node.kind==='room');
  await fs.writeFile(applyOps,JSON.stringify([{type:'set-room',id:room.id,name:'预览房间'}]));
  function rejectedOutputs(target,code) {
    for (const [script,args] of [
      ['batch.mjs',[batchInput,target]],
      ['company.mjs',['create',target]],
      ['company.mjs',['apply',example,applyOps,target]],
      ['apply-style-recipe.mjs',[example,recipe,target]],
    ]) {
      const result = cli(script,args);
      assert.equal(result.status,1,script);
      assert(result.stderr.includes(code),script+' '+result.stderr);
    }
  }
  // A relative name is resolved by the child from the drive root.
  rejectedOutputs(path.relative(driveRoot,outside),'outside-managed-package-directory');
  const sealedOutput = path.join(project,'company-workspace','deliveries',path.basename(scratch),'new-layout');
  rejectedOutputs(sealedOutput,'outside-managed-package-directory');
  await assert.rejects(fs.lstat(path.dirname(sealedOutput)),{code:'ENOENT'});
  const localLayout = path.join(scratch,'one-room.json');
  const created = cli('company.mjs',['create',localLayout]);
  assert.equal(created.status,0,created.stderr);
  const originalBytes = await fs.readFile(localLayout);
  assert.equal(cli('company.mjs',['create',localLayout]).status,1);
  assert.deepEqual(await fs.readFile(localLayout),originalBytes);
  const edited = cli('company.mjs',['apply',example,applyOps,path.join(scratch,'edit.json')]);
  assert.equal(edited.status,0,edited.stderr);
  const misplaced = [
    'loose-bundle', 'docs/old-package', 'output-archive/candidate',
    'company-workspace/preview/package', 'company-workspace/worktrees/release-check/package',
    'company-workspace/deliveries', 'company-workspace/production-trials',
    'company-workspace/deliveries-old/demo', 'company-workspace/deliveries/sealed/new-copy',
  ];
  for (const pack of [main, fixed, received]) {
    for (const target of [outside, project, ...misplaced.map(name => path.join(project, name))]) {
      await assert.rejects(run(pack, target), { code: 'outside-managed-package-directory' });
    }
    for (const target of ['output/trial', 'output/trial/candidate', 'company-workspace/deliveries/demo', 'company-workspace/production-trials/check/derived']) {
      await assert.rejects(run(pack, path.join(project, target)), { code: 'ENOENT', path: missing });
    }
  }
  const external = path.join(os.tmpdir(), 'company-recipient', path.basename(scratch));
  await checkManagedOutput(path.join(external, 'bundle'), path.join(external, 'source'));
  const target = path.join(scratch, 'preserved');
  const linked = path.join(scratch, 'redirect');
  await fs.mkdir(target);
  await fs.symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    rejectedOutputs(path.join(linked,'new','bundle'),'linked-package-output');
    for (const pack of [main, fixed, received]) {
      await assert.rejects(run(pack, path.join(linked, 'new', 'bundle')), { code: 'linked-package-output' });
    }
    assert.deepEqual(await fs.readdir(target), []);
  } finally {
    await fs.unlink(linked);
  }
  await assert.rejects(fs.stat(path.dirname(outside)), { code: 'ENOENT' });
  console.log('Passed managed checkout and portable receiver checks, and drive-root authoring CLI, retry and junction checks.');
} finally {
  const resolved = await fs.realpath(scratch);
  assert.equal(path.dirname(resolved), await fs.realpath(output));
  assert(path.basename(resolved).startsWith('package-location-'));
  await fs.rm(resolved, { recursive: true });
}
