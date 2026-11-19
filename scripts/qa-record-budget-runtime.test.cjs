const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {once}=require('node:events');
const {createServer}=require('node:http');
const test=require('node:test');
const {parseArgs,ordinaryInput}=require('./qa-record-budget-runtime.cjs');

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pin=(path,value)=>({path,bytes:Buffer.byteLength(value),sha256:digest(value)});

test('budget CLI preserves the default and forwards explicit browser configuration',()=>{
  const basic=['http://127.0.0.1:1/','records.json','output','60e3934ddd8a'];
  assert.deepEqual(parseArgs(basic).launchOptions,{channel:'chrome'});
  const sha='a'.repeat(64);
  const options=parseArgs([...basic,'--ordinary-package',sha,'--browser-config','cf145.json']);
  assert.equal(options.manifestSha,sha);
  assert.deepEqual(options.launchOptions,{browserConfig:'cf145.json'});
  assert.throws(()=>parseArgs([...basic,'--ordinary-package','bad']),/Usage/);
  assert.throws(()=>parseArgs([...basic,'--browser-config','one','--browser-config','two']),/Expected one/);
});

test('ordinary preflight pins both signed record identities, the manifest, body indexes and equipment', async t=>{
  const files=[];
  const equipment=Object.fromEntries(['top','shoes','bottom'].map(slot=>{
    const row=pin(`assets/${slot}.glb`,slot);files.push(row);
    return [slot,{id:slot,slot,url:'/'+row.path,sha256:row.sha256}];
  }));
  const records=['first','second'].map(id=>{
    const model=pin(`assets/${id}/body.vrm`,id);files.push(model);
    return {identity:{id},integrity:{recordSha256:digest('record '+id)},appearanceRecipe:{
      base:{bodyType:id,sha256:model.sha256},equipment:{resources:equipment}}};
  });
  const ruleBodyDataPacks=records.map(({identity:{id}})=>{
    const index=pin(`character-data/${id}/index.json`,id);files.push(index);
    return {bodyType:id,url:'/'+index.path,sha256:index.sha256,bytes:index.bytes};
  });
  let manifest=JSON.stringify({schema:'character-record-input-v1',ruleBodyDataPacks,
    entries:records.map(({identity:{id},integrity:{recordSha256}})=>({id,url:`/records/${id}.json`,recordSha256}))});
  files.push(pin('records/manifest.json',manifest));
  const buildId='60e3934ddd8a';
  const game=JSON.stringify({schema:'game-character-record-package-v1',runtime:{buildId,
    entryUrl:'record-consumer.html?records=/records/manifest.json'},records:records.map(record=>({
      id:record.identity.id,recordSha256:record.integrity.recordSha256,bodyType:record.appearanceRecipe.base.bodyType,
      avatarSha256:record.appearanceRecipe.base.sha256})),files});
  const server=createServer((req,res)=>{
    const body={'/runtime-package.json':game,'/records/manifest.json':manifest}[req.url];
    res.writeHead(body?200:404);res.end(body);
  }).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/`;
  const actual=await ordinaryInput(base,digest(game),buildId,records);
  assert.equal(actual.entry,base+'record-consumer.html?records=/records/manifest.json');
  assert.deepEqual(actual.ruleBodyDataPacks,ruleBodyDataPacks);
  assert.deepEqual(actual.actors.map(a=>a.body),['/assets/first/body.vrm','/assets/second/body.vrm']);
  assert.deepEqual(actual.actors[0].equipment.map(i=>i.slot),['bottom','shoes','top']);
  const changed=structuredClone(records);changed[1].integrity.recordSha256=digest('changed');
  await assert.rejects(ordinaryInput(base,digest(game),buildId,changed),{code:'ERR_ASSERTION'});
  await assert.rejects(ordinaryInput(base,digest('wrong manifest'),buildId,records),/Package manifest SHA mismatch/);
  manifest+=' ';
  await assert.rejects(ordinaryInput(base,digest(game),buildId,records),/Record manifest SHA mismatch/);
});
