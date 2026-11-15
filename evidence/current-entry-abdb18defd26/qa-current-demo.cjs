// Check the actual persistent viewing entry, not a separate temporary server.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const pointer=JSON.parse(await fs.readFile('delivery/candidate.json','utf8'));
 const out=path.resolve('output/playwright/current-demo-'+Date.now());await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false}),report={build:pointer.build,entry:`http://127.0.0.1:${pointer.port}/`,cases:[]};
 try{for(const c of [
  {body:'female',assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',outfit:1},
  {body:'male',assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',outfit:2}
 ]){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(report.entry+'?body='+c.body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const gate=await verifyCandidate(page,{build:pointer.build,assetId:c.assetId,sha256:c.sha256});assert.equal(gate.runtimeBuild.sourceDigest,pointer.sourceDigest);
  await page.locator(`[data-outfit="${c.outfit}"]`).click();await page.waitForFunction(n=>__debug.snapshot().outfit===n,c.outfit);
  await page.screenshot({path:path.join(out,c.body+'.png')});assert.equal(errors.length,0);
  report.cases.push({body:c.body,outfit:c.outfit,gate,errors});await page.close();
 }report.passed=true;}catch(e){report.failure=String(e);process.exitCode=1;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1});
