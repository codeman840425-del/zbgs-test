const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim(),'');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader; not ordinary-PC performance or character C3','Tri-fold geometry is fixed open; no character makeup motion is implemented']};
let server,browser,context,video;
(async()=>{
 await fs.mkdir(out);report.recordingTool={path:'scripts/company-platform/record-makeup-mirror-preview.cjs',sha256:createHash('sha256').update(await fs.readFile(__filename)).digest('hex')};
 server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
 const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const start=Date.now();
 async function step(name,text,ms=2600){await page.evaluate(text=>{company.setPreviewClock(33330);document.getElementById('status').textContent=text;company.drawHostFrame();},text);await page.waitForTimeout(ms);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-start)/1000});}
 for(let index=0;index<4;index++) {
  await page.evaluate(index=>company.showAppearanceSample('makeup-mirror',index),index);
  await step('mirror-'+(index+1),['圆镜：真实厚背板、台面支承及镜前补光。','灯框镜：不同结构的兼容外观，保留补光状态。','拱镜：弧顶轮廓，沿相同接口替换。','三折镜：固定展开，三块不同朝向的真实反射。'][index]);
 }
 await page.evaluate(()=>{company.camera.position.set(-.98,1.145,-.35);company.camera.lookAt(-.98,1.145,-1.435);company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});});
 await step('folded-close','三面近看：各镜面使用自身朝向，反射当前场景。');
 await page.evaluate(()=>{
  let source;company.session.scene.root.traverse(n=>{if(!source&&n.isMesh&&n.geometry.type==='BoxGeometry')source=n;});
  const mesh=source.clone();mesh.geometry=source.geometry.clone();mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,c=box.getCenter(company.camera.position.clone()),s=box.getSize(company.camera.position.clone());mesh.geometry.translate(-c.x,-c.y,-c.z);mesh.scale.set(5.2/s.x,.65/s.y,.15/s.z);mesh.position.set(-.98,1.145,.6);mesh.material=source.material.clone();mesh.material.color.set('#ff0011');mesh.material.emissive.set('#330000');mesh.castShadow=false;mesh.receiveShadow=false;mesh.name='makeup-reflection-probe';company.world.add(mesh);window.makeupProbe=mesh;
 });
 await step('three-reflections','反射验证：红色样块位于主镜头后方，三面分别映出它。');
 await page.evaluate(()=>{makeupProbe.position.x+=.45;makeupProbe.material.color.set('#0044ff');makeupProbe.material.emissive.set('#000033');company.camera.position.x+=.08;company.camera.lookAt(-.98,1.145,-1.435);company.camera.updateMatrixWorld();});
 await step('changed-reflections','样块移动并变蓝：三面反射随当前几何和镜头更新。');
 await page.evaluate(()=>{makeupProbe.removeFromParent();makeupProbe.geometry.dispose();makeupProbe.material.dispose();delete window.makeupProbe;});
 await page.evaluate(()=>company.apply([{type:'set-state',id:'vanity/primary/mirror',state:{on:false,intensity:3}}]));await step('light-off','关闭镜前补光后，镜面仍反射；灯与反射分别管理。');
 await page.evaluate(()=>company.apply([{type:'replace-resource',id:'vanity/primary/mirror',resource:{id:'makeup-mirror-round',version:1}}]));
 await page.evaluate(()=>company.showAppearanceSample('makeup-mirror',0));await step('state-retained','改为圆镜：保持原安装位置和关闭补光的状态。');
 await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'makeup-mirror.company.json'),await page.evaluate(()=>company.export()));
 await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await page.evaluate(()=>company.showAppearanceSample('makeup-mirror',0));await step('restored','重新加载：恢复同一镜体、父子关系与非默认补光状态。');
 await page.evaluate(()=>company.load(company.layouts.makeupMirrorAlternate));await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await step('two-rooms','第二输入：同名两房、不同朝向的台面镜，各自保持身份。',3500);
 report.cost=await page.evaluate(()=>({mirrors:company.mirrorController.snapshot(),cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory},render:{...company.renderer.info.render}}));report.status='recorded';report.scriptSeconds=(Date.now()-start)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(video){await video.saveAs(path.join(out,'makeup-mirror-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
