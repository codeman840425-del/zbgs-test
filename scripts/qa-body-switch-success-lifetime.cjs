const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const BASE=process.argv[2],arg=n=>process.argv.find(s=>s.startsWith('--'+n+'='))?.slice(n.length+3),BUILD=arg('build'),OUT=path.resolve(arg('out')||'');
assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(BASE||''));assert(/^[0-9a-f]{12}$/.test(BUILD||''));assert(arg('out'));
const R={build:BUILD,base:BASE,errors:[],console:[],rounds:[],limits:['Three renderer counters and program references, not VRAM or long-term leak proof','Three successful female-to-male-to-female rounds; no forced GC, profiler, video, compile wrapper or fault injection']};
const save=()=>fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));
(async()=>{
 await fs.mkdir(OUT,{recursive:false});await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>R.errors.push(String(e)));p.on('console',m=>{if(['error','warning'].includes(m.type()))R.console.push({type:m.type(),text:m.text()})});
  await p.goto(BASE+'?workbench=appearance&body=female&view=inspect-half-front');await p.waitForFunction(()=>__debug?.ready&&!__debug.snapshot().bodySelection.loading);
  R.identity=await verifyCandidate(p,{build:BUILD,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await p.evaluate(()=>{window.__lifeDocument=document;__debug.setPaused(true);__debug.setOutfit(0)});
  const sample=async()=>{await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const s=await p.evaluate(()=>{const d=__debug,r=d.renderer,s=d.snapshot(),a=d.avatar();return{body:a.profile.bodyType,assetProfile:a.getAssetProfile(),sameDocument:document===__lifeDocument,appearance:a.appearance.getState(),state:{outfit:s.outfit,paused:s.paused,position:s.position,simulationTime:s.simulationTime,inspection:s.inspection,bodySelection:s.bodySelection,camera:s.camera},memory:{...r.info.memory},programs:r.info.programs.map(p=>({id:p.id,usedTimes:p.usedTimes,cacheKey:p.cacheKey??''}))}});for(const v of s.programs)v.keySHA256=crypto.createHash('sha256').update(v.cacheKey).digest('hex');return s};
  R.initial=await sample();await save();
  for(let i=0;i<3;i++){
   const round={round:i+1,states:[]};R.rounds.push(round);
   for(const body of ['male','female']){
    const result=await p.evaluate(body=>__debug.command({type:'bodySelect',bodyType:body}),body);assert.equal(result.applied,true);const s=await sample();round.states.push({body,result,sample:s});
    assert.equal(s.body,body);assert(s.sameDocument&&s.state.paused);assert.equal(s.state.outfit,0);assert.equal(s.state.bodySelection.loading,false);assert.deepEqual(s.state.position,R.initial.state.position);assert.equal(s.state.simulationTime,R.initial.state.simulationTime);
    for(const key of ['hairStyle','hairColor','skinTone','eyeColor','lipColor'])assert.equal(s.appearance[key],R.initial.appearance[key],key);
    await save();console.log('STATE',i+1,body,s.memory,'programs',s.programs.length,'used',s.programs.reduce((n,x)=>n+x.usedTimes,0));
   }
  }
  assert.equal(R.errors.length,0);R.status='state-checks-passed';await p.screenshot({path:path.join(OUT,'final.png')});
 }catch(e){R.status='failure-preserved';R.failure=String(e);process.exitCode=1;console.error(e)}
 finally{await browser.close();await save();console.log('CLOSED',OUT)}
})().catch(e=>{console.error(e);process.exitCode=1});
