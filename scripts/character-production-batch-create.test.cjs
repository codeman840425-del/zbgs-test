const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const {batchCreates,parseRequest,BATCH_CREATE_SCHEMA}=require('./character-production-cli.cjs');
const {produceBatch,verifyCreatedRecord}=require('./character-production-browser.cjs');

const job=id=>({schema:'character-production-request-v1',operation:'create',bodyType:'male',
 identity:{id,name:id,gender:'unspecified'}});
const batch=(...requests)=>({schema:BATCH_CREATE_SCHEMA,requests});

test('batch create accepts one through four independent requests in order and rejects invalid envelopes',async()=>{
 for(const count of [1,2,3,4]){
  const requests=Array.from({length:count},(_,index)=>job('create-'+index));
  assert.deepEqual(await batchCreates(parseRequest(Buffer.from(JSON.stringify(batch(...requests))))),requests);
 }
 for(const input of [batch(),batch(...Array(5).fill(job('five'))),{...batch(job('ok')),edits:[]}]){
  await assert.rejects(batchCreates(input),{code:'invalid-batch-create',field:'requests'});
 }
 const first=job('first'),second=job('second');
 for(const [invalid,field] of [[first,'identity.id'],[job('manifest'),'identity.id'],[job('CON'),'identity.id'],
  [{...second,operation:'edit'},'request'],[{...second,record:{}},'request'],[{...second,bodyType:''},'bodyType'],
  [{...second,edits:{}},'edits'],[{...second,identity:{id:'second',gender:'unspecified'}},'identity.name'],
  [{...second,edits:[{domain:'appearance',unused:'x'.repeat(1024**2)}]},'request']]){
  await assert.rejects(batchCreates(batch(first,invalid)),{code:'invalid-batch-create',field,itemIndex:1,recordId:invalid.identity.id});
 }
});

test('two CPU-created characters restore the requested outfits in order; a failed second job yields no records',async()=>{
 const hook=registerHooks({load(url,context,next){
  return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);
 }});
 try{
  const {THREE}=await import('./headless-avatar-node.mjs');
  const {performCharacterProduction}=await import('../prototype/src/character-production.js');
  const {prepareRecordedCharacter}=await import('../prototype/src/character-record-consumer.js');
  const env={scene:new THREE.Scene(),renderer:{}};
  const first=job('test-first'),second=job('test-second');
  const {query}=await performCharacterProduction({schema:first.schema,operation:'query',bodyType:first.bodyType},env);
  const outfit=query.appearance.equipment.sets.find(set=>set.role==='shorts');
  const equipment=Object.values(outfit.resources).map(({id,slot,sha256})=>({id,slot,sha256})).reverse();
  second.edits=[{domain:'outfit',selection:{role:outfit.role,bodySha256:query.body.sha256,equipment}}];
  const jobs=await batchCreates(batch(first,second)),items=[];
  async function produce(request){
   const result=await performCharacterProduction(request,env);
   verifyCreatedRecord(request,result.record);
   const actor=await prepareRecordedCharacter(result.record,env);
   try{
    const readback=await actor.capture();
    assert.equal(actor.revision,1);
    assert.equal(actor.recordSha256,result.record.integrity.recordSha256);
    for(const key of ['identity','appearanceRecipe','resourceIdentities','liveAccessories','nativeHairCenter','equipmentMaterials'])
     assert.deepEqual(readback[key],result.record[key],key);
   }finally{actor.dispose();}
   return result;
  }
  const records=await produceBatch(jobs,items,'',produce);
  assert.deepEqual(records.map(r=>[r.identity.id,r.revision,r.appearanceRecipe.equipment.index]),
   [['test-first',1,0],['test-second',1,outfit.index]]);
  assert.deepEqual(items,[{index:0,id:'test-first'},{index:1,id:'test-second'}]);
  assert.throws(()=>verifyCreatedRecord(second,{...records[1],revision:2}),/created revision/);
  assert.throws(()=>verifyCreatedRecord(first,records[1]),/created identity/);
  const wrong=structuredClone(second);
  wrong.edits[0].selection.equipment[0].sha256='0'.repeat(64);
  assert.throws(()=>verifyCreatedRecord(wrong,records[1]),/created outfit resources/);
  const oldOutput=JSON.stringify(records);
  let output=oldOutput;
  const failed=[];
  await assert.rejects(async()=>{
   output=JSON.stringify(await produceBatch(await batchCreates(batch(first,wrong,job('never-reached'))),failed,'',produce));
  },{itemIndex:1,recordId:'test-second',editIndex:0,field:'outfit.selection'});
  assert.equal(output,oldOutput);
  assert.deepEqual(failed,items);
  assert.equal(env.scene.children.length,0);
 }finally{hook.deregister();}
});
