const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
let sourceCommit='packaged-source';
try{
 sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
 if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
}catch(error){if(error.message==='Recording requires clean fixed source')throw error;}
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader functional recording; ordinary-PC performance, C3 and final human acceptance remain unverified.']};
let server,browser,context,video,page;
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw'),size:{width:1440,height:1000}}});page=await context.newPage();video=page.video();
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const started=Date.now();
 async function idle(){await page.waitForFunction(()=>!document.querySelector('#mode-room')?.disabled);}
 async function step(name,text){await idle();await page.evaluate(text=>{const e=document.getElementById('status');if(e)e.textContent=text;},text);await page.waitForTimeout(1400);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
 for(let index=0;index<4;index++){
   await page.evaluate(i=>company.showAppearanceSample('fill-light',i),index);await page.evaluate(async()=>{const n=company.session.document.nodes.find(n=>n.resource&&n.resource.id.startsWith('fill-light'));if(n)await company.apply([{type:'set-state',id:n.id,state:{on:true,intensity:2}}]);});
   await step('look-'+(index+1),['环形柔光','双翼反光','立柱柔光','悬臂面板'][index]);
   const state=await page.evaluate(()=>company.snapshot().lights.filter(l=>l.intensity>0));assert(state.length>=1);report.steps.push({name:'state-on-'+(index+1),lights:state});
 }
 await page.evaluate(async()=>{const n=company.session.document.nodes.find(n=>n.resource&&n.resource.id.startsWith('fill-light'));if(n)await company.apply([{type:'set-state',id:n.id,state:{on:false,intensity:2}}]);});await step('light-off','关闭补光：发光面与实时光源关闭。');
 await page.evaluate(async()=>{const n=company.session.document.nodes.find(n=>n.resource&&n.resource.id.startsWith('fill-light'));if(n)await company.apply([{type:'set-state',id:n.id,state:{on:true,intensity:3}}]);await company.save();});const saved=await page.evaluate(()=>company.session.document);await step('light-on-intensity-3','恢复补光并调整强度为3。');
 await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);await idle();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await step('restored','关闭并重开后恢复外观、开关和强度。');report.status='recorded';report.elapsedSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{await context?.close();if(video){await video.saveAs(path.join(out,'fill-light-normal1x.webm'));await video.delete();}await browser?.close();await server?.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
