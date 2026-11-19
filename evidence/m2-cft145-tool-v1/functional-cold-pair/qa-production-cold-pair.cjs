const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot,projectOutput} = require('./project-output.cjs');
const {launchQABrowser,resolveBrowserConfig} = require('./qa-browser-workspace.cjs');
const {oldSurvivor} = require('./qa-published-rule-body.cjs');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = 'record-consumer.html?records=/records/manifest.json';
const timeout = {timeout:120000};

function selection(manifest, records) {
  assert.equal(records.length,2);
  assert.notEqual(records[0].identity.id,records[1].identity.id);
  assert.deepEqual(manifest.entries,records.map(r=>({id:r.identity.id,url:'/records/'+r.identity.id+'.json',recordSha256:r.integrity.recordSha256})));
  assert.equal(manifest.ruleBodyDataPacks.length,1);
  const [{bodyType,url}] = manifest.ruleBodyDataPacks;
  assert.match(bodyType,/^rule-body-[a-f0-9]{20}$/);
  assert.equal(url,'/character-data/'+bodyType+'/index.json');
  const [fresh,...others] = records.filter(r=>r.appearanceRecipe.base.bodyType===bodyType);
  assert(fresh && !others.length,'One selected record must use the published body');
  const bodySha = fresh.appearanceRecipe.base.sha256;
  assert.match(bodySha,/^[a-f0-9]{64}$/);
  assert.equal(bodyType,'rule-body-'+bodySha.slice(0,20));
  return {fresh,old:records.find(r=>r!==fresh),bodySha,bodyPath:'/assets/'+bodyType+'/body.vrm'};
}

function changeOneByte(original,expected) {
  assert(original.length>0 && digest(original)===expected,'Original server response differs from the signed body');
  const bytes = Buffer.from(original), offset = bytes.length-1;
  bytes[offset] ^= 1;
  return {bytes,proof:{originalSha256:expected,changedSha256:digest(bytes),offset,
    originalByte:original[offset],changedByte:bytes[offset],bytes:bytes.length}};
}

async function capturePair(page,records) {
  const {canonicalJson} = await import('../prototype/src/character-record.js');
  const {resolveGarmentMaterials} = await import('../prototype/src/garment-material-record.js');
  assert.deepEqual(await page.evaluate(()=>__recordConsumer.records),records);
  const actual = await page.evaluate(async ()=>{
    const game = __recordConsumer;
    const rows=[];
    for(const actor of game.actors.values()){
      const avatar=actor.avatar, outfit=avatar.getOutfitInfo();
      const selected=Object.values(avatar.getEquipmentRecipe(outfit.index)).map(item=>({
        id:item.id,slot:item.slot,sha256:item.sha256,compatibleAvatarSha256:item.compatibleAvatarSha256,
        url:new URL(item.url,new URL(avatar.config.manifestUrl,location.href)).pathname}));
      rows.push({id:actor.identity.id,sha:actor.recordSha256,body:avatar.profile.sha256,bodyUrl:avatar.profile.url,
        root:avatar.root.uuid,head:avatar.vrm.humanoid.getRawBoneNode('head').uuid,attached:avatar.root.parent===game.scene,
        visible:Object.values(outfit.equipment.items).filter(i=>i.visible).map(i=>i.id).sort(),
        selected,captured:await actor.capture()});
    }
    return {rows,batch:game.snapshot()?.items.map(i=>[i.identityId,i.status]),errors:game.errors};
  });
  assert.deepEqual(actual.errors,[]);
  assert.deepEqual(actual.batch,records.map(r=>[r.identity.id,'completed']));
  assert.deepEqual(actual.rows.map(r=>r.id),records.map(r=>r.identity.id));
  for(const key of ['root','head'])assert.equal(new Set(actual.rows.map(row=>row[key])).size,2);
  return actual.rows.map(({captured,...row},i)=>{
    const r=records[i], recipe=r.appearanceRecipe, materials=resolveGarmentMaterials({profile:recipe.base},recipe,r.equipmentMaterials);
    assert(row.attached);assert.equal(row.sha,r.integrity.recordSha256);assert.equal(row.body,recipe.base.sha256);
    assert.equal(canonicalJson(captured.appearanceRecipe),canonicalJson(recipe));
    assert.deepEqual(captured.liveAccessories,r.liveAccessories);assert.deepEqual(captured.nativeHairCenter,r.nativeHairCenter);
    assert.deepEqual(captured.equipmentMaterials,materials.record);
    const expected=Object.values(recipe.equipment.resources).map(({id,slot,url,sha256,compatibleAvatarSha256})=>({id,slot,url,sha256,compatibleAvatarSha256}));
    const bySlot=(a,b)=>a.slot.localeCompare(b.slot);
    assert.deepEqual(row.selected.sort(bySlot),expected.sort(bySlot));
    assert.deepEqual(row.visible,expected.map(item=>item.id).sort());
    return row;
  });
}

async function opened(page,url) {
  await page.goto(url);
  await page.waitForFunction(()=>window.__recordConsumer?.ready,null,timeout);
}

async function rejectChangedBody(context,url,selected,records,report) {
  const target=new URL(selected.bodyPath,url).href;
  const match=request=>request.href===target;
  const changed=[];
  const intercept=async route=>{
    try {
      assert.equal(route.request().method(),'GET');
      const response=await route.fetch({maxRedirects:0});
      try {
        assert.equal(response.url(),target);assert.equal(response.status(),200);
        const {bytes,proof}=changeOneByte(await response.body(),selected.bodySha);
        await route.fulfill({response,body:bytes});
        changed.push(proof);
      } finally {await response.dispose();}
    } catch (error) {
      changed.push({error:String(error)});await route.abort().catch(()=>{});
    }
  };
  await context.route(match,intercept);
  const page=await context.newPage();
  try {
    await opened(page,url);
    const state=await page.evaluate(()=>({failure:__recordConsumer.inputFailure,actors:[...__recordConsumer.actors.keys()]}));
    report.tamper={url:target,recordSha256:selected.fresh.integrity.recordSha256,changed,state};
    assert(changed.length && changed.every(c=>c.changedSha256 && c.changedSha256!==selected.bodySha));
    assert(state.failure?.endsWith('payload mismatch '+selected.bodyPath),JSON.stringify(state));
    assert.deepEqual(state.actors,[]);
  } finally {await context.unroute(match,intercept);}
  await opened(page,url);
  report.tamper.restored=await capturePair(page,records);
  await page.close();
}

async function runColdPair(base,folder,recordsFile,launchOptions) {
  const root=await productionRoot(), out=await projectOutput(folder,root);
  const records=JSON.parse(await fs.readFile(recordsFile,'utf8'));
  if(launchOptions.browserConfig)await resolveBrowserConfig(launchOptions.browserConfig);
  const url=new URL(entry,base).href;
  const response=await fetch(new URL('/records/manifest.json',url),{redirect:'error'});
  assert.equal(response.status,200);
  const selected=selection(await response.json(),records);
  await fs.mkdir(out);
  const report={schema:'published-rule-game-functional-cold-v1',status:'incomplete',sessions:[]};
  try {
    for(const file of [__filename,require.resolve('./qa-production-package.cjs')])
      await fs.copyFile(file,path.join(out,path.basename(file)),fs.constants.COPYFILE_EXCL);
    for(const phase of ['first','cold']){
      const session=await launchQABrowser(out,launchOptions);
      const row={phase,browser:session.browser.version(),browserLaunch:session.receipt,errors:[]};
      report.sessions.push(row);
      try {
        const context=await session.browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
        context.on('page',page=>page.on('pageerror',error=>row.errors.push(error.message)));
        const page=await context.newPage();
        await opened(page,url);
        row.build=await page.evaluate(()=>__recordConsumer.buildInfo.sourceDigest);
        row.first=await capturePair(page,records);
        assert.equal(row.first.find(a=>a.id===selected.fresh.identity.id).bodyUrl,selected.bodyPath);
        const survivor=await oldSurvivor(page,selected);
        const prior=row.first.find(a=>a.id===selected.old.identity.id);
        assert.equal(survivor.recordSha256,prior.sha);assert.equal(survivor.bodySha256,prior.body);
        assert.equal(survivor.root,prior.root);assert(survivor.renderedFrames>0);
        const {canonicalJson}=await import('../prototype/src/character-record.js');
        assert.equal(canonicalJson(survivor.appearanceRecipe),canonicalJson(selected.old.appearanceRecipe));
        assert.deepEqual(survivor.liveAccessories,selected.old.liveAccessories);
        row.survivor={id:survivor.id,recordSha256:prior.sha,root:prior.root,renderedFrames:survivor.renderedFrames};
        await page.locator('#first').click();
        await page.waitForFunction(()=>__recordConsumer.snapshot()?.phase==='settled' && __recordConsumer.actors.size===2,null,timeout);
        row.reselected=await capturePair(page,records);
        for(const key of ['root','head'])assert.equal(new Set([...row.first,...row.reselected].map(a=>a[key])).size,4);
        await page.close();
        if(phase==='cold')await rejectChangedBody(context,url,selected,records,row);
        assert.deepEqual(row.errors,[]);
        await context.close();
      } finally {await session.close();}
    }
    const [first,cold]=report.sessions;
    assert.equal(first.build,cold.build);assert.equal(first.browser,cold.browser);
    assert.deepEqual(first.browserLaunch,cold.browserLaunch);
    for(const key of ['root','head'])assert.equal(new Set([...first.first,...cold.first].map(a=>a[key])).size,4);
    report.status='functional-pass';
  } catch(error){report.failure=String(error.stack??error);throw error;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  console.log(JSON.stringify({status:report.status,build:report.sessions[0].build,report:path.join(out,'report.json')}));
}

module.exports={runColdPair,selection,changeOneByte};
