const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
if(!dist||!/^[a-f0-9]{12}$/.test(build||''))throw Error('Use FIXED_DIST BUILD NEW_OUTPUT_DIRECTORY');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:dist,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:dist,encoding:'utf8'}).trim())throw Error('Recording requires a clean fixed checkout');
let server,browser,context,video;const report={sourceCommit,build,playbackSpeed:1,steps:[],scope:'Scene viewing and editing, software rendering. No character integration or ordinary-PC performance evidence.'};
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw'),size:{width:1440,height:1000}}});const page=await context.newPage();video=page.video();
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);const start=Date.now();
 const idle=()=>page.waitForFunction(()=>!document.querySelector('#save').disabled);
 async function show(text,name){await page.evaluate(t=>document.querySelector('#status').textContent=t,text);await page.waitForTimeout(2800);await page.screenshot({path:path.join(out,`${name}.png`)});report.steps.push({atSeconds:(Date.now()-start)/1000,text,image:`${name}.png`});}
 async function choose(key){await page.locator('#layout').selectOption(key);await idle();}
 await show('民房：18平方米，家具保持实际尺寸。','01-small-home');
 await choose('studio');await show('单间：36平方米，两倍基础面积。','02-single-room');
 await choose('rental');await show('整套出租屋：三个经营房间围绕公共客厅，门口真实连通。','03-rental');
 const sofa=await page.evaluate(()=>company.session.document.nodes.find(n=>n.resource?.id==='lounge-sofa'));
 await page.evaluate(id=>company.showSpace('room',undefined,id),sofa.parentId);await page.locator('#edit-instance').selectOption(sofa.id);await idle();await page.locator('#edit-look').selectOption({index:1});await idle();await show('选中当前物品后原位更换外观；位置与归属保留。','04-change-look');
 await choose('flat');await show('整层：两排各八间，中央通道、等候区与服务预留独立管理。','05-flat');
 await choose('building');await show('整栋：轻量大楼外观，不加载所有楼层室内模型。','06-building');
 await page.locator('.company-building-view__facade').click();await show('进入时过渡到竖向剖面，选择具体楼层。','07-section');
 await page.locator('.company-building-view__floor').first().click();await idle();await show('进入第五层，加载这一层的实际场景。','08-floor-five');
 await choose('twoFloors');const floors=await page.evaluate(()=>company.session.document.nodes.filter(n=>n.kind==='floor'));
 await page.evaluate(id=>company.showSpace('floor',id),floors[0].id);await show('第一层：同一空间机制，不同经营用途和设施配置。','09-floor-one');
 await page.evaluate(id=>company.showSpace('floor',id),floors[1].id);await show('第二层：独立身份与状态；切层不会改动已保存配置。','10-floor-two');
 await page.locator('#save').click();await idle();report.savedDocument=await page.evaluate(()=>company.session.document);await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);await show('从保存恢复完整两层公司。','11-restored');
 report.status='passed';report.wallSeconds=(Date.now()-start)/1000;await context.close();context=null;await video.saveAs(path.join(out,'space-normal1x.webm'));
})().catch(e=>{report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();await server?.close();await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');});
