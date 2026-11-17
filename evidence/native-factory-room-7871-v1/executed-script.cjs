// Fixed-build, actual room/factory smoke. No overlay or alternate motion driver.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and new evidence directory');
(async()=>{
 const folder=path.resolve(directory),out=path.resolve(output);
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const identity=JSON.parse(await fs.readFile(path.join(folder,'build-info.json'),'utf8'));
 const report={status:'incomplete',build:identity.shortId,folder,errors:[],states:[],scope:'Actual fixed room and shared factory/controller; short development-machine check, not full contact or visual acceptance'};
 let browser,server,page;
 try{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.vrm':'model/gltf-binary','.glb':'model/gltf-binary'};
  server=require('node:http').createServer(async(req,res)=>{try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const file=path.resolve(folder,'.'+(name==='/'?'/index.html':name));
   if(!file.startsWith(folder+path.sep)){res.writeHead(403).end();return;}
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?body=native-female-843ac-v1`);
  await page.waitForFunction(()=>__debug.ready||document.querySelector('#loading strong')?.textContent==='角色加载失败',null,{timeout:60000});
  const ready=await page.evaluate(()=>({ready:__debug.ready,error:document.querySelector('#loading')?.textContent}));
  assert(ready.ready,ready.error);
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),identity.shortId);
  const read=()=>page.evaluate(()=>({body:__debug.avatar().profile.sha256,debug:__debug.avatar().getDebugState(),appearance:__debug.avatar().appearance.getState(),outfit:__debug.avatar().getOutfitInfo(),snapshot:__debug.snapshot()}));
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-full-front');});
  report.states.push({name:'dressed',...(await read())});
  assert.equal(report.states[0].outfit.equipment.bodyTextureCoverage.covered,true);
  await page.screenshot({path:path.join(out,'dressed.png')});
  await page.evaluate(()=>__debug.setBodyMode('base'));
  report.states.push({name:'base',...(await read())});
  assert.equal(report.states[1].outfit.equipment.bodyTextureCoverage.covered,false);
  assert.equal(report.states[1].appearance.effectiveHairStyle,'original');
  const nativeMaterials=await page.evaluate(()=>{let names=[];__debug.avatar().vrm.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/Body.*SKIN/.test(m.name))names.push({name:m.name,mtoon:!!m.isMToonMaterial,alpha:m.alphaTest});});return names;});
  assert(nativeMaterials.length&&nativeMaterials.every(m=>m.mtoon&&m.alpha===.5));report.baseMaterials=nativeMaterials;
  await page.screenshot({path:path.join(out,'base.png')});
  await page.evaluate(()=>__debug.setBodyMode('dressed'));
  report.states.push({name:'restored',...(await read())});
  assert.equal(report.states[2].outfit.equipment.bodyTextureCoverage.covered,true);
  await page.screenshot({path:path.join(out,'restored.png')});
  assert.equal((await page.evaluate(()=>__debug.setOutfit(3))).applied,true);
  report.states.push({name:'customTop',...(await read())});
  const customItems=report.states.at(-1).outfit.equipment.items;
  assert.equal(customItems.top.visible,false);assert.equal(customItems.alternateTop.visible,true);
  await page.screenshot({path:path.join(out,'custom-top.png')});
  const recipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  await fs.writeFile(path.join(out,'appearance-recipe.json'),recipe);
  assert.equal((await page.evaluate(()=>__debug.setOutfit(0))).applied,true);
  assert.equal((await page.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied,true);
  const reread=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  assert.deepEqual(JSON.parse(reread),JSON.parse(recipe));
  report.recipe={bytes:Buffer.byteLength(recipe),exactParsedRestore:true};
  report.states.push({name:'recipeRestored',...(await read())});
  // A new page must restore the complete recorded outfit without in-memory
  // attachment state from the first instance.
  const roomUrl=page.url();
  await page.close();page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(roomUrl);
  await page.waitForFunction(()=>__debug.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),identity.shortId);
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-full-front');});
  assert.equal((await page.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied,true);
  assert.deepEqual(JSON.parse(await page.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(recipe));
  report.recipe.freshPageRestore=true;
  report.states.push({name:'freshPageRestored',...(await read())});
  await page.screenshot({path:path.join(out,'fresh-page-restored.png')});
  await page.evaluate(()=>__debug.route('horizontal'));
  await page.waitForTimeout(350);
  await page.evaluate(()=>{
   const canvas=__debug.renderer.domElement,stream=canvas.captureStream(30),chunks=[];
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
   window.factoryCapture={recorder,stream,chunks,started:performance.now(),done:new Promise(resolve=>recorder.onstop=resolve)};
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
   __debug.setPaused(false);
  });
  await page.waitForTimeout(13000);
  report.states.push({name:'afterWalk',...(await read())});
  await page.evaluate(()=>__debug.action('idle'));
  await page.waitForFunction(()=>__debug.snapshot().speed<.01&&__debug.snapshot().motion.transitionComplete,null,{timeout:10000});
  report.states.push({name:'stopped',...(await read())});
  await page.evaluate(()=>__debug.action('sit'));
  await page.waitForFunction(()=>__debug.snapshot().mode==='sit'&&__debug.snapshot().motion.sitProgress>.999,null,{timeout:25000});
  await page.waitForTimeout(1500);
  report.states.push({name:'seated',...(await read())});
  await page.screenshot({path:path.join(out,'seated-room.png')});
  await page.evaluate(()=>__debug.action('stand'));
  await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress<.001&&__debug.snapshot().motion.transitionComplete,null,{timeout:12000});
  report.states.push({name:'standingAgain',...(await read())});
  await page.evaluate(()=>__debug.action('dance'));
  await page.waitForTimeout(4500);
  report.states.push({name:'dance',...(await read())});
  await page.evaluate(()=>__debug.action('idle'));
  await page.waitForFunction(()=>__debug.snapshot().motion.danceMix<.001,null,{timeout:10000});
  const video=await page.evaluate(async()=>{const c=window.factoryCapture;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());const blob=new Blob(c.chunks,{type:'video/webm'});const data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});return{data,elapsed:performance.now()-c.started};});
  await fs.writeFile(path.join(out,'native-factory-chain-1x.webm'),Buffer.from(video.data.split(',')[1],'base64'));
  report.recording={milliseconds:video.elapsed,rate:1,file:'native-factory-chain-1x.webm'};
  report.states.push({name:'endIdle',...(await read())});
  await page.screenshot({path:path.join(out,'end-idle.png')});
  assert(!report.errors.length,report.errors.join('\n'));
  report.status='technical-smoke-passed-visual-review-pending';
 }catch(error){
  report.status='failed';report.error=String(error.stack||error);process.exitCode=1;
  if(page)try{
   await page.screenshot({path:path.join(out,'failure.png')});
   report.failureSnapshot=await page.evaluate(()=>__debug.ready?__debug.snapshot():null);
   const partial=await page.evaluate(async()=>{const c=window.factoryCapture;if(!c)return null;if(c.recorder.state!=='inactive')c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));});});
   if(partial)await fs.writeFile(path.join(out,'failure-partial-1x.webm'),Buffer.from(partial.split(',')[1],'base64'));
  }catch(captureError){report.failureCaptureError=String(captureError);}
 }
 finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build,error:report.error,out}));}
})();
