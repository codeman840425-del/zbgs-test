// Fixed browser evidence for selected equipment loading; renderer counters
// describe only this development-machine sample, not actual GPU memory bytes.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const baseline=process.argv.includes('--expect-eager');
const body=process.argv.includes('--body=female')?'female':'male';
const bodySha=body==='male'?'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const manifestURL=body==='male'?'/assets/m1b/equipment.json':'/assets/m1/equipment.json';
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 const requests=[],report={build,baseline,body,errors:[],scope:'Initial original body, actual local request URLs and renderer counters; no ordinary-PC or long-duration performance certification.'};
 page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(base+'?body='+body+'&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const manifest=JSON.parse(await fs.readFile(path.resolve(__dirname,'../prototype/public'+manifestURL),'utf8'));
  const {foundationProfile}=await import('../prototype/src/foundation-profiles.js');
  report.configuredEquipmentIds=Object.values(foundationProfile(body).ids);
  const equipmentPaths=manifest.items.map(item=>({id:item.id,url:new URL(item.url,base+manifestURL).pathname,bytes:item.bytes}));
  report.initialRequests=[...requests];
  report.initialEquipment=equipmentPaths.filter(item=>requests.includes(item.url));
  report.initialEquipmentBytes=report.initialEquipment.reduce((sum,item)=>sum+item.bytes,0);
  report.snapshot=await page.evaluate(()=>{const s=__debug.snapshot();return {outfit:s.outfit,renderer:s.renderer,heap:s.heap,loadMs:s.loadMs,frameMs:s.frameMs,equipment:__debug.avatar().getOutfitInfo().equipment};});
  report.identity=await verifyCandidate(page,{build,assetId:body==='male'?'beta-base-male-m1b':'beta-base-female-m1',sha256:bodySha});
  if(baseline){assert.deepEqual(report.initialEquipment.map(item=>item.id).sort(),[...report.configuredEquipmentIds].sort());report.status='eager-loading-confirmed';}
  else{
   assert.deepEqual(report.initialEquipment.map(item=>item.id).sort(),body==='male'?['m1b-uniform-pants','m1b-uniform-shoes','m1b-uniform-top']:['m1-training-pants','m1-uniform-shoes','m1-uniform-top']);
   assert(!report.initialRequests.some(url=>url.includes('/m2-onepiece-v1/')||url.includes('/m2-outer-panels-v2/')||url.includes('/m2-garment-coverage-v1/')));
   report.status='selected-initial-loading-passed';
  }
  await page.screenshot({path:path.join(out,'initial.png')});
 }catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,initialEquipment:report.initialEquipment?.map(x=>x.id),bytes:report.initialEquipmentBytes,error:report.error}));
})().catch(error=>{console.error(error);process.exitCode=1;});
