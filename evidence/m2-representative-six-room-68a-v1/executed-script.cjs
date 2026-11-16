// Whole deterministic batch through the existing controller, never eight controllers.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const {createHash}=require('node:crypto');
const PRESETS={
 'female-round-full':'female','female-long-slender':'female','female-square-athletic':'female','female-soft-wide':'female',
 'male-wide-muscular':'male','male-long-lean':'male','male-round-stocky':'male','male-angular-athletic':'male',
};
function batchCoverage(index){
 assert.equal(index.schema,'representative-runtime-index-v1');
 const partial=index.completeBatch===false;
 const failed=['female-long-slender-v2','male-long-lean-v2'];
 const expected=partial?Object.fromEntries(Object.entries(PRESETS).map(([id,sex])=>[id+'-v2',sex]).filter(([id])=>!failed.includes(id))):PRESETS;
 assert.equal(index.presets.length,Object.keys(expected).length);
 assert.deepEqual(index.presets.map(p=>p.id).sort(),Object.keys(expected).sort());
 for(const p of index.presets)assert.equal(p.sex,expected[p.id]);
 if(partial){
  assert.equal(index.declaredBatchSize,8);
  assert.equal(index.unpublished.length,2);
  assert.deepEqual(index.unpublished.map(p=>p.id).sort(),failed.sort());
  assert(index.unpublished.every(p=>p.status==='not-published-source-failed'));
 }else{assert.equal(index.presets.length,8);assert.equal((index.unpublished??[]).length,0);}
 return {declaredBatchSize:8,publishedCount:index.presets.length,completeBatch:!partial,unpublished:index.unpublished??[],
  faceParameterLimit:partial?'脸宽参数仅部分实现，源意图投影差与实际轮廓仍待审查。':null};
}
async function main(){
 const [url,build,destination,indexPath,...options]=process.argv.slice(2);
 assert(options.every(option=>option==='--front-seat'),'Unknown capture option');
 const out=path.resolve(destination);
 const indexBytes=await fs.readFile(indexPath);
 const index=JSON.parse(indexBytes);
 const coverage=batchCoverage(index);
 const frontSeat=!coverage.completeBatch||options.includes('--front-seat');
 const {chromium}=require('../prototype/node_modules/playwright');
 await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 await fs.copyFile(indexPath,path.join(out,'executed-runtime-index.json'));
 const summary={build,status:'running',captureSchema:'representative-room-capture-v2',batchCoverage:coverage,
  runtimeIndexSha256:createHash('sha256').update(indexBytes).digest('hex'),cases:[],limits:[
  'Technical completion and screenshots are not continuous visual acceptance.',
  'Development Chrome only, not ordinary-PC performance approval.',
  'This batch admits only its own configured clothes and hair; no frozen skirt inheritance.',
  'Frame times include recording; no assertion of performance from average FPS.',
  'The original side-view seat approach has furniture occlusion; supplemental front seating does not verify the missing side-view interval.',
  ...(coverage.faceParameterLimit?[coverage.faceParameterLimit]:[]),
 ]};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const spec of index.presets){
  const folder=path.join(out,spec.id);await fs.mkdir(folder);
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:folder,size:{width:1440,height:900}}});
  const p=await context.newPage();
  const r={id:spec.id,sex:spec.sex,build,status:'running',errors:[],checks:[],tasks:[],visualAcceptance:'pending',
   requestedHairStyle:spec.sex==='female'?'female-ponytail-headref-v3':'male-sidepart-v1'};
  let trace=null;
  p.on('pageerror',e=>r.errors.push(String(e)));
  const ready=()=>p.waitForFunction(()=>document.querySelector('#appearance-form')?.getAttribute('aria-busy')==='false',null,{timeout:60000});
  const mark=label=>p.evaluate(label=>{window.__batchPhase=label;},label);
  const shot=async name=>{await p.waitForTimeout(350);await p.screenshot({path:path.join(folder,name+'.png')});await p.locator('#stage').screenshot({path:path.join(folder,name+'-stage.png')});};
  const request=async(kind,payload={})=>{
   const requestId=spec.id+'-'+kind+'-'+r.tasks.length;
   const admission=await p.evaluate(q=>__debug.request(q),{requestId,kind,payload});
   r.tasks.push({requestId,kind,admission});
   await p.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),requestId,{timeout:45000});
   const result=await p.evaluate(id=>__debug.tasks().get(id),requestId);r.tasks.at(-1).result=result;
   assert.equal(result.state,'completed',JSON.stringify(result));return result;
  };
  try{
   await p.goto(url+'?workbench=appearance&body='+encodeURIComponent(spec.id));
   await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});await ready();
   r.identity=await verifyCandidate(p,{build,assetId:spec.profile.id,sha256:spec.profile.sha256});
   assert.equal(await p.locator('#appearance-body').inputValue(),spec.id);
   r.eyeBlinkCompatibility=await p.evaluate(()=>__debug.avatar().livePresentation.getState().eyeBlinkCompatibility);
   assert(r.eyeBlinkCompatibility.available,JSON.stringify(r.eyeBlinkCompatibility));
   await p.evaluate(()=>{
    __debug.setPlaybackRate(1);__debug.setPaused(false);window.__batchRows=[];window.__batchFrameTimes=[];window.__batchPhase='idle';let last=null,lastSample=-Infinity;
    function sample(now){if(last!==null)__batchFrameTimes.push({ms:now,dt:now-last,phase:__batchPhase});last=now;
      if(now-lastSample>=100){lastSample=now;const s=__debug.snapshot(),e=__debug.avatar().vrm.expressionManager;window.__batchRows.push({ms:now,phase:window.__batchPhase,
       mode:s.mode,position:s.position,motion:s.motion,simulationTime:s.simulationTime,
       expressions:Object.fromEntries(['blink','happy','aa'].map(key=>[key,e?.getValue(key)]))});}
      window.__batchRAF=requestAnimationFrame(sample);}
    window.__batchRAF=requestAnimationFrame(sample);
   });
   if(spec.appearance){
    const applied=await p.evaluate(value=>__debug.command({type:'appearance',...value}),spec.appearance);
    assert(applied.applied,JSON.stringify(applied));
   }
   const desiredStyle=r.requestedHairStyle;
   const choices=await p.evaluate(()=>__debug.avatar().appearance.getState().availableStyles);
   if(choices.includes(desiredStyle)){
    await p.selectOption('#appearance-hair-style',desiredStyle);await ready();
    assert.equal(await p.evaluate(()=>__debug.avatar().appearance.getState().hairStyle),desiredStyle);
    r.loadedHair=await p.evaluate(()=>__debug.avatar().appearance.getState());
   }else r.hairLimit='Requested replacement hairstyle not admitted on this body; original hair retained, not counted as replacement pass.';
   for(const direction of ['front','side','back']){
    await mark('static-'+direction);await p.evaluate(view=>__debug.camera(view),'inspect-full-'+direction);await shot('full-'+direction);
   }
   await p.evaluate(()=>__debug.command({type:'expression',name:'neutral'}));
   for(const direction of ['front','side','back']){
    await mark('face-static-'+direction);await p.evaluate(view=>__debug.camera(view),'inspect-face-'+direction);await shot('face-'+direction);
   }
   await p.evaluate(()=>__debug.camera('inspect-face-front'));
   for(const expression of ['neutral','happy','aa']){
    await mark('face-'+expression);await p.evaluate(name=>__debug.command({type:'expression',name}),expression);await shot('face-'+expression);
   }
   await mark('face-smile-speaking-blink');
   await p.evaluate(()=>{__debug.command({type:'expression',name:'happy'});__debug.command({type:'speaking',value:true});});
   await p.waitForTimeout(4500);await shot('face-speaking');await p.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});});
   // A base-mode image checks exposed geometry separately; it is not a nude substitute rig.
   await mark('base');await p.evaluate(()=>{__debug.camera('inspect-full-front');__debug.setBodyMode('base');});await shot('base');
   await p.evaluate(()=>__debug.setBodyMode('dressed'));
   await mark('walk');await p.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);});await request('walk',{x:-1.4,z:-.6});
   await mark('run-turn');await p.evaluate(()=>__debug.setSpeed(2.2));await request('walk',{x:1.2,z:1.6});
   await mark('sit');await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.camera('inspect-full-side');});await request('sit');
   await p.waitForTimeout(1200);await shot('seated');
   await mark('stand');await request('stand');await shot('standing');
   if(frontSeat){
    r.supplementalFrontSeat={requested:true,camera:'inspect-full-front',completed:false,scope:'Supplement after original side-view sit/rise; furniture and baseline route retained.'};
    await mark('supplemental-front-sit');await p.evaluate(()=>__debug.camera('inspect-full-front'));
    await request('sit');r.supplementalFrontSeat.sitRequestId=r.tasks.at(-1).requestId;
    await p.waitForTimeout(1200);await shot('seated-front');
    await mark('supplemental-front-stand');await request('stand');r.supplementalFrontSeat.standRequestId=r.tasks.at(-1).requestId;
    await shot('standing-front');r.supplementalFrontSeat.completed=true;
   }
   await mark('leave');await p.evaluate(()=>__debug.camera('room'));await request('walk',{x:-.5,z:1.8});
   await mark('dance');await request('dance',{danceId:'dance-technical-once-v1'});await p.waitForTimeout(600);
   r.checks.push({name:'own exact body/clothing loaded; walk, run turn, sit, rise and technical dance tasks completed',passed:true});
   const recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(folder,'recipe.json'),recipe);
   assert((await p.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied);
   assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);
   r.checks.push({name:'same-body exact appearance recipe restores',passed:true});
   trace=await p.evaluate(()=>{cancelAnimationFrame(window.__batchRAF);return {states:window.__batchRows??[],frameTimes:window.__batchFrameTimes??[]};});
   await mark('reload-and-restore');await p.reload();await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});await ready();
   assert((await p.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied);
   assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);
   r.checks.push({name:'same saved final recipe restores after real page reload',passed:true});
   r.final=await p.evaluate(()=>({profile:__debug.avatar().profile,appearance:__debug.avatar().appearance.getState(),live:__debug.avatar().livePresentation.getState(),snapshot:__debug.snapshot()}));
   assert.deepEqual(r.errors,[]);r.status='technical-checks-passed-visual-pending';
  }catch(e){r.status='failed';r.error=String(e.stack??e);try{await shot('failure');}catch{}}
  finally{
   try{const data=trace??await p.evaluate(()=>{cancelAnimationFrame(window.__batchRAF);return {states:window.__batchRows??[],frameTimes:window.__batchFrameTimes??[]};});await fs.writeFile(path.join(folder,'frame-samples.json'),JSON.stringify(data));
    const dt=data.frameTimes.map(x=>x.dt).filter(Number.isFinite).sort((a,b)=>a-b);r.frameTimes={sampleCount:dt.length,max:dt.at(-1),p95:dt[Math.floor(dt.length*.95)],over50ms:dt.filter(x=>x>50).length,scope:'recording run only; state sampled at 100ms'};}catch{}
   const video=p.video();await context.close();await video.saveAs(path.join(folder,'normal1x.webm'));await video.delete();
   await fs.writeFile(path.join(folder,'report.json'),JSON.stringify(r,null,2)+'\n');summary.cases.push(r);
   await fs.writeFile(path.join(out,'report.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({id:r.id,status:r.status,error:r.error}));
  }
 }}finally{await browser.close();summary.status=summary.cases.length===coverage.publishedCount&&summary.cases.every(r=>r.status==='technical-checks-passed-visual-pending')?'technical-checks-passed-visual-pending':'incomplete-or-failed';await fs.writeFile(path.join(out,'report.json'),JSON.stringify(summary,null,2)+'\n');}
 if(summary.status==='incomplete-or-failed')process.exitCode=1;
}
module.exports={batchCoverage};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
