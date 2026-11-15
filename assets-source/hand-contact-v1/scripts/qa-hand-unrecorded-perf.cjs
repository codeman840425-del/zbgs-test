// Fixed candidate only. In-memory timing wrappers, no product changes or captureStream.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(root,'prototype/node_modules/playwright'));
const {expectations,verifyCandidate}=require(path.join(root,'scripts/qa-m1-common.cjs'));
function stats(a){a=a.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?{n:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a.at(-1),over16:a.filter(x=>x>16.667).length,over33:a.filter(x=>x>33.334).length,over50:a.filter(x=>x>50).length}:null;}
(async()=>{
 const url=process.argv[2],expected=expectations();if(!/^http:\/\//.test(url||''))throw Error('Requires identity-gated run-fixed-check');
 const profiling=process.env.QA_FOREARM_PROFILE==='1';
 const handMode=process.env.QA_HAND_SKIN_MODE||'actual',outfit=Number(process.env.QA_HAND_OUTFIT||1);if(!['actual','legacy'].includes(handMode)||![0,1].includes(outfit))throw Error('Invalid hand/outfit mode');
 const cases=process.env.QA_FOREARM_CASES?JSON.parse(process.env.QA_FOREARM_CASES):[['close','lap'],['close','authored'],['room','authored'],['room','lap']];
 if(!cases.every(x=>Array.isArray(x)&&x.length===2&&['close','room'].includes(x[0])&&['lap','authored'].includes(x[1])))throw Error('Invalid cases');
 const out=path.join(root,'output/playwright/hand-contact-'+expected.build,(profiling?'internal-profile':'unrecorded-perf')+'-'+handMode+'-outfit'+outfit);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'summary.json'));throw Error('Refuse existing results');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:false}),reports=[];
 try{for(const [camera,mode] of cases){
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'?forearm=calibrated&handTarget='+mode+'&handSkin='+handMode+(profiling?'&forearmTiming=1':''));await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});const identity=await verifyCandidate(page,expected);
  await page.evaluate(({camera,outfit})=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),rig=d.motion();
   d.reset();d.setPaused(true);d.setPlaybackRate(1);d.setOutfit(outfit);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;rig.reset();a.update(0);a.root.updateMatrixWorld(true);c.cameraPreset(camera,true);
   const q=window.__forearmPerf={frames:[],events:[],start:performance.now(),phase:'warmup',frame:null,lastStart:null,lastMetric:null};
   const origMetrics=rig.getMetrics;rig.getMetrics=function(...args){const m=origMetrics.apply(this,args);q.lastMetric=m;return m;};
   function wrap(obj,key,cost){const orig=obj[key];obj[key]=function(...args){const t=performance.now();try{return orig.apply(this,args);}finally{if(q.frame)q.frame[cost]+=performance.now()-t;}};}
   wrap(rig,'update','motionMs');wrap(a,'update','avatarMs');if(a.updateGarment)wrap(a,'updateGarment','garmentMs');wrap(d.renderer,'render','renderSubmitMs');
   const origSim=c.simulate;c.simulate=function(...args){const t=performance.now();const result=origSim.apply(this,args);if(q.frame){q.frame.simulateMs+=performance.now()-t;q.frame.steps++;q.frame.simulatedSeconds+=args[0];const t0=performance.now();const contacts=q.lastMetric?.handContacts||[];const fit=contacts.reduce((max,h)=>Math.max(max,h.fitElapsedMs||0),0);q.frame.fitLastStepMs=fit;q.frame.fitAllStepsMs+=fit;const internal=q.lastMetric?.handFitProfile;if(internal){for(const [k,v] of Object.entries(internal))q.frame.internal[k]=(q.frame.internal[k]||0)+v;}q.frame.sampleMs+=performance.now()-t0;}return result;};
   const origUpdate=c.sys.sceneUpdate;c.sys.sceneUpdate=function(...args){const t=performance.now(),f={t:t-q.start,phase:q.phase,frameMs:q.lastStart===null?null:t-q.lastStart,steps:0,simulatedSeconds:0,simulateMs:0,motionMs:0,avatarMs:0,garmentMs:0,renderSubmitMs:0,fitLastStepMs:0,fitAllStepsMs:0,sampleMs:0,internal:{}};q.lastStart=t;q.frame=f;try{return origUpdate.apply(this,args);}finally{f.updateMs=performance.now()-t;const sampleStart=performance.now();f.mode=this.mode;f.sitProgress=q.lastMetric?.sitProgress;f.handSurfaceActive=(q.lastMetric?.handContacts||[]).some(h=>h.handSurfaceMetrics?.railCount>0);f.handRailQueries=(q.lastMetric?.handContacts||[]).reduce((n,h)=>n+(h.handNarrowPhasePairs||0),0);f.camera=camera;f.root=this.actor.root.position.toArray();q.frames.push(f);q.frame=null;f.sampleMs+=performance.now()-sampleStart;}};
   const gl=d.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');q.device={userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
   d.setPaused(false);
  },{camera,outfit});
  const phase=async name=>page.evaluate(name=>{__forearmPerf.phase=name;__forearmPerf.events.push({name,t:performance.now()-__forearmPerf.start});},name);
  await page.waitForTimeout(4000);await phase('standing-skirt');await page.waitForTimeout(3000);
  await phase('sit-enter');await page.evaluate(()=>__debug.game.scene.getScene('CharacterStudio').action('sit'));
  await page.waitForFunction(()=>__forearmPerf.lastMetric?.sitProgress>=.999,null,{timeout:15000});await phase('seated');await page.waitForTimeout(3500);
  await phase('rise');await page.evaluate(()=>__debug.game.scene.getScene('CharacterStudio').action('stand'));
  await page.waitForFunction(()=>__forearmPerf.lastMetric?.sitProgress<=.001,null,{timeout:15000});await phase('post-standing');await page.waitForTimeout(2000);
  const capture=await page.evaluate(()=>{const q=__forearmPerf;return {frames:q.frames,events:q.events,device:q.device,final:__debug.snapshot()};});
  if(capture.frames.some(f=>f.handSurfaceActive)!==(handMode==='actual'&&outfit===1))throw Error('Requested hand contact activation/empty-surface short circuit mismatch');
  if(capture.frames.length<100)throw Error('Scene update wrapper did not execute');
  if(profiling&&!capture.frames.some(f=>Object.keys(f.internal).length))throw Error('Internal timing was requested but not enabled');
  const phases={};for(const ph of [...new Set(capture.frames.map(f=>f.phase))]){const rows=capture.frames.filter(f=>f.phase===ph);phases[ph]={};for(const k of ['frameMs','steps','simulateMs','motionMs','avatarMs','garmentMs','renderSubmitMs','fitLastStepMs','fitAllStepsMs','sampleMs','updateMs'])phases[ph][k]=stats(rows.map(f=>f[k]));phases[ph].internal={};for(const k of Object.keys(rows.find(f=>Object.keys(f.internal).length)?.internal||{}))phases[ph].internal[k]=stats(rows.map(f=>f.internal[k]));}
  const result={handMode,outfit,camera,mode,identity,finalIdentity:await verifyCandidate(page,expected),errors,...capture,phases};await fs.writeFile(path.join(out,`${camera}-${mode}.json`),JSON.stringify(result));reports.push({handMode,outfit,camera,mode,errors,device:capture.device,phases});console.log(JSON.stringify({camera,mode,seated:phases.seated}));await page.close();if(errors.length)throw Error('Page error');
 }
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({build:expected.build,handMode,outfit,viewport:[1440,1080],recording:false,internalProfiling:profiling,bodySHA:expected.assetSHA,reports,limitations:'One serial run per condition; same developer machine, not target PC. CPU render submit excludes asynchronous GPU. fitAllSteps sums max cumulative left/right timer per REAL simulate call, never adds arms; timing observer overhead included separately. Timers and wrappers add some unmeasured fixed cost. No product behavior/threshold changes.'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
