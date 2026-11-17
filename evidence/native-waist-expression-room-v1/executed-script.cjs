// Fixed game build. Both subjects use the shared room actor, clock and expressions.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const [directory,output,variant='face']=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and a fresh evidence directory');
const subjects=[
 {id:'native-female-843ac-v1',name:'before',sha:'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'},
 {id:'native-female-face-v1',name:'after',sha:'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce'},
];
assert(['face','waist'].includes(variant));
if(variant==='waist')subjects[1]={id:'native-female-waist-v1',name:'after',sha:'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5'};
// The original full-skin source is geometry-equivalent to the authored baseline;
// the paired source comparison is sealed in native-geometry-production-independent-v1.
(async()=>{
 const root=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const build=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
 const report={build,variant,status:'incomplete',errors:[],subjects:[],checks:[],scope:'Actual shared room source variant. Paired same-camera normal-speed expression check, not complete geometry editing or general compatibility acceptance.'};
 let server,browser,page;
 try{
  server=require('node:http').createServer(async(req,res)=>{try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
   if(!file.startsWith(root+path.sep))throw Error('path');
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true});
  report.browser=browser.version();report.viewport={width:1440,height:1000};report.environment='Windows development machine, Ryzen 9 9950X3D + RTX4090; not ordinary-PC acceptance';
  const context=await browser.newContext({viewport:report.viewport});
  for(const subject of subjects){
   page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
   await page.goto(`http://127.0.0.1:${server.address().port}/?workbench=appearance&body=${subject.id}&view=inspect-face-front`);
   await page.waitForFunction(()=>__debug.ready,null,{timeout:60000});
   assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);
   assert.equal(await page.evaluate(()=>__debug.avatar().profile.sha256),subject.sha);
   await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-face-front');});
   const entry={...subject,stills:[],samples:[]};report.subjects.push(entry);
   for(const camera of ['inspect-face-front','inspect-face-side','inspect-half-front']){
    await page.evaluate(c=>__debug.camera(c),camera);await page.waitForTimeout(150);
    const file=`${subject.name}-${camera}.png`;await page.screenshot({path:path.join(out,file)});entry.stills.push(file);
   }
   await page.evaluate(()=>__debug.camera('inspect-face-front'));
   // Static stress poses expose eyelid/eye/teeth relationships; normal clock clips follow.
   for(const [pose,values] of Object.entries({closed:{blink:1},mouth:{aa:.8},smile:{happy:.65},combined:{happy:.65,blink:1,oh:.66}})){
    await page.evaluate(values=>{const e=__debug.avatar().vrm.expressionManager;e.resetValues();for(const [k,v] of Object.entries(values))e.setValue(k,v);e.update();},values);
    await page.waitForTimeout(150);const file=`${subject.name}-${pose}.png`;await page.screenshot({path:path.join(out,file)});entry.stills.push(file);
   }
   await page.evaluate(()=>{
    __debug.avatar().vrm.expressionManager.resetValues();__debug.avatar().vrm.expressionManager.update();
    __debug.command({type:'speaking',value:true});__debug.command({type:'expression',name:'happy'});__debug.command({type:'gaze',target:[0,1.5,3]});__debug.setPlaybackRate(1);
    const stream=__debug.renderer.domElement.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
    const ended=new Promise(r=>rec.onstop=r);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__faceCapture={stream,chunks,rec,ended,samples:[]};
    __faceCapture.interval=setInterval(()=>{const a=__debug.avatar(),e=a.vrm.expressionManager,s=__debug.snapshot();__faceCapture.samples.push({t:s.simulationTime,frame:s.frameMs,blink:e.getValue('blink'),aa:e.getValue('aa'),happy:e.getValue('happy'),eye:a.vrm.humanoid.getRawBoneNode('leftEye').quaternion.toArray()});},100);
    rec.start();__debug.setPaused(false);
   });
   await page.waitForTimeout(6000);await page.evaluate(()=>__debug.command({type:'gaze',target:[1.2,1.45,2.5]}));await page.waitForTimeout(6000);
   const capture=await page.evaluate(async()=>{const m=__faceCapture;m.rec.stop();await m.ended;m.stream.getTracks().forEach(t=>t.stop());clearInterval(m.interval);__debug.setPaused(true);return{data:[...new Uint8Array(await new Blob(m.chunks).arrayBuffer())],samples:m.samples};});
   entry.video=`${subject.name}-face-1x.webm`;entry.samples=capture.samples;await fs.writeFile(path.join(out,entry.video),Buffer.from(capture.data));
   assert(capture.samples.length>80);assert(capture.samples.some(s=>s.blink>.5));assert(capture.samples.some(s=>s.aa>.05));assert(new Set(capture.samples.map(s=>s.eye.map(x=>x.toFixed(4)).join(','))).size>2);
   await page.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});__debug.command({type:'gaze',target:null});});
   if(subject.name==='after'){
    let navigations=0;page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')navigations++;});
    const before=await page.evaluate(()=>__debug.exportAppearanceRecipe());
    const invalid=await page.evaluate(async()=>__debug.avatar().appearance.set({eyeColor:'green'}));assert.equal(invalid.applied,false);
    assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),before);
    await page.locator('#appearance-body').selectOption(subjects[0].id);await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='native-female-843ac-v1',null,{timeout:60000});
    await page.locator('#appearance-body').selectOption(subject.id);await page.waitForFunction(id=>__debug.avatar().profile.bodyType===id,subject.id,{timeout:60000});
    assert.equal(navigations,0);report.checks.push('New face is selectable in existing Appearance without page navigation; unsupported green iris rejects without replacing appearance');
    assert.deepEqual(JSON.parse(await page.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(before));
    entry.recipe=JSON.parse(before);await fs.writeFile(path.join(out,'face-recipe.json'),before);
   }
   await page.close();page=null;
  }
  assert.deepEqual(report.errors,[]);report.status='paired-face-runtime-passed-visual-review-pending';
 }catch(e){report.status='failed';report.error=String(e.stack||e);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:build.shortId,error:report.error,out}));}
})();
