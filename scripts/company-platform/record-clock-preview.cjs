const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software rendering, no ordinary-PC performance claim','Host time preview only; no business clock or role integration']};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Build mismatch');const started=Date.now();
 async function step(name,text,ms=1800){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(ms);if(await page.evaluate(()=>company.renderer.getContext().isContextLost()))throw Error('Context lost');await page.screenshot({path:path.join(out,`${name}.png`)});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
 for(const branch of ['analog-clock','digital-clock'])for(let i=0;i<4;i++){
  await page.evaluate(async({branch,i})=>{await company.showAppearanceSample(branch,i);company.setPreviewClock(33330);company.view('clock');},{branch,i});
  await step(`${branch}-${i+1}`,`${branch==='analog-clock'?'指针钟':'数字钟'} ${i+1}/4 · 同规格真实外观，固定对照时间 09:15:30。`);
 }
 await page.evaluate(()=>company.setPreviewClock(null));await step('digital-running','数字钟消费预览宿主时间，正常速度走时。',5000);
 for(const state of [{on:false},{on:true,brightness:.3},{brightness:1}]){await page.evaluate(state=>company.apply([{type:'set-state',id:'clock/primary',state}]),state);await step(`digital-${state.on===false?'off':state.brightness}`,state.on===false?'关闭数字显示。':`数字显示亮度 ${state.brightness}，不增加照明光源。`);}
 for(const seconds of [86399,86400]){await page.evaluate(seconds=>company.setPreviewClock(seconds),seconds);await step(`time-${seconds}`,seconds===86399?'宿主输入：23:59:59。':'宿主输入：跨日 00:00:00。');}
 await page.evaluate(async()=>{await company.apply([{type:'set-state',id:'clock/primary',state:{timeOffsetSeconds:3600,brightness:.3}}]);await company.save();});const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'clocks.company.json'),await page.evaluate(()=>company.export()));
 await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Restore differs');await page.evaluate(()=>{company.setPreviewClock(33330);company.view('clock');});await step('restored','重开后保留造型、亮度和一小时偏移；显示时间由当前宿主输入确定。');
 await page.evaluate(async()=>{await company.load(company.layouts.clockAlternate);company.setPreviewClock(null);company.view('clock');});await step('analog-running','侧墙布局复用同一素材，指针按正常速度连续走时。',6000);
 await page.evaluate(()=>company.view('room'));await step('second-layout','同一套钟表放入第二布局，保持真实墙面安装方向。');
 report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(video){await video.saveAs(path.join(out,'clock-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
