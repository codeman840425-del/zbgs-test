// Bounded sustained session. No forced GC, recording, CPU throttling or runtime edits.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const BUILD='a0dd7fb7bf4a',BASE='http://127.0.0.1:4196/';
const IDS={female:['beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],male:['beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff']};
const R={build:BUILD,base:BASE,errors:[],console:[],network:[],operations:[],rounds:[],identities:[],limits:['Development-machine headless Chrome, no recording or forced GC','JS heap includes QA instrumentation and is not VRAM','Six bounded cycles cannot prove absence of leaks','rAF measures browser callbacks, not GPU frame execution or ordinary-PC performance']};
const quant=(a,q)=>a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*q))]:null;
function stats(rows){const a=rows.map(x=>x.dt).filter(Number.isFinite).sort((a,b)=>a-b);return{frames:a.length,p50:quant(a,.5),p95:quant(a,.95),p99:quant(a,.99),max:a.at(-1),over50:a.filter(x=>x>50).length}}
(async()=>{
 const project=await productionRoot();
 const OUT=await projectOutput(process.argv[2] || path.join(project,'evidence/workbench-session-a0dd-v1'),project);
 const evidenceFile=name=>projectOutput(path.join(OUT,name),OUT);

 const save=async()=>fs.writeFile(await evidenceFile('report.json'),JSON.stringify(R,null,2));
 await fs.mkdir(OUT);await fs.copyFile(__filename,await evidenceFile('executed-script.cjs'));
 let session,progress;
 try{
  session=await launchQABrowser(OUT,{channel:'chrome',headless:true});
  const {browser}=session;
  const c=await browser.newContext({viewport:{width:1600,height:1000}}),p=await c.newPage(),cd=await c.newCDPSession(p);
  p.on('pageerror',e=>R.errors.push(String(e)));p.on('console',m=>{if(['warning','error'].includes(m.type()))R.console.push({type:m.type(),text:m.text()})});p.on('response',r=>{if(r.status()>=400)R.network.push({url:r.url(),status:r.status()})});
  const ready=()=>p.waitForFunction(()=>__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled&&!document.querySelector('#appearance-fields').disabled&&!__debug.avatar().facialGeometry.getState().facialGeometryLoading,null,{timeout:30000});
  await p.goto(BASE+'?workbench=appearance&body=female');await ready();
  R.identities.push(await verifyCandidate(p,{build:BUILD,assetId:IDS.female[0],sha256:IDS.female[1]}));
  await p.evaluate(()=>{window.__sessionDocument=document;window.__sessionQA={start:performance.now(),last:null,phase:'setup',rows:[],running:true};const q=__sessionQA;const frame=t=>{if(!q.running)return;q.rows.push({t:t-q.start,dt:q.last===null?null:t-q.last,phase:q.lastPhase===q.phase?q.phase:'phase-boundary'});q.lastPhase=q.phase;q.last=t;requestAnimationFrame(frame)};requestAnimationFrame(frame)});
  const started=Date.now();R.startedAt=new Date().toISOString();progress=setInterval(()=>console.log('PROGRESS',JSON.stringify({seconds:(Date.now()-started)/1000,rounds:R.rounds.length,operations:R.operations.length,errors:R.errors.length})),60000);
  const phase=name=>p.evaluate(name=>{__sessionQA.phase=name},name);
  async function op(name,fn){await phase('switch-edit');const t=Date.now();const result=await fn();R.operations.push({name,ms:Date.now()-t,result});return result}
  async function tab(name){await p.locator(`[data-workbench-tab=${name}]`).click();assert.equal(await p.locator(`[data-workbench-tab=${name}]`).getAttribute('aria-selected'),'true')}
  async function body(name){await op('body:'+name,async()=>{await p.evaluate(()=>window.__sessionOriginals=null);await p.locator(`[data-appearance-group=${name}]`).click();await ready();const s=await p.evaluate(()=>{const a=__debug.avatar();return{body:a.profile.bodyType,id:a.profile.id,sha:a.profile.sha256,build:__debug.buildInfo.shortId,sameDocument:document===__sessionDocument}});assert.equal(s.body,name);assert.equal(s.id,IDS[name][0]);assert.equal(s.sha,IDS[name][1]);assert.equal(s.build,BUILD);assert(s.sameDocument);return s})}
  async function customize(name,round){
   await tab('appearance');await p.evaluate(()=>{const a=__debug.avatar();window.__sessionOriginals=[];a.vrm.scene.traverse(m=>{if(m.isMesh)__sessionOriginals.push([m,m.geometry])})});
   await op(name+':hair-color-mouth',async()=>{await p.locator('#appearance-hair-style').selectOption(name==='female'?'female-bob-v1':'male-sidepart-v1');await ready();await p.locator('#appearance-hair-color').selectOption(round%2?'brown':'black');await ready();await p.locator('#appearance-skin-tone').selectOption('warm');await ready();const d=p.locator('#appearance-geometry');if(!await d.evaluate(n=>n.open))await d.locator('summary').click();await p.locator('#mouth-width').fill(round%2?'4':'-4');await p.locator('#mouth-width').press('Tab');await ready();await p.waitForFunction(v=>__debug.avatar().facialGeometry.getState().mouthWidth===v,round%2?.04:-.04);return p.evaluate(()=>({appearance:__debug.avatar().appearance.getState(),geometry:__debug.avatar().facialGeometry.getState()}))});
   await tab('actions');await p.locator('[data-inspect-framing=face]').click();await p.locator('[data-inspect-direction=side]').click();await p.locator('[data-inspect-direction=front]').click();
   await p.evaluate(()=>{__debug.setPaused(false);__debug.command({type:'speaking',value:true})});await phase('steady-speech');await p.waitForTimeout(11000);
   await op(name+':pause-resume',async()=>{const before=await p.evaluate(()=>{__debug.setPaused(true);return __debug.snapshot().simulationTime});await phase('paused');await p.waitForTimeout(500);const after=await p.evaluate(()=>__debug.snapshot().simulationTime);assert.equal(after,before);await p.evaluate(()=>__debug.setPaused(false));return{before,after}});
   await op(name+':restore',async()=>{await p.evaluate(()=>__debug.command({type:'speaking',value:false}));await tab('appearance');await p.locator('#mouth-width-reset').click();await ready();await p.locator('#appearance-reset').click();await ready();const s=await p.evaluate(()=>({refs:__sessionOriginals.every(([m,g])=>m.geometry===g),geometry:__debug.avatar().facialGeometry.getState(),appearance:__debug.avatar().appearance.getState()}));assert(s.refs);assert.equal(s.geometry.mouthWidth,0);assert.equal(s.appearance.hairStyle,'original');assert.equal(s.appearance.hairColor,'original');assert.equal(s.appearance.skinTone,'original');return s});
   for(const t of ['inspection','actions','appearance'])await tab(t);
  }
  async function metric(label){await phase('settle');await p.waitForTimeout(800);const s=await p.evaluate(label=>({label,body:__debug.avatar().profile.bodyType,memory:__debug.renderer.info.memory,programs:__debug.renderer.info.programs.length,wall:performance.now()-__sessionQA.start,geometry:__debug.avatar().facialGeometry.getState()}),label);s.jsHeapNoGC=await cd.send('Runtime.getHeapUsage');return s}
  R.initial=await metric('initial-female');
  for(let round=1;round<=6;round++){
   const rr={round,startSeconds:(Date.now()-started)/1000};await body('female');await customize('female',round);rr.femaleRestored=await metric('female-restored');
   await body('male');if(round===1)R.identities.push(await verifyCandidate(p,{build:BUILD,assetId:IDS.male[0],sha256:IDS.male[1]}));await customize('male',round);rr.maleRestored=await metric('male-restored');
   await body('female');rr.femaleReturned=await metric('female-returned');
   const rows=await p.evaluate(()=>{const a=__sessionQA.rows;__sessionQA.rows=[];return a});await fs.writeFile(await evidenceFile(`round-${round}-raf.json.gz`),zlib.gzipSync(JSON.stringify(rows)));
   rr.frames=Object.fromEntries([...new Set(rows.map(x=>x.phase))].map(k=>[k,stats(rows.filter(x=>x.phase===k))]));rr.endSeconds=(Date.now()-started)/1000;R.rounds.push(rr);await save();console.log('ROUND',round,rr.endSeconds.toFixed(1));
  }
  await p.evaluate(()=>{__debug.setPaused(false);__debug.command({type:'speaking',value:true})});await phase('steady-extra-speech');
  while(Date.now()-started<242000)await p.waitForTimeout(Math.min(5000,242000-(Date.now()-started)));
  R.final=await metric('final-female');const rows=await p.evaluate(()=>{__sessionQA.running=false;return __sessionQA.rows});await fs.writeFile(await evidenceFile('final-raf.json.gz'),zlib.gzipSync(JSON.stringify(rows)));R.finalFrames=Object.fromEntries([...new Set(rows.map(x=>x.phase))].map(k=>[k,stats(rows.filter(x=>x.phase===k))]));R.wallSeconds=(Date.now()-started)/1000;
  assert(R.wallSeconds>=240);assert.equal(R.rounds.length,6);assert.equal(R.errors.length,0);assert.equal(R.network.length,0);R.status='completed-bounded-session';await p.screenshot({path:await evidenceFile('final-workbench.png')});
 }catch(e){R.status='failure-preserved';R.failure=String(e);process.exitCode=1;console.error(e)}
 finally{clearInterval(progress);await session?.close();await save();console.log('CLOSED',OUT)}
})().catch(e=>{console.error(e);process.exitCode=1});
