import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
    for (const pack of [main, fixed, received]) {
      await assert.rejects(run(pack, path.join(linked, 'new', 'bundle')), { code: 'linked-package-output' });
    }
    assert.deepEqual(await fs.readdir(target), []);
  } finally {
    await fs.unlink(linked);
  }
  await assert.rejects(fs.stat(path.dirname(outside)), { code: 'ENOENT' });
  console.log('Passed managed developer, fixed checkout and portable receiver destination checks.');
} finally {
  const resolved = await fs.realpath(scratch);
  assert.equal(path.dirname(resolved), await fs.realpath(output));
  assert(path.basename(resolved).startsWith('package-location-'));
  await fs.rm(resolved, { recursive: true });
}
