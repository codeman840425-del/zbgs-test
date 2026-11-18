import assert from 'node:assert/strict';
import {mkdtemp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {digest,jsonBytes} from './files.mjs';
import {compareSignedLook,pinned,registeredReview,verifyPackage,verifyPlannedInputs} from './verify-character-handoff.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const ref = (name,bytes) => ({path:name,bytes:bytes.length,sha256:digest(bytes)});
async function scratch(t) {
  const parent = path.join(root,'scripts','runtime-package');
  assert.equal(path.relative(parent,await realpath(parent)),'');
  const dir = await mkdtemp(path.join(parent,'.test-handoff-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  return dir;
}

test('actual pinned inputs reject traversal, alternate size and directory junction',async t => {
  const dir = await scratch(t);
  const bytes = Buffer.from('pinned');
  await writeFile(path.join(dir,'one'),bytes);
  for (const name of ['../one','C:/one','one:stream','NUL','one\\bad','one.','/one','./one']) {
    await assert.rejects(pinned(dir,ref(name,bytes)), {code:'unsafe-path'});
  }
  const sub = await mkdtemp(path.join(dir,'actual-'));
  await writeFile(path.join(sub,'one'),bytes);
  await symlink(sub,path.join(dir,'alias'),'junction');
  await assert.rejects(pinned(dir,ref('alias/one',bytes)),{code:'unsafe-path'});
  await assert.rejects(pinned(dir,{...ref('one',bytes),bytes:bytes.length+1}),{code:'modified-dependency'});
  const old = {path:'one',sha256:digest(bytes)};
  await assert.rejects(pinned(dir,old),{code:'modified-dependency'});
  assert.deepEqual(await pinned(dir,old,true),bytes);
});

test('complete physical game package requires the exact manifest, bytes and all declared files',async t => {
  const dir = await scratch(t);
  const name = 'character.json', bytes = Buffer.from('actor');
  const inventory = {files:[ref(name,bytes)]}, manifest = jsonBytes(inventory);
  const packageFile = path.join(dir,'runtime-package.json');
  const check = () => verifyPackage(dir,inventory,manifest,2);
  await writeFile(packageFile,manifest);
  await assert.rejects(check(),{code:'package-mismatch'});
  await writeFile(path.join(dir,name),bytes);
  await check();
  await assert.rejects(verifyPackage(dir,inventory,manifest,3),{code:'package-mismatch'});
  await writeFile(packageFile,Buffer.from('{}'));
  await assert.rejects(check(),{code:'inventory-mismatch'});
  await writeFile(packageFile,manifest);
  await writeFile(path.join(dir,name),'acTOR');
  await assert.rejects(check(),{code:'modified-dependency'});
  await writeFile(path.join(dir,'extra'),'extra');
  await assert.rejects(check(),{code:'package-mismatch'});
});

test('unregistered runtime digest cannot pass the named external-record build registry',async () => {
  await assert.rejects(registeredReview(root,{sourceDigest:'0'.repeat(64)}),{code:'unsupported-build'});
});

test('real signed uniform records must match independent identity, outfit and explicit appearance',async () => {
  const evidence = path.join(root,'evidence/m2-garment-texture-game-v1');
  const near = JSON.parse(await readFile(path.join(evidence,'records-near.json')));
  const far = JSON.parse(await readFile(path.join(evidence,'records-far.json')));
  const jobs = JSON.parse(await readFile(path.join(evidence,'create-near.batch.json'))).requests;
  for (const source of jobs) {
    const job = structuredClone(source);
    compareSignedLook(job,near);
    assert.throws(() => compareSignedLook(job,far),{code:'selection-mismatch'});
    const sameLook = {...job,identity:{...job.identity,id:'a-different-actor'}};
    assert.throws(() => compareSignedLook(sameLook,near),{code:'selection-mismatch'});
    job.edits.push({domain:'appearance',values:{hairColor:'original'}});
    compareSignedLook(job,near);
    job.edits.at(-1).values.hairColor = 'changed';
    assert.throws(() => compareSignedLook(job,near),{code:'selection-mismatch'});
  }
});

test('archived author plan binds its actual creation batch, original pins and signed identity order', async () => {
  const base = 'evidence/m2-native-short-socks-room-v1';
  const name = base + '/plan/plan.json';
  const planBytes = await readFile(path.join(root,name));
  const {source,creationBatches,...result} = JSON.parse(planBytes);
  const batchPath = base + '/plan/' + creationBatches[0].path;
  const batchBytes = await readFile(path.join(root,batchPath));
  const [job] = JSON.parse(batchBytes).requests;
  delete result.items[0].requestPin;
  result.items[0].request = job;
  const records = JSON.parse(await readFile(path.join(root,base,'records.json')));
  const authored = records.filter(record => record.identity.id === job.identity.id);
  const inputs = {variantMatrix:source.matrix,candidateRequest:source.request,authoredPlan:ref(name,planBytes)};
  const check = (rows,changed) => verifyPlannedInputs(root,{...inputs,...changed},rows,structuredClone(result));
  await check(authored);
  await check(authored,{authoredRequests:ref(batchPath,batchBytes)});
  await assert.rejects(check(records),{code:'selection-mismatch'});
  await assert.rejects(check(authored,{candidateRequest:source.matrix}),{code:'plan-mismatch'});
  await assert.rejects(check(authored,{authoredRequests:ref(name,planBytes)}),{code:'plan-mismatch'});
});
