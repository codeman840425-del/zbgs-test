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
  for(const branch of ['storage-shelf','tabletop-ornament'])for(let i=0;i<4;i++){
    await page.evaluate(({branch,i})=>company.showAppearanceSample(branch,i),{branch,i});
    await step(`${branch}-${i+1}`,branch==='storage-shelf'?`开放架外观 ${i+1}/4：三层承载位置保持一致。`:`陈列摆件外观 ${i+1}/4：复用相同承载与安装规格。`);
  }
  await page.evaluate(async()=>{
    await company.apply([{type:'move',id:'support/shelf',transform:{position:[1.25,0,-1.3],yaw:Math.PI/2}},{type:'copy-group',id:'support/display',newId:'support/clone',transform:{position:[0,0,2.6],yaw:0}}]);company.view('top');
  });await step('moved-copied','移动、转向并复制整架，摆件跟随，各实例身份独立。');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'supports.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Saved scene differs after reopen');
  await page.evaluate(()=>company.view('top'));await step('restored','重开后，整体位置、三层摆件和独立实例完整恢复。');
  await page.evaluate(()=>company.load(company.layouts.supportAlternate));await step('second-input','转向布局复用同一开放架、承载合同与摆件。');
  report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'support-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
