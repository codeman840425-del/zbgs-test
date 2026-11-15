// Targeted fixed-build diagnostics, not a performance acceptance benchmark.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const build='1188b09aca6f',base=process.argv[2];
if(!base)throw Error('Use run-fixed-check.cjs with immutable 1188 dist');
const out=path.resolve('evidence/workbench-cost-profile-1188-v1');
(async()=>{
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={build,scope:'Two separate fresh Chrome processes and temporary profiles; no recording/screenshots. OS/driver shader cache not reset or assumed cold. CPU sampling and JS wrappers add overhead. GL call durations are CPU submission/blocking, not isolated GPU execution.',cases:[],errors:[]};
 try{
 for(const scenario of ['geometry','body-switch']){
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(String(e)));
   const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
   await page.goto(base+'?workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields')?.disabled);
   assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
   await page.waitForTimeout(300);
   const environment=await page.evaluate(()=>{
    const gl=__debug.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');
    return{userAgent:navigator.userAgent,renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null,vendor:e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):null,parallelCompile:!!gl.getExtension('KHR_parallel_shader_compile'),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),entryBody:__debug.avatar().profile.bodyType,geometryState:__debug.avatar().facialGeometry.getState()};
   });
   await page.evaluate(()=>{
    const q=window.__cost={events:[],frames:[],longtasks:[],longframes:[],renders:[],compiles:[],gl:[],operation:null,record:true,last:null};
    const body=()=>__debug.avatar()?.profile.bodyType;
    for(const [type,key]of [['longtask','longtasks'],['long-animation-frame','longframes']])try{
     const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())q[key].push(e.toJSON());});observer.observe({type,buffered:false});
    }catch(e){q.events.push({kind:'unsupported-observer',type,message:e.message});}
    function tick(t){if(!q.record)return;q.frames.push({t,dt:q.last==null?null:t-q.last,body:body(),operation:q.operation});q.last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);
    const renderer=__debug.renderer,oldRender=renderer.render;
    renderer.render=function(...args){const start=performance.now();try{return oldRender.apply(this,args);}finally{q.renders.push({start,end:performance.now(),body:body(),operation:q.operation});}};
    const oldCompile=renderer.compileAsync;
    renderer.compileAsync=function(...args){const row={start:performance.now(),body:body()};q.compiles.push(row);let p;try{p=oldCompile.apply(this,args);row.syncEnd=performance.now();}catch(e){row.error=e.message;throw e;}return p.then(v=>{row.end=performance.now();return v;},e=>{row.end=performance.now();row.error=e.message;throw e;});};
    const gl=renderer.getContext();
    for(const name of ['texImage2D','texImage3D','texSubImage2D','texSubImage3D','bufferData','bufferSubData','compileShader','linkProgram','getProgramParameter']){
     const original=gl[name];if(!original)continue;
     gl[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const end=performance.now();q.gl.push({name,start,end,operation:q.operation,bytes:args.findLast(a=>ArrayBuffer.isView(a))?.byteLength??null});}};
    }
   });
   const operations=scenario==='geometry'?[['cold-mouth',{type:'faceGeometry',mouthWidth:-.04}],['warm-mouth',{type:'faceGeometry',mouthWidth:.04}]]:[['female-to-male',{type:'bodySelect',bodyType:'male'}]];
   const profiles=[];
   for(const [label,command]of operations){
    await cdp.send('Profiler.start');
    const result=await page.evaluate(async({label,command})=>{
     const q=__cost;q.operation=label;const row={kind:'command',label,start:performance.now(),bodyBefore:__debug.avatar().profile.bodyType};q.events.push(row);
     row.result=await __debug.command(command);row.end=performance.now();row.bodyAfter=__debug.avatar().profile.bodyType;return row;
    },{label,command});
    assert.equal(result.result.applied,true);
    await page.waitForTimeout(900);
    const {profile}=await cdp.send('Profiler.stop');const file=`${scenario}-${label}.cpuprofile`;await fs.writeFile(path.join(out,file),JSON.stringify(profile));profiles.push(file);
   }
   const measurements=await page.evaluate(()=>{__cost.record=false;return{...__cost,final:{body:__debug.avatar().profile.bodyType,geometry:__debug.avatar().facialGeometry.getState(),renderMemory:{...__debug.renderer.info.memory}}};});
   await fs.writeFile(path.join(out,scenario+'.json'),JSON.stringify(measurements));
   report.cases.push({scenario,browser:browser.version(),environment,profiles,measurements:scenario+'.json'});
  }finally{await browser.close();}
 }
 report.passed=report.errors.length===0;
 }catch(e){report.error=String(e);throw e;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('Browsers closed; report',out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
