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
    ['qa-record-budget-runtime.cjs', 'http://127.0.0.1', 'missing', outside, '0123456789ab'],
    ['qa-garment-cold-package.cjs', 'http://127.0.0.1', '0123456789ab', 'missing', 'missing', outside],
    ['qa-production-outfit-selection-guards.cjs', 'http://127.0.0.1', path.dirname(root), 'missing', '0123456789ab'],
    ['qa-garment-basecolor-room.cjs', 'http://127.0.0.1', '0123456789ab', outside],
    ['qa-uniform-replay.cjs', 'http://127.0.0.1', outside],
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

test('browser QA keeps launch and retry scratch in the evidence directory', async t => {
  const root = await productionRoot();
  const fixture = await fs.mkdtemp(await projectOutput(path.join(root, 'experiments', 'qa-browser-test-'), root));
  t.after(async () => {
    assert.equal(await projectOutput(fixture, root), fixture);
    await fs.rm(fixture, {recursive:true});
  });
  const preload = path.join(fixture, 'playwright-fixture.cjs');
  await fs.writeFile(preload, `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const load = Module._load;
Module._load = function (name, ...args) {
  if (name !== '../prototype/node_modules/playwright') return load.call(this, name, ...args);
  const scratch = os.tmpdir();
  assert.equal(path.dirname(scratch), process.env.CHARACTER_QA_TEST_EVIDENCE);
  return {chromium:{async launch(options) {
    assert.equal(os.tmpdir(), scratch);
    assert.equal(options.downloadsPath, scratch);
    assert.equal(options.tracesDir, scratch);
    for (const key of ['TEMP','TMP','TMPDIR','XDG_CACHE_HOME','CUDA_CACHE_PATH','__GL_SHADER_DISK_CACHE_PATH'])
      assert.equal(options.env[key], scratch);
    assert.equal(options.env.CHROME_LOG_FILE, path.join(scratch, 'chrome.log'));
    assert(options.args.includes('--disk-cache-dir=' + path.join(scratch, 'disk-cache')));
    assert(options.args.includes('--crash-dumps-dir=' + scratch));
    fs.writeFileSync(path.join(scratch, 'launch.tmp'), 'Playwright scratch fixture');
    if (process.env.CHARACTER_QA_TEST_PHASE === 'launch') throw Error('simulated launch failure');
    const start = async () => { throw Error('simulated post-launch failure'); };
    return {version:()=>'fixture', newBrowserCDPSession:start, newContext:start,
      close:async () => fs.writeFileSync(path.join(path.dirname(scratch), 'browser-closed'), 'closed')};
  }}};
};
`);
  const records = prefix => ['first','second'].map((id, index) => ({
    identity:{id}, appearanceRecipe:{base:{sha256:'body-'+index}, equipment:{
      manifestUrl:'/assets/manifest.json', role:'pants-top-far',
      resources:Object.fromEntries(['top','bottom','shoes'].map(slot=>[slot,{
        id, slot, sha256:prefix+index, url:prefix+index+'.glb', bytes:1,
      }]))
    }},
  }));
  const selected = path.join(fixture, 'selected.json');
  const opposite = path.join(fixture, 'opposite.json');
  await Promise.all([fs.writeFile(selected, JSON.stringify(records('selected'))),
    fs.writeFile(opposite, JSON.stringify(records('opposite')))]);
  const base = 'http://127.0.0.1/';
  const build = '0123456789ab';
  for (const [script, args] of [
    ['qa-garment-cold-package.cjs', out=>[base, build, selected, opposite, out]],
    ['qa-production-outfit-selection-guards.cjs', out=>[base, out, selected, build, '--slot=top']],
    ['qa-record-budget-runtime.cjs', out=>[base, selected, out, build]],
  ]) {
    for (const phase of ['launch','post-launch']) {
      const out = path.join(fixture, script.replace('.cjs','')+'-'+phase);
      const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, script), ...args(out)], {
        cwd:fixture, encoding:'utf8', windowsHide:true, timeout:15000,
        env:{...process.env, CHARACTER_QA_TEST_EVIDENCE:out, CHARACTER_QA_TEST_PHASE:phase},
      });
      assert.equal(result.status, 1, result.error?.message ?? result.stderr);
      const report = JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
      assert.match(report.failure, new RegExp(`simulated ${phase} failure`), script);
      const files = await fs.readdir(out);
      assert.equal(files.includes('browser-closed'), phase === 'post-launch');
      assert(!files.some(name => name.startsWith('.browser-')), script);
    }
  }
});
