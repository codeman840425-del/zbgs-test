const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2);
if(!dist||!/^[a-f0-9]{12}$/.test(build||'')||!outArg)throw Error('Usage: node scripts/company-platform/record-company-c2.cjs FIXED_DIST BUILD OUTPUT_NEW_DIR');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires a clean fixed source checkout');
const out=path.resolve(outArg),report={build,sourceCommit,playbackSpeed:1,steps:[],scope:'Company production and viewing. No character use or ordinary-PC acceptance.'};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
 server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});browser=await chromium.launch({headless:true});
 context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Runtime build differs');
 const start=Date.now();
 async function show(text,name){await page.evaluate(text=>{document.getElementById('status').textContent=text;},text);await page.waitForTimeout(2200);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({atSeconds:(Date.now()-start)/1000,text,image:name+'.png'});}
 await show('半面积民房样件：一套工位、沙发和装饰，家具保持原尺寸。','01-small-home');
 await page.evaluate(()=>company.view('sofa'));await show('固定双座功能规格：先看软包外观。','02-soft-sofa');
 await page.getByLabel('沙发样件').selectOption('timber');await page.waitForFunction(()=>!document.getElementById('save').disabled);
 await show('换成真实木框模型；座位、接近点、阻挡及设施身份保持。','03-timber-sofa');
 await page.evaluate(()=>company.load(company.layouts.rental));await show('三间经营房分别通向公共客厅，沿同一配置加载。','04-rental-home');
 await page.evaluate(()=>company.load(company.layouts.twoFloors));await show('两份不同布局构成两层；概览仅显示轻量结构。','05-two-floors');
 await page.evaluate(()=>company.showSpace('floor','two-floor-company/floor-1'));await show('进入一层，加载这一层的真实组件。','06-first-floor');
 await page.evaluate(()=>company.showSpace('room','two-floor-company/floor-2','two-floor-company/floor-2/room-2'));await show('二层采用转向工位，附近详细显示，远处简化。','07-second-floor');
 await page.evaluate(async()=>{const node=company.session.document.nodes.find(n=>n.id.endsWith('/floor-2/room-2/station-1/monitor'));await company.apply([{type:'set-state',id:node.id,state:{on:false}}]);await company.save();});
 await fs.writeFile(path.join(out,'all-floors.company.json'),await page.evaluate(()=>company.export()));
 await show('关闭二层一个屏幕，保存全部楼层与独立设备状态。','08-save-all');
 const saved=await page.evaluate(()=>company.session.document);await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(JSON.stringify(saved)!==JSON.stringify(await page.evaluate(()=>company.session.document)))throw Error('Reload did not restore complete saved document');
 await page.evaluate(()=>company.showSpace('floor','two-floor-company/floor-2'));await show('刷新后完整恢复，可继续修改；真实浏览器关闭重开另有检查。','09-restored');
 await page.evaluate(()=>company.load(company.layouts.building));await show('同一机制组成五层代表配置；新的16房与老板空间方案留后续。','10-building');
 report.durationSeconds=(Date.now()-start)/1000;report.status='recorded';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
 if(context)await context.close();if(video){await video.saveAs(path.join(out,'company-c2-normal1x.webm'));await video.delete();}
 if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,build,sourceCommit,steps:report.steps.length,output:out,error:report.error}));
});
