import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = fileURLToPath(new URL('package-company.mjs', import.meta.url));
const output = fileURLToPath(new URL('../../output/', import.meta.url));
await fs.mkdir(output, { recursive: true });
const scratch = await fs.mkdtemp(path.join(await fs.realpath(output), 'package-location-'));

async function producer(checkout) {
  const dir = path.join(checkout, 'scripts', 'company-platform');
  await fs.mkdir(dir, { recursive: true });
  const copy = path.join(dir, 'package-company.mjs');
  await fs.copyFile(source, copy);
  return (await import(pathToFileURL(copy).href)).packageCompany;
}

try {
  const project = path.join(scratch, 'studio');
  const main = await producer(project);
  await fs.writeFile(path.join(project, 'scripts/company-platform/local-workspace.ps1'), '', { flag: 'wx' });
  const fixed = await producer(path.join(project, 'company-workspace', 'worktrees', 'release-check'));
  const received = await producer(path.join(scratch, 'received', 'source'));
  const missing = path.join(scratch, 'missing-input');
  const run = (pack, outputDirectory) => pack({
    buildId: '0123456789ab', distDirectory: missing, inputPath: missing, sourceRoot: missing, outputDirectory,
  });
  const outside = path.join(scratch, 'studio-old', 'bundle');
  for (const pack of [main, fixed]) {
    for (const target of [outside, project, path.join(project, 'loose-bundle')]) {
      await assert.rejects(run(pack, target), { code: 'outside-managed-package-directory' });
    }
    for (const target of ['output/trial', 'company-workspace/deliveries/demo', 'company-workspace/production-trials/check']) {
      await assert.rejects(run(pack, path.join(project, target)), { code: 'ENOENT', path: missing });
    }
  }
  await assert.rejects(run(received, outside), { code: 'ENOENT', path: missing });
  await assert.rejects(fs.stat(path.dirname(outside)), { code: 'ENOENT' });
  console.log('Passed managed developer, fixed checkout and portable receiver destination checks.');
} finally {
  const resolved = await fs.realpath(scratch);
  assert.equal(path.dirname(resolved), await fs.realpath(output));
  assert(path.basename(resolved).startsWith('package-location-'));
  await fs.rm(resolved, { recursive: true });
}
