// Actual paused-pose and reset checks for the scoped hand-contact release trial.
const fs = require('node:fs/promises'), path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const [base, build, output] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base); await page.waitForFunction(() => __debug?.ready, null, {timeout:60000});
    const identity = await verifyCandidate(page, {build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
    const result = await page.evaluate(() => {
      const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),rig=d.motion();
      d.reset();d.setPaused(true);d.setOutfit(1);d.setCorrections('full');d.setDynamics(true);
      const sample=()=>{
        a.root.updateMatrixWorld(true);
        return {time:c.simulationTime, mode:c.mode, phase:rig.getMetrics().phase, action:rig.getMetrics().action, actionTime:rig.getMetrics().actionTime, danceClock:rig.getMetrics().dance.time, sitProgress:rig.getMetrics().sitProgress,
          joints:['leftLowerArm','leftHand','rightLowerArm','rightHand'].map(name=>{
            const b=a.vrm.humanoid.getRawBoneNode(name);
            return {name,p:b.getWorldPosition(a.root.position.clone()).toArray(),q:b.getWorldQuaternion(b.quaternion.clone()).toArray()};
          }), contacts:JSON.parse(JSON.stringify(rig.getMetrics().handContacts))};
      };
      const diff=(a,b)=>Math.max(...a.joints.map((j,i)=>Math.hypot(...j.p.map((v,k)=>v-b.joints[i].p[k]))));
      const refreshChecks=[], taskChecks=[]; const checkTask=(name,passed,details)=>taskChecks.push({name,passed,details});
      const sameClocks=(a,b)=>a.action===b.action&&a.actionTime===b.actionTime&&a.danceClock===b.danceClock&&a.time===b.time&&a.phase===b.phase;
      const clearedHands=s=>s.contacts.length===2&&['left','right'].every(side=>s.contacts.some(x=>x.side===side&&x.contactReleaseSeed===0));
      function refreshCheck(stage) {
        const before=sample(); d.setCorrections('full'); const first=sample(); d.setCorrections('full'); const second=sample();
        refreshChecks.push({stage,before,first,second,firstDelta:diff(before,first),repeatDelta:diff(first,second),timeUnchanged:before.time===second.time,phaseUnchanged:before.phase===second.phase,allClocksUnchanged:sameClocks(before,first)&&sameClocks(first,second)});
      }
      a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);rig.reset();a.update(0);c.setSpeed(2.4);
      d.request({requestId:'release-state-run',kind:'walk',payload:{x:3.8,z:2.2},timeoutSeconds:20});
      for(let i=0;i<1500;i++){c.simulate(1/120);if(d.tasks().get('release-state-run')?.state==='completed')break;}
      if(d.tasks().get('release-state-run')?.state!=='completed')throw Error('Original run did not complete');
      const sitAdmission=d.request({requestId:'boundary-sit',kind:'sit'});checkTask('sit admitted',sitAdmission.admission==='accepted',sitAdmission);let checked=false,seated=false;
      for(let i=0;i<3600;i++){
        c.simulate(1/120);
        if(!checked&&c.simulationTime>4.70){refreshCheck('approach-contact');checked=true;}
        if(c.mode==='sit'&&rig.getMetrics().sitProgress>.999){seated=true;break;}
      }
      if(!seated)throw Error('Sit incomplete');checkTask('sit completed only when seated',d.tasks().get('boundary-sit')?.state==='completed',d.tasks().get('boundary-sit'));refreshCheck('seated');
      const outfitBefore=sample();d.setOutfit(0);d.setOutfit(1);d.setCorrections('full');const outfitAfter=sample();
      d.setCorrections('raw');d.setCorrections('full');const reenabled=sample();
      const cleanAfterOff=reenabled.contacts.every(x=>(x.contactReleaseSeed??0)===0);
      const standingBefore=sample();const standAdmission=d.request({requestId:'boundary-stand',kind:'stand'});
      checkTask('stand admitted running without early pose-clock mutation',standAdmission.admission==='accepted'&&d.tasks().get('boundary-stand')?.state==='running'&&sample().action===standingBefore.action&&sample().actionTime===standingBefore.actionTime,{standAdmission,before:standingBefore,after:sample()});
      const standDuplicate=d.request({requestId:'boundary-stand',kind:'stand'});checkTask('stand duplicate leaves execution intact',standDuplicate.duplicate===true&&d.tasks().get('boundary-stand')?.state==='running',standDuplicate);
      c.simulate(1/120);checkTask('first tick consumes stand but not complete',rig.getMetrics().action==='stand'&&d.tasks().get('boundary-stand')?.state==='running',sample());
      const riseEnd=[];
      for(let i=0;i<1200;i++){c.simulate(1/120);if(rig.getMetrics().sitProgress<.04)riseEnd.push(sample());if(c.mode==='idle')break;}
      checkTask('stand completes at actual rise endpoint',d.tasks().get('boundary-stand')?.state==='completed'&&rig.getMetrics().transitionComplete,d.tasks().get('boundary-stand'));refreshCheck('rise-end');
      const riseOffBefore=sample();d.setCorrections('raw');d.setCorrections('full');const riseOffAfter=sample();
      const riseOffDelta=diff(riseOffBefore,riseOffAfter);
      d.setCorrections('raw');d.setCorrections('full');const riseColdRepeat=sample();
      const riseColdRepeatDelta=diff(riseOffAfter,riseColdRepeat);
      c.simulate(1/120);const idleNextTick=sample();
      d.request({requestId:'boundary-safe-walk',kind:'walk',payload:{x:0,z:1.0}});for(let i=0;i<1800&&d.tasks().get('boundary-safe-walk')?.state!=='completed';i++)c.simulate(1/120);checkTask('walk following stand completes',d.tasks().get('boundary-safe-walk')?.state==='completed',d.tasks().get('boundary-safe-walk'));
      const once=rig.getDances().find(x=>x.playback==='once-then-idle');
      if(!once)throw Error('No once dance fixture');rig.setDance(once.id);const danceBefore=sample();const danceAdmission=d.request({requestId:'boundary-dance',kind:'dance'});checkTask('dance admitted without resetting evaluated pose clock',danceAdmission.admission==='accepted'&&sample().action===danceBefore.action&&sample().actionTime===danceBefore.actionTime,danceAdmission);c.simulate(1/120);checkTask('dance first tick starts and remains running',rig.getMetrics().action==='dance'&&d.tasks().get('boundary-dance')?.state==='running',sample());
      let danceEnded=false;for(let i=0;i<4000;i++){c.simulate(1/120);if(c.mode==='idle'){danceEnded=true;break;}}
      if(!danceEnded)throw Error('Dance did not end');refreshCheck('dance-end');
      const danceOffBefore=sample();d.setCorrections('raw');d.setCorrections('full');const danceOffAfter=sample();
      const danceOffDelta=diff(danceOffBefore,danceOffAfter);
      d.setCorrections('raw');d.setCorrections('full');const danceColdRepeat=sample();
      const danceColdRepeatDelta=diff(danceOffAfter,danceColdRepeat);
      const coldResetChecks=[[riseOffBefore,riseOffAfter,riseColdRepeat],[danceOffBefore,danceOffAfter,danceColdRepeat]].every(([before,after,repeat])=>sameClocks(before,after)&&sameClocks(after,repeat)&&clearedHands(after)&&clearedHands(repeat));
      c.simulate(1/120);const danceNextTick=sample();for(let i=0;i<400&&d.tasks().get('boundary-dance')?.state!=='completed';i++)c.simulate(1/120);checkTask('once dance completes after fade exactly once',d.tasks().get('boundary-dance')?.state==='completed'&&d.tasks().history().filter(x=>x.type==='completed'&&x.task.requestId==='boundary-dance').length===1,d.tasks().get('boundary-dance'));
      d.reset();const reset=sample();
      return {taskChecks,refreshChecks,riseOffDelta,danceOffDelta,riseColdRepeatDelta,danceColdRepeatDelta,coldResetChecks,idleNextTick,danceNextTick,cleanAfterOff,outfitBefore,outfitAfter,reenabled,riseEnd,reset,
        resetSeedCleared:reset.contacts.every(x=>(x.contactReleaseSeed??0)===0),
        scope:'One original female skirt: exact second-path contact, seated and rise endpoint normal-to-refresh0-to-refresh0; correction off/on, same-tick outfit roundtrip and explicit reset. No general contact/visual/target-PC claim.'};
    });
    await fs.mkdir(output,{recursive:true});
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify({build,identity,errors,...result},null,2));
    // Ordinary pause/refresh must reproduce the exact warm pose. Explicitly
    // disabling corrections discards contact history: re-enabling must instead
    // reproduce a deterministic cold solve without changing animation clocks.
    // Keep warm-to-cold displacement in the report; do not raise its old gate.
    const passed=result.taskChecks.every(x=>x.passed)&&!errors.length&&result.cleanAfterOff&&result.resetSeedCleared&&result.refreshChecks.every(x=>x.firstDelta<1e-6&&x.repeatDelta<1e-6&&x.allClocksUnchanged)&&result.coldResetChecks&&Number.isFinite(result.riseOffDelta)&&Number.isFinite(result.danceOffDelta)&&result.riseColdRepeatDelta<1e-6&&result.danceColdRepeatDelta<1e-6;
    console.log(JSON.stringify({passed,taskChecks:result.taskChecks.map(x=>({name:x.name,passed:x.passed})),refresh:result.refreshChecks.map(x=>({stage:x.stage,firstDelta:x.firstDelta,repeatDelta:x.repeatDelta})),riseOffDelta:result.riseOffDelta,danceOffDelta:result.danceOffDelta,cleanAfterOff:result.cleanAfterOff,resetSeedCleared:result.resetSeedCleared}));
    if(!passed)throw Error('State check failed; evidence preserved');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
