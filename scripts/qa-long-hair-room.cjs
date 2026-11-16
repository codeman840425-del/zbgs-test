const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
const expectedHairSHA=process.env.EXPECTED_HAIR_SHA||'010a615ed5650e106bacd2c1da576a7c42db2a22047c4011596fb43b648cb015';
const hairAssetPath=process.env.HAIR_ASSET_PATH||'/assets/m2-long-hair-v1/female-ponytail.glb';
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),p=await ctx.newPage();
 const r={build,status:'running',checks:[],errors:[],expectedHairSHA,hairAssetPath,scope:'Original female, exact authored ponytail; normal-speed real room. CPU/static source checks remain separate; no target-PC or universal collision approval.'};
 p.on('pageerror',e=>r.errors.push(String(e)));
 const set=input=>p.evaluate(input=>__debug.command({type:'appearance',...input}),input);
 const state=()=>p.evaluate(()=>__debug.avatar().appearance.getState());
 const shot=async name=>{await p.screenshot({path:path.join(out,name+'.png')});};
 const phase=async name=>p.evaluate(name=>{window.__hairPhase=name;},name);
 const settle=async()=>p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:35000});
 let recipe;
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  r.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await p.evaluate(()=>{__debug.camera('inspect-half-back');window.__hairPhase='idle';window.__hairSamples=[];window.__frameIntervals=[];let last=null,lastSample=0;
   function sample(now){if(last!==null)__frameIntervals.push(now-last);last=now;if(now-lastSample>=100){const d=__debug.avatar().appearance.getState().hairDynamics;__hairSamples.push({ms:now,phase:__hairPhase,body:__debug.avatar().profile.bodyType,hair:d,mode:__debug.snapshot().mode});lastSample=now;}window.__hairRAF=requestAnimationFrame(sample);}window.__hairRAF=requestAnimationFrame(sample);
  });
  const before=await state();assert((await set({hairStyle:'female-ponytail-v1'})).applied,'Actual skinned hair must load');
  await p.waitForTimeout(1000);let s=await state();assert.equal(s.hairDynamics.jointCount,6);assert.equal(s.hairDynamics.colliderCount,3);assert(s.hairDynamics.updates>0);assert.equal(s.replacementSHA256,expectedHairSHA);
  const meshes=await p.evaluate(()=>{const list=[];__debug.avatar().vrm.scene.traverse(n=>{if(n.isMesh&&n.userData.assetRole==='hair'&&n.parent.visible)list.push({name:n.name,skinned:n.isSkinnedMesh,vertices:n.geometry.attributes.position.count,bones:n.skeleton?.bones.map(b=>b.name)});});return list;});
  assert.equal(meshes.length,1);assert(meshes[0].skinned);assert.equal(meshes[0].bones.length,8);await shot('back-idle');
  r.checks.push({name:'actual pinned multi-bone mesh uses isolated official solver in room',passed:true,before,loaded:s,meshes});
  await p.evaluate(()=>__debug.camera('inspect-half-side'));await p.waitForTimeout(700);await shot('side-idle');
  assert((await set({hairColor:'brown',surfaceLayers:[{id:'freckles',opacity:1}]})).applied);
  await p.evaluate(()=>__debug.camera('inspect-face-front'));await p.waitForTimeout(600);await shot('front-color');
  await phase('walk');await p.evaluate(()=>{__debug.camera('inspect-full-back');__debug.setSpeed(1.05);__debug.walkTo(-1.5,-.6);});await settle();
  await phase('run');await p.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(1.2,1.6);});await settle();
  await phase('turn');await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(-1.2,1.5);});await settle();await shot('after-walk-run-turn');
  await phase('sit');await p.evaluate(()=>{__debug.camera('inspect-half-side');__debug.action('sit');});await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});await p.waitForTimeout(700);await shot('seated-side');
  await p.evaluate(()=>__debug.camera('inspect-half-back'));await p.waitForTimeout(400);await shot('seated-back');
  await phase('rise');await p.evaluate(()=>__debug.action('stand'));await settle();await shot('risen-back');
  r.checks.push({name:'normal-speed walk/run/turn/seat/rise with continuing spring updates recorded',passed:true,state:await state()});
  await phase('pause');await p.evaluate(()=>__debug.setPaused(true));const paused=(await state()).hairDynamics;await p.waitForTimeout(700);assert.deepEqual((await state()).hairDynamics,paused);
  await p.evaluate(()=>__debug.setPaused(false));await p.waitForTimeout(500);assert((await state()).hairDynamics.updates>paused.updates);
  await phase('dynamics-disabled');await p.evaluate(()=>__debug.command({type:'dynamics',value:false}));await p.waitForTimeout(400);const disabled=(await state()).hairDynamics;await p.waitForTimeout(400);assert.equal((await state()).hairDynamics.updates,disabled.updates);
  await p.evaluate(()=>__debug.command({type:'dynamics',value:true}));await p.waitForTimeout(500);
  r.checks.push({name:'pause freezes exact state and dynamic toggle stops/resumes official updates',passed:true,paused,disabled});
  await phase('reload');const current=await state();assert((await set({hairStyle:'none'})).applied);assert.equal((await state()).effectiveHairStyle,'none');
  assert((await set({hairStyle:'female-ponytail-v1'})).applied);assert.equal((await state()).hairDynamics.jointCount,6);assert.equal((await state()).hairColor,current.hairColor);
  const rapid=await p.evaluate(async()=>{const a=__debug.command({type:'appearance',hairStyle:'female-ponytail-v1'});const b=__debug.command({type:'appearance',hairStyle:'original'});return{a:await a,b:await b};});assert(rapid.b.applied);assert.equal((await state()).effectiveHairStyle,'original');
  assert((await set({hairStyle:'female-ponytail-v1'})).applied);
  recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(out,'recipe-v7.json'),recipe);
  if(expectedHairSHA!=='010a615ed5650e106bacd2c1da576a7c42db2a22047c4011596fb43b648cb015'){
   const oldRecipe=await fs.readFile(path.join(__dirname,'../evidence/m2-long-hair-room-363-v1/recipe-v7.json'),'utf8');
   const oldResult=await p.evaluate(async text=>{try{return await __debug.importAppearanceRecipe(text);}catch(e){return{applied:false,reason:String(e),field:e.field,code:e.code};}},oldRecipe);
   assert.equal(oldResult.applied,false);assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);
   r.checks.push({name:'superseded experimental hair identity rejected without silently migrating saved geometry',passed:true,oldResult,limit:'Old experimental recipe remains reproducible on fixed build363; no implicit migration or current-build compatibility claim.'});
  }
  await p.evaluate(()=>__debug.setPaused(true));const primary=await state();
  const peer=await p.evaluate(async()=>{await __debug.loadComparison('female');const peer=__debug.comparison();peer.controller.paused=true;
    const applied=await peer.command({type:'appearance',hairStyle:'female-ponytail-v1',hairColor:'blonde'}),state=peer.avatar.appearance.getState();
    const head=peer.avatar.vrm.humanoid.getRawBoneNode('head');__debug.removeComparison();return{applied,state,remainingHeadChildren:head.children.map(n=>n.type)};});
  assert(peer.applied.applied);assert.equal(peer.state.hairColor,'blonde');assert.deepEqual(await state(),primary);
  r.checks.push({name:'unload/reload/latest selection and same-body peer separation',passed:true,rapid,peer});
  assert.deepEqual(r.errors,[]);r.status='technical-checks-passed-visual-pending';
 }catch(e){r.status='failed-or-incomplete';r.error=String(e);throw e;}
 finally{
  try{r.trace=await p.evaluate(()=>{cancelAnimationFrame(window.__hairRAF);return{samples:window.__hairSamples,frameIntervals:window.__frameIntervals};});}catch{}
  const video=p.video();await ctx.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();
  if(r.status==='technical-checks-passed-visual-pending'){
   const cold=await browser.newContext({viewport:{width:1440,height:900}}),q=await cold.newPage();
   try{await q.goto(url+'?body=female&workbench=appearance');await q.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
    await q.route('**'+hairAssetPath,route=>route.fulfill({status:503,body:'planned unavailable asset'}));
    const fail=await q.evaluate(async text=>{try{return await __debug.importAppearanceRecipe(text);}catch(e){return{applied:false,reason:String(e)};}},recipe);assert.equal(fail.applied,false);assert.equal(await q.evaluate(()=>__debug.avatar().appearance.getState().hairStyle),'original');
    await q.unroute('**'+hairAssetPath);assert((await q.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied);
    assert.equal(await q.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);await q.evaluate(()=>__debug.camera('inspect-half-back'));await q.waitForTimeout(700);await q.screenshot({path:path.join(out,'cold-restored.png')});
    r.checks.push({name:'fresh context missing GLB preserves previous whole look; retry restores exact v7',passed:true,fail});
   }catch(e){r.status='failed-or-incomplete';r.restoreError=String(e);process.exitCode=1;}finally{await cold.close();}
  }
  await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));
 }
 console.log(JSON.stringify({out,status:r.status,error:r.error||r.restoreError}));
})().catch(e=>{console.error(e);process.exitCode=1;});
