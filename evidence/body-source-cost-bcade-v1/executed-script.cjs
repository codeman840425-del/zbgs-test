// One immutable-build CPU sample, without runtime instrumentation or GPU changes.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=process.argv[2],build='bcade40d24f1',out=path.resolve('evidence/body-source-cost-bcade-v1');
assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||''),'Use run-fixed-check with immutable bcade dist');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 await fs.mkdir(out);await fs.mkdir(path.join(out,'bundles'));await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={build,status:'started',errors:[],scope:'One fresh Chrome process/context, cleared storage, female-to-male. CDP 1ms CPU sampling adds overhead. No recording/screenshots/runtime injection/GL hooks. Driver/OS cache not reset. Sampling is not whole-stage wall timing; unavailable lexical stages remain unmeasured.'};
 let browser,page,cdp,started=false,watchdog;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});watchdog=setTimeout(()=>{report.errors.push('90-second timeout');void browser.close();},90000);
  const context=await browser.newContext({viewport:{width:1600,height:1000}});page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',e=>report.errors.push(String(e)));
  await context.addInitScript(()=>{try{localStorage.clear();sessionStorage.clear();}catch{}});
  await page.goto(base+'?workbench=appearance&body=female');await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields')?.disabled);
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);await page.waitForTimeout(350);
  report.environment=await page.evaluate(()=>{const d=__debug,r=d.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{buildInfo:d.buildInfo,browser:navigator.userAgent,body:d.avatar().profile.bodyType,geometry:d.avatar().facialGeometry.getState(),localStorageKeys:Object.keys(localStorage),shaderChecks:r.debug.checkShaderErrors,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null};});
  assert.equal(report.environment.body,'female');assert.equal(report.environment.localStorageKeys.length,0);assert.equal(report.environment.shaderChecks,true);
  cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');started=true;
  report.command=await page.evaluate(async()=>{const start=performance.now(),result=await __debug.command({type:'bodySelect',bodyType:'male'});return{start,end:performance.now(),result,bodyAfter:__debug.avatar().profile.bodyType};});
  assert.equal(report.command.result.applied,true);assert.equal(report.command.bodyAfter,'male');
  await page.waitForTimeout(900);
  const {profile}=await cdp.send('Profiler.stop');started=false;await fs.writeFile(path.join(out,'body-switch.cpuprofile'),JSON.stringify(profile));
  report.commandMs=report.command.end-report.command.start;
  report.final=await page.evaluate(()=>({body:__debug.avatar().profile.bodyType,geometry:__debug.avatar().facialGeometry.getState(),keys:Object.keys(localStorage)}));
  const urls=await page.evaluate(()=>[...new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(u=>new URL(u).pathname.endsWith('.js')))]);
  report.bundles=[];
  for(const url of urls){const response=await context.request.get(url);assert(response.ok());const bytes=await response.body(),name=path.basename(new URL(url).pathname);await fs.writeFile(path.join(out,'bundles',name),bytes);report.bundles.push({url,file:'bundles/'+name,sha256:sha(bytes),bytes:bytes.length});}
  report.profileSha256=sha(await fs.readFile(path.join(out,'body-switch.cpuprofile')));report.scriptSha256=sha(await fs.readFile(__filename));report.status=report.errors.length?'measured-with-errors':'measured';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{
  clearTimeout(watchdog);
  if(started&&cdp)try{const {profile}=await cdp.send('Profiler.stop');await fs.writeFile(path.join(out,'partial.cpuprofile'),JSON.stringify(profile));}catch{}
  if(browser)await browser.close();report.closedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status,commandMs:report.commandMs}));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
