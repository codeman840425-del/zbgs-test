// Fixed browser evidence for selected equipment loading; renderer counters
// describe only this development-machine sample, not actual GPU memory bytes.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const baseline=process.argv.includes('--expect-eager');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 const requests=[],report={build,baseline,errors:[],scope:'Initial original male, actual local request URLs and renderer counters; no ordinary-PC or long-duration performance certification.'};
 page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(base+'?body=male&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const manifest=JSON.parse(await fs.readFile(path.resolve(__dirname,'../prototype/public/assets/m1b/equipment.json'),'utf8'));
  const equipmentPaths=manifest.items.map(item=>({id:item.id,url:new URL(item.url,base+'/assets/m1b/equipment.json').pathname,bytes:item.bytes}));
  report.initialRequests=[...requests];
  report.initialEquipment=equipmentPaths.filter(item=>requests.includes(item.url));
  report.initialEquipmentBytes=report.initialEquipment.reduce((sum,item)=>sum+item.bytes,0);
  report.snapshot=await page.evaluate(()=>{const s=__debug.snapshot();return {outfit:s.outfit,renderer:s.renderer,heap:s.heap,loadMs:s.loadMs,frameMs:s.frameMs,equipment:__debug.avatar().getOutfitInfo().equipment};});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  if(baseline){assert.equal(report.initialEquipment.length,equipmentPaths.length);report.status='eager-loading-confirmed';}
  else{
   assert.deepEqual(report.initialEquipment.map(item=>item.id).sort(),['m1b-uniform-pants','m1b-uniform-shoes','m1b-uniform-top']);
   assert(!report.initialRequests.some(url=>url.includes('/m2-onepiece-v1/')||url.includes('/m2-outer-panels-v2/')||url.includes('/m2-garment-coverage-v1/')));
   report.status='selected-initial-loading-passed';
  }
  await page.screenshot({path:path.join(out,'initial.png')});
 }catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,initialEquipment:report.initialEquipment?.map(x=>x.id),bytes:report.initialEquipmentBytes,error:report.error}));
})().catch(error=>{console.error(error);process.exitCode=1;});
