// Exclusive browser window required. Real wall-clock1x; no per-frame geometry probes.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(root,'prototype/node_modules/playwright'));
const {expectations,verifyCandidate}=require(path.join(root,'scripts/qa-m1-common.cjs'));
(async()=>{
 const expected=expectations(),url=process.argv[2];if(!/^https?:/.test(url||''))throw Error('Use run-fixed-check');
 const camera=process.env.QA_FOREARM_VIDEO_CAMERA||'close',dynamics=process.env.QA_FOREARM_VIDEO_DYNAMICS==='1';
 if(!['room','close','front','side','back'].includes(camera))throw Error('Unsupported camera');
 const out=path.join(root,'output/playwright/hand-contact-'+expected.build,'joint-normal-video-'+camera+(dynamics?'-dynamics':'')+'-'+Date.now());await fs.mkdir(out,{recursive:true});
 for(const name of ['lap.webm','authored.webm','report.json']){try{await fs.access(path.join(out,name));throw Error('Refuse existing video evidence');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const browser=await chromium.launch({channel:'chrome',headless:false}),results=[],pageEvents=[];
 try{for(const mode of ['legacy','actual']){
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>{errors.push(String(e));pageEvents.push({mode,type:'pageerror',message:String(e),time:Date.now()})});page.on('framenavigated',frame=>{if(frame===page.mainFrame())pageEvents.push({mode,type:'navigation',url:frame.url(),time:Date.now()})});page.on('crash',()=>pageEvents.push({mode,type:'crash',time:Date.now()}));
  await page.goto(url+'?forearm=calibrated&handTarget=authored&handSkin='+mode);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});const identity=await verifyCandidate(page,expected);
  await page.evaluate(({camera,dynamics})=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setPlaybackRate(1);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(dynamics);d.setCorrections('full');
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);c.cameraPreset(camera,true);
   for(let i=0;i<60;i++)c.simulate(1/60);
   const q=window.__forearmVideo={frames:[],events:[],chunks:[],start:performance.now(),previous:null,simulatedSeconds:0,simulateSteps:0};
   const originalSim=c.simulate;c.simulate=function(dt,...args){q.simulatedSeconds+=dt;q.simulateSteps++;return originalSim.call(this,dt,...args);};
   const stream=d.renderer.domElement.captureStream(60),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('No WebM support');
   q.recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});q.stream=stream;q.recorder.ondataavailable=e=>{if(e.data.size)q.chunks.push(e.data)};
   q.tick=t=>{if(q.recorder.state==='recording'){const s=d.snapshot();q.frames.push({t:t-q.start,frameMs:q.previous===null?null:t-q.previous,simulatedSeconds:q.simulatedSeconds,simulateSteps:q.simulateSteps,playbackRate:s.playbackRate,mode:s.mode,sitProgress:s.motion.sitProgress,handContacts:s.motion.handContacts,root:s.position,camera:s.camera});}q.previous=t;q.raf=requestAnimationFrame(q.tick);};q.recorder.start(250);q.raf=requestAnimationFrame(q.tick);d.setPaused(false);
  },{camera,dynamics});
  await page.waitForTimeout(1000);
  await page.evaluate(()=>{__forearmVideo.events.push({action:'sit',t:performance.now()-__forearmVideo.start});__debug.game.scene.getScene('CharacterStudio').action('sit')});
  await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>=.999,null,{timeout:15000});await page.waitForTimeout(1400);
  await page.evaluate(()=>{__forearmVideo.events.push({action:'stand',t:performance.now()-__forearmVideo.start});__debug.game.scene.getScene('CharacterStudio').action('stand')});
  await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress<=.001,null,{timeout:15000});await page.waitForTimeout(1200);
  const capture=await page.evaluate(async()=>{const q=__forearmVideo;await new Promise((resolve,reject)=>{q.recorder.onstop=resolve;q.recorder.onerror=e=>reject(e);q.recorder.stop()});q.stream.getTracks().forEach(t=>t.stop());cancelAnimationFrame(q.raf);const bytes=new Uint8Array(await new Blob(q.chunks,{type:q.recorder.mimeType}).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(s),mime:q.recorder.mimeType,events:q.events,frames:q.frames,final:__debug.snapshot()};});
  await fs.writeFile(path.join(out,mode+'.webm'),Buffer.from(capture.base64,'base64'));delete capture.base64;const finalIdentity=await verifyCandidate(page,expected);const report={mode,identity,finalIdentity,errors,...capture};await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify(report));results.push({mode,errors,frames:capture.frames.length,events:capture.events});await page.close();if(errors.length)throw Error('Page errors in '+mode);
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build:expected.build,viewport:[1440,1080],camera,dynamics,requestedStreamFPS:60,status:'isolated joint proxy A/B; actual normal speed visual acceptance pending',playback:'requested wall clock1x; cumulative actual simulatedSeconds recorded so dt clamp cannot masquerade as normal speed',results,limits:'Initial setup at chair approach only; not a path-approach acceptance. Requested60fps is not encoded60fps or target-device benchmark. No geometry probes during recording. Review entire normal-speed clips before visual acceptance.'},null,2));
 console.log(out);
 }finally{await fs.writeFile(path.join(out,'recording-attempt-'+Date.now()+'.json'),JSON.stringify(pageEvents,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
