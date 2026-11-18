import test from 'node:test';
import assert from 'node:assert/strict';
import {performCharacterProduction} from './character-production.js';

test('stable identity and request shape reject before any resource request',async()=>{
 const previous=globalThis.fetch;let requests=0;
 globalThis.fetch=()=>{requests++;throw Error('Unexpected I/O');};
 try{
  const create={schema:'character-production-request-v1',operation:'create',bodyType:'native-male-7586-v1',identity:{id:'producer-test',name:'test',gender:'unspecified'}};
  for(const id of [undefined,null,'CON','../escape','x'])await assert.rejects(performCharacterProduction({...create,identity:{...create.identity,id}}),error=>error.code==='production-input'&&error.field==='identity.id');
  await assert.rejects(performCharacterProduction({...create,edits:null}),error=>error.field==='edits');
  await assert.rejects(performCharacterProduction({...create,identity:{...create.identity,name:''}}),error=>error.field==='identity.name');
  await assert.rejects(performCharacterProduction({...create,unsupported:true}),error=>error.field==='request.unsupported');
  await assert.rejects(performCharacterProduction({...create,nativeHairCenter:{id:'stale'}}),/Native hair center fit/);
  await assert.rejects(performCharacterProduction({schema:create.schema,operation:'query',bodyType:create.bodyType,nativeHairCenter:null}),error=>error.field==='nativeHairCenter');
  await assert.rejects(performCharacterProduction({schema:create.schema,operation:'query',bodyType:create.bodyType,edits:[{domain:'outfit',index:0}]}),error=>error.field==='edits');
  assert.equal(requests,0);
 }finally{globalThis.fetch=previous;}
});
