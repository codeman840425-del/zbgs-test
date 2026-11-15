// Real visibility transitions while the current fixed candidate prepares a body.
// This intentionally holds AFTER actual compileAsync, without fabricating events.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const BASE=process.argv[2],BUILD=process.argv[3],OUT=path.resolve(process.argv[4]||'');
const UI=process.argv.includes('--ui');
assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(BASE||''));assert(/^[a-f0-9]{12}$/.test(BUILD||''));assert(process.argv[4]);
const R={build:BUILD,errors:[],cases:[],checks:[],limits:['Two native tab transitions only, not OS minimize or long suspend','Held post-compile transaction, no synthetic visibility events','No recording, performance or animation-naturalness acceptance']};
R.entry=UI?'actual gender buttons':'diagnostic command; does not invoke workbench UI sync';
const check=(name,passed,data)=>{R.checks.push({name,passed:!!passed,data});assert(passed,name)};
const save=()=>fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));
(async()=>{
 await fs.mkdir(OUT,{recursive:false});await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));
 await fs.writeFile(path.join(OUT,'.gitignore'),'chrome-profile/\n');
 let ctx,p;
 try{
  R.playwright=require('../prototype/node_modules/playwright/package.json').version;assert.equal(R.playwright,'1.58.2','Review native focus access for changed driver');
  ctx=await chromium.launchPersistentContext(path.join(OUT,'chrome-profile'),{channel:'chrome',headless:false,viewport:{width:1440,height:900},ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
  p=ctx.pages()[0];p.on('pageerror',e=>R.errors.push(String(e)));
  const nativeFocus=async tab=>{const client=tab._connection.toImpl(tab).delegate?._mainFrameSession?._client;assert(client?.send);await client.send('Emulation.setFocusEmulationEnabled',{enabled:false})};
  await p.goto(BASE+'?workbench=appearance&body=female');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  R.identity=await verifyCandidate(p,{build:BUILD,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await p.evaluate(()=>{
   window.__switchBg={events:[],frames:[],original:__debug.renderer.compileAsync,doc:document};
   window.__switchBgRead=()=>{const d=__debug,s=d.snapshot();return{wall:performance.now(),body:d.avatar().profile.bodyType,sim:s.simulationTime,paused:s.paused,background:s.backgroundSuspended,hidden:document.hidden,position:s.position,mode:s.mode,dt:s.motion.frameDt,loading:s.bodySelection.loading,sameDocument:document===__switchBg.doc}};
   document.addEventListener('visibilitychange',e=>__switchBg.events.push({trusted:e.isTrusted,...__switchBgRead()}));
   const sample=()=>{if(__switchBg.stop)return;__switchBg.frames.push(__switchBgRead());requestAnimationFrame(sample)};requestAnimationFrame(sample);
  });
  await nativeFocus(p);await p.bringToFront();await p.waitForFunction(()=>!document.hidden,null,{timeout:4000});
  const other=await ctx.newPage();await nativeFocus(other);await other.goto('about:blank');await p.bringToFront();await p.waitForFunction(()=>!document.hidden);
  const read=()=>p.evaluate(()=>__switchBgRead());
  for(const spec of [{name:'walking-to-male',body:'male',paused:false},{name:'paused-to-female',body:'female',paused:true}]){
   await p.evaluate(paused=>{__debug.setOutfit(0);__debug.setPaused(paused);__debug.setPlaybackRate(1)},spec.paused);
   if(!spec.paused){await p.evaluate(()=>__debug.request({requestId:'switch-background-walk',kind:'walk',payload:{x:2,z:2.2},timeoutSeconds:30}));await p.waitForFunction(()=>__debug.snapshot().speed>.1,null,{timeout:10000})}
   const c={...spec,before:await read()};R.cases.push(c);
   await p.evaluate(({body,ui})=>{const h=__switchBg;h.held=false;h.settled=false;h.gate=new Promise(r=>h.release=r);__debug.renderer.compileAsync=async function(...args){await h.original.apply(this,args);h.held=true;await h.gate};if(!ui)h.request=__debug.command({type:'bodySelect',bodyType:body}).then(result=>{h.result=result;h.settled=true},e=>{h.result={error:String(e)};h.settled=true})},{body:spec.body,ui:UI});
   if(UI)await p.getByRole('button',{name:spec.body==='male'?'男性候选':'女性候选',exact:true}).click();
   await p.waitForFunction(()=>__switchBg.held,null,{timeout:30000});c.prepared=await read();
   check(spec.name+' old body retained while preparing',c.prepared.body===c.before.body&&c.prepared.loading);
   await other.bringToFront();await p.waitForFunction(()=>document.hidden,null,{timeout:4000});c.hiddenStart=await read();
   await p.waitForTimeout(1500);c.hiddenEnd=await read();
   check(spec.name+' no hidden time advance',c.hiddenStart.sim===c.hiddenEnd.sim);
   await p.evaluate(()=>{__debug.renderer.compileAsync=__switchBg.original;__switchBg.release()});
   if(UI){await p.waitForFunction(body=>__debug.avatar().profile.bodyType===body&&!__debug.snapshot().bodySelection.loading,spec.body,{polling:100,timeout:10000});c.result=await p.evaluate(()=>__debug.snapshot().bodySelection)}
   else{await p.waitForFunction(()=>__switchBg.settled,null,{polling:100,timeout:10000});c.result=await p.evaluate(()=>__switchBg.result)}
   c.committedHidden=await read();
   check(spec.name+' committed while hidden',(UI?!c.result.error:c.result.applied)&&c.committedHidden.hidden&&c.committedHidden.body===spec.body&&!c.committedHidden.loading,c.result);
   check(spec.name+' preserved latest position and clock',JSON.stringify(c.committedHidden.position)===JSON.stringify(c.hiddenEnd.position)&&c.committedHidden.sim===c.hiddenEnd.sim);
   check(spec.name+' paused flag preserved',c.committedHidden.paused===spec.paused);
   await p.bringToFront();await p.waitForFunction(()=>!document.hidden,null,{timeout:4000});c.returnImmediate=await read();await p.waitForTimeout(500);c.returned=await read();
   check(spec.name+' no background catchup',c.returned.sim-c.committedHidden.sim<.85);
   check(spec.name+' expected resume',spec.paused?c.returned.sim===c.committedHidden.sim:c.returned.sim>c.committedHidden.sim);
   check(spec.name+' same document and settled idle',c.returned.sameDocument&&c.returned.mode==='idle');
   if(UI){c.selectedGroup=await p.getByRole('button',{name:spec.body==='male'?'男性候选':'女性候选',exact:true}).getAttribute('aria-pressed');check(spec.name+' selected group matches actor',c.selectedGroup==='true');check(spec.name+' URL matches actor',new URL(p.url()).searchParams.get('body')===spec.body)}
   if(!spec.paused){c.oldTask=await p.evaluate(()=>__debug.tasks().get('switch-background-walk'));check('old walking task cancelled on body commit',c.oldTask.state==='cancelled',c.oldTask)}
   await p.screenshot({path:path.join(OUT,spec.name+'.png')});await save();
  }
  R.events=await p.evaluate(()=>__switchBg.events);check('two actual trusted native hide/return cycles',R.events.filter(e=>e.trusted&&e.hidden).length>=2&&R.events.filter(e=>e.trusted&&!e.hidden).length>=2,R.events);
  check('no pageerrors',R.errors.length===0);R.status='bounded-background-transaction-passed';
 }catch(e){R.status='failure-preserved';R.failure=String(e);process.exitCode=1;console.error(e)}
 finally{
  if(p&&!p.isClosed())R.trace=await p.evaluate(()=>{__switchBg.stop=true;__debug.renderer.compileAsync=__switchBg.original;__switchBg.release?.();return{events:__switchBg.events,frames:__switchBg.frames}}).catch(()=>null);
  if(ctx)await ctx.close();await save();console.log(JSON.stringify({status:R.status,checks:R.checks.length,failure:R.failure,out:OUT}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
