const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim(),'');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader visual comparison; not ordinary-PC performance','Only explicit host quality changes; resource and document identity are preserved']};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
 const preferred=await page.evaluate(()=>company.mirrorRenderProfile),start=Date.now();assert.equal(preferred,'detail-1024-msaa4-v1');
 async function nextFrame(previous){await page.waitForTimeout(40);await page.evaluate(()=>company.drawHostFrame());await page.waitForFunction(previous=>company.mirrorController.snapshot().reflectionPasses>previous,previous);}
 async function step(name,text,seconds=4){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(seconds*1000);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-start)/1000,mirrors:await page.evaluate(()=>company.session.scene.mirrorBindings().map(b=>b.snapshot()))});}
 for(const branch of ['floor-mirror','mirror']){
  await page.evaluate(branch=>company.showAppearanceSample(branch,1),branch);
  await page.evaluate(branch=>{const floor=branch==='floor-mirror';company.camera.position.set(...(floor?[1.5,1.05,1.1]:[1.2,1.5,.2]));company.camera.lookAt(...(floor?[1.5,.92,-1.474]:[1.2,1.4,-2.499]));company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});},branch);
  const document=await page.evaluate(()=>company.session.document);
  for(const [profile,label]of [['single-512-v1','原镜面画质：留意绿植、花盆与镜中轮廓。'],[preferred,'清晰镜面：同一模型、同一布置、同一镜头。']]){
   const previous=await page.evaluate(profile=>{const previous=company.mirrorController.snapshot().reflectionPasses;for(const b of company.session.scene.mirrorBindings())b.deactivate();company.session.scene.setMirrorRenderProfile(profile);return previous;},profile);await nextFrame(previous);
   assert.deepEqual(await page.evaluate(()=>company.session.document),document);await step(branch+'-'+profile,label);
  }
 }
 await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await page.reload();await page.waitForFunction(()=>window.company?.ready);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
 await step('restored','重开恢复原布置，并按当前设备选择清晰镜面。',3);
 report.status='recorded';report.preferredProfile=preferred;report.scriptSeconds=(Date.now()-start)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(video){await video.saveAs(path.join(out,'mirror-quality-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
