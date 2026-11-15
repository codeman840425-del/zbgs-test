// Real 1x UI/command chain: no reset, teleport, advance or simulate calls.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
const cases=[{name:'female-skirt',body:'female',outfit:1},{name:'male-shorts',body:'male',outfit:2}];
const selected=process.argv.find(x=>x.startsWith('--cases='))?.slice(8).split(',');
if(selected?.some(x=>!cases.some(c=>c.name===x)))throw Error('Unknown case');
const plan={cases:cases.filter(c=>!selected||selected.includes(c.name)),setup:'Fresh page; room camera, 1x, full corrections, dynamics on. No resets or teleport at any stage.',chain:['UI outfit switches','walk/run/reselect/walk/stop','equip mic + glasses; speaking + gaze; real path to chair; seated pause/resume','mic rejects greeting; unload mic; seated greeting; stand','walk to dance space; source loop >=3 cycles then cancel','technical once7.2s completes; replay interrupted by walk','unload accessories; final stable idle'],evidence:'Normal wall clock, per-rAF lightweight state, command/task history, complete viewport video, initial/final exact identity',limits:['Collection is not visual acceptance or performance measurement','No swept geometry probe; use dedicated contact matrix','Local save/reopen and real background are separate stages']};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
(async()=>{
 const identity=expectations(),base=process.argv[2];assert.equal(identity.assetId,'beta-base-female-m1');assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||''));
 const {chromium}=require('../prototype/node_modules/playwright'),out=await prepareOutput(identity.build,'user-chain'),report={plan,build:identity.build,cases:[],visualReview:'pending'};
 const browser=await chromium.launch({channel:'chrome',headless:process.env.QA_HEADLESS==='1'});
 try{for(const cfg of plan.cases){
  const dir=path.join(out,cfg.name);await fs.mkdir(dir,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),page=await context.newPage(),video=page.video();
  const r={config:cfg,inputs:[],checks:[],errors:[]};report.cases.push(r);page.on('pageerror',e=>r.errors.push(e.message));
  const check=(name,ok,details)=>{r.checks.push({name,passed:!!ok,details});assert(ok,name);};
  const state=()=>page.evaluate(()=>({snapshot:__debug.snapshot(),live:__debug.avatar().livePresentation.getState(),active:__debug.tasks().active()}));
  const mark=async name=>{r.inputs.push({name,wall:new Date().toISOString(),state:await state()});};
  const command=async cmd=>{await mark('command:'+JSON.stringify(cmd));return page.evaluate(cmd=>__debug.command(cmd),cmd);};
  const request=async req=>{await mark('request:'+JSON.stringify(req));return page.evaluate(req=>__debug.request(req),req);};
  const done=async(id,wanted='completed')=>{await page.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const task=await page.evaluate(id=>__debug.tasks().get(id),id);check(id+' terminal '+wanted,task.state===wanted,task);return task;};
  // Controller readiness alone does not include the outgoing microphone hold.
  // Wait for the real live-layer arm to finish; never force its pose/time.
  const stable=()=>page.waitForFunction(()=>__debug.game.scene.getScene('CharacterStudio').greetingReady()&&__debug.avatar().livePresentation.getState().arm===null,null,{timeout:45000});
  const shot=async name=>{await mark(name);await page.screenshot({path:path.join(dir,name+'.png')});};
  try{
   await page.goto(new URL('?body='+cfg.body,base).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
   const expected=cfg.body==='female'?identity:{build:identity.build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
   r.initialGate=await verifyCandidate(page,expected);
   await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.setPlaybackRate(1);d.setPaused(false);d.setDynamics(true);d.setCorrections('full');d.setBodyMode('dressed');d.setHelpers(false);c.cameraPreset('room',true);const rows=[];let running=true,last=null;window.__userChain={rows,inputEvents:[],stop:()=>{running=false;}};document.addEventListener('wheel',e=>window.__userChain.inputEvents.push({type:'wheel',time:performance.now(),trusted:e.isTrusted,x:e.clientX,y:e.clientY,dy:e.deltaY,target:e.target?.tagName,id:e.target?.id}),{capture:true,passive:true});function frame(now){if(!running)return;const s=d.snapshot();rows.push({wallMs:now,dt:last===null?null:now-last,simulationTime:s.simulationTime,mode:s.mode,root:s.position,outfit:s.outfit,camera:s.camera,phase:s.motion.phase,jogPhase:s.motion.jogPhase,runMix:s.motion.runMix,sit:s.motion.sitProgress,dance:s.motion.dance,active:d.tasks().active(),live:d.avatar().livePresentation.getState()});last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   for(const outfit of [0,cfg.outfit,0,cfg.outfit]){await mark('UI outfit '+outfit);await page.locator('[data-outfit="'+outfit+'"]').click();check('outfit applied '+outfit,(await state()).snapshot.outfit===outfit);}
   await command({type:'speed',value:.85});await request({requestId:'walk-first',kind:'walk',payload:{x:2,z:1.8}});await page.waitForTimeout(700);
   await command({type:'speed',value:2.55});await request({requestId:'run-reselect',kind:'walk',payload:{x:-2.7,z:1.8}});await done('walk-first','cancelled');await page.waitForTimeout(800);
   await command({type:'speed',value:.85});await request({requestId:'walk-stop',kind:'walk',payload:{x:-.5,z:1.8}});await done('run-reselect','cancelled');await done('walk-stop');await stable();
   for(const kind of ['mic','glasses'])check('equip '+kind,(await command({type:'accessory',kind,value:true}))?.applied);
   await command({type:'speaking',value:true});await command({type:'gaze',target:[-.5,1.4,4]});
   await request({requestId:'sit-live',kind:'sit'});await done('sit-live');await page.waitForTimeout(1200);await shot('seated-speaking');
   await command({type:'pause',value:true});const paused=await state();await page.waitForTimeout(500);check('pause holds simulation',(await state()).snapshot.simulationTime===paused.snapshot.simulationTime);await command({type:'pause',value:false});
   await request({requestId:'held-greeting-rejected',kind:'greeting'});await done('held-greeting-rejected','failed');
   check('remove mic',(await command({type:'accessory',kind:'mic',value:false}))?.applied);await stable();await request({requestId:'seated-greeting',kind:'greeting'});await done('seated-greeting');await shot('greeting-finished');
   await command({type:'speaking',value:false});await command({type:'gaze',target:null});await request({requestId:'stand',kind:'stand'});await done('stand');
   await request({requestId:'dance-space',kind:'walk',payload:{x:-.5,z:1.8}});await done('dance-space');
   await request({requestId:'reference-loop',kind:'dance',payload:{danceId:'ual1-dance-reference'}});
   await page.waitForFunction(()=>__debug.motion().getMetrics().dance.time>=3.1,null,{timeout:12000});await shot('reference-loop');
   await mark('cancel reference-loop');await page.evaluate(()=>__debug.tasks().cancel('reference-loop','qa-full-loop-completed'));await done('reference-loop','cancelled');await stable();
   await request({requestId:'technical-once',kind:'dance',payload:{danceId:'dance-technical-once-v1'}});const once=await done('technical-once');check('technical task includes full7.2s',once.endedAt-once.startedAt>=7.2,{duration:once.endedAt-once.startedAt});await stable();await shot('technical-complete');
   await request({requestId:'technical-interrupted',kind:'dance',payload:{danceId:'dance-technical-once-v1'}});await page.waitForFunction(()=>__debug.motion().getMetrics().dance.time>2,null,{timeout:10000});
   await request({requestId:'walk-after-dance',kind:'walk',payload:{x:.5,z:1.8}});await done('technical-interrupted','cancelled');await done('walk-after-dance');await stable();
   for(const kind of ['mic','glasses'])await command({type:'accessory',kind,value:false});
   const final=await state();check('accessories unloaded',Object.values(final.live.accessories).every(a=>!a.loaded&&!a.requested),final.live.accessories);check('final idle',final.snapshot.mode==='idle');
   r.history=await page.evaluate(()=>__debug.tasks().history());const terminal={};for(const e of r.history)if(['completed','cancelled','failed'].includes(e.type))terminal[e.task.requestId]=(terminal[e.task.requestId]||0)+1;check('one terminal per request',Object.values(terminal).every(n=>n===1),terminal);
   r.finalGate=await verifyCandidate(page,expected);check('no pageerror',r.errors.length===0,r.errors);await shot('final');r.passed=true;
  }catch(error){r.failure=String(error);await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw error;}
  finally{r.cameraInputEvents=await page.evaluate(()=>window.__userChain?.inputEvents??[]).catch(()=>[]);r.frames=await page.evaluate(()=>{window.__userChain?.stop();return window.__userChain?.rows||[];}).catch(()=>[]);r.cameraReference=r.frames[0]?.camera;r.cameraChanges=r.frames.filter(f=>JSON.stringify(f.camera)!==JSON.stringify(r.cameraReference)).map(f=>({time:f.simulationTime,camera:f.camera}));if(r.cameraChanges.length){r.passed=false;r.cameraFailure='Camera extrinsics changed during fixed-room chain';}await context.close();await video.saveAs(path.join(dir,'continuous-chain.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(!r.failure)assert.equal(r.cameraChanges.length,0,'Fixed room camera changed; inspect cameraInputEvents');}
 }}catch(error){await writeFailure(out,error);throw error;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
