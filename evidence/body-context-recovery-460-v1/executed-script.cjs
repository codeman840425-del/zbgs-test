const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,build,destination]=process.argv.slice(2),out=path.resolve(destination);
const report={build,scope:'Real WEBGL_lose_context during actual detached body compile; bounded current UI recovery, no performance conclusion.',rows:[],errors:[]};
const expectPreserved=process.argv.includes('--expect-preserved');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:false});let p;
 try{
  p=await browser.newPage({viewport:{width:1600,height:1000},recordVideo:expectPreserved?{dir:path.join(out,'video'),size:{width:1600,height:1000}}:undefined});p.on('pageerror',e=>report.errors.push(String(e)));
  await p.goto(base+'?workbench=appearance&body=female');await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
  assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
  await p.evaluate(()=>{
   const r=__debug.renderer,ext=r.getContext().getExtension('WEBGL_lose_context');if(!ext)throw Error('Extension unavailable');
   const q=window.__bodyLoss={ext,lost:0,restored:0,armed:true,oldActor:__debug.avatar(),compileStarted:0,compileSettled:0};
   r.domElement.addEventListener('webglcontextlost',()=>q.lost++);r.domElement.addEventListener('webglcontextrestored',()=>q.restored++);
   const compile=r.compileAsync;r.compileAsync=function(...args){q.compileStarted++;const job=compile.apply(this,args);job.then(()=>q.compileSettled++,()=>q.compileSettled++);if(q.armed){q.armed=false;ext.loseContext();}return job;};
   q.state=()=>({lost:q.lost,restored:q.restored,contextLost:r.getContext().isContextLost(),oldRetained:__debug.avatar()===q.oldActor,body:__debug.avatar().profile.bodyType,compileStarted:q.compileStarted,compileSettled:q.compileSettled,selection:{...__debug.snapshot().bodySelection},disabled:document.querySelector('#appearance-identity-fields').disabled,status:document.querySelector('#appearance-status').textContent});
  });
  await p.locator('[data-appearance-group=male]').click();await p.waitForFunction(()=>__bodyLoss.lost===1);
  // Record whether it settles without restoration; only a bounded observation.
  await p.waitForTimeout(750);report.rows.push({phase:'lost',state:await p.evaluate(()=>__bodyLoss.state())});
  if(expectPreserved){const s=report.rows.at(-1).state;assert(s.oldRetained);assert(!s.disabled&&!s.selection.loading);assert.match(s.selection.error,/图形上下文/);}
  await p.evaluate(()=>__bodyLoss.ext.restoreContext());await p.waitForFunction(()=>__bodyLoss.restored===1);
  try{await p.waitForFunction(()=>!document.querySelector('#appearance-identity-fields').disabled,null,{timeout:10000});}
  finally{report.rows.push({phase:'restored',state:await p.evaluate(()=>__bodyLoss.state())});await p.screenshot({path:path.join(out,'restored.png')});}
  if(expectPreserved){
   assert(report.rows.at(-1).state.oldRetained);
   await p.locator('[data-appearance-group=male]').click();
   await p.waitForFunction(()=>__debug.avatar().profile.bodyType==='male'&&!document.querySelector('#appearance-identity-fields').disabled);
   report.rows.push({phase:'retry',state:await p.evaluate(()=>__bodyLoss.state())});
   assert.equal(report.rows.at(-1).state.selection.error,null);
   await p.waitForTimeout(1200);await p.screenshot({path:path.join(out,'retry-male.png')});
   await p.locator('[data-appearance-group=female]').click();
   await p.waitForFunction(()=>__debug.avatar().profile.bodyType==='female'&&!document.querySelector('#appearance-identity-fields').disabled);
   report.rows.push({phase:'return-female',state:await p.evaluate(()=>__bodyLoss.state())});
   await p.waitForTimeout(1200);
  }
  assert.equal(report.errors.length,0);report.status='settled';
 }catch(e){report.status='failed';report.failure=String(e);process.exitCode=1;console.error(e);}
 finally{if(p&&!p.isClosed())try{report.final=await p.evaluate(()=>__bodyLoss?.state());}catch{}const video=p?.video();await browser.close();if(video)await video.saveAs(path.join(out,'body-recovery-normal.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status,final:report.final}));}
})();
