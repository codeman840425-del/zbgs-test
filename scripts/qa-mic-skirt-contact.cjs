// Deterministic original-female skirt/microphone layer interaction. No product edits.
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {chromium}=require('../prototype/node_modules/playwright');const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2);
(async()=>{
 await fs.mkdir(output,{recursive:true});try{await fs.access(path.join(output,'report.json'));throw Error('Refuse overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
 const anchors=JSON.parse(await fs.readFile('evidence/mic-mouth-target/source-anchors.json','utf8')),source=anchors.bodies.find(x=>x.body==='female'),gripBytes=await fs.readFile('prototype/public/assets/m1c/grips/female-source-grip-v1.json'),grip=JSON.parse(gripBytes),gripSHA=crypto.createHash('sha256').update(gripBytes).digest('hex');
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const expected={build,assetId:'beta-base-female-m1',sha256:source.bodySha256},identity=await verifyCandidate(page,expected);
  const result=await page.evaluate(async({source,mic,grip,gripSHA})=>{
   const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),m=d.motion(),V=a.root.position.constructor,Q=a.root.quaternion.constructor,live=a.livePresentation;
   d.reset();d.setPaused(true);d.setDynamics(true);d.setCorrections('full');d.setBodyMode('dressed');d.setOutfit(1);d.setHelpers(false);c.cameraPreset('room',true);
   a.root.position.set(-2.2,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);m.reset();a.update(0);live.setSpeaking(false);
   const raw=n=>a.vrm.humanoid.getRawBoneNode(n),wp=b=>b.getWorldPosition(new V());
   const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['fitElapsedMs','timing'].includes(k)).map(([k,x])=>[k,clean(x)])):v;
   let preLive=null,stage='initial',stepIndex=0;const frames=[],events=[],originalUpdate=m.update;
   m.update=function(...args){const value=originalUpdate.apply(this,args);preLive=['left','right'].map(side=>({side,p:a.vrm.humanoid.getNormalizedBoneNode(side+'Hand').getWorldPosition(new V()).toArray()}));return value};
   function sample(stageTick){
    a.root.updateMatrixWorld(true);const metrics=m.getMetrics(),state=live.getState(),hand=raw('rightHand'),wrist=wp(hand),elbow=wp(raw('rightLowerArm')),knuckle=wp(raw('rightMiddleProximal')),forearm=wrist.clone().sub(elbow).normalize(),palm=knuckle.sub(wrist).normalize(),object=d.scene.getObjectByName('LiveAccessory:mic'),mouth=raw('head').localToWorld(new V(...source.mouthRawHeadLocal));let micData=null;
    if(object){const tip=object.localToWorld(new V(...mic.grilleFrontPoleLocal)),shaft=new V(0,1,0).transformDirection(object.matrixWorld),origin=object.getWorldPosition(new V()),expectedOrigin=hand.localToWorld(new V(...grip.micRawHandLocal.position)),expectedQ=hand.getWorldQuaternion(new Q()).multiply(new Q(...grip.micRawHandLocal.quaternion));micData={tip:tip.toArray(),mouth:mouth.toArray(),mouthDistance:tip.distanceTo(mouth),aimDegrees:Math.acos(Math.max(-1,Math.min(1,shaft.dot(mouth.clone().sub(tip).normalize()))))*180/Math.PI,gripOriginError:origin.distanceTo(expectedOrigin),gripAngularError:object.getWorldQuaternion(new Q()).normalize().angleTo(expectedQ.clone().normalize()),gripQuaternionNorms:{actual:object.getWorldQuaternion(new Q()).length(),expected:expectedQ.length()},eyes:['leftEye','rightEye'].map(name=>{const p=wp(raw(name));return{name,tipDistance:p.distanceTo(tip),tipBelowEye:p.y-tip.y}})};}
    return {stepIndex,stage,stageTick,time:c.simulationTime,mode:c.mode,action:metrics.action,phase:metrics.phase,jogPhase:metrics.jogPhase,speed:c.actualSpeed,runMix:metrics.runMix,root:a.root.position.toArray(),outfit:a.getOutfitInfo().index,preLive,wrists:['left','right'].map(side=>{const b=raw(side+'Hand');return{side,p:wp(b).toArray(),q:b.getWorldQuaternion(new Q()).toArray()}}),wristBendDegrees:Math.acos(Math.max(-1,Math.min(1,forearm.dot(palm))))*180/Math.PI,handContacts:clean(metrics.handContacts),mic:micData,live:clean(state)};
   }
   function step(stageTick){c.simulate(1/120);stepIndex++;frames.push(sample(stageTick))}
   function ticks(name,count){stage=name;for(let i=1;i<=count;i++)step(i)}
   try{
    events.push({stage:'before-equip',sample:sample(0)});const equipped=await live.setAccessory('mic',true);events.push({stage:'equip-result',equipped});
    const loaded=live.getState();if(!loaded.accessories.mic.loaded||loaded.accessories.mic.sha256!==grip.compatibleAccessorySha256||loaded.fit.gripProfile?.sha256!==gripSHA)throw Error('Actual microphone/grip source pin mismatch');
    ticks('equip-carry',120);live.setSpeaking(true);ticks('standing-talk',120);
    c.setSpeed(2.4);const requestId='mic-skirt-run',admission=d.request({requestId,kind:'walk',payload:{x:2.2,z:2.2},timeoutSeconds:20});events.push({stage:'run-admission',admission});stage='run-carry';
    for(let i=1;i<=1500;i++){step(i);const task=d.tasks().get(requestId);if(['completed','failed','cancelled'].includes(task?.state))break;}
    const runTask=d.tasks().get(requestId);events.push({stage:'run-end',task:runTask});if(runTask?.state!=='completed')throw Error('Actual run did not complete');
    ticks('stopped-talk',120);events.push({stage:'before-unequip',sample:sample(0)});
    const removed=await live.setAccessory('mic',false);live.setSpeaking(false);events.push({stage:'unequip-result',removed,sample:sample(0)});ticks('unequip-recover',120);ticks('settled-no-mic',30);
    return {frames,events,final:sample(30),tasks:d.tasks().history(),outfit:a.getOutfitInfo(),sourcePins:{body:source.bodySha256,mic:grip.compatibleAccessorySha256,grip:gripSHA},scope:'Fixed 1/120 steps, original female outfit1 own skirt, full corrections/dynamicsON. Final raw wrists/mouth/rigid grip sampled after simulate/live/equipment. preLive normalized wrists sampled by read-only wrapper immediately after motion update. No final fullskin collision or normal-speed visual/performance claim.'};
   }finally{m.update=originalUpdate}
  },{source,mic:anchors.microphone,grip,gripSHA});
  const finalIdentity=await verifyCandidate(page,expected);await fs.writeFile(path.join(output,'trace.json.gz'),zlib.gzipSync(JSON.stringify({build,identity,finalIdentity,errors,...result}),{level:1}));
  const stageStats={};for(const f of result.frames){const s=stageStats[f.stage]??={frames:0,firstTime:f.time,lastTime:f.time,gripOriginMax:0,gripAngleMax:0,handProjectionMax:0,rightPreLiveToRawMax:0};s.frames++;s.lastTime=f.time;if(f.mic){s.gripOriginMax=Math.max(s.gripOriginMax,f.mic.gripOriginError);s.gripAngleMax=Math.max(s.gripAngleMax,f.mic.gripAngularError)}for(const h of f.handContacts)s.handProjectionMax=Math.max(s.handProjectionMax,h.garmentProjection??0);if(f.preLive)s.rightPreLiveToRawMax=Math.max(s.rightPreLiveToRawMax,Math.hypot(...f.preLive[1].p.map((v,k)=>v-f.wrists[1].p[k])))}
  const passed=!errors.length&&result.frames.every(f=>f.outfit===1&&(!f.mic||(f.mic.gripOriginError<1e-6&&f.mic.gripAngularError<1e-6)))&&!result.final.live.accessories.mic.loaded&&result.final.live.arm===null;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({build,identity,finalIdentity,errors,passed,stages:stageStats,events:result.events,final:result.final,sourcePins:result.sourcePins,scope:result.scope},null,2));console.log(JSON.stringify({build,passed,stages:stageStats}));if(!passed)throw Error('Microphone skirt diagnostic gate failed; evidence retained');
 }catch(e){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(e),stack:e.stack,errors},null,2));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
