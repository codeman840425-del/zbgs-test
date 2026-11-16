const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),p=await ctx.newPage();
 const report={build,status:'running',checks:[],errors:[],scope:'Actual fixed browser API query/admission/preparation and existing workbench sync. No new UI or visual acceptance.'};
 p.on('pageerror',e=>report.errors.push(String(e)));const surfaceRequests=[];p.on('request',r=>{if(r.url().includes('/m2-surface-layer-v1/'))surfaceRequests.push(r.url());});
 const read=()=>p.evaluate(()=>({body:__debug.avatar().profile.bodyType,uuid:__debug.avatar().root.uuid,appearance:__debug.avatar().appearance.getState(),
   ui:{group:document.querySelector('[data-appearance-group][aria-pressed="true"]')?.dataset.appearanceGroup,body:document.querySelector('#appearance-body').value,
     skin:document.querySelector('#appearance-skin-tone').value,lip:document.querySelector('#appearance-lip-color').value,hair:document.querySelector('#appearance-hair-color').value},sameDocument:window.__testDoc===document}));
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await p.evaluate(()=>{window.__testDoc=document;__debug.camera('inspect-face-front');});
  const query=await p.evaluate(()=>__debug.queryAppearanceCandidates());assert.equal(query.defaultRecipe.schema,'workbench-appearance-recipe-v6');assert(query.surface.supported);
  assert.deepEqual(query.surface.choices.map(c=>c.id).sort(),['blush','freckles']);assert.equal(surfaceRequests.length,0);
  const recipe={...query.defaultRecipe,schema:query.surface.recipeSchema,rulesVersion:query.surface.rulesVersion,
    surface:{manifestSha256:query.surface.manifest.sha256,layers:[{id:'freckles',opacity:1},{id:'blush',opacity:.65}]}};
  const admitted=await p.evaluate(r=>__debug.admitAppearanceCandidate(r),recipe);assert(admitted.accepted);assert.equal(admitted.stage,'static');assert.equal(surfaceRequests.length,0);
  for(const patch of [{surface:{...recipe.surface,layers:[{id:'unknown',opacity:1}]}},{surface:{...recipe.surface,unexpected:1}}]){
    const rejected=await p.evaluate(r=>__debug.admitAppearanceCandidate(r),{...recipe,...patch});assert.equal(rejected.accepted,false);
  }
  report.checks.push({name:'registered v7 queried/admitted without I/O; unknown layer/field rejected; default v6 preserved',passed:true,query,admitted});
  assert((await p.evaluate(r=>__debug.importAppearanceRecipe(JSON.stringify(r)),recipe)).applied);
  assert((await p.evaluate(()=>__debug.command({type:'appearance',skinTone:'warm',lipColor:'rose',hairColor:'brown'}))).applied);
  let s=await read();assert.deepEqual([s.ui.skin,s.ui.lip,s.ui.hair],['warm','rose','brown']);assert(s.sameDocument);
  await p.waitForTimeout(600);await p.screenshot({path:path.join(out,'female.png')});
  const male=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}));assert(male.applied,JSON.stringify(male));s=await read();
  assert.equal(s.ui.group,'male');assert.equal(s.ui.body,'male');assert.deepEqual(s.appearance.surfaceLayers,recipe.surface.layers);assert.equal(s.ui.skin,'warm');assert(s.sameDocument);
  const qMale=await p.evaluate(()=>__debug.queryAppearanceCandidates());assert(qMale.surface.supported);
  assert((await p.evaluate(()=>__debug.admitAppearanceCandidate(JSON.parse(__debug.exportAppearanceRecipe())))).accepted);
  await p.waitForTimeout(600);await p.screenshot({path:path.join(out,'male.png')});
  report.checks.push({name:'direct actor and color commands synchronize real UI; male v7 remains admitted',passed:true,state:s});
  const before=await read();const bad=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'m2-male-lower-leg-v1'}));assert.equal(bad.applied,false);s=await read();
  assert.equal(s.uuid,before.uuid);assert.deepEqual(s.ui,before.ui);assert.deepEqual(s.appearance.surfaceLayers,before.appearance.surfaceLayers);
  await p.evaluate(async()=>{await __debug.loadComparison('female');await __debug.comparison().command({type:'appearance',skinTone:'deep',lipColor:'coral'});__debug.removeComparison();});
  assert.deepEqual((await read()).ui,before.ui);
  report.checks.push({name:'incompatible body preserves actor and UI; peer command cannot overwrite primary controls',passed:true,rejected:bad});
  await p.locator('#appearance-hair-color').selectOption('blonde');await p.waitForFunction(()=>__debug.avatar().appearance.getState().hairColor==='blonde'&&!__debug.avatar().appearance.getState().loading);
  assert.equal((await read()).ui.hair,'blonde');
  await p.locator('[data-appearance-group="female"]').click();await p.waitForFunction(()=>__debug.avatar().profile.bodyType==='female',null,{timeout:60000});
  await p.waitForFunction(()=>document.querySelector('[data-appearance-group="female"]').getAttribute('aria-pressed')==='true');
  s=await read();assert.equal(s.ui.body,'female');assert.equal(s.appearance.hairColor,'blonde');assert.deepEqual(s.appearance.surfaceLayers,recipe.surface.layers);
  await p.waitForTimeout(600);await p.screenshot({path:path.join(out,'female-ui-click.png')});
  report.checks.push({name:'real UI color and gender controls still work after agent requests',passed:true,state:s});
  assert((await p.evaluate(()=>__debug.command({type:'appearance',surfaceLayers:[]}))).applied);
  assert((await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'m2-male-lower-leg-v1'}))).applied);
  const derived=await p.evaluate(()=>__debug.queryAppearanceCandidates());assert.equal(derived.surface.supported,false);assert.deepEqual(derived.surface.choices,[]);
  const request={...derived.defaultRecipe,schema:query.surface.recipeSchema,rulesVersion:query.surface.rulesVersion,surface:recipe.surface};
  assert.equal((await p.evaluate(r=>__debug.admitAppearanceCandidate(r),request)).accepted,false);
  s=await read();assert.equal(s.ui.body,'m2-male-lower-leg-v1');assert.equal(s.ui.group,'male');
  report.checks.push({name:'derived body has no falsely inherited choices; exact UI sample sync retained',passed:true,state:s});
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.error=String(e);throw e;}
 finally{const video=p.video();await ctx.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
