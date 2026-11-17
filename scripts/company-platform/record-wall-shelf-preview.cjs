const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader, not ordinary-PC performance','No C3 or human acceptance']};
let made=false,server,browser,context,video;
(async()=>{
  await fs.mkdir(out);made=true;server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1440,height:1000}}});
  const page=await context.newPage();video=page.video();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const started=Date.now();
  async function step(name,text){await page.evaluate(text=>document.getElementById('status').textContent=text,text);await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>company.renderer.getContext().isContextLost()),false);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,text,seconds:(Date.now()-started)/1000});}
  async function focus(){await page.evaluate(()=>{
    const c=company,nodes=c.session.document.nodes.filter(n=>c.catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mountRole==='wall-shelf');
    const groups=nodes.map(n=>c.session.scene.root.getObjectByName(n.id)),board=groups[0].getObjectByName('wall-shelf-board-lower');board.geometry.computeBoundingBox();
    const box=board.geometry.boundingBox.clone().makeEmpty();for(const group of groups)box.expandByObject(group);
    const target=box.getCenter(c.camera.position.clone()),radius=box.getSize(c.camera.position.clone()).length()/2;
    const halfFov=Math.min(c.camera.fov*Math.PI/360,Math.atan(Math.tan(c.camera.fov*Math.PI/360)*c.camera.aspect));
    const offset=c.camera.position.clone().set(.35,.2,1).normalize().applyQuaternion(groups[0].getWorldQuaternion(c.camera.quaternion.clone()));
    c.camera.position.copy(target).addScaledVector(offset,radius/Math.sin(halfFov)*1.1);c.camera.lookAt(target);c.camera.updateMatrixWorld();
    c.session.scene.setWallView({mode:'cutaway',cameraPosition:c.camera.position.toArray()});c.drawHostFrame();
  });}
  for(let index=0;index<4;index++){
    await page.evaluate(index=>company.showAppearanceSample('wall-shelf',index),index);await focus();
    await step('look-'+(index+1),['侧托壁架：三层摆件落在真实层板上。','悬挑壁架：更换支撑结构，保留摆件与层位。','框式壁架：同一安装和承载规格。','背板壁架：背板与托条实际连接。'][index]);
  }
  await page.evaluate(()=>company.apply([
    {type:'move',id:'wall-shelf/tissue',transform:{position:[.1,.95,.19],yaw:Math.PI/2}},
    {type:'move',id:'wall-shelf/primary',transform:{position:[3.4,.35,.4],yaw:Math.PI*1.5}},
    {type:'copy-facility',id:'wall-shelf/primary',newId:'wall-shelf/copy',transform:{position:[3.4,.35,-1.4],yaw:Math.PI*1.5}},
  ]));await focus();await step('move-copy','换到侧墙并复制整组，层上小物跟随，实例身份独立。');
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'wall-shelf.company.json'),await page.evaluate(()=>company.export()));
  await page.reload();await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await focus();await step('restore','重新载入后保留两架、全部摆件及局部调整。');
  await page.evaluate(()=>company.load(company.layouts.wallShelfAlternate));await focus();await step('second-input','第二布局通过同一配置和素材链加载。');
  report.status='recorded';report.scriptSeconds=(Date.now()-started)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(video){await video.saveAs(path.join(out,'wall-shelf-preview-normal1x.webm'));await video.delete();}if(browser)await browser.close();if(server)await server.close();if(made)await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
