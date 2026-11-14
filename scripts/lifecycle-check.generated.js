async(page)=>{
 await page.waitForFunction(()=>__debug?.ready);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.evaluate(()=>{__debug.reset();__debug.setPaused(true);__debug.action('dance');__debug.advance(1);__debug.walkTo(2,2);__debug.action('idle');});
 const cancelled=await page.evaluate(()=>{__debug.advance(2);const s=__debug.snapshot();return{mode:s.mode,pending:s.pending,target:s.target,position:s.position};});
 await page.evaluate(()=>{__debug.reset();__debug.setPaused(false);__debug.action('dance');window.__dtTrace=[];const a=__debug.avatar(),old=a.update;a.update=function(dt){__dtTrace.push(dt);return old.call(this,dt)};});
 await page.waitForTimeout(500);const before=await page.evaluate(()=>__debug.snapshot());
 const other=await page.context().newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(800);
 const hidden=await page.evaluate(()=>({hidden:document.hidden,state:__debug.snapshot()}));
 await page.bringToFront();await page.waitForTimeout(150);const after=await page.evaluate(()=>__debug.snapshot());await other.close();
 const client=await page.context().newCDPSession(page);
 await client.send('Page.setWebLifecycleState',{state:'frozen'});await page.waitForTimeout(1200);await client.send('Page.setWebLifecycleState',{state:'active'});await page.waitForTimeout(100);
 const restored=await page.evaluate(()=>__debug.snapshot());
 await page.setViewportSize({width:1180,height:1000});await page.waitForTimeout(120);await page.setViewportSize({width:1440,height:1400});await page.waitForTimeout(120);
 const live=await page.evaluate(()=>({state:__debug.snapshot(),maxDt:Math.max(...__dtTrace),count:__dtTrace.length}));
 await page.evaluate(()=>__debug.setPaused(true));const pauseStart=await page.evaluate(()=>__debug.snapshot());await page.waitForTimeout(400);const pauseEnd=await page.evaluate(()=>__debug.snapshot());
 await page.evaluate(()=>__debug.setPaused(false));await page.waitForTimeout(150);await page.evaluate(()=>__debug.setPaused(true));const resumed=await page.evaluate(()=>__debug.snapshot());
 return{cancelled,tabBackground:{before:before.simulationTime,hidden:hidden.hidden,hiddenTime:hidden.state.simulationTime,after:after.simulationTime},frozen:{before:after.simulationTime,after:restored.simulationTime},maxDt:live.maxDt,pauseTimeDelta:pauseEnd.simulationTime-pauseStart.simulationTime,resumeTimeDelta:resumed.simulationTime-pauseEnd.simulationTime,errors};
}
