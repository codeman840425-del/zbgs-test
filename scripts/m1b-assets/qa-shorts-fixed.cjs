// Bounded fixed candidate: actual UI selection, three chair contacts, 1x movie.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {expectations,verifyCandidate}=require('../qa-m1-common.cjs');
(async()=>{
 const expected=expectations(),url=new URL(process.argv[2]);url.searchParams.set('body','male');
 const out=path.resolve(`output/playwright/m1b-shorts/${expected.build}`);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}}),page=await context.newPage(),errors=[],report={expected,errors,selection:[],chairs:[],milestones:[],limits:['New turn implementation may have motion defects; clothing acceptance remains independent','Seat probe samples actual vertices against local chair boxes, not full swept triangle collision','1x movie and offline120Hz seat sampling are separate evidence; no performance claim']};page.on('pageerror',e=>errors.push(e.message));
 async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
 async function mark(label){report.milestones.push(await page.evaluate(label=>({label,t:performance.now(),state:__debug.snapshot()}),label));}
 try{
  await page.goto(url.href);await page.waitForFunction(()=>__debug?.ready,{timeout:60000});report.initialGate=await verifyCandidate(page,expected);
  await page.evaluate(async code=>(await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})))).installM1Probes(),await fs.readFile('scripts/qa-m1-probes.mjs','utf8'));
  await page.evaluate(()=>{__debug.reset();__debug.setBodyMode('dressed');__debug.setPaused(true);__debug.view('front');__debug.advance(0);});
  for(const outfit of [0,2,0,2]){
   await page.locator(`[data-outfit="${outfit}"]`).click();await page.waitForTimeout(400);
   const result=await page.evaluate(()=>{const a=__debug.avatar(),p=a.getAssetProfile(),s=__debug.snapshot();return{outfit:s.outfit,info:a.getOutfitInfo(),target:s.target,body:p.meshRoles.body.map(id=>{let found; a.root.traverse(m=>{if(m.uuid===id)found={name:m.name,visible:m.visible,indexCount:m.geometry.index.count};});return found;})};});
   if(result.outfit!==outfit||result.info.index!==outfit||result.target||!result.body.every(m=>m.visible))throw Error('Actual UI selection/body visibility/path mismatch');report.selection.push(result);await shot('selection-'+report.selection.length+'-'+outfit);
  }
  // Seat sample all three transforms with the actual selected shorts meshes.
  const original=await page.evaluate(()=>__debug.snapshot().chair);
  for(const chair of [{name:'default',dx:0,dz:0,yaw:original.yaw},{name:'rotated',dx:-1.3,dz:-.6,yaw:Math.PI/3},{name:'corner',dx:-.65,dz:-.3,yaw:Math.PI/3}]){
   const record=await page.evaluate(({chair,original})=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa;d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(2);d.setDynamics(false);d.setChairTransform({x:original.position[0]+chair.dx,z:original.position[2]+chair.dz,yaw:chair.yaw});for(let i=0;i<120;i++)c.simulate(1/120);const frames=[];c.action('sit');let i=0;for(;i<7200;i++){c.simulate(1/120);if(c.mode==='sit'&&i%4===0)frames.push({phase:'enter',t:i/120,seat:q.seat()});if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}for(let j=0;j<120;j++)c.simulate(1/120);d.view('side');d.advance(0);return{chair,timedOut:i===7200,frames,seated:q.seat(),state:d.snapshot()};},{chair,original});
   await shot('shorts-'+chair.name+'-seated');
   record.stand=await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),frames=[];c.action('stand');let i=0;for(;i<1800&&c.mode!=='idle';i++){c.simulate(1/120);if(i%4===0)frames.push({t:i/120,seat:__m1qa.seat()});}return{completed:c.mode==='idle',frames,seat:__m1qa.seat()};});report.chairs.push(record);await fs.writeFile(path.join(out,'chair-'+chair.name+'.json'),JSON.stringify(record));
  }
  // Normal-time full short chain, separate from the preceding accelerated probes.
  await page.evaluate(original=>{const d=__debug;d.reset();d.setChairTransform({x:original.position[0],z:original.position[2],yaw:original.yaw});d.setBodyMode('dressed');d.setOutfit(2);d.setDynamics(true);d.setPlaybackRate(1);d.setSpeed(.85);d.camera('close');d.view('front');d.setPaused(false);},original);
  await mark('normal-speed-start');
  report.resetRegression=await page.evaluate(()=>({state:__debug.snapshot(),feet:__m1qa.feet()}));
  await shot('reset-regression');
  await page.evaluate(()=>{window.__shortsTrace=[];window.__shortsTimer=setInterval(()=>window.__shortsTrace.push({wallTime:performance.now(),state:__debug.snapshot()}),100);});
  await page.waitForTimeout(800);
  for(const p of [[.6,1.8],[-1.0,1.8]]){await page.evaluate(p=>__debug.walkTo(...p),p);await page.waitForFunction(()=>{const s=__debug.snapshot();return !s.target&&!s.pending&&s.mode==='idle';},null,{timeout:25000});await mark('walk-stop');}
  await shot('shorts-walk-stopped');await page.evaluate(()=>__debug.action('turn'));await page.waitForFunction(()=>__debug.snapshot().mode==='idle',null,{timeout:15000});await mark('turn-end');
  await page.evaluate(()=>{__debug.view('side');__debug.setSpeed(2.2);});
  for(const p of [[2.0,1.8],[-1.0,1.8]]){await page.evaluate(p=>__debug.walkTo(...p),p);await page.waitForFunction(()=>{const s=__debug.snapshot();return !s.target&&!s.pending&&s.mode==='idle';},null,{timeout:25000});await mark('run-stop');}
  await shot('shorts-run-stopped');await page.evaluate(()=>{__debug.setSpeed(.85);__debug.view('front');});
  await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:25000});await page.waitForTimeout(700);await mark('normal-seated');await shot('normal-seated-front');await page.evaluate(()=>__debug.view('side'));await page.waitForTimeout(400);await shot('normal-seated-side');
  await page.evaluate(()=>__debug.action('stand'));await page.waitForFunction(()=>__debug.snapshot().mode==='idle',null,{timeout:10000});await mark('normal-standing');
  await page.evaluate(()=>__debug.walkTo(-.5,1.15));await page.waitForFunction(()=>{const s=__debug.snapshot();return !s.target&&!s.pending&&s.mode==='idle';},null,{timeout:25000});
  await page.locator('select[aria-label="舞蹈样件"]').selectOption('dance-technical-once-v1');
  await page.evaluate(()=>__debug.action('dance'));await page.waitForFunction(()=>__debug.snapshot().mode==='dance',null,{timeout:5000});await mark('technical-dance-entered');
  for(let i=0;i<8;i++){await page.waitForTimeout(1000);await mark('technical-dance-'+(i+1));if([1,3,5,6].includes(i))await shot('shorts-dance-'+(i+1));}
  await page.waitForFunction(()=>__debug.snapshot().mode==='idle',null,{timeout:5000});await page.waitForTimeout(1200);await mark('normal-chain-end');
  report.normalTrace=await page.evaluate(()=>{clearInterval(window.__shortsTimer);return window.__shortsTrace;});
  report.finalGate=await verifyCandidate(page,expected);report.status='collected; visual review and geometry interpretation required';
 }catch(e){report.failure=String(e);process.exitCode=1;}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));const video=page.video();await context.close();await video.saveAs(path.join(out,'shorts-review.webm'));await browser.close();console.log(out,report.failure||report.status);}
})().catch(e=>{console.error(e);process.exitCode=1;});
