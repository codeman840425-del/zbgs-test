// Actual fixed runtime: missing declared fit must not silently become valid.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder),baseline=process.argv.includes('--expect-gap');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 const report={build,expected:baseline?'declared-fit-ignored-baseline':'missing-fit-refused-old-actor-kept',fitRequests:[],errors:[]};
 page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(base+'?body=female&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const previous=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  await page.route('**/m2-onepiece-v1/fit.json',async route=>{report.fitRequests.push(route.request().url());await route.fulfill({status:503,body:'bounded test: declared fit unavailable'});});
  report.result=await page.evaluate(async()=>{try{return await __debug.command({type:'bodySelect',bodyType:'male'});}catch(e){return{error:String(e)};}});
  report.body=await page.evaluate(()=>__debug.avatar().profile.bodyType);
  if(baseline){assert.equal(report.result.applied,true);assert.equal(report.body,'male');assert.equal(report.fitRequests.length,0);}
  else{assert.notEqual(report.result.applied,true);assert.equal(report.body,'female');assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),previous);assert(report.fitRequests.length>0);}
  report.status=baseline?'confirmed-gap':'passed';await page.screenshot({path:path.join(out,'result.png')});
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,result:report.result,fitRequests:report.fitRequests.length,error:report.error}));
})().catch(e=>{console.error(e);process.exitCode=1;});
