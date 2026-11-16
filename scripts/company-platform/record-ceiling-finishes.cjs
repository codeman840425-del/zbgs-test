const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software rendering, no ordinary-PC performance claim.','No real character integration or user acceptance.']};
let server,browser,context,video;
(async()=>{
  await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Build mismatch');const start=Date.now();
  async function step(name,text){
    await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(2000);
    if(await page.evaluate(()=>company.renderer.getContext().isContextLost()))throw Error('Context lost');
    await page.screenshot({path:path.join(out,`${name}.png`)});report.steps.push({name,text,seconds:(Date.now()-start)/1000});
  }
  await page.locator('#layout').selectOption('surfaceHome');await page.waitForFunction(()=>!document.getElementById('save').disabled);
  const choices=await page.locator('#finish-ceiling option').evaluateAll(options=>options.filter(o=>o.value&&!o.disabled).map(o=>({id:o.value,label:o.textContent})));
  if(choices.length!==4)throw Error('Expected four actual ceiling variants');
  for(let i=0;i<choices.length;i++) {
    await page.locator('#finish-ceiling').selectOption(choices[i].id);await page.waitForFunction(()=>!document.getElementById('save').disabled);
    await page.locator('[data-view="ceiling"]').click();
    if(!(await page.evaluate(()=>company.session.scene.surfacePresentation().find(s=>s.surface==='ceiling')?.visible)))throw Error('Ceiling did not display');
    await step(`ceiling-${i+1}`,`房内仰视：${choices[i].label}，保持同一房间与家具。`);
  }
  await page.locator('[data-view="top"]').click();await step('05-overview','回到俯视：隐藏顶面只为观看室内，配置与使用状态保留。');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
  await fs.writeFile(path.join(out,'ceiling-room.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Restore differs');
  await page.locator('[data-view="ceiling"]').click();await step('06-restored','重新打开后，顶面材质与铺设参数完整恢复。');
  await page.evaluate(async()=>{
    await company.load(company.layouts.surfaces);const r=company.session.document.nodes.find(n=>n.kind==='room'),resource=company.catalog.resources.find(r=>r.finish?.allowedSurfaces.includes('ceiling'));
    await company.apply([{type:'set-surface-finish',id:r.id,surface:'ceiling',finish:{resource:{id:resource.id,version:resource.version}}}]);
    await company.showSpace('room',r.parentId,r.id);company.view('ceiling');
  });await step('07-second-input','两层住宅中的另一房间，复用同一顶面资源与制作流程。');
  report.status='recorded';report.durationSeconds=(Date.now()-start)/1000;
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'ceiling-finishes-normal1x.webm'));await video.delete();}
  if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,output:out}));
});
