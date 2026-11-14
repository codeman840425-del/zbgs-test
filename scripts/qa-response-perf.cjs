// Fixed-build observation only: browser-local wrappers, no product source edits.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const url=process.argv[2]||'http://127.0.0.1:4180';
const expected=process.env.QA_BUILD||'6e6a4fc03f64';
const viewport={width:1440,height:Number(process.env.QA_VIEW_HEIGHT||1000)};
(async()=>{
 const out=path.resolve(`output/playwright/response-perf/${expected}`);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false});const context=await browser.newContext({viewport}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready&&window.__debug.buildInfo?.shortId);
  const meta=await page.evaluate(()=>{const d=window.__debug,g=d.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');return {build:d.buildInfo,ua:navigator.userAgent,cores:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,webglRenderer:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),initial:d.snapshot()};});
  if(meta.build.shortId!==expected)throw Error(`Expected ${expected}, got ${meta.build.shortId}`);
  await page.evaluate(()=>{
   const d=window.__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),m=d.motion();
   const q=window.__rp={events:[],trace:[],frames:[],active:false,current:null};
   document.addEventListener('pointerup',e=>{if(e.target===d.game.canvas)q.events.push({kind:'pointerup',t:performance.now(),x:e.clientX,y:e.clientY});},true);
   const command=c.command;c.command=function(cmd){if(cmd.type==='walk')q.events.push({kind:'walk-command',t:performance.now(),x:cmd.x,z:cmd.z,position:a.root.position.toArray(),yaw:c.yaw,targetBefore:c.target});return command.call(this,cmd);};
   function wrap(obj,key,label){const original=obj[key];obj[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{if(q.active&&q.current){q.current[label]=(q.current[label]||0)+(performance.now()-t);q.current[label+'Calls']=(q.current[label+'Calls']||0)+1;}}};}
   wrap(m,'update','motion');wrap(a,'update','avatarIncludingVrm');wrap(a.vrm,'update','vrm');wrap(a,'updateGarment','garment');wrap(d.renderer,'render','renderSubmit');
   const simulate=c.simulate;c.simulate=function(dt){const t=performance.now();const result=simulate.call(this,dt);if(q.active&&q.current){q.current.simulate=(q.current.simulate||0)+performance.now()-t;q.current.simulateCalls=(q.current.simulateCalls||0)+1;q.current.simulatedSeconds=(q.current.simulatedSeconds||0)+dt;}if(q.traceOn)q.trace.push({t:performance.now(),position:a.root.position.toArray(),yaw:c.yaw,speed:c.actualSpeed,pathTurn:c.pathTurn,target:c.target?.slice(),phase:m.getMetrics().phase});return result;};
   // Phaser caches scene.update; use its actual frame lifecycle events.
   c.events.on('preupdate',()=>{const t=performance.now();q.current=q.active?{t,frameInterval:q.previous?t-q.previous:null}:null;q.previous=t;});
   c.events.on('postupdate',()=>{if(q.active&&q.current){q.current.update=performance.now()-q.current.t;q.current.simulationOther=(q.current.simulate||0)-(q.current.motion||0)-(q.current.avatarIncludingVrm||0)-(q.current.garment||0);q.frames.push(q.current);}q.current=null;});
   q.project=(x,z)=>{const b=d.game.canvas.getBoundingClientRect(),v=a.root.position.clone().set(x,0,z).project(d.cameraObject());return {x:b.left+(v.x+1)*b.width/2,y:b.top+(1-v.y)*b.height/2};};
   q.reset=()=>{q.traceOn=false;d.reset();d.setSpeed(.85);d.setOutfit(0);d.setBodyMode('dressed');d.setDynamics(true);d.setPaused(false);c.cameraPreset('room',true);};
  });
  async function prepare(){await page.evaluate(()=>window.__rp.reset());await page.waitForTimeout(550);}
  async function clickWorld(x,z){const p=await page.evaluate(([x,z])=>window.__rp.project(x,z),[x,z]);if(p.x<0||p.y<0||p.x>1440||p.y>1000)throw Error(`Projected target outside viewport ${JSON.stringify(p)}`);await page.mouse.click(p.x,p.y);}
  const prior=process.env.QA_PERF_ONLY?JSON.parse(await fs.readFile(path.join(out,'observations.json'),'utf8')):null;
  const skipResponse=Boolean(prior||process.env.QA_SKIP_RESPONSE);
  const trials=prior?.trials||[];
  for(const [label,x,z,wait]of (skipResponse?[]:[['idle-forward',-.5,2.7,900],['idle-90deg',1.2,1.15,3000],['idle-180deg',-.5,-1.0,4800]])){
   for(let repeat=0;repeat<3;repeat++){
    await prepare();await page.evaluate(()=>{window.__rp.events=[];window.__rp.trace=[];window.__rp.traceOn=true;});await clickWorld(x,z);await page.waitForTimeout(wait);
    const result=await page.evaluate(()=>({events:window.__rp.events,trace:window.__rp.trace}));trials.push({label,repeat,requested:[x,z],...result});console.log(`${label} ${repeat+1} observed`);
   }
  }
  if(!skipResponse){await prepare();await page.evaluate(()=>{window.__rp.events=[];window.__rp.trace=[];window.__rp.traceOn=true;});
  await clickWorld(-.5,2.9);await page.waitForTimeout(950);await clickWorld(-.5,-1.0);await page.waitForTimeout(850);await clickWorld(1.2,2.4);await page.waitForTimeout(4000);
  trials.push({label:'move-reverse-retarget',...await page.evaluate(()=>({events:window.__rp.events,trace:window.__rp.trace}))});}
  await page.evaluate(()=>{window.__rp.traceOn=false;});
  const perf=[];
  for(const config of [{name:'idle-pants',outfit:0,dynamics:true,walk:false},{name:'walk-pants',outfit:0,dynamics:true,walk:true},{name:'walk-skirt',outfit:1,dynamics:true,walk:true},{name:'walk-skirt-dynamics-off',outfit:1,dynamics:false,walk:true},{name:'walk-skirt-CPU-pressure-4x',outfit:1,dynamics:true,walk:true,cpu:4},{name:'sit-skirt',outfit:1,dynamics:true,walk:false,seatAction:'sit'},{name:'rise-skirt',outfit:1,dynamics:true,walk:false,seatAction:'stand'}]){
   await prepare();await page.evaluate(config=>{const d=window.__debug;d.setOutfit(config.outfit);d.setDynamics(config.dynamics);d.setSpeed(config.speed);if(config.walk){const c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();a.root.position.set(-3.2,0,1.8);c.yaw=Math.PI/2;a.root.rotation.y=c.yaw;d.motion().reset();d.walkTo(3.2,1.8);}if(config.seatAction){const c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),seat=d.snapshot().chair;d.setPaused(true);a.root.position.set(...seat.approach);c.yaw=seat.yaw;a.root.rotation.y=seat.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<180;i++)c.simulate(1/120);if(config.seatAction==='stand'){c.action('sit');for(let i=0;i<240;i++)c.simulate(1/120);}}}, {...config,speed:Number(process.env.QA_PERF_SPEED||.45)});
   const session=config.cpu?await context.newCDPSession(page):null;if(session)await session.send('Emulation.setCPUThrottlingRate',{rate:config.cpu});
   await page.waitForTimeout(400);await page.evaluate(config=>{window.__rp.frames=[];window.__rp.previous=null;window.__rp.sampleStart=performance.now();window.__rp.active=true;if(config.seatAction){__debug.setPaused(false);__debug.action(config.seatAction);}},config);await page.waitForTimeout(2600);
   const data=await page.evaluate(()=>{window.__rp.active=false;return {sampleWallMs:performance.now()-window.__rp.sampleStart,frames:window.__rp.frames,snapshot:window.__debug.snapshot()};});perf.push({...config,...data});if(session){await session.send('Emulation.setCPUThrottlingRate',{rate:1});await session.detach();}console.log(`${config.name}: ${data.frames.length} frames`);
  }
  const resources=await page.evaluate(()=>({renderer:{memory:{...__debug.renderer.info.memory},render:{...__debug.renderer.info.render},programs:__debug.renderer.info.programs.length},memory:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null,resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})),navigation:performance.getEntriesByType('navigation').map(n=>n.toJSON())}));
  const report={observedAt:new Date().toISOString(),url,viewport,browser:browser.version(),meta,errors,trials,perf,resources,limitations:['Desktop browser observation; CPU pressure is an approximate CPU-only throttle, not a mobile GPU/device test.','Movement residual includes path/state/world matrices/metrics; not pure pathfinding.','Nested avatar and VRM timers overlap; do not sum them.','renderSubmit is CPU submission, not GPU completion; timer wrappers and trace collection add overhead.','JS heap is not VRAM, browser process RSS or total system memory; resource counts are not memory byte measurements.']};
  await fs.writeFile(path.join(out,'observations.json'),JSON.stringify(report,null,2));await page.screenshot({path:path.join(out,'fixed-build.png')});
  console.log('Saved '+path.join(out,'observations.json'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
