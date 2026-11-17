const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),fixed=path.join(root,'experiments/native-mtoon-fixed-v1'),dist=path.join(fixed,'prototype/dist');
const commit='eae6c66414cf741bec09629e2143915601bcb3d1',build='d0f9ab216e05';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const {verifyCandidate}=require(path.join(root,'scripts/qa-m1-common.cjs'));
function createFrameClock(){
  let first=null,previous=null,appliedSeconds=0;
  return {advance(timestamp){
    if(!Number.isFinite(timestamp))throw Error('Nonfinite RAF timestamp');
    if(previous!==null&&timestamp<=previous)throw Error('Nonmonotonic RAF timestamp');
    const initial=previous===null;
    if(initial)first=timestamp;
    const rawDeltaSeconds=initial?0:(timestamp-previous)/1000;
    const appliedDeltaSeconds=Math.min(rawDeltaSeconds,.05);
    previous=timestamp;appliedSeconds+=appliedDeltaSeconds;
    return {initial,firstCallbackTimestamp:first,timestamp,rawDeltaSeconds,appliedDeltaSeconds,elapsedSeconds:(timestamp-first)/1000,appliedSeconds};
  }};
}
async function startServer(){
 const server=http.createServer(async(req,res)=>{try{const uri=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(dist,'.'+(uri==='/'?'/index.html':uri));if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}const bytes=await fs.readFile(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.vrm':'model/gltf-binary','.glb':'model/gltf-binary'};res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function cpuPreflight(){
 const clock=createFrameClock(),sequence=[1000,1016,1033,1084].map(t=>clock.advance(t));assert.deepEqual(sequence.map(s=>s.appliedDeltaSeconds),[0,.016,.017,.05]);
 assert.throws(()=>clock.advance(1084),/Nonmonotonic/);assert.throws(()=>clock.advance(1080),/Nonmonotonic/);assert.throws(()=>clock.advance(NaN),/Nonfinite/);
 const resumed=createFrameClock();assert.equal(resumed.advance(9000).appliedDeltaSeconds,0);assert.equal(resumed.advance(9016).appliedDeltaSeconds,.016);
 const initialization=Array(60).fill(1/60),staticSamples=[.30,.65,1].flatMap(s=>Array(Math.round(s*120)).fill(1/120));
 const {updateEquipmentMaterials}=await import(require('node:url').pathToFileURL(path.join(fixed,'prototype/src/equipment-material-loader.js')).href);
 const consumed=[];const items=[{container:{visible:true},meshes:[{material:{isMToonMaterial:true,update:dt=>consumed.push(dt)}}]}];
 for(const dt of [...initialization,...staticSamples,...sequence.map(s=>s.appliedDeltaSeconds),0,.016])updateEquipmentMaterials(items,dt);
 assert.ok(consumed.every(dt=>Number.isFinite(dt)&&dt>=0));assert.throws(()=>updateEquipmentMaterials(items,-.0001),/Invalid/);
 const {server,url}=await startServer();let styles=[];
 try{const html=await(await fetch(url)).text();const matches=[...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"/g)];assert.ok(matches.length);for(const m of matches){const response=await fetch(new URL(m[1],url));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/css');styles.push({url:m[1],status:response.status,contentType:response.headers.get('content-type'),sha256:hash(Buffer.from(await response.arrayBuffer()))});}}
 finally{await new Promise(resolve=>server.close(resolve));}
 return {schema:'native-equipment-capture-cpu-preflight-v1',firstCallbackEpoch:true,sequence,pauseStartsNewEpoch:true,invalidTimestampsRejected:true,negativeEquipmentDeltaRejected:true,actualEquipmentUpdateCalls:consumed.length,initializationSteps:initialization.length,staticWalkSteps:staticSamples.length,styles,serverClosed:true,priorFailure:{v3ActualNegativeDeltaValueRecorded:false,value:null,reason:'The v3 error receipt did not save callback timestamps; exact negative value is unavailable.'}};
}
async function pin(relative,checkGit=true){const b=await fs.readFile(path.join(root,relative));if(checkGit)assert.equal(hash(b),hash(execFileSync('git',['show',commit+':'+relative],{cwd:fixed,maxBuffer:32*1024*1024})),relative+' differs from fixed commit');return {path:relative,sha256:hash(b),bytes:b.length};}
async function prepare(){
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:fixed}).toString().trim(),commit);
  const identity=JSON.parse(await fs.readFile(path.join(dist,'build-info.json')));assert.equal(identity.shortId,build);
  const preflight=await cpuPreflight();await fs.writeFile(path.join(__dirname,'cpu-preflight.json'),JSON.stringify(preflight,null,2)+'\n');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'assets-source/native-vroid-equipment-v1/equipment.json')));
  const inputs=[await pin('assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'),await pin('assets-source/native-vroid-equipment-v1/equipment.json')];
  assert.equal(inputs[0].sha256,'78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3');assert.equal(manifest.items.length,3);
  for(const item of manifest.items){const p=await pin('assets-source/native-vroid-equipment-v1/'+item.url);assert.equal(p.sha256,item.sha256);assert.equal(p.bytes,item.bytes);inputs.push(p);}
  const lock=await fs.readFile(path.join(fixed,'prototype/package-lock.json'));assert.equal(hash(lock),hash(execFileSync('git',['show',commit+':prototype/package-lock.json'],{cwd:fixed})));
  const esbuild=require(path.join(fixed,'prototype/node_modules/esbuild'));const pins={};
  const source=await fs.readFile(path.join(__dirname,'overlay-source.js'));
  const bundled=await esbuild.build({stdin:{contents:source.toString(),resolveDir:fixed,sourcefile:'native-equipment-comparison.js'},bundle:true,write:false,format:'esm',platform:'browser',nodePaths:[path.join(fixed,'prototype/node_modules')],plugins:[{name:'fixed-source-identity',setup(api){api.onLoad({filter:/[\\/]prototype[\\/](src|public)[\\/]/},async args=>{
    const relative=path.relative(fixed,args.path).replaceAll(path.sep,'/');const bytes=await fs.readFile(args.path);assert.equal(hash(bytes),hash(execFileSync('git',['show',commit+':'+relative],{cwd:fixed,maxBuffer:32*1024*1024})),relative+' changed');pins[relative]=hash(bytes);return {contents:bytes.toString(),loader:relative.endsWith('.json')?'json':'js',resolveDir:path.dirname(args.path)};
  });}}]});
  const bundle=Buffer.from(bundled.outputFiles[0].contents);await fs.writeFile(path.join(__dirname,'overlay.mjs'),bundle);
  const spec={schema:'native-equipment-room-compare-input-v1',commit,build,buildDigest:identity.sourceDigest,inputs,runtimeSourcePins:pins,packageLockSha256:hash(lock),overlaySourceSha256:hash(source),bundleSha256:hash(bundle),captureScriptSha256:hash(await fs.readFile(__filename)),clockSourceSha256:hash(createFrameClock.toString()),cpuPreflightSha256:hash(await fs.readFile(path.join(__dirname,'cpu-preflight.json'))),entries:manifest.items.map(i=>({id:i.id,sha256:i.sha256,bytes:i.bytes})),sourceFloorY:-8.449510756148968e-7,playbackRate:1,walkMode:'Explicit shared createMotion in-place treadmill, fixed root. Navigation is not under test.',fullFactoryAdmission:false};
  await fs.writeFile(path.join(__dirname,'request.json'),JSON.stringify(spec,null,2)+'\n');console.log(JSON.stringify({status:'prepared',inputs:inputs.length,sourceFiles:Object.keys(pins).length,bundleSha256:spec.bundleSha256}));
}
async function run(){
  const spec=JSON.parse(await fs.readFile(path.join(__dirname,'request.json')));assert.equal(spec.captureScriptSha256,hash(await fs.readFile(__filename)));assert.equal(spec.overlaySourceSha256,hash(await fs.readFile(path.join(__dirname,'overlay-source.js'))));
  const bundle=await fs.readFile(path.join(__dirname,'overlay.mjs'));assert.equal(hash(bundle),spec.bundleSha256);
  const bodies=new Map();for(const input of spec.inputs){const bytes=await fs.readFile(path.join(root,input.path));assert.equal(hash(bytes),input.sha256);bodies.set(path.basename(input.path),bytes);}
  const out=path.join(__dirname,'run-1');await fs.mkdir(out,{recursive:false});
  assert.equal(spec.clockSourceSha256,hash(createFrameClock.toString()));assert.equal(spec.cpuPreflightSha256,hash(await fs.readFile(path.join(__dirname,'cpu-preflight.json'))));
  const {server,url}=await startServer();
  const report={schema:'native-equipment-room-comparison-result-v1',status:'running',specSha256:hash(await fs.readFile(path.join(__dirname,'request.json'))),commit,build,url,sourceFloorY:spec.sourceFloorY,walkMode:spec.walkMode,images:[],pairedFrames:[],clips:[],errors:[],fullFactoryAdmission:false};
  let browser,context,page;
  try{
    const {chromium}=require(path.join(fixed,'prototype/node_modules/playwright'));browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}});page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
    await page.addInitScript({content:'window.__createEquipmentQAFrameClock='+createFrameClock.toString()+';'});
    await page.route('**/__native_equipment_qa__/*',route=>{const name=path.basename(new URL(route.request().url()).pathname);if(name==='overlay.mjs')return route.fulfill({contentType:'text/javascript',body:bundle});const bytes=name==='model.vrm'?bodies.get('female-native-round-waist-216.vrm'):bodies.get(name);if(!bytes)throw Error('Unplanned QA resource '+name);return route.fulfill({contentType:name.endsWith('.json')?'application/json':'model/gltf-binary',body:bytes});});
    await page.goto(url+'/?workbench=appearance&body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
    report.room=await verifyCandidate(page,{build,body:'female',assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
    await page.waitForFunction(()=>{const c=__debug.renderer.domElement;return c.clientHeight>500&&c.clientWidth>700&&[...document.querySelectorAll('link[rel="stylesheet"]')].every(l=>l.sheet);},null,{timeout:10000});
    report.layout=await page.evaluate(()=>{const c=__debug.renderer.domElement;return {viewport:[innerWidth,innerHeight],canvasPixels:[c.width,c.height],canvasCSS:[c.clientWidth,c.clientHeight],styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(l=>({href:l.href,loaded:!!l.sheet}))};});assert.ok(report.layout.styles.length);
    await page.evaluate(()=>{__debug.setPaused(true);__debug.setPlaybackRate(1);});
    report.candidate=await page.evaluate(async input=>(await import('/__native_equipment_qa__/overlay.mjs')).install(input),{avatarSha256:spec.inputs[0].sha256,entries:spec.entries,sourceFloorY:spec.sourceFloorY,build});
    async function pair(label,camera){
      const data=await page.evaluate(({label,camera})=>{const q=__nativeEquipmentQA;q.camera(camera);const frames=[];for(const mode of ['embedded','independent']){q.setMode(mode);frames.push({mode,png:q.png(),observation:q.observe()});}return {label,camera,frames};},{label,camera});
      for(const frame of data.frames){const name=label+'-'+camera+'-'+frame.mode+'.png';await fs.writeFile(path.join(out,name),Buffer.from(frame.png.split(',')[1],'base64'));report.images.push(name);delete frame.png;frame.image=name;}
      report.pairedFrames.push(data);
    }
    await pair('standing','front');await pair('standing','side');
    for(const [i,seconds]of [0.30,0.65,1.0].entries()){
      await page.evaluate(seconds=>{const q=__nativeEquipmentQA;q.reset();for(let i=0;i<Math.round(seconds*120);i++)q.step(1/120,true);},seconds);
      await pair('walk-sample-'+i,'front');await pair('walk-sample-'+i,'side');
    }
    for(const mode of ['embedded','independent']){
      const clip=await page.evaluate(async mode=>{const q=__nativeEquipmentQA;q.reset();q.setMode(mode);q.camera('front');q.draw();const initializedAt=performance.now(),samples=[],clock=__createEquipmentQAFrameClock(),clockFrames=[];let lastPhase=q.metrics().phase,cycles=0,lastSample=0;
        await new Promise((resolve,reject)=>{function tick(now){try{const frame=clock.advance(now);clockFrames.push(frame);q.step(frame.appliedDeltaSeconds,true);q.draw();const metrics=q.metrics();if(metrics.phase<lastPhase)cycles++;lastPhase=metrics.phase;if(frame.elapsedSeconds-lastSample>=.1){samples.push({elapsedSeconds:frame.elapsedSeconds,mode,phase:metrics.phase,cycles,peakSlip:metrics.peakSlip,moving:metrics.moving,frameDt:frame.appliedDeltaSeconds});lastSample=frame.elapsedSeconds;}if(frame.elapsedSeconds>=5.5&&cycles>=3)resolve();else if(frame.elapsedSeconds>10)reject(Error('Three gait cycles not reached'));else requestAnimationFrame(tick);}catch(e){window.__equipmentQAClockFailure={error:String(e),now,initializedAt,clockFrames};reject(e);}}requestAnimationFrame(tick);});
        return {mode,clock:'First RAF timestamp epoch, subsequent timestamps strictly increasing; shared motion treadmill, 50ms dt cap',initializedAt,firstCallbackTimestamp:clockFrames[0].timestamp,firstCallbackMinusInitializationSeconds:(clockFrames[0].timestamp-initializedAt)/1000,elapsedSeconds:clockFrames.at(-1).elapsedSeconds,appliedSeconds:clockFrames.at(-1).appliedSeconds,clockFrames,cycles,samples,final:q.observe()};
      },mode);assert.ok(clip.cycles>=3);report.clips.push(clip);
    }
    await page.screenshot({path:path.join(out,'final-screen.png')});report.images.push('final-screen.png');assert.deepEqual(report.errors,[]);report.status='captured-visual-review-pending';
  }catch(error){report.status='failed-or-incomplete';report.error=String(error.stack??error);process.exitCode=1;try{report.clockFailure=await page?.evaluate(()=>window.__equipmentQAClockFailure??null);await page?.screenshot({path:path.join(out,'failure.png')});}catch{}}
  finally{
    try{await page?.evaluate(()=>__nativeEquipmentQA?.dispose());}catch{}
    const video=page?.video();await context?.close();if(video){await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();}await browser?.close();await new Promise(resolve=>server.close(resolve));report.serverClosed=true;report.browserClosed=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify({status:report.status,error:report.error,clips:report.clips.map(c=>({mode:c.mode,seconds:c.elapsedSeconds,cycles:c.cycles})),serverClosed:report.serverClosed}));
}
(process.argv[2]==='--prepare'?prepare():process.argv[2]==='--run'?run():Promise.reject(Error('Use --prepare or --run'))).catch(e=>{console.error(e);process.exitCode=1;});
