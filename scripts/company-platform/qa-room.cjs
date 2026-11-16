// Real actors, fixed bytes, normal 1x recordings; no simulation fast-forward in films.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {serve}=require('./serve.cjs');
const {verifyCandidate}=require('../qa-m1-common.cjs');
const [dist,build,outArg,oldDist]=process.argv.slice(2),out=path.resolve(outArg||'');
if(!dist||!/^[a-f0-9]{12}$/.test(build||'')||!outArg||!oldDist)
  throw Error('Usage: node scripts/company-platform/qa-room.cjs DIST BUILD OUTPUT ORIGINAL_4FD_DIST');
const bodies={female:{assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'},
  male:{assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'}};
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);
const report={build,status:'running',calibration:[],cases:[],errors:[],limits:[
  'Original male/female pants and one 0.47m chair only; second layout changes chair position/yaw',
  'Development PC; no ordinary-device performance qualification',
  'No composite facility, layout persistence, generic placement validation or new art asset claim',
  'Numerical task/contact observations and screenshots do not replace human continuous visual acceptance']};
let browser,current,old,context;
async function identity(page,body,b=build){return verifyCandidate(page,{build:b,...bodies[body]});}
async function open(page,url,body,layout){
  await page.goto(`${url}?body=${body}${layout?'&companyLayout='+layout:''}`);
  await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
}
async function state(page){return page.evaluate(()=>{
  const d=__debug,s=d.snapshot(),chair=d.scene.getObjectByName('RepresentativeChair');
  const hip=s.motion.hipWorld?chair.worldToLocal(chair.position.clone().fromArray(s.motion.hipWorld)).toArray():null;
  return {layout:d.companyLayout?.(),chair:s.chair,position:s.position,mode:s.mode,
    paused:s.paused,playbackRate:s.playbackRate,simulationTime:s.simulationTime,
    sitProgress:s.motion.sitProgress,hipLocal:hip,lease:d.seatLeases.forSeat('room-chair-1'),
    seatHeight:d.motion().getSeatHeight(),seatBack:s.motion.seatBack,approach:d.motion().getSeatApproach(),
    frameMs:s.frameMs,renderer:s.renderer};
});}
async function runTask(page,id,kind,payload={}){
  const admission=await page.evaluate(r=>__debug.request(r),{requestId:id,kind,payload});
  assert.equal(admission.admission,'accepted');
  await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:50000});
  const result=await page.evaluate(id=>__debug.tasks().get(id),id);
  assert.equal(result.state,'completed',`${id}: ${result.reason}`);return result;
}
async function mark(page,label){await page.evaluate(label=>{
  let n=document.getElementById('company-qa-label');
  if(!n){n=document.createElement('div');n.id='company-qa-label';Object.assign(n.style,{position:'fixed',bottom:'0',left:'0',zIndex:10000,background:'#173c40',color:'white',padding:'7px',pointerEvents:'none'});document.body.append(n);}
  n.textContent=label;
},label);}
(async()=>{
  await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-qa.cjs'));
  current=await serve(dist,build);old=await serve(oldDist,'4fdc1b3e1667');
  browser=await chromium.launch({channel:'chrome',headless:true});
  report.environment={browser:browser.version(),platform:process.platform,viewport:[1440,900],recordingRate:'normal simulation 1x'};
  for(const body of Object.keys(bodies)){
    context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(String(e)));
    await open(page,old.url,body);await identity(page,body,'4fdc1b3e1667');const original=await state(page);
    await open(page,current.url,body);await identity(page,body);const extracted=await state(page);
    assert.deepEqual(extracted.chair,original.chair,'Legacy opening chair/targets must match original fixed build');
    close(extracted.seatHeight,original.seatHeight,'legacy seat height');
    close(extracted.seatBack,original.seatBack,'legacy seatBack');
    report.calibration.push({body,original,extracted});await context.close();context=null;
  }
  for(const layout of ['room-a','room-b'])for(const body of Object.keys(bodies)){
    const name=`${layout}-${body}`,dir=path.join(out,name);await fs.mkdir(dir);
    const row={name,layout,body,stages:[],tasks:[]};report.cases.push(row);
    context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
    await open(page,current.url,body,layout);row.identity=await identity(page,body);
    await page.evaluate(async()=>{await __debug.setOutfit(0);__debug.setPlaybackRate(1);__debug.setSpeed(1.05);__debug.camera('room');});
    await page.waitForTimeout(350);row.initial=await state(page);
    assert.equal(row.initial.layout.layout.id,layout);assert.equal(row.initial.layout.layout.initialization,'layout-owned');
    assert.deepEqual(row.initial.chair.position,layout==='room-a'?[2.65,0,.8556601197384992]:[2,0,0]);
    close(row.initial.chair.yaw,layout==='room-a'?0:-Math.PI/2,'authored heading');
    close(row.initial.seatHeight,.47,'fixed seat height');
    row.geometry=await page.evaluate(()=>{
      const d=__debug,layout=d.companyLayout(),chair=d.scene.getObjectByName('RepresentativeChair'),c=d.chairColliders()[0];
      chair.updateMatrixWorld(true);const corners=[];
      for(const x of [c.localBox.min.x,c.localBox.max.x])for(const y of [c.localBox.min.y,c.localBox.max.y])for(const z of [c.localBox.min.z,c.localBox.max.z])corners.push(chair.position.clone().set(x,y,z).applyMatrix4(c.mesh.matrixWorld).toArray());
      const min=[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])));
      return{obstacle:layout.obstacles.find(o=>o.name==='chair'),min,max,
        approachLocal:chair.worldToLocal(chair.position.clone().fromArray(layout.targets.approach)).toArray(),
        anchorLocal:chair.worldToLocal(chair.position.clone().fromArray(layout.targets.seatedAnchor)).toArray()};
    });
    for(const [axis,index,half]of [['x',0,'hw'],['z',2,'hd']]){
      close(row.geometry.obstacle[axis],(row.geometry.min[index]+row.geometry.max[index])/2,`visual/obstacle ${axis}`);
      close(row.geometry.obstacle[half],(row.geometry.max[index]-row.geometry.min[index])/2+.1,`visual/obstacle ${half}`);
    }
    close(row.geometry.approachLocal[2],row.initial.seatBack+row.initial.approach,'local approach');
    close(row.geometry.anchorLocal[2],row.initial.seatBack,'local anchor');
    await mark(page,`${name} · 布局载入 · 正常速度 1×`);await page.screenshot({path:path.join(dir,'room.png')});
    await page.evaluate(()=>{window.__companySamples=[];window.__companySampleOn=true;let last=0;
      function sample(t){if(!__companySampleOn)return;if(t-last>=100){last=t;const s=__debug.snapshot();__companySamples.push({t,mode:s.mode,position:s.position,yaw:s.facing,collision:s.collision,rate:s.playbackRate,sit:s.motion.sitProgress,hip:s.motion.hipWorld});}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    await mark(page,`${name} · 走向准备位置 · 1×`);row.tasks.push(await runTask(page,name+'-walk','walk',{x:-1,z:1.7}));
    await mark(page,`${name} · 接近、转向、坐下 · 1×`);row.tasks.push(await runTask(page,name+'-sit','sit'));
    await page.waitForTimeout(650);row.seated=await state(page);assert.equal(row.seated.lease?.state,'occupied');
    assert.equal(row.seated.sitProgress,1);assert(Math.abs(row.seated.hipLocal[0])<.2&&Math.abs(row.seated.hipLocal[2])<.35,'Pelvis should be over the actual seat footprint');
    await page.screenshot({path:path.join(dir,'seated.png')});
    row.busy=await page.evaluate(()=>{const before=__debug.companyLayout();let error=null;try{__debug.setChairTransform({x:0,z:0});}catch(e){error=e.message;}return{before,after:__debug.companyLayout(),error};});
    assert(row.busy.error);assert.deepEqual(row.busy.after,row.busy.before,'Busy transform rejection keeps layout');
    await mark(page,`${name} · 起身、实际离位 · 1×`);row.tasks.push(await runTask(page,name+'-stand','stand'));
    await page.waitForFunction(()=>!__debug.seatLeases.forSeat('room-chair-1'),null,{timeout:10000});
    await mark(page,`${name} · 离开工位 · 1×`);row.tasks.push(await runTask(page,name+'-exit','walk',{x:-1.1,z:1.8}));
    row.afterExit=await state(page);assert.equal(row.afterExit.lease,null);await page.screenshot({path:path.join(dir,'exit.png')});
    // Exercise actual ground input after consuming the configured layout.
    const point=await page.evaluate(()=>{const d=__debug,p=d.avatar().root.position.clone().set(-.6,0,1.5).project(d.cameraObject()),r=d.renderer.domElement.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
    await mark(page,`${name} · 点击地面移动 · 1×`);await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>{const s=__debug.snapshot();return !s.target&&s.mode==='idle'&&Math.hypot(s.position[0]+.6,s.position[2]-1.5)<.08;},null,{timeout:25000});
    row.inputAfterLayout=await state(page);await page.waitForTimeout(350);
    row.samples=await page.evaluate(()=>{__companySampleOn=false;return __companySamples;});assert(row.samples.length>20);assert(row.samples.every(s=>s.rate===1));
    row.final=await state(page);assert.deepEqual(row.final.chair,row.initial.chair);await identity(page,body);
    const video=page.video();await context.close();context=null;await video.saveAs(path.join(dir,'normal1x.webm'));await video.delete();
    await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(row,null,2));
    console.log(`${name}: normal1x chain and layout checks passed`);
  }
  // Separate deterministic actual-controller regression: not part of the 1x films.
  context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
  await open(page,current.url,'male','room-b');await identity(page,'male');
  report.lifecycle=await page.evaluate(async()=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),checks=[];d.setPaused(true);d.setDynamics(false);
    const peer=await d.loadComparison('female');peer.avatar.setDynamics(false);
    const lease=()=>d.seatLeases.forSeat('room-chair-1');
    const until=fn=>{for(let i=0;i<4200&&!fn();i++)c.simulate(1/120);return fn();};
    const done=(t,id)=>['completed','cancelled','failed'].includes(t.get(id)?.state);
    const check=(name,passed)=>checks.push({name,passed:!!passed});
    d.request({requestId:'cancel-approach',kind:'sit'});check('approach reserves',lease()?.state==='reserved');d.tasks().cancel('cancel-approach','qa-cancel');check('cancel approach releases',!lease());
    d.request({requestId:'primary-sit',kind:'sit'});check('primary sits',until(()=>done(d.tasks(),'primary-sit'))&&d.tasks().get('primary-sit').state==='completed');
    peer.request({requestId:'compete',kind:'sit'});check('same seat conflict rejected',peer.tasks.get('compete')?.reason==='seat-unavailable'&&lease()?.ownerId===c.actorId);
    d.request({requestId:'primary-stand',kind:'stand'});check('stand retains exit lease',lease()?.state==='exiting');check('actual exit releases',until(()=>done(d.tasks(),'primary-stand')&&!lease()));
    peer.request({requestId:'peer-sit',kind:'sit'});check('female peer uses rotated chair',until(()=>done(peer.tasks,'peer-sit'))&&peer.tasks.get('peer-sit').state==='completed');
    d.removeComparison();check('seated owner removal releases',!lease());
    return{checks,history:d.seatLeases.history(),mode:'actual rig/controller, paused deterministic 120Hz; no visual or performance claim'};
  });assert(report.lifecycle.checks.every(c=>c.passed),JSON.stringify(report.lifecycle.checks));
  const before=await state(page);await page.locator('#pause').click();assert.equal((await state(page)).paused,false);await page.locator('#pause').click();assert.equal((await state(page)).paused,true);
  const after=await state(page);close(before.position[0],after.position[0],'UI click should not move actor x');close(before.position[2],after.position[2],'UI click should not move actor z');
  await context.close();context=null;assert.equal(report.errors.length,0);report.status='passed';
})().catch(e=>{report.status='failed';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1;})
.finally(async()=>{if(context)await context.close();if(browser)await browser.close();if(current)await current.close();if(old)await old.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(path.join(out,'report.json'));});
