// Same production loader and appearance transaction, with real prop resources.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,output]=process.argv.slice(2);
(async()=>{
 const out=path.resolve(output);await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={status:'incomplete',browser:browser.version(),cases:[],scope:'Whole-look records, real loading/close/reopen and failed resource retention; not general visual acceptance'};
 try{
  for(const body of ['native-female-face-v1','native-male-7586-v1']){
   const context=await browser.newContext({viewport:{width:1440,height:1000}});
   let page=await context.newPage();const row={body,errors:[]};report.cases.push(row);
   const open=async()=>{page.on('pageerror',e=>row.errors.push(String(e)));await page.goto(base+'?workbench=appearance&body='+body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});row.build=await page.evaluate(()=>__debug.buildInfo.shortId);};
   await open();
   await page.locator('[data-workbench-tab="actions"]').click();
   for(const kind of ['mic','glasses']){await page.locator(`[data-accessory-kind="${kind}"]`).click();await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].status==='on',kind,{timeout:30000});}
   const record=await page.evaluate(async body=>__debug.captureCharacterRecord({identity:{id:body+'-record-a',name:'验证主播A',gender:body.includes('male-7586')?'male':'female'}}),body);
   assert(record.liveAccessories.selections.mic.enabled&&record.liveAccessories.selections.glasses.enabled);
   await fs.writeFile(path.join(out,body+'-record.json'),JSON.stringify(record,null,2));
   const recordB=await page.evaluate(async body=>__debug.captureCharacterRecord({identity:{id:body+'-record-b',name:'验证主播B',gender:'independent-identity'}}),body);
   assert.notEqual(record.identity.id,recordB.identity.id);assert.deepEqual(record.appearanceRecipe,recordB.appearanceRecipe);
   await page.evaluate(record=>localStorage.setItem('qa-complete-character-record',JSON.stringify(record)),record);
   await page.close();page=await context.newPage();await open();
   assert.equal(await page.evaluate(()=>__debug.avatar().livePresentation.getState().accessories.mic.loaded),false);
   row.restored=await page.evaluate(()=>__debug.restoreCharacterRecord(localStorage.getItem('qa-complete-character-record')));
   assert.equal(row.restored.applied,true);
   const after=await page.evaluate(async body=>__debug.captureCharacterRecord({identity:{id:body+'-record-a',name:'验证主播A',gender:body.includes('male-7586')?'male':'female'}}),body);
   assert.deepEqual(after.appearanceRecipe,record.appearanceRecipe);assert.deepEqual(after.liveAccessories,record.liveAccessories);assert.deepEqual(after.resourceIdentities,record.resourceIdentities);
   await page.locator('[data-workbench-tab="actions"]').click();await page.locator('#speaking-button').click();
   await page.getByRole('button',{name:'看向镜头',exact:true}).click();
   await page.evaluate(()=>{__debug.camera('inspect-half-front');__debug.setPlaybackRate(1);__debug.setPaused(false);const stream=__debug.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.recordCapture={stream,chunks,recorder,done:new Promise(r=>recorder.onstop=r)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
   await page.waitForTimeout(5000);await page.screenshot({path:path.join(out,body+'-restored-front.png')});
   await page.evaluate(()=>__debug.camera('inspect-face-side'));await page.waitForTimeout(4000);
   const film=await page.evaluate(async()=>{const c=window.recordCapture;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));});});
   await fs.writeFile(path.join(out,body+'-restored-1x.webm'),Buffer.from(film.split(',')[1],'base64'));
   // A corrupted envelope must be rejected without changing any visible look.
   const bad=structuredClone(record);bad.liveAccessories.selections.mic.identity.fit.sha256='0'.repeat(64);
   row.invalid=await page.evaluate(async value=>{try{return await __debug.restoreCharacterRecord(value);}catch(e){return{error:e.message};}},bad);assert(row.invalid.error);
   // A valid complete record whose prop bytes cannot load must not apply outfit
   // or attach the earlier prepared microphone before the glasses fails.
   for(const kind of ['mic','glasses'])await page.locator(`[data-accessory-kind="${kind}"]`).click();
   await page.evaluate(()=>__debug.setOutfit(1));
   await page.waitForFunction(()=>!__debug.avatar().appearance.getState().loading);
   const before=await page.evaluate(()=>__debug.exportAppearanceRecipe());
   await page.route('**/studio-glasses-v1.glb',route=>route.fulfill({status:503,body:'intentional-record-failure'}));
   row.failedLoad=await page.evaluate(async value=>{try{return await __debug.restoreCharacterRecord(value);}catch(e){return{error:e.message};}},record);
   assert(row.failedLoad.error);assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),before);
   const state=await page.evaluate(()=>__debug.avatar().livePresentation.getState().accessories);assert.equal(state.mic.loaded,false);assert.equal(state.glasses.loaded,false);
   await page.unroute('**/studio-glasses-v1.glb');
   row.retry=await page.evaluate(value=>__debug.restoreCharacterRecord(value),record);assert.equal(row.retry.applied,true);
   assert.equal(row.errors.length,0);row.status='technical-pass-visual-pending';await context.close();
  }
  report.status='technical-pass-visual-pending';
 }catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
