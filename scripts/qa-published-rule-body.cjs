const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');

const digest=buffer=>createHash('sha256').update(buffer).digest('hex');

async function publishedInputs(args,records) {
  if (!args.length) return null;
  const [mode,indexSha256,originalFile]=args;
  assert(args.length===3 && mode==='--published' && /^[0-9a-f]{64}$/.test(indexSha256),
    'Expected --published VERIFIED_INDEX_SHA ORIGINAL_SIGNED_RECORD_OR_ARRAY');
  const original=JSON.parse(await fs.readFile(originalFile)), originals=[original].flat();
  const previous=records.filter(record=>originals.some(r=>r.integrity.recordSha256===record.integrity.recordSha256));
  assert.equal(previous.length,1,'Exactly one selected record must match a previously signed record');
  const [old]=previous;
  assert.deepEqual(old,originals.find(r=>r.integrity.recordSha256===old.integrity.recordSha256));
  const fresh=records.find(r=>r!==old);
  assert(fresh && fresh.identity.id!==old.identity.id &&
    fresh.appearanceRecipe.base.bodyType!==old.appearanceRecipe.base.bodyType);
  return {indexSha256,old,fresh};
}

async function publication(network,origin,files,selection,signed) {
  const urls=new Set();
  async function actual(url) {
    const pin=files.get(url);
    assert(pin,'Missing package file '+url);
    const response=await network.read(new URL(url,origin).href);
    assert.equal(response.bytes.length,pin.bytes);
    assert.equal(digest(response.bytes),pin.sha256);
    urls.add(url);
    return JSON.parse(response.bytes);
  }
  const manifest=await actual('/records/manifest.json');
  assert.equal(manifest.schema,'character-record-input-v1');
  assert.equal(manifest.ruleBodyDataPacks?.length,1);
  const [ptr]=manifest.ruleBodyDataPacks;
  const {bodyType,sha256:bodySha}=selection.fresh.appearanceRecipe.base;
  assert.equal(bodyType,'rule-body-'+bodySha.slice(0,20));
  const folder='/character-data/'+bodyType+'/';
  assert.deepEqual(ptr,{bodyType,url:folder+'index.json',sha256:selection.indexSha256,bytes:files.get(folder+'index.json')?.bytes});
  assert.equal(files.get(ptr.url).sha256,ptr.sha256);
  const index=await actual(ptr.url);
  assert.equal(index.schema,'shape-data-pack-v1');
  assert.equal(index.bodyType,bodyType);
  assert.equal(index.files.length,8);
  const names=new Set();
  for (const pin of index.files) {
    assert(!names.has(pin.path));names.add(pin.path);
    const url=pin.path.startsWith('assets/')?'/'+pin.path:folder+pin.path;
    const file=files.get(url);
    assert(file && file.bytes===pin.bytes && file.sha256===pin.sha256,'Wrong packaged data '+url);
    urls.add(url);
  }
  const profile=await actual(folder+'profile.json');
  const recipe=await actual(folder+'recipe.json');
  const fit=await actual(folder+'fit.json');
  for (const key of ['profile','recipe','fit']) {
    const pin=index[key];assert.equal(pin.path,key+'.json');
    assert.deepEqual(pin,index.files.find(row=>row.path===pin.path));
  }
  assert.equal(profile.id,bodyType);assert.equal(profile.sha256,bodySha);
  assert.equal(fit.bodyType,bodyType);assert.equal(fit.bodySha256,bodySha);
  assert.equal(fit.templateSha256,recipe.template.sha256);
  assert.equal(fit.recipeSha256,index.recipeSha256);
  assert.equal(fit.manifestSha256,profile.manifestSha256);
  assert.equal(manifest.entries.length,signed.length);
  for (const [i,entry] of manifest.entries.entries()) {
    assert.deepEqual(entry,{id:signed[i].identity.id,url:'/records/'+signed[i].identity.id+'.json',
      recordSha256:signed[i].integrity.recordSha256});
    assert.deepEqual(await actual(entry.url),signed[i]);
  }
  return {urls:[...urls],bodyType,indexSha256:ptr.sha256,recipeWeight:recipe.weight,
    oldId:selection.old.identity.id,oldRecordSha256:selection.old.integrity.recordSha256};
}

async function oldSurvivor(page,selection) {
  return page.evaluate(async ({fresh,old})=>{
    const game=window.__recordConsumer;
    const actor=game.actors.get(old),root=actor.avatar.root.uuid;
    if (!game.removeActor(fresh) || game.actors.size!==1 || game.actors.get(old)!==actor ||
        actor.avatar.root.parent!==game.scene) throw Error('Old actor lost after removing external actor');
    const before=game.renderer.info.render.frame;
    for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);
    const captured=await actor.capture();
    return {id:actor.identity.id,root,bodySha256:actor.avatar.profile.sha256,recordSha256:actor.recordSha256,
      renderedFrames:game.renderer.info.render.frame-before,appearanceRecipe:captured.appearanceRecipe,
      liveAccessories:captured.liveAccessories};
  },{fresh:selection.fresh.identity.id,old:selection.old.identity.id});
}
module.exports={publishedInputs,publication,oldSurvivor};
