// One bounded fixed-build shadow-update isolation; no product edits, draws, or prewarm.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [base,build,destination]=process.argv.slice(2);assert(base&&build&&destination);
const headful=process.argv.includes('--headful'),onOnly=process.argv.includes('--on-only'),externalInput=process.argv.includes('--input');
const out=path.resolve(destination),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stats=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return{n:a.length,max:a.at(-1)||0,p95:a[Math.floor((a.length-1)*.95)]||0,over50:a.filter(x=>x>50).length};};
const R={build,headless:!headful,onOnly,externalInput,cases:[],errors:[],scope:'Fresh Chrome process/profile per case, one original F/M edit per page; driver/OS cache not cleared. Default four cases F on/off, M off/on; --on-only two cases F/M on. --headful selects visible browser. rAF is not screen presentation and automation roundtrip is not input-to-photon. No recording, screenshots, profiler or throttling. Room unpaused. Freeze shadow updates only: enabled remains true and initial shadow maps retained, to preserve main shader configuration. This is diagnostic stale shadow, never a proposed product setting. CPU call return is not GPU completion or frame presentation.'};
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 try{for(const [body,shadow]of (onOnly?[['female',true],['male',true]]:[['female',true],['female',false],['male',false],['male',true]])){
  const tag=body+'-'+(shadow?'shadow-on':'shadow-frozen'),browser=await chromium.launch({channel:'chrome',headless:!headful});
  try{
   const p=await browser.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>R.errors.push({tag,error:String(e)}));
   const responses=[];p.on('response',r=>{if(/\/assets\/.*\.js(?:\?|$)/.test(r.url()))responses.push(r);});
   await p.goto(base+'?workbench=appearance&body='+body);await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
   assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);await p.locator('#appearance-geometry > summary').click();await p.waitForTimeout(1200);
   const buttonPoints={};if(externalInput)for(const tab of ['actions','inspection','appearance']){const b=await p.locator('[data-workbench-tab='+tab+']').boundingBox();assert(b);buttonPoints[tab]={x:b.x+b.width/2,y:b.y+b.height/2};}
   const environment=await p.evaluate(()=>{const r=__debug.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{userAgent:navigator.userAgent,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,checks:r.debug.checkShaderErrors,parallelCompile:!!g.getExtension('KHR_parallel_shader_compile'),body:__debug.avatar().profile.bodyType,geometry:__debug.avatar().facialGeometry.getState(),shadow:{enabled:r.shadowMap.enabled,autoUpdate:r.shadowMap.autoUpdate,type:r.shadowMap.type},build:__debug.buildInfo};});
   assert.equal(environment.body,body);assert.equal(environment.geometry.mouthWidth,0);assert.equal(environment.checks,true);assert.equal(environment.shadow.enabled,true);
   await p.evaluate(shadow=>{
    const r=__debug.renderer,g=r.getContext(),q=window.__shadowCause={label:'settle',record:true,frames:[],renders:[],shadows:[],gl:[],sets:[],compiles:[],longtasks:[],events:[],snapshots:[],heartbeat:[]};
    const ids=new WeakMap();let next=0,pass=null,inRender=false,inCompile=false;
    const id=o=>{if(!o)return null;if(!ids.has(o))ids.set(o,++next);return ids.get(o);};
    const describe=p=>({id:p.id,glID:id(p.program),name:p.name,type:p.type,cacheKey:p.cacheKey,usedTimes:p.usedTimes});
    q.snapshot=()=>({t:performance.now(),label:q.label,programs:r.info.programs.map(describe),geometry:__debug.avatar().facialGeometry.getState(),memory:{...r.info.memory},shadow:{enabled:r.shadowMap.enabled,autoUpdate:r.shadowMap.autoUpdate,needsUpdate:r.shadowMap.needsUpdate}});
    q.snapshots.push(q.snapshot());
    const direct=r.renderBufferDirect;r.renderBufferDirect=function(camera,scene,geometry,material,object,group){const prior=pass;pass={kind:material.isMeshDepthMaterial||material.isMeshDistanceMaterial?'shadow':'main',type:material.type,name:material.name,object:object.name,normalTargets:geometry.morphAttributes.normal?.length||0,positionTargets:geometry.morphAttributes.position?.length||0};try{return direct.apply(this,arguments);}finally{pass=prior;}};
    const render=r.render;r.render=function(...args){const row={start:performance.now(),label:q.label};inRender=true;try{return render.apply(this,args);}finally{inRender=false;row.end=performance.now();q.renders.push(row);}};
    const sr=r.shadowMap.render;r.shadowMap.render=function(...args){const row={start:performance.now(),label:q.label,enabled:this.enabled,autoUpdate:this.autoUpdate,needsUpdate:this.needsUpdate};try{return sr.apply(this,args);}finally{row.end=performance.now();q.shadows.push(row);}};
    const compile=r.compileAsync;r.compileAsync=function(...args){const row={start:performance.now(),label:q.label};q.compiles.push(row);inCompile=true;let job;try{job=compile.apply(this,args);}finally{inCompile=false;row.syncEnd=performance.now();}return job.then(v=>{row.end=performance.now();row.programs=r.info.programs.map(describe);return v;},e=>{row.end=performance.now();row.error=String(e);throw e;});};
    for(const name of ['linkProgram','getProgramInfoLog','texSubImage3D','texImage3D','bufferData']){const f=g[name];g[name]=function(...args){const row={name,start:performance.now(),label:q.label,inRender,inCompile,pass,glID:name==='linkProgram'||name==='getProgramInfoLog'?id(args[0]):null,bytes:args.findLast(a=>ArrayBuffer.isView(a))?.byteLength||0};try{return f.apply(this,args);}finally{row.end=performance.now();q.gl.push(row);}};}
    const api=__debug.avatar().facialGeometry,set=api.set;api.set=function(...args){const row={start:performance.now(),label:q.label,args};q.sets.push(row);const job=set.apply(this,args);row.syncEnd=performance.now();return job.then(v=>{row.end=performance.now();row.result=v;return v;},e=>{row.end=performance.now();row.error=String(e);throw e;});};
    let last=null;function frame(t){if(!q.record)return;q.frames.push({t,dt:last===null?null:t-last,label:q.label});last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
    let beat=performance.now();q.timer=setInterval(()=>{const t=performance.now();q.heartbeat.push({t,dt:t-beat,label:q.label});beat=t;},10);
    q.observer=new PerformanceObserver(list=>q.longtasks.push(...list.getEntries().map(e=>e.toJSON())));q.observer.observe({type:'longtask',buffered:false});
    document.addEventListener('pointerdown',e=>q.events.push({t:performance.now(),stamp:e.timeStamp,trusted:e.isTrusted,tab:e.target.closest('[data-workbench-tab]')?.dataset.workbenchTab,label:q.label}),true);
    document.addEventListener('change',e=>q.events.push({t:performance.now(),id:e.target.id,value:e.target.value,label:q.label}),true);
    if(!shadow){r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;}
   },shadow);
   await p.waitForTimeout(600);await p.evaluate(()=>{__shadowCause.label='baseline';__shadowCause.snapshots.push(__shadowCause.snapshot());});await p.waitForTimeout(700);
   await p.evaluate(()=>{__shadowCause.label='first-mouth';});const wall=performance.now();await p.selectOption('#mouth-width-sample','0.12');
   const inputs=[];if(externalInput)for(const tab of ['actions','inspection','appearance']){await p.waitForTimeout(20);const start=performance.now();await p.mouse.click(buttonPoints[tab].x,buttonPoints[tab].y);inputs.push({tab,roundtripMs:performance.now()-start});}
   await p.waitForFunction(()=>__shadowCause.sets.length===1&&__shadowCause.sets[0].end&&!document.querySelector('#appearance-fields').disabled);const uiWall=performance.now()-wall;
   await p.waitForTimeout(1800);
   const raw=await p.evaluate(()=>{const q=__shadowCause;q.snapshots.push(q.snapshot());q.record=false;clearInterval(q.timer);q.observer.disconnect();const{snapshot,timer,observer,...data}=q;return data;});
   assert.equal(raw.sets.length,1);assert.equal(raw.sets[0].result?.applied,true);assert.equal(raw.snapshots.at(-1).geometry.mouthWidth,.12);
   if(!shadow)assert(!raw.gl.some(x=>x.label==='first-mouth'&&x.pass?.kind==='shadow'));
   const assets=[];for(const response of responses){const bytes=await response.body();assets.push({url:new URL(response.url()).pathname,sha256:sha(bytes),bytes:bytes.length});}
   const gl=raw.gl.filter(x=>x.label==='first-mouth'),set=raw.sets[0],programs=new Map(raw.snapshots.at(-1).programs.map(p=>[p.glID,p]));
   const summary={inputs,inputEvents:raw.events.filter(x=>x.tab).map(x=>({...x,dispatchDelayMs:x.t-x.stamp})),setMs:set.end-set.start,uiRoundtripMs:uiWall,frames:stats(raw.frames.filter(x=>x.label==='first-mouth').map(x=>x.dt)),renders:stats(raw.renders.filter(x=>x.label==='first-mouth').map(x=>x.end-x.start)),shadowCalls:stats(raw.shadows.filter(x=>x.label==='first-mouth').map(x=>x.end-x.start)),baselineFrames:stats(raw.frames.filter(x=>x.label==='baseline').map(x=>x.dt)),longtasks:raw.longtasks.filter(x=>x.startTime>=set.start),links:gl.filter(x=>x.name==='linkProgram').map(x=>({...x,program:programs.get(x.glID)})),infoLogs:gl.filter(x=>x.name==='getProgramInfoLog').map(x=>({...x,program:programs.get(x.glID)})),uploads:gl.filter(x=>x.name.includes('Image3D')||x.name==='bufferData').map(x=>({...x})),compile:raw.compiles};
   await fs.writeFile(path.join(out,tag+'.json'),JSON.stringify(raw));R.cases.push({tag,environment,browser:browser.version(),assets,raw:tag+'.json',summary});console.log(JSON.stringify({tag,setMs:summary.setMs,maxFrame:summary.frames.max,maxRender:summary.renders.max,infoLogMs:summary.infoLogs.reduce((s,x)=>s+x.end-x.start,0)}));
  }finally{await browser.close();}
 }
 assert.equal(R.errors.length,0);R.status='measured';
 }catch(e){R.status='failed';R.error=String(e);console.error(e);process.exitCode=1;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(R,null,2));console.log(out,R.status);}
})();
