// Bounded real-WebGL loss/recovery check. No timing/performance conclusion.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,build,destination]=process.argv.slice(2),out=path.resolve(destination);
const report={build,scope:'Actual WEBGL_lose_context extension; UI mouth edit interrupted during compile, restore, UI retry and reset. One original actor per sex; not GPU-driver crash or visual acceptance.',rows:[],errors:[],console:[]};
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{
  for(const body of ['female','male']){
   const context=await browser.newContext({viewport:{width:1600,height:1000}}),p=await context.newPage();
   p.on('pageerror',e=>report.errors.push({body,error:String(e)}));p.on('console',m=>{if(['warning','error'].includes(m.type()))report.console.push({body,type:m.type(),text:m.text()});});
   await p.goto(base+'?workbench=appearance&body='+body);await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled);
   assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
   const details=p.locator('#appearance-geometry');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
   await p.evaluate(()=>{
    const r=__debug.renderer,actor=__debug.avatar(),extension=r.getContext().getExtension('WEBGL_lose_context');if(!extension)throw Error('WEBGL_lose_context unavailable');
    const q=window.__contextCheck={extension,lost:0,restored:0,armed:true,materials:[],hooks:[],renders:0};
    actor.vrm.scene.traverse(m=>{if(m.isMesh)q.hooks.push({m,hook:m.onBeforeShadow});});
    r.domElement.addEventListener('webglcontextlost',()=>q.lost++);r.domElement.addEventListener('webglcontextrestored',()=>q.restored++);
    const compile=r.compileAsync;r.compileAsync=function(scene,...args){
     if(q.armed)scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){const row={m,count:0};m.addEventListener('dispose',()=>row.count++);q.materials.push(row);}});
     const job=compile.call(this,scene,...args);if(q.armed){q.armed=false;extension.loseContext();}return job;
    };
    const render=r.render;r.render=function(...args){const value=render.apply(this,args);if(!r.getContext().isContextLost())q.renders++;return value;};
    q.state=()=>({lost:q.lost,restored:q.restored,contextLost:r.getContext().isContextLost(),renders:q.renders,geometry:actor.facialGeometry.getState(),disabled:document.querySelector('#appearance-fields').disabled,hooksRestored:q.hooks.every(x=>x.m.onBeforeShadow===x.hook),materials:q.materials.map(x=>({type:x.m.type,disposed:x.count})),snapshot:__debug.snapshot()});
   });
   await p.locator('#mouth-width-sample').selectOption('0.12');
   await p.waitForFunction(()=>__contextCheck.lost===1&&!__debug.avatar().facialGeometry.getState().loading&&!document.querySelector('#appearance-fields').disabled,{},{timeout:20000});
   const failed=await p.evaluate(()=>__contextCheck.state());report.rows.push({body,phase:'interrupted',state:failed});
   assert(failed.contextLost);assert.equal(failed.geometry.mouthWidth,0);assert(failed.geometry.error);assert(failed.hooksRestored);assert(failed.materials.length>0);assert(failed.materials.every(m=>m.disposed===1));
   await p.evaluate(()=>__contextCheck.extension.restoreContext());
   await p.waitForFunction(()=>__contextCheck.restored===1&&!__debug.renderer.getContext().isContextLost());
   // The UI must allow retry of the same requested value after rollback.
   await p.locator('#mouth-width-sample').selectOption('0.12');
   await p.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===.12&&!document.querySelector('#appearance-fields').disabled,{},{timeout:20000});
   const recovered=await p.evaluate(()=>__contextCheck.state());assert(!recovered.geometry.error);assert(recovered.hooksRestored);assert(recovered.renders>failed.renders);
   await p.screenshot({path:path.join(out,body+'-recovered.png')});report.rows.push({body,phase:'retry',state:recovered});
   await p.locator('#mouth-width-sample').selectOption('0');
   await p.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===0&&!document.querySelector('#appearance-fields').disabled);
   const reset=await p.evaluate(()=>__contextCheck.state());assert.equal(reset.geometry.facialGeometryCloneCount,0);report.rows.push({body,phase:'reset',state:reset});
   await context.close();
  }
  assert.equal(report.errors.length,0);report.status='passed';
 }catch(e){report.status='failed';report.failure=String(e);report.stack=e.stack;process.exitCode=1;console.error(e);}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status,rows:report.rows.length}));}
})();
