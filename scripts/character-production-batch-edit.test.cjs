const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {batchEdits, parseRequest, BATCH_SCHEMA} = require('./character-production-cli.cjs');

const request = {schema:BATCH_SCHEMA, edits:[{domain:'appearance',values:{skinTone:'native-warm-v1'}}],
  records:['native-contour-roundness-a-v1','native-contour-cheek-b-v1'].map(name =>
    JSON.parse(readFileSync(path.join(__dirname,'../evidence/m2-native-batch-iris-room-v2',name,'green.json'),'utf8')))};

test('shared edit uses ordered unchanged signed inputs', async () => {
  const before=JSON.stringify(request);
  const jobs=await batchEdits(request);
  assert.deepEqual(jobs.map(j=>j.record.identity.id),request.records.map(r=>r.identity.id));
  assert(jobs.every(job=>job.operation==='edit'&&job.schema==='character-production-request-v1'&&job.edits===request.edits));
  assert.equal(JSON.stringify(request),before);
});

test('duplicate and corrupt records identify the failing item', async () => {
  const [first, second]=request.records;
  await assert.rejects(batchEdits({...request,records:[first,first]}),{code:'invalid-batch-edit',itemIndex:1,recordId:first.identity.id});
  await assert.rejects(batchEdits({...request,records:[first,{...second,revision:second.revision+1}]}),
    {code:'record-hash-mismatch',itemIndex:1,recordId:second.identity.id});
});

test('count, scope and shared edit structure are bounded', async () => {
  for(const invalid of [{records:[]},{records:Array(5).fill(request.records[0])},{edits:[]},
    {edits:Array(33).fill(request.edits[0])},{edits:[null]},{operation:'create'}]){
    await assert.rejects(batchEdits({...request,...invalid}),{code:'invalid-batch-edit'});
  }
});

test('existing one MiB single-request limit is preserved', () => {
  assert.deepEqual(parseRequest(Buffer.from('{"operation":"edit"}')),{operation:'edit'});
  assert.throws(()=>parseRequest(Buffer.from('{"operation":"edit"}'+' '.repeat(1024**2))),/Single production request/);
  assert.throws(()=>parseRequest(Buffer.alloc(3*1024**2+1)),/too large/);
  assert.equal(parseRequest(Buffer.from(JSON.stringify(request)+' '.repeat(1024**2))).schema,BATCH_SCHEMA);
});
