const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,outArg]=process.argv.slice(2),out=path.resolve(outArg);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const expected=JSON.parse(await fs.readFile('delivery/appearance-workbench.json','utf8'));
 const report={status:'incomplete',expectedBuild:expected.build,errors:[]},browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'?workbench=appearance&body=native-female-face-v1');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
  report.build=await page.evaluate(()=>__debug.buildInfo.shortId);assert.equal(report.build,expected.build);
  await page.locator('[data-workbench-tab="actions"]').click();
  for(const kind of ['mic','glasses']){await page.locator(`[data-accessory-kind="${kind}"]`).click();await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].loaded,kind);}
  const captured=await page.evaluate(()=>__debug.captureCharacterRecord({identity:{id:'live-release-check',name:'发布核验',gender:'unspecified'}}));
  assert(captured.equipmentMaterials.selections.length>0);assert(captured.liveAccessories.selections.mic.enabled&&captured.liveAccessories.selections.glasses.enabled);
  report.recordSha256=captured.integrity.recordSha256;await page.screenshot({path:path.join(out,'live-props.png')});
  await page.goto(base+'native-production.html#character-records');
  report.media=await page.locator('[data-native-chain^="m2-character-material-fixed-v1/"]').evaluate(async video=>{await video.play();return{src:video.currentSrc,duration:video.duration,rate:video.playbackRate};});
  await page.waitForFunction(()=>document.querySelector('[data-native-chain^="m2-character-material-fixed-v1/"]').ended,null,{timeout:30000});assert.equal(report.media.rate,1);assert(report.media.duration>0);assert.equal(report.errors.length,0);
  report.status='passed';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
