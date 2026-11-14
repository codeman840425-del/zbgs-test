const {chromium}=require('../prototype/node_modules/playwright');const fs=require('node:fs/promises');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage();try{
 await p.goto(process.argv[2]||'http://127.0.0.1:5183');await p.waitForFunction(()=>window.__debug?.ready);
 const r=await p.evaluate(()=>{const d=window.__debug,a=d.avatar(),m=d.motion();d.game.scene.getScene('CharacterStudio').paused=true;const trials=[];
 for(const speed of [.45,.85,1.3]){a.root.position.set(0,0,0);a.root.rotation.set(0,0,0);m.reset();
 const step=(moving)=>{if(moving)a.root.position.z+=speed/120;m.update(1/120,{action:moving?'walk':'idle',moving,distanceDelta:moving?speed/120:0});a.vrm.update(1/120);a.root.updateWorldMatrix(true,true);return m.getMetrics();};
 for(let i=0;i<180;i++)step(true);const before=m.getMetrics(),frames=[];for(let i=0;i<120;i++)frames.push(step(false));
 const feet=['left','right'].map((side,i)=>{const end=frames.at(-1).feet[i].actual,initial=before.feet[i].actual,peak=Math.max(...frames.slice(0,65).map(x=>x.feet[i].actual[1]));return {side,gatherDistance:Math.hypot(...initial.map((v,j)=>v-end[j])),peakAboveRest:peak-end[1],finalContact:frames.at(-1).feet[i].contact};});trials.push({speed,feet,frames});}
 return {trials,passed:trials.every(t=>t.feet.every(f=>f.finalContact&&(f.gatherDistance<.008||f.peakAboveRest>.012)))};});
 await fs.writeFile('output/playwright/stop-step-trace.json',JSON.stringify(r,null,2));console.log(JSON.stringify({passed:r.passed,trials:r.trials.map(({frames,...x})=>x)},null,2));if(!r.passed)process.exitCode=1;
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
