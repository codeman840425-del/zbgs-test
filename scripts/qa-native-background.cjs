// Real headed Chrome native-window minimization; never writes visibilityState
// or dispatches visibilitychange. A browser that stays visible is unverified.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {expectations,prepareOutput,verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const expected=expectations(),out=await prepareOutput(expected.build,'native-background-'+Date.now());
 const removedAutomationFlags=['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
 const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:removedAutomationFlags}),page=await browser.newPage({viewport:{width:1440,height:900}});
 const result={build:expected.build,method:'CDP Browser.setWindowBounds changes actual native window state; no emulated visibility',removedAutomationFlags,errors:[]};
 let cdp,windowId;
 const sample=()=>page.evaluate(()=>({hidden:document.hidden,visibility:document.visibilityState,wall:performance.now(),state:__debug.snapshot()}));
 page.on('pageerror',e=>result.errors.push(e.message));
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});result.identity=await verifyCandidate(page,expected);
  await page.evaluate(()=>{__debug.setPaused(false);__debug.setPlaybackRate(1);window.__nativeVisibility=[];document.addEventListener('visibilitychange',()=>__nativeVisibility.push({hidden:document.hidden,wall:performance.now(),simulationTime:__debug.snapshot().simulationTime}));});
  await page.waitForTimeout(400);result.before=await sample();
  cdp=await page.context().newCDPSession(page);
  // Playwright 1.58.2 crPage enables synthetic permanent focus by default.
  // Remove that test override, then let the real OS window drive visibility.
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});result.playwrightFocusOverrideRemoved=true;
  await page.bringToFront();await page.waitForTimeout(200);result.before=await sample();
  const info=await cdp.send('Browser.getWindowForTarget');windowId=info.windowId;result.initialBounds=info.bounds;
  await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});
  for(let i=0;i<20;i++){await page.waitForTimeout(100);result.hiddenStart=await sample();if(result.hiddenStart.hidden)break;}
  result.minimizedBounds=(await cdp.send('Browser.getWindowBounds',{windowId})).bounds;
  await page.waitForTimeout(1200);result.hiddenEnd=await sample();
  await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await page.bringToFront();await page.waitForTimeout(300);result.returned=await sample();
  result.events=await page.evaluate(()=>__nativeVisibility);
  result.checks={nativeMinimized:result.minimizedBounds.windowState==='minimized',realHidden:result.hiddenStart.hidden&&result.hiddenEnd.hidden,
   hiddenSimulationHeld:result.hiddenStart.state.simulationTime===result.hiddenEnd.state.simulationTime,
   resumed:!result.returned.hidden&&result.returned.state.simulationTime>result.hiddenEnd.state.simulationTime,
   noCatchup:result.returned.state.simulationTime-result.hiddenEnd.state.simulationTime<.6,noPageErrors:result.errors.length===0};
  result.passed=Object.values(result.checks).every(Boolean);result.finalIdentity=await verifyCandidate(page,expected);
  if(!result.passed)process.exitCode=1;
 }catch(e){result.failure=String(e);process.exitCode=1;}
 finally{if(windowId!==undefined)await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}}).catch(()=>{});await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(out);console.log(JSON.stringify(result.checks||result.failure));}
})().catch(e=>{console.error(e);process.exitCode=1});
