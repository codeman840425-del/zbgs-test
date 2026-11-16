// Real browser first-selection failures and supersession, using current actor
// and existing outfit commands. No animation/controller implementation fixture.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),page=await context.newPage();
 const report={build,checks:[],errors:[],scope:'Actual original male default/onePiece/outer first-load transactions and actor replacement; no target-PC performance pass.'};
 let releasePending;
 page.on('pageerror',e=>report.errors.push(String(e)));
 const outfit=async value=>{
  let timer;
  try{return await Promise.race([page.evaluate(async value=>{try{return await __debug.command({type:'outfit',value});}catch(e){return {applied:false,reason:String(e)};}},value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Outfit command exceeded the 20 second test deadline')),20000);})]);}
  finally{clearTimeout(timer);}
 };
 try{
  let fitFailures=0;
  await page.route('**/m2-onepiece-v1/fit.json',r=>{fitFailures++;return r.fulfill({status:503,body:'bounded missing fit test'});});
  await page.goto(base+'?body=male&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  assert.equal(fitFailures,0);report.checks.push('unselected missing onePiece fit is never requested and does not block default male');
  report.available=await page.evaluate(()=>__debug.queryAppearanceCandidates());
  assert.equal(fitFailures,0);assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.onePiece.loaded),false);
  report.checks.push('candidate query describes unselected outfits without loading their meshes or fit');
  const previous=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  report.failedFirstSelection=await outfit(5);assert.equal(report.failedFirstSelection?.applied,false);
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),previous);assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),0);
  report.checks.push('missing fit on first selection preserves complete old appearance');
  await page.unroute('**/m2-onepiece-v1/fit.json');
  report.retriedFirstSelection=await outfit(5);assert.equal(report.retriedFirstSelection?.applied,true);
  assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),5);
  const saved=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  await outfit(0);assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),previous);
  assert.equal((await page.evaluate(text=>__debug.importAppearanceRecipe(text),saved)).applied,true);
  report.checks.push('first selection retry and complete onePiece recipe restore succeed');
  for(const bodyType of ['female','male'])assert.equal((await page.evaluate(bodyType=>__debug.command({type:'bodySelect',bodyType}),bodyType)).applied,true);
  assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.onePiece.loaded),false);
  assert.equal((await page.evaluate(text=>__debug.importAppearanceRecipe(text),saved)).applied,true);
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),saved);
  report.checks.push('saved nondefault recipe restores on a fresh actor before its garment was ever loaded');
  // A fresh actor avoids treating a prior warmed garment as a first load.
  for(const bodyType of ['female','male'])assert.equal((await page.evaluate(bodyType=>__debug.command({type:'bodySelect',bodyType}),bodyType)).applied,true);
  const beforeCancelled=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  let started,release;const start=new Promise(r=>started=r),gate=new Promise(r=>release=r);releasePending=release;
  await page.route('**/m2-onepiece-v1/author-export.glb',async r=>{started();await gate;await r.continue();});
  await page.evaluate(()=>{window.__qaLazyOutfit=Promise.resolve(__debug.command({type:'outfit',value:5})).catch(e=>({applied:false,reason:String(e)}));});
  let timer;try{await Promise.race([start,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Garment request did not begin')),20000);})]);}finally{clearTimeout(timer);}
  report.newerSelection=await outfit(0);release();
  report.cancelledSelection=await page.evaluate(()=>window.__qaLazyOutfit);
  assert.notEqual(report.cancelledSelection?.applied,true);
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),beforeCancelled);assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),0);
  report.checks.push('new default selection prevents delayed old onePiece from becoming visible');
  await page.unroute('**/m2-onepiece-v1/author-export.glb');
  report.coverageOwnership=await page.evaluate(async()=>{
   const a=__debug.avatar(),old=await a.prepareOutfit(3),latest=await a.prepareOutfit(4);
   latest.commit();latest.dispose();old.dispose();
   const m=a.getAssetProfile().meshRoles.top.map(id=>a.root.getObjectByProperty('uuid',id)).find(m=>(Array.isArray(m.material)?m.material:[m.material]).some(v=>v.name==='M00_001_01_Tops_01_CLOTH'));
   return {indexCount:m.geometry.index.count,coverage:a.getOutfitInfo().equipment.garmentCoverage};
  });
  assert.equal(report.coverageOwnership.indexCount,6012-56*3);
  report.checks.push('old prepared outer cleanup preserves newer actual top indices, not just outfit flags');
  assert.equal((await outfit(4))?.applied,true);
  const coverage=await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.garmentCoverage);
  assert.equal(coverage.active,true);assert.equal(coverage.hiddenFaces,56);
  await outfit(0);assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.garmentCoverage?.active??false),false);
  report.checks.push('first outer load activates exact coverage; removal restores it');
  assert.equal((await page.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'female'}))).applied,true);
  assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.skirtDynamics),null);
  assert.equal((await outfit(1))?.applied,true);
  report.skirtBefore=await page.evaluate(()=>({state:__debug.avatar().getOutfitInfo().equipment.skirtDynamics,meshes:__debug.avatar().getAssetProfile().meshRoles.skirt}));
  assert(report.skirtBefore.meshes.length>0,'Lazy skirt must appear in current motion/inspection mesh roles');
  await page.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(1,1.8);});
  await page.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:30000});
  report.skirtAfter=await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.skirtDynamics);
  assert(report.skirtAfter.revision>report.skirtBefore.state.revision);
  assert.equal((await outfit(0))?.applied,true);
  report.checks.push('female skirt solver is created on first selection, exposes current mesh and updates through walking; pants restore');
  // A delayed garment must also be harmless after the owning actor is gone.
  assert.equal((await page.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}))).applied,true);
  await page.evaluate(()=>__debug.setBodyMode('base'));
  report.baseModeSelection=await outfit(5);
  assert.equal(report.baseModeSelection?.applied,true,JSON.stringify(report.baseModeSelection));
  await page.evaluate(()=>__debug.setBodyMode('dressed'));
  assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.onePiece.visible),true);
  report.checks.push('selecting an unvisited outfit in base mode prepares it for atomic dressed-mode restore');
  await outfit(0);
  await page.evaluate(()=>{
   __debug.setBodyMode('base');const a=__debug.avatar(),m=a.root.getObjectByProperty('uuid',a.getAssetProfile().meshRoles.body[0]);
   const p=m.geometry.attributes.position;p.setX(0,p.getX(0)+.001);p.needsUpdate=true;
  });
  report.shapeRejection=await outfit(5);assert.equal(report.shapeRejection?.applied,false);
  assert.match(report.shapeRejection.reason,/refit|changed|differs/);
  report.checks.push('diagnostic display does not bypass the actual geometry-version fit guard');
  await page.evaluate(()=>__debug.setBodyMode('dressed'));
  // Replace once more so the following lifetime test owns a real first load.
  for(const bodyType of ['female','male'])assert.equal((await page.evaluate(bodyType=>__debug.command({type:'bodySelect',bodyType}),bodyType)).applied,true);
  const startedDisposed=new Promise(r=>started=r),disposedGate=new Promise(r=>release=r);releasePending=release;
  await page.route('**/m2-onepiece-v1/author-export.glb',async r=>{started();await disposedGate;await r.continue();});
  await page.evaluate(()=>{window.__qaOldActor=__debug.avatar();window.__qaDisposedOutfit=Promise.resolve(__debug.command({type:'outfit',value:5})).catch(e=>({applied:false,reason:String(e)}));});
  let disposedTimer;try{await Promise.race([startedDisposed,new Promise((_,reject)=>{disposedTimer=setTimeout(()=>reject(Error('Disposed actor garment did not start loading')),20000);})]);}finally{clearTimeout(disposedTimer);}
  assert.equal((await page.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'female'}))).applied,true);
  const newActorRecipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());release();
  report.disposedSelection=await page.evaluate(()=>window.__qaDisposedOutfit);
  assert.notEqual(report.disposedSelection?.applied,true);
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),newActorRecipe);
  report.oldActor=await page.evaluate(()=>({attached:!!__qaOldActor.root.parent,items:__qaOldActor.getOutfitInfo().equipment.items}));
  assert.equal(report.oldActor.attached,false);assert(Object.values(report.oldActor.items).every(item=>item.loaded===false));
  await page.unroute('**/m2-onepiece-v1/author-export.glb');
  await page.evaluate(()=>{delete window.__qaOldActor;delete window.__qaDisposedOutfit;});
  report.checks.push('actor replacement during first garment load disposes old ownership; late result leaves current actor and recipe unchanged');
  assert.equal(report.errors.length,0);report.status='passed';await page.screenshot({path:path.join(out,'restored.png')});
 }catch(error){report.status='failed';report.error=String(error);report.stack=error.stack;process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{releasePending?.();const video=page.video();await context.close();await video.saveAs(path.join(out,'normal1x.webm'));await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,checks:report.checks,error:report.error}));
})().catch(error=>{console.error(error);process.exitCode=1;});
