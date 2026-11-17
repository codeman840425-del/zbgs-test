import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {checkedBytes,writeFresh} from '../../scripts/runtime-package/files.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../',import.meta.url));
const source = path.join(root,'experiments/m2-record-consumer-release-v1');
const delivery = path.join(root,'experiments/m2-game-record-package-v1');
const cli = path.join(root,'scripts/runtime-package/game-record-cli.mjs');
const pin = await readFile(path.join(root,'scripts/runtime-package/game-record-runtime-reviewed.json'));
const {stdout:head}=await exec('git',['-C',source,'rev-parse','HEAD']);
assert.equal(head.trim(),JSON.parse(pin).sourceCommit);
const temp = await mkdtemp(path.join(tmpdir(),'gamemake-game-record-review-'));
try {
  const out = path.join(temp,'atomic.json');
  async function* interrupted() {
    yield Buffer.from('written-prefix');
    assert.ok(!(await readdir(temp)).includes('atomic.json'));
    throw Object.assign(Error('interrupted after prefix'),{code:'ENOSPC'});
  }
  await assert.rejects(writeFresh(out,interrupted()),{code:'ENOSPC'});
  assert.deepEqual(await readdir(temp),[]);
  const race = await Promise.allSettled(['first','second'].map(value=>writeFresh(out,value)));
  assert.equal(race.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(race.find(row=>row.status==='rejected').reason.code,'output-conflict');
  const winner=await readFile(out,'utf8');
  assert.ok(['first','second'].includes(winner));
  await assert.rejects(writeFresh(out,'replacement'),{code:'output-conflict'});
  assert.equal(await readFile(out,'utf8'),winner);
  assert.deepEqual(await readdir(temp),['atomic.json']);
  console.log('atomic prefix failure, cleanup, retry and concurrent no-clobber passed');

  const copy = path.join(temp,'review.json');
  await writeFile(copy,pin);
  const input = ['inventory','--dist',path.join(source,'prototype/dist'),'--source-root',source];
  const inventoryPath = path.join(temp,'first.json');
  await exec(process.execPath,[cli,...input,'--out',inventoryPath]);
  const samePath = path.join(temp,'second.json');
  await exec(process.execPath,[cli,...input,'--out',samePath,'--reviewed',copy]);
  assert.deepEqual(await readFile(inventoryPath),await readFile(samePath));
  const forged=JSON.parse(pin);
  forged.sourceCommit='0'.repeat(40);
  await writeFile(copy,JSON.stringify(forged));
  const refused=path.join(temp,'refused.json');
  await assert.rejects(exec(process.execPath,[cli,...input,'--out',refused,'--reviewed',copy]),
    error=>JSON.parse(error.stderr).code==='unsupported-build');
  assert.ok(!(await readdir(temp)).includes('refused.json'));
  const inventory=JSON.parse(await readFile(inventoryPath));
  assert.deepEqual(inventory,JSON.parse(await readFile(path.join(delivery,'runtime-package.json'))));
  for(const row of inventory.files)await checkedBytes(delivery,row);
  assert.deepEqual(inventory.records.map(r=>r.id),['d03-female-a','d03-male-a','d03-female-b','d03-male-b']);
  console.log('default pin, identical copy, wrong commit refusal, four ordered records and all package-file identities passed',inventory.files.length);
} finally {
  await rm(temp,{recursive:true,force:true});
}
