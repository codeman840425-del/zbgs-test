// Real shared loader: record/save/close/reopen, material transactions and failures.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [base,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const garment='m1b-uniform-shorts-v1',recipeId='m1b-shorts-cloth-v4-review1';
const canonical=v=>JSON.stringify((function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;})(v));
function seal(record){const value=structuredClone(record);delete value.integrity.recordSha256;record.integrity.recordSha256=crypto.createHash('sha256').update(canonical(value)).digest('hex');return record;}
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 let page;const report={status:'incomplete',browser:browser.version(),viewport:{width:1440,height:1000},cases:[],errors:[],scope:'Development machine. Material identity, whole-look restore, cancellation and normal-speed continuity. Not new body/cloth fit or ordinary-PC acceptance.'};
 const open=async()=>{if(page)await page.close();page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(base+'?workbench=appearance&body=male');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});report.build=await page.evaluate(()=>__debug.buildInfo.shortId);};
 const outfit=async index=>{await page.evaluate(i=>__debug.setOutfit(i),index);await page.waitForFunction(i=>__debug.snapshot().outfit===i,index);};
 const capture=()=>page.evaluate(()=>__debug.captureCharacterRecord({identity:{id:'material-record-runtime-a',name:'材质恢复样件',gender:'male'}}));
 const restore=record=>page.evaluate(async value=>{try{return await __debug.restoreCharacterRecord(value);}catch(error){return{error:error.message};}},record);
 const current=()=>page.evaluate(id=>({outfit:__debug.snapshot().outfit,appearance:__debug.exportAppearanceRecipe(),material:__debug.avatar().getMaterialRecipeState(id)?.active??null,live:__debug.avatar().livePresentation.getState().accessories}),garment);
 const task=async(id,kind,payload={})=>{await page.evaluate(r=>__debug.request(r),{requestId:id,kind,payload});await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const result=await page.evaluate(id=>__debug.tasks().get(id),id);assert.equal(result.state,'completed',JSON.stringify(result));return result;};
 try{
  await open();await outfit(2);
  assert.equal((await page.evaluate(({garment,recipeId})=>__debug.avatar().setMaterialRecipe(garment,recipeId),{garment,recipeId})).applied,true);
  const record=await capture();assert.equal(record.equipmentMaterials.selections.find(x=>x.equipmentId===garment).selection.recipeId,recipeId);
  await fs.writeFile(path.join(out,'character-record.json'),JSON.stringify(record,null,2));
  await page.evaluate(()=>{__debug.camera('inspect-full-front');__debug.setPlaybackRate(1);__debug.setPaused(false);});await page.waitForTimeout(800);
  await page.screenshot({path:path.join(out,'before-close.png')});
  await open();const loaded=JSON.parse(await fs.readFile(path.join(out,'character-record.json'),'utf8'));
  assert.equal((await restore(loaded)).applied,true);
  const after=await capture();assert.deepEqual(after.appearanceRecipe,record.appearanceRecipe);assert.deepEqual(after.equipmentMaterials,record.equipmentMaterials);assert.deepEqual(after.resourceIdentities,record.resourceIdentities);
  report.cases.push({name:'complete material record disk close/reopen',passed:true});
  await page.evaluate(()=>{__debug.camera('inspect-full-front');__debug.setPlaybackRate(1);__debug.setPaused(false);});await page.waitForTimeout(800);
  await page.screenshot({path:path.join(out,'after-restore.png')});
  await page.evaluate(()=>{const stream=__debug.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__materialFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();__debug.camera('room');});
  report.actions=[];report.actions.push(await task('material-walk','walk',{x:-.5,z:1.8}));report.actions.push(await task('material-sit','sit'));await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'restored-seated.png')});report.actions.push(await task('material-stand','stand'));
  const film=await page.evaluate(async()=>{const c=window.__materialFilm;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));});});
  await fs.writeFile(path.join(out,'restored-material-actions-1x.webm'),Buffer.from(film.split(',')[1],'base64'));
  assert.deepEqual((await capture()).equipmentMaterials,record.equipmentMaterials);
  // Keep an actual active clone as the rollback target, not merely original.
  await page.evaluate(id=>__debug.avatar().setMaterialRecipe(id,null),garment);
  const originalRecord=await capture();assert.equal(originalRecord.equipmentMaterials.selections.find(x=>x.equipmentId===garment).selection,null);
  assert.equal((await restore(record)).applied,true);
  const beforeFailure=await current();
  report.lateFailure=await page.evaluate(async({value,garment})=>{
   const a=__debug.avatar(),live=a.livePresentation,prepare=live.prepareAccessory,meshRoot=__debug.scene.getObjectByName('Equipment:'+garment),refs=[];let disposed=0;
   meshRoot.traverse(m=>{if(m.isMesh){refs.push([m,m.material]);for(const material of Array.isArray(m.material)?m.material:[m.material])material.addEventListener('dispose',()=>disposed++);}});
   live.prepareAccessory=async(...args)=>{const tx=await prepare(...args);if(args[0]==='glasses'){const commit=tx.commit;tx.commit=()=>{commit();throw Error('injected-final-domain-after-material');};}return tx;};
   let result;try{result=await __debug.restoreCharacterRecord(value);}catch(error){result={error:error.message};}finally{live.prepareAccessory=prepare;}
   return{...result,previousReferencesPreserved:refs.every(([m,material])=>m.material===material),previousDisposed:disposed};
  },{value:originalRecord,garment});
  assert.match(report.lateFailure.error,/先前外观已恢复/);assert.equal(report.lateFailure.previousReferencesPreserved,true);assert.equal(report.lateFailure.previousDisposed,0);
  const rollback=await current();assert.equal(rollback.appearance,beforeFailure.appearance);assert.deepEqual(rollback.material,beforeFailure.material);
  assert.equal((await restore(originalRecord)).applied,true);assert.equal((await current()).material,null);assert.equal((await restore(record)).applied,true);
  report.cases.push({name:'late failure restores live material clones; explicit original and retry',passed:true});
  await open();const beforeMissing=await current();await page.route('**/m1b-shorts-cloth-v4-review1.json',route=>route.fulfill({status:503,body:'missing-material-recipe'}));
  report.missing=await restore(record);assert.match(report.missing.error,/HTTP 503/);assert.equal((await current()).appearance,beforeMissing.appearance);assert.equal((await current()).material,null);await page.unroute('**/m1b-shorts-cloth-v4-review1.json');
  report.cases.push({name:'cold missing material keeps previous whole look',passed:true});
  // Real route barrier: a newer single-material command cancels the old restore.
  await open();let releaseRoute,hit;const arrived=new Promise(resolve=>hit=resolve),barrier=new Promise(resolve=>releaseRoute=resolve);
  await page.route('**/m1b-shorts-cloth-v4-review1.json',async route=>{hit();await barrier;await route.continue().catch(()=>{});});
  const pendingRestore=restore(record);await Promise.race([arrived,new Promise((_,reject)=>setTimeout(()=>reject(Error('material route not reached')),30000))]);
  await page.evaluate(id=>__debug.avatar().setMaterialRecipe(id,null),garment);releaseRoute();report.cancelled=await pendingRestore;assert.equal(report.cancelled.cancelled,true);assert.equal((await current()).outfit,0);assert.equal((await current()).material,null);await page.unroute('**/m1b-shorts-cloth-v4-review1.json');
  report.cases.push({name:'newer material intent cancels pending whole-look restore',passed:true});
  const wrong=structuredClone(record);wrong.equipmentMaterials.selections.find(x=>x.equipmentId===garment).selection.recipeSha256='0'.repeat(64);seal(wrong);report.wrong=await restore(wrong);assert.match(report.wrong.error,/适配身份/);assert.equal((await current()).outfit,0);
  const legacy=structuredClone(record);delete legacy.equipmentMaterials;legacy.resourceIdentities=legacy.resourceIdentities.filter(x=>!x.id.startsWith('materials/'));seal(legacy);report.legacyAmbiguous=await restore(legacy);assert.match(report.legacyAmbiguous.error,/旧角色记录未保存/);
  report.cases.push({name:'wrong pinned material and ambiguous legacy record refused',passed:true});
  const native=JSON.parse(await fs.readFile('evidence/m2-character-runtime-fixed-v1/native-male-7586-v1-record.json','utf8'));
  report.nativeLegacy=await restore(native);assert.equal(report.nativeLegacy.applied,true);assert.equal(report.nativeLegacy.materialMigration,'legacy-record-with-no-material-variants');
  const nativeNew=await capture();assert(nativeNew.equipmentMaterials.selections.every(x=>x.selection===null));
  report.cases.push({name:'unambiguous legacy native record loads through shared cross-body path',passed:true});
  assert.equal(report.errors.length,0);report.status='technical-pass-visual-review-pending';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
