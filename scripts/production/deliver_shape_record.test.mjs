import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {productionRoot, projectOutput} from '../project-output.cjs';
import {produceItems,readInputs,withFreshDelivery} from './deliver_shape_record.mjs';
import {digest} from '../runtime-package/files.mjs';

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

const batchSchema='shape-record-delivery-batch-v1';
function item(id,recipe) {
  return {recipe,identity:{id,name:'Displayed / '+id,gender:'male'}};
}

test('batch inputs require 2–4 distinct identities, support relative and absolute recipe paths, and reject mixed modes', async t=>{
  const base=await workspace(t), batch=path.join(base,'request.json');
  const first=item('record-first','recipe.json'), second=item('record-second',baseRecipe);
  for(const key of ['recipe','id','name','gender','companion','companion-pack'])
    await assert.rejects(readInputs({batch,[key]:'unused'}),{code:'batch-option-conflict'});
  for(const items of [[first],Array(5).fill(first),[first,first],[first,{...second,extra:1}],
                       [first,{...second,identity:{...second.identity,id:'rule-body-data'}}]]){
    await writeFile(batch,JSON.stringify({schema:batchSchema,items}));
    await assert.rejects(readInputs({batch}));
  }
  const entries=[first,second,item('record-third',baseRecipe),item('record-fourth',baseRecipe)];
  const bytes=JSON.stringify({schema:batchSchema,items:entries});
  await writeFile(batch,bytes);
  const parsed=await readInputs({batch});
  assert.equal(parsed.batchFileSha256,digest(bytes));assert.equal(parsed.items.length,4);
  assert.equal(parsed.items[0].recipe,path.join(base,'recipe.json'));
  assert.equal(parsed.items[1].recipe,baseRecipe);
});

test('bad second recipe rolls back after real production, retry with identical geometry preserves both item receipts and one pack', async t=>{
  const base=await workspace(t), out=path.join(base,'delivery'), second=path.join(base,'second.json');
  const batch=path.join(base,'batch.json');
  await writeFile(batch,JSON.stringify({schema:batchSchema,items:[item('share-first',baseRecipe),item('share-second','second.json')]}));
  const recipe=JSON.parse(await readFile(baseRecipe,'utf8'));
  async function attempt(){
    const {items}=await readInputs({batch});
    return withFreshDelivery(out,[],(scratch,product)=>produceItems(items,true,scratch,product));
  }
  await writeFile(second,JSON.stringify({...recipe,weight:-1}));
  await assert.rejects(attempt(),error=>error.code==='batch-item-failed' && /items\[1\] \(share-second\), produce-body/.test(error.message));
  assert.deepEqual((await readdir(base)).sort(),['batch.json','second.json']);
  await writeFile(second,JSON.stringify(recipe));
  const result=await attempt();
  assert.equal(result.packArgs.length,2);
  const [a,b]=result.items;
  assert.deepEqual(a.shape,b.shape);assert.equal(a.shapePackPath,b.shapePackPath);
  assert.equal(a.producerSha256,b.producerSha256);assert.notEqual(a.recipeFileSha256,b.recipeFileSha256);
  assert.deepEqual(await readdir(path.join(out,'shape-packs')),[a.shape.indexSha256]);
  assert.deepEqual(await readdir(path.join(out,'items')),['1','2']);
  for(const row of result.items){
    assert.equal(digest(await readFile(path.join(out,row.producerPath))),row.producerSha256);
    assert.equal(digest(await readFile(path.join(out,row.recipePath))),row.recipeFileSha256);
    assert.equal(digest(await readFile(path.join(out,row.shapePackPath,'profile.json'))),row.profileSha256);
  }
});

test('matching VRM bytes with different canonical recipe and index pins cannot select an arbitrary pack', async t=>{
  const base=await workspace(t), out=path.join(base,'collision');
  const recipe=JSON.parse(await readFile(baseRecipe,'utf8'));
  const one=path.join(base,'integer.json'), two=path.join(base,'float.json');
  const text=JSON.stringify({...recipe,weight:1});
  await writeFile(one,text);await writeFile(two,text.replace('"weight":1','"weight":1.0'));
  const inputs=[item('integer-one',one),item('float-one',two)];
  await assert.rejects(withFreshDelivery(out,[],(scratch,product)=>produceItems(inputs,true,scratch,product)),
    error=>error.code==='batch-item-failed' && error.message.includes('items[1] (float-one), check-pack-identity: Different pack indices'));
  assert.deepEqual((await readdir(base)).sort(),['float.json','integer.json']);
});
