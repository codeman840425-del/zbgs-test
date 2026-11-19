const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {selection,garmentAssets,changeOneByte,checkWave}=require('./qa-production-cold-pair.cjs');

const pointer=bodyType=>({bodyType,url:'/character-data/'+bodyType+'/index.json',sha256:'a'.repeat(64),bytes:1024});
const manifestFor=(records,packs)=>({schema:'character-record-input-v1',
 entries:records.map(r=>({id:r.identity.id,url:'/records/'+r.identity.id+'.json',recordSha256:r.integrity.recordSha256})),
 ruleBodyDataPacks:packs});

test('only the sole published body and original pair select the VRM route',async()=>{
 const records=JSON.parse(await fs.readFile(path.join(__dirname,'../evidence/m2-frozen-rule-game-v1/records.json')));
 const bodyType=records[0].appearanceRecipe.base.bodyType;
 const manifest=manifestFor(records,[pointer(bodyType)]);
 const picked=selection(manifest,records);
 assert.equal(picked.mode,'external-and-bundled');
 assert.equal(picked.bodyPath,'/assets/'+bodyType+'/body.vrm');
 assert.equal(picked.old.integrity.recordSha256,records[1].integrity.recordSha256);
 assert.throws(()=>selection(manifest,records.toReversed()));
 for(const id of ['../../escape','rule-body-AAAAAAAAAAAAAAAAAAAA']){
  assert.throws(()=>selection({...manifest,ruleBodyDataPacks:[pointer(id)]},records));
 }
 const broken=structuredClone(manifest);broken.entries[0].recordSha256='0'.repeat(64);
 assert.throws(()=>selection(broken,records));
});

test('two distinct published body pointers select by signed record order and retain the peer',async()=>{
 const records=JSON.parse(await fs.readFile(path.join(__dirname,'../evidence/m2-first-rule-delivery-v1/game/signed.json')));
 const [first,second]=records.map(r=>r.appearanceRecipe.base.bodyType);
 const manifest=manifestFor(records,[pointer(second),pointer(first)]);
 const selected=selection(manifest,records);
 assert.equal(selected.mode,'dual-external');
 assert.deepEqual(selected.published.map(r=>[r.id,r.bodyType,r.index.bodyType]),[[records[0].identity.id,first,first],[records[1].identity.id,second,second]]);
 assert.equal(selected.fresh.integrity.recordSha256,records[0].integrity.recordSha256);
 assert.equal(selected.bodySha,records[0].appearanceRecipe.base.sha256);
 assert.equal(selected.old.integrity.recordSha256,records[1].integrity.recordSha256);
 const shared=garmentAssets(records);
 assert.equal(shared.sameSelectedAssetBytes,true);
 assert.deepEqual(shared.shared.map(asset=>asset.slot),['bottom','shoes','top']);

 assert.throws(()=>selection({...manifest,ruleBodyDataPacks:[pointer(first),pointer(first)]},records),/duplicate body pointer/);
 assert.throws(()=>selection({...manifest,ruleBodyDataPacks:[pointer(first),pointer('rule-body-'+'f'.repeat(20))]},records),/one selected record/);
 const wrong=structuredClone(records);
 wrong[1].appearanceRecipe.base.sha256='0'.repeat(64);
 assert.throws(()=>selection(manifest,wrong));
 wrong[1].appearanceRecipe.base=wrong[0].appearanceRecipe.base;
 assert.throws(()=>selection(manifestFor(wrong,[pointer(first)]),wrong),/own body type/);
 const different=structuredClone(records);
 Object.values(different[1].appearanceRecipe.equipment.resources).find(item=>item.slot==='top').sha256='0'.repeat(64);
 assert.equal(garmentAssets(different).sameSelectedAssetBytes,false);
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

test('a greeting receipt requires the actual signed gesture, wrist lift and completed return',()=>{
 const requestId='published-cold-wave-fixture',gesture={requestId,
  sha256:'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06',status:'completed',weight:0,error:null,time:2.8,duration:2.8};
 const result={id:'fixture',requestId,gesture,after:{...gesture},samples:40,drawFrames:40,settledFrames:8,
  maximumWeight:1,peakWristDisplacementM:0.22,maxSettledDisplacementM:0.03};
 assert.doesNotThrow(()=>checkWave(result,'fixture'));
 assert.throws(()=>checkWave({...result,after:{...gesture,weight:.2}},'fixture'));
 assert.throws(()=>checkWave({...result,maxSettledDisplacementM:.15},'fixture'),/did not return/);
 assert.throws(()=>checkWave({...result,peakWristDisplacementM:.02},'fixture'),/did not lift/);
 assert.throws(()=>checkWave({...result,gesture:{...gesture,sha256:'0'.repeat(64)}},'fixture'));
});
