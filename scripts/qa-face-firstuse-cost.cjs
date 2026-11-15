// Fixed-build A/B measurement: preserve shader checks and measure the whole
// preparation interval, including old-scene frames and real browser input.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,build,destination]=process.argv.slice(2),out=path.resolve(destination||'');
assert(base&&/^[a-f0-9]{12}$/.test(build||'')&&destination);
const R={build,cases:[],errors:[],scope:'RTX4090 development machine, fresh Chrome process/profile per body, 1600x1000, paused actor. No video/profiler. Light JS/GL timing hooks; driver cache not cleared. Real pointer clicks are timed observations, not a universal latency bound. Whole request interval included; not ordinary-PC or continuous gameplay acceptance.'};
(async()=>{
 await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 try{
  for(const body of ['female','male','m2-male-jaw-v1']){
   const browser=await chromium.launch({channel:'chrome',headless:true});
   try{
    const p=await browser.newPage({viewport:{width:1600,height:1000}});
    p.on('pageerror',e=>R.errors.push({body,error:String(e)}));
    await p.goto(base+'?workbench=appearance&body='+body);
    await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
    assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
    await p.evaluate(()=>__debug.command({type:'pause',value:true}));await p.waitForTimeout(250);
    const buttons={};for(const name of ['actions','inspection','appearance']){const b=await p.locator('[data-workbench-tab='+name+']').boundingBox();buttons[name]={x:b.x+b.width/2,y:b.y+b.height/2};}
    const environment=await p.evaluate(()=>{const r=__debug.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{browser:navigator.userAgent,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,checks:r.debug.checkShaderErrors};});
    assert.equal(environment.checks,true);
    await p.evaluate(()=>{
     const r=__debug.renderer,g=r.getContext(),q=window.__firstUseCost={frames:[],renders:[],compiles:[],uniforms:[],gl:[],events:[],heartbeats:[],longtasks:[],commands:[],label:'settled',pending:false,inRender:false,record:true};
     const ids=new WeakMap();let next=0;const id=obj=>{if(!obj)return null;if(!ids.has(obj))ids.set(obj,++next);return ids.get(obj);};
     const registered=new WeakSet();
     const describe=p=>({id:p.id,name:p.name,type:p.type,cacheKey:p.cacheKey,glID:id(p.program)});
     function observeProgram(program){if(registered.has(program))return;registered.add(program);let seen=false;const f=program.getUniforms;program.getUniforms=function(...args){if(seen)return f.apply(this,args);seen=true;const row={...describe(this),start:performance.now(),label:q.label,inRender:q.inRender};q.uniforms.push(row);try{return f.apply(this,args);}finally{row.end=performance.now();row.diagnostics=this.diagnostics||null;}};}
     const compile=r.compileAsync;r.compileAsync=function(scene,...rest){const row={start:performance.now(),label:q.label};q.compiles.push(row);const promise=compile.call(this,scene,...rest);row.syncEnd=performance.now();return promise.then(v=>{row.end=performance.now();const programs=new Set();scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const program of r.properties.get(m).programs?.values()||[])programs.add(program);});row.programs=[...programs].map(describe);programs.forEach(observeProgram);return v;});};
     const render=r.render;r.render=function(...args){const row={start:performance.now(),label:q.label,pending:q.pending};q.inRender=true;try{return render.apply(this,args);}finally{q.inRender=false;row.end=performance.now();q.renders.push(row);}};
     for(const name of ['linkProgram','getProgramInfoLog','useProgram']){const f=g[name];g[name]=function(...args){const row={name,start:performance.now(),glID:id(args[0]),label:q.label,inRender:q.inRender};try{return f.apply(this,args);}finally{row.end=performance.now();q.gl.push(row);}};}
     let previous=null;function frame(t){if(!q.record)return;q.frames.push({t,dt:previous===null?null:t-previous,pending:q.pending,label:q.label});previous=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
     let beat=performance.now();q.timer=setInterval(()=>{const t=performance.now();q.heartbeats.push({t,dt:t-beat,pending:q.pending,label:q.label});beat=t;},10);
     document.addEventListener('pointerdown',e=>{if(q.record)q.events.push({t:performance.now(),stamp:e.timeStamp,trusted:e.isTrusted,tab:e.target.closest('[data-workbench-tab]')?.dataset.workbenchTab,pending:q.pending,label:q.label});},true);
     try{q.observer=new PerformanceObserver(list=>q.longtasks.push(...list.getEntries().map(e=>e.toJSON())));q.observer.observe({type:'longtask',buffered:false});}catch(e){q.observerError=String(e);}
    });
    const operations=body==='m2-male-jaw-v1'?[['first-mouth',{mouthWidth:.04}]]:[['first-mouth',{mouthWidth:.04}],['new-eye',{eyeSample:'aperture-width101-v1'}]];
    const input=[];
    for(const [label,patch] of operations){
     await p.evaluate(({label,patch})=>{const q=__firstUseCost;q.label=label;q.pending=true;const row={label,start:performance.now()};q.commands.push(row);__debug.command({type:'faceGeometry',...patch}).then(result=>{row.result=result;row.end=performance.now();q.pending=false;},e=>{row.error=String(e);row.end=performance.now();q.pending=false;});},{label,patch});
     for(const tab of ['actions','inspection','appearance']){await p.waitForTimeout(20);const start=performance.now();await p.mouse.click(buttons[tab].x,buttons[tab].y);input.push({label,tab,roundtripMs:performance.now()-start});}
     await p.waitForFunction(()=>!__firstUseCost.pending);await p.waitForTimeout(350);
    }
    const raw=await p.evaluate(()=>{const q=__firstUseCost;q.record=false;clearInterval(q.timer);q.observer?.disconnect();const{timer,observer,...data}=q;return{...data,finalGeometry:__debug.avatar().facialGeometry.getState(),memory:__debug.renderer.info.memory};});
    raw.commands.forEach(c=>assert.equal(c.result?.applied,true,JSON.stringify(c)));
    await fs.writeFile(path.join(out,body+'.json'),JSON.stringify(raw));
    const summary=raw.commands.map(c=>{
     const frames=raw.frames.filter(f=>f.label===c.label&&f.dt!==null),durations=frames.map(f=>f.dt).sort((a,b)=>a-b),renders=raw.renders.filter(x=>x.label===c.label),beats=raw.heartbeats.filter(x=>x.label===c.label),uniforms=raw.uniforms.filter(x=>x.label===c.label),gl=raw.gl.filter(x=>x.label===c.label),inputs=raw.events.filter(x=>x.label===c.label);
     const max=a=>Math.max(0,...a);return{label:c.label,requestMs:c.end-c.start,maxFrame:max(durations),p95:durations[Math.floor((durations.length-1)*.95)],maxRender:max(renders.map(x=>x.end-x.start)),maxHeartbeat:max(beats.map(x=>x.dt)),oldSceneFramesWhilePending:frames.filter(f=>f.pending).length,uniformFirstCalls:uniforms.map(x=>({id:x.id,glID:x.glID,name:x.name,ms:x.end-x.start,inRender:x.inRender})),infoLogMs:gl.filter(x=>x.name==='getProgramInfoLog').reduce((s,x)=>s+x.end-x.start,0),input:inputs.map(x=>({tab:x.tab,trusted:x.trusted,pending:x.pending,processingDelayMs:x.t-x.stamp})),inputRoundtrip:input.filter(x=>x.label===c.label)};
    });
    R.cases.push({body,environment,summary,raw:body+'.json'});await p.evaluate(()=>__debug.command({type:'faceGeometry',reset:true}));
   }finally{await browser.close();}
  }
  assert.equal(R.errors.length,0);R.status='measured';
 }catch(e){R.status='failed';R.error=String(e);throw e;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(R,null,2));console.log(JSON.stringify({out,status:R.status}));}
})().catch(e=>{console.error(e);process.exitCode=1});
