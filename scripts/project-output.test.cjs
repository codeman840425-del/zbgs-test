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
    ['qa-game-standing-vocal.cjs', 'http://127.0.0.1', '0123456789ab', 'missing', outside],
    ['production/package-facility-room.mjs', '--game','missing','--game-sha256','0'.repeat(64),
      '--room','missing','--room-profile','vocal-use-v1.1','--out',outside],
    ['qa-turn-policy-observability.mjs', '--out=' + outside, '--module=missing'],
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

test('room, equipment and fit QA reject drive-root, traversal and junction escapes before reading inputs', async () => {
  const root = await productionRoot();
  const scratch = await fs.mkdtemp(path.join(root, 'experiments', 'output-path-test-'));
  const alias = path.join(scratch, 'alias');
  try {
    await fs.symlink(path.dirname(root), alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(projectOutput(path.join(alias, 'outside-character-regression', 'receipt.json'), root),
      {code:'outside-project'});
    const driveRoot = path.parse(root).root;
    const driveOutput = path.join(driveRoot, path.basename(scratch) + '-outside');
    const missingRecord = path.join(scratch, 'missing-record.json');
    for (const [script, args] of [
      ['qa-production-record-room.cjs', ['http://127.0.0.1/', missingRecord]],
      ['qa-native-glasses-candidate-runtime.cjs', ['http://127.0.0.1/']],
      ['qa-signed-live-equipment.cjs', ['missing-game', 'missing-inventory', missingRecord]],
      ['qa-native-glasses-fit-input.cjs', ['http://127.0.0.1/', missingRecord]]
    ]) {
      for (const destination of [driveRoot, driveOutput, path.relative(scratch, driveOutput),
        path.join(alias, path.basename(driveOutput))]) {
        const fit=script==='qa-native-glasses-fit-input.cjs';
        const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args, ...(fit?[]:[destination])],
          {cwd:scratch, encoding:'utf8', windowsHide:true, timeout:15000,
            env:fit?{...process.env,QA_M1_BUILD:'0123456789ab',QA_M1_RUN_ROOT:destination}:process.env});
        assert.equal(result.status, 1, result.error?.message ?? result.stderr);
        assert.match(result.stderr, /Production output must be inside the project/, destination);
      }
    }
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
    return {version:()=>'fixture', newBrowserCDPSession:start, newContext:start, newPage:start,
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
  const fitScript=path.join(__dirname,'qa-native-glasses-fit-input.cjs');
  const fitEnv={...process.env,QA_M1_BUILD:build};
  const existing=spawnSync(process.execPath,[fitScript,base,'missing-cases'],{cwd:fixture,encoding:'utf8',
    env:{...fitEnv,QA_M1_RUN_ROOT:fixture},windowsHide:true,timeout:15000});
  assert.equal(existing.status,1);assert.match(existing.stderr,/existing capture directory/);
  const invalid=path.join(fixture,'invalid-fit-cases.json'),unused=path.join(fixture,'invalid-fit');
  for(const row of [['../escape','body','0'.repeat(64)],['body','body','0'.repeat(64),{role:5}]]){
    await fs.writeFile(invalid,JSON.stringify([row]));
    const rejected=spawnSync(process.execPath,[fitScript,base,invalid],{cwd:fixture,encoding:'utf8',
      env:{...fitEnv,QA_M1_RUN_ROOT:unused},windowsHide:true,timeout:15000});
    assert.equal(rejected.status,1);assert.match(rejected.stderr,/Invalid exact body capture cases/);
    await assert.rejects(fs.access(unused),{code:'ENOENT'});
  }
  for (const [script, args] of [
    ['qa-garment-cold-package.cjs', out=>[base, build, selected, opposite, out]],
    ['qa-production-outfit-selection-guards.cjs', out=>[base, out, selected, build, '--slot=top']],
    ['qa-record-budget-runtime.cjs', out=>[base, selected, out, build]],
    ['qa-production-record-room.cjs', out=>[base, path.join(root,'prototype/public/assets/record-consumer-v1/native-female.json'), path.relative(fixture,out)]],
    ['qa-native-glasses-fit-input.cjs', ()=>[base]],
    ['qa-native-glasses-candidate-runtime.cjs', out=>[base, out]],
  ]) {
    for (const phase of ['launch','post-launch']) {
      const out = path.join(fixture, script.replace('.cjs','')+'-'+phase);
      const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, script), ...args(out)], {
        cwd:fixture, encoding:'utf8', windowsHide:true, timeout:15000,
        env:{...process.env, CHARACTER_QA_TEST_EVIDENCE:out, CHARACTER_QA_TEST_PHASE:phase,
          ...(script==='qa-native-glasses-fit-input.cjs'?{QA_M1_BUILD:build,QA_M1_RUN_ROOT:path.relative(fixture,out)}:{})},
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
