// Actual fixed room UI, native-authored independent texture, recipe and face motion.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const esbuild=require('../prototype/node_modules/esbuild');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and fresh output directory');
const repo=path.resolve(__dirname,'..'),digest=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const root=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const build=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
 const report={build,status:'incomplete',errors:[],checks:[],scope:'Native male7586 one green authored iris, actual independent texture/UI/cold recipe restore and close live expression. Development device only.'};
 let browser,server,page,context;
 try{
  const helper=await fs.readFile(path.join(__dirname,'native-hair-reference-loader.mjs'),'utf8');
  const compiled=Buffer.from((await esbuild.build({stdin:{contents:helper,resolveDir:repo,sourcefile:'reference.js'},nodePaths:[path.join(repo,'prototype/node_modules')],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].contents);
  const bytes=await fs.readFile(path.join(repo,'assets-source/native-vroid-iris-study-v1/generated/male-iris-green.vrm'));
  const sourceSHA='bbe292aa51dcb1a6cb455ec87b0156b332574f456a9d36df62305657f406d51f';assert.equal(digest(bytes),sourceSHA);
  await fs.writeFile(path.join(out,'reference-loader.mjs'),compiled);report.referenceLoaderSHA=digest(compiled);
  server=require('node:http').createServer(async(req,res)=>{try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('path');
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  context=await browser.newContext({viewport:{width:1440,height:1000}});
  async function open(){
   page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
   await page.goto(`http://127.0.0.1:${server.address().port}/?workbench=appearance&body=native-male-7586-v1`);
   await page.waitForFunction(()=>__debug.ready,null,{timeout:60000});assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);
   await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-face-front');__debug.avatar().vrm.expressionManager.resetValues();__debug.avatar().vrm.expressionManager.update();});
  }
  await open();
  let documents=0;page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++;});
  const options=await page.locator('#appearance-eye-color option').evaluateAll(options=>options.map(o=>o.value));assert.deepEqual(options,['original','green']);
  assert.equal(await page.locator('#appearance-eye-color').isDisabled(),false);
  for(const id of ['appearance-hair-color','appearance-skin-tone','appearance-lip-color'])assert(await page.locator('#'+id).isDisabled());
  await page.screenshot({path:path.join(out,'original-close.png')});
  report.originalRecipe=JSON.parse(await page.evaluate(()=>__debug.exportAppearanceRecipe()));
  await page.locator('#appearance-eye-color').selectOption('green');
  await page.waitForFunction(()=>__debug.avatar().appearance.getState().eyeColor==='green'&&!__debug.avatar().appearance.getState().facialPaletteLoading,null,{timeout:30000});
  await page.screenshot({path:path.join(out,'green-independent-close.png')});
  const greenRecipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  report.greenState=await page.evaluate(()=>__debug.avatar().appearance.getState());
  assert.equal(documents,0);report.checks.push('Actual UI lists only admitted native original/green; color changes without document reload');
  const rejected=await page.evaluate(async()=>{
   const before=__debug.exportAppearanceRecipe();const direct=await __debug.avatar().appearance.set({eyeColor:'blue'});
   const bad=JSON.parse(before);bad.paletteVersion='native-iris-palette-v1:'+'0'.repeat(64);
   let rejected=false;try{await __debug.importAppearanceRecipe(JSON.stringify(bad));}catch{rejected=true;}
   return {direct,rejected,unchanged:before===__debug.exportAppearanceRecipe()};
  });assert.equal(rejected.direct.applied,false);assert(rejected.rejected&&rejected.unchanged);report.rejected=rejected;
  await page.route('**/__hair_reference__/loader.mjs',r=>r.fulfill({contentType:'text/javascript',body:compiled}));
  await page.route('**/__hair_reference__/model.vrm',r=>r.fulfill({contentType:'model/gltf-binary',body:bytes}));
  report.reference=await page.evaluate(async hash=>(await import('/__hair_reference__/loader.mjs')).install(hash),sourceSHA);
  await page.waitForTimeout(100);await page.screenshot({path:path.join(out,'green-author-close.png')});
  await page.evaluate(()=>__hairReference.dispose());
  // Diagnostic expression endpoints are separate from the shared real-time clip below.
  for(const [name,values] of [['blink',{blink:1}],['mouth',{aa:.8}],['smile',{happy:.65}],['neutral',{}]]){
   await page.evaluate(values=>{const e=__debug.avatar().vrm.expressionManager;e.resetValues();for(const [key,value]of Object.entries(values))e.setValue(key,value);e.update();},values);
   await page.waitForTimeout(80);await page.screenshot({path:path.join(out,name+'.png')});
  }
  const quick=await page.evaluate(async()=>{const a=__debug.avatar().appearance;await Promise.all([a.set({eyeColor:'original'}),a.set({eyeColor:'green'})]);return a.getState();});assert.equal(quick.eyeColor,'green');
  await page.locator('#appearance-hair-style').selectOption('native-male-hairset001-v1');
  await page.waitForFunction(()=>__debug.avatar().appearance.getState().hairStyle==='native-male-hairset001-v1'&&!__debug.avatar().appearance.getState().loading,null,{timeout:60000});
  const combined=await page.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(out,'combined-recipe.json'),combined);
  await page.close();await open();
  assert.equal((await page.evaluate(r=>__debug.importAppearanceRecipe(r),combined)).applied,true);
  assert.deepEqual(JSON.parse(await page.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(combined));
  report.checks.push('Independent native hair + green iris recipe restores after closing the page');
  await page.screenshot({path:path.join(out,'combined-cold-restore.png')});
  // Single existing simulation clock; real gaze, blinking and speech updates.
  await page.evaluate(()=>{
   __debug.command({type:'speaking',value:true});__debug.command({type:'expression',name:'happy'});
   __debug.command({type:'gaze',target:[0,1.5,3]});__debug.setPlaybackRate(1);
   const stream=__debug.renderer.domElement.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
   const ended=new Promise(r=>rec.onstop=r);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__irisMovie={stream,chunks,rec,ended};
   window.__irisSamples=[];window.__irisInterval=setInterval(()=>{const a=__debug.avatar(),e=a.vrm.expressionManager;__irisSamples.push({t:__debug.snapshot().simulationTime,blink:e.getValue('blink'),aa:e.getValue('aa'),happy:e.getValue('happy'),eye:a.vrm.humanoid.getRawBoneNode('leftEye').quaternion.toArray()});},100);
   rec.start();__debug.setPaused(false);
  });
  await page.waitForTimeout(6000);await page.evaluate(()=>__debug.command({type:'gaze',target:[1.2,1.45,2.5]}));await page.waitForTimeout(6000);
  const capture=await page.evaluate(async()=>{const m=__irisMovie;m.rec.stop();await m.ended;m.stream.getTracks().forEach(t=>t.stop());clearInterval(__irisInterval);__debug.setPaused(true);return{data:[...new Uint8Array(await new Blob(m.chunks).arrayBuffer())],samples:__irisSamples};});
  await fs.writeFile(path.join(out,'live-face-1x.webm'),Buffer.from(capture.data));report.liveSamples=capture.samples;
  assert(capture.samples.length>80);assert(capture.samples.some(s=>s.blink>.5));assert(capture.samples.some(s=>s.aa>.05));
  assert(new Set(capture.samples.map(s=>s.eye.map(x=>x.toFixed(4)).join(','))).size>2);
  report.checks.push('Normal-speed shared speech, blink and gaze update together; no separate animation driver');
  await page.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'gaze',target:null});__debug.command({type:'expression',name:'neutral'});});
  assert.equal((await page.evaluate(()=>__debug.avatar().appearance.set({reset:true}))).applied,true);
  assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().eyeColor),'original');
  assert.equal((await page.evaluate(r=>__debug.importAppearanceRecipe(r),greenRecipe)).applied,true);
  await page.locator('[data-appearance-group="female"]').click();await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='female',null,{timeout:60000});
  assert.equal(await page.locator('#appearance-eye-color option').count(),5);
  // A green legacy color cannot silently become an admitted native-female color.
  await page.locator('#appearance-body').selectOption('native-female-843ac-v1');
  await page.waitForFunction(()=>!document.querySelector('#appearance-body').disabled,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.avatar().profile.bodyType),'female');
  assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().eyeColor),'green');
  report.checks.push('Unsupported cross-body color retains the old whole actor and reports rejection');
  await page.locator('#appearance-eye-color').selectOption('original');
  await page.waitForFunction(()=>__debug.avatar().appearance.getState().eyeColor==='original');
  await page.locator('#appearance-body').selectOption('native-female-843ac-v1');
  await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='native-female-843ac-v1',null,{timeout:60000});
  assert(await page.locator('#appearance-eye-color').isDisabled());assert.deepEqual(await page.locator('#appearance-eye-color option').evaluateAll(o=>o.map(x=>x.value)),['original']);
  assert.deepEqual(report.errors,[]);report.status='native-iris-technical-flow-passed-visual-review-pending';
 }catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:build.shortId,error:report.error}));}
})();
