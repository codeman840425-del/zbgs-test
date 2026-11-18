const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {outputPaths} = require('./character-production-cli.cjs');

test('production record and game export reject an escaped path before reading inputs', async () => {
  const root = await productionRoot();
  const outside = path.join(path.dirname(root), 'outside-character-regression');
  const output = path.join(root, 'output', 'safe-record.json');
  assert.equal((await outputPaths(output)).out, output);
  await assert.rejects(outputPaths(output, outside), {code:'outside-project'});
  await assert.rejects(outputPaths(path.join(root, '..', path.basename(outside))), {code:'outside-project'});
  for (const args of [
    ['qa-production-package.cjs', 'http://127.0.0.1', path.dirname(root)],
    ['runtime-package/review-game-runtime.mjs', 'missing', 'missing', 'missing', outside],
    ['qa-production-record-room.cjs', 'http://127.0.0.1', 'missing', outside],
    ['qa-raw-outfit-room.cjs', 'http://127.0.0.1', 'missing', 'missing', outside],
    ['character-production-cli.cjs', '--out', outside, '--request', 'missing', '--dist', 'missing'],
    ['runtime-package/game-record-cli.mjs', 'inventory', '--out', outside, '--dist', 'missing'],
    ['runtime-package/game-record-cli.mjs', 'export', '--out', outside, '--dist', 'missing', '--inventory', 'missing']
  ]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, args[0]), ...args.slice(1)],
      {cwd:os.tmpdir(), encoding:'utf8', windowsHide:true});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inside the project/);
  }
});

test('nonexistent output below a junction resolves into its true directory', async () => {
  const root = await productionRoot();
  const scratch = await fs.mkdtemp(path.join(root, 'experiments', 'output-path-test-'));
  const alias = path.join(scratch, 'alias');
  try {
    await fs.symlink(path.dirname(root), alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(projectOutput(path.join(alias, 'outside-character-regression', 'receipt.json'), root),
      {code:'outside-project'});
  } finally {
    await fs.unlink(alias).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(scratch);
  }
});
