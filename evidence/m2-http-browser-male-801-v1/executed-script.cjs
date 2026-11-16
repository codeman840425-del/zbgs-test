// Sequential real-browser measurements. No request interception (it disables
// the HTTP cache). Timings exclude video and explicit hash-audit requests.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const [rootArg,codingArg,body,outArg]=process.argv.slice(2);
const root=path.resolve(rootArg),out=path.resolve(outArg);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const {createServer}=await import(pathToFileURL(path.resolve('scripts/runtime-transfer-http/transport.mjs')));
 const transportBytes=await fs.readFile('scripts/runtime-transfer-http/transport.mjs');
 await fs.writeFile(path.join(out,'executed-transport.mjs'),transportBytes);
 const sourceBytes=await fs.readFile(path.join(root,'runtime-package.json')),manifest=JSON.parse(sourceBytes);
 const recipe=JSON.parse(await fs.readFile(path.join(root,'selected-appearance.recipe.json')));
 const selections=JSON.parse(await fs.readFile(path.join(root,'material-selections.json'))).selections;
 const report={schema:'runtime-http-browser-pilot-v1',body,sourceManifestSha256:sha(sourceBytes),runtime:manifest.runtime,
  transportSha256:sha(transportBytes),environment:{os:os.release(),cpu:os.cpus()[0].model,viewport:[1440,900],network:'Loopback; no throttling. Development machine, not ordinary-PC or WAN evidence.'},
  definitions:{interactive:'__debug.ready observed by rAF, followed by two rAF callbacks; usable-render proxy, not pixel-detected paint',
   timing:'3 cold contexts and same-context warm navigations for each coding; no recording during timing',
   firstOutfit:'male first outfit4 loading shorts+outer; female outfit0 already loaded (not a cold alternate outfit test)',
   cache:'Unversioned files revalidate; hashed JS/CSS immutable. App no-store requests can bypass cache.',
   memory:'Renderer object counts and JS used heap sample only; no GPU allocation or peak decoder memory measurement'},runs:[],visual:[],checks:[],errors:[]};
 const browser=await chromium.launch({channel:'chrome',headless:true});report.environment.browser=browser.version();
 let context,server;
 const init=()=>{
  window.__httpReady=null;
  function check(){if(window.__debug?.ready)requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__httpReady=performance.now();}));else requestAnimationFrame(check);}
  requestAnimationFrame(check);
 };
 const ready=async page=>{await page.waitForFunction(()=>window.__httpReady!==null,null,{timeout:60000});};
 const apply=async page=>{
  const result=await page.evaluate(async({recipe,selections})=>{
   const start=performance.now(),r=await __debug.importAppearanceRecipe(JSON.stringify(recipe));
   for(const s of selections){const x=await __debug.avatar().setMaterialRecipe(s.equipmentId,s.recipeId);if(!x.applied)throw Error('Material failed');}
   return{elapsedMs:performance.now()-start,result:r,record:JSON.parse(__debug.exportAppearanceRecipe())};
  },{recipe,selections});
  assert.equal(result.result.applied,true);assert.deepEqual(result.record,recipe);return result.elapsedMs;
 };
 try{
  for(const mode of ['identity','gzip','br']){
   const serving=await createServer(root,path.resolve(codingArg),mode);server=serving.server;
   await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
   for(let trial=0;trial<3;trial++){
    context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    await context.addInitScript(init);
    let page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
    for(const phase of ['cold','warm']){
     const eventStart=serving.events.length;
     await page.goto(origin+manifest.runtime.entryUrl+'&view=room');await ready(page);
     const initial=await page.evaluate(()=>({interactiveMs:__httpReady,snapshot:__debug.snapshot()}));
     assert.equal(initial.snapshot.buildInfo.shortId,manifest.runtime.buildId);
     const outfitMs=await apply(page);
     const entry=await page.evaluate(()=>({resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,initiator:r.initiatorType,
      transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,duration:r.duration})),
      navigation:performance.getEntriesByType('navigation')[0].toJSON(),snapshot:__debug.snapshot()}));
     report.runs.push({mode,trial,phase,interactiveMs:initial.interactiveMs,firstOutfitMs:outfitMs,
      resources:entry.resources,navigation:entry.navigation,renderer:entry.snapshot.renderer,heap:entry.snapshot.heap,
      server:serving.events.slice(eventStart),loadMs:entry.snapshot.loadMs});
     // Different document, same context/cache. No reload no-cache request flag.
     if(phase==='cold'){await page.close();page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));}
    }
    await context.close();context=null;
   }
   // Audit actual browser decompression and response headers for every declared file.
   context=await browser.newContext({viewport:{width:1440,height:900}});
   const page=await context.newPage();await page.goto(origin+'/favicon.svg');
   const hashes=await page.evaluate(async rows=>{
    const out=[];
    for(const row of rows){const r=await fetch('/'+row.path,{cache:'no-store'});const bytes=await r.arrayBuffer();
     out.push({path:row.path,status:r.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),
      encoding:r.headers.get('content-encoding'),vary:r.headers.get('vary'),cache:r.headers.get('cache-control'),type:r.headers.get('content-type')});}
    return out;
   },manifest.files);
   hashes.forEach((r,i)=>{assert.equal(r.status,200);assert.equal(r.sha256,manifest.files[i].sha256);assert.equal(r.bytes,manifest.files[i].bytes);assert.equal(r.vary,'Accept-Encoding');});
   report.checks.push({mode,decodedHashes:hashes});await context.close();context=null;
   // Same fixed room / close camera normal-speed evidence; HTTP bytes remain exact.
   if(mode!=='gzip'){
    const dir=path.join(out,mode+'-visual');await fs.mkdir(dir);
    context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
    await context.addInitScript(init);const p=await context.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
    await p.goto(origin+manifest.runtime.entryUrl+'&view=room');await ready(p);await apply(p);
    await p.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setPaused(false);__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(1,1.8);});
    await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:30000});
    await p.screenshot({path:path.join(dir,'room.png')});
    await p.evaluate(()=>__debug.camera('face'));await p.waitForTimeout(1200);await p.screenshot({path:path.join(dir,'face.png')});
    const state=await p.evaluate(()=>__debug.snapshot());report.visual.push({mode,state,scope:'same-camera 1x walk and face; exact bytes, no revalidation of frozen motions'});
    const v=p.video();await context.close();await v.saveAs(path.join(dir,'normal1x.webm'));context=null;
   }
   await new Promise(r=>server.close(r));server=null;
  }
  assert.equal(report.errors.length,0);
  report.status='passed';
 }catch(e){report.status='failed';report.failure=String(e);report.stack=e.stack;process.exitCode=1;}
 finally{
  await context?.close();await browser.close();if(server)await new Promise(r=>server.close(r));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 console.log(JSON.stringify({status:report.status,failure:report.failure,runs:report.runs.length,body,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
