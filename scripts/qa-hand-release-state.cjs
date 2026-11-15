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
        return {time:c.simulationTime, mode:c.mode, phase:rig.getMetrics().phase,
          joints:['leftLowerArm','leftHand','rightLowerArm','rightHand'].map(name=>{
            const b=a.vrm.humanoid.getRawBoneNode(name);
            return {name,p:b.getWorldPosition(a.root.position.clone()).toArray(),q:b.getWorldQuaternion(b.quaternion.clone()).toArray()};
          }), contacts:JSON.parse(JSON.stringify(rig.getMetrics().handContacts))};
      };
      const diff=(a,b)=>Math.max(...a.joints.map((j,i)=>Math.hypot(...j.p.map((v,k)=>v-b.joints[i].p[k]))));
      const refreshChecks=[];
      function refreshCheck(stage) {
        const before=sample(); d.setCorrections('full'); const first=sample(); d.setCorrections('full'); const second=sample();
        refreshChecks.push({stage,before,first,second,firstDelta:diff(before,first),repeatDelta:diff(first,second),timeUnchanged:before.time===second.time,phaseUnchanged:before.phase===second.phase});
      }
      a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);rig.reset();a.update(0);c.setSpeed(2.4);
      d.request({requestId:'release-state-run',kind:'walk',payload:{x:3.8,z:2.2},timeoutSeconds:20});
      for(let i=0;i<1500;i++){c.simulate(1/120);if(d.tasks().get('release-state-run')?.state==='completed')break;}
      if(d.tasks().get('release-state-run')?.state!=='completed')throw Error('Original run did not complete');
      c.action('sit');let checked=false,seated=false;
      for(let i=0;i<3600;i++){
        c.simulate(1/120);
        if(!checked&&c.simulationTime>4.70){refreshCheck('approach-contact');checked=true;}
        if(c.mode==='sit'&&rig.getMetrics().sitProgress>.999){seated=true;break;}
      }
      if(!seated)throw Error('Sit incomplete');refreshCheck('seated');
      const outfitBefore=sample();d.setOutfit(0);d.setOutfit(1);d.setCorrections('full');const outfitAfter=sample();
      d.setCorrections('raw');d.setCorrections('full');const reenabled=sample();
      const cleanAfterOff=reenabled.contacts.every(x=>(x.contactReleaseSeed??0)===0);
      c.action('stand');const riseEnd=[];
      for(let i=0;i<1200;i++){c.simulate(1/120);if(rig.getMetrics().sitProgress<.04)riseEnd.push(sample());if(c.mode==='idle')break;}
      refreshCheck('rise-end');d.reset();const reset=sample();
      return {refreshChecks,cleanAfterOff,outfitBefore,outfitAfter,reenabled,riseEnd,reset,
        resetSeedCleared:reset.contacts.every(x=>(x.contactReleaseSeed??0)===0),
        scope:'One original female skirt: exact second-path contact, seated and rise endpoint normal-to-refresh0-to-refresh0; correction off/on, same-tick outfit roundtrip and explicit reset. No general contact/visual/target-PC claim.'};
    });
    await fs.mkdir(output,{recursive:true});
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify({build,identity,errors,...result},null,2));
    const passed=!errors.length&&result.cleanAfterOff&&result.resetSeedCleared&&result.refreshChecks.every(x=>x.firstDelta<1e-6&&x.repeatDelta<1e-6&&x.timeUnchanged&&x.phaseUnchanged);
    console.log(JSON.stringify({passed,refresh:result.refreshChecks.map(x=>({stage:x.stage,firstDelta:x.firstDelta,repeatDelta:x.repeatDelta})),cleanAfterOff:result.cleanAfterOff,resetSeedCleared:result.resetSeedCleared}));
    if(!passed)throw Error('State check failed; evidence preserved');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
