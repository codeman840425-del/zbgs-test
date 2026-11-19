import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {runCompanyBatch} from './batch.mjs';
import {checkManagedOutput} from './package-company.mjs';

const [destination] = process.argv.slice(2);
if (!destination) throw Error('Usage: node test-workstation-look-batch.mjs NEW_OUTPUT_DIRECTORY');
const out = path.resolve(destination);
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(out);
const batch = JSON.parse(await fs.readFile(new URL('./batch-inputs/workstation-looks.json', import.meta.url), 'utf8'));
const read = (key, name) => fs.readFile(path.join(out, key, name), 'utf8');
const publish = (input, only) => runCompanyBatch(input, {outputDirectory:out, only});
const bad = structuredClone(batch);
bad.items[1].stationLooks[0].look.version = 99;
const partial = await publish(bad);
assert.equal(partial.ok, false);
const failures = partial.results.filter(item => item.status === 'failed');
assert.deepEqual(failures.map(item => [item.key,item.code]), [['studio-set-2','missing-workstation-look']]);
await assert.rejects(fs.access(path.join(out, 'studio-set-2')), {code:'ENOENT'});
const old = await read('studio-set-1', 'save.json');
const retry = await publish(batch, 'studio-set-2');
assert.equal(retry.ok, true);
assert.equal(await read('studio-set-1', 'save.json'), old);
const repeat = await publish(batch);
assert.deepEqual(repeat.results.map(item => item.status), Array(4).fill('idempotent'));

const identities = new Set();
const appearances = new Set();
const artifacts = [];
for (const item of batch.items) {
  const layout = JSON.parse(await read(item.key, 'layout.json'));
  const save = JSON.parse(await read(item.key, 'save.json'));
  const report = JSON.parse(await read(item.key, 'report.json'));
  assert.deepEqual(save.document, layout);
  identities.add(layout.id);
  const parts = layout.nodes.filter(n => n.partKey && n.resource);
  assert.equal(parts.length, 6);
  for (const part of parts) {
    assert.ok(report.assetDependencies.some(asset =>
      asset.id === part.resource.id && asset.version === part.resource.version && /^[0-9a-f]{64}$/.test(asset.sha256)));
  }
  const signature = parts.map(n => n.resource.id + '@' + n.resource.version);
  appearances.add(JSON.stringify(signature));
  artifacts.push({company:layout.id, scale:layout.scale, look:item.stationLooks[0].look, parts:signature, save:report.files['save.json'].sha256});
}
assert.equal(identities.size,4);
assert.equal(appearances.size,4);
console.log(JSON.stringify({status:'passed', rejected:failures[0], retried:retry.results[0].key, unchangedOnRepeat:repeat.results.length, artifacts}, null, 2));
