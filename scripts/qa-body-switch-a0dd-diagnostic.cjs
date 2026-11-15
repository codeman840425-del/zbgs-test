// One fixed-build body switch; timing hooks only, no runtime/source injection.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const BUILD=process.env.QA_SWITCH_BUILD||'a0dd7fb7bf4a';
assert(/^[a-f0-9]{12}$/.test(BUILD),'Explicit 12-hex candidate required');
const plan={build:BUILD,operation:{type:'bodySelect',bodyType:'male'},initialBody:'female',viewport:{width:1600,height:1000},
  output:'evidence/body-switch-a0dd-diagnostic-v1/run-v1',recording:false,profiler:false,
  measured:['debug command','renderer compile/compileAsync','old motion/avatar dispose','render/first male draw','GL link/delete/getProgramInfoLog with native program identity','rAF/heartbeat/longtask'],
  unmeasured:['loadFoundationAvatar internals','parse/retarget','createMotion/calibration','new avatar preflight substeps'],
  limitations:'Fresh Chrome process and context, not cleared OS/driver shader cache. Diagnostic hooks add CPU overhead; GL call time is CPU-visible submission/wait, not isolated GPU work. No geometry edits, offscreen draw, forced GC, or shader-check changes.'};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
const base=process.argv[2],out=path.resolve(process.argv[3]||plan.output);
assert(base&&/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base),'Use run-fixed-check.cjs FIXED_A0DD_DIST scripts/qa-body-switch-a0dd-diagnostic.cjs [NEW_OUTPUT]');
const {chromium}=require('../prototype/node_modules/playwright');
(async()=>{
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out,{recursive:false}); // Existing evidence must never be overwritten.
  await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  const report={...plan,status:'started',errors:[],startedAt:new Date().toISOString()};
  report.executedScriptSha256=crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  let browser,page,watchdog,rawSaved=false;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    watchdog=setTimeout(()=>{report.errors.push({kind:'timeout',message:'90-second diagnostic limit'});void browser.close();},90000);
    const context=await browser.newContext({viewport:plan.viewport});page=await context.newPage();
    page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(45000);
    page.on('pageerror',e=>report.errors.push({kind:'pageerror',message:String(e)}));
    page.on('console',m=>{if(m.type()==='error')report.errors.push({kind:'console',message:m.text()});});
    await context.addInitScript(()=>{try{localStorage.clear();sessionStorage.clear();}catch{}});
    await page.goto(base+'?workbench=appearance&body=female');
    await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields')?.disabled);
    assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),BUILD);
    await page.waitForTimeout(350);
    report.environment=await page.evaluate(()=>{
      const d=__debug,r=d.renderer,g=r.getContext(),extension=g.getExtension('WEBGL_debug_renderer_info');
      return{buildInfo:d.buildInfo,userAgent:navigator.userAgent,renderer:extension?g.getParameter(extension.UNMASKED_RENDERER_WEBGL):null,
        vendor:extension?g.getParameter(extension.UNMASKED_VENDOR_WEBGL):null,parallelCompile:!!g.getExtension('KHR_parallel_shader_compile'),
        shaderChecks:r.debug.checkShaderErrors,localStorageKeys:Object.keys(localStorage),sessionStorageKeys:Object.keys(sessionStorage),
        body:d.avatar().profile.bodyType,geometry:d.avatar().facialGeometry.getState(),snapshot:d.snapshot()};
    });
    report.environment.browser=browser.version();assert.equal(report.environment.body,'female');
    assert.equal(report.environment.shaderChecks,true);assert.equal(report.environment.geometry.mouthWidth,0);
    assert.equal(report.environment.geometry.browSample,'none');assert.equal(report.environment.geometry.noseSample,'none');assert.equal(report.environment.geometry.eyeSample,'none');
    assert.equal(report.environment.localStorageKeys.length,0,'Nonempty storage would confound draft restore');
    await page.evaluate(()=>{
      const d=__debug,r=d.renderer,gl=r.getContext(),oldAvatar=d.avatar(),oldMotion=d.motion();
      const q=window.__bodySwitchCost={record:true,phase:'settled',inRender:false,inDispose:null,
        events:[],renders:[],compiles:[],disposes:[],gl:[],frames:[],heartbeats:[],longtasks:[],programs:[],cleanups:[]};
      const nativeIDs=new WeakMap();let nextID=0;
      const nativeID=p=>{if(!p)return null;if(!nativeIDs.has(p))nativeIDs.set(p,++nextID);return nativeIDs.get(p);};
      const known=new Map();
      function register(){
        for(const p of r.info.programs){
          let row=known.get(p);
          if(!row){row={wrapperId:p.id,cacheKey:p.cacheKey,name:p.name,type:p.type,nativeID:nativeID(p.program),firstObserved:performance.now()};known.set(p,row);q.programs.push(row);}
          row.lastObserved=performance.now();row.lastUsedTimes=p.usedTimes;
        }
      }
      const programs=()=>{register();return r.info.programs.map(p=>({wrapperId:p.id,nativeID:nativeID(p.program),usedTimes:p.usedTimes,cacheKey:p.cacheKey}));};
      const context=()=>({phase:q.phase,inRender:q.inRender,inDispose:q.inDispose,body:d.avatar()?.profile.bodyType});
      function wrap(object,name,make){const original=object[name],wrapper=make(original);object[name]=wrapper;q.cleanups.push(()=>{if(object[name]===wrapper)object[name]=original;});}
      q.initial={t:performance.now(),programs:programs(),memory:{...r.info.memory}};
      for(const name of ['linkProgram','deleteProgram','getProgramInfoLog'])wrap(gl,name,original=>function(...args){
        const row={name,nativeID:nativeID(args[0]),start:performance.now(),...context()};
        try{return original.apply(this,args);}catch(e){row.error=String(e);throw e;}finally{row.end=performance.now();q.gl.push(row);}
      });
      wrap(r,'compile',original=>function(...args){
        const row={kind:'compile-sync',start:performance.now(),...context()};q.compiles.push(row);
        try{return original.apply(this,args);}catch(e){row.error=String(e);throw e;}finally{row.end=performance.now();row.programs=programs();}
      });
      wrap(r,'compileAsync',original=>function(...args){
        const row={kind:'compileAsync',start:performance.now(),...context()};q.compiles.push(row);let promise;
        try{promise=original.apply(this,args);row.syncEnd=performance.now();}catch(e){row.end=performance.now();row.error=String(e);throw e;}
        return promise.then(value=>{row.end=performance.now();row.programs=programs();return value;},e=>{row.end=performance.now();row.error=String(e);throw e;});
      });
      for(const [kind,object]of [['oldMotion',oldMotion],['oldAvatar',oldAvatar]])wrap(object,'dispose',original=>function(...args){
        const row={kind,start:performance.now(),programsBefore:programs(),...context()};q.disposes.push(row);const previous=q.inDispose;q.inDispose=kind;
        try{return original.apply(this,args);}catch(e){row.error=String(e);throw e;}finally{row.end=performance.now();q.inDispose=previous;row.programsAfter=programs();}
      });
      wrap(r,'render',original=>function(...args){
        const row={start:performance.now(),body:d.avatar()?.profile.bodyType,phase:q.phase};q.inRender=true;
        try{return original.apply(this,args);}catch(e){row.error=String(e);throw e;}finally{row.end=performance.now();q.inRender=false;q.renders.push(row);register();}
      });
      let previous=null;function frame(t){if(!q.record)return;q.frames.push({t,dt:previous===null?null:t-previous,...context()});previous=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
      let beat=performance.now();const timer=setInterval(()=>{const t=performance.now();q.heartbeats.push({t,dt:t-beat,...context()});beat=t;},10);q.cleanups.push(()=>clearInterval(timer));
      try{const observer=new PerformanceObserver(list=>q.longtasks.push(...list.getEntries().map(e=>e.toJSON())));observer.observe({type:'longtask',buffered:false});q.cleanups.push(()=>observer.disconnect());}catch(e){q.events.push({kind:'observer-unavailable',error:String(e)});}
      q.finish=()=>{
        q.record=false;q.final={t:performance.now(),body:d.avatar().profile.bodyType,geometry:d.avatar().facialGeometry.getState(),memory:{...r.info.memory},programs:programs(),snapshot:d.snapshot(),localStorageKeys:Object.keys(localStorage),shaderChecks:r.debug.checkShaderErrors};
        for(const cleanup of q.cleanups.reverse())cleanup();
        const {finish,cleanups,...data}=q;return data;
      };
    });
    await page.waitForTimeout(100); // Establish an old-scene rAF interval before command.
    const command=await page.evaluate(async()=>{
      const q=__bodySwitchCost;q.phase='switch-pending';const row=q.command={start:performance.now(),input:{type:'bodySelect',bodyType:'male'},bodyBefore:__debug.avatar().profile.bodyType};
      try{row.result=await __debug.command(row.input);return row;}catch(e){row.error=String(e);throw e;}finally{row.end=performance.now();row.bodyAfter=__debug.avatar().profile.bodyType;q.phase='switch-returned';}
    });
    assert.equal(command.result?.applied,true);assert.equal(command.bodyAfter,'male');
    await page.waitForTimeout(1000);
    const raw=await page.evaluate(()=>__bodySwitchCost.finish());await fs.writeFile(path.join(out,'raw.json'),JSON.stringify(raw));rawSaved=true;
    const start=raw.command.start,firstDraw=raw.renders.find(x=>x.start>=start&&x.body==='male');
    const during=raw.gl.filter(x=>x.start>=start),max=values=>values.length?Math.max(...values):null;
    const deleted=during.filter(x=>x.name==='deleteProgram');
    const recreated=[];
    for(const deletion of deleted){
      const before=raw.programs.find(p=>p.nativeID===deletion.nativeID);
      if(!before)continue;
      for(const after of raw.programs.filter(p=>p.nativeID!==before.nativeID&&p.cacheKey===before.cacheKey)){
        const link=during.find(x=>x.name==='linkProgram'&&x.nativeID===after.nativeID&&x.start>=deletion.end);
        if(link)recreated.push({oldNativeID:before.nativeID,newNativeID:after.nativeID,cacheKey:before.cacheKey,deleteAt:deletion.start,deleteMs:deletion.end-deletion.start,linkedAt:link.start,linkMs:link.end-link.start,linkInRender:link.inRender});
      }
    }
    report.summary={commandMs:raw.command.end-start,firstMaleDraw:firstDraw?{...firstDraw,ms:firstDraw.end-firstDraw.start}:null,
      maxFrameMs:max(raw.frames.filter(x=>x.t>=start&&x.dt!=null).map(x=>x.dt)),maxHeartbeatMs:max(raw.heartbeats.filter(x=>x.t>=start).map(x=>x.dt)),
      oldSceneRendersWhilePending:raw.renders.filter(x=>x.start>=start&&x.phase==='switch-pending'&&x.body==='female').length,
      compiles:raw.compiles,disposes:raw.disposes.map(x=>({kind:x.kind,start:x.start,ms:x.end-x.start,error:x.error})),
      glCalls:Object.fromEntries(['linkProgram','deleteProgram','getProgramInfoLog'].map(name=>{const rows=during.filter(x=>x.name===name);return[name,{count:rows.length,totalMs:rows.reduce((sum,x)=>sum+x.end-x.start,0),maxMs:max(rows.map(x=>x.end-x.start))}];})),
      sameCacheKeyDeletedThenLinked:recreated,
      preflightInternalTimings:null,internalTimingReason:'createMotion, parse/retarget and loadFoundationAvatar are lexical imports; no injection or internal stage durations inferred from broad command time.'};
    assert(firstDraw,'No actual male render observed');assert.equal(raw.final.shaderChecks,true);assert.equal(raw.final.localStorageKeys.length,0);
    report.status=report.errors.length?'measured-with-errors':'measured';
  }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
  finally{
    clearTimeout(watchdog);
    if(!rawSaved&&page)try{const raw=await page.evaluate(()=>window.__bodySwitchCost?.finish?.()||null);if(raw)await fs.writeFile(path.join(out,'raw-partial.json'),JSON.stringify(raw));}catch(e){report.partialCaptureError=String(e);}
    if(browser)await browser.close();report.closedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status}));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
