// Real browser first-selection failures and supersession, using current actor
// and existing outfit commands. No animation/controller implementation fixture.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),page=await context.newPage();
 const report={build,checks:[],errors:[],scope:'Actual original male default/onePiece/outer first-load transactions and actor replacement; no target-PC performance pass.'};
 let releasePending;
 page.on('pageerror',e=>report.errors.push(String(e)));
 const outfit=async value=>{
  let timer;
  try{return await Promise.race([page.evaluate(async value=>{try{return await __debug.command({type:'outfit',value});}catch(e){return {applied:false,reason:String(e)};}},value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Outfit command exceeded the 20 second test deadline')),20000);})]);}
  finally{clearTimeout(timer);}
 };
 try{
  await page.goto(base+'?body=male&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  const previous=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  await page.route('**/m2-onepiece-v1/fit.json',r=>r.fulfill({status:503,body:'bounded missing fit test'}));
  report.failedFirstSelection=await outfit(5);assert.equal(report.failedFirstSelection?.applied,false);
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),previous);assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),0);
  report.checks.push('missing fit on first selection preserves complete old appearance');
  await page.unroute('**/m2-onepiece-v1/fit.json');
  report.retriedFirstSelection=await outfit(5);assert.equal(report.retriedFirstSelection?.applied,true);
  assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),5);
  const saved=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  await outfit(0);assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),previous);
  assert.equal((await page.evaluate(text=>__debug.importAppearanceRecipe(text),saved)).applied,true);
  report.checks.push('first selection retry and complete onePiece recipe restore succeed');
  // A fresh actor avoids treating a prior warmed garment as a first load.
  for(const bodyType of ['female','male'])assert.equal((await page.evaluate(bodyType=>__debug.command({type:'bodySelect',bodyType}),bodyType)).applied,true);
  const beforeCancelled=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  let started,release;const start=new Promise(r=>started=r),gate=new Promise(r=>release=r);releasePending=release;
  await page.route('**/m2-onepiece-v1/author-export.glb',async r=>{started();await gate;await r.continue();});
  await page.evaluate(()=>{window.__qaLazyOutfit=Promise.resolve(__debug.command({type:'outfit',value:5})).catch(e=>({applied:false,reason:String(e)}));});
  let timer;try{await Promise.race([start,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Garment request did not begin')),20000);})]);}finally{clearTimeout(timer);}
  report.newerSelection=await outfit(0);release();
  report.cancelledSelection=await page.evaluate(()=>window.__qaLazyOutfit);
  assert.notEqual(report.cancelledSelection?.applied,true);
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),beforeCancelled);assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),0);
  report.checks.push('new default selection prevents delayed old onePiece from becoming visible');
  await page.unroute('**/m2-onepiece-v1/author-export.glb');
  assert.equal((await outfit(4))?.applied,true);
  const coverage=await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.garmentCoverage);
  assert.equal(coverage.active,true);assert.equal(coverage.hiddenFaces,56);
  await outfit(0);assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.garmentCoverage?.active??false),false);
  report.checks.push('first outer load activates exact coverage; removal restores it');
  assert.equal(report.errors.length,0);report.status='passed';await page.screenshot({path:path.join(out,'restored.png')});
 }catch(error){report.status='failed';report.error=String(error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{releasePending?.();const video=page.video();await context.close();await video.saveAs(path.join(out,'normal1x.webm'));await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,checks:report.checks,error:report.error}));
})().catch(error=>{console.error(error);process.exitCode=1;});
