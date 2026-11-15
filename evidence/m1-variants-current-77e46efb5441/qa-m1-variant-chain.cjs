// Existing female specimens only: bounded normal-clock current-build chain.
// Reuses qa-m2-male-face-motion + qa-m1-user-chain identity/task/video patterns.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {verifyCandidate,prepareOutput,writeFailure}=require('./qa-m1-common.cjs');
const knownBodies=['m1a-jaw-v1','m1a-waisthip-v1'];
const selected=process.argv.find(x=>x.startsWith('--bodies='))?.slice(9).split(',');
if(selected&&(!selected.length||selected.some(x=>!knownBodies.includes(x))||new Set(selected).size!==selected.length))throw Error('Unknown/duplicate body selection');
const bodies=selected||knownBodies;
const plan={bodies,viewport:[1440,900],camera:'room fixed after setup',chain:['UI own pants','walk .85 -> run2.4 -> reselect -> stop','pants actual chair sit/stand','UI own skirt -> actual sit/stand','walk to clear dance space','existing technical7.2 once ends','UI return own pants'],limits:['No props, normalized motion or new source assets','No reset/teleport/manual simulate in recorded chain','No full-skin matrix or target-device performance claim']};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
(async()=>{
 const base=process.argv[2],build=process.env.QA_M1_BUILD;assert.equal(build,'77e46efb5441');assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||''));
 const sourceRoot=path.resolve('experiments/rebuild-77e46-e94ac1c/prototype');
 const served=await(await fetch(new URL('build-info.json',base))).json(),h=createHash('sha256');
 for(const file of served.inputs){h.update(file);h.update('\0');h.update(await fs.readFile(path.join(sourceRoot,file)));h.update('\0');}
 assert.equal(h.digest('hex'),served.sourceDigest,'Matching fixed source required before taking profile IDs');
 const {foundationProfile}=await import(pathToFileURL(path.join(sourceRoot,'src/foundation-profiles.js')));
 const cases=bodies.map(body=>{const config=foundationProfile(body);assert.equal(config.id,body);assert.equal(config.referenceBody,'female');return {body,assetId:config.id,sha256:config.sha256,config};});
 const out=await prepareOutput(build,'variant-chain'),report={build,plan,matchingSource:sourceRoot,sourceDigest:served.sourceDigest,cases:[],visualReview:'pending'};
 const {chromium}=require('../prototype/node_modules/playwright'),browser=await chromium.launch({channel:'chrome',headless:true});
 const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 try{for(const cfg of cases){
  const dir=path.join(out,cfg.body);await fs.mkdir(dir,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
  const page=await context.newPage(),video=page.video(),r={config:cfg,errors:[],inputs:[],tasks:[],checks:[]};report.cases.push(r);page.on('pageerror',e=>r.errors.push(e.message));
  const check=(name,ok,details)=>{r.checks.push({name,passed:!!ok,details});assert(ok,name);};
  const mark=async name=>r.inputs.push({name,...await page.evaluate(()=>({wall:performance.now(),snapshot:__debug.snapshot(),fit:__debug.avatar().getOutfitInfo()}))});
  const request=async req=>{await mark(JSON.stringify(req));return page.evaluate(req=>__debug.request(req),req);};
  const done=async(id,wanted='completed')=>{await page.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout:40000});const task=await page.evaluate(id=>__debug.tasks().get(id),id);r.tasks.push(task);check(id+' '+wanted,task.state===wanted,task);return task;};
  const speed=value=>page.evaluate(value=>__debug.command({type:'speed',value}),value);
  const outfit=async index=>{await mark('UI outfit '+index);await page.locator('[data-outfit="'+index+'"]').click();const info=await page.evaluate(()=>__debug.avatar().getOutfitInfo());check('outfit '+index+' applied',info.index===index,info);const expected=[cfg.config.ids.top,cfg.config.ids.shoes,cfg.config.ids[index===1?'skirt':'pants']].sort();const actual=Object.values(info.equipment.items).filter(x=>x.visible).map(x=>x.id).sort();check('own equipment visible '+index,JSON.stringify(actual)===JSON.stringify(expected),{actual,expected});check('own skirt fit retained',info.equipment.skirtDynamics?.fitId===cfg.body+'-uniform-skirt-pose-guide-v1',info.equipment.skirtDynamics);await mark('outfit applied '+index);};
  try{
   await page.goto(base+'?body='+cfg.body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.initialGate=await verifyCandidate(page,{build,...cfg});
   r.resources=await page.evaluate(async cfg=>{
    const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const manifest=await(await fetch(cfg.manifestUrl,{cache:'no-store'})).json(),items=[];
    for(const item of manifest.items){const url=new URL(item.url,new URL(cfg.manifestUrl,location.href)).href,response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Missing own equipment '+item.id);const bytes=await response.arrayBuffer(),sha256=await hash(bytes);if(sha256!==item.sha256||bytes.byteLength!==item.bytes||item.compatibleAvatarSha256!==cfg.sha256)throw Error('Own equipment identity mismatch '+item.id);items.push({id:item.id,slot:item.slot,url,bytes:bytes.byteLength,sha256,compatibleAvatarSha256:item.compatibleAvatarSha256});}
    const dm=await(await fetch('/assets/motion/m1c/dance-imports.json',{cache:'no-store'})).json(),entry=dm.entries.find(x=>x.id==='dance-technical-once-v1');
    if(!entry||entry.format==='normalized-vrm-motion.1')return {items,dance:{available:false,reason:'No eligible existing generic technical clip'}};
    const b=await(await fetch('/assets/motion/m1c/'+entry.file,{cache:'no-store'})).arrayBuffer(),sha=await hash(b);if(sha!==entry.sha256)throw Error('Technical resource SHA mismatch');
    return {items,dance:{available:true,entry,actualSha256:sha}};
   },cfg.config);
   await page.evaluate(()=>{const d=__debug;d.setPlaybackRate(1);d.setPaused(false);d.setCorrections('full');d.setBodyMode('dressed');d.setHelpers(false);d.setDynamics(true);d.command({type:'speaking',value:false});d.game.scene.getScene('CharacterStudio').cameraPreset('room',true);const q=window.__variantChain={rows:[],events:[],running:true,last:null};document.addEventListener('click',e=>q.events.push({wall:performance.now(),trusted:e.isTrusted,target:e.target?.tagName,outfit:e.target?.closest?.('[data-outfit]')?.dataset?.outfit}),true);function frame(t){if(!q.running)return;const s=d.snapshot();q.rows.push({wallMs:t,dt:q.last===null?null:t-q.last,simulationTime:s.simulationTime,root:s.position,speed:s.speed,mode:s.mode,outfit:s.outfit,camera:s.camera,phase:s.motion.phase,jogPhase:s.motion.jogPhase,runMix:s.motion.runMix,sit:s.motion.sitProgress,dance:s.motion.dance,active:d.tasks().active()});q.last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   await outfit(0);await speed(.85);await request({requestId:'pants-walk',kind:'walk',payload:{x:2,z:1.8}});await page.waitForTimeout(700);
   await speed(2.4);await request({requestId:'pants-run',kind:'walk',payload:{x:-2.7,z:1.8}});await done('pants-walk','cancelled');await page.waitForTimeout(800);
   await request({requestId:'pants-reselect-stop',kind:'walk',payload:{x:-.5,z:1.8}});await done('pants-run','cancelled');await done('pants-reselect-stop');await page.waitForTimeout(500);await speed(.85);
   await request({requestId:'pants-sit',kind:'sit'});await done('pants-sit');await page.waitForTimeout(650);await mark('pants seated');await request({requestId:'pants-stand',kind:'stand'});await done('pants-stand');
   await outfit(1);await request({requestId:'skirt-sit',kind:'sit'});await done('skirt-sit');await page.waitForTimeout(650);await mark('skirt seated');await request({requestId:'skirt-stand',kind:'stand'});await done('skirt-stand');
   await request({requestId:'dance-space',kind:'walk',payload:{x:-.5,z:1.8}});await done('dance-space');await page.waitForTimeout(500);
   if(r.resources.dance.available){await request({requestId:'technical-once',kind:'dance',payload:{danceId:'dance-technical-once-v1'}});const t=await done('technical-once');check('full technical7.2',t.endedAt-t.startedAt>=7.2,t.endedAt-t.startedAt);}
   else{r.danceUnavailable=r.resources.dance.reason;}
   await page.waitForTimeout(500);await outfit(0);await page.waitForTimeout(600);
   r.final=await page.evaluate(()=>({snapshot:__debug.snapshot(),active:__debug.tasks().active(),fit:__debug.avatar().getOutfitInfo(),live:__debug.avatar().livePresentation.getState(),history:__debug.tasks().history()}));
   check('final idle pants',r.final.snapshot.mode==='idle'&&r.final.active===null&&r.final.snapshot.outfit===0);check('no props',Object.values(r.final.live.accessories).every(x=>!x.loaded&&!x.requested));r.finalGate=await verifyCandidate(page,{build,...cfg});check('no pageerror',r.errors.length===0);
  }catch(e){r.failure=String(e);throw e;}finally{
   const trace=await page.evaluate(()=>{const q=window.__variantChain;if(!q)return {rows:[],events:[]};q.running=false;return q;}).catch(()=>({rows:[],events:[]}));r.frames=trace.rows;r.events=trace.events;
   await context.close();await video.saveAs(path.join(dir,'pants-skirt-run-seat-dance-1x.webm'));await save();
  }
  check('frames present',r.frames.length>0);const camera=JSON.stringify(r.frames[0].camera);check('room camera retained',r.frames.every(x=>JSON.stringify(x.camera)===camera));check('actual run',r.frames.some(x=>x.runMix>.95));check('real outfit clicks',r.events.filter(e=>e.trusted&&e.outfit!==undefined).length===3,r.events);
  r.clock={wallSeconds:(r.frames.at(-1).wallMs-r.frames[0].wallMs)/1000,simulationSeconds:r.frames.at(-1).simulationTime-r.frames[0].simulationTime,scope:'post-ready rAF; video contains loading'};r.clock.ratio=r.clock.simulationSeconds/r.clock.wallSeconds;r.passed=!r.danceUnavailable;await save();
 }}catch(e){await writeFailure(out,e);throw e;}finally{await browser.close();await save();console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
