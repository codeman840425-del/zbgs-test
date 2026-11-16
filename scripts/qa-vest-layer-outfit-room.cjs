// Additive outfit, full-body recovery and exact old/new recipe roundtrip.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);await fs.mkdir(out,{recursive:false});
 const report={build,status:'running',cases:[],limits:['Current development Chrome; browser state and screenshots only. Continuous action footage is recorded separately.']};
 const {foundationProfile}=await import('../prototype/src/foundation-profiles.js');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const body of ['female','female-round-full-v2','female-soft-wide-v2']){
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),row={body,errors:[]};report.cases.push(row);page.on('pageerror',e=>row.errors.push(String(e)));
  const ready=()=>page.waitForFunction(()=>window.__debug?.ready&&document.querySelector('#appearance-form')?.getAttribute('aria-busy')==='false',null,{timeout:60000});
  try{
   await page.goto(url+'?workbench=appearance&body='+body);await ready();const expected=foundationProfile(body);row.identity=await verifyCandidate(page,{build,assetId:expected.id,sha256:expected.sha256});
   row.oldRecipe=await fs.readFile(path.join('evidence/m2-vest-legacy-recipes-ed2-v1',body+'.json'),'utf8');row.currentOldRecipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());assert.deepEqual(JSON.parse(row.currentOldRecipe),JSON.parse(row.oldRecipe));
   const chosen=await page.evaluate(async()=>{const a=__debug.avatar(),look=a.config.outfits.find(x=>x.role==='pants-layer-fit');if(!look)throw Error('No new look');const r=await __debug.setOutfit(look.index);if(!r.applied)throw Error(r.reason);return a.getOutfitInfo();});
   assert.equal(chosen.equipment.bodyCoverage.activeItems.length,1);assert(chosen.equipment.bodyCoverage.activeItems[0].includes('vest-layer-fit'));assert(chosen.equipment.bodyCoverage.hiddenFaces>0);row.fitted=chosen;
   await page.evaluate(()=>{__debug.camera('inspect-half-front');__debug.setPaused(true);});await page.waitForTimeout(200);await page.locator('#stage').screenshot({path:path.join(out,body+'-fitted.png')});
   row.fullBody=await page.evaluate(()=>{__debug.setBodyMode('base');return __debug.avatar().getOutfitInfo();});assert.equal(row.fullBody.equipment.bodyCoverage.hiddenFaces,0);assert.equal(row.fullBody.equipment.bodyCoverage.renderFaces,row.fullBody.equipment.bodyCoverage.fullFaces);
   await page.waitForTimeout(200);await page.locator('#stage').screenshot({path:path.join(out,body+'-base.png')});
   await page.evaluate(()=>__debug.setBodyMode('dressed'));
   row.newRecipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
   await page.locator('#appearance-save').click();await ready();
   row.oldRestored=await page.evaluate(text=>__debug.importAppearanceRecipe(text),row.oldRecipe);assert(row.oldRestored.applied!==false,JSON.stringify(row.oldRestored));assert.equal((await page.evaluate(()=>__debug.avatar().getOutfitInfo())).index,0);
   await page.reload();await ready();row.reload=await page.evaluate(()=>({outfit:__debug.avatar().getOutfitInfo(),recipe:__debug.exportAppearanceRecipe()}));
   assert.equal(row.reload.outfit.index,chosen.index);assert.deepEqual(row.reload.recipe,row.newRecipe);
   // Quick replacement of the selected look uses the same actor and controller.
   row.rapid=await page.evaluate(async()=>{const a=__debug.avatar(),id=a.config.outfits.find(x=>x.role==='pants-layer-fit').index;const results=await Promise.all([__debug.setOutfit(0),__debug.setOutfit(id),__debug.setOutfit(0)]);return {results,outfit:a.getOutfitInfo()};});assert.equal(row.rapid.outfit.index,0);
   await page.evaluate(text=>__debug.importAppearanceRecipe(text),row.newRecipe);
   await page.locator('#stage').screenshot({path:path.join(out,body+'-restored.png')});assert.deepEqual(row.errors,[]);row.status='passed-state-checks-visual-pending';
  }catch(e){row.status='failed';row.error=String(e.stack||e);process.exitCode=1;await page.screenshot({path:path.join(out,body+'-failure.png')}).catch(()=>{});}
  finally{await context.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }}finally{await browser.close();report.status=report.cases.length===3&&report.cases.every(x=>x.status==='passed-state-checks-visual-pending')?'passed-state-checks-visual-pending':'failed';await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.map(({body,status,error})=>({body,status,error}))}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
