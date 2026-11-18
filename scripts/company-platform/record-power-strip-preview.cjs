const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [distArg,build,outArg]=process.argv.slice(2),dist=path.resolve(distArg),out=path.resolve(outArg);
if(!distArg||!/^[a-f0-9]{12}$/.test(build||'')||!outArg)throw Error('Use FIXED_DIST BUILD_ID OUT');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:dist,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:dist,encoding:'utf8'}).trim())throw Error('Recording requires a clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,status:'running',steps:[],limits:['SwiftShader functional recording; ordinary-PC performance is not measured.','Visual endpoints do not simulate electricity or USB communication.','No real-character C3 usage.']};
let server,browser,context,video;
(async()=>{
  await fs.mkdir(out,{recursive:true});server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo,{timeout:60000});assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const started=Date.now();
  async function step(name,text){await page.evaluate(value=>{const element=document.getElementById('status');if(element)element.textContent=value;},text);await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,`${name}.png`)});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
  for(let index=0;index<4;index++){await page.evaluate(i=>company.showAppearanceSample('power-strip',i),index);await step(`look-${index+1}`,['桌面插排：四个视觉端点和状态指示加载。','桌下插排样式：沿同一桌面承载合同替换。','塔式插排：保留端点布局和设备连接。','USB插排：同一状态和保存链路加载。'][index]);}
  await page.evaluate(()=>company.apply([{type:'set-state',id:'power-strip/primary',state:{on:true}},{type:'move',id:'power-strip/desk',transform:{position:[.45,0,.15],yaw:Math.PI/2}}]));await step('connected-moved','开启状态并整体移动桌子，两个设备连接继续跟随。');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'power-strip.company.json'),await page.evaluate(()=>company.export()));await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo,{timeout:60000});assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await step('restore','保存重开后恢复插排状态、端点引用和桌面整体变换。');
  await page.evaluate(()=>company.showAppearanceSample('power-strip',3));await step('second-input','第二次输入复用同一四端点资源登记和连接机制。');report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{await context?.close();if(video){await video.saveAs(path.join(out,'power-strip-normal1x.webm'));await video.delete();}await browser?.close();await server?.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
