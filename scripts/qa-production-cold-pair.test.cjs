const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {selection,changeOneByte}=require('./qa-production-cold-pair.cjs');

test('only the sole published body and original pair select the VRM route',async()=>{
 const records=JSON.parse(await fs.readFile(path.join(__dirname,'../evidence/m2-frozen-rule-game-v1/records.json')));
 const bodyType=records[0].appearanceRecipe.base.bodyType;
 const manifest={entries:records.map(r=>({id:r.identity.id,url:'/records/'+r.identity.id+'.json',recordSha256:r.integrity.recordSha256})),
  ruleBodyDataPacks:[{bodyType,url:'/character-data/'+bodyType+'/index.json'}]};
 const picked=selection(manifest,records);
 assert.equal(picked.bodyPath,'/assets/'+bodyType+'/body.vrm');
 assert.equal(picked.old.integrity.recordSha256,records[1].integrity.recordSha256);
 assert.throws(()=>selection(manifest,records.toReversed()));
 for(const id of ['../../escape','rule-body-AAAAAAAAAAAAAAAAAAAA']){
  assert.throws(()=>selection({...manifest,ruleBodyDataPacks:[{bodyType:id,url:'/character-data/'+id+'/index.json'}]},records));
 }
 const broken=structuredClone(manifest);broken.entries[0].recordSha256='0'.repeat(64);
 assert.throws(()=>selection(broken,records));
});

test('tampering requires the pinned response, changes one byte and preserves the original',()=>{
 const original=Buffer.from([103,108,84,70,0,255]), copy=Buffer.from(original);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const {bytes,proof}=changeOneByte(original,hash(original));
 assert.deepEqual(original,copy);
 assert.equal(bytes.length,original.length);
 assert.equal(bytes.filter((b,i)=>b!==original[i]).length,1);
 assert.equal(proof.offset,5);assert.equal(proof.changedSha256,hash(bytes));
 assert.equal(proof.originalByte,255);assert.equal(proof.changedByte,254);
 assert.throws(()=>changeOneByte(bytes,proof.originalSha256),/signed body/);
});
