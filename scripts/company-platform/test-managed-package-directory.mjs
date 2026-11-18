import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkManagedOutput} from './package-company.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const at = (...parts) => path.resolve(project, ...parts);
const releases = at('company-workspace', 'deliveries');
const trials = at('company-workspace', 'production-trials');
const driveRootOutput = path.join(path.parse(project).root, 'gamemake-company-filing-check');
const checkouts = [
  at('.'),
  at('company-workspace', 'worktrees', 'release-check'),
  at(releases, 'release-v1', 'source'),
  at(trials, 'receiver', 'published-room', 'source'),
  at('output', 'candidate', 'source'),
];

for (const checkout of checkouts) {
  for (const denied of [driveRootOutput, at('docs', 'test-package'), at(releases, 'release-v1', 'another-package')]) {
    await assert.rejects(checkManagedOutput(denied, checkout), {code:'outside-managed-package-directory'});
  }
  for (const allowed of [at(releases, 'release-v2'), at(trials, 'receiver', 'published-room'), at('output', 'candidate')]) {
    await checkManagedOutput(allowed, checkout);
  }
}

// These paths only exercise ownership lookup. The checks do not create anything.
const otherTeam = path.join(os.tmpdir(), 'independent-company-receiver', 'source');
await checkManagedOutput(path.resolve(otherTeam, '..', 'my-release'), otherTeam);
console.log('5 local tool locations, 15 rejected destinations, 15 permitted destinations, external receiver passed.');
