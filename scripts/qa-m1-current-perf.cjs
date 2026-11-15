// Sustained current-candidate measurements without video capture or CPU throttling.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const PERF_CASES = [
   {name:'base-walk',base:true,walk:true},{name:'pants-walk',walk:true},{name:'skirt-walk',skirt:true,walk:true},
   {name:'skirt-sit-hold',skirt:true,sit:true},{name:'skirt-sit-rise-switches',skirt:true,switches:true},
   {name:'pants-run',walk:true,speed:2.6},{name:'skirt-run',skirt:true,walk:true,speed:2.6},
   {name:'dual-pants-walk',dual:true,walk:true},{name:'dual-skirt-pants-walk',dual:true,skirt:true,walk:true}
  ];
function selectCases(value){
 if(value===undefined)return PERF_CASES;
 if(typeof value!=='string'||!value.trim())throw Error('QA_PERF_CASES must be a nonempty comma-separated case list');
 const names=value.split(',').map(x=>x.trim());
 if(names.some(x=>!x)||new Set(names).size!==names.length)throw Error('Empty or duplicate QA_PERF_CASES entry');
 const known=new Map(PERF_CASES.map(x=>[x.name,x]));
 for(const name of names)if(!known.has(name))throw Error('Unknown QA_PERF_CASES entry: '+name);
 return names.map(name=>known.get(name));
}
// Serializable helper used unchanged by the browser and deterministic Node check.
function createTimers(now,current){
 const installed=new WeakMap(),stack=[];
 return (object,key,label)=>{
  if(typeof object?.[key]!=='function')throw Error('Missing timed method '+key);
  let names=installed.get(object);if(!names){names=new Set();installed.set(object,names);}if(names.has(key))throw Error('Duplicate timer '+key);names.add(key);
  const original=object[key];object[key]=function(...args){const row=current();if(!row)return original.apply(this,args);
   const item={start:now(),children:0};stack.push(item);
   try{return original.apply(this,args);}finally{const elapsed=now()-item.start;stack.pop();if(stack.length)stack.at(-1).children+=elapsed;
    row[label]=(row[label]||0)+elapsed;row.exclusive[label]=(row.exclusive[label]||0)+elapsed-item.children;row.calls[label]=(row.calls[label]||0)+1;
   }
  };
 };
}
if(process.argv.includes('--self-test')){
 assert.equal(selectCases(undefined).length,9);assert.deepEqual(selectCases('skirt-sit-hold,skirt-sit-rise-switches').map(x=>x.name),['skirt-sit-hold','skirt-sit-rise-switches']);for(const value of ['', ' ', 'unknown', 'skirt-sit-hold,', 'skirt-sit-hold,skirt-sit-hold'])assert.throws(()=>selectCases(value));
 let time=0,row={exclusive:{},calls:{}};const w=createTimers(()=>time,()=>row),x={inner(){time+=3;},outer(){time+=2;this.inner();time+=5;},failure(){time++;throw Error('expected');}};
 w(x,'inner','innerMs');w(x,'outer','outerMs');w(x,'failure','failureMs');x.outer();assert.equal(row.outerMs,10);assert.equal(row.innerMs,3);assert.equal(row.exclusive.outerMs,7);assert.equal(Object.values(row.exclusive).reduce((a,b)=>a+b,0),10);assert.throws(()=>x.failure(),/expected/);assert.equal(row.exclusive.failureMs,1);assert.throws(()=>w(x,'inner','again'),/Duplicate/);row=null;x.outer();assert.equal(time,21);console.log('PASS nested inclusive/exclusive, exception cleanup, duplicate guard, inactive sampling');process.exit(0);
}
const selectedCases=selectCases(process.env.QA_PERF_CASES);
const detail=process.env.QA_PERF_DETAIL==='1';
// Keep default headed behavior; paired hidden runs explicitly opt in.
const headless=process.env.QA_PERF_HEADLESS==='1';
const build=process.env.QA_M1_BUILD;
const sampleSeconds=Number(process.env.QA_PERF_SECONDS||30);
if(!Number.isFinite(sampleSeconds)||sampleSeconds<12||sampleSeconds>120)throw Error('QA_PERF_SECONDS must be 12..120');
if(!build)throw Error('Require explicit QA_M1_BUILD');
assert.match(build,/^[a-f0-9]{12}$/);
const identity={build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};
const quant=(rows,key)=>{const a=rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(x=>x>33.34).length,over50:a.filter(x=>x>50).length};};
(async()=>{
 const out=path.resolve(process.env.QA_M1_RUN_ROOT||`output/playwright/m1/${build}/sustained-perf`);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse to overwrite measured report');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
 const report={schema:'sustained-current-perf-v2',build,detail,headless,scriptSHA256:createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),sampleSeconds,selectedCases:selectedCases.map(x=>x.name),viewport:{width:1440,height:900},browser:browser.version(),errors,results:[],passed:false,
  limitations:[`Browser mode: ${headless?'headless':'headed'}; only compare adjacent runs with the same mode.`, 'Development machine only; no ordinary-PC pass.',`${sampleSeconds}-second sample per case, not a soak test.`,
   'Timer Ms fields are inclusive and overlap; do not sum them. exclusive maps remove only nested instrumented calls; their sum is a subset of scene CPU span.',
   'cpuUpdateMs spans Phaser preupdate to postupdate, including scene update, Three CPU render submission and UI work; excludes later Phaser rendering, browser layout/composite and GPU completion.',
   'frameMs is preupdate-to-preupdate wall pacing, not GPU time. Polling commands and all instrumentation overhead remain in observations.',
   'Setup uses reset/manual simulation and excludes load/setup/1s warmup from sampling. Route samples include turns/stops/250ms polling idle gaps; actual duty is reported.',
   'JS heap and renderer object counts are not VRAM/whole-process memory; no video or CPU throttle.']};
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});report.gate=await verifyCandidate(page,identity);
  report.meta=await page.evaluate(()=>{const d=__debug,g=d.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,cores:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,gpu:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,loadMs:d.snapshot().loadMs};});
  await page.evaluate(({timerSource,detail})=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=window.__measure={active:false,frames:[],previous:null,current:null};
   const wrap=(0,eval)('('+timerSource+')')(()=>performance.now(),()=>q.current);
   q.instrument=(a,m)=>{wrap(m,'update','motionMs');wrap(a,'update','avatarMs');wrap(a,'updateGarment','garmentMs');wrap(a.vrm,'update','vrmMs');
    if(detail && a.profile?.motion?.seatHandSurfaces){a.profile.motion.forearmProfileTiming=true;wrap(a.profile.motion,'seatHandSurfaces','handSurfaceMs');}
   };
   q.instrument(d.avatar(),d.motion());wrap(c,'simulate','primarySimulateMs');wrap(d.renderer,'render','renderSubmitMs');
   c.events.on('preupdate',()=>{const t=performance.now();q.current=q.active?{t,frameMs:q.previous===null?null:t-q.previous,exclusive:{},calls:{}}:null;q.previous=t;});
   c.events.on('postupdate',()=>{if(q.current){const row=q.current;row.cpuUpdateMs=performance.now()-row.t;row.mode=c.mode;row.speed=c.actualSpeed;row.hidden=document.hidden;row.paused=c.paused;row.background=c.backgroundSuspended;row.rate=c.playbackRate;row.simulationTime=c.simulationTime;const peer=d.comparison();row.peer=peer?{mode:peer.controller.mode,speed:peer.controller.actualSpeed}:null;if(detail){const sampleStart=performance.now();row.lastSubstepHandFit=d.motion().getMetrics().handFitProfile;row.detailSampleMs=performance.now()-sampleStart;}q.frames.push(row);}q.current=null;});
  },{timerSource:createTimers.toString(),detail});
  for(const config of selectedCases){   const caseResult={config};report.results.push(caseResult);
   await page.evaluate(async cfg=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.removeComparison();d.reset();d.setPlaybackRate(1);d.setCorrections('full');d.setHelpers(false);d.setBodyMode(cfg.base?'base':'dressed');d.setOutfit(cfg.skirt?1:0);d.setDynamics(!cfg.base);c.cameraPreset('room',true);d.setSpeed(cfg.speed||.85);d.setPaused(true);
    if(cfg.dual){const p=await d.loadComparison('male');__measure.instrument(p.avatar,p.motion);p.controller.yaw=Math.PI/2;p.avatar.root.position.set(-2.2,0,2.6);p.avatar.root.rotation.y=Math.PI/2;p.motion.reset();}
    if(cfg.sit){c.action('sit');for(let i=0;i<2400;i++){c.simulate(1/120);if(c.mode==='sit'&&d.motion().getMetrics().sitProgress===1)break;}if(c.mode!=='sit'||d.motion().getMetrics().sitProgress!==1)throw Error('Sit-hold setup did not settle');}
    for(let i=0;i<120;i++)c.simulate(1/120);d.setPaused(false);
    window.__perfEndpoint=1;
    if(cfg.walk){d.walkTo(2.7,1.8);d.comparison()?.request({requestId:'perf-peer-start',kind:'walk',payload:{x:2.7,z:2.6}});}
    if(cfg.switches)d.action('sit');
   },config);
   await page.waitForTimeout(1000);
   caseResult.sampleStart=await page.evaluate(()=>{const s=__debug.snapshot();__measure.frames=[];__measure.previous=null;__measure.active=true;return {simulationTime:s.simulationTime,camera:s.camera,inspection:s.inspection,outfit:s.outfit,mode:s.mode};});
   const start=Date.now();
   while(Date.now()-start<sampleSeconds*1000){
    await page.waitForTimeout(250);
    await page.evaluate(cfg=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');
     if(cfg.walk&&c.mode==='idle'&&!c.target){window.__perfEndpoint*=-1;d.walkTo(window.__perfEndpoint*2.7,1.8);}
     const p=d.comparison();if(cfg.walk&&p&&p.controller.mode==='idle'&&!p.controller.target)p.request({requestId:'perf-peer-'+performance.now(),kind:'walk',payload:{x:p.avatar.root.position.x>0?-2.7:2.7,z:2.6}});
     if(cfg.switches){if(c.mode==='sit'&&d.motion().getMetrics().sitProgress===1)d.action('stand');else if(c.mode==='idle'&&!c.target)d.action('sit');}
    },config);
   }
   const data=await page.evaluate(()=>{__measure.active=false;const s=__debug.snapshot();return {frames:__measure.frames,resources:{renderer:s.renderer,heap:s.heap},end:{mode:s.mode,position:s.position,simulationTime:s.simulationTime,camera:s.camera}};});
   const summary={},exclusive={};for(const key of ['frameMs','cpuUpdateMs','primarySimulateMs','motionMs','avatarMs','vrmMs','garmentMs','renderSubmitMs',...(detail?['handSurfaceMs','detailSampleMs']:[])]){summary[key]=quant(data.frames,key);exclusive[key]=quant(data.frames.map(f=>f.exclusive),key);}
   const modeFrames={};for(const f of data.frames)modeFrames[f.mode]=(modeFrames[f.mode]||0)+1;
   const validity={frames:data.frames.length,invalidStateFrames:data.frames.filter(f=>f.hidden||f.paused||f.background||f.rate!==1).length,missingInstrumentedFrames:data.frames.filter(f=>!f.calls.renderSubmitMs||!f.calls.primarySimulateMs).length,
    movingFrames:data.frames.filter(f=>f.speed>.05).length,runningSpeedFrames:data.frames.filter(f=>f.speed>1.5).length,peerMovingFrames:data.frames.filter(f=>f.peer?.speed>.05).length,modeFrames,
    exclusiveOverSceneFrames:data.frames.filter(f=>Object.values(f.exclusive).reduce((a,b)=>a+b,0)>f.cpuUpdateMs+.01).length};
   Object.assign(caseResult,{wallMs:Date.now()-start,...data,summary,exclusiveSummary:exclusive,validity});console.log(config.name,JSON.stringify(summary.frameMs));
   assert(data.frames.length>1&&data.end.simulationTime>caseResult.sampleStart.simulationTime,'No sustained scene progress');
   assert.equal(validity.invalidStateFrames+validity.missingInstrumentedFrames+validity.exclusiveOverSceneFrames,0,'Invalid measurement stage/timer coverage');
   if(config.walk)assert(validity.movingFrames>0,'Walk case never moved');if(config.speed)assert(validity.runningSpeedFrames>0,'Run case never reached run speed');if(config.dual)assert(validity.peerMovingFrames>0,'Dual case peer never moved');if(config.sit)assert.equal(modeFrames.sit,data.frames.length,'Sit-hold did not remain seated');if(config.switches)assert(modeFrames.sit&&modeFrames.stand,'Switch case missed sitting/rising');
   caseResult.valid=true;
  }
  report.finalGate=await verifyCandidate(page,identity);
  if(errors.length)throw Error('Page errors in recorded measurement');
  report.passed=true;
 }catch(e){report.failure=String(e);report.partialActiveFrames=await page.evaluate(()=>{if(!window.__measure)return [];__measure.active=false;return __measure.frames;}).catch(()=>[]);throw e;
 }finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
