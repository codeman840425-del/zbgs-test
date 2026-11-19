import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {productionRoot, projectOutput} from '../project-output.cjs';

test('a failing producer audit stops fixed review before reading a separate input or creating output', async t => {
  const root = await productionRoot();
  const fixture = await mkdtemp(await projectOutput(path.join(root, 'experiments', 'review-audit-test-'), root));
  t.after(async () => {
    assert.equal(await projectOutput(fixture, root), fixture);
    await rm(fixture, {recursive:true, force:true});
  });
  const inputCheckout = path.join(fixture, 'input-checkout');
  await mkdir(inputCheckout);
  const preload = `
    import assert from 'node:assert/strict';
    import child from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    import path from 'node:path';
    const root = process.env.REVIEW_AUDIT_TEST_PRODUCER;
    child.spawnSync = (command, args, options) => {
      assert.equal(command, 'python');
      assert.deepEqual(args, ['-B', '-X', 'utf8', path.join(root, 'scripts', 'character-worktree.py'), 'audit']);
      assert.equal(options.cwd, root);
      return {status:1,stdout:JSON.stringify({unexpectedWorktrees:['fixture-outside-registration']}),stderr:''};
    };
    syncBuiltinESMExports();`;
  const script = fileURLToPath(new URL('./review-game-runtime.mjs', import.meta.url));
  const target = path.join(fixture, 'new-output', 'review.json');
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,'+encodeURIComponent(preload), script,
    path.join(fixture, 'missing-published'), path.join(inputCheckout, 'prototype', 'dist'), inputCheckout, target],
    {cwd:path.parse(root).root, encoding:'utf8', windowsHide:true,
      env:{...process.env, REVIEW_AUDIT_TEST_PRODUCER:root}});
  assert.equal(result.status, 1, result.error?.message ?? result.stderr);
  assert.match(result.stderr, /Production worktree audit failed \(1\)/);
  assert.match(result.stderr, /"unexpectedWorktrees":\["fixture-outside-registration"\]/);
  assert.deepEqual(await readdir(fixture), ['input-checkout']);
});
