const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const [base,folder]=process.argv.slice(2);
(async()=>{
 const out=await projectOutput(folder,await productionRoot());
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={status:'incomplete',cases:[],errors:[]};
 let session,page;
 try{
  session=await launchQABrowser(out,{channel:'chrome'});
  page=await session.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  report.build=await fetch(base+'build-info.json').then(r=>r.json());
  for(const body of ['native-female-face-v1','native-male-7586-v1','male']){
   await page.goto(base+'?workbench=appearance&body='+body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
   assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),report.build.shortId);
   await page.locator('[data-workbench-tab="actions"]').click();
   for(const kind of ['mic','glasses']){await page.locator(`[data-accessory-kind="${kind}"]`).click();await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].loaded,kind,{timeout:30000});}
   const record=await page.evaluate(()=>__debug.captureCharacterRecord({identity:{id:'release-check',name:'接入回归',gender:'unspecified'}}));
   assert(record.liveAccessories.selections.mic.enabled&&record.liveAccessories.selections.glasses.enabled);report.cases.push({body,recordSha:record.integrity.recordSha256});
  }
  await page.goto(base+'native-production.html#character-records');await page.locator('a[href="/record-consumer.html"]').click();await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.shortId),report.build.shortId);
  await page.locator('#second').click();await page.waitForFunction(()=>__recordConsumer.selected===1&&__recordConsumer.snapshot().phase==='settled',null,{timeout:120000});
  assert((await page.evaluate(()=>__recordConsumer.snapshot())).items.every(i=>i.status==='completed'));await page.screenshot({path:path.join(out,'published-entry.png')});
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='passed';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{
  try{await session?.close();}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure}));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
