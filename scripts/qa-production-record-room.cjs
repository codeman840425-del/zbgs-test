const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const [base,recordFile,folder]=process.argv.slice(2);
(async()=>{const out=await projectOutput(folder,await productionRoot());
 const {canonicalJson}=await import('../prototype/src/character-record.js');const record=JSON.parse(await fs.readFile(recordFile,'utf8'));await fs.mkdir(out,{recursive:false});await fs.copyFile(recordFile,path.join(out,'input-record.json'));await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={status:'incomplete',identity:record.identity,recordSha256:record.integrity.recordSha256,errors:[],tasks:[]};
 let session,page;
 const task=async(id,kind,payload={})=>{await page.evaluate(request=>{
   window.__roomProductionFilm.phase=request.kind;
   return __debug.request(request);
 },{requestId:id,kind,payload});await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const value=await page.evaluate(id=>__debug.tasks().get(id),id);assert.equal(value.state,'completed',JSON.stringify(value));report.tasks.push(value);};
 try{
  session=await launchQABrowser(out,{channel:'chrome'});
  const {browser}=session;
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  const url=new URL(base);url.searchParams.set('workbench','appearance');url.searchParams.set('body',record.appearanceRecipe.base.bodyType);
  const previewOverride=process.env.QA_NATIVE_HAIR_CENTER;
  const expectedFit=record.nativeHairCenter?.id ?? previewOverride;
  if(previewOverride)url.searchParams.set('nativeHairCenter',previewOverride);
  await page.goto(url.href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});report.build=await page.evaluate(()=>__debug.buildInfo);
  const loaded=await page.evaluate(record=>__debug.restoreCharacterRecord(record),record);assert.equal(loaded.applied,true);report.restored=loaded;
  const cameraStart = await page.evaluate(() => {
    __debug.setPlaybackRate(1); __debug.setPaused(false); __debug.camera('room');
    return __debug.snapshot().simulationTime;
  });
  // The room preset interpolates for half a simulation second. A rendered frame
  // alone can still be the previous close-up at the start of that transition.
  await page.waitForFunction(start => {
    const state = __debug.snapshot();
    return state.camera.mode === 'room' && state.simulationTime - start >= 0.6;
  }, cameraStart);
  report.recordingCamera = await page.evaluate(async () => {
    const before = __debug.snapshot().camera;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const after = __debug.snapshot().camera;
    const stationary = ['position','target'].every(key =>
      before[key].every((x, i) => Math.abs(x - after[key][i]) < 1e-6));
    if (!stationary) throw Error('Room camera was still moving before recording');
    return after;
  });
  await page.evaluate(async()=>{
    const stream=__debug.renderer.domElement.captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
    window.__roomProductionFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};
    const film=window.__roomProductionFilm;
    film.intervals=[];
    film.phase='opening';
    let last;
    const sample=time=>{
      if(last!==undefined && film.intervals.length<12000) film.intervals.push([film.phase,Math.round((time-last)*100)/100]);
      last=time;film.timer=requestAnimationFrame(sample);
    };
    film.timer=requestAnimationFrame(sample);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.start();
  });
  await task('produced-walk','walk',{x:-.5,z:1.8});await task('produced-sit','sit');await page.waitForTimeout(1200);await task('produced-stand','stand');await task('produced-leave','walk',{x:-1.4,z:1.7});
  const data=await page.evaluate(async()=>{const f=__roomProductionFilm;cancelAnimationFrame(f.timer);f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
  report.frameTiming=await page.evaluate(()=>{
    const f=window.__roomProductionFilm;
    const gl=__debug.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
    const ms=f.intervals.map(row=>row[1]).sort((a,b)=>a-b);
    const quantile=p=>ms[Math.max(0,Math.ceil(p*ms.length)-1)]??null;
    return {unit:'ms', measurement:'browser rAF during 1x recording', browser:navigator.userAgent,
      renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,
      p50:quantile(.5),p95:quantile(.95),p99:quantile(.99),max:ms.at(-1)??null,
      over33ms:ms.filter(n=>n>33.34).length,intervals:f.intervals};
  });
  await fs.writeFile(path.join(out,'room-produced-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(out,'room-produced.png')});
  const final=await page.evaluate(identity=>__debug.captureCharacterRecord({identity}),record.identity);for(const key of ['appearanceRecipe','liveAccessories','equipmentMaterials'])assert.equal(canonicalJson(final[key]),canonicalJson(record[key]),key);
  if(expectedFit){
    assert.equal(await page.evaluate(()=>__debug.avatar().nativeHairCenterFit),expectedFit);
    if(record.nativeHairCenter)assert.deepEqual(final.nativeHairCenter,record.nativeHairCenter);
  }
    await page.close();
    const fresh=await browser.newPage();
    try {
      fresh.on('pageerror',error=>report.errors.push(error.message));
      await fresh.goto(url.href);
      await fresh.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
      assert.equal((await fresh.evaluate(r=>__debug.restoreCharacterRecord(r),final)).applied,true);
      const fit=await fresh.evaluate(()=>__debug.avatar().nativeHairCenterFit);
      assert.equal(fit,expectedFit??null);
      const reread=await fresh.evaluate(identity=>__debug.captureCharacterRecord({identity}),record.identity);
      for(const key of ['appearanceRecipe','liveAccessories','equipmentMaterials'])assert.equal(canonicalJson(reread[key]),canonicalJson(final[key]),key);
      if(record.nativeHairCenter){
        assert.deepEqual(reread.nativeHairCenter,record.nativeHairCenter);
        report.savedFitAfterFreshRestore=reread.nativeHairCenter;
      }else if(expectedFit) report.previewFitAfterFreshRestore=fit;
      assert.deepEqual(reread.identity,final.identity);
      report.freshRestore={bodyType:reread.appearanceRecipe.base.bodyType,identity:reread.identity};
    }finally{await fresh.close();}
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='technical-pass-visual-candidate';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{
  try{await session?.close();}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure}));}
 }
})();
