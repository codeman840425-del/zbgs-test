const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
let sourceCommit='packaged-source';
try{
  execFileSync('git',['rev-parse','--show-toplevel'],{cwd:path.resolve(dist),encoding:'utf8'});
  sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
  if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
}catch(error){if(error.message==='Recording requires clean fixed source'||error.status!==128)throw error;}
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software rendering; no ordinary-PC performance claim','No C3 character or human acceptance']};
let createdOut=false;
let server,browser,context,video;
(async()=>{
  await fs.mkdir(out);createdOut=true;server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const started=Date.now();
  async function step(name,text){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
  async function focusTables(){await page.evaluate(()=>{
    company.view('top');const nodes=company.session.document.nodes.filter(n=>company.catalog.resources.find(r=>r.id===n.resource?.id)?.mountRole==='side-table');
    const groups=nodes.map(n=>company.session.scene.root.getObjectByName(n.id)),top=groups[0].getObjectByName('side-table-top');top.geometry.computeBoundingBox();
    const box=top.geometry.boundingBox.clone().makeEmpty();for(const group of groups)box.expandByObject(group);
    const target=box.getCenter(company.camera.position.clone()),size=box.getSize(company.camera.position.clone());
    // Fit the full bounding sphere, including the nearer table's perspective
    // enlargement. A high downward direction clears the cutaway room wall.
    const halfFov=Math.min(company.camera.fov*Math.PI/360,Math.atan(Math.tan(company.camera.fov*Math.PI/360)*company.camera.aspect));
    const distance=size.length()*.5/Math.sin(halfFov)*1.1;
    company.camera.position.copy(target).addScaledVector(company.camera.position.clone().set(.15,1,.55).normalize(),distance);
    company.camera.lookAt(target);company.camera.updateMatrixWorld();
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=target.clone().set(x,y,z).project(company.camera);if(Math.abs(p.x)>.98||Math.abs(p.y)>.98)throw Error('Review camera clips the real table group');
    }
    company.drawHostFrame();
  });}
  const names=['圆几：圆台面与柱架底座','方几：柜体与固定门把手','套几：两张独立落地的高低桌','低茶几：长方台面与四腿系杆'];
  for(let i=0;i<4;i++){await page.evaluate(i=>company.showAppearanceSample('side-table',i),i);await step('look-'+(i+1),names[i]+'。台面花瓶保持原位置。');}
  await page.evaluate(()=>company.apply([
    {type:'move',id:'side-table/primary/ornament',transform:{position:[.04,.5,.02],yaw:0}},
    {type:'move',id:'side-table/primary',transform:{position:[.7,0,-.4],yaw:Math.PI/2}},
    {type:'copy-facility',id:'side-table/primary',newId:'side-table/copy',transform:{position:[-1.1,0,.7],yaw:0}},
  ]));await focusTables();await step('move-copy','移动、旋转和复制边几，台面小物跟随；两组保留独立身份。');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
  await fs.writeFile(path.join(out,'side-tables.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
  await focusTables();await step('restore','重新加载后，位置、朝向和两组台面小物完整恢复。');
  await page.evaluate(()=>company.load(company.layouts.sideTableAlternate));await focusTables();await step('second-input','第二布局复用同套边几素材和承载规则。');
  report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'side-table-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();if(createdOut)await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
