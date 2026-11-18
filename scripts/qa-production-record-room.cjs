const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,recordFile,folder]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{const {canonicalJson}=await import('../prototype/src/character-record.js');const record=JSON.parse(await fs.readFile(recordFile,'utf8'));await fs.mkdir(out,{recursive:false});await fs.copyFile(recordFile,path.join(out,'input-record.json'));await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),report={status:'incomplete',identity:record.identity,recordSha256:record.integrity.recordSha256,errors:[],tasks:[]};
 page.on('pageerror',e=>report.errors.push(e.message));
 const task=async(id,kind,payload={})=>{await page.evaluate(request=>__debug.request(request),{requestId:id,kind,payload});await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const value=await page.evaluate(id=>__debug.tasks().get(id),id);assert.equal(value.state,'completed',JSON.stringify(value));report.tasks.push(value);};
 try{
  const url=new URL(base);url.searchParams.set('workbench','appearance');url.searchParams.set('body',record.appearanceRecipe.base.bodyType);
  const expectedFit=process.env.QA_NATIVE_HAIR_CENTER;
  if(expectedFit)url.searchParams.set('nativeHairCenter',expectedFit);
  await page.goto(url.href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});report.build=await page.evaluate(()=>__debug.buildInfo);
  const loaded=await page.evaluate(record=>__debug.restoreCharacterRecord(record),record);assert.equal(loaded.applied,true);report.restored=loaded;
  await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setPaused(false);__debug.camera('room');const stream=__debug.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__roomProductionFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
  await task('produced-walk','walk',{x:-.5,z:1.8});await task('produced-sit','sit');await page.waitForTimeout(1200);await task('produced-stand','stand');await task('produced-leave','walk',{x:-1.4,z:1.7});
  const data=await page.evaluate(async()=>{const f=__roomProductionFilm;f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
  await fs.writeFile(path.join(out,'room-produced-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(out,'room-produced.png')});
  const final=await page.evaluate(identity=>__debug.captureCharacterRecord({identity}),record.identity);for(const key of ['appearanceRecipe','liveAccessories','equipmentMaterials'])assert.equal(canonicalJson(final[key]),canonicalJson(record[key]),key);
  if(expectedFit){
    assert.equal(await page.evaluate(()=>__debug.avatar().nativeHairCenterFit),expectedFit);
    const fresh=await browser.newPage();
    try {
      fresh.on('pageerror',error=>report.errors.push(error.message));
      await fresh.goto(url.href);
      await fresh.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
      assert.equal((await fresh.evaluate(r=>__debug.restoreCharacterRecord(r),final)).applied,true);
      const fit=await fresh.evaluate(()=>__debug.avatar().nativeHairCenterFit);
      assert.equal(fit,expectedFit);
      const reread=await fresh.evaluate(identity=>__debug.captureCharacterRecord({identity}),record.identity);
      for(const key of ['appearanceRecipe','liveAccessories','equipmentMaterials'])assert.equal(canonicalJson(reread[key]),canonicalJson(final[key]),key);
      report.previewFitAfterFreshRestore=fit;
    }finally{await fresh.close();}
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='technical-pass-visual-candidate';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure}));}
})();
