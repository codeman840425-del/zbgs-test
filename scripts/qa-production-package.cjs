const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {browserConfigArgs}=require('./qa-browser-config-args.cjs');
const [base,folder,...args]=process.argv.slice(2);
(async()=>{
 const {remaining,launchOptions}=browserConfigArgs(args);
 if(remaining.includes('--cold-pair')){
  const files=remaining.filter(value=>value!=='--cold-pair');
  if(remaining.length!==2||files.length!==1||files[0].startsWith('--'))throw Error('Expected --cold-pair SIGNED_RECORD_PAIR');
  const {runColdPair}=require('./qa-production-cold-pair.cjs');
  return runColdPair(base,folder,files[0],launchOptions);
 }
 if(remaining.length>1)throw Error('Expected at most one signed records file');
 const [expectedFile]=remaining;
 const out=await projectOutput(folder,await productionRoot());
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const expected=expectedFile?JSON.parse(await fs.readFile(expectedFile,'utf8')):null;
 const session=await launchQABrowser(out,launchOptions);
 try {
 const {browser}=session,context=await browser.newContext({viewport:{width:1440,height:1000}});
 const report={status:'incomplete',browser:browser.version(),errors:[],checks:[],requests:[],failedAssetResponses:[],scope:'Two produced records restored by the shared game consumer; development machine.'};
 if(session.receipt)report.browserLaunch=session.receipt;
 context.on('response',r=>{if(r.status()>=400)report.failedAssetResponses.push({url:r.url(),status:r.status()});});
 let page;const open=async(query='records=/records/manifest.json')=>{page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>report.requests.push(r.url()));await page.goto(base+'record-consumer.html?'+query);await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});};
 const {resolveGarmentMaterials}=await import('../prototype/src/garment-material-record.js');
 const verify=async()=>{
  const records=await page.evaluate(()=>__recordConsumer.records);
  const materialRecords=Object.fromEntries(records.map(record=>{
   const recipe=record.appearanceRecipe;
   const resolved=resolveGarmentMaterials({profile:recipe.base},recipe,record.equipmentMaterials);
   return [record.identity.id,resolved];
  }));
  return page.evaluate(async materialRecords=>{const d=__recordConsumer,rows=[];for(const actor of d.actors.values()){
  const expected=d.records.find(r=>r.identity.id===actor.identity.id),actual=await actor.capture();
  rows.push({id:actor.identity.id,sha:actor.recordSha256,expectedSha:expected.integrity.recordSha256,root:actor.avatar.root.uuid,
   body:actual.appearanceRecipe.base.bodyType,eyeColor:actual.appearanceRecipe.appearance.eyeColor,
   look:JSON.stringify(actual.appearanceRecipe)===JSON.stringify(expected.appearanceRecipe),props:JSON.stringify(actual.liveAccessories)===JSON.stringify(expected.liveAccessories),materials:JSON.stringify(actual.equipmentMaterials)===JSON.stringify(materialRecords[actor.identity.id].record),legacyMaterials:materialRecords[actor.identity.id].legacy,hairCenter:JSON.stringify(actual.nativeHairCenter)===JSON.stringify(expected.nativeHairCenter)});
 }return rows;}, materialRecords);};
 const check=rows=>{assert.equal(rows.length,2);for(const row of rows)assert(row.look&&row.props&&row.materials&&row.hairCenter&&row.sha===row.expectedSha,JSON.stringify(row));assert.notEqual(rows[0].root,rows[1].root);
  if(expected)assert.deepEqual(rows.map(row=>[row.id,row.sha,row.body,row.eyeColor]),expected.map(r=>[r.identity.id,r.integrity.recordSha256,r.appearanceRecipe.base.bodyType,r.appearanceRecipe.appearance.eyeColor]));
 };
 try{
  await open();report.build=await page.evaluate(()=>__recordConsumer.buildInfo);report.first=await verify();check(report.first);
  assert.equal(await page.locator('#second').isHidden(),true);assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.evaluate(()=>{const stream=__recordConsumer.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__packageFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
  await page.waitForTimeout(8500);
  const data=await page.evaluate(async()=>{const f=__packageFilm;f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
  await fs.writeFile(path.join(out,'produced-pair-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(out,'produced-pair.png')});
  await page.close();await open();report.reopened=await verify();check(report.reopened);assert(report.reopened.every(row=>!report.first.some(old=>old.root===row.root)));report.checks.push('external CLI-created records survive page close and re-open, with complete appearance and props');
  await page.close();await open('records=/records/manifest.json&records=/bogus');
  assert.match(await page.evaluate(()=>__recordConsumer.inputFailure),/Unsupported/);assert.equal(await page.evaluate(()=>__recordConsumer.actors.size),0);report.checks.push('duplicate manifest parameter rejects without fallback');
  await page.close();await context.route(url=>url.pathname==='/records/manifest.json',route=>route.fulfill({json:{schema:'character-record-input-v1',entries:[{id:'broken',url:'/records/broken.json',recordSha256:['a'.repeat(64)]}]}}));await open();
  assert.match(await page.evaluate(()=>__recordConsumer.inputFailure),/Invalid/);assert.equal(await page.evaluate(()=>__recordConsumer.actors.size),0);report.checks.push('malformed manifest hash rejects before sidecar request');
  assert(!report.requests.some(url=>url.endsWith('/records/broken.json')||url.includes('/assets/record-consumer-v1/')));
  assert.deepEqual(report.requests.filter(url=>/^https?:/.test(url)&&new URL(url).origin!==new URL(base).origin),[]);
  assert.deepEqual(report.failedAssetResponses,[]);assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='technical-pass-visual-candidate';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{report.requests=[...new Set(report.requests)];await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure}));}
 } finally {await session.close();}
})();
