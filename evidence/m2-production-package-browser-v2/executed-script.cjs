const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,folder]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}});
 const report={status:'incomplete',browser:browser.version(),errors:[],checks:[],requests:[],scope:'Two CLI-produced records, actual shared consumer in selected clean package; development machine, not target-PC performance.'};
 let page;const open=async(query='records=/records/manifest.json')=>{page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>report.requests.push(r.url()));await page.goto(base+'record-consumer.html?'+query);await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});};
 const verify=()=>page.evaluate(async()=>{const d=__recordConsumer,rows=[];for(const actor of d.actors.values()){
  const expected=d.records.find(r=>r.identity.id===actor.identity.id),actual=await actor.capture();
  rows.push({id:actor.identity.id,sha:actor.recordSha256,expectedSha:expected.integrity.recordSha256,root:actor.avatar.root.uuid,
   look:JSON.stringify(actual.appearanceRecipe)===JSON.stringify(expected.appearanceRecipe),props:JSON.stringify(actual.liveAccessories)===JSON.stringify(expected.liveAccessories),materials:JSON.stringify(actual.equipmentMaterials)===JSON.stringify(expected.equipmentMaterials)});
 }return rows;});
 const check=rows=>{assert.equal(rows.length,2);for(const row of rows)assert(row.look&&row.props&&row.materials&&row.sha===row.expectedSha,JSON.stringify(row));assert.notEqual(rows[0].root,rows[1].root);};
 try{
  await open();report.build=await page.evaluate(()=>__recordConsumer.buildInfo);report.first=await verify();check(report.first);
  assert.equal(await page.locator('#second').isHidden(),true);assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.evaluate(()=>{const stream=__recordConsumer.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__packageFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
  await page.waitForTimeout(8500);
  const data=await page.evaluate(async()=>{const f=__packageFilm;f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
  await fs.writeFile(path.join(out,'produced-pair-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(out,'produced-pair.png')});
  await page.close();await open();report.reopened=await verify();check(report.reopened);report.checks.push('external CLI-created records survive page close and re-open, with complete appearance and props');
  await page.close();await open('records=/records/manifest.json&records=/bogus');
  assert.match(await page.evaluate(()=>__recordConsumer.inputFailure),/Unsupported/);assert.equal(await page.evaluate(()=>__recordConsumer.actors.size),0);report.checks.push('duplicate manifest parameter rejects without fallback');
  await page.close();await context.route('**/records/manifest.json',route=>route.fulfill({json:{schema:'character-record-input-v1',entries:[{id:'broken',url:'/records/broken.json',recordSha256:['a'.repeat(64)]}]}}));await open();
  assert.match(await page.evaluate(()=>__recordConsumer.inputFailure),/Invalid/);assert.equal(await page.evaluate(()=>__recordConsumer.actors.size),0);report.checks.push('malformed manifest hash rejects before sidecar request');
  assert(!report.requests.some(url=>url.endsWith('/records/broken.json')||url.includes('/assets/record-consumer-v1/')));
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='technical-pass-visual-candidate';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser.close();report.requests=[...new Set(report.requests)];await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure}));}
})();
