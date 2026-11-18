const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
let sourceCommit='packaged-source';
try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');}catch(error){if(error.message==='Recording requires clean fixed source')throw error;}
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
  await page.locator('#layout').selectOption('surfaces',{force:true});await page.waitForFunction(()=>!document.getElementById('save').disabled);
  const ids=await page.evaluate(()=>{const d=company.session.document;return{floors:d.nodes.filter(n=>n.kind==='floor').map(n=>n.id),room:d.nodes.find(n=>n.kind==='room').id};});
  await page.evaluate(id=>company.showSpace('floor',id),ids.floors[0]);await step('01-complete-floor','墙纸和地面覆盖真实房间；公共客厅也有完整饰面。');
  await page.evaluate(ids=>company.showSpace('room',ids.floors[0],ids.room),ids);
  for(const type of ['wall','floor']) {
    const choices=await page.locator(`#finish-${type} option`).evaluateAll(options=>options.filter(o=>o.value&&!o.disabled).map(o=>({id:o.value,label:o.textContent})));
    for(let i=0;i<choices.length;i++) {
      await page.locator(`#finish-${type}`).selectOption(choices[i].id,{force:true});await page.waitForFunction(()=>!document.getElementById('save').disabled);
      if(await page.locator('#status').getAttribute('data-error')==='true')throw Error(await page.locator('#status').textContent());
      await step(`${type}-${i+1}`,`${type==='wall'?'整面墙纸':'完整地面'}：${choices[i].label}；家具位置与功能保留。`);
    }
  }
  await page.locator('#finish-turn').click({force:true});await page.waitForFunction(()=>!document.getElementById('save').disabled);await step('10-direction','旋转地面铺装方向，不旋转或搬动家具。');
  await page.evaluate(id=>company.showSpace('floor',id),ids.floors[1]);await step('11-second-floor','第二层沿用同一生产流程，完整保留自己的布局与饰面。');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'all-floors.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Restore differs');
  await page.evaluate(ids=>company.showSpace('room',ids.floors[0],ids.room),ids);await step('12-restored','重开后恢复两层全部饰面、方向与家具配置。');
  await page.locator('#layout').selectOption('surfaceHome',{force:true});await page.waitForFunction(()=>!document.getElementById('save').disabled);await step('13-second-input','民房采用第二份布局和饰面配方，复用同一入口。');
  report.status='recorded';report.durationSeconds=(Date.now()-start)/1000;
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'surface-finishes-normal1x.webm'));await video.delete();}
  if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,output:out}));
});
