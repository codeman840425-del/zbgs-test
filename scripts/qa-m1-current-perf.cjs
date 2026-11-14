// Sustained current-candidate measurements without video capture or CPU throttling.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const build=process.env.QA_M1_BUILD;
if(!build)throw Error('Require explicit QA_M1_BUILD');
const identity={build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};
const quant=(rows,key)=>{const a=rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(x=>x>33.34).length,over50:a.filter(x=>x>50).length};};
(async()=>{
 const out=path.resolve(`output/playwright/m1/${build}/sustained-perf`);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse to overwrite measured report');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:false}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>__debug?.ready);const gate=await verifyCandidate(page,identity);
  const meta=await page.evaluate(()=>{const d=__debug,g=d.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,cores:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,gpu:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,loadMs:d.snapshot().loadMs};});
  await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=window.__measure={active:false,frames:[],previous:null,current:null};
   const wrap=(o,k,label)=>{const f=o[k];o[k]=function(...args){const t=performance.now();try{return f.apply(this,args)}finally{if(q.current)q.current[label]=(q.current[label]||0)+performance.now()-t;}}};
   q.instrument=(a,m)=>{wrap(m,'update','motionMs');wrap(a,'update','avatarMs');wrap(a,'updateGarment','garmentMs');wrap(a.vrm,'update','vrmMs')};
   q.instrument(d.avatar(),d.motion());wrap(d.renderer,'render','renderSubmitMs');
   c.events.on('preupdate',()=>{const t=performance.now();q.current=q.active?{t,frameMs:q.previous===null?null:t-q.previous}:null;q.previous=t;});
   c.events.on('postupdate',()=>{if(q.current){q.current.cpuUpdateMs=performance.now()-q.current.t;q.current.mode=c.mode;q.current.speed=c.actualSpeed;q.frames.push(q.current);}q.current=null;});
  });
  const results=[];
  for(const config of [
   {name:'base-walk',base:true,walk:true},{name:'pants-walk',walk:true},{name:'skirt-walk',skirt:true,walk:true},
   {name:'skirt-sit-hold',skirt:true,sit:true},{name:'skirt-sit-rise-switches',skirt:true,switches:true},
   {name:'pants-run',walk:true,speed:2.6},{name:'skirt-run',skirt:true,walk:true,speed:2.6},
   {name:'dual-pants-walk',dual:true,walk:true},{name:'dual-skirt-pants-walk',dual:true,skirt:true,walk:true}
  ]){
   await page.evaluate(async cfg=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.removeComparison();d.reset();d.setBodyMode(cfg.base?'base':'dressed');d.setOutfit(cfg.skirt?1:0);d.setDynamics(!cfg.base);d.camera('room');d.setSpeed(cfg.speed||.85);d.setPaused(true);
    if(cfg.dual){const p=await d.loadComparison('male');__measure.instrument(p.avatar,p.motion);p.controller.yaw=Math.PI/2;p.avatar.root.position.set(-2.2,0,2.6);p.avatar.root.rotation.y=Math.PI/2;p.motion.reset();}
    if(cfg.sit){c.action('sit');for(let i=0;i<2400;i++){c.simulate(1/120);if(c.mode==='sit'&&d.motion().getMetrics().sitProgress===1)break;}}
    for(let i=0;i<120;i++)c.simulate(1/120);d.setPaused(false);
    window.__perfEndpoint=1;
    if(cfg.walk){d.walkTo(2.7,1.8);d.comparison()?.request({requestId:'perf-peer-start',kind:'walk',payload:{x:2.7,z:2.6}});}
    if(cfg.switches)d.action('sit');
   },config);
   await page.waitForTimeout(1000);
   await page.evaluate(()=>{__measure.frames=[];__measure.previous=null;__measure.active=true;});
   const start=Date.now();
   while(Date.now()-start<12000){
    await page.waitForTimeout(250);
    await page.evaluate(cfg=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');
     if(cfg.walk&&c.mode==='idle'&&!c.target){window.__perfEndpoint*=-1;d.walkTo(window.__perfEndpoint*2.7,1.8);}
     const p=d.comparison();if(cfg.walk&&p&&p.controller.mode==='idle'&&!p.controller.target)p.request({requestId:'perf-peer-'+performance.now(),kind:'walk',payload:{x:p.avatar.root.position.x>0?-2.7:2.7,z:2.6}});
     if(cfg.switches){if(c.mode==='sit'&&d.motion().getMetrics().sitProgress===1)d.action('stand');else if(c.mode==='idle'&&!c.target)d.action('sit');}
    },config);
   }
   const data=await page.evaluate(()=>{__measure.active=false;const s=__debug.snapshot();return {frames:__measure.frames,resources:{renderer:s.renderer,heap:s.heap},end:{mode:s.mode,position:s.position}};});
   const summary={};for(const key of ['frameMs','cpuUpdateMs','motionMs','avatarMs','vrmMs','garmentMs','renderSubmitMs'])summary[key]=quant(data.frames,key);
   results.push({config,wallMs:Date.now()-start,...data,summary});console.log(config.name,JSON.stringify(summary.frameMs));
  }
  const finalGate=await verifyCandidate(page,identity);
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({gate,finalGate,meta,viewport:{width:1440,height:900},browser:browser.version(),errors,results,limitations:['Development machine only; no target ordinary-PC pass.','12-second sustained sample per case, not a soak test.','No video encoding or CPU throttle in this run. Nested motion/VRM/garment timers overlap and must not be summed.','Frame interval is browser/OS pacing; renderSubmit is CPU submission, not GPU completion.','JS heap is not VRAM or whole-process memory.']},null,2));
  if(errors.length)throw Error('Page errors in recorded measurement');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
