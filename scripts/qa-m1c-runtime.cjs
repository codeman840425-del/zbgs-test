// Fixed-candidate, normal-wallclock M1C collection. No product-source imports,
// simulation stepping, hidden time acceleration, or browser concurrency.
// Technical choreography is an original validation specimen, NOT professional dance.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
const CASES=[
 {name:'female-base',body:'female',bodyMode:'base',outfit:0,dynamics:false},
 {name:'female-pants',body:'female',bodyMode:'dressed',outfit:0,dynamics:true},
 {name:'female-skirt',body:'female',bodyMode:'dressed',outfit:1,dynamics:true},
 {name:'male-base',body:'male',bodyMode:'base',outfit:0,dynamics:false},
 {name:'male-pants',body:'male',bodyMode:'dressed',outfit:0,dynamics:true},
];
const selected=process.argv.find(a=>a.startsWith('--cases='))?.slice(8).split(',');
if(selected?.some(name=>!CASES.some(c=>c.name===name)))throw Error('Unknown case name');
const cases=CASES.filter(c=>!selected||selected.includes(c.name));
const PLAN={cases,viewport:{width:1440,height:900},camera:{mode:'room',position:[5.8,4.5,7.8],target:[0,.65,0],setup:'CharacterStudio.cameraPreset(room,true) after reset; verified every frame'},playbackRate:1,walkSpeed:.85,runSpeed:2.55,
 path:{left:[-3.2,1.8],right:[3.2,1.8],dance:[-.5,1.8]},requestedCanvasFPS:60,
 stages:['walk -> run -> walk -> settled stop within one request','two complete room runs, total >=3 complete stable jog cycles','run -> opposite target -> change target again while turning','walk to dance space; idle -> full technical choreography -> automatic idle','start technical choreography again; interrupt by walk; settle'],
 limits:['Source is technical choreography, not professional dance','Real rAF + normal wall clock; no __debug.advance or scene.simulate','Renderer canvas capture; actual encoded timestamps need separate review','Per-frame telemetry uses actual raw bone worlds and controller contact metrics, not full triangle contact probes','Collection success is not visual or target-PC performance acceptance','One browser/page at a time; no permanent service']};
if(process.argv.includes('--help')){console.log('QA_M1_BUILD=<fixed12> QA_M1_ASSET_SHA=<female64> node scripts/run-fixed-check.cjs <immutable-dist> scripts/qa-m1c-runtime.cjs [--cases=female-base,female-pants,female-skirt,male-base,male-pants]\nUse --plan without a browser. QA_M1_RUN_ROOT must be fresh. Optional QA_HEADLESS=1 is explicitly recorded. Male and source SHA overrides require explicit QA_M1_MALE_ASSET_SHA / QA_M1C_JOG_SHA / QA_M1C_DANCE_SHA.');process.exit(0);}
if(process.argv.includes('--plan')){console.log(JSON.stringify(PLAN,null,2));process.exit(0);}
const {chromium}=require('../prototype/node_modules/playwright');
function stats(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p95:a[Math.floor((a.length-1)*.95)],p99:a[Math.floor((a.length-1)*.99)],max:a.at(-1),over33ms:a.filter(x=>x>33.34).length,over50ms:a.filter(x=>x>50).length};}
function stableJogCycles(frames){
 let total=0,current=0,prior=null;const segments=[];
 const finish=()=>{if(current>0)segments.push({cycles:current,completeCycles:Math.floor(current+1e-6)});current=0;prior=null;};
 for(const f of frames){if(f.runMix>.99&&f.moving&&f.speed>.2){if(prior){const delta=(f.jogPhase-prior.jogPhase+1)%1;if(delta<.25){current+=delta;total+=delta;}else finish();}prior=f;}else finish();}
 finish();return {totalPhaseCycles:total,completeCycles:segments.reduce((n,s)=>n+s.completeCycles,0),segments,method:'Sum positive unwrapped phase only inside continuous runMix>.99 + moving segments; floor each segment. Phase resets/partial cycles never count as complete cycles.'};
}
function eventLatency(frames,event){
 const after=frames.filter(f=>f.t>=event.t),p=event.state.position,yaw=event.state.facing,target=event.request.payload;
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const root=after.find(f=>Math.hypot(f.root[0]-p[0],f.root[2]-p[2])>.005),turn=after.find(f=>Math.abs(wrap(f.facing-yaw))>.01);
 const targetLength=target&&Number.isFinite(target.x)?Math.hypot(target.x-p[0],target.z-p[2]):0;
 const intended=targetLength>0?after.find(f=>((f.root[0]-p[0])*(target.x-p[0])+(f.root[2]-p[2])*(target.z-p[2]))/targetLength>.005):null;
 return {requestId:event.request.requestId,firstRootChangeMs:root?root.t-event.t:null,firstYawChangeMs:turn?turn.t-event.t:null,firstNewTargetDirectionProgressMs:intended?intended.t-event.t:null,note:'Root change during retarget may still be braking along the previous direction; the directional progress metric is separate.'};
}
(async()=>{
 const identity=expectations(),url=process.argv[2];if(!/^https?:\/\//.test(url||''))throw Error('Explicit fixed URL required; use run-fixed-check.cjs');
 if(identity.assetId!=='beta-base-female-m1')throw Error('Primary expectation must be the female baseline; male has its own explicit gate');
 const male={build:identity.build,assetId:process.env.QA_M1_MALE_ASSET_ID||'beta-base-male-m1b',sha256:process.env.QA_M1_MALE_ASSET_SHA||'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
 const sourcePins={jog:process.env.QA_M1C_JOG_SHA||'6ec251d7611f22c6bf918d3401fcf438a8f2bc7b72f2826047dea8beef15c9e5',dance:process.env.QA_M1C_DANCE_SHA||'2d785287de3c0187c76ed90ae6e0b76fed3008cb1a7a2ac75065720d3885304e'};
 if(![male.sha256,...Object.values(sourcePins)].every(s=>/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid explicit asset SHA');
 const out=await prepareOutput(identity.build,'m1c-runtime'),reports=[],headless=process.env.QA_HEADLESS==='1';let browser,page,activeCase,initialGate,recording=false,errors=[];
 const manifest={status:'running',identity,male,sourcePins,url,plan:PLAN,headless,scriptSha256:crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),startedAt:new Date().toISOString(),reports};
 await fs.writeFile(path.join(out,'start-manifest.json'),JSON.stringify(manifest,null,2));
 const saveManifest=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(manifest,null,2));
 async function collectCapture(completed){
  if(!page)return null;
  const captured=await page.evaluate(async()=>{
   const q=window.__m1c;if(!q)return null;q.running=false;const rec=q.recorder;
   if(rec&&rec.state!=='inactive')await new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(Error(e.error?.message||'MediaRecorder error'));rec.stop();});
   rec?.stream.getTracks().forEach(t=>t.stop());
   let base64=null;if(rec){const bytes=new Uint8Array(await new Blob(q.chunks,{type:rec.mimeType}).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));base64=btoa(text);}
   return {base64,mimeType:rec?.mimeType,frames:q.frames,events:q.events,violations:q.violations,taskHistory:__debug.tasks().history(),finalState:__debug.snapshot(),recordStart:q.recordStart,recordEnd:performance.now(),canvasSize:[__debug.renderer.domElement.width,__debug.renderer.domElement.height]};
  });
  recording=false;if(!captured)return null;
  if(captured.base64){const file=activeCase.name+'-normal-TECHNICAL-DANCE-not-professional'+(completed?'':'-incomplete')+'.webm';await fs.writeFile(path.join(out,file),Buffer.from(captured.base64,'base64'));captured.video=file;delete captured.base64;}
  return captured;
 }
 try{
  browser=await chromium.launch({channel:'chrome',headless});manifest.browser=await browser.version();
  for(const c of cases){
   activeCase=c;errors=[];const context=await browser.newContext({viewport:PLAN.viewport}),expected=c.body==='male'?male:identity;page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.bringToFront();
   const caseURL=new URL(url);caseURL.searchParams.set('body',c.body);await page.goto(caseURL.href);await page.waitForFunction(()=>window.__debug?.ready&&__debug.buildInfo?.shortId,null,{timeout:60000});initialGate=await verifyCandidate(page,expected);
   const resources=await page.evaluate(async pins=>{
    const read=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Asset HTTP '+r.status+' '+url);return r;};
    const hash=async url=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await read(url)).arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const jog=await(await read('/assets/motion/m1c/jog-ordinary-derived-v1.profile.json')).json();
    if(jog.sha256!==pins.jog||await hash('/assets/motion/m1c/'+jog.file)!==pins.jog)throw Error('Frozen Jog resource mismatch');
    const dances=__debug.motion().getDances(),technical=dances.find(d=>d.playback==='once-then-idle'&&d.sha256===pins.dance);
    if(!technical||await hash('/assets/motion/m1c/'+technical.file)!==pins.dance)throw Error('Frozen technical choreography not loaded');
    const canvas=__debug.renderer.domElement,gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return {jog,dances,technical,userAgent:navigator.userAgent,gpu:ext?{vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}:null};
   },sourcePins);
   await page.evaluate(c=>{
    const d=__debug;d.reset();d.setBodyMode(c.bodyMode);d.setOutfit(c.outfit);d.setDynamics(c.dynamics);d.setCorrections('full');d.setPlaybackRate(1);d.setHelpers(false);d.game.scene.getScene('CharacterStudio').cameraPreset('room',true);d.setSpeed(.85);d.setPaused(false);
    window.__m1c={running:false,stage:'setup',frames:[],events:[],violations:[],chunks:[],expected:c,recorder:null};
    let last=null;const tick=t=>{
     const q=window.__m1c;if(q?.running){const s=d.snapshot(),m=s.motion,a=d.avatar();a.root.updateMatrixWorld(true);
      const raw=b=>a.vrm.humanoid.getRawBoneNode(b).getWorldPosition(a.root.position.clone()).toArray();
      const row={t,wallFrameMs:last===null?null:t-last,simulationTime:s.simulationTime,simulationDt:m.frameDt,stage:q.stage,mode:s.mode,moving:m.moving,root:s.position,facing:s.facing,hip:m.hipWorld,rawHip:raw('hips'),hipCorrection:m.hipCorrection,distance:s.distance,speed:s.speed,maxSpeed:s.maxSpeed,runMix:m.runMix,jogPhase:m.jogPhase,jogStride:m.jogStride,phase:m.phase,gait:m.gait,turn:s.turnPlan,target:s.target,pending:s.pending,danceMix:m.danceMix,dance:m.dance,feet:m.feet.map(f=>({...f,raw:raw(f.side+'Foot')})),outfit:s.outfit,actualOutfit:s.outfitInfo?.index,bodyMode:s.inspection.bodyMode,playbackRate:s.playbackRate,camera:s.camera,backgroundSuspended:s.backgroundSuspended,documentHidden:document.hidden,collision:s.collision,activeRequest:d.tasks().active()?.requestId??null};q.frames.push(row);
      const cameraFixed=row.camera.mode==='room'&&row.camera.position.every((v,i)=>Math.abs(v-[5.8,4.5,7.8][i])<1e-6)&&row.camera.target.every((v,i)=>Math.abs(v-[0,.65,0][i])<1e-6);
      if(!cameraFixed||row.outfit!==c.outfit||row.actualOutfit!==c.outfit||row.bodyMode!==c.bodyMode||row.playbackRate!==1||row.documentHidden||row.backgroundSuspended||row.collision||![...row.root,...row.hip,...row.rawHip,row.runMix,row.jogPhase].every(Number.isFinite))q.violations.push({t,stage:q.stage,row});
     }last=q?.running?t:null;requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
   },c);
   let serial=0;const requests=[];
   const check=async()=>{if(errors.length)throw Error('Page errors: '+errors.join('; '));const v=await page.evaluate(()=>__m1c.violations[0]??null);if(v)throw Error('Frame gate failed: '+JSON.stringify({t:v.t,stage:v.stage,outfit:v.row.outfit,bodyMode:v.row.bodyMode,collision:v.row.collision}));};
   const mark=async stage=>{await check();await page.evaluate(stage=>{__m1c.stage=stage;__m1c.events.push({type:'stage',stage,t:performance.now(),state:__debug.snapshot()});},stage);};
   async function request(label,kind,payload={},expectedState='completed'){
    await check();const request={requestId:`m1c:${c.name}:${++serial}:${label}`,kind,payload,timeoutSeconds:50,queue:false};
    const event=await page.evaluate(request=>{const state=__debug.snapshot(),t=performance.now(),result=__debug.request(request);const e={type:'request',request,t,state,result};__m1c.events.push(e);return e;},request);
    requests.push({request,event,expectedState});if(event.result.admission==='rejected'||event.result.task?.state==='failed')throw Error('Request refused: '+JSON.stringify(event));return request.requestId;
   }
   async function terminal(id,state='completed',timeout=50000){
    await page.waitForFunction(id=>__m1c.violations.length||['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout});await check();const task=await page.evaluate(id=>__debug.tasks().get(id),id);if(task.state!==state)throw Error(`Request ${id}: wanted ${state}, got ${task.state} / ${task.reason}`);return task;
   }
   async function waitFor(predicate,arg,timeout=15000){await page.waitForFunction(predicate,arg,{timeout});await check();}
   async function delay(ms){await page.waitForTimeout(ms);await check();}
   const setupId=await request('setup-left','walk',{x:PLAN.path.left[0],z:PLAN.path.left[1]});await terminal(setupId);await delay(700);
   const setup=await page.evaluate(()=>__debug.snapshot());
   await page.evaluate(()=>{const q=__m1c,stream=__debug.renderer.domElement.captureStream(60),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime)throw Error('No supported WebM encoder');q.chunks=[];q.recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});q.recorder.ondataavailable=e=>{if(e.data.size)q.chunks.push(e.data);};q.recordStart=performance.now();q.running=true;q.recorder.start(250);});recording=true;
   await mark('walk-run-walk-stop');await delay(500);const mixed=await request('mixed-traverse','walk',{x:3.2,z:1.8});await waitFor(()=>__debug.snapshot().speed>.7);await delay(900);await page.evaluate(()=>{__debug.setSpeed(2.55);__m1c.events.push({type:'speed',value:2.55,t:performance.now(),state:__debug.snapshot()});});await waitFor(()=>__debug.motion().getMetrics().runMix>.99);await delay(1200);await page.evaluate(()=>{__debug.setSpeed(.85);__m1c.events.push({type:'speed',value:.85,t:performance.now(),state:__debug.snapshot()});});await terminal(mixed);await delay(600);
   await mark('full-run-left');await page.evaluate(()=>__debug.setSpeed(2.55));const left=await request('full-left','walk',{x:-3.2,z:1.8});await terminal(left);await delay(550);
   await mark('full-run-right');const right=await request('full-right','walk',{x:3.2,z:1.8});await terminal(right);await delay(550);
   await mark('run-target-reselection');const old=await request('retarget-origin','walk',{x:-3.2,z:1.8},'cancelled');await waitFor(()=>__debug.snapshot().motion.runMix>.99&&__debug.snapshot().speed>2.1);await delay(650);
   const reversed=await request('retarget-opposite','walk',{x:3.2,z:1.8},'cancelled');await waitFor(()=>__debug.snapshot().turnPlan?.active&&Math.abs(__debug.snapshot().turnPlan.angularVelocity)>.1);const latest=await request('retarget-during-turn','walk',{x:2.6,z:2.1});await terminal(old,'cancelled');await terminal(reversed,'cancelled');await terminal(latest);await delay(600);
   await mark('approach-dance-space');await page.evaluate(()=>__debug.setSpeed(.85));const approach=await request('dance-space','walk',{x:PLAN.path.dance[0],z:PLAN.path.dance[1]});await terminal(approach);await delay(600);
   await mark('TECHNICAL-choreography-full-once-not-professional');const dance=await request('technical-full','dance',{danceId:resources.technical.id});await waitFor(()=>__debug.snapshot().mode==='dance'&&__debug.motion().getMetrics().danceMix>.8);await terminal(dance,'completed',20000);await delay(700);await page.screenshot({path:path.join(out,c.name+'-after-full-technical.png')});
   await mark('TECHNICAL-choreography-interrupted-by-walk');const interrupted=await request('technical-interrupted','dance',{danceId:resources.technical.id},'cancelled');await waitFor(()=>__debug.motion().getMetrics().dance.time>1.7&&__debug.snapshot().mode==='dance');const exit=await request('walk-out-of-technical','walk',{x:-1.5,z:1.8});await terminal(interrupted,'cancelled');await terminal(exit);await delay(900);await mark('settled-final');
   const capture=await collectCapture(true),finalGate=await verifyCandidate(page,expected);const tasks=await page.evaluate(ids=>ids.map(id=>__debug.tasks().get(id)),requests.map(r=>r.request.requestId));
   const cycles=stableJogCycles(capture.frames),fullDance=capture.frames.filter(f=>f.stage==='TECHNICAL-choreography-full-once-not-professional'),observedDanceSeconds=Math.max(0,...fullDance.map(f=>f.dance?.time||0));
   const duringTurn=capture.events.find(e=>e.type==='request'&&e.request.requestId.endsWith(':retarget-during-turn'));
   const checks={identityStable:initialGate.runtimeBuild.sourceDigest===finalGate.runtimeBuild.sourceDigest,zeroPageErrors:errors.length===0,noFrameGateViolations:capture.violations.length===0,requestsFinal:tasks.every((t,i)=>t?.state===requests[i].expectedState),atLeastThreeCompleteJogCycles:cycles.completeCycles>=3,retargetDuringActualTurn:duringTurn?.state.turnPlan?.active&&Math.abs(duringTurn.state.turnPlan.angularVelocity)>.1,fullTechnicalDurationObserved:observedDanceSeconds>=resources.technical.duration-.08,finalSettled:capture.finalState.mode==='idle'&&!capture.finalState.target&&!capture.finalState.pending&&capture.finalState.motion.danceMix<.001};
   const report={case:c,initialGate,finalGate,resources,setup,errors,checks,cycles,observedDanceSeconds,frameTiming:stats(capture.frames.map(f=>f.wallFrameMs)),retargetLatencies:capture.events.filter(e=>e.type==='request'&&e.request.requestId.includes('retarget-')).map(e=>eventLatency(capture.frames,e)),requests:requests.map((r,i)=>({...r,final:tasks[i]})),...capture,status:Object.values(checks).every(Boolean)?'collection-complete-visual-review-required':'failed-or-incomplete'};
   await fs.writeFile(path.join(out,c.name+'.json'),JSON.stringify(report,null,2));reports.push({case:c,checks,cycles,frameTiming:report.frameTiming,observedDanceSeconds,video:capture.video,status:report.status});await saveManifest();await context.close();page=null;
   if(!Object.values(checks).every(Boolean))throw Error('Case failed its collection gates: '+c.name);console.log(`[M1C ${identity.build}] ${c.name}: recorded, visual review pending`);
  }
  manifest.status='collection-complete-visual-review-required';manifest.finishedAt=new Date().toISOString();await saveManifest();
  const cards=reports.map(r=>`<section><h2>${r.case.name}</h2><p>正常速度 1×；技术编排样件，非专业舞蹈。完整走跑切换、重选目标、7.2 秒编排和中断。</p><video controls preload="metadata" src="${r.video}" style="width:100%;max-width:1100px"></video><p><a href="${r.case.name}.json">逐帧数据及请求终态</a></p></section>`).join('');
  await fs.writeFile(path.join(out,'review.html'),`<!doctype html><meta charset="utf-8"><title>M1C ${identity.build} · 技术编排待观看验收</title><body style="background:#18202b;color:#eee;font:16px system-ui;margin:24px"><h1>M1C ${identity.build}：正常速度完整链</h1><p>数值检查不替代视觉验收；这些视频未宣称专业舞蹈或目标电脑性能达标。</p>${cards}</body>`);console.log(out);
 }catch(error){let partial;try{if(page)partial=await collectCapture(false);}catch(e){partial={captureError:String(e)};}if(activeCase&&partial)await fs.writeFile(path.join(out,activeCase.name+'-incomplete.json'),JSON.stringify({case:activeCase,initialGate,errors,...partial},null,2));manifest.status='failed-or-incomplete';manifest.finishedAt=new Date().toISOString();await saveManifest();await writeFailure(out,error,{activeCase,initialGate,errors,reports,partialFile:activeCase?activeCase.name+'-incomplete.json':null});throw error;}
 finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
