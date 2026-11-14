// Fixed M1 supplementary capture. Requested60fps is not encoded60fps or GPU time.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
(async()=>{
 const identity=expectations(),url=process.argv[2];if(!url)throw Error('Require explicit fixed URL');
 const match712=process.env.QA_MATCH_712==='1';
 const outfit=Number(process.env.QA_OUTFIT||0),bodyMode=process.env.QA_BODY_MODE||(match712?'base':'dressed');
 const out=await prepareOutput(identity.build,process.env.QA_OUTDIR||'walk'),reports=[],errors=[];
 const browser=await chromium.launch({channel:'chrome',headless:false}),page=await browser.newPage({viewport:{width:1440,height:match712?1080:900}});
 let initialGate,activeName;
 async function saveCapture(name,completed){
  const capture=await page.evaluate(async()=>{
   const rec=window.__canvasRecorder;if(!rec)return null;
   if(rec.state!=='inactive')await new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(Error(e.error?.message||'MediaRecorder error'));rec.stop();});
   rec.stream.getTracks().forEach(t=>t.stop());window.__canvasRecorder=null;
   const data=new Uint8Array(await new Blob(window.__videoChunks,{type:rec.mimeType}).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
   return {base64:btoa(binary),mimeType:rec.mimeType,frames:window.__captureFrames,samples:window.__captureSamples,build:__debug.buildInfo,snapshot:__debug.snapshot()};
  });
  if(!capture)return null;
  await fs.writeFile(path.join(out,name+(completed?'':'-incomplete')+'.webm'),Buffer.from(capture.base64,'base64'));delete capture.base64;return capture;
 }
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready&&__debug.buildInfo?.shortId);
  initialGate=await verifyCandidate(page,identity);await fs.writeFile(path.join(out,'start-manifest.json'),JSON.stringify({url,initialGate,outfit,bodyMode},null,2));
  await page.evaluate(match712=>{
   const d=__debug,r=d.renderer,render=r.render,a=d.avatar(),head=a.vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(a.root.position.clone());
   const h=Math.max(.5,head.y-a.root.position.y+.15);window.__captureYaw=0;
   r.render=function(scene,camera){const p=a.root.position,y=a.root.rotation.y+window.__captureYaw,dist=h/(2*Math.tan(camera.fov*Math.PI/360))*1.35;camera.position.set(p.x+Math.sin(y)*dist,p.y+h*.55,p.z+Math.cos(y)*dist);camera.lookAt(p.x,p.y+h*.5,p.z);if(match712){camera.position.set(p.x+Math.sin(y)*3.2,1.35,p.z+Math.cos(y)*3.2);camera.lookAt(p.x,.85,p.z);}return render.call(this,scene,camera);};
   let previous;window.__resetCaptureClock=()=>{previous=undefined;};
   const tick=t=>{if(previous!==undefined&&window.__canvasRecorder?.state==='recording'){
    const m=d.motion().getMetrics();a.root.updateMatrixWorld(true);
    window.__captureFrames.push(t-previous);window.__captureSamples.push({t,frameMs:t-previous,phase:m.phase,sourceTime:m.sourceTime,gait:m.gait,distance:m.distance,root:m.rootWorld,hip:m.hipWorld,correction:m.hipCorrection,feet:m.feet.map(f=>({side:f.side,contact:f.contact,target:f.target,supportWeight:f.supportWeight,raw:a.vrm.humanoid.getRawBoneNode(f.side+'Foot').getWorldPosition(a.root.position.clone()).toArray()}))});
   }previous=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  },match712);
  const cases= [['normal-front',.85,0],['normal-side',.85,Math.PI/2],['slow-side',.45,Math.PI/2],['fast-side',1.3,Math.PI/2]];
  const selected=process.env.QA_WALK_CASES?.split(',');
  for(const [name,speed,angle]of cases.filter(c=>!selected||selected.includes(c[0]))){
   activeName=name;const clipGate=await verifyCandidate(page,identity);
   const setup=await page.evaluate(({speed,angle,outfit,bodyMode,match712})=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setBodyMode(bodyMode);d.setOutfit(outfit);d.setDynamics(bodyMode!=='base');d.setCorrections('full');d.setSpeed(speed);window.__captureYaw=angle;
    if(match712){const a=d.avatar();a.root.position.set(-3.2,0,1.8);c.yaw=Math.PI/2;a.root.rotation.y=c.yaw;d.motion().reset();for(let i=0;i<240;i++)c.simulate(1/120);return d.snapshot();}
    // Setup reaches the start through the room controller; no forced root transform.
    c.go(-3.2,1.8);let i=0;for(;i<7200;i++){c.simulate(1/120);const s=d.snapshot();if(!s.target&&!s.pending&&s.mode==='idle'&&Math.hypot(s.position[0]+3.2,s.position[2]-1.8)<.05)break;}
    if(i===7200)throw Error('Recorder start point is unreachable');for(let j=0;j<120;j++)c.simulate(1/120);
    return d.snapshot();
   },{speed,angle,outfit,bodyMode,match712});
   await page.evaluate(()=>{
    window.__captureFrames=[];window.__captureSamples=[];window.__resetCaptureClock();window.__videoChunks=[];
    const stream=__debug.renderer.domElement.captureStream(60),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('No supported WebM encoder');
    window.__canvasRecorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});__canvasRecorder.ondataavailable=e=>{if(e.data.size)__videoChunks.push(e.data);};
    __canvasRecorder.start(250);__debug.setPaused(false);__debug.walkTo(3.2,1.8);
   });
   await page.waitForFunction(()=>__debug.snapshot().mode==='walk',null,{timeout:15000});
   await page.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending&&Math.hypot(s.position[0]-3.2,s.position[2]-1.8)<.05;},null,{timeout:35000});await page.waitForTimeout(1200);
   const capture=await saveCapture(name,true),finalGate=await verifyCandidate(page,identity);
   reports.push({name,speed,completed:true,requestedCaptureFPS:60,clipGate,finalGate,setup,...capture});
   await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(reports.at(-1),null,2));console.log(name+' recorded');activeName=null;
  }
  const finalGate=await verifyCandidate(page,identity);
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,initialGate,finalGate,browser:await browser.version(),viewport:page.viewportSize(),outfit,bodyMode,match712,errors,limitation:'Requested stream60fps; encoded timestamps need separate inspection. rAF is not GPU time. Raw bone displacement includes normal swing and is not support slip.',reports},null,2));
  if(errors.length)throw Error('Page errors occurred; inspect report');
 }catch(error){let partial;try{if(activeName)partial=await saveCapture(activeName,false);}catch(captureError){partial={captureError:String(captureError)};}await writeFailure(out,error,{initialGate,reports,activeName,partial,errors});throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
