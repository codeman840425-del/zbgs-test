const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const [dist,build,inputFile,opsFile,outArg]=process.argv.slice(2),out=path.resolve(outArg);
let sourceCommit='packaged-source';
try{
  execFileSync('git',['rev-parse','--show-toplevel'],{cwd:path.resolve(dist),encoding:'utf8'});
  sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
  if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording needs clean fixed source');
}catch(error){if(error.message==='Recording needs clean fixed source'||error.status!==128)throw error;}
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software-rendered company preview, not GPU performance evidence.','No real character use or ordinary-PC acceptance.']};
let server,browser,context,video;
(async()=>{
  await fs.mkdir(out);const inputBytes=await fs.readFile(inputFile),opsBytes=await fs.readFile(opsFile),input=JSON.parse(inputBytes),ops=JSON.parse(opsBytes),floors=input.nodes.filter(n=>n.kind==='floor');
  report.inputs={layout:createHash('sha256').update(inputBytes).digest('hex'),operations:createHash('sha256').update(opsBytes).digest('hex')};
  server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Build mismatch');const start=Date.now();
  async function step(text,name){
    await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(2300);
    await page.evaluate(()=>{if(company.session.scene.view.mode!=='building'&&company.renderer.getContext().isContextLost())throw Error('WebGL context lost');});
    await page.screenshot({path:path.join(out,`${name}.png`)});report.steps.push({name,text,seconds:(Date.now()-start)/1000});
  }
  await page.evaluate(doc=>company.load(doc),input);await step('两层混合素材公司：先看大楼外观。','01-exterior');
  await page.locator('.company-building-view__facade').click();await step('进入侧剖面，仅用于选择楼层。','02-section');
  await page.evaluate(id=>company.showSpace('floor',id),floors[0].id);await step('一层：真实住宅分区、公共客厅与不同款式的设施。','03-floor-one');
  await page.locator('#wall-view').selectOption('full');await step('完整墙体：保留正常建筑高度。','03a-full-walls');
  await page.locator('#wall-view').selectOption('cutaway');await step('自动剖切遮挡墙：只改变观看，不改变房间与设施。','03b-cutaway-walls');
  const room=input.nodes.find(n=>n.kind==='room'&&n.parentId===floors[0].id);
  await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:floors[0].id,r:room.id});await step('进入房间查看组件和组合工位。','04-room-before');
  await page.evaluate(ops=>company.apply(ops),ops);await step('整体转向、桌子局部调整、替换设备；桌面部件自动跟随。','05-room-edited');
  await page.evaluate(id=>company.showSpace('floor',id),floors[1].id);await step('二层采用不同家具布置；一层修改不影响二层。','06-floor-two');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'all-floors.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Saved company differs after reload');
  await page.evaluate(id=>company.showSpace('floor',id),floors[0].id);await step('重新打开后恢复两层完整布局与状态，可以继续编辑。','07-restored');
  report.durationSeconds=(Date.now()-start)/1000;report.status='recorded';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'mixed-company-normal1x.webm'));await video.delete();}
  if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,output:out}));
});
