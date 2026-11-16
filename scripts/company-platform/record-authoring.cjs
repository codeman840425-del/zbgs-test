const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2);
if(!dist||!/^[a-f0-9]{12}$/.test(build||'')||!outArg)throw Error('Usage: node scripts/company-platform/record-authoring.cjs DIST BUILD OUTPUT_NEW_DIR');
const out=path.resolve(outArg);let server,browser,context,video;
const report={build,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim(),playbackSpeed:1,scope:'Company authoring and real WebGL preview; no character use validation',steps:[]};
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});
 server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});browser=await chromium.launch({headless:true});
 context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Runtime build mismatch');
 const start=Date.now();
 async function show(text,name){await page.evaluate(text=>{document.getElementById('status').textContent=text;},text);await page.waitForTimeout(2200);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({atSeconds:(Date.now()-start)/1000,text,image:name+'.png'});}
 async function settled(){await page.waitForFunction(()=>!document.getElementById('save').disabled);}
 await show('配置生成双工位，与真实新模型沙发组合。','01-room');
 await page.getByRole('button',{name:'沙发近景',exact:true}).click();await page.getByLabel('沙发样件').selectOption('2');await settled();
 await show('替换沙发模型，设施身份和两个使用点保持。','02-model');
 await page.getByLabel('沙发面料方案').selectOption('blue');await settled();
 await show('只改面料颜色，底座和结构保持。','03-material');
 await page.getByRole('button',{name:'室内总览',exact:true}).click();
 await page.evaluate(()=>company.apply([{type:'remove',id:'station-2'},{type:'copy-workstation',id:'station-1',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}]));
 await show('复制整套工位，桌椅、设备和补光一同生成独立实例。','04-copy');
 await page.evaluate(()=>company.apply([{type:'move',id:'station-copy',transform:{position:[1.6,0,-.3],yaw:Math.PI/2}},{type:'move',id:'station-copy/desk',transform:{position:[0,0,-1.1],yaw:0}}]));
 await show('整套旋转，再局部移动桌子；桌面设备自动跟随。','05-layout');
 await page.getByLabel('选择工位',{exact:true}).selectOption('station-copy');await page.getByRole('button',{name:'关闭屏幕',exact:true}).click();await settled();
 await show('只关闭新工位的屏幕，另一工位保持开启。','06-state');
 await page.getByRole('button',{name:'保存方案',exact:true}).click();await settled();
 const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'saved-company.json'),await page.evaluate(()=>company.export()));
 await page.getByLabel('选择布局',{exact:true}).selectOption('base');await settled();
 await show('切换到另一份布局，同一套加载流程。','07-another-input');
 await page.getByRole('button',{name:'恢复已保存',exact:true}).click();await settled();await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Restored document mismatch');
 await show('重新打开后恢复模型、配色、组合、位置和设备状态，可继续编辑。','08-restored');
 report.durationSeconds=(Date.now()-start)/1000;report.status='recorded';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
 if(context)await context.close();if(video){await video.saveAs(path.join(out,'company-authoring-normal1x.webm'));await video.delete();}
 if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,build,sourceCommit:report.sourceCommit,steps:report.steps.length,output:out,error:report.error}));
});
