// One explicit WebGL fault-injection case. No product source changes or video.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const arg=n=>process.argv.find(s=>s.startsWith('--'+n+'='))?.slice(n.length+3);
const plan={scope:'Paused original female; real compile finishes behind a QA promise gate; real WEBGL_lose_context loss/restore; rejected request preserves original geometry; same request retries with fresh compilation',limits:['Intentional fault injection, not a naturally observed failure','No performance, motion, shadow, or target-device claim','One actor and one mouth layout; CPU cases cover wider cancellation interleavings']};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0)}
const BUILD=arg('build'),BASE=arg('base')||(process.argv[2]?.startsWith('http')?process.argv[2]:null),OUT=path.resolve(arg('out')||'');
assert(/^[a-f0-9]{12}$/.test(BUILD||''),'--build required');assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(BASE||''),'local --base required');assert(arg('out'),'fresh --out required');
const R={build:BUILD,base:BASE,plan,checks:[],errors:[],console:[]};
const save=()=>fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));
(async()=>{
 await fs.mkdir(OUT);await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const c=await browser.newContext({viewport:{width:1600,height:1000}}),p=await c.newPage();
  p.on('pageerror',e=>R.errors.push(String(e)));p.on('console',m=>{if(['error','warning','log'].includes(m.type()))R.console.push({type:m.type(),text:m.text()})});
  await p.goto(BASE+'?workbench=appearance&body=female');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  R.identity=await verifyCandidate(p,{build:BUILD,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  R.before=await p.evaluate(()=>{
   const d=__debug,a=d.avatar(),r=d.renderer;d.setPaused(true);
   if(a.facialGeometry.getState().mouthWidth!==0)throw Error('Fresh actor must start unmodified');
   const ext=r.getContext().getExtension('WEBGL_lose_context');if(!ext)throw Error('WEBGL_lose_context unavailable');
   const originals=[];a.vrm.scene.traverse(m=>{if(m.isMesh)originals.push([m,m.geometry])});
   const f=window.__firstuseFault={actor:a,renderer:r,ext,originals,compile:r.compileAsync,calls:0,held:false,settled:false,events:[],sim:d.snapshot().simulationTime};
   for(const name of ['webglcontextlost','webglcontextrestored'])r.domElement.addEventListener(name,e=>f.events.push({type:name,trusted:e.isTrusted,wall:performance.now(),lost:r.getContext().isContextLost()}));
   f.gate=new Promise(resolve=>f.release=resolve);
   r.compileAsync=async function(...args){f.calls++;const result=await f.compile.apply(this,args);if(f.calls===1){f.held=true;await f.gate}return result};
   f.request=Promise.resolve(d.command({type:'faceGeometry',mouthWidth:.04})).then(value=>{f.result=value;f.settled=true},error=>{f.error=String(error);f.settled=true});
   return{geometry:a.facialGeometry.getState(),sim:f.sim,meshCount:originals.length};
  });
  await p.waitForFunction(()=>__firstuseFault.held,null,{timeout:30000});
  await p.evaluate(()=>__firstuseFault.ext.loseContext());
  await p.waitForFunction(()=>__firstuseFault.events.some(e=>e.type==='webglcontextlost')&&__firstuseFault.settled,null,{timeout:10000});
  R.rejected=await p.evaluate(()=>{const f=__firstuseFault;return{result:f.result,error:f.error,calls:f.calls,originalsUnchanged:f.originals.every(([m,g])=>m.geometry===g),state:f.actor.facialGeometry.getState(),sim:__debug.snapshot().simulationTime,events:f.events}});
  assert.equal(R.rejected.result?.applied,false);assert(R.rejected.originalsUnchanged);assert.equal(R.rejected.state.mouthWidth,0);assert.equal(R.rejected.sim,R.before.sim);
  R.checks.push({name:'loss rejects in-flight request and retains original geometry',passed:true});await save();
  await p.evaluate(()=>__firstuseFault.ext.restoreContext());
  await p.waitForFunction(()=>__firstuseFault.events.some(e=>e.type==='webglcontextrestored')&&!__debug.renderer.getContext().isContextLost(),null,{timeout:15000});
  R.retry=await p.evaluate(async()=>{
   const f=__firstuseFault;f.release();await new Promise(resolve=>setTimeout(resolve,30));
   const before=f.calls,result=await __debug.command({type:'faceGeometry',mouthWidth:.04});
   return{result,newCompiles:f.calls-before,totalCompiles:f.calls,state:f.actor.facialGeometry.getState(),changedGeometry:f.originals.some(([m,g])=>m.geometry!==g),sim:__debug.snapshot().simulationTime,events:f.events};
  });
  assert.equal(R.retry.result?.applied,true);assert(R.retry.newCompiles>0);assert(R.retry.changedGeometry);assert.equal(R.retry.state.mouthWidth,.04);assert.equal(R.retry.sim,R.before.sim);
  assert.deepEqual(R.retry.events.map(e=>e.type),['webglcontextlost','webglcontextrestored']);assert(R.retry.events.every(e=>e.trusted));
  R.checks.push({name:'real restored context recompiles same request successfully',passed:true});
  R.reset=await p.evaluate(async()=>{const f=__firstuseFault;f.renderer.compileAsync=f.compile;const result=await __debug.command({type:'faceGeometry',reset:true});return{result,originalsUnchanged:f.originals.every(([m,g])=>m.geometry===g),state:f.actor.facialGeometry.getState()}});
  assert(R.reset.result.applied&&R.reset.originalsUnchanged);assert.equal(R.errors.length,0);
  await p.screenshot({path:path.join(OUT,'restored-ready.png')});
  R.status='passed-explicit-context-fault-injection';await c.close();
 }catch(e){R.status='failure-preserved';R.failure=String(e);process.exitCode=1;console.error(e)}
 finally{await browser.close();await save();console.log('CLOSED',OUT)}
})().catch(e=>{console.error(e);process.exitCode=1});
