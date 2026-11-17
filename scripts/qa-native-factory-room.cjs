// Fixed-build, actual room/factory smoke. No overlay or alternate motion driver.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [directory,output,bodyType='native-female-843ac-v1',hairStyle='original',chainCamera='room']=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and new evidence directory');
const subjects={
 'native-female-843ac-v1':{sha:'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',alternate:3},
 'native-male-7586-v1':{sha:'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',alternate:null},
 'native-female-face-v1':{sha:'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce',alternate:null},
 'native-female-waist-v1':{sha:'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5',alternate:null},
};
const subject=subjects[bodyType];if(!subject)throw Error('Unknown exact factory subject');
if(process.argv.includes('--original-outfit'))subject.alternate=null;
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
  await page.goto(`http://127.0.0.1:${server.address().port}/?body=${bodyType}${hairStyle!=='original'?'&workbench=appearance':''}`);
  await page.waitForFunction(()=>__debug.ready||document.querySelector('#loading strong')?.textContent==='角色加载失败',null,{timeout:60000});
  const ready=await page.evaluate(()=>({ready:__debug.ready,error:document.querySelector('#loading')?.textContent}));
  assert(ready.ready,ready.error);
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),identity.shortId);
  if(hairStyle!=='original'){
   await page.evaluate(()=>__debug.setPaused(true));
   const style=await page.evaluate(id=>__debug.queryAppearanceCandidates().appearance.hairStyle.choices.find(c=>c.value===id),hairStyle);
   assert(style?.assetSha256,'Hair style not admitted for this exact body');report.hairCandidate=style;
   await page.locator('#appearance-hair-style').selectOption(hairStyle);
   await page.waitForFunction(id=>__debug.avatar().appearance.getState().hairStyle===id&&!__debug.avatar().appearance.getState().loading,hairStyle,{timeout:60000});
   assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().replacementSHA256),style.assetSha256);
   const stable=await page.evaluate(()=>__debug.exportAppearanceRecipe());
   const failure=await page.evaluate(async text=>{const r=JSON.parse(text);r.hairFit.sha256='0'.repeat(64);try{await __debug.importAppearanceRecipe(JSON.stringify(r));return false;}catch{return true;}},stable);
   assert(failure);assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),stable);
   await page.evaluate(async id=>{await Promise.all([__debug.avatar().appearance.set({hairStyle:'original'}),__debug.avatar().appearance.set({hairStyle:id})]);},hairStyle);
   assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().hairStyle),hairStyle);
   report.hairRejectedFitPreservesLook=true;report.hairRapidSwitchLatestWins=true;
  }
  const read=()=>page.evaluate(()=>({body:__debug.avatar().profile.sha256,debug:__debug.avatar().getDebugState(),appearance:__debug.avatar().appearance.getState(),outfit:__debug.avatar().getOutfitInfo(),snapshot:__debug.snapshot()}));
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-full-front');});
  report.states.push({name:'dressed',...(await read())});
  assert.equal(report.states[0].body,subject.sha);
  assert.equal(report.states[0].outfit.equipment.bodyTextureCoverage.covered,true);
  await page.screenshot({path:path.join(out,'dressed.png')});
  await page.evaluate(()=>__debug.setBodyMode('base'));
  report.states.push({name:'base',...(await read())});
  assert.equal(report.states[1].outfit.equipment.bodyTextureCoverage.covered,false);
  assert.equal(report.states[1].appearance.effectiveHairStyle,hairStyle);
  const nativeMaterials=await page.evaluate(()=>{let names=[];__debug.avatar().vrm.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/Body.*SKIN/.test(m.name))names.push({name:m.name,mtoon:!!m.isMToonMaterial,alpha:m.alphaTest});});return names;});
  assert(nativeMaterials.length&&nativeMaterials.every(m=>m.mtoon&&m.alpha===.5));report.baseMaterials=nativeMaterials;
  await page.screenshot({path:path.join(out,'base.png')});
  await page.evaluate(()=>__debug.setBodyMode('dressed'));
  report.states.push({name:'restored',...(await read())});
  assert.equal(report.states[2].outfit.equipment.bodyTextureCoverage.covered,true);
  await page.screenshot({path:path.join(out,'restored.png')});
  if(subject.alternate!==null){
   assert.equal((await page.evaluate(index=>__debug.setOutfit(index),subject.alternate)).applied,true);
   report.states.push({name:'customTop',...(await read())});
   const customItems=report.states.at(-1).outfit.equipment.items;
   assert.equal(customItems.top.visible,false);assert.equal(customItems.alternateTop.visible,true);
   await page.screenshot({path:path.join(out,'custom-top.png')});
  }else report.additionalTop='not supplied or tested for this exact source';
  const recipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  await fs.writeFile(path.join(out,'appearance-recipe.json'),recipe);
  assert.equal((await page.evaluate(()=>__debug.setOutfit(0))).applied,true);
  assert.equal((await page.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied,true);
  const reread=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  assert.deepEqual(JSON.parse(reread),JSON.parse(recipe));
  if(hairStyle!=='original')assert.equal(JSON.parse(reread).appearance.hairStyle,hairStyle);
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
  await page.evaluate(camera=>__debug.camera(camera),chainCamera);report.chainCamera=chainCamera;
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
  // Leave furniture before requesting a dance; a rejected request is not a
  // successful playback. Keep the actual task outcomes in this evidence.
  report.danceWalk=await page.evaluate(()=>__debug.request({requestId:'factory-dance-space',kind:'walk',payload:{x:-.5,z:1.6}}));
  await page.waitForFunction(()=>['completed','failed','cancelled'].includes(__debug.tasks().get('factory-dance-space')?.state),null,{timeout:25000});
  report.danceWalkResult=await page.evaluate(()=>__debug.tasks().get('factory-dance-space'));
  assert.equal(report.danceWalkResult.state,'completed');
  report.danceRequest=await page.evaluate(()=>__debug.request({requestId:'factory-dance',kind:'dance'}));
  assert.notEqual(report.danceRequest.task?.state,'failed',report.danceRequest.task?.reason);
  await page.waitForFunction(()=>__debug.snapshot().mode==='dance'&&__debug.snapshot().motion.danceMix>.95,null,{timeout:10000});
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
