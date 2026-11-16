const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();
 const r={build,status:'running',checks:[],errors:[],scope:'Workbench grouping and explicit unsupported-hair choices only; no derivative fit acceptance.'};
 p.on('pageerror',e=>r.errors.push(String(e)));
 const ready=()=>p.waitForFunction(()=>document.querySelector('#appearance-form')?.getAttribute('aria-busy')==='false');
 try{
  await p.goto(url+'?workbench=appearance&body=female');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});await ready();
  r.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  assert.equal(await p.locator('#app > header select').count(),0);
  assert.equal(await p.locator('#app > header [data-appearance-group]').count(),2);
  assert.equal(await p.locator('#workbench-page-appearance #appearance-shape-samples #appearance-body').count(),1);
  assert.equal(await p.locator('#workbench-page-appearance #appearance-geometry').count(),1);
  await p.evaluate(()=>window.__groupingDocumentMarker='retained-document');
  for(const id of ['m1a-jaw-v1','m1a-waisthip-v1']){
   await p.selectOption('#appearance-body',id);await ready();
   assert.equal(await p.evaluate(()=>__debug.avatar().profile.bodyType),id);
   assert.equal(await p.evaluate(()=>window.__groupingDocumentMarker),'retained-document');
   assert(await p.locator('#appearance-hair-style option[value="female-ponytail-v1"]').isDisabled());
   assert((await p.locator('#appearance-style-note').textContent()).includes('待适配'));
   await p.screenshot({path:path.join(out,id+'.png')});
  }
  r.checks.push({name:'Face/body selector and local face controls share appearance; derivative switches keep document and explain unavailable real hairstyles',passed:true});
  await p.selectOption('#appearance-body','female');await ready();
  await p.selectOption('#appearance-hair-style','female-ponytail-headref-v3');await ready();
  assert.equal(await p.evaluate(()=>__debug.avatar().appearance.getState().hairDynamics.simulationFrame),'raw-head');
  await p.screenshot({path:path.join(out,'female-appearance.png')});
  await p.locator('[data-workbench-tab="actions"]').click();assert(!(await p.locator('#appearance-body').isVisible()));
  await p.locator('[data-appearance-group="male"]').click();await ready();
  assert.equal(await p.locator('[data-workbench-tab="actions"]').getAttribute('aria-selected'),'true');
  await p.locator('[data-workbench-tab="appearance"]').click();assert.equal(await p.locator('#appearance-body').inputValue(),'male');
  assert.equal(await p.locator('#appearance-hair-style option[value="female-ponytail-v1"]').count(),0);
  assert.equal(await p.evaluate(()=>window.__groupingDocumentMarker),'retained-document');
  await p.screenshot({path:path.join(out,'male-appearance.png')});
  r.checks.push({name:'New reference candidate selects through ordinary control; male switch retains active tab; no unrelated female option or navigation reload',passed:true});
  await p.setViewportSize({width:1024,height:768});await p.waitForTimeout(200);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await p.screenshot({path:path.join(out,'compact.png')});
  assert.deepEqual(r.errors,[]);r.status='technical-checks-passed-visual-pending';
 }catch(e){r.status='failed';r.error=String(e.stack??e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2)+'\n');}
 console.log(JSON.stringify({status:r.status,error:r.error}));
})();
