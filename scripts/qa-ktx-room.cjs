// KTX injection into the exact existing801 runtime; pilot code has separate hashes.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [body,outArg]=process.argv.slice(2),repo=process.cwd(),out=path.resolve(outArg);
const packageRoot=path.resolve('experiments/m2-runtime-transfer-801/'+body+'-final-package');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const adapter=await fs.readFile('scripts/m2-ktx-pilot-v1/runtime-adapter.mjs');await fs.writeFile(path.join(out,'executed-adapter.mjs'),adapter);
 const report={body,runtime:'801c7a9c9026',adapterSha256:sha(adapter),requests:[],checks:[],errors:[],states:[],
  limit:'Experimental injection, not a compressed VRM release. Both original PNG-containing VRM and KTX downloads retained. GPU physical allocation not measured; upload data and texture object state only.'};
 const maps=[['/__pilot/three/',path.resolve('prototype/node_modules/three')],['/__pilot/source/',path.resolve('assets-source/m2-ktx-pilot-v1')],['/__pilot/scripts/',path.resolve('scripts/m2-ktx-pilot-v1')]];
 const mime={'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.ktx2':'image/ktx2','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
 const server=http.createServer(async(req,res)=>{try{
  const u=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let base=packageRoot,relative=u==='/'?'index.html':u.slice(1);
  for(const [prefix,dir] of maps)if(u.startsWith(prefix)){base=dir;relative=u.slice(prefix.length);break;}
  const file=await fs.realpath(path.resolve(base,relative));assert(file.startsWith(base+path.sep));
  const bytes=await fs.readFile(file);report.requests.push({path:u,bytes:bytes.length,sha256:sha(bytes)});
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
 let expectedFailureWindow=false;report.expectedFailureConsole=[];
 const p=await context.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
 p.on('console',m=>{if(m.type()==='error')(expectedFailureWindow?report.expectedFailureConsole:report.errors).push(m.text());});
 try{
  await p.goto(origin+'/?body='+body+'&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  report.identity=await p.evaluate(()=>({build:__debug.buildInfo,profile:__debug.avatar().getAssetProfile()}));assert.equal(report.identity.build.shortId,report.runtime);
  const prepared=await p.evaluate(async body=>{
   const im=document.createElement('script');im.type='importmap';im.textContent=JSON.stringify({imports:{three:'/__pilot/three/build/three.module.js'}});document.head.appendChild(im);
   const module=await import('/__pilot/scripts/runtime-adapter.mjs');
   const deps=await module.importPilotDependencies({threeModuleUrl:'/__pilot/three/build/three.module.js',ktx2LoaderModuleUrl:'/__pilot/three/examples/jsm/loaders/KTX2Loader.js'});
   const [sourceManifest,decoderManifest]=await Promise.all(['manifest.json','runtime-dependencies.json'].map(x=>fetch('/__pilot/source/'+x).then(r=>r.json())));
   // Encoded paths in the archived source manifest are repository-relative.
   for(const sample of sourceManifest.samples)sample.encoded.path=sample.encoded.path.replace('assets-source/m2-ktx-pilot-v1/','');
   const a=__debug.avatar();window.__makeKtxPilot=()=>module.createKtxPilotAdapter({...deps,renderer:__debug.renderer,vrm:a.vrm,bodyType:body,
    avatarSha256:a.getAssetProfile().sha256,appearance:a.appearance,sourceManifest,decoderManifest,
    sourceBaseUrl:location.origin+'/__pilot/source/',transcoderPath:location.origin+'/__pilot/three/examples/jsm/libs/basis/'});
   window.__ktxPilot=__makeKtxPilot();
   window.__pilotStart=performance.now();const result=await __ktxPilot.prepare();return{result,prepareMs:performance.now()-__pilotStart,snapshot:__ktxPilot.snapshot()};
  },body);
  report.prepared=prepared;assert.equal(prepared.result.prepared,true,prepared.result.reason);
  const snap=async(label)=>{await p.waitForTimeout(300);report.states.push({label,...await p.evaluate(()=>({adapter:__ktxPilot.snapshot(),scene:__debug.snapshot()}))});};
  await p.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-face-front');});
  await snap('png-paused-face');await p.screenshot({path:path.join(out,'png-face.png')});
  const applied=await p.evaluate(()=>__ktxPilot.applyOriginalKtx());assert.equal(applied.applied,true);
  await snap('ktx-paused-face');await p.screenshot({path:path.join(out,'ktx-face.png')});
  report.gpuReleases=[{stage:'ktx-original',result:await p.evaluate(()=>__ktxPilot.releaseInactiveGpu())}];await snap('ktx-inactive-png-released');
  for(const mode of ['png','ktx']){
   await p.evaluate(mode=>{if(mode==='png')__ktxPilot.restorePng();else __ktxPilot.applyOriginalKtx();__debug.camera('inspect-full-front');},mode);
   await snap(mode+'-paused-body');await p.screenshot({path:path.join(out,mode+'-body.png')});
  }
  report.gpuReleases.push({stage:'ktx-before-motion',result:await p.evaluate(()=>__ktxPilot.releaseInactiveGpu())});await snap('ktx-before-motion-released');
  // Full-speed unmodified movement and face controls with compressed main/shade.
  await p.evaluate(()=>{__debug.camera('room');__debug.setPaused(false);__debug.setPlaybackRate(1);__debug.setSpeed(1.05);__debug.walkTo(1,1.8);});
  await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:30000});
  await p.evaluate(()=>{__debug.camera('inspect-face-front');__debug.command({type:'speaking',value:true});__debug.command({type:'expression',name:'happy'});__debug.command({type:'gaze',target:__debug.cameraObject().position.toArray()});});
  await p.waitForTimeout(4000);await p.screenshot({path:path.join(out,'ktx-speaking.png')});await snap('ktx-speaking');
  const tinted=await p.evaluate(()=>__ktxPilot.withCanvasAppearance(()=>__debug.avatar().appearance.set({hairColor:'brown',skinTone:'warm'})));
  report.tint=tinted;await snap('png-canvas-tinted');await p.screenshot({path:path.join(out,'canvas-tint.png')});
  report.rejectedAppearance=await p.evaluate(async()=>{
   const a=__debug.avatar(),before=[];
   a.vrm.scene.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])before.push([m,m.map,m.shadeMultiplyTexture]);});
   const prior=a.appearance.getState();
   const result=await __ktxPilot.withCanvasAppearance(()=>a.appearance.set({hairColor:'invalid-preset'}));
   const state=a.appearance.getState();
   return{result,preserved:before.every(([m,map,shade])=>m.map===map&&m.shadeMultiplyTexture===shade),
    prior:{hairColor:prior.hairColor,skinTone:prior.skinTone},after:{hairColor:state.hairColor,skinTone:state.skinTone}};
  });
  assert.equal(report.rejectedAppearance.result.applied,false);assert.equal(report.rejectedAppearance.preserved,true);
  assert.deepEqual(report.rejectedAppearance.after,report.rejectedAppearance.prior);
  await snap('rejected-appearance-retains-canvas');await p.screenshot({path:path.join(out,'rejected-retains-tint.png')});
  report.gpuReleases.push({stage:'canvas-fallback',result:await p.evaluate(()=>__ktxPilot.releaseInactiveGpu())});await snap('canvas-inactive-ktx-released');
  report.refusedTintOverride=await p.evaluate(()=>__ktxPilot.applyOriginalKtx());assert.equal(report.refusedTintOverride.applied,false);
  report.bodyOnly=await p.evaluate(()=>__ktxPilot.applyOriginalKtx({bodyOnly:true}));assert.equal(report.bodyOnly.applied,true);await snap('ktx-body-canvas-hair');
  await p.evaluate(()=>__ktxPilot.withCanvasAppearance(()=>__debug.avatar().appearance.set({hairColor:'original',skinTone:'original'})));
  assert.equal((await p.evaluate(()=>__ktxPilot.applyOriginalKtx())).applied,true);await snap('restored-original-ktx');
  report.gpuReleases.push({stage:'original-restored',result:await p.evaluate(()=>__ktxPilot.releaseInactiveGpu())});await snap('restored-ktx-inactive-released');
  await p.evaluate(()=>{__ktxPilot.dispose();__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});});
  await snap('disposed-restored-png');await p.screenshot({path:path.join(out,'restored-png.png')});
  expectedFailureWindow=true;
  await p.route('**/__pilot/source/encoded/*.ktx2',route=>route.fulfill({status:503,body:'Intentional unavailable derivative'}));
  report.failedDerivative=await p.evaluate(async()=>{
   const a=__debug.avatar(),before=[];a.vrm.scene.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])before.push([m,m.map,m.shadeMultiplyTexture]);});
   const probe=__makeKtxPilot(),result=await probe.prepare();const preserved=before.every(([m,map,shade])=>m.map===map&&m.shadeMultiplyTexture===shade);
   const state=probe.snapshot();probe.dispose();return{result,preserved,state};
  });
  assert.equal(report.failedDerivative.result.prepared,false);assert.equal(report.failedDerivative.preserved,true);
  await p.unroute('**/__pilot/source/encoded/*.ktx2');expectedFailureWindow=false;
  assert.deepEqual(report.errors,[]);report.status='runtime-checks-passed-visual-pending';
  report.checks=['Fixed801 model identity untouched; experimental adapter separately hashed','Actual KTX2Loader and bundled decoder verified before parsing',
   'Original map/shade bindings replaced together, same light/camera paused comparisons','Normal1x walk, blink/smile/vowel/gaze combined',
   'Canvas uses original PNG ordinary texture; nonoriginal hair refuses KTX overwrite','Body KTX with hair Canvas then original restore and dispose','Real503 derivative failure preserves current map/shade objects'];
 }catch(e){report.status='failed';report.failure=String(e);report.stack=e.stack;process.exitCode=1;await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{const v=p.video();await context.close();await v.saveAs(path.join(out,'normal1x.webm'));await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,failure:report.failure,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
