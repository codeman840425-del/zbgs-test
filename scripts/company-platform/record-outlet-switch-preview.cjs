const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [distArg,build,outArg]=process.argv.slice(2),dist=path.resolve(distArg),out=path.resolve(outArg);
if(!distArg||!/^[a-f0-9]{12}$/.test(build||'')||!outArg)throw Error('Use FIXED_DIST BUILD_ID OUT');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:dist,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:dist,encoding:'utf8'}).trim())throw Error('Recording requires a clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,status:'running',steps:[],limits:['SwiftShader functional recording; ordinary-PC performance is not measured.','The display state is not electrical simulation and this package does not claim character C3.']};
let server,browser,context,video;
(async()=>{
  await fs.mkdir(out,{recursive:true});
  server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();
  await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo,{timeout:60000});
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
  const started=Date.now();
  async function step(name,text){
    await page.evaluate(value=>{const element=document.getElementById('status');if(element)element.textContent=value;},text);
    await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);
    await page.screenshot({path:path.join(out,`${name}.png`)});
    report.steps.push({name,text,seconds:(Date.now()-started)/1000});
  }
  async function show(index){await page.evaluate(i=>company.showAppearanceSample('outlet-switch',i),index);}
  for(let index=0;index<4;index++){
    await show(index);
    await step(`look-${index+1}`,['单联插座：面板、插孔和指示目标来自真实几何。','多联插座：扩大面板并保留同一墙面安装合同。','翘板开关：面板、按键和指示目标随资源替换。','控制面板：多按键结构沿通用显示状态链加载。'][index]);
  }
  const stateTarget=await page.evaluate(()=>company.session.document.nodes.find(node=>node.resource?.id?.startsWith('outlet-switch-'))?.id);
  assert(stateTarget,'outlet-switch sample target missing');
  await page.evaluate(async id=>{await company.apply([{type:'set-state',id,state:{on:false}}]);},stateTarget);
  await step('state-off','关闭状态：指示目标关闭，墙面安装和实例身份保持。');
  await page.evaluate(async id=>{await company.apply([{type:'set-state',id,state:{on:true}}]);},stateTarget);
  await step('state-on','开启状态：指示目标显示工作状态，未改变墙体和安装数据。');
  await page.evaluate(()=>company.save());
  const saved=await page.evaluate(()=>company.session.document);
  await fs.writeFile(path.join(out,'outlet-switch.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo,{timeout:60000});
  assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
  await step('restore','关闭重开后恢复四款素材链中的当前资源与开启状态。');
  await page.evaluate(()=>company.load(company.layouts.twoStationsAlternate));
  await show(1);await step('second-input','第二布局复用同一插座/开关资源登记、安装和状态链。');
  report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  await context?.close();
  if(video){await video.saveAs(path.join(out,'outlet-switch-normal1x.webm'));await video.delete();}
  await browser?.close();await server?.close();
  await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
