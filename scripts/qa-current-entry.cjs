// Verify the served fixed pointer through real UI; no action/performance claim.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const build=process.env.QA_M1_BUILD,base=process.argv[2];assert(/^[a-f0-9]{12}$/.test(build||''));assert(process.env.QA_M1_RUN_ROOT);
 const out=path.resolve(process.env.QA_M1_RUN_ROOT);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,cases:[],scope:'Actual published entry, outfit/body diagnostic controls and fitted glasses; no full action/collision/performance acceptance.'};
 try{for(const [body,assetId,sha256,outfit]of[['female','beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',1],['male','beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',2]]){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const response=await page.goto(base+'?body='+body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const c={body,identity:await verifyCandidate(page,{build,assetId,sha256}),responseCandidate:response.headers()['x-zbgs-candidate'],errors};report.cases.push(c);
  assert.equal(c.responseCandidate,build,'Fixed candidate server header');
  await page.locator('[data-outfit="'+outfit+'"]').click();assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),outfit);
  for(const mode of ['base','dressed']){await page.locator('[data-body-mode="'+mode+'"]').click();assert.equal(await page.locator('[data-body-mode="'+mode+'"]').getAttribute('aria-pressed'),'true')}
  await page.getByRole('button',{name:'装备眼镜',exact:true}).click();await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().accessories.glasses.loaded);
  c.templeFit=await page.evaluate(()=>__debug.avatar().livePresentation.getState().fit.glassesTempleProfile);assert.equal(c.templeFit.status,'fitted-candidate');
  await page.getByRole('button',{name:'房间全景',exact:true}).click();await page.locator('aside').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:path.join(out,body+'-room.png')});
  await page.getByRole('button',{name:'卸下眼镜',exact:true}).click();await page.waitForFunction(()=>!__debug.avatar().livePresentation.getState().accessories.glasses.loaded);
  assert.equal(errors.length,0);await page.close();
 }report.status='passed'}catch(e){report.status='failed';report.failure=String(e);throw e}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out)}
})().catch(e=>{console.error(e);process.exitCode=1});
