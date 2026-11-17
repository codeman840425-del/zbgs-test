const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader functional recording; ordinary-PC, C3 and final human acceptance remain unverified.']};
let made=false,server,browser,context,video;
(async()=>{
 await fs.mkdir(out);made=true;server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const started=Date.now();
 async function step(name,text){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
 async function inside(){await page.evaluate(async()=>{const d=company.session.document;await company.showSpace('room',d.nodes[0].id,d.nodes[1].id);company.view('ceiling');});}
 for(let index=0;index<4;index++){await page.evaluate(i=>company.showAppearanceSample('ceiling-acoustic-baffle',i),index);await step('look-'+(index+1),['整片云板：真实顶挂连接，下面留出空间。','横向条板：同一安装位置，替换不同结构。','立式毡片：保留安装规格和实例身份。','木格栅：四款通过同一素材与配置入口。'][index]);}
 await page.evaluate(()=>company.view('top'));await step('top-view','俯视隐藏天花和顶挂，房间及下方设施仍保留。');await inside();await step('inside-again','进入房间看顶面，挂件恢复；观看不改变布置。');
 await page.evaluate(()=>company.apply([{type:'move',id:'ceiling-acoustic/primary',transform:{position:[-1,2.8,0],yaw:Math.PI/2}},{type:'copy-facility',id:'ceiling-acoustic/primary',newId:'ceiling-copy',transform:{position:[1,2.8,0],yaw:Math.PI/2}}]));await inside();await step('move-copy','移动、转向和复制，两个顶挂保持独立身份。');
 await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'ceiling-acoustic.company.json'),await page.evaluate(()=>company.export()));
 await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await inside();await step('restore','重新载入，两个顶挂的位置、朝向和资源版本保持。');
 await page.evaluate(()=>company.load(company.layouts.ceilingAcousticAlternate));await page.evaluate(()=>company.showAppearanceSample('ceiling-acoustic-baffle',2));await step('second-input','第二布置复用同一生产和加载链。');report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{await context?.close();if(video){await video.saveAs(path.join(out,'ceiling-acoustic-preview-normal1x.webm'));await video.delete();}await browser?.close();await server?.close();if(made)await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
