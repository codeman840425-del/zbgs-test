import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {productionRoot, projectOutput} from '../project-output.cjs';
import {withFreshDelivery} from './deliver_shape_record.mjs';

const run = promisify(execFile);
const root = await productionRoot();
const script = fileURLToPath(new URL('./deliver_shape_record.mjs', import.meta.url));
const producer = fileURLToPath(new URL('./rule_body_producer.py', import.meta.url));
const baseRecipe = path.join(root, 'evidence/m2-frozen-rule-game-v1/input/recipe.json');

async function workspace(t) {
  const base = await mkdtemp(await projectOutput(path.join(root, 'output/.shape-delivery-test-'), root));
  t.after(async () => {
    assert.equal(await projectOutput(base, root), base);
    await rm(base, {recursive:true, force:true, maxRetries:3});
  });
  return base;
}

test('a failed production run cleans up, then the same destination accepts a corrected real recipe exactly once', async t => {
  const base = await workspace(t), out = path.join(base, 'delivery');
  const recipe = JSON.parse(await readFile(baseRecipe, 'utf8'));
  async function produce(weight) {
    return withFreshDelivery(out, [], async (scratch, result) => {
      const file = path.join(scratch, 'recipe.json');
      await writeFile(file, JSON.stringify({...recipe, weight}));
      await writeFile(path.join(result, 'started'), 'entered');
      const {stdout} = await run('python', ['-B', producer, '--recipe', file, '--out', path.join(result, 'model')],
        {cwd:path.parse(root).root, env:{...process.env, TMP:scratch, TEMP:scratch, TMPDIR:scratch}, windowsHide:true});
      return JSON.parse(stdout);
    });
  }
  await assert.rejects(produce(-1), /weight|range/i);
  assert.deepEqual(await readdir(base), []);
  const receipt = await produce(recipe.weight);
  const produced = JSON.parse(await readFile(path.join(out, 'model/receipt.json')));
  assert.equal(receipt.bodySha256, produced.bodySha256);
  assert.ok(produced.geometry.changedVertices > 0);
  await assert.rejects(produce(recipe.weight), {code:'output-conflict'});
  assert.deepEqual(await readdir(base), ['delivery']);
});

test('an output cannot be a source, a junction, a project sibling or a source-code folder', async t => {
  const base = await workspace(t);
  const protectedInput = path.join(base,'operator-input');
  await mkdir(protectedInput);
  const junction = path.join(base,'redirect');
  await symlink(protectedInput, junction, process.platform === 'win32' ? 'junction' : 'dir');
  const outside = path.join(path.parse(root).root, 'shape-record-outside');
  for (const target of [protectedInput, path.join(protectedInput,'attempt'), path.join(junction,'attempt'),
                        path.join(root,'output','..','prototype','should-never-exist'), outside]) {
    await assert.rejects(withFreshDelivery(target, [protectedInput], () => assert.fail('write callback ran')),
      error => ['outside-delivery-output','outside-project'].includes(error.code));
  }
  assert.deepEqual(await readdir(protectedInput), []);
});

test('from drive root the CLI fails before D02 for an unreviewed dist, then retries with the same destination', async t => {
  const base = await workspace(t), out = path.join(base, 'delivery');
  const dist = path.join(base,'fixed-dist');
  await mkdir(dist);
  const fakeBuild = JSON.stringify({shortId:'0'.repeat(12),sourceDigest:'0'.repeat(64)});
  await writeFile(path.join(dist,'build-info.json'),fakeBuild);
  const args = [script, '--recipe',baseRecipe,'--id','shape-delivery-test','--name','CPU check',
    '--gender','male','--dist',dist,'--source-root',root,'--out',out];
  for (let i = 0; i < 2; i++) {
    await assert.rejects(run(process.execPath, args, {cwd:path.parse(root).root,windowsHide:true}),
      error => JSON.parse(error.stderr).code === 'unsupported-build');
    assert.deepEqual(await readdir(base), ['fixed-dist']);
    assert.equal(await readFile(path.join(dist,'build-info.json'),'utf8'),fakeBuild);
  }
});

test('both production entries reject an explicit invalid browser before reading the fixed build or creating output', async t => {
  const base = await workspace(t), config = path.join(base,'invalid-config.json'), out = path.join(base,'delivery');
  await writeFile(config, '{}');
  const d02 = fileURLToPath(new URL('../character-production-cli.cjs', import.meta.url));
  const common = ['--dist',path.join(base,'absent-dist'),'--out',out,'--browser-config',config];
  for (const args of [[script, '--recipe',baseRecipe,'--id','browser-check','--name','CPU','--gender','male',
                       '--source-root',root], [d02,'--request',baseRecipe]]) {
    await assert.rejects(run(process.execPath, [...args, ...common], {cwd:path.parse(root).root,windowsHide:true}),
      error => JSON.parse(error.stderr).reason === 'Unapproved browser deployment');
    await assert.rejects(run(process.execPath, [...args, ...common, '--browser-config',config],
      {cwd:path.parse(root).root,windowsHide:true}), error=>JSON.parse(error.stderr).reason === 'Expected one --browser-config PATH');
    assert.deepEqual(await readdir(base), ['invalid-config.json']);
  }
});
