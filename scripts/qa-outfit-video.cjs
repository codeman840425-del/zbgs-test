// Same camera, path and input conditions against preserved before and after.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const label=process.argv[3]||'after',out=path.resolve('output/playwright/acceptance',label);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false});
 const context=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:out,size:{width:1440,height:1080}}});
 const page=await context.newPage(),errors=[],segments=[];page.on('pageerror',e=>errors.push(String(e)));const started=Date.now();
 async function mark(name){segments.push({name,wallSeconds:(Date.now()-started)/1000});await page.evaluate(text=>{document.querySelector('#qa-caption').textContent=text;window.__qaSegment=text;},name);}
 async function pause(value){await page.evaluate(v=>{const c=__debug.game.scene.getScene('CharacterStudio');c.paused=v;},value);}
 async function view(angle){await page.evaluate(a=>window.__reviewView=a,angle);}
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:4180/');await page.waitForFunction(()=>__debug?.ready);
  await page.addStyleTag({content:'.viewport{height:850px!important;min-height:850px!important;}'});
  await page.evaluate(()=>{
   __debug.setBodyMode?.('dressed');__debug.setDynamics?.(true);__debug.setCorrections?.('full');__debug.setPlaybackRate?.(1);
   window.__qaFrames=[];window.__qaSegment='loading';let lastFrame;
   const frame=t=>{if(lastFrame!==undefined)window.__qaFrames.push({dt:t-lastFrame,segment:window.__qaSegment});lastFrame=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
   const label=document.createElement('div');label.id='qa-caption';label.style='position:absolute;left:50%;bottom:65px;transform:translateX(-50%);padding:8px 14px;background:#193d38;color:white;border-radius:8px;z-index:50;font:15px sans-serif;white-space:nowrap';document.querySelector('.viewport').append(label);
   const r=__debug.renderer,render=r.render;window.__reviewView=0;
   r.render=function(scene,camera){const a=__debug.avatar(),p=a.root.position,yaw=a.root.rotation.y+window.__reviewView;camera.position.set(p.x+Math.sin(yaw)*3.2,1.35,p.z+Math.cos(yaw)*3.2);camera.lookAt(p.x,.85,p.z);return render.call(this,scene,camera);};
  });
  for(const outfit of [1,0]){
   await page.evaluate(n=>{__debug.reset();__debug.setOutfit(n);},outfit);await pause(false);await page.waitForTimeout(1800);await pause(true);
   for(const [name,angle]of [['正面',0],['侧面',Math.PI/2],['背面',Math.PI]]){
    await mark(`${outfit?'裙装':'裤装'} · 同一静止姿势 · ${name}`);await view(angle);await page.waitForTimeout(800);
    await page.screenshot({path:path.join(out,`${outfit}-idle-${name}.png`)});
   }
   for(const [name,angle]of [['front',0],['side',Math.PI/2]]){
    await view(angle);
    // Harness-only placement: settle both builds identically before the recorded
    // walking segment. Do not inject a root teleport into spring/cloth history.
    await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');c.reset();c.paused=true;const a=d.avatar();a.root.position.set(-3.2,0,1.8);c.yaw=Math.PI/2;a.root.rotation.y=c.yaw;d.motion().reset();a.vrm.springBoneManager?.reset();for(let i=0;i<240;i++)c.simulate(1/120);});
    await mark(`${outfit?'裙装':'裤装'} · ${name==='front'?'正面':'侧面'}行走 · 0.85 m/s · 正常播放`);
    await page.evaluate(()=>{const c=__debug.game.scene.getScene('CharacterStudio');c.paused=false;c.go(3.2,1.8);});
    await page.waitForFunction(()=>__debug.snapshot().mode==='walk');
    await page.waitForFunction(()=>__debug.snapshot().mode==='idle',null,{timeout:30000});await page.waitForTimeout(1200);
    await page.screenshot({path:path.join(out,`${outfit}-walk-${name}-stop.png`)});
   }
   await mark(`${outfit?'裙装':'裤装'} · 站立 → 坐下 → 坐稳 → 起立`);await view(Math.PI/2);
   await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:30000});await page.waitForTimeout(2000);
   await page.screenshot({path:path.join(out,`${outfit}-seated-side.png`)});
   await pause(true);await view(0);await mark('同一坐姿时刻切换服装 · 人体与短裤始终保留');
   for(const n of [0,1,outfit]){await page.evaluate(n=>__debug.setOutfit(n),n);await page.waitForTimeout(850);await page.screenshot({path:path.join(out,`${outfit}-seated-swap-${n}.png`)});}
   await view(Math.PI/2);await pause(false);await page.evaluate(()=>__debug.action('stand'));await page.waitForFunction(()=>__debug.snapshot().mode==='idle');await page.waitForTimeout(1600);
   await page.screenshot({path:path.join(out,`${outfit}-stood-up-side.png`)});
  }
  const last=await page.evaluate(()=>__debug.snapshot());
  const environment=await page.evaluate(()=>{const r=__debug.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio,webglRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',rendererInfo:{memory:r.info.memory,render:r.info.render},heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,resources:performance.getEntriesByType('resource').map(x=>({name:x.name,duration:x.duration,transferSize:x.transferSize,decodedBodySize:x.decodedBodySize})),limitation:'Chrome desktop only; heap estimate is not process/GPU memory; instrumented recording, not a target-device performance certification.'};});
  const frames=await page.evaluate(()=>window.__qaFrames);
  const timing=[...new Set(frames.map(f=>f.segment))].map(segment=>{const values=frames.filter(f=>f.segment===segment).map(f=>f.dt).sort((a,b)=>a-b);return {segment,frames:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p99:values[Math.floor(values.length*.99)],max:values.at(-1),over33ms:values.filter(x=>x>33.4).length,over50ms:values.filter(x=>x>50).length};});
  await fs.writeFile(path.join(out,'frame-times.json'),JSON.stringify({timing,frames,limitation:'Real rAF intervals during browser recording; screenshots/control transitions included. Not GPU timing.'},null,2));
  await fs.writeFile(path.join(out,'recording.json'),JSON.stringify({date:new Date().toISOString(),label,url:page.url(),errors,segments,last,timing,environment,camera:'same renderer hook: distance 3.2 m, height 1.35 m, target height .85 m; yaw relative to avatar; viewport stage 850 px',path:'(-3.2,1.8) to (3.2,1.8), 0.85 m/s, normal playback; >3 full strides each'},null,2));
  if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({label,seconds:(Date.now()-started)/1000,segments:segments.length,errors}));
 }finally{const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,'outfit-walk-sit.webm'));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
