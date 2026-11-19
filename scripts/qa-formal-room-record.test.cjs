const assert=require('node:assert/strict');
const test=require('node:test');
const {roomOptions,checkBuild,checkInput,checkRestore,readActor}=require('./qa-formal-room-record.cjs');
const [a,b]=require('../evidence/m2-rule-batch-delivery-v1/records.json');
const digest='ab'.repeat(32);
const flags=['--rule-body-data','--browser-config','reviewed.json','--build-sha256',digest,
             '--record-id',a.identity.id,'--record-sha256',a.integrity.recordSha256];

test('published room requires an explicit original identity, deployment and complete build digest',async()=>{
  assert.deepEqual(roomOptions([]),{launchOptions:{channel:'chrome'}});
  for(const key of ['--record-id','--record-sha256','--build-sha256','--browser-config']){
    const args=flags.slice(), index=args.indexOf(key);args.splice(index,2);
    assert.throws(()=>roomOptions(args));
  }
  const {pins}=roomOptions(flags);
  await checkInput(a,pins);
  await assert.rejects(checkInput(b,pins),/Wrong signed record ID/);
  await assert.rejects(checkInput(b,{...pins,id:b.identity.id}),/Wrong signed record digest/);
  assert.throws(()=>checkBuild({shortId:digest.slice(0,12),sourceDigest:digest.slice(0,12)+'1'.repeat(52)},pins),/Wrong running build/);
  assert.throws(()=>checkRestore({applied:true,identity:a.identity,recordSha256:b.integrity.recordSha256},a));
});

test('a different visible or declared garment cannot satisfy the exact room check',async()=>{
  const recipe=a.appearanceRecipe, eq=recipe.equipment;
  const items=Object.values(eq.resources).map(({id,slot,url,sha256,compatibleAvatarSha256})=>({id,slot,url,sha256,compatibleAvatarSha256}));
  const row={root:'root',head:'head',attached:true,base:recipe.base,manifestUrl:eq.manifestUrl,
    visible:items.map(i=>i.id).sort(),equipment:items};
  await readActor({evaluate:async()=>structuredClone(row)},a);
  const changed=structuredClone(row);
  changed.equipment[0].sha256='0'.repeat(64);
  await assert.rejects(readActor({evaluate:async()=>changed},a),/Wrong equipped items/);
  await assert.rejects(readActor({evaluate:async()=>({...row,visible:[]})},a),/Wrong visible equipment/);
});
