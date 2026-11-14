const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:5183');await page.waitForFunction(()=>window.__debug?.ready);
  const report=await page.evaluate(()=>{
   const d=window.__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),m=d.motion();c.paused=true;
   const advance=(dt,action)=>{m.update(dt,{action,moving:false,distanceDelta:0});a.vrm.update(dt);a.root.updateWorldMatrix(true,true);return m.getMetrics();};
   const trials=[];
   for(const elapsed of [.15,.45,.8,1.2]){
    m.reset();advance(0,'sit');for(let t=0;t<elapsed;t+=1/120)advance(1/120,'sit');
    const before=m.getMetrics();m.setAction('stand');const switched=advance(0,'stand');
    let maxHipStep=0,previous=switched.hipWorld;
    for(let i=0;i<240;i++){const next=advance(1/120,'stand');maxHipStep=Math.max(maxHipStep,Math.hypot(...next.hipWorld.map((v,j)=>v-previous[j])));previous=next.hipWorld;}
    trials.push({elapsed,sitProgressBefore:before.sitProgress,sitProgressAfter:switched.sitProgress,hipJump:Math.hypot(...switched.hipWorld.map((v,j)=>v-before.hipWorld[j])),maxHipStep,complete:m.getMetrics().transitionComplete});
   }
   m.reset();advance(.02,'walk');const before=m.getMetrics();for(const flags of [{footIK:false,pelvis:false},{footIK:true,pelvis:false},{footIK:false,pelvis:true},{footIK:true,pelvis:true}])m.setCorrections(flags);const after=m.getMetrics();
   return {trials,diagnosticRefresh:{phaseDelta:after.phase-before.phase,distanceDelta:after.distance-before.distance,timeDelta:after.actionTime-before.actionTime},passed:trials.every(t=>Math.abs(t.sitProgressBefore-t.sitProgressAfter)<1e-6&&t.hipJump<.001&&t.complete)&&before.phase===after.phase&&before.distance===after.distance&&before.actionTime===after.actionTime};
  });
  await fs.writeFile('output/playwright/motion-interruption.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
