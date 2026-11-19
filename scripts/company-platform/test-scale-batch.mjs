import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createAuthoringRunDirectory,runCompanyBatch} from './batch.mjs';
const directory=await createAuthoringRunDirectory('scale-batch');
const profile={id:'company-space-v2',version:1};
const input=(id,version=1)=>({id,spaceProfile:{...profile,version},scale:'small-home',floors:[{id:'ground',rooms:[{id:'studio',purpose:'streaming',stations:1}]}]});
const batch={schema:'company-batch',version:1,items:[
 {key:'first',input:input('batch-new-a')},
 {key:'second',input:{...input('batch-new-b'),scale:'single-room'}},
 {key:'retry',input:input('batch-new-retry',99)},
]};
const before=JSON.stringify(batch),first=await runCompanyBatch(batch,{outputDirectory:directory});
assert.equal(JSON.stringify(batch),before);
assert.deepEqual(first.results.map(r=>r.status),['created','created','failed']);
assert.equal(first.results[2].code,'unsupported-space-profile');
const digest=async name=>createHash('sha256').update(await fs.readFile(`${directory}/${name}/save.json`)).digest('hex');
const pins=await Promise.all(['first','second'].map(digest));
const repeated=await runCompanyBatch(batch,{outputDirectory:directory});
assert.deepEqual(repeated.results.map(r=>r.status),['idempotent','idempotent','failed']);
batch.items[2].input.spaceProfile.version=1;
const retry=await runCompanyBatch(batch,{outputDirectory:directory,only:'retry'});
assert.deepEqual(retry.results.map(r=>r.status),['created']);
assert.deepEqual(await Promise.all(['first','second'].map(digest)),pins);
for(const key of ['first','second','retry']){
 const d=JSON.parse(await fs.readFile(`${directory}/${key}/layout.json`));
 assert.deepEqual(d.spaceProfile,profile);
 const r=JSON.parse(await fs.readFile(`${directory}/${key}/report.json`));
 assert(r.sourceHashes['prototype/src/company/scale-profile.js']);assert(r.sourceHashes['prototype/src/company/scale-v2.js']);
}
await fs.writeFile(path.join(directory,'report.json'),JSON.stringify({status:'passed',first,repeated,retry,unchangedSuccessfulSaves:pins,scope:'Explicit v2 batch generation, deterministic repeats and single-item failure retry. Browser and legacy results are separate.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',directory}));
