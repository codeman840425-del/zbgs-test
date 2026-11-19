// Bounded real headed-tab regression. Never fabricates visibility events.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launchPersistentQABrowser}=require('./qa-browser-workspace.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const EXPECT={build:'aa6fc6159e2d',assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};
(async()=>{
 const project=await productionRoot();
 const OUT=await projectOutput(process.argv[2] || path.join(project,'evidence/background-aa6fc6159e2d-v1'),project);
 const evidenceFile=name=>projectOutput(path.join(OUT,name),OUT);

 await fs.mkdir(OUT);await fs.copyFile(__filename,await evidenceFile('executed-script.cjs'));
 const r={build:EXPECT.build,method:'Headed Chrome independent persistent profile, two same-context real tabs, driver focus override removed on original CDP session; no synthesized visibility',errors:[],console:[],cases:[],checks:[]};
 const check=(name,ok,data)=>{r.checks.push({name,passed:!!ok,data});assert(ok,name)};
 let session,page;
 try{
  r.playwright=require('../prototype/node_modules/playwright/package.json').version;assert.equal(r.playwright,'1.58.2','Review driver session access after version change');
  session=await launchPersistentQABrowser(OUT,await evidenceFile('chrome-profile'),{channel:'chrome',headless:false,viewport:{width:1440,height:900},ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],recordVideo:{dir:await evidenceFile('video'),size:{width:1440,height:900}}});
  const {context}=session;
  page=context.pages()[0];page.on('pageerror',e=>r.errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))r.console.push({type:m.type(),text:m.text()})});
  const clearFocus=async p=>{const client=p._connection.toImpl(p).delegate?._mainFrameSession?._client;assert(client?.send);await client.send('Emulation.setFocusEmulationEnabled',{enabled:false})};
  await page.goto('http://127.0.0.1:4196/?body=female');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.identity=await verifyCandidate(page,EXPECT);
  await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.setDynamics(true);d.setOutfit(1);d.setPaused(false);d.setPlaybackRate(1);c.cameraPreset('room',true);window.__bg={events:[],frames:[],mark:'initial',stopped:false};window.__bgRead=()=>{const s=d.snapshot(),a=d.avatar(),V=a.root.position.constructor,bones={};for(const n of ['hips','head','leftHand','rightHand','leftFoot','rightFoot']){const b=a.vrm.humanoid.getRawBoneNode(n);bones[n]={position:b.getWorldPosition(new V()).toArray(),matrix:b.matrixWorld.toArray()}}const garment=[];a.root.traverse(m=>{if(m.isMesh&&m.visible&&/skirt/i.test(m.name)){const pos=m.geometry.attributes.position,points=[];for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/24))){const p=new V();m.getVertexPosition(i,p);points.push([i,...p.applyMatrix4(m.matrixWorld).toArray()])}garment.push({name:m.name,points})}});return{wall:performance.now(),visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus(),sim:s.simulationTime,mode:s.mode,modeTime:s.modeTime,paused:s.paused,background:s.backgroundSuspended,dt:s.motion.frameDt,root:s.position,speed:s.speed,phase:s.phase,bones,garment,garmentMetrics:s.outfitInfo?.equipment?.skirtDynamics,tasks:d.tasks().snapshot?.()??null}};document.addEventListener('visibilitychange',e=>__bg.events.push({trusted:e.isTrusted,...__bgRead()}));let prev=null;const f=t=>{if(__bg.stopped)return;__bg.frames.push({mark:__bg.mark,raf:t,rafDt:prev===null?null:t-prev,...__bgRead()});prev=t;requestAnimationFrame(f)};requestAnimationFrame(f)});
  await clearFocus(page);await page.bringToFront();
  try{await page.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:4000})}catch{r.initialVisibleFailure=await page.evaluate(()=>__bgRead());r.status='environment-unverified-initial-visible';throw Error('Initial native visible prerequisite not established; no background cases claimed')}
  const sample=()=>page.evaluate(()=>__bgRead());r.initialVisible=await sample();check('initial native visible',!r.initialVisible.hidden);
  const other=await context.newPage();await clearFocus(other);await other.goto('about:blank');await page.bringToFront();await page.waitForFunction(()=>!document.hidden);
  const cycle=async name=>{
   await page.evaluate(name=>__bg.mark=name,name);const q={name,before:await sample()};r.cases.push(q);
   await other.bringToFront();await page.waitForFunction(()=>document.hidden,null,{timeout:4000});q.hiddenStart=await sample();await page.waitForTimeout(1500);q.hiddenEnd=await sample();
   check(name+' hidden simulation held',q.hiddenStart.sim===q.hiddenEnd.sim,{start:q.hiddenStart.sim,end:q.hiddenEnd.sim});check(name+' hidden pose held',JSON.stringify(q.hiddenStart.bones)===JSON.stringify(q.hiddenEnd.bones)&&JSON.stringify(q.hiddenStart.garment)===JSON.stringify(q.hiddenEnd.garment));
   await page.bringToFront();await page.waitForFunction(()=>!document.hidden,null,{timeout:4000});q.returnImmediate=await sample();await page.waitForTimeout(700);q.returned=await sample();
   check(name+' pause semantics',q.returned.paused===q.before.paused);check(name+' no hidden catchup',q.returned.sim-q.hiddenEnd.sim<1.05);
   check(name+' expected foreground progression',q.before.paused?q.returned.sim===q.hiddenEnd.sim:q.returned.sim>q.hiddenEnd.sim);
   await page.screenshot({path:await evidenceFile(name+'-returned.png')});
  };
  r.walkRequest=await page.evaluate(()=>{__debug.setSpeed(.85);return __debug.request({requestId:'background-walk',kind:'walk',payload:{x:2,z:2.2},timeoutSeconds:30})});await page.waitForTimeout(350);check('walk active before background',(await sample()).mode==='walk');await cycle('walking');
  await page.waitForFunction(()=>__debug.tasks().get('background-walk')?.state==='completed',null,{timeout:15000});r.walkTask=await page.evaluate(()=>__debug.tasks().get('background-walk'));
  await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:20000});await page.waitForTimeout(250);await cycle('seated');
  await page.evaluate(()=>__debug.setPaused(true));await page.waitForTimeout(150);await cycle('user-paused-seated');await page.evaluate(()=>__debug.setPaused(false));await page.waitForTimeout(300);r.unpaused=await sample();check('user explicit resume progresses',r.unpaused.sim>r.cases.at(-1).returned.sim);
  r.finalIdentity=await verifyCandidate(page,EXPECT);check('no pageerror',!r.errors.length);r.status='bounded-real-background-passed';
 }catch(e){r.failure=String(e);process.exitCode=1;if(!r.status)r.status='failed';if(page)await page.screenshot({path:await evidenceFile('failure.png'),timeout:5000}).catch(()=>{})}
 finally{
  if(page)r.trace=await page.evaluate(()=>{if(!window.__bg)return null;__bg.stopped=true;return __bg}).catch(()=>null);
  await session?.close();await fs.writeFile(await evidenceFile('report.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({out:OUT,status:r.status,checks:r.checks,failure:r.failure}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
