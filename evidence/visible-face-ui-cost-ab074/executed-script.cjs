// Current large endpoints, actual UI, unpaused scene. No recording or screenshots.
// Timing hooks are diagnostic overhead; CPU/driver cache is not cleared.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,build,destination]=process.argv.slice(2);
assert(base&&/^[a-f0-9]{12}$/.test(build||'')&&destination);
const out=path.resolve(destination);
const report={build,cases:[],errors:[],scope:'Development PC, fresh Chrome/profile per original female/male, 1600x1000, unpaused default room scene and appearance camera. Actual select controls. No video, screenshot, profiler, CPU throttling or forced GC. Renderer/compile/set timing hooks add overhead. Short edit windows and 10-second idle samples are not sustained gameplay or ordinary-PC acceptance.'};
const operations=[
 ['first-mouth','#mouth-width-sample','-0.12'],
 ['reset-mouth','#mouth-width-sample','0'],
 ['repeat-mouth','#mouth-width-sample','-0.12'],
 ['opposite-mouth','#mouth-width-sample','0.12'],
 ['add-brow','#brow-sample','height3-spacing3-v2'],
 ['add-nose','#nose-sample','tip-forward2-v2'],
 ['add-eye','#eye-sample','aperture-width105-v2'],
 ['restore-eye','#eye-sample','none'],
 ['restore-nose','#nose-sample','none'],
 ['restore-brow','#brow-sample','none'],
 ['restore-mouth','#mouth-width-sample','0']
];
const stats=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);const p=x=>a[Math.floor((a.length-1)*x)]??null;return{count:a.length,p50:p(.5),p95:p(.95),p99:p(.99),max:a.at(-1)??null,over33:a.filter(x=>x>33.33).length,over50:a.filter(x=>x>50).length};};
(async()=>{
 await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 try{for(const body of ['female','male']){
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
   const p=await browser.newPage({viewport:{width:1600,height:1000}});
   p.on('pageerror',e=>report.errors.push({body,error:String(e)}));
   await p.goto(base+'?workbench=appearance&body='+body);
   await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
   assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
   await p.locator('#appearance-geometry > summary').click();
   await p.waitForTimeout(1500);
   const environment=await p.evaluate(()=>{const r=__debug.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{browser:navigator.userAgent,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,shaderChecks:r.debug.checkShaderErrors,devicePixelRatio,body:__debug.avatar().profile.bodyType};});
   assert.equal(environment.body,body);assert.equal(environment.shaderChecks,true);
   await p.evaluate(()=>{
    const q=window.__visibleCost={label:'baseline',record:true,frames:[],renders:[],sets:[],compiles:[],longtasks:[],events:[],snapshots:[]};
    let last=null;function frame(t){if(!q.record)return;q.frames.push({t,dt:last===null?null:t-last,label:q.label});last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
    const r=__debug.renderer,render=r.render,compile=r.compileAsync,api=__debug.avatar().facialGeometry,set=api.set;
    r.render=function(...args){const start=performance.now();try{return render.apply(this,args);}finally{q.renders.push({start,end:performance.now(),label:q.label});}};
    r.compileAsync=function(...args){const row={start:performance.now(),label:q.label};q.compiles.push(row);const job=compile.apply(this,args);row.syncEnd=performance.now();return job.then(v=>{row.end=performance.now();return v;},e=>{row.end=performance.now();row.error=String(e);throw e;});};
    api.set=function(...args){const row={start:performance.now(),label:q.label,args};q.sets.push(row);const job=set.apply(this,args);row.syncEnd=performance.now();return job.then(v=>{row.end=performance.now();row.result=v;return v;},e=>{row.end=performance.now();row.error=String(e);throw e;});};
    document.addEventListener('change',e=>{if(q.record)q.events.push({t:performance.now(),label:q.label,id:e.target.id,value:e.target.value});},true);
    q.observer=new PerformanceObserver(list=>{q.longtasks.push(...list.getEntries().map(e=>e.toJSON()));});q.observer.observe({type:'longtask',buffered:false});
   });
   await p.waitForTimeout(10000);
   for(const [label,selector,value]of operations){
    await p.evaluate(label=>{__visibleCost.label=label;},label);
    await p.selectOption(selector,value);
    await p.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
    assert.equal(await p.locator('#appearance-status').getAttribute('data-error'),'false');
    await p.waitForTimeout(2000);
    await p.evaluate(()=>{__visibleCost.snapshots.push({label:__visibleCost.label,geometry:__debug.avatar().facialGeometry.getState(),memory:{...__debug.renderer.info.memory}});});
   }
   await p.evaluate(()=>{__visibleCost.label='restored-idle';});await p.waitForTimeout(10000);
   const raw=await p.evaluate(()=>{const q=__visibleCost;q.record=false;q.observer.disconnect();const{observer,...data}=q;return data;});
   assert.equal(raw.snapshots.at(-1).geometry.facialGeometryCloneCount,0);
   for(const [label]of operations){const sets=raw.sets.filter(x=>x.label===label);assert.equal(sets.length,1,label);assert.equal(sets[0].result?.applied,true,label);}
   await fs.writeFile(path.join(out,body+'.json'),JSON.stringify(raw));
   report.cases.push({body,environment,browser:browser.version(),raw:body+'.json',summary:['baseline',...operations.map(x=>x[0]),'restored-idle'].map(label=>({label,frameMs:stats(raw.frames.filter(x=>x.label===label).map(x=>x.dt)),renderMs:stats(raw.renders.filter(x=>x.label===label).map(x=>x.end-x.start)),set:raw.sets.filter(x=>x.label===label).map(x=>({totalMs:x.end-x.start,synchronousMs:x.syncEnd-x.start})),compile:raw.compiles.filter(x=>x.label===label).map(x=>({totalMs:x.end-x.start,synchronousMs:x.syncEnd-x.start}))})),snapshots:raw.snapshots});
   console.log(body,'measured');
  }finally{await browser.close();}
 }
 assert.equal(report.errors.length,0);report.status='measured';
 }catch(e){report.status='failed';report.failure=String(e);process.exitCode=1;console.error(e);}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out,report.status);}
})();
