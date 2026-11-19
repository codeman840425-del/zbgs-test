// Actual DOM keyboard regression, plus one normal-rate same-build UI demonstration.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const build=process.env.QA_M2_BUILD,base=process.env.QA_M2_URL||'http://127.0.0.1:4277/';
if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('QA_M2_BUILD must identify a fixed candidate');
const ids={female:['beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],male:['beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],'m1a-jaw-v1':['m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'],'m2-male-jaw-v1':['m2-male-jaw-v1','25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153']};
async function ready(p){await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled&&!document.querySelector('#appearance-identity-fields').disabled,null,{timeout:60000});}
const tab=(p,name)=>p.locator(`[data-workbench-tab=${name}]`).click();
async function snap(p){return p.evaluate(()=>{const d=__debug,s=d.snapshot();return{documentToken:window.__inputQA.token,paused:s.paused,simulationTime:s.simulationTime,body:d.avatar().profile.bodyType,mode:s.mode,path:s.path,target:s.target,position:s.position,details:document.querySelector('#appearance-geometry').open,active:{tag:document.activeElement?.tagName,id:document.activeElement?.id},tab:document.querySelector('[data-workbench-tab][aria-selected=true]')?.dataset.workbenchTab,camera:s.camera,appearance:d.avatar().appearance.getState()};});}
async function setup(context){await context.addInitScript(()=>{window.__inputQA={token:crypto.randomUUID(),events:[],rows:[],record:false};for(const type of ['keydown','keyup','click'])document.addEventListener(type,e=>{const item={type,key:e.key,code:e.code,repeat:e.repeat,isTrusted:e.isTrusted,target:e.target.tagName,id:e.target.id,text:e.target.tagName==='BUTTON'?e.target.textContent:null,time:performance.now()};setTimeout(()=>{item.defaultPrevented=e.defaultPrevented;item.paused=window.__debug?.snapshot().paused;item.details=document.querySelector('#appearance-geometry')?.open;__inputQA.events.push(item);},0);},true);});}
async function spaceWithoutRoomToggle(p,selector){await p.locator(selector).focus();const before=await snap(p);await p.keyboard.press('Space');await p.waitForTimeout(100);const after=await snap(p);assert.equal(after.paused,before.paused);assert.deepEqual(after.path,before.path);assert.deepEqual(after.target,before.target);return{selector,before,after};}
(async()=>{
 const root=await productionRoot();
 const out=await projectOutput(process.env.QA_M2_OUT||path.join(root,'evidence',`workbench-space-ui-${build}`),root);
 // Older invocations may supply a directory prepared for the run. Check its
 // individual outputs before any write in case an entry is redirected.
 for(const name of ['report.json','executed-script.cjs','keyboard-events.json','keyboard-final.png',
   'raw-video','workbench-tour-trace.json','workbench-tour-1x.webm']){
  const target=path.join(out,name);
  if(await projectOutput(target,root)!==target)throw Error('Redirected workbench evidence path: '+target);
 }
 const report={build,url:base,started:new Date().toISOString(),checks:[],errors:[],identities:[],movies:[],scope:'Space routing only + workbench demonstration. No geometry/dance/performance matrix.'};
 const reportFile=path.join(out,'report.json');
 const save=flag=>fs.writeFile(reportFile,JSON.stringify(report,null,2),{flag});
 async function check(name,fn){try{const result=await fn();report.checks.push({name,passed:true,result});console.log('PASS',name);}catch(e){report.checks.push({name,passed:false,error:String(e),stack:e.stack});console.log('FAIL',name,String(e));}await save();}
 try{await fs.access(reportFile);throw Error('Refuse overwrite');}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.mkdir(out,{recursive:true});
 await save('wx');
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 let session;
async function open(c){const p=await c.newPage();p.on('pageerror',e=>report.errors.push(String(e)));await p.goto(base+'?workbench=appearance&body=female');await ready(p);report.identities.push(await verifyCandidate(p,{build,assetId:ids.female[0],sha256:ids.female[1]}));return p;}
try{
 session=await launchQABrowser(out,{channel:'chrome'});
 const browser=session.browser;
 const c=await browser.newContext({viewport:{width:1600,height:1000}});await setup(c);const p=await open(c);
 await check('summary Space expands and collapses without room pause',async()=>{const before=await snap(p);assert.equal(before.details,false);const opened=await spaceWithoutRoomToggle(p,'#appearance-geometry summary');assert.equal(opened.after.details,true);const closed=await spaceWithoutRoomToggle(p,'#appearance-geometry summary');assert.equal(closed.after.details,false);return{opened,closed};});
 await check('numeric input Space does not pause or navigate room',async()=>{await p.locator('#appearance-geometry summary').click();const value=await p.locator('#mouth-width').inputValue();const result=await spaceWithoutRoomToggle(p,'#mouth-width');assert.equal(await p.locator('#mouth-width').inputValue(),value);return result;});
 await check('native select Space is handled by UI, not room',async()=>{const result=await spaceWithoutRoomToggle(p,'#brow-sample');await p.keyboard.press('Escape');return result;});
 await check('button keyboard activation does not leak to room',async()=>{await tab(p,'actions');const result=await spaceWithoutRoomToggle(p,'[data-expression=happy]');return{...result,live:await p.evaluate(()=>__debug.avatar().livePresentation.getState())};});
 await check('tabs Space and arrow navigation do not pause room',async()=>{const result=await spaceWithoutRoomToggle(p,'[data-workbench-tab=inspection]');assert.equal(result.after.tab,'inspection');await p.keyboard.press('ArrowLeft');assert.equal((await snap(p)).tab,'actions');assert.equal((await snap(p)).paused,result.before.paused);return{...result,afterArrow:await snap(p)};});
 await check('body Space pauses once; genuine repeat does not retoggle; next press resumes',async()=>{
  await p.evaluate(()=>document.activeElement?.blur());assert.equal(await p.evaluate(()=>document.activeElement.tagName),'BODY');const before=await snap(p);assert.equal(before.paused,false);
  await p.keyboard.down('Space');await p.waitForTimeout(100);const first=await snap(p);assert.equal(first.paused,true);const repeats=[];
  for(let i=0;i<4;i++){await p.keyboard.down('Space');await p.waitForTimeout(80);const s=await snap(p);assert.equal(s.paused,true);repeats.push(s);}
  await p.keyboard.up('Space');await p.waitForTimeout(80);assert.equal((await snap(p)).paused,true);await p.keyboard.press('Space');await p.waitForTimeout(100);const after=await snap(p);assert.equal(after.paused,false);
  const events=await p.evaluate(()=>__inputQA.events.filter(e=>e.code==='Space'&&e.target==='BODY'));assert.equal(events.filter(e=>e.type==='keydown'&&e.repeat).length,4);assert(events.every(e=>e.isTrusted));return{before,first,repeats,after,events};
 });
 const events=await p.evaluate(()=>__inputQA.events);assert(events.filter(e=>e.code==='Space').every(e=>e.isTrusted));await fs.writeFile(path.join(out,'keyboard-events.json'),JSON.stringify(events,null,2));await p.screenshot({path:path.join(out,'keyboard-final.png')});await c.close();
 // Fresh page/context for one readable normal-speed demonstration, no repeated geometry tests.
 const movieContext=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1600,height:1000}}});await setup(movieContext);const v=await open(movieContext);
 await v.evaluate(()=>{const q=__inputQA;q.start=performance.now();q.last=null;q.record=true;function tick(t){if(!q.record)return;const d=__debug,s=d.snapshot();q.rows.push({t:(t-q.start)/1000,dt:q.last===null?null:(t-q.last)/1000,sim:s.simulationTime,paused:s.paused,body:d.avatar().profile.bodyType,tab:document.querySelector('[data-workbench-tab][aria-selected=true]')?.dataset.workbenchTab,details:document.querySelector('#appearance-geometry').open,hair:d.avatar().appearance.getState().hairStyle,mode:s.mode});q.last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
 await check('same-build normal1x workbench tour, same document actor changes',async()=>{
  const token=(await snap(v)).documentToken,steps=[];const hold=async(label,ms=1400)=>{await v.waitForTimeout(ms);const s=await snap(v);assert.equal(s.documentToken,token);assert.equal(s.paused,false);steps.push({label,state:s});};
  await v.locator('[data-inspect-framing=face]').click();await hold('female original close');
  await v.locator('#appearance-geometry summary').focus();await v.keyboard.press('Space');assert((await snap(v)).details);await hold('keyboard summary open');await v.keyboard.press('Space');assert.equal((await snap(v)).details,false);await hold('keyboard summary close',650);
  await v.locator('#appearance-body').selectOption('m1a-jaw-v1');await ready(v);await hold('female jaw same page');
  await v.locator('[data-inspect-framing=half]').click();await hold('persistent half camera',1000);
  await v.locator('[data-appearance-group=male]').click();await ready(v);await hold('male original');
  await v.locator('#appearance-hair-style').selectOption('male-sidepart-v1');await ready(v);await v.locator('[data-inspect-framing=face]').click();await v.locator('[data-inspect-direction=side]').click();await hold('male new hair side',1800);
  await v.locator('[data-inspect-direction=front]').click();await hold('male new hair front',1200);
  await tab(v,'actions');await v.locator('[data-expression=happy]').click();await v.locator('#speaking-button').click();await hold('actions speaking',2500);await v.locator('#speaking-button').click();await v.locator('[data-expression=neutral]').click();
  await tab(v,'inspection');await hold('inspection controls',1600);await v.locator('[data-inspect-framing=full]').click();await hold('persistent full camera',1400);
  await tab(v,'appearance');await v.locator('#appearance-body').selectOption('m2-male-jaw-v1');await ready(v);await hold('male jaw same page',1300);
  await v.locator('#appearance-body').selectOption('male');await ready(v);await hold('male original restored',1000);
  await v.locator('[data-appearance-group=female]').click();await ready(v);await v.locator('[data-inspect-framing=face]').click();await hold('female original same document',1400);
  const elapsed=await v.evaluate(()=>(performance.now()-__inputQA.start)/1000);if(elapsed<24)await hold('end',Math.ceil((24-elapsed)*1000));return{documentToken:token,steps,final:await snap(v)};
 });
 const trace=await v.evaluate(()=>{__inputQA.record=false;return __inputQA;});await fs.writeFile(path.join(out,'workbench-tour-trace.json'),JSON.stringify(trace));const video=v.video();await movieContext.close();await video.saveAs(path.join(out,'workbench-tour-1x.webm'));report.movies.push({file:'workbench-tour-1x.webm',trace:'workbench-tour-trace.json'});
 report.status=report.checks.every(x=>x.passed)&&!report.errors.length?'technical-passed-visual-review-pending':'failures-preserved';
}catch(e){report.status='incomplete';report.fatal=String(e);process.exitCode=1;console.error(e);}
finally{
 try{await session?.close();}
 finally{report.finished=new Date().toISOString();await save();console.log('BROWSER CLOSED',out);}
}
})().catch(e=>{console.error(e);process.exitCode=1;});
