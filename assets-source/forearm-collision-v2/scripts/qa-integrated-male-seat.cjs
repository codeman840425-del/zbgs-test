// Bounded affected-path check. Reuses existing semantic geometry probes and gates.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(root,'prototype/node_modules/playwright'));
const {expectations,verifyCandidate}=require(path.join(root,'scripts/qa-m1-common.cjs'));
(async()=>{
 const expected=expectations(),base=process.argv[2];if(expected.assetId!=='beta-base-male-m1b')throw Error('Explicit male identity required');
 const out=path.join(root,'output/playwright/forearm-'+expected.build,'male-seat');await fs.mkdir(out,{recursive:true});
 for(const name of ['pants.json','shorts.json','summary.json'])try{await fs.access(path.join(out,name));throw Error('Refuse old evidence');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[],results=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(base+'?body=male');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});const initial=await verifyCandidate(page,expected);
  await page.evaluate(async code=>(await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})))).installM1Probes(),await fs.readFile(path.join(root,'scripts/qa-m1-probes.mjs'),'utf8'));
  for(const [name,outfit] of [['pants',0],['shorts',2]]){
   const data=await page.evaluate(({name,outfit})=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa;d.reset();d.setPaused(true);d.setOutfit(outfit);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');c.cameraPreset('close',true);
    for(let i=0;i<120;i++)c.simulate(1/120);
    const capture=(phase,tick)=>{const s=d.snapshot();if(s.outfit!==outfit)throw Error('Outfit changed');return {phase,tick,mode:s.mode,sitProgress:s.motion.sitProgress,position:s.position,outfit:s.outfit,handContacts:s.motion.handContacts,feet:q.feet(),seat:q.seat()};};
    const r={name,outfit,frames:[capture('standing',0)],initialEquipment:d.avatar().getOutfitInfo(),forearmProfileLoaded:Boolean(d.avatar().profile.motion.forearmCollision),seatHandRadii:d.avatar().profile.motion.seatHandRadii??null};
    c.action('sit');let i=0;for(;i<3600;i++){c.simulate(1/120);if(c.mode==='sit'&&i%4===0)r.frames.push(capture('sit-enter',i));if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}
    r.seatTimedOut=i===3600;r.seatTicks=i;for(let j=0;j<120;j++)c.simulate(1/120);r.seated=capture('seated',i+120);d.view('side');d.advance(0);window.__maleSeat=r;return {seatTimedOut:r.seatTimedOut};
   },{name,outfit});
   await page.screenshot({path:path.join(out,name+'-seated.png')});
   const record=await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa,r=__maleSeat;c.action('stand');let i=0;for(;i<1800&&c.mode!=='idle';i++){c.simulate(1/120);if(i%4===0){const s=d.snapshot();if(s.outfit!==r.outfit)throw Error('Outfit changed');r.frames.push({phase:'rise',tick:i,mode:s.mode,sitProgress:s.motion.sitProgress,position:s.position,outfit:s.outfit,handContacts:s.motion.handContacts,feet:q.feet(),seat:q.seat()});}}for(let j=0;j<120;j++)c.simulate(1/120);r.standing={completed:c.mode==='idle',state:d.snapshot(),feet:q.feet(),seat:q.seat()};r.finalEquipment=d.avatar().getOutfitInfo();return r;});
   await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(record));
   const samples=[...record.frames,record.seated,record.standing],collisions=[];for(const sample of samples)for(const m of sample.seat.meshes){if(m.nonFiniteVertices)throw Error('Nonfinite body geometry');for(const [collider,h] of Object.entries(m.collisions))if(h.vertices)collisions.push({phase:sample.phase,role:m.role,mesh:m.mesh,collider,vertices:h.vertices,depth:h.maxInteriorDepth});}
   const result={name,outfit,timedOut:data.seatTimedOut,completed:record.standing.completed,forearmProfileLoaded:record.forearmProfileLoaded,seatHandRadii:record.seatHandRadii,maxHandContacts:Math.max(...record.frames.map(f=>f.handContacts.length)),collisionSamples:collisions,seatedMeshes:record.seated.seat.meshes,feet:record.seated.feet};results.push(result);console.log(name,'seated',!data.seatTimedOut,'stand',record.standing.completed,'contacts',collisions.length);
  }
  const finalIdentity=await verifyCandidate(page,expected),report={build:expected.build,initial,finalIdentity,errors,results,limitations:['Default chair only, actual indexed visible skinned vertices/local boxes, not swept/triangle proof','120Hz simulated motion; seat/feet geometry30Hz, no performance or normal-speed acceptance','Male profile loads but seatHandRadii absent: calibrated fit layer expected to early-return; no inherited female clearance claim']};
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(report,null,2));if(errors.length||results.some(r=>r.timedOut||!r.completed||r.maxHandContacts||r.collisionSamples.length))throw Error('Male affected-path gate failed; evidence saved');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
