// Bounded actual per-instance handRelease test. Uses only existing public debug APIs.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2);
const expected={build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};
(async()=>{
 await fs.mkdir(output,{recursive:true});
 try{await fs.access(path.join(output,'report.json'));throw Error('Refuse overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,expected);
  const result=await page.evaluate(async()=>{
   const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),m=d.motion(),V=a.root.position.constructor;
   const dt=1/120, checks=[],events=[];let setupSerial=0;
   const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['fitElapsedMs','timing'].includes(k)).map(([k,x])=>[k,clean(x)])):v;
   const sample=(actor=a,rig=m,controller=c)=>{actor.root.updateMatrixWorld(true);const v=rig.getMetrics();return {time:controller.simulationTime,mode:controller.mode,action:v.action,actionTime:v.actionTime,phase:v.phase,jogPhase:v.jogPhase,danceClock:v.dance.time,root:actor.root.position.toArray(),outfit:actor.getOutfitInfo().index,contacts:clean(v.handContacts),wrists:['left','right'].map(side=>{const b=actor.vrm.humanoid.getRawBoneNode(side+'Hand');return {side,p:b.getWorldPosition(new V()).toArray(),q:b.getWorldQuaternion(b.quaternion.clone()).toArray()}})}};
   const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y),maxWrist=(x,y)=>Math.max(...x.wrists.map((p,i)=>Math.hypot(...p.p.map((v,k)=>v-y.wrists[i].p[k]))));
   const check=(name,passed,details={})=>checks.push({name,passed,details});
   function prepare(){
    d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(1);d.setDynamics(false);d.setCorrections('full');
    a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);m.reset();a.update(0);c.setSpeed(2.4);
    const requestId='state-isolation-run-'+(++setupSerial),admission=d.request({requestId,kind:'walk',payload:{x:3.8,z:2.2},timeoutSeconds:20});
    for(let i=0;i<1500&&d.tasks().get(requestId)?.state!=='completed';i++)c.simulate(dt);
    if(d.tasks().get(requestId)?.state!=='completed')throw Error('Setup run incomplete');c.action('sit');
    while(c.simulationTime<4.7-1e-8)c.simulate(dt);
    const before=sample();if(!before.contacts.some(h=>h.garmentProjection>.001))throw Error('Setup has no actual hand correction');
    d.setOutfit(0);c.simulate(dt);const pantsFirst=sample();c.simulate(dt);const pantsSecond=sample();
    d.setOutfit(1);c.simulate(dt);const backToSkirt=sample();
    d.setCorrections('raw');d.setCorrections('full');const cold=sample();
    // Re-establish actual release history after the explicit cold-solve check.
    c.simulate(dt);c.simulate(dt);const warmed=sample();
    if(!warmed.contacts.some(h=>h.contactReleaseSeed>.001))throw Error('Primary fixture lacks actual nonzero release history');
    return {admission,before,pantsFirst,pantsSecond,backToSkirt,cold,warmed};
   }
   const roundtrip=prepare();events.push({stage:'cross-frame-roundtrip',...roundtrip});
   check('pants spans two actual ticks with no contact surface',roundtrip.pantsFirst.outfit===0&&roundtrip.pantsSecond.outfit===0&&roundtrip.pantsFirst.time>roundtrip.before.time&&roundtrip.pantsSecond.time>roundtrip.pantsFirst.time&&roundtrip.pantsFirst.contacts.length===0&&roundtrip.pantsSecond.contacts.length===0);
   check('return skirt starts cleared history on new actual tick',roundtrip.backToSkirt.time>roundtrip.pantsSecond.time&&roundtrip.backToSkirt.outfit===1&&roundtrip.backToSkirt.contacts.length===2&&roundtrip.backToSkirt.contacts.every(h=>h.contactReleaseSeed===0));
   check('returned skirt target matches same-pose fresh cold solve',maxWrist(roundtrip.backToSkirt,roundtrip.cold)<1e-6,{wristDelta:maxWrist(roundtrip.backToSkirt,roundtrip.cold),oldWorldTargetDelta:maxWrist(roundtrip.before,roundtrip.backToSkirt)});
   c.simulate(dt);const expectedNextTick=sample();
   const repeat=prepare();check('same setup replay exact before peer',same(roundtrip.warmed,repeat.warmed),{wristDelta:maxWrist(roundtrip.warmed,repeat.warmed)});
   const frozenA=sample(),peer=await d.loadComparison('female');peer.avatar.setDynamics(false);
   const peerProfile=peer.avatar.getAssetProfile();check('second actual female uses same exact body with distinct instance',peerProfile.id===a.getAssetProfile().id&&peerProfile.sha256===a.getAssetProfile().sha256&&peer.avatar!==a&&peer.motion!==m&&peer.avatar.vrm!==a.vrm);
   check('peer load leaves A evaluated hand/history unchanged',same(frozenA,sample()));
   peer.command({type:'outfit',value:1});const dance=peer.motion.getDances().find(x=>x.playback==='once-then-idle');peer.motion.setDance(dance.id);peer.action('dance');
   let peerActive=null;
   for(let i=0;i<240;i++){peer.update(dt);const s=sample(peer.avatar,peer.motion,peer.controller);if(s.contacts.some(h=>h.garmentProjection>.001)){peerActive=s;break;}}
   check('B actually obtains independent nonzero hand correction',!!peerActive);
   events.push({stage:'peer-active',peer:peerActive,primary:sample()});check('B independent action ticks preserve frozen A',same(frozenA,sample()));
   peer.command({type:'outfit',value:0});peer.update(dt);const peerPants=sample(peer.avatar,peer.motion,peer.controller);
   check('B pants actual tick clears own contacts only',peerPants.contacts.length===0&&same(frozenA,sample()));
   peer.command({type:'outfit',value:1});peer.action('idle');peer.update(dt);const peerReturned=sample(peer.avatar,peer.motion,peer.controller);
   check('B return and action change preserve A hand/history',same(frozenA,sample()));
   events.push({stage:'peer-cross-frame-changes',peerPants,peerReturned,primary:sample()});
   c.simulate(dt);const withPeerNextTick=sample();
   check('A next actual tick matches no-peer control',same(expectedNextTick,withPeerNextTick),{wristDelta:maxWrist(expectedNextTick,withPeerNextTick),expected:expectedNextTick,actual:withPeerNextTick});
   d.removeComparison();check('comparison disposed',d.comparison()===null);
   return {checks,events,peerIdentity:{id:peerProfile.id,sha256:peerProfile.sha256},scope:'One original female A and independently parsed female B; dynamics OFF for deterministic hand-state isolation. Existing public metrics/raw wrists only, no private history reads or product debug. Cross-frame outfit and next-tick control, not resource lifetime/fullskin/visual acceptance.'};
  });
  const finalIdentity=await verifyCandidate(page,expected);const passed=!errors.length&&result.checks.every(x=>x.passed);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({build,identity,finalIdentity,errors,passed,...result},null,2));
  console.log(JSON.stringify({passed,checks:result.checks.map(x=>({name:x.name,passed:x.passed})),errors}));if(!passed)throw Error('State isolation failed; evidence retained');
 }catch(e){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(e),stack:e.stack,errors},null,2));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
