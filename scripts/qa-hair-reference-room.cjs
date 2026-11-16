// Compare two exact-fit candidates through the same room/controller at normal speed.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination,style='female-ponytail-v1']=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),p=await ctx.newPage();
 const report={build,style,status:'running',checks:[],errors:[],scope:'Same original female without hat; exact old/new fit, normal-speed room walk/run and side sit/rise. Not target-PC or continuous visual acceptance.'};
 p.on('pageerror',e=>report.errors.push(String(e)));
 const state=()=>p.evaluate(()=>__debug.avatar().appearance.getState());
 const phase=label=>p.evaluate(label=>window.__hairReviewPhase=label,label);
 const task=async request=>{
  assert(request?.task?.requestId,JSON.stringify(request));const id=request.task.requestId;
  await p.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});
  const result=await p.evaluate(id=>__debug.tasks().get(id),id);assert.equal(result.state,'completed',JSON.stringify(result));return result;
 };
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await p.selectOption('#appearance-hair-style',style);await p.waitForFunction(()=>document.querySelector('#appearance-form').getAttribute('aria-busy')!=='true');
  assert.equal((await state()).effectiveHairStyle,style);await p.selectOption('#appearance-hair-color','brown');
  await p.waitForFunction(()=>document.querySelector('#appearance-form').getAttribute('aria-busy')!=='true');
  report.loaded=await state();assert.equal(report.loaded.replacementSHA256,'1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385');
  assert.equal(report.loaded.hairDynamics.simulationFrame,style==='female-ponytail-v1'?'avatar-scene':'raw-head');
  await p.evaluate(()=>{
   __debug.camera('room');window.__hairReviewPhase='idle';window.__hairReviewSamples=[];let previous=0;
   const sample=now=>{
    if(now-previous>=100){previous=now;const a=__debug.avatar(),d=a.appearance.getState().hairDynamics,s=__debug.snapshot();
     if(d){const head=a.vrm.humanoid.getRawBoneNode('head'),v=head.getWorldPosition(head.position.clone());
      __hairReviewSamples.push({ms:now,phase:__hairReviewPhase,mode:s.mode,sit:s.motion.sitProgress,frame:d.simulationFrame,tails:d.worldTails,head:v.toArray(),resets:d.resets});}}
    window.__hairReviewRAF=requestAnimationFrame(sample);
   };window.__hairReviewRAF=requestAnimationFrame(sample);
  });
  await p.waitForTimeout(800);
  await phase('walk');await p.evaluate(()=>__debug.setSpeed(1.05));await task(await p.evaluate(()=>__debug.walkTo(-1.4,-.6)));
  await phase('run');await p.evaluate(()=>__debug.setSpeed(2.2));await task(await p.evaluate(()=>__debug.walkTo(1.2,1.6)));
  await phase('sit');await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.camera('inspect-half-side');});
  report.sit=await task(await p.evaluate(()=>__debug.action('sit')));await p.waitForTimeout(1200);await p.screenshot({path:path.join(out,'seated.png')});
  await phase('rise');await task(await p.evaluate(()=>__debug.action('stand')));await p.waitForTimeout(600);
  report.checks.push({name:'normal-speed exact same walk/run/sit/rise task chain completed',passed:true});
  await phase('pause');await p.evaluate(()=>__debug.setPaused(true));const paused=(await state()).hairDynamics;
  await p.waitForTimeout(500);assert.deepEqual((await state()).hairDynamics,paused);await p.evaluate(()=>__debug.setPaused(false));await p.waitForTimeout(400);
  assert((await state()).hairDynamics.updates>paused.updates);
  const recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(out,'recipe.json'),recipe);
  assert((await p.evaluate(()=>__debug.command({type:'appearance',hairStyle:'original'}))).applied);
  assert((await p.evaluate(recipe=>__debug.importAppearanceRecipe(recipe),recipe)).applied);assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);
  await p.waitForTimeout(600);await p.screenshot({path:path.join(out,'restored.png')});
  report.checks.push({name:'pause preserves exact state; restore retains selected fit identity and resets isolated hair',passed:true});
  assert.deepEqual(report.errors,[]);report.status='technical-checks-passed-visual-pending';
 }catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;}
 finally{
  try{report.samples=await p.evaluate(()=>{cancelAnimationFrame(window.__hairReviewRAF);return window.__hairReviewSamples;});}catch{}
  const video=p.video();await ctx.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();await browser.close();
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,error:report.error}));
})();
