const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const [base,outArg]=process.argv.slice(2);
(async()=>{
 const out=await projectOutput(outArg,await productionRoot());
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={status:'incomplete',viewport:{width:1440,height:1000},errors:[],checks:[],scope:'Actual shared loaders/motions with no workbench DOM or drafts. Development-machine functional/visual candidate; no target-PC performance or general compatibility claim.'};
 let session,context,page;
 const open=async()=>{page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'record-consumer.html');await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});};
 const verify=async()=>page.evaluate(async()=>{const d=__recordConsumer,rows=[];for(const actor of d.actors.values()){
   const expected=d.records.find(r=>r.identity.id===actor.identity.id),actual=await actor.capture();
   rows.push({id:actor.identity.id,sha:actor.recordSha256,expectedSha:expected.integrity.recordSha256,
    lookEqual:JSON.stringify(actual.appearanceRecipe)===JSON.stringify(expected.appearanceRecipe),
    propsEqual:JSON.stringify(actual.liveAccessories)===JSON.stringify(expected.liveAccessories),
    materialEqual:expected.equipmentMaterials?JSON.stringify(actual.equipmentMaterials)===JSON.stringify(expected.equipmentMaterials):actual.equipmentMaterials.selections.every(s=>s.selection===null),
    joints:actor.avatar.vrm.humanoid.getRawBoneNode('head').uuid,root:actor.avatar.root.uuid});}return rows;});
 const checkRows=rows=>{assert.equal(rows.length,2);for(const row of rows){assert.equal(row.sha,row.expectedSha);assert(row.lookEqual&&row.propsEqual&&row.materialEqual,JSON.stringify(row));}assert.notEqual(rows[0].joints,rows[1].joints);};
 async function film(name){
  await page.evaluate(()=>{const stream=__recordConsumer.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__consumerFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
  await page.waitForTimeout(8500);
  const data=await page.evaluate(async()=>{const f=__consumerFilm;f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
  await fs.writeFile(path.join(out,name+'-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(out,name+'.png')});
 }
 try{
  session=await launchQABrowser(out,{channel:'chrome'});
  const {browser}=session;
  context=await browser.newContext({viewport:report.viewport});report.browser=browser.version();
  await open();report.build=await page.evaluate(()=>__recordConsumer.buildInfo);report.first=await verify();checkRows(report.first);
  assert.equal(await page.locator('#appearance-fields').count(),0);assert.equal(await page.evaluate(()=>localStorage.length),0);
  await film('native-pair');report.checks.push('native pair complete records without workbench/drafts');
  const isolated=await page.evaluate(async()=>{const [a,b]=[...__recordConsumer.actors.values()],before=await b.capture();await a.avatar.livePresentation.setAccessory('glasses',false);a.avatar.livePresentation.setExpression('happy');const after=await b.capture();return{same:JSON.stringify(before.appearanceRecipe)===JSON.stringify(after.appearanceRecipe)&&JSON.stringify(before.liveAccessories)===JSON.stringify(after.liveAccessories),a:a.avatar.livePresentation.getState(),b:b.avatar.livePresentation.getState()};});assert(isolated.same);report.isolation=isolated;
  // Real HTTP failure on only the old-male body; first item must remain alive.
  await page.route('**/assets/foundation/base-male-roundtrip.vrm',route=>route.fulfill({status:503,body:'injected resource unavailable'}));
  report.partial=await page.evaluate(()=>__recordConsumer.selectGroup(1));assert.deepEqual(report.partial.items.map(i=>i.status),['completed','failed']);
  const survivor=await page.evaluate(()=>[...__recordConsumer.actors.values()][0].avatar.root.uuid);
  await page.unroute('**/assets/foundation/base-male-roundtrip.vrm');report.retry=await page.evaluate(()=>__recordConsumer.retry());assert.deepEqual(report.retry.items.map(i=>i.status),['completed','completed']);assert.deepEqual(report.retry.items.map(i=>i.attempt),[1,2]);
  assert.equal(await page.evaluate(()=>[...__recordConsumer.actors.values()][0].avatar.root.uuid),survivor);report.second=await verify();checkRows(report.second);await film('mixed-pair');report.checks.push('partial failure retains first actor; retry only failed record');
  // Same-body two identities must still own separate skeletons/accessories.
  report.sameBody=await page.evaluate(()=>__recordConsumer.selectGroup(0,[__recordConsumer.records[0],__recordConsumer.records[2]]));assert(report.sameBody.items.every(i=>i.status==='completed'));checkRows(await verify());
  const sameIsolation=await page.evaluate(async()=>{const [a,b]=[...__recordConsumer.actors.values()];const previous=await b.capture();await a.avatar.livePresentation.setAccessory('mic',false);return{otherUnchanged:JSON.stringify((await b.capture()).liveAccessories)===JSON.stringify(previous.liveAccessories),aLoaded:a.avatar.livePresentation.getState().accessories.mic.loaded,bLoaded:b.avatar.livePresentation.getState().accessories.mic.loaded};});assert(sameIsolation.otherUnchanged&&!sameIsolation.aLoaded&&sameIsolation.bLoaded);report.sameBodyIsolation=sameIsolation;
  // Hold a real body response, revoke the attempt, then allow completion.
  let releaseGate,hitGate;const held=new Promise(r=>releaseGate=r),hit=new Promise(r=>hitGate=r);
  await page.route('**/*.vrm',async route=>{hitGate();await held;await route.continue();});
  await page.evaluate(()=>{window.__cancelledRun=__recordConsumer.selectGroup(0);});await Promise.race([hit,new Promise((_,reject)=>setTimeout(()=>reject(Error('No body request')),15000))]);
  await page.evaluate(()=>__recordConsumer.cancel());releaseGate();report.cancelled=await page.evaluate(()=>window.__cancelledRun);await page.unroute('**/*.vrm');assert(report.cancelled.items.every(i=>i.status==='cancelled'));assert.equal(await page.evaluate(()=>__recordConsumer.actors.size),0);report.checks.push('cancelled pending real body never enters scene');
  // Corrupt envelope and unsupported version fail per row before loading.
  report.invalid=await page.evaluate(()=>{const a=structuredClone(__recordConsumer.records[0]),b=structuredClone(__recordConsumer.records[1]);a.identity.name+='corrupt';b.schema='unsupported';return __recordConsumer.selectGroup(0,[a,b]);});assert.deepEqual(report.invalid.items.map(i=>i.status),['failed','failed']);assert.equal(await page.evaluate(()=>__recordConsumer.actors.size),0);
  await page.close();await open();report.reopened=await verify();checkRows(report.reopened);assert.deepEqual(report.reopened.map(r=>r.sha),report.first.map(r=>r.sha));report.checks.push('fresh page reconstructs final records exactly');
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='technical-pass-visual-candidate';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{
  try{await session?.close();}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks}));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
