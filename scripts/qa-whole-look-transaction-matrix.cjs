// Actual browser transaction boundaries using existing fixed-source assets.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const waitMs=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const identity={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const targetText=await fs.readFile(path.join(__dirname,'../evidence/m2-whole-look-baseline-8e2-v1/target-v6.json'),'utf8'),target=JSON.parse(targetText);
 const pants=JSON.parse(await fs.readFile(path.join(__dirname,'../evidence/m2-outer-runtime-room-8e2-v1/outfit-3/recipe.json'),'utf8'));
 const second=structuredClone(target);second.appearance.hairColor='black';second.equipment=pants.equipment;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,environment:{browser:browser.version(),viewport:[1440,900],device:'Development Windows host; not target ordinary-PC acceptance'},cases:[]};
 try{for(const name of ['success','newer-color','newer-outfit','newer-whole-look','newer-style-and-color','body-replaced']){
  const dir=path.join(out,name);await fs.mkdir(dir);
  const c=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),p=await c.newPage();
  const r={name,errors:[]};report.cases.push(r);let release;p.on('pageerror',e=>r.errors.push(String(e)));
  try{
   await p.goto(base+'?body=male&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});r.identity=await verifyCandidate(p,identity);
   await p.evaluate(()=>{
    __debug.view('inspect-half-front');__debug.setPlaybackRate(1);__debug.setPaused(false);
    window.__lookState=()=>{const a=__debug.avatar(),g=a.facialGeometry.getState(),s=a.appearance.getState();return{body:a.profile.bodyType,geometry:{mouthWidth:g.mouthWidth,browSample:g.browSample,noseSample:g.noseSample,eyeSample:g.eyeSample},appearance:Object.fromEntries(['hairStyle','hairColor','skinTone','eyeColor','lipColor'].map(k=>[k,s[k]])),outfit:__debug.snapshot().outfit,visible:a.root.visible&&Boolean(a.root.parent)};};
    window.__lookFrames=[];window.__traceLook=true;function tick(t){if(!__traceLook)return;__lookFrames.push({t,state:__lookState()});requestAnimationFrame(tick);}requestAnimationFrame(tick);
   });
   r.before=await p.evaluate(()=>__lookState());
   if(name==='success')await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(2,1.8);});
   let hit;const reached=new Promise(resolve=>hit=resolve),held=new Promise(resolve=>release=resolve);
   await p.route('**/assets/m2-male-hairstyle-v1/male-sidepart.glb',async route=>{hit();await held;await route.continue();});
   await p.evaluate(text=>{window.__first={done:false};__debug.importAppearanceRecipe(text).then(result=>Object.assign(__first,{done:true,result})).catch(e=>Object.assign(__first,{done:true,error:String(e)}));},targetText);
   await Promise.race([reached,waitMs(15000).then(()=>{throw Error('Actual pending hair request missing');})]);
   const f0=await p.evaluate(()=>__lookFrames.length);await p.waitForTimeout(500);r.during=await p.evaluate(()=>__lookState());r.framesWhilePending=await p.evaluate(n=>__lookFrames.length-n,f0);
   assert.deepEqual(r.during,r.before,'Preparation changed currently visible look');assert(r.framesWhilePending>2,'Rendering was stopped while preparing');
   if(name==='newer-color')r.newCommand=await p.evaluate(()=>__debug.command({type:'appearance',hairColor:'black'}));
   if(name==='newer-outfit')await p.evaluate(()=>__debug.setOutfit(2));
   if(name==='newer-whole-look')await p.evaluate(text=>{window.__second={done:false};__debug.importAppearanceRecipe(text).then(result=>Object.assign(__second,{done:true,result})).catch(e=>Object.assign(__second,{done:true,error:String(e)}));},JSON.stringify(second));
   if(name==='newer-style-and-color')await p.evaluate(()=>{window.__second={done:false};const style=__debug.command({type:'appearance',hairStyle:'male-sidepart-v1'}),color=__debug.command({type:'appearance',hairColor:'black'});Promise.all([style,color]).then(result=>Object.assign(__second,{done:true,result})).catch(e=>Object.assign(__second,{done:true,error:String(e)}));});
   if(name==='body-replaced')r.newCommand=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'female'}));
   release();await p.waitForFunction(()=>__first.done&&(!window.__second||__second.done),null,{timeout:25000});
   r.first=await p.evaluate(()=>__first);r.second=await p.evaluate(()=>window.__second??null);r.after=await p.evaluate(()=>__lookState());r.frames=await p.evaluate(()=>{__traceLook=false;return __lookFrames;});
   const intended=structuredClone(r.before);
   if(name==='success'||name==='newer-whole-look'){
    const expected=name==='success'?target:second;
    assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),expected);
    assert.equal((name==='success'?r.first:r.second).result.applied,true);
    if(name==='newer-whole-look')assert.equal(r.first.result.cancelled,true);
    intended.geometry=Object.fromEntries(Object.keys(intended.geometry).map(k=>[k,expected.geometry[k]]));intended.appearance=expected.appearance;intended.outfit=expected.equipment.index;
    for(const f of r.frames)assert([JSON.stringify(r.before),JSON.stringify(intended)].includes(JSON.stringify(f.state)),'A rendered frame had a partially committed look');
   }else if(name==='newer-color'||name==='newer-outfit'||name==='newer-style-and-color'){
    assert.equal(r.first.result.cancelled,true);if(name==='newer-outfit')intended.outfit=2;else intended.appearance.hairColor='black';
    if(name==='newer-style-and-color')intended.appearance.hairStyle='male-sidepart-v1';
    assert.deepEqual(r.after,intended,'Stale whole-look request overwrote newer domain or leaked its other domains');
   }else{assert.equal(r.first.result.cancelled,true);assert.equal(r.after.body,'female');assert.equal(r.newCommand.applied,true);}
   if(name==='success'){
    const idle=()=>p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
    await idle();await p.evaluate(()=>{__debug.view('inspect-full-front');__debug.command({type:'speaking',value:true});});
    await p.waitForTimeout(2500);await p.evaluate(()=>__debug.action('sit'));
    await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});await p.waitForTimeout(1500);
    await p.evaluate(()=>__debug.action('stand'));await idle();await p.evaluate(()=>__debug.command({type:'speaking',value:false}));
    assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),target);
    r.motionScope='Applied while walking, then standing speech/blink and full sit/stand at 1x. Program states passed; film retained for visual review.';
   }
   assert.equal(r.errors.length,0);await p.screenshot({path:path.join(dir,'final.png')});r.status='passed';
  }catch(e){r.status='failed';r.error=String(e);process.exitCode=1;await p.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});}
  finally{release?.();const v=p.video();await c.close();await v.saveAs(path.join(dir,'normal1x.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }}finally{await browser.close();}
 console.log(JSON.stringify({out,cases:report.cases.map(({name,status,error})=>({name,status,error}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
