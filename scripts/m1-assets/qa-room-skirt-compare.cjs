// Same fixed product build. The source view is a diagnostic visibility override,
// NOT a prior-build recording. Fixed 120 Hz inputs, replayed at wall-clock 1x.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),build=process.env.QA_BUILD||'7127534d2536';
const url=process.argv[2]||'http://127.0.0.1:4191/';
(async()=>{
 const out=path.join(root,'output/playwright/m1',build,'skirt-compare');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
 try{for(const variant of ['source','corrected']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready);
  const actual=await page.evaluate(()=>__debug.buildInfo.shortId);if(actual!==build)throw Error('Build mismatch '+actual);
  const report=await page.evaluate(async({variant,build})=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();
    d.setPaused(true);d.reset();d.setPlaybackRate(1);d.setBodyMode('dressed');d.setDynamics(true);d.setOutfit(1);d.setCorrections('full');d.setHelpers(false);
    const seat=d.snapshot().chair;a.root.position.set(...seat.approach);c.yaw=seat.yaw;a.root.rotation.y=seat.yaw;d.motion().reset();
    d.motion().update(0,{moving:false,distanceDelta:0,speed:0,action:'idle'});a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();
    for(let i=0;i<240;i++)c.simulate(1/120);
    const corrected=d.scene.getObjectByName('M1_UniformSkirt_Constrained');
    const container=d.scene.getObjectByName('Equipment:m1-uniform-skirt');let source;
    container.traverse(o=>{if(o.isSkinnedMesh)source=o;});
    if(!source||!corrected)throw Error('Actual source/corrective skirt meshes missing');
    source.visible=variant==='source';corrected.visible=variant==='corrected';
    d.view('side');d.advance(0);
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=960;const ctx=canvas.getContext('2d');
    const chunks=[],stream=canvas.captureStream(60),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    const frames=[],samples=[],keys={},keySteps=new Set([0,60,120,180,240,420,540,600,780]);
    const initial=d.snapshot(),sourceName=source.name;let step=0,lastFrame;
    const sample=()=>{const m=d.motion().getMetrics();return{step,t:step/120,mode:c.mode,simulationTime:c.simulationTime,sourceTime:m.sourceTime,sitProgress:m.sitProgress,root:a.root.position.toArray(),yaw:a.root.rotation.y,hip:a.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(a.root.position.clone()).toArray(),sourceVisible:source.visible,correctedVisible:corrected.visible};};
    const draw=()=>{d.advance(0);const image=d.renderer.domElement;ctx.fillStyle='#e6e8e8';ctx.fillRect(0,0,1280,960);const scale=Math.min(1280/image.width,905/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(1280-w)/2,55+(905-h)/2,w,h);ctx.fillStyle='#142b39';ctx.fillRect(0,0,1280,55);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText(`${build} | ${variant==='source'?'源裙诊断：同构建原蒙皮 + 原裙骨物理':'修正裙：同构建实际裙片约束 + 碰撞'} | 1× | t=${(step/120).toFixed(2)}s`,18,35);};
    draw();keys[0]=canvas.toDataURL('image/png').split(',')[1];samples.push(sample());
    recorder.start(200);const started=performance.now();
    await new Promise(resolve=>{const frame=now=>{
      if(lastFrame!==undefined)frames.push(now-lastFrame);lastFrame=now;
      const target=Math.min(840,Math.floor((now-started)*.12));
      while(step<target){if(step===0)c.action('sit');if(step===480)c.action('stand');c.simulate(1/120);step++;samples.push(sample());if(keySteps.has(step)){draw();keys[step]=canvas.toDataURL('image/png').split(',')[1];}}
      draw();if(step<840)requestAnimationFrame(frame);else resolve();
    };requestAnimationFrame(frame);});
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop()});stream.getTracks().forEach(t=>t.stop());
    const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return{variant,build:d.buildInfo,initial,final:d.snapshot(),inputs:{prewarmSteps:240,dt:1/120,sitAt:0,standAt:4,duration:7,playbackRate:1,camera:'side',start:'chair-local approach',dynamics:true,corrections:'full'},override:{sourceName,sourceVisible:source.visible,correctedName:corrected.name,correctedVisible:corrected.visible,sourceModeIsPriorBuild:false},frames,samples,keys,video:btoa(binary)};
  },{variant,build});
  await fs.writeFile(path.join(out,variant+'.webm'),Buffer.from(report.video,'base64'));delete report.video;
  for(const [step,data]of Object.entries(report.keys))await fs.writeFile(path.join(out,`${variant}-${String(step).padStart(3,'0')}.png`),Buffer.from(data,'base64'));delete report.keys;
  reports.push(report);await context.close();console.log(variant+' completed');
 }
 const a=reports[0].samples,b=reports[1].samples;let maxPoseDifference=0;
 if(a.length!==b.length)throw Error('Sample count mismatch');
 for(let i=0;i<a.length;i++){if(a[i].mode!==b[i].mode)throw Error('Action schedule mismatch');for(const key of ['root','hip'])for(let k=0;k<3;k++)maxPoseDifference=Math.max(maxPoseDifference,Math.abs(a[i][key][k]-b[i][key][k]));for(const key of ['yaw','sitProgress','simulationTime','sourceTime'])maxPoseDifference=Math.max(maxPoseDifference,Math.abs((a[i][key]||0)-(b[i][key]||0)));}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,build,maxPoseDifference,limitation:'Both videos are diagnostics of one fixed build. Source visibility override is not a previous product build. Physics steps use identical 120Hz inputs, rendered in real wall-clock time at 1x; requested capture60FPS is not a measured GPU rate.',reports},null,2));
 if(maxPoseDifference>1e-8)throw Error('Matched-pose replay differs: '+maxPoseDifference);console.log('Matched pose max difference '+maxPoseDifference);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
