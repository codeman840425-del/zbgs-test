// Actual fixed-room admission/lifecycle and normal-speed evidence. No visual pass inferred.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
 const p=await ctx.newPage(),r={build,status:'running',checks:[],errors:[],limits:['Original female neutral face geometry and exact rootjoin-v2 hair only.','Accessory side-record is explicit replay, not atomic v7 hat storage.','Development PC, not ordinary-PC or universal fit approval.']};
 p.on('pageerror',e=>r.errors.push(String(e)));
 const command=input=>p.evaluate(async input=>{try{return await __debug.command(input);}catch(e){return{applied:false,reason:String(e),code:e.code};}},input);
 const hat=value=>command({type:'accessory',kind:'hat',value});
 const state=()=>p.evaluate(()=>__debug.avatar().headwear.getState());
 const shot=name=>p.screenshot({path:path.join(out,name+'.png')});
 const settle=()=>p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
 let recipe,savedHat;
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  r.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  assert.equal((await hat('single')).applied,false,'Original hairstyle must not silently become ponytail');assert.equal((await state()).selection,'none');
  assert((await command({type:'appearance',hairStyle:'female-ponytail-v1',hairColor:'brown'})).applied);
  assert((await hat('single')).applied);assert.equal((await state()).instances.length,1);
  for(const [view,name] of [['inspect-half-front','front'],['inspect-half-side','side'],['inspect-half-back','back']]){
   await p.evaluate(view=>__debug.camera(view),view);await p.waitForTimeout(650);await shot(name);
  }
  const before=await p.evaluate(()=>__debug.exportAppearanceRecipe());
  const badHair=await command({type:'appearance',hairStyle:'original'});assert.equal(badHair.applied,false);
  const badFace=await command({type:'faceGeometry',mouthWidth:1});assert.equal(badFace.applied,false);
  assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),before);
  r.checks.push({name:'hat uses pinned hair, rejects incompatible hair/face without changing current appearance',passed:true,badHair,badFace,state:await state()});
  assert((await command({type:'appearance',hairColor:'blonde'})).applied);
  assert((await command({type:'accessory',kind:'ears',value:'pair'})).applied);
  assert((await command({type:'accessory',kind:'glasses',value:true})).applied);
  await command({type:'speaking',value:true});await command({type:'expression',name:'happy'});
  await p.evaluate(()=>__debug.camera('inspect-face-front'));await p.waitForTimeout(2200);await shot('expression-glasses-ears');
  await command({type:'speaking',value:false});await command({type:'expression',name:'neutral'});
  await p.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(1,1.8);});await settle();
  await p.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(-1,1.8);});await settle();
  await p.evaluate(()=>{__debug.camera('inspect-half-side');__debug.action('sit');});
  await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});await p.waitForTimeout(800);await shot('seated');
  await p.evaluate(()=>__debug.action('stand'));await settle();
  assert.equal((await state()).selection,'single');
  r.checks.push({name:'normal-speed walking, running, turn, sit, rise with expressions and other accessories recorded',passed:true});
  await command({type:'bodyMode',name:'base'});assert.equal((await state()).effectiveSelection,'none');
  await command({type:'bodyMode',name:'dressed'});assert.equal((await state()).effectiveSelection,'single');
  await p.evaluate(()=>__debug.setPaused(true));const paused=await state();await p.waitForTimeout(350);assert.deepEqual(await state(),paused);
  await p.evaluate(()=>__debug.setPaused(false));
  const rapid=await p.evaluate(async()=>{const a=__debug.command({type:'accessory',kind:'hat',value:'single'});const b=__debug.command({type:'accessory',kind:'hat',value:'none'});return{a:await a,b:await b};});
  assert(rapid.b.applied);assert.equal((await state()).selection,'none');assert((await hat('single')).applied);
  r.checks.push({name:'base visibility restore, pause and latest request wins',passed:true,rapid});
  const peer=await p.evaluate(async()=>{await __debug.loadComparison('female');const b=__debug.comparison();
   await b.command({type:'appearance',hairStyle:'female-ponytail-v1'});await b.command({type:'accessory',kind:'hat',value:'single'});
   const a=__debug.avatar(),old=JSON.stringify(a.headwear.getState());await b.command({type:'accessory',kind:'hat',value:'none'});
   const isolated=old===JSON.stringify(a.headwear.getState());__debug.removeComparison();return{isolated,disposed:b.avatar.headwear.getState()};});
  assert(peer.isolated&&peer.disposed.disposed);r.checks.push({name:'peer selection and disposal isolated',passed:true,peer});
  recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());savedHat=await state();
  await fs.writeFile(path.join(out,'appearance-v7.json'),recipe);await fs.writeFile(path.join(out,'hat-side-record.json'),JSON.stringify(savedHat,null,2));
  await hat('none');assert((await command({type:'appearance',hairStyle:'original'})).applied);await shot('unloaded');
  assert.deepEqual(r.errors,[]);r.status='technical-checks-passed-visual-pending';
 }catch(e){r.status='failed-or-incomplete';r.error=String(e.stack??e);process.exitCode=1;}
 finally{
  const video=p.video();await ctx.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();
  if(r.status==='technical-checks-passed-visual-pending'){
   const cold=await browser.newContext({viewport:{width:1440,height:900}}),q=await cold.newPage();
   try{
    await q.goto(url+'?body=female&workbench=appearance');await q.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
    assert((await q.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied);
    await q.route('**/m2-hat-hair-v1/baseball-cap.glb',route=>route.fulfill({status:503,body:'planned missing hat'}));
    const failed=await q.evaluate(async()=>{try{return await __debug.command({type:'accessory',kind:'hat',value:'single'});}catch(e){return{applied:false,reason:String(e)};}});assert.equal(failed.applied,false);
    assert.equal(await q.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);
    await q.unroute('**/m2-hat-hair-v1/baseball-cap.glb');assert((await q.evaluate(()=>__debug.command({type:'accessory',kind:'hat',value:'single'}))).applied);
    const restored=await q.evaluate(()=>__debug.avatar().headwear.getState());
    for(const k of ['assetSha256','manifestSha256','fitId','selection'])assert.equal(restored[k],savedHat[k]);
    await q.evaluate(()=>__debug.camera('inspect-half-back'));await q.waitForTimeout(600);await q.screenshot({path:path.join(out,'cold-restored.png')});
    r.checks.push({name:'explicit side-record cold replay, missing-resource preservation and retry',passed:true,failed,restored});
   }catch(e){r.status='failed-or-incomplete';r.restoreError=String(e.stack??e);process.exitCode=1;}finally{await cold.close();}
  }
  await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));
 }
 console.log(JSON.stringify({out,status:r.status,error:r.error||r.restoreError}));
})();
