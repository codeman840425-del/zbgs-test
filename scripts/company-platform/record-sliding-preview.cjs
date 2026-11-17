const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software rendering, no ordinary-PC performance claim','No role integration or human acceptance']};
let server,browser,context,video;
(async()=>{
  await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Build mismatch');const started=Date.now();
  async function step(name,text){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(1800);if(await page.evaluate(()=>company.renderer.getContext().isContextLost()))throw Error('Context lost');await page.screenshot({path:path.join(out,`${name}.png`)});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
  for(let i=0;i<4;i++) {
    await page.evaluate(i=>company.showAppearanceSample('sliding-drawer-cabinet',i),i);
    for(const fraction of [0,.5,1]) {
      await page.evaluate(async fraction=>{await company.apply([{type:'set-state',id:'sliding/cabinet',state:{openFraction:fraction}}]);company.view('cabinet');},fraction);
      await step(`cabinet-${i+1}-${fraction}`,`抽屉造型 ${i+1}/4 · ${fraction===0?'收回':fraction===1?'全拉':'半拉'}：柜顶摆件位置保持。`);
    }
  }
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'sliding.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Saved scene differs after reopen');
  await page.evaluate(()=>company.view('cabinet'));await step('restored','重新打开，造型、抽拉状态和柜顶摆件完整恢复。');
  await page.evaluate(async()=>{await company.load(company.layouts.slidingAlternate);await company.apply([{type:'set-state',id:'sliding/cabinet',state:{openFraction:.5}}]);company.view('room');});await step('second-input','转向布局复用同一柜体与抽拉合同，实例方向同步。');
  report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'sliding-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
