// Actual headed tab visibility, resize and bounded repeated actor/equipment use.
// Never overwrites document.hidden or synthesizes visibilitychange.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
const mode=process.argv.find(x=>x.startsWith('--mode='))?.slice(7)||'full';if(!['full','background','independent'].includes(mode))throw Error('Unknown lifecycle mode');
const plan={mode,headed:mode!=='independent',cases:['first load timing','real second-tab background1s/return','pause500ms/resume','900x700 -> 1440x900','three outfit cycles and female/male peer create/remove','20s continuous room operation'],limits:['No synthetic visibility substitution; if browser never hides, actual-background gate fails as unverified','Renderer counters/optional JS heap are trends, not GPU allocations or leak proof','20 seconds is a bounded smoke, not long soak; no recording, not standalone performance acceptance']};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
(async()=>{const expected=expectations(),base=process.argv[2];assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||''));const out=await prepareOutput(expected.build,mode==='full'?'lifecycle-fixed':'lifecycle-'+mode),{chromium}=require('../prototype/node_modules/playwright');
 const pwVersion=require('../prototype/node_modules/playwright/package.json').version;assert.equal(pwVersion,'1.58.2','Re-review private focus access after Playwright upgrade');const removedAutomationFlags=['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
 const clearDriverFocus=async p=>{const impl=p._connection.toImpl(p),client=impl.delegate?._mainFrameSession?._client;assert.equal(typeof client?.send,'function');await client.send('Emulation.setFocusEmulationEnabled',{enabled:false});};
 const browser=await chromium.launch({channel:'chrome',headless:mode==='independent',ignoreDefaultArgs:removedAutomationFlags}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),r={build:expected.build,plan,playwright:pwVersion,removedAutomationFlags,visibilityMethod:'Driver main session focus override removed; genuine tab change, no synthetic event',errors:[],checks:[],records:[]};page.on('pageerror',e=>r.errors.push(e.message));
 const check=(name,ok,details)=>{r.checks.push({name,passed:!!ok,details});assert(ok,name);};
 const sample=()=>page.evaluate(()=>{const d=__debug,s=d.snapshot();return {time:performance.now(),hidden:document.hidden,visibility:document.visibilityState,simulationTime:s.simulationTime,backgroundSuspended:s.backgroundSuspended,mode:s.mode,paused:s.paused,root:s.position,renderer:{...d.renderer.info.memory},heap:performance.memory?.usedJSHeapSize??null,viewport:[innerWidth,innerHeight],canvas:[d.renderer.domElement.width,d.renderer.domElement.height],outfit:s.outfit,primary:d.avatar().root.uuid,peer:!!d.comparison(),live:d.avatar().livePresentation.getState()};});
 try{
  const start=Date.now();await page.goto(base);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});r.loadWallMs=Date.now()-start;r.initialGate=await verifyCandidate(page,expected);
  await page.evaluate(()=>{__debug.setDynamics(true);__debug.setPaused(false);__debug.game.scene.getScene('CharacterStudio').cameraPreset('room',true);window.__lifeQA={visibility:[],frames:[],stop:false};document.addEventListener('visibilitychange',e=>__lifeQA.visibility.push({trusted:e.isTrusted,wall:performance.now(),hidden:document.hidden,simulationTime:__debug.snapshot().simulationTime}));let last=null;function f(t){if(__lifeQA.stop)return;const s=__debug.snapshot();__lifeQA.frames.push({t,dt:last===null?null:t-last,simulationTime:s.simulationTime,frameDt:s.motion.frameDt,background:s.backgroundSuspended});last=t;requestAnimationFrame(f);}requestAnimationFrame(f);});
  if(mode!=='independent'){
   await clearDriverFocus(page);await page.bringToFront();
   try{await page.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:3000});}
   catch{r.beforeBackground=await sample();r.backgroundStatus='unverified-environment-initial-visible-not-established';throw Error(r.backgroundStatus);}
   r.beforeBackground=await sample();check('initial native visible established',!r.beforeBackground.hidden);
   const other=await context.newPage();
   try{await clearDriverFocus(other);await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(250);r.hiddenStart=await sample();await page.waitForTimeout(1000);r.hiddenEnd=await sample();await page.bringToFront();}
   finally{await other.close();}
   try{await page.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:3000});}
   catch{r.returned=await sample();r.backgroundStatus='unverified-environment-return-visible-not-established';throw Error(r.backgroundStatus);}
   r.returned=await sample();r.actualBackgroundObserved=r.hiddenStart.hidden&&r.hiddenEnd.hidden;
   check('actual tab became hidden',r.actualBackgroundObserved);
   check('trusted native visibility',await page.evaluate(()=>__lifeQA.visibility.some(e=>e.hidden&&e.trusted)&&__lifeQA.visibility.some(e=>!e.hidden&&e.trusted)));
   check('hidden simulation held',r.hiddenStart.simulationTime===r.hiddenEnd.simulationTime);
   await page.waitForTimeout(200);r.returned=await sample();check('foreground resumes',!r.returned.hidden&&r.returned.simulationTime>r.hiddenEnd.simulationTime);
   if(mode==='background'){r.final=await sample();r.finalGate=await verifyCandidate(page,expected);check('no pageerror',r.errors.length===0,r.errors);r.passed=true;return;}
  }else{
   r.backgroundStatus='not-tested-independent-headless-mode';r.actualBackgroundObserved=null;
   r.returned=await sample();await page.waitForTimeout(200);const progressed=await sample();check('headless simulation progresses before independent checks',progressed.simulationTime>r.returned.simulationTime);
  }
  await page.evaluate(()=>__debug.setPaused(true));const pause=await sample();await page.waitForTimeout(500);check('explicit pause holds',(await sample()).simulationTime===pause.simulationTime);await page.evaluate(()=>__debug.setPaused(false));
  for(const size of [{width:900,height:700},{width:1440,height:900}]){await page.setViewportSize(size);await page.waitForTimeout(200);const s=await sample();r.records.push({kind:'resize',...s});check('resize retains valid canvas',s.canvas.every(n=>Number.isFinite(n)&&n>0)&&s.viewport[0]===size.width);}
  for(let i=0;i<3;i++){
   await page.evaluate(i=>__debug.setOutfit(i%2),i);const before=await sample();await page.evaluate(body=>__debug.loadComparison(body),i%2?'male':'female');await page.waitForTimeout(250);const loaded=await sample();check('peer attached '+i,loaded.peer&&loaded.primary===before.primary);await page.evaluate(()=>__debug.removeComparison());await page.waitForTimeout(250);const after=await sample();check('peer removed '+i,!after.peer&&after.primary===before.primary);r.records.push({kind:'repeat',i,before,loaded,after});
  }
  await page.waitForTimeout(20000);r.final=await sample();check('continuous simulation progresses',r.final.simulationTime>r.returned.simulationTime);check('root finite',r.final.root.every(Number.isFinite));r.finalGate=await verifyCandidate(page,expected);check('no pageerror',r.errors.length===0,r.errors);r.passed=mode==='independent'||r.actualBackgroundObserved;await page.screenshot({path:path.join(out,'final.png')});if(mode!=='independent'&&!r.actualBackgroundObserved)throw Error('Actual background remains unverified; independent pause/resize/reuse/smoke checks were completed without synthetic visibility');
 }catch(e){r.failure=String(e);await writeFailure(out,e);throw e;}finally{r.trace=await page.evaluate(()=>{if(!window.__lifeQA)return null;__lifeQA.stop=true;return __lifeQA;}).catch(()=>null);await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
