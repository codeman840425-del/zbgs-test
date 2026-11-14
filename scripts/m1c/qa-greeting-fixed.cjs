// Fixed room task/API validation. --plan and --check NEVER launch a browser.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const {prepareOutput,verifyCandidate,writeFailure}=require('../qa-m1-common.cjs');
const build=process.env.QA_BUILD||'18a7de64033c';
const configs=[{body:'female',outfit:0,name:'female-pants'},{body:'female',outfit:1,name:'female-skirt'},{body:'male',outfit:2,name:'male-shorts'}];
const expected=body=>({build,assetId:body==='male'?'beta-base-male-m1b':'beta-base-female-m1',sha256:body==='male'?'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
const plan={build,configs,normalSpeed:['standing front: complete with duplicate request','standing side: pause/resume; cancel then reissue','seated side: complete','seated front: cancel and reissue; remain seated'],contracts:['fixed runtime/served/avatar hashes before and after','task terminal exactly once','mic request rejected while greeting; greeting rejected while mic requested','primary/peer greeting cancellation and completion isolated','normal playback rate1; no accelerated simulation during marked gesture segments'],setup:'Paused reset, chair-approach teleport and 1s120Hz prewarm are explicitly labeled setup, NOT normal-speed evidence',evidence:'Playwright complete viewport movie, task/raw-left-arm samples, input wallclock log, key screenshots, source build identity',untested:['Full hand/clothing triangle CCD','Performance on ordinary hardware','Greeting while holding microphone (explicitly unavailable)']};
async function main(){
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));return;}
 if(process.argv.includes('--check')){
  const i=process.argv.indexOf('--dist'),dir=path.resolve(i>=0?process.argv[i+1]:path.join(root,'experiments/turn-candidate-12/dist'));
  const info=JSON.parse(await fs.readFile(path.join(dir,'build-info.json'),'utf8'));assert.equal(info.shortId,build);
  const bytes=await fs.readFile(path.join(dir,'assets/motion/m1c/greeting/greeting-wave-left-v1.glb'));
  assert.equal(bytes.length,1566668);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06');
  console.log(JSON.stringify({checked:true,browserStarted:false,dist:dir,build,gestureBytes:bytes.length,plan},null,2));return;
 }
 const base=process.argv[2];if(!base||!/^https?:\/\/127\.0\.0\.1:/.test(base)||!/^[a-f0-9]{12}$/.test(build))throw Error('Require fixed loopback URL from run-fixed-check.cjs; QA_BUILD pins build');
 const {chromium}=require('../../prototype/node_modules/playwright');
 const out=await prepareOutput(build,'greeting-'+Date.now());await fs.writeFile(path.join(out,'plan.json'),JSON.stringify(plan,null,2));
 const browser=await chromium.launch({channel:'chrome',headless:true});const report={build,plan,cases:[],errors:[],visualReview:'pending; numeric checks do not accept appearance'};
 try{for(const config of configs){
  const caseDir=path.join(out,config.name);await fs.mkdir(caseDir,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:caseDir,size:{width:1440,height:1000}}});
  const page=await context.newPage(),video=page.video(),record={config,checks:[],inputs:[],keys:[],errors:[]};report.cases.push(record);
  page.on('pageerror',e=>record.errors.push(e.message));
  const mark=async phase=>{record.inputs.push({phase,wallTime:new Date().toISOString()});await page.evaluate(({build,name,phase})=>{let label=document.getElementById('greeting-qa-label');if(!label){label=document.createElement('div');label.id='greeting-qa-label';Object.assign(label.style,{position:'fixed',top:'0',left:'0',right:'0',zIndex:'99999',background:'#102e38',color:'white',font:'16px sans-serif',padding:'6px',pointerEvents:'none'});document.body.append(label);}label.textContent=`${build} | ${name} | ${phase}`;},{build,name:config.name,phase});};
  const check=(name,value,details)=>{record.checks.push({name,passed:!!value,details});assert(value,name);};
  const shot=async name=>{await page.screenshot({path:path.join(caseDir,name+'.png')});record.keys.push(name+'.png');};
  const task=async id=>page.evaluate(id=>__debug.tasks().get(id),id);
  const untilTask=async(id,timeout=30000)=>{await page.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout});return task(id);};
  const gestureTime=async t=>page.waitForFunction(t=>{const g=__debug.avatar().livePresentation.getState().greeting;return g.status==='playing'&&g.time>=t;},t,{timeout:15000});
  const greeting=async id=>{record.inputs.push({command:{type:'action',name:'greeting',requestId:id},wallTime:new Date().toISOString()});return page.evaluate(id=>__debug.command({type:'action',name:'greeting',requestId:id}),id);};
  const stable=async()=>page.waitForFunction(()=>__debug.game.scene.getScene('CharacterStudio').greetingReady(),null,{timeout:30000});
  try{
   const url=new URL(base);url.searchParams.set('body',config.body);await page.goto(url.href);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});record.initialGate=await verifyCandidate(page,expected(config.body));
   await mark('SETUP: paused reset / seat approach / prewarm, not 1x evidence');
   await page.evaluate(config=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(config.outfit);d.setDynamics(true);d.setCorrections('full');d.setPlaybackRate(1);d.setHelpers(false);
    const seat=d.snapshot().chair;a.root.position.set(...seat.approach);c.yaw=seat.yaw;a.root.rotation.y=seat.yaw;d.motion().reset();a.update(0,{action:'idle'});a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<120;i++)c.simulate(1/120);d.camera('close');d.view('front');d.advance(0);
    const samples=[];let running=true,last=-Infinity;window.__greetingQA={samples,stop:()=>{running=false;}};
    const sample=now=>{if(!running)return;if(now-last>=50){last=now;const state=a.livePresentation.getState();samples.push({wallMs:now,simulationTime:d.snapshot().simulationTime,mode:c.mode,paused:c.paused,greeting:state.greeting,active:d.tasks().active(),sit:d.motion().getMetrics().sitProgress,leftRaw:['leftUpperArm','leftLowerArm','leftHand','leftMiddleDistal'].map(name=>{const b=a.vrm.humanoid.getRawBoneNode(name);return{name,p:b?.getWorldPosition(a.root.position.clone()).toArray(),q:b?.getWorldQuaternion(a.root.quaternion.clone()).toArray()};})});}requestAnimationFrame(sample);};requestAnimationFrame(sample);
    d.setPaused(false);
   },config);
   await stable();await mark('1x standing front: complete + duplicate');
   const stand='stand-complete';check('standing admission running',(await greeting(stand)).task.state==='running');
   await gestureTime(.45);await shot('stand-front-045');
   const duplicate=await greeting(stand),implicit=await page.evaluate(()=>__debug.command({type:'action',name:'greeting'}));check('repeated identity and button do not restart',duplicate.duplicate&&implicit.duplicate);
   const micDuring=await page.evaluate(()=>__debug.command({type:'accessory',kind:'mic',value:true}));check('mic rejected during greeting',micDuring.applied===false,micDuring);
   await gestureTime(1.1);await shot('stand-front-110');check('standing actually completes',(await untilTask(stand)).state==='completed');
   await mark('1x standing side with explicit pause hold and cancellation');await page.evaluate(()=>__debug.view('side'));
   const cancel='stand-cancel';await greeting(cancel);await gestureTime(.8);
   const paused=await page.evaluate(()=>{__debug.setPaused(true);const a=__debug.avatar();return{g:a.livePresentation.getState().greeting,q:a.vrm.humanoid.getRawBoneNode('leftHand').quaternion.toArray()};});
   await mark('PAUSED .6s: pose/time must remain fixed');await page.waitForTimeout(600);await shot('standing-pause-side');
   const held=await page.evaluate(()=>({g:__debug.avatar().livePresentation.getState().greeting,q:__debug.avatar().vrm.humanoid.getRawBoneNode('leftHand').quaternion.toArray()}));check('paused pose/time identical',JSON.stringify(paused)===JSON.stringify(held));
   await page.evaluate(()=>__debug.setPaused(false));await mark('1x standing side: cancel / .2s fade / replay');
   await page.evaluate(id=>__debug.tasks().cancel(id,'qa-cancel'),cancel);await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().greeting.status==='cancelled');check('cancel terminal',(await task(cancel)).state==='cancelled');
   const replay='stand-replay';await stable();await greeting(replay);await gestureTime(1.1);await shot('stand-side-110');check('new request after cancel completes',(await untilTask(replay)).state==='completed');
   await mark('1x actual sit transition');const sit='sit';await page.evaluate(id=>__debug.command({type:'action',name:'sit',requestId:id}),sit);check('actual sit complete',(await untilTask(sit)).state==='completed');await stable();
   await mark('1x seated side: complete');const seated='seated-complete';await greeting(seated);await gestureTime(.45);await shot('sit-side-045');await gestureTime(1.1);await shot('sit-side-110');check('seated greeting complete',(await untilTask(seated)).state==='completed');
   await mark('1x seated front: cancellation and replay');await page.evaluate(()=>__debug.view('front'));const seatCancel='seated-cancel';await greeting(seatCancel);await gestureTime(.8);await page.evaluate(id=>__debug.tasks().cancel(id,'qa-seated-cancel'),seatCancel);await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().greeting.status==='cancelled');
   const seatedState=await page.evaluate(()=>({mode:__debug.game.scene.getScene('CharacterStudio').mode,sit:__debug.motion().getMetrics().sitProgress,lease:__debug.seatLeases.forSeat('room-chair-1')}));check('cancel preserves seated pose and occupied lease',seatedState.mode==='sit'&&seatedState.sit===1&&seatedState.lease?.state==='occupied',seatedState);
   await stable();const seatReplay='seated-replay';await greeting(seatReplay);await gestureTime(1.1);await shot('sit-front-110');check('seated replay completes',(await untilTask(seatReplay)).state==='completed');
   await mark('CONTRACT: held microphone rejects gesture (not approved combination)');
   const equipped=await page.evaluate(()=>__debug.command({type:'accessory',kind:'mic',value:true}));check('actual mic equip succeeded',equipped.applied,equipped);
   const refused=await greeting('mic-rejected');check('greeting with microphone fails/refuses',refused.admission==='rejected'||refused.task?.state==='failed',refused);await shot('mic-greeting-refused');await page.evaluate(()=>__debug.command({type:'accessory',kind:'mic',value:false}));await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().arm===null);
   if(config.name==='male-shorts'){
    await mark('SETUP: second female instance loading');await page.evaluate(()=>__debug.loadComparison('female'));await page.waitForFunction(()=>__debug.comparison().controller.greetingReady());await page.evaluate(()=>{__debug.view('free');__debug.camera('room');});
    await mark('1x independent primary + peer; cancel primary only');
    await page.evaluate(()=>{__debug.command({type:'action',name:'greeting',requestId:'primary-isolation'});__debug.comparison().command({type:'action',name:'greeting',requestId:'peer-isolation'});});
    await gestureTime(.7);await shot('dual-instance-playing');await page.evaluate(()=>__debug.tasks().cancel('primary-isolation','qa-isolation'));await page.waitForFunction(()=>__debug.comparison().tasks.get('peer-isolation')?.state==='completed',null,{timeout:20000});
    await shot('peer-complete-primary-cancelled');const isolation=await page.evaluate(()=>{const d=__debug,b=d.comparison(),r={primary:d.tasks().get('primary-isolation'),peer:b.tasks.get('peer-isolation'),primaryState:d.avatar().livePresentation.getState().greeting,peerState:b.avatar.livePresentation.getState().greeting,peerProfile:b.avatar.profile};d.removeComparison();r.removed=!b.avatar.root.parent;r.mainAttached=!!d.avatar().root.parent;return r;});
    check('primary cancellation leaves peer completion independent',isolation.primary.state==='cancelled'&&isolation.peer.state==='completed'&&isolation.primaryState.requestId!==isolation.peerState.requestId&&isolation.removed&&isolation.mainAttached,isolation);
   }
   record.history=await page.evaluate(()=>__debug.tasks().history());const counts={};for(const e of record.history)if(['completed','cancelled','failed'].includes(e.type))counts[e.task.requestId]=(counts[e.task.requestId]||0)+1;check('all task terminal events exactly once',Object.values(counts).every(n=>n===1),counts);
   record.finalGate=await verifyCandidate(page,expected(config.body));check('no page exceptions',record.errors.length===0,record.errors);
  }catch(error){record.failure=String(error);await shot('failure').catch(()=>{});throw error;}
  finally{
   record.samples=await page.evaluate(()=>{window.__greetingQA?.stop();return window.__greetingQA?.samples||[];}).catch(()=>[]);
   await context.close();await video.saveAs(path.join(caseDir,'greeting-review.webm'));record.video=path.join(config.name,'greeting-review.webm');
   await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
 }}catch(error){report.failure=String(error);await writeFailure(out,error,{build});throw error;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
