const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software rendering; not ordinary-PC performance or C3','Preauthored versioned content, not live business messages']};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Build mismatch');const started=Date.now();
 async function step(name,text,ms=2200){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(ms);if(await page.evaluate(()=>company.renderer.getContext().isContextLost()))throw Error('Context lost');await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
 for(let index=0;index<4;index++) {
  await page.evaluate(async index=>{await company.showAppearanceSample('information-board-floor',index);},index);
  await step('frame-'+(index+1),`落地板 ${index+1}/4 · 更换真实框体与支架，保留图文和安装规格。`);
 }
 await page.evaluate(async()=>{const r=company.catalog.resources.filter(r=>r.informationContent)[1];await company.apply([{type:'replace-resource',id:'floor-information/primary/content',resource:{id:r.id,version:r.version}}]);});
 await page.evaluate(()=>company.view('information'));
 await step('second-content','更换图文内容，板框、安装位置和实例身份保持。');
 await page.evaluate(async()=>{await company.showAppearanceSample('information-board-floor',0);company.view('information');});await step('keep-content','再次换框，刚才选中的图文仍然保留。');
 await page.evaluate(()=>company.apply([{type:'set-state',id:'floor-information/primary/content',state:{visible:false}}]));await step('hidden','隐藏图文，保留板框与另一块信息板。');
 await page.evaluate(async()=>{await company.save();});const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'floor-information.company.json'),await page.evaluate(()=>company.export()));
 await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Restore differs');await page.evaluate(async()=>{await company.showSpace('room',company.session.document.nodes[0].id,company.session.document.nodes[1].id);company.view('information');});await step('restored-hidden','重开后保留图文资源与隐藏状态。');
 await page.evaluate(()=>company.apply([{type:'set-state',id:'floor-information/primary/content',state:{visible:true}}]));await step('restored-visible','显示恢复的图文，内容和框体仍可分别修改。');
 await page.evaluate(async()=>{await company.load(company.layouts.floorInformationAlternate);await company.showSpace('room',company.session.document.nodes[0].id,company.session.document.nodes[1].id);company.view('information');});await step('turned-stand','第二布局旋转落地板，图文随父支架保持安装朝向。');
 await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await step('room','同一公司空间内，两块板可显示各自内容。',3000);
 report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(video){await video.saveAs(path.join(out,'floor-information-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
