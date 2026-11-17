// Fixed native pair, existing shared factory and Phaser clock. No production edit.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
(async()=>{
 const folder=path.resolve('experiments/native-pair-fixed-v1/prototype/dist'),out=path.resolve('evidence/native-pair-isolation-193b-v1');
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const identity=JSON.parse(await fs.readFile(path.join(folder,'build-info.json'),'utf8'));
 assert.equal(identity.shortId,'193bbbf64323');
 const source=execFileSync('git',['-C','experiments/native-pair-fixed-v1','rev-parse','HEAD']).toString().trim();assert.equal(source,'b27eb47bf57df0058d210318e521e7751fde60e3');
 const report={status:'incomplete',source,build:identity.shortId,folder,errors:[],checkpoints:[],scope:'Native female843ac + male7586, actual shared room factory and 1x clock. Development GPU only, no contact/face quality acceptance.'};
 let server,browser,page;
 try{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.glb':'model/gltf-binary','.vrm':'model/gltf-binary'};
  server=require('node:http').createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(folder,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(folder+path.sep)){res.writeHead(403).end();return;}const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?body=native-female-843ac-v1`);
  await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),identity.shortId);
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('room');});
  report.load=await page.evaluate(async()=>{
   const d=__debug,a=d.avatar();const dom=document.querySelector('.debug-controls').innerHTML;
   const b=await d.loadComparison('native-male-7586-v1');
   const hash=async u=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(u)).arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
   function collect(a){const v={bones:new Set(),skeletons:new Set(),materials:new Set(),geometries:new Set(),textures:new Set(),morphArrays:new Set()};a.root.traverse(o=>{if(o.isBone)v.bones.add(o);if(o.skeleton)v.skeletons.add(o.skeleton);if(o.geometry)v.geometries.add(o.geometry);if(o.morphTargetInfluences)v.morphArrays.add(o.morphTargetInfluences);for(const mat of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){v.materials.add(mat);for(const val of Object.values(mat))if(val?.isTexture)v.textures.add(val);}});return v;}
   function sample(a,m){const bones={};for(const n of ['hips','head','leftUpperArm','rightUpperArm','leftFoot','rightFoot']){const p=a.vrm.humanoid.getNormalizedBoneNode(n);bones[n]={p:p.position.toArray(),q:p.quaternion.toArray()};}const e=a.getOutfitInfo().equipment,l=a.livePresentation.getState(),metrics=m.getMetrics();const maps=[];a.vrm.scene.traverse(o=>{for(const mat of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(/Body.*SKIN/.test(mat.name))maps.push({material:mat.uuid,map:mat.map?.uuid,shade:mat.shadeMultiplyTexture?.uuid,mtoon:!!mat.isMToonMaterial});});return{sha:a.profile.sha256,root:a.root.position.toArray(),bones,face:['happy','aa','blink'].map(n=>a.vrm.expressionManager.getValue(n)),expression:l.preset,speaking:l.speaking,faceTime:l.time,action:metrics.action,actionTime:metrics.actionTime,phase:metrics.phase,sitProgress:metrics.sitProgress,moving:metrics.moving,outfit:e.outfit,debugBody:e.debugBody,coverage:e.bodyTextureCoverage,items:e.items,maps};}
   const av=collect(a),bv=collect(b.avatar),shared=Object.fromEntries(Object.keys(av).map(k=>[k,[...av[k]].filter(o=>bv[k].has(o)).length]));
   const disposes=[];for(const k of ['materials','geometries','textures'])for(const o of av[k])o.addEventListener('dispose',()=>disposes.push({kind:k,uuid:o.uuid}));
   window.pairQA={sample,primary:()=>sample(a,d.motion()),peer:()=>d.comparison()?sample(d.comparison().avatar,d.comparison().motion):null,disposes,samples:[],phase:'loaded',collect};
   const hashes={female:await hash(a.profile.url),male:await hash(b.avatar.profile.url)};
   return{hashes,shared,domUnchanged:dom===document.querySelector('.debug-controls').innerHTML,independentConfig:a.config!==b.avatar.config,counts:Object.fromEntries(Object.keys(av).map(k=>[k,{a:av[k].size,b:bv[k].size}]))};
  });
  assert.equal(report.load.hashes.female,'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef');assert.equal(report.load.hashes.male,'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81');
  assert(report.load.domUnchanged&&report.load.independentConfig);assert(Object.values(report.load.shared).every(n=>n===0));
  report.pausedIsolation=await page.evaluate(()=>{
   const d=__debug,q=pairQA,a=d.avatar(),b=d.comparison();
   const beforeB=JSON.stringify(q.peer());a.setDebugBody(true);a.setExpression('happy');a.update(0);d.action('dance');const bUnchanged=beforeB===JSON.stringify(q.peer());const aBase=q.primary();
   const beforeA=JSON.stringify(q.primary());b.avatar.setDebugBody(true);b.avatar.setExpression('aa');b.avatar.update(0);b.action('walk');const aUnchanged=beforeA===JSON.stringify(q.primary());
   b.action('idle');d.action('idle');a.setDebugBody(false);b.avatar.setDebugBody(false);a.setExpression('neutral');b.avatar.setExpression('neutral');a.update(0);b.avatar.update(0);
   return{bUnchanged,aUnchanged,aBase,restoredA:q.primary(),restoredB:q.peer()};
  });assert(report.pausedIsolation.aUnchanged&&report.pausedIsolation.bUnchanged);assert.equal(report.pausedIsolation.aBase.coverage.covered,false);
  await page.screenshot({path:path.join(out,'pair-loaded.png')});
  await page.evaluate(()=>{
   const canvas=__debug.renderer.domElement,stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
   pairQA.capture={stream,chunks,recorder,started:performance.now(),done:new Promise(r=>recorder.onstop=r)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
   pairQA.timer=setInterval(()=>{const s=__debug.snapshot();pairQA.samples.push({wall:performance.now()-pairQA.capture.started,phase:pairQA.phase,simulationTime:s.simulationTime,rate:s.playbackRate,a:pairQA.primary(),b:pairQA.peer(),frameMs:s.frameMs,renderSubmitMs:s.renderSubmitMs});},250);__debug.setPlaybackRate(1);__debug.setPaused(false);
  });
  const mark=async name=>{report.checkpoints.push(await page.evaluate(name=>{pairQA.phase=name;return{name,a:pairQA.primary(),b:pairQA.peer()};},name));};
  await page.evaluate(()=>{pairQA.phase='female-base-happy-dance';__debug.setBodyMode('base');__debug.avatar().setExpression('happy');__debug.action('dance');});await page.waitForTimeout(3500);await mark('female-base-happy-dance-end');
  assert.equal(report.checkpoints.at(-1).b.expression,'neutral');assert.equal(report.checkpoints.at(-1).b.coverage.covered,true);assert.equal(report.checkpoints.at(-1).b.action,'idle');
  await page.screenshot({path:path.join(out,'female-base-male-dressed.png')});
  await page.evaluate(()=>{__debug.action('idle');__debug.setBodyMode('dressed');__debug.avatar().setExpression('neutral');const b=__debug.comparison();b.avatar.setDebugBody(true);b.avatar.setExpression('aa');b.command({type:'walk',x:1.4,z:2.2});pairQA.phase='male-base-aa-walk';});
  await page.waitForTimeout(4000);await mark('male-base-aa-walk-end');
  assert.equal(report.checkpoints.at(-1).a.expression,'neutral');assert.equal(report.checkpoints.at(-1).a.coverage.covered,true);
  await page.evaluate(()=>{const b=__debug.comparison();b.action('idle');b.avatar.setDebugBody(false);b.avatar.setExpression('neutral');pairQA.phase='shared-seat-request';});
  report.seatConflict=await page.evaluate(()=>{const a=__debug.request({requestId:'pair-a-sit',kind:'sit'}),b=__debug.comparison().request({requestId:'pair-b-sit',kind:'sit'});return{a,b,lease:__debug.seatLeases.forSeat('room-chair-1')};});
  assert.equal(report.seatConflict.a.task.state,'running');assert.equal(report.seatConflict.b.task.state,'failed');assert.equal(report.seatConflict.b.task.reason,'seat-unavailable');
  await page.waitForFunction(()=>__debug.tasks().get('pair-a-sit')?.state==='completed',null,{timeout:25000});await mark('female-seated-male-denied');await page.screenshot({path:path.join(out,'seat-conflict.png')});
  report.disposal=await page.evaluate(()=>{const q=pairQA,b=__debug.comparison(),root=b.avatar.root;const before=q.primary();__debug.removeComparison();return{before,after:q.primary(),comparisonCleared:__debug.comparison()===null,peerRemoved:!root.parent,mainAttached:!!__debug.avatar().root.parent,mainDisposes:q.disposes.slice()};});
  assert(report.disposal.comparisonCleared&&report.disposal.peerRemoved&&report.disposal.mainAttached);assert.equal(report.disposal.mainDisposes.length,0);assert.deepEqual(report.disposal.before,report.disposal.after);
  await page.evaluate(()=>{pairQA.phase='female-after-peer-disposal';__debug.action('stand');});
  await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress<.001&&__debug.snapshot().motion.transitionComplete,null,{timeout:12000});
  await page.evaluate(()=>__debug.action('dance'));await page.waitForTimeout(3000);await mark('female-running-after-disposal');assert.equal(report.checkpoints.at(-1).a.action,'dance');assert.equal(report.checkpoints.at(-1).b,null);
  await page.evaluate(()=>__debug.action('idle'));await page.screenshot({path:path.join(out,'after-peer-disposal.png')});
  assert.equal(report.errors.length,0,report.errors.join('\n'));report.status='runtime-isolation-checks-passed-visual-review-pending';
 }catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;if(page)try{report.failureSnapshot=await page.evaluate(()=>({snapshot:window.__debug?.ready?__debug.snapshot():null,peer:window.pairQA?.peer()}));await page.screenshot({path:path.join(out,'failure.png')});}catch(e){report.captureError=String(e);}}
 finally{
  if(page)try{const capture=await page.evaluate(async()=>{if(!window.pairQA?.capture)return null;const q=pairQA,c=q.capture;clearInterval(q.timer);if(c.recorder.state!=='inactive')c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());const blob=new Blob(c.chunks,{type:'video/webm'});const data=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob);});return{data,milliseconds:performance.now()-c.started,samples:q.samples,mainDisposes:q.disposes};});if(capture){await fs.writeFile(path.join(out,report.status==='failed'?'failure-partial-1x.webm':'native-pair-1x.webm'),Buffer.from(capture.data.split(',')[1],'base64'));await fs.writeFile(path.join(out,'samples.json'),JSON.stringify(capture.samples,null,2));report.recording={milliseconds:capture.milliseconds,rate:1,samples:capture.samples.length};report.mainDisposes=capture.mainDisposes;}}catch(e){report.recordingError=String(e);}
  await browser?.close();if(server)await new Promise(r=>server.close(r));report.resourcesReleased={browser:true,temporaryServer:true};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build,error:report.error,recording:report.recording,out}));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
