import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {checkManagedOutput} from './package-company.mjs';

const run = promisify(execFile);
const verifier = fileURLToPath(new URL('package-template/verify.mjs', import.meta.url));
const [destination, ...extra] = process.argv.slice(2);
assert(destination && !extra.length, 'Usage: node test-rebuilt-viewer.mjs FRESH_TEST_FOLDER');
const directory = path.resolve(destination);
await checkManagedOutput(directory, undefined, {allowDelivery:false});
await fs.mkdir(directory);
const bundle = path.join(directory, 'sealed');
const viewer = path.join(bundle, 'viewer');
const rebuild = path.join(directory, 'rebuild');
await fs.mkdir(viewer, {recursive:true});
const hash = value => createHash('sha256').update(value).digest('hex');
const files = [];
for (const [name, bytes] of [['company.html','entry'], ['company-build-info.json','{}'], ['model.glb','geometry']]) {
  await fs.writeFile(path.join(viewer, name), bytes);
  files.push({path:'viewer/' + name, bytes:Buffer.byteLength(bytes), sha256:hash(bytes)});
}
const manifest = JSON.stringify({schema:'company-transfer',version:1,buildId:'123456789abc',files});
await fs.writeFile(path.join(bundle, 'transfer-manifest.json'), manifest);
const pin = hash(manifest);
await fs.cp(viewer, rebuild, {recursive:true,errorOnExist:true,force:false});

async function check(args, expectedExit) {
  let result;
  try {
    const {stdout} = await run(process.execPath, [verifier, bundle, ...args]);
    result = {exit:0, report:JSON.parse(stdout)};
  } catch (error) {
    result = {exit:error.code, report:JSON.parse(error.stdout || error.stderr)};
  }
  assert.equal(result.exit, expectedExit, JSON.stringify(result));
  return result.report;
}
assert.equal((await check([pin], 0)).checkedFiles, 3);
assert.equal((await check([pin, '--viewer', rebuild], 0)).checkedFiles, 3);
assert.match((await check([pin, '--viewer', viewer], 1)).message, /separate rebuilt/);
assert.match((await check(['0'.repeat(64), '--viewer', rebuild], 1)).message, /digest differs/);

await fs.writeFile(path.join(rebuild, 'model.glb'), 'Geometry');
await fs.unlink(path.join(rebuild, 'company.html'));
await fs.writeFile(path.join(rebuild, 'transfer-manifest.json'), manifest);
const mismatch = await check([pin, '--viewer', rebuild], 1);
assert.equal(mismatch.checkedFiles, 1);
assert.deepEqual([mismatch.changedFiles,mismatch.missingFiles,mismatch.extraFiles], [1,1,1]);
assert.deepEqual(mismatch.examples.map(x => x.issue + '/' + x.file).sort(),
  ['changed/model.glb', 'extra/transfer-manifest.json', 'missing/company.html']);
assert.equal((await check([pin], 0)).checkedFiles, 3);
console.log(JSON.stringify({ok:true, exactMatch:true, wrongManifestRejected:true, originalViewerRejected:true,
  mismatch, originalPreserved:true}, null, 2));
