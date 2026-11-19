const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {promisify} = require('node:util');
const {productionRoot, projectOutput} = require('./project-output.cjs');

const run = promisify(execFile);

async function fixture(t) {
  const root = await productionRoot();
  const prefix = await projectOutput(path.join(root, 'experiments', 'fixed-check-test-'), root);
  const area = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.equal(await projectOutput(area, root), area);
    await fs.rm(area, {recursive:true});
  });
  const project = path.join(area, 'producer');
  const runtime = path.join(area, 'runtime');
  const outside = path.join(area, 'alternate-temp');
  const experiments = path.join(project, 'experiments');
  await Promise.all([fs.mkdir(path.join(project, 'scripts'), {recursive:true}),
    fs.mkdir(path.join(runtime, 'dist'), {recursive:true}), fs.mkdir(outside)]);
  for (const name of ['project-output.cjs', 'run-fixed-check.cjs'])
    await fs.copyFile(path.join(__dirname, name), path.join(project, 'scripts', name));
  await fs.writeFile(path.join(runtime, 'dist', 'index.html'), 'fixed fixture');
  await fs.writeFile(path.join(runtime, 'check.cjs'), `
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const [url, expected, code, redirect] = process.argv.slice(2);
  const scratch = os.tmpdir();
  assert.equal(path.dirname(await fs.realpath(scratch)), expected);
  for (const name of ['TEMP','TMP','TMPDIR']) assert.equal(process.env[name], scratch);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'fixed fixture');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ordinary-task-'));
  const tempFile = path.join(directory, 'probe.txt');
  await fs.writeFile(tempFile, 'temporary');
  if (redirect) {
    await fs.unlink(tempFile);
    await fs.rmdir(directory);
    await fs.rmdir(scratch);
    await fs.symlink(redirect, scratch, process.platform === 'win32' ? 'junction' : 'dir');
  }
  console.log(JSON.stringify({url, scratch, tempFile}));
  process.exitCode = Number(code);
})().catch(error => { console.error(error); process.exitCode = 1; });
`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TEMP|TMP|TMPDIR)$/i.test(key)));
  Object.assign(env, {Temp:outside, Tmp:outside, TMPDIR:outside});
  const start = (status, ...extra) => run(process.execPath,
    [path.join(project, 'scripts', 'run-fixed-check.cjs'), 'dist', 'check.cjs', experiments, String(status), ...extra],
    {cwd:runtime, env, windowsHide:true, timeout:15000}).then(result => ({...result, code:0}), error => error);
  return {experiments, outside, start};
}

test('a normal fixed check and a failed check both clean their unique scratch and close the fixed build', async t => {
  const {experiments, outside, start} = await fixture(t);
  const scratches = new Set();
  for (const code of [17, 0]) {
    const result = await start(code);
    assert.equal(result.code, code, result.stderr);
    const {url, scratch, tempFile} = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(path.dirname(scratch), experiments);
    assert.equal(path.basename(tempFile), 'probe.txt');
    await assert.rejects(fs.stat(scratch), {code:'ENOENT'});
    await assert.rejects(fetch(url, {signal:AbortSignal.timeout(1000)}));
    scratches.add(scratch);
  }
  assert.equal(scratches.size, 2);
  assert.deepEqual(await fs.readdir(experiments), []);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('a junction cannot redirect scratch creation or cleanup outside the producer', async t => {
  const {experiments, outside, start} = await fixture(t);
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(outside, experiments, linkType);
  try {
    const result = await start(0);
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /outside-project/);
    assert.equal(result.stdout, '');
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.unlink(experiments);
  }

  await fs.writeFile(path.join(outside, 'keep.txt'), 'retained');
  const result = await start(17, outside);
  assert.equal(result.code, 17, result.stderr);
  assert.match(result.stderr, /outside-project/);
  const {scratch} = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  try {
    assert.equal(await fs.realpath(scratch), outside);
    assert.deepEqual(await fs.readdir(outside), ['keep.txt']);
  } finally {
    await fs.unlink(scratch);
  }
});
