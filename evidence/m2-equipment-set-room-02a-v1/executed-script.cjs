const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,outDir]=process.argv.slice(2),out=path.resolve(outDir);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:path.join(out,'video'),size:{width:1440,height:900}}});
 const p=await context.newPage(),report={build,url,errors:[],rows:[],scope:'Current room: existing female pants/skirt and male pants/shorts, body coverage restore, recipe roundtrip, normal1x walk. Not new onePiece/outerwear fit or complete M2 acceptance.'};
 p.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await p.goto(url);await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  for(const body of ['female','male']){
   if(body==='male'){await p.locator('[data-appearance-group=male]').click();await p.waitForFunction(()=>__debug.avatar().profile.bodyType==='male'&&!document.querySelector('#appearance-fields').disabled);}
   await p.evaluate(()=>{__debug.reset();__debug.camera('room');__debug.setPlaybackRate(1);__debug.setPaused(false);});
   for(const outfit of body==='female'?[0,1,0]:[0,2,0]){
    await p.evaluate(n=>__debug.setOutfit(n),outfit);await p.waitForTimeout(150);
    const row=await p.evaluate(()=>{const a=__debug.avatar();return {body:a.profile.bodyType,outfit:a.getOutfitInfo(),debug:a.getDebugState()};});
    assert.equal(row.outfit.index,outfit);assert.equal(row.debug.bodyComplete,true);
    const visible=Object.entries(row.outfit.equipment.items).filter(([,v])=>v.visible).map(([k])=>k).sort();
    assert.deepEqual(visible,['top','shoes',outfit===1?'skirt':outfit===2?'shorts':'pants'].sort());
    const state=await p.evaluate(async()=>{
     const d=__debug,a=d.avatar(),recipe=await d.exportAppearanceRecipe();
     d.setBodyMode('base');const full=a.getOutfitInfo().equipment;
     d.setBodyMode('dressed');const dressed=a.getOutfitInfo().equipment;
     return {full,dressed,recipe};
    });
    assert.deepEqual(Object.entries(state.full.items).filter(([,v])=>v.visible).map(([k])=>k),['shoes']);
    if(state.full.bodyCoverage){assert.equal(state.full.bodyCoverage.active,false);assert.equal(state.full.bodyCoverage.renderFaces,state.full.bodyCoverage.fullFaces);assert.equal(state.dressed.bodyCoverage.active,true);}
    report.rows.push({...row,coverage:state.full.bodyCoverage,recipeSchema:state.recipe.schema});
    await p.screenshot({path:path.join(out,`${body}-${outfit}.png`)});
   }
   await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(1.4,-.4);});
   await p.waitForTimeout(6500);
   report.rows.push(await p.evaluate(()=>({body:__debug.avatar().profile.bodyType,afterWalk:__debug.snapshot().position,mode:__debug.snapshot().mode,playbackRate:document.querySelector('[data-playback-rate="1"]')?.getAttribute('aria-pressed')})));
  }
  assert.equal(report.errors.length,0);report.status='passed';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{await context.close();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,out}));}
})();
