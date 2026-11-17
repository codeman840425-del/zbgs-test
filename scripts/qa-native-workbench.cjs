const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and new evidence directory');
(async()=>{
 const root=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const build=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
 const report={build:build.shortId,errors:[],checks:[],status:'incomplete'};let server,browser,page;
 try{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
  server=require('node:http').createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+path.sep))throw Error('invalid path');const bytes=await fs.readFile(p);res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(String(e)));
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url+'/?workbench=appearance');
  await page.waitForFunction(()=>__debug.ready&&document.querySelector('#appearance-body')?.options.length>0,null,{timeout:60000});
  // replaceState updates emit framenavigated too; count only new documents.
  let navigations=0;page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')navigations++;});
  const documentIdentity=await page.evaluate(()=>window.workbenchDocumentIdentity=crypto.randomUUID());
  await page.locator('#appearance-body').selectOption('native-female-843ac-v1');
  await page.waitForFunction(()=>__debug.avatar()?.profile.bodyType==='native-female-843ac-v1'&&!document.querySelector('#appearance-body').disabled,null,{timeout:60000});
  assert.equal(navigations,0);assert.equal(await page.evaluate(()=>window.workbenchDocumentIdentity),documentIdentity);assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);
  for(const id of ['appearance-hair-color','appearance-skin-tone','appearance-eye-color','appearance-lip-color'])assert(await page.locator('#'+id).isDisabled(),id);
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-full-front');});
  await page.screenshot({path:path.join(out,'native-workbench.png')});
  report.checks.push('existing female to native candidate without page reload; unverified palette disabled');
  await page.locator('[data-outfit="3"]').click();
  await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().equipment.items.alternateTop?.visible===true);
  await page.locator('[data-workbench-tab="inspection"]').click();
  await page.locator('[data-body-mode="base"]').click();
  await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().equipment.bodyTextureCoverage.covered===false);
  await page.screenshot({path:path.join(out,'native-base.png')});
  await page.locator('[data-body-mode="dressed"]').click();
  await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().equipment.bodyTextureCoverage.covered===true);
  assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.alternateTop.visible),true);
  report.checks.push('actual outfit buttons and base/dressed restore custom top and coverage');
  await page.locator('[data-appearance-group="male"]').click();
  await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='male',null,{timeout:60000});
  await page.locator('[data-appearance-group="female"]').click();
  await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='female',null,{timeout:60000});
  assert.equal(navigations,0);assert.equal(await page.evaluate(()=>window.workbenchDocumentIdentity),documentIdentity);report.checks.push('male and female group switch remains in page');
  await page.goto(url+'/native-production.html');
  assert.equal(await page.locator('a[href*="body=native-female-843ac-v1"]').count(),1);
  assert((await page.locator('[data-factory-video]').getAttribute('src')).includes('7871-v2'));
  await page.screenshot({path:path.join(out,'native-production-entry.png')});
  report.checks.push('production entry links real candidate and original-build video');
  assert.deepEqual(report.errors,[]);report.status='technical-ui-passed';
 }catch(e){report.status='failed';report.error=String(e.stack||e);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
