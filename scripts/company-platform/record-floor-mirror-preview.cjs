const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader; not ordinary-PC, role C3 or final human acceptance','One active planar mirror; other mirror surfaces are explicitly non-realtime']};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
 if(await page.evaluate(()=>company.buildInfo.shortId)!==build)throw Error('Build mismatch');const started=Date.now();
 async function aim(alternate=false){const previous=await page.evaluate(alternate=>{const previous=company.mirrorController.snapshot().reflectionPasses;company.camera.position.set(...(alternate?[.5,.92,0]:[1.5,.92,.5]));company.camera.lookAt(...(alternate?[-1.974,.92,0]:[1.5,.92,-1.474]));company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});return previous;},alternate);await page.waitForTimeout(40);await page.evaluate(()=>company.drawHostFrame());await page.waitForFunction(previous=>company.mirrorController.snapshot().reflectionPasses>previous&&company.session.scene.mirrorBindings().some(b=>b.fresh),previous);}
 async function step(name,text,ms=2300){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(ms);if(await page.evaluate(()=>company.renderer.getContext().isContextLost()))throw Error('Context lost');await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
 for(let index=0;index<4;index++){await page.evaluate(index=>company.showAppearanceSample('floor-mirror',index),index);await step('stand-'+(index+1),`落地镜 ${index+1}/4 · 完整造型与地面支承。`,1800);await aim();await step('mirror-'+(index+1),`落地镜 ${index+1}/4 · 独立镜片、底座与脚架，反射当前房间。`);}
 await page.evaluate(()=>company.showAppearanceSample('floor-mirror',1));await aim();
 await step('behind-camera','绿植位于当前主镜头后方；镜子仍反射它，未使用预制镜像。');
 await page.evaluate(()=>company.apply([{type:'move',id:'floor-mirror/object',transform:{position:[2,0,1.6],yaw:0}}]));await step('moved-object','移动实际绿植，镜中位置随之变化；镜子和工位不动。');
 await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'floor-mirror.company.json'),await page.evaluate(()=>company.export()));
 await page.reload();await page.waitForFunction(()=>window.company?.ready);if(JSON.stringify(await page.evaluate(()=>company.session.document))!==JSON.stringify(saved))throw Error('Restore differs');await aim();await step('restored','重开保留镜子外观和绿植布置，镜面重新反射当前场景。');
 await page.evaluate(()=>company.load(company.layouts.floorMirrorAlternate));await aim(true);await step('turned-stand','第二布局：落地镜转向90度，反射与地面阻挡保持一致。');
 await page.evaluate(()=>company.showSpace('building'));await step('building','返回大楼概览，释放室内镜面显示资源。');
 await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await aim(true);await step('returned','回到本层，重新建立当前楼层的反射。');
 report.cost=await page.evaluate(()=>company.mirrorController.snapshot());report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(video){await video.saveAs(path.join(out,'floor-mirror-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
