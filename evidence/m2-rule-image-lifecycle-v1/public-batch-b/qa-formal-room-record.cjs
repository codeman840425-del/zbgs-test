const assert=require('node:assert/strict');
const {parseArgs}=require('node:util');
const {browserConfigArgs}=require('./qa-browser-config-args.cjs');

function roomOptions(args) {
  const {remaining,launchOptions}=browserConfigArgs(args);
  const {values}=parseArgs({args:remaining,options:{'rule-body-data':{type:'boolean'},
    'build-sha256':{type:'string',multiple:true},'record-id':{type:'string',multiple:true},'record-sha256':{type:'string',multiple:true}}});
  const required=['record-id','record-sha256','build-sha256'];
  if(!values['rule-body-data']){
    assert(!required.some(k=>values[k]),'Identity pins require --rule-body-data');
    return {launchOptions};
  }
  assert(launchOptions.browserConfig,'--rule-body-data requires --browser-config');
  for(const k of required)assert(values[k]?.length===1 && values[k][0], 'Expected one --'+k);
  const [id]=values['record-id'], [recordSha]=values['record-sha256'], [buildSha]=values['build-sha256'];
  for(const hash of [recordSha,buildSha])assert.match(hash,/^[a-f0-9]{64}$/);
  return {launchOptions,pins:{id,recordSha,buildSha}};
}

async function checkInput(record,pins) {
  const {validateCharacterRecord}=await import('../prototype/src/character-record.js');
  await validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})});
  assert.equal(record.identity.id,pins.id,'Wrong signed record ID');
  assert.equal(record.integrity.recordSha256,pins.recordSha,'Wrong signed record digest');
  const {sha256,bodyType}=record.appearanceRecipe.base;
  assert.equal(bodyType,'rule-body-'+sha256.slice(0,20),'Expected a published rule body');
}

function checkBuild(build,pins) {
  assert.equal(build.sourceDigest,pins.buildSha,'Wrong running build digest');
  assert.equal(build.shortId,pins.buildSha.slice(0,12),'Wrong running build ID');
}

function checkRestore(restored,record) {
  assert.equal(restored.applied,true);
  assert.deepEqual(restored.identity,record.identity);
  assert.equal(restored.recordSha256,record.integrity.recordSha256);
  assert.equal(restored.revision,record.revision);
}

async function readActor(page,record) {
  const state=await page.evaluate(()=>{
    const avatar=__debug.avatar(), outfit=avatar.getOutfitInfo();
    return {root:avatar.root.uuid,head:avatar.vrm.humanoid.getRawBoneNode('head').uuid,
      attached:!!avatar.root.parent,base:{bodyType:avatar.profile.bodyType,sha256:avatar.profile.sha256},
      manifestUrl:avatar.config.manifestUrl,visible:Object.values(outfit.equipment.items).filter(i=>i.visible).map(i=>i.id).sort(),
      equipment:Object.values(avatar.getEquipmentRecipe(outfit.index)).map(({id,slot,url,sha256,compatibleAvatarSha256})=>
        ({id,slot,url:new URL(url,new URL(avatar.config.manifestUrl,location.href)).pathname,sha256,compatibleAvatarSha256}))};
  });
  const recipe=record.appearanceRecipe;
  assert(state.root && state.head && state.attached,'Missing a live actor or skeleton');
  assert.deepEqual(state.base,recipe.base,'Wrong running body');
  assert.equal(state.manifestUrl,recipe.equipment.manifestUrl,'Wrong equipment manifest');
  const selected=Object.values(recipe.equipment.resources).map(({id,slot,url,sha256,compatibleAvatarSha256})=>
    ({id,slot,url,sha256,compatibleAvatarSha256}));
  const order=(a,b)=>a.slot.localeCompare(b.slot);
  assert.deepEqual(state.equipment.sort(order),selected.sort(order),'Wrong equipped items');
  assert.deepEqual(state.visible,selected.map(i=>i.id).sort(),'Wrong visible equipment');
  return state;
}

module.exports={roomOptions,checkInput,checkBuild,checkRestore,readActor};
