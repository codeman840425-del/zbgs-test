// Bounded follow-up to qa-m2-male-face.cjs: same identity/room setup,
// normal clock only. No product imports, source mutation, reset or fixed stepping.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate,prepareOutput,writeFailure}=require('./qa-m1-common.cjs');
const cases=[
 {body:'male',assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'},
 {body:'m2-male-jaw-v1',assetId:'m2-male-jaw-v1',sha256:'25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153'},
];
const plan={cases,viewport:[1440,900],camera:'room fixed after ready',outfit:2,chain:['run2.4 toward2/1.8','after800ms reselect-.5/1.8','complete and stop','existing technical once7.2s ends','walk.85 toward.5/1.8 and stop'],limits:['No mic/glasses or normalized fitted motion','No reset/teleport/fixed stepping during films','Not target-device performance or continuous human aesthetic acceptance']};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
(async()=>{
 const base=process.argv[2],build=process.env.QA_M1_BUILD;assert.equal(build,'3016fadd5864');assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||''));
 const out=await prepareOutput(build,'male-face-motion'),report={build,plan,cases:[],visualReview:'pending'};
 const {chromium}=require('../prototype/node_modules/playwright'),browser=await chromium.launch({channel:'chrome',headless:true});
 const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 try{for(const cfg of cases){
  const dir=path.join(out,cfg.body);await fs.mkdir(dir,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
  const page=await context.newPage(),video=page.video(),r={config:cfg,errors:[],inputs:[],tasks:[],checks:[]};report.cases.push(r);page.on('pageerror',e=>r.errors.push(e.message));
  const check=(name,ok,details)=>{r.checks.push({name,passed:!!ok,details});assert(ok,name);};
  const mark=async name=>r.inputs.push({name,...await page.evaluate(()=>({wall:performance.now(),snapshot:__debug.snapshot()}))});
  const request=async req=>{await mark(JSON.stringify(req));return page.evaluate(req=>__debug.request(req),req);};
  const done=async(id,wanted='completed')=>{await page.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout:30000});const task=await page.evaluate(id=>__debug.tasks().get(id),id);r.tasks.push(task);check(id+' terminal '+wanted,task.state===wanted,task);return task;};
  try{
   await page.goto(base+'?body='+cfg.body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.initialGate=await verifyCandidate(page,{build,...cfg});
   r.danceAdmission=await page.evaluate(async()=>{
    const response=await fetch('/assets/motion/m1c/dance-imports.json',{cache:'no-store'});if(!response.ok)throw Error('Dance manifest missing');const manifest=await response.json(),entry=manifest.entries.find(x=>x.id==='dance-technical-once-v1');
    if(!entry)return {available:false,reason:'No existing technical entry',manifest};
    if(entry.format==='normalized-vrm-motion.1')return {available:false,reason:'Normalized motion explicitly excluded',entry};
    const raw=await(await fetch('/assets/motion/m1c/'+entry.file,{cache:'no-store'})).arrayBuffer();const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');if(sha!==entry.sha256)throw Error('Technical source resource identity differs');
    return {available:true,entry,actualSHA256:sha,bytes:raw.byteLength,scope:'Generic UAL source retarget; actual task admission still required'};
   });
   await page.evaluate(()=>{const d=__debug;d.setPlaybackRate(1);d.setPaused(false);d.setCorrections('full');d.setBodyMode('dressed');d.setHelpers(false);d.setDynamics(true);d.setOutfit(2);d.command({type:'speaking',value:false});d.game.scene.getScene('CharacterStudio').cameraPreset('room',true);const q=window.__m2Motion={rows:[],running:true,last:null};function frame(t){if(!q.running)return;const s=d.snapshot();q.rows.push({wallMs:t,dt:q.last===null?null:t-q.last,simulationTime:s.simulationTime,root:s.position,speed:s.speed,mode:s.mode,outfit:s.outfit,camera:s.camera,phase:s.motion.phase,jogPhase:s.motion.jogPhase,runMix:s.motion.runMix,dance:s.motion.dance,active:d.tasks().active()});q.last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   await page.evaluate(()=>__debug.command({type:'speed',value:2.4}));
   await request({requestId:'run-first',kind:'walk',payload:{x:2,z:1.8}});await page.waitForTimeout(800);
   await request({requestId:'run-reselect',kind:'walk',payload:{x:-.5,z:1.8}});await done('run-first','cancelled');await done('run-reselect');await page.waitForTimeout(600);
   if(r.danceAdmission.available){
    await request({requestId:'technical-once',kind:'dance',payload:{danceId:'dance-technical-once-v1'}});
    await page.waitForFunction(()=>['completed','failed','cancelled'].includes(__debug.tasks().get('technical-once')?.state),null,{timeout:20000});
    const task=await page.evaluate(()=>__debug.tasks().get('technical-once'));r.tasks.push(task);
    if(task.state==='failed'){r.danceAdmission.runtimeRejected=task;r.danceAdmission.available=false;}
    else{check('technical completes',task.state==='completed',task);check('technical full7.2s',task.endedAt-task.startedAt>=7.2,task.endedAt-task.startedAt);}
   }
   await page.waitForTimeout(600);await page.evaluate(()=>__debug.command({type:'speed',value:.85}));
   await request({requestId:'walk-after',kind:'walk',payload:{x:.5,z:1.8}});await done('walk-after');await page.waitForTimeout(600);
   r.final=await page.evaluate(()=>({snapshot:__debug.snapshot(),active:__debug.tasks().active(),live:__debug.avatar().livePresentation.getState(),history:__debug.tasks().history()}));
   check('final idle',r.final.snapshot.mode==='idle'&&r.final.active===null);check('no accessories',Object.values(r.final.live.accessories).every(x=>!x.loaded&&!x.requested));r.finalGate=await verifyCandidate(page,{build,...cfg});check('no pageerror',r.errors.length===0);
  }finally{
   r.frames=await page.evaluate(()=>{const q=window.__m2Motion;if(!q)return[];q.running=false;return q.rows;}).catch(()=>[]);
   await context.close();await video.saveAs(path.join(dir,'run-turn-stop-dance-walk-1x.webm'));await save();
  }
  check('normal frames recorded',r.frames.length>0);const camera=JSON.stringify(r.frames[0].camera);check('room camera unchanged',r.frames.every(x=>JSON.stringify(x.camera)===camera));check('shorts retained',r.frames.every(x=>x.outfit===2));check('actual run entered',r.frames.some(x=>x.runMix>.95));
  r.clock={wallSeconds:(r.frames.at(-1).wallMs-r.frames[0].wallMs)/1000,simSeconds:r.frames.at(-1).simulationTime-r.frames[0].simulationTime,scope:'post-ready rAF window; full video includes page loading'};r.clock.ratio=r.clock.simSeconds/r.clock.wallSeconds;r.passed=r.danceAdmission.available;await save();
 }}catch(e){await writeFailure(out,e);throw e;}finally{await browser.close();await save();console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
