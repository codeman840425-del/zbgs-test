// Higher-cadence supplementary recording. Playwright's page video is 25 fps;
// this records the actual Three canvas at a requested 60 fps, without resampling.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const out=path.resolve('output/playwright/canvas-walk');await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:false});
  const page=await browser.newPage({viewport:{width:1440,height:1080}});
  try{
    await page.goto(process.argv[2]||'http://127.0.0.1:4180/');await page.waitForFunction(()=>__debug?.ready);
    await page.evaluate(()=>{
      const d=__debug;d.setBodyMode('dressed');d.setOutfit(0);d.setCorrections('full');
      const r=d.renderer,render=r.render;window.__captureYaw=0;
      r.render=function(scene,camera){const a=d.avatar(),p=a.root.position,y=a.root.rotation.y+window.__captureYaw;camera.position.set(p.x+Math.sin(y)*3.2,1.35,p.z+Math.cos(y)*3.2);camera.lookAt(p.x,.85,p.z);return render.call(this,scene,camera);};
      window.__captureFrames=[];let previous;window.__resetCaptureClock=()=>{previous=undefined};const tick=t=>{if(previous!==undefined)__captureFrames.push(t-previous);previous=t;requestAnimationFrame(tick)};requestAnimationFrame(tick);
    });
    const reports=[];
    for(const [name,speed,angle] of [['normal-front',.85,0],['normal-side',.85,Math.PI/2],['slow-side',.45,Math.PI/2],['fast-side',1.3,Math.PI/2]]){
      await page.evaluate(({speed,angle})=>{
        const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.setPaused(true);d.reset();d.setSpeed(speed);window.__captureYaw=angle;
        a.root.position.set(-3.2,0,1.8);c.yaw=Math.PI/2;a.root.rotation.y=c.yaw;d.motion().reset();
        for(let i=0;i<240;i++)c.simulate(1/120);
      },{speed,angle});
      await page.evaluate(()=>{
        window.__captureFrames=[];window.__resetCaptureClock();window.__videoChunks=[];
        const stream=__debug.renderer.domElement.captureStream(60);
        window.__canvasRecorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000});
        __canvasRecorder.ondataavailable=e=>{if(e.data.size)__videoChunks.push(e.data)};
        __canvasRecorder.start(250);__debug.setPaused(false);__debug.walkTo(3.2,1.8);
      });
      await page.waitForFunction(()=>__debug.snapshot().mode==='walk');
      await page.waitForFunction(()=>__debug.snapshot().mode==='idle',null,{timeout:35000});await page.waitForTimeout(1200);
      const capture=await page.evaluate(async()=>{
        const rec=__canvasRecorder;await new Promise(resolve=>{rec.onstop=resolve;rec.stop()});rec.stream.getTracks().forEach(t=>t.stop());
        const data=new Uint8Array(await new Blob(__videoChunks,{type:'video/webm'}).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
        return {base64:btoa(binary),frames:__captureFrames,build:__debug.buildInfo,snapshot:__debug.snapshot()};
      });
      await fs.writeFile(path.join(out,name+'.webm'),Buffer.from(capture.base64,'base64'));
      delete capture.base64;reports.push({name,speed,requestedCaptureFPS:60,...capture});console.log(name+' recorded');
    }
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify({browser:await browser.version(),viewport:page.viewportSize(),limitation:'Requested canvas stream 60 fps; encoded frame timing must be checked separately. rAF is not GPU time.',reports},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
