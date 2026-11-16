const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2),out=path.resolve(output);
const reviewCamera=process.argv.find(arg=>arg.startsWith('--camera='))?.slice(9)??'room';
assert.ok(['room','inspect-full-front','inspect-full-side'].includes(reviewCamera));
const indices=process.argv.includes('--shorts-only')?[4]:[3,4];
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,reviewCamera,cases:[],scope:'Actual male editable-source outer export, exact original body and declared pants/shorts. Normal 1x; inspection camera follows body orientation. No collision or target-PC performance pass; visual review pending.'};
 try{for(const index of indices){
  const dir=path.join(out,'outfit-'+index);await fs.mkdir(dir);
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
  const p=await context.newPage(),r={index,errors:[],marks:[]};report.cases.push(r);
  p.on('pageerror',e=>r.errors.push(String(e)));
  const mark=async label=>r.marks.push(await p.evaluate(label=>{const d=__debug,s=d.snapshot();return {label,time:performance.now(),mode:s.mode,position:s.position,outfit:s.outfit,camera:s.camera,coverage:d.avatar().getOutfitInfo().equipment.bodyCoverage};},label));
  const idle=()=>p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
  try{
   await p.goto(base+'?body=male&workbench=appearance&view=room');await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});
   r.identity=await verifyCandidate(p,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
   const oldRecipePath=path.resolve(__dirname,'../evidence/m2-equipment-coverage-room-84b-v1/male-0-recipe.json');
   const oldRecipe=await fs.readFile(oldRecipePath,'utf8');
   assert.equal((await p.evaluate(text=>__debug.importAppearanceRecipe(text),oldRecipe)).applied,true);
   assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(oldRecipe));
   r.legacyRecipe={source:oldRecipePath,sourceBuild:'84b0c3f350cb',restoredWithoutChangingMeaning:true};
   await p.locator(`[data-outfit="${index}"]`).click();
   r.equipment=await p.evaluate(()=>__debug.avatar().getOutfitInfo().equipment);
   assert.equal(r.equipment.outfit,index);
   assert.deepEqual(Object.entries(r.equipment.items).filter(([,v])=>v.visible).map(([k])=>k).sort(),['outer','shoes','top',index===3?'pants':'shorts'].sort());
   const recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());
   await p.evaluate(text=>__debug.importAppearanceRecipe(text),oldRecipe);
   assert.equal(await p.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.outer.visible),false);
   assert.equal((await p.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied,true);
   assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(recipe));
   await fs.writeFile(path.join(dir,'recipe.json'),recipe);
   await p.evaluate(()=>{const d=__debug;d.setBodyMode('base');});
   assert.equal(await p.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.outer.visible),false);
   await p.evaluate(camera=>{const d=__debug;d.setBodyMode('dressed');d.setPlaybackRate(1);d.setPaused(false);d.camera(camera);},reviewCamera);
   await p.waitForTimeout(500);await mark('chain-start');
   await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(2,1.8);});await idle();await mark('walk-stop');
   await p.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(-1,1.8);});await idle();await mark('run-stop');
   await p.evaluate(()=>__debug.action('turn'));await idle();await mark('turn-end');
   await p.evaluate(()=>__debug.action('sit'));await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});await p.waitForTimeout(800);await mark('seated');await p.screenshot({path:path.join(dir,'seated-room.png')});
   await p.evaluate(()=>__debug.action('stand'));await idle();await mark('stand-end');
   await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(-.5,1.8);});await idle();
   await p.evaluate(()=>__debug.request({requestId:'outer-dance',kind:'dance',payload:{danceId:'dance-technical-once-v1'}}));
   await p.waitForFunction(()=>__debug.tasks().get('outer-dance')?.state==='completed',null,{timeout:20000});await idle();await mark('dance-end');
   for(const view of ['front','side','back']){await p.evaluate(view=>__debug.view('inspect-full-'+view),view);await p.waitForTimeout(400);await p.screenshot({path:path.join(dir,'standing-'+view+'.png')});}
   assert.equal(r.errors.length,0);r.status='technical-checks-passed-visual-pending';
  }catch(e){r.failure=String(e);process.exitCode=1;await p.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw e;}
  finally{const video=p.video();await context.close();await video.saveAs(path.join(dir,'normal1x.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,cases:report.cases.map(r=>({index:r.index,status:r.status,failure:r.failure}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
