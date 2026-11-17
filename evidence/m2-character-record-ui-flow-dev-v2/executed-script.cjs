// Actual workbench record controls, not a separate model viewer.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,outArg]=process.argv.slice(2),key='zbgs:character-records:v1';
(async()=>{
 const out=path.resolve(outArg);await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={status:'incomplete',checks:[],errors:[],scope:'Real record UI, selected native female/male, not all visual or body compatibility'};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});let page;
 const id=s=>'#appearance-character-record-'+s;
 const open=async body=>{page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(base+'?workbench=appearance&body='+body);await page.waitForFunction(()=>__debug?.ready,null,{timeout:90000});await page.locator('#appearance-character-records summary').click();};
 const saved=async()=>{await page.waitForFunction(()=>/已保存|已更新/.test(document.querySelector('#appearance-character-record-note').textContent));return page.evaluate(k=>JSON.parse(localStorage.getItem(k)).records,key);};
 try{
  await open('native-female-face-v1');report.build=await page.evaluate(()=>__debug.buildInfo.shortId);report.browser=browser.version();
  await page.locator('[data-workbench-tab="actions"]').click();
  for(const kind of ['mic','glasses']){await page.locator(`[data-accessory-kind="${kind}"]`).click();await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].loaded,kind);}
  await page.locator('[data-workbench-tab="appearance"]').click();
  await page.locator(id('name')).fill('女主播样本A');await page.locator(id('save')).click();let records=await saved();const a=records[0];
  assert(a.liveAccessories.selections.mic.enabled&&a.liveAccessories.selections.glasses.enabled);assert.equal(await page.locator(id('name')).getAttribute('readonly'),'');
  await page.locator(id('new')).click();await page.locator(id('name')).fill('女主播样本B');await page.locator(id('save')).click();records=await saved();assert.equal(records.length,2);assert.notEqual(records[0].identity.id,records[1].identity.id);
  report.checks.push('two stable identities on one body with real mic/glasses');
  const downloadEvent=page.waitForEvent('download');await page.locator(id('download')).click();const download=await downloadEvent;await download.saveAs(path.join(out,'downloaded-record.json'));
  assert.equal(JSON.parse(await fs.readFile(path.join(out,'downloaded-record.json'),'utf8')).identity.id,records[1].identity.id);
  await fs.copyFile(path.join(out,'downloaded-record.json'),path.join(out,'record-v1.json'));
  await page.locator('[data-appearance-group="male"]').click();await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='male');
  await page.locator('#appearance-body').selectOption('native-male-7586-v1');await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='native-male-7586-v1'&&!document.querySelector('#appearance-body').disabled);
  await page.locator('[data-workbench-tab="actions"]').click();
  for(const kind of ['mic','glasses']){await page.locator(`[data-accessory-kind="${kind}"]`).click();await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].loaded,kind);}
  await page.locator('[data-workbench-tab="appearance"]').click();
  await page.locator(id('save')).click();records=await saved();const b=records.find(x=>x.identity.id!==a.identity.id);assert.equal(b.revision,2);assert.equal(b.appearanceRecipe.base.bodyType,'native-male-7586-v1');assert.equal(b.identity.name,'女主播样本B');
  report.checks.push('explicit new-body save retains identity and increments revision');
  const latestDownload=page.waitForEvent('download');await page.locator(id('download')).click();await(await latestDownload).saveAs(path.join(out,'downloaded-record.json'));
  await page.close();await open('native-male-7586-v1');await page.locator(id('select')).selectOption(a.identity.id);await page.locator(id('restore')).click();
  await page.waitForFunction(()=>document.querySelector('#appearance-character-record-note').textContent.startsWith('已恢复完整角色记录'));
  assert.equal(await page.evaluate(()=>__debug.avatar().profile.bodyType),'native-female-face-v1');
  assert.equal(await page.locator('[data-accessory-kind="mic"]').textContent(),'卸下麦克风');
  await page.screenshot({path:path.join(out,'restored-record-ui.png')});report.checks.push('new page selected male auto-restores female record and props');
  const bad=structuredClone(a);bad.identity.name='corrupted-unsealed';const actorId=await page.evaluate(()=>__debug.avatar().root.uuid);
  await page.locator(id('file')).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await page.waitForFunction(()=>document.querySelector('#appearance-character-record-note').textContent.includes('读取失败'));
  assert.equal(await page.evaluate(()=>__debug.avatar().root.uuid),actorId);
  await page.locator(id('file')).setInputFiles(path.join(out,'record-v1.json'));
  await page.waitForFunction(()=>document.querySelector('#appearance-character-record-note').textContent.includes('读取失败'));
  assert.equal(await page.evaluate(()=>__debug.avatar().root.uuid),actorId);assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).records,key)).find(x=>x.identity.id===b.identity.id).revision,2);
  await page.locator(id('file')).setInputFiles(path.join(out,'downloaded-record.json'));
  await page.waitForFunction(()=>document.querySelector('#appearance-character-record-note').textContent.startsWith('已读取并恢复'));
  report.checks.push('download/file-read actual controls; corrupt record preserves actor');
  await page.locator('[data-workbench-tab="actions"]').click();await page.locator('#speaking-button').click();await page.evaluate(()=>{__debug.camera('inspect-half-front');__debug.setPaused(false);__debug.setPlaybackRate(1);const stream=__debug.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});window.recordFilm={stream,chunks,recorder,done:new Promise(r=>recorder.onstop=r)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
  await page.waitForTimeout(6000);await page.evaluate(()=>__debug.camera('inspect-face-side'));await page.waitForTimeout(6000);
  const movie=await page.evaluate(async()=>{const c=window.recordFilm;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));});});await fs.writeFile(path.join(out,'ui-restored-speaking-1x.webm'),Buffer.from(movie.split(',')[1],'base64'));
  // A malformed local index must be retained, never overwritten by a new save.
  await page.evaluate(k=>localStorage.setItem(k,'broken-index'),key);await page.close();await open('native-male-7586-v1');await page.locator(id('save')).click();await page.waitForFunction(()=>document.querySelector('#appearance-character-record-note').textContent.includes('保存失败'));
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'broken-index');report.checks.push('malformed local index fails closed');
  assert.deepEqual(report.errors,[]);report.status='technical-pass-visual-pending';
 }catch(e){report.status='failed';report.failure=String(e.stack||e);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
