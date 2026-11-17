const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const [base,outArg]=process.argv.slice(2),out=path.resolve(outArg);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const manifest=await fetch(base+'runtime-package.json').then(r=>r.json());
 const expected=new Map(manifest.files.map(row=>[row.path,row]));
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}});
 const report={status:'incomplete',runtime:manifest.runtime,selected:manifest.selected,browser:browser.version(),network:[],generatedResourceResponses:0,errors:[],actions:[],scope:'Fresh directory/context with only declared files; development machine, normal-speed recording. Not all catalog choices, visual naturalness or target-PC acceptance.'};
 const checks=[];let page;
 const track=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('response',response=>checks.push((async()=>{
  const u=new URL(response.url());if(['blob:','data:'].includes(u.protocol)){report.generatedResourceResponses++;return;}if(u.origin!==new URL(base).origin)throw Error('Unexpected external runtime request '+u.href);
  const file=u.pathname==='/'?'index.html':u.pathname.slice(1);const row=expected.get(file);
  assert(row,'Undeclared runtime dependency '+file);assert.equal(response.status(),200,file);
  const bytes=await response.body(),sha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,row.sha256,file);assert.equal(bytes.length,row.bytes,file);
  report.network.push({file,sha256,bytes:bytes.length,status:response.status()});
 })().catch(e=>report.errors.push(String(e)))));};
 const open=async()=>{page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Network.enable',{maxTotalBufferSize:536870912,maxResourceBufferSize:268435456});track(page);await page.goto(new URL(manifest.runtime.entryUrl,base).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),manifest.runtime.buildId);};
 const restored=()=>page.evaluate(async()=>{const response=await fetch('/character-record.json'),record=await response.json();const result=await __debug.restoreCharacterRecord(record);return{result,record,current:await __debug.captureCharacterRecord({identity:record.identity})};});
 const compare=row=>{assert.equal(row.result.applied,true);assert.deepEqual(row.current.appearanceRecipe,row.record.appearanceRecipe);assert.deepEqual(row.current.liveAccessories,row.record.liveAccessories);if(row.record.equipmentMaterials)assert.deepEqual(row.current.equipmentMaterials,row.record.equipmentMaterials);else assert(row.current.equipmentMaterials.selections.every(x=>x.selection===null));};
 const task=async(id,kind,payload={})=>{await page.evaluate(r=>__debug.request(r),{requestId:id,kind,payload});await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const result=await page.evaluate(id=>__debug.tasks().get(id),id);assert.equal(result.state,'completed',JSON.stringify(result));report.actions.push(result);};
 try{
  await open();const first=await restored();compare(first);report.first=first.result;
  await Promise.all(checks);await page.close();await open();const second=await restored();compare(second);report.reopened=second.result;
  await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setPaused(false);__debug.camera('room');const stream=__debug.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__packageFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
  await task('package-walk','walk',{x:-.5,z:1.8});await task('package-sit','sit');await page.waitForTimeout(1200);await page.screenshot({path:path.join(out,'package-seated.png')});await task('package-stand','stand');
  const film=await page.evaluate(async()=>{const c=window.__packageFilm;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));});});
  await fs.writeFile(path.join(out,'package-restored-actions-1x.webm'),Buffer.from(film.split(',')[1],'base64'));
  await page.screenshot({path:path.join(out,'package-restored.png')});
  await Promise.all(checks);assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.distinctRequested=[...new Set(report.network.map(row=>row.file))].sort();
  report.unrequestedDeclarations=manifest.files.map(row=>row.path).filter(name=>!report.distinctRequested.includes(name));report.status='technical-pass-visual-review-pending';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await Promise.all(checks);await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,files:report.distinctRequested?.length,errors:report.errors}));}
})();
