// Short developer diagnostic; never a fixed-candidate acceptance gate.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),expected='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
async function hashes(){const p=path.join(root,'prototype/src');return Object.fromEntries(await Promise.all((await fs.readdir(p)).filter(n=>n.endsWith('.js')).sort().map(async n=>[n,crypto.createHash('sha256').update(await fs.readFile(path.join(p,n))).digest('hex')])));}
(async()=>{
 const out=path.join(root,'output/playwright/m1b/dev-contacts-'+Date.now());await fs.mkdir(out,{recursive:true});
 const start=await hashes(),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const records=[];
 try{
  await page.goto('http://127.0.0.1:5173/?body=male');await page.waitForFunction(()=>window.__debug?.ready,{timeout:60000});
  const identity=await page.evaluate(async()=>{const p=__debug.avatar().profile;return {profile:p,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(p.url)).arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('')};});
  if(identity.profile.bodyType!=='male'||identity.sha256!==expected)throw Error('Male identity mismatch');
  await page.evaluate(async code=>(await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})))).installM1Probes(),await fs.readFile(path.join(root,'scripts/qa-m1-probes.mjs'),'utf8'));
  for(const name of ['base','pants']){
   await page.evaluate(name=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setBodyMode(name==='base'?'base':'dressed');d.setOutfit(0);d.setDynamics(false);for(let i=0;i<120;i++)c.simulate(1/120);d.view('front');d.advance(0);},name);
   await page.screenshot({path:path.join(out,name+'-standing.png')});
   const record=await page.evaluate(()=>{const d=__debug,q=__m1qa,c=d.game.scene.getScene('CharacterStudio'),capture=()=>({feet:q.feet(),seat:q.seat(),pose:q.pose(),state:d.snapshot()});q.resetHistory();const r={idle:capture(),frames:[]};c.action('sit');let i=0;for(;i<3000;i++){c.simulate(1/120);if(c.mode==='sit'&&i%4===0)r.frames.push({phase:'sit',i,...capture()});if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}r.seatFrames=i;r.timedOut=i===3000;for(let j=0;j<120;j++)c.simulate(1/120);r.seated=capture();d.view('side');d.advance(0);return r;});
   await page.screenshot({path:path.join(out,name+'-seated.png')});
   record.stand=await page.evaluate(()=>{const d=__debug,q=__m1qa,c=d.game.scene.getScene('CharacterStudio'),frames=[];c.action('stand');let i=0;for(;i<1800&&c.mode!=='idle';i++){c.simulate(1/120);if(i%4===0)frames.push({i,feet:q.feet(),seat:q.seat()});}for(let j=0;j<120;j++)c.simulate(1/120);return {completed:c.mode==='idle',frames,feet:q.feet(),seat:q.seat(),state:d.snapshot()};});
   records.push({name,...record});await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(record));
  }
  const walk=await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa;d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(0);d.setDynamics(false);d.setSpeed(.85);for(let i=0;i<120;i++)c.simulate(1/120);q.resetHistory();d.walkTo(1,1);const frames=[];for(let i=0;i<720;i++){c.simulate(1/120);frames.push({i,feet:q.feet(),pose:q.pose(),state:d.snapshot()});if(i===100){d.view('side');d.advance(0);window.__walkShot=true;}}d.view('side');d.advance(0);return frames;});
  await fs.writeFile(path.join(out,'walk.json'),JSON.stringify(walk));
  await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setBodyMode('dressed');d.walkTo(1,1);for(let i=0;i<120;i++)c.simulate(1/120);d.view('side');d.advance(0);});
  await page.screenshot({path:path.join(out,'pants-walking.png')});
  const end=await hashes();const report={kind:'developer diagnostic, not fixed build acceptance',identity,start,end,sourceUnchanged:JSON.stringify(start)===JSON.stringify(end),errors,records:records.map(r=>({name:r.name,timedOut:r.timedOut,seatFrames:r.seatFrames,idleFeet:r.idle.feet,seated:r.seated.seat.meshes,standingCompleted:r.stand.completed})),limitations:['Actual referenced skinned vertices against collider-local boxes; not triangle or swept collision','Simulation120Hz, seat surface30Hz; not performance/FPS','Only default chair; no rotated chairs or dual-instance acceptance']};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(report.records));console.log('errors',errors,'unchanged',report.sourceUnchanged);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
