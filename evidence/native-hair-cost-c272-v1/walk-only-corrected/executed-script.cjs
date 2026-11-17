// Development-machine short samples on an immutable room build. No video/GC.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('../prototype/node_modules/playwright');
const [directory,output,scope='full']=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and fresh evidence directory');
assert(['full','walk-only'].includes(scope));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const BODY='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81';
const HAIR='cfa965e68d4f11ca1a93096edb43f5b7657862f10c40b9d88f5b0fd404ae5a02';
function statistics(values){
 assert(values.length&&values.every(Number.isFinite));const sorted=[...values].sort((a,b)=>a-b);
 const q=p=>sorted[Math.ceil(p*sorted.length)-1];
 return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),over20ms:values.filter(x=>x>20).length,over33_333ms:values.filter(x=>x>100/3).length,over50ms:values.filter(x=>x>50).length,over100ms:values.filter(x=>x>100).length};
}
(async()=>{
 const folder=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const buildBytes=await fs.readFile(path.join(folder,'build-info.json')),build=JSON.parse(buildBytes);assert.equal(build.shortId,'c2721e32b6ed');
 assert.equal(digest(await fs.readFile(path.join(folder,'assets/native-hairset001-v1/hair.glb'))),HAIR);
 const report={schema:'native-hair-development-short-cost-v1',status:'incomplete',scope,walkRoute:'directions',build,buildInfoSHA256:digest(buildBytes),sourceCommit:execFileSync('git',['-C',path.resolve(folder,'../..'),'rev-parse','HEAD'],{encoding:'utf8'}).trim(),viewport:{width:1440,height:1000},deviceScaleFactor:1,playbackRate:1,speed:1.05,samples:[],errors:[],measurementScope:{video:false,bodyAndEquipmentCPUSeparated:false,gpuTimeMeasured:false,forcedGC:false,sourceChanged:false,ordinaryPCMeasured:false}};
 report.machine=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"$cpu=Get-CimInstance Win32_Processor; $gpu=Get-CimInstance Win32_VideoController; $os=Get-CimInstance Win32_OperatingSystem; $mem=Get-CimInstance Win32_ComputerSystem; @{cpu=@($cpu|Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);gpu=@($gpu|Select-Object Name,DriverVersion,AdapterRAM);os=($os|Select-Object Caption,Version,BuildNumber);ramBytes=$mem.TotalPhysicalMemory}|ConvertTo-Json -Depth 5"],{encoding:'utf8'}));
 let server,browser,page;
 try{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.vrm':'model/gltf-binary','.glb':'model/gltf-binary'};
  server=require('node:http').createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(folder,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(folder+path.sep))throw Error('path');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true});report.chrome=browser.version();
  page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?workbench=appearance&body=native-male-7586-v1`);
  await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);assert.equal(await page.evaluate(()=>__debug.avatar().profile.sha256),BODY);
  report.environment=await page.evaluate(()=>{const r=__debug.renderer,c=r.domElement,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,devicePixelRatio,rendererPixelRatio:r.getPixelRatio(),drawingBuffer:[g.drawingBufferWidth,g.drawingBufferHeight],canvasCSS:[c.clientWidth,c.clientHeight],webgl:{vendor:g.getParameter(g.VENDOR),renderer:g.getParameter(g.RENDERER),version:g.getParameter(g.VERSION),unmaskedVendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null}};});
  report.hairCandidate=await page.evaluate(()=>__debug.queryAppearanceCandidates().appearance.hairStyle.choices.find(c=>c.value==='native-male-hairset001-v1'));assert.equal(report.hairCandidate.assetSha256,HAIR);
  await page.evaluate(()=>{
   const a=__debug.avatar(),r=__debug.renderer,originalUpdate=a.appearance.updateDynamics,originalRender=r.render;
   const monitor={active:false,frames:[],raf:[],dynamics:[],pending:[],lastRender:null,lastRAF:null};
   a.appearance.updateDynamics=function(...args){if(!monitor.active)return originalUpdate.apply(this,args);const t=performance.now();try{return originalUpdate.apply(this,args);}finally{const row={at:t,dt:args[0],enabled:args[1]??true,cpuMs:performance.now()-t};monitor.dynamics.push(row);monitor.pending.push(row);}};
   r.render=function(...args){if(!monitor.active)return originalRender.apply(this,args);const t=performance.now();try{return originalRender.apply(this,args);}finally{const elapsed=performance.now()-t,info=r.info;monitor.frames.push({at:t,renderStartIntervalMs:monitor.lastRender===null?null:t-monitor.lastRender,renderSubmitCPUms:elapsed,hairUpdateCPUms:monitor.pending.reduce((s,x)=>s+x.cpuMs,0),hairUpdateCalls:monitor.pending.length,calls:info.render.calls,triangles:info.render.triangles,textures:info.memory.textures,geometries:info.memory.geometries,programs:info.programs?.length??null});monitor.pending=[];monitor.lastRender=t;}};
   let live=true;function raf(t){if(!live)return;if(monitor.active){monitor.raf.push({timestamp:t,intervalMs:monitor.lastRAF===null?null:t-monitor.lastRAF});monitor.lastRAF=t;}requestAnimationFrame(raf);}requestAnimationFrame(raf);
   monitor.start=()=>{monitor.frames=[];monitor.raf=[];monitor.dynamics=[];monitor.behavior=[];monitor.pending=[];monitor.lastRender=null;monitor.lastRAF=null;monitor.started=performance.now();monitor.active=true;monitor.interval=setInterval(()=>{const s=__debug.snapshot();monitor.behavior.push({at:performance.now(),mode:s.mode,speed:s.speed,distance:s.distance,target:s.target,pathLength:s.path.length});},250);};
   monitor.stop=()=>{monitor.active=false;clearInterval(monitor.interval);return {wallMs:performance.now()-monitor.started,frames:monitor.frames,raf:monitor.raf,dynamics:monitor.dynamics,behavior:monitor.behavior};};
   monitor.dispose=()=>{monitor.active=false;live=false;a.appearance.updateDynamics=originalUpdate;r.render=originalRender;};
   window.__hairCost=monitor;
  });
  const read=()=>page.evaluate(()=>{const a=__debug.avatar(),r=__debug.renderer;let native=[];a.vrm.scene.traverse(n=>{if(n.userData.nativeHairAttachment)native.push({visible:n.visible,name:n.name,meshes:(()=>{let count=0;n.traverse(o=>{if(o.isMesh)count++;});return count;})()});});return {snapshot:__debug.snapshot(),appearance:a.appearance.getState(),equipment:a.getOutfitInfo(),originalSpringJointCount:a.vrm.springBoneManager?.joints?.size??null,nativeScenes:native,renderer:{...r.info.memory,calls:r.info.render.calls,triangles:r.info.render.triangles,programs:r.info.programs?.length??null},heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null};});
  async function sample(style,phase,seconds){
   const before=await read();await page.evaluate(()=>__hairCost.start());await page.waitForTimeout(seconds*1000);
   const raw=await page.evaluate(()=>__hairCost.stop()),after=await read();
   const file=`${style}-${phase}-raw.json`;await fs.writeFile(path.join(out,file),JSON.stringify(raw));
   assert(raw.frames.length>30&&raw.raf.length>30&&raw.dynamics.length>30);
   const m={style,phase,requestedSeconds:seconds,wallMs:raw.wallMs,before,after,raw:{file,sha256:digest(Buffer.from(JSON.stringify(raw))),frames:raw.frames.length,raf:raw.raf.length,dynamicsCalls:raw.dynamics.length},rafIntervalMs:statistics(raw.raf.map(x=>x.intervalMs).filter(x=>x!==null)),mainRenderStartIntervalMs:statistics(raw.frames.map(x=>x.renderStartIntervalMs).filter(x=>x!==null)),renderSubmitCPUms:statistics(raw.frames.map(x=>x.renderSubmitCPUms)),hairUpdateDynamicsCPUmsPerCall:statistics(raw.dynamics.map(x=>x.cpuMs)),hairUpdateDynamicsCPUmsPerRender:statistics(raw.frames.map(x=>x.hairUpdateCPUms)),resources:Object.fromEntries(['calls','triangles','textures','geometries','programs'].map(k=>[k,{min:Math.min(...raw.frames.map(x=>x[k])),max:Math.max(...raw.frames.map(x=>x[k]))}])),simulationSeconds:after.snapshot.simulationTime-before.snapshot.simulationTime};
   if(phase==='seated')assert(after.snapshot.mode==='sit'&&after.snapshot.motion.sitProgress>.999);
   if(phase==='walk'){assert(raw.behavior.length>=40&&raw.behavior.every(x=>x.mode==='walk'),'Walking route ended or changed mode during the sample');assert.equal(after.snapshot.mode,'walk');assert(after.snapshot.distance-before.snapshot.distance>8,'Walking distance too small for this sample');}
   assert.equal(after.appearance.effectiveHairStyle,style);report.samples.push(m);await fs.writeFile(path.join(out,'report-progress.json'),JSON.stringify(report,null,2));
  }
  await page.evaluate(()=>{__debug.setPaused(false);__debug.setPlaybackRate(1);__debug.camera('room');});await page.waitForTimeout(3000);
  report.initialOriginal=await read();
  for(const style of ['original','native-male-hairset001-v1']){
   await page.evaluate(()=>__debug.setPaused(true));const applied=await page.evaluate(id=>__debug.avatar().appearance.set({hairStyle:id}),style);assert.equal(applied.applied,true);
   if(style!=='original'){const s=await read();assert.equal(s.appearance.replacementSHA256,HAIR);assert.equal(s.appearance.hairDynamics.method,'official-native-VRMC_springBone');assert(s.appearance.hairDynamics.jointCount>0&&!s.appearance.hairDynamics.disposed);}
   await page.evaluate(()=>{__debug.reset();__debug.setSpeed(1.05);__debug.route('directions');__debug.camera('room');__debug.setPaused(false);});
   await page.waitForTimeout(3000);await sample(style,'walk',12);
   if(scope==='walk-only')continue;
   await page.evaluate(()=>__debug.action('idle'));await page.waitForFunction(()=>__debug.snapshot().speed<.01&&__debug.snapshot().motion.transitionComplete,null,{timeout:10000});
   await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().mode==='sit'&&__debug.snapshot().motion.sitProgress>.999,null,{timeout:35000});
   await page.waitForTimeout(2000);await sample(style,'seated',6);
   await page.evaluate(()=>__debug.action('stand'));await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress<.001&&__debug.snapshot().motion.transitionComplete,null,{timeout:12000});
  }
  const restored=await page.evaluate(()=>__debug.avatar().appearance.set({hairStyle:'original'}));assert.equal(restored.applied,true);await page.waitForTimeout(2000);report.restoredOriginal=await read();
  assert.equal(report.restoredOriginal.appearance.effectiveHairStyle,'original');assert.equal(report.restoredOriginal.appearance.hairDynamics,null);assert(report.restoredOriginal.nativeScenes.every(x=>!x.visible));
  report.disposalScope='After restoration the style cache deliberately retains the hidden replacement. Then this QA disposes appearance once to observe local resource release, without forced GC or actor reload.';
  await page.evaluate(()=>__debug.avatar().appearance.dispose());await page.waitForTimeout(1000);report.afterAppearanceDispose=await read();assert.equal(report.afterAppearanceDispose.nativeScenes.length,0);
  await page.evaluate(()=>__hairCost.dispose());assert.deepEqual(report.errors,[]);report.status='development-short-samples-complete';
 }catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;if(page){try{await page.screenshot({path:path.join(out,'failure.png')});report.failureSnapshot=await page.evaluate(()=>window.__debug?.ready?__debug.snapshot():null);}catch{}}}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));report.browserAndTemporaryServerClosed=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:build.shortId,error:report.error,samples:report.samples.map(x=>({style:x.style,phase:x.phase,rafP95:x.rafIntervalMs.p95,hairCPUmeanPerFrame:x.hairUpdateDynamicsCPUmsPerRender.mean,renderCPUmean:x.renderSubmitCPUms.mean,resources:x.resources}))}));}
})();
