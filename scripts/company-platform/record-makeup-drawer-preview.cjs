const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim(),'');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader; ordinary-PC performance and character C3 untested','Four open inserts ride inside a real 32cm-travel drawer; no pickup or makeup character action.']};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(out);report.recordingTool={path:'scripts/company-platform/record-makeup-drawer-preview.cjs',sha256:createHash('sha256').update(await fs.readFile(__filename)).digest('hex')};
 server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const start=Date.now();
 async function step(name,text,ms=3000){await page.evaluate(text=>{document.getElementById('status').textContent=text;company.drawHostFrame();},text);await page.waitForTimeout(ms);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-start)/1000});}
 for(let index=0;index<4;index++) {
  await page.evaluate(index=>company.showAppearanceSample('makeup-storage-drawer',index),index);
  await page.evaluate(()=>{company.view('cabinet');document.querySelector('#cabinet').scrollIntoView({block:'center'});});
  await step('storage-'+(index+1),['托盘：复用已验造型，修改源参数并导出；放入真实柜抽屉。','分格收纳：换款保留小圆盒、抽屉开度和依附关系。','刷具杯：保留真实杯高与厚壁，整套随抽屉移动。','开放化妆箱：提手和格腔保持，关闭后容纳于柜内。'][index]);
 }
 for(const value of [0,.5,1]) {
  await page.click(`[data-opening="${value}"]`);await page.waitForFunction(value=>company.session.document.nodes.find(n=>n.id==='makeup-drawer/primary').state.openFraction===value,value);
  await step('opening-'+value,`抽屉开度 ${value*100}%：收纳盒及小圆盒一起随动，柜顶时钟保持静止。`);
 }
 await page.evaluate(()=>company.apply([{type:'set-state',id:'makeup-drawer/primary',state:{openFraction:.83}}]));
 await page.evaluate(()=>company.showAppearanceSample('makeup-storage-drawer',0));await page.evaluate(()=>company.view('cabinet'));
 await step('partial-retained','以83%开度换回托盘：保留内部小物身份、依附和状态。');
 await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'makeup-drawer.company.json'),await page.evaluate(()=>company.export()));
 await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await page.evaluate(()=>{company.view('cabinet');document.querySelector('#cabinet').scrollIntoView({block:'center'});});
 await step('restored','重新加载后仍是83%开度；两级物件分别恢复，位置不累加偏移。');
 await page.evaluate(()=>company.load(company.layouts.makeupDrawerAlternate));await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await step('two-rooms','第二布局：两间同名准备间，独立侧柜朝向不同，内容身份独立。');
 await page.evaluate(async()=>{const t=company.session.document.nodes.find(n=>n.id==='vanity/secondary');await company.showSpace('room',company.session.document.nodes[0].id,t.parentId);document.getElementById('cabinet').value='makeup-drawer/secondary';company.view('cabinet');});
 await step('turned-room','第二间近看：侧柜转向后，抽屉和内部物件沿柜体方向移动。');
 await page.evaluate(()=>company.apply([{type:'set-state',id:'makeup-drawer/secondary',state:{openFraction:1}}]));await page.evaluate(()=>company.view('cabinet'));await step('turned-open','第二间全拉，第一间仍保持自己的开度和内容。');
 report.cost=await page.evaluate(()=>({mirrors:company.mirrorController.snapshot(),cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory},render:{...company.renderer.info.render}}));report.status='recorded';report.scriptSeconds=(Date.now()-start)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(video){await video.saveAs(path.join(out,'makeup-drawer-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
