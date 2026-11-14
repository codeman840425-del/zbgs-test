// Realtime fixed-build comparison: same body, camera, inputs and playback rate.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const expectedBuild=process.argv[3]||'7127534d2536';
const expectedBody='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
(async()=>{
 const out=path.resolve(`output/playwright/m1/${expectedBuild}/turn`);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
 try{for(const legacy of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:out,size:{width:1280,height:900}}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(process.argv[2]||'http://127.0.0.1:4191');if(legacy)url.searchParams.set('turnLegacy','');
  await page.goto(url.href);await page.waitForFunction(()=>__debug?.ready&&__debug.buildInfo?.shortId,null,{timeout:90000});
  const identity=await page.evaluate(async()=>{const d=__debug,profile=d.avatar().profile;const bytes=await(await fetch(profile.url)).arrayBuffer();return{build:d.buildInfo,profile,actualBodySha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')};});
  if(identity.build.shortId!==expectedBuild||identity.actualBodySha!==expectedBody)throw Error('Candidate identity mismatch');
  await page.evaluate(({legacy,build})=>{
   const d=__debug;d.setPaused(true);d.reset();d.setBodyMode('base');d.setOutfit(0);d.setDynamics(false);d.setPlaybackRate(1);d.camera('close');
   const label=document.createElement('div');label.id='turn-qa-label';label.style='position:fixed;left:32px;top:10px;background:#fff;padding:6px 12px;z-index:99999;font:14px sans-serif;pointer-events:none';document.body.append(label);
   window.__turnRecording={events:[],frames:[],started:performance.now(),labelPrefix:`${legacy?'旧版':'新版'} · ${build} · 新Base_Female · 正常速度`};
   const tick=()=>{const r=window.__turnRecording;if(!r)return;const s=d.snapshot();r.frames.push({wallSeconds:(performance.now()-r.started)/1000,simulationTime:s.simulationTime,mode:s.mode,yaw:s.facing,position:s.position,turnActive:s.turnPlan.active,pathTurn:s.pathTurn});r.raf=requestAnimationFrame(tick);};tick();
  },{legacy,build:expectedBuild});
  async function action(label,fn){await page.evaluate(({label,fn})=>{const r=window.__turnRecording;r.events.push({label,wallSeconds:(performance.now()-r.started)/1000});document.querySelector('#turn-qa-label').textContent=r.labelPrefix+' · '+label;(0,eval)(fn);},{label,fn});}
  await action('180°换向后行走',"__debug.setPaused(false);__debug.walkTo(-.5,-.75)");
  await page.waitForTimeout(7800);
  const half=await page.evaluate(()=>__debug.snapshot());
  await action('恢复相同起点',"__debug.reset();__debug.setBodyMode('base');__debug.setDynamics(false);__debug.setPlaybackRate(1)");
  await page.waitForTimeout(600);
  await action('开始360°转身',"__debug.action('turn')");
  await page.waitForTimeout(270);
  await action('中途改为左侧目标',"__debug.walkTo(-2,1.15)");
  await page.waitForTimeout(7800);
  const final=await page.evaluate(()=>{const r=__turnRecording;cancelAnimationFrame(r.raf);return{recording:r,state:__debug.snapshot()};});
  await page.screenshot({path:path.join(out,legacy?'legacy-reselect-end.png':'new-reselect-end.png')});
  const video=page.video();await context.close();
  const filename=legacy?'legacy-180-reselect.webm':'new-180-reselect.webm';await video.saveAs(path.join(out,filename));
  reports.push({identity,url:url.href,video:filename,halfTurnEnd:half,final,errors});
 }
 await fs.writeFile(path.join(out,'realtime-comparison.json'),JSON.stringify(reports,null,2));
 console.log(JSON.stringify(reports.map(r=>({build:r.identity.build.shortId,body:r.identity.actualBodySha,url:r.url,video:r.video,events:r.final.recording.events,finalMode:r.final.state.mode,errors:r.errors})),null,2));
 if(reports.some(r=>r.errors.length))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
