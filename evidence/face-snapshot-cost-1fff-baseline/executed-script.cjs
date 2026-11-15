// Snapshot-cache candidate timing plus separate before/after forced-GC heap observations. No video/profiler.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,build,destination]=process.argv.slice(2);
assert(base&&/^[a-f0-9]{12}$/.test(build||'')&&destination,'Use run-fixed-check <dist> <this script> BUILD NEW_OUTPUT');
const out=path.resolve(destination);
async function exists(p){try{await fs.access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
(async()=>{
 if(await exists(out))throw Error('Refuse to replace any evidence directory');
 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={build,cases:[],errors:[],scope:'Fresh Chrome process/profile per body; driver/OS shader cache not cleared. Development PC only. Light renderer/GL timing wrappers add overhead. No CPU profiler, recording or screenshots. Paused character isolates geometry preparation and first draw, not ordinary gameplay performance. Forced GC only outside timed windows; CDP heap/backing storage are JS-process observations, not VRAM or full process memory.'};
 try{
  for(const body of ['female','male','m2-male-jaw-v1']){
   const browser=await chromium.launch({channel:'chrome',headless:true});
   try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}});
    page.on('pageerror',e=>report.errors.push({body,error:String(e)}));
    await page.goto(base+'?workbench=appearance&body='+body);
    await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
    assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
    await page.evaluate(()=>__debug.command({type:'pause',value:true}));
    await page.waitForTimeout(300);
    const environment=await page.evaluate(()=>{const r=__debug.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{userAgent:navigator.userAgent,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,checkShaderErrors:r.debug.checkShaderErrors,parallelCompile:!!g.getExtension('KHR_parallel_shader_compile'),body:__debug.avatar().profile.bodyType};});
    assert.equal(environment.body,body);assert.equal(environment.checkShaderErrors,true);
    const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');const heapBefore=await cdp.send('Runtime.getHeapUsage');
    await page.evaluate(()=>{
     const r=__debug.renderer,gl=r.getContext(),q=window.__faceCost={frames:[],renders:[],compiles:[],gl:[],commands:[],longtasks:[],label:'settled',record:true,last:null};
     const snap=()=>({geometry:__debug.avatar().facialGeometry.getState(),memory:{...r.info.memory},programs:r.info.programs.map(p=>({id:p.id,name:p.name,usedTimes:p.usedTimes}))});
     q.snapshot=snap;q.initial=snap();
     try{q.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())q.longtasks.push(e.toJSON());});q.observer.observe({type:'longtask',buffered:false});}catch(e){q.observerError=String(e);}
     function frame(t){if(!q.record)return;q.frames.push({t,dt:q.last===null?null:t-q.last,label:q.label});q.last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
     const render=r.render;r.render=function(...args){const start=performance.now();try{return render.apply(this,args);}finally{q.renders.push({start,end:performance.now(),label:q.label});}};
     const compile=r.compileAsync;r.compileAsync=function(...args){const row={start:performance.now(),label:q.label,parts:[]};args[0].traverse(o=>{if(o.isMesh)row.parts.push({name:o.name,geometry:o.geometry.uuid,positionTargets:o.geometry.morphAttributes.position?.length||0,normalTargets:o.geometry.morphAttributes.normal?.length||0});});q.compiles.push(row);let p;try{p=compile.apply(this,args);row.syncEnd=performance.now();}catch(e){row.error=String(e);throw e;}return p.then(v=>{row.end=performance.now();return v;},e=>{row.end=performance.now();row.error=String(e);throw e;});};
     for(const name of ['getProgramInfoLog','linkProgram','texSubImage3D','texImage3D','bufferData']){
      const original=gl[name];gl[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{q.gl.push({name,start,end:performance.now(),label:q.label,bytes:args.findLast(a=>ArrayBuffer.isView(a))?.byteLength??null});}};
     }
    });
    const operations=body==='m2-male-jaw-v1'?
      [['first-mouth',{mouthWidth:.04}],['reset',{reset:true}],['repeat-mouth',{mouthWidth:.04}],['final-reset',{reset:true}]]:
      [['first-mouth',{mouthWidth:-.04}],['warm-mouth',{mouthWidth:.04}],['mouth-plus-eye',{eyeSample:'aperture-width101-v1'}],['brow-only',{mouthWidth:0,eyeSample:'none',browSample:'height1-spacing1-v1'}],['return-mouth',{mouthWidth:.04,browSample:'none'}],['final-reset',{reset:true}]];
    for(const [label,patch]of operations){
     const row=await page.evaluate(async({label,patch})=>{const q=__faceCost;q.label=label;const row={label,start:performance.now(),before:q.snapshot()};q.commands.push(row);row.result=await __debug.command({type:'faceGeometry',...patch});row.end=performance.now();return{result:row.result};},{label,patch});
     assert.equal(row.result.applied,true,JSON.stringify(row));
     await page.waitForTimeout(650);
     await page.evaluate(()=>{__faceCost.commands.at(-1).settled=__faceCost.snapshot();});
    }
    const measurements=await page.evaluate(()=>{const q=__faceCost;q.record=false;q.observer?.disconnect();const{snapshot,observer,...data}=q;return{...data,final:snapshot()};});
    assert.equal(measurements.final.geometry.facialGeometryCloneCount,0);
    await cdp.send('HeapProfiler.collectGarbage');const heapAfterReset=await cdp.send('Runtime.getHeapUsage');
    await fs.writeFile(path.join(out,body+'.json'),JSON.stringify(measurements));
    const commands=measurements.commands.map(c=>{
     const frames=measurements.frames.filter(f=>f.label===c.label&&f.dt!==null).map(f=>f.dt).sort((a,b)=>a-b);
     const renders=measurements.renders.filter(r=>r.label===c.label).map(r=>r.end-r.start);
     const gl=measurements.gl.filter(g=>g.label===c.label),logs=gl.filter(g=>g.name==='getProgramInfoLog');
     const percentile=p=>frames[Math.min(frames.length-1,Math.floor((frames.length-1)*p))]??null;
     return{label:c.label,commandMs:c.end-c.start,frames:frames.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),maxFrame:frames.at(-1),over33:frames.filter(x=>x>33).length,over50:frames.filter(x=>x>50).length,maxRender:Math.max(0,...renders),infoLogCalls:logs.length,infoLogMs:logs.reduce((s,g)=>s+g.end-g.start,0),links:gl.filter(g=>g.name==='linkProgram').length,morphUploadBytes:gl.filter(g=>g.name==='texSubImage3D').reduce((s,g)=>s+(g.bytes||0),0),cloneCount:c.settled.geometry.facialGeometryCloneCount,memory:c.settled.memory};
    });
    report.cases.push({body,environment,browser:browser.version(),heapBefore,heapAfterReset,measurements:body+'.json',commands});
   }finally{await browser.close();}
  }
  assert.equal(report.errors.length,0);report.status='measured';
 }catch(e){report.status='failed';report.error=String(e);throw e;}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({build,status:report.status,out}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
