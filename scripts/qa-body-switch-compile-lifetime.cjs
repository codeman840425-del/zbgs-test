const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const BASE=process.argv[2],arg=n=>process.argv.find(s=>s.startsWith('--'+n+'='))?.slice(n.length+3),BUILD=arg('build'),OUT=path.resolve(arg('out')||'');
assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(BASE||''));assert(/^[0-9a-f]{12}$/.test(BUILD||''));assert(arg('out'));
const R={build:BUILD,base:BASE,errors:[],console:[],cycles:[],limits:['Three renderer counters and program reference counts, not VRAM or leak proof','No forced GC, video, or performance claim','Controlled wrapper waits until real compileAsync has resolved before holding application commit']};
const save=()=>fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));
function summarize(s){for(const p of s.programs)p.keySHA256=crypto.createHash('sha256').update(p.cacheKey).digest('hex');return s}
(async()=>{
 await fs.mkdir(OUT,{recursive:false});await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});let p;
 try{
  p=await browser.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>R.errors.push(String(e)));p.on('console',m=>{if(['error','warning'].includes(m.type()))R.console.push({type:m.type(),text:m.text()})});
  await p.goto(BASE+'?workbench=appearance&body=female&view=inspect-half-front');
  await p.waitForFunction(()=>__debug?.ready&&!__debug.snapshot().bodySelection.loading);
  R.identity=await verifyCandidate(p,{build:BUILD,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await p.evaluate(()=>{
   const d=__debug;d.setPaused(true);
   const refs=[];d.avatar().root.traverse(o=>{if(o.isMesh)refs.push({object:o,geometry:o.geometry,material:o.material,mats:[].concat(o.material)})});
   window.__life={original:d.renderer.compileAsync,actor:d.avatar(),motion:d.motion(),document,refs};
   window.__lifeSample=()=>{const h=__life,s=d.snapshot(),r=d.renderer;return{body:d.avatar().profile.bodyType,sameActor:d.avatar()===h.actor,sameMotion:d.motion()===h.motion,sameDocument:document===h.document,sourceReferences:h.refs.map(x=>({uuid:x.object.uuid,geometrySame:x.object.geometry===x.geometry,materialContainerSame:x.object.material===x.material,materialsSame:[].concat(x.object.material).every((v,i)=>v===x.mats[i])})),state:{position:s.position,simulationTime:s.simulationTime,paused:s.paused,outfit:s.outfit,camera:s.camera,inspection:s.inspection,bodySelection:s.bodySelection},memory:{...r.info.memory},programs:r.info.programs.map(p=>({id:p.id,usedTimes:p.usedTimes,cacheKey:p.cacheKey??''}))}};
  });
  const frames=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const sample=async()=>summarize(await p.evaluate(()=>__lifeSample()));
  await frames();R.initial=await sample();await save();
  for(let i=0;i<3;i++){
   const c={round:i+1,before:await sample()};R.cycles.push(c);
   await p.evaluate(()=>{const h=__life,r=__debug.renderer;h.held=false;h.settled=false;h.result=null;h.gate=new Promise(resolve=>h.release=resolve);r.compileAsync=async function(...args){h.candidate=args[0];await h.original.apply(this,args);h.held=true;await h.gate};h.request=__debug.command({type:'bodySelect',bodyType:'male'}).then(x=>{h.result=x;h.settled=true},e=>{h.result={error:String(e)};h.settled=true})});
   try{
    await p.waitForFunction(()=>__life.held,null,{timeout:30000});c.afterRealCompile=await sample();
    c.currentRequest=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'female'}));assert.equal(c.currentRequest.applied,true);
   }finally{await p.evaluate(()=>{__debug.renderer.compileAsync=__life.original;__life.release?.()})}
   await p.waitForFunction(()=>__life.settled,null,{timeout:30000});await frames();c.result=await p.evaluate(()=>__life.result);c.after=await sample();
   assert.equal(c.result.cancelled,true);assert(c.after.sameActor&&c.after.sameMotion&&c.after.sameDocument);assert.equal(c.after.state.bodySelection.loading,false);assert(c.after.sourceReferences.every(x=>x.geometrySame&&x.materialContainerSame&&x.materialsSame));assert.deepEqual(c.after.state.position,R.initial.state.position);assert.equal(c.after.state.simulationTime,R.initial.state.simulationTime);assert(c.after.state.paused);await save();console.log('PASS cancel',i+1,c.after.memory,'programs',c.after.programs.length,'used',c.after.programs.reduce((n,p)=>n+p.usedTimes,0));
  }
  R.recovery=[];
  for(const body of ['male','female']){const result=await p.evaluate(body=>__debug.command({type:'bodySelect',bodyType:body}),body);assert(result.applied);await frames();const s=await sample();assert.equal(s.body,body);assert(s.sameDocument);assert.equal(s.state.bodySelection.loading,false);R.recovery.push({body,result,after:s});await save()}
  assert.equal(R.errors.length,0);R.status='state-checks-passed';await p.screenshot({path:path.join(OUT,'final.png')});
 }catch(e){R.status='failure-preserved';R.failure=String(e);process.exitCode=1;console.error(e)}
 finally{if(p&&!p.isClosed())await p.evaluate(()=>{if(window.__life){__debug.renderer.compileAsync=__life.original;__life.release?.()}}).catch(()=>{});await browser.close();await save();console.log('CLOSED',OUT)}
})().catch(e=>{console.error(e);process.exitCode=1});
