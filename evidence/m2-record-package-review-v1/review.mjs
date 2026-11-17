import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecordInventory,exportRecordInventory} from '../../scripts/runtime-package/record-inventory.mjs';
import {createInventory,exportInventory} from '../../scripts/runtime-package/inventory.mjs';
import {digest} from '../../scripts/runtime-package/files.mjs';
import {parseRuntimeCharacterRecord} from '../../prototype/src/character-runtime-record.js';
import {updateCharacterRecord} from '../../prototype/src/character-record.js';

const root = fileURLToPath(new URL('../../',import.meta.url));
const checkout = path.join(root,'experiments/m2-character-material-release-v1');
const dist = path.join(checkout,'prototype/dist');
const old = path.join(root,'experiments/m2-lazy-outfit-fixed-801');
const read = async pathname => JSON.parse(await readFile(pathname));
const reviewed = await read(path.join(root,'scripts/runtime-package/record-runtime-reviewed.json'));
const actual = {};
for (const [pathname, declaration] of Object.entries(reviewed.files)) {
  const bytes=await readFile(path.join(dist,pathname));
  assert.equal(bytes.length,declaration.bytes,pathname);
  assert.equal(digest(bytes),declaration.sha256,pathname);
  actual[pathname]=declaration.sha256;
}
const historical = await read(path.join(root,'evidence/m2-character-runtime-fixed-v1/records/native-female-face-v1-record-a.json'));
const checkRecord = async record => {
  const inventory=await createRecordInventory({record,dist,sourceRoot:checkout});
  const roomFiles=Object.keys(actual).filter(name=>!name.startsWith('assets/foundation-'));
  assert.ok(roomFiles.every(name=>inventory.files.some(row=>row.path===name)));
  for (const row of inventory.files.filter(row=>row.path==='build-info.json'||/\.(js|css)$/.test(row.path))) {
    assert.ok(row.provenance.some(ref=>ref.bundlePath===row.path&&ref.buildId===reviewed.sourceDigest.slice(0,12)));
    assert.ok(!row.provenance.some(ref=>ref.sourcePath==='prototype/index.html'));
  }
  const payload=inventory.files.find(row=>row.path==='character-record.json');
  console.log('transport',Buffer.byteLength(JSON.stringify(record)),payload.bytes);
  return {bytes:payload.bytes,parsed:parseRuntimeCharacterRecord(payload.generated),files:inventory.files.length};
};
const standard=await checkRecord(historical);
assert.deepEqual(standard.parsed,historical);
console.log('reviewed-entry-files',Object.keys(actual).length,'native-closure',standard.files,'native-bytes',standard.bytes);
const modified=await createRecordInventory({record:historical,dist,sourceRoot:checkout});
modified.files=modified.files.filter(row=>!row.path.endsWith('native-tops-body.png'));
assert.ok(modified.files.length < standard.files);
await assert.rejects(exportRecordInventory({inventory:modified,dist,sourceRoot:checkout}),error=>error.code==='inventory-mismatch');
console.log('deleted-mask-declaration','rejected before output');
const previous = await createInventory({
  input:await read(path.join(root,'scripts/runtime-package/fixtures/male-outer-shorts.json')),
  sourceRoot:old,dist:path.join(old,'prototype/dist'),
});
assert.equal(previous.schema,'runtime-package-inventory-v1');
assert.ok(previous.files.some(row=>row.path==='selected-appearance.recipe.json') && previous.files.some(row=>row.path==='material-selections.json'));
console.log('old-adapter',previous.adapter,'files',previous.files.length);
const temp = await mkdtemp(path.join(tmpdir(),'gamemake-record-package-review-'));
try {
  await writeFile(path.join(temp,'build-info.json'),'invalid metadata');
  await assert.rejects(createRecordInventory({record:historical,dist:temp,sourceRoot:path.join(temp,'no-source')}),error=>error.code==='modified-dependency');
  console.log('changed-build-metadata','rejected before parsing or reading source');
  const out=path.join(temp,'package');
  const result=await exportInventory({inventory:previous,dist:path.join(old,'prototype/dist'),sourceRoot:old,out});
  assert.equal(result.files,previous.files.length+1);
  const check=await read(path.join(out,'runtime-package.json'));
  assert.deepEqual(check,previous);
  console.log('old-export',result.files);
} finally {
  await rm(temp,{force:true,recursive:true});
}

// A valid producer can attach notes to record provenance. Compact transport
// stays within the actual workbench cap even when the notes are fairly long.
const extended = await updateCharacterRecord(historical,{
  provenance:{...historical.provenance,productionNotes:'A'.repeat(244 * 1024)},
}, {},{validateResources:()=>({status:'pending'})});
const compact=JSON.stringify(extended);
assert.deepEqual(parseRuntimeCharacterRecord(compact),extended);
const large=await checkRecord(extended);
assert.deepEqual(large.parsed,extended);
console.log('long-provenance-input',Buffer.byteLength(compact),'output',large.bytes);

const boundary = await updateCharacterRecord(historical,{
  provenance:{...extended.provenance,productionNotes:'A'.repeat(extended.provenance.productionNotes.length + 512*1024-Buffer.byteLength(compact))},
}, {},{validateResources:()=>({status:'pending'})});
assert.equal(Buffer.byteLength(JSON.stringify(boundary)),512*1024);
const exact = await checkRecord(boundary);
assert.deepEqual(exact.parsed,boundary);
console.log('exact-boundary',exact.bytes);
