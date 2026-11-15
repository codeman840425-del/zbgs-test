// Version-scoped removal of Playwright's own focus override, then real tab switching.
// Never overrides document.hidden, dispatches visibilitychange or freezes lifecycle.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {expectations,prepareOutput,verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const expected=expectations(),out=await prepareOutput(expected.build,'native-background-primary-session-'+Date.now());
 const version=require('../prototype/node_modules/playwright/package.json').version;assert.equal(version,'1.58.2','Private implementation access must be re-reviewed for another version');
 const removedAutomationFlags=['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
 const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:removedAutomationFlags}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 const result={build:expected.build,playwright:version,browser:browser.version(),removedAutomationFlags,errors:[],method:'Disable focus override on the same Playwright main-frame CDP session which enabled it, then bring a real second tab to front. No emulated visibility/lifecycle.'};
 page.on('pageerror',e=>result.errors.push(e.message));
 const sample=()=>page.evaluate(()=>{const s=__debug.snapshot();return {wall:performance.now(),hidden:document.hidden,visibility:document.visibilityState,focus:document.hasFocus(),simulationTime:s.simulationTime,backgroundSuspended:s.backgroundSuspended,paused:s.paused,frameDt:s.motion.frameDt};});
 const mainClient=p=>{assert.equal(typeof p._connection?.toImpl,'function');const impl=p._connection.toImpl(p),client=impl.delegate?._mainFrameSession?._client;assert.equal(typeof client?.send,'function','Expected inspected Playwright main CDP session');return client;};
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});result.initialIdentity=await verifyCandidate(page,expected);
  await page.evaluate(()=>{__debug.setPaused(false);__debug.setPlaybackRate(1);window.__nativeEvents=[];document.addEventListener('visibilitychange',e=>__nativeEvents.push({trusted:e.isTrusted,hidden:document.hidden,wall:performance.now(),simulationTime:__debug.snapshot().simulationTime,backgroundSuspended:__debug.snapshot().backgroundSuspended}));});
  await mainClient(page).send('Emulation.setFocusEmulationEnabled',{enabled:false});result.primarySessionOverrideRemoved=true;
  await page.bringToFront();await page.waitForTimeout(300);result.before=await sample();
  const other=await context.newPage();await mainClient(other).send('Emulation.setFocusEmulationEnabled',{enabled:false});await other.goto('about:blank');await other.bringToFront();
  for(let i=0;i<15;i++){await page.waitForTimeout(100);result.hiddenStart=await sample();if(result.hiddenStart.hidden)break;}
  await page.waitForTimeout(1200);result.hiddenEnd=await sample();
  await page.bringToFront();await page.waitForTimeout(300);result.returned=await sample();await other.close();
  result.events=await page.evaluate(()=>__nativeEvents);
  result.checks={realHidden:result.hiddenStart.hidden&&result.hiddenEnd.hidden,realTrustedEvents:result.events.some(e=>e.hidden&&e.trusted)&&result.events.some(e=>!e.hidden&&e.trusted),
   applicationSuspended:result.hiddenStart.backgroundSuspended&&result.hiddenEnd.backgroundSuspended,hiddenSimulationHeld:result.hiddenStart.simulationTime===result.hiddenEnd.simulationTime,
   resumed:!result.returned.hidden&&!result.returned.backgroundSuspended&&result.returned.simulationTime>result.hiddenEnd.simulationTime,
   noCatchup:result.returned.simulationTime-result.hiddenEnd.simulationTime<.6,noPageErrors:result.errors.length===0};
  result.finalIdentity=await verifyCandidate(page,expected);result.passed=Object.values(result.checks).every(Boolean);if(!result.passed)process.exitCode=1;
 }catch(e){result.failure=String(e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(out);console.log(JSON.stringify({checks:result.checks,events:result.events,failure:result.failure}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
