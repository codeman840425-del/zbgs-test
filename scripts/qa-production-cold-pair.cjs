const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot,projectOutput} = require('./project-output.cjs');
const {launchQABrowser,resolveBrowserConfig} = require('./qa-browser-workspace.cjs');
const {oldSurvivor} = require('./qa-published-rule-body.cjs');
const {validateCharacterRecordInput} = require('../prototype/src/character-record-input.js');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = 'record-consumer.html?records=/records/manifest.json';
const timeout = {timeout:120000};
const greetingSha = 'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06';

const recordPin = record => ({id:record.identity.id,recordSha256:record.integrity.recordSha256,
  bodyType:record.appearanceRecipe.base.bodyType,bodySha256:record.appearanceRecipe.base.sha256});

function selection(manifest, records) {
  assert.equal(records.length,2);
  const entries=validateCharacterRecordInput(manifest,'/records/manifest.json');
  assert.deepEqual(entries,records.map(r=>({id:r.identity.id,url:'/records/'+r.identity.id+'.json',recordSha256:r.integrity.recordSha256})));
  assert.notEqual(records[0].integrity.recordSha256,records[1].integrity.recordSha256);
  const packs=manifest.ruleBodyDataPacks ?? [];
  assert(packs.length===1 || packs.length===2,'Expected one or two published body packs');
  const pointers=new Map(packs.map(ptr=>[ptr.bodyType,ptr]));
  const published=[];
  for(const record of records){
    const pin=recordPin(record);
    const index=pointers.get(pin.bodyType);
    if(!index)continue;
    assert.match(pin.bodySha256,/^[a-f0-9]{64}$/);
    assert.equal(pin.bodyType,'rule-body-'+pin.bodySha256.slice(0,20));
    published.push({...pin,index,bodyPath:'/assets/'+pin.bodyType+'/body.vrm'});
    pointers.delete(pin.bodyType);
  }
  assert.equal(pointers.size,0,'Each published body must belong to one selected record');
  const [target]=published;
  const fresh=records.find(record=>record.identity.id===target.id), old=records.find(record=>record!==fresh);
  assert.notEqual(old.appearanceRecipe.base.bodyType,target.bodyType,'Each selected actor must have its own body type');
  return {mode:packs.length===2?'dual-external':'external-and-bundled',published,fresh,old,
    bodySha:target.bodySha256,bodyPath:target.bodyPath};
}

function garmentAssets(records) {
  const outfits=records.map(record=>new Map(Object.values(record.appearanceRecipe.equipment.resources)
    .map(item=>[item.slot,item.sha256])));
  const shared=[...outfits[0]].filter(([slot,sha])=>outfits[1].get(slot)===sha)
    .map(([slot,sha256])=>({slot,sha256})).sort((a,b)=>a.slot.localeCompare(b.slot));
  const sameSelectedAssetBytes=shared.length>0 && outfits.every(outfit=>outfit.size===shared.length);
  return {shared,sameSelectedAssetBytes,
    scope:sameSelectedAssetBytes?'One shared garment-file set with exact per-body bindings. Other garment styles are outside this run.'
      :'The two exact signed outfits and their per-body bindings.'};
}

function changeOneByte(original,expected) {
  assert(original.length>0 && digest(original)===expected,'Original server response differs from the signed body');
  const bytes = Buffer.from(original), offset = bytes.length-1;
  bytes[offset] ^= 1;
  return {bytes,proof:{originalSha256:expected,changedSha256:digest(bytes),offset,
    originalByte:original[offset],changedByte:bytes[offset],bytes:bytes.length}};
}

async function capturePair(page,records,published) {
  const {equipmentRuntimePath} = await import('./runtime-package/files.mjs');
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
      rows.push({id:actor.identity.id,sha:actor.recordSha256,body:avatar.profile.sha256,bodyType:avatar.profile.bodyType,bodyUrl:avatar.profile.url,
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
    assert.equal(row.bodyType,recipe.base.bodyType);
    const publication=published.find(item=>item.id===row.id);
    if(publication)assert.equal(row.bodyUrl,publication.bodyPath);
    assert.equal(canonicalJson(captured.appearanceRecipe),canonicalJson(recipe));
    assert.deepEqual(captured.liveAccessories,r.liveAccessories);assert.deepEqual(captured.nativeHairCenter,r.nativeHairCenter);
    assert.deepEqual(captured.equipmentMaterials,materials.record);
    const expected=Object.values(recipe.equipment.resources).map(({id,slot,url,sha256,compatibleAvatarSha256})=>({
      id,slot,url:'/'+equipmentRuntimePath(url,recipe.equipment.manifestUrl),sha256,compatibleAvatarSha256
    }));
    const bySlot=(a,b)=>a.slot.localeCompare(b.slot);
    assert.deepEqual(row.selected.sort(bySlot),expected.sort(bySlot));
    assert.deepEqual(row.visible,expected.map(item=>item.id).sort());
    return row;
  });
}

// Use the game's frame clock and the actual VRM raw hand, without advancing or
// seeking the animation. Sample idle frames after the completed, zero-weight layer.
async function wave(id) {
  const game=window.__recordConsumer, actor=game.actors.get(id), live=actor.avatar.livePresentation;
  const hand=actor.avatar.vrm.humanoid.getRawBoneNode('leftHand');
  const sample=()=>hand.getWorldPosition(hand.position.clone()).toArray();
  const delta=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const before=sample(), requestId='published-cold-wave-'+id;
  const started=await live.playGreeting({requestId});
  if(!started.started)throw Error(JSON.stringify(started));
  const frame=game.renderer.info.render.frame, start=performance.now();
  let peak=before, maximumWeight=0, samples=0;
  const nextFrame=()=>new Promise(requestAnimationFrame);
  for(;;){
    await nextFrame();
    const now=sample(), gesture=live.getState().greeting;
    if(delta(now,before)>delta(peak,before))peak=now;
    maximumWeight=Math.max(maximumWeight,gesture.weight);
    samples++;
    if (gesture.status==='completed') {
      const endFrame=game.renderer.info.render.frame, endMs=performance.now();
      let settled=now, maxSettledDisplacementM=delta(now,before);
      for(let i=0;i<8;i++){
        await nextFrame();settled=sample();
        maxSettledDisplacementM=Math.max(maxSettledDisplacementM,delta(settled,before));
      }
      const after=live.getState().greeting;
      return {id,requestId,gesture,after,before,peak,completed:now,settled,
        peakWristDisplacementM:delta(peak,before),maxSettledDisplacementM,
        maximumWeight,samples,drawFrames:endFrame-frame,settledFrames:game.renderer.info.render.frame-endFrame,elapsedMs:endMs-start};
    }
    if (gesture.status!=='playing' || performance.now()-start>20000)throw Error(JSON.stringify(gesture));
  }
}

function checkWave(result,id) {
  assert.equal(result.id,id);
  assert.equal(result.requestId,'published-cold-wave-'+id);
  for(const state of [result.gesture,result.after]) {
    assert.equal(state.requestId,result.requestId);
    assert.equal(state.sha256,greetingSha);
    assert.equal(state.status,'completed');
    assert.equal(state.weight,0);
    assert.equal(state.error,null);
    assert.equal(state.time,state.duration);
  }
  assert(result.samples>=10 && result.drawFrames>=10 && result.settledFrames>=1 && result.maximumWeight>.95);
  assert(result.peakWristDisplacementM>.08,'The raw wrist did not lift');
  assert(result.maxSettledDisplacementM<result.peakWristDisplacementM/2,'The raw wrist did not return toward the idle pose');
}

async function opened(page,url) {
  await page.goto(url);
  await page.waitForFunction(()=>window.__recordConsumer?.ready,null,timeout);
}

// With the signed microphone still equipped, observe the ordinary game's
// procedural speech clock on the live facial mesh. It only greets empty-handed.
async function speakingWithMic(id) {
  const game=window.__recordConsumer, avatar=game.actors.get(id).avatar;
  const live=avatar.livePresentation, expressions=avatar.vrm.expressionManager;
  const rejected=await live.playGreeting({requestId:'cold-occupied-hand-'+id});
  const vowels=['aa','ih','ou','ee','oh'].map(name=>{
    const binds=expressions.getExpression(name)?.binds??[];
    const targets=binds.flatMap(bind=>(bind.primitives??[]).filter(mesh=>mesh.morphTargetInfluences)
      .map(mesh=>({mesh,index:bind.index})));
    return {name,targets,min:Infinity,max:-Infinity};
  });
  const frame=game.renderer.info.render.frame, start=performance.now();
  let samples=0;
  while(performance.now()-start<1500){
    await new Promise(requestAnimationFrame);
    for(const vowel of vowels){
      if(!vowel.targets.length)continue;
      const value=Math.max(...vowel.targets.map(({mesh,index})=>mesh.morphTargetInfluences[index]));
      vowel.min=Math.min(vowel.min,value); vowel.max=Math.max(vowel.max,value);
    }
    samples++;
  }
  const state=live.getState();
  return {id,kind:'equipped-microphone-speech',rejected,samples,elapsedMs:performance.now()-start,
    drawFrames:game.renderer.info.render.frame-frame,speaking:state.speaking,
    mic:state.accessories.mic,glasses:state.accessories.glasses,holdWeight:state.arm?.weight,
    vowels:vowels.map(({name,targets,min,max})=>({name,boundTargets:targets.length,min,max}))};
}

function checkMicSpeech(result,record) {
  assert.equal(result.id,record.identity.id);
  assert.deepEqual(result.rejected,{started:false,error:'greeting-requires-settled-empty-hand-pose'});
  assert(result.speaking && result.drawFrames>=10 && result.samples>=10 && result.holdWeight>.9);
  for(const kind of ['mic','glasses']){
    const expected=record.liveAccessories.selections[kind];
    assert.equal(result[kind].loaded,expected.enabled);
    if(expected.enabled)assert.deepEqual(result[kind].identity,expected.identity);
  }
  assert(result.vowels.filter(v=>v.boundTargets>0 && v.max-v.min>.1).length>=2,
    'Expected two changing mouth morph targets while speaking');
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
    report.tamper={url:target,recordSha256:selected.fresh.integrity.recordSha256,target:recordPin(selected.fresh),
      otherRecord:recordPin(selected.old),changed,state};
    assert(changed.length && changed.every(c=>c.changedSha256 && c.changedSha256!==selected.bodySha));
    assert(state.failure?.endsWith('payload mismatch '+selected.bodyPath),JSON.stringify(state));
    assert.deepEqual(state.actors,[]);
  } finally {await context.unroute(match,intercept);}
  await opened(page,url);
  report.tamper.restored=await capturePair(page,records,selected.published);
  await page.close();
}

async function copyColdQASnapshots(out) {
  for(const file of [__filename,require.resolve('./qa-production-package.cjs')]){
    const destination=await projectOutput(path.join(out,path.basename(file)),out);
    await fs.copyFile(file,destination,fs.constants.COPYFILE_EXCL);
  }
}

async function saveColdVideo(video,out,scratch,file) {
  const destination=await projectOutput(path.join(out,file),out);
  assert.equal(await projectOutput(scratch,out),scratch);
  const prefix=await projectOutput(path.join(scratch,'cold-video-'),scratch);
  const stage=await fs.mkdtemp(prefix);
  const stagedFile=path.join(stage,'completed.webm');
  // Playwright saveAs waits for a successful recording and can replace a file.
  // Give it a private destination, then exclusively publish the completed bytes.
  try {
    await video.saveAs(await projectOutput(stagedFile,stage));
    const bytes=await fs.readFile(await projectOutput(stagedFile,stage));
    assert(bytes.length>0);
    await fs.copyFile(stagedFile,await projectOutput(destination,out),fs.constants.COPYFILE_EXCL);
    await video.delete();
    return {file,bytes:bytes.length,sha256:digest(bytes),normalSpeed:true};
  } finally {
    assert.equal(await projectOutput(stage,out),stage);
    await fs.rm(stage,{recursive:true,force:true});
  }
}

async function runColdPair(base,folder,recordsFile,launchOptions) {
  const root=await productionRoot(), out=await projectOutput(folder,root);
  const records=JSON.parse(await fs.readFile(recordsFile,'utf8'));
  if(launchOptions.browserConfig)await resolveBrowserConfig(launchOptions.browserConfig);
  const url=new URL(entry,base).href;
  const response=await fetch(new URL('/records/manifest.json',url),{redirect:'error'});
  assert.equal(response.status,200);
  const selected=selection(await response.json(),records);
  assert.equal(await projectOutput(out,root),out);
  await fs.mkdir(out);
  const report={schema:'published-rule-game-functional-cold-v1',status:'incomplete',mode:selected.mode,
    selection:{records:records.map(recordPin),published:selected.published,removeAndTamper:recordPin(selected.fresh),
      expectedSurvivor:recordPin(selected.old)},garmentAssets:garmentAssets(records),
    transportScope:'Functional cold open and a deliberate byte change; strict CDP transfer measurement is separate.',sessions:[]};
  try {
    await copyColdQASnapshots(out);
    for(const phase of ['first','cold']){
      const session=await launchQABrowser(out,launchOptions);
      const row={phase,browser:session.browser.version(),browserLaunch:session.receipt,errors:[]};
      report.sessions.push(row);
      try {
        const viewport={width:1440,height:1000};
        const filming=phase==='cold';
        const openContext=async options=>{
          const context=await session.browser.newContext({viewport,serviceWorkers:'block',...options});
          context.on('page',page=>page.on('pageerror',error=>row.errors.push(error.message)));
          return context;
        };
        const context=await openContext(filming?{recordVideo:{dir:await projectOutput(session.scratch,out),size:viewport}}:{});
        const page=await context.newPage();
        await opened(page,url);
        row.build=await page.evaluate(()=>__recordConsumer.buildInfo.sourceDigest);
        row.first=await capturePair(page,records,selected.published);
        row.motions=[];
        for(const record of records){
          const id=record.identity.id, mic=record.liveAccessories?.selections?.mic?.enabled;
          const result=await page.evaluate(mic?speakingWithMic:wave,id);
          row.motions.push(result);
          if(mic)checkMicSpeech(result,record);
          else checkWave(result,id);
        }
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
        row.reselected=await capturePair(page,records,selected.published);
        for(const key of ['root','head'])assert.equal(new Set([...row.first,...row.reselected].map(a=>a[key])).size,4);
        const video=filming?page.video():null;
        await page.close();
        if(filming){
          await context.close();
          assert(video,'Missing cold-open recording');
          const file=selected.mode==='dual-external'?'dual-external-cold-1x.webm':'mixed-cold-1x.webm';
          row.video=await saveColdVideo(video,out,session.scratch,file);
          const faultContext=await openContext({});
          try{await rejectChangedBody(faultContext,url,selected,records,row);}
          finally{await faultContext.close();}
        }else {
          if(phase==='cold')await rejectChangedBody(context,url,selected,records,row);
          await context.close();
        }
        assert.deepEqual(row.errors,[]);
      } finally {await session.close();}
    }
    const [first,cold]=report.sessions;
    assert.equal(first.build,cold.build);assert.equal(first.browser,cold.browser);
    assert.deepEqual(first.browserLaunch,cold.browserLaunch);
    for(const key of ['root','head'])assert.equal(new Set([...first.first,...cold.first].map(a=>a[key])).size,4);
    report.status='functional-pass';
  } catch(error){report.failure=String(error.stack??error);throw error;}
  finally{await fs.writeFile(await projectOutput(path.join(out,'report.json'),out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  console.log(JSON.stringify({status:report.status,build:report.sessions[0].build,report:path.join(out,'report.json')}));
}

module.exports={runColdPair,selection,garmentAssets,changeOneByte,capturePair,wave,checkWave,copyColdQASnapshots,saveColdVideo};
